'use strict';
/**
 * THE PGENV MIRROR — a DMS row for every external source and view, so the auth layer has one kind of
 * subject (planning/tasks/current/pgenv-mirror-into-dms.md).
 *
 * A pgEnv's `data_manager.sources` / `views` live in another database and have no `parent_id`; until
 * 2026-11-05 the auth layer manufactured rows for them at read time. Now each is mirrored as an ordinary
 * DMS row of every site that uses the pgEnv, parented to that site's `:dmsenv` row for it:
 *
 *     {env}|{slug}:source   parent_id = the env row     data: { pgEnv, source_id, name, type, categories,
 *                                                               description, auth_permissions }
 *     {slug}|v{view_id}:view  parent_id = the source row   data: { pgEnv, view_id, source_id, name, version }
 *
 * The same shapes internal sources use, so the formats, rules, childRefs and the walk apply unchanged.
 * `(pgEnv, source_id)` / `(pgEnv, view_id)` is the mirror's identity; the DMS row id is incidental.
 *
 * WHICH SITES. A pgEnv is shared by several sites, and nothing on the dama side used to know which.
 * Now it does: `settings.mirror_apps` of the pgEnv (the per-env settings row, uda.tasks.controller)
 * lists the apps that mirror it, written by the reconcile (`scripts/reconcile-pgenv-mirror.js --apply`).
 * The hooks mirror into every app listed; a pgEnv no site has reconciled mirrors nowhere.
 *
 * DUAL MAINTENANCE. The dama tables stay the record for everything below EXCEPT grants: the hooks copy
 * dama → DMS, never the other way, and `reconcile()` makes the DMS side equal to the dama side (creates,
 * updates, deletes). A source's grants are seeded from `data_manager.sources.auth_permissions` when its
 * mirror is created and are the mirror's own from then on, per site (`grantsIn` / `setGrantsIn`). Plugins that write `data_manager` by direct SQL (38 files in data-types/, mostly `metadata`
 * and `version`) bypass the hooks; the reconcile catches what matters to auth.
 *
 * Writes go through the DMS controller, so `change_log` and sync see every mirror row like any other.
 * The hooks are best-effort: a failed mirror is logged and left to the reconcile, never fails the dama
 * write, and runs after the caller's transaction commits when there is one.
 */
const { getDb } = require('../db');
const { jsonExtract } = require('../db/query-utils');
const { resolveTable } = require('../db/table-resolver');
const { nameToSlug, getInstance } = require('../db/type-utils');

// What the origin keeps current on a mirror. `auth_permissions` is NOT among them: it is SEEDED from
// the pgEnv when the mirror is created and is the mirror's own from then on — the site's grants over
// the source, edited on the mirror (uda.sources.update diverts the key here), per site.
const MIRRORED_SOURCE_KEYS = ['name', 'type', 'categories', 'description'];
const MIRRORED_VIEW_KEYS = ['version'];
const TTL_MS = 30 * 1000;

const parseJson = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };
const dmsDbEnv = () => process.env.DMS_DB_ENV || 'dms-sqlite';

let controllers = new Map();
function dmsController() {
  const env = dmsDbEnv();
  if (!controllers.has(env)) controllers.set(env, require('../routes/dms/dms.controller').createController(env));
  return controllers.get(env);
}
const dmsDb = () => getDb(dmsDbEnv());
const splitModeOf = () => { try { return require('../db').loadConfig(dmsDbEnv()).splitMode || process.env.DMS_SPLIT_MODE || 'legacy'; } catch { return process.env.DMS_SPLIT_MODE || 'legacy'; } };

// ---- which apps mirror a pgEnv ------------------------------------------------------------------

const appsCache = new Map();   // pgEnv → { at, apps }

