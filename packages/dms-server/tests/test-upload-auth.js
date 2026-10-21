/**
 * Permission checks on the upload / publish / file upload routes (permissions-ds-upload-publish-routes):
 * every route needs a signed-in user; a staged upload is its uploader's only; a new source needs
 * `create-source` on the named datasets pattern (image / Lexical file uploads name none and need only
 * a login); a new version needs `create-view` or `update-source`; rows into an internal source need
 * `edit-source-data` or `update-source` on every source the write touches; the owner of what gets
 * created is the token user, whatever the body says.
 *
 * Handlers are run off a fake express app (as test-schedules.js does), multipart bodies through a
 * real stream so busboy parses them.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-upload-auth.js   (DAMA_TEST_DB picks the pgEnv)
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB; // the resolver, controller and upload routes read DMS rows from DMS_DB_ENV
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const FILES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-auth-files-'));
process.env.DAMA_SERVER_FILESTORAGE_PATH = FILES_DIR; // local storage writes land here, removed at the end
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
function captureRoutes(registerFn) {
    const routes = {};
    const fakeApp = {};
    for (const method of ['get', 'post', 'patch', 'delete', 'put', 'use']) {
        fakeApp[method] = (p, ...handlers) => { routes[`${method.toUpperCase()} ${p}`] = handlers; };
    }
    registerFn(fakeApp);
    return routes;
}

function fakeRes() {
    let finish;
    const res = {
        statusCode: 200, body: undefined,
        done: new Promise(r => { finish = r; }),
        status(c) { this.statusCode = c; return this; },
        json(o) { this.body = o; finish(); return this; },
        send(o) { this.body = o; finish(); return this; },
        type() { return this; },
    };
    return res;
}

// A multipart request body busboy can parse.
function multipart(fields, file) {
    const boundary = `----uploadauth${Date.now()}`;
    const parts = Object.entries(fields).map(([k, v]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n${file.content}\r\n--${boundary}--\r\n`);
    return { stream: Readable.from([Buffer.from(parts.join(''))]), contentType: `multipart/form-data; boundary=${boundary}` };
}

let routes;
// Run a route's handler chain the way express would; resolves with the response once one is sent.
async function hit(key, { user = null, params = {}, query = {}, body = {}, form = null } = {}) {
    const handlers = routes[key];
    assert(handlers, `no route ${key}`);
    let req;
    if (form) {
        const { stream, contentType } = multipart(form.fields, form.file);
        req = stream;
        Object.assign(req, { headers: { 'content-type': contentType } });
    } else {
        req = { headers: {} };
    }
    Object.assign(req, { params, query, body: form ? undefined : body, method: 'POST', originalUrl: key, availAuthContext: { user } });
    const res = fakeRes();
    for (const h of handlers) {
        let nextCalled = false;
        await h(req, res, () => { nextCalled = true; });
        if (!nextCalled) break;
    }
    await Promise.race([res.done, new Promise((_, rej) => setTimeout(() => rej(new Error(`${key} sent no response`)), 10000))]);
    return res;
}
const status = (res) => res.statusCode;

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB); getDb(DAMA_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const dama = getDb(DAMA_DB);
    const pg = dama.type === 'postgres';
    const srcTbl = pg ? 'data_manager.sources' : 'sources';
    const viewTbl = pg ? 'data_manager.views' : 'views';
    const store = require('../src/dama/upload/store');
    const { authorizePublish } = require('../src/dama/upload/auth');
    routes = captureRoutes(require('../src/dama/upload').registerUploadRoutes);

    // ---- users
    const loader = { authed: true, id: 7, email: 'l@x', groups: ['Loaders'] };       // pattern: create-source, create-view, edit-source-data
    const versioner = { authed: true, id: 11, email: 'v@x', groups: ['Versioners'] }; // create-view on extA only
    const stranger = { authed: true, id: 10, email: 's@x', groups: ['Rando'] };

    // ---- DMS side: a datasets pattern linked to a dmsEnv holding two internal sources; `bridges`
    // revokes the pattern's Loaders grant on itself.
    const APP = `uplauth_${Date.now()}`;
    const OTHER_APP = `${APP}_other`;
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    const otherTbl = await dmsMainTable(dms, OTHER_APP, 'per-app');
    // Through the controller: its id allocator must know the fixture rows, or the routes' own creates collide.
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const insert = async (table, app, type, data) => +(await controller.createData([app, type, data], null))[0].id;
    const viewId = await insert(tbl, APP, 'roads|v1:view', { name: 'v1' });
    const intSrc = await insert(tbl, APP, 'env1|roads:source', { name: 'roads', type: 'internal_table', views: [{ id: viewId }] });
    const intSrc2 = await insert(tbl, APP, 'env1|bridges:source', { name: 'bridges', type: 'internal_table', views: [], auth_permissions: { groups: { Loaders: [] } } });
    const envRow = await insert(tbl, APP, 'site|env1:dmsenv', { sources: [{ id: intSrc }, { id: intSrc2 }] });
    const dsPattern = await insert(tbl, APP, 'site|ds:pattern', {
        pattern_type: 'datasets', dmsEnvId: envRow,
        authPermissions: { '*': { groups: { Loaders: ['create-source', 'create-view', 'edit-source-data'] }, users: {} } },
    });
    const otherPattern = await insert(otherTbl, OTHER_APP, 'site|ds:pattern', { pattern_type: 'datasets', authPermissions: { groups: { Rando: ['*'] } } });
    const PATTERN_Q = { dms_pattern: `${APP}/${dsPattern}` };

    // ---- DaMa side
    const extA = (await dama.query(`INSERT INTO ${srcTbl} (name, auth_permissions) VALUES ($1, $2) RETURNING source_id`,
        [`uplauth_${Date.now()}`, JSON.stringify({ groups: { Versioners: ['create-view'] }, users: {} })])).rows[0].source_id;
    const sourceCount = async () => +(await dama.query(`SELECT COUNT(*) AS n FROM ${srcTbl}`)).rows[0].n;
    const createdExt = [];

    // ---- a staged CSV upload owned by `loader`
    const csvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-auth-csv-'));
    const csvPath = path.join(csvDir, 'roads.csv');
    fs.writeFileSync(csvPath, 'name,lanes\nMain St,2\nOak Ave,4\n');
    const stage = (userId) => {
        const id = store.generateUploadId();
        store.create(id, { userId });
        store.setReady(id, [{ layerName: 'roads', fieldsMetadata: [{ name: 'name' }, { name: 'lanes' }] }], csvPath, '.csv');
        return id;
    };
    const upl = stage(loader.id);

    const ALL = [
        ['GET /dama-admin/:pgEnv/etl/new-context-id', {}],
        ['POST /dama-admin/:pgEnv/gis-dataset/upload', {}],
        ['GET /dama-admin/:pgEnv/gis-dataset/:id/layers', { id: upl }],
        ['POST /dama-admin/dms/:appType/publish', { appType: `${APP}+roads|${viewId}:data` }],
        ['POST /dama-admin/dms/:appType/validate', { appType: `${APP}+roads|${viewId}:data` }],
        ['GET /dama-admin/:pgEnv/gis-dataset/:fileId/layerNames', { fileId: upl }],
        ['POST /dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis', { fileId: upl, layerName: 'roads' }],
        ['GET /dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis', { fileId: upl, layerName: 'roads' }],
        ['GET /dama-admin/:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor', { fileId: upl, layerName: 'roads' }],
        ['POST /dama-admin/:pgEnv/gis-dataset/publish', {}],
        ['POST /dama-admin/:pgEnv/csv-dataset/publish', {}],
        ['POST /dama-admin/:pgEnv/file_upload', {}],
        ['POST /dms-admin/:app/file_upload', { app: APP }],
    ];

    console.log('login:');
    await t('every upload / publish / file upload route answers 401 without a user', async () => {
        for (const [key, params] of ALL) {
            const res = await hit(key, { params: { pgEnv: DAMA_DB, ...params } });
            assert.strictEqual(status(res), 401, `${key} → ${status(res)}`);
        }
    });
    await t('new-context-id works signed in', async () => {
        const res = await hit('GET /dama-admin/:pgEnv/etl/new-context-id', { user: stranger, params: { pgEnv: DAMA_DB } });
        assert.strictEqual(status(res), 200);
        assert(/^\d+$/.test(String(res.body)));
    });

    console.log('staged uploads belong to their uploader:');
    await t('the uploader reads layers / layerNames / tableDescriptor; anyone else gets 403', async () => {
        const reads = [
            ['GET /dama-admin/:pgEnv/gis-dataset/:id/layers', { id: upl }],
            ['GET /dama-admin/:pgEnv/gis-dataset/:fileId/layerNames', { fileId: upl }],
            ['GET /dama-admin/:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor', { fileId: upl, layerName: 'roads' }],
        ];
        for (const [key, params] of reads) {
            assert.strictEqual(status(await hit(key, { user: loader, params: { pgEnv: DAMA_DB, ...params } })), 200, key);
            assert.strictEqual(status(await hit(key, { user: stranger, params: { pgEnv: DAMA_DB, ...params } })), 403, key);
        }
    });
    await t('the upload route records the token user as the uploader', async () => {
        const res = await hit('POST /dama-admin/:pgEnv/gis-dataset/upload', {
            user: loader, params: { pgEnv: DAMA_DB }, form: { fields: {}, file: { name: 'x.csv', content: 'a,b\n1,2\n' } },
        });
        assert.strictEqual(status(res), 200);
        assert.strictEqual(store.get(res.body[0].id).userId, loader.id);
    });

    console.log('gis / csv publish:');
    for (const kind of ['gis', 'csv']) {
        const key = `POST /dama-admin/:pgEnv/${kind}-dataset/publish`;
        // gis publish sits behind gisGuard (501 without GDAL); the auth checks run after it.
        const guarded = kind === 'gis' && !require('../src/dama/upload/gdal').gdalAvailable;
        await t(`${kind}: a missing upload → 400 and no source is created`, async () => {
            if (guarded) return console.log('      (no GDAL: gisGuard answers first, skipped)');
            const before = await sourceCount();
            const res = await hit(key, { user: loader, params: { pgEnv: DAMA_DB }, query: PATTERN_Q,
                body: { gisUploadId: 'dms_nope', source_values: { name: 'should not exist' } } });
            assert.strictEqual(status(res), 400);
            assert.strictEqual(await sourceCount(), before);
        });
        await t(`${kind}: someone else's upload → 403`, async () => {
            if (guarded) return;
            const res = await hit(key, { user: stranger, params: { pgEnv: DAMA_DB }, query: PATTERN_Q,
                body: { gisUploadId: upl, source_values: { name: 'x' } } });
            assert.strictEqual(status(res), 403);
        });
        await t(`${kind}: enforce refuses a new source without create-source, and a version without create-view`, async () => {
            if (guarded) return;
            await withMode('enforce', async () => {
                const mine = stage(stranger.id);
                const before = await sourceCount();
                let res = await hit(key, { user: stranger, params: { pgEnv: DAMA_DB }, query: PATTERN_Q,
                    body: { gisUploadId: mine, source_values: { name: 'x' } } });
                assert.strictEqual(status(res), 403);
                res = await hit(key, { user: stranger, params: { pgEnv: DAMA_DB }, body: { gisUploadId: mine, source_values: { name: 'x' } } });
                assert.strictEqual(status(res), 403, 'no pattern named');
                res = await hit(key, { user: stranger, params: { pgEnv: DAMA_DB }, query: PATTERN_Q, body: { gisUploadId: mine, source_id: extA } });
                assert.strictEqual(status(res), 403);
                assert.strictEqual(await sourceCount(), before);
            });
        });
    }

    console.log('authorizePublish (the gate the publish routes share):');
    const gate = async (user, sourceId, query = {}, opts = {}) => {
        const res = fakeRes();
        const ok = await authorizePublish({ params: { pgEnv: DAMA_DB }, query, headers: {}, availAuthContext: { user } }, res, sourceId, opts);
        return { ok: !!ok, status: ok ? 200 : res.statusCode };
    };
    await t('enforce: create-source on the named pattern creates; another app\'s pattern or none is refused', async () => {
        await withMode('enforce', async () => {
            assert.deepStrictEqual(await gate(loader, null, PATTERN_Q), { ok: true, status: 200 });
            assert.strictEqual((await gate(stranger, null, PATTERN_Q)).status, 403);
            assert.strictEqual((await gate(loader, null, {})).status, 403);
            assert.strictEqual((await gate(stranger, null, { dms_pattern: `${OTHER_APP}/${otherPattern}` }, { app: APP })).status, 403);
        });
    });
    await t('enforce: create-view on the source adds a version; nothing on it is refused', async () => {
        await withMode('enforce', async () => {
            assert.strictEqual((await gate(versioner, extA)).ok, true);
            assert.strictEqual((await gate(stranger, extA)).status, 403);
        });
    });
    await t('log: the same refusals go through and are logged as would-deny', async () => {
        await withMode('log', async (warned) => {
            assert.strictEqual((await gate(stranger, null, PATTERN_Q)).ok, true);
            assert.strictEqual((await gate(stranger, extA)).ok, true);
            assert(warned.length >= 2, `expected would-deny lines, got ${warned.length}`);
        });
    });

    console.log('pgEnv file_upload (image cells, Lexical):');
    const imageForm = (fields = {}) => ({
        fields: { source_name: 'card image', file_name: 'a.png', file_type: 'image/png', directory: 'uplauth', ...fields },
        file: { name: 'a.png', content: 'not really a png' },
    });
    await t('enforce: signed in with no pattern named creates a private source owned by the token user, not the body\'s user_id', async () => {
        await withMode('enforce', async () => {
            const res = await hit('POST /dama-admin/:pgEnv/file_upload', { user: stranger, params: { pgEnv: DAMA_DB }, form: imageForm({ user_id: 999 }) });
            assert.strictEqual(status(res), 200, JSON.stringify(res.body));
            assert(res.body.ok);
            createdExt.push(res.body.source_id);
            const { rows } = await dama.query(`SELECT user_id, auth_permissions FROM ${srcTbl} WHERE source_id = $1`, [res.body.source_id]);
            assert.strictEqual(+rows[0].user_id, stranger.id);
            const ap = typeof rows[0].auth_permissions === 'string' ? JSON.parse(rows[0].auth_permissions) : rows[0].auth_permissions;
            assert.deepStrictEqual(ap.users, { [stranger.id]: ['*'] });
            const v = await dama.query(`SELECT user_id FROM ${viewTbl} WHERE source_id = $1`, [res.body.source_id]);
            assert.strictEqual(+v.rows[0].user_id, stranger.id);
        });
    });
    await t('enforce: naming a pattern needs create-source on it', async () => {
        await withMode('enforce', async () => {
            const res = await hit('POST /dama-admin/:pgEnv/file_upload', { user: stranger, params: { pgEnv: DAMA_DB }, query: PATTERN_Q, form: imageForm() });
            assert.strictEqual(status(res), 403);
        });
    });
    await t('enforce: a new file on an existing source needs create-view on it', async () => {
        await withMode('enforce', async () => {
            let res = await hit('POST /dama-admin/:pgEnv/file_upload', { user: stranger, params: { pgEnv: DAMA_DB }, form: imageForm({ source_id: extA }) });
            assert.strictEqual(status(res), 403);
            res = await hit('POST /dama-admin/:pgEnv/file_upload', { user: versioner, params: { pgEnv: DAMA_DB }, form: imageForm({ source_id: extA }) });
            assert.strictEqual(status(res), 200, JSON.stringify(res.body));
        });
    });

    console.log('DMS file_upload:');
    const dmsForm = (fields = {}) => ({
        fields: { owner_id: envRow, owner_instance: 'env1', owner_ref: `${APP}+env1|source`, source_name: `file ${Date.now()}`, ...fields },
        file: { name: 'doc.txt', content: 'hello' },
    });
    const DMS_KEY = 'POST /dms-admin/:app/file_upload';
    await t('enforce: create-source on the pattern creates a source listed on the pattern\'s dmsEnv', async () => {
        await withMode('enforce', async () => {
            const res = await hit(DMS_KEY, { user: loader, params: { app: APP }, query: PATTERN_Q, form: dmsForm() });
            assert.strictEqual(status(res), 200, JSON.stringify(res.body));
            const { rows } = await dms.query(`SELECT data FROM ${tbl} WHERE id = $1`, [envRow]);
            const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
            assert(data.sources.some(s => +s.id === +res.body.source_id));
        });
    });
    await t('enforce: refused without create-source, with another app\'s pattern, or with an owner that isn\'t the pattern / its dmsEnv', async () => {
        await withMode('enforce', async () => {
            assert.strictEqual(status(await hit(DMS_KEY, { user: stranger, params: { app: APP }, query: PATTERN_Q, form: dmsForm() })), 403);
            assert.strictEqual(status(await hit(DMS_KEY, { user: stranger, params: { app: APP },
                query: { dms_pattern: `${OTHER_APP}/${otherPattern}` }, form: dmsForm() })), 403);
            const res = await hit(DMS_KEY, { user: loader, params: { app: APP }, query: PATTERN_Q, form: dmsForm({ owner_id: intSrc }) });
            assert.strictEqual(status(res), 403);
            assert(/not the datasets pattern/.test(res.body.error), res.body.error);
        });
    });
    await t('enforce: a new file on an existing internal source needs create-view on it', async () => {
        await withMode('enforce', async () => {
            assert.strictEqual(status(await hit(DMS_KEY, { user: stranger, params: { app: APP }, form: dmsForm({ source_id: intSrc }) })), 403);
            const res = await hit(DMS_KEY, { user: loader, params: { app: APP }, form: dmsForm({ source_id: intSrc }) });
            assert.strictEqual(status(res), 200, JSON.stringify(res.body));
        });
    });

    console.log('DMS publish / validate:');
    const PUB = 'POST /dama-admin/dms/:appType/publish';
    const VAL = 'POST /dama-admin/dms/:appType/validate';
    const dataType = `roads|${viewId}:data`;
    const pubBody = (gisUploadId, extra = {}) => ({ gisUploadId, layerName: 'roads', columns: [{ name: 'name' }, { name: 'lanes' }], ...extra });
    await t('enforce: edit-source-data writes the rows; a stranger is refused', async () => {
        await withMode('enforce', async () => {
            let res = await hit(PUB, { user: stranger, params: { appType: `${APP}+${dataType}` }, body: pubBody(stage(stranger.id)) });
            assert.strictEqual(status(res), 403);
            res = await hit(PUB, { user: loader, params: { appType: `${APP}+${dataType}` }, body: pubBody(upl, { user_id: 999 }) });
            assert.strictEqual(status(res), 200);
            assert(!res.body.err, res.body.err);
            assert.strictEqual(res.body.data.filter(r => r.action === 'created').length, 2, JSON.stringify(res.body.data));
        });
    });
    await t('enforce: a body sourceId naming a source the caller can\'t write is refused (rows and config both checked)', async () => {
        await withMode('enforce', async () => {
            const res = await hit(PUB, { user: loader, params: { appType: `${APP}+${dataType}` }, body: pubBody(upl, { sourceId: intSrc2 }) });
            assert.strictEqual(status(res), 403);
        });
    });
    await t('someone else\'s upload → 403', async () => {
        const res = await hit(PUB, { user: stranger, params: { appType: `${APP}+${dataType}` }, body: pubBody(upl) });
        assert.strictEqual(status(res), 403);
    });
    await t('enforce: validate needs the same; log lets a stranger through and logs it', async () => {
        await withMode('enforce', async () => {
            assert.strictEqual(status(await hit(VAL, { user: stranger, params: { appType: `${APP}+${dataType}` }, body: { parentId: intSrc, parentDocType: 'roads' } })), 403);
            const res = await hit(VAL, { user: loader, params: { appType: `${APP}+${dataType}` }, body: { parentId: intSrc, parentDocType: 'roads' } });
            assert.strictEqual(status(res), 200); // no config on the fixture: the handler's own "No config found"
        });
        await withMode('log', async (warned) => {
            const res = await hit(VAL, { user: stranger, params: { appType: `${APP}+${dataType}` }, body: { parentId: intSrc, parentDocType: 'roads' } });
            assert.strictEqual(status(res), 200);
            assert(warned.length >= 1);
        });
    });
    await t('enforce: a type that resolves to no source is refused', async () => {
        await withMode('enforce', async () => {
            const res = await hit(VAL, { user: loader, params: { appType: `${APP}+nowhere|1:data` }, body: { parentDocType: 'nowhere' } });
            assert.strictEqual(status(res), 403);
        });
    });

    // ---- cleanup
    for (const table of [tbl, otherTbl]) await dms.query(`DELETE FROM ${table} WHERE app IN ($1, $2)`, [APP, OTHER_APP]);
    for (const id of [extA, ...createdExt]) {
        await dama.query(`DELETE FROM ${viewTbl} WHERE source_id = $1`, [id]);
        await dama.query(`DELETE FROM ${srcTbl} WHERE source_id = $1`, [id]);
    }
    fs.rmSync(FILES_DIR, { recursive: true, force: true });
    fs.rmSync(csvDir, { recursive: true, force: true });

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
