/**
 * Tests for the deprecate-internal-dataset migration script.
 *
 * Creates UUID-based and uppercase-name dataset rows in a test database,
 * runs the migration, and verifies rows are moved to split tables with
 * correct type strings.
 */

const { getDb } = require('../src/db/index.js');
const {
  isSplitType,
  resolveTable,
  clearCaches,
  UUID_SPLIT_REGEX,
} = require('../src/db/table-resolver.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = `deprecate-test-${Date.now()}`;
const SPLIT_MODE = 'per-app';

let db = null;
let passed = 0;
let failed = 0;

function mainTable() {
  return resolveTable(TEST_APP, 'non-split', db.type, SPLIT_MODE);
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

async function insertRow(type, data = {}) {
  const fqn = mainTable().fullName;
  const { rows } = await db.query(
    db.type === 'postgres'
      ? `INSERT INTO ${fqn} (app, type, data) VALUES ($1, $2, $3::jsonb) RETURNING id`
      : `INSERT INTO ${fqn} (app, type, data) VALUES ($1, $2, $3) RETURNING id`,
    [TEST_APP, type, JSON.stringify(data)]
  );
  return rows[0].id;
}

async function countRows(fqn, type) {
  const { rows } = await db.query(
    `SELECT count(*) as cnt FROM ${fqn} WHERE app = $1 AND type = $2`,
    [TEST_APP, type]
  );
  return +(rows[0]?.cnt || 0);
}

async function getRow(fqn, id) {
  const { rows } = await db.query(
    `SELECT * FROM ${fqn} WHERE id = $1`, [id]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Setup: ensure per-app table exists and insert test data
// ---------------------------------------------------------------------------

async function setup() {
  const { createTestGraph } = require('./graph');
  const graph = createTestGraph(DB_NAME);
  db = getDb(DB_NAME);
  clearCaches();

  // Create a dummy row to ensure the per-app table is initialized
  const result = await graph.callAsync(
    ['dms', 'data', 'create'],
    [TEST_APP, 'setup-type', {}]
  );
  const setupId = Object.keys(result.jsonGraph?.dms?.data?.byId || {})[0];
  if (setupId) {
    await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, 'setup-type', parseInt(setupId)]);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testUuidMigration() {
  console.log('\n--- UUID dataset migration ---');

  const uuid = 'aabbccdd-1122-3344-5566-778899001122';
  const type1 = `${uuid}-100`;
  const type1invalid = `${uuid}-100-invalid-entry`;

  // Pre-check: UUID types are NOT split-eligible
  assert(!isSplitType(type1), 'UUID type is not split-eligible before migration');
  assert(UUID_SPLIT_REGEX.test(type1), 'UUID type matches UUID_SPLIT_REGEX');

  // Insert test data rows into main table
  const id1 = await insertRow(type1, { col1: 'value1', col2: 42 });
  const id2 = await insertRow(type1, { col1: 'value2', col2: 43 });
  const id3 = await insertRow(type1invalid, { col1: 'bad', col2: -1 });

  // Insert a source record that references this UUID doc_type
  const sourceId = await insertRow(`test-pattern|source`, {
    name: 'Test Dataset Alpha',
    type: 'internal_dataset',
    doc_type: uuid,
    views: [{ id: 'v1', view_id: 100 }],
  });

  assert(await countRows(mainTable().fullName, type1) === 2, 'UUID data rows in main table');
  assert(await countRows(mainTable().fullName, type1invalid) === 1, 'UUID invalid row in main table');

  // Run migration
  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: true, batchSize: 100 });

  // Verify: rows moved to split table with new type
  const newDocType = 'test_dataset_alpha'; // nameToDocType('Test Dataset Alpha')
  const newType = `${newDocType}-100`;
  const newTypeInvalid = `${newDocType}-100-invalid-entry`;

  assert(isSplitType(newType), 'New type is split-eligible');
  assert(isSplitType(newTypeInvalid), 'New invalid type is split-eligible');

  // Old rows should be gone from main table
  assert(await countRows(mainTable().fullName, type1) === 0, 'Old UUID rows deleted from main table');
  assert(await countRows(mainTable().fullName, type1invalid) === 0, 'Old UUID invalid rows deleted from main table');

  // New rows should be in split table
  const splitResolved = resolveTable(TEST_APP, newType, db.type, SPLIT_MODE, sourceId);
  assert(await countRows(splitResolved.fullName, newType) === 2, 'Data rows moved to split table');

  const splitInvalidResolved = resolveTable(TEST_APP, newTypeInvalid, db.type, SPLIT_MODE, sourceId);
  assert(await countRows(splitInvalidResolved.fullName, newTypeInvalid) === 1, 'Invalid rows moved to split table');

  // Verify data integrity
  const movedRow = await getRow(splitResolved.fullName, id1);
  const data = typeof movedRow.data === 'string' ? JSON.parse(movedRow.data) : movedRow.data;
  assert(data.col1 === 'value1' && data.col2 === 42, 'Data preserved after migration');
  assert(movedRow.type === newType, 'Type updated to new format');

  // Verify source record updated
  const source = await getRow(mainTable().fullName, sourceId);
  const sourceData = typeof source.data === 'string' ? JSON.parse(source.data) : source.data;
  assert(sourceData.type === 'internal_table', 'Source type updated to internal_table');
  assert(sourceData.doc_type === newDocType, 'Source doc_type updated');
}

async function testUppercaseNameMigration() {
  console.log('\n--- Uppercase name migration ---');

  const type1 = 'MyDataset-200';
  const type1invalid = 'MyDataset-200-invalid-entry';

  // Pre-check: uppercase names are NOT split-eligible
  assert(!isSplitType(type1), 'Uppercase name type is not split-eligible');

  const id1 = await insertRow(type1, { name: 'row1' });
  const id2 = await insertRow(type1invalid, { name: 'bad_row' });

  // No source record for this one — test fallback doc_type generation

  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: true, batchSize: 100 });

  const newType = 'mydataset-200';
  const newTypeInvalid = 'mydataset-200-invalid-entry';

  assert(isSplitType(newType), 'Lowercased type is split-eligible');
  assert(await countRows(mainTable().fullName, type1) === 0, 'Old uppercase rows deleted');

  const splitResolved = resolveTable(TEST_APP, newType, db.type, SPLIT_MODE);
  assert(await countRows(splitResolved.fullName, newType) === 1, 'Uppercase rows moved to split table');
}

