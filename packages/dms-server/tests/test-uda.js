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

// UDA routes read DMS_DB_ENV to resolve the database — sync it with the test DB
process.env.DMS_DB_ENV = DMS_DB;

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

  // New type scheme: patterns are '{site}|{instance}:pattern', sources are
  // '{parent}|{instance}:source'. The env's right half is the pattern instance.
  const SITE_INSTANCE = TEST_APP; // use the app name as the site instance
  const PATTERN_INSTANCE = TEST_TYPE; // env becomes TEST_APP+dataset
  const SOURCE_TYPE = `${PATTERN_INSTANCE}|source`; // type for data row create

  // Create a site — type '{siteInstance}:site'
  const siteResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, `${SITE_INSTANCE}:site`, { patterns: [] }]
  );
  const siteId = Object.keys(siteResult.jsonGraph.dms.data.byId)[0];

  // Create a forms pattern — type '{siteInstance}|{patternInstance}:pattern'
  const patternResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, `${SITE_INSTANCE}|${PATTERN_INSTANCE}:pattern`, { name: PATTERN_INSTANCE, pattern_type: 'forms', sources: [] }]
  );
  const patternId = Object.keys(patternResult.jsonGraph.dms.data.byId)[0];

  // Create two source items — types '{patternInstance}|source_a:source' etc.
  const src1Result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, `${PATTERN_INSTANCE}|source_a:source`, { name: 'Source A', display_name: 'Source Alpha' }]
  );
  const src1Id = Object.keys(src1Result.jsonGraph.dms.data.byId)[0];

  const src2Result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, `${PATTERN_INSTANCE}|source_b:source`, { name: 'Source B', display_name: 'Source Beta', views: [{ id: src1Id }] }]
  );
  const src2Id = Object.keys(src2Result.jsonGraph.dms.data.byId)[0];

  // Link sources to pattern
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, patternId, { name: PATTERN_INSTANCE, pattern_type: 'forms', sources: [{ id: +src1Id }, { id: +src2Id }] }]
  );

  // Link pattern to site
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, siteId, { patterns: [{ id: +patternId }] }]
  );

  const env = `${TEST_APP}+${PATTERN_INSTANCE}`;

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
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${PATTERN_INSTANCE}|source_a:source`, src1Id]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${PATTERN_INSTANCE}|source_b:source`, src2Id]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${SITE_INSTANCE}|${PATTERN_INSTANCE}:pattern`, patternId]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${SITE_INSTANCE}:site`, siteId]);

  pass('DMS source/view routes cleanup complete');
}

async function testDmsModeRealWorldPatternType() {
  console.log('\n--- DMS Mode: Pattern with "undefined" site instance ---');

  // Patterns created before the site instance is set have `undefined` as
  // their site parent — e.g., 'undefined|realworld_test:pattern'. The
  // instance-segment match in getSitePatterns must still find them.

  const PATTERN_INSTANCE = 'realworld_test';
  const PATTERN_TYPE = `undefined|${PATTERN_INSTANCE}:pattern`;
  const SOURCE_TYPE = `${PATTERN_INSTANCE}|rs:source`;

  const patternResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, PATTERN_TYPE, { name: PATTERN_INSTANCE, pattern_type: 'datasets', sources: [] }]
  );
  const patternId = Object.keys(patternResult.jsonGraph.dms.data.byId)[0];

  // Create a source
  const srcResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, SOURCE_TYPE, { name: 'Real Source' }]
  );
  const srcId = Object.keys(srcResult.jsonGraph.dms.data.byId)[0];

  // Link source to pattern
  await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, patternId, { name: PATTERN_INSTANCE, pattern_type: 'datasets', sources: [{ id: +srcId }] }]
  );

  const env = `${TEST_APP}+${PATTERN_INSTANCE}`;

  // Test sources.length — this is the exact query path that was broken
  const lengthResult = await graph.getAsync([
    ['uda', env, 'sources', 'length']
  ]);
  const length = lengthResult.jsonGraph.uda[env].sources.length;
  assert(length === 1, `Expected 1 source for '${PATTERN_TYPE}', got ${length}`);
  pass('getSitePatterns finds patterns with an "undefined" site-instance prefix');

  // Test sources.byIndex
  const byIndexResult = await graph.getAsync([
    ['uda', env, 'sources', 'byIndex', { from: 0, to: 0 }, 'value']
  ]);
  const idx0 = byIndexResult.jsonGraph.uda[env].sources.byIndex[0];
  assert(idx0 && idx0.value, 'byIndex[0] should return a $ref for undefined-prefix pattern');
  pass('sources.byIndex works for undefined-site-instance pattern');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, SOURCE_TYPE, srcId]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, PATTERN_TYPE, patternId]);
  pass('undefined-site-instance pattern cleanup complete');
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
  assert(row && +row.id === firstId, `Expected id ${firstId}, got ${row?.id}`);
  pass('dataById returns correct row');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'querytest', ...items]);
  pass('Data query cleanup complete');
}

