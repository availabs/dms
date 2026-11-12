/**
 * pattern-filter-sync: the Tier-2 recompute loads each section the way its COMPONENT does.
 *
 * Regression for src/dms/planning/tasks/current/pattern-filter-sync-full-data-load.md: the sync called
 * getData without the component's `fullDataLoad`, so every Graph it recomputed stored its first page
 * (25 rows). The flags now arrive as data (`sectionLoad`, sent by the admin client from its component
 * registry); the server never names a type.
 *
 * Real SQLite: a DMS dataset of 40 rows, a pattern whose filter group re-points a Graph section's
 * page-filter leaf, and the sync worker run in-process.
 *   - with sectionLoad { Graph: { fullDataLoad: true } }  → 40 rows stored
 *   - without sectionLoad (an API / CLI caller)           → 25 rows (the unchanged one-page behaviour)
 *   - the route rejects a malformed sectionLoad and keeps only boolean flags
 *
 * Database selection: DMS_TEST_DB=dms-sqlite (default).
 */
const assert = require('assert');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
// UDA (the getData mirror's data path) reads DMS_DB_ENV to resolve the database
process.env.DMS_DB_ENV = DB_NAME;

// Capture the sync's worker: pattern-filter-sync.js takes registerHandler from ../src/dms/tasks at
// require time, so swapping the export first hands its handler (and the queued descriptor) to us.
const tasks = require('../src/dms/tasks');
const handlers = {};
let queued = null;
tasks.registerHandler = (path, fn) => { handlers[path] = fn; };
tasks.queueTask = async (descriptor) => { queued = descriptor; return 'task-test'; };
const { createPatternFilterSyncHandler } = require('../src/dms/tasks/pattern-filter-sync/pattern-filter-sync');
const { createController } = require('../src/routes/dms/dms.controller');
const { createTestGraph } = require('./graph');

const APP = 'pfs-load-' + Date.now();
const SITE = 'site', INST = 'loadtest', DATA_TYPE = 'loadrows';
const N_ROWS = 40;

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
const idOf = (res) => Object.keys(res.jsonGraph.dms.data.byId)[0];

