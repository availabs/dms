#!/usr/bin/env node
/**
 * Delete a source row, the view rows it owns, and their split tables — the cascade the app is
 * supposed to run and currently cannot.
 *
 *     node delete-source.js --db <config> --app <app> --source <id> [--apply]
 *
 * WHY THIS EXISTS. `cascadeSourceDelete` (dms.controller.js:637) finds a source's views with
 * `WHERE type LIKE '{sourceInstance}|%:view'`. That resolves a view through the TYPE PATH, which is
 * wrong twice over: on carried-forward data a view's type names the PATTERN instance (see
 * retype-views-to-source.js), and when two sources share an instance name the LIKE matches BOTH
 * sources' views. Deleting either one would take the other's rows with it. This script resolves
 * ownership the way the app itself navigates — `source.data.views` — so it cannot cross that line.
 *
 * WHAT IT REMOVES
 *   - the source row
 *   - every view row listed in `source.data.views`
 *   - every split table named `data_items__s{sourceId}_…`, including tables for views the source
 *     does NOT list. Those exist because `lookupSourceIdBySlug` (dms.controller.js:341) memoizes
 *     slug → id in `_sourceIdCache` and takes `ORDER BY id DESC LIMIT 1`: a second source created
 *     under an existing slug keeps writing into the FIRST source's tables until the process
 *     restarts. The table is named for this source, so it dies with it.
 *   - the `{ref, id}` entry in the owning dmsEnv's (or pattern's) `sources` array, if present
 *
 * WHAT IT REFUSES. If any other row's `data` mentions the source id or one of its view ids, it
 * stops: something still points at this source and the reference would dangle. `:data` rows in the
 * MAIN table are reported, never deleted — a `{slug}|{viewId}:data` type is resolved by slug, so on
 * a duplicated name those rows may belong to the other source.
 *
 * ⚠ Deletes rows and DROPS TABLES. Dry run unless `--apply`.
 */
