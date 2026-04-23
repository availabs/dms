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

// --- Source delete (call routes) ---

/**
 * Soft delete: removes the source and its view rows from data_manager.
 * Leaves per-view data tables, task history, and storage files intact.
 * Recoverable if the underlying data hasn't been separately dropped.
 */
async function softDeleteSource(env, sourceId) {
  const db = resolveDb(env);
  if (db.type !== 'postgres') {
    throw new Error('Source delete is only supported on PostgreSQL (data_manager schema)');
  }

  const { rows: viewRows } = await db.query(
    `SELECT view_id FROM data_manager.views WHERE source_id = $1`,
    [sourceId]
  );

  await db.query(`BEGIN`);
  try {
    await db.query(`DELETE FROM data_manager.views WHERE source_id = $1`, [sourceId]);
    const { rowCount } = await db.query(
      `DELETE FROM data_manager.sources WHERE source_id = $1`,
      [sourceId]
    );
    await db.query(`COMMIT`);
    return {
      source_id: sourceId,
      deleted_source: rowCount > 0,
      deleted_views: viewRows.map(r => r.view_id),
    };
  } catch (err) {
    await db.query(`ROLLBACK`);
    throw err;
  }
}

/**
 * Hard delete: soft delete + drops each view's data table, removes associated
 * download files from storage, and deletes task rows that reference the source.
 *
 * Individual file/table errors are collected and reported in the result rather
 * than aborting — the intent is "wipe everything possible". The metadata row
 * deletions (views, tasks, source) run inside a transaction and roll back if
 * they fail; the external cleanup (DROP TABLE, storage.remove) runs before
 * the transaction so partial success is visible to the caller.
 */
async function hardDeleteSource(env, sourceId) {
  const db = resolveDb(env);
  if (db.type !== 'postgres') {
    throw new Error('Source delete is only supported on PostgreSQL (data_manager schema)');
  }

  const warnings = [];
  const dropped_tables = [];
  const removed_files = [];

  // 1. Fetch view metadata so we know which tables/files to clean up
  const { rows: viewRows } = await db.query(`
    SELECT view_id, table_schema, table_name, data_table, metadata
    FROM data_manager.views WHERE source_id = $1
  `, [sourceId]);

  // 2. Drop each view's data table and remove per-view download files
  const storage = (() => {
    try { return require('../../dama/storage'); }
    catch (e) { warnings.push(`storage module unavailable: ${e.message}`); return null; }
  })();

  for (const v of viewRows) {
    if (v.table_schema && v.table_name) {
      try {
        await db.query(`DROP TABLE IF EXISTS "${v.table_schema}"."${v.table_name}"`);
        dropped_tables.push(`${v.table_schema}.${v.table_name}`);
      } catch (err) {
        warnings.push(`failed to drop ${v.table_schema}.${v.table_name}: ${err.message}`);
      }
    }
    const downloadUrls = (v.metadata && v.metadata.download) || {};
    if (storage) {
      for (const [fileType, url] of Object.entries(downloadUrls)) {
        // URLs are returned from storage.getUrl(relPath); local is `/files/{rel}`.
        const relPath = typeof url === 'string' ? url.replace(/^\/files\//, '') : null;
        if (!relPath) continue;
        try {
          await storage.remove(relPath);
          removed_files.push(relPath);
        } catch (err) {
          warnings.push(`failed to remove file ${relPath}: ${err.message}`);
        }
      }
    }
  }

  // 3. Remove the source's entire storage folder (catches any stragglers under
  // the `{pgEnv}/s_{source_id}/` convention used by create-download worker)
  if (storage) {
    const sourceDir = `${env}/s_${sourceId}`;
    try {
      await storage.remove(sourceDir);
      removed_files.push(`${sourceDir}/*`);
    } catch (err) {
      warnings.push(`failed to remove source dir ${sourceDir}: ${err.message}`);
    }
  }

  // 4. Delete metadata rows (views, tasks, source) in a transaction
  await db.query(`BEGIN`);
  try {
    const { rowCount: deletedTasks } = await db.query(
      `DELETE FROM data_manager.tasks WHERE source_id = $1`,
      [sourceId]
    );
    await db.query(`DELETE FROM data_manager.views WHERE source_id = $1`, [sourceId]);
    const { rowCount: deletedSource } = await db.query(
      `DELETE FROM data_manager.sources WHERE source_id = $1`,
      [sourceId]
    );
    await db.query(`COMMIT`);
    return {
      source_id: sourceId,
      deleted_source: deletedSource > 0,
      deleted_views: viewRows.map(r => r.view_id),
      deleted_tasks: deletedTasks,
      dropped_tables,
      removed_files,
      warnings,
    };
  } catch (err) {
    await db.query(`ROLLBACK`);
    throw err;
  }
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
  softDeleteSource,
  hardDeleteSource,
};
