#!/usr/bin/env node
/**
 * Delete internal source/view rows whose split table holds no rows.
 *
 *     node prune-empty-internal-sets.js --db <config> --app <app> [--ambiguous-only] [--apply]
 *
 * WHY. An internal dataset's rows live in a split table named `data_items__s<source>_v<view>_<slug>`.
 * A source or view row with no such table, or one that is empty, describes nothing: nothing renders
 * from it, nothing can be read out of it, and it still occupies an INSTANCE NAME in the type path.
 * That last part is the reason this exists — `migrate-row-auth.js` pass 4 resolves a parent by
 * looking the owner's instance name up in an index of container rows, and a name held by two rows
 * is ambiguous, so the pass skips it rather than guess. An empty shell can therefore block a real
 * row from ever resolving its parent, and a row with no parent inherits no grants.
 *
 * `--ambiguous-only` restricts the delete to rows whose instance name is actually contested, which
 * is the conservative version: it removes exactly the shells that are costing something.
 *
 * ⚠ This DELETES rows. Dry run unless `--apply`. It does not drop split tables — an empty table is
 * harmless and dropping it is a separate, less reversible decision.
 *
 * See planning/tasks/current/row-auth-production-cutover.md (the ambiguous-name blocker).
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const parseType = (t) => {
  const m = /^(?:([^|]*)\|)?([^|:]*):([^:]*)$/.exec(t || '');
  return m ? { owner: m[1] || null, instance: m[2], kind: m[3] } : null;
};

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false, ambiguousOnly: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--ambiguous-only') o.ambiguousOnly = true;
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app) { console.error('--db and --app are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;

  console.log(`prune empty internal sets — ${o.apply ? 'APPLY (deletes rows)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  scope=${o.ambiguousOnly ? 'ambiguous names only' : 'every empty set'}\n`);

  const { rows } = await db.query(
    `SELECT id, type FROM ${T} WHERE app = $1 AND type LIKE '%:%'`, [o.app]);

  // row counts per split table, keyed by the source/view ids in its name
  const tbls = db.type === 'postgres'
    ? (await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE 'data_items__s%'`,
        [t.schema])).rows.map(r => r.table_name)
    : (await db.query(
        `SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__s%'`)).rows.map(r => r.table_name);
  const counts = new Map();
  for (const name of tbls) {
    const q = db.type === 'postgres' ? `SELECT count(*)::int c FROM "${t.schema}"."${name}"` : `SELECT count(*) c FROM "${name}"`;
    counts.set(name, (await db.query(q)).rows[0].c);
  }
  const dataRows = (id) => tbls.filter(n => new RegExp(`_s${id}_|_v${id}_`).test(n))
                               .reduce((a, n) => a + counts.get(n), 0);

  const byName = new Map();
  for (const r of rows) {
    const p = parseType(r.type); if (!p) continue;
    byName.set(p.instance, (byName.get(p.instance) || []).concat(r));
  }
  const contested = new Set([...byName].filter(([, v]) => v.length > 1).map(([k]) => k));

  const empty = rows.filter(r => {
    const p = parseType(r.type);
    if (!p || !['source', 'view'].includes(p.kind)) return false;
    if (o.ambiguousOnly && !contested.has(p.instance)) return false;
    return dataRows(r.id) === 0;
  });

  const byInstance = new Map();
  for (const r of empty) byInstance.set(parseType(r.type).instance, (byInstance.get(parseType(r.type).instance) || 0) + 1);

  console.log(`  container rows               ${rows.length}`);
  console.log(`  contested instance names     ${contested.size}`);
  console.log(`  EMPTY source/view rows       ${empty.length}`);
  for (const [n, c] of [...byInstance].sort((a, b) => b[1] - a[1])) console.log(`     "${n}"  ×${c}`);

  // which contested names this clears
  const after = new Map();
  for (const [name, list] of byName) {
    if (!contested.has(name)) continue;
    after.set(name, list.filter(r => !empty.some(e => e.id === r.id)).length);
  }
  const cleared = [...after].filter(([, n]) => n <= 1).map(([k]) => k);
  console.log(`\n  contested names CLEARED by this delete: ${cleared.length}  (${cleared.join(', ') || '—'})`);
  console.log(`  still contested afterwards:             ${[...after].filter(([, n]) => n > 1).length}`);

  if (o.apply && empty.length) {
    await db.query(`DELETE FROM ${T} WHERE id = ANY($1)`, [empty.map(r => r.id)]);
    console.log(`\n  deleted ${empty.length} row(s). Split tables were NOT dropped.`);
  } else if (!o.apply) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --apply.');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
