'use strict';
/**
 * A site's plugin activations, as the hub's admin sets them (dms-plugin-system.md, P2 step 5).
 *
 *     describe(app)                           { installed: [{ name, versions, current, permissions: { <version>: [..] } }],
 *                                               activations: [{ id, plugin, enabled, version, permissions }] }
 *     setActivation({ app, plugin, enabled, version, acceptPermissions, user })
 *                                             make sure the site has its one `plugin_activation` row for the
 *                                             plugin, with these values, listed on its site row. A version asking
 *                                             for permissions the row hasn't accepted is refused (409,
 *                                             `newPermissions`) unless `acceptPermissions` is true
 *
 * An activation is `{site}|{plugin}:plugin_activation` under the app's site row (`parent_id`), listed in the site
 * row's `plugin_activations` (what the site load reads, dmsSiteFactory). The values go through the same write
 * check as the general write path (an installed version, or the current one; the config against the version's
 * settings; no permission the site hasn't accepted: store.js activationWriteCheck).
 * The routes (routes/tenants) judge the caller; nothing here does.
 */
const { getDb } = require('../db');
const { resolveTable } = require('../db/table-resolver');
const { nameToSlug, getInstance } = require('../db/type-utils');
const { checkWrite } = require('../routes/dms/write-checks');
const store = require('./store');

const refuse = (status, message) => Object.assign(new Error(message), { status });
const parseJson = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };
const dmsDbEnv = () => process.env.DMS_DB_ENV || 'dms-sqlite';
const dmsDb = () => getDb(dmsDbEnv());
const splitModeOf = () => { try { return require('../db').loadConfig(dmsDbEnv()).splitMode; } catch { return require('../db/table-resolver').resolveSplitMode(); } };
const table = (app) => resolveTable(app, '', dmsDb().type, splitModeOf()).fullName;

async function select(sql, params) {
  try { return (await dmsDb().query(sql, params)).rows; }
  catch (e) { if (/no such table|does not exist/i.test(e.message)) return []; throw e; }
}

async function activationRows(app) {
  const rows = await select(`SELECT id, type, data FROM ${table(app)} WHERE app = $1 AND type LIKE '%:plugin_activation' ORDER BY id`, [app]);
  return rows.map(r => ({ id: +r.id, type: r.type, data: parseJson(r.data) || {} }));
}

const isOn = (raw) => !(raw === false || raw === 'false' || raw === 0 || raw === '0');

async function describe(app, { dir } = {}) {
  return {
    installed: store.listInstalled(dir || store.pluginsDir()).map(p => ({
      ...p, permissions: Object.fromEntries(p.versions.map(v => [v, store.releasePermissions(p.name, v, dir || store.pluginsDir())])),
    })),
    activations: (await activationRows(app)).map(r => ({
      id: r.id, plugin: r.data.plugin || '', enabled: isOn(r.data.enabled), version: r.data.version || '',
      permissions: Array.isArray(r.data.permissions) ? r.data.permissions : [],
    })),
  };
}

async function setActivation({ app, plugin, enabled, version, acceptPermissions = false, user = null, dir = store.pluginsDir() }) {
  const name = `${plugin || ''}`.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw refuse(400, 'Name the plugin (lowercase letters, digits, underscores)');
  const ctl = require('../routes/dms/dms.controller').createController(dmsDbEnv());
  const patch = {};
  if (enabled !== undefined) patch.enabled = isOn(enabled);
  if (version !== undefined) patch.version = `${version || ''}`.trim();

  const existing = (await activationRows(app)).find(r => r.data.plugin === name);
  if (acceptPermissions === true) {
    // the caller has seen and accepts what the target version asks for
    const target = patch.version || existing?.data.version || store.currentVersion(name, dir);
    if (target) patch.permissions = store.releasePermissions(name, target, dir);
  }
  let id;
  if (existing) {
    const data = await checkWrite('edit', { app, type: existing.type, data: patch, stored: existing.data });
    if (Object.keys(data).length) await ctl.setDataById(existing.id, data, user, app, existing.type);
    id = existing.id;
  } else {
    const sites = await select(`SELECT id, type, data FROM ${table(app)} WHERE app = $1 AND type LIKE '%:site' ORDER BY id`, [app]);
    if (sites.length !== 1) throw refuse(409, `${app}: expected one :site row to put the activation under, found ${sites.length}`);
    const site = sites[0];
    const type = `${getInstance(site.type)}|${nameToSlug(name) || name}:plugin_activation`;
    const data = await checkWrite('create', { app, type, data: { plugin: name, enabled: true, config: {}, ...patch, parent_id: +site.id } });
    const [row] = await ctl.createData([app, type, data], user);
    id = +row.id;
    const list = Array.isArray(parseJson(site.data)?.plugin_activations) ? parseJson(site.data).plugin_activations : [];
    if (!list.some(e => `${e && e.id}` === `${id}`)) {
      await ctl.setDataById(+site.id, { plugin_activations: [...list, { id: String(id), ref: `${app}+${type}` }] }, user, app, site.type);
    }
  }
  // the app's auth snapshot predates the row: without this, reads of it keep missing until it ages out
  require('../routes/auth/owners').clearSnapshots();
  return { id };
}

module.exports = { describe, setActivation };
