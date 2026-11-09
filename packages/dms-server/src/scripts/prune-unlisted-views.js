#!/usr/bin/env node
/**
 * Reconcile each source's `data.views` array with the view rows that actually exist, deleting both
 * kinds of residue a half-finished UI delete leaves behind.
 *
 *     node prune-unlisted-views.js --db <config> --app <app> [--apply]
 *
 * WHY. A source owns its versions through `data.views` — an array of `{ref, id}`. Deleting a
 * version in the UI is supposed to drop the view row, drop its split table, and vacate the array
 * entry. It does not, because both cascades resolve the view through the TYPE PATH:
 *
 *   dms.controller.js:637  cascadeSourceDelete   WHERE type LIKE '{sourceInstance}|%:view'
 *   dms.controller.js:656  cascadeViewDelete     getParent(row.type) -> the source instance
 *
 * and on this data a view's type names the PATTERN instance (`form1|version_1:view`), not its
 * source — see `updateAttributes` in dms-manager/_utils.jsx, which rewrites every `dms-format`
 * attribute to `{app}+{patternInstance}|{kind}`. So the LIKE matches nothing and the delete half
 * lands: the array entry goes, the row and its table stay.
 *
 * Two residues, opposite directions, same wound:
 *
 *   UNLISTED   a view row no source lists. The UI removed the ref; the row and its split table
 *              survived. Invisible in the app — nothing can navigate to it.
 *   DANGLING   an id in `data.views` with no view row. The row went; the ref stayed.
 *
 * ⚠ This DELETES rows AND DROPS TABLES. Dry run unless `--apply`. Unlike prune-empty-internal-sets.js
 * it does drop tables, because an unlisted view's table is unreachable: the only path to it runs
 * through the array entry that no longer exists (uda.controller.js:973 builds the `:data` type from
 * the source slug and view id it read off that array).
 *
 * Owner decision 2026-10-31: "if they aren't in the ui now they aren't being used and I want them
 * gone ... these are things a human deleted in the ui but isn't deleted in the db because of our
 * code." The reconciliation is therefore DELETE, not re-attach, even where a split table names a
 * plausible owner.
 *
 * See planning/tasks/current/row-auth-production-cutover.md.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const refId = (x) => String(x && typeof x === 'object' ? x.id : x);

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
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

  console.log(`prune unlisted views — ${o.apply ? 'APPLY (deletes rows, DROPS TABLES)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}\n`);

  const sources = (await db.query(
    `SELECT id, type, data->'views' AS views FROM ${T} WHERE app = $1 AND type LIKE '%:source'`,
    [o.app])).rows;
  const views = (await db.query(
    `SELECT id, type, data->>'name' AS name FROM ${T} WHERE app = $1 AND type LIKE '%:view' ORDER BY id`,
    [o.app])).rows;

  const listed = new Map();                       // view id -> owning source row
  for (const s of sources) for (const x of (s.views || [])) listed.set(refId(x), s);
  const present = new Set(views.map(v => String(v.id)));

  // Split tables are named `data_items__s<source>_v<view>_<slug>`; `_v<id>_` is unambiguous for the
  // view position and the trailing underscore stops `_v123_` matching `_v1234_`.
  const tbls = db.type === 'postgres'
    ? (await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE 'data_items__s%'`,
        [t.schema])).rows.map(r => r.table_name)
    : (await db.query(
        `SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__s%'`)).rows.map(r => r.table_name);
  const tablesFor = (id) => tbls.filter(n => new RegExp(`_v${id}_`).test(n));
  const countOf = async (name) => (await db.query(
    db.type === 'postgres' ? `SELECT count(*)::int c FROM ${qualify(name)}` : `SELECT count(*) c FROM "${name}"`
  )).rows[0].c;

  const unlisted = views.filter(v => !listed.has(String(v.id)));
  const dangling = [];
  for (const s of sources) {
    for (const x of (s.views || [])) {
      if (!present.has(refId(x))) dangling.push({ source: s, id: refId(x) });
    }
  }

  console.log(`UNLISTED view rows (no source lists them): ${unlisted.length}`);
  let dropTables = [], dropRows = 0;
  for (const v of unlisted) {
    const mine = tablesFor(v.id);
    let n = 0;
    for (const name of mine) n += await countOf(name);
    dropTables = dropTables.concat(mine); dropRows += n;
    console.log(`   #${v.id}  ${v.type}  "${v.name || ''}"`);
    if (mine.length) console.log(`        drop ${mine.join(', ')}  (${n} rows)`);
  }
  console.log(`\n   split tables to drop: ${dropTables.length}   data rows destroyed: ${dropRows}`);

  console.log(`\nDANGLING refs (listed, no row): ${dangling.length}`);
  const bySource = new Map();
  for (const d of dangling) bySource.set(d.source.id, (bySource.get(d.source.id) || []).concat(d.id));
  for (const [sid, ids] of bySource) {
    const s = sources.find(x => String(x.id) === String(sid));
    console.log(`   #${sid} ${s.type}  drop refs ${ids.join(', ')}`);
  }

  if (!o.apply) { console.log('\nDRY RUN — nothing was changed. Re-run with --apply.'); process.exit(0); }

  // Rows and ref arrays go in one transaction; the DROPs follow, so a rollback never leaves a row
  // pointing at a table that is already gone.
  await db.withTransaction(async (tx) => {
    if (unlisted.length) {
      await tx.promise(`DELETE FROM ${T} WHERE id = ANY($1)`, [unlisted.map(v => v.id)]);
    }
    for (const [sid, ids] of bySource) {
      const s = sources.find(x => String(x.id) === String(sid));
      const kept = (s.views || []).filter(x => !ids.includes(refId(x)));
      await tx.promise(`UPDATE ${T} SET data = jsonb_set(data, '{views}', $2::jsonb) WHERE id = $1`,
        [sid, JSON.stringify(kept)]);
    }
  });
  console.log(`\n  deleted ${unlisted.length} view row(s); cleaned ${dangling.length} ref(s) on ${bySource.size} source(s).`);

  let dropped = 0;
  for (const name of dropTables) {
    try { await db.query(`DROP TABLE IF EXISTS ${qualify(name)}`); dropped++; }
    catch (e) { console.error(`  ! could not drop ${name}: ${e.message}`); }
  }
  console.log(`  dropped ${dropped}/${dropTables.length} split table(s).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
