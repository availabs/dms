/**
 * UDA Routes Integration Tests
 *
 * Tests UDA (Universal Data Access) Falcor routes through the graph harness.
 * Tests both DMS mode (app+type) and DAMA mode (pgEnv with real sources/views tables).
 *
 * Database selection:
 *   DMS_TEST_DB=dms-sqlite (default) or DMS_TEST_DB=dms-postgres-test
 *   DAMA_TEST_DB=dama-sqlite-test (default) — DAMA test database config
 */

const { createTestGraph } = require('./graph');

const DMS_DB = process.env.DMS_TEST_DB || 'dms-sqlite';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';

const TEST_APP = 'uda-test-' + Date.now();
const TEST_TYPE = 'dataset';
let graph = null;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, msg) {
  if (!condition) {
    testsFailed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function pass(name) {
  testsPassed++;
  console.log(`  ✓ ${name}`);
}

// ================================================= DMS Mode Tests ================================================

async function testDmsModeSourcesViaPatterns() {
  console.log('\n--- DMS Mode: Sources via Patterns ---');

  // Create a site with a forms pattern that has sources
  const siteResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'site', { patterns: [] }]
  );
  const siteId = Object.keys(siteResult.jsonGraph.dms.data.byId)[0];

  // Create a forms pattern with sources
  const patternResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'pattern', { doc_type: TEST_TYPE, pattern_type: 'forms', sources: [] }]
  );
  const patternId = Object.keys(patternResult.jsonGraph.dms.data.byId)[0];

  // Create two source items
  const src1Result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, TEST_TYPE, { name: 'Source A', display_name: 'Source Alpha' }]
  );
  const src1Id = Object.keys(src1Result.jsonGraph.dms.data.byId)[0];

  const src2Result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, TEST_TYPE, { name: 'Source B', display_name: 'Source Beta', views: [{ id: src1Id }] }]
  );
  const src2Id = Object.keys(src2Result.jsonGraph.dms.data.byId)[0];

  // Link sources to pattern
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [patternId, { doc_type: TEST_TYPE, pattern_type: 'forms', sources: [{ id: +src1Id }, { id: +src2Id }] }]
  );

  // Link pattern to site
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [siteId, { patterns: [{ id: +patternId }] }]
  );

  const env = `${TEST_APP}+${TEST_TYPE}`;

  // Test sources.length
  const lengthResult = await graph.getAsync([
    ['uda', env, 'sources', 'length']
  ]);
  const length = lengthResult.jsonGraph.uda[env].sources.length;
  assert(length === 2, `Expected 2 sources, got ${length}`);
  pass('sources.length returns correct count');

  // Test sources.byIndex
  const byIndexResult = await graph.getAsync([
    ['uda', env, 'sources', 'byIndex', { from: 0, to: 1 }, 'value']
  ]);
  const idx0 = byIndexResult.jsonGraph.uda[env].sources.byIndex[0];
  assert(idx0 && idx0.value, 'byIndex[0] should return a $ref');
  pass('sources.byIndex returns $ref objects');

  // Test sources.byId
  const byIdResult = await graph.getAsync([
    ['uda', env, 'sources', 'byId', [+src1Id, +src2Id], ['name', 'display_name']]
  ]);
  const s1 = byIdResult.jsonGraph.uda[env].sources.byId[src1Id];
  assert(s1.name === 'Source A', `Expected name 'Source A', got '${s1.name}'`);
  assert(s1.display_name === 'Source Alpha', `Expected display_name 'Source Alpha', got '${s1.display_name}'`);
  pass('sources.byId returns attributes from DMS data column');

  // Test sources.byId.views.length
  const viewLenResult = await graph.getAsync([
    ['uda', env, 'sources', 'byId', +src2Id, 'views', 'length']
  ]);
  const viewLen = viewLenResult.jsonGraph.uda[env].sources.byId[src2Id].views.length;
  assert(viewLen === 1, `Expected 1 view, got ${viewLen}`);
  pass('sources.byId.views.length works for DMS JSON views');

  // Test sources.byId.views.byIndex
  const viewByIdxResult = await graph.getAsync([
    ['uda', env, 'sources', 'byId', +src2Id, 'views', 'byIndex', 0, 'value']
  ]);
  const v0 = viewByIdxResult.jsonGraph.uda[env].sources.byId[src2Id].views.byIndex[0];
  assert(v0 && v0.value, 'views.byIndex[0] should return a $ref');
  pass('sources.byId.views.byIndex returns $ref');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, TEST_TYPE, src1Id, src2Id]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'pattern', patternId]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'site', siteId]);

  pass('DMS source/view routes cleanup complete');
}

