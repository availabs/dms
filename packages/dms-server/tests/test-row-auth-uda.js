/**
 * UDA on row auth — routes/uda/rowSourceAuth.js, end to end.
 *
 * Task: planning/tasks/current/row-auth-uda.md.
 *
 * The differential (test-row-auth-uda-diff.js) runs against an UNMIGRATED sqlite fixture, so it
 * cannot exercise the thing task 6 actually turns on: `parent_id` carrying the `pattern → dmsEnv`
 * hop that the type path does not. This does, on a migrated table.
 *
 * What is at stake: an internal source's type path runs `source → dmsEnv → site` — a datasets
 * pattern is a SIBLING of the env, pointing at it with a scalar `data.dmsEnvId`. Without that hop
 * every pattern-level grant is invisible to its own sources, which fails closed and is still wrong.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-row-auth-uda.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_IMPL = 'row';
const { authImpl } = require('../src/routes/auth/settings');
const assert = require('assert');
const { createTestGraph } = require('./graph');
const { resolveTable } = require('../src/db/table-resolver');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};
const section = (name) => console.log(`\n${name}`);

const VOCAB = {
    self: [{ value: 'edit-pattern', implies: ['read', 'edit'] }],
    descendants: [
        { value: 'view-source',   implies: ['read'] },
        { value: 'update-source', implies: ['read', 'edit'] },
        { value: 'delete-source', implies: ['read', 'delete'] },
    ],
};

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    const db = getDb(DMS_DB); await awaitReady();

    const APP = `udarow_${Date.now()}`;
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const graph = createTestGraph(DMS_DB, { user: admin });
    process.env.DMS_AUTH_MODE = 'legacy';   // the READ gate; this test is about uda's own

    const create = async (type, data) => {
        const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
        return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
    };
    const edit = (id, data, type) => graph.callAsync(['dms', 'data', 'edit'], [APP, id, data, type]);

    await create('prod:site', { name: 'prod' });
    const T = resolveTable(APP, '', 'sqlite', 'per-app');
    for (const col of ['auth TEXT', 'parent_id BIGINT']) {
        try { await db.promise(`ALTER TABLE ${T.fullName} ADD COLUMN ${col}`); }
        catch (e) { if (!/duplicate column/i.test(e.message)) console.log('[alter]', e.message); }
    }
    require('../src/routes/auth/rowAuth/rowAuthCaps')._resetCaps();

    const sourceId = await create('test_env|roads:source', { name: 'roads' });
    const srcRef = { id: +sourceId, ref: `${APP}+test_env|source` };
    // THE ENV DECLARES. Under row-auth-uda-unify-api.md the env is a source's ancestor and the row
    // that carries the vocabulary; it states no grants of its own (`permissionDomain.self` is empty
    // in admin.format.js), so it contributes a declaration and nothing else.
    const envId = await create('prod|test_env:dmsenv',
        { name: 'test_env', sources: [srcRef], authVocabulary: VOCAB });

    // A datasets pattern reaches its sources THROUGH its env (`dmsEnvId` → the env's `sources`).
    const pattern = await create('prod|datasets:pattern', {
        pattern_type: 'datasets', dmsEnvId: envId, authVocabulary: VOCAB,
        authPermissions: { groups: { Editors: ['update-source'] } },
    });

    const ENV = `${APP}+test_env`;
    const editor   = { authed: true, id: 9,  email: 'e@x', groups: ['Editors'] };
    const reviewer = { authed: true, id: 11, email: 'r@x', groups: ['Reviewers'] };
    const stranger = { authed: true, id: 10, email: 's@x', groups: [] };
    const { decideSourceRow, mergedAuthForSource, } = require('../src/routes/auth/rowAuth/rowSourceAuth');
    const may = async (user, perms) =>
        (await decideSourceRow({ env: ENV, sourceId, user, reqPermissions: [].concat(perms) })).allow;

    // ---------------------------------------------------------------------------------------
    // REWRITTEN 2026-11-02 (row-auth-uda-unify-api.md, Slice D).
    //
    // Sections 1-4 used to assert that a datasets PATTERN's grants reach the sources its env
    // lists, that several patterns' grants UNION, and that a source may only narrow what they
    // gave. All of that is gone, and deliberately: a datasets pattern is not a source's ancestor.
    // A source's type is `{env}|{name}:source` — the env is above it and the pattern is nowhere in
    // the path, which is why the old code had to reverse-look-up through `pattern.dmsEnvId` to
    // manufacture the relationship. The env now declares the vocabulary and grants nothing, so a
    // source's OWN grants are the whole answer.
    //
    // This is the behaviour change the task costs, stated here rather than discovered later:
    // every grant that reached a source through its pattern stops reaching it, which is what makes
    // the grant sweep (row-auth-uda.md) mandatory rather than advisable.
    // ---------------------------------------------------------------------------------------

    section('1. a source is judged on ITS OWN grants, through the vocabulary its env declares');
    await t('row auth is the selected implementation for this run', () => assert.strictEqual(authImpl(), 'row'));
    await t('the pattern grants Editors update-source — and it does NOT reach the source', async () =>
        assert.strictEqual(await may(editor, 'update-source'), false));
    await t('an app admin passes regardless — the bootstrap escape is unchanged', async () =>
        assert.strictEqual(await may(admin, 'update-source'), true));
    await t('nothing required, nothing checked', async () =>
        assert.strictEqual((await decideSourceRow({ env: ENV, sourceId, user: stranger, reqPermissions: [] })).allow, true));

    section('2. grant the SOURCE itself, and the verb resolves through the env vocabulary');
    await edit(sourceId, { auth_permissions: { groups: { Editors: ['update-source'] } } }, 'test_env|roads:source');
    require('../src/routes/auth/rowAuth/sourceAncestry').clearEnvRowCache();
    await t('the grantee may now update', async () =>
        assert.strictEqual(await may(editor, 'update-source'), true));
    await t('…and someone outside the group may not', async () =>
        assert.strictEqual(await may(stranger, 'update-source'), false));
    await t('a verb the grant does not imply is refused', async () =>
        assert.strictEqual(await may(editor, 'delete-source'), false));
    await t('reqPermissions is ANY-of', async () =>
        assert.strictEqual(await may(editor, ['delete-source', 'update-source']), true));

    section('3. the env contributes a DECLARATION and no grants');
    await t('the merged chain is one level — the source\'s own', async () => {
        const got = await mergedAuthForSource({ env: ENV, sourceId });
        assert.ok(got.ok, got.reason);
        assert.deepStrictEqual(Object.keys(got.merged.groups || {}), ['Editors']);
    });
    await t('granting the ENV confers nothing on the source beneath it', async () => {
        await edit(envId, { authPermissions: { groups: { Reviewers: ['update-source'] } } }, 'prod|test_env:dmsenv');
        require('../src/routes/auth/rowAuth/sourceAncestry').clearEnvRowCache();
        assert.strictEqual(await may(reviewer, 'update-source'), false);
    });

    section('4. a source that cannot be found is refused, not thrown on');
    await t('a source that does not exist is refused, not thrown on', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId: 999999, user: editor, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false);
        assert.match(d.reason, /not found/i);
    });

    section('5. a capability is checked BY NAME, not as a flavour of edit (Phase 4b)');
    // THE SHIPPED DEFECT. `verbsFor` ended `return named.length ? named : ['edit']`, so a
    // permission declaring `implies: []` — download-source, manage-downloads, view-source-api —
    // was silently judged as a structural EDIT. Measured before the fix, against this same
    // `holdsAny`:
    //     download-source only   may download?  false
    //     update-source  only    may download?  true
    // Exactly backwards. Owner's rule (2026-10-30): "read in the system needs to be different from
    // download — users need to be able to access a dataset in the system but not be able to
    // download it." Both directions are pinned here because fixing one and breaking the other is
    // the easy mistake. See permission-domain-single-source.md Phase 4(b).
    const { holdsAny } = require('../src/routes/auth/rowAuth/rowSourceAuth');
    const grantOf = (perm) => ({ groups: { Cap: [perm, ...(CAP_VOCAB[perm] || [])] } });
    const CAP_VOCAB = {                       // what the vocabulary says each verb confers
        'download-source': [],                // a capability: no row access
        'update-source': ['read', 'edit'],
    };
    const capUser = { authed: true, id: 9, email: 'cap@x', groups: ['Cap'] };
    // The REQUEST is read in the same vocabulary the GRANT was expanded with. Passing it is not a
    // formality: with no declaration nothing translates and every verb is matched by name, which is
    // the correct answer for a chain that declares nothing (`legacyVerbs.js` deleted 2026-11-03).
    const { impliesMaps } = require('../src/routes/auth/rowAuth/authVocabulary');
    const CAP_MAPS = impliesMaps({ descendants: [
        { value: 'download-source', implies: [] },
        { value: 'view-source', implies: ['read'] },
        ...Object.entries(CAP_VOCAB).map(([value, implies]) => ({ value, implies })),
    ] });
    const holding = (perm, req) => holdsAny(grantOf(perm), capUser, APP, [req], CAP_MAPS).allow;

    await t('download-source alone DOWNLOADS', () => {
        assert.strictEqual(holding('download-source', 'download-source'), true);
    });
    await t('download-source alone does NOT read', () => {
        assert.strictEqual(holding('download-source', 'view-source'), false);
    });
    await t('update-source alone READS', () => {
        assert.strictEqual(holding('update-source', 'view-source'), true);
    });
    await t('update-source alone does NOT download', () => {
        assert.strictEqual(holding('update-source', 'download-source'), false);
    });
    await t('a capability is not reachable through a structural edit grant', () => {
        const edits = { groups: { Cap: ['read', 'edit'] } };
        assert.strictEqual(holdsAny(edits, capUser, APP, ['download-source']).allow, false);
    });
    await t('`*` still means everything, capabilities included', () => {
        const all = { groups: { Cap: ['*'] } };
        assert.strictEqual(holdsAny(all, capUser, APP, ['download-source']).allow, true);
        assert.strictEqual(holdsAny(all, capUser, APP, ['view-source']).allow, true);
    });

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
