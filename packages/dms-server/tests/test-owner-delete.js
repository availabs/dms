/**
 * Deleting a pattern or a theme with what it owns — Phase 2 of planning/tasks/completed/safe-delete-removes-rows.md
 * (F4 / F5), through the REST routes (routes/dms/ownerDeleteHttp.js) on an in-process Express app.
 *
 *   pattern  its rows by type path go (not a same-named source's views), its ref leaves the site, a backup is
 *            written; an unshared dmsEnv goes with its sources, views and split tables; a shared or pgEnv
 *            one is kept; a pattern named like another is refused; a plan that changed is refused
 *   theme    refused while a pattern selects it; otherwise the row and its site ref go
 *   auth     a stranger's plan and delete are refused, and nothing is deleted
 *
 * Run (never against the owner's default configs, see dms-server/CLAUDE.md):
 *   DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-owner-delete.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'enforce';
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DMS_DELETE_BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-delete-backups-'));
const assert = require('assert');
const express = require('express');
const { createTestGraph } = require('./graph');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};
const section = (name) => console.log(`\n${name}`);

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  const db = getDb(DMS_DB); await awaitReady();
  const CL = db.type === 'postgres' ? 'dms.change_log' : 'change_log';

  const APP = `ownerdel_${Date.now()}`;
  const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
  const stranger = { authed: true, id: 2, email: 's@x', groups: [] };
  const graph = createTestGraph(DMS_DB, { user: admin });
  const T = resolveTable(APP, '', db.type, 'per-app');

  const create = async (type, data) => {
    const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
    return +Object.keys(res.jsonGraph.dms.data.byId)[0];
  };
  const edit = (id, data) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data]);
  const alive = async (id) => (await db.promise(`SELECT id FROM ${T.fullName} WHERE id = $1`, [id])).length === 1;
  const dataOf = async (id) => {
    const [r] = await db.promise(`SELECT data FROM ${T.fullName} WHERE id = $1`, [id]);
    return r && (typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  };
  const dCount = async (id) => (await db.promise(`SELECT 1 FROM ${CL} WHERE app = $1 AND item_id = $2 AND action = 'D'`, [APP, id])).length;
  const tableExists = async (fullName) => {
    const [r] = db.type === 'postgres'
      ? await db.promise(`SELECT 1 AS ok WHERE to_regclass($1) IS NOT NULL`, [fullName])
      : await db.promise(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = $1`, [fullName.split('.').pop()]);
    return !!r;
  };
  const ids = (list) => (list || []).map(r => +r.id);

  // the REST routes on an Express app; the test user comes in a header
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { const u = req.headers['x-test-user']; req.availAuthContext = { user: u ? JSON.parse(u) : null }; next(); });
  require('../src/routes/dms/ownerDeleteHttp').registerOwnerDeleteRoutes(app);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const post = async (user, url, body = {}) => {
    const res = await fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': JSON.stringify(user) } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // ---- fixtures
  const themeA = await create('themea:theme', { name: 'Theme A', theme: '{}' });
  const themeB = await create('themeb:theme', { name: 'Theme B', theme: '{}' });
  const docs = await create('main|docs:pattern', { name: 'Docs', pattern_type: 'page', theme: { selectedTheme: 'Theme A' } });
  const owned = [
    await create('docs|page', { title: 'p1' }), await create('docs|page', { title: 'p2' }),
    await create('docs|component', { x: 1 }), await create('docs|component', { x: 2 }), await create('docs|component', { x: 3 }),
    await create('docs|page-edit', { h: 1 }),
  ];
  // a source that happens to share the pattern's name lives under ANOTHER env: its view is not the pattern's
  const docsSrcView = await create('docs|v1:view', { name: 'v1 of a source named docs' });
  const env1 = await create('main|e1:dmsenv', { name: 'e1', sources: [] });
  const roads = await create('e1|roads:source', { name: 'roads' });
  const roadsV = await create('roads|v1:view', { name: 'v1' });
  await edit(roads, { views: [{ id: roadsV }] });
  await edit(env1, { sources: [{ id: roads, ref: `${APP}+e1|source` }] });
  await graph.callAsync(['dms', 'data', 'create'], [APP, `roads|${roadsV}:data`, { a: 1 }]);
  const roadsTable = resolveTable(APP, `roads|${roadsV}:data`, db.type, 'per-app', roads).fullName;
  const data1 = await create('main|data1:pattern', { name: 'Data 1', pattern_type: 'datasets', dmsEnvId: env1 });
  const env2 = await create('main|e2:dmsenv', { name: 'e2', sources: [] });
  const data2 = await create('main|data2:pattern', { name: 'Data 2', pattern_type: 'datasets', dmsEnvId: env2 });
  const data3 = await create('main|data3:pattern', { name: 'Data 3', pattern_type: 'datasets', dmsEnvId: env2 });
  const env3 = await create('main|ext:dmsenv', { name: 'ext', pgEnv: 'some_pg' });
  const ext = await create('main|extp:pattern', { name: 'External', pattern_type: 'datasets', dmsEnvId: env3 });
  const dupA = await create('main|dup:pattern', { name: 'Dup A', pattern_type: 'page' });
  const dupB = await create('other|dup:pattern', { name: 'Dup B', pattern_type: 'page' });
  const ref = (id, kind) => ({ id, ref: `${APP}+${kind}` });
  const site = await create('main:site', {
    name: 'main',
    patterns: [docs, data1, data2, data3, ext, dupA].map(id => ref(id, 'pattern')),
    dms_envs: [env1, env2, env3].map(id => ref(id, 'dmsenv')),
    theme_refs: [themeA, themeB].map(id => ref(id, 'theme')),
  });

  section('auth');
  await t('anonymous is 401, a stranger is 403 on plan and delete, and nothing is deleted', async () => {
    assert.strictEqual((await post(null, `/dms/${APP}/patterns/${docs}/delete/plan`)).status, 401);
    assert.strictEqual((await post(stranger, `/dms/${APP}/patterns/${docs}/delete/plan`)).status, 403);
    assert.strictEqual((await post(stranger, `/dms/${APP}/patterns/${docs}/delete`)).status, 403);
    assert.strictEqual((await post(stranger, `/dms/${APP}/themes/${themeB}/delete`)).status, 403);
    assert.ok(await alive(docs) && await alive(themeB));
  });

  section('F5. theme');
  await t('a theme a pattern selects is blocked, naming the pattern; its delete is refused', async () => {
    const plan = await post(admin, `/dms/${APP}/themes/${themeA}/delete/plan`);
    assert.strictEqual(plan.status, 200);
    assert.deepStrictEqual(plan.body.usedBy.map(p => p.name), ['Docs']);
    assert.strictEqual(plan.body.blocked.length, 1);
    const del = await post(admin, `/dms/${APP}/themes/${themeA}/delete`);
    assert.strictEqual(del.status, 409);
    assert.ok(/Docs/.test(del.body.error), del.body.error);
    assert.ok(await alive(themeA));
  });
  await t('an unused theme is deleted with its site ref, one D, a backup', async () => {
    const del = await post(admin, `/dms/${APP}/themes/${themeB}/delete`);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    assert.strictEqual(await alive(themeB), false);
    assert.strictEqual(await dCount(themeB), 1);
    assert.deepStrictEqual(ids((await dataOf(site)).theme_refs), [themeA]);
    assert.ok(fs.existsSync(del.body.backup));
  });

  section('F4. pattern');
  await t('the plan lists the rows by kind, no dmsEnv, the site, nothing blocking', async () => {
    const { status, body } = await post(admin, `/dms/${APP}/patterns/${docs}/delete/plan`);
    assert.strictEqual(status, 200, JSON.stringify(body));
    assert.deepStrictEqual(body.rows, { total: 6, byKind: { page: 2, component: 3, 'page-edit': 1 } });
    assert.strictEqual(body.dmsEnv, null);
    assert.deepStrictEqual(ids(body.sites), [site]);
    assert.deepStrictEqual(body.blocked, []);
  });
  await t('a pattern delete takes its rows and its site ref, one D each, and writes a backup', async () => {
    const del = await post(admin, `/dms/${APP}/patterns/${docs}/delete`, { expect: { dmsEnv: null } });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    for (const id of [docs, ...owned]) {
      assert.strictEqual(await alive(id), false, `row ${id}`);
      assert.strictEqual(await dCount(id), 1, `D for ${id}`);
    }
    assert.ok(!ids((await dataOf(site)).patterns).includes(docs));
    const backup = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(del.body.backup)));
    assert.strictEqual(backup.rows.length, 7);
  });
  await t('a same-named source\'s view under the pattern\'s name is not the pattern\'s', async () =>
    assert.strictEqual(await alive(docsSrcView), true));

  await t('an unshared dmsEnv: the plan says delete and lists its source, view and split table', async () => {
    const { body } = await post(admin, `/dms/${APP}/patterns/${data1}/delete/plan`);
    assert.strictEqual(body.dmsEnv.action, 'delete');
    assert.deepStrictEqual(body.dmsEnv.sources.map(s => s.name), ['roads']);
    assert.strictEqual(body.dmsEnv.views, 1);
    assert.strictEqual(body.dmsEnv.tables, 1);
    assert.deepStrictEqual(body.expect, { dmsEnv: 'delete' });
  });
  await t('...and the delete takes the env, its source, view and split table, and the site\'s env ref', async () => {
    assert.strictEqual(await tableExists(roadsTable), true, 'fixture: split table');
    const del = await post(admin, `/dms/${APP}/patterns/${data1}/delete`, { expect: { dmsEnv: 'delete' } });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    for (const id of [data1, env1, roads, roadsV]) assert.strictEqual(await alive(id), false, `row ${id}`);
    assert.strictEqual(await tableExists(roadsTable), false);
    const s = await dataOf(site);
    assert.ok(!ids(s.dms_envs).includes(env1) && !ids(s.patterns).includes(data1));
    const backup = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(del.body.backup)));
    assert.strictEqual(Object.keys(backup.splitTables).length, 1);
  });

  await t('a shared dmsEnv is kept, naming the other pattern', async () => {
    const { body } = await post(admin, `/dms/${APP}/patterns/${data2}/delete/plan`);
    assert.strictEqual(body.dmsEnv.action, 'keep');
    assert.strictEqual(body.dmsEnv.reason, 'shared');
    assert.deepStrictEqual(body.dmsEnv.sharedWith.map(p => p.name), ['Data 3']);
    const del = await post(admin, `/dms/${APP}/patterns/${data2}/delete`, { expect: { dmsEnv: 'keep' } });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    assert.strictEqual(await alive(data2), false);
    assert.strictEqual(await alive(env2), true);
  });
  await t('a plan that changed since it was shown is refused, and nothing is deleted', async () => {
    // Data 2 is gone, so Data 3's env is now unshared: a client still holding "keep" is refused
    const del = await post(admin, `/dms/${APP}/patterns/${data3}/delete`, { expect: { dmsEnv: 'keep' } });
    assert.strictEqual(del.status, 409);
    assert.strictEqual(await alive(data3), true);
    assert.strictEqual(await alive(env2), true);
  });
  await t('a pattern that starts using the dmsEnv between the plan and the transaction refuses the delete', async () => {
    // the plan (now) says delete; another pattern points at the env just before the delete's transaction opens
    const orig = db.withTransaction;
    let late = null;
    db.withTransaction = async function (fn) {
      db.withTransaction = orig;
      late = await create('main|data4:pattern', { name: 'Data 4', pattern_type: 'datasets', dmsEnvId: env2 });
      return orig.call(this, fn);
    };
    try {
      const del = await post(admin, `/dms/${APP}/patterns/${data3}/delete`, { expect: { dmsEnv: 'delete' } });
      assert.strictEqual(del.status, 409, JSON.stringify(del.body));
      assert.ok(late, 'the race ran');
      assert.strictEqual(await alive(data3), true);
      assert.strictEqual(await alive(env2), true);
    } finally { db.withTransaction = orig; }
  });
  await t('a pgEnv-linked dmsEnv is kept', async () => {
    const { body } = await post(admin, `/dms/${APP}/patterns/${ext}/delete/plan`);
    assert.strictEqual(body.dmsEnv.action, 'keep');
    assert.strictEqual(body.dmsEnv.reason, 'pgEnv');
    const del = await post(admin, `/dms/${APP}/patterns/${ext}/delete`, { expect: { dmsEnv: 'keep' } });
    assert.strictEqual(del.status, 200);
    assert.strictEqual(await alive(env3), true);
  });
  await t('a pattern named like another pattern is blocked, and its delete refused', async () => {
    const { body } = await post(admin, `/dms/${APP}/patterns/${dupA}/delete/plan`);
    assert.deepStrictEqual(body.blocked[0].patterns.map(p => p.name), ['Dup B']);
    assert.strictEqual((await post(admin, `/dms/${APP}/patterns/${dupA}/delete`, { expect: { dmsEnv: null } })).status, 409);
    assert.strictEqual(await alive(dupA), true);
  });
  await t('a missing pattern is 404', async () =>
    assert.strictEqual((await post(admin, `/dms/${APP}/patterns/999999999/delete/plan`)).status, 404));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
