/**
 * DMS Dead Row Cleanup — Integration Tests
 *
 * Tests the cleanup-db.js script with a real SQLite database.
 * Seeds parent+child data, deletes parents, runs analysis/cleanup,
 * and verifies orphan detection and deletion.
 */

const { execFileSync } = require('child_process');
const { existsSync, unlinkSync, readFileSync } = require('fs');
const { join } = require('path');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'src/scripts/cleanup-db.js');
const DATA_DIR = join(ROOT, 'src/db/data');
const DMS_SQL = join(ROOT, 'src/db/sql/dms/dms.sqlite.sql');

const CONFIG = 'cleanup-test';
const DB_FILE = join(DATA_DIR, 'cleanup-test.sqlite');

const APP = `cleanup-test-${Date.now()}`;
const APP2 = `cleanup-other-${Date.now()}`;

let passed = 0;
let failed = 0;
let nextId = 1;

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

function resetDb() {
  cleanupFile(DB_FILE);
  nextId = 1;
}

async function openDb() {
  const db = new SqliteAdapter({ type: 'sqlite', filename: DB_FILE });
  const sql = readFileSync(DMS_SQL, 'utf8');
  for (const stmt of sql.split(';').filter(s => s.trim())) {
    await db.query(stmt + ';');
  }
  return db;
}

function id() { return nextId++; }

function runCleanup(...extraArgs) {
  const args = ['--source', CONFIG, ...extraArgs];
  return execFileSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

/**
 * Insert a DMS row and return its ID.
 */
async function insert(db, app, type, data) {
  const rowId = id();
  await db.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [rowId, app, type, JSON.stringify(data)]
  );
  return rowId;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Create a complete site hierarchy:
 *   site -> pattern (page) -> page -> sections
 *   site -> pattern (datasets) -> source -> views
 */
async function seedFullHierarchy(db, app) {
  const siteType = 'test-site';
  const docType = 'test-page';
  const dsDocType = 'test-ds';

  // Sections
  const sec1 = await insert(db, app, `${docType}|cms-section`, { text: 'Section 1' });
  const sec2 = await insert(db, app, `${docType}|cms-section`, { text: 'Section 2' });
  const draftSec = await insert(db, app, `${docType}|cms-section`, { text: 'Draft Section' });

  // Page referencing sections
  const page1 = await insert(db, app, docType, {
    title: 'Page 1',
    sections: [{ id: sec1 }, { id: sec2 }],
    draft_sections: [{ id: draftSec }]
  });

  // Views
  const view1 = await insert(db, app, `${dsDocType}|source|view`, { name: 'View 1' });
  const view2 = await insert(db, app, `${dsDocType}|source|view`, { name: 'View 2' });

  // Source referencing views
  const source1 = await insert(db, app, `${dsDocType}|source`, {
    name: 'Source 1',
    views: [{ id: view1 }, { id: view2 }]
  });

  // Page pattern
  const pagePattern = await insert(db, app, `${siteType}|pattern`, {
    pattern_type: 'page',
    doc_type: docType,
    name: 'Page Pattern'
  });

  // Datasets pattern
  const dsPattern = await insert(db, app, `${siteType}|pattern`, {
    pattern_type: 'datasets',
    doc_type: dsDocType,
    name: 'DS Pattern'
  });

  // Site referencing patterns
  const site = await insert(db, app, siteType, {
    name: 'Test Site',
    patterns: [{ id: pagePattern }, { id: dsPattern }]
  });

  return {
    site, siteType, docType, dsDocType,
    pagePattern, dsPattern,
    page1, sec1, sec2, draftSec,
    source1, view1, view2
  };
}

// ---------------------------------------------------------------------------
// Test: No orphans in healthy hierarchy
// ---------------------------------------------------------------------------

async function testNoOrphans() {
  console.log('\n--- No orphans in complete hierarchy ---');
  resetDb();
  const db = await openDb();
  await seedFullHierarchy(db, APP);
  await db.end();

  const output = runCleanup('--app', APP);
  assert(output.includes('No orphaned rows found'), 'No orphans detected in healthy hierarchy');
}

// ---------------------------------------------------------------------------
// Test: Orphaned sections (page deleted)
// ---------------------------------------------------------------------------

async function testOrphanedSections() {
  console.log('\n--- Orphaned sections (page deleted) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Delete the page — sections become orphaned
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.page1]);
  await db.end();

  const output = runCleanup('--app', APP);
  assert(output.includes('Orphaned sections'), 'Detected orphaned sections');
  assert(output.includes('3 sections'), 'Found all 3 orphaned sections (2 published + 1 draft)');
}

