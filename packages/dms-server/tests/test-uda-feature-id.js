/**
 * UDA feature id vs row key — regression tests (PostgreSQL DAMA only).
 * planning: src/dms/planning/tasks/current/uda-feature-id-vs-row-key.md
 *
 * A DAMA table's vector-tile feature id (always ogc_fid — tiles.rest.js) and its row key (the
 * declared PRIMARY KEY) can be different columns. Map popups read `dataById[<feature id>]`;
 * editable-source reads request `id` (→ the PK) and uda.data.* writes key on the PK. The two used
 * to share one cache, so a dataById call with a stored index column could redirect `id`.
 *
 * Runs against the docker Postgres (`npm run test:pg` includes it; or start the container and run
 * `DAMA_TEST_DB=dama-postgres-test node tests/test-uda-feature-id.js`). Skips on SQLite.
 */
process.env.DMS_UDA_KEY_CACHE_TTL_MS = process.env.DMS_UDA_KEY_CACHE_TTL_MS || '0';

const { createTestGraph } = require('./graph');
const { getDb, awaitReady } = require('../src/db');

const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';
const SCHEMA = 'gis_datasets';
const TABLE = `feature_id_test_${Date.now()}`;
const PLAIN = `row_key_test_${Date.now()}`;
let passed = 0; let failed = 0;
const pass = (m) => { passed++; console.log(`  ✓ ${m}`); };
const fail = (m, e) => { failed++; console.log(`  ✗ ${m}${e ? `: ${e.message || e}` : ''}`); };
const check = (cond, m, detail) => (cond ? pass(m) : fail(m, detail !== undefined ? JSON.stringify(detail) : undefined));

