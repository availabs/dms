/**
 * Installed plugins on this server: what `installRelease` wrote under the plugins folder, and the files a page or
 * the server render may load from it.
 *
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md, P2 plan steps 3–4.
 *
 *   <dir>/<name>/<version>/            a release, complete (installer.js renames it into place): index.json,
 *                                      .dms-release.json and the listed files
 *   <dir>/<name>/current.json          { version }: the version this server runs (the install route sets it).
 *                                      Client and SSR parts follow it at once; server code at the next start (D2)
 *
 * A file is served only if the release's index.json lists it, so nothing else in the folder is reachable.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { safeRelative } = require('./index');

const NAME = /^[a-z][a-z0-9_]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

function pluginsDir() {
  return process.env.DMS_PLUGINS_DIR || path.resolve(__dirname, '../../var/plugins');
}

const releases = new Map();   // `${dir}|${name}@${version}` -> index (null: not installed)

/** A complete installed release's index.json, or null. */
function releaseIndex(name, version, dir = pluginsDir()) {
  if (!NAME.test(name || '') || !VERSION.test(version || '')) return null;
  const key = `${dir}|${name}@${version}`;
  if (releases.has(key) && releases.get(key)) return releases.get(key);
  const folder = path.join(dir, name, version);
  let index = null;
  try {
    if (fs.existsSync(path.join(folder, '.dms-release.json'))) {
      index = JSON.parse(fs.readFileSync(path.join(folder, 'index.json'), 'utf8'));
      if (index.name !== name || index.version !== version) index = null;
    }
  } catch { index = null; }
  if (index) releases.set(key, index);   // a release never changes; a missing one may appear later
  return index;
}

/** The absolute path of a file the release lists, or null. */
function releaseFile(name, version, file, dir = pluginsDir()) {
  const index = releaseIndex(name, version, dir);
  if (!index || !safeRelative(file)) return null;
  const norm = path.posix.normalize(file.replace(/^\.\//, ''));
  if (!(index.files || []).some(f => path.posix.normalize(f.path.replace(/^\.\//, '')) === norm)) return null;
  return path.join(dir, name, version, ...norm.split('/'));
}

/** The path of a release's entry (`client`, `ssr`, `server`, `classes`, …), or null. */
function entryPath(name, version, kind, dir = pluginsDir()) {
  const index = releaseIndex(name, version, dir);
  const entry = index?.entries?.[kind];
  return entry ? releaseFile(name, version, entry, dir) : null;
}

/** The file URL the server render imports a plugin's SSR entry from (falling back to its client entry), or null. */
function ssrEntryUrl(name, version, dir = pluginsDir()) {
  const p = entryPath(name, version, 'ssr', dir) || entryPath(name, version, 'client', dir);
  return p ? pathToFileURL(p).href : null;
}

function currentVersion(name, dir = pluginsDir()) {
  if (!NAME.test(name || '')) return null;
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(dir, name, 'current.json'), 'utf8'));
    return releaseIndex(name, version, dir) ? version : null;
  } catch { return null; }
}

function setCurrentVersion(name, version, dir = pluginsDir()) {
  if (!releaseIndex(name, version, dir)) throw new Error(`${name} ${version} is not installed`);
  const file = path.join(dir, name, 'current.json');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version, at: new Date().toISOString() }) + '\n');
  fs.renameSync(tmp, file);
}

/** Every installed plugin: [{ name, versions, current }]. */
function listInstalled(dir = pluginsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && NAME.test(e.name))
    .map(e => ({
      name: e.name,
      versions: fs.readdirSync(path.join(dir, e.name), { withFileTypes: true })
        .filter(v => v.isDirectory() && VERSION.test(v.name) && releaseIndex(e.name, v.name, dir))
        .map(v => v.name),
      current: currentVersion(e.name, dir),
    }))
    .filter(p => p.versions.length);
}

/**
 * At boot: each installed plugin's current version with a server entry is registered as a data type, its routes
 * judged under `enforce` whatever DMS_AUTH_MODE says (P0 finding 1). A plugin compiled into the app of the same
 * name is left alone. Returns the names registered.
 */
const loadedServer = new Map();   // name -> the version whose server entry this process registered at start

