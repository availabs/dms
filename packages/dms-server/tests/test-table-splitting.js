/**
 * Table Splitting Integration Tests
 *
 * Tests Tier 1 table splitting — per-type splitting for dataset row data.
 * Verifies that split types (UUID-viewId pattern) get their own tables
 * while non-split types stay in data_items.
 */

const { createTestGraph } = require('./graph');
const { getDb } = require('../src/db/index.js');
const {
  isSplitType,
  sanitize,
  resolveTable,
  clearCaches,
  SPLIT_TYPE_REGEX
} = require('../src/db/table-resolver.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = `split-test-${Date.now()}`;

// A realistic UUID-viewId type (matches dataset row data pattern)
const SPLIT_TYPE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-42';
const SPLIT_TYPE_INVALID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-42-invalid-entry';

// Name-based split types (matches named dataset row data pattern)
const NAME_SPLIT_TYPE = 'traffic_counts-1';
const NAME_SPLIT_TYPE_INVALID = 'traffic_counts-1-invalid-entry';

// Non-split DMS content types
const NON_SPLIT_TYPE = 'test-type';
const PAGE_TYPE = 'abc123|page';
const SECTION_TYPE = 'abc123|section';

let graph = null;
let db = null;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`  ✗ ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passed++;
  console.log(`  ✓ ${message}`);
}

// ================================================= Unit Tests ====================================================

async function testIsSplitType() {
  console.log('\n--- Unit: isSplitType detection ---');

  // Should match UUID-based dataset row types
  assert(isSplitType('a1b2c3d4-e5f6-7890-abcd-ef1234567890-42'), 'UUID-viewId matches');
  assert(isSplitType('a1b2c3d4-e5f6-7890-abcd-ef1234567890-42-invalid-entry'), 'UUID-viewId-invalid-entry matches');
  assert(isSplitType('00000000-0000-0000-0000-000000000000-0'), 'All zeros matches');
  assert(isSplitType('abcdef12-3456-7890-abcd-ef1234567890-999'), 'Large view_id matches');

  // Should match name-based dataset row types
  assert(isSplitType('traffic_counts-1'), 'Name-viewId matches');
  assert(isSplitType('my_dataset-42'), 'Name with underscore matches');
  assert(isSplitType('a-1'), 'Minimal name matches');
  assert(isSplitType('test_data-1-invalid-entry'), 'Name-viewId-invalid-entry matches');
  assert(isSplitType('dataset2024-100'), 'Name with digits matches');

  // Should NOT match DMS content types
  assert(!isSplitType('site'), 'site does not match');
  assert(!isSplitType('siteType|pattern'), 'pattern type does not match');
  assert(!isSplitType('abc123|page'), 'page type does not match');
  assert(!isSplitType('abc123|section'), 'section type does not match');
  assert(!isSplitType('abc123|source'), 'source type does not match');
  assert(!isSplitType('abc123|source|view'), 'source|view type does not match');
  assert(!isSplitType('test-type'), 'simple hyphenated type does not match (no trailing digits)');
  assert(!isSplitType('my-app+type'), 'app+type does not match');
  assert(!isSplitType('my-app+type|source'), 'app+type|source does not match');
  assert(!isSplitType(''), 'empty string does not match');
  assert(!isSplitType(null), 'null does not match');
  assert(!isSplitType(undefined), 'undefined does not match');
}

async function testSanitize() {
  console.log('\n--- Unit: sanitize ---');

  assert(sanitize('my-app') === 'my_app', 'Hyphens replaced with underscores');
  assert(sanitize('MyApp') === 'myapp', 'Lowercased');
  assert(sanitize('app.name!') === 'appname', 'Special chars stripped');
  assert(sanitize('a1b2c3d4-e5f6-7890-abcd-ef1234567890-42') === 'a1b2c3d4_e5f6_7890_abcd_ef1234567890_42', 'UUID sanitized');
  assert(sanitize('') === '', 'Empty string returns empty');
  assert(sanitize(null) === '', 'null returns empty');
}

async function testResolveTableLegacy() {
  console.log('\n--- Unit: resolveTable (legacy mode) ---');

  // Non-split type → data_items
  const r1 = resolveTable('myapp', 'test-type', 'sqlite', 'legacy');
  assert(r1.table === 'data_items', 'Non-split type resolves to data_items');
  assert(r1.schema === 'main', 'SQLite schema is main');

  // Split type → data_items__<sanitized_type>
  const r2 = resolveTable('myapp', SPLIT_TYPE, 'sqlite', 'legacy');
  assert(r2.table.startsWith('data_items__'), 'Split type gets its own table');
  assert(!r2.table.includes('-'), 'Table name has no hyphens');
  assert(r2.table === `data_items__${sanitize(SPLIT_TYPE)}`, 'Table name matches sanitized type');

  // PostgreSQL schema
  const r3 = resolveTable('myapp', SPLIT_TYPE, 'postgres', 'legacy');
  assert(r3.schema === 'dms', 'PostgreSQL schema is dms');
  assert(r3.fullName === `dms.${r3.table}`, 'fullName includes schema for PostgreSQL');
}

async function testResolveTableNameBased() {
  console.log('\n--- Unit: resolveTable with name-based split types ---');

  // Name-based split type → readable table name
  const r1 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'legacy');
  assert(r1.table === 'data_items__traffic_counts_1', `Name-based type produces readable table (got ${r1.table})`);

  // Name-based invalid entry
  const r2 = resolveTable('myapp', 'traffic_counts-1-invalid-entry', 'sqlite', 'legacy');
  assert(r2.table === 'data_items__traffic_counts_1_invalid_entry', `Invalid entry table name correct (got ${r2.table})`);

  // PostgreSQL produces same readable name with schema prefix
  const r3 = resolveTable('myapp', 'traffic_counts-1', 'postgres', 'legacy');
  assert(r3.fullName === 'dms.data_items__traffic_counts_1', `PG fullName correct (got ${r3.fullName})`);

  // Per-app mode with name-based type
  const r4 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'per-app');
  assert(r4.table === 'data_items__myapp__traffic_counts_1', `Per-app name-based correct (got ${r4.table})`);
}

async function testResolveTablePerApp() {
  console.log('\n--- Unit: resolveTable (per-app mode) ---');

  // Non-split type → data_items__<app>
  const r1 = resolveTable('myapp', 'test-type', 'sqlite', 'per-app');
  assert(r1.table === 'data_items__myapp', 'Non-split type resolves to per-app table');

  // Split type → data_items__<app>__<type>
  const r2 = resolveTable('myapp', SPLIT_TYPE, 'sqlite', 'per-app');
  assert(r2.table === `data_items__myapp__${sanitize(SPLIT_TYPE)}`, 'Split type resolves to per-app+type table');

  // Different apps get different tables
  const r3 = resolveTable('other-app', 'test-type', 'sqlite', 'per-app');
  assert(r3.table === 'data_items__other_app', 'Different app gets different table');
  assert(r3.table !== r1.table, 'App tables are distinct');
}

// =========================================== Integration Tests (Legacy Mode) =======================================

async function testSplitTypeCreate() {
  console.log('\n--- Integration: Create data in split table (legacy mode) ---');

  // Create data with a split type — should auto-create split table
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, SPLIT_TYPE, { geoid: '36001', value: 100 }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created one row');

  const id = ids[0];
  const row = result.jsonGraph.dms.data.byId[id];
  assert(row.app === TEST_APP, 'App matches');
  assert(row.type === SPLIT_TYPE, 'Type matches');

  // Verify the table was actually created (use resolveTable for expected name)
  const { table: expectedTable } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, 'legacy');
  const tableCheck = await db.query(
    db.type === 'postgres'
      ? `SELECT tablename FROM pg_tables WHERE schemaname = 'dms' AND tablename = $1`
      : `SELECT name FROM sqlite_master WHERE type='table' AND name = $1`,
    [expectedTable]
  );
  assert(tableCheck.rows.length === 1, `Split table '${expectedTable}' exists in database`);

  return +id;
}

async function testNonSplitTypeStaysInDataItems() {
  console.log('\n--- Integration: Non-split type stays in data_items ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'Test Page' }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created one row');

  // Verify it's in data_items, not a split table
  const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const check = await db.query(
    `SELECT id FROM ${tbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, NON_SPLIT_TYPE]
  );
  assert(check.rows.length === 1, 'Row exists in data_items');

  return +ids[0];
}

