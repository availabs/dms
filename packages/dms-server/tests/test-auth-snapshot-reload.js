/**
 * A read whose subject misses must not reload the app snapshot once per miss
 * (planning/tasks/current/auth-snapshot-reload-on-miss.md). Counts snapshot loads around reads of
 * external sources with no mirror row (what every hub tenant read did), concurrent misses, and a
 * listing; checks a row stored after the snapshot is still found, denials hold, and writes reload.
 *
 * Run: DMS_TEST_DB=cli-test node tests/test-auth-snapshot-reload.js   (local sqlite)
 */
const DMS_DB = process.env.DMS_TEST_DB || 'cli-test';
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
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  const { getDb, awaitReady } = require('../src/db');
  getDb(DMS_DB);
  await awaitReady();
  const dms = getDb(DMS_DB);

  const APP = `snapreload_${Date.now()}`;
  const tbl = await dmsMainTable(dms, APP, 'per-app');
  for (const col of [`auth ${dms.type === 'postgres' ? 'jsonb' : 'TEXT'}`, 'parent_id INTEGER']) {
    try { await dms.query(`ALTER TABLE ${tbl} ADD COLUMN ${col}`); } catch { /* already migrated */ }
  }
  const controller = require('../src/routes/dms/dms.controller').createController(DMS_DB);
  const insert = async (type, data) => +(await controller.createData([APP, type, data], null))[0].id;
  await insert('prod:site', { site_name: 'snap', authPermissions: { groups: { public: ['view-source'] }, users: {} } });
  const envRow = await insert('prod|ext:dmsenv', { pgEnv: 'pg_x', authPermissions: { groups: { public: ['view-source'] }, users: {} } });
  const user = { authed: true, id: 9, email: 'u@x', groups: ['Viewers'] };
  const read = (sourceId) => AUTH.authorize({ env: 'pg_x', sourceId, verb: 'read', user, app: APP });
  const loads = () => owners.snapshotLoads();

  console.log('snapshot reloads on a read miss:');

  await t('N sequential misses: one reload, not N', async () => {
    AUTH.clearSnapshots();
    await read(1);                   // first load + one refresh
    const before = loads();
    for (let i = 2; i < 40; i++) assert.strictEqual((await read(i)).allow, false);
    assert.strictEqual(loads() - before, 0, `${loads() - before} reloads for 38 misses`);
  });

  await t('concurrent misses on a cold cache share loads', async () => {
    AUTH.clearSnapshots();
    const before = loads();
    const out = await Promise.all(Array.from({ length: 30 }, (_, i) => read(100 + i)));
    assert.ok(out.every(d => !d.allow));
    assert.ok(loads() - before <= 1, `${loads() - before} loads for 30 concurrent misses`);
  });

  await t('a listing of unknown sources: at most one load', async () => {
    AUTH.clearSnapshots();
    const before = loads();
    const ok = await AUTH.readableSources({ env: 'pg_x', sourceIds: Array.from({ length: 50 }, (_, i) => 500 + i), user, app: APP });
    assert.ok(loads() - before <= 1, `${loads() - before} loads for a listing of 50`);
    // under DMS_AUTH_MODE=log (the default) the listing keeps every id; the decision is what counts
    assert.ok(Array.isArray(ok));
  });

  await t('a mirror row stored after the snapshot is found once the window passes', async () => {
    AUTH.clearSnapshots();
    assert.strictEqual((await read(900)).allow, false);
    await insert('ext|late:source', { name: 'late', pgEnv: 'pg_x', source_id: 900 });
    assert.strictEqual((await read(900)).allow, false, 'inside the window the miss is final');
    await wait(3100);
    const d = await read(900);
    assert.strictEqual(d.allow, true, d.reason);
  });

  await t('denials unchanged: the miss reason is reported', async () => {
    const d = await read(7777);
    assert.strictEqual(d.allow, false);
    assert.match(d.reason, /no mirror row/);
  });

  await t('writes still load fresh every time', async () => {
    const row = { id: envRow, app: APP, type: 'prod|ext:dmsenv', data: { pgEnv: 'pg_x' } };
    const before = loads();
    await AUTH.authorize({ row, verb: 'edit', patch: { name: 'x' }, user, app: APP });
    await AUTH.authorize({ row, verb: 'edit', patch: { name: 'y' }, user, app: APP });
    assert.strictEqual(loads() - before, 2);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