async function main() {
  const db = getDb(DAMA_DB);
  await awaitReady();
  if (db.type !== 'postgres') { console.log('skip: test-uda-feature-id needs a PostgreSQL DAMA db'); return; }
  const graph = createTestGraph(process.env.DMS_TEST_DB || 'dms-postgres-test');

  // ── fixture: a GIS-style table whose PK is NOT ogc_fid (the Actions Cleaned shape) ──
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await db.query(`CREATE TABLE ${SCHEMA}.${TABLE} (ogc_fid serial UNIQUE, action_id bigint PRIMARY KEY, name text)`);
  await db.query(`INSERT INTO ${SCHEMA}.${TABLE} (action_id, name) VALUES (1000001,'a'),(1000002,'b'),(1000003,'c')`);
  // and a plain table with no ogc_fid (a CSV-style source keyed by id)
  await db.query(`CREATE TABLE ${SCHEMA}.${PLAIN} (id serial PRIMARY KEY, name text)`);
  await db.query(`INSERT INTO ${SCHEMA}.${PLAIN} (name) VALUES ('x'),('y')`);

  const columns = [{ name: 'ogc_fid', type: 'INTEGER' }, { name: 'action_id', type: 'BIGINT' }, { name: 'name', type: 'TEXT' }];
  const { rows: [src] } = await db.query(
    `INSERT INTO data_manager.sources (name, type, metadata) VALUES ($1, 'gis_dataset', $2) RETURNING source_id`,
    [TABLE, JSON.stringify({ columns, isEditable: true })]);
  const { rows: [view] } = await db.query(
    `INSERT INTO data_manager.views (source_id, table_schema, table_name) VALUES ($1, $2, $3) RETURNING view_id`,
    [src.source_id, SCHEMA, TABLE]);
  const { rows: [src2] } = await db.query(
    `INSERT INTO data_manager.sources (name, type, metadata) VALUES ($1, 'csv_dataset', $2) RETURNING source_id`,
    [PLAIN, JSON.stringify({ columns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }] })]);
  const { rows: [view2] } = await db.query(
    `INSERT INTO data_manager.views (source_id, table_schema, table_name) VALUES ($1, $2, $3) RETURNING view_id`,
    [src2.source_id, SCHEMA, PLAIN]);
  const V = view.view_id;
  const { rows: fids } = await db.query(`SELECT ogc_fid, action_id FROM ${SCHEMA}.${TABLE} ORDER BY action_id`);
  const fid1 = fids[0].ogc_fid;

  const byId = async (viewId, ids, attrs) => {
    const r = await graph.getAsync([['uda', DAMA_DB, 'viewsById', viewId, 'dataById', ids, attrs]]);
    return r.jsonGraph?.uda?.[DAMA_DB]?.viewsById?.[viewId]?.dataById || {};
  };
  const firstRowId = async (viewId) => {
    const options = JSON.stringify({ orderBy: { action_id: 'asc' } });
    const r = await graph.getAsync([['uda', DAMA_DB, 'viewsById', viewId, 'options', options, 'dataByIndex', 0, ['id', 'action_id', 'name']]]);
    return r.jsonGraph?.uda?.[DAMA_DB]?.viewsById?.[viewId]?.options?.[options]?.dataByIndex?.[0];
  };

  console.log('\n--- feature id vs row key (PK = action_id, tiles = ogc_fid) ---');
  // 1. popups: dataById by the TILE feature id (ogc_fid)
  const popup = await byId(V, fids.map((f) => f.ogc_fid), ['name']);
  check(popup[fid1]?.name === 'a' && Object.keys(popup).length === 3, 'dataById resolves rows by ogc_fid (tile feature id)', popup);

  // 2. row key: `id` in a row request is the PK — and a dataById call beforehand doesn't redirect it
  const row = await firstRowId(V);
  check(String(row?.id) === '1000001' && String(row?.action_id) === '1000001', '`id` resolves to the primary key (action_id) after a dataById call', row);

  // 3. writes key on the PK
  try {
    await graph.callAsync(['uda', 'data', 'edit'], [DAMA_DB, V, 1000001, { name: 'a2' }]);
    const { rows: [after] } = await db.query(`SELECT name FROM ${SCHEMA}.${TABLE} WHERE action_id = 1000001`);
    check(after.name === 'a2', 'uda.data.edit by the row key updates the right row');
  } catch (e) { fail('uda.data.edit by the row key updates the right row', e); }

  // 4. an explicit isIndex column drives dataById only — `id` still resolves to the PK
  await db.query(`UPDATE data_manager.sources SET metadata = $1 WHERE source_id = $2`,
    [JSON.stringify({ columns: columns.map((c) => (c.name === 'ogc_fid' ? { ...c, isIndex: true } : c)), isEditable: true }), src.source_id]);
  const popup2 = await byId(V, [fid1], ['name']);
  const row2 = await firstRowId(V);
  check(popup2[fid1]?.name === 'a2', 'isIndex column is honoured by dataById', popup2);
  check(String(row2?.id) === '1000001', '`id` is not redirected by a dataById call with isIndex (old cache-poisoning bug)', row2);

  // 5. a PK change is picked up without a restart (cache TTL; 0 in this test)
  await db.query(`ALTER TABLE ${SCHEMA}.${TABLE} DROP CONSTRAINT ${TABLE}_pkey`);
  await db.query(`ALTER TABLE ${SCHEMA}.${TABLE} ADD PRIMARY KEY (ogc_fid)`);
  const row3 = await firstRowId(V);
  check(String(row3?.id) === String(fid1), '`id` follows a PK change once the cache entry expires', row3);

  // 6. a table without ogc_fid keeps dataById on its PK
  const { rows: prow } = await db.query(`SELECT id FROM ${SCHEMA}.${PLAIN} ORDER BY id`);
  const plain = await byId(view2.view_id, prow.map((r) => r.id), ['name']);
  check(plain[prow[0].id]?.name === 'x', 'a table with no ogc_fid: dataById still resolves by its primary key', plain);

  // cleanup
  await db.query(`DELETE FROM data_manager.views WHERE view_id = ANY($1)`, [[V, view2.view_id]]);
  await db.query(`DELETE FROM data_manager.sources WHERE source_id = ANY($1)`, [[src.source_id, src2.source_id]]);
  await db.query(`DROP TABLE ${SCHEMA}.${TABLE}`);
  await db.query(`DROP TABLE ${SCHEMA}.${PLAIN}`);
}

main()
  .then(() => { console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch((e) => { console.error(e); process.exit(1); });
