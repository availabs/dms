/**
 * The Storage pages' routes (routes/dms/storageHttp.js; planning/tasks/current/orphan-sweeper.md, Phase 2),
 * on an in-process Express app over the served controller.
 *
 *   plan    a site admin gets usage + the plan; a stranger is refused; `parents` narrows to one pattern
 *   clean   needs `expect`; refuses (409) when the counts moved and deletes nothing; deletes the plan's
 *           rows when they match, with a backup; a later plan shows nothing left
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-storage-routes.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'enforce';
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DMS_DELETE_BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-backups-'));
const assert = require('assert');
const express = require('express');
const { createTestGraph } = require('./graph');
const { resolveTable, ensureFormatsTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  const db = getDb(DMS_DB); await awaitReady();
  const APP = `storage_${Date.now()}`;
  const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
  const stranger = { authed: true, id: 2, email: 's@x', groups: [] };
  const graph = createTestGraph(DMS_DB, { user: admin });
  const T = resolveTable(APP, '', db.type, 'per-app');
  const OLD = db.type === 'postgres' ? `now() - interval '3 days'` : `datetime('now', '-3 days')`;

  const create = async (type, data) => {
    const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
    return +Object.keys(res.jsonGraph.dms.data.byId)[0];
  };
  const alive = async (id) => (await db.promise(`SELECT id FROM ${T.fullName} WHERE id = $1`, [id])).length === 1;

  // a site listing one pattern; a page listing one section; an unused section; a page whose pattern is gone
  const docs = await create('main|docs:pattern', { name: 'Docs', pattern_type: 'page' });
  await create('main:site', { site_name: 'S', patterns: [{ id: String(docs), ref: `${APP}+main|docs:pattern` }] });
  const used = await create('docs|component', { title: 'used' });
  await create('docs|page', { title: 'p', sections: [{ id: String(used), ref: `${APP}+docs|component` }] });
  const unused = await create('docs|component', { title: 'unused' });
  const gonePage = await create('gone|page', { title: 'orphan' });
  const F = await ensureFormatsTable(db, APP, db.type, 'per-app');
  await db.promise(`INSERT INTO ${F.fullName} (app, type, child_refs) VALUES ($1, 'page+pattern', $2)`,
    [APP, JSON.stringify({ page: { sections: 'component', draft_sections: 'component', history: 'page-edit' } })]);
  await db.promise(`UPDATE ${T.fullName} SET created_at = ${OLD}, updated_at = ${OLD} WHERE app = $1`, [APP]);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { const u = req.headers['x-test-user']; req.availAuthContext = { user: u ? JSON.parse(u) : null }; next(); });
  require('../src/routes/dms/storageHttp').registerStorageRoutes(app);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const call = async (user, method, url, body) => {
    const res = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': JSON.stringify(user) } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  // a job that is not done within the wait is polled, as the client does
  const done = async (user, r) => {
    while (r.status === 202) r = await call(user, 'GET', `/dms/${APP}/storage/jobs/${r.body.job}`);
    return r;
  };

  console.log('\nstorage routes');
  try {
    await t('a stranger is refused', async () => {
      const r = await call(stranger, 'POST', `/dms/${APP}/storage/plan`, {});
      assert.strictEqual(r.status, 403);
      assert.strictEqual((await call(null, 'POST', `/dms/${APP}/storage/plan`, {})).status, 401);
    });

    let plan;
    await t('the plan: usage, groups with sizes, expect', async () => {
      const r = await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/plan`, {}));
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      plan = r.body.result;
      assert.strictEqual(plan.counts.unlisted_children, 1);
      assert.strictEqual(plan.counts.dead_containers, 1);
      assert.ok(plan.usage.find(u => u.type === 'docs|component' && u.rows === 2));
      assert.ok(plan.groups.every(g => g.bytes > 0 && 'parent' in g));
      assert.deepStrictEqual(plan.expect, { [APP]: plan.counts });
      assert.ok(!('ids' in plan) && !('rows' in plan));
    });

    await t('parents narrows the plan to one pattern', async () => {
      const r = await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/plan`, { parents: ['docs'] }));
      assert.strictEqual(r.body.result.total, 1);
      assert.strictEqual(r.body.result.groups[0].type, 'docs|component');
      assert.strictEqual((await call(admin, 'POST', `/dms/${APP}/storage/plan`, { only: ['nope'] })).status, 400);
    });

    await t('clean refuses without expect, and when the counts moved', async () => {
      assert.strictEqual((await call(admin, 'POST', `/dms/${APP}/storage/clean`, {})).status, 400);
      const r = await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/clean`, { expect: { [APP]: { unlisted_children: 7 } } }));
      assert.strictEqual(r.status, 409, JSON.stringify(r.body));
      assert.ok(await alive(unused) && await alive(gonePage));
      assert.strictEqual((await call(stranger, 'POST', `/dms/${APP}/storage/clean`, { expect: plan.expect })).status, 403);
    });

    await t('clean one pattern deletes only its rows, with a backup', async () => {
      const p = (await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/plan`, { parents: ['docs'] }))).body.result;
      const r = await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/clean`, { parents: ['docs'], expect: p.expect }));
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.result.deleted, 1);
      assert.ok(fs.existsSync(path.join(process.env.DMS_DELETE_BACKUP_DIR, r.body.result.backup)));
      assert.ok(!await alive(unused) && await alive(gonePage) && await alive(used));
    });

    await t('clean all takes the rest; a new plan finds nothing', async () => {
      const p = (await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/plan`, {}))).body.result;
      const r = await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/clean`, { expect: p.expect }));
      assert.strictEqual(r.body.result.deleted, 1);
      assert.ok(!await alive(gonePage) && await alive(used) && await alive(docs));
      const after = (await done(admin, await call(admin, 'POST', `/dms/${APP}/storage/plan`, {}))).body.result;
      assert.strictEqual(after.total, 0);
    });
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
