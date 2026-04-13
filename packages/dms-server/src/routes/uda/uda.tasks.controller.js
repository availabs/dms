/**
 * UDA Tasks Controller — query functions for task queue, events, and settings.
 * Tasks always live in a dama-role database (data_manager.tasks / tasks).
 */

const { getDb } = require('../../db');

function resolveDb(env) {
  const dbEnv = env.includes('+') ? (process.env.DMS_DB_ENV || 'dms-sqlite') : env;
  return getDb(dbEnv);
}

function taskTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.tasks' : 'tasks';
}

function eventTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.task_events' : 'task_events';
}

function settingsTable(dbType) {
  return dbType === 'postgres' ? 'data_manager.settings' : 'settings';
}

// --- Tasks ---

async function getTasksLength(env) {
  const db = resolveDb(env);
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM ${taskTable(db.type)}`);
  return rows[0].count;
}

async function getTaskIdsByIndex(env, indices) {
  const db = resolveDb(env);
  const from = Array.isArray(indices) ? Math.min(...indices) : indices.from || 0;
  const to = Array.isArray(indices) ? Math.max(...indices) : indices.to || 0;
  const limit = to - from + 1;

  const { rows } = await db.query(`
    SELECT task_id FROM ${taskTable(db.type)}
    ORDER BY queued_at DESC
    LIMIT ${limit} OFFSET ${from}
  `);
  return rows.map(r => r.task_id);
}

async function getTaskById(env, taskId, attributes) {
  const db = resolveDb(env);
  const { rows } = await db.query(
    `SELECT * FROM ${taskTable(db.type)} WHERE task_id = $1`,
    [taskId]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  const result = {};
  for (const attr of attributes) {
    if (attr in row) {
      result[attr] = row[attr];
    }
  }
  return result;
}

async function getTasksForSourceLength(env, sourceId) {
  const db = resolveDb(env);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${taskTable(db.type)} WHERE source_id = $1`,
    [sourceId]
  );
  return rows[0].count;
}

async function getTasksForSourceByIndex(env, sourceId, indices) {
  const db = resolveDb(env);
  const from = Array.isArray(indices) ? Math.min(...indices) : indices.from || 0;
  const to = Array.isArray(indices) ? Math.max(...indices) : indices.to || 0;
  const limit = to - from + 1;

  const { rows } = await db.query(`
    SELECT task_id FROM ${taskTable(db.type)}
    WHERE source_id = $1
    ORDER BY queued_at DESC
    LIMIT ${limit} OFFSET ${from}
  `, [sourceId]);
  return rows.map(r => r.task_id);
}

// --- Task Events ---

async function getTaskEventsLength(env, taskId) {
  const db = resolveDb(env);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${eventTable(db.type)} WHERE task_id = $1`,
    [taskId]
  );
  return rows[0].count;
}

async function getTaskEventsByIndex(env, taskId, indices, attributes) {
  const db = resolveDb(env);
  const from = Array.isArray(indices) ? Math.min(...indices) : indices.from || 0;
  const to = Array.isArray(indices) ? Math.max(...indices) : indices.to || 0;
  const limit = to - from + 1;

  const { rows } = await db.query(`
    SELECT * FROM ${eventTable(db.type)}
    WHERE task_id = $1
    ORDER BY event_id ASC
    LIMIT ${limit} OFFSET ${from}
  `, [taskId]);

  return rows.map(row => {
    const result = {};
    for (const attr of attributes) {
      if (attr in row) {
        result[attr] = row[attr];
      }
    }
    return result;
  });
}

// --- Settings ---

async function getSettings(env) {
  const db = resolveDb(env);
  const table = settingsTable(db.type);

  try {
    // New schema: key/value table
    const { rows } = await db.query(`SELECT value FROM ${table} WHERE key = 'default'`);
    if (!rows[0]) return '{}';
    const val = rows[0].value;
    return typeof val === 'string' ? val : JSON.stringify(val);
  } catch (e) {
    // Legacy schema: single-row table with 'settings' column
    try {
      const { rows } = await db.query(`SELECT settings FROM ${table} LIMIT 1`);
      if (!rows[0]) return '{}';
      const val = rows[0].settings;
      return typeof val === 'string' ? val : JSON.stringify(val);
    } catch {
      return '{}';
    }
  }
}

async function setSettings(env, value) {
  const db = resolveDb(env);
  const table = settingsTable(db.type);

  try {
    // Try new schema first
    if (db.type === 'postgres') {
      await db.query(`
        INSERT INTO ${table} (key, value) VALUES ('default', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1
      `, [value]);
    } else {
      await db.query(`
        INSERT INTO ${table} (key, value) VALUES ('default', $1)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
      `, [value]);
    }
  } catch (e) {
    // Legacy schema: single-row with 'settings' column
    try {
      const { rows } = await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
      if (rows.length) {
        await db.query(`UPDATE ${table} SET settings = $1`, [value]);
      } else {
        await db.query(`INSERT INTO ${table} (settings) VALUES ($1)`, [value]);
      }
    } catch {
      // settings table may not exist at all — skip silently
    }
  }
}

// --- Source update (call route) ---

async function updateSourceMetadata(env, sourceId, updates) {
  const db = resolveDb(env);
  const dbType = db.type;
  const table = dbType === 'postgres' ? 'data_manager.sources' : 'sources';

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(updates)) {
    if (['source_id', '_created_timestamp'].includes(key)) continue;
    setClauses.push(`${key} = $${paramIdx}`);
    values.push(val);
    paramIdx++;
  }

  if (setClauses.length === 0) return null;

  values.push(sourceId);
  const { rows } = await db.query(`
    UPDATE ${table} SET ${setClauses.join(', ')}
    WHERE source_id = $${paramIdx}
    RETURNING *
  `, values);

  return rows[0] || null;
}

module.exports = {
  getTasksLength,
  getTaskIdsByIndex,
  getTaskById,
  getTasksForSourceLength,
  getTasksForSourceByIndex,
  getTaskEventsLength,
  getTaskEventsByIndex,
  getSettings,
  setSettings,
  updateSourceMetadata,
};