async function testCollisionAvoidance() {
  console.log('\n--- Collision avoidance ---');

  // Create two UUID datasets whose sources have the same name
  const uuid1 = '11111111-2222-3333-4444-555555555555';
  const uuid2 = '66666666-7777-8888-9999-aaaaaaaaaaaa';

  await insertRow(`${uuid1}-300`, { x: 1 });
  await insertRow(`${uuid2}-400`, { x: 2 });

  const sourceId1 = await insertRow('test-pattern|source', {
    name: 'Duplicate Name',
    type: 'internal_dataset',
    doc_type: uuid1,
  });
  const sourceId2 = await insertRow('test-pattern|source', {
    name: 'Duplicate Name',
    type: 'internal_dataset',
    doc_type: uuid2,
  });

  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: true, batchSize: 100 });

  // One should be 'duplicate_name', the other 'duplicate_name_2'
  const type1 = 'duplicate_name-300';
  const type2 = 'duplicate_name_2-400';

  assert(isSplitType(type1), 'First collision type is split-eligible');
  assert(isSplitType(type2), 'Second collision type is split-eligible');

  const r1 = resolveTable(TEST_APP, type1, db.type, SPLIT_MODE, sourceId1);
  const r2 = resolveTable(TEST_APP, type2, db.type, SPLIT_MODE, sourceId2);

  const cnt1 = await countRows(r1.fullName, type1);
  const cnt2 = await countRows(r2.fullName, type2);
  assert(cnt1 === 1 && cnt2 === 1, `Both datasets migrated with unique doc_types (${cnt1}, ${cnt2})`);
}

