/**
 * Per-source permission enforcement (datasets-permissions-model · P4, permissions-server-source-auth-core).
 * Part 1: pure-logic matrix for mergeAuthPermissions + the STRICT server isUserAuthed.
 * Part 2: the resolver against real sqlite DBs (a DMS db and a DaMa pgEnv): fail-closed reads,
 *         internal sources and their env's pattern, client-named patterns, ${app} Admin, modes,
 *         token-only user id.
 * Run: node tests/test-source-auth.js   (DMS_TEST_DB / DAMA_TEST_DB pick the configs; local sqlite by default)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB; // the resolver reads pattern + internal rows from DMS_DB_ENV
const assert = require('assert');
const { mergeAuthPermissions, isUserAuthed } = require('../src/routes/uda/sourceAuth');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };

const anon = {};                                              // not logged in (server adds 'public')
const editor = { authed: true, id: 7, groups: ['NYSDOT'] };
const avail = { authed: true, id: 1, groups: ['AVAIL'] };
const stranger = { authed: true, id: 99, groups: ['Rando'] };

// pattern ⊕ source effective check
const can = (reqPermissions, { user = {}, pattern = {}, source }) =>
    isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(pattern, source) });

console.log('mergeAuthPermissions (pattern ⊕ source):');
const pat = { groups: { public: ['view-source'], NYSDOT: ['view-source', 'download-source'] }, users: {} };
t('no override → base', () => assert.deepStrictEqual(mergeAuthPermissions(pat, undefined), pat));
t('source ADDS a group', () => assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { AVAIL: ['*'] } }).groups.AVAIL, ['*']));
t('source REPLACES a group', () => assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: ['*'] } }).groups.NYSDOT, ['*']));
t('source [] DISABLES a group', () => assert.strictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: [] } }).groups.NYSDOT, undefined));
t('user [] disables / non-empty sets', () => {
    const base = { groups: {}, users: { 5: ['*'] } };
    assert.strictEqual(mergeAuthPermissions(base, { users: { 5: [] } }).users[5], undefined);
    assert.deepStrictEqual(mergeAuthPermissions(base, { users: { 9: ['view-source'] } }).users[9], ['view-source']);
});

console.log('isUserAuthed — STRICT server semantics:');
t('no required perms → allow', () => assert.strictEqual(isUserAuthed({ user: anon, reqPermissions: [], authPermissions: {} }), true));
t('empty/unconfigured → DENY (no "unconfigured ⇒ allow")', () => {
    assert.strictEqual(isUserAuthed({ user: anon, reqPermissions: ['view-source'], authPermissions: {} }), false);
    assert.strictEqual(isUserAuthed({ user: avail, reqPermissions: ['view-source'], authPermissions: { groups: {}, users: {} } }), false);
});
t('logged-in + only-public → DENY beyond public (no client escape hatch)', () => {
    const ap = { groups: { public: ['view-source'] }, users: {} };
    assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['update-source'], authPermissions: ap }), false);
    assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['view-source'], authPermissions: ap }), true);
});
t('* grants everything', () => assert.strictEqual(isUserAuthed({ user: avail, reqPermissions: ['delete-source'], authPermissions: { groups: { AVAIL: ['*'] } } }), true));
t('user-specific grant', () => assert.strictEqual(isUserAuthed({ user: editor, reqPermissions: ['update-source'], authPermissions: { groups: {}, users: { 7: ['update-source'] } } }), true));

console.log('pattern ⊕ source matrix (migrated source: AVAIL/NYSDOT admin, public capped):');
const pattern = { groups: { public: ['view-source'] }, users: {} };
const source = {
    groups: {
        AVAIL: ['*'],
        NYSDOT: ['view-source', 'download-source', 'update-source', 'create-view', 'manage-downloads'],
        public: ['view-source', 'download-source'],
    },
    users: { 1: ['*'] },
};
t('anon: view✓ download✓ update✗ delete✗', () => {
    assert.strictEqual(can(['view-source'], { user: anon, pattern, source }), true);
    assert.strictEqual(can(['download-source'], { user: anon, pattern, source }), true);
    assert.strictEqual(can(['update-source'], { user: anon, pattern, source }), false);
    assert.strictEqual(can(['delete-source'], { user: anon, pattern, source }), false);
});
t('editor (NYSDOT): update✓ create-view✓ delete✗', () => {
    assert.strictEqual(can(['update-source'], { user: editor, pattern, source }), true);
    assert.strictEqual(can(['create-view'], { user: editor, pattern, source }), true);
    assert.strictEqual(can(['delete-source'], { user: editor, pattern, source }), false);
});
t('AVAIL (*) + user-1 (*): everything✓', () => {
    assert.strictEqual(can(['delete-source'], { user: avail, pattern, source }), true);
    assert.strictEqual(can(['edit-source-permissions'], { user: { authed: true, id: 1, groups: [] }, pattern, source }), true);
});
t('stranger: only public perms (view/download), not update', () => {
    assert.strictEqual(can(['view-source'], { user: stranger, pattern, source }), true);
    assert.strictEqual(can(['update-source'], { user: stranger, pattern, source }), false);
});
t('source [] revokes an inherited pattern grant', () => {
    const p = { groups: { public: ['view-source'], NYSDOT: ['update-source'] }, users: {} };
    const s = { groups: { NYSDOT: [] }, users: {} };
    assert.strictEqual(can(['update-source'], { user: editor, pattern: p, source: s }), false);
});
t('private source (public:[]) hides from anon', () => {
    const s = { groups: { public: [], AVAIL: ['*'] }, users: {} };
    assert.strictEqual(can(['view-source'], { user: anon, pattern, source: s }), false);
    assert.strictEqual(can(['view-source'], { user: avail, pattern, source: s }), true);
});

// ------------------------------------------------------------------------------------------------
// Part 2: resolver against real sqlite DBs
// ------------------------------------------------------------------------------------------------
const {
    decideSource, decidePattern, isUserAuthedForSource, isUserAuthedForPattern,
    requestUserId, requestUserIdWarnBody, requestPatternRef,
} = require('../src/routes/uda/sourceAuth');
const { dmsMainTable } = require('../src/routes/uda/utils');

const ta = async (name, fn) => { try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); } };

async function dbTests() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB); getDb(DAMA_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const dama = getDb(DAMA_DB);

    const APP = `srcauth_${Date.now()}`;
    const OTHER_APP = `${APP}_other`;
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    const otherTbl = await dmsMainTable(dms, OTHER_APP, 'per-app');
    const insert = async (table, app, type, data) =>
        (await dms.query(`INSERT INTO ${table} (app, type, data) VALUES ($1, $2, $3) RETURNING id`, [app, type, data])).rows[0].id;

    // DMS side: dmsEnv-linked datasets pattern, a legacy pattern with sources on itself, a page pattern.
    const grantedSrc = await insert(tbl, APP, 'env1|roads:source', { name: 'roads', auth_permissions: { groups: { Counties: ['edit-source-data'] } } });
    const bareSrc = await insert(tbl, APP, 'env1|bridges:source', { name: 'bridges' });
    const revokedSrc = await insert(tbl, APP, 'env1|dams:source', { name: 'dams', auth_permissions: { groups: { DHSES: [] } } });
    const strayInternal = await insert(tbl, APP, 'env9|stray:source', { name: 'stray' });
    const legacySrc = await insert(tbl, APP, 'old|hazards:source', { name: 'hazards' });
    const envRow = await insert(tbl, APP, 'site|env1:dmsenv', { sources: [{ id: grantedSrc }, { id: bareSrc }, { id: revokedSrc }] });
    const dsPattern = await insert(tbl, APP, 'site|ds:pattern', {
        pattern_type: 'datasets', dmsEnvId: envRow,
        authPermissions: { '*': JSON.stringify({ groups: { DHSES: ['update-source', 'create-source'] }, users: { 42: ['delete-source'] } }) },
    });
    await insert(tbl, APP, 'site|legacy_ds:pattern', {
        pattern_type: 'datasets', sources: [{ id: legacySrc }],
        authPermissions: JSON.stringify({ groups: { BILD: ['update-source'] }, users: {} }), // flat legacy shape
    });
    const pagePattern = await insert(tbl, APP, 'site|docs:pattern', { pattern_type: 'page', authPermissions: { '*': { groups: { Rando: ['*'] } } } });
    const otherDs = await insert(otherTbl, OTHER_APP, 'site|ds:pattern', { pattern_type: 'datasets', authPermissions: { groups: { Rando: ['*'] } } });

    // DaMa side.
    const ext = async (ap) => (await dama.query(`INSERT INTO ${dama.type === 'postgres' ? 'data_manager.sources' : 'sources'} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`srcauth_${Date.now()}_${Math.random()}`, JSON.stringify(ap)])).rows[0].source_id;
    const extGranted = await ext({ groups: { AVAIL: ['*'], public: [] }, users: {} });
    const extEmpty = await ext({});

    const ENV = `${APP}+ds`; // env = app + the datasets pattern's instance
    const LEGACY_ENV = `${APP}+legacy_ds`;
    const dhses = { authed: true, id: 7, groups: ['DHSES'] };
    const county = { authed: true, id: 8, groups: ['Counties'] };
    const bild = { authed: true, id: 9, groups: ['BILD'] };
    const rando = { authed: true, id: 10, groups: ['Rando'] };
    const admin = { authed: true, id: 11, groups: [`${APP} Admin`] };
    const avail = { authed: true, id: 1, groups: ['AVAIL'] };
    const user42 = { authed: true, id: 42, groups: [] };
    const allow = async (o) => (await decideSource(o)).allow;

    console.log('\ndecideSource — internal (DMS env) sources:');
    await ta('pattern grant is inherited (DHSES update-source via dmsEnv-linked pattern)', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: dhses }), true));
    await ta('pattern user grant is inherited (user 42 delete-source)', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, reqPermissions: ['delete-source'], user: user42 }), true));
    await ta('source grant adds on top (Counties edit-source-data)', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: grantedSrc, reqPermissions: ['edit-source-data'], user: county }), true));
    await ta('source [] revokes the inherited grant (DHSES on dams)', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: revokedSrc, reqPermissions: ['update-source'], user: dhses }), false));
    await ta('ungranted user is denied', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: county }), false));
    await ta('anon is denied', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: null }), false));
    await ta('${app} Admin passes everything', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, reqPermissions: ['delete-source'], user: admin }), true));
    await ta('legacy pattern (sources on the pattern, flat authPermissions) is inherited', async () =>
        assert.strictEqual(await allow({ env: LEGACY_ENV, sourceId: legacySrc, reqPermissions: ['update-source'], user: bild }), true));
    await ta('a source outside the env is denied, even to a pattern grantee', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: strayInternal, reqPermissions: ['update-source'], user: dhses }), false);
        assert.strictEqual(await allow({ env: ENV, sourceId: legacySrc, reqPermissions: ['update-source'], user: dhses }), false);
    });
    await ta('missing row is denied (fail closed)', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: 99999999, reqPermissions: ['update-source'], user: dhses }), false));
    await ta('a non-source row id is denied', async () =>
        assert.strictEqual(await allow({ env: ENV, sourceId: dsPattern, reqPermissions: ['update-source'], user: dhses }), false));

    console.log('\ndecideSource — external (pgEnv) sources:');
    await ta('source grant counts with no pattern named', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extGranted, reqPermissions: ['delete-source'], user: avail }), true));
    await ta('empty grants deny', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['update-source'], user: dhses }), false));
    await ta('a named datasets pattern is inherited', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['update-source'], user: dhses, patternRef: { app: APP, patternId: dsPattern } }), true));
    await ta('named pattern + its ${app} Admin passes', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['delete-source'], user: admin, patternRef: { app: APP, patternId: dsPattern } }), true));
    await ta('a non-datasets pattern is ignored', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['update-source'], user: rando, patternRef: { app: APP, patternId: pagePattern } }), false));
    await ta('a pattern named under the wrong app is ignored', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['update-source'], user: rando, patternRef: { app: APP, patternId: otherDs } }), false));
    await ta('missing row is denied (fail closed)', async () =>
        assert.strictEqual(await allow({ db: dama, env: DAMA_DB, sourceId: 99999999, reqPermissions: ['update-source'], user: avail }), false));
    await ta('query error is denied (fail closed)', async () => {
        const broken = { type: 'sqlite', query: async () => { throw new Error('boom'); } };
        assert.strictEqual(await allow({ db: broken, env: 'nope', sourceId: extGranted, reqPermissions: ['update-source'], user: avail }), false);
    });

    console.log('\ndecidePattern:');
    await ta('create-source granted on the pattern', async () =>
        assert.strictEqual((await decidePattern({ patternRef: { app: APP, patternId: dsPattern }, reqPermissions: ['create-source'], user: dhses })).allow, true));
    await ta('create-source not granted', async () =>
        assert.strictEqual((await decidePattern({ patternRef: { app: APP, patternId: dsPattern }, reqPermissions: ['create-source'], user: county })).allow, false));
    await ta('no pattern named → deny', async () =>
        assert.strictEqual((await decidePattern({ patternRef: null, reqPermissions: ['create-source'], user: dhses })).allow, false));

    console.log('\nDMS_SOURCE_AUTH_MODE:');
    const withMode = async (mode, fn) => {
        const prev = process.env.DMS_SOURCE_AUTH_MODE;
        process.env.DMS_SOURCE_AUTH_MODE = mode;
        const warn = console.warn; const warned = [];
        console.warn = (...a) => warned.push(a.join(' '));
        try { return await fn(warned); } finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_SOURCE_AUTH_MODE; else process.env.DMS_SOURCE_AUTH_MODE = prev; }
    };
    await ta('legacy: DMS env allows, nothing logged', async () => withMode('legacy', async (warned) => {
        assert.strictEqual(await isUserAuthedForSource({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: county }), true);
        assert.strictEqual(warned.length, 0);
    }));
    await ta('log (default): DMS env allows, and logs the would-deny', async () => withMode('', async (warned) => {
        assert.strictEqual(await isUserAuthedForSource({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: county }), true);
        assert.ok(warned.some(w => w.includes('would-deny source') && w.includes(`/${bareSrc}`)), warned.join('\n'));
    }));
    await ta('log: missing external row allows (today) and logs', async () => withMode('log', async (warned) => {
        assert.strictEqual(await isUserAuthedForSource({ db: dama, env: DAMA_DB, sourceId: 99999999, reqPermissions: ['update-source'], user: avail }), true);
        assert.strictEqual(warned.length, 1);
    }));
    await ta('log: a migrated external source still denies as today', async () => withMode('log', async () =>
        assert.strictEqual(await isUserAuthedForSource({ db: dama, env: DAMA_DB, sourceId: extEmpty, reqPermissions: ['update-source'], user: dhses }), false)));
    await ta('log: a granted request logs nothing', async () => withMode('log', async (warned) => {
        assert.strictEqual(await isUserAuthedForSource({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: dhses }), true);
        assert.strictEqual(warned.length, 0);
    }));
    await ta('enforce: DMS env denies the ungranted user', async () => withMode('enforce', async () =>
        assert.strictEqual(await isUserAuthedForSource({ env: ENV, sourceId: bareSrc, reqPermissions: ['update-source'], user: county }), false)));
    await ta('pattern check: log allows + logs, enforce denies', async () => {
        const o = { patternRef: { app: APP, patternId: dsPattern }, reqPermissions: ['create-source'], user: county };
        await withMode('log', async (warned) => { assert.strictEqual(await isUserAuthedForPattern(o), true); assert.strictEqual(warned.length, 1); });
        await withMode('enforce', async () => assert.strictEqual(await isUserAuthedForPattern(o), false));
    });

    console.log('\nrequest identity:');
    await ta('requestUserId reads the token user only', async () => {
        assert.strictEqual(requestUserId({ availAuthContext: { user: { id: 5 } }, body: { user_id: 1 } }), 5);
        assert.strictEqual(requestUserId({ availAuthContext: { user: null }, body: { user_id: 1 } }), null);
        assert.strictEqual(requestUserId({ user: { id: 3 } }), null);
    });
    await ta('requestUserIdWarnBody ignores and logs a disagreeing body user_id', async () => {
        const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(' '));
        try {
            assert.strictEqual(requestUserIdWarnBody({ method: 'POST', url: '/x', availAuthContext: { user: { id: 5 } }, body: { user_id: 1 } }), 5);
            assert.strictEqual(warned.length, 1);
        } finally { console.warn = warn; }
    });
    await ta('requestPatternRef: query dms_pattern, then header; never the body', async () => {
        assert.deepStrictEqual(requestPatternRef({ query: { dms_pattern: 'my-app/12' }, headers: {} }), { app: 'my-app', patternId: 12 });
        assert.deepStrictEqual(requestPatternRef({ query: {}, headers: { 'x-dms-pattern': 'a+b/3' } }), { app: 'a+b', patternId: 3 });
        assert.strictEqual(requestPatternRef({ query: {}, headers: {}, body: { app: 'a', patternId: 3 } }), null);
        assert.strictEqual(requestPatternRef({ query: { dms_pattern: 'nope' }, headers: {} }), null);
        assert.strictEqual(requestPatternRef({ query: { dms_pattern: 'a/x' }, headers: {} }), null);
    });
}

dbTests()
    .catch(e => { fail++; console.log(`  ✗ db tests crashed\n      ${e.stack}`); })
    .then(() => {
        console.log(`\nsource-auth tests: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
