/**
 * Delete-cascade regression tests.
 *
 * dms.data.delete on a `:source` row used to be a bare row delete: the parent
 * dmsEnv/pattern kept the deleted source's {ref, id} entry in data.sources
 * (rendering ghost entries in the datasets list), child `:view` rows stayed in
 * the main table, and the views' data split tables stayed in the schema.
 * Surfaced 2026-08-05 by the freight-plan PDF source deletes on npmrdsv5
 * (see planning/tasks/current/delete-cascade-source-view-orphans.md).
 *
 * Covers:
 *   1. Source delete cascades: env sources ref removed, view rows deleted,
 *      data split table dropped, uda sources length updated.
 *   2. View delete cascades: source views ref removed, data split table dropped.
 *   3. getSiteSources filters dangling refs created out-of-band.
 *
 * Database selection: DMS_TEST_DB=dms-sqlite (default) or dms-postgres-test.
 */

const { createTestGraph } = require('./graph');
const { getDb } = require('../src/db/index.js');
const { resolveTable } = require('../src/db/table-resolver.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
// UDA routes read DMS_DB_ENV to resolve the database — sync it with the test DB
process.env.DMS_DB_ENV = DB_NAME;

const TEST_APP = 'cascade-test-' + Date.now();
const SITE_INSTANCE = TEST_APP;
const PATTERN_INSTANCE = 'datasets';
const ENV_INSTANCE = 'datasets_env';
const UDA_ENV = `${TEST_APP}+${PATTERN_INSTANCE}`;
const SPLIT_MODE = 'per-app';

let graph = null;
let db = null;
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

async function createItem(type, data) {
  const result = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, type, data]);
  return +Object.keys(result.jsonGraph.dms.data.byId)[0];
}

async function getItemData(id) {
  const fqn = resolveTable(TEST_APP, 'non-split', db.type, SPLIT_MODE).fullName;
  const { rows } = await db.query(`SELECT data FROM ${fqn} WHERE id = $1`, [id]);
  if (!rows.length) return null;
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
}

async function rowExists(id) {
  const fqn = resolveTable(TEST_APP, 'non-split', db.type, SPLIT_MODE).fullName;
  const { rows } = await db.query(`SELECT id FROM ${fqn} WHERE id = $1`, [id]);
  return rows.length > 0;
}

async function tableExists(resolved) {
  if (db.type === 'postgres') {
    const { rows } = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [resolved.schema, resolved.table]
    );
    return rows.length > 0;
  }
  const { rows } = await db.query(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`,
    [resolved.table]
  );
  return rows.length > 0;
}

async function udaSourcesLength() {
  const result = await graph.getAsync([['uda', UDA_ENV, 'sources', 'length']]);
  return result.jsonGraph.uda[UDA_ENV].sources.length;
}

// ---------------------------------------------------------------------------
// Setup: site → datasets pattern (dmsEnvId) → dmsEnv, matching production shape
// ---------------------------------------------------------------------------

let envId = null;

async function setup() {
  graph = createTestGraph(DB_NAME);
  db = getDb(DB_NAME);

  const siteId = await createItem(`${SITE_INSTANCE}:site`, { patterns: [] });
  envId = await createItem(`${SITE_INSTANCE}|${ENV_INSTANCE}:dmsenv`, { name: ENV_INSTANCE, sources: [] });
  const patternId = await createItem(
    `${SITE_INSTANCE}|${PATTERN_INSTANCE}:pattern`,
    { name: PATTERN_INSTANCE, pattern_type: 'datasets', dmsEnvId: String(envId) }
  );
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, siteId, { patterns: [{ id: patternId }] }]);
}

/**
 * Create a full internal dataset: source row, view row, refs wired into the
 * env/source, and two data rows (which auto-create the split table).
 */
async function createDataset(slug, name) {
  const srcId = await createItem(`${ENV_INSTANCE}|${slug}:source`, { name, type: 'internal_table' });

  const envData = await getItemData(envId);
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, envId, {
    sources: [...(envData.sources || []), { ref: `${TEST_APP}+${ENV_INSTANCE}|source`, id: srcId }]
  }]);

  const viewId = await createItem(`${slug}|v1:view`, { name: 'version 1' });
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, srcId, {
    views: [{ ref: `${TEST_APP}+${ENV_INSTANCE}|source|view`, id: viewId }]
  }]);

  const dataType = `${slug}|${viewId}:data`;
  await createItem(dataType, { col1: 'a' });
  await createItem(dataType, { col1: 'b' });

  const splitResolved = resolveTable(TEST_APP, dataType, db.type, SPLIT_MODE, srcId);
  return { srcId, viewId, dataType, splitResolved };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testSourceDeleteCascades() {
  console.log('\n--- Source delete cascades ---');

  const ds = await createDataset('plan_pdf_a', 'Plan PDF A');

  assert(await udaSourcesLength() === 1, 'source listed before delete');
  assert(await tableExists(ds.splitResolved), 'split table exists before delete');

  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${ENV_INSTANCE}|source`, ds.srcId]);

  assert(!(await rowExists(ds.srcId)), 'source row deleted');
  pass('source row deleted');

  const envData = await getItemData(envId);
  const stillRef = (envData.sources || []).some(s => +s.id === ds.srcId);
  assert(!stillRef, `env data.sources still references deleted source ${ds.srcId}`);
  pass('env data.sources ref removed');

  assert(!(await rowExists(ds.viewId)), 'child view row deleted');
  pass('child view row deleted');

  assert(!(await tableExists(ds.splitResolved)), 'data split table dropped');
  pass('data split table dropped');

  assert(await udaSourcesLength() === 0, 'uda sources length back to 0');
  pass('uda sources length reflects the delete');
}

