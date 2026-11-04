/**
 * Who may read a source (planning/tasks/current/permissions-ds-read-visibility.md): routes/uda/readAuth.js
 * and the UDA read routes under DMS_AUTH_MODE. Part 1: grant trimming and secret dropping. Part 2:
 * decisions on real sqlite DBs (external and internal sources, views, the lenient rule, ${app} Admin,
 * modes). Part 3: the Falcor read routes (catalog filtered only under enforce, a refused read answers
 * null, redaction, log mode lets everything through and logs once).
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-read-auth.js   (DAMA_TEST_DB picks the pgEnv; local sqlite by default)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { createTestGraph } = require('./graph');
const { dmsMainTable } = require('../src/routes/uda/utils');
const RA = require('../src/routes/auth/sourceReads');
// Reply shaping moved out of auth on 2026-11-03 — it decides no access, only which columns an
// already-allowed reply carries. The cases below are unchanged; only the import moved.
const RED = require('../src/routes/uda/sourceRedaction');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};

// Runs fn under DMS_AUTH_MODE=mode, collecting `[read-auth] would-deny` lines.
async function withMode(mode, fn) {
    const prev = process.env.DMS_AUTH_MODE;
    const warn = console.warn; const warned = [];
    process.env.DMS_AUTH_MODE = mode;
    console.warn = (...a) => { const s = a.join(' '); if (s.includes('[read-auth]')) warned.push(s); else warn(...a); };
    try { return await fn(warned); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev; }
}

async function run() {
    console.log('trimGrants / dropSecrets:');
    await t('trimGrants keeps the caller\'s own entries and public, marks the rest hidden', async () => {
        const ap = { groups: { Editors: ['update-source'], Viewers: ['view-source'], public: [] }, users: { 7: ['*'], 8: ['view-source'] } };
        const out = RED.trimGrants(ap, { id: 8, groups: ['Viewers'] });
        assert.deepStrictEqual(out, { groups: { Viewers: ['view-source'], public: [], [RED.HIDDEN_ENTRY]: [] }, users: { 8: ['view-source'] } });
        assert.strictEqual(typeof RED.trimGrants(JSON.stringify(ap), {}), 'string', 'a string stays a string');
        const all = RED.trimGrants({ groups: { public: ['view-source'] } }, null);
        assert.deepStrictEqual(all, { groups: { public: ['view-source'] }, users: {} }, 'nothing hidden → no marker');
    });
    await t('dropSecrets drops *_secret / *_token keys at any depth, keeps the rest', async () => {
        const stats = { webhook_secret: 's', station_name: 'WCDB', backfill: { acr_token: 'x', rows: 5 }, auth: { users: {} } };
        assert.deepStrictEqual(RED.dropSecrets(stats), { station_name: 'WCDB', backfill: { rows: 5 }, auth: { users: {} } });
        assert.strictEqual(JSON.parse(RED.dropSecrets(JSON.stringify(stats))).webhook_secret, undefined);
    });

    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB); getDb(DAMA_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const dama = getDb(DAMA_DB);
    const pg = dama.type === 'postgres';
    const srcTbl = pg ? 'data_manager.sources' : 'sources';
    const viewTbl = pg ? 'data_manager.views' : 'views';

    // ---- users
    const anon = null;
    const owner = { authed: true, id: 1, email: 'o@x', groups: ['Staff'] };
    const viewer = { authed: true, id: 2, email: 'v@x', groups: ['Viewers'] };
    const editor = { authed: true, id: 3, email: 'e@x', groups: ['Editors'] };
    const stranger = { authed: true, id: 4, email: 's@x', groups: ['Rando'] };

    // ---- DaMa: open (no grants), private (creator only, the createDamaSource default), public view-source,
    // granted to Viewers / Editors, with a secret in statistics
    const ext = async (ap, statistics = null) => (await dama.query(
        `INSERT INTO ${srcTbl} (name, auth_permissions, statistics) VALUES ($1, $2, $3) RETURNING source_id`,
        [`readauth_${Date.now()}_${Math.random()}`, ap == null ? null : JSON.stringify(ap), statistics && JSON.stringify(statistics)])).rows[0].source_id;
    const view = async (sourceId) => (await dama.query(
        `INSERT INTO ${viewTbl} (source_id, table_schema, table_name) VALUES ($1, 'gis_datasets', 'none') RETURNING view_id`, [sourceId])).rows[0].view_id;
    const open = await ext(null);
    const priv = await ext({ users: { 1: ['*'] }, groups: { public: [] } });
    const pub = await ext({ users: { 1: ['*'] }, groups: { public: ['view-source'] } });
    const granted = await ext({ users: { 1: ['*'] }, groups: { public: [], Viewers: ['view-source'], Editors: ['update-source', 'edit-source-permissions'] } },
        { webhook_secret: 'shh', station_name: 'WCDB' });
    const privView = await view(priv);
    const pubView = await view(pub);
    const E = DAMA_DB;

    // ---- DMS: a datasets pattern (public view-source baseline) linked to an env listing two internal
    // sources; a stray internal source no pattern lists
    const APP = `readauth_${Date.now()}`;
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    const insert = async (type, data) => (await dms.query(`INSERT INTO ${tbl} (app, type, data) VALUES ($1, $2, $3) RETURNING id`, [APP, type, data])).rows[0].id;
    const intView = await insert('roads|v1:view', { name: 'v1' });
    const intOpen = await insert('env1|roads:source', { name: 'roads', views: [{ id: intView }] });
    const intPrivate = await insert('env1|dams:source', { name: 'dams', auth_permissions: { users: { 1: ['*'] }, groups: { public: [] } } });
    const intStray = await insert('env9|stray:source', { name: 'stray' });
    const envRow = await insert('site|env1:dmsenv', { sources: [{ id: intOpen }, { id: intPrivate }] });

    // --- fixtures for the 2026-10-30 rules (read-by-default, view:false, auth-column precedence)
    // `ds2` grants the public NOTHING, so anything readable beneath it is readable because the
    // SOURCE says nothing — not because the pattern allowed it.
    const vocabSource = await insert('env2|vocab_src:source', { name: 'vocab_src' });
    const hiddenSource = await insert('env2|hidden:source', {
        name: 'hidden', auth_permissions: { users: { 1: ['*'] }, groups: {} },
    });
    const hiddenBlank = await insert('env2|hidden_blank:source', { name: 'hidden_blank' });
    const columnSource = await insert('env2|col_src:source', {
        name: 'col_src',
        auth_permissions: { groups: { public: ['view-source'] }, users: {} },   // STALE on purpose
    });
    const env2 = await insert('site|env2:dmsenv', {
        sources: [{ id: vocabSource }, { id: hiddenSource }, { id: hiddenBlank }, { id: columnSource }],
    });
    await insert('site|ds2:pattern', {
        pattern_type: 'datasets', dmsEnvId: env2,
        authPermissions: { groups: { public: ['view-page'], Staff: ['*'] }, users: {} },
        authVocabulary: { descendants: [{ value: 'view-page', implies: ['read'] }] },
    });
    // The `auth` COLUMN is the system of record. Add it if this test db predates the migration,
    // then write the declarations and the grants that must beat `data`.
    try { await dms.query(`ALTER TABLE ${tbl} ADD COLUMN auth ${dms.type === 'postgres' ? 'jsonb' : 'TEXT'}`); }
    catch { /* already migrated */ }
    const setAuth = async (id, obj) =>
        dms.query(`UPDATE ${tbl} SET auth = $1 WHERE id = $2`, [JSON.stringify(obj), id]);
    await setAuth(hiddenSource, { view: false });                       // grants still come from data
    await setAuth(hiddenBlank, { view: false });                        // nothing anywhere else
    await setAuth(columnSource, { groups: { public: [] }, users: { 1: ['*'] } });
    await insert('site|ds:pattern', { pattern_type: 'datasets', dmsEnvId: envRow, authPermissions: { groups: { public: ['view-source'], Staff: ['*'] }, users: {} } });
    // A datasets pattern for external sources (grants Rando view-source), and a page pattern granting the same
    const extPattern = await insert('site|ext:pattern', { pattern_type: 'datasets', authPermissions: { groups: { Rando: ['view-source'] }, users: {} } });
    const pagePattern = await insert('site|docs:pattern', { pattern_type: 'page', authPermissions: { groups: { Rando: ['view-source'] }, users: {} } });
    const I = `${APP}+internal_table`;
    const appAdmin = { authed: true, id: 9, email: 'a@x', groups: [`${APP} Admin`] };

    // THE EXTERNAL ENV'S DECLARATION. A pgEnv's sources expand their grants against the vocabulary
    // its `:dmsenv` row declares — the same one internal sources use (admin.format.js dmsEnvFormat),
    // created in a real deployment by `scripts/ensure-pgenv-rows.js`. Without it `view-source` is
    // just a string and confers no structural `read`: the legacy table that used to rescue it
    // (`legacyVerbs.js`) was deleted on 2026-11-03.
    await insert('site|extenv:dmsenv', {
        name: 'extenv', pgEnv: DAMA_DB,
        authVocabulary: { descendants: [
            { value: 'view-source', implies: ['read'] },
            { value: 'view-sources', implies: ['read'] },
            { value: 'update-source', implies: ['read', 'edit'] },
            { value: 'edit-source-data', implies: ['read', 'edit'] },
            { value: 'edit-source-permissions', implies: ['read', 'edit', 'grant'] },
            { value: 'create-view', implies: ['read', 'create'] },
            { value: 'delete-source', implies: ['read', 'delete'] },
            { value: 'download-source', implies: [] },
            { value: 'view-source-api', implies: [] },
        ] },
    });

    // `app` is the LOCATOR for that row and nothing more — it is not a patternRef and lends no
    // grants. Per-app split mode keeps env rows in an app-scoped table, so the name is needed to
    // find one (routes/auth/sourceReads.js `appFor`).
    const read = (env, sourceId, user) => RA.allowSourceRead({ env, sourceId, user, app: APP });

    console.log('\ndecisions (enforce):');
    await withMode('enforce', async () => {
        RA.clearReadSnapshots();
        await t('external: no grants → open to anyone (lenient rule)', async () => {
            assert.strictEqual(await read(E, open, anon), true);
        });
        await t('external: creator-only (the new-source default) → anon and strangers refused, creator reads', async () => {
            assert.strictEqual(await read(E, priv, anon), false);
            assert.strictEqual(await read(E, priv, stranger), false);
            assert.strictEqual(await read(E, priv, owner), true);
        });
        await t('external: public view-source → anon reads', async () => assert.strictEqual(await read(E, pub, anon), true));
        await t('a permission that implies reading counts (Editors: update-source)', async () => {
            assert.strictEqual(await read(E, granted, editor), true);
            assert.strictEqual(await read(E, granted, viewer), true);
            assert.strictEqual(await read(E, granted, stranger), false);
        });
        await t('views judge their source; an unknown view is refused', async () => {
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: privView, user: anon }), false);
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: pubView, user: anon }), true);
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: 999999999, user: owner }), false);
        });
        await t('internal: the pattern\'s public view-source is inherited; a source [] revokes it; Staff (*) reads', async () => {
            assert.strictEqual(await read(I, intOpen, anon), true);
            assert.strictEqual(await read(I, intPrivate, anon), false);
            assert.strictEqual(await read(I, intPrivate, owner), true);
            assert.strictEqual(await RA.allowViewRead({ env: I, viewId: intView, user: anon }), true);
        });
        await t('internal: ${app} Admin reads everything; a source in no pattern is now READABLE', async () => {
            assert.strictEqual(await read(I, intPrivate, appAdmin), true);
            // CHANGED 2026-10-30. This asserted `false`: a source no datasets pattern listed was
            // refused outright. Under the owner's rule a source that states nothing is readable, and
            // being unreferenced is not a statement — it is the absence of one. Orphanhood still
            // denies WRITES, which is where "no pattern vouches for it" belongs.
            assert.strictEqual(await read(I, intStray, owner), true);
        });
        await t('NEW: a blank source under a pattern granting only view-page is READABLE', async () => {
            // The live bug, reduced. `vocabPattern` grants public a NAMED verb; `vocabSource` states
            // nothing. Before the owner's 2026-10-30 rule this denied anon twice over: the pattern
            // gated the read, and `view-page` was never expanded into the structural `read`.
            assert.strictEqual(await read(I, vocabSource, anon), true);
        });
        await t('NEW: `auth: { view: false }` narrows a source to its own grantees', async () => {
            assert.strictEqual(await read(I, hiddenSource, anon), false);
            assert.strictEqual(await read(I, hiddenSource, owner), true, 'its own user grant still reads');
            assert.strictEqual(await read(I, hiddenSource, appAdmin), true, '${app} Admin still reads');
        });
        await t('NEW: view:false with NO grants of its own means no one, not everyone', async () => {
            assert.strictEqual(await read(I, hiddenBlank, anon), false);
            assert.strictEqual(await read(I, hiddenBlank, owner), false);
        });
        await t('NEW: grants in the `auth` COLUMN are honoured, and beat a stale `data`', async () => {
            assert.strictEqual(await read(I, columnSource, anon), false, 'column says public: []');
            assert.strictEqual(await read(I, columnSource, owner), true, 'column names user 1');
        });
        await t('NEW: a pattern\'s grants no longer gate source reads, but still answer holdsOnSource', async () => {
            assert.strictEqual(await read(I, intStray, owner), true, 'a source in no pattern is readable');
        });
        await t('filterReadableSources keeps order, drops the refused', async () => {
            assert.deepStrictEqual(await RA.filterReadableSources({ env: E, sourceIds: [open, priv, pub], user: anon }), [open, pub]);
        });
        // 2026-11-03: the named pattern LENDS NOTHING. It was the external half of the hole this
        // file calls "a placeholder, not a boundary" — the CLIENT picks the pattern, so a caller
        // with two datasets patterns could name whichever granted more. `named.app` survives only
        // as a LOCATOR: it selects the table holding the env row whose vocabulary governs the
        // source, and confers nothing. Writes made the same cut first (`mergedAuthForSource`).
        await t('external: naming a datasets pattern lends NOTHING — the source decides alone', async () => {
            const named = (patternId, user = stranger, sourceId = priv) =>
                RA.allowSourceRead({ env: E, sourceId, user, patternRef: { app: APP, patternId } });
            assert.strictEqual(await named(extPattern), false, 'Rando WAS let in by the pattern; not any more');
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: privView, user: stranger, patternRef: { app: APP, patternId: extPattern } }), false);
            assert.strictEqual(await read(E, priv, stranger), false, 'and naming nothing is the same answer');
            assert.strictEqual(await named(pagePattern), false, 'not a datasets pattern');
            assert.strictEqual(await named(999999999), false, 'no such pattern');
            assert.strictEqual(await named(extPattern, anon), false, 'anonymous likewise');
            // What still works, so this is not simply "everything is refused":
            assert.strictEqual(await named(extPattern, appAdmin), true, '${app} Admin of the locator app still passes');
            assert.strictEqual(await named(extPattern, stranger, pub), true, 'a source granting the public reads, pattern or no pattern');
        });
        await t('external: a source [] refuses, as it always did', async () => {
            const revoked = await ext({ users: { 1: ['*'] }, groups: { public: [], Rando: [] } });
            RA.clearReadSnapshots();
            assert.strictEqual(await RA.allowSourceRead({ env: E, sourceId: revoked, user: stranger, patternRef: { app: APP, patternId: extPattern } }), false);
        });
        await t('internal: a named pattern changes nothing (internal sources find their own)', async () => {
            assert.strictEqual(await RA.allowSourceRead({ env: I, sourceId: intPrivate, user: stranger, patternRef: { app: APP, patternId: extPattern } }), false);
        });
        await t('a grant change shows once the snapshot is refreshed', async () => {
            await dama.query(`UPDATE ${srcTbl} SET auth_permissions = $1 WHERE source_id = $2`,
                [JSON.stringify({ users: { 1: ['*'] }, groups: { public: ['view-source'] } }), priv]);
            assert.strictEqual(await read(E, priv, anon), false, 'cached');
            RA.clearReadSnapshots();
            assert.strictEqual(await read(E, priv, anon), true);
            await dama.query(`UPDATE ${srcTbl} SET auth_permissions = $1 WHERE source_id = $2`,
                [JSON.stringify({ users: { 1: ['*'] }, groups: { public: [] } }), priv]);
            RA.clearReadSnapshots();
        });
    });

    console.log('\nmodes:');
    await t('log: a refused read goes through and logs once per user / source / kind', async () => {
        await withMode('log', async (warned) => {
            assert.strictEqual(await read(E, priv, stranger), true);
            assert.strictEqual(await read(E, priv, stranger), true);
            assert.strictEqual(warned.filter(w => w.includes(`${E}/${priv}`) && w.includes('user=4')).length, 1);
            // KIND auth names the first permission it looked for; the ROW gate asks one structural
            // question and answers `missing read` — Phase 4(a) of
            // permission-domain-single-source.md. Both are refusals of the same read.
            assert.ok(/would-deny source .* reason=missing (view-source|read)/.test(warned[0]), warned[0]);
        });
    });
    await t('tiles (logOnly) are exempt from enforce: a refused tile read goes through and logs', async () => {
        await withMode('enforce', async (warned) => {
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: privView, user: anon }), false);
            assert.strictEqual(await RA.allowViewRead({ env: E, viewId: privView, user: anon, kind: 'tiles', logOnly: true }), true);
            assert.ok(warned.some(w => w.includes('would-deny tiles')), warned.join('\n'));
        });
    });

    console.log('\nredactSourceRow:');
    const row = () => ({ statistics: { webhook_secret: 'shh', station_name: 'WCDB' },
        auth_permissions: { users: { 1: ['*'] }, groups: { public: [], Viewers: ['view-source'], Editors: ['update-source', 'edit-source-permissions'] } } });
    await t('log: secrets dropped for a non-updater, grants left whole; an updater sees the secret', async () => {
        await withMode('log', async () => {
            const r = await RED.redactSourceRow({ env: E, sourceId: granted, row: row(), user: viewer });
            assert.strictEqual(r.statistics.webhook_secret, undefined);
            assert.strictEqual(r.statistics.station_name, 'WCDB');
            assert.ok(r.auth_permissions.groups.Editors, 'grants whole under log');
            const e = await RED.redactSourceRow({ env: E, sourceId: granted, row: row(), user: editor });
            assert.strictEqual(e.statistics.webhook_secret, 'shh');
        });
    });
    await t('enforce: a non-editor gets their own entries + the hidden marker; an editor the full list', async () => {
        await withMode('enforce', async () => {
            const r = await RED.redactSourceRow({ env: E, sourceId: granted, row: row(), user: viewer });
            assert.deepStrictEqual(Object.keys(r.auth_permissions.groups).sort(), [RED.HIDDEN_ENTRY, 'Viewers', 'public'].sort());
            assert.deepStrictEqual(r.auth_permissions.users, {});
            const e = await RED.redactSourceRow({ env: E, sourceId: granted, row: row(), user: editor });
            assert.ok(e.auth_permissions.groups.Editors && e.auth_permissions.users[1]);
        });
    });

    console.log('\nFalcor read routes:');
    await t('enforce: naming a datasets pattern opens nothing the caller could not already read', async () => {
        const unwrapAtom = (v) => (v && v.$type === 'atom' ? v.value : v) ?? null;
        await withMode('enforce', async () => {
            // Through the real route, not just the decision function: the patternRef reaches it on
            // every datasets request (`tagFalcorRequests`), and until 2026-11-03 it answered the
            // private source's id to a caller with no grant on it.
            const named = createTestGraph(DMS_DB, { user: stranger, patternRef: { app: APP, patternId: extPattern } });
            await named.ready;
            const g = (await named.getAsync([['uda', E, 'sources', 'byId', priv, 'source_id']])).jsonGraph;
            assert.strictEqual(unwrapAtom(g.uda[E].sources.byId[priv].source_id), null, 'named: refused');
            const bare = createTestGraph(DMS_DB, { user: stranger });
            await bare.ready;
            const b = (await bare.getAsync([['uda', E, 'sources', 'byId', priv, 'source_id']])).jsonGraph;
            assert.strictEqual(unwrapAtom(b.uda[E].sources.byId[priv].source_id), null, 'bare: refused, as before');
            // The route still WORKS with a patternRef — it is a locator, not a gate.
            const p = (await named.getAsync([['uda', E, 'sources', 'byId', pub, 'source_id']])).jsonGraph;
            assert.strictEqual(+unwrapAtom(p.uda[E].sources.byId[pub].source_id), +pub, 'a readable source still reads');
        });
    });
    const graphs = {};
    const as = (user) => graphs[user ? user.id : 'anon'] || (graphs[user ? user.id : 'anon'] = createTestGraph(DMS_DB, { user }));
    for (const u of [anon, owner, viewer, stranger]) await as(u).ready;
    const get = async (user, paths) => (await as(user).getAsync(paths)).jsonGraph;
    const unwrap = (v) => (v && v.$type === 'atom' ? v.value : v) ?? null;
    const catalog = async (user) => {
        const len = (await get(user, [['uda', E, 'sources', 'length']])).uda[E].sources.length;
        if (!len) return [];
        const g = await get(user, [['uda', E, 'sources', 'byIndex', { from: 0, to: len - 1 }, 'source_id']]);
        return Object.values(g.uda[E].sources.byIndex).map(r => r && r.value && +r.value[r.value.length - 1]);
    };
    await t('enforce: the catalog lists only readable sources, length and byIndex agree', async () => {
        await withMode('enforce', async () => {
            RA.clearReadSnapshots();
            const anonList = await catalog(anon);
            assert.ok(anonList.includes(open) && anonList.includes(pub), 'readable listed');
            assert.ok(!anonList.includes(priv) && !anonList.includes(granted), 'refused not listed');
            const ownerList = await catalog(owner);
            assert.ok(ownerList.includes(priv) && ownerList.includes(granted));
        });
    });
    await t('log: the catalog is unchanged (refused sources listed, would-deny logged)', async () => {
        await withMode('log', async (warned) => {
            const anonList = await catalog(anon);
            assert.ok(anonList.includes(priv));
            assert.ok(warned.some(w => w.includes('would-deny list') && w.includes(`/${priv} `)), warned.slice(0, 3).join('\n'));
        });
    });
    await t('enforce: sources.byId answers null attributes for a refused source, values for a readable one', async () => {
        await withMode('enforce', async () => {
            const g = await get(anon, [['uda', E, 'sources', 'byId', [priv, pub], ['name', 'source_id']]]);
            const byId = g.uda[E].sources.byId;
            assert.strictEqual(unwrap(byId[priv].name), null);
            assert.ok(unwrap(byId[pub].name), 'readable source has its name');
        });
    });
    await t('enforce: sources.byId trims grants and drops the secret for a viewer; the owner gets all', async () => {
        await withMode('enforce', async () => {
            const val = (g, attr) => { const v = g.uda[E].sources.byId[granted][attr]; return v && v.$type === 'atom' ? v.value : v; };
            const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
            const gv = await get(viewer, [['uda', E, 'sources', 'byId', granted, ['auth_permissions', 'statistics']]]);
            assert.ok(parse(val(gv, 'auth_permissions')).groups[RED.HIDDEN_ENTRY], 'trimmed');
            assert.strictEqual(parse(val(gv, 'statistics')).webhook_secret, undefined);
            const go = await get(owner, [['uda', E, 'sources', 'byId', granted, ['auth_permissions', 'statistics']]]);
            assert.ok(parse(val(go, 'auth_permissions')).groups.Editors);
            assert.strictEqual(parse(val(go, 'statistics')).webhook_secret, 'shh');
        });
    });
    await t('enforce: data reads of a refused view answer 0 / nothing; views.byId nulls', async () => {
        await withMode('enforce', async () => {
            const g = await get(anon, [['uda', E, 'viewsById', privView, 'options', '{}', 'length']]);
            assert.strictEqual(g.uda[E].viewsById[privView].options['{}'].length, 0);
            const v = await get(anon, [['uda', E, 'views', 'byId', privView, ['source_id']]]);
            assert.strictEqual(unwrap(v.uda[E].views.byId[privView].source_id), null);
        });
    });

    // cleanup
    await dama.query(`DELETE FROM ${viewTbl} WHERE view_id IN (${[privView, pubView].join(',')})`);
    await dama.query(`DELETE FROM ${srcTbl} WHERE source_id IN (${[open, priv, pub, granted].join(',')})`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
