/**
 * DMS Database Copy — Integration Tests
 *
 * Tests the copy-db.js CLI script with real SQLite databases.
 * Creates a source database, seeds it with test data, runs the copy CLI,
 * then verifies the target database has identical data.
 */

const { execFileSync } = require('child_process');
const { existsSync, unlinkSync, readFileSync } = require('fs');
const { join } = require('path');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'src/scripts/copy-db.js');
const DATA_DIR = join(ROOT, 'src/db/data');
const DMS_SQL = join(ROOT, 'src/db/sql/dms/dms.sqlite.sql');

const SRC_CONFIG = 'copy-test-src';
const TGT_CONFIG = 'copy-test-tgt';
const SRC_FILE = join(DATA_DIR, 'copy-test-src.sqlite');
const TGT_FILE = join(DATA_DIR, 'copy-test-tgt.sqlite');

const TEST_APP = `copy-test-${Date.now()}`;
const TEST_APP2 = `copy-test-other-${Date.now()}`;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`  \u2717 ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passed++;
  console.log(`  \u2713 ${message}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanupFile(file) {
  for (const f of [file, file + '-shm', file + '-wal']) {
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }
}

function resetDbs() {
  cleanupFile(SRC_FILE);
  cleanupFile(TGT_FILE);
}

/** Create a fresh SQLite database with DMS schema initialized. */
async function openDb(file) {
  const db = new SqliteAdapter({ type: 'sqlite', filename: file });
  const sql = readFileSync(DMS_SQL, 'utf8');
  for (const stmt of sql.split(';').filter(s => s.trim())) {
    await db.query(stmt + ';');
  }
  return db;
}