async function main() {
  const graph = createTestGraph(DB_NAME);
  const controller = createController(DB_NAME);
  const syncRoute = createPatternFilterSyncHandler(controller);
  const worker = handlers['dms/pattern_filter_sync'];
  assert(worker, 'the sync registered its worker');

  // the dataset: 40 rows in group "b" (the pattern's value), a few in "a" (the section's saved value)
  const rowIds = [];
  for (let i = 0; i < N_ROWS; i++) {
    rowIds.push(idOf(await graph.callAsync(['dms', 'data', 'create'], [APP, DATA_TYPE, { grp: 'b', n: String(i).padStart(3, '0') }])));
  }
  for (let i = 0; i < 3; i++) await graph.callAsync(['dms', 'data', 'create'], [APP, DATA_TYPE, { grp: 'a', n: `a${i}` }]);

  const patternId = idOf(await graph.callAsync(['dms', 'data', 'create'], [APP, `${SITE}|${INST}:pattern`,
    { name: INST, pattern_type: 'page', filters: { '*': [{ searchKey: 'grp', values: ['b'] }] } }]));

  // a Graph section reading the dataset through a page-filter leaf currently saying "a"
  const elementData = {
    externalSource: { isDms: true, env: `${APP}+${DATA_TYPE}`, source_id: +rowIds[0], view_id: +rowIds[0], columns: [{ name: 'n', type: 'text' }, { name: 'grp', type: 'text' }] },
    columns: [{ name: 'n', display_name: 'n', type: 'text', show: true }],
    filters: { op: 'AND', groups: [{ op: 'filter', col: 'grp', value: ['a'], usePageFilters: true, searchParamKey: 'grp' }] },
    display: { readyToLoad: true },
    data: [],
  };
  const newSection = async () => idOf(await graph.callAsync(['dms', 'data', 'create'], [APP, `${INST}|component`,
    { element: { 'element-type': 'Graph', 'element-data': JSON.stringify(elementData) } }]));
  const sectionId = await newSection();
  const pageId = idOf(await graph.callAsync(['dms', 'data', 'create'], [APP, `${INST}|page`,
    { title: 'p', url_slug: 'p', draft_sections: [{ id: sectionId, ref: `${APP}+${INST}|component` }] }]));

  const ctx = (descriptor) => ({ task: { task_id: 't', descriptor }, dispatchEvent: async () => {}, updateProgress: async () => {} });
  const storedRows = async (id) => {
    const [row] = await controller.getDataById([+id], ['id', 'data'], APP);
    const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const e = typeof d.element['element-data'] === 'string' ? JSON.parse(d.element['element-data']) : d.element['element-data'];
    return e.data || [];
  };
  const reset = async (id) => controller.setDataById(+id, { element: { 'element-type': 'Graph', 'element-data': JSON.stringify(elementData) } }, null, APP);

  console.log('\n--- pattern-filter-sync: section load flags ---');

  // 1. with sectionLoad: the Graph stores every row
  let res = await worker(ctx({ app: APP, patternInstance: INST, patternId: +patternId, sectionLoad: { Graph: { fullDataLoad: true, keepOriginalValues: false } } }));
  assert.strictEqual(res.sectionsPatched, 1, `one section patched (got ${res.sectionsPatched})`);
  let rows = await storedRows(sectionId);
  assert.strictEqual(rows.length, N_ROWS, `full load stores all ${N_ROWS} rows (got ${rows.length})`);
  assert.strictEqual(res.fullLoads, 1, 'result counts the full load');
  ok(`sectionLoad {Graph: fullDataLoad} → all ${N_ROWS} rows stored`);

  // 2. without sectionLoad: one page, as before (BC for API / CLI callers)
  await reset(sectionId);
  res = await worker(ctx({ app: APP, patternInstance: INST, patternId: +patternId }));
  rows = await storedRows(sectionId);
  assert.strictEqual(rows.length, 25, `no sectionLoad keeps the one-page behaviour (got ${rows.length})`);
  assert.strictEqual(res.fullLoads, 0);
  ok('no sectionLoad → first page (25 rows), unchanged behaviour');

  // 3. a type the config doesn't name loads one page; the flags are keyed by element-type only
  await reset(sectionId);
  await worker(ctx({ app: APP, patternInstance: INST, patternId: +patternId, sectionLoad: { Spreadsheet: { fullDataLoad: true } } }));
  rows = await storedRows(sectionId);
  assert.strictEqual(rows.length, 25, `another type's flags don't apply (got ${rows.length})`);
  ok('flags for another element-type are not applied');

  // 4. the route: malformed sectionLoad → 400; valid → booleans only on the descriptor
  const call = async (body) => {
    let status = 200, out = null;
    const res = { status(s) { status = s; return this; }, json(o) { out = o; return this; } };
    queued = null;
    await syncRoute({ params: { appType: `${APP}+${INST}` }, body, headers: {} }, res);
    return { status, out };
  };
  assert.strictEqual((await call({ patternId, sectionLoad: ['Graph'] })).status, 400);
  assert.strictEqual((await call({ patternId, sectionLoad: { Graph: true } })).status, 400);
  const good = await call({ patternId, sectionLoad: { Graph: { fullDataLoad: true, extra: 'x', keepOriginalValues: 'yes' } } });
  assert.strictEqual(good.status, 200);
  assert.deepStrictEqual(queued.sectionLoad, { Graph: { fullDataLoad: true, keepOriginalValues: false } });
  assert.strictEqual((await call({ patternId })).status, 200);
  assert.strictEqual(queued.sectionLoad, null);
  ok('route validates sectionLoad and passes only boolean flags');

  // cleanup
  await graph.callAsync(['dms', 'data', 'delete'], [APP, `${INST}|page`, pageId]);
  console.log(`\n${passed} passed`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('\n✗', e.message); process.exit(1); });
