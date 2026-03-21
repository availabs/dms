/**
 * Site Migration Script — Integration Tests
 *
 * Creates a source SQLite database with legacy-format data, runs the
 * migrate-site.js script, then verifies the target database has correctly
 * converted types, refs, split tables, and dmsEnvs.
 */

const { execFileSync } = require('child_process');
const { existsSync, unlinkSync, readFileSync } = require('fs');
const { join } = require('path');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'src/scripts/migrate-site.js');
const DATA_DIR = join(ROOT, 'src/db/data');
const DMS_SQL = join(ROOT, 'src/db/sql/dms/dms.sqlite.sql');

const SRC_CONFIG = 'migrate-test-src';
const TGT_CONFIG = 'migrate-test-tgt';
const SRC_FILE = join(DATA_DIR, 'migrate-test-src.sqlite');
const TGT_FILE = join(DATA_DIR, 'migrate-test-tgt.sqlite');

const APP = 'migrate-test';
const SITE_TYPE = 'prod';

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

function assertEq(actual, expected, message) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

async function openDb(file) {
  const db = new SqliteAdapter({ type: 'sqlite', filename: file });
  const sql = readFileSync(DMS_SQL, 'utf8');
  for (const stmt of sql.split(';').filter(s => s.trim())) {
    await db.query(stmt + ';');
  }
  return db;
}