const { getDb, awaitReady, loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');

const refId = (x) => String(x && typeof x === 'object' ? x.id : x);
const instanceOf = (type) => (type || '').split('|')[1]?.split(':')[0] || null;

async function main() {
  const a = process.argv.slice(2);
  const o = { apply: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db') o.db = a[++i];
    else if (a[i] === '--app') o.app = a[++i];
    else if (a[i] === '--source') o.source = a[++i];
    else if (a[i] === '--apply') o.apply = true;
    else { console.error(`Unknown argument: ${a[i]}`); process.exit(1); }
  }
  if (!o.db || !o.app || !o.source) { console.error('--db, --app and --source are required'); process.exit(1); }

  const db = getDb(o.db); await awaitReady();
  const config = loadConfig(o.db);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const t = resolveTable(o.app, '', db.type, splitMode);
  const T = db.type === 'postgres' ? `"${t.schema}"."${t.table}"` : `"${t.table}"`;
  const qualify = (name) => db.type === 'postgres' ? `"${t.schema}"."${name}"` : `"${name}"`;
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;

  console.log(`delete source — ${o.apply ? 'APPLY (deletes rows, DROPS TABLES)' : 'DRY RUN'}`);
  console.log(`  db=${o.db}  app=${o.app}  source=${o.source}\n`);

  const [src] = await q(`SELECT id, app, type, parent_id, data FROM ${T} WHERE id = $1 AND app = $2`,
    [o.source, o.app]);
  if (!src) { console.error(`No row ${o.source} in app ${o.app}.`); process.exit(1); }
  if (!/:source$/.test(src.type)) { console.error(`#${src.id} is "${src.type}", not a source.`); process.exit(1); }

  const slug = instanceOf(src.type);
  const viewIds = (src.data?.views || []).map(refId);
  const views = viewIds.length
    ? await q(`SELECT id, type, data->>'name' AS name FROM ${T} WHERE id = ANY($1)`, [viewIds.map(Number)])
    : [];
  const missing = viewIds.filter(id => !views.some(v => String(v.id) === id));

  console.log(`source  #${src.id}  ${src.type}  "${src.data?.name || ''}"  parent=${src.parent_id}`);
  console.log(`views listed: ${viewIds.length}`);
  for (const v of views) console.log(`   #${v.id}  ${v.type}  "${v.name || ''}"`);
  for (const id of missing) console.log(`   #${id}  (listed but no row — nothing to delete)`);

  // Every split table NAMED for this source, listed or not.
  const tbls = db.type === 'postgres'
    ? (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE $2`,
        [t.schema, `data_items__s${src.id}\\_%`])).map(r => r.table_name)
    : (await q(`SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name LIKE $1`,
        [`data_items__s${src.id}\\_%`])).map(r => r.table_name);
  let rowsLost = 0;
  console.log(`\nsplit tables named for this source: ${tbls.length}`);
  for (const name of tbls) {
    const [{ c }] = await q(db.type === 'postgres'
      ? `SELECT count(*)::int c FROM ${qualify(name)}` : `SELECT count(*) c FROM "${name}"`);
    rowsLost += c;
    const vid = /_v(\d+)_/.exec(name)?.[1];
    const stray = vid && !viewIds.includes(vid) ? '   ← for a view this source does not list' : '';
    console.log(`   ${name}  (${c} rows)${stray}`);
  }
  console.log(`   data rows destroyed: ${rowsLost}`);

  // Owner ref: the dmsEnv (or pattern) whose `sources` array names this source.
  const owners = await q(
    `SELECT id, type, data->'sources' AS sources FROM ${T} WHERE app = $1 AND data ? 'sources'`, [o.app]);
  const holders = owners.filter(r => (r.sources || []).some(x => refId(x) === String(src.id)));
  console.log(`\nowner rows listing this source: ${holders.length}`);
  for (const h of holders) console.log(`   #${h.id} ${h.type}`);
  if (!holders.length) console.log(`   none — already unlisted, so the UI cannot reach it.`);

  // Anything else still pointing at it.
  const ids = [String(src.id), ...viewIds];
  const refs = (await q(
    `SELECT id, type FROM ${T} WHERE app = $1 AND id <> ALL($2) AND (${
      ids.map((_, i) => `data::text LIKE '%' || $${i + 3} || '%'`).join(' OR ')})`,
    [o.app, [Number(src.id), ...viewIds.map(Number)], ...ids]
  )).filter(r => !holders.some(h => String(h.id) === String(r.id)));
  if (refs.length) {
    console.log(`\n  ⚠ OTHER rows mention these ids — refusing:`);
    for (const r of refs) console.log(`     #${r.id} ${r.type}`);
    process.exit(1);
  }

  // Main-table `:data` rows route by SLUG, so on a duplicated name they may not be this source's.
  const mainData = await q(
    `SELECT id, type FROM ${T} WHERE app = $1 AND type LIKE $2`, [o.app, `${slug}|%:data`]);
  if (mainData.length) {
    console.log(`\n  ⚠ ${mainData.length} ":data" row(s) in the MAIN table typed "${slug}|…" — NOT deleted`);
    console.log(`     (resolved by slug; on a duplicated name they may belong to another source)`);
  }

  if (!o.apply) { console.log('\nDRY RUN — nothing was changed. Re-run with --apply.'); process.exit(0); }

  // Rows first, in one transaction; DROPs after, so a rollback never leaves a row pointing at a
  // table that is already gone.
  await db.withTransaction(async (tx) => {
    for (const h of holders) {
      const kept = (h.sources || []).filter(x => refId(x) !== String(src.id));
      await tx.promise(`UPDATE ${T} SET data = jsonb_set(data, '{sources}', $2::jsonb) WHERE id = $1`,
        [h.id, JSON.stringify(kept)]);
    }
    if (views.length) await tx.promise(`DELETE FROM ${T} WHERE id = ANY($1)`, [views.map(v => Number(v.id))]);
    await tx.promise(`DELETE FROM ${T} WHERE id = $1`, [Number(src.id)]);
  });
  console.log(`\n  deleted source #${src.id} and ${views.length} view row(s); cleared ${holders.length} owner ref(s).`);

  let dropped = 0;
  for (const name of tbls) {
    try { await db.query(`DROP TABLE IF EXISTS ${qualify(name)}`); dropped++; }
    catch (e) { console.error(`  ! could not drop ${name}: ${e.message}`); }
  }
  console.log(`  dropped ${dropped}/${tbls.length} split table(s).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