async function testSplitTypeQueryByIndex(splitId) {
  console.log('\n--- Integration: Query split table via byIndex ---');

  const key = `${TEST_APP}+${SPLIT_TYPE}`;

  // Get length
  const lenResult = await graph.getAsync([
    ['dms', 'data', key, 'length']
  ]);
  const length = lenResult.jsonGraph.dms.data[key].length;
  assert(length >= 1, `Length is ${length} (>= 1)`);

  // Get by index
  const indexResult = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', 0]
  ]);
  const ref = indexResult.jsonGraph.dms.data[key].byIndex[0];
  assert(ref && ref.value, 'byIndex returns a $ref');
  assert(+ref.value[3] === splitId, `byIndex $ref points to correct ID (${splitId})`);
}

async function testSplitTypeMassEdit(splitId) {
  console.log('\n--- Integration: Mass edit on split table ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'massedit'],
    [TEST_APP, SPLIT_TYPE, 'geoid', [{ invalidValue: '36001', validValue: '36002' }], null]
  );

  // Verify the data was updated — query directly from split table
  const { fullName: tbl } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, 'legacy');
  const check = await db.query(`SELECT data FROM ${tbl} WHERE id = $1`, [splitId]);
  assert(check.rows.length === 1, 'Row exists in split table');

  const data = typeof check.rows[0].data === 'string'
    ? JSON.parse(check.rows[0].data)
    : check.rows[0].data;
  assert(data.geoid === '36002', `geoid updated to 36002 (got ${data.geoid})`);
}