// ============================================= filterGroups Tests ==============================================

/**
 * Unit test: getValuesFromGroup must not return empty arrays for IS NULL leaves.
 *
 * Regression test for: "bind message supplies 8 parameters, but prepared statement requires 2"
 * Root cause: getValuesFromGroup returned [[]] for leaves with value: ['null'], creating
 * query parameters with no matching $N placeholder.
 */
async function testGetValuesFromGroupNullLeaves() {
  console.log('\n--- Unit: getValuesFromGroup with IS NULL leaves ---');

  const { getValuesFromGroup, handleFilterGroups } = require('../src/routes/uda/utils');

  // Leaf with value: ['null'] — should produce IS NULL SQL but zero values
  const nullLeaf = { col: "data->>'planning'", op: 'filter', value: ['null'] };
  const vals = getValuesFromGroup(nullLeaf);
  assert(vals.length === 0,
    `getValuesFromGroup should return [] for value:['null'], got ${JSON.stringify(vals)}`);
  pass('getValuesFromGroup returns no values for value: ["null"]');

  // Leaf with value: ['not null'] — should produce IS NOT NULL SQL but zero values
  const notNullLeaf = { col: "data->>'col'", op: 'exclude', value: ['not null'] };
  const vals2 = getValuesFromGroup(notNullLeaf);
  assert(vals2.length === 0,
    `getValuesFromGroup should return [] for value:['not null'], got ${JSON.stringify(vals2)}`);
  pass('getValuesFromGroup returns no values for value: ["not null"]');

  // Mixed leaf: ['alpha', 'null'] — keeps 'alpha', drops 'null' sentinel
  const mixedLeaf = { col: "data->>'cat'", op: 'filter', value: ['alpha', 'null'] };
  const vals3 = getValuesFromGroup(mixedLeaf);
  assert(vals3.length === 1 && vals3[0].length === 1 && vals3[0][0] === 'alpha',
    `Expected [['alpha']], got ${JSON.stringify(vals3)}`);
  pass('getValuesFromGroup keeps non-null values in mixed leaf');

  // Scalar 'null' sentinel — no values
  const scalarNull = { col: "data->>'x'", op: 'filter', value: 'null' };
  const vals4 = getValuesFromGroup(scalarNull);
  assert(vals4.length === 0,
    `Expected [] for scalar 'null', got ${JSON.stringify(vals4)}`);
  pass('getValuesFromGroup returns no values for scalar "null"');

  // Scalar real value — one value
  const scalarReal = { col: "data->>'x'", op: 'filter', value: 'hello' };
  const vals5 = getValuesFromGroup(scalarReal);
  assert(vals5.length === 1 && vals5[0][0] === 'hello',
    `Expected [['hello']], got ${JSON.stringify(vals5)}`);
  pass('getValuesFromGroup returns value for scalar real value');

  // Group of 6 IS NULL leaves — values count must match handleFilterGroups placeholder count
  const filterGroups = {
    op: 'and',
    groups: [
      { col: "data->>'col1'", op: 'filter', value: ['null'] },
      { col: "data->>'col2'", op: 'filter', value: ['null'] },
      { col: "data->>'col3'", op: 'filter', value: ['null'] },
      { col: "data->>'col4'", op: 'filter', value: ['null'] },
      { col: "data->>'col5'", op: 'filter', value: ['null'] },
      { col: "data->>'col6'", op: 'filter', value: ['null'] },
    ]
  };
  const groupVals = getValuesFromGroup(filterGroups);
  assert(groupVals.length === 0,
    `Expected 0 values for all-null filterGroups, got ${groupVals.length}: ${JSON.stringify(groupVals)}`);
  pass('getValuesFromGroup returns no values for group of IS NULL leaves');

  // Verify handleFilterGroups generates SQL (IS NULL conditions) but no placeholder params
  const { sql } = handleFilterGroups({ filterGroups, isDms: true, startIndex: 2 });
  assert(sql.length > 0, 'handleFilterGroups should generate IS NULL SQL');
  assert(!sql.includes('$3'), `SQL should not have new placeholders, got: ${sql}`);
  pass('handleFilterGroups generates IS NULL SQL without new placeholders');
}

