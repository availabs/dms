/**
 * Table Splitting Integration Tests
 *
 * Tests Tier 1 table splitting — per-type splitting for dataset row data.
 * Only name-based types (internal_table) get split tables.
 * UUID-based types (internal_dataset) stay in data_items like production.
 */

const { createTestGraph } = require('./graph');
const { getDb } = require('../src/db/index.js');
const {
  isSplitType,
  parseType,
  sanitize,
  resolveTable,
  clearCaches,
  SPLIT_TYPE_REGEX
} = require('../src/db/table-resolver.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = `split-test-${Date.now()}`;

// Name-based split types (internal_table) — these get their own tables
const SPLIT_TYPE = 'test_dataset-42';
const SPLIT_TYPE_INVALID = 'test_dataset-42-invalid-entry';

// Additional name-based split types for more tests
const NAME_SPLIT_TYPE = 'traffic_counts-1';
const NAME_SPLIT_TYPE_INVALID = 'traffic_counts-1-invalid-entry';

// UUID-based type (internal_dataset) — stays in data_items, NOT split
const UUID_TYPE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-42';

// Non-split DMS content types
const NON_SPLIT_TYPE = 'test-type';
const PAGE_TYPE = 'abc123|page';
const SECTION_TYPE = 'abc123|section';

const SPLIT_MODE = 'per-app';

let graph = null;
let db = null;
let passed = 0;
let failed = 0;

/** Resolve the main (non-split) table for TEST_APP in current split mode */
function mainTable() {
  return resolveTable(TEST_APP, NON_SPLIT_TYPE, db.type, SPLIT_MODE);
}

/** Check if a table exists in the database */
async function tableExists(tableName) {
  const { schema } = resolveTable(TEST_APP, NON_SPLIT_TYPE, db.type, SPLIT_MODE);
  const result = await db.query(
    db.type === 'postgres'
      ? `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = $2`
      : `SELECT name FROM sqlite_master WHERE type='table' AND name = $1`,
    db.type === 'postgres' ? [schema, tableName] : [tableName]
  );
  return result.rows.length > 0;
}

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

  // UUID-based types (internal_dataset) should NOT split — they stay in data_items like production
  assert(!isSplitType('a1b2c3d4-e5f6-7890-abcd-ef1234567890-42'), 'UUID-viewId does not split');
  assert(!isSplitType('a1b2c3d4-e5f6-7890-abcd-ef1234567890-42-invalid-entry'), 'UUID-viewId-invalid-entry does not split');
  assert(!isSplitType('00000000-0000-0000-0000-000000000000-0'), 'All zeros UUID does not split');
  assert(!isSplitType('abcdef12-3456-7890-abcd-ef1234567890-999'), 'Large view_id UUID does not split');

  // Should match name-based dataset row types (internal_table)
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

async function testParseType() {
  console.log('\n--- Unit: parseType ---');

  // Valid split types
  const p1 = parseType('actions_6-291');
  assert(p1 !== null, 'actions_6-291 parses');
  assert(p1.docType === 'actions_6', `docType is actions_6 (got ${p1.docType})`);
  assert(p1.viewId === '291', `viewId is 291 (got ${p1.viewId})`);
  assert(p1.isInvalid === false, 'Not invalid');

  const p2 = parseType('actions_6-291-invalid-entry');
  assert(p2 !== null, 'actions_6-291-invalid-entry parses');
  assert(p2.docType === 'actions_6', `docType is actions_6 (got ${p2.docType})`);
  assert(p2.viewId === '291', `viewId is 291 (got ${p2.viewId})`);
  assert(p2.isInvalid === true, 'Is invalid');

  const p3 = parseType('traffic_counts-1');
  assert(p3.docType === 'traffic_counts', `docType is traffic_counts (got ${p3.docType})`);
  assert(p3.viewId === '1', `viewId is 1 (got ${p3.viewId})`);

  const p4 = parseType('a-99');
  assert(p4.docType === 'a', `Minimal docType (got ${p4.docType})`);
  assert(p4.viewId === '99', `viewId is 99 (got ${p4.viewId})`);

  // Non-split types return null
  assert(parseType('test-type') === null, 'Non-split type returns null');
  assert(parseType('abc123|source') === null, 'Pipe type returns null');
  assert(parseType(null) === null, 'null returns null');
  assert(parseType('') === null, 'Empty string returns null');
}

async function testResolveTableWithSourceId() {
  console.log('\n--- Unit: resolveTable with sourceId ---');

  // Legacy mode with sourceId — new naming
  const r1 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'legacy', 42);
  assert(r1.table === 'data_items__s42_v1_traffic_counts', `New naming (got ${r1.table})`);

  // Legacy mode with sourceId — invalid entry
  const r2 = resolveTable('myapp', 'traffic_counts-1-invalid-entry', 'sqlite', 'legacy', 42);
  assert(r2.table === 'data_items__s42_v1_traffic_counts_invalid', `Invalid suffix (got ${r2.table})`);

  // Legacy mode without sourceId — old naming (fallback)
  const r3 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'legacy', null);
  assert(r3.table === 'data_items__traffic_counts_1', `Fallback naming (got ${r3.table})`);

  // Per-app mode with sourceId — includes app prefix for full isolation
  const r4 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'per-app', 42);
  assert(r4.table === 'data_items__myapp__s42_v1_traffic_counts', `Per-app with sourceId (got ${r4.table})`);

  // Per-app mode without sourceId — old naming with app prefix
  const r5 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'per-app', null);
  assert(r5.table === 'data_items__myapp__traffic_counts_1', `Per-app fallback (got ${r5.table})`);

  // PostgreSQL fullName
  const r6 = resolveTable('myapp', 'actions_6-291', 'postgres', 'legacy', 290);
  assert(r6.fullName === 'dms.data_items__s290_v291_actions_6', `PG fullName (got ${r6.fullName})`);

  // Non-split types ignore sourceId
  const r7 = resolveTable('myapp', 'test-type', 'sqlite', 'legacy', 42);
  assert(r7.table === 'data_items', `Non-split ignores sourceId (got ${r7.table})`);

  // sourceId as string should also work
  const r8 = resolveTable('myapp', 'traffic_counts-1', 'sqlite', 'legacy', '42');
  assert(r8.table === 'data_items__s42_v1_traffic_counts', `String sourceId works (got ${r8.table})`);
}

