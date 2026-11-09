#!/usr/bin/env node
/**
 * Drop split tables no live read can reach.
 *
 *     node prune-unreachable-tables.js --db <config> --app <app> [--except a,b] [--apply]
 *
 * REACHABILITY, computed exactly as the server computes it. A dataset row's type is
 * `{sourceSlug}|{viewId}:data`, where `sourceSlug` is the INSTANCE segment of the owning source's
 * row type (`row_type` in uda; the display name is not reliable — see uda.controller.js's
 * `row_type` note). The server then resolves that slug back to a source id with
 * `lookupSourceIdBySlug` (dms.controller.js:341), which takes `ORDER BY id DESC LIMIT 1` — the
 * NEWEST source with that slug — and names the table `data_items__s{thatId}_v{viewId}_{slug}`.
 *
 * So the reachable set is: for every source, for every id in its `data.views`, the one table that
 * route produces. Anything else is dead storage — nothing in the app can read it, and nothing can
 * write to it either, because a write resolves through the same lookup.
 *
 * HOW TABLES FALL OUT OF THAT SET. Three ways, all observed on rowauth-test:
 *
 *   1. TWO SOURCES SHARE AN INSTANCE NAME. The older one's views route to the newer one's id, so
 *      the older one's tables are stranded and its views read empty. (The newer one is fine.)
 *   2. A MIGRATION BOUND ROWS TO THE WRONG SOURCE. `migrate-split-tables.js` / `migrate-to-per-app.js`
 *      named legacy tables by resolving the slug AT MIGRATION TIME. Rows written before a source
 *      existed can end up named for it — the giveaway is a table whose `_s{id}_` source is NEWER
 *      than the rows inside it.
 *   3. A VIEW ID WAS `undefined` AT WRITE TIME. The rows are typed `{slug}|undefined:data` and the
 *      table is `..._vundefined_...`. No view id ever resolves to it.
 *
 * ⚠ DROPS TABLES, destroying rows. Dry run unless `--apply`. `--except` holds back named tables —
 * use it for data that a source RENAME would reconnect, which is a repair, not a cleanup.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const refId = (x) => String(x && typeof x === 'object' ? x.id : x);

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false, except: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--except') o.except = a[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
  const qualify = (name) => db.type === 'postgres' ? `"${t.schema}"."${name}"` : `"${name}"`;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;

  console.log(`prune unreachable split tables — ${o.apply ? 'APPLY (DROPS TABLES)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const srcs = await q(
    `SELECT id, type, data->'views' AS views FROM ${T} WHERE app = $1 AND type LIKE '%:source'`, [o.app]);
  const slugOf = (s) => s.type.split('|')[1].split(':')[0];

  // lookupSourceIdBySlug: newest source holding the slug.
  const newest = new Map();
  for (const s of srcs) {
    const g = slugOf(s);
    if (!newest.has(g) || +s.id > +newest.get(g)) newest.set(g, String(s.id));
  }

  const reachable = new Map();                  // table name -> "view N of source #M"
  for (const s of srcs) {
    for (const x of (s.views || [])) {
      const vid = refId(x);
      const slug = slugOf(s);
      const { table } = resolveTable(o.app, `${slug}|${vid}:data`, db.type, splitMode, Number(newest.get(slug)));
      reachable.set(table, `view ${vid} of #${s.id}`);
    }
  }

  const names = db.type === 'postgres'
    ? (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE 'data_items__s%'`,
        [t.schema])).map(r => r.table_name)
    : (await q(`SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__s%'`)).map(r => r.table_name);

  const dead = [], held = [];
  let rows = 0;
  for (const name of names) {
    if (reachable.has(name)) continue;
    const [{ c }] = await q(db.type === 'postgres'
      ? `SELECT count(*)::int c FROM ${qualify(name)}` : `SELECT count(*) c FROM "${name}"`);
    const [age] = await q(db.type === 'postgres'
      ? `SELECT min(created_at) f, max(created_at) l, min(type) ty FROM ${qualify(name)}`
      : `SELECT min(created_at) f, max(created_at) l, min(type) ty FROM "${name}"`);
    const rec = { name, c, ty: age?.ty, f: String(age?.f || '').slice(0, 24), l: String(age?.l || '').slice(0, 24) };
    if (o.except.includes(name)) held.push(rec); else { dead.push(rec); rows += c; }
  }

  console.log(`split tables ${names.length}   reachable ${reachable.size - [...reachable.keys()].filter(n => !names.includes(n)).length}   unreachable ${dead.length + held.length}\n`);
  console.log(`TO DROP: ${dead.length} table(s), ${rows} rows`);
  for (const r of dead) console.log(`   ${r.name}\n        ${r.c} rows  type="${r.ty}"  ${r.f} → ${r.l}`);
  if (held.length) {
    console.log(`\nHELD BACK by --except: ${held.length}`);
    for (const r of held) console.log(`   ${r.name}  (${r.c} rows)`);
  }

  // A view whose route lands on a table that was never created reads empty. Worth seeing next to
  // the drops: it is the same wound from the other side.
  const empty = [...reachable].filter(([n]) => !names.includes(n));
  if (empty.length) {
    console.log(`\nVIEWS WHOSE TABLE DOES NOT EXIST (they read empty): ${empty.length}`);
    for (const [n, who] of empty) console.log(`   ${who}  ->  ${n}`);
  }

  if (!o.apply) { console.log('\nDRY RUN — nothing was dropped. Re-run with --apply.'); process.exit(0); }

  let dropped = 0;
  for (const r of dead) {
    try { await db.query(`DROP TABLE IF EXISTS ${qualify(r.name)}`); dropped++; }
    catch (e) { console.error(`  ! could not drop ${r.name}: ${e.message}`); }
  }
  console.log(`\n  dropped ${dropped}/${dead.length} table(s), ${rows} rows destroyed.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