async function testViewDeleteCascades() {
  console.log('\n--- View delete cascades ---');

  const ds = await createDataset('plan_pdf_b', 'Plan PDF B');

  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${ds.dataType.split('|')[0]}|view`, ds.viewId]);

  assert(!(await rowExists(ds.viewId)), 'view row deleted');
  pass('view row deleted');

  const srcData = await getItemData(ds.srcId);
  const stillRef = (srcData.views || []).some(v => +v.id === ds.viewId);
  assert(!stillRef, `source data.views still references deleted view ${ds.viewId}`);
  pass('source data.views ref removed');

  assert(!(await tableExists(ds.splitResolved)), 'data split table dropped');
  pass('data split table dropped');

  assert(await udaSourcesLength() === 1, 'source itself still listed');
  pass('source itself still listed');

  // Clean up for the next test's counts
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, `${ENV_INSTANCE}|source`, ds.srcId]);
}

async function testDanglingRefFilteredFromList() {
  console.log('\n--- Dangling ref filtered from the sources list ---');

  const ds = await createDataset('plan_pdf_c', 'Plan PDF C');

  // Inject a dangling ref directly, simulating an out-of-band delete
  // (direct SQL / a server without the cascade)
  const envData = await getItemData(envId);
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, envId, {
    sources: [...(envData.sources || []), { ref: `${TEST_APP}+${ENV_INSTANCE}|source`, id: 999999999 }]
  }]);

  assert(await udaSourcesLength() === 1, 'dangling ref not counted in sources length');
  pass('dangling ref not counted in sources length');

  const byIndexResult = await graph.getAsync([
    ['uda', UDA_ENV, 'sources', 'byIndex', { from: 0, to: 1 }, 'value']
  ]);
  const refs = byIndexResult.jsonGraph.uda[UDA_ENV].sources.byIndex;
  const returnedIds = Object.values(refs || {})
    .map(r => r && r.value && +r.value[r.value.length - 1])
    .filter(Boolean);
  assert(returnedIds.length === 1 && returnedIds[0] === ds.srcId,
    `byIndex should return only the live source, got ${JSON.stringify(returnedIds)}`);
  pass('byIndex returns only live sources');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Delete Cascade Tests ===\n');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Test app: ${TEST_APP}`);

  await setup();

  await testSourceDeleteCascades();
  await testViewDeleteCascades();
  await testDanglingRefFilteredFromList();

  // Cleanup all remaining test rows
  const fqn = resolveTable(TEST_APP, 'non-split', db.type, SPLIT_MODE).fullName;
  await db.query(`DELETE FROM ${fqn} WHERE app = $1`, [TEST_APP]);

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
