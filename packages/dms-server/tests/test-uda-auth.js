/**
 * Permission checks on the UDA Falcor writes (permissions-ds-uda-falcor-writes): source / view sets and
 * their update calls, setIndex, setPrimaryKey, setRule, backfillRule, clearData, views.create, settings, deletes. Each is
 * refused with no user, refused without the permission, and passes the gate with it; auth_permissions
 * needs edit-source-permissions through either source path; DaMa writes take whitelisted columns only.
 * Internal sources are addressed the way the client does (`app+internal_table`, `app+<slug>`).
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-uda-auth.js   (DAMA_TEST_DB picks the pgEnv; local sqlite by default)
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB; // the resolver and UDA routes read DMS rows from DMS_DB_ENV
const assert = require('assert');
const { createTestGraph } = require('./graph');
const { dmsMainTable } = require('../src/routes/uda/utils');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); }
};

// Runs fn under DMS_SOURCE_AUTH_MODE=mode, collecting `[source-auth] would-deny` lines.
async function withMode(mode, fn) {
    const prev = process.env.DMS_SOURCE_AUTH_MODE;
    const warn = console.warn; const warned = [];
    process.env.DMS_SOURCE_AUTH_MODE = mode;
    console.warn = (...a) => { const s = a.join(' '); if (s.includes('would-deny')) warned.push(s); else warn(...a); };
    try { return await fn(warned); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_SOURCE_AUTH_MODE; else process.env.DMS_SOURCE_AUTH_MODE = prev; }
}

// The refusal message of a call/set that failed, or null when it went through (an error atom counts
// as a refusal too).
async function outcome(promise) {
    try {
        const res = await promise;
        const s = JSON.stringify(res || {});
        return s.includes('"$type":"error"') ? s : null;
    } catch (e) {
        return (e && (e.message || JSON.stringify(e))) || 'error';
    }
}
const AUTH_RE = /Sign in|not authorized/i;
const refused = async (promise, re = AUTH_RE) => {
    const msg = await outcome(promise);
    assert(msg !== null, 'expected a refusal, the write went through');
    assert(re.test(msg), `refusal should match ${re}, got: ${msg.slice(0, 200)}`);
};
const allowed = async (promise) => {
    const msg = await outcome(promise);
    assert(msg === null, `expected success, got: ${msg && msg.slice(0, 200)}`);
};
// Got past the permission gate (the controller may still fail on its own terms: no table etc.).
const passesGate = async (promise) => {
    const msg = await outcome(promise);
    assert(!(msg && AUTH_RE.test(msg)), `expected to pass the permission gate, got: ${msg && msg.slice(0, 200)}`);
};

async function run() {
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
    const editor = { authed: true, id: 7, email: 'e@x', groups: ['Editors'] };       // update-source on extA
    const owner = { authed: true, id: 8, email: 'o@x', groups: ['Owners'] };         // * on extA
    const dsEditor = { authed: true, id: 9, email: 'd@x', groups: ['DsEditors'] };   // the datasets pattern's grants
    const versioner = { authed: true, id: 11, email: 'v@x', groups: ['Versioners'] }; // create-view only on extA
    const stranger = { authed: true, id: 10, email: 's@x', groups: ['Rando'] };
    const graphs = {};
    const as = (user) => graphs[user ? user.id : 'anon'] || (graphs[user ? user.id : 'anon'] = createTestGraph(DMS_DB, { user }));
    for (const u of [anon, editor, owner, dsEditor, versioner, stranger]) await as(u).ready;
    const call = (user, path, args) => as(user).callAsync(path, args);
    const set = (user, path, value) => {
        const jsonGraph = {};
        path.reduce((node, k, i) => (node[k] = i === path.length - 1 ? value : (node[k] || {})), jsonGraph);
        return new Promise((resolve, reject) => as(user).set({ paths: [path], jsonGraph }, (e, r) => (e ? reject(e) : resolve(r))));
    };

    // ---- DMS side: a datasets pattern linked to a dmsEnv holding one internal source with one view
    const APP = `udaauth_${Date.now()}`;
    const OTHER_APP = `${APP}_other`;
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    const otherTbl = await dmsMainTable(dms, OTHER_APP, 'per-app');
    const insert = async (table, app, type, data) =>
        (await dms.query(`INSERT INTO ${table} (app, type, data) VALUES ($1, $2, $3) RETURNING id`, [app, type, data])).rows[0].id;
    const viewId = await insert(tbl, APP, 'roads|v1:view', { name: 'v1' });
    const intSrc = await insert(tbl, APP, 'env1|roads:source', { name: 'roads', type: 'internal_table', views: [{ id: viewId }] });
    const intSrc2 = await insert(tbl, APP, 'env1|bridges:source', { name: 'bridges', type: 'internal_table', views: [] });
    const envRow = await insert(tbl, APP, 'site|env1:dmsenv', { sources: [{ id: intSrc }, { id: intSrc2 }] });
    const dsPattern = await insert(tbl, APP, 'site|ds:pattern', {
        pattern_type: 'datasets', dmsEnvId: envRow,
        authPermissions: { '*': { groups: { DsEditors: ['update-source', 'edit-source-data', 'edit-pattern'] }, users: {} } },
    });
    const otherPattern = await insert(otherTbl, OTHER_APP, 'site|ds:pattern', { pattern_type: 'datasets', authPermissions: { groups: { Rando: ['*'] } } });
    const INT_ENV = `${APP}+internal_table`; // what updateSourceData sends for an internal source
    const SLUG_ENV = `${APP}+roads`;          // what clearData sends
    const pattern = { app: APP, id: dsPattern };

    // ---- DaMa side: extA grants its own groups; extB grants nothing itself (pattern grants only)
    const ext = async (ap) => (await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`udaauth_${Date.now()}_${Math.random()}`, JSON.stringify(ap)])).rows[0].source_id;
    const extA = await ext({ groups: { Editors: ['update-source'], Owners: ['*'], Versioners: ['create-view'] }, users: {} });
    const extB = await ext({});
    const view = async (sourceId) => (await dama.query(`INSERT INTO ${viewTbl} (source_id, version, table_schema, table_name) VALUES ($1, 'v1', $2, $3) RETURNING view_id`,
        [sourceId, pg ? 'public' : 'main', `udaauth_missing_${sourceId}`])).rows[0].view_id;
    const viewA = await view(extA);
    const viewB = await view(extB);
    const dsPatternRef = { app: APP, id: dsPattern }; // a datasets pattern the client names for extB

    // The settings tests write env settings other suites read (hidden_source_types): put them back.
    const { getSettings, setSettings } = require('../src/routes/uda/uda.tasks.controller');
    const savedSettings = { [DAMA_DB]: await getSettings(DAMA_DB), [INT_ENV]: await getSettings(INT_ENV) };

    console.log('sources.byId set / sources.update call (external):');
    await t('anon is refused on both paths', async () => {
        await refused(set(anon, ['uda', DAMA_DB, 'sources', 'byId', extA, 'description'], 'x'), /Sign in/);
        await refused(call(anon, ['uda', 'sources', 'update'], [DAMA_DB, extA, { description: 'x' }]), /Sign in/);
    });
    await t('stranger is refused (log and enforce: the source is checked against its own grants today)', async () => {
        for (const mode of ['log', 'enforce']) await withMode(mode, async () => {
            await refused(set(stranger, ['uda', DAMA_DB, 'sources', 'byId', extA, 'description'], 'x'));
            await refused(call(stranger, ['uda', 'sources', 'update'], [DAMA_DB, extA, { description: 'x' }]));
        });
    });
    await t('update-source grantee writes metadata on both paths; the call echoes the row', async () => {
        await allowed(set(editor, ['uda', DAMA_DB, 'sources', 'byId', extA, 'description'], 'by set'));
        const res = await call(editor, ['uda', 'sources', 'update'], [DAMA_DB, extA, { description: 'by call' }]);
        assert.strictEqual(res.jsonGraph.uda[DAMA_DB].sources.byId[extA].description, 'by call');
    });
    await t('auth_permissions needs edit-source-permissions: update-source alone is refused on both paths', async () => {
        const ap = JSON.stringify({ groups: { Editors: ['*'] } });
        await refused(set(editor, ['uda', DAMA_DB, 'sources', 'byId', extA, 'auth_permissions'], ap));
        await refused(call(editor, ['uda', 'sources', 'update'], [DAMA_DB, extA, { auth_permissions: ap }]));
        await refused(call(editor, ['uda', 'sources', 'update'], [DAMA_DB, extA, { description: 'y', ' auth_permissions': ap }]));
        const { rows } = await dama.query(`SELECT auth_permissions FROM ${srcTbl} WHERE source_id = $1`, [extA]);
        const stored = typeof rows[0].auth_permissions === 'string' ? JSON.parse(rows[0].auth_permissions) : rows[0].auth_permissions;
        assert.deepStrictEqual(stored.groups.Editors, ['update-source']);
    });
    await t('a * grantee can edit auth_permissions', async () => {
        const ap = JSON.stringify({ groups: { Editors: ['update-source'], Owners: ['*'], Versioners: ['create-view'] }, users: {} });
        await allowed(call(owner, ['uda', 'sources', 'update'], [DAMA_DB, extA, { auth_permissions: ap }]));
    });
    await t('column whitelist: unknown / server-owned / injected keys are refused on both paths', async () => {
        await refused(call(owner, ['uda', 'sources', 'update'], [DAMA_DB, extA, { source_id: 1 }]), /Not writable/);
        await refused(call(owner, ['uda', 'sources', 'update'], [DAMA_DB, extA, { symbology: {} }]), /Not writable/);
        await refused(call(owner, ['uda', 'sources', 'update'], [DAMA_DB, extA, { "description = 'x', name": 'y' }]), /Not writable/);
        await refused(set(owner, ['uda', DAMA_DB, 'sources', 'byId', extA, 'user_id'], 1), /Not writable/);
    });
    await t('pattern grants reach an external source only through the call that names the pattern (enforce)', async () => withMode('enforce', async () => {
        await allowed(call(dsEditor, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: 'via pattern' }, dsPatternRef]));
        await refused(call(dsEditor, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: 'no pattern' }]));
        await refused(set(dsEditor, ['uda', DAMA_DB, 'sources', 'byId', extB, 'description'], 'set'));
        await allowed(call(dsEditor, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: 'string ref' }, `${APP}/${dsPattern}`]));
    }));
    await t('legacy / log allow whatever the strict rule allows (pattern grantee on a source with no own grants)', async () => {
        for (const mode of ['legacy', 'log']) await withMode(mode, async (warned) => {
            await allowed(call(dsEditor, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: `via pattern, ${mode}` }, dsPatternRef]));
            await refused(call(dsEditor, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: 'no pattern' }]));
            assert.strictEqual(warned.length, 0, `nothing to log: ${warned}`);
        });
    });
    await t('a non-datasets or foreign-app pattern brings no grants (enforce)', async () => withMode('enforce', async () =>
        refused(call(stranger, ['uda', 'sources', 'update'], [DAMA_DB, extB, { description: 'x' }, { app: OTHER_APP, id: dsPattern }]))));

    console.log('\ninternal sources, addressed the way the client does:');
    await t('pattern grantee writes an internal source through `app+internal_table` (enforce)', async () => withMode('enforce', async () => {
        await allowed(set(dsEditor, ['uda', INT_ENV, 'sources', 'byId', intSrc, 'description'], 'by set'));
        await allowed(call(dsEditor, ['uda', 'sources', 'update'], [INT_ENV, intSrc, { description: 'by call' }]));
    }));
    await t('stranger is refused on an internal source (enforce); log lets it through and logs', async () => {
        await withMode('enforce', () => refused(call(stranger, ['uda', 'sources', 'update'], [INT_ENV, intSrc, { description: 'x' }])));
        await withMode('log', async (warned) => {
            await allowed(call(stranger, ['uda', 'sources', 'update'], [INT_ENV, intSrc, { description: 'x' }]));
            assert(warned.some(w => w.includes(`/${intSrc} `)), `expected a would-deny line, got ${warned}`);
        });
    });
    await t('internal auth_permissions needs edit-source-permissions (enforce)', async () => withMode('enforce', () =>
        refused(call(dsEditor, ['uda', 'sources', 'update'], [INT_ENV, intSrc, { auth_permissions: { groups: {} } }]))));

    console.log('\nviews.byId set / views.update call:');
    await t('anon refused; stranger refused under enforce, let through + logged under log (nothing checked before)', async () => {
        await refused(set(anon, ['uda', DAMA_DB, 'views', 'byId', viewA, 'version'], 'x'), /Sign in/);
        await withMode('enforce', () => refused(set(stranger, ['uda', DAMA_DB, 'views', 'byId', viewA, 'version'], 'x')));
        await withMode('log', async (warned) => {
            await allowed(set(stranger, ['uda', DAMA_DB, 'views', 'byId', viewA, 'version'], 'v1'));
            assert.strictEqual(warned.length, 1);
        });
    });
    await t('update-source on the view\'s source allows (enforce); the call echoes the row', async () => withMode('enforce', async () => {
        await allowed(set(editor, ['uda', DAMA_DB, 'views', 'byId', viewA, 'version'], 'v2'));
        const res = await call(editor, ['uda', 'views', 'update'], [DAMA_DB, viewA, { version: 'v3' }]);
        assert.strictEqual(res.jsonGraph.uda[DAMA_DB].views.byId[viewA].version, 'v3');
        await allowed(call(dsEditor, ['uda', 'views', 'update'], [DAMA_DB, viewB, { version: 'v2' }, dsPatternRef]));
    }));
    await t('view column whitelist: table location and source are not writable', async () => {
        await refused(call(owner, ['uda', 'views', 'update'], [DAMA_DB, viewA, { table_name: 'auth_users' }]), /Not writable/);
        await refused(call(owner, ['uda', 'views', 'update'], [DAMA_DB, viewA, { source_id: extB }]), /Not writable/);
    });
    await t('a missing view is refused under enforce', async () => withMode('enforce', () =>
        refused(call(owner, ['uda', 'views', 'update'], [DAMA_DB, 99999999, { version: 'x' }]))));

    console.log('\nsetIndex / setPrimaryKey / views.create / clearData:');
    for (const name of ['setIndex', 'setPrimaryKey']) {
        await t(`${name}: anon refused, stranger refused (enforce), update-source passes`, async () => {
            await refused(call(anon, ['uda', 'sources', name], [DAMA_DB, extA, 'nope', true]), /Sign in/);
            await withMode('enforce', async () => {
                await refused(call(stranger, ['uda', 'sources', name], [DAMA_DB, extA, 'nope', true]));
                await passesGate(call(editor, ['uda', 'sources', name], [DAMA_DB, extA, 'nope', true]));
                await passesGate(call(dsEditor, ['uda', 'sources', name], [DAMA_DB, extB, 'nope', true, dsPatternRef]));
            });
        });
    }
    // setRule / backfillRule answer a refusal as a value at sources.byId[id].rulesCall ({ ok, error }).
    // Their refusals are worded for the Rules page.
    const RULE_AUTH_RE = /Sign in|don't have permission/;
    const ruleRefusal = async (user, name, env, sourceId, args) => {
        const res = await call(user, ['uda', 'sources', name], [env, sourceId, ...args]);
        const out = res.jsonGraph.uda[env].sources.byId[sourceId].rulesCall;
        const r = (out && out.value) || out || {};
        return r.ok ? null : (r.error || 'error');
    };
    const ruleRefused = async (...a) => {
        const msg = await ruleRefusal(...a);
        assert(msg && RULE_AUTH_RE.test(msg), `expected a refusal, got: ${msg}`);
    };
    const rulePassesGate = async (...a) => {
        const msg = await ruleRefusal(...a);
        assert(!(msg && RULE_AUTH_RE.test(msg)), `expected to pass the permission gate, got: ${msg}`);
    };
    const ruleArgs = { setRule: [{ id: 'nope', params: {} }, true], backfillRule: ['nope'] };
    for (const name of ['setRule', 'backfillRule']) {
        await t(`${name}: anon refused, stranger refused (enforce), update-source passes; pattern arg last`, async () => {
            await ruleRefused(anon, name, DAMA_DB, extA, ruleArgs[name]);
            await withMode('enforce', async () => {
                await ruleRefused(stranger, name, DAMA_DB, extA, ruleArgs[name]);
                await rulePassesGate(editor, name, DAMA_DB, extA, ruleArgs[name]);
                await ruleRefused(dsEditor, name, DAMA_DB, extB, ruleArgs[name]);
                await rulePassesGate(dsEditor, name, DAMA_DB, extB, [...ruleArgs[name], dsPatternRef]);
            });
        });
        await t(`${name} on an internal source is checked against the env's pattern, not as an external source (enforce)`, async () => withMode('enforce', async () => {
            await rulePassesGate(dsEditor, name, INT_ENV, intSrc, [...ruleArgs[name], pattern]);
            await ruleRefused(stranger, name, INT_ENV, intSrc, [...ruleArgs[name], pattern]);
        }));
    }
    await t('views.create: create-view or update-source passes; stranger refused', async () => {
        await refused(call(anon, ['uda', 'views', 'create'], [DAMA_DB, extA, 'v9', null]), /Sign in/);
        await refused(call(stranger, ['uda', 'views', 'create'], [DAMA_DB, extA, 'v9', null]));
        await passesGate(call(versioner, ['uda', 'views', 'create'], [DAMA_DB, extA, 'v9', viewA]));
        await passesGate(call(editor, ['uda', 'views', 'create'], [DAMA_DB, extA, 'v9', viewA]));
    });
    await t('clearData (internal, env `app+slug`): edit-source-data passes, stranger refused (enforce)', async () => {
        await refused(call(anon, ['uda', 'viewsById', 'clearData'], [SLUG_ENV, viewId]), /Sign in/);
        await withMode('enforce', async () => {
            await refused(call(stranger, ['uda', 'viewsById', 'clearData'], [SLUG_ENV, viewId]));
            await passesGate(call(dsEditor, ['uda', 'viewsById', 'clearData'], [SLUG_ENV, viewId, pattern]));
        });
    });
    await t('clearData never empties the app\'s main table (per-app SQLite named it data_items__<app>)', async () => {
        const { rows } = await dms.query(`SELECT COUNT(*) AS n FROM ${tbl}`);
        assert.strictEqual(+rows[0].n, 5, `main table rows after clearData: ${rows[0].n}`);
    });

    console.log('\nsettings:');
    await t('settings.update needs edit-pattern on the named pattern (enforce)', async () => withMode('enforce', async () => {
        await allowed(call(dsEditor, ['uda', 'settings', 'update'], [DAMA_DB, '{"hidden_source_types":[]}', pattern]));
        await allowed(call(dsEditor, ['uda', 'settings', 'update'], [INT_ENV, '{}', pattern]));
        await refused(call(stranger, ['uda', 'settings', 'update'], [DAMA_DB, '{}', pattern]));
        await refused(call(dsEditor, ['uda', 'settings', 'update'], [DAMA_DB, '{}']));
        await refused(call(stranger, ['uda', 'settings', 'update'], [INT_ENV, '{}', { app: OTHER_APP, id: otherPattern }]));
        await refused(set(dsEditor, ['uda', DAMA_DB, 'settings'], '{}'));
    }));
    await t('settings: anon refused; log lets a stranger through and logs', async () => {
        await refused(call(anon, ['uda', 'settings', 'update'], [DAMA_DB, '{}', pattern]), /Sign in/);
        await refused(set(anon, ['uda', DAMA_DB, 'settings'], '{}'), /Sign in/);
        await withMode('log', async (warned) => {
            await allowed(call(stranger, ['uda', 'settings', 'update'], [DAMA_DB, '{"hidden_source_types":[]}', pattern]));
            assert.strictEqual(warned.length, 1);
        });
    });

    console.log('\ndeletes on a DMS env:');
    await t('enforce: delete-source is checked on internal sources (before: sign-in only)', async () => withMode('enforce', async () => {
        // A refused delete answers with an error atom on the delete path.
        const deleteError = async (user, opts) => {
            const res = await call(user, ['uda', 'sources', 'delete'], [INT_ENV, intSrc2, opts]);
            const out = res.jsonGraph.uda[INT_ENV].sources.delete;
            return (out && out.value && out.value.error) || null;
        };
        assert.match(await deleteError(stranger, {}) || '', /needs delete-source/);
        assert.match(await deleteError(dsEditor, { pattern }) || '', /needs delete-source/);
        const { rows } = await dms.query(`SELECT id FROM ${tbl} WHERE id = $1`, [intSrc2]);
        assert.strictEqual(rows.length, 1, 'refused delete left the source in place');
    }));

    // cleanup
    for (const [env, value] of Object.entries(savedSettings)) await setSettings(env, value);
    await dama.query(`DELETE FROM ${viewTbl} WHERE view_id = ANY($1)`, [[viewA, viewB]]);
    await dama.query(`DELETE FROM ${viewTbl} WHERE source_id = ANY($1)`, [[extA, extB]]);
    await dama.query(`DELETE FROM ${srcTbl} WHERE source_id = ANY($1)`, [[extA, extB]]);
}

run()
    .catch(e => { fail++; console.log(`  ✗ crashed\n      ${e.stack}`); })
    .then(() => {
        console.log(`\nuda-auth tests: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
