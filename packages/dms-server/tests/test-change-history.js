/**
 * Change-history tests (src/routes/dms/changeHistory.js, written by setDataById).
 *
 * A dataset whose source row carries `change_history: {target, columns, exclude}` gets one row
 * in the target dataset per changed tracked column of every `dms.data.edit`, inside the edit's
 * transaction. Built for the QA pattern's ticket history
 * (src/dms/planning/tasks/current/qa-pattern-type.md, "Change-history writer").
 *
 * Covers:
 *   1. A tracked edit writes one row with every field; untracked columns and unchanged values
 *      write nothing; a dataset without the setting writes nothing.
 *   2. Pick-list columns never merge; a typed column's burst of saves merges into one row,
 *      a burst that ends where it started removes its row, and another person's edit, or one
 *      after the 30 s window, starts a new row.
 *   3. `via` comes from the request (the CLI's X-DMS-Via header), else 'ui'.
 *   4. columns '*' tracks the dataset's declared columns minus `exclude` (never undeclared keys).
 *   5. Setting change_history on a source takes effect on the next edit (cache cleared), and
 *      `enabled: false` switches it off.
 *   6. A history dataset that can't be found: the edit still saves, without history.
 *   7. A history write that fails rolls the edit back too.
 *
 * Database selection: DMS_TEST_DB=dms-sqlite (default) or dms-postgres-test.
 */

const { createTestGraph } = require('./graph');
const { getDb } = require('../src/db/index.js');
const { resolveTable } = require('../src/db/table-resolver.js');
const { createController } = require('../src/routes/dms/dms.controller.js');
const { parseChangeHistory, historyText, withinBurst } = require('../src/routes/dms/changeHistory.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
process.env.DMS_DB_ENV = DB_NAME;

const TEST_APP = 'history-test-' + Date.now();
const SITE_INSTANCE = TEST_APP;
const ENV_INSTANCE = 'datasets_env';
const SPLIT_MODE = 'per-app';

const USER = { id: 1, email: 'test@test.com', groups: ['admin'] };
const OTHER_USER = { id: 2, email: 'other@example.com', groups: ['admin'] };

let graph = null;
let db = null;
let envId = null;
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

async function createItem(type, data, g = graph) {
  const result = await g.callAsync(['dms', 'data', 'create'], [TEST_APP, type, data]);
  return +Object.keys(result.jsonGraph.dms.data.byId)[0];
}

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

async function getRowData(resolved, id) {
  const { rows } = await db.query(`SELECT data FROM ${resolved.fullName} WHERE id = $1`, [id]);
  return rows.length ? parse(rows[0].data) : null;
}

// An internal dataset: source row (with `extra` data, e.g. config / change_history), view row,
// refs wired into the env.
async function createDataset(slug, extra = {}) {
  const srcId = await createItem(`${ENV_INSTANCE}|${slug}:source`, { name: slug, type: 'internal_table', ...extra });
  const viewId = await createItem(`${slug}|v1:view`, { name: 'version 1' });
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, srcId, {
    views: [{ ref: `${TEST_APP}+${ENV_INSTANCE}|source|view`, id: viewId }],
  }]);
  const dataType = `${slug}|${viewId}:data`;
  const resolved = resolveTable(TEST_APP, dataType, db.type, SPLIT_MODE, srcId);
  return { srcId, viewId, dataType, resolved };
}

const config = (attributes) => JSON.stringify({ attributes });
const HISTORY_COLUMNS = ['row_id', 'source_id', 'field', 'old_value', 'new_value', 'user_id', 'user_email', 'at', 'via']
  .map((name) => ({ name, type: 'text' }));

async function historyRows(history) {
  const { rows } = await db.query(
    `SELECT id, data FROM ${history.resolved.fullName} WHERE type = $1 ORDER BY id`, [history.dataType]
  );
  return rows.map((r) => ({ id: +r.id, ...parse(r.data) }));
}

const edit = (ds, id, patch, g = graph) => g.callAsync(['dms', 'data', 'edit'], [TEST_APP, id, patch, ds.dataType]);

// ---------------------------------------------------------------------------
// Setup: site + dmsEnv; a history dataset; a tickets dataset tracking a column list
// ---------------------------------------------------------------------------

let history = null;
let tickets = null;

