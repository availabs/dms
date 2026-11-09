/**
 * Datasets sources through `authorize` (routes/auth): the grant shape and name-match (grants.js), then
 * decisions on real sqlite DBs — internal sources under a datasets pattern's env, external (pgEnv)
 * sources with and without a named pattern, `${app} Admin`, the blank-row rule, the mode and the
 * `strict` surfaces — and request identity (requestUser.js).
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-source-auth.js   (DAMA_TEST_DB picks the pgEnv; local sqlite by default)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const { mergeAuthPermissions, holds, resolveAuthPermissions, scopeOf, hasGrants } = require('../src/routes/auth/grants');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };
const ta = async (name, fn) => { try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); } };

const anon = null;
const editor = { authed: true, id: 7, groups: ['NYSDOT'] };
const avail = { authed: true, id: 1, groups: ['AVAIL'] };
const stranger = { authed: true, id: 99, groups: ['Rando'] };

console.log('grants.js — the stored shape:');
const pat = { groups: { public: ['view-source'], NYSDOT: ['view-source', 'download-source'] }, users: {} };
t('mergeAuthPermissions: no override → base', () => assert.deepStrictEqual(mergeAuthPermissions(pat, undefined), pat));
t('mergeAuthPermissions: a group is added, replaced, or revoked by []', () => {
    assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { AVAIL: ['*'] } }).groups.AVAIL, ['*']);
    assert.deepStrictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: ['*'] } }).groups.NYSDOT, ['*']);
    assert.strictEqual(mergeAuthPermissions(pat, { groups: { NYSDOT: [] } }).groups.NYSDOT, undefined);
    assert.strictEqual(mergeAuthPermissions({ groups: {}, users: { 5: ['*'] } }, { users: { 5: [] } }).users[5], undefined);
});
t('resolveAuthPermissions: flat, subdomain-keyed, JSON text, garbage', () => {
    assert.deepStrictEqual(resolveAuthPermissions(pat), pat);
    assert.deepStrictEqual(resolveAuthPermissions({ '*': { groups: { A: ['x'] } }, songs: { groups: { A: ['*'] } } }, 'songs'), { groups: { A: ['*'] } });
    assert.deepStrictEqual(resolveAuthPermissions({ '*': JSON.stringify({ groups: { A: ['x'] } }) }, 'other'), { groups: { A: ['x'] } });
    assert.deepStrictEqual(resolveAuthPermissions('not json'), {});
    assert.deepStrictEqual(resolveAuthPermissions(null), {});
});
t('scopeOf: a scoped grant answers for one scope; a flat grant for both', () => {
    const scoped = { self: { groups: { A: ['edit-pattern'] } }, descendants: { groups: { A: ['edit-page'] } } };
    assert.deepStrictEqual(scopeOf(scoped, 'self').groups.A, ['edit-pattern']);
    assert.deepStrictEqual(scopeOf(scoped, 'descendants').groups.A, ['edit-page']);
    assert.deepStrictEqual(scopeOf(pat, 'self'), pat);
});
t('hasGrants ignores the public group the Access editor seeds', () => {
    assert.strictEqual(hasGrants({ groups: { public: ['view-source'] } }), false);
    assert.strictEqual(hasGrants({ groups: { public: [], A: ['x'] } }), true);
    assert.strictEqual(hasGrants({ users: { 1: ['*'] } }), true);
});
t('holds: own entry, a group, public, or *; never "nothing set ⇒ open"', () => {
    const ap = { groups: { AVAIL: ['*'], NYSDOT: ['update-source'], public: ['view-source'] }, users: { 1: ['delete-source'] } };
    assert.strictEqual(holds(editor, ap, ['update-source']), true);
    assert.strictEqual(holds(editor, ap, ['delete-source']), false);
    assert.strictEqual(holds(avail, ap, ['delete-source']), true);
    assert.strictEqual(holds({ authed: true, id: 1, groups: [] }, ap, ['delete-source']), true);
    assert.strictEqual(holds(anon, ap, ['view-source']), true);
    assert.strictEqual(holds(anon, ap, ['update-source']), false);
    assert.strictEqual(holds(editor, {}, ['view-source']), false, 'blank grants hold nothing — the judge opens reads, not this');
    assert.strictEqual(holds(editor, ap, []), true);
});

// ------------------------------------------------------------------------------------------------
// Decisions against real sqlite DBs
// ------------------------------------------------------------------------------------------------
const { authorize, assertCan, clearSnapshots } = require('../src/routes/auth');
const { requestUserId, requestUserIdWarnBody } = require('../src/routes/auth/requestUser');
const { dmsMainTable } = require('../src/routes/uda/utils');
const syncMirror = require('./mirror-sync');

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
    // Through the controller: its id allocator must know the fixture rows, or the mirror's own creates collide.
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const insert = async (table, app, type, data) => +(await controller.createData([app, type, data], null))[0].id;

    // DMS side: a datasets pattern over env1 (dmsEnvId), a legacy pattern listing a source on itself, a page pattern.
    const grantedSrc = await insert(tbl, APP, 'env1|roads:source', { name: 'roads', auth_permissions: { groups: { Counties: ['edit-source-data'] } } });
    const bareSrc = await insert(tbl, APP, 'env1|bridges:source', { name: 'bridges' });
    const revokedSrc = await insert(tbl, APP, 'env1|dams:source', { name: 'dams', auth_permissions: { groups: { DHSES: [] } } });
    const strayInternal = await insert(tbl, APP, 'env9|stray:source', { name: 'stray' });
    const legacySrc = await insert(tbl, APP, 'old|hazards:source', { name: 'hazards' });
    // The env holds the grants over its sources (rule 3: the datasets pattern is not their ancestor).
    const envRow = await insert(tbl, APP, 'site|env1:dmsenv', { sources: [{ id: grantedSrc }, { id: bareSrc }, { id: revokedSrc }],
        authPermissions: { '*': JSON.stringify({ groups: { DHSES: ['update-source', 'create-source'] }, users: { 42: ['delete-source'] } }) } });
    const dsPattern = await insert(tbl, APP, 'site|ds:pattern', { pattern_type: 'datasets', dmsEnvId: envRow });
    // The pgEnv's env row of this site: its grants reach every external source for a request naming the site.
    await insert(tbl, APP, 'site|extenv:dmsenv', { name: 'extenv', pgEnv: DAMA_DB,
        authPermissions: { groups: { DHSES: ['update-source'] }, users: {} } });
    await insert(tbl, APP, 'site|legacy_ds:pattern', {
        pattern_type: 'datasets', sources: [{ id: legacySrc }],
        authPermissions: JSON.stringify({ groups: { BILD: ['update-source'] }, users: {} }),
    });
    await insert(tbl, APP, 'site|docs:pattern', { pattern_type: 'page', authPermissions: { '*': { groups: { Rando: ['*'] } } } });
    await insert(otherTbl, OTHER_APP, 'site|ds:pattern', { pattern_type: 'datasets', authPermissions: { groups: { Rando: ['*'] } } });

    // DaMa side.
    const srcTbl = dama.type === 'postgres' ? 'data_manager.sources' : 'sources';
    const ext = async (ap) => (await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`srcauth_${Date.now()}_${Math.random()}`, JSON.stringify(ap)])).rows[0].source_id;
    const extGranted = await ext({ groups: { AVAIL: ['*'], public: [] }, users: {} });
    const extEmpty = await ext({});
    const extOwned = await ext({ groups: { public: [] }, users: { 1: ['*'] } }); // a new source: creator only
    await syncMirror(APP, DAMA_DB);   // the pgEnv's rows as rows of this site (dama/mirror.js)

    const ENV = `${APP}+ds`;
    const dhses = { authed: true, id: 7, groups: ['DHSES'] };
    const county = { authed: true, id: 8, groups: ['Counties'] };
    const bild = { authed: true, id: 9, groups: ['BILD'] };
    const rando = { authed: true, id: 10, groups: ['Rando'] };
    const admin = { authed: true, id: 11, groups: [`${APP} Admin`] };
    const user42 = { authed: true, id: 42, groups: [] };
    const allow = async (o) => (await authorize(o)).allow;

    console.log('\nauthorize — internal (DMS env) sources:');
    await ta('the datasets pattern over the env lends its grants (DHSES update-source; user 42 delete-source)', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, verb: 'update-source', user: dhses }), true);
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, verb: 'delete-source', user: user42 }), true);
    });
    await ta('a source grant adds on top (Counties edit-source-data); a source [] revokes (DHSES on dams)', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: grantedSrc, verb: 'edit-source-data', user: county }), true);
        assert.strictEqual(await allow({ env: ENV, sourceId: revokedSrc, verb: 'update-source', user: dhses }), false);
    });
    await ta('ungranted and anonymous callers are refused; ${app} Admin passes everything', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, verb: 'update-source', user: county }), false);
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, verb: 'update-source', user: null }), false);
        assert.strictEqual(await allow({ env: ENV, sourceId: bareSrc, verb: 'delete-source', user: admin }), true);
    });
    await ta('a legacy pattern listing a source on itself lends nothing: a pattern governs only its own rows (migrate-to-dmsenv gives it an env)', async () =>
        assert.strictEqual(await allow({ env: `${APP}+legacy_ds`, sourceId: legacySrc, verb: 'update-source', user: bild }), false));
    await ta('a source outside the pattern\'s env gets nothing from it', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: strayInternal, verb: 'update-source', user: dhses }), false);
        assert.strictEqual(await allow({ env: ENV, sourceId: legacySrc, verb: 'update-source', user: dhses }), false);
    });
    await ta('a missing row or a non-source row id is refused (fail closed)', async () => {
        assert.strictEqual(await allow({ env: ENV, sourceId: 99999999, verb: 'update-source', user: dhses }), false);
        assert.strictEqual(await allow({ env: ENV, sourceId: dsPattern, verb: 'update-source', user: dhses }), false);
    });
    await ta('a view is judged on its source; split data rows on theirs', async () => {
        const viewId = await insert(tbl, APP, 'bridges|v1:view', { name: 'v1' });
        assert.strictEqual(await allow({ env: ENV, viewId, verb: 'update-source', user: dhses }), true);
        assert.strictEqual(await allow({ env: ENV, viewId, verb: 'update-source', user: county }), false);
        assert.strictEqual(await allow({ row: { id: null, app: APP, type: `roads|${viewId}:data`, data: {} }, verb: 'create', user: county }), true);
    });

    console.log('\nauthorize — external (pgEnv) sources:');
    await ta('a source\'s own grants count, in the site the caller names; naming none is refused', async () => {
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extGranted, verb: 'delete-source', user: avail, app: APP }), true);
        const d = await authorize({ env: DAMA_DB, sourceId: extGranted, verb: 'delete-source', user: avail });
        assert.strictEqual(d.allow, false); assert.match(d.reason, /no site named/);
    });
    await ta('no grants set → edits refused for whoever the env grants nothing; reads open (owner 2026-10-29)', async () => {
        // the env row grants DHSES, so the composite owner is not blank: a plain refusal (the blank-row
        // marker is covered on internal sources in test-data-auth.js)
        const d = await authorize({ env: DAMA_DB, sourceId: extEmpty, verb: 'update-source', user: county, app: APP });
        assert.strictEqual(d.allow, false);
        assert.match(d.reason, /missing update-source/);
        assert.strictEqual(d.blank, undefined);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extEmpty, verb: 'read', user: county, app: APP }), true);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extEmpty, verb: 'read', user: null, app: APP }), true);
    });
    await ta('a creator-only source refuses others, reads included', async () => {
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'update-source', user: county, app: APP }), false);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'read', user: county, app: APP }), false);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'read', user: { authed: true, id: 1, groups: [] }, app: APP }), true);
    });
    await ta('the env row of the site the caller names lends its grants; its ${app} Admin passes', async () => {
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'update-source', user: dhses, app: APP }), true);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'delete-source', user: admin, app: APP }), true, 'the requesting site\'s admin');
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'update-source', user: dhses }), false, 'no site named: refused');
    });
    await ta('a site with no env row for the pgEnv, or a pattern\'s own grants, lend nothing', async () => {
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'update-source', user: dhses, app: OTHER_APP }), false);
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: extOwned, verb: 'update-source', user: rando, app: APP }), false, 'Rando: * on a page pattern only');
    });
    await ta('a missing row is refused (fail closed)', async () =>
        assert.strictEqual(await allow({ env: DAMA_DB, sourceId: 99999999, verb: 'update-source', user: avail, app: APP }), false));

    console.log('\nauthorize — the env itself (create-source):');
    await ta('create-source is asked of the env, named by its pattern or env instance; an unknown env → the site row', async () => {
        assert.strictEqual(await allow({ env: ENV, app: APP, verb: 'create-source', user: dhses }), true, 'by the pattern instance');
        assert.strictEqual(await allow({ env: `${APP}+env1`, app: APP, verb: 'create-source', user: dhses }), true, 'by the env instance');
        assert.strictEqual(await allow({ env: ENV, app: APP, verb: 'create-source', user: county }), false);
        assert.strictEqual(await allow({ env: `${APP}+nope`, app: APP, verb: 'create-source', user: dhses }), false, 'no such env (and no site row here): refused');
        assert.strictEqual(await allow({ env: DAMA_DB, app: APP, verb: 'create-source', user: dhses }), false, 'the pgEnv\'s env row grants DHSES update-source only');
        assert.strictEqual(await allow({ env: DAMA_DB, app: OTHER_APP, verb: 'create-source', user: dhses }), false, 'no env row in that site');
    });

    console.log('\nDMS_AUTH_MODE through the Falcor guard (log | enforce; `strict` for the external writes):');
    const withMode = async (mode, fn) => {
        const prev = process.env.DMS_AUTH_MODE;
        process.env.DMS_AUTH_MODE = mode;
        const warn = console.warn; const warned = [];
        console.warn = (...a) => warned.push(a.join(' '));
        try { return await fn(warned); } finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev; }
    };
    const can = (user, o) => assertCan({ user, subdomain: '', requestApp: APP }, o).then(() => true, (e) => { if (!/^Not authorized|^Sign in/.test(e.message)) throw e; return false; });
    await ta('log (default): an internal source allows and logs the would-deny', async () => withMode('', async (warned) => {
        assert.strictEqual(await can(county, { env: ENV, source: bareSrc, verb: 'update-source' }), true);
        assert.ok(warned.some(w => w.includes('would-deny update-source source') && w.includes(`/${bareSrc}`)), warned.join('\n'));
    }));
    await ta('an ungranted external write: log allows with a would-deny line; enforce refuses', async () => {
        await withMode('log', async (warned) => {
            assert.strictEqual(await can(county, { env: DAMA_DB, source: extEmpty, verb: 'update-source' }), true);
            assert.strictEqual(warned.length, 1, warned.join('\n'));
            assert.match(warned[0], /would-deny update-source source .* reason=missing update-source/);
        });
        await withMode('enforce', async () =>
            assert.strictEqual(await can(county, { env: DAMA_DB, source: extEmpty, verb: 'update-source' }), false));
    });
    await ta('an external source with grants follows the mode like any row: log allows and logs, enforce refuses (`strict` is gone)', async () => {
        await withMode('log', async (warned) => {
            assert.strictEqual(await can(rando, { env: DAMA_DB, source: extOwned, verb: 'update-source' }), true);
            assert.strictEqual(warned.length, 1);
        });
        await withMode('enforce', async () => assert.strictEqual(await can(rando, { env: DAMA_DB, source: extOwned, verb: 'update-source' }), false));
    });
    await ta('log: a granted request logs nothing; enforce refuses the ungranted', async () => {
        await withMode('log', async (warned) => {
            assert.strictEqual(await can(dhses, { env: ENV, source: bareSrc, verb: 'update-source' }), true);
            assert.strictEqual(warned.length, 0);
        });
        await withMode('enforce', async () => assert.strictEqual(await can(county, { env: ENV, source: bareSrc, verb: 'update-source' }), false));
    });
    await ta('env check: log allows + logs, enforce refuses; anonymous is always refused', async () => {
        const o = { env: ENV, verb: 'create-source' };
        await withMode('log', async (warned) => { assert.strictEqual(await can(county, o), true); assert.strictEqual(warned.length, 1); });
        await withMode('enforce', async () => assert.strictEqual(await can(county, o), false));
        await withMode('log', async () => assert.strictEqual(await can(null, o), false));
    });
    clearSnapshots();

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
}

dbTests()
    .catch(e => { fail++; console.log(`  ✗ db tests crashed\n      ${e.stack}`); })
    .then(() => {
        console.log(`\nsource-auth tests: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
