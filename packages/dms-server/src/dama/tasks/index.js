/**
 * Task runner — database-backed task queue for long-running ETL operations.
 *
 * Replaces the legacy pg-boss system. Key guarantees:
 * - Host isolation: tasks only run on the server that queued them
 * - Idempotent execution: row-level locking prevents duplicate execution
 * - Event tracking: progress events persisted for client polling
 */

const { getDb } = require('../../db');
const { hostId } = require('./host-id');

// Registry: workerPath -> async handler function
const handlers = {};

// Polling state — one interval per pgEnv
const pollingIntervals = {};
const POLL_INTERVAL_MS = parseInt(process.env.DAMA_TASK_POLL_INTERVAL, 10) || 5000;

function taskTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.tasks' : 'tasks';
}

function eventTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.task_events' : 'task_events';
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
 * @param {Object} descriptor - Must include `workerPath`. Optional: `sourceId`.
 * @param {string} pgEnv - Database environment name
 * @returns {number} task_id
 */
async function queueTask(descriptor, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  const { workerPath, sourceId = null } = descriptor;
  if (!workerPath) throw new Error('Task descriptor must include workerPath');

  const { rows } = await db.query(`
    INSERT INTO ${table} (host_id, source_id, worker_path, status, descriptor)
    VALUES ($1, $2, $3, 'queued', $4)
    RETURNING task_id
  `, [hostId, sourceId, workerPath, descriptor]);

  const taskId = rows[0].task_id;
  console.log(`[tasks] Queued task ${taskId}: ${workerPath} (pgEnv: ${pgEnv}, source: ${sourceId || 'none'})`);
  await dispatchEvent(taskId, 'queued', `Task ${taskId} queued`, descriptor, pgEnv);

  // Ensure polling is running for this pgEnv so the task gets picked up
  startPolling(pgEnv);

  return taskId;
}

/**
 * Claim a specific task by ID. Sets status to running.
 * Returns the task row or null if already claimed/not found.
 */
async function claimTaskById(taskId, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);
  const now = db.type === 'postgres' ? 'NOW()' : "datetime('now')";

  const { rows } = await db.query(`
    UPDATE ${table}
    SET status = 'running', started_at = ${now}, worker_pid = $1
    WHERE task_id = $2 AND status = 'queued' AND host_id = $3
    RETURNING *
  `, [process.pid, taskId, hostId]);

  const task = rows[0] || null;
  if (task) {
    console.log(`[tasks] Claimed task ${taskId} (${task.worker_path}) on ${pgEnv}`);
  } else {
    console.warn(`[tasks] Could not claim task ${taskId} on ${pgEnv} — already claimed or not found`);
  }
  return task;
}

/**
 * Claim the next queued task for this host. Returns the task row or null.
 * Uses row-level locking (PG: FOR UPDATE SKIP LOCKED, SQLite: BEGIN IMMEDIATE).
 */
