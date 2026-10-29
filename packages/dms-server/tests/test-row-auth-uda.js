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

// The declaration under test — `packages/dms/src/patterns/datasets/datasets.childRefs.js`.
const DATASETS_CHILD_REFS = { pattern: { dmsEnvId: 'dmsenv' } };
const VOCAB = {
    self: [{ value: 'edit-pattern', implies: ['read', 'edit'] }],
    descendants: [
        { value: 'view-source',   implies: ['read'] },
        { value: 'update-source', implies: ['read', 'edit'] },
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
    require('../src/routes/dms/rowAuthCaps')._resetCaps();

    const parentOf = async (id) =>
        String((await db.promise(`SELECT parent_id FROM ${T.fullName} WHERE id = $1`, [id]))[0]?.parent_id ?? '');

    // A datasets pattern that grants `update-source` to Editors.
    const pattern = await create('prod|datasets:pattern', {
        pattern_type: 'datasets',
        childRefs: DATASETS_CHILD_REFS,
        authVocabulary: VOCAB,
        authPermissions: { groups: { Editors: ['update-source'] } },
    });
    // …then MIGRATED, because that is what this feature targets. Once the `auth` column exists the
    // resolver's projection stops selecting `data` (production rows average ~10KB of jsonb), so a
    // row whose grants and vocabulary are still in `data` reads as stating nothing. This is what
    // `migrate-row-auth.js` pass 2 and `--sync-vocabulary` write; a half-migrated table — column
    // added, nothing backfilled — is the one state where everything silently resolves to empty.
    await db.promise(`UPDATE ${T.fullName} SET auth = $1 WHERE id = $2`,
        [JSON.stringify({ vocabulary: VOCAB, childRefs: DATASETS_CHILD_REFS,
                          groups: { Editors: ['update-source'] } }), pattern]);
    const envId = await create('prod|test_env:dmsenv', { name: 'test_env', sources: [] });
    const sourceId = await create('test_env|roads:source', { name: 'roads' });

    const ENV = `${APP}+test_env`;
    const editor = { authed: true, id: 9, email: 'e@x', groups: ['Editors'] };
    const stranger = { authed: true, id: 10, email: 's@x', groups: [] };
    const { decideSourceRow, udaGate } = require('../src/routes/uda/rowSourceAuth');

    section('1. the declaration — a datasets pattern OWNS its dmsEnv');
    await t('udaGate is `row` for this run', () => assert.strictEqual(udaGate(), 'row'));
    await t('the env has no parent before the pattern names it', async () =>
        assert.strictEqual(await parentOf(envId), ''));

    await edit(pattern, { dmsEnvId: envId }, 'prod|datasets:pattern');
    await t('saving the pattern stamps parent_id on its dmsEnv', async () =>
        assert.strictEqual(await parentOf(envId), pattern,
            'childRefs { pattern: { dmsEnvId: "dmsenv" } } must reach a `{site}|{name}:dmsenv` row'));

    section('2. the chain the hop unlocks');
    await t('a pattern-level update-source grant reaches an internal SOURCE', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: editor, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, true, d.reason);
    });
    await t('…and does not reach someone outside the group', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: stranger, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false);
    });
    await t('a verb the grant does not imply is refused', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: editor, reqPermissions: ['delete-source'] });
        assert.strictEqual(d.allow, false);
    });
    await t('reqPermissions is ANY-of', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: editor, reqPermissions: ['delete-source', 'update-source'] });
        assert.strictEqual(d.allow, true, d.reason);
    });
    await t('an app admin passes regardless', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: admin, reqPermissions: ['delete-source'] });
        assert.strictEqual(d.allow, true, d.reason);
    });
    await t('a source that does not exist is refused, not thrown on', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId: 99999999, user: admin, reqPermissions: ['update-source'] });
        assert.strictEqual(typeof d.allow, 'boolean');
    });
    await t('nothing required, nothing checked', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: stranger, reqPermissions: [] });
        assert.strictEqual(d.allow, true);
    });

    section('3. the hop is what does it — remove it and the grant disappears');
    await db.promise(`UPDATE ${T.fullName} SET parent_id = NULL WHERE id = $1`, [envId]);
    await t('with the env unparented, the pattern grant no longer reaches the source', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: editor, reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false, 'the type path runs source -> dmsEnv -> site, skipping the pattern');
    });
    await t('…which fails CLOSED', async () => {
        const d = await decideSourceRow({ env: ENV, sourceId, user: editor, reqPermissions: ['update-source'] });
        assert.match(d.reason, /missing/);
    });

    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
