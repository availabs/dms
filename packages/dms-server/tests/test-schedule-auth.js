/**
 * Permission checks on schedules, reruns and task status reads (permissions-ds-schedules-and-tasks):
 * create / patch / delete / fire a schedule and rerun a task need `update-source` on the source the
 * schedule or task belongs to (read from the stored row; a PATCH that moves a schedule needs it on both
 * sources); with no source, `edit-pattern` on the named datasets pattern. Schedule, run, task and event
 * reads need a signed-in user under `enforce` (`log` lets anon through and logs it).
 *
 * Handlers are run off a fake express app (as test-upload-auth.js does).
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-schedule-auth.js   (DAMA_TEST_DB picks the pgEnv)
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB; // the resolver reads the datasets pattern from DMS_DB_ENV
const assert = require('assert');
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

// Every handler of every route, off a fake express app.
function captureRoutes(registerFn, routes = {}) {
    const fakeApp = {};
    for (const method of ['get', 'post', 'patch', 'delete', 'put', 'use']) {
        fakeApp[method] = (p, ...handlers) => { routes[`${method.toUpperCase()} ${p}`] = handlers; };
    }
    registerFn(fakeApp);
    return routes;
}

function fakeRes() {
    let finish;
    return {
        statusCode: 200, body: undefined,
        done: new Promise(r => { finish = r; }),
        status(c) { this.statusCode = c; return this; },
        json(o) { this.body = o; finish(); return this; },
        send(o) { this.body = o; finish(); return this; },
    };
}

let routes;
// Run a route's handler chain the way express would; resolves with the response once one is sent.
async function hit(key, { user = null, params = {}, query = {}, body = {} } = {}) {
    const handlers = routes[key];
    assert(handlers, `no route ${key}`);
    const req = { headers: {}, params: { pgEnv: DAMA_DB, ...params }, query, body, method: key.split(' ')[0], originalUrl: key, availAuthContext: { user } };
    const res = fakeRes();
    for (const h of handlers) {
        let nextCalled = false;
        await h(req, res, () => { nextCalled = true; });
        if (!nextCalled) break;
    }
    await Promise.race([res.done, new Promise((_, rej) => setTimeout(() => rej(new Error(`${key} sent no response`)), 10000))]);
    return res;
}

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB); getDb(DAMA_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const dama = getDb(DAMA_DB);
    const pg = dama.type === 'postgres';
    const srcTbl = pg ? 'data_manager.sources' : 'sources';
    const tasks = require('../src/dama/tasks');
    const schedules = require('../src/dama/tasks/schedules');
    const { registerDatatype } = require('../src/dama/datatypes');
    registerDatatype('schedauth_dt', {
        workers: { 'schedauth_dt/run': async () => ({ ok: true }) },
        schedulables: { 'schedauth_dt/run': { label: 'Sched auth', params: [], buildDescriptor: () => ({}) } },
    });
    routes = captureRoutes(require('../src/dama/tasks/schedule-routes').registerScheduleRoutes);
    captureRoutes(require('../src/dama/upload').registerUploadRoutes, routes);

    // ---- users
    const scheduler = { authed: true, id: 21, email: 'sch@x', groups: ['Schedulers'] };  // update-source on srcA
    const patterner = { authed: true, id: 22, email: 'pat@x', groups: ['Patterners'] };  // edit-pattern on the pattern
    const stranger = { authed: true, id: 23, email: 'str@x', groups: ['Rando'] };

    // ---- DMS: a datasets pattern granting Patterners edit-pattern
    const APP = `schedauth_${Date.now()}`;
    await dmsMainTable(dms, APP, 'per-app');
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const dsPattern = +(await controller.createData([APP, 'site|ds:pattern', {
        pattern_type: 'datasets', authPermissions: { '*': { groups: { Patterners: ['edit-pattern'] }, users: {} } },
    }], null))[0].id;
    const Q = { dms_pattern: `${APP}/${dsPattern}` };

    // ---- DaMa: srcA grants Schedulers update-source, srcB grants nobody
    const mkSource = async (ap) => (await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`schedauth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, JSON.stringify(ap)])).rows[0].source_id;
    const srcA = await mkSource({ groups: { Schedulers: ['update-source'] }, users: {} });
    const srcB = await mkSource({ groups: {}, users: {} });
    const made = [];
    const mkSchedule = async (source_id) => {
        const row = await schedules.createSchedule({ source_id, worker_path: 'schedauth_dt/run', cron: '0 2 * * *', timezone: 'America/New_York', descriptor: {}, enabled: false, max_in_flight: 1, created_by: 1 }, DAMA_DB);
        made.push(row.schedule_id);
        return row.schedule_id;
    };
    const schedA = await mkSchedule(srcA);
    const schedNone = await mkSchedule(null);
    const taskA = await tasks.queueTask({ workerPath: 'schedauth_dt/run', sourceId: srcA, marker: 'a' }, DAMA_DB);
    const taskNone = await tasks.queueTask({ workerPath: 'schedauth_dt/run', sourceId: null, marker: 'none' }, DAMA_DB);
    const newBody = (source_id) => ({ source_id, worker_path: 'schedauth_dt/run', cron: '0 3 * * *', enabled: false });

    await withMode('enforce', async () => {
        console.log('enforce: mutations on a source need update-source on it:');
        await t('create: scheduler on srcA → 200, created_by = token user; on srcB → 403; stranger → 403; anon → 401', async () => {
            const ok = await hit('POST /dama-admin/:pgEnv/schedules', { user: scheduler, body: { ...newBody(srcA), created_by: 1 } });
            assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
            made.push(ok.body.schedule_id);
            assert.strictEqual(+ok.body.created_by, scheduler.id);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules', { user: scheduler, body: newBody(srcB) })).statusCode, 403);
            const s = await hit('POST /dama-admin/:pgEnv/schedules', { user: stranger, body: newBody(srcA) });
            assert.strictEqual(s.statusCode, 403);
            assert.match(s.body.error, /update-source on source/);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules', { body: newBody(srcA) })).statusCode, 401);
        });
        await t('patch / fire / delete: judged on the stored source, not the body', async () => {
            const p = (user, body) => hit('PATCH /dama-admin/:pgEnv/schedules/:id', { user, params: { id: schedA }, body });
            assert.strictEqual((await p(stranger, { cron: '0 4 * * *' })).statusCode, 403);
            // naming a source the stranger can't touch either changes nothing about the stored one
            assert.strictEqual((await p(stranger, { source_id: srcA, cron: '0 4 * * *' })).statusCode, 403);
            assert.strictEqual((await p(scheduler, { cron: '0 4 * * *' })).statusCode, 200);
            assert.strictEqual((await schedules.getSchedule(schedA, DAMA_DB)).cron, '0 4 * * *');
            const f = (user) => hit('POST /dama-admin/:pgEnv/schedules/:id/fire', { user, params: { id: schedA } });
            assert.strictEqual((await f(stranger)).statusCode, 403);
            const fired = await f(scheduler);
            assert.strictEqual(fired.statusCode, 200, JSON.stringify(fired.body));
            const d = (user) => hit('DELETE /dama-admin/:pgEnv/schedules/:id', { user, params: { id: schedA } });
            assert.strictEqual((await d(stranger)).statusCode, 403);
            assert(await schedules.getSchedule(schedA, DAMA_DB), 'refused delete kept the schedule');
        });
        await t('patch that moves a schedule needs update-source on both sources', async () => {
            const res = await hit('PATCH /dama-admin/:pgEnv/schedules/:id', { user: scheduler, params: { id: schedA }, body: { source_id: srcB } });
            assert.strictEqual(res.statusCode, 403);
            assert.match(res.body.error, new RegExp(`source ${srcB}`));
            assert.strictEqual(+(await schedules.getSchedule(schedA, DAMA_DB)).source_id, srcA);
        });
        await t('missing schedule / task → 404 only after sign-in (anon → 401)', async () => {
            assert.strictEqual((await hit('PATCH /dama-admin/:pgEnv/schedules/:id', { params: { id: 999999 } })).statusCode, 401);
            assert.strictEqual((await hit('DELETE /dama-admin/:pgEnv/schedules/:id', { user: stranger, params: { id: 999999 } })).statusCode, 404);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/tasks/:taskId/rerun', { user: stranger, params: { taskId: 999999 } })).statusCode, 404);
        });
        await t('rerun: scheduler on srcA\'s task → 200 with rerun_by = token user; stranger → 403', async () => {
            const r = (user) => hit('POST /dama-admin/:pgEnv/tasks/:taskId/rerun', { user, params: { taskId: taskA } });
            assert.strictEqual((await r(stranger)).statusCode, 403);
            const ok = await r(scheduler);
            assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
            const row = await tasks.getTaskStatus(ok.body.task_id, DAMA_DB);
            const desc = typeof row.descriptor === 'string' ? JSON.parse(row.descriptor) : row.descriptor;
            assert.strictEqual(desc.rerun_by, scheduler.id);
            assert.strictEqual(desc.marker, 'a');
        });

        console.log('enforce: no source → edit-pattern on the named pattern:');
        await t('create / fire / delete a source-less schedule and rerun a source-less task', async () => {
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules', { user: scheduler, query: Q, body: newBody(null) })).statusCode, 403);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules', { user: patterner, body: newBody(null) })).statusCode, 403, 'no pattern named');
            const ok = await hit('POST /dama-admin/:pgEnv/schedules', { user: patterner, query: Q, body: newBody(null) });
            assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
            made.push(ok.body.schedule_id);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules/:id/fire', { user: stranger, query: Q, params: { id: schedNone } })).statusCode, 403);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules/:id/fire', { user: patterner, query: Q, params: { id: schedNone } })).statusCode, 200);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/tasks/:taskId/rerun', { user: scheduler, query: Q, params: { taskId: taskNone } })).statusCode, 403);
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/tasks/:taskId/rerun', { user: patterner, query: Q, params: { taskId: taskNone } })).statusCode, 200);
            assert.strictEqual((await hit('DELETE /dama-admin/:pgEnv/schedules/:id', { user: patterner, query: Q, params: { id: ok.body.schedule_id } })).statusCode, 200);
        });
        await t('the patterner\'s edit-pattern doesn\'t reach a schedule on a source', async () => {
            assert.strictEqual((await hit('DELETE /dama-admin/:pgEnv/schedules/:id', { user: patterner, query: Q, params: { id: schedA } })).statusCode, 403);
        });

        console.log('enforce: reads need a signed-in user:');
        const READS = [
            ['GET /dama-admin/:pgEnv/schedules', {}, { source_id: srcA }],
            ['GET /dama-admin/:pgEnv/schedules/:id/runs', { id: schedA }, {}],
            ['GET /dama-admin/:pgEnv/events/query', {}, { etl_context_id: taskA }],
            ['GET /dama-admin/dms/tasks/:taskId', { taskId: 1 }, {}],
        ];
        await t('anon → 401 on schedules, runs, events/query, dms task status; signed in → answered', async () => {
            for (const [key, params, query] of READS) {
                assert.strictEqual((await hit(key, { params, query })).statusCode, 401, key);
                assert.notStrictEqual((await hit(key, { user: stranger, params, query })).statusCode, 401, key);
            }
            const list = await hit('GET /dama-admin/:pgEnv/schedules', { user: stranger, query: { source_id: srcA } });
            assert(Array.isArray(list.body) && list.body.some(s => +s.schedule_id === schedA));
        });
        await t('schedulables stays open (the registry)', async () => {
            const res = await hit('GET /dama-admin/:pgEnv/schedulables', {});
            assert.strictEqual(res.statusCode, 200);
            assert(res.body.some(s => s.worker_path === 'schedauth_dt/run'));
        });
        const taskRoutes = require('../src/routes/uda/uda.tasks.route');
        const falcorGet = (user, route, pathSet) => taskRoutes.find(r => r.route === route).get.call({ user }, pathSet);
        await t('falcor uda.tasks.* return nothing to anon, values to a signed-in user', async () => {
            const cases = [
                ['uda[{keys:envs}].tasks.length', { envs: [DAMA_DB] }],
                ['uda[{keys:envs}].tasks.byId[{integers:taskIds}][{keys:attributes}]', { envs: [DAMA_DB], taskIds: [taskA], attributes: ['status'] }],
                ['uda[{keys:envs}].tasks.forSource[{integers:sourceIds}].length', { envs: [DAMA_DB], sourceIds: [srcA] }],
                ['uda[{keys:envs}].tasks.byId[{integers:taskIds}].events.length', { envs: [DAMA_DB], taskIds: [taskA] }],
            ];
            for (const [route, ps] of cases) {
                assert.deepStrictEqual(await falcorGet(null, route, ps), [], route);
                assert((await falcorGet(stranger, route, ps)).length > 0, route);
            }
        });
    });

    await withMode('log', async (warned) => {
        console.log('log: what checked only a login before is allowed and logged:');
        await t('stranger patches srcA\'s schedule → 200 + one would-deny; anon reads → answered + logged', async () => {
            const res = await hit('PATCH /dama-admin/:pgEnv/schedules/:id', { user: stranger, params: { id: schedA }, body: { cron: '0 5 * * *' } });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(warned.filter(w => w.includes(`/${srcA}`)).length, 1, warned.join('\n'));
            assert.strictEqual((await hit('POST /dama-admin/:pgEnv/schedules', { body: newBody(srcA) })).statusCode, 401, 'login stays required');
            const before = warned.length;
            assert.strictEqual((await hit('GET /dama-admin/:pgEnv/schedules', { query: { source_id: srcA } })).statusCode, 200);
            assert.strictEqual(warned.length, before + 1);
            assert.match(warned[warned.length - 1], /would-deny read .*not signed in/);
        });
        await t('scheduler on srcA: no would-deny line', async () => {
            const before = warned.length;
            assert.strictEqual((await hit('PATCH /dama-admin/:pgEnv/schedules/:id', { user: scheduler, params: { id: schedA }, body: { cron: '0 2 * * *' } })).statusCode, 200);
            assert.strictEqual(warned.length, before);
        });
    });

    await withMode('legacy', async (warned) => {
        await t('legacy: anon reads answered, nothing logged', async () => {
            assert.strictEqual((await hit('GET /dama-admin/:pgEnv/schedules', { query: { source_id: srcA } })).statusCode, 200);
            assert.strictEqual(warned.length, 0);
        });
    });

    // ---- cleanup
    for (const id of made) await schedules.deleteSchedule(id, DAMA_DB).catch(() => {});
    await dama.query(`DELETE FROM ${srcTbl} WHERE source_id IN ($1, $2)`, [srcA, srcB]);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