async function setup() {
  graph = createTestGraph(DB_NAME, { user: USER });
  db = getDb(DB_NAME);
  await createItem(`${SITE_INSTANCE}:site`, { patterns: [] });
  envId = await createItem(`${SITE_INSTANCE}|${ENV_INSTANCE}:dmsenv`, { name: ENV_INSTANCE, sources: [] });

  history = await createDataset('h_history', { config: config(HISTORY_COLUMNS) });
  tickets = await createDataset('h_tickets', {
    config: config([
      { name: 'title', type: 'text' },
      { name: 'status', type: 'select' },
      { name: 'assignee', type: 'text' },
    ]),
    change_history: {
      target: { source_id: history.srcId, view_id: history.viewId },
      columns: ['status', 'assignee'],
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testPureHelpers() {
  console.log('\n--- changeHistory.js helpers ---');
  assert(parseChangeHistory({}) === null, 'no setting → untracked');
  assert(parseChangeHistory({ change_history: { target: { source_id: 1 }, columns: ['a'] } }) === null, 'no view → untracked');
  assert(parseChangeHistory({ change_history: { target: { source_id: 1, view_id: 2 }, columns: [] } }) === null, 'empty list → untracked');
  assert(parseChangeHistory({ change_history: { target: { source_id: 1, view_id: 2 }, columns: ['a'], enabled: false } }) === null, 'switched off → untracked');
  const spec = parseChangeHistory({
    config: config([{ name: 'a', type: 'select' }, { name: 'b', type: 'textarea' }, { name: 'c' }]),
    change_history: JSON.stringify({ target: { source_id: 1, view_id: 2 }, columns: '*', exclude: ['c'] }),
  });
  assert(spec.tracks('a') && spec.tracks('b') && !spec.tracks('c') && !spec.tracks('isValid'), "'*' = declared minus exclude");
  assert(!spec.merges('a') && spec.merges('b') && spec.merges('c'), 'pick lists never merge; typed and untyped do');
  pass('parseChangeHistory: settings, string JSON, tracks/merges');

  assert(historyText(null) === '' && historyText(undefined) === '' && historyText(5) === '5'
    && historyText(['x']) === '["x"]' && historyText({ a: 1 }) === '{"a":1}', 'value text');
  const now = new Date('2026-10-08T14:00:30Z');
  assert(withinBurst('2026-10-08 14:00:00', now) && !withinBurst('2026-10-08 13:59:59', now) && !withinBurst('', now), '30 s window');
  pass('historyText + withinBurst');
}

async function testTrackedEdit() {
  console.log('\n--- A tracked edit writes one history row ---');
  const id = await createItem(tickets.dataType, { title: 'T1', status: 'Triage', assignee: '' });

  await edit(tickets, id, { status: 'In progress' });
  let rows = await historyRows(history);
  assert(rows.length === 1, `one history row, got ${rows.length}`);
  const [h] = rows;
  assert(+h.row_id === id && +h.source_id === tickets.srcId && h.field === 'status', 'row, dataset and field');
  assert(h.old_value === 'Triage' && h.new_value === 'In progress', 'old → new');
  assert(+h.user_id === USER.id && h.user_email === USER.email, 'who');
  assert(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(h.at) && h.via === 'ui', 'when + via');
  assert((await getRowData(tickets.resolved, id)).status === 'In progress', 'the edit itself saved');
  pass('status change: one row with every field');

  await edit(tickets, id, { title: 'T1 renamed' });
  await edit(tickets, id, { status: 'In progress' });
  rows = await historyRows(history);
  assert(rows.length === 1, `untracked column / unchanged value add nothing, got ${rows.length}`);
  pass('untracked column and unchanged value: no row');

  // Pick lists never merge, even straight away by the same person.
  await edit(tickets, id, { status: 'Resolved' });
  rows = await historyRows(history);
  assert(rows.length === 2 && rows[1].old_value === 'In progress' && rows[1].new_value === 'Resolved', 'second status row');
  pass('pick-list changes never merge');
}

async function testTypingBursts() {
  console.log('\n--- Typed columns merge their burst ---');
  const id = await createItem(tickets.dataType, { title: 'T2', status: 'Triage', assignee: '' });
  const before = (await historyRows(history)).length;

  for (const v of ['J', 'Jo', 'Joh', 'John']) await edit(tickets, id, { assignee: v });
  let rows = (await historyRows(history)).slice(before);
  assert(rows.length === 1, `one row for the burst, got ${rows.length}`);
  assert(rows[0].old_value === '' && rows[0].new_value === 'John', 'first old value, last new value');
  pass('four saves while typing → one row');

  // Another person's edit inside the window starts its own row.
  const other = createTestGraph(DB_NAME, { user: OTHER_USER });
  await edit(tickets, id, { assignee: 'Jane' }, other);
  rows = (await historyRows(history)).slice(before);
  assert(rows.length === 2 && rows[1].old_value === 'John' && +rows[1].user_id === OTHER_USER.id, 'other user → new row');
  pass("another person's edit is a new row");

  // Past the window: age the newest row's stamp, then edit again.
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, rows[1].id, { at: '2020-01-01 00:00:00' }, history.dataType]);
  await edit(tickets, id, { assignee: 'Janet' }, other);
  rows = (await historyRows(history)).slice(before);
  assert(rows.length === 3 && rows[2].old_value === 'Jane' && rows[2].new_value === 'Janet', 'after the window → new row');
  pass('an edit after the 30 s window is a new row');

  // A burst that ends where it started leaves no row.
  await edit(tickets, id, { assignee: 'Janetx' }, other);
  await edit(tickets, id, { assignee: 'Janet' }, other);
  rows = (await historyRows(history)).slice(before);
  assert(rows.length === 3 && rows[2].new_value === 'Janet', `a reverted burst removes its row, got ${rows.length}`);
  pass('a burst typed and undone leaves nothing');
}

async function testVia() {
  console.log('\n--- via ---');
  const id = await createItem(tickets.dataType, { title: 'T3', status: 'Triage' });
  const before = (await historyRows(history)).length;
  const cli = createTestGraph(DB_NAME, { user: USER, reqMeta: { via: 'cli' } });
  const odd = createTestGraph(DB_NAME, { user: USER, reqMeta: { via: 'something' } });
  await edit(tickets, id, { status: 'In progress' }, cli);
  await edit(tickets, id, { status: 'In review' }, odd);
  const rows = (await historyRows(history)).slice(before);
  assert(rows[0].via === 'cli' && rows[1].via === 'ui', `via cli / unknown → ui, got ${rows.map((r) => r.via)}`);
  pass("X-DMS-Via 'cli' recorded; an unknown value reads as 'ui'");
}

async function testAllColumns() {
  console.log("\n--- columns '*' ---");
  const pages = await createDataset('h_pages', {
    config: config([{ name: 'name', type: 'text' }, { name: 'stage', type: 'select' }, { name: 'updated', type: 'text' }]),
    change_history: { target: { source_id: history.srcId, view_id: history.viewId }, columns: '*', exclude: ['updated'] },
  });
  const id = await createItem(pages.dataType, { name: 'Home', stage: 'Design', updated: '2026-10-01' });
  const before = (await historyRows(history)).length;
  await edit(pages, id, { name: 'Homepage', stage: 'QA', updated: '2026-10-08', isValid: true, undeclared: 'x' });
  const fields = (await historyRows(history)).slice(before).map((r) => r.field).sort();
  assert(JSON.stringify(fields) === '["name","stage"]', `declared minus exclude, got ${fields}`);
  pass("'*' logs declared columns only, minus exclude");
}

async function testSettingTakesEffect() {
  console.log('\n--- Setting change_history on a source ---');
  const stories = await createDataset('h_stories', { config: config([{ name: 'stage', type: 'select' }]) });
  const id = await createItem(stories.dataType, { stage: 'proposed' });
  const before = (await historyRows(history)).length;
  await edit(stories, id, { stage: 'accepted' });
  assert((await historyRows(history)).length === before, 'untracked dataset: no row');
  pass('a dataset without the setting writes nothing');

  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, stories.srcId, {
    change_history: { target: { source_id: history.srcId, view_id: history.viewId }, columns: ['stage'] },
  }]);
  await edit(stories, id, { stage: 'verified' });
  const rows = (await historyRows(history)).slice(before);
  assert(rows.length === 1 && rows[0].old_value === 'accepted', 'tracked from the next edit');
  pass('turning the setting on applies to the next edit');

  // Switched off in the Admin tab: the setting keeps its target and columns, with enabled: false.
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, stories.srcId, {
    change_history: { target: { source_id: history.srcId, view_id: history.viewId }, columns: ['stage'], enabled: false },
  }]);
  await edit(stories, id, { stage: 'proposed' });
  assert((await historyRows(history)).slice(before).length === 1, 'switched off: no row');
  pass('enabled: false switches it off');
}