async function testSplitTypeDelete(splitId) {
  console.log('\n--- Integration: Delete from split table ---');

  await graph.callAsync(
    ['dms', 'data', 'delete'],
    [TEST_APP, SPLIT_TYPE, splitId]
  );

  // Verify deletion from split table
  const { fullName: tbl } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, 'legacy');
  const check = await db.query(`SELECT id FROM ${tbl} WHERE id = $1`, [splitId]);
  assert(check.rows.length === 0, 'Row deleted from split table');
}

async function testInvalidEntrySplitType() {
  console.log('\n--- Integration: Invalid entry type gets split table ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, SPLIT_TYPE_INVALID, { geoid: '99999', error: 'bad data' }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created invalid entry row');

  const { table: expectedTable } = resolveTable(TEST_APP, SPLIT_TYPE_INVALID, db.type, 'legacy');
  const tableCheck = await db.query(
    db.type === 'postgres'
      ? `SELECT tablename FROM pg_tables WHERE schemaname = 'dms' AND tablename = $1`
      : `SELECT name FROM sqlite_master WHERE type='table' AND name = $1`,
    [expectedTable]
  );
  assert(tableCheck.rows.length === 1, `Invalid entry split table '${expectedTable}' exists`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, SPLIT_TYPE_INVALID, +ids[0]]);
}

async function testIdsUniqueAcrossTables() {
  console.log('\n--- Integration: IDs unique across split tables ---');

  // Create rows in different split types — all should get unique IDs from shared sequence
  const type1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-100';
  const type2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-200';

  const result1 = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, type1, { x: 1 }]
  );
  const result2 = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, type2, { x: 2 }]
  );
  const result3 = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, type1, { x: 3 }]
  );

  const id1 = +Object.keys(result1.jsonGraph.dms.data.byId)[0];
  const id2 = +Object.keys(result2.jsonGraph.dms.data.byId)[0];
  const id3 = +Object.keys(result3.jsonGraph.dms.data.byId)[0];

  const ids = [id1, id2, id3];
  const uniqueIds = new Set(ids);
  assert(uniqueIds.size === 3, `All IDs are unique: ${ids.join(', ')}`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, type1, id1, id3]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, type2, id2]);
}