function runMigrate(...extraArgs) {
  const args = ['--source', SRC_CONFIG, '--target', TGT_CONFIG, '--app', APP, '--type', SITE_TYPE, ...extraArgs];
  return execFileSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

async function insert(db, id, app, type, data) {
  await db.query(
    `INSERT INTO data_items (id, app, type, data) VALUES ($1, $2, $3, $4)`,
    [id, app, type, JSON.stringify(data)]
  );
}

async function getRow(db, table, id) {
  const rows = await db.promise(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const row = rows[0];
  row._data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return row;
}

async function getRowsByType(db, table, type) {
  const rows = await db.promise(`SELECT * FROM ${table} WHERE type = $1`, [type]);
  for (const row of rows) {
    row._data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  }
  return rows;
}

async function getAllRows(db, table) {
  const rows = await db.promise(`SELECT * FROM ${table}`);
  for (const row of rows) {
    row._data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  }
  return rows;
}

async function tableExists(db, table) {
  const rows = await db.promise(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = $1`, [table]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seedLegacyDatabase(db) {
  // Theme
  await insert(db, 100, APP, 'theme', { name: 'My Theme', theme_id: 'my-theme', theme: { color: 'blue' } });

  // dmsEnv
  await insert(db, 200, APP, 'dmsEnv', { name: 'Main Env', sources: [] });

  // Pattern 1: page pattern
  await insert(db, 10, APP, `${SITE_TYPE}|pattern`, {
    name: 'Docs',
    doc_type: 'docs-page',
    pattern_type: 'page',
    base_url: '/docs',
  });

  // Pattern 2: datasets pattern (with dmsEnvId)
  await insert(db, 11, APP, `${SITE_TYPE}|pattern`, {
    name: 'My Datasets',
    doc_type: 'my_datasets',
    pattern_type: 'datasets',
    base_url: '/datasets',
    dmsEnvId: 200,
  });

  // Pattern 3: auth pattern (no children)
  await insert(db, 12, APP, `${SITE_TYPE}|pattern`, {
    name: 'Auth',
    pattern_type: 'auth',
    base_url: '/auth',
  });

  // Site record
  await insert(db, 1, APP, SITE_TYPE, {
    site_name: 'Test Site',
    patterns: [
      { ref: `${APP}+${SITE_TYPE}|pattern`, id: 10 },
      { ref: `${APP}+${SITE_TYPE}|pattern`, id: 11 },
      { ref: `${APP}+${SITE_TYPE}|pattern`, id: 12 },
    ],
    theme_refs: [
      { ref: `${APP}+theme`, id: 100 },
    ],
    dms_envs: [
      { ref: `${APP}+dmsEnv`, id: 200 },
    ],
    themes: { default: {} },
  });

  // --- Page pattern children ---

  // Page-edit (history) rows
  await insert(db, 50, APP, 'docs-page|page-edit', {
    entries: [
      { action: 'created Page.', user: 'admin@test.com', time: '2025-01-01' },
      { action: 'published changes.', user: 'admin@test.com', time: '2025-01-02' },
    ]
  });
  await insert(db, 51, APP, 'docs-page|page-edit', {
    entries: [
      { action: 'created Page.', user: 'admin@test.com', time: '2025-01-03' },
    ]
  });

  // Pages
  await insert(db, 20, APP, 'docs-page', {
    title: 'Home Page',
    url_slug: 'home',
    index: 0,
    parent: '',
    published: '',
    sections: [
      { ref: `${APP}+docs-page|cms-section`, id: 30 },
      { ref: `${APP}+docs-page|cms-section`, id: 31 },
    ],
    draft_sections: [
      { ref: `${APP}+docs-page|cms-section`, id: 30 },
      { ref: `${APP}+docs-page|cms-section`, id: 31 },
      { ref: `${APP}+docs-page|cms-section`, id: 32 },
    ],
    history: { ref: `${APP}+docs-page|page-edit`, id: 50 },
  });

  await insert(db, 21, APP, 'docs-page', {
    title: 'About Page',
    url_slug: 'about',
    index: 1,
    parent: '',
    published: 'draft',
    sections: [
      { ref: `${APP}+docs-page|cms-section`, id: 33 },
    ],
    draft_sections: [],
    // Legacy: array of refs for history
    history: [
      { ref: `${APP}+docs-page|page-edit`, id: 51 },
    ],
  });

  // Sections (components) — 30, 31, 32 referenced; 34 orphaned
  await insert(db, 30, APP, 'docs-page|cms-section', {
    title: 'Header Section',
    element: { 'element-type': 'textBlock' },
  });
  await insert(db, 31, APP, 'docs-page|cms-section', {
    title: 'Content Section',
    element: { 'element-type': 'textBlock' },
  });
  await insert(db, 32, APP, 'docs-page|cms-section', {
    title: 'Draft Footer',
    element: { 'element-type': 'textBlock' },
  });
  await insert(db, 33, APP, 'docs-page|cms-section', {
    title: 'About Content',
    element: { 'element-type': 'textBlock' },
  });
  await insert(db, 34, APP, 'docs-page|cms-section', {
    title: 'Orphaned Section',
    element: { 'element-type': 'textBlock' },
  });

  // --- Dataset pattern children ---

  // Source
  await insert(db, 40, APP, 'my_datasets|source', {
    name: 'Traffic Counts',
    doc_type: 'traffic_counts',
    config: JSON.stringify({ attributes: [{ name: 'count', type: 'number' }] }),
  });

  // View
  await insert(db, 41, APP, 'my_datasets|source|view', {
    name: 'Version 1',
  });

  // Data rows (valid)
  await insert(db, 1000, APP, 'traffic_counts-41', { count: 100, isValid: true });
  await insert(db, 1001, APP, 'traffic_counts-41', { count: 200, isValid: true });
  await insert(db, 1002, APP, 'traffic_counts-41', { count: 300, isValid: true });

  // Data rows (invalid)
  await insert(db, 1003, APP, 'traffic_counts-41-invalid-entry', { count: -1 });

  // Update dmsEnv to reference the source
  await db.query(
    `UPDATE data_items SET data = $1 WHERE id = $2`,
    [JSON.stringify({ name: 'Main Env', sources: [{ ref: `${APP}+my_datasets|source`, id: 40 }] }), 200]
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testDryRun() {
  console.log('\n--- Dry Run ---');
  const output = runMigrate();
  assert(output.includes('DRY RUN'), 'Output should indicate dry run');
  assert(output.includes('prod → prod:site'), 'Should show site type conversion');
  assert(output.includes('Docs (page)'), 'Should show page pattern');
  assert(output.includes('My Datasets (datasets)'), 'Should show datasets pattern');

  // Target should be empty
  const tgtDb = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const exists = await tableExists(tgtDb, 'data_items');
    assert(!exists, 'Target should not have data_items table after dry run');
  } finally {
    await tgtDb.end();
  }
}

async function testSiteConversion() {
  console.log('\n--- Site Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const site = await getRow(db, 'data_items', 1);
    assert(site !== null, 'Site row should exist in target');
    assertEq(site.type, 'prod:site', 'Site type should be prod:site');
    assertEq(site.app, APP, 'Site app should match');
    assert(Array.isArray(site._data.patterns), 'Site should have patterns array');
    assert(site._data.patterns.length === 3, 'Site should have 3 patterns');
    assert(site._data.patterns[0].ref.includes('|pattern'), 'Pattern ref should use new format');
  } finally {
    await db.end();
  }
}

async function testThemeConversion() {
  console.log('\n--- Theme Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const theme = await getRow(db, 'data_items', 100);
    assert(theme !== null, 'Theme row should exist');
    assertEq(theme.type, 'my_theme:theme', 'Theme type should use slug:theme format');
    assertEq(theme._data.name, 'My Theme', 'Theme data should be preserved');
  } finally {
    await db.end();
  }
}

async function testDmsEnvConversion() {
  console.log('\n--- dmsEnv Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const env = await getRow(db, 'data_items', 200);
    assert(env !== null, 'dmsEnv row should exist');
    assertEq(env.type, 'prod|main_env:dmsenv', 'dmsEnv type should be siteInstance|slug:dmsenv');
    assertEq(env._data.name, 'Main Env', 'dmsEnv name should be preserved');
    assert(Array.isArray(env._data.sources), 'dmsEnv should have sources array');
  } finally {
    await db.end();
  }
}

async function testPagePatternConversion() {
  console.log('\n--- Page Pattern Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Pattern row
    const pattern = await getRow(db, 'data_items', 10);
    assert(pattern !== null, 'Page pattern should exist');
    assertEq(pattern.type, 'prod|docs:pattern', 'Pattern type should be siteInstance|slug:pattern');
    assert(!pattern._data.doc_type, 'doc_type should be removed from pattern data');
    assertEq(pattern._data.name, 'Docs', 'Pattern name should be preserved');

    // Pages
    const home = await getRow(db, 'data_items', 20);
    assert(home !== null, 'Home page should exist');
    assertEq(home.type, 'docs|page', 'Page type should be patternSlug|page');
    assertEq(home._data.title, 'Home Page', 'Page data should be preserved');

    // Section refs should be updated
    assert(Array.isArray(home._data.sections), 'Page should have sections array');
    assertEq(home._data.sections[0].ref, `${APP}+docs|component`, 'Section ref should use new format');

    // Draft section refs
    assert(Array.isArray(home._data.draft_sections), 'Page should have draft_sections');
    assertEq(home._data.draft_sections[0].ref, `${APP}+docs|component`, 'Draft section ref should use new format');

    const about = await getRow(db, 'data_items', 21);
    assert(about !== null, 'About page should exist');
    assertEq(about.type, 'docs|page', 'About page type should match');
  } finally {
    await db.end();
  }
}

async function testComponentConversion() {
  console.log('\n--- Component Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Referenced sections should be migrated
    const s30 = await getRow(db, 'data_items', 30);
    assert(s30 !== null, 'Referenced section 30 should exist');
    assertEq(s30.type, 'docs|component', 'Section type should be patternSlug|component');

    const s31 = await getRow(db, 'data_items', 31);
    assert(s31 !== null, 'Referenced section 31 should exist');

    const s32 = await getRow(db, 'data_items', 32);
    assert(s32 !== null, 'Referenced section 32 should exist (draft ref)');

    const s33 = await getRow(db, 'data_items', 33);
    assert(s33 !== null, 'Referenced section 33 should exist');

    // Orphaned section should NOT be migrated
    const s34 = await getRow(db, 'data_items', 34);
    assert(s34 === null, 'Orphaned section 34 should NOT exist in target');
  } finally {
    await db.end();
  }
}

async function testHistoryConsolidation() {
  console.log('\n--- History Consolidation ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Page-edit row for home page (single ref)
    const pe50 = await getRow(db, 'data_items', 50);
    assert(pe50 !== null, 'Page-edit 50 should exist');
    assertEq(pe50.type, 'docs|page-edit', 'Page-edit type should be patternSlug|page-edit');
    assert(Array.isArray(pe50._data.entries), 'Page-edit should have entries array');
    assertEq(pe50._data.entries.length, 2, 'Page-edit 50 should have 2 entries');

    // Check home page history ref
    const home = await getRow(db, 'data_items', 20);
    assert(typeof home._data.history === 'object', 'Home history should be an object');
    assertEq(home._data.history.ref, `${APP}+docs|page-edit`, 'History ref should use new format');
    assertEq(home._data.history.id, 50, 'History ref ID should be preserved');

    // About page history (was array of refs — should be consolidated)
    const pe51 = await getRow(db, 'data_items', 51);
    assert(pe51 !== null, 'Page-edit 51 should exist');
    assertEq(pe51.type, 'docs|page-edit', 'Page-edit 51 type should match');

    const about = await getRow(db, 'data_items', 21);
    assert(typeof about._data.history === 'object', 'About history should be consolidated to single ref');
    assertEq(about._data.history.ref, `${APP}+docs|page-edit`, 'About history ref should use new format');
  } finally {
    await db.end();
  }
}

async function testDatasetConversion() {
  console.log('\n--- Dataset Pattern Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Pattern row
    const pattern = await getRow(db, 'data_items', 11);
    assert(pattern !== null, 'Dataset pattern should exist');
    assertEq(pattern.type, 'prod|my_datasets:pattern', 'Dataset pattern type');
    assert(!pattern._data.doc_type, 'doc_type should be removed');

    // Source
    const source = await getRow(db, 'data_items', 40);
    assert(source !== null, 'Source should exist');
    assertEq(source.type, 'main_env|traffic_counts:source', 'Source type should be dmsEnvSlug|sourceSlug:source');
    assert(!source._data.doc_type, 'doc_type should be removed from source');

    // View
    const view = await getRow(db, 'data_items', 41);
    assert(view !== null, 'View should exist');
    assertEq(view.type, 'traffic_counts|version_1:view', 'View type should be sourceSlug|viewSlug:view');

    // dmsEnv should reference the source
    const env = await getRow(db, 'data_items', 200);
    assert(env._data.sources.length > 0, 'dmsEnv should have sources');
    assertEq(env._data.sources[0].id, 40, 'dmsEnv source ref should point to source ID');
  } finally {
    await db.end();
  }
}

async function testDataRowSplitTables() {
  console.log('\n--- Data Row Split Tables ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Data rows should NOT be in main data_items
    const mainRows = await db.promise(
      `SELECT * FROM data_items WHERE type LIKE '%:data'`
    );
    assertEq(mainRows.length, 0, 'Data rows should not be in main data_items');

    // Find split table(s)
    const tables = await db.promise(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__%'`
    );
    assert(tables.length > 0, 'At least one split table should exist');

    // Find the data rows in any split table
    let totalDataRows = 0;
    for (const t of tables) {
      if (t.name.startsWith('seq__')) continue;
      const rows = await db.promise(`SELECT * FROM ${t.name} WHERE type LIKE '%:data'`);
      totalDataRows += rows.length;
    }
    assertEq(totalDataRows, 4, 'Should have 4 data rows total (3 valid + 1 invalid)');
  } finally {
    await db.end();
  }
}

async function testInvalidEntryConversion() {
  console.log('\n--- Invalid Entry Conversion ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Find data rows across split tables
    const tables = await db.promise(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_items__%'`
    );

    let invalidRow = null;
    for (const t of tables) {
      if (t.name.startsWith('seq__')) continue;
      const rows = await db.promise(`SELECT * FROM ${t.name}`);
      for (const row of rows) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        if (row.id === 1003) {
          invalidRow = { ...row, _data: data };
        }
      }
    }

    assert(invalidRow !== null, 'Invalid entry row 1003 should exist');
    assert(invalidRow.type.endsWith(':data'), 'Invalid entry should have :data type (not -invalid-entry)');
    assertEq(invalidRow._data.isValid, false, 'Invalid entry should have isValid=false');
  } finally {
    await db.end();
  }
}

