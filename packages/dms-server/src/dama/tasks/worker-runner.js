#!/usr/bin/env node
/**
 * Worker runner — executes a task handler in a child process.
 * Forked by the task system. Communicates results via IPC messages.
 *
 * Environment:
 *   DAMA_TASK_ID — task ID to execute
 *   DAMA_PG_ENV — database config name
 *   DAMA_WORKER_PATH — handler module path
 */

const { getDb } = require('../../db');

const taskId = +process.env.DAMA_TASK_ID;
const pgEnv = process.env.DAMA_PG_ENV;
const workerPath = process.env.DAMA_WORKER_PATH;

if (!taskId || !pgEnv || !workerPath) {
  console.error('[worker-runner] Missing env vars: DAMA_TASK_ID, DAMA_PG_ENV, DAMA_WORKER_PATH');
  process.exit(1);
}

// Import the task system functions for DB operations
const {
  getTaskStatus, dispatchEvent, updateTaskProgress, completeTask, failTask
} = require('./index');

// Override console.log/error to also write to task_events
const _origLog = console.log;
const _origError = console.error;
const logBuffer = [];
let dbReady = false;

async function flushLogs() {
  while (logBuffer.length) {
    const { type, msg } = logBuffer.shift();
    try {
      await dispatchEvent(taskId, type, msg, null, pgEnv);
    } catch (e) {
      _origError('[worker-runner] failed to flush log:', e.message);
    }
  }
}

console.log = (...args) => {
  _origLog(...args);
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  if (dbReady) {
    dispatchEvent(taskId, 'log', msg, null, pgEnv).catch(() => {});
  } else {
    logBuffer.push({ type: 'log', msg });
  }
};

console.error = (...args) => {
  _origError(...args);
  const msg = args.map(a => typeof a === 'string' ? a : (a?.message || JSON.stringify(a))).join(' ');
  if (dbReady) {
    dispatchEvent(taskId, 'error', msg, null, pgEnv).catch(() => {});
  } else {
    logBuffer.push({ type: 'error', msg });
  }
};

async function run() {
  console.log(`Starting task ${taskId}: ${workerPath} (pgEnv: ${pgEnv})`);

  const task = await getTaskStatus(taskId, pgEnv);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    process.exit(1);
  }

  // Parse descriptor if it's a string (SQLite/JSON)
  if (typeof task.descriptor === 'string') {
    try { task.descriptor = JSON.parse(task.descriptor); } catch (e) {}
  }

  const db = getDb(pgEnv);
  dbReady = true;
  await flushLogs();

  const context = {
    task,
    pgEnv,
    db,
    dispatchEvent: (type, message, payload) => dispatchEvent(taskId, type, message, payload, pgEnv),
    updateProgress: (progress) => updateTaskProgress(taskId, progress, pgEnv),
  };

  await dispatchEvent(taskId, 'started', 'Worker started (forked process)', null, pgEnv);

  try {
    // Load the handler — workers registered via registerHandler store the function,
    // but in a forked process we need to require the module directly.
    const handlerMap = {
      'gis/publish': '../upload/workers/gis-publish',       // relative to dama/tasks/
      'gis/analysis': '../upload/workers/analysis',
      'gis/create-download': '../upload/workers/create-download',
      'csv/publish': '../upload/workers/csv-publish',
    };

    const modulePath = handlerMap[workerPath];
    if (!modulePath) {
      throw new Error(`Unknown worker path: ${workerPath}`);
    }

    const handler = require(modulePath);
    const result = await handler(context);

    await completeTask(taskId, result, pgEnv);
    console.log(`Task ${taskId} completed successfully`);
    process.exit(0);
  } catch (err) {
    console.error(`Task ${taskId} failed: ${err.message}`);
    console.error(err.stack);
    await failTask(taskId, err.message, pgEnv);
    process.exit(1);
  }
}

run();
