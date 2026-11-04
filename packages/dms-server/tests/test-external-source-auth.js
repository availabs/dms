/**
 * The EXTERNAL branch of `mergedAuthForSource` — the path no suite covered.
 *
 * WHY THIS EXISTS. On 2026-11-02 an edit meant to add `require('./sourceAncestry')` to
 * `rowSourceAuth.js` targeted a path that no longer existed, so the replace matched nothing and
 * `envRowForPgEnv` was left undefined. Every suite stayed green: the UDA suite builds INTERNAL
 * fixtures, and `test-uda-auth`'s external cases run through kind auth. The external branch would
 * have thrown `ReferenceError` on first use in production and nothing would have said so.
 *
 * A gap a whole slice of work can hide in is worth a file of its own.
 *
 * What it pins (row-auth-uda-unify-api.md, Phase 2):
 *   - an external source resolves the vocabulary its ENV declares, not one a request names;
 *   - the env contributes a declaration and NO grants;
 *   - the source's own `auth_permissions` are the whole answer;
 *   - no pattern lends anything, however the request is shaped.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-external-source-auth.js
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB;
process.env.DMS_AUTH_IMPL = 'row';
const assert = require('assert');
const { createTestGraph } = require('./graph');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n')}`); }
};
const section = (name) => console.log(`\n${name}`);

const VOCAB = {
    descendants: [
        { value: 'view-source',   implies: ['read'] },
        { value: 'update-source', implies: ['read', 'edit'] },
        { value: 'delete-source', implies: ['read', 'delete'] },
    ],
};

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    const db = getDb(DMS_DB); await awaitReady();

    const APP = `extsrc_${Date.now()}`;
    const PG_ENV = `extpg_${Date.now()}`;          // no '+', so isDmsEnv() is false
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const graph = createTestGraph(DMS_DB, { user: admin });
    process.env.DMS_AUTH_MODE = 'legacy';      // the READ gate; this is about uda's own

    const create = async (type, data) => {
        const res = await graph.callAsync(['dms', 'data', 'create'], [APP, type, data]);
        return String(Object.keys(res.jsonGraph.dms.data.byId)[0]);
    };

    await create('prod:site', { name: 'prod' });

    // The env row an external source descends from. `ensure-pgenv-rows.js` creates this in a real
    // app; here it is made directly. It DECLARES and grants nothing — the whole point.
    await create('prod|extenv:dmsenv', { name: PG_ENV, pgEnv: PG_ENV, sources: [], authVocabulary: VOCAB });

    // The external store. `sourcesTable()` is bare `sources` on sqlite.
    await db.promise(`CREATE TABLE IF NOT EXISTS sources (source_id INTEGER PRIMARY KEY, auth_permissions TEXT)`);
    await db.promise(`DELETE FROM sources`);
    await db.promise(`INSERT INTO sources (source_id, auth_permissions) VALUES (1, $1), (2, $2)`,
        [JSON.stringify({ groups: { Editors: ['update-source'] } }), JSON.stringify({})]);

    const editor   = { authed: true, id: 9,  email: 'e@x', groups: ['Editors'] };
    const stranger = { authed: true, id: 10, email: 's@x', groups: [] };

    const { decideSourceRow, mergedAuthForSource } =
        require('../src/routes/auth/rowAuth/rowSourceAuth');
    require('../src/routes/auth/rowAuth/sourceAncestry').clearEnvRowCache();

    // `db` is passed, so getDb(env) is never called — the env is a NAME here, as it is in prod.
    const may = async (user, perms, sourceId = 1, extra = {}) =>
        (await decideSourceRow({ db, env: PG_ENV, sourceId, user, app: APP,
                                 reqPermissions: [].concat(perms), ...extra })).allow;

    section('1. the branch RUNS — the regression this file exists for');
    await t('mergedAuthForSource returns a verdict instead of throwing', async () => {
        const got = await mergedAuthForSource({ db, env: PG_ENV, sourceId: 1, app: APP });
        assert.ok(got.ok, got.reason);
        assert.ok(got.merged, 'expected a merged chain');
    });

    section('2. the ENV declares the vocabulary — no request names a pattern');
    await t('a named verb expands and the grantee may update', async () =>
        assert.strictEqual(await may(editor, 'update-source'), true));
    await t('…and someone outside the group may not', async () =>
        assert.strictEqual(await may(stranger, 'update-source'), false));
    await t('a verb the grant does not imply is refused', async () =>
        assert.strictEqual(await may(editor, 'delete-source'), false));
    await t('reqPermissions is ANY-of', async () =>
        assert.strictEqual(await may(editor, ['delete-source', 'update-source']), true));

    section('3. no pattern lends anything, however the request is shaped');
    await t('naming a pattern in the request changes nothing', async () =>
        assert.strictEqual(
            await may(stranger, 'update-source', 1, { patternRef: { app: APP, patternId: 999 } }), false));
    // WITHOUT AN APP THE ENV ROW IS UNREACHABLE, so nothing declares and nothing expands. What
    // survives is literal string equality: the grant says `update-source`, the request asks for
    // `update-source`, so it passes BY NAME (`holdsPermission`'s capability path).
    //
    // This pair is the proof the shim is gone rather than merely unreferenced. `legacyVerbs.js`
    // (deleted 2026-11-03) made `update-source` imply read + edit from a hardcoded table, so a
    // request for `view-source` rode along on an `update-source` grant. Now it does not: an
    // undeclared verb confers nothing but itself.
    await t('without an app, the exact verb still passes by name', async () => {
        const d = await decideSourceRow({ db, env: PG_ENV, sourceId: 1, user: editor,
                                          reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, true);
    });
    await t('…but no OTHER verb rides along on it — the shim is gone', async () => {
        const d = await decideSourceRow({ db, env: PG_ENV, sourceId: 1, user: editor,
                                          reqPermissions: ['view-source'] });
        assert.strictEqual(d.allow, false);
    });

    section('4. the usual defaults still hold');
    await t('an app admin passes regardless', async () =>
        assert.strictEqual(await may(admin, 'update-source'), true));
    await t('a source stating nothing refuses a write', async () =>
        assert.strictEqual(await may(editor, 'update-source', 2), false));
    await t('a source that does not exist is refused, not thrown on', async () => {
        const d = await decideSourceRow({ db, env: PG_ENV, sourceId: 404, user: editor, app: APP,
                                          reqPermissions: ['update-source'] });
        assert.strictEqual(d.allow, false);
        assert.match(d.reason, /not found/i);
    });

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
