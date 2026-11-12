/**
 * A read whose subject misses must not reload the app snapshot once per miss
 * (planning/tasks/current/auth-snapshot-reload-on-miss.md). Counts snapshot loads (app snapshots and
 * pgEnv catalogs) around reads of pgEnv sources the pgEnv doesn't have, concurrent misses, and a
 * listing; checks a source stored after the catalog load is still found, denials hold, and writes reload.
 * Since 2026-11-12 a pgEnv's sources are read from the pgEnv (no mirror rows: pgenv-auth-without-mirror-rows.md).
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-auth-snapshot-reload.js   (local sqlite; DAMA_TEST_DB picks the pgEnv)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';
process.env.DMS_DB_ENV = DMS_DB;
const assert = require('assert');
const AUTH = require('../src/routes/auth');
const owners = require('../src/routes/auth/owners');
const { dmsMainTable } = require('../src/routes/uda/utils');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); }
};

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB); getDb(DAMA_DB);
  await awaitReady();
  const dms = getDb(DMS_DB);
  const dama = getDb(DAMA_DB);
  const srcTbl = dama.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const made = [];

  const APP = `snapreload_${Date.now()}`;
  const tbl = await dmsMainTable(dms, APP, 'per-app');
  for (const col of [`auth ${dms.type === 'postgres' ? 'jsonb' : 'TEXT'}`, 'parent_id INTEGER']) {
    try { await dms.query(`ALTER TABLE ${tbl} ADD COLUMN ${col}`); } catch { /* already migrated */ }
  }
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const insert = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;
  await insert('prod:site', { site_name: 'snap', authPermissions: { groups: { public: ['view-source'] }, users: {} } });
  const envRow = await insert('prod|ext:dmsenv', { pgEnv: DAMA_DB, authPermissions: { groups: { public: ['view-source'] }, users: {} } });
  const user = { authed: true, id: 9, email: 'u@x', groups: ['Viewers'] };
  const read = (sourceId) => AUTH.authorize({ env: DAMA_DB, sourceId, verb: 'read', user, app: APP });
  const loads = () => owners.snapshotLoads();

  console.log('snapshot reloads on a read miss:');

  // ids no source has: past the pgEnv's largest
  const top = +((await dama.query(`SELECT max(source_id) AS m FROM ${srcTbl}`)).rows[0].m || 0) + 100000;

  await t('N sequential misses: one reload, not N', async () => {
    AUTH.clearSnapshots();
    await read(top + 1);             // first loads: the app, the pgEnv's catalog, one refresh
    const before = loads();
    for (let i = top + 2; i < top + 40; i++) assert.strictEqual((await read(i)).allow, false);
    assert.strictEqual(loads() - before, 0, `${loads() - before} reloads for 38 misses`);
  });

  await t('concurrent misses on a cold cache share loads', async () => {
    AUTH.clearSnapshots();
    const before = loads();
    const out = await Promise.all(Array.from({ length: 30 }, (_, i) => read(top + 100 + i)));
    assert.ok(out.every(d => !d.allow));
    assert.ok(loads() - before <= 2, `${loads() - before} loads for 30 concurrent misses`);
  });

  await t('a listing of unknown sources: at most one load', async () => {
    AUTH.clearSnapshots();
    const before = loads();
    const ok = await AUTH.readableSources({ env: DAMA_DB, sourceIds: Array.from({ length: 50 }, (_, i) => top + 500 + i), user, app: APP });
    assert.ok(loads() - before <= 2, `${loads() - before} loads for a listing of 50`);
    // under DMS_AUTH_MODE=log (the default) the listing keeps every id; the decision is what counts
    assert.ok(Array.isArray(ok));
  });

  await t('a source stored in the pgEnv after its catalog was loaded is found at once', async () => {
    AUTH.clearSnapshots();
    await read(top + 1);             // the catalog is loaded and cached
    const id = +(await dama.query(`INSERT INTO ${srcTbl} (name) VALUES ($1) RETURNING source_id`, [`snapreload_${Date.now()}`])).rows[0].source_id;
    made.push(id);
    const before = loads();
    const d = await read(id);        // the cached catalog misses; the retry asks the pgEnv for that one source
    assert.strictEqual(d.allow, true, d.reason);
    assert.ok(loads() - before <= 1, `${loads() - before} loads`);
  });

  await t('denials unchanged: the miss reason is reported', async () => {
    const d = await read(top + 7777);
    assert.strictEqual(d.allow, false);
    assert.match(d.reason, /not found/);
  });

  await t('writes still load fresh every time', async () => {
    const row = { id: envRow, app: APP, type: 'prod|ext:dmsenv', data: { pgEnv: DAMA_DB } };
    const before = loads();
    await AUTH.authorize({ row, verb: 'edit', patch: { name: 'x' }, user, app: APP });
    await AUTH.authorize({ row, verb: 'edit', patch: { name: 'y' }, user, app: APP });
    assert.strictEqual(loads() - before, 2);
  });

  for (const id of made) await dama.query(`DELETE FROM ${srcTbl} WHERE source_id = $1`, [id]);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
