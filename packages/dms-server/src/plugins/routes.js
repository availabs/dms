/**
 * Plugin routes (dms-plugin-system.md, P2 plan step 3).
 *
 * Files (public, mounted before the hosted sites, whose fallback answers any unknown path):
 *   GET  /_dms/plugins/:name/:version/client.js   the browser's entry: a two-line module re-exporting the release's
 *                                                 `client` entry, so the page needs no manifest (plugins/load.js)
 *   GET  /_dms/plugins/:name/:version/<file>      a file the release's index.json lists; nothing else
 * Versions are immutable (installer.js), so both are cached for a year. Pages on other origins (Netlify-served
 * sites) import them as modules, so they answer CORS.
 *
 * Admin (after the auth middleware):
 *   GET  /_dms/plugins                            installed plugins [{ name, versions, current }] (signed in)
 *   GET  /_dms/plugins/manage                     the admin's Plugins page (`install-plugins`, as below): each
 *                                                 installed plugin with its versions (what each contributes and asks
 *                                                 for, whether it has server code), the current one, the one whose
 *                                                 server code is running, whether a restart is needed, where it came
 *                                                 from; and whether this server accepts unsigned installs
 *   POST /_dms/plugins/:name/current { version }  make an installed version the current one (`install-plugins`):
 *                                                 what new activations get, and the server code after a restart
 *   POST /_dms/plugins/install { url }            hub staff holding `install-plugins` on the hub's site row,
 *                                                 judged here whatever DMS_AUTH_MODE says: fetch and verify the
 *                                                 release (installer.js), make it the current version, record it
 *                                                 on the `plugin` row (the server's own write: the general write
 *                                                 path refuses that kind to everyone, `serverOnly`)
 */
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { installRelease } = require('./installer');

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.txt': 'text/plain', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