async function testDmsModeViews() {
  console.log('\n--- DMS Mode: Views byId ---');

  const env = `${TEST_APP}+${TEST_TYPE}`;

  // Create a DMS item to act as a view
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, TEST_TYPE, { name: 'Test View', table_schema: 'public', table_name: 'test_data' }]
  );
  const viewId = Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Test views.byId GET
  const getResult = await graph.getAsync([
    ['uda', env, 'views', 'byId', +viewId, ['name', 'table_schema']]
  ]);
  const view = getResult.jsonGraph.uda[env].views.byId[viewId];
  assert(view.name === 'Test View', `Expected 'Test View', got '${view.name}'`);
  pass('views.byId GET returns DMS attributes');

  // Test views.byId SET
  const setResult = await graph.setAsync({
    jsonGraph: {
      uda: {
        [env]: {
          views: {
            byId: {
              [viewId]: {
                name: 'Updated View'
              }
            }
          }
        }
      }
    },
    paths: [['uda', env, 'views', 'byId', viewId, 'name']]
  });
  // Verify update persisted
  const verifyResult = await graph.getAsync([
    ['uda', env, 'views', 'byId', +viewId, ['name']]
  ]);
  const updatedName = verifyResult.jsonGraph.uda[env].views.byId[viewId].name;
  assert(updatedName === 'Updated View', `Expected 'Updated View', got '${updatedName}'`);
  pass('views.byId SET updates DMS data column');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, TEST_TYPE, viewId]);
  pass('DMS views cleanup complete');
}

async function testDmsModeDataQueries() {
  console.log('\n--- DMS Mode: Data Queries ---');

  // Create some test data items
  const items = [];
  for (let i = 0; i < 5; i++) {
    const result = await graph.callAsync(
      ['dms', 'data', 'create'],
      [TEST_APP, 'querytest', { name: `Item ${i}`, category: i < 3 ? 'alpha' : 'beta', count: String(i * 10) }]
    );
    items.push(Object.keys(result.jsonGraph.dms.data.byId)[0]);
  }

  const env = `${TEST_APP}+querytest`;
  const viewId = items[0]; // In DMS mode, viewId is used for type resolution; use any item

  // Test options.length — no filters
  const options = JSON.stringify({});
  const lenResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options, 'length']
  ]);
  const len = lenResult.jsonGraph.uda[env].viewsById[viewId].options[options].length;
  assert(len === 5, `Expected length 5, got ${len}`);
  pass('options.length returns total count');

  // Test options.dataByIndex with attributes
  const dataResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options, 'dataByIndex', { from: 0, to: 2 }, ['id', "data->>'name' as name"]]
  ]);
  const d0 = dataResult.jsonGraph.uda[env].viewsById[viewId].options[options].dataByIndex[0];
  assert(d0 && d0["data->>'name' as name"] !== undefined, 'dataByIndex should return attribute values');
  pass('options.dataByIndex returns data with attributes');

  // Test dataById
  const firstId = +items[0];
  const byIdResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'dataById', firstId, ['id', "data->>'name' as name"]]
  ]);
  const row = byIdResult.jsonGraph.uda[env].viewsById[viewId].dataById[firstId];
  assert(row && row.id === firstId, `Expected id ${firstId}, got ${row?.id}`);
  pass('dataById returns correct row');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'querytest', ...items]);
  pass('Data query cleanup complete');
}

// ================================================= DAMA Mode Tests ===============================================

async function testDamaModeSourcesCrud() {
  console.log('\n--- DAMA Mode: Sources CRUD ---');

  const { getDb } = require('../src/db/index');
  const db = getDb(DAMA_DB);

  // Wait for init to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';

  // Insert test sources directly
  const { rows: [s1] } = await db.query(
    `INSERT INTO ${tbl} (name, display_name, type, description) VALUES ($1, $2, $3, $4) RETURNING source_id AS id`,
    ['Test Source 1', 'TS1', 'csv', 'First test source']
  );
  const { rows: [s2] } = await db.query(
    `INSERT INTO ${tbl} (name, display_name, type, description) VALUES ($1, $2, $3, $4) RETURNING source_id AS id`,
    ['Test Source 2', 'TS2', 'geojson', 'Second test source']
  );

  // Test sources.length
  const lenResult = await graph.getAsync([
    ['uda', DAMA_DB, 'sources', 'length']
  ]);
  const len = lenResult.jsonGraph.uda[DAMA_DB].sources.length;
  assert(len >= 2, `Expected at least 2 sources, got ${len}`);
  pass('DAMA sources.length works');

  // Test sources.byIndex
  const byIdxResult = await graph.getAsync([
    ['uda', DAMA_DB, 'sources', 'byIndex', { from: 0, to: 1 }, 'value']
  ]);
  const ref0 = byIdxResult.jsonGraph.uda[DAMA_DB].sources.byIndex[0];
  assert(ref0 && ref0.value, 'DAMA byIndex should return $ref');
  pass('DAMA sources.byIndex returns $refs');

  // Test sources.byId
  const byIdResult = await graph.getAsync([
    ['uda', DAMA_DB, 'sources', 'byId', [s1.id, s2.id], ['name', 'display_name', 'type']]
  ]);
  const source1 = byIdResult.jsonGraph.uda[DAMA_DB].sources.byId[s1.id];
  assert(source1.name === 'Test Source 1', `Expected 'Test Source 1', got '${source1.name}'`);
  assert(source1.type === 'csv', `Expected type 'csv', got '${source1.type}'`);
  pass('DAMA sources.byId returns column values');

  // Cleanup
  await db.query(`DELETE FROM ${tbl} WHERE source_id = ANY($1)`, [[s1.id, s2.id]]);
  pass('DAMA sources cleanup complete');
}