function runCopy(...extraArgs) {
  const args = ['--source', SRC_CONFIG, '--target', TGT_CONFIG, ...extraArgs];
  return execFileSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function runCopyExpectError(...extraArgs) {
  try {
    runCopy(...extraArgs);
    return null;
  } catch (err) {
    return err.stderr || err.stdout || err.message;
  }
}

// ---------------------------------------------------------------------------
// Test: Basic copy
// ---------------------------------------------------------------------------

async function testBasicCopy() {
  console.log('\n--- Basic SQLite → SQLite copy ---');
  resetDbs();

  // Seed source
  const src = await openDb(SRC_FILE);
  await src.query(
    `INSERT INTO formats (id, app, type, attributes) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'site', JSON.stringify({ title: 'Test' })]
  );
  await src.query(
    `INSERT INTO formats (id, app, type, attributes) VALUES ($1, $2, $3, $4)`,
    [2, TEST_APP, 'pattern', JSON.stringify({ name: 'page' })]
  );
  for (let i = 1; i <= 5; i++) {
    await src.query(
      `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
      [i, TEST_APP, 'page', JSON.stringify({ title: `Page ${i}` })]
    );
  }
  await src.end();

  // Run copy
  const output = runCopy();
  assert(output.includes('All counts match'), 'Verification passed');

  // Verify target
  const tgt = await openDb(TGT_FILE);
  const { rows: fmtRows } = await tgt.query('SELECT * FROM formats ORDER BY id');
  assert(fmtRows.length === 2, `formats: 2 rows copied (got ${fmtRows.length})`);
  assert(fmtRows[0].id === 1, 'formats: ID 1 preserved');
  assert(fmtRows[1].id === 2, 'formats: ID 2 preserved');
  assert(fmtRows[0].app === TEST_APP, 'formats: app preserved');

  const { rows: dataRows } = await tgt.query('SELECT * FROM data_items ORDER BY id');
  assert(dataRows.length === 5, `data_items: 5 rows copied (got ${dataRows.length})`);
  assert(dataRows[0].id === 1, 'data_items: ID 1 preserved');
  assert(dataRows[4].id === 5, 'data_items: ID 5 preserved');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: Data integrity
// ---------------------------------------------------------------------------

async function testDataIntegrity() {
  console.log('\n--- Data integrity (JSON, nulls, timestamps) ---');
  resetDbs();

  const src = await openDb(SRC_FILE);

  // Complex JSON data
  const complexData = {
    title: 'Test Page',
    nested: { a: 1, b: [2, 3] },
    tags: ['news', 'featured'],
    empty: {},
    nullVal: null,
    num: 42.5
  };

  await src.query(
    `INSERT INTO data_items (id, app, type, data, created_at, created_by, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [10, TEST_APP, 'page', JSON.stringify(complexData), '2024-06-15 12:30:00', 7, '2024-06-15 13:00:00', null]
  );

  // Format with complex attributes
  await src.query(
    `INSERT INTO formats (id, app, type, attributes, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [10, TEST_APP, 'page', JSON.stringify([{ key: 'title', type: 'text' }]), '2024-01-01 00:00:00', '2024-06-15 12:00:00']
  );
  await src.end();

  runCopy();

  const tgt = await openDb(TGT_FILE);
  const { rows } = await tgt.query('SELECT * FROM data_items WHERE id = 10');
  assert(rows.length === 1, 'Row copied');

  const row = rows[0];
  assert(typeof row.data === 'object', 'data is parsed object');
  assert(row.data.title === 'Test Page', 'data.title preserved');
  assert(row.data.nested.a === 1, 'data.nested.a preserved');
  assert(Array.isArray(row.data.tags), 'data.tags is array');
  assert(row.data.tags[1] === 'featured', 'data.tags[1] preserved');
  assert(row.data.num === 42.5, 'data.num preserved');
  assert(row.created_by === 7, 'created_by preserved');
  assert(row.updated_by === null, 'updated_by null preserved');
  assert(row.created_at === '2024-06-15 12:30:00', 'created_at preserved');
  assert(row.updated_at === '2024-06-15 13:00:00', 'updated_at preserved');

  const { rows: fmtRows } = await tgt.query('SELECT * FROM formats WHERE id = 10');
  assert(fmtRows.length === 1, 'Format row copied');
  assert(Array.isArray(fmtRows[0].attributes), 'attributes is array');
  assert(fmtRows[0].attributes[0].key === 'title', 'attributes content preserved');
  assert(fmtRows[0].created_at === '2024-01-01 00:00:00', 'format created_at preserved');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: --dry-run
// ---------------------------------------------------------------------------

async function testDryRun() {
  console.log('\n--- --dry-run ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'page', JSON.stringify({ title: 'Page' })]
  );
  await src.end();

  const output = runCopy('--dry-run');
  assert(output.includes('dry run'), 'Output mentions dry run');

  const tgt = await openDb(TGT_FILE);
  const { rows } = await tgt.query('SELECT COUNT(*) AS count FROM data_items');
  assert(Number(rows[0].count) === 0, 'No data written to target');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: --app filter
// ---------------------------------------------------------------------------

async function testAppFilter() {
  console.log('\n--- --app filter ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  // App 1: 3 data items + 1 format
  for (let i = 1; i <= 3; i++) {
    await src.query(
      `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
      [i, TEST_APP, 'page', JSON.stringify({ n: i })]
    );
  }
  await src.query(
    `INSERT INTO formats (id, app, type, attributes) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'page', JSON.stringify({})]
  );

  // App 2: 2 data items + 1 format
  for (let i = 4; i <= 5; i++) {
    await src.query(
      `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
      [i, TEST_APP2, 'page', JSON.stringify({ n: i })]
    );
  }
  await src.query(
    `INSERT INTO formats (id, app, type, attributes) VALUES ($1, $2, $3, $4)`,
    [2, TEST_APP2, 'page', JSON.stringify({})]
  );
  await src.end();

  // Copy only app 1
  runCopy('--app', TEST_APP);

  const tgt = await openDb(TGT_FILE);
  const { rows: dataRows } = await tgt.query('SELECT * FROM data_items');
  assert(dataRows.length === 3, `Only app1 data copied (got ${dataRows.length})`);
  assert(dataRows.every(r => r.app === TEST_APP), 'All rows belong to app1');

  const { rows: fmtRows } = await tgt.query('SELECT * FROM formats');
  assert(fmtRows.length === 1, `Only app1 format copied (got ${fmtRows.length})`);
  assert(fmtRows[0].app === TEST_APP, 'Format belongs to app1');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: --clear-target
// ---------------------------------------------------------------------------

async function testClearTarget() {
  console.log('\n--- --clear-target ---');
  resetDbs();

  // Seed source with initial data
  const src = await openDb(SRC_FILE);
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'page', JSON.stringify({ v: 1 })]
  );
  await src.end();

  // First copy
  runCopy();

  // Verify initial copy
  let tgt = await openDb(TGT_FILE);
  let { rows } = await tgt.query('SELECT * FROM data_items');
  assert(rows.length === 1, 'First copy: 1 row');
  assert(rows[0].data.v === 1, 'First copy: v=1');
  await tgt.end();

  // Modify source: add another row
  const src2 = new SqliteAdapter({ type: 'sqlite', filename: SRC_FILE });
  await src2.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [2, TEST_APP, 'page', JSON.stringify({ v: 2 })]
  );
  await src2.end();

  // Re-copy with --clear-target
  runCopy('--clear-target');

  // Verify re-copy
  tgt = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  ({ rows } = await tgt.query('SELECT * FROM data_items ORDER BY id'));
  assert(rows.length === 2, `Clear + re-copy: 2 rows (got ${rows.length})`);
  assert(rows[0].data.v === 1, 'Row 1 preserved');
  assert(rows[1].data.v === 2, 'Row 2 added');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: Error on non-empty target
// ---------------------------------------------------------------------------

async function testNonEmptyTargetError() {
  console.log('\n--- Error on non-empty target ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'page', JSON.stringify({})]
  );
  await src.end();

  // First copy succeeds
  runCopy();

  // Second copy without --clear-target should fail
  const error = runCopyExpectError();
  assert(error !== null, 'Error thrown for non-empty target');
  assert(error.includes('existing data') || error.includes('clear-target'),
    'Error message mentions existing data or --clear-target');
}

// ---------------------------------------------------------------------------
// Test: Split tables
// ---------------------------------------------------------------------------

async function testSplitTables() {
  console.log('\n--- Split table copy ---');
  resetDbs();

  const src = await openDb(SRC_FILE);

  // Create a split table manually
  const splitType = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-42';
  const splitTable = 'data_items__a1b2c3d4_e5f6_7890_abcd_ef1234567890_42';

  await src.query(`
    CREATE TABLE IF NOT EXISTS ${splitTable} (
      id INTEGER PRIMARY KEY,
      app TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by INTEGER
    )
  `);

  // Insert rows into split table
  for (let i = 1; i <= 3; i++) {
    await src.query(
      `INSERT INTO ${splitTable} (id, app, type, data) VALUES ($1, $2, $3, $4)`,
      [5000 + i, TEST_APP, splitType, JSON.stringify({ row: i })]
    );
  }

  // Also add some regular data_items
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [1, TEST_APP, 'page', JSON.stringify({ title: 'Page' })]
  );
  await src.end();

  // Run copy
  const output = runCopy();
  assert(output.includes('split tables'), 'Output mentions split tables');

  // Verify target
  const tgt = await openDb(TGT_FILE);

  // Check regular data_items
  const { rows: dataRows } = await tgt.query('SELECT * FROM data_items');
  assert(dataRows.length === 1, 'data_items: 1 row');

  // Check split table exists and has data
  const exists = await tgt.tableExists('main', splitTable);
  assert(exists, `Split table ${splitTable} created in target`);

  const { rows: splitRows } = await tgt.query(`SELECT * FROM ${splitTable} ORDER BY id`);
  assert(splitRows.length === 3, `Split table: 3 rows (got ${splitRows.length})`);
  assert(splitRows[0].id === 5001, 'Split table: ID 5001 preserved');
  assert(splitRows[2].id === 5003, 'Split table: ID 5003 preserved');
  assert(splitRows[1].data.row === 2, 'Split table: JSON data preserved');
  assert(splitRows[0].type === splitType, 'Split table: type preserved');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: Batch processing (>1000 rows)
// ---------------------------------------------------------------------------

async function testBatchProcessing() {
  console.log('\n--- Batch processing (1500 rows) ---');
  resetDbs();

  const src = await openDb(SRC_FILE);

  // Insert 1500 rows (exceeds BATCH_SIZE of 1000)
  await src.query('BEGIN');
  for (let i = 1; i <= 1500; i++) {
    await src.query(
      `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
      [i, TEST_APP, 'row', JSON.stringify({ n: i })]
    );
  }
  await src.query('COMMIT');
  await src.end();

  // Run copy
  runCopy();

  // Verify all rows copied
  const tgt = await openDb(TGT_FILE);
  const { rows } = await tgt.query('SELECT COUNT(*) AS count FROM data_items');
  assert(Number(rows[0].count) === 1500, `All 1500 rows copied (got ${rows[0].count})`);

  // Verify first and last
  const { rows: first } = await tgt.query('SELECT * FROM data_items WHERE id = 1');
  assert(first.length === 1 && first[0].data.n === 1, 'First row correct');

  const { rows: last } = await tgt.query('SELECT * FROM data_items WHERE id = 1500');
  assert(last.length === 1 && last[0].data.n === 1500, 'Last row correct');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: Sequence reset
// ---------------------------------------------------------------------------

async function testSequenceReset() {
  console.log('\n--- Sequence reset ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  // Insert with a high ID
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [9999, TEST_APP, 'page', JSON.stringify({})]
  );
  await src.end();

  runCopy();

  // Verify dms_id_seq was updated
  const tgt = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  const { rows } = await tgt.query('SELECT MAX(id) AS max_id FROM dms_id_seq');
  assert(Number(rows[0].max_id) >= 9999, `dms_id_seq set to >= 9999 (got ${rows[0].max_id})`);
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Test: --skip-orphans
// ---------------------------------------------------------------------------

async function testSkipOrphans() {
  console.log('\n--- --skip-orphans ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  const APP = TEST_APP;

  // Create a complete hierarchy: site -> pattern -> page -> sections
  const sec1Id = 1;
  const sec2Id = 2;
  const orphanSecId = 3;
  const pageId = 4;
  const patternId = 5;
  const orphanPatternId = 6;
  const siteId = 7;

  // Sections (2 referenced, 1 orphaned)
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [sec1Id, APP, 'docs|cms-section', JSON.stringify({ text: 'Section 1' })]
  );
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [sec2Id, APP, 'docs|cms-section', JSON.stringify({ text: 'Section 2' })]
  );
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [orphanSecId, APP, 'docs|cms-section', JSON.stringify({ text: 'Orphan Section' })]
  );

  // Page referencing sec1 and sec2 (not orphanSec)
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [pageId, APP, 'docs', JSON.stringify({ title: 'Page', sections: [{ id: sec1Id }, { id: sec2Id }] })]
  );

  // Pattern (referenced by site)
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [patternId, APP, 'mysite|pattern', JSON.stringify({ pattern_type: 'page', doc_type: 'docs', name: 'Page Pattern' })]
  );

  // Orphaned pattern (NOT referenced by site)
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [orphanPatternId, APP, 'mysite|pattern', JSON.stringify({ pattern_type: 'page', doc_type: 'old-docs', name: 'Old Pattern' })]
  );

  // Site referencing only the good pattern
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [siteId, APP, 'mysite', JSON.stringify({ name: 'Site', patterns: [{ id: patternId }] })]
  );

  await src.end();

  // Copy WITH --skip-orphans
  const output = runCopy('--skip-orphans');
  assert(output.includes('orphan'), 'Output mentions orphans');
  assert(output.includes('All counts match'), 'Verification passed with orphan adjustment');

  // Verify target
  const tgt = await openDb(TGT_FILE);
  const { rows: allRows } = await tgt.query('SELECT * FROM data_items ORDER BY id');

  // Should have 5 rows (7 source minus 2 orphans: orphanSec + orphanPattern)
  assert(allRows.length === 5, `5 non-orphan rows copied (got ${allRows.length})`);

  // Verify the orphaned rows are NOT in target
  const ids = allRows.map(r => r.id);
  assert(!ids.includes(orphanSecId), 'Orphaned section excluded');
  assert(!ids.includes(orphanPatternId), 'Orphaned pattern excluded');

  // Verify the good rows ARE in target
  assert(ids.includes(sec1Id), 'Referenced section 1 included');
  assert(ids.includes(sec2Id), 'Referenced section 2 included');
  assert(ids.includes(pageId), 'Page included');
  assert(ids.includes(patternId), 'Referenced pattern included');
  assert(ids.includes(siteId), 'Site included');

  await tgt.end();
}

async function testSkipOrphansWithoutOrphans() {
  console.log('\n--- --skip-orphans with no orphans ---');
  resetDbs();

  const src = await openDb(SRC_FILE);
  const APP = TEST_APP;

  // Healthy hierarchy — site -> pattern -> page (no orphans)
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [1, APP, 'docs', JSON.stringify({ title: 'Page 1', sections: [] })]
  );
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [2, APP, 'mysite|pattern', JSON.stringify({ pattern_type: 'page', doc_type: 'docs' })]
  );
  await src.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [3, APP, 'mysite', JSON.stringify({ name: 'Site', patterns: [{ id: 2 }] })]
  );
  await src.end();

  const output = runCopy('--skip-orphans');
  assert(output.includes('0 orphaned rows'), 'Reports zero orphans');
  assert(output.includes('All counts match'), 'Verification passed');

  const tgt = await openDb(TGT_FILE);
  const { rows } = await tgt.query('SELECT COUNT(*) AS count FROM data_items');
  assert(Number(rows[0].count) === 3, 'All rows copied when no orphans');
  await tgt.end();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('DMS Database Copy — Integration Tests');
  console.log(`Test app: ${TEST_APP}`);

  const tests = [
    testBasicCopy,
    testDataIntegrity,
    testDryRun,
    testAppFilter,
    testClearTarget,
    testNonEmptyTargetError,
    testSplitTables,
    testBatchProcessing,
    testSequenceReset,
    testSkipOrphans,
    testSkipOrphansWithoutOrphans,
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  // Cleanup
  resetDbs();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
