/**
 * The pgEnv mirror (dama/mirror.js, planning/tasks/current/pgenv-mirror-into-dms.md): a DMS row per
 * external source and view, parented env → source → view, kept equal to the pgEnv by the reconcile and
 * by the hooks in createDamaSource / createDamaView / updateSource / updateView / deleteDamaSource /
 * deleteDamaView. Real SQLite databases on both sides.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-pgenv-mirror.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { dmsMainTable } = require('../src/routes/uda/utils');
const mirror = require('../src/dama/mirror');
const { createDamaSource, createDamaView } = require('../src/dama/upload/metadata');
const { deleteDamaSource, deleteDamaView } = require('../src/dama/delete');
const { updateSource, updateView } = require('../src/routes/uda/uda.controller');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 4).join('\n      ')}`); }
};
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB); getDb(DAMA_DB);
  await awaitReady();
  const dms = getDb(DMS_DB);
  const dama = getDb(DAMA_DB);
  const srcTbl = dama.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const viewTbl = dama.type === 'postgres' ? 'data_manager.views' : 'views';
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(' '));

  const APP = `mirror_${Date.now()}`;
  const tbl = await dmsMainTable(dms, APP, 'per-app');
  // the parentage column, when this test db predates the migration (the controller stamps it only where it exists)
  try { await dms.query(`ALTER TABLE ${tbl} ADD COLUMN parent_id INTEGER`); } catch { /* already there */ }
  const ctl = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const ins = async (type, data) => +(await ctl.createData([APP, type, data], null))[0].id;
  const site = await ins('site:site', { site_name: 'S' });
  const env = await ins('site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB, sources: [], parent_id: site });
  const rowsOf = async (kind) => (await dms.query(`SELECT id, type, data, parent_id FROM ${tbl} WHERE app = $1 AND type LIKE $2`, [APP, `%:${kind}`])).rows
    .map(r => ({ ...r, data: parse(r.data) }));
  const mirrorOf = async (kind, key, id) => (await rowsOf(kind)).find(r => r.data.pgEnv === DAMA_DB && +r.data[key] === +id) || null;

  // two sources and three views in the pgEnv, written the way plugins do (direct SQL)
  const raw = async (name, ap) => (await dama.query(`INSERT INTO ${srcTbl} (name, type, auth_permissions) VALUES ($1, 'csv', $2) RETURNING source_id`,
    [`${APP}_${name}`, JSON.stringify(ap)])).rows[0].source_id;
  const rawView = async (sourceId, version) => (await dama.query(`INSERT INTO ${viewTbl} (source_id, version) VALUES ($1, $2) RETURNING view_id`, [sourceId, version])).rows[0].view_id;
  const s1 = await raw('roads', { groups: { Readers: ['view-source'] }, users: {} });
  const s2 = await raw('bridges', { groups: { public: [] }, users: { 1: ['*'] } });
  const v1 = await rawView(s1, 'v1'); const v2 = await rawView(s1, 'v2'); const v3 = await rawView(s2, null);
  const cleanup = { sources: [s1, s2] };

  console.log('reconcile:');
  await t('dry run plans every source and view, writes nothing', async () => {
    const r = await mirror.reconcile({ app: APP, pgEnv: DAMA_DB });
    assert.ok(r.sources.create >= 2 && r.views.create >= 3, JSON.stringify(r));
    assert.strictEqual((await rowsOf('source')).length, 0);
    assert.strictEqual(r.clean, false);
  });
  await t('apply creates the rows, parented env → source → view, with the source grants', async () => {
    await mirror.reconcile({ app: APP, pgEnv: DAMA_DB, apply: true });
    const m1 = await mirrorOf('source', 'source_id', s1);
    assert.ok(m1, 'source mirror'); assert.strictEqual(+m1.parent_id, env);
    assert.strictEqual(m1.type, `extenv|${APP}_roads:source`);
    assert.deepStrictEqual(m1.data.auth_permissions, { groups: { Readers: ['view-source'] }, users: {} });
    assert.strictEqual(m1.data.type, 'csv');
    const mv1 = await mirrorOf('view', 'view_id', v1);
    assert.ok(mv1, 'view mirror'); assert.strictEqual(+mv1.parent_id, +m1.id);
    assert.strictEqual(mv1.type, `${APP}_roads|v${v1}:view`); assert.strictEqual(mv1.data.version, 'v1');
    const mv3 = await mirrorOf('view', 'view_id', v3);
    assert.strictEqual(+mv3.parent_id, +(await mirrorOf('source', 'source_id', s2)).id);
  });
  await t('a second run is clean; the app is registered as a mirror of the pgEnv', async () => {
    const r = await mirror.reconcile({ app: APP, pgEnv: DAMA_DB, apply: true });
    assert.strictEqual(r.clean, true, JSON.stringify(r));
    assert.ok((await mirror.mirrorAppsOf(DAMA_DB)).includes(APP));
  });
  await t('a direct-SQL name change and a deleted row are picked up; a grant change in the pgEnv is NOT (the mirror\'s grants are its own)', async () => {
    await dama.query(`UPDATE ${srcTbl} SET name = $1, auth_permissions = $2 WHERE source_id = $3`,
      [`${APP}_roads2`, JSON.stringify({ groups: { Readers: ['view-source', 'update-source'] }, users: {} }), s1]);
    await dama.query(`DELETE FROM ${viewTbl} WHERE view_id = $1`, [v2]);
    const r = await mirror.reconcile({ app: APP, pgEnv: DAMA_DB });
    assert.strictEqual(r.sources.update, 1); assert.strictEqual(r.views.delete, 1);
    await mirror.reconcile({ app: APP, pgEnv: DAMA_DB, apply: true });
    const m1 = await mirrorOf('source', 'source_id', s1);
    assert.strictEqual(m1.data.name, `${APP}_roads2`);
    assert.deepStrictEqual(m1.data.auth_permissions, { groups: { Readers: ['view-source'] }, users: {} }, 'seeded once, then the site\'s');
    assert.strictEqual(await mirrorOf('view', 'view_id', v2), null);
    assert.strictEqual((await mirror.reconcile({ app: APP, pgEnv: DAMA_DB })).clean, true);
  });
  await t('grantsIn / setGrantsIn read and write the site\'s grants on the mirror', async () => {
    assert.deepStrictEqual(await mirror.grantsIn(APP, DAMA_DB, s1), { groups: { Readers: ['view-source'] }, users: {} });
    await mirror.setGrantsIn(APP, DAMA_DB, s1, JSON.stringify({ groups: { Readers: ['*'] }, users: {} }));
    assert.deepStrictEqual(await mirror.grantsIn(APP, DAMA_DB, s1), { groups: { Readers: ['*'] }, users: {} });
    assert.strictEqual(await mirror.grantsIn(APP, DAMA_DB, 99999999), undefined);
    await assert.rejects(mirror.setGrantsIn(APP, DAMA_DB, 99999999, {}), /no mirror row/);
  });

  console.log('\nhooks:');
  let s3, v4;
  await t('createDamaSource mirrors the new source into every registered app', async () => {
    const row = await createDamaSource({ name: `${APP}_hooked`, type: 'csv', authPermissions: { groups: { Loaders: ['*'] }, users: {} } }, DAMA_DB);
    s3 = row.source_id; cleanup.sources.push(s3);
    const m = await mirrorOf('source', 'source_id', s3);
    assert.ok(m, 'mirrored'); assert.strictEqual(+m.parent_id, env);
    assert.deepStrictEqual(m.data.auth_permissions.groups.Loaders, ['*']);
  });
  await t('createDamaView mirrors the view under the source', async () => {
    const view = await createDamaView({ source_id: s3 }, DAMA_DB);
    v4 = view.view_id;
    const m = await mirrorOf('view', 'view_id', v4);
    assert.ok(m, 'mirrored'); assert.strictEqual(+m.parent_id, +(await mirrorOf('source', 'source_id', s3)).id);
  });
  await t('updateSource (name, description) and updateView (version) follow; a pgEnv grant write does not', async () => {
    await updateSource(DAMA_DB, s3, { auth_permissions: JSON.stringify({ groups: { Loaders: ['update-source'] }, users: {} }), description: 'd' });
    assert.deepStrictEqual((await mirrorOf('source', 'source_id', s3)).data.auth_permissions.groups.Loaders, ['*'], 'the mirror keeps its own grants');
    assert.strictEqual((await mirrorOf('source', 'source_id', s3)).data.description, 'd');
    await updateView(DAMA_DB, v4, { version: 'draft' });
    assert.strictEqual((await mirrorOf('view', 'view_id', v4)).data.version, 'draft');
    await updateSource(DAMA_DB, s3, { metadata: JSON.stringify({ columns: [] }) });   // not mirrored, not an error
  });
  await t('inside a transaction the mirror lands after the commit', async () => {
    let inside = null;
    const row = await dama.withTransaction(async (tx) => {
      const r = await createDamaSource({ db: tx, name: `${APP}_tx`, type: 'csv' }, DAMA_DB);
      inside = await mirrorOf('source', 'source_id', r.source_id);
      return r;
    });
    cleanup.sources.push(row.source_id);
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(inside, null, 'nothing mirrored before the commit');
    assert.ok(await mirrorOf('source', 'source_id', row.source_id), 'mirrored after the commit');
  });
  await t('deleteDamaView and deleteDamaSource remove the mirrors', async () => {
    await deleteDamaView(DAMA_DB, v4, { drop: false });
    assert.strictEqual(await mirrorOf('view', 'view_id', v4), null);
    await deleteDamaSource(DAMA_DB, s1);
    cleanup.sources = cleanup.sources.filter(id => id !== s1);
    assert.strictEqual(await mirrorOf('source', 'source_id', s1), null);
    assert.strictEqual(await mirrorOf('view', 'view_id', v1), null, 'its views went with it');
    assert.strictEqual((await mirror.reconcile({ app: APP, pgEnv: DAMA_DB })).clean, true);
  });
  await t('an app registered without an env row is reported, not thrown, and the dama write happens', async () => {
    mirror.forgetMirrorApps();
    const { setSettings, getSettings } = require('../src/routes/uda/uda.tasks.controller');
    const saved = await getSettings(DAMA_DB);
    await setSettings(DAMA_DB, JSON.stringify({ ...(parse(saved) || {}), mirror_apps: ['no_such_app_' + Date.now()] }));
    mirror.forgetMirrorApps();
    const before = warned.length;
    const row = await createDamaSource({ name: `${APP}_orphan`, type: 'csv' }, DAMA_DB);
    cleanup.sources.push(row.source_id);
    assert.ok(row.source_id, 'the dama write happened');
    assert.ok(warned.slice(before).some(w => /\[mirror\]/.test(w)), 'the failure was logged');
    await setSettings(DAMA_DB, saved);
    mirror.forgetMirrorApps();
  });

  console.log('a table without parent_id (production today; the tenant hub):');
  await t('two sources with the same name: each view resolves to its OWN source; register: false writes nothing to the pgEnv', async () => {
    const owners = require('../src/routes/auth/owners');
    const APP2 = `mirror_nocol_${Date.now()}`;
    await dmsMainTable(dms, APP2, 'per-app');   // no parent_id column added: the controller drops the stamp
    const ins2 = async (type, data) => +(await ctl.createData([APP2, type, data], null))[0].id;
    const s = await ins2('site:site', { site_name: 'S2' });
    await ins2('site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB, sources: [], parent_id: s });
    const twinA = await raw('twin', { groups: { A: ['view-source'] }, users: {} });
    const twinB = await raw('twin', { groups: { B: ['view-source'] }, users: {} });
    const va = await rawView(twinA, 'a'); const vb = await rawView(twinB, 'b');
    cleanup.sources.push(twinA, twinB);
    const before = await mirror.mirrorAppsOf(DAMA_DB);
    mirror.forgetMirrorApps();
    await mirror.reconcile({ app: APP2, pgEnv: DAMA_DB, apply: true, register: false });
    mirror.forgetMirrorApps();
    assert.deepStrictEqual(await mirror.mirrorAppsOf(DAMA_DB), before, 'mirror_apps unchanged');
    owners.clearSnapshots();
    const snap = await owners.appSnapshot(APP2, { fresh: true });
    for (const [viewId, sourceId] of [[va, twinA], [vb, twinB]]) {
      const view = snap.external.get(`v:${DAMA_DB}:${viewId}`);
      assert.ok(view, `view ${viewId} mirrored`);
      assert.strictEqual(view.parent_id, null, 'no column: no stamp');
      const p = owners.parentOf(snap, view);
      assert.ok(p && +p.data.source_id === +sourceId, `view ${viewId} → source ${p && p.data.source_id}, expected ${sourceId}`);
    }
  });

  // cleanup
  for (const id of cleanup.sources) { await dama.query(`DELETE FROM ${viewTbl} WHERE source_id = $1`, [id]); await dama.query(`DELETE FROM ${srcTbl} WHERE source_id = $1`, [id]); }
  console.warn = warn;
}

run()
  .catch(e => { fail++; console.log(`  ✗ crashed\n      ${e.stack}`); })
  .then(() => { console.log(`\npgenv-mirror tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
