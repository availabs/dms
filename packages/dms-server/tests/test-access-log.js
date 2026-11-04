#!/usr/bin/env node
/**
 * Access log (src/access-log/index.js): the guards' refusals counted in memory and upserted to access_log;
 * GET /dms-admin/:app/access-log for `${app} Admin` / AVAIL only. Temp SQLite only (DMS and auth); the guard
 * checks use DMS_DB_ENV (run with DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test).
 *
 *   DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-access-log.js
 */
'use strict';

const assert = require('assert');
const { join } = require('path');
const { readFileSync, mkdtempSync, rmSync } = require('fs');
const os = require('os');
const express = require('express');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');
const accessLog = require('../src/access-log');

if (!process.env.DMS_DB_ENV) {
    console.error('Run with DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test (the guard checks read DMS_DB_ENV).');
    process.exit(1);
}

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};

const runSql = async (db, file) => {
    for (const stmt of readFileSync(file, 'utf8').split(';').filter(s => s.trim())) await db.query(stmt + ';');
};
const withEnv = async (vars, fn) => {
    const prev = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    Object.assign(process.env, vars);
    const warn = console.warn; console.warn = () => {};
    try { return await fn(); } finally {
        console.warn = warn;
        for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
};

(async () => {
    const dir = mkdtempSync(join(os.tmpdir(), 'access-log-'));
    const db = new SqliteAdapter({ filename: join(dir, 'dms.sqlite') });
    const authDb = new SqliteAdapter({ filename: join(dir, 'auth.sqlite') });
    await runSql(db, join(__dirname, '../src/db/sql/dms/change_log.sqlite.sql'));
    await runSql(authDb, join(__dirname, '../src/db/sql/auth/auth_tables.sqlite.sql'));
    await authDb.query(`INSERT INTO users (email, password) VALUES ('ops@avail.test', 'x')`);
    await authDb.query(`INSERT INTO users_in_groups (user_email, group_name, created_by) VALUES ('ops@avail.test', 'AVAIL', 'test')`);

    const rows = async () => (await db.query('SELECT * FROM access_log ORDER BY id')).rows;
    const admin = { id: 1, email: 'admin@site.test', groups: ['siteA Admin'], authed: true };
    const viewer = { id: 2, email: 'viewer@site.test', groups: ['Viewers'], authed: true };
    const ops = { id: 3, email: 'ops@avail.test', groups: ['AVAIL'], authed: true };

    console.log('recorder:');
    await t('nothing is written until a db is handed over (the server registers the route)', async () => {
        accessLog._reset();
        accessLog.record({ app: 'siteA', guard: 'data', kind: 'edit page', target: '7', user: viewer, reason: 'x' });
        assert.strictEqual(await accessLog.flush(), 0);
        assert.strictEqual((await rows()).length, 0);
    });
    await t('distinct refusals become one row each, repeats a count', async () => {
        accessLog._reset({ db });
        for (let i = 0; i < 3; i++) accessLog.record({ app: 'siteA', guard: 'source', kind: 'source', target: 'siteA+x/5', perms: ['update-source'], user: viewer, reason: 'missing update-source' });
        accessLog.record({ app: 'siteA', guard: 'source', outcome: 'refused', kind: 'source', target: 'siteA+x/5', perms: ['update-source'], user: viewer, reason: 'missing update-source' });
        accessLog.record({ app: 'siteA', guard: 'read', kind: 'source', target: 'siteA+x/5', user: null, reason: 'not signed in' });
        assert.strictEqual(await accessLog.flush(), 3);
        const r = await rows();
        assert.strictEqual(r.length, 3);
        const wd = r.find(x => x.outcome === 'would-deny' && x.guard === 'source');
        assert.strictEqual(+wd.count, 3);
        assert.strictEqual(wd.principal, '2');
        assert.strictEqual(wd.user_email, 'viewer@site.test');
        assert.strictEqual(wd.perms, 'update-source');
        assert.strictEqual(r.find(x => x.guard === 'read').principal, 'anon');
    });
    await t('a later flush adds to the same row (upsert), last_seen moves, first_seen stays', async () => {
        const before = (await rows()).find(x => x.outcome === 'would-deny' && x.guard === 'source');
        await new Promise(r => setTimeout(r, 5));
        accessLog.record({ app: 'siteA', guard: 'source', kind: 'source', target: 'siteA+x/5', perms: ['update-source'], user: viewer, reason: 'missing update-source; blank row' });
        await accessLog.flush();
        const after = (await rows()).find(x => x.id === before.id);
        assert.strictEqual(+after.count, 4);
        assert.strictEqual(after.first_seen, before.first_seen);
        assert.ok(after.last_seen > before.last_seen);
        assert.match(after.reason, /blank row/);
        assert.strictEqual((await rows()).length, 3);
    });
    await t('DMS_ACCESS_LOG=off records nothing', async () => withEnv({ DMS_ACCESS_LOG: 'off' }, async () => {
        accessLog.record({ app: 'siteA', guard: 'data', kind: 'edit page', target: '8', user: viewer });
        assert.strictEqual(accessLog._pending().size, 0);
    }));

    console.log('\nguards record (log → would-deny, enforce → refused):');
    const { isUserAuthedForPattern } = require('../src/routes/auth/sourceGuards');
    const { readerAllowed } = require('../src/routes/auth/requestUser');
    const ref = { app: 'siteA', patternId: 99999999 };   // not found → denied
    await t('source guard, pattern check: log records would-deny and allows', async () => withEnv({ DMS_AUTH_MODE: 'log' }, async () => {
        accessLog._reset({ db });
        assert.strictEqual(await isUserAuthedForPattern({ patternRef: ref, reqPermissions: ['create-source'], user: viewer }), true);
        const [p] = [...accessLog._pending().values()];
        assert.deepStrictEqual([p.app, p.guard, p.outcome, p.kind, p.target, p.perms], ['siteA', 'source', 'would-deny', 'pattern', 'siteA/99999999', 'create-source']);
    }));
    await t('source guard, pattern check: enforce records refused and refuses', async () => withEnv({ DMS_AUTH_MODE: 'enforce' }, async () => {
        accessLog._reset({ db });
        assert.strictEqual(await isUserAuthedForPattern({ patternRef: ref, reqPermissions: ['create-source'], user: viewer }), false);
        assert.strictEqual([...accessLog._pending().values()][0].outcome, 'refused');
        assert.strictEqual(readerAllowed(null, 'GET /tasks'), false);
        assert.ok([...accessLog._pending().values()].some(p => p.kind === 'read' && p.principal === 'anon' && p.outcome === 'refused'));
    }));
    await t('a refusal is never recorded for an allowed request', async () => withEnv({ DMS_AUTH_MODE: 'enforce' }, async () => {
        accessLog._reset({ db });
        assert.strictEqual(readerAllowed(viewer, 'GET /tasks'), true);
        assert.strictEqual(accessLog._pending().size, 0);
    }));

    console.log('\nGET /dms-admin/:app/access-log:');
    const server = express();
    let as = null;
    server.use((req, _res, next) => { req.availAuthContext = { user: as }; next(); });
    accessLog.registerAccessLogRoutes(server, { authDb });
    accessLog._reset({ db });   // registering activates; keep the test db
    accessLog.record({ app: 'siteA', guard: 'data', kind: 'edit page', target: '7 docs|page', user: viewer, reason: 'missing edit-page' });
    accessLog.record({ app: 'siteB', guard: 'data', kind: 'edit page', target: '9 b|page', user: viewer, reason: 'missing edit-page' });
    accessLog.record({ app: '', guard: 'source', kind: 'source', target: 'npmrds2/4', user: viewer, reason: 'missing update-source' });
    const listener = await new Promise(r => { const l = server.listen(0, () => r(l)); });
    const base = `http://127.0.0.1:${listener.address().port}`;
    const get = async (user, path) => { as = user; const res = await fetch(base + path); return { status: res.status, body: await res.json() }; };

    await t('anon → 401; a non-admin → 403', async () => {
        assert.strictEqual((await get(null, '/dms-admin/siteA/access-log')).status, 401);
        assert.strictEqual((await get(viewer, '/dms-admin/siteA/access-log')).status, 403);
    });
    await t('`${app} Admin` sees its own app only, newest first, pending counts included', async () => {
        accessLog.record({ app: 'siteA', guard: 'data', kind: 'edit page', target: '7 docs|page', user: viewer, reason: 'missing edit-page' });
        const r = await get(admin, '/dms-admin/siteA/access-log');
        assert.strictEqual(r.status, 200);
        assert.ok(r.body.rows.every(x => x.app === 'siteA'));
        assert.ok(r.body.rows.some(x => x.target === '7 docs|page'));
        assert.strictEqual(r.body.rows[0].last_seen >= r.body.rows[r.body.rows.length - 1].last_seen, true);
        assert.strictEqual((await get(admin, '/dms-admin/siteB/access-log')).status, 403);
    });
    await t('filters: guard, outcome, user (email substring or id), target', async () => {
        assert.strictEqual((await get(admin, '/dms-admin/siteA/access-log?guard=read')).body.rows.every(x => x.guard === 'read'), true);
        assert.strictEqual((await get(admin, '/dms-admin/siteA/access-log?outcome=refused')).body.rows.every(x => x.outcome === 'refused'), true);
        assert.ok((await get(admin, '/dms-admin/siteA/access-log?user=VIEWER')).body.rows.length > 0);
        assert.ok((await get(admin, '/dms-admin/siteA/access-log?user=2')).body.rows.length > 0);
        assert.strictEqual((await get(admin, '/dms-admin/siteA/access-log?user=nobody')).body.rows.length, 0);
        assert.deepStrictEqual((await get(admin, '/dms-admin/siteA/access-log?target=docs')).body.rows.map(x => x.target), ['7 docs|page']);
    });
    await t('AVAIL sees any app and the unattributed rows (`_none`); a site admin can\'t', async () => {
        assert.strictEqual((await get(ops, '/dms-admin/siteB/access-log')).status, 200);
        const none = await get(ops, '/dms-admin/_none/access-log');
        assert.strictEqual(none.status, 200);
        assert.deepStrictEqual(none.body.rows.map(x => x.target), ['npmrds2/4']);
        assert.strictEqual((await get(admin, '/dms-admin/_none/access-log')).status, 403);
    });
    await t('summary: times by outcome and distinct users, over the filters but both outcomes', async () => {
        const every = (await get(admin, '/dms-admin/siteA/access-log?limit=1000')).body.rows;
        const sum = (o) => every.filter(x => x.outcome === o).reduce((n, x) => n + x.count, 0);
        const r = await get(admin, '/dms-admin/siteA/access-log?outcome=refused');
        assert.ok(r.body.rows.every(x => x.outcome === 'refused'));
        assert.deepStrictEqual(r.body.summary,
            { wouldDeny: sum('would-deny'), refused: sum('refused'), users: new Set(every.map(x => x.principal)).size });
        assert.ok(r.body.summary.wouldDeny > 0 && r.body.summary.refused > 0);
    });
    await t('limit / offset page the rows; total counts them all', async () => {
        const r = await get(ops, '/dms-admin/siteA/access-log?limit=1');
        assert.strictEqual(r.body.rows.length, 1);
        assert.ok(r.body.total > 1);
        const r2 = await get(ops, '/dms-admin/siteA/access-log?limit=1&offset=1');
        assert.notStrictEqual(r2.body.rows[0].id, r.body.rows[0].id);
    });

    listener.close();
    accessLog._reset();
    await db.end?.(); await authDb.end?.();
    rmSync(dir, { recursive: true, force: true });
    console.log(`\naccess-log tests: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
