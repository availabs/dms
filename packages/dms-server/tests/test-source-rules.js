/**
 * Source rules (datasets-source-rules.md) — PostgreSQL + PostGIS.
 *
 * Run:  npm run test:pg:source-rules
 *   (= DMS_TEST_PG_IMAGE=postgis/postgis:16-3.4 node tests/postgres-docker.js run tests/test-source-rules.js)
 *
 * Part 1 needs no database: the SQL each rule generates, and the refusals.
 * Part 2 drives the real Falcor routes (graph harness) against a DAMA source whose table copies
 * the Land Bank shape — wkb_geometry geometry(MULTIPOINT, 4326), ogc_fid INTEGER PRIMARY KEY with
 * no default — and checks the database itself after each step.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DMS_DB = process.env.DMS_TEST_DB || 'dms-postgres-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';
process.env.DMS_DB_ENV = DMS_DB;

const { createTestGraph } = require('./graph');
const { getDb, awaitReady } = require('../src/db/index.js');
const rules = require('../src/dama/rules');
const autoNumber = require('../src/dama/rules/auto_number');
const pointRule = require('../src/dama/rules/point_from_lat_lon');
const { ruleObjectNames, quoteIdent, objectName } = require('../src/dama/rules/sql');
const { registerDatatype } = require('../src/dama/datatypes');

const ENV = DAMA_DB;
const STAMP = Date.now().toString(36);
const ALBANY = [-74.3, 42.4, -73.6, 42.9];

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.stack || e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function expectThrow(fn, re, label) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  assert(err, `${label}: expected an error`);
  const msg = String(err.message || err);
  assert(re.test(msg), `${label}: error "${msg}" should match ${re}`);
  return msg;
}

// ------------------------------------------------------------------------------------------------
// Part 1 — generated SQL (no database)
// ------------------------------------------------------------------------------------------------
const baseInfo = (geom) => ({
  schema: 'gis_datasets',
  table: 's1_v1_points',
  postgisSchema: 'public',
  pk: 'ogc_fid',
  columns: [
    { name: 'ogc_fid', udt: 'int4', kind: 'integer', notNull: true, default: null, isIdentity: false },
    { name: 'name', udt: 'text', kind: 'text', notNull: false, default: null, isIdentity: false },
    { name: 'latitude', udt: 'float8', kind: 'number', notNull: false, default: null, isIdentity: false },
    { name: 'longitude', udt: 'float8', kind: 'number', notNull: false, default: null, isIdentity: false },
    { name: 'wkb_geometry', udt: 'geometry', kind: 'geometry', notNull: false, default: null, isIdentity: false },
  ],
  geometryColumns: [{ name: 'wkb_geometry', dims: 2, ...geom }],
});

const installSql = (info, params) => {
  const p = pointRule.normalize({ info, params });
  pointRule.validate({ info, params: p });
  return pointRule.install({ info, params: p, names: ruleObjectNames(info, pointRule.key(p)) }).join('\n');
};

async function part1() {
  console.log('\nPart 1 — generated SQL');
  const params = { lat: 'latitude', lon: 'longitude' };

  await test('MULTIPOINT column → ST_Multi; 4326 → no ST_Transform', async () => {
    const sql = installSql(baseInfo({ type: 'MULTIPOINT', srid: 4326, declaredSrid: 4326 }), params);
    assert(/"public"\.ST_Multi\(/.test(sql), 'ST_Multi');
    assert(!/ST_Transform/.test(sql), 'no ST_Transform');
    assert(/BEFORE INSERT OR UPDATE OF "latitude", "longitude"/.test(sql), 'trigger columns');
  });

  await test('POINT column → no ST_Multi', async () => {
    const sql = installSql(baseInfo({ type: 'POINT', srid: 4326, declaredSrid: 4326 }), params);
    assert(!/ST_Multi/.test(sql), 'no ST_Multi');
  });

  await test('SRID 3857 column → ST_Transform(…, 3857)', async () => {
    const sql = installSql(baseInfo({ type: 'POINT', srid: 3857, declaredSrid: 3857 }), params);
    assert(/ST_Transform\(.*, 3857\)/.test(sql), 'transform to 3857');
  });

  await test('bare geometry column with no values defaults to SRID 4326', async () => {
    const sql = installSql(baseInfo({ type: 'GEOMETRY', srid: 0, declaredSrid: 0 }), params);
    assert(!/ST_Transform/.test(sql) && !/ST_Multi/.test(sql), 'plain 4326 point');
  });

  await test('bounds add a second check; none → world check only', async () => {
    const info = baseInfo({ type: 'MULTIPOINT', srid: 4326, declaredSrid: 4326 });
    const withBounds = installSql(info, { ...params, bounds: ALBANY });
    assert(/BETWEEN 42\.4 AND 42\.9/.test(withBounds) && /BETWEEN -74\.3 AND -73\.6/.test(withBounds), 'bounds');
    assert(/outside the allowed area/.test(withBounds), 'bounds message');
    const without = installSql(info, params);
    assert(!/outside the allowed area/.test(without), 'no bounds check');
    assert(/BETWEEN -90 AND 90/.test(without), 'world check');
  });

  await test('blank bounds normalize to none', async () => {
    const info = baseInfo({ type: 'MULTIPOINT', srid: 4326, declaredSrid: 4326 });
    assert(pointRule.normalize({ info, params: { ...params, bounds: ['', '', '', ''] } }).bounds === null, 'null bounds');
  });

  await test('refusals: polygon column, text column, bad bounds, unsafe identifier', async () => {
    const poly = baseInfo({ type: 'MULTIPOLYGON', srid: 4326, declaredSrid: 4326 });
    await expectThrow(() => pointRule.validate({ info: poly, params: { ...params, geom: 'wkb_geometry' } }), /needs a point geometry column/, 'polygon');
    const info = baseInfo({ type: 'MULTIPOINT', srid: 4326, declaredSrid: 4326 });
    await expectThrow(() => pointRule.validate({ info, params: { lat: 'name', lon: 'longitude', geom: 'wkb_geometry' } }), /must hold numbers/, 'text column');
    await expectThrow(() => pointRule.validate({ info, params: { ...params, geom: 'wkb_geometry', bounds: [1, 2, 3] } }), /four numbers/, 'short bounds');
    await expectThrow(() => pointRule.validate({ info, params: { ...params, geom: 'wkb_geometry', bounds: [-73, 42, -74, 43] } }), /west must be less than east/, 'inverted bounds');
    await expectThrow(() => pointRule.validate({ info, params: { ...params, geom: 'wkb_geometry', bounds: [-74, 42, -73, NaN] } }), /four numbers/, 'NaN bound');
    await expectThrow(() => quoteIdent('latitude"; DROP TABLE x; --'), /Unsupported identifier/, 'identifier');
    const evil = { ...info, columns: [...info.columns, { name: 'lat"x', udt: 'float8', kind: 'number' }] };
    await expectThrow(() => pointRule.install({ info: evil, params: { lat: 'lat"x', lon: 'longitude', geom: 'wkb_geometry' }, names: ruleObjectNames(evil, 'k') }), /Unsupported identifier/, 'install refuses');
  });

  await test('auto_number: defaults to the PK; refuses text and defaulted columns', async () => {
    const info = baseInfo({ type: 'MULTIPOINT', srid: 4326, declaredSrid: 4326 });
    assert(autoNumber.normalize({ info, params: {} }).column === 'ogc_fid', 'pk default');
    await expectThrow(() => autoNumber.validate({ info, params: { column: 'name' } }), /whole-number column/, 'text');
    const defaulted = { ...info, columns: info.columns.map(c => (c.name === 'ogc_fid' ? { ...c, default: '0' } : c)) };
    await expectThrow(() => autoNumber.validate({ info: defaulted, params: { column: 'ogc_fid' } }), /already has a default/, 'default');
    const serial = { ...info, columns: info.columns.map(c => (c.name === 'ogc_fid' ? { ...c, default: "nextval('s'::regclass)" } : c)) };
    autoNumber.validate({ info: serial, params: { column: 'ogc_fid' } });
    assert(autoNumber.install({ info: serial, params: { column: 'ogc_fid' } }).length === 0, 'serial: nothing to install');
  });

  await test('object names stay within 63 characters and differ for different tables', async () => {
    const a = ruleObjectNames({ table: 's3_v3_landbank_properties_with_a_very_long_name' }, 'point_from_lat_lon:wkb_geometry');
    const b = ruleObjectNames({ table: 's3_v4_landbank_properties_with_a_very_long_name' }, 'point_from_lat_lon:wkb_geometry');
    assert(a.fn.length <= 63 && b.fn.length <= 63, 'length');
    assert(a.fn !== b.fn, 'distinct');
    assert(objectName('dms_rule', 'auto_number:ogc_fid') === 'dms_rule_auto_number_ogc_fid', 'short names readable');
  });
}

// ------------------------------------------------------------------------------------------------
// Part 2 — through the routes, against PostgreSQL + PostGIS
// ------------------------------------------------------------------------------------------------
let db;
let graph;

const T = (vid, sid) => `s${sid}_v${vid}_rules_${STAMP}`;

async function makeSource(name) {
  const metadata = {
    isEditable: true,
    columns: [
      { name: 'name', type: 'TEXT' },
      { name: 'latitude', type: 'DOUBLE PRECISION' },
      { name: 'longitude', type: 'DOUBLE PRECISION' },
    ],
  };
  const { rows } = await db.query(
    `INSERT INTO data_manager.sources (name, metadata, auth_permissions) VALUES ($1, $2::jsonb, $3::jsonb) RETURNING source_id`,
    [`${name}-${STAMP}`, JSON.stringify(metadata), JSON.stringify({ users: {}, groups: { admin: ['*'] } })]
  );
  return rows[0].source_id;
}

// A view + table in the Land Bank shape. Rows: two with matching geometry, one with coordinates
// but no geometry, and one junk row like Land Bank's ogc_fid 1314.
async function makeView(sourceId, { geomType = 'MULTIPOINT', srid = 4326, withRows = true, extraCols = '' } = {}) {
  const { rows } = await db.query(`INSERT INTO data_manager.views (source_id) VALUES ($1) RETURNING view_id`, [sourceId]);
  const viewId = rows[0].view_id;
  const table = T(viewId, sourceId);
  await db.query(`UPDATE data_manager.views SET table_schema = 'gis_datasets', table_name = $1 WHERE view_id = $2`, [table, viewId]);
  await db.query(`CREATE TABLE gis_datasets.${table} (
    ogc_fid INTEGER PRIMARY KEY, name TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION${extraCols},
    wkb_geometry geometry(${geomType}, ${srid}))`);
  if (withRows) {
    const mk = geomType === 'MULTIPOINT' ? (lon, lat) => `ST_Multi(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))` : (lon, lat) => `ST_Transform(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326), ${srid})`;
    await db.query(`INSERT INTO gis_datasets.${table} (ogc_fid, name, latitude, longitude, wkb_geometry) VALUES
      (1, 'a', 42.641109, -73.763686, ${mk(-73.763686, 42.641109)}),
      (2, 'b', 42.6727149, -73.827429, ${mk(-73.827429, 42.6727149)}),
      (3, 'c', 42.65, -73.75, NULL),
      (4, NULL, 127.985906, -221.44698, NULL)`);
  }
  return { viewId, table };
}

const one = async (sql, values) => (await db.query(sql, values)).rows[0];
const geomText = async (table, id) =>
  (await one(`SELECT ST_AsText(wkb_geometry) AS g FROM gis_datasets.${table} WHERE ogc_fid = $1`, [id]))?.g ?? null;
const triggerCount = async (table) =>
  +(await one(`SELECT count(*) AS n FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal`, [`gis_datasets.${table}`])).n;
const sourceRules = async (sid) =>
  ((await one(`SELECT metadata FROM data_manager.sources WHERE source_id = $1`, [sid])).metadata.rules || []);

async function rulesInfo(sid) {
  const res = await graph.getAsync([['uda', ENV, 'sources', 'byId', sid, 'rulesInfo']]);
  return res.jsonGraph.uda[ENV].sources.byId[sid].rulesInfo.value;
}
// The rule calls report their outcome as a value (rulesCall) rather than throwing — see uda.route.js.
async function callRule(g, name, args) {
  const res = await g.callAsync(['uda', 'sources', name], args);
  const outcome = res.jsonGraph.uda[ENV].sources.byId[args[1]].rulesCall.value;
  if (!outcome.ok) throw new Error(outcome.error);
  return res;
}
const setRule = (sid, args, enable = true, g = graph) => callRule(g, 'setRule', [ENV, sid, args, enable]);
const backfillRule = (sid, key) => callRule(graph, 'backfillRule', [ENV, sid, key]);

async function createRow(viewId, row) {
  const res = await graph.callAsync(['uda', 'data', 'create'], [ENV, viewId, row]);
  const byId = res.jsonGraph.uda[ENV].viewsById[viewId].dataById;
  return Number(Object.keys(byId)[0]);
}
const editRow = (viewId, id, row) => graph.callAsync(['uda', 'data', 'edit'], [ENV, viewId, id, row]);

async function part2() {
  console.log('\nPart 2 — routes against PostgreSQL + PostGIS');
  db = getDb(DAMA_DB);
  await awaitReady();
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS postgis');
  } catch (e) {
    throw new Error(`PostGIS is not available (${e.message}). Run with DMS_TEST_PG_IMAGE=postgis/postgis:16-3.4 — see npm run test:pg:source-rules`);
  }
  await db.query('CREATE SCHEMA IF NOT EXISTS gis_datasets');
  graph = createTestGraph(DMS_DB);

  const sid = await makeSource('rules');
  const { viewId, table } = await makeView(sid);

  await test('rulesInfo lists both core rules, nothing attached, and the table columns', async () => {
    const info = await rulesInfo(sid);
    assert(info.supported === true, 'supported');
    const ids = info.available.map(r => r.id);
    assert(ids.includes('auto_number') && ids.includes('point_from_lat_lon'), `available: ${ids}`);
    assert(info.attached.length === 0, 'none attached');
    assert(info.latest.geometryColumns[0].type === 'MULTIPOINT', 'geometry type');
    assert(info.available.find(r => r.id === 'point_from_lat_lon').defaults.geom === 'wkb_geometry', 'geom default');
    assert(info.available.find(r => r.id === 'auto_number').defaults.column === 'ogc_fid', 'pk default');
  });

  await test('G12 reproduced: a create without ogc_fid fails before Auto-number', async () => {
    await expectThrow(() => createRow(viewId, { name: 'before', latitude: 42.6, longitude: -73.8 }), /null value|not-null|violates/i, 'no default');
  });

  await test('setRule refuses an anonymous caller and a user without update-source, and runs no DDL', async () => {
    await expectThrow(() => setRule(sid, { id: 'auto_number', params: {} }, true, createTestGraph(DMS_DB, { user: null })), /Sign in/, 'anonymous');
    await expectThrow(() => setRule(sid, { id: 'auto_number', params: {} }, true, createTestGraph(DMS_DB, { user: { id: 99, email: 'x@y', groups: ['nobody'] } })), /don't have permission/, 'no permission');
    const col = await one(`SELECT is_identity FROM information_schema.columns WHERE table_schema = 'gis_datasets' AND table_name = $1 AND column_name = 'ogc_fid'`, [table]);
    assert(col.is_identity === 'NO', 'still no identity');
    assert((await sourceRules(sid)).length === 0, 'nothing recorded');
  });

  await test('Auto-number: installs the identity past max(ogc_fid); a create gets the next id', async () => {
    const res = await setRule(sid, { id: 'auto_number', params: {} });
    const info = res.jsonGraph.uda[ENV].sources.byId[sid].rulesInfo.value;
    const att = info.attached.find(r => r.id === 'auto_number');
    assert(att && att.key === 'auto_number:ogc_fid' && att.tables[0].status === 'installed', JSON.stringify(info.attached));
    assert(att.addedBy === 'test@test.com', 'addedBy');
    const id = await createRow(viewId, { name: 'new', latitude: 42.62, longitude: -73.79 });
    assert(id === 5, `expected id 5 (max 4 + 1), got ${id}`);
  });

  await test('Point from lat/lon: rejects a text latitude column and changes nothing', async () => {
    await expectThrow(() => setRule(sid, { id: 'point_from_lat_lon', params: { lat: 'name', lon: 'longitude' } }), /must hold numbers/, 'text lat');
    assert((await triggerCount(table)) === 0, 'no trigger');
    assert((await sourceRules(sid)).length === 1, 'still only auto_number');
  });

  await test('Point from lat/lon: installs; a new row gets a MULTIPOINT from its coordinates', async () => {
    const res = await setRule(sid, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude', bounds: ALBANY } });
    const att = res.jsonGraph.uda[ENV].sources.byId[sid].rulesInfo.value.attached.find(r => r.id === 'point_from_lat_lon');
    assert(att.tables[0].status === 'installed', 'installed');
    assert(att.params.geom === 'wkb_geometry', 'geom defaulted');
    const id = await createRow(viewId, { name: 'pinned', latitude: 42.6411, longitude: -73.7637 });
    assert((await geomText(table, id)) === 'MULTIPOINT((-73.7637 42.6411))', `got ${await geomText(table, id)}`);
  });

  await test('editing only latitude rebuilds the point from the stored longitude', async () => {
    await editRow(viewId, 2, { latitude: 42.7 });
    assert((await geomText(table, 2)) === 'MULTIPOINT((-73.827429 42.7))', `got ${await geomText(table, 2)}`);
  });

  await test('clearing a coordinate removes the pin', async () => {
    await editRow(viewId, 1, { longitude: null });
    assert((await geomText(table, 1)) === null, 'geometry null');
    await editRow(viewId, 1, { longitude: -73.763686 });
    assert((await geomText(table, 1)) === 'MULTIPOINT((-73.763686 42.641109))', 'restored');
  });

  await test('swapped coordinates are refused with a plain message; no row is written', async () => {
    const before = +(await one(`SELECT count(*) AS n FROM gis_datasets.${table}`)).n;
    const msg = await expectThrow(() => createRow(viewId, { name: 'swapped', latitude: -73.76, longitude: 42.64 }), /outside the allowed area/, 'swapped');
    assert(/swapped/.test(msg), 'message names the likely cause');
    const after = +(await one(`SELECT count(*) AS n FROM gis_datasets.${table}`)).n;
    assert(before === after, 'no row');
  });

  await test('Apply to existing rows: fills the missing pins, skips the junk row', async () => {
    // Row 3 was seeded without geometry; row 5 was added (Auto-number test) before this rule existed.
    const res = await backfillRule(sid, 'point_from_lat_lon:wkb_geometry');
    const counts = res.jsonGraph.uda[ENV].sources.byId[sid].rulesBackfill['point_from_lat_lon:wkb_geometry'].value;
    const t0 = counts.tables[0];
    assert(t0.updated === 2 && t0.skippedOutOfBounds === 1 && t0.skippedMissing === 0, JSON.stringify(t0));
    assert((await geomText(table, 3)) === 'MULTIPOINT((-73.75 42.65))', 'row 3 filled');
    assert((await geomText(table, 5)) === 'MULTIPOINT((-73.79 42.62))', 'row 5 filled');
    assert((await geomText(table, 4)) === null, 'junk row untouched');
    // Float noise is left alone; a real difference is rewritten.
    await db.query(`UPDATE gis_datasets.${table} SET wkb_geometry = ST_Multi(ST_SetSRID(ST_MakePoint(-73.763686 + 1e-8, 42.641109), 4326)) WHERE ogc_fid = 1`);
    await db.query(`UPDATE gis_datasets.${table} SET wkb_geometry = ST_Multi(ST_SetSRID(ST_MakePoint(-73.763686 + 1e-4, 42.641109), 4326)) WHERE ogc_fid = 3`);
    const tol = (await backfillRule(sid, 'point_from_lat_lon:wkb_geometry')).jsonGraph.uda[ENV].sources.byId[sid].rulesBackfill['point_from_lat_lon:wkb_geometry'].value.tables[0];
    assert(tol.updated === 1, `only the misplaced pin is rewritten: ${JSON.stringify(tol)}`);
    assert((await geomText(table, 3)) === 'MULTIPOINT((-73.75 42.65))', 'row 3 back on its coordinates');
    const again = await backfillRule(sid, 'point_from_lat_lon:wkb_geometry');
    assert(again.jsonGraph.uda[ENV].sources.byId[sid].rulesBackfill['point_from_lat_lon:wkb_geometry'].value.tables[0].updated === 0, 'idempotent');
  });

  await test('a generic metadata save (Metadata page) keeps the rules', async () => {
    const meta = (await one(`SELECT metadata FROM data_manager.sources WHERE source_id = $1`, [sid])).metadata;
    const { rules: _drop, ...withoutRules } = meta;
    await graph.setAsync({
      paths: [['uda', ENV, 'sources', 'byId', sid, 'metadata']],
      jsonGraph: { uda: { [ENV]: { sources: { byId: { [sid]: { metadata: JSON.stringify({ ...withoutRules, rules: [{ id: 'x', key: 'sneaky' }], description_note: 'edited' }) } } } } } },
    });
    const after = (await one(`SELECT metadata FROM data_manager.sources WHERE source_id = $1`, [sid])).metadata;
    assert(after.description_note === 'edited', 'the save landed');
    assert(after.rules.length === 2 && !after.rules.some(r => r.key === 'sneaky'), JSON.stringify(after.rules));
  });

  await test('Edit with a changed key replaces the old instance (replaceKey)', async () => {
    await db.query(`ALTER TABLE gis_datasets.${table} ADD COLUMN geom2 geometry(POINT, 4326)`);
    await setRule(sid, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude', geom: 'geom2' }, replaceKey: 'point_from_lat_lon:wkb_geometry' });
    const keys = (await sourceRules(sid)).map(r => r.key).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['auto_number:ogc_fid', 'point_from_lat_lon:geom2']), keys.join());
    assert((await triggerCount(table)) === 1, 'one trigger');
    await editRow(viewId, 3, { latitude: 42.66 });
    const g2 = (await one(`SELECT ST_AsText(geom2) AS g FROM gis_datasets.${table} WHERE ogc_fid = 3`)).g;
    assert(g2 === 'POINT(-73.75 42.66)', `geom2 ${g2}`);
    // back to wkb_geometry for the rest of the run
    await setRule(sid, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude', geom: 'wkb_geometry', bounds: ALBANY }, replaceKey: 'point_from_lat_lon:geom2' });
    await db.query(`ALTER TABLE gis_datasets.${table} DROP COLUMN geom2`);
  });

  await test('a failure on the second table rolls back the first (one transaction)', async () => {
    const sid2 = await makeSource('rollback');
    const v1 = await makeView(sid2);
    const v2 = await makeView(sid2);
    const names = ruleObjectNames({ table: v2.table }, 'point_from_lat_lon:wkb_geometry');
    // A same-named function with another return type: CREATE OR REPLACE fails at install time,
    // after validation passed on both tables.
    await db.query(`CREATE FUNCTION gis_datasets.${names.fn}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`);
    await expectThrow(() => setRule(sid2, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude' } }), /return type|cannot change/i, 'install fails');
    assert((await triggerCount(v1.table)) === 0, 'table 1 rolled back');
    assert((await sourceRules(sid2)).length === 0, 'metadata rolled back');
    await db.query(`DROP FUNCTION gis_datasets.${names.fn}()`);
  });

  await test('a new version gets the rules (ensureSourceRules), then the call is cached', async () => {
    const v = await makeView(sid);
    assert((await triggerCount(v.table)) === 0, 'starts without');
    const first = await rules.ensureSourceRules(db, v.viewId);
    assert(first.installed.includes('point_from_lat_lon:wkb_geometry') && first.installed.includes('auto_number:ogc_fid'), JSON.stringify(first));
    assert((await triggerCount(v.table)) === 1, 'trigger installed');
    const second = await rules.ensureSourceRules(db, v.viewId);
    assert(second.cached === true, 'cached');
    const info = await rulesInfo(sid);
    const att = info.attached.find(r => r.id === 'point_from_lat_lon');
    assert(att.tables.length === 2 && att.tables.every(t => t.status === 'installed'), JSON.stringify(att.tables));
  });

  await test('the write path installs a missing rule before the first edit (safety net)', async () => {
    const v = await makeView(sid);
    rules.forgetEnsured(db);
    await editRow(v.viewId, 3, { latitude: 42.61 });
    assert((await geomText(v.table, 3)) === 'MULTIPOINT((-73.75 42.61))', 'edit went through the rule');
  });

  await test('a SRID 3857 table gets a transformed point', async () => {
    const sid3 = await makeSource('srid');
    const v = await makeView(sid3, { geomType: 'POINT', srid: 3857 });
    await setRule(sid3, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude' } });
    await editRow(v.viewId, 1, { latitude: 42.7 });
    const row = await one(`SELECT ST_SRID(wkb_geometry) AS srid,
        round(ST_X(ST_Transform(wkb_geometry, 4326))::numeric, 6)::float AS x,
        round(ST_Y(ST_Transform(wkb_geometry, 4326))::numeric, 6)::float AS y
      FROM gis_datasets.${v.table} WHERE ogc_fid = 1`);
    assert(row.srid === 3857, `srid ${row.srid}`);
    assert(row.x === -73.763686 && row.y === 42.7, `${row.x} ${row.y}`);
  });

  await test('Remove drops the trigger and function, keeps the geometry, and detaches', async () => {
    await setRule(sid, { id: 'point_from_lat_lon', key: 'point_from_lat_lon:wkb_geometry' }, false);
    assert((await triggerCount(table)) === 0, 'trigger gone');
    const names = ruleObjectNames({ table }, 'point_from_lat_lon:wkb_geometry');
    assert(!(await one(`SELECT to_regprocedure($1) AS f`, [`gis_datasets.${names.fn}()`])).f, 'function gone');
    assert((await geomText(table, 3)) === 'MULTIPOINT((-73.75 42.65))', 'geometry kept');
    assert((await sourceRules(sid)).map(r => r.key).join() === 'auto_number:ogc_fid', 'detached');
  });

  await test('removing Auto-number keeps the identity (adds keep working)', async () => {
    await setRule(sid, { id: 'auto_number', key: 'auto_number:ogc_fid' }, false);
    assert((await sourceRules(sid)).length === 0, 'detached');
    const id = await createRow(viewId, { name: 'still works', latitude: 42.6, longitude: -73.8 });
    assert(id > 5, `id ${id}`);
  });

  await test('an app can register a rule through registerDatatype', async () => {
    registerDatatype('rules_test_plugin', {
      rules: {
        test_noop: {
          label: 'Test rule', params: [], key: () => 'test_noop',
          validate: () => {}, install: () => [], uninstall: () => [], status: () => 'installed',
        },
      },
    });
    const info = await rulesInfo(sid);
    assert(info.available.some(r => r.id === 'test_noop'), 'registered rule offered');
  });

  await test('gis-publish: ogc_fid is an identity; the new version gets the source rules', async () => {
    const gisPublish = require('../src/dama/upload/workers/gis-publish');
    const sid4 = await makeSource('publish');
    await makeView(sid4);
    await setRule(sid4, { id: 'point_from_lat_lon', params: { lat: 'latitude', lon: 'longitude', bounds: ALBANY } });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-publish-'));
    const file = path.join(dir, 'points.geojson');
    fs.writeFileSync(file, JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 1, properties: { name: 'p1', latitude: 42.65, longitude: -73.76 }, geometry: { type: 'Point', coordinates: [-73.76, 42.65] } },
        { type: 'Feature', id: 2, properties: { name: 'p2', latitude: 42.66, longitude: -73.77 }, geometry: { type: 'Point', coordinates: [-73.77, 42.66] } },
      ],
    }));
    const events = [];
    const result = await gisPublish({
      task: {
        task_id: 0,
        descriptor: {
          source_id: sid4, gisUploadId: 'test', layerName: 'points', user_id: 1, dataFilePath: file,
          tableDescriptor: {
            columnTypes: [
              { key: 'name', col: 'name', db_type: 'TEXT' },
              { key: 'latitude', col: 'latitude', db_type: 'DOUBLE PRECISION' },
              { key: 'longitude', col: 'longitude', db_type: 'DOUBLE PRECISION' },
            ],
            promoteToMulti: true,
            postGisGeometryType: 'Point',
          },
        },
      },
      pgEnv: DAMA_DB,
      db,
      dispatchEvent: async (type, msg, payload) => events.push({ type, payload }),
      updateProgress: async () => {},
    });
    fs.rmSync(dir, { recursive: true, force: true });

    const col = await one(`SELECT is_identity FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'ogc_fid'`, [result.table_schema, result.table_name]);
    assert(col.is_identity === 'YES', 'identity');
    const max = +(await one(`SELECT max(ogc_fid) AS m FROM "${result.table_schema}"."${result.table_name}"`)).m;
    assert(result.rules && result.rules.installed.includes('point_from_lat_lon:wkb_geometry'), JSON.stringify(result.rules));
    const ins = await one(`INSERT INTO "${result.table_schema}"."${result.table_name}" (name, latitude, longitude) VALUES ('added', 42.67, -73.78) RETURNING ogc_fid, ST_AsText(wkb_geometry) AS g`);
    assert(+ins.ogc_fid === max + 1, `next id ${ins.ogc_fid}, max ${max}`);
    assert(ins.g === 'MULTIPOINT((-73.78 42.67))', ins.g);
    assert(events.some(e => e.type === 'gis-dataset:FINAL' && e.payload.rules), 'FINAL event reports the rules');
  });
}

(async () => {
  await part1();
  await part2();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log(`Failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
