/**
 * `reach` on a row (planning/tasks/current/auth-reach.md): `reach: { inherit, override }` inside a row's
 * grants. `inherit: false` cuts every owner position above the row, for it and everything under it;
 * `override: false` turns off the `<app> Admin` shortcut, for it and everything under it. No reach =
 * today's behaviour exactly; `view: false` is read as `inherit: false`.
 *
 * Covers: each switch alone and both; an env's reach applying to its sources, views and data rows;
 * `view: false` ≡ `inherit: false`; the admin refused under `override: false` for read, write and a
 * grants edit, and unaffected without it; reach-limited decisions enforced under `log`; the guard rail
 * on site / pattern rows; an old-shaped grants edit keeping `reach`; the Falcor read and the
 * capability; sync bootstrap / delta and the socket broadcast; the DMS file upload with `auth_permissions`.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-auth-reach.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Readable } = require('stream');
const FILES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-reach-files-'));
process.env.DAMA_SERVER_FILESTORAGE_PATH = FILES_DIR;
const assert = require('assert');
const express = require('express');
const { createTestGraph } = require('./graph');
const { dmsMainTable } = require('../src/routes/uda/utils');
const AUTH = require('../src/routes/auth');
const { reachOf, carryReach } = require('../src/routes/auth/grants');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
};

async function withMode(mode, fn) {
  const prev = process.env.DMS_AUTH_MODE;
  const warn = console.warn;
  process.env.DMS_AUTH_MODE = mode;
  console.warn = (...a) => { const s = a.join(' '); if (!s.includes('would-deny')) warn(...a); };
  try { return await fn(); }
  finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev; }
}

// ---- the upload route's harness (as test-upload-auth.js) ---------------------------------------
function captureRoutes(registerFn) {
  const routes = {};
  const fakeApp = {};
  for (const method of ['get', 'post', 'patch', 'delete', 'put', 'use']) fakeApp[method] = (p, ...h) => { routes[`${method.toUpperCase()} ${p}`] = h; };
  registerFn(fakeApp);
  return routes;
}
function fakeRes() {
  let finish;
  return {
    statusCode: 200, body: undefined, done: new Promise(r => { finish = r; }),
    status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; finish(); return this; },
    send(o) { this.body = o; finish(); return this; }, type() { return this; },
  };
}
function multipart(fields, file) {
  const boundary = `----reach${Date.now()}`;
  const parts = Object.entries(fields).map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n${file.content}\r\n--${boundary}--\r\n`);
  return { stream: Readable.from([Buffer.from(parts.join(''))]), contentType: `multipart/form-data; boundary=${boundary}` };
}
async function hit(routes, key, { user = null, params = {}, query = {}, form }) {
  const { stream, contentType } = multipart(form.fields, form.file);
  const req = stream;
  Object.assign(req, { headers: { 'content-type': contentType }, params, query, method: 'POST', originalUrl: key, availAuthContext: { user } });
  const res = fakeRes();
  for (const h of routes[key]) {
    let next = false;
    await h(req, res, () => { next = true; });
    if (!next) break;
  }
  await Promise.race([res.done, new Promise((_, rej) => setTimeout(() => rej(new Error(`${key} sent no response`)), 10000))]);
  return res;
}

async function run() {
  console.log('reachOf / carryReach:');
  await t('no reach → both on; `view: false` reads as inherit: false; only an explicit false turns one off', async () => {
    assert.deepStrictEqual(reachOf(null), { inherit: true, override: true });
    assert.deepStrictEqual(reachOf({ groups: {}, users: {} }), { inherit: true, override: true });
    assert.deepStrictEqual(reachOf({ view: false }), { inherit: false, override: true });
    assert.deepStrictEqual(reachOf({ reach: { inherit: false } }), { inherit: false, override: true });
    assert.deepStrictEqual(reachOf({ reach: { override: false } }), { inherit: true, override: false });
    assert.deepStrictEqual(reachOf({ reach: { inherit: 0, override: null } }), { inherit: true, override: true });
  });
  await t('carryReach: a value leaving `reach` out keeps the stored one; one naming it (even {}) wins', async () => {
    const stored = { users: { 1: ['*'] }, groups: {}, reach: { inherit: false } };
    assert.deepStrictEqual(carryReach(stored, { users: { 2: ['*'] }, groups: {} }), { users: { 2: ['*'] }, groups: {}, reach: { inherit: false } });
    const cleared = { users: {}, groups: {}, reach: {} };
    assert.strictEqual(carryReach(stored, cleared), cleared);
    const plain = { users: {}, groups: {} };
    assert.strictEqual(carryReach({ users: {} }, plain), plain, 'nothing stored → returned as is');
  });

  await t('a user leaving the site (siteGrants stripEntry) is struck from grants carrying `reach`, which stays', async () => {
    const { stripEntry, readGrants } = require('../src/auth/utils/siteGrants');
    const ap = { groups: {}, users: { 7: ['*'], 8: ['view-source'] }, reach: { inherit: false, override: false } };
    assert.ok(!readGrants(ap).malformed);
    assert.deepStrictEqual(stripEntry(ap, { users: 7 }), { groups: {}, users: { 8: ['view-source'] }, reach: ap.reach });
    const keyed = { '*': { users: { 7: ['x'] } }, reach: { inherit: false } };
    assert.deepStrictEqual(stripEntry(keyed, { users: 7 }), { '*': { users: {} }, reach: { inherit: false } });
  });

  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB); getDb(DAMA_DB);
  await awaitReady();
  const dms = getDb(DMS_DB);

  const APP = `reach_${Date.now()}`;
  const tbl = await dmsMainTable(dms, APP, 'per-app');
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const insert = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;
  const rowOf = async (id) => {
    const { rows } = await dms.query(`SELECT id, app, type, data FROM ${tbl} WHERE id = $1`, [id]);
    const r = rows[0];
    return { ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data };
  };

  // ---- users
  const anon = null;
  const admin = { authed: true, id: 90, email: 'admin@x', groups: [`${APP} Admin`] };
  const siteStar = { authed: true, id: 91, email: 'star@x', groups: ['SiteStars'] };   // `*` on the site row
  const staffer = { authed: true, id: 20, email: 'staff@x', groups: ['Staff'] };       // granted on env1
  const named = { authed: true, id: 21, email: 'named@x', groups: ['Nobody'] };        // named on the private rows
  const team = { authed: true, id: 22, email: 'team@x', groups: ['Team'] };            // granted on the sealed env
  const stranger = { authed: true, id: 23, email: 's@x', groups: ['Rando'] };

  const SOURCE_ALL = ['view-source', 'update-source', 'edit-source-data', 'create-view', 'delete-source', 'edit-source-permissions'];
  const siteId = await insert('prod:site', { site_name: 'reach', authPermissions: { groups: { SiteStars: ['*'] }, users: {} } });

  // env1: an ordinary env granting Staff everything over its sources
  const plain = await insert('env1|plain_src:source', { name: 'plain' });
  const onlyNamed = await insert('env1|only_named:source', { name: 'only named',
    auth_permissions: { groups: {}, users: { 21: SOURCE_ALL }, reach: { inherit: false } } });
  const viewFalse = await insert('env1|view_false:source', { name: 'view false',
    auth_permissions: { groups: {}, users: { 21: SOURCE_ALL }, view: false } });
  const hidden = await insert('env1|hidden_admin:source', { name: 'hidden from admins',
    auth_permissions: { groups: {}, users: {}, reach: { override: false } } });
  const privateSrc = await insert('env1|private_src:source', { name: 'private',
    auth_permissions: { groups: {}, users: { 21: SOURCE_ALL }, reach: { inherit: false, override: false } } });
  const privateView = await insert('private_src|v1:view', { name: 'v1' });
  await insert('prod|env1:dmsenv', { name: 'env1', authPermissions: { groups: { Staff: [...SOURCE_ALL, 'create-source'] }, users: {} } });

  // env2: a sealed env (both switches off) granting Team; a blank source, its view and data under it
  const sealedSrc = await insert('env2|sealed_child:source', { name: 'sealed child' });
  const sealedView = await insert('sealed_child|v1:view', { name: 'v1' });
  const env2 = await insert('prod|env2:dmsenv', { name: 'env2',
    authPermissions: { groups: { Team: [...SOURCE_ALL, 'create-source'] }, users: {}, reach: { inherit: false, override: false } } });

  // a page pattern granting the public view-page; a private page under it (both off), and an ordinary one
  const patternId = await insert('prod|docs:pattern', { name: 'Docs', pattern_type: 'page', base_url: '/docs',
    authPermissions: { groups: { public: ['view-page'], Staff: ['*'] }, users: {} } });
  const privatePage = await insert('docs|page', { title: 'Private', url_slug: 'private',
    authPermissions: { groups: {}, users: { 21: ['view-page', 'edit-page'] }, reach: { inherit: false, override: false } } });
  const openPage = await insert('docs|page', { title: 'Open', url_slug: 'open' });
  AUTH.clearSnapshots();

  const I = `${APP}+env1`;
  const read = (sourceId, user) => AUTH.canRead({ env: I, sourceId, user, app: APP });
  const readView = (viewId, user) => AUTH.canRead({ env: I, viewId, user, app: APP });
  const can = async (sourceId, verb, user) => (await AUTH.authorize({ env: I, sourceId, verb, user, app: APP })).allow;
  const canRow = async (rowId, verb, user, patch) => (await AUTH.authorize({ row: await rowOf(rowId), verb, user, app: APP, patch })).allow;

  console.log('\nno reach: today exactly');
  await withMode('enforce', async () => {
    await t('an ordinary source: Staff (env grant) and the admin read and write; a stranger reads (blank), cannot write', async () => {
      assert.strictEqual(await read(plain, staffer), true);
      assert.strictEqual(await read(plain, admin), true);
      assert.strictEqual(await read(plain, stranger), true, 'a source naming no one is readable');
      assert.strictEqual(await can(plain, 'update-source', admin), true);
      assert.strictEqual(await can(plain, 'update-source', staffer), true);
      assert.strictEqual(await can(plain, 'update-source', stranger), false);
    });
    await t('the admin\'s decision on an ordinary row is the shortcut, unmarked', async () => {
      const d = await AUTH.authorize({ env: I, sourceId: plain, verb: 'update-source', user: admin, app: APP });
      assert.strictEqual(d.allow, true);
      assert.strictEqual(d.reachLimited, undefined);
    });
  });

  console.log('\ninherit: false (only people named here)');
  await withMode('enforce', async () => {
    await t('the env\'s grants are cut: Staff refused; the named user reads and writes; the admin still helps', async () => {
      assert.strictEqual(await read(onlyNamed, staffer), false);
      assert.strictEqual(await can(onlyNamed, 'update-source', staffer), false);
      assert.strictEqual(await read(onlyNamed, named), true);
      assert.strictEqual(await can(onlyNamed, 'update-source', named), true);
      assert.strictEqual(await read(onlyNamed, admin), true, 'override still on');
      assert.strictEqual(await can(onlyNamed, 'update-source', admin), true);
      assert.strictEqual(await read(onlyNamed, anon), false);
    });
    await t('`view: false` decides exactly as `reach.inherit: false`', async () => {
      for (const user of [anon, staffer, named, admin, stranger]) {
        for (const verb of ['read', 'update-source', 'edit-source-permissions']) {
          assert.strictEqual(await can(viewFalse, verb, user), await can(onlyNamed, verb, user), `${verb} ${user && user.email}`);
        }
      }
    });
  });

  console.log('\noverride: false (hidden from site admins)');
  await withMode('enforce', async () => {
    await t('inheritance still applies: Staff reads and writes through the env', async () => {
      assert.strictEqual(await read(hidden, staffer), true);
      assert.strictEqual(await can(hidden, 'update-source', staffer), true);
    });
    await t('naming no one of its own does not make it open: a stranger and anon are refused', async () => {
      assert.strictEqual(await read(hidden, stranger), false);
      assert.strictEqual(await read(hidden, anon), false);
    });
    await t('the admin is refused read, write and a grants edit', async () => {
      assert.strictEqual(await read(hidden, admin), false, 'read');
      assert.strictEqual(await can(hidden, 'update-source', admin), false, 'update-source');
      assert.strictEqual(await can(hidden, 'edit-source-permissions', admin), false, 'edit-source-permissions');
      assert.strictEqual(await canRow(hidden, 'edit', admin, { auth_permissions: { groups: {}, users: { 90: ['*'] } } }), false,
        'the admin cannot grant themselves in, nor drop the reach');
    });
    await t('an admin who is ALSO granted (Staff) passes on the grant, like anyone', async () => {
      const both = { ...admin, groups: [`${APP} Admin`, 'Staff'] };
      assert.strictEqual(await read(hidden, both), true);
    });
  });

  console.log('\nboth off (private)');
  await withMode('enforce', async () => {
    await t('only the named user: Staff, the admin, anon and site `*` refused', async () => {
      assert.strictEqual(await read(privateSrc, named), true);
      assert.strictEqual(await can(privateSrc, 'update-source', named), true);
      for (const u of [staffer, admin, anon, siteStar]) assert.strictEqual(await read(privateSrc, u), false, u && u.email);
      assert.strictEqual(await can(privateSrc, 'update-source', admin), false);
    });
    await t('its view follows it', async () => {
      assert.strictEqual(await readView(privateView, named), true);
      assert.strictEqual(await readView(privateView, admin), false);
      assert.strictEqual(await readView(privateView, staffer), false);
    });
    await t('a page: the pattern\'s public view-page and the admin are cut; the named user reads and edits', async () => {
      assert.strictEqual(await canRow(privatePage, 'read', anon), false);
      assert.strictEqual(await canRow(privatePage, 'read', admin), false);
      assert.strictEqual(await canRow(privatePage, 'read', staffer), false, 'Staff `*` on the pattern is above the cut');
      assert.strictEqual(await canRow(privatePage, 'read', named), true);
      assert.strictEqual(await canRow(privatePage, 'edit', named, { title: 'x' }), true);
      assert.strictEqual(await canRow(privatePage, 'edit', admin, { title: 'x' }), false);
      assert.strictEqual(await canRow(openPage, 'read', anon), true, 'its sibling is untouched');
    });
  });

  console.log('\nreach on an ancestor applies below (env → source → view → data)');
  await withMode('enforce', async () => {
    const E2 = `${APP}+env2`;
    const dataRow = { id: null, app: APP, type: `sealed_child|${sealedView}:data`, data: { a: 1 } };
    await t('Team (granted on the env) reads the source and view and writes data rows', async () => {
      assert.strictEqual(await AUTH.canRead({ env: E2, sourceId: sealedSrc, user: team, app: APP }), true);
      assert.strictEqual(await AUTH.canRead({ env: E2, viewId: sealedView, user: team, app: APP }), true);
      assert.strictEqual((await AUTH.authorize({ row: dataRow, verb: 'create', user: team, app: APP })).allow, true);
    });
    await t('the admin is refused at every level below the env', async () => {
      assert.strictEqual(await AUTH.canRead({ env: E2, sourceId: sealedSrc, user: admin, app: APP }), false);
      assert.strictEqual(await AUTH.canRead({ env: E2, viewId: sealedView, user: admin, app: APP }), false);
      assert.strictEqual((await AUTH.authorize({ row: dataRow, verb: 'create', user: admin, app: APP })).allow, false);
      assert.strictEqual((await AUTH.authorize({ env: E2, sourceId: sealedSrc, verb: 'update-source', user: admin, app: APP })).allow, false);
    });
    await t('a blank source under a cut env is not "readable by anyone": a stranger is refused', async () => {
      assert.strictEqual(await AUTH.canRead({ env: E2, sourceId: sealedSrc, user: stranger, app: APP }), false);
      assert.strictEqual(await AUTH.canRead({ env: E2, sourceId: sealedSrc, user: anon, app: APP }), false);
      assert.strictEqual(await AUTH.canRead({ env: I, sourceId: plain, user: anon, app: APP }), true, 'the same blank source elsewhere is');
    });
    await t('the site `*` holder is above the cut: refused a source create in the env', async () => {
      const create = { id: null, app: APP, type: 'env2|new_one:source', data: { name: 'n' } };
      assert.strictEqual((await AUTH.authorize({ row: create, verb: 'create', user: siteStar, app: APP })).allow, false);
      assert.strictEqual((await AUTH.authorize({ row: create, verb: 'create', user: team, app: APP })).allow, true);
    });
  });

  console.log('\nreach-limited decisions are enforced under `log`');
  await withMode('log', async () => {
    await t('log: the private source refuses the admin and Staff; an ordinary one still lets a refusal through', async () => {
      assert.strictEqual(await read(privateSrc, admin), false);
      assert.strictEqual(await read(privateSrc, staffer), false);
      assert.strictEqual(await read(privateSrc, named), true);
      assert.strictEqual(await AUTH.canRead({ env: I, sourceId: plain, user: stranger, app: APP }), true);
      // an ordinary refusal (a write) is still only logged under `log`
      const d = await AUTH.authorize({ env: I, sourceId: plain, verb: 'update-source', user: stranger, app: APP });
      assert.strictEqual(d.allow, false);
      assert.strictEqual(AUTH.applyMode(d, { guard: 'data', kind: 'x', target: 'y', user: stranger, app: APP }), true);
    });
  });

  console.log('\nthe guard rail');
  await withMode('enforce', async () => {
    await t('override: false refused on the site row and on a pattern row, even for the admin', async () => {
      const seal = { authPermissions: { groups: { SiteStars: ['*'] }, users: {}, reach: { override: false } } };
      assert.strictEqual(await canRow(siteId, 'edit', admin, seal), false);
      const d = await AUTH.authorize({ row: await rowOf(patternId), verb: 'edit', user: admin, app: APP,
        patch: { authPermissions: { groups: { public: ['view-page'] }, users: {}, reach: { override: false } } } });
      assert.strictEqual(d.allow, false);
      assert(/refused on a pattern row/.test(d.reason), d.reason);
      const created = { id: null, app: APP, type: 'prod|new_pat:pattern', data: { pattern_type: 'page', authPermissions: { reach: { override: false } } } };
      assert.strictEqual((await AUTH.authorize({ row: created, verb: 'create', user: admin, app: APP })).allow, false);
    });
    await t('inherit: false is allowed on a pattern; override: false on a source or env', async () => {
      assert.strictEqual(await canRow(patternId, 'edit', admin, { authPermissions: { groups: { Staff: ['*'] }, users: {}, reach: { inherit: false } } }), true);
      assert.strictEqual(await canRow(plain, 'edit', admin, { auth_permissions: { groups: {}, users: {}, reach: { override: false } } }), true);
    });
  });

  console.log('\nan old-shaped grants edit keeps `reach` (Falcor dms.data.edit)');
  await withMode('enforce', async () => {
    const asNamed = createTestGraph(DMS_DB, { user: named });
    await asNamed.ready;
    await t('{ groups, users } without reach: stored reach kept; reach: {} clears it', async () => {
      await asNamed.callAsync(['dms', 'data', 'edit'], [APP, privateSrc, { auth_permissions: { groups: {}, users: { 21: SOURCE_ALL, 24: ['view-source'] } } }]);
      let ap = (await rowOf(privateSrc)).data.auth_permissions;
      assert.deepStrictEqual(ap.reach, { inherit: false, override: false });
      assert.deepStrictEqual(ap.users['24'], ['view-source']);
      await asNamed.callAsync(['dms', 'data', 'edit'], [APP, privateSrc, { auth_permissions: { groups: {}, users: { 21: SOURCE_ALL }, reach: { inherit: false, override: false } } }]);
      ap = (await rowOf(privateSrc)).data.auth_permissions;
      assert.strictEqual(ap.users['24'], undefined);
      assert.deepStrictEqual(ap.reach, { inherit: false, override: false });
    });
    await t('the admin\'s Falcor edit of the private source is refused', async () => {
      const asAdmin = createTestGraph(DMS_DB, { user: admin });
      await asAdmin.ready;
      let threw = null;
      try { await asAdmin.callAsync(['dms', 'data', 'edit'], [APP, privateSrc, { name: 'taken' }]); } catch (e) { threw = e; }
      assert.notStrictEqual((await rowOf(privateSrc)).data.name, 'taken', `refused (${threw && threw.message})`);
    });
  });

  console.log('\nFalcor reads and the capability');
  await t('dms.data byId: the private page is blocked for the admin, served to the named user', async () => {
    const as = async (user) => {
      const g = createTestGraph(DMS_DB, { user });
      await g.ready;
      const res = await g.getAsync([['dms', 'data', APP, 'byId', privatePage, 'data']]);
      return res.jsonGraph.dms.data[APP].byId[privatePage].data;
    };
    const mine = await as(named);
    assert.strictEqual((typeof mine === 'string' ? JSON.parse(mine) : mine.value || mine).title, 'Private');
    const theirs = await as(admin);
    assert(theirs == null || (theirs.$type === 'atom' && theirs.value == null) || !JSON.stringify(theirs).includes('Private'), JSON.stringify(theirs));
  });
  await t('dms.capabilities says reach', async () => {
    const g = createTestGraph(DMS_DB, { user: null });
    await g.ready;
    const res = await g.getAsync([['dms', 'capabilities']]);
    const v = res.jsonGraph.dms.capabilities;
    assert.strictEqual((v && v.value ? v.value : v).reach, true, JSON.stringify(v));
  });

  console.log('\nsync bootstrap / delta and the socket');
  const { createSyncRoutes } = require('../src/routes/sync/sync');
  const users = { admin, named, staffer };
  const app = express();
  app.use((req, _res, next) => { req.availAuthContext = { user: users[req.headers['x-test-user']] || null }; next(); });
  app.use(createSyncRoutes(DMS_DB));
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const get = (url, who) => new Promise((resolve, reject) => {
    http.get({ port, path: url, headers: who ? { 'x-test-user': who } : {} }, (res) => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(b)); } });
    }).on('error', reject);
  });
  try {
    await withMode('log', async () => {
      await t('bootstrap: the private page and source go only to the named user; everything else as before', async () => {
        const ids = async (who, q) => (await get(`/sync/bootstrap?app=${APP}&${q}`, who)).items.map(i => +i.id);
        const pages = 'type=' + encodeURIComponent('docs|page');
        assert(!(await ids(null, pages)).includes(privatePage), 'anon');
        assert(!(await ids('admin', pages)).includes(privatePage), 'admin');
        assert((await ids('named', pages)).includes(privatePage), 'named');
        assert((await ids(null, pages)).includes(openPage), 'the open page still goes to anyone');
        const all = await ids('staffer', '');
        assert(!all.includes(privateSrc) && !all.includes(onlyNamed) && all.includes(plain) && all.includes(hidden));
      });
      await t('delta: a change to the private page is dropped for the admin, kept for the named user', async () => {
        const has = async (who) => (await get(`/sync/delta?app=${APP}&since=0`, who)).changes.some(c => +c.item_id === privatePage);
        const anyChange = (await get(`/sync/delta?app=${APP}&since=0`, 'named')).changes.length;
        if (!anyChange) return;   // a database without change_log: nothing to judge
        assert.strictEqual(await has('admin'), false);
        assert.strictEqual(await has('named'), true);
      });
    });
  } finally { server.close(); }
  await t('the socket: a reach-limited row goes out without its data; any other row as it came', async () => {
    const { stripReachLimited } = require('../src/routes/sync/ws');
    const priv = { type: 'change', revision: 1, action: 'U', item: { ...(await rowOf(privatePage)) } };
    const out = await stripReachLimited(APP, priv);
    assert.strictEqual(out.item.data, undefined);
    assert.strictEqual(out.item.dataOmitted, true);
    assert.strictEqual(out.item.reachLimited, true);
    assert.strictEqual(+out.item.id, privatePage);
    const open = { type: 'change', revision: 2, action: 'U', item: { ...(await rowOf(openPage)) } };
    assert.strictEqual(await stripReachLimited(APP, open), open);
  });

  console.log('\nDMS file upload with auth_permissions');
  const routes = captureRoutes(require('../src/dama/upload').registerUploadRoutes);
  const KEY = 'POST /dms-admin/:app/file_upload';
  const env1Row = (await dms.query(`SELECT id FROM ${tbl} WHERE type = 'prod|env1:dmsenv'`)).rows[0].id;
  const form = (fields = {}) => ({
    fields: { owner_id: env1Row, owner_instance: 'env1', owner_ref: `${APP}+env1|source`, source_name: `file ${Date.now()} ${Math.random()}`, ...fields },
    file: { name: 'doc.txt', content: 'hello' },
  });
  const GRANTS = { groups: {}, users: { 20: ['*'] }, reach: { inherit: false, override: false } };
  await withMode('enforce', async () => {
    await t('a create-source holder creates a private source, its grants written with the row', async () => {
      const res = await hit(routes, KEY, { user: staffer, params: { app: APP }, query: { dms_app: APP }, form: form({ auth_permissions: JSON.stringify(GRANTS) }) });
      assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
      const src = await rowOf(res.body.source_id);
      assert.deepStrictEqual(src.data.auth_permissions, GRANTS);
      AUTH.clearSnapshots();
      assert.strictEqual(await read(res.body.source_id, staffer), true, 'the uploader named themselves');
      assert.strictEqual(await read(res.body.source_id, admin), false, 'private from the moment it exists');
      assert.strictEqual(await readView(res.body.view_id, admin), false, 'its first version too');
    });
    await t('refused: grants on an existing source, malformed grants, no create-source', async () => {
      let res = await hit(routes, KEY, { user: staffer, params: { app: APP }, query: { dms_app: APP }, form: form({ source_id: plain, auth_permissions: JSON.stringify(GRANTS) }) });
      assert.strictEqual(res.statusCode, 400, JSON.stringify(res.body));
      for (const bad of ['not json', '[1]', JSON.stringify({ users: [1] }), JSON.stringify({ reach: 'off' })]) {
        res = await hit(routes, KEY, { user: staffer, params: { app: APP }, query: { dms_app: APP }, form: form({ auth_permissions: bad }) });
        assert.strictEqual(res.statusCode, 400, `${bad} → ${JSON.stringify(res.body)}`);
      }
      res = await hit(routes, KEY, { user: stranger, params: { app: APP }, query: { dms_app: APP }, form: form({ auth_permissions: JSON.stringify(GRANTS) }) });
      assert.strictEqual(res.statusCode, 403, JSON.stringify(res.body));
    });
    await t('metadata still may not carry auth_permissions', async () => {
      const res = await hit(routes, KEY, { user: staffer, params: { app: APP }, query: { dms_app: APP }, form: form({ metadata: JSON.stringify({ auth_permissions: GRANTS }) }) });
      assert.strictEqual(res.statusCode, 400);
    });
  });

  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