const hubApp = () => process.env.DMS_APP || process.env.VITE_DMS_APP || '';
const hubType = () => process.env.DMS_TYPE || process.env.VITE_DMS_TYPE || '';

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function registerFileRoutes(app, { dir } = {}) {
  app.get('/_dms/plugins/:name/:version/client.js', (req, res, next) => {
    const d = dir || store.pluginsDir();
    const index = store.releaseIndex(req.params.name, req.params.version, d);
    const entry = index?.entries?.client;
    if (!entry || !store.releaseFile(req.params.name, req.params.version, entry, d)) return next();
    const rel = './' + path.posix.normalize(entry.replace(/^\.\//, ''));
    sendCors(res);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(`export * from ${JSON.stringify(rel)};\nexport { default } from ${JSON.stringify(rel)};\n`);
  });
  app.get(/^\/_dms\/plugins\/([a-z][a-z0-9_]*)\/([^/]+)\/(.+)$/, (req, res, next) => {
    const [name, version, file] = [req.params[0], req.params[1], req.params[2]];
    const p = store.releaseFile(name, version, decodeURIComponent(file), dir || store.pluginsDir());
    if (!p || !fs.existsSync(p)) return next();
    sendCors(res);
    res.setHeader('Content-Type', TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(p).on('error', next).pipe(res);
  });
}

/** The `plugin` row's type in the hub's app: `<site instance>|<name>:plugin`. */
function pluginRowType(name) {
  const t = hubType();
  const inst = t.includes(':') ? t.split(':')[0].split('|').pop() : t;
  return `${inst}|${name}:plugin`;
}

async function recordInstall(controller, { name, version, url, user }) {
  const app = hubApp();
  const type = pluginRowType(name);
  const rows = await controller.getRowsByTypes(app, [type]);
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || {};
  const row = rows.find(r => parse(r.data).name === name);
  const prev = row ? parse(row.data) : {};
  const versions = [...new Set([...(Array.isArray(prev.versions) ? prev.versions : []), version])];
  const data = { name, source_url: url, versions, current: version, status: 'installed', installed_at: new Date().toISOString() };
  if (row) await controller.setDataById(row.id, data, user, app, type);
  else await controller.createData([app, type, data], user);
}

/**
 * What the admin's Plugins page shows. Server code is loaded once, at start (D2), so a plugin needs a restart when
 * the current version's server code isn't the one running, or the running one has none any more.
 */
async function manageView({ dir, controller }) {
  const d = dir || store.pluginsDir();
  const installed = store.listInstalled(d);
  const recorded = {};
  if (controller && hubApp() && installed.length) {
    try {
      const rows = await controller.getRowsByTypes(hubApp(), installed.map(p => pluginRowType(p.name)));
      for (const r of rows) {
        const data = (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) || {};
        if (data.name) recorded[data.name] = data;
      }
    } catch (e) { console.warn(`[plugins] reading the install records failed: ${e.message}`); }
  }
  const plugins = installed.map(({ name, versions, current }) => {
    const running = store.runningServerVersion(name);
    const hasServer = (v) => Boolean(v && store.releaseIndex(name, v, d)?.entries?.server);
    return {
      name, current, running,
      restartNeeded: hasServer(current) ? running !== current : Boolean(running),
      sourceUrl: recorded[name]?.source_url || '',
      installedAt: recorded[name]?.installed_at || '',
      versions: versions.map(version => {
        const index = store.releaseIndex(name, version, d) || {};
        return {
          version, api: index.api || '', activation: index.activation || 'opt-in',
          contributes: index.contributes || {}, permissions: store.releasePermissions(name, version, d),
          hasServer: hasServer(version), hasSettings: Boolean(index.settings),
        };
      }),
    };
  });
  return { plugins, unsignedAllowed: process.env.DMS_PLUGIN_ALLOW_UNSIGNED === '1' };
}

async function recordCurrent(controller, { name, version, user }) {
  const app = hubApp();
  const type = pluginRowType(name);
  const rows = await controller.getRowsByTypes(app, [type]);
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || {};
  const row = rows.find(r => parse(r.data).name === name);
  if (row) await controller.setDataById(row.id, { ...parse(row.data), current: version }, user, app, type);
}

function registerAdminRoutes(app, { dir, controller, siteCan, requireUser, verifySignature, fetchImpl } = {}) {
  app.get('/_dms/plugins', (req, res) => {
    if (!requireUser(req, res)) return;
    res.json(store.listInstalled(dir || store.pluginsDir()));
  });

  // the caller, if they hold install-plugins on the hub's site row (judged whatever DMS_AUTH_MODE says); else null, answered
  const installer = async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return null;
    if (!(await siteCan(hubApp(), user, ['install-plugins']))) {
      res.status(403).json({ error: 'Not authorized: needs install-plugins on the hub' });
      return null;
    }
    return user;
  };

  app.get('/_dms/plugins/manage', async (req, res) => {
    if (!(await installer(req, res))) return;
    try { res.json(await manageView({ dir, controller })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/_dms/plugins/:name/current', async (req, res) => {
    const user = await installer(req, res);
    if (!user) return;
    const { name } = req.params;
    const version = `${(req.body && req.body.version) || ''}`.trim();
    const d = dir || store.pluginsDir();
    if (!store.releaseIndex(name, version, d)) return res.status(400).json({ error: `${name} ${version || '(no version)'} is not installed on this server` });
    try {
      store.setCurrentVersion(name, version, d);
      if (controller) await recordCurrent(controller, { name, version, user });
      console.log(`[plugins] ${name}: current version ${version}, by ${user.email}`);
      res.json(await manageView({ dir, controller }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  let running = null;
  app.post('/_dms/plugins/install', async (req, res) => {
    const user = await installer(req, res);
    if (!user) return;
    const url = req.body && req.body.url;
    if (typeof url !== 'string' || !url) return res.status(400).json({ error: 'url: the release index.json URL' });
    if (running) return res.status(409).json({ error: 'another install is running' });
    const d = dir || store.pluginsDir();
    try {
      running = installRelease({ url, dir: d, ...(verifySignature ? { verifySignature } : {}), ...(fetchImpl ? { fetchImpl } : {}) });
      const r = await running;
      store.setCurrentVersion(r.name, r.version, d);
      if (controller) await recordInstall(controller, { name: r.name, version: r.version, url, user });
      const index = store.releaseIndex(r.name, r.version, d);
      res.json({
        name: r.name, version: r.version, already: r.already,
        // client, SSR and themes are live at once; server code at the next (rolling) restart (D2)
        restartNeeded: Boolean(index?.entries?.server),
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    } finally {
      running = null;
    }
  });
}

module.exports = { registerFileRoutes, registerAdminRoutes, pluginRowType, manageView };
