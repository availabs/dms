/**
 * Permission checks on data-type plugin routes (dms-template planning/shared datatype-plugin-route-permissions):
 * mountDatatypeRoutes puts writeGate in front of every plugin router (a write needs a signed-in user unless
 * the plugin lists it in `openRoutes`), and the plugin helpers authorizePublish / authorizeSourceWrite judge
 * each route's own permission, owner from the token. Both follow DMS_SOURCE_AUTH_MODE as for a route that
 * was open: `enforce` refuses, `log` lets the call through and logs once, `legacy` lets it through.
 *
 * Runs a real express app (the gate matches paths inside the mounted router) on a random port.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-datatype-auth.js   (DAMA_TEST_DB picks the pgEnv)
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB; // the resolver reads the datasets pattern from DMS_DB_ENV
const assert = require('assert');
const express = require('express');
const { dmsMainTable } = require('../src/routes/uda/utils');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); }
};

// Runs fn under DMS_SOURCE_AUTH_MODE=mode, collecting `would-deny` lines.
async function withMode(mode, fn) {
    const prev = process.env.DMS_SOURCE_AUTH_MODE;
    const warn = console.warn; const warned = [];
    process.env.DMS_SOURCE_AUTH_MODE = mode;
    console.warn = (...a) => { const s = a.join(' '); if (s.includes('would-deny')) warned.push(s); else warn(...a); };
    try { return await fn(warned); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_SOURCE_AUTH_MODE; else process.env.DMS_SOURCE_AUTH_MODE = prev; }
}

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
    const creator = { authed: true, id: 31, email: 'c@x', groups: ['Creators'] };   // create-source on the pattern
    const loader = { authed: true, id: 32, email: 'l@x', groups: ['Loaders'] };     // update-source on srcA
    const stranger = { authed: true, id: 33, email: 's@x', groups: ['Rando'] };

    // ---- DMS: a datasets pattern granting Creators create-source
    const APP = `dtauth_${Date.now()}`;
    await dmsMainTable(dms, APP, 'per-app');
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const dsPattern = +(await controller.createData([APP, 'site|ds:pattern', {
        pattern_type: 'datasets', authPermissions: { '*': { groups: { Creators: ['create-source'] }, users: {} } },
    }], null))[0].id;
    const named = `?dms_pattern=${encodeURIComponent(`${APP}/${dsPattern}`)}`;

    // ---- DaMa: srcA grants Loaders update-source, srcB grants nobody; viewA belongs to srcA
    const mkSource = async (ap) => (await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`dtauth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, JSON.stringify(ap)])).rows[0].source_id;
    const srcA = await mkSource({ groups: { Loaders: ['update-source'] }, users: {} });
    const srcB = await mkSource({ groups: { public: [] }, users: { 999999: ['*'] } }); // someone else's (no grants set would be open)
    const viewA = (await dama.query(`INSERT INTO ${viewTbl} (source_id) VALUES ($1) RETURNING view_id`, [srcA])).rows[0].view_id;

    // ---- a plugin with each kind of route
    const { registerDatatype, mountDatatypeRoutes } = require('../src/dama/datatypes');
    const reached = [];
    registerDatatype('dtauth', {
        openRoutes: ['POST /hook/:id'],
        routes: (router, helpers) => {
            router.get('/read', (req, res) => res.json({ ok: true }));
            router.post('/hook/:id', (req, res) => res.json({ ok: true, id: req.params.id }));
            router.post('/nocheck', (req, res) => { reached.push('nocheck'); res.json({ ok: true }); });
            router.post('/publish', async (req, res) => {
                const caller = await helpers.authorizePublish(req, res, req.body.source_id);
                if (!caller) return;
                res.json({ ok: true, owner: caller.id });
            });
            router.post('/append', async (req, res) => {
                const caller = await helpers.authorizeSourceWrite(req, res, { sourceId: req.body.source_id, viewId: req.body.view_id }, 'update-source');
                if (!caller) return;
                res.json({ ok: true, owner: caller.id });
            });
        },
    });
    const app = express();
    app.use(express.json());
    // Stands in for auth/jwt.js: the test names the user in a header.
    app.use((req, res, next) => {
        req.availAuthContext = { user: req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null };
        next();
    });
    mountDatatypeRoutes(app, { ...require('../src/dama/datatypes/auth').pluginHelpers });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/dama-admin/${DAMA_DB}/dtauth`;
    const call = async (method, path, { user, body } = {}) => {
        const r = await fetch(`${base}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': JSON.stringify(user) } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, body: await r.json().catch(() => null) };
    };

    await withMode('enforce', async () => {
        console.log('enforce: the mount gate');
        await t('anon write → 401 before the route runs; signed-in → reaches it', async () => {
            reached.length = 0;
            assert.strictEqual((await call('POST', '/nocheck')).status, 401);
            assert.deepStrictEqual(reached, []);
            assert.strictEqual((await call('POST', '/nocheck', { user: stranger })).status, 200);
            assert.deepStrictEqual(reached, ['nocheck']);
        });
        await t('reads and openRoutes stay open; an open route matches only its own path', async () => {
            assert.strictEqual((await call('GET', '/read')).status, 200);
            const h = await call('POST', '/hook/12');
            assert.strictEqual(h.status, 200);
            assert.strictEqual(h.body.id, '12');
            assert.strictEqual((await call('POST', '/hook/12/more')).status, 401);
        });

        console.log('enforce: plugin helpers');
        await t('publish, new source: create-source on the named pattern; owner = token user, not body user_id', async () => {
            const ok = await call('POST', `/publish${named}`, { user: creator, body: { user_id: 99 } });
            assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
            assert.strictEqual(ok.body.owner, creator.id);
            assert.strictEqual((await call('POST', `/publish${named}`, { user: stranger, body: {} })).status, 403);
            assert.strictEqual((await call('POST', '/publish', { user: creator, body: {} })).status, 403, 'no pattern named');
        });
        await t('publish, existing source: create-view / update-source on it', async () => {
            assert.strictEqual((await call('POST', '/publish', { user: loader, body: { source_id: srcA } })).status, 200);
            const r = await call('POST', '/publish', { user: loader, body: { source_id: srcB } });
            assert.strictEqual(r.status, 403);
            assert.match(r.body.error, /on source/);
        });
        await t('source write: judged on the view\'s own source, not a body source_id', async () => {
            assert.strictEqual((await call('POST', '/append', { user: loader, body: { view_id: viewA } })).status, 200);
            assert.strictEqual((await call('POST', '/append', { user: loader, body: { view_id: viewA, source_id: srcB } })).status, 200);
            assert.strictEqual((await call('POST', '/append', { user: stranger, body: { view_id: viewA, source_id: srcB } })).status, 403);
            assert.strictEqual((await call('POST', '/append', { user: loader, body: { source_id: srcB } })).status, 403);
        });
        await t('source write naming no source → 403', async () => {
            assert.strictEqual((await call('POST', '/append', { user: loader, body: {} })).status, 403);
        });
    });

    await withMode('log', async (warned) => {
        await t('log: anon write goes through with one would-deny line (gate + helper log once)', async () => {
            assert.strictEqual((await call('POST', '/nocheck')).status, 200);
            assert.strictEqual(warned.length, 1, warned.join('\n'));
            assert.match(warned[0], /would-deny route POST .*nocheck.*not signed in/);
            const p = await call('POST', '/publish', { body: { source_id: srcB } });
            assert.strictEqual(p.status, 200);
            assert.strictEqual(p.body.owner, null, 'an anonymous caller owns nothing');
            assert.strictEqual(warned.length, 2, warned.join('\n'));
        });
        await t('log: a signed-in caller without the grant goes through and logs; a granted one logs nothing', async () => {
            const before = warned.length;
            assert.strictEqual((await call('POST', '/append', { user: stranger, body: { source_id: srcA } })).status, 200);
            assert.strictEqual(warned.length, before + 1);
            assert.match(warned[warned.length - 1], /missing update-source|update-source/);
            assert.strictEqual((await call('POST', '/append', { user: loader, body: { source_id: srcA } })).status, 200);
            assert.strictEqual(warned.length, before + 1);
        });
    });

    await withMode('legacy', async (warned) => {
        await t('legacy: anon write goes through, nothing logged', async () => {
            assert.strictEqual((await call('POST', '/nocheck')).status, 200);
            assert.strictEqual((await call('POST', '/publish', { body: {} })).status, 200);
            assert.strictEqual(warned.length, 0);
        });
    });

    // ---- cleanup
    server.close();
    await dama.query(`DELETE FROM ${viewTbl} WHERE view_id = $1`, [viewA]);
    await dama.query(`DELETE FROM ${srcTbl} WHERE source_id IN ($1, $2)`, [srcA, srcB]);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
