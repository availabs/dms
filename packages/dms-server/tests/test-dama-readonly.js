/**
 * Read-only DAMA configs: `"readOnly": true` on a dama-only Postgres config
 * (planning/tasks/current/read-only-dama-configs.md).
 *
 * Needs the Docker harness (tests/postgres-docker.js, localhost:5499):
 *   npm run test:pg:dama-readonly
 *
 * It makes its own empty database in that container and writes its configs to src/db/configs
 * under gitignored names, deleting them at the end.
 *
 * Covers:
 *   1. loadConfig: readOnly must be a boolean, and only a postgres config whose role is just "dama"
 *      may set it. It adds default_transaction_read_only to the connection options, keeping any
 *      options the file already has.
 *   2. isReadOnly: true for a read-only config, false for a writable or missing one.
 *   3. getDb on a read-only config runs no schema init: an empty database stays empty.
 *   4. Writes through it fail (DDL, INSERT, and inside withTransaction); reads work, including a
 *      table that a writable config on the same database created.
 *   5. A worker's own pg.Client built from loadConfig (getPostgresCredentials) is read-only too.
 *   6. Control: a writable config on the same database does run the dama init.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const { loadConfig, configDir, isReadOnly } = require('../src/db/config.js');
const { getDb, awaitReady, getPostgresCredentials } = require('../src/db/index.js');
const harness = require('./postgres-docker.js');

const STAMP = Date.now();
const DB = `dama_ro_${STAMP}`;
const RO = `tmp-dama-ro-${STAMP}`;            // no "-test" in the name, so .gitignore covers a leftover
const RW = `tmp-dama-rw-${STAMP}`;
const BAD = `tmp-dama-bad-${STAMP}`;
const written = [];

const base = { type: 'postgres', host: 'localhost', port: harness.PORT, user: harness.USER, password: harness.PASS };

function writeConfig(name, config) {
  fs.writeFileSync(path.join(configDir, `${name}.config.json`), JSON.stringify(config, null, 2));
  written.push(name);
}

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function rejects(fn, pattern, msg) {
  try {
    await fn();
    assert(false, `${msg} (no error)`);
  } catch (e) {
    assert(pattern.test(e.message), `${msg}${pattern.test(e.message) ? '' : ` (got: ${e.message})`}`);
  }
}

async function adminQuery(sql, database = harness.DB) {
  const c = new Client({ ...base, database });
  await c.connect();
  try { return await c.query(sql); } finally { await c.end(); }
}

async function main() {
  console.log('\n1. loadConfig validation');
  writeConfig(BAD, { ...base, database: DB, role: 'dama', readOnly: 'yes' });
  await rejects(async () => loadConfig(BAD), /"readOnly" must be true or false/, 'a non-boolean readOnly is refused');
  writeConfig(BAD, { ...base, database: DB, role: ['dms', 'dama'], readOnly: true });
  await rejects(async () => loadConfig(BAD), /only for postgres configs whose role is "dama"/, 'readOnly on a dms+dama config is refused');
  writeConfig(BAD, { ...base, database: DB, role: 'auth', readOnly: true });
  await rejects(async () => loadConfig(BAD), /only for postgres configs whose role is "dama"/, 'readOnly on an auth config is refused');
  writeConfig(BAD, { type: 'sqlite', role: 'dama', filename: '../data/never-created.sqlite', readOnly: true });
  await rejects(async () => loadConfig(BAD), /only for postgres configs whose role is "dama"/, 'readOnly on a sqlite config is refused');

  writeConfig(BAD, { ...base, database: DB, role: 'dama', readOnly: true, options: '-c statement_timeout=5000' });
  assert(loadConfig(BAD).options === '-c statement_timeout=5000 -c default_transaction_read_only=on',
    'existing connection options are kept, with default_transaction_read_only added');
  writeConfig(BAD, { ...base, database: DB, role: 'dama', readOnly: false });
  assert(loadConfig(BAD).options === undefined, 'readOnly: false leaves the options alone');

  console.log('\n2. isReadOnly');
  writeConfig(RO, { ...base, database: DB, role: 'dama', readOnly: true });
  writeConfig(RW, { ...base, database: DB, role: 'dama' });
  assert(isReadOnly(RO) === true, 'a read-only config');
  assert(isReadOnly(RW) === false, 'a writable config');
  assert(isReadOnly(`tmp-missing-${STAMP}`) === false, 'a missing config counts as not read-only');

  console.log('\n3. getDb on a read-only config runs no init');
  await adminQuery(`CREATE DATABASE ${DB}`);
  const ro = getDb(RO);
  await awaitReady();
  const schemas = await ro.query(`SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name = 'data_manager'`);
  assert(schemas.rows[0].n === 0, 'data_manager was not created');
  const tables = await ro.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`);
  assert(tables.rows[0].n === 0, 'the database still has no tables');

  console.log('\n4. writes fail, reads work');
  await rejects(() => ro.query('CREATE TABLE ro_probe (x int)'), /read-only transaction/, 'CREATE TABLE is refused');
  await rejects(() => ro.withTransaction(tx => tx.query('CREATE SCHEMA ro_probe')), /read-only transaction/,
    'DDL inside withTransaction is refused');

  // Control: the writable config on the same database initializes it.
  const rw = getDb(RW);
  await awaitReady();
  const after = await rw.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'data_manager' AND table_name IN ('sources', 'views', 'tasks')`);
  assert(after.rows[0].n === 3, 'control: a writable config on the same database creates data_manager.sources, views and tasks');
  await rw.query(`INSERT INTO data_manager.sources (name) VALUES ('ro test source')`);

  const read = await ro.query(`SELECT name FROM data_manager.sources WHERE name = 'ro test source'`);
  assert(read.rows.length === 1, 'the read-only config reads a row the writable one wrote');
  await rejects(() => ro.query(`INSERT INTO data_manager.sources (name) VALUES ('ro insert')`), /read-only transaction/,
    'INSERT is refused');
  await rejects(() => ro.query(`UPDATE data_manager.sources SET name = 'renamed'`), /read-only transaction/, 'UPDATE is refused');
  await rejects(() => ro.query(`DELETE FROM data_manager.sources`), /read-only transaction/, 'DELETE is refused');

  console.log('\n5. a worker\'s own client is read-only too');
  const worker = new Client(getPostgresCredentials(RO));
  await worker.connect();
  try {
    const setting = await worker.query('SHOW default_transaction_read_only');
    assert(setting.rows[0].default_transaction_read_only === 'on', 'getPostgresCredentials gives a read-only session');
    await rejects(() => worker.query(`INSERT INTO data_manager.sources (name) VALUES ('worker insert')`), /read-only transaction/,
      'its INSERT is refused');
  } finally {
    await worker.end();
  }

  const count = await rw.query(`SELECT count(*)::int AS n FROM data_manager.sources`);
  assert(count.rows[0].n === 1, 'only the writable config\'s row is in the table');
}

main()
  .catch(e => { failed++; console.error('  ✗ unexpected error:', e); })
  .finally(() => {
    for (const name of written) {
      try { fs.unlinkSync(path.join(configDir, `${name}.config.json`)); } catch (_) {}
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