/** The apps that mirror `pgEnv`: `settings.mirror_apps` of the pgEnv. Cached for TTL_MS. */
async function mirrorAppsOf(pgEnv) {
  const hit = appsCache.get(pgEnv);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.apps;
  const { getSettings } = require('../routes/uda/uda.tasks.controller');
  let apps = [];
  try {
    const s = parseJson(await getSettings(pgEnv)) || {};
    apps = Array.isArray(s.mirror_apps) ? s.mirror_apps.filter(a => typeof a === 'string' && a) : [];
  } catch { apps = []; }
  appsCache.set(pgEnv, { at: Date.now(), apps });
  return apps;
}

/** Record that `app` mirrors `pgEnv` (the reconcile does this on `--apply`). */
async function registerMirrorApp(pgEnv, app) {
  const { getSettings, setSettings } = require('../routes/uda/uda.tasks.controller');
  const s = parseJson(await getSettings(pgEnv)) || {};
  const apps = Array.isArray(s.mirror_apps) ? s.mirror_apps : [];
  if (apps.includes(app)) return false;
  await setSettings(pgEnv, JSON.stringify({ ...s, mirror_apps: [...apps, app] }));
  appsCache.delete(pgEnv);
  return true;
}

const forgetMirrorApps = () => appsCache.clear();

// ---- rows ---------------------------------------------------------------------------------------

/** The app's main table, as a name only: reading never creates one (the controller's writes do). */
const table = (app) => resolveTable(app, '', dmsDb().type, splitModeOf()).fullName;

/** A read of an app's table; an app with no table yet has no rows. */
async function select(sql, params) {
  try { return (await dmsDb().query(sql, params)).rows; }
  catch (e) { if (/no such table|does not exist/i.test(e.message)) return []; throw e; }
}

/** The `:dmsenv` row of `app` whose `data.pgEnv` is `pgEnv`, or null. */
async function envRowOf(app, pgEnv) {
  const rows = await select(
    `SELECT id, type, data FROM ${table(app)} WHERE app = $1 AND type LIKE '%:dmsenv' AND ${jsonExtract('data', 'pgEnv', dmsDb().type)} = $2 LIMIT 1`,
    [app, pgEnv]);
  return rows[0] ? { ...rows[0], data: parseJson(rows[0].data) || {} } : null;
}

/** Every mirror row of `app` for `pgEnv` of `kind` (source | view), parsed. */
async function mirrorRows(app, pgEnv, kind) {
  const rows = await select(
    `SELECT id, type, data FROM ${table(app)} WHERE app = $1 AND type LIKE $2 AND ${jsonExtract('data', 'pgEnv', dmsDb().type)} = $3`,
    [app, `%:${kind}`, pgEnv]);
  return rows.map(r => ({ ...r, data: parseJson(r.data) || {} }));
}

const slugOf = (src) => nameToSlug(String(src.name || '')) || `s${src.source_id}`;