async function testDamaModeViewsCrud() {
  console.log('\n--- DAMA Mode: Views CRUD ---');

  const { getDb } = require('../src/db/index');
  const db = getDb(DAMA_DB);

  const srcTbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const viewTbl = db.type === 'postgres' ? 'data_manager.views' : 'views';

  // Create a source first (views FK to sources)
  const { rows: [src] } = await db.query(
    `INSERT INTO ${srcTbl} (name, type) VALUES ($1, $2) RETURNING source_id AS id`,
    ['View Test Source', 'csv']
  );

  // Create views
  const { rows: [v1] } = await db.query(
    `INSERT INTO ${viewTbl} (source_id, table_schema, table_name, version) VALUES ($1, $2, $3, $4) RETURNING view_id AS id`,
    [src.id, 'public', 'test_data_v1', '1']
  );
  const { rows: [v2] } = await db.query(
    `INSERT INTO ${viewTbl} (source_id, table_schema, table_name, version) VALUES ($1, $2, $3, $4) RETURNING view_id AS id`,
    [src.id, 'public', 'test_data_v2', '2']
  );

  // Test views.length per source
  const lenResult = await graph.getAsync([
    ['uda', DAMA_DB, 'sources', 'byId', src.id, 'views', 'length']
  ]);
  const viewLen = lenResult.jsonGraph.uda[DAMA_DB].sources.byId[src.id].views.length;
  assert(viewLen === 2, `Expected 2 views, got ${viewLen}`);
  pass('DAMA views.length per source works');

  // Test views.byIndex
  const byIdxResult = await graph.getAsync([
    ['uda', DAMA_DB, 'sources', 'byId', src.id, 'views', 'byIndex', { from: 0, to: 1 }, 'value']
  ]);
  const vRef0 = byIdxResult.jsonGraph.uda[DAMA_DB].sources.byId[src.id].views.byIndex[0];
  assert(vRef0 && vRef0.value, 'DAMA views.byIndex should return $ref');
  pass('DAMA views.byIndex returns $refs');

  // Test views.byId
  const viewResult = await graph.getAsync([
    ['uda', DAMA_DB, 'views', 'byId', [v1.id, v2.id], ['table_schema', 'table_name', 'version']]
  ]);
  const view1 = viewResult.jsonGraph.uda[DAMA_DB].views.byId[v1.id];
  assert(view1.table_name === 'test_data_v1', `Expected 'test_data_v1', got '${view1.table_name}'`);
  assert(view1.version === '1', `Expected version '1', got '${view1.version}'`);
  pass('DAMA views.byId returns column values');

  // Cleanup (cascade delete: deleting source deletes views)
  await db.query(`DELETE FROM ${srcTbl} WHERE source_id = $1`, [src.id]);
  pass('DAMA views cleanup complete');
}

// ================================================= Test Runner ===================================================

async function run() {
  console.log('=== UDA Routes Integration Tests ===\n');
  console.log(`DMS database: ${DMS_DB}`);
  console.log(`DAMA database: ${DAMA_DB}`);

  graph = createTestGraph(DMS_DB);
  console.log(`Database type: ${graph.dbType}`);

  try {
    // DMS mode tests
    await testDmsModeSourcesViaPatterns();
    await testDmsModeViews();
    await testDmsModeDataQueries();

    // DAMA mode tests
    await testDamaModeSourcesCrud();
    await testDamaModeViewsCrud();

    console.log(`\n=== UDA Tests: ${testsPassed} passed, ${testsFailed} failed ===`);
    if (testsFailed > 0) process.exit(1);
  } catch (err) {
    console.error('\nTest failed:', err.message);
    console.error(err.stack);
    console.log(`\n=== UDA Tests: ${testsPassed} passed, ${testsFailed + 1} failed ===`);
    process.exit(1);
  }
}

run();