async function testAuthPatternNoChildren() {
  console.log('\n--- Auth Pattern (No Children) ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const pattern = await getRow(db, 'data_items', 12);
    assert(pattern !== null, 'Auth pattern should exist');
    assertEq(pattern.type, 'prod|auth:pattern', 'Auth pattern type');
  } finally {
    await db.end();
  }
}

async function testIgnoreFlag() {
  console.log('\n--- Pattern Ignore Flag ---');
  resetDbs();

  // Re-seed and run with --ignore
  const srcDb = await openDb(SRC_FILE);
  try {
    await seedLegacyDatabase(srcDb);
  } finally {
    await srcDb.end();
  }

  const output = runMigrate('--apply', '--ignore', 'Docs');

  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    assert(output.includes('IGNORED'), 'Output should show ignored pattern');

    // Docs pattern should NOT exist
    const docs = await getRow(db, 'data_items', 10);
    assert(docs === null, 'Docs pattern should not exist when ignored');

    // Pages/sections for docs should not exist either
    const home = await getRow(db, 'data_items', 20);
    assert(home === null, 'Pages of ignored pattern should not exist');

    // Datasets pattern SHOULD exist
    const datasets = await getRow(db, 'data_items', 11);
    assert(datasets !== null, 'Non-ignored pattern should exist');

    // Site should only reference non-ignored patterns
    const site = await getRow(db, 'data_items', 1);
    assertEq(site._data.patterns.length, 2, 'Site should only have 2 pattern refs (Docs ignored)');
  } finally {
    await db.end();
  }
}