/**
 * Integration test: UDA query with filterGroups containing IS NULL leaves.
 *
 * Reproduces the production error: SUM aggregation query with filterGroups whose leaves
 * are all IS NULL checks. Before the fix, this would crash with:
 *   "bind message supplies N parameters, but prepared statement requires 2"
 */
async function testFilterGroupsNullIntegration() {
  console.log('\n--- DMS Mode: filterGroups with IS NULL leaves ---');

  // Create test data — some items with 'status' set, some without
  const items = [];
  for (const data of [
    { name: 'A', status: 'active', priority: 'high' },
    { name: 'B', status: 'done' },                       // no priority
    { name: 'C' },                                        // no status, no priority
  ]) {
    const result = await graph.callAsync(
      ['dms', 'data', 'create'],
      [TEST_APP, 'fgtest', data]
    );
    items.push(Object.keys(result.jsonGraph.dms.data.byId)[0]);
  }

  const env = `${TEST_APP}+fgtest`;
  const viewId = items[0];

  // Query with filterGroups containing IS NULL leaves — this is the exact pattern
  // that caused the bind parameter mismatch in production
  const options = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'status'", op: 'filter', value: ['null'] },
        { col: "data->>'priority'", op: 'filter', value: ['null'] },
      ]
    }
  });

  // options.length should work without bind error
  const lenResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options, 'length']
  ]);
  const len = lenResult.jsonGraph.uda[env].viewsById[viewId].options[options].length;
  assert(len === 1, `Expected 1 item with both null, got ${len}`);
  pass('options.length with IS NULL filterGroups succeeds');

  // options.dataByIndex with aggregation attributes — mirrors the production SUM query
  const sumOptions = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'status'", op: 'filter', value: ['null'] },
      ]
    }
  });
  const sumResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', sumOptions, 'dataByIndex',
      { from: 0, to: 0 },
      ["count(1) as count_count"]]
  ]);
  const count = sumResult.jsonGraph.uda[env].viewsById[viewId].options[sumOptions].dataByIndex[0];
  assert(count && +count["count(1) as count_count"] === 1,
    `Expected count 1 for null status, got ${JSON.stringify(count)}`);
  pass('options.dataByIndex with IS NULL filterGroups and aggregation succeeds');

  // Mixed: one IS NULL leaf + one real value leaf
  const mixedOptions = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'status'", op: 'filter', value: ['active'] },
        { col: "data->>'priority'", op: 'filter', value: ['null'] },
      ]
    }
  });
  const mixedLen = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', mixedOptions, 'length']
  ]);
  const mLen = mixedLen.jsonGraph.uda[env].viewsById[viewId].options[mixedOptions].length;
  // Item A has status=active AND priority=high (not null), so 0 matches
  assert(mLen === 0, `Expected 0 items (active + null priority), got ${mLen}`);
  pass('options.length with mixed real + IS NULL filterGroups succeeds');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'fgtest', ...items]);
  pass('filterGroups IS NULL test cleanup complete');
}

// ============================================= array_contains Tests ==============================================

/**
 * Unit test: getValuesFromGroup handles array_contains leaves correctly.
 * Values should be returned as a wrapped array (same as filter op).
 */
async function testGetValuesFromGroupArrayContains() {
  console.log('\n--- Unit: getValuesFromGroup with array_contains leaves ---');

  const { getValuesFromGroup } = require('../src/routes/uda/utils');

  // array_contains with multiple values
  const multiLeaf = { col: "data->>'hazards'", op: 'array_contains', value: ['Flood', 'Hurricane'] };
  const vals = getValuesFromGroup(multiLeaf);
  assert(vals.length === 1, `Expected 1 param group, got ${vals.length}`);
  assert(vals[0].length === 2, `Expected 2 values in param, got ${vals[0].length}`);
  assert(vals[0][0] === 'Flood' && vals[0][1] === 'Hurricane', `Unexpected values: ${JSON.stringify(vals)}`);
  pass('getValuesFromGroup returns wrapped array for array_contains multi-value');

  // array_contains with single value (as array)
  const singleLeaf = { col: "data->>'county'", op: 'array_contains', value: ['Albany'] };
  const vals2 = getValuesFromGroup(singleLeaf);
  assert(vals2.length === 1 && vals2[0].length === 1 && vals2[0][0] === 'Albany',
    `Expected [['Albany']], got ${JSON.stringify(vals2)}`);
  pass('getValuesFromGroup returns wrapped array for array_contains single value');

  // array_contains with single string value (not wrapped in array)
  const scalarLeaf = { col: "data->>'level'", op: 'array_contains', value: 'Federal' };
  const vals3 = getValuesFromGroup(scalarLeaf);
  assert(vals3.length === 1 && vals3[0][0] === 'Federal',
    `Expected [['Federal']], got ${JSON.stringify(vals3)}`);
  pass('getValuesFromGroup returns wrapped array for array_contains scalar value');

  // array_contains with empty array
  const emptyLeaf = { col: "data->>'x'", op: 'array_contains', value: [] };
  const vals4 = getValuesFromGroup(emptyLeaf);
  assert(vals4.length === 0, `Expected [], got ${JSON.stringify(vals4)}`);
  pass('getValuesFromGroup returns empty for array_contains with empty value');
}