function sourceData(pgEnv, src) {
  const ap = parseJson(src.auth_permissions);
  return {
    name: src.name, type: src.type || null, categories: parseJson(src.categories), description: src.description || null,
    pgEnv, source_id: +src.source_id, auth_permissions: ap && typeof ap === 'object' ? ap : {},
  };
}
function viewData(pgEnv, view) {
  return { name: view.version || `v${view.view_id}`, version: view.version || null, pgEnv, view_id: +view.view_id, source_id: +view.source_id };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const differs = (row, data, keys) => keys.some(k => !same(row.data[k] ?? null, data[k] ?? null));

// ---- the mirror operations ----------------------------------------------------------------------

/** Create or update the mirror of dama source `src` in `app`. Returns 'created' | 'updated' | 'same' | 'no-env'. */
async function mirrorSourceIn(app, pgEnv, src, { env } = {}) {
  const envRow = env || await envRowOf(app, pgEnv);
  if (!envRow) return 'no-env';
  const data = sourceData(pgEnv, src);
  const existing = (await mirrorRows(app, pgEnv, 'source')).find(r => +r.data.source_id === +src.source_id);
  const ctl = dmsController();
  if (existing) {
    if (!differs(existing, data, [...MIRRORED_SOURCE_KEYS, 'source_id'])) return 'same';
    const { auth_permissions, ...origin } = data;   // the mirror's grants are its own
    await ctl.setDataById(existing.id, origin, null, app, existing.type);
    return 'updated';
  }
  const type = `${getInstance(envRow.type)}|${slugOf(src)}:source`;
  await ctl.createData([app, type, { ...data, parent_id: envRow.id }], null);
  return 'created';
}

/** Create or update the mirror of dama view `view` in `app`. Returns 'created' | 'updated' | 'same' | 'no-source'. */
async function mirrorViewIn(app, pgEnv, view, { source } = {}) {
  const src = source || (await mirrorRows(app, pgEnv, 'source')).find(r => +r.data.source_id === +view.source_id);
  if (!src) return 'no-source';
  const data = viewData(pgEnv, view);
  const existing = (await mirrorRows(app, pgEnv, 'view')).find(r => +r.data.view_id === +view.view_id);
  const ctl = dmsController();
  if (existing) {
    if (!differs(existing, data, [...MIRRORED_VIEW_KEYS, 'source_id', 'name'])) return 'same';
    await ctl.setDataById(existing.id, data, null, app, existing.type);
    return 'updated';
  }
  const type = `${getInstance(src.type)}|v${view.view_id}:view`;
  await ctl.createData([app, type, { ...data, parent_id: src.id }], null);
  return 'created';
}

/** The site's grants over a pgEnv source: the mirror row's `auth_permissions`, or undefined with no mirror. */
async function grantsIn(app, pgEnv, sourceId) {
  const row = (await mirrorRows(app, pgEnv, 'source')).find(r => +r.data.source_id === +sourceId);
  return row ? row.data.auth_permissions : undefined;
}

/** Write the site's grants over a pgEnv source onto its mirror row. Throws when the site has no mirror of it. */
async function setGrantsIn(app, pgEnv, sourceId, grants) {
  const row = (await mirrorRows(app, pgEnv, 'source')).find(r => +r.data.source_id === +sourceId);
  if (!row) throw new Error(`source ${pgEnv}/${sourceId} has no mirror row in ${app} (reconcile-pgenv-mirror.js)`);
  const ap = parseJson(grants);
  await dmsController().setDataById(row.id, { auth_permissions: ap && typeof ap === 'object' ? ap : {} }, null, app, row.type);
  return ap;
}

async function unmirrorSourceIn(app, pgEnv, sourceId) {
  const ctl = dmsController();
  const views = (await mirrorRows(app, pgEnv, 'view')).filter(r => +r.data.source_id === +sourceId);
  for (const v of views) await ctl.deleteData(app, v.type, [v.id], null);
  const src = (await mirrorRows(app, pgEnv, 'source')).find(r => +r.data.source_id === +sourceId);
  if (src) await ctl.deleteData(app, src.type, [src.id], null);
  return (src ? 1 : 0) + views.length;
}

async function unmirrorViewsIn(app, pgEnv, viewIds) {
  const ctl = dmsController();
  const ids = new Set(viewIds.map(Number));
  const views = (await mirrorRows(app, pgEnv, 'view')).filter(r => ids.has(+r.data.view_id));
  for (const v of views) await ctl.deleteData(app, v.type, [v.id], null);
  return views.length;
}

/** Across every app that mirrors `pgEnv`. Errors are logged, never thrown (best effort). */
async function forEachMirrorApp(pgEnv, what, fn) {
  for (const app of await mirrorAppsOf(pgEnv)) {
    try {
      const r = await fn(app);
      if (r === 'no-env' || r === 'no-source') console.warn(`[mirror] ${what} ${pgEnv} → ${app}: ${r === 'no-env' ? 'no :dmsenv row for the pgEnv' : 'the source is not mirrored yet'} (reconcile-pgenv-mirror.js will catch up)`);
    } catch (e) { console.warn(`[mirror] ${what} ${pgEnv} → ${app} failed: ${e.message} (reconcile-pgenv-mirror.js will catch up)`); }
  }
}

const mirrorSource = (pgEnv, src) => forEachMirrorApp(pgEnv, `source ${src && src.source_id}`, app => mirrorSourceIn(app, pgEnv, src));
const mirrorView = (pgEnv, view) => forEachMirrorApp(pgEnv, `view ${view && view.view_id}`, app => mirrorViewIn(app, pgEnv, view));
const unmirrorSource = (pgEnv, sourceId) => forEachMirrorApp(pgEnv, `delete source ${sourceId}`, app => unmirrorSourceIn(app, pgEnv, sourceId));
const unmirrorViews = (pgEnv, viewIds) => forEachMirrorApp(pgEnv, `delete views ${viewIds}`, app => unmirrorViewsIn(app, pgEnv, viewIds));

/**
 * Run `fn` once the caller's transaction commits (`db` is a `withTransaction` handle), else now.
 * Never throws: the dama write has already happened.
 */
function afterWrite(db, fn) {
  const run = () => Promise.resolve().then(fn).catch(e => console.warn(`[mirror] ${e.message} (reconcile-pgenv-mirror.js will catch up)`));
  if (db && typeof db.afterCommit === 'function') { db.afterCommit(run); return Promise.resolve(); }
  return run();
}

// ---- reconcile ----------------------------------------------------------------------------------

const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');
const viewsTable = (db) => (db.type === 'postgres' ? 'data_manager.views' : 'views');

/**
 * Make `app`'s mirror of `pgEnv` equal to the pgEnv: the env row (created under the site row, or adopted
 * from a row of the same name), then every source and view (created, updated, deleted), then the app
 * registered in the pgEnv's `mirror_apps` (unless `register: false`). Dry run unless `apply`. Returns the plan
 * and counts.
 */
async function reconcile({ app, pgEnv, apply = false, register = true, log = () => {} }) {
  const dama = getDb(pgEnv);
  const tbl = table(app);
  const ctl = dmsController();
  const out = { app, pgEnv, env: null, sources: { create: 0, update: 0, delete: 0, same: 0 }, views: { create: 0, update: 0, delete: 0, same: 0 }, lines: [] };
  const say = (line) => { out.lines.push(line); log(line); };

  // 1. the env row
  let env = await envRowOf(app, pgEnv);
  if (!env) {
    const envs = await select(`SELECT id, type, data FROM ${tbl} WHERE app = $1 AND type LIKE '%:dmsenv'`, [app]);
    const byName = envs.map(r => ({ ...r, data: parseJson(r.data) || {} })).find(r => r.data.name === pgEnv && !r.data.pgEnv);
    if (byName) {
      say(`  ~ env row #${byName.id} ${byName.type} matches by name: set data.pgEnv`);
      out.env = { adopt: byName.id };
      if (apply) { await ctl.setDataById(byName.id, { pgEnv }, null, app, byName.type); env = await envRowOf(app, pgEnv); }
    } else {
      const sites = await select(`SELECT id, type FROM ${tbl} WHERE app = $1 AND type LIKE '%:site'`, [app]);
      if (sites.length !== 1) throw new Error(`${app}: expected one :site row to create the env row under, found ${sites.length}`);
      const type = `${getInstance(sites[0].type)}|${nameToSlug(pgEnv) || pgEnv}:dmsenv`;
      say(`  + env row ${type} (parent #${sites[0].id})`);
      out.env = { create: type };
      if (apply) { await ctl.createData([app, type, { name: pgEnv, pgEnv, sources: [], parent_id: sites[0].id }], null); env = await envRowOf(app, pgEnv); }
    }
  } else {
    out.env = { id: env.id };
  }

  // 2. the pgEnv's rows and the mirror's
  const { rows: srcs } = await dama.query(`SELECT source_id, name, type, categories, description, auth_permissions FROM ${sourcesTable(dama)}`);
  const { rows: views } = await dama.query(`SELECT view_id, source_id, version FROM ${viewsTable(dama)}`);
  const mSources = await mirrorRows(app, pgEnv, 'source');
  const mViews = await mirrorRows(app, pgEnv, 'view');
  const mSourceById = new Map(mSources.map(r => [+r.data.source_id, r]));
  const mViewById = new Map(mViews.map(r => [+r.data.view_id, r]));
  const damaSourceIds = new Set(srcs.map(s => +s.source_id));
  const damaViewIds = new Set(views.map(v => +v.view_id));

  // 3. sources
  for (const s of srcs) {
    const have = mSourceById.get(+s.source_id);
    const data = sourceData(pgEnv, s);
    if (!have) {
      out.sources.create++; say(`  + source ${s.source_id} "${s.name}"`);
      if (apply && env) {
        const type = `${getInstance(env.type)}|${slugOf(s)}:source`;
        const [row] = await ctl.createData([app, type, { ...data, parent_id: env.id }], null);
        mSourceById.set(+s.source_id, { id: row.id, type, data });
      }
    } else if (differs(have, data, MIRRORED_SOURCE_KEYS)) {
      out.sources.update++; say(`  ~ source ${s.source_id} "${s.name}": ${MIRRORED_SOURCE_KEYS.filter(k => !same(have.data[k] ?? null, data[k] ?? null)).join(', ')}`);
      const { auth_permissions, ...origin } = data;   // the mirror's grants are its own
      if (apply) await ctl.setDataById(have.id, origin, null, app, have.type);
    } else out.sources.same++;
  }
  for (const r of mSources) if (!damaSourceIds.has(+r.data.source_id)) {
    out.sources.delete++; say(`  - source ${r.data.source_id} (row #${r.id}): gone from ${pgEnv}`);
    if (apply) await ctl.deleteData(app, r.type, [r.id], null);
  }

  // 4. views
  for (const v of views) {
    const have = mViewById.get(+v.view_id);
    const data = viewData(pgEnv, v);
    const src = mSourceById.get(+v.source_id);
    if (!have) {
      out.views.create++; say(`  + view ${v.view_id} of source ${v.source_id}`);
      if (apply && src) await ctl.createData([app, `${getInstance(src.type)}|v${v.view_id}:view`, { ...data, parent_id: src.id }], null);
    } else if (differs(have, data, [...MIRRORED_VIEW_KEYS, 'source_id', 'name'])) {
      out.views.update++; say(`  ~ view ${v.view_id}`);
      if (apply) await ctl.setDataById(have.id, data, null, app, have.type);
    } else out.views.same++;
  }
  for (const r of mViews) if (!damaViewIds.has(+r.data.view_id) || !damaSourceIds.has(+r.data.source_id)) {
    out.views.delete++; say(`  - view ${r.data.view_id} (row #${r.id}): gone from ${pgEnv}`);
    if (apply) await ctl.deleteData(app, r.type, [r.id], null);
  }

  // 5. the app is a mirror of this pgEnv from now on (the hooks read this). The one write to the pgEnv;
  // `register: false` skips it, for a copy (the tenant hub) whose pgEnvs belong to another server: listed
  // there, that server's hooks would write the app's rows into its OWN DMS database.
  if (apply && register) { if (await registerMirrorApp(pgEnv, app)) say(`  registered ${app} in ${pgEnv}'s settings.mirror_apps`); }
  out.clean = !out.env?.create && !out.env?.adopt && !out.sources.create && !out.sources.update && !out.sources.delete && !out.views.create && !out.views.update && !out.views.delete;
  return out;
}

module.exports = {
  mirrorSource, mirrorView, unmirrorSource, unmirrorViews, afterWrite,
  mirrorAppsOf, registerMirrorApp, forgetMirrorApps, envRowOf, mirrorRows, grantsIn, setGrantsIn, reconcile,
  MIRRORED_SOURCE_KEYS, MIRRORED_VIEW_KEYS,
};
