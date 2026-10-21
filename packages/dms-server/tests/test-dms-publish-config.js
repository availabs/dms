/**
 * DMS internal publish saves the sheet's new columns onto the source row (fix-internal-publish-source-config-writes).
 * The config write used to omit `app`, so on a per-app database it updated the legacy shared `data_items` table:
 * no row matched, nothing failed, and the handler logged "saved config" anyway.
 *
 * Run: DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-dms-publish-config.js
 * Never without DMS_TEST_DB: the default DMS config is not a test database.
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
process.env.DMS_DB_ENV = DMS_DB; // the publish route's controller and the permission resolver read DMS_DB_ENV
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { dmsMainTable } = require('../src/routes/uda/utils');

let pass = 0, fail = 0;
const t = async (name, fn) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack}`); }
};

async function run() {
    const { getDb, awaitReady } = require('../src/db');
    getDb(DMS_DB);
    await awaitReady();
    const dms = getDb(DMS_DB);
    const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
    const store = require('../src/dama/upload/store');
    const { createPublishHandler } = require('../src/dama/upload/routes');

    const APP = `pubcfg_${Date.now()}`;
    const admin = { authed: true, id: 1, email: 'a@x', groups: [`${APP} Admin`] };
    const mk = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;
    const viewId = await mk('roads|v1:view', { name: 'v1' });
    const src = await mk('env1|roads:source', {
        name: 'roads', type: 'internal_table', views: [{ id: viewId }],
        config: JSON.stringify({ attributes: [{ name: 'name', display_name: 'name' }] }),
    });
    const tbl = await dmsMainTable(dms, APP, 'per-app');
    const attrs = async () => {
        const { rows } = await dms.query(`SELECT data FROM ${tbl} WHERE id = $1`, [src]);
        const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
        return JSON.parse(data.config).attributes.map(a => a.name);
    };

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubcfg-'));
    const csv = path.join(dir, 'roads.csv');
    fs.writeFileSync(csv, 'name,lanes\nMain St,2\n');
    const publish = async (body) => {
        const uploadId = store.generateUploadId();
        store.create(uploadId, { userId: admin.id });
        store.setReady(uploadId, [{ layerName: 'roads' }], csv, '.csv');
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } };
        await createPublishHandler(controller)({
            params: { appType: `${APP}+roads|${viewId}:data` }, query: {}, headers: {},
            body: { gisUploadId: uploadId, layerName: 'roads', ...body },
            availAuthContext: { user: admin },
        }, res);
        return res;
    };
    const columns = [{ name: 'name', display_name: 'name' }, { name: 'lanes', display_name: 'lanes' }];

    console.log('DMS publish → source config:');
    await t('new columns land on the source row in the app\'s table (sourceId in the body)', async () => {
        const res = await publish({ columns, sourceId: src });
        assert.strictEqual(res.statusCode, 200);
        assert(!res.body.err, res.body.err);
        assert.deepStrictEqual(await attrs(), ['name', 'lanes']);
    });
    await t('a second publish of the same columns adds nothing', async () => {
        await publish({ columns, sourceId: src });
        assert.deepStrictEqual(await attrs(), ['name', 'lanes']);
    });
    await t('without a body sourceId the source is found from the data type, and its config still updates', async () => {
        await publish({ columns: [...columns, { name: 'surface', display_name: 'surface' }] });
        assert.deepStrictEqual(await attrs(), ['name', 'lanes', 'surface']);
    });

    for (const table of [tbl]) await dms.query(`DELETE FROM ${table} WHERE app = $1`, [APP]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