// ---------------------------------------------------------------------------
// Test: Orphaned patterns (site's patterns array edited)
// ---------------------------------------------------------------------------

async function testOrphanedPatterns() {
  console.log('\n--- Orphaned patterns (site pattern ref removed) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Remove the page pattern from the site's patterns array (keep only ds pattern)
  await db.query(
    `UPDATE data_items SET data = $1 WHERE id = $2`,
    [JSON.stringify({ name: 'Test Site', patterns: [{ id: h.dsPattern }] }), h.site]
  );
  await db.end();

  const output = runCleanup('--app', APP, '--type', 'patterns');
  assert(output.includes('Orphaned patterns'), 'Detected orphaned pattern');
  assert(output.includes('1 patterns'), 'Found 1 orphaned pattern');
}

// ---------------------------------------------------------------------------
// Test: Orphaned views (source deleted)
// ---------------------------------------------------------------------------

async function testOrphanedViews() {
  console.log('\n--- Orphaned views (source deleted) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Delete the source — views become orphaned
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.source1]);
  await db.end();

  const output = runCleanup('--app', APP, '--type', 'views');
  assert(output.includes('Orphaned views'), 'Detected orphaned views');
  assert(output.includes('2 views'), 'Found 2 orphaned views');
}

// ---------------------------------------------------------------------------
// Test: Orphaned sources (datasets pattern deleted)
// ---------------------------------------------------------------------------

async function testOrphanedSources() {
  console.log('\n--- Orphaned sources (datasets pattern deleted) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Remove the datasets pattern from site and delete it
  await db.query(
    `UPDATE data_items SET data = $1 WHERE id = $2`,
    [JSON.stringify({ name: 'Test Site', patterns: [{ id: h.pagePattern }] }), h.site]
  );
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.dsPattern]);
  await db.end();

  const output = runCleanup('--app', APP, '--type', 'sources');
  assert(output.includes('Orphaned sources'), 'Detected orphaned sources');
  assert(output.includes('1 sources'), 'Found 1 orphaned source');
}

// ---------------------------------------------------------------------------
// Test: Orphaned pages (page pattern deleted)
// ---------------------------------------------------------------------------

async function testOrphanedPages() {
  console.log('\n--- Orphaned pages (page pattern deleted) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Remove the page pattern from site and delete it
  await db.query(
    `UPDATE data_items SET data = $1 WHERE id = $2`,
    [JSON.stringify({ name: 'Test Site', patterns: [{ id: h.dsPattern }] }), h.site]
  );
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.pagePattern]);
  await db.end();

  const output = runCleanup('--app', APP, '--type', 'pages');
  assert(output.includes('Orphaned pages'), 'Detected orphaned pages');
  assert(output.includes('1 pages'), 'Found 1 orphaned page');
}

// ---------------------------------------------------------------------------
// Test: --app filter
// ---------------------------------------------------------------------------

async function testAppFilter() {
  console.log('\n--- --app filter ---');
  resetDb();
  const db = await openDb();

  // App 1: healthy
  await seedFullHierarchy(db, APP);

  // App 2: has orphaned sections
  const sec = await insert(db, APP2, 'other-page|cms-section', { text: 'Orphan' });
  // (no page exists for other-page type in APP2)

  await db.end();

  // Check APP only — should find nothing
  const output1 = runCleanup('--app', APP);
  assert(output1.includes('No orphaned rows found'), 'No orphans in filtered app');

  // Check APP2 — should find the orphaned section
  const output2 = runCleanup('--app', APP2);
  assert(output2.includes('Orphaned sections'), 'Found orphans in other app');
}

// ---------------------------------------------------------------------------
// Test: --type filter
// ---------------------------------------------------------------------------

