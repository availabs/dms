/**
 * UDA Tasks Controller — query functions for task queue, events, and settings.
 *
 * Two backends, same Falcor route shape:
 *   - DAMA tasks:  env = pgEnv name (no '+'). Reads `data_manager.tasks` etc.
 *   - DMS tasks:   env = `app+instance` (contains '+'). Reads `dms.tasks` etc.
 *                  in the DMS database (DMS_DB_ENV), filtered by `app`.
 *
 * The DMS path lets internal_table sources show their publish tasks without
 * any DAMA pgEnv being configured. Mirrors `dama/tasks` <-> `dms/tasks` at
 * the route layer.
 */

const { getDb } = require('../../db');
const { loadConfig } = require('../../db/config');
const { resolveTable } = require('../../db/table-resolver');
const { getInstance } = require('../../db/type-utils');
const { dmsMainTable } = require('./utils');

function isDmsEnv(env) {
  return typeof env === 'string' && env.includes('+');
}

function resolveDb(env) {
  const dbEnv = isDmsEnv(env) ? (process.env.DMS_DB_ENV || 'dms-sqlite') : env;
  return getDb(dbEnv);
}

function taskTable(dbType, env) {
  if (isDmsEnv(env)) return dbType === 'postgres' ? 'dms.tasks' : 'dms_tasks';
  return dbType === 'postgres' ? 'data_manager.tasks' : 'tasks';
}

function eventTable(dbType, env) {
  if (isDmsEnv(env)) return dbType === 'postgres' ? 'dms.task_events' : 'dms_task_events';
  return dbType === 'postgres' ? 'data_manager.task_events' : 'task_events';
}

function settingsTable(dbType, env) {
  if (isDmsEnv(env)) return dbType === 'postgres' ? 'dms.settings' : 'dms_settings';
  return dbType === 'postgres' ? 'data_manager.settings' : 'settings';
}

/**
 * For DMS env (`app+instance`), return a `(WHERE-clause-fragment, value)` pair
 * that scopes a query to a single app. For DAMA env, returns no-op.
 */
function appScope(env, paramIdx = 1) {
  if (!isDmsEnv(env)) return { clause: '', value: null };
  const [app] = env.split('+');
  return { clause: `app = $${paramIdx}`, value: app };
}

// --- Tasks ---

async function getTasksLength(env) {
  const db = resolveDb(env);
  const scope = appScope(env, 1);
  const where = scope.clause ? `WHERE ${scope.clause}` : '';
  const params = scope.value !== null ? [scope.value] : [];
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${taskTable(db.type, env)} ${where}`,
    params
  );
  return rows[0].count;
}

async function getTaskIdsByIndex(env, indices) {
  const db = resolveDb(env);
  const from = Array.isArray(indices) ? Math.min(...indices) : indices.from || 0;
  const to = Array.isArray(indices) ? Math.max(...indices) : indices.to || 0;
  const limit = to - from + 1;
  const scope = appScope(env, 1);
  const where = scope.clause ? `WHERE ${scope.clause}` : '';
  const params = scope.value !== null ? [scope.value] : [];

  const { rows } = await db.query(`
    SELECT task_id FROM ${taskTable(db.type, env)}
    ${where}
    ORDER BY queued_at DESC
    LIMIT ${limit} OFFSET ${from}
  `, params);
  return rows.map(r => r.task_id);
}

async function getTaskById(env, taskId, attributes) {
  const db = resolveDb(env);
  // Lookup by task_id only — no app filter. task_ids are unique inside each
  // store (dms.tasks or data_manager.tasks), so there's nothing to disambiguate.
  // Scoping this by app breaks the task detail page when the user navigates
  // from a site whose DatasetsContext.app doesn't match the task's app
  // (e.g. a shared base-URL site viewing a task queued under a different app).
  const { rows } = await db.query(
    `SELECT * FROM ${taskTable(db.type, env)} WHERE task_id = $1`,
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
  const scope = appScope(env, 2);
  const extra = scope.clause ? ` AND ${scope.clause}` : '';
  const params = scope.value !== null ? [sourceId, scope.value] : [sourceId];
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${taskTable(db.type, env)} WHERE source_id = $1${extra}`,
    params
  );
  return rows[0].count;
}

async function getTasksForSourceByIndex(env, sourceId, indices) {
  const db = resolveDb(env);
  const from = Array.isArray(indices) ? Math.min(...indices) : indices.from || 0;
  const to = Array.isArray(indices) ? Math.max(...indices) : indices.to || 0;
  const limit = to - from + 1;
  const scope = appScope(env, 2);
  const extra = scope.clause ? ` AND ${scope.clause}` : '';
  const params = scope.value !== null ? [sourceId, scope.value] : [sourceId];

  const { rows } = await db.query(`
    SELECT task_id FROM ${taskTable(db.type, env)}
    WHERE source_id = $1${extra}
    ORDER BY queued_at DESC
    LIMIT ${limit} OFFSET ${from}
  `, params);
  return rows.map(r => r.task_id);
}