async function testMultipleRowsInSplitTable() {
  console.log('\n--- Integration: Multiple rows in split table ---');

  const splitType = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-300';
  const key = `${TEST_APP}+${splitType}`;

  // Create multiple rows
  const r1 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, splitType, { county: 'Albany', pop: '300000' }]);
  const r2 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, splitType, { county: 'Bronx', pop: '1400000' }]);
  const r3 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, splitType, { county: 'Queens', pop: '2300000' }]);

  const id1 = +Object.keys(r1.jsonGraph.dms.data.byId)[0];
  const id2 = +Object.keys(r2.jsonGraph.dms.data.byId)[0];
  const id3 = +Object.keys(r3.jsonGraph.dms.data.byId)[0];

  // Verify length
  const lenResult = await graph.getAsync([['dms', 'data', key, 'length']]);
  const length = lenResult.jsonGraph.dms.data[key].length;
  assert(length === 3, `Length is 3 (got ${length})`);

  // Verify byIndex returns all rows
  const indexResult = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', [0, 1, 2]]
  ]);
  const byIndex = indexResult.jsonGraph.dms.data[key].byIndex;
  assert(byIndex[0]?.value != null, 'byIndex[0] returns a $ref');
  assert(byIndex[1]?.value != null, 'byIndex[1] returns a $ref');
  assert(byIndex[2]?.value != null, 'byIndex[2] returns a $ref');

  // Verify data is actually in the split table, not in data_items
  const mainTbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, splitType]
  );
  assert(mainCheck.rows.length === 0, 'Split type rows are NOT in data_items');

  const { fullName: splitTbl } = resolveTable(TEST_APP, splitType, db.type, 'legacy');
  const splitCheck = await db.query(
    `SELECT id FROM ${splitTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, splitType]
  );
  assert(splitCheck.rows.length === 3, 'All 3 rows are in the split table');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, splitType, id1, id2, id3]);
}

async function testNameBasedSplitCreate() {
  console.log('\n--- Integration: Name-based split type CRUD ---');

  // Create data with a name-based split type
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NAME_SPLIT_TYPE, { county: 'Albany', pop: 300000 }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created one row with name-based split type');
  const id = +ids[0];

  // Verify the split table was created with a readable name
  const { table: expectedTable } = resolveTable(TEST_APP, NAME_SPLIT_TYPE, db.type, 'legacy');
  assert(expectedTable === 'data_items__traffic_counts_1', `Table name is readable (got ${expectedTable})`);

  const tableCheck = await db.query(
    db.type === 'postgres'
      ? `SELECT tablename FROM pg_tables WHERE schemaname = 'dms' AND tablename = $1`
      : `SELECT name FROM sqlite_master WHERE type='table' AND name = $1`,
    [expectedTable]
  );
  assert(tableCheck.rows.length === 1, `Name-based split table '${expectedTable}' exists`);

  // Verify data is in split table, not main
  const mainTbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, NAME_SPLIT_TYPE]
  );
  assert(mainCheck.rows.length === 0, 'Name-based split rows are NOT in data_items');

  // Query via Falcor byIndex
  const key = `${TEST_APP}+${NAME_SPLIT_TYPE}`;
  const lenResult = await graph.getAsync([['dms', 'data', key, 'length']]);
  assert(lenResult.jsonGraph.dms.data[key].length === 1, 'Length is 1 via Falcor');

  // Delete
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NAME_SPLIT_TYPE, id]);

  const { fullName: splitTbl } = resolveTable(TEST_APP, NAME_SPLIT_TYPE, db.type, 'legacy');
  const afterDelete = await db.query(`SELECT id FROM ${splitTbl} WHERE id = $1`, [id]);
  assert(afterDelete.rows.length === 0, 'Row deleted from name-based split table');
}

async function testNameBasedInvalidEntry() {
  console.log('\n--- Integration: Name-based invalid entry split ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NAME_SPLIT_TYPE_INVALID, { county: 'Bad', error: 'invalid' }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created name-based invalid entry row');

  const { table: expectedTable } = resolveTable(TEST_APP, NAME_SPLIT_TYPE_INVALID, db.type, 'legacy');
  assert(expectedTable === 'data_items__traffic_counts_1_invalid_entry', `Invalid entry table readable (got ${expectedTable})`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NAME_SPLIT_TYPE_INVALID, +ids[0]]);
}

// ================================================ Test Runner ====================================================

async function run() {
  console.log('=== DMS Table Splitting Tests ===\n');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Test app: ${TEST_APP}`);

  // Clear resolver caches so each test run starts clean
  clearCaches();

  // Unit tests (no database needed)
  await testIsSplitType();
  await testSanitize();
  await testResolveTableLegacy();
  await testResolveTableNameBased();
  await testResolveTablePerApp();

  // Integration tests
  graph = createTestGraph(DB_NAME);
  db = getDb(DB_NAME);
  console.log(`\nDatabase type: ${graph.dbType}`);

  const splitId = await testSplitTypeCreate();
  await testNonSplitTypeStaysInDataItems();
  await testSplitTypeQueryByIndex(splitId);
  await testSplitTypeMassEdit(splitId);
  await testSplitTypeDelete(splitId);
  await testInvalidEntrySplitType();
  await testIdsUniqueAcrossTables();
  await testMultipleRowsInSplitTable();
  await testNameBasedSplitCreate();
  await testNameBasedInvalidEntry();

  // Cleanup non-split data
  const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  await db.query(`DELETE FROM ${tbl} WHERE app = $1`, [TEST_APP]);

  console.log(`\n=== Table Splitting Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
