/**
 * Postgres-only real-transaction tests (dms-server-real-transactions.md, Bug 14).
 *
 * Needs the Docker harness (tests/postgres-docker.js — localhost:5499). Uses the
 * dms-postgres-test and dama-postgres-test configs, both in that container.
 *
 * Bug 14 as reproduced on this harness before the fix (Phase 0): BEGIN, the work and COMMIT
 * each drew an arbitrary pooled connection, so 138 of 144 concurrent requests ran across more
 * than one backend, requests resolved while the backend that ran their BEGIN was still
 * `idle in transaction`, failed writes left rows committed, and 156 of 160 writes that had
 * returned success were rolled back by other requests' ROLLBACKs.
 *
 * Covers:
 *   1. Adapter semantics that only Postgres can show: two concurrent transactions don't see
 *      each other's uncommitted rows; a plain db.query during an open transaction runs on
 *      another backend and survives the transaction's rollback; a statement that failed inside
 *      fn but whose error fn swallowed makes COMMIT throw (Postgres answers it with ROLLBACK);
 *      a backend killed mid-transaction fails it without an unhandled 'error' event.
 *   2. Every statement of each concurrent request's transaction runs on ONE backend (a
 *      per-request trace of pg.Client#query), and no connection is left
 *      `idle in transaction` after a concurrent burst.
 *   3. The Phase 0 repro: concurrent failing + succeeding createData — 0 leaked rows, 0 lost
 *      acknowledged writes, 0 idle-in-transaction connections.
 *   4. DAMA source deletes (softDeleteSource / hardDeleteSource): happy path, and a failure
 *      inside the block rolls back the view/task deletes.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('node:async_hooks');

// hardDeleteSource removes storage files under `${env}/s_${sourceId}` — keep that in a
// throwaway directory, never the real var/dama-files.
const STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-tx-test-storage-'));
process.env.DMS_STORAGE_TYPE = 'local';
process.env.DAMA_SERVER_FILESTORAGE_PATH = STORAGE_DIR;

const pg = require('pg');
const DB_NAME = process.env.DMS_TEST_DB || 'dms-postgres-test';
const DAMA_DB = process.env.DAMA_TEST_DB || 'dama-postgres-test';
process.env.DMS_DB_ENV = DB_NAME;

// Per-request statement trace: which backend ran each statement of each tagged request.
const als = new AsyncLocalStorage();
const trace = new Map(); // tag -> [{ pid, sql }]
const origClientQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (config, values, cb) {
  const tag = als.getStore();
  if (tag && trace.has(tag)) {
    const text = typeof config === 'string' ? config : (config && config.text) || '';
    trace.get(tag).push({ pid: this.processID, sql: text.trim().split(/\s+/).slice(0, 2).join(' ') });
  }
  return origClientQuery.call(this, config, values, cb);
};

const { getDb, awaitReady, loadConfig } = require('../src/db/index.js');
const { resolveTable } = require('../src/db/table-resolver.js');
const { createController } = require('../src/routes/dms/dms.controller.js');
const { softDeleteSource, hardDeleteSource } = require('../src/routes/uda/uda.tasks.controller.js');

const STAMP = Date.now();
const TEST_APP = 'txpg' + STAMP;
const USER = { id: 1, email: 'test@test.com', groups: ['admin'] };

let db, damaDb, controller, observer;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainFqn = () => resolveTable(TEST_APP, '', 'postgres', 'per-app').fullName;

/** Connections of THIS test process's pools left idle in transaction (observer excluded). */
async function idleInTransaction() {
  const { rows } = await observer.query(
    `SELECT pid, left(query, 60) AS last_query FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle in transaction'`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// 1. Adapter semantics
// ---------------------------------------------------------------------------

async function testAdapterSemantics() {
  console.log('\n--- 1. Postgres adapter semantics ---');
  const T = `public.tx_pg_${STAMP}`;
  await db.query(`CREATE TABLE ${T} (id INTEGER PRIMARY KEY, v TEXT)`);
  try {
    await test('two concurrent transactions don\'t see each other\'s uncommitted rows', async () => {
      let openA, openB;
      const gateA = new Promise((r) => { openA = r; });
      const gateB = new Promise((r) => { openB = r; });
      let aSawB = null, bSawA = null;
      const a = db.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (1, 'a')`);
        await gateA;
        aSawB = Number((await tx.query(`SELECT count(*) AS n FROM ${T} WHERE id = 2`)).rows[0].n);
      });
      const b = db.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (2, 'b')`);
        await gateB;
        bSawA = Number((await tx.query(`SELECT count(*) AS n FROM ${T} WHERE id = 1`)).rows[0].n);
      });
      await sleep(50);
      openA(); openB();
      await Promise.all([a, b]);
      assert(aSawB === 0 && bSawA === 0, `A saw B: ${aSawB}, B saw A: ${bSawA}`);
      const n = Number((await db.query(`SELECT count(*) AS n FROM ${T}`)).rows[0].n);
      assert(n === 2, `both committed: ${n}`);
    });

    await test('a plain db.query during an open transaction runs on another backend and survives its rollback', async () => {
      let open;
      const gate = new Promise((r) => { open = r; });
      let txPid = null;
      const txp = db.withTransaction(async (tx) => {
        txPid = (await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (10, 'tx')`);
        await gate;
        throw new Error('roll back');
      }).catch(() => {});
      await sleep(30);
      const plainPid = (await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await db.query(`INSERT INTO ${T} (id, v) VALUES (11, 'plain')`);
      open();
      await txp;
      const ids = (await db.query(`SELECT id FROM ${T} WHERE id IN (10, 11)`)).rows.map((r) => r.id);
      assert(txPid !== plainPid, `plain query ran on the transaction's backend ${txPid}`);
      assert(ids.length === 1 && ids[0] === 11, `after rollback: ${ids}`);
    });

    await test('a failed statement whose error fn swallowed makes COMMIT throw (not a silent rollback)', async () => {
      let msg = '';
      try {
        await db.withTransaction(async (tx) => {
          await tx.query(`INSERT INTO ${T} (id, v) VALUES (20, 'x')`);
          try { await tx.query('SELECT * FROM no_such_table_tx_test'); } catch { /* swallowed */ }
        });
      } catch (e) { msg = e.message; }
      assert(/rolled back at COMMIT/.test(msg), `got: ${msg || '(no error)'}`);
      const n = Number((await db.query(`SELECT count(*) AS n FROM ${T} WHERE id = 20`)).rows[0].n);
      assert(n === 0, 'row 20 not committed');
    });

    await test('a backend killed mid-transaction fails that transaction without crashing, and the pool recovers', async () => {
      let msg = '';
      try {
        await db.withTransaction(async (tx) => {
          const pid = (await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          await tx.query(`INSERT INTO ${T} (id, v) VALUES (30, 'killed')`);
          // Kill the backend while no query is active on it — the case where pg emits 'error' on
          // the checked-out client instead of failing a query.
          await observer.query('SELECT pg_terminate_backend($1)', [pid]);
          await sleep(200);
          await tx.query(`INSERT INTO ${T} (id, v) VALUES (31, 'after kill')`);
        });
      } catch (e) { msg = e.message; }
      assert(msg !== '', 'transaction on a killed backend did not fail');
      const ok = await db.withTransaction(async (tx) => (await tx.query('SELECT 1 AS one')).rows[0].one);
      assert(Number(ok) === 1, 'pool serves a fresh connection afterwards');
      const n = Number((await db.query(`SELECT count(*) AS n FROM ${T} WHERE id IN (30, 31)`)).rows[0].n);
      assert(n === 0, `rows from the killed transaction: ${n}`);
    });
  } finally {
    await db.query(`DROP TABLE IF EXISTS ${T}`);
  }
}

// ---------------------------------------------------------------------------
// 2. One backend per transaction; nothing left idle in transaction
// ---------------------------------------------------------------------------

async function testOneBackendPerTransaction() {
  console.log('\n--- 2. Concurrent burst: one backend per transaction, none left idle in transaction ---');
  const [seed] = await controller.createData([TEST_APP, 'burst', { seed: true }], USER);

  await test('every statement of each of 90 concurrent requests runs on a single backend', async () => {
    const tags = [];
    for (let round = 0; round < 3; round++) {
      const jobs = [];
      for (let i = 0; i < 30; i++) {
        const tag = `r${round}-${i}`;
        tags.push(tag);
        trace.set(tag, []);
        jobs.push(als.run(tag, () => (i % 2
          ? controller.createData([TEST_APP, 'burst', { round, i }], USER)
          : controller.setDataById(seed.id, { [`k${round}_${i}`]: i }, USER, TEST_APP))));
      }
      await Promise.all(jobs);
    }
    const split = tags.filter((t) => new Set(trace.get(t).map((s) => s.pid)).size !== 1);
    const unbracketed = tags.filter((t) => {
      const sqls = trace.get(t).map((s) => s.sql);
      return sqls[0] !== 'BEGIN' || sqls[sqls.length - 1] !== 'COMMIT';
    });
    assert(split.length === 0,
      `${split.length}/90 requests spread over several backends, e.g. ${split[0]}: ${JSON.stringify(trace.get(split[0]))}`);
    assert(unbracketed.length === 0, `${unbracketed.length} traces not BEGIN…COMMIT: ${JSON.stringify(trace.get(unbracketed[0]))}`);
  });

  await test('no connection is left idle in transaction after the burst', async () => {
    await sleep(100);
    const idle = await idleInTransaction();
    assert(idle.length === 0, `idle in transaction: ${JSON.stringify(idle)}`);
  });
}

// ---------------------------------------------------------------------------
// 3. Phase 0 repro
// ---------------------------------------------------------------------------

async function testPhase0Repro() {
  console.log('\n--- 3. Phase 0 repro (concurrent failing + succeeding createData) ---');
  const BAD = 'txpgreject' + STAMP;
  const CONSTRAINT = `tx_pg_reject_${STAMP}`;
  await db.query(`ALTER TABLE dms.change_log ADD CONSTRAINT ${CONSTRAINT} CHECK (type <> '${BAD}') NOT VALID`);
  try {
    await test('8 rounds × 30 concurrent writes (10 failing): 0 leaked, 0 lost, 0 idle in transaction', async () => {
      let leaked = 0, lost = 0, ok = 0, thrown = 0, maxIdle = 0;
      for (let round = 0; round < 8; round++) {
        const results = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 3 === 0
          ? controller.createData([TEST_APP, BAD, { round, i }], USER).then(() => ({ bad: 'resolved' }), () => ({ bad: 'threw' }))
          : controller.createData([TEST_APP, 'p0ok', { round, i }], USER).then((r) => ({ id: Number(r[0].id) })))));
        const okIds = results.filter((r) => r.id).map((r) => r.id);
        ok += okIds.length;
        thrown += results.filter((r) => r.bad === 'threw').length;
        leaked += Number((await db.query(`SELECT count(*) AS n FROM ${mainFqn()} WHERE type = $1`, [BAD])).rows[0].n);
        const present = (await db.query(`SELECT id FROM ${mainFqn()} WHERE id = ANY($1::bigint[])`, [okIds])).rows.length;
        lost += okIds.length - present;
        maxIdle = Math.max(maxIdle, (await idleInTransaction()).length);
      }
      assert(thrown === 80, `failing writes that threw: ${thrown}/80`);
      assert(leaked === 0, `rows from failed writes committed: ${leaked}`);
      assert(lost === 0, `acknowledged writes lost: ${lost}/${ok}`);
      assert(maxIdle === 0, `idle-in-transaction connections after a round: ${maxIdle}`);
    });
  } finally {
    await db.query(`ALTER TABLE dms.change_log DROP CONSTRAINT IF EXISTS ${CONSTRAINT}`);
  }
}

