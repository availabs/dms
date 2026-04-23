/**
 * DMS task runner — DMS-side counterpart to `dama/tasks`.
 *
 * Mirrors the DAMA task module exactly so consumers see the same surface
 * (registerHandler / queueTask / claimNextTask / startTaskWorker / events /
 * polling / stalled-task recovery). Two intentional deltas:
 *
 *   1. Target db is the DMS db (resolved from process.env.DMS_DB_ENV) instead
 *      of a DAMA pgEnv. There is exactly one DMS db per server process, so
 *      the public functions don't take a pgEnv argument.
 *   2. Tasks carry an `app` column. DAMA puts one task table per pgEnv, so it
 *      doesn't need app scoping. DMS shares one db across many apps, so the
 *      admin UIs filter by app.
 *
 * Host isolation, row-level locking, child-process workers, and the event
 * model are all identical to DAMA. The `hostId` is shared with the DAMA
 * module — both systems run in the same server process.
 */

const { getDb } = require('../../db');
const { hostId } = require('../../dama/tasks/host-id');

// Registry: workerPath -> async handler function
const handlers = {};

// Polling state — at most one interval (we only have one DMS db)
let pollingInterval = null;
const POLL_INTERVAL_MS = parseInt(process.env.DMS_TASK_POLL_INTERVAL, 10)
  || parseInt(process.env.DAMA_TASK_POLL_INTERVAL, 10)
  || 5000;

function dmsDbEnv() {
  return process.env.DMS_DB_ENV || 'dms-sqlite';
}

function db() {
  return getDb(dmsDbEnv());
}

function taskTable(dbType) {
  return dbType === 'postgres' ? 'dms.tasks' : 'dms_tasks';
}

function eventTable(dbType) {
  return dbType === 'postgres' ? 'dms.task_events' : 'dms_task_events';
}

function nowExpr(dbType) {
  return dbType === 'postgres' ? 'NOW()' : "datetime('now')";
}

/**
 * Register a handler function for a given worker path.
 * When a task with this worker_path is claimed, the handler is called.
 */
function registerHandler(workerPath, handler) {
  handlers[workerPath] = handler;
}

/**
 * Queue a new task. Returns the task_id.
 * @param {Object} descriptor - Must include `workerPath`. Optional: `app`, `sourceId`.
 * @returns {Promise<number>} task_id
 */
async function queueTask(descriptor) {
  const d = db();
  const table = taskTable(d.type);

  const { workerPath, app = null, sourceId = null } = descriptor;
  if (!workerPath) throw new Error('Task descriptor must include workerPath');

  const { rows } = await d.query(`
    INSERT INTO ${table} (host_id, app, source_id, worker_path, status, descriptor)
    VALUES ($1, $2, $3, $4, 'queued', $5)
    RETURNING task_id
  `, [hostId, app, sourceId, workerPath, descriptor]);

  const taskId = rows[0].task_id;
  console.log(`[dms-tasks] Queued task ${taskId}: ${workerPath} (app: ${app || 'none'}, source: ${sourceId || 'none'})`);
  await dispatchEvent(taskId, 'queued', `Task ${taskId} queued`, descriptor);

  startPolling();

  return taskId;
}

/**
 * Claim a specific task by ID. Sets status to running.
 * Returns the task row or null if already claimed/not found.
 */
async function claimTaskById(taskId) {
  const d = db();
  const table = taskTable(d.type);

  const { rows } = await d.query(`
    UPDATE ${table}
    SET status = 'running', started_at = ${nowExpr(d.type)}, worker_pid = $1
    WHERE task_id = $2 AND status = 'queued' AND host_id = $3
    RETURNING *
  `, [process.pid, taskId, hostId]);

  const task = rows[0] || null;
  if (task) {
    console.log(`[dms-tasks] Claimed task ${taskId} (${task.worker_path})`);
  } else {
    console.warn(`[dms-tasks] Could not claim task ${taskId} — already claimed or not found`);
  }
  return task;
}

/**
 * Claim the next queued task for this host. Returns the task row or null.
 * Uses row-level locking (PG: FOR UPDATE SKIP LOCKED, SQLite: BEGIN IMMEDIATE).
 */
