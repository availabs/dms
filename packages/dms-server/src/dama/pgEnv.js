'use strict';
/**
 * A PGENV, AS A SITE SEES IT — one `:dmsenv` row, and nothing else in DMS.
 *
 * A pgEnv's sources and views live in its own database (`data_manager.sources` / `views`) and are read
 * there. What a site keeps for a pgEnv it uses is ONE row, `{site}|{name}:dmsenv` with `data.pgEnv`: it
 * carries the site's env-level grants and vocabulary, and is what `create-source` is asked of. The auth
 * layer builds a source's or view's row in memory, parented to it (routes/auth/owners.js).
 *
 * Until 2026-11-12 every source and view was also MIRRORED as a DMS row per site (`dama/mirror.js`).
 * That was reversed: keeping two databases in step cost more than a pgEnv case inside auth
 * (planning/tasks/current/pgenv-auth-without-mirror-rows.md). A source's grants are the pgEnv's own
 * `auth_permissions` column again, shared by every app on the pgEnv.
 */
const { getDb } = require('../db');
const { jsonExtract } = require('../db/query-utils');
const { resolveTable } = require('../db/table-resolver');
const { nameToSlug, getInstance } = require('../db/type-utils');

const sourcesTable = (db) => (db.type === 'postgres' ? 'data_manager.sources' : 'sources');
const viewsTable = (db) => (db.type === 'postgres' ? 'data_manager.views' : 'views');

const parseJson = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };
const dmsDbEnv = () => process.env.DMS_DB_ENV || 'dms-sqlite';
const dmsDb = () => getDb(dmsDbEnv());
const splitModeOf = () => { try { return require('../db').loadConfig(dmsDbEnv()).splitMode; } catch { return require('../db/table-resolver').resolveSplitMode(); } };

/** The app's main table, as a name only: reading never creates one. */
const table = (app) => resolveTable(app, '', dmsDb().type, splitModeOf()).fullName;

/** A read of an app's table; an app with no table yet has no rows. */
async function select(sql, params) {
  try { return (await dmsDb().query(sql, params)).rows; }
  catch (e) { if (/no such table|does not exist/i.test(e.message)) return []; throw e; }
}

/** The `:dmsenv` row of `app` whose `data.pgEnv` is `pgEnv`, or null. */
async function envRowOf(app, pgEnv) {
  const rows = await select(
    `SELECT id, type, data FROM ${table(app)} WHERE app = $1 AND type LIKE '%:dmsenv' AND ${jsonExtract('data', 'pgEnv', dmsDb().type)} = $2 ORDER BY id LIMIT 1`,
    [app, pgEnv]);
  return rows[0] ? { ...rows[0], data: parseJson(rows[0].data) || {} } : null;
}

/**
 * Make sure `app` has its env row for `pgEnv`: found, adopted from a `:dmsenv` row of the same name that
 * predates `data.pgEnv`, or created under the site row. Dry run unless `apply`. Returns
 * `{ id }` | `{ adopt: id }` | `{ create: type }`, with `row` once it exists.
 */
async function ensureEnvRow({ app, pgEnv, apply = false, log = () => {} }) {
  let env = await envRowOf(app, pgEnv);
  if (env) return { id: env.id, row: env };
  const ctl = require('../routes/dms/dms.controller').createController(dmsDbEnv());
  const tbl = table(app);
  const envs = await select(`SELECT id, type, data FROM ${tbl} WHERE app = $1 AND type LIKE '%:dmsenv'`, [app]);
  const byName = envs.map(r => ({ ...r, data: parseJson(r.data) || {} })).find(r => r.data.name === pgEnv && !r.data.pgEnv);
  if (byName) {
    log(`  ~ env row #${byName.id} ${byName.type} matches by name: set data.pgEnv`);
    if (apply) await ctl.setDataById(byName.id, { pgEnv }, null, app, byName.type);
    return { adopt: byName.id, row: apply ? await envRowOf(app, pgEnv) : null };
  }
  const sites = await select(`SELECT id, type FROM ${tbl} WHERE app = $1 AND type LIKE '%:site'`, [app]);
  if (sites.length !== 1) throw new Error(`${app}: expected one :site row to create the env row under, found ${sites.length}`);
  const type = `${getInstance(sites[0].type)}|${nameToSlug(pgEnv) || pgEnv}:dmsenv`;
  log(`  + env row ${type} (parent #${sites[0].id})`);
  if (apply) await ctl.createData([app, type, { name: pgEnv, pgEnv, sources: [], parent_id: sites[0].id }], null);
  return { create: type, row: apply ? await envRowOf(app, pgEnv) : null };
}

module.exports = { sourcesTable, viewsTable, envRowOf, ensureEnvRow };
