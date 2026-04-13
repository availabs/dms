/**
 * Task system integration tests.
 * Tests the task runner module against a real SQLite database.
 */

const DAMA_TEST_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';

let tasks;
let db;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function setup() {
  // Delete stale test database so we start fresh
  const { join } = require('path');
  const { unlinkSync, existsSync } = require('fs');
  const configPath = join(__dirname, '..', 'src', 'db', 'configs', `${DAMA_TEST_DB}.config.json`);
  const config = require(configPath);
  if (config.type === 'sqlite' && config.filename) {
    const dbPath = join(__dirname, '..', 'src', 'db', 'configs', config.filename);
    if (existsSync(dbPath)) unlinkSync(dbPath);
  }

  const { getDb, awaitReady } = require('../src/db');
  getDb(DAMA_TEST_DB);
  await awaitReady();
  db = getDb(DAMA_TEST_DB);

  tasks = require('../src/tasks');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log(`\n=== Task System Tests (${DAMA_TEST_DB}) ===\n`);

  await setup();

  // --- queueTask ---

  await test('queueTask creates a task with status queued', async () => {
    const taskId = await tasks.queueTask({ workerPath: 'test/noop' }, DAMA_TEST_DB);
    assert(typeof taskId === 'number' || typeof taskId === 'string', 'taskId should be a number or numeric string');

    const status = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(status, 'task should exist');
    assert(status.status === 'queued', `status should be queued, got ${status.status}`);
    assert(status.worker_path === 'test/noop', 'worker_path should match');
    assert(status.host_id === tasks.hostId, 'host_id should match this host');
  });

  await test('queueTask dispatches a queued event', async () => {
    const taskId = await tasks.queueTask({ workerPath: 'test/events' }, DAMA_TEST_DB);
    const events = await tasks.getTaskEvents(taskId, DAMA_TEST_DB);
    assert(events.length >= 1, 'should have at least 1 event');
    assert(events[0].type === 'queued', `first event type should be queued, got ${events[0].type}`);
  });

  await test('queueTask stores descriptor', async () => {
    const desc = { workerPath: 'test/desc', sourceId: 42, custom: 'data' };
    const taskId = await tasks.queueTask(desc, DAMA_TEST_DB);
    const status = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    const d = typeof status.descriptor === 'string' ? JSON.parse(status.descriptor) : status.descriptor;
    assert(d.custom === 'data', 'descriptor should preserve custom fields');
    assert(+status.source_id === 42, 'source_id should be set from descriptor');
  });

  await test('queueTask requires workerPath', async () => {
    let threw = false;
    try {
      await tasks.queueTask({ sourceId: 1 }, DAMA_TEST_DB);
    } catch (e) {
      threw = true;
      assert(e.message.includes('workerPath'), 'error should mention workerPath');
    }
    assert(threw, 'should throw without workerPath');
  });

  // --- claimNextTask ---

  await test('claimNextTask claims a queued task', async () => {
    // Drain any leftover queued tasks from prior tests
    let leftover;
    while ((leftover = await tasks.claimNextTask(DAMA_TEST_DB)) !== null) {
      await tasks.failTask(leftover.task_id, 'draining', DAMA_TEST_DB);
    }

    const taskId = await tasks.queueTask({ workerPath: 'test/claim' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    assert(claimed, 'should return a task');
    assert(+claimed.task_id === +taskId, 'should claim the task we just queued');
    assert(claimed.status === 'running', 'status should be running');
    assert(claimed.worker_pid === process.pid, 'worker_pid should be set');
    assert(claimed.started_at, 'started_at should be set');
  });

  await test('claimNextTask returns null when no tasks queued', async () => {
    // Drain any remaining queued tasks
    let task;
    while ((task = await tasks.claimNextTask(DAMA_TEST_DB)) !== null) {
      await tasks.failTask(task.task_id, 'draining', DAMA_TEST_DB);
    }
    const result = await tasks.claimNextTask(DAMA_TEST_DB);
    assert(result === null, 'should return null');
  });

  await test('claimNextTask respects host isolation', async () => {
    // Insert a task with a different host_id directly
    const table = db.type === 'postgres' ? 'data_manager.tasks' : 'tasks';
    await db.query(`
      INSERT INTO ${table} (host_id, worker_path, status, descriptor)
      VALUES ($1, $2, 'queued', $3)
    `, ['other-host-id', 'test/foreign', {}]);

    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    assert(claimed === null, 'should NOT claim tasks from another host');
  });

  await test('claimNextTask claims in FIFO order', async () => {
    const id1 = await tasks.queueTask({ workerPath: 'test/fifo1' }, DAMA_TEST_DB);
    const id2 = await tasks.queueTask({ workerPath: 'test/fifo2' }, DAMA_TEST_DB);

    const claimed1 = await tasks.claimNextTask(DAMA_TEST_DB);
    const claimed2 = await tasks.claimNextTask(DAMA_TEST_DB);

    assert(+claimed1.task_id === +id1, 'first claimed should be first queued');
    assert(+claimed2.task_id === +id2, 'second claimed should be second queued');
  });

  // --- startTaskWorker (full lifecycle) ---

  await test('full lifecycle: queue → claim → worker → done', async () => {
    let workerCalled = false;
    tasks.registerHandler('test/lifecycle', async (ctx) => {
      workerCalled = true;
      await ctx.updateProgress(0.5);
      await ctx.dispatchEvent('working', 'halfway', { step: 1 });
      return { answer: 42 };
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/lifecycle' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    assert(workerCalled, 'handler should have been called');

    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'done', `status should be done, got ${final.status}`);
    assert(final.progress === 1, 'progress should be 1');

    const result = typeof final.result === 'string' ? JSON.parse(final.result) : final.result;
    assert(result.answer === 42, 'result should contain worker return value');
    assert(final.completed_at, 'completed_at should be set');
  });

  await test('full lifecycle: worker throws → error status', async () => {
    tasks.registerHandler('test/fail', async () => {
      throw new Error('intentional failure');
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/fail' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'error', `status should be error, got ${final.status}`);
    assert(final.error.includes('intentional failure'), 'error message should be preserved');
    assert(final.completed_at, 'completed_at should be set');
  });

  await test('unregistered handler → error', async () => {
    const taskId = await tasks.queueTask({ workerPath: 'test/nonexistent' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'error', 'status should be error');
    assert(final.error.includes('No handler'), 'error should mention missing handler');
  });

  // --- events ---

  await test('events track full lifecycle', async () => {
    tasks.registerHandler('test/events-lifecycle', async (ctx) => {
      await ctx.dispatchEvent('custom', 'custom event', { x: 1 });
      return { ok: true };
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/events-lifecycle' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const events = await tasks.getTaskEvents(taskId, DAMA_TEST_DB);
    const types = events.map(e => e.type);

    assert(types.includes('queued'), 'should have queued event');
    assert(types.includes('started'), 'should have started event');
    assert(types.includes('custom'), 'should have custom event');
    assert(types.includes('done'), 'should have done event');
  });

  await test('getTaskEvents supports sinceEventId', async () => {
    tasks.registerHandler('test/since', async () => ({ ok: true }));
    const taskId = await tasks.queueTask({ workerPath: 'test/since' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const allEvents = await tasks.getTaskEvents(taskId, DAMA_TEST_DB);
    assert(allEvents.length >= 3, 'should have at least 3 events');

    const sinceId = allEvents[1].event_id;
    const later = await tasks.getTaskEvents(taskId, DAMA_TEST_DB, sinceId);
    assert(later.length === allEvents.length - 2, `since should return ${allEvents.length - 2} events, got ${later.length}`);
    assert(+later[0].event_id > +sinceId, 'all returned events should be after sinceId');
  });

  // --- recoverStalledTasks ---

  await test('recoverStalledTasks marks running tasks as error', async () => {
    // Insert a "running" task directly
    const table = db.type === 'postgres' ? 'data_manager.tasks' : 'tasks';
    await db.query(`
      INSERT INTO ${table} (host_id, worker_path, status, descriptor)
      VALUES ($1, $2, 'running', $3)
    `, [tasks.hostId, 'test/stalled', {}]);

    await tasks.recoverStalledTasks(DAMA_TEST_DB);

    // Verify all running tasks for this host are now errors
    const { rows } = await db.query(`
      SELECT * FROM ${table}
      WHERE worker_path = 'test/stalled' AND host_id = $1
    `, [tasks.hostId]);

    for (const row of rows) {
      assert(row.status === 'error', `stalled task should be error, got ${row.status}`);
      assert(row.error.includes('Server restarted'), 'error message should mention restart');
    }
  });

  await test('recoverStalledTasks ignores other hosts', async () => {
    const table = db.type === 'postgres' ? 'data_manager.tasks' : 'tasks';
    await db.query(`
      INSERT INTO ${table} (host_id, worker_path, status, descriptor)
      VALUES ($1, $2, 'running', $3)
    `, ['other-host-stalled', 'test/other-stalled', {}]);

    await tasks.recoverStalledTasks(DAMA_TEST_DB);

    const { rows } = await db.query(`
      SELECT status FROM ${table} WHERE worker_path = 'test/other-stalled'
    `);
    assert(rows[0].status === 'running', 'other host task should still be running');
  });

  // ============================================================
  // Falcor Route Tests (UDA task routes)
  // ============================================================

  console.log('\n  --- Falcor route tests ---');

  // Build a minimal Falcor router with just the UDA task routes
  const Router = require('../src/utils/falcor-router/src/Router');
  const taskRoutes = require('../src/routes/uda/uda.tasks.route');
  const BaseRouter = Router.createClass(taskRoutes);
  class TestRouter extends BaseRouter {
    constructor() { super({ maxPaths: 500000 }); }
  }
  const router = new TestRouter();

  function routerGet(paths) {
    return new Promise((resolve, reject) => {
      router.get(paths).subscribe(
        (result) => resolve(result),
        (err) => reject(err)
      );
    });
  }

  function routerSet(jsonGraph) {
    return new Promise((resolve, reject) => {
      router.set(jsonGraph).subscribe(
        (result) => resolve(result),
        (err) => reject(err)
      );
    });
  }

  function routerCall(callPath, args) {
    return new Promise((resolve, reject) => {
      router.call(callPath, args, [], []).subscribe(
        (result) => resolve(result),
        (err) => reject(err)
      );
    });
  }

  // Seed a known completed task for route tests
  tasks.registerHandler('test/route', async (ctx) => {
    await ctx.dispatchEvent('progress', 'halfway', { pct: 50 });
    return { success: true };
  });
  const routeTaskId = await tasks.queueTask({ workerPath: 'test/route', sourceId: 99 }, DAMA_TEST_DB);
  const routeTask = await tasks.claimNextTask(DAMA_TEST_DB);
  await tasks.startTaskWorker(routeTask, DAMA_TEST_DB);

  await test('Falcor: tasks.length returns count', async () => {
    const result = await routerGet([
      [['uda'], [DAMA_TEST_DB], ['tasks'], ['length']]
    ]);
    const len = result.jsonGraph.uda[DAMA_TEST_DB].tasks.length;
    assert(typeof len === 'number' && len > 0, `length should be > 0, got ${len}`);
  });

  await test('Falcor: tasks.byId returns task attributes', async () => {
    const result = await routerGet([
      ['uda', DAMA_TEST_DB, 'tasks', 'byId', routeTaskId, ['status', 'worker_path', 'source_id']]
    ]);
    const task = result.jsonGraph.uda[DAMA_TEST_DB].tasks.byId[routeTaskId];
    assert(task.status === 'done', `status should be done, got ${task.status}`);
    assert(task.worker_path === 'test/route', `worker_path should match`);
    assert(+task.source_id === 99, `source_id should be 99`);
  });

  await test('Falcor: tasks.byIndex returns $ref to byId', async () => {
    const result = await routerGet([
      ['uda', DAMA_TEST_DB, 'tasks', 'byIndex', 0]
    ]);
    const ref = result.jsonGraph.uda[DAMA_TEST_DB].tasks.byIndex[0];
    assert(ref && ref.$type === 'ref', 'should be a $ref');
    assert(Array.isArray(ref.value), 'ref.value should be an array');
    assert(ref.value[2] === 'tasks' && ref.value[3] === 'byId', 'ref should point to tasks.byId');
  });

  await test('Falcor: tasks.forSource returns filtered tasks', async () => {
    const result = await routerGet([
      ['uda', DAMA_TEST_DB, 'tasks', 'forSource', 99, 'length']
    ]);
    const len = result.jsonGraph.uda[DAMA_TEST_DB].tasks.forSource[99].length;
    assert(typeof len === 'number' && len >= 1, `forSource length should be >= 1, got ${len}`);
  });

  await test('Falcor: task events length and byIndex', async () => {
    const lenResult = await routerGet([
      ['uda', DAMA_TEST_DB, 'tasks', 'byId', routeTaskId, 'events', 'length']
    ]);
    const len = lenResult.jsonGraph.uda[DAMA_TEST_DB].tasks.byId[routeTaskId].events.length;
    assert(typeof len === 'number' && len >= 3, `events length should be >= 3, got ${len}`);

    const evtResult = await routerGet([
      ['uda', DAMA_TEST_DB, 'tasks', 'byId', routeTaskId, 'events', 'byIndex', {from: 0, to: len - 1}, ['type', 'message']]
    ]);
    const events = evtResult.jsonGraph.uda[DAMA_TEST_DB].tasks.byId[routeTaskId].events.byIndex;
    assert(events[0].type === 'queued', `first event should be queued, got ${events[0].type}`);
  });

  await test('Falcor: settings get/set round-trip', async () => {
    const settingsValue = JSON.stringify({ filtered_categories: ['test'], show_uncategorized: true });

    await routerSet({
      paths: [['uda', DAMA_TEST_DB, 'settings']],
      jsonGraph: {
        uda: { [DAMA_TEST_DB]: { settings: settingsValue } }
      }
    });

    const result = await routerGet([
      ['uda', DAMA_TEST_DB, 'settings']
    ]);
    const val = result.jsonGraph.uda[DAMA_TEST_DB].settings;
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    assert(parsed.filtered_categories[0] === 'test', 'should persist filtered_categories');
    assert(parsed.show_uncategorized === true, 'should persist show_uncategorized');
  });

  await test('Falcor: sources.update call', async () => {
    // Insert a source to update
    const srcTable = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
    await db.query(`INSERT INTO ${srcTable} (name) VALUES ($1)`, ['test-update-src']);
    const { rows } = await db.query(`SELECT source_id FROM ${srcTable} WHERE name = 'test-update-src'`);
    const srcId = rows[0].source_id;

    const result = await routerCall(
      ['uda', 'sources', 'update'],
      [DAMA_TEST_DB, srcId, { description: 'updated via route' }]
    );

    const updated = result.jsonGraph.uda[DAMA_TEST_DB].sources.byId[srcId];
    assert(updated.description === 'updated via route', 'description should be updated');
  });

  // --- summary ---

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