// ---------------------------------------------------------------------------
// 4. DAMA source deletes
// ---------------------------------------------------------------------------

async function testDamaSourceDeletes() {
  console.log('\n--- 4. DAMA softDeleteSource / hardDeleteSource ---');
  const hostId = 'tx-test-host';

  async function fixture(label) {
    const { rows: [src] } = await damaDb.query(
      `INSERT INTO data_manager.sources (name) VALUES ($1) RETURNING source_id`, [`${label}-${STAMP}`]);
    const sid = src.source_id;
    const { rows: views } = await damaDb.query(
      `INSERT INTO data_manager.views (source_id) VALUES ($1), ($1) RETURNING view_id`, [sid]);
    await damaDb.query(
      `INSERT INTO data_manager.tasks (host_id, worker_path, source_id) VALUES ($1, 'tx/test', $2)`, [hostId, sid]);
    return { sid, viewIds: views.map((v) => v.view_id) };
  }
  const count = async (table, sid) =>
    Number((await damaDb.query(`SELECT count(*) AS n FROM data_manager.${table} WHERE source_id = $1`, [sid])).rows[0].n);

  async function withSourceDeleteRejected(sid, fn) {
    const trig = `tx_dama_${STAMP}`;
    await damaDb.query(`CREATE OR REPLACE FUNCTION ${trig}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'rejected by ${trig}'; END $$`);
    await damaDb.query(`CREATE TRIGGER ${trig} BEFORE DELETE ON data_manager.sources
      FOR EACH ROW WHEN (OLD.source_id = ${sid}) EXECUTE FUNCTION ${trig}()`);
    try {
      return await fn();
    } finally {
      await damaDb.query(`DROP TRIGGER IF EXISTS ${trig} ON data_manager.sources`);
      await damaDb.query(`DROP FUNCTION IF EXISTS ${trig}()`);
    }
  }

  await test('softDeleteSource removes the source and its views', async () => {
    const f = await fixture('soft');
    const r = await softDeleteSource(DAMA_DB, f.sid);
    assert(r.deleted_source === true && r.deleted_views.length === 2, JSON.stringify(r));
    assert((await count('sources', f.sid)) === 0 && (await count('views', f.sid)) === 0, 'rows gone');
    await damaDb.query(`DELETE FROM data_manager.tasks WHERE source_id = $1`, [f.sid]);
  });

  await test('softDeleteSource: a failure on the source delete rolls back the view deletes', async () => {
    const f = await fixture('softfail');
    let msg = '';
    await withSourceDeleteRejected(f.sid, () => softDeleteSource(DAMA_DB, f.sid).catch((e) => { msg = e.message; }));
    assert(/rejected by/.test(msg), `expected failure, got: ${msg || '(none)'}`);
    assert((await count('sources', f.sid)) === 1 && (await count('views', f.sid)) === 2, 'source + both views intact');
  });

  await test('hardDeleteSource removes tasks, views and the source', async () => {
    const f = await fixture('hard');
    const r = await hardDeleteSource(DAMA_DB, f.sid);
    assert(r.deleted_source === true && r.deleted_tasks === 1, JSON.stringify(r));
    for (const t of ['sources', 'views', 'tasks']) assert((await count(t, f.sid)) === 0, `${t} gone`);
  });

  await test('hardDeleteSource: a failure on the source delete rolls back the task and view deletes', async () => {
    const f = await fixture('hardfail');
    let msg = '';
    await withSourceDeleteRejected(f.sid, () => hardDeleteSource(DAMA_DB, f.sid).catch((e) => { msg = e.message; }));
    assert(/rejected by/.test(msg), `expected failure, got: ${msg || '(none)'}`);
    assert((await count('sources', f.sid)) === 1, 'source intact');
    assert((await count('views', f.sid)) === 2, 'views intact');
    assert((await count('tasks', f.sid)) === 1, 'task intact');
  });
}

// ---------------------------------------------------------------------------

async function run() {
  console.log(`=== Postgres Transaction Tests (${DB_NAME}, ${DAMA_DB}) ===`);
  db = getDb(DB_NAME);
  damaDb = getDb(DAMA_DB);
  await awaitReady();
  if (db.type !== 'postgres' || damaDb.type !== 'postgres') {
    throw new Error(`test-transactions-pg.js needs Postgres configs (got ${db.type}, ${damaDb.type})`);
  }
  const cfg = loadConfig(DB_NAME);
  observer = new pg.Client({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password });
  await observer.connect();
  controller = createController(DB_NAME);
  await controller.createData([TEST_APP, 'warm', {}], USER); // per-app DDL before any burst

  try {
    await testAdapterSemantics();
    await testOneBackendPerTransaction();
    await testPhase0Repro();
    await testDamaSourceDeletes();
  } finally {
    await observer.end();
    fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  }

  console.log(`\n=== Postgres Transaction Tests: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Test error:', e);
  try { fs.rmSync(STORAGE_DIR, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
