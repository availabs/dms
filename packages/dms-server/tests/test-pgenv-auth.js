/**
 * A pgEnv's sources and views are judged from the pgEnv itself, with no DMS row each
 * (planning/tasks/current/pgenv-auth-without-mirror-rows.md):
 *
 *   1. the auth layer (`routes/auth/owners.js`): the in-memory row, parented to the site's one
 *      `:dmsenv` row; grants from the pgEnv's `auth_permissions` column; what refuses;
 *   2. `scripts/retire-pgenv-mirror.js`: the rows the mirror left are deleted by id, grants that
 *      differ are never silently chosen, the env row and same-slug internal rows are untouched.
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-pgenv-auth.js   (DAMA_TEST_DB picks the pgEnv; local sqlite by default)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_MODE = 'enforce';
const assert = require('assert');
const AUTH = require('../src/routes/auth');
const attachPgEnv = require('./attach-pgenv');
const { retireMirror, sameGrants } = require('../src/scripts/retire-pgenv-mirror');
const { getSettings, setSettings } = require('../src/routes/uda/uda.tasks.controller');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};
const VOCAB = { descendants: [
    { value: 'view-source', implies: ['read'] },
    { value: 'update-source', implies: ['read', 'edit'] },
    { value: 'edit-source-permissions', implies: ['read', 'edit', 'grant'] },
] };

async function run() {
    const { getDb, awaitReady, loadConfig } = require('../src/db');
    getDb(DMS_DB); getDb(DAMA_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const dama = getDb(DAMA_DB);
    const splitMode = loadConfig(DMS_DB).splitMode;
    const srcTbl = dama.type === 'postgres' ? 'data_manager.sources' : 'sources';
    const viewTbl = dama.type === 'postgres' ? 'data_manager.views' : 'views';
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const stamp = `${Date.now()}`;
    const made = { sources: [], views: [] };
    const ext = async (ap) => { const id = +(await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`pgenvauth_${stamp}_${made.sources.length}`, ap == null ? null : JSON.stringify(ap)])).rows[0].source_id; made.sources.push(id); return id; };
    const view = async (sourceId) => { const id = +(await dama.query(`INSERT INTO ${viewTbl} (source_id, table_schema, table_name) VALUES ($1, 'gis_datasets', 'none') RETURNING view_id`, [sourceId])).rows[0].view_id; made.views.push(id); return id; };
    const column = async (id) => { const v = (await dama.query(`SELECT auth_permissions FROM ${srcTbl} WHERE source_id = $1`, [id])).rows[0].auth_permissions; return typeof v === 'string' ? JSON.parse(v) : v; };

    const anon = null;
    const viewer = { authed: true, id: 2, email: 'v@x', groups: ['Viewers'] };
    const envReader = { authed: true, id: 3, email: 'e@x', groups: ['EnvReaders'] };
    const editor = { authed: true, id: 4, email: 'ed@x', groups: ['Editors'] };

    // ---- 1. the auth layer -------------------------------------------------------------------
    const APP = `pgenvauth_${stamp}`;
    const insert = async (app, type, data) => +(await controller.createData([app, type, data], null))[0].id;
    await insert(APP, 'site:site', { site_name: 'x' });
    await insert(APP, 'site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB, authVocabulary: VOCAB,
        authPermissions: { groups: { EnvReaders: ['view-source'] }, users: {} } });
    const OTHER = `pgenvauth_other_${stamp}`;                       // a site that never attached the pgEnv
    await insert(OTHER, 'site:site', { site_name: 'y' });
    AUTH.clearSnapshots();

    const open = await ext(null);
    const priv = await ext({ users: { 1: ['*'] }, groups: { public: [], Viewers: ['view-source'], Editors: ['update-source'] } });
    const narrowed = await ext({ users: { 1: ['*'] }, groups: { Viewers: ['view-source'] }, view: false });
    const privView = await view(priv);
    const can = (subject, user, verb = 'read', app = APP) => AUTH.authorize({ env: DAMA_DB, ...subject, verb, user, app });

    console.log('\nauth: a pgEnv source is judged from the pgEnv, under the site\'s env row');
    await t('no DMS row exists for the source or the view, and none is created by judging them', async () => {
        const before = (await dms.query(`SELECT count(*) AS n FROM ${require('../src/db/table-resolver').resolveTable(APP, '', dms.type, splitMode).fullName} WHERE app = $1`, [APP])).rows[0].n;
        assert.strictEqual((await can({ sourceId: priv }, viewer)).allow, true);
        assert.strictEqual((await can({ viewId: privView }, viewer)).allow, true);
        const after = (await dms.query(`SELECT count(*) AS n FROM ${require('../src/db/table-resolver').resolveTable(APP, '', dms.type, splitMode).fullName} WHERE app = $1`, [APP])).rows[0].n;
        assert.strictEqual(+after, +before);
        assert.strictEqual(+before, 2, 'the site row and the env row');
    });
    await t('a source with no grants is open; one naming someone is closed to the rest', async () => {
        assert.strictEqual((await can({ sourceId: open }, anon)).allow, true);
        assert.strictEqual((await can({ sourceId: priv }, anon)).allow, false);
    });
    await t('the env row\'s grants reach every source of the pgEnv, and its views', async () => {
        assert.strictEqual((await can({ sourceId: priv }, envReader)).allow, true);
        assert.strictEqual((await can({ viewId: privView }, envReader)).allow, true);
    });
    await t('a view is judged on its source\'s grants', async () => {
        assert.strictEqual((await can({ viewId: privView }, viewer)).allow, true);
        assert.strictEqual((await can({ viewId: privView }, anon)).allow, false);
        assert.strictEqual(await AUTH.sourceOfView(DAMA_DB, privView, APP), priv);
    });
    await t('`view: false` narrows a source to its own grantees: the env row lends nothing', async () => {
        assert.strictEqual((await can({ sourceId: narrowed }, viewer)).allow, true);
        assert.strictEqual((await can({ sourceId: narrowed }, envReader)).allow, false);
    });
    await t('a named verb is asked of the source\'s grants', async () => {
        assert.strictEqual((await can({ sourceId: priv }, editor, 'update-source')).allow, true);
        assert.strictEqual((await can({ sourceId: priv }, viewer, 'update-source')).allow, false);
    });
    await t('a request that names no site is refused', async () => {
        const d = await can({ sourceId: open }, viewer, 'read', null);
        assert.deepStrictEqual([d.allow, d.reason], [false, 'no site named']);
    });
    await t('a site with no env row for the pgEnv is refused, and says so', async () => {
        const d = await can({ sourceId: open }, viewer, 'read', OTHER);
        assert.strictEqual(d.allow, false);
        assert.match(d.reason, /is not attached to/);
        await attachPgEnv(OTHER, DAMA_DB);
        assert.strictEqual((await can({ sourceId: open }, viewer, 'read', OTHER)).allow, true, 'attached: one env row is enough');
    });
    await t('a source or view the pgEnv does not have is refused, not guessed', async () => {
        assert.match((await can({ sourceId: 987654321 }, viewer)).reason, /not found/);
        assert.match((await can({ viewId: 987654321 }, viewer)).reason, /not found/);
    });
    await t('a source created after the pgEnv was cached is found on the next read', async () => {
        const late = await ext({ users: {}, groups: { Viewers: ['view-source'] } });
        assert.strictEqual((await can({ sourceId: late }, viewer)).allow, true);
        assert.strictEqual((await can({ sourceId: late }, anon)).allow, false);
    });
    await t('a grant written through updateSource is read at once; a write is always judged on what is stored', async () => {
        const { updateSource } = require('../src/routes/uda/uda.controller');
        assert.strictEqual((await can({ sourceId: priv }, anon)).allow, false);
        await updateSource(DAMA_DB, priv, { auth_permissions: JSON.stringify({ users: { 1: ['*'] }, groups: { public: ['view-source'], Editors: ['update-source'] } }) });
        assert.strictEqual((await can({ sourceId: priv }, anon)).allow, true, 'read at once');
        // direct SQL is not seen by a cached read, but a write verb reads the pgEnv
        await dama.query(`UPDATE ${srcTbl} SET auth_permissions = $1 WHERE source_id = $2`, [JSON.stringify({ users: { 1: ['*'] }, groups: {} }), priv]);
        assert.strictEqual((await can({ sourceId: priv }, editor, 'update-source')).allow, false, 'the grant is gone');
    });
    await t('`create-source` is asked of the site\'s env row for the pgEnv', async () => {
        assert.strictEqual((await AUTH.authorize({ env: DAMA_DB, verb: 'create-source', user: envReader, app: APP })).allow, false);
        const row = await AUTH.envRowFor(DAMA_DB, APP);
        assert.strictEqual(row.data.pgEnv, DAMA_DB);
    });

    // ---- 1b. the hub's attach (routes/tenants/pgEnvs.js) ---------------------------------------
    const tenantPgEnvs = require('../src/routes/tenants/pgEnvs');
    const FRESH = `pgenvauth_fresh_${stamp}`;                       // a tenant nobody attached
    await insert(FRESH, 'site:site', { site_name: 'z' });
    AUTH.clearSnapshots();
    console.log('\nattach: a tenant is attached to a pgEnv by its one env row');
    await t('a tenant with no env row lists nothing attached, and the server\'s pgEnvs as available', async () => {
        const d = await tenantPgEnvs.describe(FRESH);
        assert.deepStrictEqual(d.attached, []);
        assert.ok(d.available.includes(DAMA_DB));
    });
    await t('a pgEnv the server has no config for is refused, and nothing is written', async () => {
        await assert.rejects(tenantPgEnvs.attach({ app: FRESH, pgEnv: 'no_such_pgenv' }), e => e.status === 400);
        await assert.rejects(tenantPgEnvs.attach({ app: FRESH, pgEnv: '' }), e => e.status === 400);
        assert.deepStrictEqual((await tenantPgEnvs.describe(FRESH)).attached, []);
    });
    await t('attach creates the env row, and the pgEnv\'s sources are judged for the tenant at once', async () => {
        assert.match((await can({ sourceId: open }, viewer, 'read', FRESH)).reason, /not attached/);
        const r = await tenantPgEnvs.attach({ app: FRESH, pgEnv: DAMA_DB, user: editor });
        assert.strictEqual(r.created, true);
        const d = await tenantPgEnvs.describe(FRESH);
        assert.deepStrictEqual(d.attached.map(a => a.pgEnv), [DAMA_DB]);
        assert.match(d.attached[0].type, /^site\|.+:dmsenv$/);
        assert.strictEqual((await can({ sourceId: open }, viewer, 'read', FRESH)).allow, true);
    });
    await t('attaching again is a no-op', async () => {
        const r = await tenantPgEnvs.attach({ app: FRESH, pgEnv: DAMA_DB });
        assert.strictEqual(r.already, true);
        assert.strictEqual((await tenantPgEnvs.describe(FRESH)).attached.length, 1);
    });
    await t('an app with no site row is refused', async () => {
        await assert.rejects(tenantPgEnvs.attach({ app: `pgenvauth_nosite_${stamp}`, pgEnv: DAMA_DB }), e => e.status === 409);
    });

    await t('a detach plan names the env row and who holds grants on it, and writes nothing', async () => {
        const row = (await tenantPgEnvs.describe(FRESH)).attached[0];
        await controller.setDataById(row.id, { authPermissions: { groups: { EnvReaders: ['view-source'], public: [] }, users: {} } }, null, FRESH, row.type);
        const plan = await tenantPgEnvs.planDetach({ app: FRESH, pgEnv: DAMA_DB });
        assert.strictEqual(plan.row.id, row.id);
        assert.deepStrictEqual(plan.grants, { groups: ['EnvReaders'], users: 0 });
        assert.strictEqual(plan.blocked, '');
        assert.strictEqual((await tenantPgEnvs.describe(FRESH)).attached.length, 1);
        await assert.rejects(tenantPgEnvs.planDetach({ app: FRESH, pgEnv: 'no_such_pgenv' }), e => e.status === 404);
    });
    await t('detach is refused while a pattern points at the env row or a source sits under it', async () => {
        const row = (await tenantPgEnvs.describe(FRESH)).attached[0];
        const pat = await insert(FRESH, 'site|data:pattern', { name: 'Data', pattern_type: 'datasets', dmsEnvId: row.id });
        await assert.rejects(tenantPgEnvs.detach({ app: FRESH, pgEnv: DAMA_DB }), e => e.status === 409 && /Data/.test(e.message));
        await controller.deleteData(FRESH, 'site|data:pattern', [pat], null);
        const src = await insert(FRESH, `${row.type.split('|')[1].split(':')[0]}|mine:source`, { name: 'mine' });
        await assert.rejects(tenantPgEnvs.detach({ app: FRESH, pgEnv: DAMA_DB }), e => e.status === 409 && /1 internal source/.test(e.message));
        await controller.deleteData(FRESH, `${row.type.split('|')[1].split(':')[0]}|mine:source`, [src], null);
        assert.strictEqual((await tenantPgEnvs.describe(FRESH)).attached.length, 1);
    });
    await t('detach deletes the env row and its ref on the site row; the pgEnv\'s sources are refused again; the site row stays', async () => {
        const row = (await tenantPgEnvs.describe(FRESH)).attached[0];
        const tbl = require('../src/db/table-resolver').resolveTable(FRESH, '', dms.type, splitMode).fullName;
        const site = (await dms.query(`SELECT id FROM ${tbl} WHERE app = $1 AND type = 'site:site'`, [FRESH])).rows[0];
        await controller.setDataById(site.id, { dms_envs: [{ ref: `${FRESH}+dmsenv`, id: row.id }, { ref: `${FRESH}+dmsenv`, id: 999999 }] }, null, FRESH, 'site:site');
        const srcBefore = (await dama.query(`SELECT count(*) AS n FROM ${srcTbl}`)).rows[0].n;
        await tenantPgEnvs.detach({ app: FRESH, pgEnv: DAMA_DB, user: editor });
        assert.deepStrictEqual((await tenantPgEnvs.describe(FRESH)).attached, []);
        assert.match((await can({ sourceId: open }, viewer, 'read', FRESH)).reason, /not attached/);
        const after = (await dms.query(`SELECT type, data FROM ${tbl} WHERE app = $1`, [FRESH])).rows;
        assert.deepStrictEqual(after.map(r => r.type), ['site:site']);
        const d = typeof after[0].data === 'string' ? JSON.parse(after[0].data) : after[0].data;
        assert.deepStrictEqual(d.dms_envs.map(e => +e.id), [999999]);
        assert.strictEqual((await dama.query(`SELECT count(*) AS n FROM ${srcTbl}`)).rows[0].n, srcBefore, 'the pgEnv is not touched');
        await assert.rejects(tenantPgEnvs.detach({ app: FRESH, pgEnv: DAMA_DB }), e => e.status === 404);
    });
    await t('a detached pgEnv can be attached again', async () => {
        assert.strictEqual((await tenantPgEnvs.attach({ app: FRESH, pgEnv: DAMA_DB })).created, true);
        assert.strictEqual((await can({ sourceId: open }, viewer, 'read', FRESH)).allow, true);
    });

    // ---- 2. retiring the mirror --------------------------------------------------------------
    console.log('\nretire-pgenv-mirror.js');
    const R = `pgenvretire_${stamp}`;
    const tbl = require('../src/db/table-resolver').resolveTable(R, '', dms.type, splitMode).fullName;
    const logTbl = dms.type === 'postgres' ? 'dms.change_log' : 'change_log';
    await insert(R, 'site:site', { site_name: 'r' });
    const envId = await insert(R, 'site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB, authPermissions: { groups: { EnvReaders: ['view-source'] }, users: {} } });
    const same = await ext({ users: { 1: ['*'] }, groups: {} });
    const edited = await ext({ users: { 1: ['*'] }, groups: {} });
    const editedView = await view(edited);
    // the rows the mirror made: a source per pgEnv source, a view under it
    const mSame = await insert(R, 'extenv|roads:source', { name: 'roads', pgEnv: DAMA_DB, source_id: same, auth_permissions: { groups: {}, users: { 1: ['*'] } } });
    const mEdited = await insert(R, 'extenv|dams:source', { name: 'dams', pgEnv: DAMA_DB, source_id: edited, auth_permissions: { users: { 1: ['*'] }, groups: { Viewers: ['view-source'] } } });
    const mView = await insert(R, `dams|v${editedView}:view`, { name: 'v', pgEnv: DAMA_DB, view_id: editedView, source_id: edited });
    const mGone = await insert(R, 'extenv|gone:source', { name: 'gone', pgEnv: DAMA_DB, source_id: 987654321, auth_permissions: { groups: { X: ['*'] } } });
    // an INTERNAL source that shares a slug with a mirror, and its view: not the mirror's to take
    const intSource = await insert(R, 'intenv|dams:source', { name: 'dams' });
    const intView = await insert(R, 'dams|v1:view', { name: 'v1' });
    const settings = { get: () => getSettings(DAMA_DB), set: (v) => setSettings(DAMA_DB, v) };
    const saved = await settings.get();
    await settings.set(JSON.stringify({ ...(JSON.parse(saved) || {}), mirror_apps: [R, 'someone_else'] }));
    const ids = async () => (await dms.query(`SELECT id FROM ${tbl} WHERE app = $1 ORDER BY id`, [R])).rows.map(r => +r.id);
    const retire = (o = {}) => retireMirror({ dms, dama, splitMode, app: R, pgEnv: DAMA_DB, settings, ...o });

    await t('sameGrants: key order and an empty groups / users do not make a difference', () => {
        assert.ok(sameGrants({ groups: {}, users: { 1: ['*'] } }, '{"users":{"1":["*"]}}'));
        assert.ok(sameGrants(null, {}));
        assert.ok(!sameGrants({ groups: { A: ['x'] } }, { groups: { A: ['y'] } }));
    });
    await t('a dry run reports and writes nothing', async () => {
        const before = await ids();
        const r = await retire();
        assert.deepStrictEqual([r.sources, r.views, r.envRows], [3, 1, 1]);
        assert.deepStrictEqual(r.differing.map(d => d.source_id), [edited], 'only the edited one; a source gone from the pgEnv has no grants to keep');
        assert.deepStrictEqual(await ids(), before);
        assert.ok(JSON.parse(await settings.get()).mirror_apps.includes(R));
    });
    await t('--apply refuses while grants differ and nobody said which side is right', async () => {
        const before = await ids();
        const r = await retire({ apply: true });
        assert.match(r.refused, /--grants/);
        assert.deepStrictEqual(await ids(), before);
        assert.deepStrictEqual(await column(edited), { users: { 1: ['*'] }, groups: {} });
        assert.ok(JSON.parse(await settings.get()).mirror_apps.includes(R), 'still registered');
    });
    await t('--grants mirror stops when another app\'s mirror holds different grants for the same source', async () => {
        const O = `pgenvretire_o_${stamp}`;
        await insert(O, 'site:site', {});
        const oRow = await insert(O, 'extenv|dams:source', { name: 'dams', pgEnv: DAMA_DB, source_id: edited, auth_permissions: { groups: { Others: ['*'] } } });
        await settings.set(JSON.stringify({ ...(JSON.parse(await settings.get()) || {}), mirror_apps: [R, O] }));
        const r = await retire({ apply: true, grants: 'mirror' });
        assert.match(r.refused, /two apps/);
        assert.strictEqual(r.conflicts[0].app, O);
        assert.deepStrictEqual(await column(edited), { users: { 1: ['*'] }, groups: {} }, 'nothing written');
        const oTbl = require('../src/db/table-resolver').resolveTable(O, '', dms.type, splitMode).fullName;
        await dms.query(`DELETE FROM ${oTbl} WHERE id = $1`, [oRow]);
        await settings.set(JSON.stringify({ ...(JSON.parse(await settings.get()) || {}), mirror_apps: [R, 'someone_else'] }));
    });
    await t('--grants mirror copies the grants back, unregisters the app, deletes the mirror rows and nothing else', async () => {
        const r = await retire({ apply: true, grants: 'mirror' });
        assert.deepStrictEqual([r.refused, r.copied, r.deleted, r.left, r.unregistered], [null, 1, 4, 0, true]);
        assert.deepStrictEqual(await column(edited), { users: { 1: ['*'] }, groups: { Viewers: ['view-source'] } });
        assert.deepStrictEqual(await column(same), { users: { 1: ['*'] }, groups: {} }, 'an equal one is not rewritten');
        const left = await ids();
        for (const gone of [mSame, mEdited, mView, mGone]) assert.ok(!left.includes(gone), `mirror row ${gone} is gone`);
        assert.ok(left.includes(envId), 'the env row is kept');
        assert.ok(left.includes(intSource) && left.includes(intView), 'an internal source sharing a slug, and its view, are untouched');
        assert.deepStrictEqual(JSON.parse(await settings.get()).mirror_apps, ['someone_else']);
    });
    await t('each deleted row has a D entry in the change log', async () => {
        const { rows } = await dms.query(`SELECT item_id FROM ${logTbl} WHERE app = $1 AND action = 'D'`, [R]);
        assert.deepStrictEqual(rows.map(r => +r.item_id).sort((a, b) => a - b), [mSame, mEdited, mView, mGone].sort((a, b) => a - b));
    });
    await t('the copied grants are what auth reads now', async () => {
        AUTH.clearSnapshots();
        assert.strictEqual((await AUTH.authorize({ env: DAMA_DB, viewId: editedView, verb: 'read', user: viewer, app: R })).allow, true);
        assert.strictEqual((await AUTH.authorize({ env: DAMA_DB, sourceId: edited, verb: 'read', user: anon, app: R })).allow, false);
    });
    await t('a second run finds nothing', async () => {
        const r = await retire({ apply: true });
        assert.deepStrictEqual([r.sources, r.views, r.deleted, r.copied, r.unregistered, r.refused], [0, 0, 0, 0, false, null]);
    });
    await t('--grants pgenv keeps the column and drops the mirror\'s grants', async () => {
        const src = await ext({ users: { 9: ['*'] } });
        const row = await insert(R, 'extenv|keep:source', { name: 'keep', pgEnv: DAMA_DB, source_id: src, auth_permissions: { groups: { Stale: ['*'] } } });
        const r = await retire({ apply: true, grants: 'pgenv' });
        assert.deepStrictEqual([r.differing.length, r.copied, r.deleted], [1, 0, 1]);
        assert.deepStrictEqual(await column(src), { users: { 9: ['*'] } });
        assert.ok(!(await ids()).includes(row));
    });

    // cleanup
    await settings.set(saved);
    if (made.views.length) await dama.query(`DELETE FROM ${viewTbl} WHERE view_id IN (${made.views.join(',')})`);
    await dama.query(`DELETE FROM ${srcTbl} WHERE source_id IN (${made.sources.join(',')})`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