async function claimNextTask() {
  const d = db();
  const table = taskTable(d.type);

  if (d.type === 'postgres') {
    const { rows } = await d.query(`
      UPDATE ${table}
      SET status = 'running', started_at = NOW(), worker_pid = $1
      WHERE task_id = (
        SELECT task_id FROM ${table}
        WHERE status = 'queued' AND host_id = $2
        ORDER BY queued_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `, [process.pid, hostId]);

    return rows[0] || null;
  }

  // SQLite: BEGIN IMMEDIATE for exclusive write lock
  const rawDb = d.getPool();
  rawDb.exec('BEGIN IMMEDIATE');
  try {
    const selectResult = await d.query(`
      SELECT task_id FROM ${table}
      WHERE status = 'queued' AND host_id = $1
      ORDER BY queued_at ASC
      LIMIT 1
    `, [hostId]);

    if (selectResult.rows.length === 0) {
      rawDb.exec('COMMIT');
      return null;
    }

    const taskId = selectResult.rows[0].task_id;
    const { rows } = await d.query(`
      UPDATE ${table}
      SET status = 'running', started_at = datetime('now'), worker_pid = $1
      WHERE task_id = $2
      RETURNING *
    `, [process.pid, taskId]);

    rawDb.exec('COMMIT');
    return rows[0] || null;
  } catch (err) {
    rawDb.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Execute a claimed task's handler and manage its lifecycle.
 */
async function startTaskWorker(task) {
  const { task_id, worker_path } = task;
  console.log(`[dms-tasks] Starting worker for task ${task_id}: ${worker_path}`);
  const handler = handlers[worker_path];

  if (!handler) {
    await failTask(task_id, `No handler registered for worker_path: ${worker_path}`);
    return;
  }

  const context = {
    task,
    db: db(),
    dispatchEvent: (type, message, payload) => dispatchEvent(task_id, type, message, payload),
    updateProgress: (progress) => updateTaskProgress(task_id, progress),
  };

  await dispatchEvent(task_id, 'started', 'Worker started', null);

  try {
    const result = await handler(context);
    await completeTask(task_id, result);
  } catch (err) {
    await failTask(task_id, err.message || String(err));
  }
}

/**
 * Insert a task event.
 */
async function dispatchEvent(taskId, type, message, payload) {
  const d = db();
  const table = eventTable(d.type);

  await d.query(`
    INSERT INTO ${table} (task_id, type, message, payload)
    VALUES ($1, $2, $3, $4)
  `, [taskId, type, message, payload]);
}

/**
 * Update task progress (0-1).
 */
async function updateTaskProgress(taskId, progress) {
  const d = db();
  const table = taskTable(d.type);

  await d.query(`UPDATE ${table} SET progress = $1 WHERE task_id = $2`, [progress, taskId]);
}

/**
 * Mark task as done with result.
 */
async function completeTask(taskId, result) {
  const d = db();
  const table = taskTable(d.type);

  await d.query(`
    UPDATE ${table}
    SET status = 'done', result = $1, progress = 1, completed_at = ${nowExpr(d.type)}
    WHERE task_id = $2
  `, [result, taskId]);

  console.log(`[dms-tasks] Task ${taskId} completed`);
  await dispatchEvent(taskId, 'done', 'Task completed', result);
}

/**
 * Mark task as failed with error message.
 */
async function failTask(taskId, error) {
  const d = db();
  const table = taskTable(d.type);

  await d.query(`
    UPDATE ${table}
    SET status = 'error', error = $1, completed_at = ${nowExpr(d.type)}
    WHERE task_id = $2
  `, [error, taskId]);

  console.error(`[dms-tasks] Task ${taskId} failed: ${error}`);
  await dispatchEvent(taskId, 'error', error, null);
}

/**
 * Get a task by ID.
 */
async function getTaskStatus(taskId) {
  const d = db();
  const table = taskTable(d.type);

  const { rows } = await d.query(`SELECT * FROM ${table} WHERE task_id = $1`, [taskId]);
  return rows[0] || null;
}

/**
 * Get events for a task, optionally since a given event ID.
 */
async function getTaskEvents(taskId, sinceEventId = 0) {
  const d = db();
  const table = eventTable(d.type);

  const { rows } = await d.query(`
    SELECT * FROM ${table}
    WHERE task_id = $1 AND event_id > $2
    ORDER BY event_id ASC
  `, [taskId, sinceEventId]);

  return rows;
}

/**
 * On startup, mark any tasks stuck in 'running' for this host as errors.
 * These are tasks whose worker process died (server restart, OOM, etc.).
 */
async function recoverStalledTasks() {
  const d = db();
  const table = taskTable(d.type);

  const { rows } = await d.query(`
    UPDATE ${table}
    SET status = 'error',
        error = 'Server restarted while task was running',
        completed_at = ${nowExpr(d.type)}
    WHERE status = 'running' AND host_id = $1
    RETURNING task_id
  `, [hostId]);

  for (const row of rows) {
    await dispatchEvent(row.task_id, 'error', 'Server restarted while task was running', null);
  }

  if (rows.length > 0) {
    console.log(`[dms-tasks] Recovered ${rows.length} stalled task(s): ${rows.map(r => r.task_id).join(', ')}`);
  }
}

/**
 * Start polling for queued DMS tasks. Idempotent.
 */
function startPolling() {
  if (pollingInterval) return;

  if (Object.keys(handlers).length === 0) {
    console.log('[dms-tasks] No handlers registered, skipping polling');
    return;
  }

  console.log(`[dms-tasks] Polling every ${POLL_INTERVAL_MS}ms (host: ${hostId.slice(0, 8)}...)`);

  pollingInterval = setInterval(async () => {
    try {
      const task = await claimNextTask();
      if (task) {
        console.log(`[dms-tasks] Claimed task ${task.task_id}: ${task.worker_path}`);
        startTaskWorker(task);
      }
    } catch (err) {
      console.error(`[dms-tasks] Poll error:`, err.message);
    }
  }, POLL_INTERVAL_MS);

  pollingInterval.unref();
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Convenience: create a task row, run `fn` inline, mark done/error based on
 * outcome. The caller's HTTP handler stays simple — just wrap the work in
 * runInlineTask and let the task module record everything.
 *
 * The handler shape mirrors registered worker handlers (passes the same
 * context with dispatchEvent / updateProgress) so code can move to a
 * registered/forked worker later with no signature change.
 *
 * @param {Object} descriptor - { workerPath, app, sourceId, ... }
 * @param {(ctx: { dispatchEvent, updateProgress }) => Promise<*>} fn
 * @returns {Promise<{ taskId: number, result: * }>}
 */
async function runInlineTask(descriptor, fn) {
  const taskId = await queueTask(descriptor);
  const claimed = await claimTaskById(taskId);
  if (!claimed) {
    throw new Error(`runInlineTask: could not claim task ${taskId}`);
  }
  await dispatchEvent(taskId, 'started', 'Inline worker started', null);

  // Per-task log tag so multiple concurrent runs are distinguishable in stdout
  // (mirrors DAMA's `[task:NNNN]` worker-runner prefix). The `log()` helper
  // both prints and dispatches a 'log' event, matching how DAMA's
  // worker-runner captures forked-process stdout into task_events.
  const tag = `[dms-task ${taskId} ${descriptor.workerPath}]`;
  const start = Date.now();
  console.log(`${tag} started`, descriptor.app ? `app=${descriptor.app}` : '', descriptor.sourceId ? `source=${descriptor.sourceId}` : '');

  const log = (msg, payload) => {
    console.log(`${tag} ${msg}`);
    // Best-effort fire-and-forget — don't await so the work loop isn't slowed
    // by event-table writes. If the dispatch fails (e.g. db hiccup), surface
    // it on stderr but keep going.
    dispatchEvent(taskId, 'log', msg, payload || null).catch(e =>
      console.error(`${tag} failed to dispatch log event: ${e.message}`)
    );
  };

  try {
    const ctx = {
      taskId,
      tag,
      log,
      dispatchEvent: (type, message, payload) => dispatchEvent(taskId, type, message, payload),
      updateProgress: (progress) => updateTaskProgress(taskId, progress),
    };
    const result = await fn(ctx);
    const elapsed = Date.now() - start;
    console.log(`${tag} completed in ${elapsed}ms`);
    await completeTask(taskId, result);
    return { taskId, result };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`${tag} FAILED after ${elapsed}ms: ${err.message}`);
    if (err.stack) console.error(err.stack);
    await failTask(taskId, err.message || String(err));
    throw err;
  }
}

module.exports = {
  hostId,
  registerHandler,
  queueTask,
  claimTaskById,
  claimNextTask,
  startTaskWorker,
  dispatchEvent,
  updateTaskProgress,
  completeTask,
  failTask,
  getTaskStatus,
  getTaskEvents,
  recoverStalledTasks,
  startPolling,
  stopPolling,
  runInlineTask,
};