async function testNoDocTypeDatasetCreatesDmsEnv() {
  console.log('\n--- Datasets Pattern Without dmsEnvId Creates New dmsEnv ---');
  resetDbs();

  const srcDb = await openDb(SRC_FILE);
  try {
    // Minimal site with one dataset pattern that has no dmsEnvId
    await insert(srcDb, 1, APP, SITE_TYPE, {
      site_name: 'Minimal Site',
      patterns: [{ ref: `${APP}+${SITE_TYPE}|pattern`, id: 10 }],
      dms_envs: [],
    });
    await insert(srcDb, 10, APP, `${SITE_TYPE}|pattern`, {
      name: 'My Data',
      doc_type: 'my_data',
      pattern_type: 'datasets',
      base_url: '/data',
    });
    await insert(srcDb, 40, APP, 'my_data|source', {
      name: 'Source One',
      doc_type: 'source_one',
    });
  } finally {
    await srcDb.end();
  }

  runMigrate('--apply');

  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // A dmsEnv should have been auto-created
    const site = await getRow(db, 'data_items', 1);
    assert(site._data.dms_envs.length > 0, 'Site should have auto-created dmsEnv ref');

    // Find the auto-created dmsEnv
    const envRef = site._data.dms_envs[0];
    const envRows = await getRowsByType(db, 'data_items', 'prod|my_data_env:dmsenv');
    assert(envRows.length > 0, 'Auto-created dmsEnv should exist with pattern_env name');
    assert(envRows[0]._data.sources.length > 0, 'Auto-created dmsEnv should reference the source');
  } finally {
    await db.end();
  }
}

