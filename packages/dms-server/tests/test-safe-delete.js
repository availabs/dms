/**
 * Delete means delete — Phase 1 of planning/tasks/completed/safe-delete-removes-rows.md.
 *
 *   F12  dms.data.delete writes one change_log `D` per row it ACTUALLY deleted, under the stored
 *        app/type. It used to write one per id the caller passed, so an id that resolved to the
 *        wrong table (or no row) made every sync client drop a row that still exists.
 *   F9   the parentage sweep writes a `D` for each child it deletes. It wrote none, so a swept
 *        section stayed in every local-first store.
 *   F6   uda.sources.delete on an internal (DMS) source goes through the controller cascade: its
 *        views (by type path AND by `data.views`), split tables, refs in dmsEnv AND pattern
 *        `data.sources`, its dms.tasks, and change_log for all of it. It wrote no change_log
 *        and left the pattern refs.
 *   F7   a deleted view's uploaded file (`data.file.dl_url`) leaves storage after the commit,
 *        unless another row still names it.
 *
 * Run (never against the owner's default configs, see dms-server/CLAUDE.md):
 *   DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test DAMA_SERVER_FILESTORAGE_PATH=<tmp> node tests/test-safe-delete.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'legacy';
const os = require('os');
const fs = require('fs');
const path = require('path');
if (!process.env.DAMA_SERVER_FILESTORAGE_PATH) {
  process.env.DAMA_SERVER_FILESTORAGE_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-delete-files-'));
}
const assert = require('assert');
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
  const TASKS = db.type === 'postgres' ? 'dms.tasks' : 'dms_tasks';

  const APP = `safedel_${Date.now()}`;
  const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
  const graph = createTestGraph(DMS_DB, { user: admin });
  const T = resolveTable(APP, '', db.type, 'per-app');

  const create = async (type, data) => {
    const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
    return +Object.keys(res.jsonGraph.dms.data.byId)[0];
  };
  const edit = (id, data, type) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data, type]);
  const del = (type, ...ids) => graph.callAsync(['dms', 'data', 'delete'], [APP, type, ...ids]);
  const alive = async (id) => (await db.promise(`SELECT id FROM ${T.fullName} WHERE id = $1`, [id])).length === 1;
  const dataOf = async (id) => {
    const [r] = await db.promise(`SELECT data FROM ${T.fullName} WHERE id = $1`, [id]);
    return r && (typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  };
  const logFor = async (id, action) =>
    db.promise(`SELECT item_id, app, type FROM ${CL} WHERE app = $1 AND item_id = $2 AND action = $3`, [APP, id, action]);
  const tableExists = async (fullName) => {
    try { await db.promise(`SELECT 1 FROM ${fullName} LIMIT 1`); return true; } catch { return false; }
  };

  await create('prod:site', { name: 'prod' });

  section('F12. one D per row actually deleted');
  {
    const a = await create('notes|page', { title: 'a' });
    const b = await create('notes|page', { title: 'b' });
    await del('notes|page', a, 999999999);
    await t('the deleted row gets exactly one D, under its stored type', async () => {
      const rows = await logFor(a, 'D');
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].type, 'notes|page');
    });
    await t('an id that matched no row gets no D', async () =>
      assert.strictEqual((await logFor(999999999, 'D')).length, 0));

    // A split `type` resolves a split table: the main-table row is not there and is not deleted.
    await del('notes|5:data', b);
    await t('a wrong-table delete leaves the row and logs no D for it', async () => {
      assert.strictEqual(await alive(b), true);
      assert.strictEqual((await logFor(b, 'D')).length, 0);
    });
  }

  section('F9. the sweep logs what it deletes');
  {
    const prev = process.env.DMS_CHILD_SWEEP_MODE;
    process.env.DMS_CHILD_SWEEP_MODE = 'delete';
    const CHILD_REFS = { page: { sections: 'component', draft_sections: 'component' } };
    await create('prod|widgets:pattern', { pattern_type: 'page', childRefs: CHILD_REFS });
    const ref = (id) => ({ id, ref: `${APP}+widgets|component` });

    const s1 = await create('widgets|component', { title: 'gen 1' });
    const page = await create('widgets|page', { title: 'P', sections: [ref(s1)] });
    const s2 = await create('widgets|component', { title: 'gen 2' });
    await edit(page, { sections: [ref(s2)] }, 'widgets|page');
    await t('a section dropped by an edit is deleted and logged D', async () => {
      assert.strictEqual(await alive(s1), false);
      const rows = await logFor(s1, 'D');
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].type, 'widgets|component');
    });

    await del('widgets|page', page);
    await t('a deleted page takes its sections, each logged D', async () => {
      assert.strictEqual(await alive(s2), false);
      assert.strictEqual((await logFor(s2, 'D')).length, 1);
      assert.strictEqual((await logFor(page, 'D')).length, 1);
    });
    if (prev === undefined) delete process.env.DMS_CHILD_SWEEP_MODE; else process.env.DMS_CHILD_SWEEP_MODE = prev;
  }

  section('F6 + F7. uda.sources.delete on an internal source');
  {
    const { deleteInternalSource } = require('../src/routes/uda/uda.tasks.controller');
    const storage = require('../src/dama/storage');
    const slug = `src_${Date.now()}`;
    const env = await create('prod|ds_env:dmsenv', { sources: [] });
    const pattern = await create('prod|ds:pattern', { pattern_type: 'datasets', sources: [] });
    const src = await create(`ds_env|${slug}:source`, { name: slug });
    const v1 = await create(`${slug}|v1:view`, { name: 'v1', file: { dl_url: storage.getUrl(`dms-${APP}/s/v1/a.csv`) } });
    // a view the source lists whose type points elsewhere (old clients wrote these)
    const stray = await create(`other_${slug}|v2:view`, { name: 'v2', file: { dl_url: storage.getUrl(`dms-${APP}/s/v2/b.csv`) } });
    // a duplicated view sharing v1's file: deleting the source must keep that file
    const shared = await create(`${slug}|v3:view`, { name: 'v3', file: { dl_url: storage.getUrl(`dms-${APP}/s/v3/c.csv`) } });
    const keeper = await create('elsewhere|v9:view', { name: 'copy', file: { dl_url: storage.getUrl(`dms-${APP}/s/v3/c.csv`) } });
    await storage.write(`dms-${APP}/s/v1/a.csv`, 'a');
    await storage.write(`dms-${APP}/s/v2/b.csv`, 'b');
    await storage.write(`dms-${APP}/s/v3/c.csv`, 'c');
    await edit(src, { views: [{ id: v1 }, { id: stray }, { id: shared }] });
    await edit(env, { sources: [{ id: src, ref: `${APP}+ds_env|source` }] });
    await edit(pattern, { sources: [{ id: src, ref: `${APP}+ds_env|source` }] });

    // a split data table for v1 and for the stray view
    await graph.callAsync(['dms', 'data', 'create'], [APP, `${slug}|${v1}:data`, { a: 1 }]);
    const v1Table = resolveTable(APP, `${slug}|${v1}:data`, db.type, 'per-app', src).fullName;
    await t('fixture: v1 has a split table', async () => assert.strictEqual(await tableExists(v1Table), true));

    await db.promise(`INSERT INTO ${TASKS} (host_id, app, source_id, worker_path, status, descriptor) VALUES ($1, $2, $3, $4, 'done', $5)`,
      ['test', APP, src, 'test/worker', JSON.stringify({})]);

    const result = await deleteInternalSource(`${APP}+ds`, src, { user: admin });
    await t('the summary counts the source and all three views', async () => {
      assert.strictEqual(result.deleted_source, true);
      assert.deepStrictEqual([...result.deleted_views].sort((x, y) => x - y), [v1, stray, shared].sort((x, y) => x - y));
      assert.strictEqual(result.deleted_tasks, 1);
    });
    await t('source, path views and the listed stray view are gone', async () => {
      for (const id of [src, v1, stray, shared]) assert.strictEqual(await alive(id), false, `row ${id}`);
      assert.strictEqual(await alive(keeper), true);
    });
    await t('each deleted row has one D in change_log', async () => {
      for (const id of [src, v1, stray, shared]) assert.strictEqual((await logFor(id, 'D')).length, 1, `row ${id}`);
    });
    await t('the dmsEnv AND the pattern lose the ref, each logged U', async () => {
      assert.deepStrictEqual((await dataOf(env)).sources, []);
      assert.deepStrictEqual((await dataOf(pattern)).sources, []);
      assert.ok((await logFor(pattern, 'U')).length >= 2);
    });
    await t('the split table is dropped', async () => assert.strictEqual(await tableExists(v1Table), false));
    await t('its tasks are deleted', async () =>
      assert.strictEqual((await db.promise(`SELECT task_id FROM ${TASKS} WHERE app = $1 AND source_id = $2`, [APP, src])).length, 0));
    await t('the views\' own files leave storage', async () => {
      assert.strictEqual(await storage.exists(`dms-${APP}/s/v1/a.csv`), false);
      assert.strictEqual(await storage.exists(`dms-${APP}/s/v2/b.csv`), false);
    });
    await t('a file another row still names is kept', async () =>
      assert.strictEqual(await storage.exists(`dms-${APP}/s/v3/c.csv`), true));

    // a source already gone: its refs are still cleaned up
    const ghost = 888888888;
    await edit(pattern, { sources: [{ id: ghost, ref: `${APP}+ds_env|source` }] });
    const r2 = await deleteInternalSource(`${APP}+ds`, ghost, { user: admin });
    await t('a missing source still has its refs removed', async () => {
      assert.strictEqual(r2.deleted_source, false);
      assert.deepStrictEqual((await dataOf(pattern)).sources, []);
    });
  }

  section('F7. a view deleted on its own');
  {
    const storage = require('../src/dama/storage');
    const v = await create('lone|v1:view', { name: 'lone', file: { dl_url: storage.getUrl(`dms-${APP}/lone/x.csv`) } });
    await storage.write(`dms-${APP}/lone/x.csv`, 'x');
    await del('lone|view', v);
    await t('its file leaves storage', async () =>
      assert.strictEqual(await storage.exists(`dms-${APP}/lone/x.csv`), false));

    const outside = await create('lone|v2:view', { name: 'ext', file: { dl_url: 'https://example.com/elsewhere.csv' } });
    await del('lone|view', outside);
    await t('a url that is not in this server\'s storage is left alone (and does not fail the delete)', async () =>
      assert.strictEqual(await alive(outside), false));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