async function testTypeFilter() {
  console.log('\n--- --type filter ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Delete page (orphans sections) and source (orphans views)
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.page1]);
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.source1]);
  await db.end();

  // Only check sections
  const output1 = runCleanup('--app', APP, '--type', 'sections');
  assert(output1.includes('Orphaned sections'), 'Sections detected with --type sections');
  assert(!output1.includes('Orphaned views'), 'Views NOT checked with --type sections');

  // Only check views
  const output2 = runCleanup('--app', APP, '--type', 'views');
  assert(output2.includes('Orphaned views'), 'Views detected with --type views');
  assert(!output2.includes('Orphaned sections'), 'Sections NOT checked with --type views');
}

// ---------------------------------------------------------------------------
// Test: --delete removes orphaned rows
// ---------------------------------------------------------------------------

async function testDeleteMode() {
  console.log('\n--- --delete mode ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Delete page — orphans 3 sections
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.page1]);
  await db.end();

  // Run with --delete
  const output = runCleanup('--app', APP, '--type', 'sections', '--delete');
  assert(output.includes('Deleting 3 orphaned sections'), 'Delete output shows count');
  assert(output.includes('Deleted 3 rows total'), 'Delete summary correct');

  // Verify sections are gone
  const db2 = new SqliteAdapter({ type: 'sqlite', filename: DB_FILE });
  const { rows } = await db2.query(
    `SELECT * FROM data_items WHERE app = $1 AND type LIKE '%|cms-section'`,
    [APP]
  );
  assert(rows.length === 0, 'All orphaned sections deleted from database');
  await db2.end();
}

// ---------------------------------------------------------------------------
// Test: Delete does not remove non-orphaned rows
// ---------------------------------------------------------------------------