// --- Task Events ---

async function getTaskEventsLength(env, taskId) {
  const db = resolveDb(env);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM ${eventTable(db.type, env)} WHERE task_id = $1`,
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
    SELECT * FROM ${eventTable(db.type, env)}
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
  const table = settingsTable(db.type, env);

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
  const table = settingsTable(db.type, env);

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
 * Delete an internal_table source from DMS. The DMS counterpart to DAMA's
 * hard delete. There's no soft/hard split for DMS because the data IS the
 * rows in the per-view split tables — there's no metadata-only deletion to
 * leave anything around for "recovery".
 *
 * Steps (DDL outside transaction, data deletes inside):
 *   1. Load source row, extract slug + view IDs from data.views
 *   2. Resolve view types so we know each view's slug for the split-table name
 *   3. DROP TABLE IF EXISTS for each view's split table (collect warnings,
 *      do not abort)
 *   4. Find owning dmsEnv rows whose data.sources contains this source_id and
 *      strip the ref (in transaction)
 *   5. DELETE the view rows (in transaction)
 *   6. DELETE the source row (in transaction)
 *   7. DELETE dms.tasks rows for (app, source_id); task_events cascade via FK
 *      (in transaction)
 *
 * @param {string} env - DMS env (`app+instance`)
 * @param {number|string} sourceId
 * @returns {Promise<Object>} summary of what was removed
 */
async function deleteInternalSource(env, sourceId) {
  const [app] = env.split('+');
  if (!app) {
    throw new Error(`Invalid DMS env: "${env}" — expected "app+instance"`);
  }
  sourceId = +sourceId;
  if (!Number.isFinite(sourceId)) {
    throw new Error(`Invalid sourceId: ${sourceId}`);
  }

  const db = resolveDb(env);
  const dbEnvName = process.env.DMS_DB_ENV || 'dms-sqlite';
  const config = loadConfig(dbEnvName);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';

  const mainTbl = await dmsMainTable(db, app, splitMode);

  const warnings = [];
  const dropped_tables = [];
  const dmsEnvs_updated = [];

  // 1. Load source row. If missing, we still do a best-effort cleanup of
  // dmsEnv refs + dms.tasks — that path exists so stale refs left behind by
  // pre-existing hand-deletions can be repaired by visiting the missing
  // source's admin page.
  const { rows: srcRows } = await db.query(
    `SELECT id, type, data FROM ${mainTbl} WHERE id = $1 AND app = $2`,
    [sourceId, app]
  );

  const sourceExists = !!srcRows[0];
  const source = srcRows[0] || null;
  const sourceSlug = source ? getInstance(source.type) : null;
  const sourceData = source
    ? (typeof source.data === 'string' ? JSON.parse(source.data) : (source.data || {}))
    : {};
  const viewRefs = Array.isArray(sourceData.views) ? sourceData.views : [];
  const viewIds = viewRefs.map(v => +v.id).filter(Number.isFinite);

  if (!sourceExists) {
    warnings.push(`source row id=${sourceId} not found; proceeding with dmsEnv + task cleanup only`);
  } else if (!sourceSlug) {
    throw new Error(`Cannot derive source slug from type "${source.type}" (id=${sourceId})`);
  }

  // 2. Resolve view types
  let viewTypes = []; // [{id, type, slug}]
  if (viewIds.length) {
    const { rows: viewRows } = await db.query(
      `SELECT id, type FROM ${mainTbl} WHERE id = ANY($1::INT[]) AND app = $2`,
      [viewIds, app]
    );
    viewTypes = viewRows.map(r => ({
      id: +r.id,
      type: r.type,
      slug: getInstance(r.type) || `v${r.id}`,
    }));
  }

  // 3. DROP per-view split tables (DDL — outside transaction, collect warnings)
  for (const v of viewTypes) {
    const dataType = `${sourceSlug}|${v.id}:data`;
    const resolved = resolveTable(app, dataType, db.type, splitMode, sourceId);
    const fqn = db.type === 'postgres'
      ? `"${resolved.schema}"."${resolved.table}"`
      : `"${resolved.table}"`;
    try {
      await db.query(`DROP TABLE IF EXISTS ${fqn}`);
      dropped_tables.push(`${resolved.schema}.${resolved.table}`);
    } catch (err) {
      warnings.push(`failed to drop ${resolved.schema}.${resolved.table}: ${err.message}`);
    }
  }

  // 4. Find owning dmsEnv rows. There may be more than one (the membership
  //    bug we're tracking separately can leave a source's ref in multiple
  //    dmsEnvs); cleaning all of them up is the correct behavior here.
  let dmsEnvSql, dmsEnvParams;
  if (db.type === 'postgres') {
    dmsEnvSql = `
      SELECT id, data FROM ${mainTbl}
      WHERE app = $1
        AND type LIKE '%:dmsenv'
        AND data->'sources' @> jsonb_build_array(jsonb_build_object('id', $2::int))
    `;
    dmsEnvParams = [app, sourceId];
  } else {
    // SQLite: walk the sources array
    dmsEnvSql = `
      SELECT id, data FROM ${mainTbl}
      WHERE app = $1
        AND type LIKE '%:dmsenv'
        AND EXISTS (
          SELECT 1 FROM json_each(data, '$.sources')
          WHERE CAST(json_extract(value, '$.id') AS INTEGER) = $2
        )
    `;
    dmsEnvParams = [app, sourceId];
  }
  const { rows: dmsEnvRows } = await db.query(dmsEnvSql, dmsEnvParams);

  // 5-7. Data deletes inside a transaction
  await db.query('BEGIN');
  try {
    for (const envRow of dmsEnvRows) {
      const data = typeof envRow.data === 'string' ? JSON.parse(envRow.data) : (envRow.data || {});
      const before = (data.sources || []).length;
      const newSources = (data.sources || []).filter(s => +s.id !== sourceId);
      const removed = before - newSources.length;
      if (removed > 0) {
        const newData = { ...data, sources: newSources };
        await db.query(
          `UPDATE ${mainTbl} SET data = $1 WHERE id = $2 AND app = $3`,
          [JSON.stringify(newData), envRow.id, app]
        );
      }
      dmsEnvs_updated.push({ id: +envRow.id, removed_ref_count: removed });
    }

    let deletedViewCount = 0;
    if (viewIds.length) {
      const r = await db.query(
        `DELETE FROM ${mainTbl} WHERE id = ANY($1::INT[]) AND app = $2`,
        [viewIds, app]
      );
      deletedViewCount = r.rowCount ?? r.rows?.length ?? 0;
    }

    const srcDel = await db.query(
      `DELETE FROM ${mainTbl} WHERE id = $1 AND app = $2`,
      [sourceId, app]
    );
    const deletedSource = (srcDel.rowCount ?? srcDel.rows?.length ?? 0) > 0;

    // dms.tasks lives in the same DMS db. task_events cascades via FK.
    const taskTableName = db.type === 'postgres' ? 'dms.tasks' : 'dms_tasks';
    const tasksDel = await db.query(
      `DELETE FROM ${taskTableName} WHERE app = $1 AND source_id = $2`,
      [app, sourceId]
    );
    const deletedTasks = tasksDel.rowCount ?? tasksDel.rows?.length ?? 0;

    await db.query('COMMIT');

    console.log(
      `[uda.sources.delete] DMS source ${app}+${sourceSlug} id=${sourceId} cleaned up — ` +
      `views=${deletedViewCount}, tables=${dropped_tables.length}, ` +
      `dmsEnvs=${dmsEnvs_updated.length}, tasks=${deletedTasks}, warnings=${warnings.length}`
    );

    return {
      source_id: sourceId,
      app,
      source_slug: sourceSlug,
      deleted_source: deletedSource,
      deleted_views: viewIds,
      deleted_view_count: deletedViewCount,
      deleted_tasks: deletedTasks,
      dropped_tables,
      dmsEnvs_updated,
      warnings,
    };
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Soft delete: removes the source and its view rows from data_manager.
 * Leaves per-view data tables, task history, and storage files intact.
 * Recoverable if the underlying data hasn't been separately dropped.
 *
 * For DMS env (env contains `+`), branches to `deleteInternalSource` — DMS
 * sources have no soft-vs-hard distinction (the data lives in split tables
 * managed entirely by DMS, so cleanup is unconditional).
 */
async function softDeleteSource(env, sourceId) {
  if (isDmsEnv(env)) {
    return deleteInternalSource(env, sourceId);
  }
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
 *
 * For DMS env (env contains `+`), branches to `deleteInternalSource` —
 * already does the equivalent cleanup for the DMS-side data layout (split
 * tables, dmsEnv refs, dms.tasks). Lets the client call either route.
 */
async function hardDeleteSource(env, sourceId) {
  if (isDmsEnv(env)) {
    return deleteInternalSource(env, sourceId);
  }
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
  deleteInternalSource,
};