// =========================================== Integration Tests =======================================

async function testSplitTypeCreate() {
  console.log('\n--- Integration: Create data in split table ---');

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
  const { table: expectedTable } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, SPLIT_MODE);
  assert(await tableExists(expectedTable), `Split table '${expectedTable}' exists in database`);

  return +id;
}

async function testNonSplitTypeStaysInMainTable() {
  console.log('\n--- Integration: Non-split type stays in main table ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'Test Page' }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created one row');

  // Verify it's in the main table (per-app table in per-app mode), not a split table
  const { fullName: tbl } = mainTable();
  const check = await db.query(
    `SELECT id FROM ${tbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, NON_SPLIT_TYPE]
  );
  assert(check.rows.length === 1, 'Row exists in main table');

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
  // $ref is ["dms", "data", app, "byId", id] — id is at the last position
  const refId = +ref.value[ref.value.length - 1];
  assert(refId === splitId, `byIndex $ref points to correct ID (${splitId})`);
}

async function testSplitTypeMassEdit(splitId) {
  console.log('\n--- Integration: Mass edit on split table ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'massedit'],
    [TEST_APP, SPLIT_TYPE, 'geoid', [{ invalidValue: '36001', validValue: '36002' }], null]
  );

  // Verify the data was updated — query directly from split table
  const { fullName: tbl } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, SPLIT_MODE);
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
  const { fullName: tbl } = resolveTable(TEST_APP, SPLIT_TYPE, db.type, SPLIT_MODE);
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

  const { table: expectedTable } = resolveTable(TEST_APP, SPLIT_TYPE_INVALID, db.type, SPLIT_MODE);
  assert(await tableExists(expectedTable), `Invalid entry split table '${expectedTable}' exists`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, SPLIT_TYPE_INVALID, +ids[0]]);
}

async function testIdsUniqueAcrossTables() {
  console.log('\n--- Integration: IDs unique across split tables ---');

  // Create rows in different split types — all should get unique IDs from shared sequence
  const type1 = 'cross_table_test-100';
  const type2 = 'cross_table_test-200';

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

  const splitType = 'multi_row_test-300';
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

  // Verify data is actually in the split table, not in the main table
  const { fullName: mainTbl } = mainTable();
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, splitType]
  );
  assert(mainCheck.rows.length === 0, 'Split type rows are NOT in main table');

  const { fullName: splitTbl } = resolveTable(TEST_APP, splitType, db.type, SPLIT_MODE);
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
  const { table: expectedTable } = resolveTable(TEST_APP, NAME_SPLIT_TYPE, db.type, SPLIT_MODE);
  assert(expectedTable.includes('traffic_counts_1'), `Table name contains readable suffix (got ${expectedTable})`);
  assert(await tableExists(expectedTable), `Name-based split table '${expectedTable}' exists`);

  // Verify data is in split table, not main
  const { fullName: mainTbl } = mainTable();
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, NAME_SPLIT_TYPE]
  );
  assert(mainCheck.rows.length === 0, 'Name-based split rows are NOT in main table');

  // Query via Falcor byIndex
  const key = `${TEST_APP}+${NAME_SPLIT_TYPE}`;
  const lenResult = await graph.getAsync([['dms', 'data', key, 'length']]);
  assert(lenResult.jsonGraph.dms.data[key].length === 1, 'Length is 1 via Falcor');

  // Delete
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NAME_SPLIT_TYPE, id]);

  const { fullName: splitTbl } = resolveTable(TEST_APP, NAME_SPLIT_TYPE, db.type, SPLIT_MODE);
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

  const { table: expectedTable } = resolveTable(TEST_APP, NAME_SPLIT_TYPE_INVALID, db.type, SPLIT_MODE);
  assert(expectedTable.includes('traffic_counts_1_invalid_entry'), `Invalid entry table readable (got ${expectedTable})`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NAME_SPLIT_TYPE_INVALID, +ids[0]]);
}

async function testNewNamingWithSourceRecord() {
  console.log('\n--- Integration: New naming when source record exists ---');

  // Create a source record so the controller can look up source_id
  const docType = 'naming_test';
  const sourceType = `${docType}|source`;
  const srcResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, sourceType, { doc_type: docType, name: 'Naming Test Source' }]
  );
  const sourceId = +Object.keys(srcResult.jsonGraph.dms.data.byId)[0];

  // Clear caches so the controller will do a fresh lookup
  clearCaches();

  // Create data with a split type that matches the source's doc_type
  const splitType = `${docType}-500`;
  const dataResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, splitType, { county: 'Albany', pop: 300000 }]
  );
  const dataId = +Object.keys(dataResult.jsonGraph.dms.data.byId)[0];

  // The table should use the new naming with sourceId
  const { table: expectedTable, fullName: expectedFullName } = resolveTable(TEST_APP, splitType, db.type, SPLIT_MODE, sourceId);
  assert(expectedTable.includes(`s${sourceId}_v500_${docType}`), `Table uses sourceId naming (got ${expectedTable})`);
  assert(await tableExists(expectedTable), `New-format table '${expectedTable}' exists`);

  // Verify data is in the new-named table
  const dataCheck = await db.query(
    `SELECT id FROM ${expectedFullName} WHERE app = $1 AND type = $2`,
    [TEST_APP, splitType]
  );
  assert(dataCheck.rows.length === 1, 'Row exists in new-named table');

  // Verify data is NOT in main table
  const { fullName: mainTbl } = mainTable();
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, splitType]
  );
  assert(mainCheck.rows.length === 0, 'Row is NOT in main table');

  // Query via Falcor to verify reads also use new naming
  const key = `${TEST_APP}+${splitType}`;
  const lenResult = await graph.getAsync([['dms', 'data', key, 'length']]);
  assert(lenResult.jsonGraph.dms.data[key].length === 1, 'Falcor length query works with new naming');

  // Test invalid entry variant
  const invalidType = `${docType}-500-invalid-entry`;
  const invResult = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, invalidType, { county: 'Bad', error: 'invalid' }]
  );
  const invId = +Object.keys(invResult.jsonGraph.dms.data.byId)[0];

  const { table: expectedInvalidTable } = resolveTable(TEST_APP, invalidType, db.type, SPLIT_MODE, sourceId);
  assert(expectedInvalidTable.includes(`s${sourceId}_v500_${docType}_invalid`), `Invalid table naming correct (got ${expectedInvalidTable})`);
  assert(await tableExists(expectedInvalidTable), `Invalid table '${expectedInvalidTable}' exists`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, splitType, dataId]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, invalidType, invId]);
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, sourceType, sourceId]);
}

async function testFallbackNamingWithoutSourceRecord() {
  console.log('\n--- Integration: Fallback naming when no source record ---');

  clearCaches();

  // Create data with a split type that has NO source record
  const splitType = 'orphan_dataset-999';
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, splitType, { x: 1 }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Should fall back to naming without sourceId
  const { table: expectedTable } = resolveTable(TEST_APP, splitType, db.type, SPLIT_MODE);
  assert(expectedTable.includes('orphan_dataset_999'), `Fallback table readable (got ${expectedTable})`);
  assert(await tableExists(expectedTable), `Fallback table '${expectedTable}' exists (no source record)`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, splitType, id]);
}

async function testUuidTypeStaysInMainTable() {
  console.log('\n--- Integration: UUID-based type (internal_dataset) stays in main table ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, UUID_TYPE, { geoid: '36001', value: 999 }]
  );

  const ids = Object.keys(result.jsonGraph.dms.data.byId);
  assert(ids.length === 1, 'Created UUID-type row');
  const id = +ids[0];

  // Verify it's in the main table (not a split table)
  const { fullName: mainTbl, table: mainTblName } = mainTable();
  const mainCheck = await db.query(
    `SELECT id FROM ${mainTbl} WHERE app = $1 AND type = $2`,
    [TEST_APP, UUID_TYPE]
  );
  assert(mainCheck.rows.length === 1, 'UUID-type row is in main table');

  // Verify resolveTable sends UUID types to main table (same as non-split)
  const { table } = resolveTable(TEST_APP, UUID_TYPE, db.type, SPLIT_MODE);
  assert(table === mainTblName, `UUID type resolves to main table (got ${table})`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, UUID_TYPE, id]);
}

// ========================================= Tier 2 Tests (Per-App Routes) =========================================

async function testAppNamespacedByIdRoute() {
  console.log('\n--- Tier 2: App-namespaced byId route ---');

  // Create a row
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'ById Test' }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Fetch via app-namespaced byId route: dms.data[app].byId[id][attrs]
  const getResult = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', id, ['id', 'app', 'type', 'data']]
  ]);

  const item = getResult.jsonGraph.dms.data[TEST_APP].byId[id];
  assert(item, 'App-namespaced byId returns data');
  assert(+item.id === id, `byId returns correct ID (${id})`);
  assert(item.app === TEST_APP, 'byId returns correct app');
  assert(item.type === NON_SPLIT_TYPE, 'byId returns correct type');

  const data = item.data?.$type === 'atom' ? item.data.value : item.data;
  assert(data?.title === 'ById Test', 'byId returns correct data');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NON_SPLIT_TYPE, id]);
}

async function testEditWith3Args() {
  console.log('\n--- Tier 2: Edit with 3 args (app-namespaced) ---');

  // Create a row
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'Edit3Args', count: 0 }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Edit with 3 args: [app, id, data]
  const editResult = await graph.callAsync(
    ['dms', 'data', 'edit'],
    [TEST_APP, id, { title: 'Updated3Args', count: 42 }]
  );

  // Verify response is at app-namespaced path
  const editItem = editResult.jsonGraph.dms.data[TEST_APP]?.byId?.[id];
  assert(editItem, 'Edit 3-arg returns data at app-namespaced path');

  const editData = editItem.data?.$type === 'atom' ? editItem.data.value : editItem.data;
  assert(editData?.title === 'Updated3Args', 'Edit updated the title');
  assert(editData?.count === 42, 'Edit updated the count');

  // Verify via direct query
  const check = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', id, ['data']]
  ]);
  const checkData = check.jsonGraph.dms.data[TEST_APP].byId[id].data;
  const checkVal = checkData?.$type === 'atom' ? checkData.value : checkData;
  assert(checkVal?.title === 'Updated3Args', 'Updated data persisted');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NON_SPLIT_TYPE, id]);
}

async function testTypeEditWith3Args() {
  console.log('\n--- Tier 2: Type edit with 3 args ---');

  // Create a row
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'TypeEdit' }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Edit type with 3 args: [app, id, newType]
  const newType = 'new-test-type';
  await graph.callAsync(
    ['dms', 'type', 'edit'],
    [TEST_APP, id, newType]
  );

  // Verify type was updated
  const check = await graph.getAsync([
    ['dms', 'data', TEST_APP, 'byId', id, ['type']]
  ]);
  const actualType = check.jsonGraph.dms.data[TEST_APP].byId[id].type;
  assert(actualType === newType, `Type updated to '${newType}' (got '${actualType}')`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, newType, id]);
}

async function testRefFormatIncludesApp() {
  console.log('\n--- Tier 2: $ref format includes app ---');

  // Use a unique type so byIndex[0] is guaranteed to be our row
  const refTestType = 'ref-format-test';

  // Create a row
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, refTestType, { title: 'RefFormat' }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Query byIndex and check $ref format
  const key = `${TEST_APP}+${refTestType}`;
  const indexResult = await graph.getAsync([
    ['dms', 'data', key, 'byIndex', 0]
  ]);
  const ref = indexResult.jsonGraph.dms.data[key].byIndex[0];
  assert(ref && ref.$type === 'ref', 'byIndex returns a $ref');
  assert(ref.value.length === 5, `$ref has 5 elements (got ${ref.value.length})`);
  assert(ref.value[0] === 'dms', '$ref[0] is "dms"');
  assert(ref.value[1] === 'data', '$ref[1] is "data"');
  assert(ref.value[2] === TEST_APP, `$ref[2] is app "${TEST_APP}"`);
  assert(ref.value[3] === 'byId', '$ref[3] is "byId"');
  assert(+ref.value[4] === id, `$ref[4] is the ID (${id})`);

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, refTestType, id]);
}

async function testCreateReturnsAtBothPaths() {
  console.log('\n--- Tier 2: Create returns data at both legacy and app-namespaced paths ---');

  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { title: 'DualPath' }]
  );

  // Check legacy path
  const legacyById = result.jsonGraph.dms.data.byId;
  assert(legacyById, 'Create response has legacy byId');
  const id = +Object.keys(legacyById)[0];
  assert(id, 'Legacy path has an ID');

  // Check app-namespaced path
  const appById = result.jsonGraph.dms.data[TEST_APP]?.byId;
  assert(appById, 'Create response has app-namespaced byId');
  assert(appById[id], 'App-namespaced path has same ID');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NON_SPLIT_TYPE, id]);
}

async function testTwoAppsNoInterference() {
  console.log('\n--- Tier 2: Two apps with same type do not interfere ---');

  const APP_A = `${TEST_APP}-appA`;
  const APP_B = `${TEST_APP}-appB`;
  const sharedType = 'shared-type';

  // Create rows in both apps with same type
  const rA = await graph.callAsync(
    ['dms', 'data', 'create'],
    [APP_A, sharedType, { from: 'appA' }]
  );
  const rB = await graph.callAsync(
    ['dms', 'data', 'create'],
    [APP_B, sharedType, { from: 'appB' }]
  );

  const idA = +Object.keys(rA.jsonGraph.dms.data.byId)[0];
  const idB = +Object.keys(rB.jsonGraph.dms.data.byId)[0];
  assert(idA && idB, `Both apps created rows (A=${idA}, B=${idB})`);

  // Query each app's length independently
  const keyA = `${APP_A}+${sharedType}`;
  const keyB = `${APP_B}+${sharedType}`;

  const lenA = await graph.getAsync([['dms', 'data', keyA, 'length']]);
  const lenB = await graph.getAsync([['dms', 'data', keyB, 'length']]);
  assert(lenA.jsonGraph.dms.data[keyA].length === 1, 'App A has 1 row');
  assert(lenB.jsonGraph.dms.data[keyB].length === 1, 'App B has 1 row');

  // Fetch via app-namespaced byId — each app sees its own data
  const getA = await graph.getAsync([['dms', 'data', APP_A, 'byId', idA, ['data']]]);
  const dataA = getA.jsonGraph.dms.data[APP_A].byId[idA].data;
  const valA = dataA?.$type === 'atom' ? dataA.value : dataA;
  assert(valA?.from === 'appA', 'App A sees its own data');

  const getB = await graph.getAsync([['dms', 'data', APP_B, 'byId', idB, ['data']]]);
  const dataB = getB.jsonGraph.dms.data[APP_B].byId[idB].data;
  const valB = dataB?.$type === 'atom' ? dataB.value : dataB;
  assert(valB?.from === 'appB', 'App B sees its own data');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [APP_A, sharedType, idA]);
  await graph.callAsync(['dms', 'data', 'delete'], [APP_B, sharedType, idB]);
}

async function testSearchOneRefFormat() {
  console.log('\n--- Tier 2: searchOne $ref includes app ---');

  // Create a row with a searchable field
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, NON_SPLIT_TYPE, { url_slug: 'test-searchone-slug', title: 'Search Test' }]
  );
  const id = +Object.keys(result.jsonGraph.dms.data.byId)[0];

  // Search by url_slug
  const key = `${TEST_APP}+${NON_SPLIT_TYPE}`;
  const searchFilter = JSON.stringify({
    wildKey: "data ->> 'url_slug'",
    params: 'test-searchone-slug',
  });

  const searchResult = await graph.getAsync([
    ['dms', 'data', key, 'searchOne', [searchFilter], ['id']]
  ]);

  const searchRef = searchResult.jsonGraph.dms.data[key].searchOne[searchFilter];
  assert(searchRef, 'searchOne returns a result');
  assert(searchRef.$type === 'ref', 'searchOne result is a $ref');
  assert(searchRef.value.length === 5, `searchOne $ref has 5 elements (got ${searchRef.value.length})`);
  assert(+searchRef.value[searchRef.value.length - 1] === id, 'searchOne $ref points to correct ID');

  // Cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, NON_SPLIT_TYPE, id]);
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
  await testParseType();
  await testResolveTableLegacy();
  await testResolveTableNameBased();
  await testResolveTablePerApp();
  await testResolveTableWithSourceId();

  // Integration tests
  graph = createTestGraph(DB_NAME);
  await graph.ready;
  db = getDb(DB_NAME);
  console.log(`\nDatabase type: ${graph.dbType}`);

  const splitId = await testSplitTypeCreate();
  await testNonSplitTypeStaysInMainTable();
  await testSplitTypeQueryByIndex(splitId);
  await testSplitTypeMassEdit(splitId);
  await testSplitTypeDelete(splitId);
  await testInvalidEntrySplitType();
  await testIdsUniqueAcrossTables();
  await testMultipleRowsInSplitTable();
  await testUuidTypeStaysInMainTable();
  await testNameBasedSplitCreate();
  await testNameBasedInvalidEntry();
  await testNewNamingWithSourceRecord();
  await testFallbackNamingWithoutSourceRecord();

  // Tier 2 tests: Per-App Routes
  await testAppNamespacedByIdRoute();
  await testEditWith3Args();
  await testTypeEditWith3Args();
  await testRefFormatIncludesApp();
  await testCreateReturnsAtBothPaths();
  await testTwoAppsNoInterference();
  await testSearchOneRefFormat();

  // Cleanup non-split data
  const { fullName: cleanupTbl } = mainTable();
  try { await db.query(`DELETE FROM ${cleanupTbl} WHERE app = $1`, [TEST_APP]); } catch (e) { /* table may not exist */ }

  console.log(`\n=== Table Splitting Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