async function testIdPreservation() {
  console.log('\n--- ID Preservation ---');
  // IDs are already tested implicitly. Just verify a few explicitly.
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    // Check that the auto-created dmsEnv got a real positive ID
    const site = await getRow(db, 'data_items', 1);
    for (const ref of (site._data.dms_envs || [])) {
      assert(ref.id > 0, `dmsEnv ref ID should be positive, got ${ref.id}`);
    }
  } finally {
    await db.end();
  }
}

async function testSiteRefFormats() {
  console.log('\n--- Site Ref Formats ---');
  // Reset and do full migration to check ref formats
  resetDbs();
  const srcDb = await openDb(SRC_FILE);
  try { await seedLegacyDatabase(srcDb); } finally { await srcDb.end(); }
  runMigrate('--apply');

  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const site = await getRow(db, 'data_items', 1);

    // Pattern refs
    for (const ref of site._data.patterns) {
      assert(ref.ref.includes('|pattern'), `Pattern ref ${ref.ref} should contain |pattern`);
      assert(ref.ref.startsWith(`${APP}+`), `Pattern ref should start with app+`);
    }

    // Theme refs
    for (const ref of (site._data.theme_refs || [])) {
      assert(ref.ref.includes(':theme'), `Theme ref ${ref.ref} should contain :theme`);
    }

    // dmsEnv refs
    for (const ref of (site._data.dms_envs || [])) {
      assert(ref.ref.includes('|dmsenv'), `dmsEnv ref ${ref.ref} should contain |dmsenv`);
    }
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------
// Test for helper functions (unit tests)
// ---------------------------------------------------------------------------

async function testHelperFunctions() {
  console.log('\n--- Helper Functions ---');
  const {
    buildRow, extractRefIds, updateRefs, consolidateHistory,
    deduplicateById, uniqueSlug, parseOldSplitType, isOldSplitType,
  } = require('../src/scripts/migrate-site');

  // extractRefIds
  assertEq(extractRefIds(null).length, 0, 'extractRefIds(null) returns empty');
  assertEq(extractRefIds([]).length, 0, 'extractRefIds([]) returns empty');
  const ids = extractRefIds([{ ref: 'a', id: 5 }, { ref: 'b', id: 10 }, 20]);
  assertEq(ids.length, 3, 'extractRefIds extracts 3 IDs');
  assertEq(ids[0], 5, 'extractRefIds first ID');
  assertEq(ids[2], 20, 'extractRefIds bare ID');

  // updateRefs
  const updated = updateRefs([{ ref: 'old', id: 1 }, { ref: 'old', id: 2 }], 'new-ref');
  assertEq(updated[0].ref, 'new-ref', 'updateRefs updates ref format');
  assertEq(updated[0].id, 1, 'updateRefs preserves id');

  // uniqueSlug
  const slugs = new Set(['test', 'test_2']);
  assertEq(uniqueSlug('test', slugs), 'test_3', 'uniqueSlug skips existing');
  assertEq(uniqueSlug('new', slugs), 'new', 'uniqueSlug returns as-is when no conflict');

  // isOldSplitType
  assert(isOldSplitType('traffic_counts-41'), 'Should detect name-based split type');
  assert(isOldSplitType('traffic_counts-41-invalid-entry'), 'Should detect invalid split type');
  assert(isOldSplitType('550e8400-e29b-41d4-a716-446655440000-42'), 'Should detect UUID split type');
  assert(!isOldSplitType('docs-page'), 'Should not match non-split type');
  assert(!isOldSplitType('prod|pattern'), 'Should not match pipe type');

  // parseOldSplitType
  const parsed = parseOldSplitType('traffic_counts-41');
  assertEq(parsed.docType, 'traffic_counts', 'parseOldSplitType docType');
  assertEq(parsed.viewId, '41', 'parseOldSplitType viewId');
  assertEq(parsed.isInvalid, false, 'parseOldSplitType not invalid');

  const parsedInvalid = parseOldSplitType('traffic_counts-41-invalid-entry');
  assertEq(parsedInvalid.docType, 'traffic_counts', 'parseOldSplitType invalid docType');
  assertEq(parsedInvalid.viewId, '41', 'parseOldSplitType invalid viewId');
  assertEq(parsedInvalid.isInvalid, true, 'parseOldSplitType is invalid');

  // deduplicateById
  const deduped = deduplicateById([{ id: 1, x: 'a' }, { id: 2, x: 'b' }, { id: 1, x: 'c' }]);
  assertEq(deduped.length, 2, 'deduplicateById removes dupes');
  assertEq(deduped[0].x, 'a', 'deduplicateById keeps first');

  // consolidateHistory — single ref
  const peMap = new Map();
  peMap.set(50, { id: 50, _data: { entries: [{ action: 'test' }] } });
  const ch = consolidateHistory({ ref: 'x', id: 50 }, peMap);
  assert(ch !== null, 'consolidateHistory single ref should return result');
  assertEq(ch.row.id, 50, 'consolidateHistory single ref row id');

  // consolidateHistory — array of refs
  peMap.set(51, { id: 51, _data: { entries: [{ action: 'test2' }] } });
  const ch2 = consolidateHistory([{ ref: 'x', id: 50 }, { ref: 'x', id: 51 }], peMap);
  assert(ch2 !== null, 'consolidateHistory array refs should return result');
  assertEq(ch2.data.entries.length, 2, 'consolidateHistory merges entries');

  // consolidateHistory — null
  assertEq(consolidateHistory(null, peMap), null, 'consolidateHistory null returns null');

  // buildRow
  const row = buildRow({ id: 1, app: 'a', type: 'old', data: {}, _data: {}, created_at: 'c', created_by: null, updated_at: 'u', updated_by: null }, 'new-type', { hello: 'world' });
  assertEq(row.type, 'new-type', 'buildRow sets new type');
  assertEq(row.data.hello, 'world', 'buildRow uses data overrides');
  assertEq(row.id, 1, 'buildRow preserves id');
}

async function testRowCount() {
  console.log('\n--- Total Row Count ---');
  const db = new SqliteAdapter({ type: 'sqlite', filename: TGT_FILE });
  try {
    const mainRows = await getAllRows(db, 'data_items');
    // Expected in main table: 1 site + 1 theme + 1 dmsEnv + 3 patterns + 2 pages +
    //   4 sections (30,31,32,33; not 34) + 2 page-edits + 1 source + 1 view = 16
    // Data rows go to split tables, not main
    const expectedMainRows = 16;
    assertEq(mainRows.length, expectedMainRows, `Main table should have ${expectedMainRows} rows`);
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Site Migration Tests ===\n');

  // Run helper tests first (no DB needed)
  await testHelperFunctions();

  // Seed source database for full integration tests
  resetDbs();
  const srcDb = await openDb(SRC_FILE);
  try {
    await seedLegacyDatabase(srcDb);
  } finally {
    await srcDb.end();
  }

  // Dry run test
  await testDryRun();

  // Apply migration and test results
  // Reset target for clean apply
  cleanupFile(TGT_FILE);
  runMigrate('--apply');

  await testSiteConversion();
  await testThemeConversion();
  await testDmsEnvConversion();
  await testPagePatternConversion();
  await testComponentConversion();
  await testHistoryConsolidation();
  await testDatasetConversion();
  await testDataRowSplitTables();
  await testInvalidEntryConversion();
  await testAuthPatternNoChildren();
  await testRowCount();
  await testSiteRefFormats();

  // Separate test runs (reset DBs)
  await testIgnoreFlag();
  await testNoDocTypeDatasetCreatesDmsEnv();
  await testIdPreservation();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);

  // Cleanup
  resetDbs();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
