/**
 * Every user-facing delete, end to end: safe-delete-removes-rows.md, testing checklist item 1.
 *
 * For each surface the test snapshots the app's whole main table and change_log before the action, runs it
 * through the route a client uses, and then checks two things across the WHOLE app, not just the ids it names:
 *   - the rows that disappeared are exactly the expected ones (the target and every child it owns), and
 *     nothing else went;
 *   - change_log gained exactly one `D` per row that disappeared, under that row's stored type, and no `D`
 *     for any row that is still there.
 *
 * Surfaces: publish and discard (a generation dropped), remove section, a section another page still lists,
 * page subtree delete (Falcor, as the page editor and admin Pages tab send it), page delete over /sync/push
 * (local-first clients), ids that match no row (F12), pattern delete (page and datasets, REST), theme delete
 * (REST), the plan routes (read-only), internal source delete (datasets page), view delete. The CLI's `section delete` / `page delete` are
 * edits and `dms.data.delete` calls, so they are covered by the same routes (and by the CLI's own tests).
 *
 * Run (never against the owner's default configs, see dms-server/CLAUDE.md):
 *   DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-delete-surfaces.js
 *   node tests/postgres-docker.js run tests/test-delete-surfaces.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'legacy';
delete process.env.DMS_CHILD_SWEEP_MODE; // the default (delete) is what ships
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DMS_DELETE_BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-surfaces-backups-'));
if (!process.env.DAMA_SERVER_FILESTORAGE_PATH) {
  process.env.DAMA_SERVER_FILESTORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-surfaces-files-'));
}
const assert = require('assert');
const express = require('express');
const { createTestGraph } = require('./graph');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n')}`); }
};

const CHILD_REFS = { page: { sections: 'component', draft_sections: 'component', history: 'page-edit' } };

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  const db = getDb(DMS_DB); await awaitReady();
  console.log(`Database: ${DMS_DB} (${db.type})`);
  const CL = db.type === 'postgres' ? 'dms.change_log' : 'change_log';

  const APP = `delsurf_${Date.now()}`;
  const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
  const graph = createTestGraph(DMS_DB, { user: admin });
  const T = resolveTable(APP, '', db.type, 'per-app');

  // the REST routes a client calls besides Falcor: /sync/push and the owner deletes
  const { createSyncRoutes } = require('../src/routes/sync/sync');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.availAuthContext = { user: admin }; next(); });
  app.use(createSyncRoutes(DMS_DB));
  require('../src/routes/dms/ownerDeleteHttp').registerOwnerDeleteRoutes(app);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const post = async (url, body = {}) => {
    const res = await fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  const create = async (type, data) => {
    const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
    return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
  };
  const edit = (id, data, type) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data, type]);
  const falcorDelete = (type, ...ids) => graph.callAsync(['dms', 'data', 'delete'], [APP, type, ...ids]);
  const ref = (id, kind) => ({ id, ref: `${APP}+${kind}` });
  const tableExists = async (fullName) => {
    const [r] = db.type === 'postgres'
      ? await db.promise(`SELECT 1 AS ok WHERE to_regclass($1) IS NOT NULL`, [fullName])
      : await db.promise(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = $1`, [fullName.split('.').pop()]);
    return !!r;
  };

  const snapshot = async () => {
    const rows = await db.promise(`SELECT id, type FROM ${T.fullName} WHERE app = $1`, [APP]);
    return new Map(rows.map(r => [String(r.id), r.type]));
  };
  const lastRevision = async () =>
    +((await db.promise(`SELECT MAX(revision) AS r FROM ${CL}`))[0]?.r || 0);

  /**
   * Run `action` and check the whole app afterwards: exactly `expectGone` disappeared, and change_log gained
   * one D per disappeared row (stored type) and none for anything else.
   */
  const surface = async (name, expectGone, action) => {
    console.log(`\n${name}`);
    const before = await snapshot();
    const rev = await lastRevision();
    await action();
    const after = await snapshot();
    const gone = [...before.keys()].filter(id => !after.has(id)).sort();
    const appeared = [...after.keys()].filter(id => !before.has(id));
    const dRows = await db.promise(`SELECT item_id, type FROM ${CL} WHERE app = $1 AND action = 'D' AND revision > $2`, [APP, rev]);
    const want = expectGone.map(String).sort();

    await t(`exactly the expected ${want.length} row(s) are gone, nothing else`, async () =>
      assert.deepStrictEqual(gone, want));
    await t('no row was created by the delete', async () => assert.deepStrictEqual(appeared, []));
    await t('change_log has exactly one D per deleted row, under its stored type, and no other D', async () => {
      const byId = {};
      for (const r of dRows) (byId[String(r.item_id)] ||= []).push(r.type);
      assert.deepStrictEqual(Object.keys(byId).sort(), want, 'D ids');
      for (const id of want) {
        assert.strictEqual(byId[id].length, 1, `row ${id}: ${byId[id].length} D`);
        assert.strictEqual(byId[id][0], before.get(id), `row ${id} D type`);
      }
    });
  };

  // ---- fixtures: a site with a page pattern (childRefs as registered on prod) and a datasets pattern
  const docs = await create('main|docs:pattern', { name: 'Docs', pattern_type: 'page', childRefs: CHILD_REFS });
  const other = await create('main|other:pattern', { name: 'Other', pattern_type: 'page', childRefs: CHILD_REFS });
  const sec = (title) => create('docs|component', { title });
  const page = async (title, extra = {}) => create('docs|page', { title, ...extra });
  const S = (id) => ref(id, 'docs|component');
  const H = (id) => ref(id, 'docs|page-edit');
  const theme = await create('spare:theme', { name: 'Spare', theme: '{}' });
  const env = await create('main|e1:dmsenv', { name: 'e1', sources: [] });
  const data = await create('main|data:pattern', { name: 'Data', pattern_type: 'datasets', dmsEnvId: env });
  const site = await create('main:site', {
    name: 'main',
    patterns: [docs, other, data].map(id => ref(id, 'pattern')),
    dms_envs: [ref(env, 'dmsenv')],
    theme_refs: [ref(theme, 'theme')],
  });

  // ---- F1 publish: the page's previous published generation goes
  {
    const d1 = await sec('draft'), p1 = await sec('published gen 1');
    const P = await page('Publish', { draft_sections: [S(d1)], sections: [S(p1)] });
    const p2 = await sec('published gen 2');
    await surface('F1. publish (the previous published section)', [p1], () => edit(P, { sections: [S(p2)] }, 'docs|page'));

    // F1 discard: the draft is replaced by a copy of the published set
    const d2 = await sec('draft from published');
    await surface('F1. discard (the old draft section)', [d1], () => edit(P, { draft_sections: [S(d2)] }, 'docs|page'));
  }

  // ---- F2 remove a section in the editor
  {
    const a = await sec('a'), b = await sec('b');
    const P = await page('Remove', { draft_sections: [S(a), S(b)] });
    await surface('F2. remove section', [b], () => edit(P, { draft_sections: [S(a)] }, 'docs|page'));
  }

  // ---- a section another page still lists is kept, and gets no D
  {
    const x = await sec('shared');
    const A = await page('A', { draft_sections: [S(x)] });
    await page('B', { draft_sections: [S(x)] });
    await create('other|page', { title: 'C (another pattern)', draft_sections: [S(x)] });
    await surface('Kept: a section other pages still list is not deleted when its owner drops it', [],
      () => edit(A, { draft_sections: [] }, 'docs|page'));
  }

  // ---- F3 page subtree delete: one dms.data.delete with every id, as the page editor and admin tab send it
  {
    const s1 = await sec('p s1'), s2 = await sec('p s2'), cs = await sec('child s'), gs = await sec('grandchild s');
    const h1 = await create('docs|page-edit', { note: 'edit 1' });
    const P = await page('Parent', { draft_sections: [S(s1)], sections: [S(s2)], history: H(h1) });
    const C = await page('Child', { parent: P, draft_sections: [S(cs)] });
    const G = await page('Grandchild', { parent: C, sections: [S(gs)] });
    const sibling = await page('Sibling', {});
    await surface('F3. page subtree delete (Falcor)', [P, C, G, s1, s2, cs, gs, h1],
      () => falcorDelete('docs|page', P, C, G));
    await t('the sibling page is untouched', async () => assert.ok((await snapshot()).has(sibling)));
  }

  // ---- page delete from a local-first client: /sync/push D with the one id (an old client's delete)
  {
    const s1 = await sec('sync s1');
    const h1 = await create('docs|page-edit', { note: 'sync edit' });
    const P = await page('Sync page', { draft_sections: [S(s1)], history: [H(h1)] });
    await surface('Page delete over /sync/push', [P, s1, h1], async () => {
      const r = await post('/sync/push', { action: 'D', item: { id: P, app: APP, type: 'docs|page' } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    });
  }

  // ---- F12: ids that match no row, and a row asked for under the wrong table
  {
    const real = await page('Real');
    const kept = await page('Wrong table');
    await surface('F12. a delete with an id that matches no row', [real], () => falcorDelete('docs|page', real, '999999999'));
    await surface('F12. a delete under the wrong table deletes and logs nothing', [], () => falcorDelete('docs|5:data', kept));
  }

  // ---- F7: a view deleted on its own
  {
    const v = await create('lone|v1:view', { name: 'lone' });
    await surface('F7. view delete', [v], () => falcorDelete('lone|view', v));
  }

  // ---- F6: an internal source deleted from the datasets page
  {
    const { deleteInternalSource } = require('../src/routes/uda/uda.tasks.controller');
    const src = await create('e1|roads:source', { name: 'roads' });
    const v1 = await create('roads|v1:view', { name: 'v1' });
    const v2 = await create('roads|v2:view', { name: 'v2' });
    await edit(src, { views: [{ id: v1 }, { id: v2 }] });
    await edit(env, { sources: [ref(src, 'e1|source')] });
    await create(`roads|${v1}:data`, { a: 1 });
    const table = resolveTable(APP, `roads|${v1}:data`, db.type, 'per-app', src).fullName;
    await surface('F6. internal source delete', [src, v1, v2], () => deleteInternalSource(`${APP}+data`, +src, { user: admin }));
    await t('its split table is dropped', async () => assert.strictEqual(await tableExists(table), false));
  }

  // ---- the plan routes are read-only: planning every delete changes no row and logs nothing
  await surface('Plan routes (pattern, datasets pattern, theme) change nothing', [], async () => {
    for (const url of [`/dms/${APP}/patterns/${docs}/delete/plan`, `/dms/${APP}/patterns/${data}/delete/plan`, `/dms/${APP}/themes/${theme}/delete/plan`]) {
      const r = await post(url);
      assert.strictEqual(r.status, 200, `${url}: ${JSON.stringify(r.body)}`);
    }
  });
  await t('…and wrote nothing to change_log at all', async () => {
    const rev = await lastRevision();
    await post(`/dms/${APP}/patterns/${docs}/delete/plan`);
    assert.strictEqual(await lastRevision(), rev);
  });

  // ---- F5: theme delete (REST)
  await surface('F5. theme delete', [theme], async () => {
    const r = await post(`/dms/${APP}/themes/${theme}/delete`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  // ---- F4: pattern delete, page pattern (REST): every row under it, nothing of the other pattern
  {
    const before = await snapshot();
    const owned = [...before].filter(([, type]) => type.startsWith('docs|')).map(([id]) => id);
    const otherRows = [...before].filter(([, type]) => type.startsWith('other|')).map(([id]) => id);
    await surface('F4. pattern delete (page pattern)', [docs, ...owned], async () => {
      const plan = await post(`/dms/${APP}/patterns/${docs}/delete/plan`);
      assert.strictEqual(plan.status, 200, JSON.stringify(plan.body));
      const r = await post(`/dms/${APP}/patterns/${docs}/delete`, { expect: plan.body.expect });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    });
    await t('the other pattern\'s rows are untouched', async () => {
      const now = await snapshot();
      for (const id of otherRows) assert.ok(now.has(id), `row ${id}`);
    });
  }

  // ---- F4: pattern delete, datasets pattern with an unshared dmsEnv: env, sources, views, split tables
  {
    const src = await create('e1|rivers:source', { name: 'rivers' });
    const v = await create('rivers|v1:view', { name: 'v1' });
    await edit(src, { views: [{ id: v }] });
    await edit(env, { sources: [ref(src, 'e1|source')] });
    await create(`rivers|${v}:data`, { a: 1 });
    const table = resolveTable(APP, `rivers|${v}:data`, db.type, 'per-app', src).fullName;
    await surface('F4. pattern delete (datasets pattern, its dmsEnv goes too)', [data, env, src, v], async () => {
      const plan = await post(`/dms/${APP}/patterns/${data}/delete/plan`);
      assert.strictEqual(plan.status, 200, JSON.stringify(plan.body));
      assert.deepStrictEqual(plan.body.expect, { dmsEnv: 'delete' });
      const r = await post(`/dms/${APP}/patterns/${data}/delete`, { expect: plan.body.expect });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    });
    await t('its split table is dropped', async () => assert.strictEqual(await tableExists(table), false));
  }

  await t('the site row survives every delete, listing only what is left', async () => {
    const [r] = await db.promise(`SELECT data FROM ${T.fullName} WHERE id = $1`, [site]);
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    assert.deepStrictEqual(d.patterns.map(p => String(p.id)), [other]);
    assert.deepStrictEqual(d.dms_envs, []);
    assert.deepStrictEqual(d.theme_refs, []);
  });

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