async function testPhantomRefCleanup() {
  console.log('\n--- Phantom ref cleanup ---');

  // Create a pattern with source refs pointing to non-existent IDs
  const patternId = await insertRow('pattern', {
    pattern_type: 'datasets',
    sources: [
      { id: '999999999', ref: `${TEST_APP}+fake|source` },
      { id: '999999998', ref: `${TEST_APP}+fake|source` },
    ],
  });

  // Insert a UUID data row so the migration discovers this app
  // (phantom cleanup runs per-app, only when the app has discoverable rows)
  const phantomUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await insertRow(`${phantomUuid}-600`, { phantom: true });

  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: true, batchSize: 100 });

  const pattern = await getRow(mainTable().fullName, patternId);
  const data = typeof pattern.data === 'string' ? JSON.parse(pattern.data) : pattern.data;
  assert(data.sources.length === 0, 'Phantom source refs cleaned up');
}

async function testDryRunNoChanges() {
  console.log('\n--- Dry-run makes no changes ---');

  const uuid = 'dddddddd-eeee-ffff-0000-111111111111';
  const type = `${uuid}-500`;
  const id = await insertRow(type, { val: 'dryrun' });

  const before = await countRows(mainTable().fullName, type);
  assert(before === 1, 'Row exists before dry-run');

  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: false, batchSize: 100 });

  const after = await countRows(mainTable().fullName, type);
  assert(after === 1, 'Row still in main table after dry-run');
}

async function testIdempotent() {
  console.log('\n--- Idempotent (re-running is safe) ---');

  // Running migration again should find nothing to do (all previous UUID types already migrated)
  const { migrate } = loadMigrationModule();
  await migrate({ source: DB_NAME, app: TEST_APP, apply: true, batchSize: 100 });
  // If we get here without error, it's idempotent
  passed++;
  console.log('  ✓ Re-running migration is safe (no errors)');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadMigrationModule() {
  // We can't require the script directly since it calls parseArgs() at module level.
  // Instead, we'll inline the migrate function by running it as a child process.
  // Actually, let's refactor: we'll load the script and call its internal function.
  // But the script is self-executing... so we need to extract the logic.
  //
  // Workaround: use child_process to run the script with the right args.
  const { execSync } = require('child_process');
  const path = require('path');
  const scriptPath = path.join(__dirname, '..', 'src', 'scripts', 'deprecate-internal-dataset.js');

  return {
    async migrate(opts) {
      const args = ['--source', opts.source];
      if (opts.app) args.push('--app', opts.app);
      if (opts.apply) args.push('--apply');
      if (opts.batchSize) args.push('--batch-size', String(opts.batchSize));

      const output = execSync(`node ${scriptPath} ${args.join(' ')}`, {
        encoding: 'utf8',
        cwd: path.join(__dirname, '..'),
        timeout: 30000,
      });
      // Print script output indented
      for (const line of output.split('\n').filter(l => l.trim())) {
        console.log(`    [script] ${line}`);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Deprecate Internal Dataset Tests ===\n');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Test app: ${TEST_APP}`);

  await setup();

  // Run tests in order — some depend on prior state
  await testDryRunNoChanges();
  await testUuidMigration();
  await testUppercaseNameMigration();
  await testCollisionAvoidance();
  await testPhantomRefCleanup();
  await testIdempotent();

  // Cleanup: delete all test data
  console.log('\n--- Cleanup ---');
  const fqn = mainTable().fullName;
  await db.query(`DELETE FROM ${fqn} WHERE app = $1`, [TEST_APP]);
  console.log(`  Deleted test data from ${fqn}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