async function claimNextTask(pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  if (db.type === 'postgres') {
    const { rows } = await db.query(`
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
  const rawDb = db.getPool();
  rawDb.exec('BEGIN IMMEDIATE');
  try {
    const selectResult = await db.query(`
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
    const { rows } = await db.query(`
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
async function startTaskWorker(task, pgEnv) {
  const { task_id, worker_path } = task;
  console.log(`[tasks] Starting worker for task ${task_id}: ${worker_path} (pgEnv: ${pgEnv})`);
  const handler = handlers[worker_path];

  if (!handler) {
    await failTask(task_id, `No handler registered for worker_path: ${worker_path}`, pgEnv);
    return;
  }

  const db = getDb(pgEnv);
  const context = {
    task,
    pgEnv,
    db,
    dispatchEvent: (type, message, payload) => dispatchEvent(task_id, type, message, payload, pgEnv),
    updateProgress: (progress) => updateTaskProgress(task_id, progress, pgEnv),
  };

  await dispatchEvent(task_id, 'started', 'Worker started', null, pgEnv);

  try {
    const result = await handler(context);
    await completeTask(task_id, result, pgEnv);
  } catch (err) {
    await failTask(task_id, err.message || String(err), pgEnv);
  }
}

/**
 * Insert a task event.
 */
async function dispatchEvent(taskId, type, message, payload, pgEnv) {
  const db = getDb(pgEnv);
  const table = eventTable(db.type);

  await db.query(`
    INSERT INTO ${table} (task_id, type, message, payload)
    VALUES ($1, $2, $3, $4)
  `, [taskId, type, message, payload]);
}

/**
 * Update task progress (0-1).
 */
async function updateTaskProgress(taskId, progress, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  await db.query(`UPDATE ${table} SET progress = $1 WHERE task_id = $2`, [progress, taskId]);
}

/**
 * Mark task as done with result.
 */
async function completeTask(taskId, result, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  await db.query(`
    UPDATE ${table}
    SET status = 'done', result = $1, progress = 1, completed_at = ${nowExpr(db.type)}
    WHERE task_id = $2
  `, [result, taskId]);

  console.log(`[tasks] Task ${taskId} completed (pgEnv: ${pgEnv})`);
  await dispatchEvent(taskId, 'done', 'Task completed', result, pgEnv);
}

/**
 * Mark task as failed with error message.
 */
async function failTask(taskId, error, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  await db.query(`
    UPDATE ${table}
    SET status = 'error', error = $1, completed_at = ${nowExpr(db.type)}
    WHERE task_id = $2
  `, [error, taskId]);

  console.error(`[tasks] Task ${taskId} failed (pgEnv: ${pgEnv}): ${error}`);
  await dispatchEvent(taskId, 'error', error, null, pgEnv);
}

/**
 * Get a task by ID.
 */
async function getTaskStatus(taskId, pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  const { rows } = await db.query(`SELECT * FROM ${table} WHERE task_id = $1`, [taskId]);
  return rows[0] || null;
}

/**
 * Get events for a task, optionally since a given event ID.
 */
async function getTaskEvents(taskId, pgEnv, sinceEventId = 0) {
  const db = getDb(pgEnv);
  const table = eventTable(db.type);

  const { rows } = await db.query(`
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
async function recoverStalledTasks(pgEnv) {
  const db = getDb(pgEnv);
  const table = taskTable(db.type);

  const { rows } = await db.query(`
    UPDATE ${table}
    SET status = 'error',
        error = 'Server restarted while task was running',
        completed_at = ${nowExpr(db.type)}
    WHERE status = 'running' AND host_id = $1
    RETURNING task_id
  `, [hostId]);

  for (const row of rows) {
    await dispatchEvent(row.task_id, 'error', 'Server restarted while task was running', null, pgEnv);
  }

  if (rows.length > 0) {
    console.log(`[tasks] Recovered ${rows.length} stalled task(s): ${rows.map(r => r.task_id).join(', ')}`);
  }
}

/**
 * Start polling for queued tasks on a given pgEnv.
 * Safe to call multiple times — only one poller per pgEnv.
 */
function startPolling(pgEnv) {
  if (pollingIntervals[pgEnv]) return;

  if (Object.keys(handlers).length === 0) {
    console.log('[tasks] No handlers registered, skipping polling');
    return;
  }

  console.log(`[tasks] Polling ${pgEnv} every ${POLL_INTERVAL_MS}ms (host: ${hostId.slice(0, 8)}...)`);

  pollingIntervals[pgEnv] = setInterval(async () => {
    try {
      const task = await claimNextTask(pgEnv);
      if (task) {
        console.log(`[tasks] Claimed task ${task.task_id} from ${pgEnv}: ${task.worker_path}`);
        startTaskWorker(task, pgEnv);
      }
    } catch (err) {
      console.error(`[tasks] Poll error (${pgEnv}):`, err.message);
    }
  }, POLL_INTERVAL_MS);

  pollingIntervals[pgEnv].unref();
}

function stopPolling(pgEnv) {
  if (pgEnv) {
    if (pollingIntervals[pgEnv]) {
      clearInterval(pollingIntervals[pgEnv]);
      delete pollingIntervals[pgEnv];
    }
  } else {
    for (const [env, interval] of Object.entries(pollingIntervals)) {
      clearInterval(interval);
      delete pollingIntervals[env];
    }
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
};
