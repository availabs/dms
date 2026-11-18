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

// `db` lets a caller inside withTransaction read through its `tx` (see getDefaultNewSourceCategories).
async function getSettings(env, db = resolveDb(env)) {
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

// --- Source delete (call routes) ---

/**
 * Delete an internal_table source from DMS. The DMS counterpart to DAMA's
 * hard delete. There's no soft/hard split for DMS because the data IS the
 * rows in the per-view split tables — there's no metadata-only deletion to
 * leave anything around for "recovery".
 *
 * The delete itself is the DMS controller's `deleteData`, so a source deleted from the datasets
 * page cascades exactly like one deleted through `dms.data.delete` or `/sync/push`: its views (by
 * type path), their split tables, the `{ref, id}` entries in dmsEnv AND pattern `data.sources`,
 * its `dms.tasks` rows, the controller's source-id cache, and a change_log `D` / `U` for every row
 * it deletes or rewrites, so sync clients and WebSocket rooms drop the source too. This function
 * used to do its own DELETEs and wrote no change_log, so the source stayed in every local store.
 *
 * Handled here only:
 *   - views the source lists in `data.views` but whose type sits under another path: deleted in
 *     the same call, their split tables dropped first (DDL stays outside the transaction);
 *   - a source row that is already gone: its refs and tasks are still cleaned up, so stale refs
 *     left by hand-deletions can be repaired by visiting the missing source's admin page.
 *
 * @param {string} env - DMS env (`app+instance`)
 * @param {number|string} sourceId
 * @param {Object} [opts] - { user, reqMeta } of the caller, for change_log
 * @returns {Promise<Object>} summary of what was removed
 */
async function deleteInternalSource(env, sourceId, opts = {}) {
  const [app] = env.split('+');
  if (!app) {
    throw new Error(`Invalid DMS env: "${env}" — expected "app+instance"`);
  }
  sourceId = +sourceId;
  if (!Number.isFinite(sourceId)) {
    throw new Error(`Invalid sourceId: ${sourceId}`);
  }
  const { user = null, reqMeta = null } = opts;
  // The instance every Falcor route is served from: its cache is the one to clear, and its
  // change_log writes are the ones wired to the WebSocket broadcast (see dms.route.js).
  const controller = require('../dms/dms.route').controller;

  const db = resolveDb(env);
  const dbEnvName = process.env.DMS_DB_ENV || 'dms-sqlite';
  const config = loadConfig(dbEnvName);
  const splitMode = config.splitMode;

  const mainTbl = await dmsMainTable(db, app, splitMode);
  const warnings = [];
  const dropped_tables = [];

  const { rows: srcRows } = await db.query(
    `SELECT id, type, data FROM ${mainTbl} WHERE id = $1 AND app = $2`,
    [sourceId, app]
  );
  const source = srcRows[0] || null;
  const sourceSlug = source ? getInstance(source.type) : null;
  if (source && !sourceSlug) {
    throw new Error(`Cannot derive source slug from type "${source.type}" (id=${sourceId})`);
  }

  let deletedTasks = 0;
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS n FROM ${taskTable(db.type, env)} WHERE app = $1 AND source_id = $2`,
      [app, sourceId]
    );
    deletedTasks = +(rows[0]?.n || 0);
  } catch { /* no tasks table: nothing to count */ }

  if (!source) {
    warnings.push(`source row id=${sourceId} not found; cleaned up dmsEnv/pattern refs and tasks only`);
    await controller.removeSourceRefs(app, sourceId, user, reqMeta);
    console.log(`[uda.sources.delete] DMS source ${app} id=${sourceId} missing — refs and ${deletedTasks} task(s) cleaned up`);
    return {
      source_id: sourceId, app, source_slug: null, deleted_source: false,
      deleted_views: [], deleted_view_count: 0, deleted_tasks: deletedTasks, dropped_tables, warnings,
    };
  }

  // Every view this delete takes: the ones under the source's type path (the cascade finds those
  // itself) and the ones `data.views` lists, wherever their type points.
  const sourceData = typeof source.data === 'string' ? JSON.parse(source.data) : (source.data || {});
  const listedIds = (Array.isArray(sourceData.views) ? sourceData.views : [])
    .map(v => +(v?.id ?? v)).filter(Number.isFinite);
  const { rows: viewRows } = await db.query(
    `SELECT id, type FROM ${mainTbl} WHERE app = $1 AND type LIKE '%:view'`,
    [app]
  );
  const prefix = `${sourceSlug}|`;
  const views = viewRows
    .map(r => ({ id: +r.id, type: r.type, underSource: r.type.startsWith(prefix) }))
    .filter(v => v.underSource || listedIds.includes(v.id));

  // A listed view under another path: its split table is keyed by THIS source's slug and id (that
  // is how the datasets page wrote it), which the controller's view cascade can't know.
  for (const v of views) {
    const resolved = resolveTable(app, `${sourceSlug}|${v.id}:data`, db.type, splitMode, sourceId);
    if (!resolved.table.startsWith('data_items__')) continue;
    if (v.underSource) { dropped_tables.push(`${resolved.schema}.${resolved.table}`); continue; }
    try {
      await db.query(`DROP TABLE IF EXISTS ${resolved.fullName}`);
      dropped_tables.push(`${resolved.schema}.${resolved.table}`);
    } catch (err) {
      warnings.push(`failed to drop ${resolved.schema}.${resolved.table}: ${err.message}`);
    }
  }

  const strays = views.filter(v => !v.underSource).map(v => v.id);
  await controller.deleteData(app, source.type, [sourceId, ...strays], user, reqMeta);

  console.log(
    `[uda.sources.delete] DMS source ${app}+${sourceSlug} id=${sourceId} deleted — ` +
    `views=${views.length}, tables=${dropped_tables.length}, tasks=${deletedTasks}, warnings=${warnings.length}`
  );

  return {
    source_id: sourceId,
    app,
    source_slug: sourceSlug,
    deleted_source: true,
    deleted_views: views.map(v => v.id),
    deleted_view_count: views.length,
    deleted_tasks: deletedTasks,
    dropped_tables,
    warnings,
  };
}

/**
 * Delete a source: every view and its data table (dropped by kind, Postgres VIEWs and ClickHouse
 * included), its download files, its tasks and the source row. See dama/delete.js for what is
 * refused (views elsewhere built from it, run outputs in other sources without `cascade`).
 *
 * Owner decision 2026-10-02 (dama-parent-child-etl-support.md): there is one Delete and it drops
 * tables; the old keep-tables "soft" delete is gone because it is how 1.3 TB of orphan tables built
 * up on hazmit_dama. The recoverable path is the Archive lifecycle category. `hardDeleteSource` is
 * kept as an alias for old clients.
 *
 * For DMS env (env contains `+`), branches to `deleteInternalSource` (split tables, dmsEnv refs,
 * dms.tasks), which already cleaned up unconditionally.
 *
 * @param {Object} [opts] - { cascade = false, authorize(sourceIds) } — see deleteDamaSource.
 */
async function softDeleteSource(env, sourceId, opts = {}) {
  if (isDmsEnv(env)) {
    if (opts.authorize) await opts.authorize([+sourceId]);
    return deleteInternalSource(env, sourceId, { user: opts.user, reqMeta: opts.reqMeta });
  }
  const { deleteDamaSource } = require('../../dama/delete');
  return deleteDamaSource(env, sourceId, { ...opts, db: resolveDb(env) });
}

const hardDeleteSource = softDeleteSource;

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
  softDeleteSource,
  hardDeleteSource,
  deleteInternalSource,
};