function registerInstalledServerPlugins(registerDatatype, { dir = pluginsDir(), isRegistered = () => false } = {}) {
  const done = [];
  for (const { name, current } of listInstalled(dir)) {
    if (!current || isRegistered(name)) continue;
    const entry = entryPath(name, current, 'server', dir);
    if (!entry) continue;
    try {
      registerDatatype(name, require(entry), { authMode: 'enforce' });
      loadedServer.set(name, current);
      done.push(name);
    } catch (e) {
      console.error(`[plugins] ${name} ${current}: its server entry did not register: ${e.message}`);
    }
  }
  return done;
}

/**
 * The write check for `plugin_activation` rows (routes/dms/write-checks.js; P2 step 5): run on every create and on
 * an edit that touches `plugin`, `version`, `config` or `permissions`, after the auth guard.
 *   - `plugin` is required.
 *   - A `version` must be installed on this server (refused, 400, otherwise).
 *   - No version, and the plugin is installed: the current version is written, so the row names what it runs.
 *     A plugin that isn't installed may be compiled into the app, which needs no version: left as sent.
 *   - For an installed plugin, the row's `config` (as stored, with this write over it) must fit the version's
 *     settings schema (plugins/index.js checkConfig); 400 otherwise. So a version change that the config no longer
 *     fits is refused too.
 *   - `permissions` on the row is what the site has accepted: the server writes the version's own list there. A
 *     create accepts the version's permissions (activating is consenting). An edit to a version asking for any
 *     permission the row has not accepted is refused (409, with `newPermissions`) unless the same write sends
 *     `permissions` covering them: a fresh activation, never a silent upgrade (Forge's rule). A row from before
 *     this check is taken to have accepted its stored version's permissions.
 */
function activationWriteCheck({ dir } = {}) {
  const { checkConfig, permissionList } = require('./index');
  const refuse = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });
  return {
    keys: ['plugin', 'version', 'config', 'permissions'],
    async check({ op, data, stored }) {
      const d = dir || pluginsDir();
      const merged = { ...(stored || {}), ...data };
      const name = typeof merged.plugin === 'string' ? merged.plugin.trim() : '';
      if (!name) throw refuse('plugin_activation: `plugin` names the plugin');
      const given = typeof merged.version === 'string' ? merged.version.trim() : '';
      if (given && !releaseIndex(name, given, d)) throw refuse(`plugin ${name} ${given} is not installed on this server`);
      const version = given || currentVersion(name, d);
      if (!version) return data;   // not installed: compiled into the app (or nowhere); nothing to check against
      const index = releaseIndex(name, version, d);
      const out = { ...data };
      if (!given || 'version' in data) out.version = version;

      const problems = checkConfig(index.settings, merged.config);
      if (problems.length) throw refuse(`plugin ${name} ${version}: ${problems.join('; ')}`);

      const needed = permissionList(index.permissions);
      if ('permissions' in data && !(Array.isArray(data.permissions) && data.permissions.every(p => typeof p === 'string'))) {
        throw refuse('plugin_activation: `permissions` is the list of permissions accepted');
      }
      if (op !== 'create') {
        const storedVersion = typeof stored?.version === 'string' ? stored.version.trim() : '';
        const accepted = Array.isArray(data.permissions) ? data.permissions
          : Array.isArray(stored?.permissions) ? stored.permissions
          : permissionList(storedVersion && releaseIndex(name, storedVersion, d)?.permissions);
        const newPermissions = needed.filter(p => !accepted.includes(p));
        if (newPermissions.length) {
          throw refuse(`plugin ${name} ${version} asks for permissions this site has not accepted: ${newPermissions.join(', ')}. ` +
            'Accept them to switch (a fresh activation)', 409, { newPermissions });
        }
      } else if (Array.isArray(data.permissions)) {
        const missing = needed.filter(p => !data.permissions.includes(p));
        if (missing.length) throw refuse(`plugin ${name} ${version} asks for permissions not accepted: ${missing.join(', ')}`, 409, { newPermissions: missing });
      }
      out.permissions = needed;
      return out;
    },
  };
}

/** A release's permissions as "kind:value" strings, or [] (not installed). */
function releasePermissions(name, version, dir = pluginsDir()) {
  return require('./index').permissionList(releaseIndex(name, version, dir)?.permissions);
}

module.exports = {
  pluginsDir, releaseIndex, releaseFile, entryPath, ssrEntryUrl, currentVersion, setCurrentVersion, listInstalled,
  registerInstalledServerPlugins, activationWriteCheck, releasePermissions,
  /** The version of `name` whose server code this process runs (registered at start), or null. */
  runningServerVersion: (name) => loadedServer.get(name) || null,
};
