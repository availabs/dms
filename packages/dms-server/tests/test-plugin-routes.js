/**
 * Installed plugins over HTTP (src/plugins/routes.js, store.js; dms-plugin-system.md P2 plan step 3).
 *
 * A local HTTP server serves a release; an express app mounts the plugin routes with stub auth (a header names the
 * user; user 1 holds install-plugins) and a stub controller. Covers: install refused without the verb or a URL;
 * installed, made current, recorded on the `plugin` row (created, then updated); the browser entry and the listed
 * files served with CORS and immutable caching, nothing unlisted; the SSR entry's file URL; installed server code
 * registered at start under enforce, never over a compiled-in data type. No database.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const express = require('express');
const { registerFileRoutes, registerAdminRoutes, pluginRowType } = require('../src/plugins/routes');
const store = require('../src/plugins/store');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const files = {
  'package.json': Buffer.from(JSON.stringify({ name: '@availabs/dms-plugin-hello', version: '1.0.0', type: 'module' })),
  'dist/plugin.js': Buffer.from('export default { name: "hello", version: "1.0.0" }\n'),
  'dist/server.cjs': Buffer.from('module.exports = { name: "hello", version: "1.0.0", api: "^1.0", register: () => ({ routes() {} }) }\n'),
};
const index = {
  name: 'hello', version: '1.0.0', api: '^1.0', activation: 'opt-in', contributes: { patterns: ['hello'] },
  entries: { client: 'dist/plugin.js', ssr: 'dist/plugin.js', server: 'dist/server.cjs' }, permissions: {},
  files: Object.entries(files).map(([p, b]) => ({ path: p, size: b.length, sha512: crypto.createHash('sha512').update(b).digest('hex') })),
};

async function run() {
  const releaseSrv = http.createServer((req, res) => {
    const body = req.url === '/r/index.json' ? Buffer.from(JSON.stringify(index)) : files[req.url.replace(/^\/r\//, '')];
    if (!body) { res.statusCode = 404; return res.end(); }
    res.end(body);
  });
  await new Promise(r => releaseSrv.listen(0, '127.0.0.1', r));
  const releaseUrl = `http://127.0.0.1:${releaseSrv.address().port}/r/index.json`;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-routes-'));
  const prevType = process.env.DMS_TYPE, prevApp = process.env.DMS_APP;
  process.env.DMS_TYPE = 'prod'; process.env.DMS_APP = 'hubapp';
  const rows = [];
  const controller = {
    getRowsByTypes: async (app, types) => rows.filter(r => r.app === app && types.includes(r.type)),
    createData: async ([app, type, data]) => { rows.push({ id: rows.length + 1, app, type, data }); },
    setDataById: async (id, data) => { rows.find(r => r.id === id).data = data; },
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { const id = +req.headers['x-user'] || 0; req.user = id ? { id } : null; next(); });
  registerFileRoutes(app, { dir });
  registerAdminRoutes(app, {
    dir, controller,
    requireUser: (req, res) => req.user || (res.status(401).json({ error: 'sign in' }), null),
    siteCan: async (site, user, perms) => site === 'hubapp' && user.id === 1 && perms.includes('install-plugins'),
    verifySignature: async () => true,
  });
  const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, { user, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, headers: res.headers, text, json };
  };

  console.log('\nplugin routes');
  await t('install: refused signed out and without install-plugins', async () => {
    assert.strictEqual((await call('POST', '/_dms/plugins/install', { body: { url: releaseUrl } })).status, 401);
    assert.strictEqual((await call('POST', '/_dms/plugins/install', { user: 2, body: { url: releaseUrl } })).status, 403);
    assert(!fs.existsSync(path.join(dir, 'hello')));
  });
  await t('install: a URL is required', async () => {
    assert.strictEqual((await call('POST', '/_dms/plugins/install', { user: 1, body: {} })).status, 400);
  });
  await t('install: installed, made current, recorded on the plugin row', async () => {
    const r = await call('POST', '/_dms/plugins/install', { user: 1, body: { url: releaseUrl } });
    assert.strictEqual(r.status, 200, r.text);
    assert.deepStrictEqual(r.json, { name: 'hello', version: '1.0.0', already: false, restartNeeded: true });
    assert.strictEqual(store.currentVersion('hello', dir), '1.0.0');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].type, 'prod|hello:plugin');
    assert.strictEqual(pluginRowType('hello'), 'prod|hello:plugin');
    assert.deepStrictEqual([rows[0].data.name, rows[0].data.current, rows[0].data.versions, rows[0].data.source_url], ['hello', '1.0.0', ['1.0.0'], releaseUrl]);
  });
  await t('install again: a no-op install, the same row updated', async () => {
    const r = await call('POST', '/_dms/plugins/install', { user: 1, body: { url: releaseUrl } });
    assert.strictEqual(r.json.already, true);
    assert.strictEqual(rows.length, 1);
  });
  await t('the list needs a signed-in user', async () => {
    assert.strictEqual((await call('GET', '/_dms/plugins')).status, 401);
    assert.deepStrictEqual((await call('GET', '/_dms/plugins', { user: 2 })).json, [{ name: 'hello', versions: ['1.0.0'], current: '1.0.0' }]);
  });
  await t('the browser entry re-exports the client entry, with CORS and immutable caching', async () => {
    const r = await call('GET', '/_dms/plugins/hello/1.0.0/client.js');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
    assert.match(r.headers.get('cache-control'), /immutable/);
    assert.strictEqual(r.text, 'export * from "./dist/plugin.js";\nexport { default } from "./dist/plugin.js";\n');
  });
  await t('a listed file is served; nothing unlisted, no other version, no way out of the folder', async () => {
    const r = await call('GET', '/_dms/plugins/hello/1.0.0/dist/plugin.js');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.text, files['dist/plugin.js'].toString());
    assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
    for (const p of ['/_dms/plugins/hello/1.0.0/.dms-release.json', '/_dms/plugins/hello/1.0.0/index.json', '/_dms/plugins/hello/2.0.0/dist/plugin.js',
      '/_dms/plugins/hello/1.0.0/..%2F..%2Fcurrent.json', '/_dms/plugins/nope/1.0.0/client.js']) {
      assert.strictEqual((await call('GET', p)).status, 404, p);
    }
  });
  await t('the server render imports the SSR entry from the version folder', async () => {
    assert.strictEqual(store.ssrEntryUrl('hello', '1.0.0', dir), require('url').pathToFileURL(path.join(dir, 'hello', '1.0.0', 'dist', 'plugin.js')).href);
    assert.strictEqual(store.ssrEntryUrl('hello', '9.0.0', dir), null);
  });
  await t('server code registers at start, under enforce; never over a compiled-in data type', async () => {
    const seen = [];
    const done = store.registerInstalledServerPlugins((name, mod, opts) => seen.push({ name, mod, opts }), { dir });
    assert.deepStrictEqual(done, ['hello']);
    assert.strictEqual(seen[0].opts.authMode, 'enforce');
    assert.strictEqual(typeof seen[0].mod.register, 'function');
    assert.deepStrictEqual(store.registerInstalledServerPlugins(() => { throw new Error('called'); }, { dir, isRegistered: (n) => n === 'hello' }), []);
  });

  // the admin's Plugins page (P2 step 5): what is installed, what is running, switching the current version
  await t('host: only the hub app is told it is the hub (public, not cached)', async () => {
    const hub = await call('GET', '/_dms/plugins/host?app=hubapp');
    assert.strictEqual(hub.status, 200, hub.text);
    assert.deepStrictEqual(hub.json, { hub: true });
    assert.strictEqual(hub.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual((await call('GET', '/_dms/plugins/host?app=netlifysite')).json, { hub: false });
    assert.deepStrictEqual((await call('GET', '/_dms/plugins/host')).json, { hub: false });
  });
  await t('manage: refused signed out and without install-plugins', async () => {
    assert.strictEqual((await call('GET', '/_dms/plugins/manage')).status, 401);
    assert.strictEqual((await call('GET', '/_dms/plugins/manage', { user: 2 })).status, 403);
    assert.strictEqual((await call('POST', '/_dms/plugins/hello/current', { user: 2, body: { version: '1.0.0' } })).status, 403);
  });
  await t('manage: the installed plugin, its source, and the server code running (registered at start above)', async () => {
    const r = await call('GET', '/_dms/plugins/manage', { user: 1 });
    assert.strictEqual(r.status, 200, r.text);
    assert.strictEqual(r.json.unsignedAllowed, false);
    const [h] = r.json.plugins;
    assert.deepStrictEqual([h.name, h.current, h.running, h.restartNeeded, h.sourceUrl], ['hello', '1.0.0', '1.0.0', false, releaseUrl]);
    assert.deepStrictEqual(h.versions.map(v => [v.version, v.hasServer, v.api, JSON.stringify(v.contributes)]), [['1.0.0', true, '^1.0', '{"patterns":["hello"]}']]);
  });
  await t('current: another installed version becomes current, recorded; its server code waits for a restart', async () => {
    fs.cpSync(path.join(dir, 'hello', '1.0.0'), path.join(dir, 'hello', '1.1.0'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'hello', '1.1.0', 'index.json'), JSON.stringify({ ...index, version: '1.1.0' }));
    const r = await call('POST', '/_dms/plugins/hello/current', { user: 1, body: { version: '1.1.0' } });
    assert.strictEqual(r.status, 200, r.text);
    const h = r.json.plugins[0];
    assert.deepStrictEqual([h.current, h.running, h.restartNeeded, h.versions.map(v => v.version)], ['1.1.0', '1.0.0', true, ['1.0.0', '1.1.0']]);
    assert.strictEqual(store.currentVersion('hello', dir), '1.1.0');
    assert.deepStrictEqual([rows[0].data.name, rows[0].data.current], ['hello', '1.1.0']);
  });
  await t('current: a version not installed is refused; back to the running one, no restart needed', async () => {
    assert.strictEqual((await call('POST', '/_dms/plugins/hello/current', { user: 1, body: { version: '9.0.0' } })).status, 400);
    const r = await call('POST', '/_dms/plugins/hello/current', { user: 1, body: { version: '1.0.0' } });
    assert.strictEqual(r.json.plugins[0].restartNeeded, false);
  });

  // the activation write check (P2 step 5), through the general write path's registry
  const checks = require('../src/routes/dms/write-checks');
  checks.registerWriteCheck('plugin_activation', store.activationWriteCheck({ dir }));
  const T = 'prod|hello:plugin_activation';
  const refused = async (p) => { try { await p; } catch (e) { return e; } throw new Error('not refused'); };
  await t('activation: an installed version passes; one not installed is refused (400)', async () => {
    assert.deepStrictEqual(await checks.checkWrite('create', { app: 'a', type: T, data: { plugin: 'hello', version: ' 1.0.0 ' } }), { plugin: 'hello', version: '1.0.0', permissions: [] });
    const e = await refused(checks.checkWrite('create', { app: 'a', type: T, data: { plugin: 'hello', version: '9.9.9' } }));
    assert.strictEqual(e.status, 400); assert.match(e.message, /hello 9\.9\.9 is not installed/);
    assert.strictEqual((await refused(checks.checkWrite('create', { app: 'a', type: T, data: { enabled: true } }))).status, 400);
  });
  await t('activation: no version gets the current one; a plugin not installed (compiled in) is left as sent', async () => {
    assert.strictEqual((await checks.checkWrite('create', { app: 'a', type: T, data: { plugin: 'hello' } })).version, '1.0.0');
    assert.strictEqual((await checks.checkWrite('edit', { app: 'a', type: T, data: { version: '' }, stored: { plugin: 'hello', version: '1.0.0' } })).version, '1.0.0');
    const compiled = { plugin: 'mapeditor', enabled: true };
    assert.deepStrictEqual(await checks.checkWrite('create', { app: 'a', type: 'prod|mapeditor:plugin_activation', data: compiled }), compiled);
  });
  await t('activation: an edit of other keys is not checked; renaming checks the stored version; mass edit of version refused', async () => {
    const patch = { enabled: false };
    assert.strictEqual(await checks.checkWrite('edit', { app: 'a', type: T, data: patch, stored: { plugin: 'hello', version: '7.0.0' } }), patch);
    const e = await refused(checks.checkWrite('edit', { app: 'a', type: T, data: { plugin: 'other' }, stored: { plugin: 'hello', version: '1.0.0' } }));
    assert.match(e.message, /other 1\.0\.0 is not installed/);
    assert.throws(() => checks.checkMassEdit(T, 'version'), /can't be mass-edited/);
    checks.checkMassEdit(T, 'enabled');
    checks.checkMassEdit('prod|page', 'version');
  });
  await t('other kinds pass through the registry untouched', async () => {
    const data = { version: '9.9.9' };
    assert.strictEqual(await checks.checkWrite('create', { app: 'a', type: 'docs|page', data }), data);
  });

  srv.close(); releaseSrv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (prevType === undefined) delete process.env.DMS_TYPE; else process.env.DMS_TYPE = prevType;
  if (prevApp === undefined) delete process.env.DMS_APP; else process.env.DMS_APP = prevApp;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
