/**
 * Schedule sweep — cron-driven firing of data-type loader tasks.
 *
 * Schedules live in data_manager.schedules (sqlite: schedules). Each row
 * carries a 5-field cron + IANA timezone + a descriptor TEMPLATE; at fire
 * time the registered schedulable's buildDescriptor() turns the template
 * into a concrete, self-contained task descriptor (window fields filled
 * from prior state), then the task is queued through the normal task system.
 *
 * Design notes (see planning/tasks/current/datatype-download-scheduling.md):
 * - All schedule timestamps (next_fire_at / last_fired_at) are stored as
 *   UTC 'YYYY-MM-DD HH:MM:SS' wall-clock strings and compared against a
 *   JS-computed UTC now — identical semantics on postgres TIMESTAMP and
 *   sqlite TEXT, independent of server timezone.
 * - Due-row claim: postgres uses a single atomic
 *   `UPDATE ... WHERE schedule_id IN (SELECT ... FOR UPDATE SKIP LOCKED)`
 *   that nulls next_fire_at (multi-host safe); sqlite uses a plain
 *   BEGIN IMMEDIATE transaction (single-writer database — no SKIP LOCKED
 *   equivalent, and none needed).
 * - Fires that do NOT create a task (duplicate guard, preflight refusal,
 *   buildDescriptor failure) are recorded in data_manager.schedule_events
 *   (schedule-scoped — task_events requires a task row) and surfaced via
 *   GET /schedules/:id/runs alongside the task list.
 * - Scheduler-created tasks default to max_attempts=3 (transient-error
 *   retry in startTaskWorker); manual queueTask stays at 1.
 */

const { CronExpressionParser } = require('cron-parser');

const { getDb } = require('../../db');
const { queueTask } = require('./index');

const SWEEP_INTERVAL_MS = parseInt(process.env.DAMA_SCHEDULE_SWEEP_INTERVAL, 10) || 30000;
const SCHEDULER_MAX_ATTEMPTS_DEFAULT = 3;

const sweepIntervals = {};

function scheduleTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.schedules' : 'schedules';
}

function scheduleEventTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.schedule_events' : 'schedule_events';
}

function taskTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.tasks' : 'tasks';
}

/** UTC wall-clock 'YYYY-MM-DD HH:MM:SS' — the storage format for all schedule timestamps. */
function utcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Next fire instant for a cron expression in an IANA timezone, as a UTC
 * 'YYYY-MM-DD HH:MM:SS' string. Throws on invalid cron/timezone.
 */
