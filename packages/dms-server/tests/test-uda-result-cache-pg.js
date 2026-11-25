/**
 * Result cache for dataset queries, against a real PostgreSQL DAMA database through the UDA routes
 * (src/routes/uda/resultCache.js, planning/tasks/current/uda-result-cache.md).
 *
 *   1. A repeated length / rows query on a source that is not editable is answered from memory.
 *   2. A write from outside the server (INSERT, UPDATE, TRUNCATE by SQL) shows after the freshness window:
 *      Postgres's own counters and storage id are what the cache trusts.
 *   3. A source with Editable on is never cached, and neither is a query that joins to one.
 *   4. A joined table changing drops the entry.
 *
 * Runs on the docker Postgres: `node tests/postgres-docker.js run tests/test-uda-result-cache-pg.js`
 * (`npm run test:pg:uda-result-cache`). Skips on SQLite.
 */
process.env.DMS_UDA_CACHE = 'on';
process.env.DMS_UDA_CACHE_WINDOW_MS = '300';

const { createTestGraph } = require('./graph');
const { getDb, awaitReady } = require('../src/db');
const { resultCache } = require('../src/routes/uda/resultCache');

const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';
const SCHEMA = 'gis_datasets';
const T = `cache_main_${Date.now()}`;
const J = `cache_join_${Date.now()}`;
let passed = 0; let failed = 0;
const check = (cond, m, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.log(`  ✗ ${m}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// longer than the window plus the second Postgres may take to publish a backend's counters
const SETTLE = 2600;

async function main() {
  const db = getDb(DAMA_DB);
  await awaitReady();
  if (db.type !== 'postgres') { console.log('skip: test-uda-result-cache-pg needs a PostgreSQL DAMA db'); return; }
  const graph = createTestGraph(process.env.DMS_TEST_DB || 'dms-postgres-test');
  const cache = resultCache();
  const stat = () => cache.stats();

  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE ${SCHEMA}.${T} (id serial PRIMARY KEY, grp text, v integer)`);
  await db.query(`INSERT INTO ${SCHEMA}.${T} (grp, v) VALUES ('a', 1), ('a', 2), ('b', 10)`);
  await db.query(`CREATE TABLE ${SCHEMA}.${J} (grp text PRIMARY KEY, label text)`);
  await db.query(`INSERT INTO ${SCHEMA}.${J} VALUES ('a', 'Alpha'), ('b', 'Beta')`);
  const mk = async (name, table, metadata) => {
    const { rows: [s] } = await db.query(`INSERT INTO data_manager.sources (name, type, metadata) VALUES ($1, 'csv_dataset', $2) RETURNING source_id`, [name, JSON.stringify(metadata)]);
    const { rows: [v] } = await db.query(`INSERT INTO data_manager.views (source_id, table_schema, table_name) VALUES ($1, $2, $3) RETURNING view_id`, [s.source_id, SCHEMA, table]);
    return { source_id: s.source_id, view_id: v.view_id };
  };
  const main_ = await mk(T, T, { columns: [{ name: 'id', type: 'INTEGER' }, { name: 'grp', type: 'TEXT' }, { name: 'v', type: 'INTEGER' }], isEditable: false });
  const join_ = await mk(J, J, { columns: [{ name: 'grp', type: 'TEXT' }, { name: 'label', type: 'TEXT' }] });
  const V = main_.view_id;

  const length = async (opts = {}) => {
    const options = JSON.stringify(opts);
    const r = await graph.getAsync([['uda', DAMA_DB, 'viewsById', V, 'options', options, 'length']]);
    return +r.jsonGraph?.uda?.[DAMA_DB]?.viewsById?.[V]?.options?.[options]?.length;
  };
  const rowsOf = async (opts, attrs, n = 5) => {
    const options = JSON.stringify(opts);
    const r = await graph.getAsync([['uda', DAMA_DB, 'viewsById', V, 'options', options, 'dataByIndex', { from: 0, to: n - 1 }, attrs]]);
    const byIndex = r.jsonGraph?.uda?.[DAMA_DB]?.viewsById?.[V]?.options?.[options]?.dataByIndex || {};
    // a row is { '<attribute as asked>': value | { $type: 'atom', value } }; an index past the end has no values
    const plain = (v) => (v && typeof v === 'object' && '$type' in v ? v.value : v);
    return Object.keys(byIndex).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b)
      .map(k => attrs.map(a => plain(byIndex[k]?.[a])))
      .filter(vals => vals.some(v => v !== undefined && v !== null));
  };
  const SUM = { groupBy: ['grp'], orderBy: { grp: 'asc' } };
  const sums = async () => (await rowsOf(SUM, ['grp', 'sum(v) as total'])).map(([grp, total]) => `${grp}=${total}`).join(',');

  console.log(`\n=== UDA result cache on PostgreSQL (${DAMA_DB}) ===\n`);

  // ── 1. hits ──
  check(await length() === 3, 'length reads the table');
  const h0 = stat().hits;
  check(await length() === 3 && stat().hits === h0 + 1, 'the same length again is answered from memory', stat());
  check(await sums() === 'a=3,b=10', 'grouped rows read the table', await sums());
  const h1 = stat().hits;
  check(await sums() === 'a=3,b=10' && stat().hits > h1, 'the same rows again are answered from memory');
  check(stat().probes >= 1 && stat().notCached.noCounters === 0, 'table versions were read from Postgres', stat());

  // ── 2. writes from outside the server ──
  await db.query(`INSERT INTO ${SCHEMA}.${T} (grp, v) VALUES ('b', 5)`);
  await sleep(SETTLE);
  check(await length() === 4 && await sums() === 'a=3,b=15', 'an INSERT by SQL shows after the window', { length: await length(), sums: await sums() });
  await db.query(`UPDATE ${SCHEMA}.${T} SET v = 100 WHERE grp = 'a' AND v = 1`);
  await sleep(SETTLE);
  check(await sums() === 'a=102,b=15', 'an UPDATE by SQL shows after the window', await sums());
  await db.query(`TRUNCATE ${SCHEMA}.${T}`);
  await sleep(SETTLE);
  check(await length() === 0, 'a TRUNCATE shows after the window', await length());
  await db.query(`INSERT INTO ${SCHEMA}.${T} (grp, v) VALUES ('a', 1), ('b', 2)`);
  await sleep(SETTLE);
  check(await length() === 2, 'rows loaded after the TRUNCATE show');

  // ── 4. a join: the joined table changing drops the entry ──
  const JOIN = {
    groupBy: ['j.label'], orderBy: { 'j.label': 'asc' },
    join: { sources: { ds: { view_id: V, env: DAMA_DB }, j: { view_id: join_.view_id, env: DAMA_DB } }, on: [{ table: 'j', type: 'left', on: 'ds.grp = j.grp' }] },
  };
  const labels = async () => (await rowsOf(JOIN, ['j.label as label', 'sum(ds.v) as total'])).map(([label, total]) => `${label}=${total}`).join(',');
  const first = await labels();
  check(first === 'Alpha=1,Beta=2', 'a joined query reads both tables', first);
  const h2 = stat().hits;
  check(await labels() === first && stat().hits > h2, 'and is answered from memory the second time');
  await db.query(`UPDATE ${SCHEMA}.${J} SET label = 'Bravo' WHERE grp = 'b'`);
  await sleep(SETTLE);
  check(await labels() === 'Alpha=1,Bravo=2', 'a change to the joined table shows after the window', await labels());

  // ── 3. Editable ──
  await db.query(`UPDATE data_manager.sources SET metadata = metadata || '{"isEditable": true}'::jsonb WHERE source_id = $1`, [join_.source_id]);
  await sleep(500);   // the view's table and flag are remembered for the window
  const e0 = stat().notCached.editable;
  await labels(); await labels();
  check(stat().notCached.editable >= e0 + 2, 'a query that joins to an editable source is never kept', stat().notCached);

  await db.query(`UPDATE data_manager.sources SET metadata = metadata || '{"isEditable": true}'::jsonb WHERE source_id = $1`, [main_.source_id]);
  await sleep(500);
  const e1 = stat().notCached.editable; const h3 = stat().hits;
  check(await length() === 2 && await length() === 2 && stat().notCached.editable >= e1 + 2 && stat().hits === h3, 'an editable source is never kept', stat());
  await db.query(`INSERT INTO ${SCHEMA}.${T} (grp, v) VALUES ('c', 3)`);
  check(await length() === 3, 'and a write to it shows at once');

  await db.query(`DELETE FROM data_manager.views WHERE view_id = ANY($1)`, [[main_.view_id, join_.view_id]]);
  await db.query(`DELETE FROM data_manager.sources WHERE source_id = ANY($1)`, [[main_.source_id, join_.source_id]]);
  await db.query(`DROP TABLE ${SCHEMA}.${T}, ${SCHEMA}.${J}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
