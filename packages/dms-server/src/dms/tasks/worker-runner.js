#!/usr/bin/env node
/**
 * DMS worker runner — executes a DMS task handler in a child process.
 * Forked by the DMS task system. Mirrors `dama/tasks/worker-runner.js`.
 *
 * Environment:
 *   DMS_TASK_ID — task ID to execute
 *   DMS_DB_ENV — DMS database config name (also read by ./index module)
 *   DMS_WORKER_PATH — handler module path (one of the keys in handlerMap)
 *
 * No DMS workers are wired into handlerMap yet — internal_table publish
 * runs inline via `runInlineTask`. Add entries here when forked DMS
 * workers are introduced.
 */

const { getDb } = require('../../db');

const taskId = +process.env.DMS_TASK_ID;
const dbEnv = process.env.DMS_DB_ENV;
const workerPath = process.env.DMS_WORKER_PATH;

if (!taskId || !dbEnv || !workerPath) {
  console.error('[dms-worker-runner] Missing env vars: DMS_TASK_ID, DMS_DB_ENV, DMS_WORKER_PATH');
  process.exit(1);
}

const {
  getTaskStatus, dispatchEvent, updateTaskProgress, completeTask, failTask
} = require('./index');

// Override console.log/error to also write to dms.task_events
const _origLog = console.log;
const _origError = console.error;
const logBuffer = [];
let dbReady = false;

async function flushLogs() {
  while (logBuffer.length) {
    const { type, msg } = logBuffer.shift();
    try {
      await dispatchEvent(taskId, type, msg, null);
    } catch (e) {
      _origError('[dms-worker-runner] failed to flush log:', e.message);
    }
  }
}

console.log = (...args) => {
  _origLog(...args);
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  if (dbReady) {
    dispatchEvent(taskId, 'log', msg, null).catch(() => {});
  } else {
    logBuffer.push({ type: 'log', msg });
  }
};

console.error = (...args) => {
  _origError(...args);
  const msg = args.map(a => typeof a === 'string' ? a : (a?.message || JSON.stringify(a))).join(' ');
  if (dbReady) {
    dispatchEvent(taskId, 'error', msg, null).catch(() => {});
  } else {
    logBuffer.push({ type: 'error', msg });
  }
};

async function run() {
  console.log(`Starting DMS task ${taskId}: ${workerPath} (db: ${dbEnv})`);

  const task = await getTaskStatus(taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    process.exit(1);
  }

  if (typeof task.descriptor === 'string') {
    try { task.descriptor = JSON.parse(task.descriptor); } catch (e) {}
  }

  const db = getDb(dbEnv);
  dbReady = true;
  await flushLogs();

  const context = {
    task,
    db,
    dispatchEvent: (type, message, payload) => dispatchEvent(taskId, type, message, payload),
    updateProgress: (progress) => updateTaskProgress(taskId, progress),
  };

  await dispatchEvent(taskId, 'started', 'Worker started (forked process)', null);

  try {
    // Map worker_path → require'able module. Add DMS workers here as they
    // come online. Until then this map is intentionally empty.
    const handlerMap = {
      // 'internal-table/publish': '../../dama/upload/workers/internal-table-publish',
    };

    const modulePath = handlerMap[workerPath];
    if (!modulePath) {
      throw new Error(`Unknown DMS worker path: ${workerPath}`);
    }

    const handler = require(modulePath);
    const result = await handler(context);

    await completeTask(taskId, result);
    console.log(`Task ${taskId} completed successfully`);
    process.exit(0);
  } catch (err) {
    console.error(`Task ${taskId} failed: ${err.message}`);
    console.error(err.stack);
    await failTask(taskId, err.message);
    process.exit(1);
  }
}

run();
