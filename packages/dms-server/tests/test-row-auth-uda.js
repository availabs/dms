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
process.env.DMS_UDA_GATE = 'row';
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
    process.env.DMS_ROW_AUTH_MODE = 'legacy';   // the READ gate; this test is about uda's own

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
    const envId = await create('prod|test_env:dmsenv', { name: 'test_env', sources: [srcRef] });

    // A datasets pattern reaches its sources THROUGH its env (`dmsEnvId` → the env's `sources`).
    const pattern = await create('prod|datasets:pattern', {
        pattern_type: 'datasets', dmsEnvId: envId, authVocabulary: VOCAB,
        authPermissions: { groups: { Editors: ['update-source'] } },
    });

    const ENV = `${APP}+test_env`;
    const editor   = { authed: true, id: 9,  email: 'e@x', groups: ['Editors'] };
    const reviewer = { authed: true, id: 11, email: 'r@x', groups: ['Reviewers'] };
    const stranger = { authed: true, id: 10, email: 's@x', groups: [] };
    const { decideSourceRow, mergedAuthForSource, udaGate } = require('../src/routes/auth/rowAuth/rowSourceAuth');
    const may = async (user, perms) =>
        (await decideSourceRow({ env: ENV, sourceId, user, reqPermissions: [].concat(perms) })).allow;

    section('1. the chain: [patterns that LIST the source, the source itself]');
    await t('udaGate is `row` for this run', () => assert.strictEqual(udaGate(), 'row'));
    await t('a pattern-level grant reaches a source its env lists', async () =>
        assert.strictEqual(await may(editor, 'update-source'), true));
    await t('…and does not reach someone outside the group', async () =>
        assert.strictEqual(await may(stranger, 'update-source'), false));
    await t('a verb the grant does not imply is refused', async () =>
        assert.strictEqual(await may(editor, 'delete-source'), false));
    await t('reqPermissions is ANY-of', async () =>
        assert.strictEqual(await may(editor, ['delete-source', 'update-source']), true));
    await t('an app admin passes regardless', async () =>
        assert.strictEqual(await may(admin, 'delete-source'), true));
    await t('nothing required, nothing checked', async () =>
        assert.strictEqual(await may(stranger, []), true));

    section('2. AN ENV MAY HAVE SEVERAL PATTERNS — their grants UNION');
    // Owner, 2026-10-29: "I think an env can have multiple parents." Measured on `rowauth-test`:
    // `datasets` #1499610 and `qa` #2860547 both name env 1676363. This is why the chain is built
    // from the owning patterns rather than walked from a `parent_id` — one column cannot hold two
    // parents, and a single-parent walk would silently drop every grant but one.
    const second = await create('prod|datasets2:pattern', {
        pattern_type: 'datasets', dmsEnvId: envId,
        authPermissions: { groups: { Reviewers: ['view-source'] } },
    });
    await t('a grant on the SECOND pattern also reaches the source', async () =>
        assert.strictEqual(await may(reviewer, 'view-source'), true));
    await t('…while the first pattern\'s grant still does', async () =>
        assert.strictEqual(await may(editor, 'update-source'), true));
    await t('neither pattern leaks the other\'s verbs', async () =>
        assert.strictEqual(await may(reviewer, 'update-source'), false));
    await t('both patterns appear in one merged object, not one winner', async () => {
        const got = await mergedAuthForSource({ env: ENV, sourceId, subdomain: '' });
        assert.ok(got.ok, got.reason);
        assert.ok(got.merged.groups.Editors, 'Editors from pattern 1');
        assert.ok(got.merged.groups.Reviewers, 'Reviewers from pattern 2');
    });

    section('3. the source\'s own grants are the second level — and they may only NARROW');
    // Merge rule 3: a child may only narrow where an ancestor has spoken for that principal. The
    // patterns gave Reviewers `view-source` (read), so the SOURCE cannot hand them `update-source`
    // (read+edit) — the extra verb is clamped away. Kind auth has no clamp here
    // (`mergeAuthPermissions` is a per-principal override), so this is a real semantic difference
    // and it is pinned in tests/fixtures/row-auth-uda-expected-diff.json, not smoothed over.
    await edit(sourceId, { auth_permissions: { groups: { Reviewers: ['update-source'] } } }, 'test_env|source');
    await t('a source cannot WIDEN what its patterns gave a principal', async () =>
        assert.strictEqual(await may(reviewer, 'update-source'), false));
    await t('…and what the patterns did give still holds', async () =>
        assert.strictEqual(await may(reviewer, 'view-source'), true));
    await t('a source CAN narrow — an empty entry revokes the inherited grant', async () => {
        await edit(sourceId, { auth_permissions: { groups: { Editors: [] } } }, 'test_env|source');
        assert.strictEqual(await may(editor, 'update-source'), false);
    });

    section('4. a source no pattern lists is refused, not allowed');
    const loose = await create('test_env|orphan:source', { name: 'orphan' });
    await t('…and says why', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId: loose, user: admin, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false);
        assert.match(d.reason, /no datasets pattern/);
    });
    await t('a source that does not exist is refused, not thrown on', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId: 99999999, user: admin, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false);
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
    const holding = (perm, req) => holdsAny(grantOf(perm), capUser, APP, [req]).allow;

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