async function testDeleteSafety() {
  console.log('\n--- Delete safety (non-orphans preserved) ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Add extra orphaned section (not referenced by any page)
  const orphanSec = await insert(db, APP, `${h.docType}|cms-section`, { text: 'Orphan' });
  await db.end();

  // Run with --delete for sections
  runCleanup('--app', APP, '--type', 'sections', '--delete');

  // Verify: the 3 healthy sections still exist, only orphan deleted
  const db2 = new SqliteAdapter({ type: 'sqlite', filename: DB_FILE });
  const { rows } = await db2.query(
    `SELECT id FROM data_items WHERE app = $1 AND type LIKE '%|cms-section' ORDER BY id`,
    [APP]
  );
  assert(rows.length === 3, `3 healthy sections preserved (got ${rows.length})`);
  assert(rows.some(r => r.id === h.sec1), 'Section 1 preserved');
  assert(rows.some(r => r.id === h.sec2), 'Section 2 preserved');
  assert(rows.some(r => r.id === h.draftSec), 'Draft section preserved');

  // Orphan should be gone
  const { rows: orphans } = await db2.query(
    `SELECT id FROM data_items WHERE id = $1`, [orphanSec]
  );
  assert(orphans.length === 0, 'Orphaned section was deleted');
  await db2.end();
}

// ---------------------------------------------------------------------------
// Test: draft_sections NOT flagged as orphans
// ---------------------------------------------------------------------------

async function testDraftSectionsNotFlagged() {
  console.log('\n--- Draft sections not flagged ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);
  await db.end();

  // The hierarchy has sections in both sections[] and draft_sections[]
  // None should be flagged
  const output = runCleanup('--app', APP, '--type', 'sections');
  assert(output.includes('No orphaned rows found'), 'Draft sections correctly recognized as referenced');
}

// ---------------------------------------------------------------------------
// Test: Dataset data rows (UUID-viewId) not flagged
// ---------------------------------------------------------------------------

async function testDatasetRowsIgnored() {
  console.log('\n--- Dataset data rows ignored ---');
  resetDb();
  const db = await openDb();

  // Create a site with no page pattern — any plain-type rows would be orphaned pages
  const siteId = await insert(db, APP, 'my-site', {
    name: 'Site',
    patterns: []
  });

  // Insert a dataset data row — UUID-viewId type (should NOT be flagged as orphaned page)
  await insert(db, APP, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-42', { value: 123 });

  await db.end();

  const output = runCleanup('--app', APP, '--type', 'pages');
  assert(!output.includes('Orphaned pages') || !output.includes('a1b2c3d4'), 'Dataset data rows not flagged as orphaned pages');
}

// ---------------------------------------------------------------------------
// Test: Multiple apps grouped in output
// ---------------------------------------------------------------------------

async function testMultipleAppsGrouped() {
  console.log('\n--- Multiple apps grouped ---');
  resetDb();
  const db = await openDb();

  // App 1: orphaned section
  const sec1 = await insert(db, APP, 'page1|cms-section', { text: 'Orphan 1' });

  // App 2: orphaned section
  const sec2 = await insert(db, APP2, 'page2|cms-section', { text: 'Orphan 2' });

  await db.end();

  const output = runCleanup('--type', 'sections');
  assert(output.includes(`App: ${APP}`), 'App 1 shown in output');
  assert(output.includes(`App: ${APP2}`), 'App 2 shown in output');
  assert(output.includes('Total orphaned rows: 2'), 'Total counts both apps');
}

// ---------------------------------------------------------------------------
// Test: Delete with multiple orphan types
// ---------------------------------------------------------------------------

async function testDeleteMultipleTypes() {
  console.log('\n--- Delete multiple orphan types ---');
  resetDb();
  const db = await openDb();
  const h = await seedFullHierarchy(db, APP);

  // Delete page (orphans sections) and source (orphans views)
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.page1]);
  await db.query(`DELETE FROM data_items WHERE id = $1`, [h.source1]);
  await db.end();

  const output = runCleanup('--app', APP, '--delete');
  assert(output.includes('Deleting 3 orphaned sections'), 'Sections deleted');
  assert(output.includes('Deleting 2 orphaned views'), 'Views deleted');
  assert(output.includes('Deleted 5 rows total'), 'Total count correct');
}

// ---------------------------------------------------------------------------
// Test: extractRefIds handles different formats
// ---------------------------------------------------------------------------

function testExtractRefIds() {
  console.log('\n--- extractRefIds format handling ---');
  const { extractRefIds } = require('../src/scripts/cleanup-db');

  // Standard {id: N} format
  assert(
    JSON.stringify(extractRefIds({ items: [{ id: 1 }, { id: 2 }] }, 'items')) === '[1,2]',
    'Handles {id: N} objects'
  );

  // Plain numbers
  assert(
    JSON.stringify(extractRefIds({ items: [10, 20] }, 'items')) === '[10,20]',
    'Handles plain numbers'
  );

  // String numbers
  assert(
    JSON.stringify(extractRefIds({ items: ['5', '10'] }, 'items')) === '[5,10]',
    'Handles string numbers'
  );

  // Falcor refs
  assert(
    JSON.stringify(extractRefIds({ items: [{ $type: 'ref', value: ['dms', 'data', 'byId', 42] }] }, 'items')) === '[42]',
    'Handles Falcor refs'
  );

  // Missing field
  assert(
    JSON.stringify(extractRefIds({ other: [] }, 'items')) === '[]',
    'Returns empty for missing field'
  );

  // Null data
  assert(
    JSON.stringify(extractRefIds(null, 'items')) === '[]',
    'Returns empty for null data'
  );

  // Mixed with nulls
  assert(
    extractRefIds({ items: [{ id: 1 }, null, { id: 3 }] }, 'items').length === 2,
    'Skips null entries in array'
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('DMS Dead Row Cleanup — Integration Tests');
  console.log(`Test app: ${APP}`);

  const tests = [
    testExtractRefIds,
    testNoOrphans,
    testOrphanedSections,
    testOrphanedPatterns,
    testOrphanedViews,
    testOrphanedSources,
    testOrphanedPages,
    testAppFilter,
    testTypeFilter,
    testDeleteMode,
    testDeleteSafety,
    testDraftSectionsNotFlagged,
    testDatasetRowsIgnored,
    testMultipleAppsGrouped,
    testDeleteMultipleTypes,
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  // Cleanup
  cleanupFile(DB_FILE);

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