/**
 * Unit test: buildLeafSQL generates correct SQL for array_contains.
 */
async function testBuildLeafSQLArrayContains() {
  console.log('\n--- Unit: buildLeafSQL with array_contains ---');

  const { handleFilterGroups } = require('../src/routes/uda/utils');

  // PostgreSQL: should use jsonb_array_elements_text
  const pgFilterGroups = {
    op: 'and',
    groups: [
      { col: "data->>'hazards'", op: 'array_contains', value: ['Flood', 'Hurricane'] }
    ]
  };
  const pgResult = handleFilterGroups({ filterGroups: pgFilterGroups, isDms: true, startIndex: 2, dbType: 'postgres' });
  assert(pgResult.sql.includes('jsonb_array_elements_text'), `PG SQL should use jsonb_array_elements_text, got: ${pgResult.sql}`);
  assert(pgResult.sql.includes('$3'), `PG SQL should use $3 placeholder, got: ${pgResult.sql}`);
  assert(pgResult.sql.includes('::jsonb'), `PG SQL should cast to jsonb, got: ${pgResult.sql}`);
  pass('handleFilterGroups generates PG jsonb_array_elements_text SQL for array_contains');

  // SQLite: should use json_each
  const sqliteResult = handleFilterGroups({ filterGroups: pgFilterGroups, isDms: true, startIndex: 2, dbType: 'sqlite' });
  assert(sqliteResult.sql.includes('json_each'), `SQLite SQL should use json_each, got: ${sqliteResult.sql}`);
  assert(!sqliteResult.sql.includes('jsonb_array_elements_text'), `SQLite SQL should NOT use jsonb_array_elements_text`);
  assert(sqliteResult.sql.includes('_ac.value'), `SQLite SQL should reference _ac.value, got: ${sqliteResult.sql}`);
  pass('handleFilterGroups generates SQLite json_each SQL for array_contains');

  // Default (no dbType): should use PG syntax
  const defaultResult = handleFilterGroups({ filterGroups: pgFilterGroups, isDms: true, startIndex: 2 });
  assert(defaultResult.sql.includes('jsonb_array_elements_text'), `Default should use PG syntax`);
  pass('handleFilterGroups defaults to PG syntax when dbType not specified');

  // array_not_contains: should generate NOT EXISTS
  const notContainsGroups = {
    op: 'and',
    groups: [
      { col: "data->>'hazards'", op: 'array_not_contains', value: ['Flood'] }
    ]
  };
  const pgNot = handleFilterGroups({ filterGroups: notContainsGroups, isDms: true, startIndex: 0, dbType: 'postgres' });
  assert(pgNot.sql.includes('NOT EXISTS'), `PG array_not_contains should use NOT EXISTS, got: ${pgNot.sql}`);
  pass('handleFilterGroups generates NOT EXISTS for array_not_contains (PG)');

  const sqliteNot = handleFilterGroups({ filterGroups: notContainsGroups, isDms: true, startIndex: 0, dbType: 'sqlite' });
  assert(sqliteNot.sql.includes('NOT EXISTS') && sqliteNot.sql.includes('json_each'),
    `SQLite array_not_contains should use NOT EXISTS + json_each, got: ${sqliteNot.sql}`);
  pass('handleFilterGroups generates NOT EXISTS for array_not_contains (SQLite)');
}

/**
 * Integration test: UDA query with array_contains filter on JSON array data.
 */
