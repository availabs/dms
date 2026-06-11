/**
 * Scheduler tests — data_manager.schedules + the due-schedule sweep,
 * the schedulables registry, the /dama-admin/:pgEnv/schedules routes,
 * and the transient-error retry hardening in the task runner.
 *
 * Node harness against the sqlite test db (DAMA_TEST_DB=dama-sqlite-test).
 */

const DAMA_TEST_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';

let db;
let tasks;
let schedules;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// UTC 'YYYY-MM-DD HH:MM:SS' n seconds from now — the storage format the
// scheduler uses for next_fire_at comparisons.
function utcStamp(offsetSeconds = 0) {
  return new Date(Date.now() + offsetSeconds * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

// Capture route handlers off a fake express app so we can invoke them
// directly (same style as the data-types route integration tests).
function captureRoutes(registerFn) {
  const routes = {};
  const fakeApp = {};
  for (const method of ['get', 'post', 'patch', 'delete', 'put', 'use']) {
    fakeApp[method] = (path, ...handlers) => {
      routes[`${method.toUpperCase()} ${path}`] = handlers[handlers.length - 1];
    };
  }
  registerFn(fakeApp);
  return routes;
}

const AUTHED = { availAuthContext: { user: { id: 1, email: 'test@test.test' } } };

async function setup() {
  const { join } = require('path');
  const { unlinkSync, existsSync } = require('fs');
  const configPath = join(__dirname, '..', 'src', 'db', 'configs', `${DAMA_TEST_DB}.config.json`);
  const config = require(configPath);
  if (config.type === 'sqlite' && config.filename) {
    const dbPath = join(__dirname, '..', 'src', 'db', 'configs', config.filename);
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
    }
  }

  const { getDb, awaitReady } = require('../src/db');
  getDb(DAMA_TEST_DB);
  await awaitReady();
  db = getDb(DAMA_TEST_DB);

  tasks = require('../src/dama/tasks');
  schedules = require('../src/dama/tasks/schedules');
}

async function runTests() {
  console.log(`\n=== Scheduler Tests (${DAMA_TEST_DB}) ===\n`);

  await setup();

  const { registerDatatype, getSchedulables } = require('../src/dama/datatypes');

  // ── table init ─────────────────────────────────────────────────────────

  await test('schedules + schedule_events tables exist after init', async () => {
    const { rows } = await db.query(`SELECT COUNT(*) AS n FROM schedules`);
    assert(rows.length === 1, 'schedules table should be queryable');
    const ev = await db.query(`SELECT COUNT(*) AS n FROM schedule_events`);
    assert(ev.rows.length === 1, 'schedule_events table should be queryable');
  });

  await test('tasks table has attempt/max_attempts/schedule_id columns', async () => {
    const { rows } = await db.query(
      `SELECT attempt, max_attempts, schedule_id FROM tasks LIMIT 1`);
    assert(Array.isArray(rows), 'columns should exist');
  });

  // ── next_fire_at math (cron-parser + timezone) ──────────────────────────

  await test('computeNextFireAt honors timezone (02:00 America/New_York = 06:00 UTC in June)', async () => {
    const next = schedules.computeNextFireAt('0 2 1 * *', 'America/New_York',
      new Date('2026-06-10T00:00:00Z'));
    assert(next === '2026-07-01 06:00:00', `expected 2026-07-01 06:00:00, got ${next}`);
  });

  await test('computeNextFireAt handles winter offset (EST = UTC-5)', async () => {
    const next = schedules.computeNextFireAt('0 2 1 * *', 'America/New_York',
      new Date('2026-01-10T00:00:00Z'));
    assert(next === '2026-02-01 07:00:00', `expected 2026-02-01 07:00:00, got ${next}`);
  });

  await test('computeNextFireAt rejects invalid cron', async () => {
    let threw = false;
    try { schedules.computeNextFireAt('not a cron', 'America/New_York'); }
    catch (e) { threw = true; }
    assert(threw, 'should throw on invalid cron');
  });

  // ── schedulables registry ────────────────────────────────────────────────

  let builtDescriptors = [];
  registerDatatype('fake_sched_dt', {
    workers: {
      'fake_sched_dt/run': async () => ({ ok: true }),
    },
    schedulables: {
      'fake_sched_dt/run': {
        label: 'Fake schedulable',
        defaultCron: '0 2 * * *',
        params: [{ name: 'states', type: 'string[]', default: ['NY'] }],
        async buildDescriptor({ schedule }) {
          const descriptor = typeof schedule.descriptor === 'string'
            ? JSON.parse(schedule.descriptor || '{}') : (schedule.descriptor || {});
          const built = { ...descriptor, startDate: '2026-06-01', endDate: '2026-06-07' };
          builtDescriptors.push(built);
          return built;
        },
      },
    },
  });

  await test('registerDatatype collects schedulables; getSchedulables exposes them', async () => {
    const s = getSchedulables();
    assert(s['fake_sched_dt/run'], 'fake_sched_dt/run should be in the registry');
    assert(s['fake_sched_dt/run'].label === 'Fake schedulable', 'label preserved');
    assert(s['fake_sched_dt/run'].datatype === 'fake_sched_dt', 'datatype name attached');
  });

  // ── routes ───────────────────────────────────────────────────────────────

  const { registerScheduleRoutes } = require('../src/dama/tasks/schedule-routes');
  const routes = captureRoutes(registerScheduleRoutes);

  let scheduleId;

  await test('POST /schedules requires auth', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      { params: { pgEnv: DAMA_TEST_DB }, body: { worker_path: 'fake_sched_dt/run', cron: '0 2 * * *' } },
      res
    );
    assert(res.statusCode === 401, `should 401 without user, got ${res.statusCode}`);
  });

  await test('POST /schedules creates a schedule with computed next_fire_at', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      {
        ...AUTHED,
        params: { pgEnv: DAMA_TEST_DB },
        body: {
          source_id: 101,
          worker_path: 'fake_sched_dt/run',
          cron: '0 2 * * *',
          timezone: 'America/New_York',
          descriptor: { states: ['NY'] },
          max_in_flight: 1,
        },
      },
      res
    );
    assert(res.statusCode === 200, `should 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(res.body.schedule_id != null, 'returns schedule_id');
    assert(res.body.next_fire_at, 'next_fire_at computed');
    assert(res.body.enabled === true || res.body.enabled === 1, 'enabled defaults true');
    scheduleId = res.body.schedule_id;
  });

  await test('POST /schedules rejects unknown worker_path', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB }, body: { worker_path: 'nope/never', cron: '0 2 * * *' } },
      res
    );
    assert(res.statusCode === 400, `should 400 for unschedulable worker_path, got ${res.statusCode}`);
  });

  await test('POST /schedules rejects invalid cron', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB }, body: { worker_path: 'fake_sched_dt/run', cron: 'whenever' } },
      res
    );
    assert(res.statusCode === 400, `should 400 for bad cron, got ${res.statusCode}`);
  });

  await test('GET /schedules lists schedules (filterable by source_id)', async () => {
    const res = mockRes();
    await routes['GET /dama-admin/:pgEnv/schedules'](
      { params: { pgEnv: DAMA_TEST_DB }, query: { source_id: 101 } },
      res
    );
    assert(Array.isArray(res.body), 'returns an array');
    assert(res.body.some((s) => +s.schedule_id === +scheduleId), 'includes the created schedule');
  });

  await test('GET /schedulables enumerates the registry', async () => {
    const res = mockRes();
    await routes['GET /dama-admin/:pgEnv/schedulables']({ params: { pgEnv: DAMA_TEST_DB }, query: {} }, res);
    assert(Array.isArray(res.body), 'returns an array');
    const fake = res.body.find((s) => s.worker_path === 'fake_sched_dt/run');
    assert(fake, 'includes fake_sched_dt/run');
    assert(fake.label === 'Fake schedulable', 'carries label');
    assert(Array.isArray(fake.params), 'carries params form spec');
    assert(fake.datatype === 'fake_sched_dt', 'carries datatype');
  });

  // ── due-schedule sweep ───────────────────────────────────────────────────

  await test('sweep fires a due schedule: task queued with built descriptor, last_* updated', async () => {
    // Force the schedule due
    await db.query(`UPDATE schedules SET next_fire_at = $1 WHERE schedule_id = $2`,
      [utcStamp(-60), scheduleId]);
    builtDescriptors = [];

    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    assert(fired.length === 1, `should fire 1 schedule, fired ${fired.length}`);
    assert(fired[0].queued === true, 'fire should queue a task');
    assert(builtDescriptors.length === 1, 'buildDescriptor called once');

    const { rows: [row] } = await db.query(`SELECT * FROM schedules WHERE schedule_id = $1`, [scheduleId]);
    assert(row.last_task_id != null, 'last_task_id set');
    assert(row.last_fired_at != null, 'last_fired_at set');
    assert(row.next_fire_at > utcStamp(0), `next_fire_at recomputed into the future (got ${row.next_fire_at})`);

    const status = await tasks.getTaskStatus(row.last_task_id, DAMA_TEST_DB);
    assert(status, 'task exists');
    assert(status.worker_path === 'fake_sched_dt/run', 'task worker_path from schedule');
    assert(+status.source_id === 101, 'task source_id from schedule');
    assert(+status.schedule_id === +scheduleId, 'task tagged with schedule_id');
    const d = typeof status.descriptor === 'string' ? JSON.parse(status.descriptor) : status.descriptor;
    assert(d.startDate === '2026-06-01' && d.endDate === '2026-06-07', 'descriptor window from buildDescriptor');
    assert(+status.max_attempts === 3, 'scheduler-created tasks default to max_attempts 3');

    // drain the queued task so later guard tests start clean
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
  });

  await test('sweep does not fire schedules that are not due', async () => {
    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    assert(fired.length === 0, `nothing due, fired ${fired.length}`);
  });

  await test('duplicate guard: max_in_flight reached -> SKIPPED_BUSY event, no new task', async () => {
    // a queued task for the same (source_id, worker_path)
    await db.query(`
      INSERT INTO tasks (host_id, source_id, worker_path, status, descriptor)
      VALUES ($1, 101, 'fake_sched_dt/run', 'queued', $2)
    `, [tasks.hostId, {}]);

    await db.query(`UPDATE schedules SET next_fire_at = $1 WHERE schedule_id = $2`,
      [utcStamp(-60), scheduleId]);

    const before = await db.query(`SELECT COUNT(*) AS n FROM tasks WHERE worker_path = 'fake_sched_dt/run'`);
    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    assert(fired.length === 1, 'schedule was claimed');
    assert(fired[0].queued === false && fired[0].type === 'SKIPPED_BUSY',
      `should be SKIPPED_BUSY, got ${JSON.stringify(fired[0])}`);

    const after = await db.query(`SELECT COUNT(*) AS n FROM tasks WHERE worker_path = 'fake_sched_dt/run'`);
    assert(+after.rows[0].n === +before.rows[0].n, 'no new task queued');

    const ev = await db.query(
      `SELECT * FROM schedule_events WHERE schedule_id = $1 AND type = 'schedule:SKIPPED_BUSY'`, [scheduleId]);
    assert(ev.rows.length >= 1, 'SKIPPED_BUSY schedule_event recorded');

    // clean up the blocking task
    await db.query(`UPDATE tasks SET status = 'error', error = 'drained' WHERE source_id = 101 AND status = 'queued'`);
  });

  await test('preflight refusal -> BLOCKED event, no task', async () => {
    registerDatatype('fake_blocked_dt', {
      workers: { 'fake_blocked_dt/run': async () => ({ ok: true }) },
      schedulables: {
        'fake_blocked_dt/run': {
          label: 'Always blocked',
          async buildDescriptor({ schedule }) { return { reason: 'built' }; },
          async preflight() { return { ok: false, reason: 'budget exceeded' }; },
        },
      },
    });

    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB }, body: { source_id: 102, worker_path: 'fake_blocked_dt/run', cron: '0 2 * * *' } },
      res
    );
    const blockedId = res.body.schedule_id;
    await db.query(`UPDATE schedules SET next_fire_at = $1 WHERE schedule_id = $2`, [utcStamp(-60), blockedId]);

    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    const blockedFire = fired.find((f) => +f.schedule_id === +blockedId);
    assert(blockedFire && blockedFire.queued === false && blockedFire.type === 'BLOCKED',
      `should be BLOCKED, got ${JSON.stringify(fired)}`);
    assert(/budget exceeded/.test(blockedFire.reason), 'reason propagated');

    const ev = await db.query(
      `SELECT * FROM schedule_events WHERE schedule_id = $1 AND type = 'schedule:BLOCKED'`, [blockedId]);
    assert(ev.rows.length === 1, 'BLOCKED schedule_event recorded');

    const t = await db.query(`SELECT COUNT(*) AS n FROM tasks WHERE worker_path = 'fake_blocked_dt/run'`);
    assert(+t.rows[0].n === 0, 'no task queued');
  });

  await test('buildDescriptor failure -> BLOCKED event with error message', async () => {
    registerDatatype('fake_broken_dt', {
      workers: { 'fake_broken_dt/run': async () => ({ ok: true }) },
      schedulables: {
        'fake_broken_dt/run': {
          label: 'Broken builder',
          async buildDescriptor() { throw new Error('no prior view end_date'); },
        },
      },
    });

    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB }, body: { source_id: 103, worker_path: 'fake_broken_dt/run', cron: '0 2 * * *' } },
      res
    );
    const brokenId = res.body.schedule_id;
    await db.query(`UPDATE schedules SET next_fire_at = $1 WHERE schedule_id = $2`, [utcStamp(-60), brokenId]);

    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    const f = fired.find((x) => +x.schedule_id === +brokenId);
    assert(f && f.queued === false && f.type === 'BLOCKED', 'builder failure should BLOCK');
    assert(/no prior view end_date/.test(f.reason), 'error message propagated');
  });

  // ── run-now ──────────────────────────────────────────────────────────────

  await test('POST /schedules/:id/fire queues immediately (run-now)', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules/:id/fire'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, id: scheduleId }, body: {} },
      res
    );
    assert(res.statusCode === 200, `should 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(res.body.queued === true, 'run-now queues');
    assert(res.body.task_id != null, 'returns task_id');

    const status = await tasks.getTaskStatus(res.body.task_id, DAMA_TEST_DB);
    assert(status.status === 'queued', 'task is queued');
    // drain it
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
  });

  await test('POST /schedules/:id/fire requires auth', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/schedules/:id/fire'](
      { params: { pgEnv: DAMA_TEST_DB, id: scheduleId }, body: {} },
      res
    );
    assert(res.statusCode === 401, `should 401, got ${res.statusCode}`);
  });

  // ── runs listing ─────────────────────────────────────────────────────────

  await test('GET /schedules/:id/runs returns tasks + schedule events', async () => {
    const res = mockRes();
    await routes['GET /dama-admin/:pgEnv/schedules/:id/runs'](
      { params: { pgEnv: DAMA_TEST_DB, id: scheduleId }, query: {} },
      res
    );
    assert(res.body && Array.isArray(res.body.tasks), 'returns tasks array');
    assert(res.body.tasks.length >= 2, `sweep + run-now tasks expected, got ${res.body.tasks.length}`);
    assert(Array.isArray(res.body.events), 'returns schedule events array');
    assert(res.body.events.some((e) => e.type === 'schedule:SKIPPED_BUSY'), 'SKIPPED_BUSY visible in runs');
  });

  // ── re-run with same descriptor ──────────────────────────────────────────

  await test('POST /tasks/:taskId/rerun requires auth', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/tasks/:taskId/rerun'](
      { params: { pgEnv: DAMA_TEST_DB, taskId: 1 }, body: {} },
      res
    );
    assert(res.statusCode === 401, `should 401 without user, got ${res.statusCode}`);
  });

  await test('POST /tasks/:taskId/rerun re-queues the stored descriptor with max_attempts 1', async () => {
    // queue + drain an original task carrying a marker descriptor
    const origId = await tasks.queueTask(
      { workerPath: 'fake_sched_dt/run', sourceId: 101, marker: 'rerun-me', max_attempts: 3 },
      DAMA_TEST_DB);
    let claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/tasks/:taskId/rerun'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, taskId: origId }, body: {} },
      res
    );
    assert(res.statusCode === 200, `should 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert(res.body.queued === true, 'rerun queues');
    assert(res.body.task_id != null && +res.body.task_id !== +origId, 'NEW task created');
    assert(+res.body.rerun_of === +origId, 'reports the original task');

    const rerun = await tasks.getTaskStatus(res.body.task_id, DAMA_TEST_DB);
    assert(rerun.worker_path === 'fake_sched_dt/run', 'same worker_path');
    assert(+rerun.source_id === 101, 'same source_id');
    assert(+rerun.max_attempts === 1, `re-runs are single-attempt, got ${rerun.max_attempts}`);
    const d = typeof rerun.descriptor === 'string' ? JSON.parse(rerun.descriptor) : rerun.descriptor;
    assert(d.marker === 'rerun-me', 'descriptor preserved verbatim');
    assert(+d.rerun_of === +origId, 'descriptor carries rerun_of provenance');

    // drain the rerun task so later tests start clean
    claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
  });

  await test('POST /tasks/:taskId/rerun 404s on unknown task', async () => {
    const res = mockRes();
    await routes['POST /dama-admin/:pgEnv/tasks/:taskId/rerun'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, taskId: 9999999 }, body: {} },
      res
    );
    assert(res.statusCode === 404, `should 404, got ${res.statusCode}`);
  });

  // ── PATCH / disable / DELETE ────────────────────────────────────────────

  await test('PATCH /schedules/:id disables; sweep skips disabled', async () => {
    const res = mockRes();
    await routes['PATCH /dama-admin/:pgEnv/schedules/:id'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, id: scheduleId }, body: { enabled: false } },
      res
    );
    assert(res.statusCode === 200, `should 200, got ${res.statusCode}`);
    assert(res.body.enabled === false || res.body.enabled === 0, 'enabled false');

    await db.query(`UPDATE schedules SET next_fire_at = $1 WHERE schedule_id = $2`, [utcStamp(-60), scheduleId]);
    const fired = await schedules.sweepDueSchedules(DAMA_TEST_DB);
    assert(!fired.some((f) => +f.schedule_id === +scheduleId), 'disabled schedule not fired');
  });

  await test('PATCH /schedules/:id cron change recomputes next_fire_at', async () => {
    const res = mockRes();
    await routes['PATCH /dama-admin/:pgEnv/schedules/:id'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, id: scheduleId }, body: { cron: '30 5 * * *', enabled: true } },
      res
    );
    assert(res.statusCode === 200, 'should 200');
    assert(res.body.cron === '30 5 * * *', 'cron updated');
    assert(res.body.next_fire_at > utcStamp(0), 'next_fire_at in the future');
  });

  await test('DELETE /schedules/:id removes the schedule', async () => {
    const res = mockRes();
    await routes['DELETE /dama-admin/:pgEnv/schedules/:id'](
      { ...AUTHED, params: { pgEnv: DAMA_TEST_DB, id: scheduleId } },
      res
    );
    assert(res.statusCode === 200, `should 200, got ${res.statusCode}`);
    const { rows } = await db.query(`SELECT * FROM schedules WHERE schedule_id = $1`, [scheduleId]);
    assert(rows.length === 0, 'schedule gone');
  });

  // ── transient-error retry (P5 hardening) ────────────────────────────────

  await test('transient error requeues with same descriptor up to max_attempts', async () => {
    let calls = 0;
    tasks.registerHandler('test/transient', async (ctx) => {
      calls++;
      if (calls < 3) throw new Error('socket hang up');
      const d = typeof ctx.task.descriptor === 'string'
        ? JSON.parse(ctx.task.descriptor) : (ctx.task.descriptor || {});
      return { ok: true, calls, marker: d.marker };
    });

    const taskId = await tasks.queueTask(
      { workerPath: 'test/transient', max_attempts: 3, marker: 'keepme' }, DAMA_TEST_DB);

    // claim/run loop — requeue happens inside startTaskWorker
    for (let i = 0; i < 5; i++) {
      const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
      if (!claimed) break;
      await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
    }

    assert(calls === 3, `handler should run 3 times, ran ${calls}`);
    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'done', `should succeed on 3rd attempt, got ${final.status}`);
    assert(+final.attempt === 3, `attempt should be 3, got ${final.attempt}`);
    const result = typeof final.result === 'string' ? JSON.parse(final.result) : final.result;
    assert(result.marker === 'keepme', 'descriptor preserved across retries');

    const events = await tasks.getTaskEvents(taskId, DAMA_TEST_DB);
    assert(events.filter((e) => e.type === 'retry').length === 2, 'retry events recorded');
  });

  await test('transient error errors out at max_attempts', async () => {
    let calls = 0;
    tasks.registerHandler('test/transient-fatal', async () => {
      calls++;
      throw new Error('read ECONNRESET');
    });

    const taskId = await tasks.queueTask(
      { workerPath: 'test/transient-fatal', max_attempts: 2 }, DAMA_TEST_DB);

    for (let i = 0; i < 5; i++) {
      const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
      if (!claimed) break;
      await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
    }

    assert(calls === 2, `handler should run exactly 2 times, ran ${calls}`);
    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'error', `should be error, got ${final.status}`);
    assert(/ECONNRESET/.test(final.error), 'error preserved');
  });

  await test('non-transient error never retries (default max_attempts 1 unchanged)', async () => {
    let calls = 0;
    tasks.registerHandler('test/fatal', async () => {
      calls++;
      throw new Error('column does not exist');
    });

    const taskId = await tasks.queueTask({ workerPath: 'test/fatal', max_attempts: 3 }, DAMA_TEST_DB);
    for (let i = 0; i < 4; i++) {
      const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
      if (!claimed) break;
      await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
    }
    assert(calls === 1, `non-transient should not retry, ran ${calls}`);
    const final = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(final.status === 'error', 'errors immediately');

    // and a plain queueTask without max_attempts defaults to 1 even for transient errors
    let calls2 = 0;
    tasks.registerHandler('test/transient-default', async () => {
      calls2++;
      throw new Error('socket hang up');
    });
    const t2 = await tasks.queueTask({ workerPath: 'test/transient-default' }, DAMA_TEST_DB);
    for (let i = 0; i < 3; i++) {
      const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
      if (!claimed) break;
      await tasks.startTaskWorker(claimed, DAMA_TEST_DB);
    }
    assert(calls2 === 1, `default max_attempts=1 should not retry, ran ${calls2}`);
    const f2 = await tasks.getTaskStatus(t2, DAMA_TEST_DB);
    assert(f2.status === 'error', 'errors without retry');
  });

  // --- summary ---

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
