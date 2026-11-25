/**
 * An app's settings routes by app, on every server (src/dms/planning/tasks/current/app-settings-pages.md, phase 0):
 *   /_dms/apps/:app/pgenvs (+ attach), /_dms/apps/:app/plugins, /_dms/apps/:app/app-settings
 * on a server that is NOT multi-tenant (single-site, or one API host behind many statically served apps).
 *
 * Covers: signed out 401; each family's own verb on the app's own site row (manage-domains, activate-plugins,
 * manage-themes), 403 without it; attaching a pgEnv only for the server's staff; an app with no site row, or
 * a name that isn't an app name, 404; the tenant routes not mounted off a hub, `/hub/app-settings` still is.
 * The caller and the judge are stubbed (`x-user` header; grants per app), as in test-plugin-routes.js; the
 * database is real (DMS_TEST_DB, default dms-sqlite-test).
 */
const path = require('path');
const assert = require('assert');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite-test';
process.env.DMS_DB_ENV = DB_NAME;
delete process.env.DMS_MULTI_TENANT;
delete process.env.VITE_DMS_MULTI_TENANT;
process.env.DMS_APP = 'serverhub';

const TEST_APP = 'approutes' + Date.now();
const USERS = {
  1: { id: 1, email: 'domains@test', grants: { [TEST_APP]: ['manage-domains'] } },
  2: { id: 2, email: 'nobody@test', grants: {} },
  3: { id: 3, email: 'plugins@test', grants: { [TEST_APP]: ['activate-plugins'] } },
  4: { id: 4, email: 'themes@test', grants: { [TEST_APP]: ['manage-themes'] } },
  5: { id: 5, email: 'staff@test', grants: { serverhub: ['manage-tenants'] } },
};

// stub the caller and the judge before the routes load them
const stub = (rel, exports) => {
  const file = require.resolve(path.join('../src/routes', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('auth/requestUser', {
  requireUser: (req, res) => {
    const u = USERS[req.get('x-user')];
    if (!u) { res.status(401).json({ error: 'sign in' }); return null; }
    return u;
  },
});
stub('auth', { siteCan: async (app, user, verbs) => verbs.some(v => (user.grants[app] || []).includes(v)) });

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

async function main() {
  const { createController } = require('../src/routes/dms/dms.controller');
  const { getDb, awaitReady } = require('../src/db');
  getDb(DB_NAME);
  await awaitReady();
  await createController(DB_NAME).createData([TEST_APP, 'prod:site', { site_name: 'App routes test' }], { id: 1, email: 'test@test' }, null);

  const express = require('express');
  const app = express();
  app.use(express.json());
  require('../src/routes/tenants').registerTenantRoutes(app);
  require('../src/routes/appSettings').registerAppSettingsRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { user, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  };
  const A = `/_dms/apps/${TEST_APP}`;

  console.log('\nan app\'s settings routes, on a server that is not multi-tenant');
  await t('signed out: 401 on each family', async () => {
    for (const p of [`${A}/pgenvs`, `${A}/plugins`, `${A}/app-settings`]) assert.strictEqual((await call('GET', p)).status, 401, p);
  });
  await t('data environments: manage-domains on the app reads them; nothing else does', async () => {
    const r = await call('GET', `${A}/pgenvs`, { user: 1 });
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(Array.isArray(r.json.attached));
    assert.deepStrictEqual([r.json.available, r.json.canAttach], [[], false]);
    assert.strictEqual((await call('GET', `${A}/pgenvs`, { user: 2 })).status, 403);
    assert.strictEqual((await call('GET', `${A}/pgenvs`, { user: 3 })).status, 403);
  });
  await t('attaching a data environment: the server\'s staff only', async () => {
    assert.strictEqual((await call('POST', `${A}/pgenvs/attach`, { user: 1, body: { pgEnv: 'x' } })).status, 403);
    const staff = await call('GET', `${A}/pgenvs`, { user: 5 });
    assert.strictEqual(staff.status, 200, staff.text);
    assert.strictEqual(staff.json.canAttach, true);
  });
  await t('plugins: activate-plugins on the app', async () => {
    const r = await call('GET', `${A}/plugins`, { user: 3 });
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(Array.isArray(r.json.activations) && Array.isArray(r.json.installed), r.text);
    assert.strictEqual((await call('GET', `${A}/plugins`, { user: 1 })).status, 403);
  });
  await t('app & icon: manage-themes on the app', async () => {
    const r = await call('GET', `${A}/app-settings`, { user: 4 });
    assert.strictEqual(r.status, 200, r.text);
    assert.strictEqual(r.json.fallbackName, 'App routes test');
    assert.strictEqual((await call('GET', `${A}/app-settings`, { user: 1 })).status, 403);
  });
  await t('an app with no site row here, or not an app name: 404', async () => {
    for (const p of ['/_dms/apps/nosuchapp/pgenvs', '/_dms/apps/nosuchapp/plugins', '/_dms/apps/nosuchapp/app-settings', '/_dms/apps/a%20b/pgenvs']) {
      assert.strictEqual((await call('GET', p, { user: 5 })).status, 404, p);
    }
  });
  await t('off a hub: the tenant routes are not mounted; /hub/app-settings still is', async () => {
    assert.strictEqual((await call('GET', '/tenants/x/pgenvs', { user: 5 })).status, 404);
    assert.strictEqual((await call('GET', '/hub/pgenvs', { user: 5 })).status, 404);
    assert.notStrictEqual((await call('GET', '/hub/app-settings', { user: 5 })).status, 404);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