async function testMissingTarget() {
  console.log('\n--- History dataset not found ---');
  const lost = await createDataset('h_lost', {
    config: config([{ name: 'status', type: 'select' }]),
    change_history: { target: { source_id: 999999999, view_id: 999999998 }, columns: ['status'] },
  });
  const id = await createItem(lost.dataType, { status: 'Triage' });
  await edit(lost, id, { status: 'Resolved' });
  assert((await getRowData(lost.resolved, id)).status === 'Resolved', 'edit saved');
  pass('an unresolvable history dataset: the edit saves without history');
}

async function testRollback() {
  console.log('\n--- A failing history write rolls the edit back ---');
  const id = await createItem(tickets.dataType, { title: 'T4', status: 'Triage' });
  // Replace the history table with one the insert can't write to (CREATE IF NOT EXISTS then
  // no-ops, so the failure happens inside the edit's transaction).
  await db.query(`DROP TABLE ${history.resolved.fullName}`);
  await db.query(`CREATE TABLE ${history.resolved.fullName} (id BIGINT PRIMARY KEY)`);
  let threw = false;
  try {
    await createController(DB_NAME, { splitMode: SPLIT_MODE })
      .setDataById(id, { status: 'Resolved' }, USER, TEST_APP, tickets.dataType, null);
  } catch { threw = true; }
  assert(threw, 'the edit failed');
  assert((await getRowData(tickets.resolved, id)).status === 'Triage', 'the field change rolled back');
  pass('history and edit land together or not at all');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== Change History Tests ===\n');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Test app: ${TEST_APP}`);

  testPureHelpers();
  await setup();
  await testTrackedEdit();
  await testTypingBursts();
  await testVia();
  await testAllColumns();
  await testSettingTakesEffect();
  await testMissingTarget();
  await testRollback(); // last: it breaks the history table

  const fqn = resolveTable(TEST_APP, 'non-split', db.type, SPLIT_MODE).fullName;
  await db.query(`DELETE FROM ${fqn} WHERE app = $1`, [TEST_APP]);

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