async function testArrayContainsIntegration() {
  console.log('\n--- DMS Mode: array_contains filter ---');

  // Create test data with JSON array columns
  const items = [];
  for (const data of [
    { name: 'Item A', hazards: '["Flood", "Hurricane"]', county: '["Albany"]' },
    { name: 'Item B', hazards: '["Earthquake"]', county: '["Greene", "Albany"]' },
    { name: 'Item C', hazards: '["Flood", "Tornado"]', county: '["Rensselaer"]' },
    { name: 'Item D', hazards: '["Hurricane"]', county: '["Albany", "Greene"]' },
    { name: 'Item E', county: '["Albany"]' },  // no hazards
  ]) {
    const result = await graph.callAsync(
      ['dms', 'data', 'create'],
      [TEST_APP, 'actest', data]
    );
    items.push(Object.keys(result.jsonGraph.dms.data.byId)[0]);
  }

  const env = `${TEST_APP}+actest`;
  const viewId = items[0];

  // Test 1: array_contains with single value — should match items with "Flood"
  const options1 = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'hazards'", op: 'array_contains', value: ['Flood'] }
      ]
    }
  });
  const len1 = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options1, 'length']
  ]);
  const count1 = len1.jsonGraph.uda[env].viewsById[viewId].options[options1].length;
  assert(count1 === 2, `Expected 2 items with Flood, got ${count1}`);
  pass('array_contains single value returns correct count');

  // Test 2: array_contains with multiple values (OR semantics) — Flood or Earthquake
  const options2 = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'hazards'", op: 'array_contains', value: ['Flood', 'Earthquake'] }
      ]
    }
  });
  const len2 = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options2, 'length']
  ]);
  const count2 = len2.jsonGraph.uda[env].viewsById[viewId].options[options2].length;
  assert(count2 === 3, `Expected 3 items with Flood or Earthquake, got ${count2}`);
  pass('array_contains multiple values (OR semantics) returns correct count');

  // Test 3: array_contains combined with another filter (AND)
  const options3 = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'hazards'", op: 'array_contains', value: ['Flood'] },
        { col: "data->>'county'", op: 'array_contains', value: ['Albany'] }
      ]
    }
  });
  const len3 = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options3, 'length']
  ]);
  const count3 = len3.jsonGraph.uda[env].viewsById[viewId].options[options3].length;
  // Item A: hazards has Flood AND county has Albany → match
  // Item C: hazards has Flood but county has Rensselaer → no match
  assert(count3 === 1, `Expected 1 item with Flood AND Albany, got ${count3}`);
  pass('array_contains combined with AND returns correct count');

  // Test 4: array_contains returns actual data rows
  const dataResult = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options1, 'dataByIndex',
      { from: 0, to: 1 },
      ["data->>'name' as name", "data->>'hazards' as hazards"]]
  ]);
  const d0 = dataResult.jsonGraph.uda[env].viewsById[viewId].options[options1].dataByIndex[0];
  assert(d0 && d0["data->>'name' as name"] !== undefined, 'dataByIndex with array_contains should return data');
  pass('array_contains returns data rows via dataByIndex');

  // Test 5: array_not_contains — exclude items whose hazards contain "Flood"
  const options5 = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'hazards'", op: 'array_not_contains', value: ['Flood'] }
      ]
    }
  });
  const len5 = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options5, 'length']
  ]);
  const count5 = len5.jsonGraph.uda[env].viewsById[viewId].options[options5].length;
  // Items B (Earthquake), D (Hurricane), E (no hazards) = 3
  assert(count5 === 3, `Expected 3 items without Flood, got ${count5}`);
  pass('array_not_contains excludes matching items');

  // Test 6: array_not_contains with multiple values — exclude Flood OR Earthquake
  const options6 = JSON.stringify({
    filterGroups: {
      op: 'and',
      groups: [
        { col: "data->>'hazards'", op: 'array_not_contains', value: ['Flood', 'Earthquake'] }
      ]
    }
  });
  const len6 = await graph.getAsync([
    ['uda', env, 'viewsById', viewId, 'options', options6, 'length']
  ]);
  const count6 = len6.jsonGraph.uda[env].viewsById[viewId].options[options6].length;
  // Items D (Hurricane only), E (no hazards) = 2
  assert(count6 === 2, `Expected 2 items without Flood or Earthquake, got ${count6}`);
  pass('array_not_contains with multiple values excludes correctly');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'actest', ...items]);
  pass('array_contains test cleanup complete');
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
  await graph.ready;
  console.log(`Database type: ${graph.dbType}`);

  try {
    // DMS mode tests
    await testDmsModeSourcesViaPatterns();
    await testDmsModeRealWorldPatternType();
    await testDmsModeViews();
    await testDmsModeDataQueries();

    // filterGroups regression tests
    await testGetValuesFromGroupNullLeaves();
    await testFilterGroupsNullIntegration();

    // array_contains tests
    await testGetValuesFromGroupArrayContains();
    await testBuildLeafSQLArrayContains();
    await testArrayContainsIntegration();

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