function computeNextFireAt(cron, timezone = 'America/New_York', from = new Date()) {
  const interval = CronExpressionParser.parse(cron, { tz: timezone, currentDate: from });
  return utcNow(interval.next().toDate());
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

/** Normalize a schedule row: descriptor as object, enabled as boolean. */
function normalizeSchedule(row) {
  if (!row) return row;
  return {
    ...row,
    descriptor: parseJson(row.descriptor, {}),
    enabled: row.enabled === true || row.enabled === 1,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

async function createSchedule(values, pgEnv) {
  const db = getDb(pgEnv);
  const table = scheduleTable(db.type);
  const {
    source_id = null, worker_path, cron, timezone = 'America/New_York',
    descriptor = {}, enabled = true, max_in_flight = 1, created_by = null,
  } = values;

  if (!worker_path) throw new Error('worker_path is required');
  if (!cron) throw new Error('cron is required');

  const nextFireAt = enabled ? computeNextFireAt(cron, timezone) : null;
  const enabledVal = db.type === 'postgres' ? !!enabled : (enabled ? 1 : 0);

  const { rows } = await db.query(`
    INSERT INTO ${table}
      (source_id, worker_path, cron, timezone, descriptor, enabled, max_in_flight, next_fire_at, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [source_id, worker_path, cron, timezone, descriptor, enabledVal,
    Math.max(1, Number(max_in_flight) || 1), nextFireAt, created_by]);

  return normalizeSchedule(rows[0]);
}

async function getSchedule(scheduleId, pgEnv) {
  const db = getDb(pgEnv);
  const { rows } = await db.query(
    `SELECT * FROM ${scheduleTable(db.type)} WHERE schedule_id = $1`, [scheduleId]);
  return normalizeSchedule(rows[0] || null);
}

async function listSchedules(pgEnv, { source_id } = {}) {
  const db = getDb(pgEnv);
  const table = scheduleTable(db.type);
  const { rows } = source_id != null
    ? await db.query(`SELECT * FROM ${table} WHERE source_id = $1 ORDER BY schedule_id`, [source_id])
    : await db.query(`SELECT * FROM ${table} ORDER BY schedule_id`);
  return rows.map(normalizeSchedule);
}

/**
 * Partial update. Recomputes next_fire_at when cron/timezone change or the
 * schedule is (re-)enabled; clears it when disabled.
 */
async function updateSchedule(scheduleId, patch, pgEnv) {
  const db = getDb(pgEnv);
  const table = scheduleTable(db.type);

  const current = await getSchedule(scheduleId, pgEnv);
  if (!current) return null;

  const next = {
    source_id: patch.source_id !== undefined ? patch.source_id : current.source_id,
    cron: patch.cron !== undefined ? patch.cron : current.cron,
    timezone: patch.timezone !== undefined ? patch.timezone : current.timezone,
    descriptor: patch.descriptor !== undefined ? patch.descriptor : current.descriptor,
    enabled: patch.enabled !== undefined ? !!patch.enabled : current.enabled,
    max_in_flight: patch.max_in_flight !== undefined
      ? Math.max(1, Number(patch.max_in_flight) || 1) : current.max_in_flight,
  };

  const cadenceChanged = next.cron !== current.cron || next.timezone !== current.timezone;
  const reEnabled = next.enabled && !current.enabled;
  let nextFireAt = current.next_fire_at;
  if (!next.enabled) nextFireAt = null;
  else if (cadenceChanged || reEnabled || !nextFireAt) {
    nextFireAt = computeNextFireAt(next.cron, next.timezone);
  }

  const enabledVal = db.type === 'postgres' ? next.enabled : (next.enabled ? 1 : 0);
  const { rows } = await db.query(`
    UPDATE ${table}
    SET source_id = $1, cron = $2, timezone = $3, descriptor = $4, enabled = $5,
        max_in_flight = $6, next_fire_at = $7, updated_at = $8
    WHERE schedule_id = $9
    RETURNING *
  `, [next.source_id, next.cron, next.timezone, next.descriptor, enabledVal,
    next.max_in_flight, nextFireAt, utcNow(), scheduleId]);

  return normalizeSchedule(rows[0] || null);
}

async function deleteSchedule(scheduleId, pgEnv) {
  const db = getDb(pgEnv);
  // Manual cascade for sqlite (foreign_keys pragma is off by default there).
  await db.query(`DELETE FROM ${scheduleEventTable(db.type)} WHERE schedule_id = $1`, [scheduleId]);
  const { rows } = await db.query(
    `DELETE FROM ${scheduleTable(db.type)} WHERE schedule_id = $1 RETURNING schedule_id`, [scheduleId]);
  return rows.length > 0;
}

// ── schedule-scoped events ──────────────────────────────────────────────────

async function recordScheduleEvent(scheduleId, type, message, payload, pgEnv) {
  const db = getDb(pgEnv);
  await db.query(`
    INSERT INTO ${scheduleEventTable(db.type)} (schedule_id, type, message, payload)
    VALUES ($1, $2, $3, $4)
  `, [scheduleId, type, message, payload || null]);
}

async function getScheduleEvents(scheduleId, pgEnv) {
  const db = getDb(pgEnv);
  const { rows } = await db.query(`
    SELECT * FROM ${scheduleEventTable(db.type)}
    WHERE schedule_id = $1 ORDER BY event_id DESC
  `, [scheduleId]);
  return rows;
}

/** Tasks created by a schedule (newest first) — the Runs listing. */
async function getScheduleRuns(scheduleId, pgEnv) {
  const db = getDb(pgEnv);
  const { rows: tasks } = await db.query(`
    SELECT * FROM ${taskTable(db.type)}
    WHERE schedule_id = $1 ORDER BY task_id DESC
  `, [scheduleId]);
  const events = await getScheduleEvents(scheduleId, pgEnv);
  return { tasks, events };
}

// ── firing ──────────────────────────────────────────────────────────────────

/**
 * Fire one schedule: duplicate guard → buildDescriptor → preflight → queueTask.
 * Returns { schedule_id, queued, task_id? , type?, reason? } where type is
 * 'SKIPPED_BUSY' | 'BLOCKED' when queued === false.
 */
async function fireSchedule(schedule, pgEnv, { manual = false } = {}) {
  const db = getDb(pgEnv);
  const sched = normalizeSchedule(schedule);
  const { schedule_id, source_id, worker_path } = sched;

  // (a) duplicate guard — queued/running tasks for (source_id, worker_path)
  const nullSafeEq = db.type === 'postgres' ? 'IS NOT DISTINCT FROM' : 'IS';
  const { rows: [{ n: inFlight }] } = await db.query(`
    SELECT COUNT(*) AS n FROM ${taskTable(db.type)}
    WHERE worker_path = $1 AND source_id ${nullSafeEq} $2 AND status IN ('queued', 'running')
  `, [worker_path, source_id]);

  if (Number(inFlight) >= Number(sched.max_in_flight || 1)) {
    const reason = `${inFlight} run(s) still queued/running for ${worker_path} (max_in_flight ${sched.max_in_flight})`;
    await recordScheduleEvent(schedule_id, 'schedule:SKIPPED_BUSY', reason,
      { worker_path, source_id, in_flight: Number(inFlight), manual }, pgEnv);
    return { schedule_id, queued: false, type: 'SKIPPED_BUSY', reason };
  }

  // (b) build the concrete descriptor via the registered schedulable
  const { getSchedulables } = require('../datatypes');
  const schedulable = getSchedulables()[worker_path];
  if (!schedulable) {
    const reason = `No schedulable registered for worker_path: ${worker_path}`;
    await recordScheduleEvent(schedule_id, 'schedule:BLOCKED', reason, { worker_path, manual }, pgEnv);
    return { schedule_id, queued: false, type: 'BLOCKED', reason };
  }

  let descriptor;
  try {
    descriptor = await schedulable.buildDescriptor({ schedule: sched, db, pgEnv });
  } catch (err) {
    const reason = `buildDescriptor failed: ${err.message || err}`;
    await recordScheduleEvent(schedule_id, 'schedule:BLOCKED', reason, { worker_path, manual }, pgEnv);
    return { schedule_id, queued: false, type: 'BLOCKED', reason };
  }

  // (c) optional preflight guard (e.g. RITIS daily budget, date-gap check)
  if (typeof schedulable.preflight === 'function') {
    let verdict;
    try {
      verdict = await schedulable.preflight({ schedule: sched, descriptor, db, pgEnv });
    } catch (err) {
      verdict = { ok: false, reason: `preflight failed: ${err.message || err}` };
    }
    if (!verdict || verdict.ok !== true) {
      const reason = (verdict && verdict.reason) || 'preflight refused the fire';
      await recordScheduleEvent(schedule_id, 'schedule:BLOCKED', reason,
        { worker_path, descriptor, manual }, pgEnv);
      return { schedule_id, queued: false, type: 'BLOCKED', reason };
    }
  }

  // (d) queue through the normal task system
  const taskId = await queueTask({
    ...descriptor,
    workerPath: worker_path,
    sourceId: descriptor.sourceId ?? source_id,
    schedule_id,
    max_attempts: descriptor.max_attempts ?? SCHEDULER_MAX_ATTEMPTS_DEFAULT,
  }, pgEnv);

  // (e) bookkeeping
  await db.query(`
    UPDATE ${scheduleTable(db.type)}
    SET last_task_id = $1, last_fired_at = $2, updated_at = $2
    WHERE schedule_id = $3
  `, [taskId, utcNow(), schedule_id]);

  return { schedule_id, queued: true, task_id: taskId };
}

/**
 * Claim all due schedules (enabled, next_fire_at <= now). Claiming nulls
 * next_fire_at so no other host/tick can double-claim; the sweep recomputes
 * it immediately after.
 */
async function claimDueSchedules(pgEnv) {
  const db = getDb(pgEnv);
  const table = scheduleTable(db.type);
  const now = utcNow();

  if (db.type === 'postgres') {
    const { rows } = await db.query(`
      UPDATE ${table}
      SET next_fire_at = NULL
      WHERE schedule_id IN (
        SELECT schedule_id FROM ${table}
        WHERE enabled AND next_fire_at IS NOT NULL AND next_fire_at <= $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `, [now]);
    return rows;
  }

  // SQLite: plain BEGIN IMMEDIATE transaction — single-writer database, so a
  // write lock is the whole story (no SKIP LOCKED equivalent, none needed).
  const rawDb = db.getPool();
  rawDb.exec('BEGIN IMMEDIATE');
  try {
    const { rows } = await db.query(`
      SELECT * FROM ${table}
      WHERE enabled = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= $1
    `, [now]);
    if (rows.length > 0) {
      const ids = rows.map((r) => r.schedule_id);
      await db.query(
        `UPDATE ${table} SET next_fire_at = NULL WHERE schedule_id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`,
        ids);
    }
    rawDb.exec('COMMIT');
    return rows;
  } catch (err) {
    rawDb.exec('ROLLBACK');
    throw err;
  }
}

/**
 * One sweep tick: claim due schedules, advance their next_fire_at, fire each.
 * Returns the per-schedule fire results (for tests/observability).
 */
async function sweepDueSchedules(pgEnv) {
  const db = getDb(pgEnv);
  const table = scheduleTable(db.type);

  const due = await claimDueSchedules(pgEnv);
  const results = [];

  for (const row of due) {
    // Advance next_fire_at BEFORE firing so a crash mid-fire can't wedge the
    // schedule into firing on every subsequent tick.
    try {
      const nextFireAt = computeNextFireAt(row.cron, row.timezone);
      await db.query(
        `UPDATE ${table} SET next_fire_at = $1, updated_at = $2 WHERE schedule_id = $3`,
        [nextFireAt, utcNow(), row.schedule_id]);
    } catch (err) {
      // Unparseable cron — leave next_fire_at NULL (paused) and record it.
      await recordScheduleEvent(row.schedule_id, 'schedule:ERROR',
        `Could not compute next fire time: ${err.message || err}`, { cron: row.cron, timezone: row.timezone }, pgEnv);
      results.push({ schedule_id: row.schedule_id, queued: false, type: 'ERROR', reason: String(err.message || err) });
      continue;
    }

    try {
      results.push(await fireSchedule(row, pgEnv));
    } catch (err) {
      console.error(`[schedules] Fire failed for schedule ${row.schedule_id} (${pgEnv}):`, err.message);
      await recordScheduleEvent(row.schedule_id, 'schedule:ERROR',
        `Fire failed: ${err.message || err}`, null, pgEnv);
      results.push({ schedule_id: row.schedule_id, queued: false, type: 'ERROR', reason: String(err.message || err) });
    }
  }

  return results;
}

// ── sweep loop ──────────────────────────────────────────────────────────────

/** Start the periodic due-schedule sweep for a pgEnv (one per env). */
function startScheduleSweep(pgEnv) {
  if (sweepIntervals[pgEnv]) return;

  console.log(`[schedules] Sweeping ${pgEnv} every ${SWEEP_INTERVAL_MS}ms`);
  sweepIntervals[pgEnv] = setInterval(async () => {
    try {
      await sweepDueSchedules(pgEnv);
    } catch (err) {
      console.error(`[schedules] Sweep error (${pgEnv}):`, err.message);
    }
  }, SWEEP_INTERVAL_MS);
  sweepIntervals[pgEnv].unref();
}

function stopScheduleSweep(pgEnv) {
  if (pgEnv) {
    if (sweepIntervals[pgEnv]) {
      clearInterval(sweepIntervals[pgEnv]);
      delete sweepIntervals[pgEnv];
    }
  } else {
    for (const [env, interval] of Object.entries(sweepIntervals)) {
      clearInterval(interval);
      delete sweepIntervals[env];
    }
  }
}

module.exports = {
  computeNextFireAt,
  utcNow,
  createSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
  deleteSchedule,
  recordScheduleEvent,
  getScheduleEvents,
  getScheduleRuns,
  fireSchedule,
  claimDueSchedules,
  sweepDueSchedules,
  startScheduleSweep,
  stopScheduleSweep,
};
