/**
 * Real-transaction regression tests (dms-server-real-transactions.md).
 *
 * Before this task, "transactions" in dms-server were BEGIN/COMMIT sent through the adapter's
 * ordinary query(): on Postgres each statement drew an arbitrary pooled connection (Bug 14 —
 * reproduced: 156 of 160 acknowledged concurrent writes lost, failed writes' rows committed),
 * and on SQLite every other request's queries ran inside whichever transaction was open on the
 * one shared connection (C4 — colliding allocateId() ids). Both adapters now have
 * withTransaction(fn); these tests pin its contract and the converted call sites.
 *
 * Covers:
 *   A. Adapter contract: commit / rollback, nesting, a handle used after its transaction,
 *      afterCommit, the old API throwing, re-entrancy, and — the core property — another
 *      caller's query during an open transaction is neither part of it nor rolled back with it
 *      (and, on SQLite, waits for it).
 *   B. dms.controller writes: concurrent createData gets distinct ids (C4); a createData that
 *      fails mid-block leaves nothing while concurrent successes all land (the Phase 0 repro);
 *      concurrent setDataById merges don't lose keys; a deleteData whose cascade fails rolls
 *      back the source, its view and the dmsEnv ref together.
 *   C. /sync/push: unknown action 400, update-of-missing 404, concurrent creates distinct.
 *   D. uda.sources.delete (deleteInternalSource): happy path, and a mid-block failure rolls
 *      back the dmsEnv ref update and view deletes.
 *   E. A DMS task-queue claim that fires while another transaction holds the connection
 *      waits (SQLite) / proceeds (PG) and claims — it used to hit "cannot start a transaction
 *      within a transaction" on SQLite.
 *
 * Database selection: DMS_TEST_DB=dms-sqlite (default) or dms-postgres-test (via
 * tests/postgres-docker.js). Postgres-only checks (pg_stat_activity, per-backend tracing,
 * DAMA source deletes) live in test-transactions-pg.js.
 */

const http = require('http');
const express = require('express');
const { createTestGraph } = require('./graph');
const { getDb, awaitReady } = require('../src/db/index.js');
const { resolveTable } = require('../src/db/table-resolver.js');
const { createController } = require('../src/routes/dms/dms.controller.js');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
// UDA routes and the DMS task queue resolve their db from DMS_DB_ENV — sync it with the test DB.
process.env.DMS_DB_ENV = DB_NAME;
const { createSyncRoutes } = require('../src/routes/sync/sync.js');
const dmsTasks = require('../src/dms/tasks');
// uda.sources.delete's controller (the route in uda.tasks.route.js only wraps it in a try/catch,
// and the test graph harness doesn't mount that route file).
const { deleteInternalSource } = require('../src/routes/uda/uda.tasks.controller.js');

const STAMP = Date.now();
const TEST_APP = 'txtest' + STAMP;
const SPLIT_MODE = 'per-app';
const USER = { id: 1, email: 'test@test.com', groups: ['admin'] };

let db, graph, controller;
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
const isPg = () => db.type === 'postgres';
const mainFqn = () => resolveTable(TEST_APP, '', db.type, SPLIT_MODE).fullName;
const changeLogTbl = () => (isPg() ? 'dms.change_log' : 'change_log');

async function rowCount(sql, values) {
  const { rows } = await db.query(sql, values);
  return Number(rows[0].n);
}

/**
 * Make change_log reject inserts matching `whereSql` (a boolean expression over NEW.*), so a
 * write fails AFTER its own statements ran. Returns an async remover. SQLite: a RAISE trigger.
 * Postgres: a CHECK constraint (NOT VALID, so existing rows are not checked).
 */
async function rejectChangeLogWhere(name, pgCheckSql, sqliteWhenSql) {
  if (isPg()) {
    await db.query(`ALTER TABLE dms.change_log DROP CONSTRAINT IF EXISTS ${name}`);
    await db.query(`ALTER TABLE dms.change_log ADD CONSTRAINT ${name} CHECK (${pgCheckSql}) NOT VALID`);
    return () => db.query(`ALTER TABLE dms.change_log DROP CONSTRAINT IF EXISTS ${name}`);
  }
  await db.query(`DROP TRIGGER IF EXISTS ${name}`);
  await db.query(
    `CREATE TRIGGER ${name} BEFORE INSERT ON change_log WHEN ${sqliteWhenSql}
     BEGIN SELECT RAISE(ABORT, 'rejected by ${name}'); END`
  );
  return () => db.query(`DROP TRIGGER IF EXISTS ${name}`);
}

// ---------------------------------------------------------------------------
// A. Adapter contract
// ---------------------------------------------------------------------------

async function testAdapterContract() {
  console.log('\n--- A. withTransaction adapter contract ---');
  const T = isPg() ? 'public.tx_contract_' + STAMP : 'tx_contract_' + STAMP;
  await db.query(`CREATE TABLE ${T} (id INTEGER PRIMARY KEY, v TEXT)`);
  const ids = async () => (await db.query(`SELECT id FROM ${T} ORDER BY id`)).rows.map((r) => Number(r.id));

  try {
    await test('commit returns fn\'s result and the row lands', async () => {
      const r = await db.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T} (id, v) VALUES ($1, $2)`, [1, 'a']);
        return 'result';
      });
      assert(r === 'result', `result ${r}`);
      assert(JSON.stringify(await ids()) === '[1]', 'row 1 committed');
    });

    await test('a transaction that throws leaves no rows, and the error propagates', async () => {
      let err = null;
      try {
        await db.withTransaction(async (tx) => {
          await tx.query(`INSERT INTO ${T} (id, v) VALUES ($1, $2)`, [2, 'b']);
          await tx.query(`INSERT INTO ${T} (id, v) VALUES ($1, $2)`, [3, 'c']);
          throw new Error('boom');
        });
      } catch (e) { err = e; }
      assert(err && err.message === 'boom', 'original error rethrown');
      assert(JSON.stringify(await ids()) === '[1]', `rows 2,3 rolled back (got ${await ids()})`);
    });

    await test('a failing statement rolls back the statements before it', async () => {
      let threw = false;
      try {
        await db.withTransaction(async (tx) => {
          await tx.query(`INSERT INTO ${T} (id, v) VALUES ($1, $2)`, [4, 'd']);
          await tx.query(`INSERT INTO ${T} (id, v) VALUES ($1, $2)`, [1, 'duplicate pk']);
        });
      } catch { threw = true; }
      assert(threw, 'duplicate key threw');
      assert(JSON.stringify(await ids()) === '[1]', 'row 4 rolled back');
    });

    await test('tx.withTransaction(f) nests inline on the same handle', async () => {
      await db.withTransaction(async (tx) => {
        await tx.withTransaction(async (inner) => {
          assert(inner === tx, 'inner handle is the outer tx');
          await inner.query(`INSERT INTO ${T} (id, v) VALUES (5, 'nested')`);
        });
      });
      assert((await ids()).includes(5), 'nested insert committed with the outer');
    });

    await test('db.withTransaction inside its own open transaction throws (would deadlock / split)', async () => {
      let msg = '';
      await db.withTransaction(async () => {
        try { await db.withTransaction(async () => {}); } catch (e) { msg = e.message; }
      });
      assert(/tx\.withTransaction/.test(msg), `clear error, got: ${msg}`);
    });

    await test('a tx handle used after its transaction ended throws', async () => {
      let saved;
      await db.withTransaction(async (tx) => { saved = tx; });
      let msg = '';
      try { await saved.query('SELECT 1 AS x'); } catch (e) { msg = e.message; }
      assert(/after its transaction ended/.test(msg), `got: ${msg}`);
    });

    await test('afterCommit runs after commit (lock/connection released), never on rollback', async () => {
      const seen = [];
      await db.withTransaction(async (tx) => {
        tx.afterCommit(async () => {
          // A plain adapter query here would deadlock on SQLite if the lock were still held.
          const { rows } = await db.query(`SELECT count(*) AS n FROM ${T} WHERE id = 6`);
          seen.push(`after:${Number(rows[0].n)}`);
        });
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (6, 'f')`);
        seen.push('in');
      });
      await db.withTransaction(async (tx) => {
        tx.afterCommit(() => seen.push('never'));
        throw new Error('rollback');
      }).catch(() => {});
      assert(JSON.stringify(seen) === '["in","after:1"]', `order ${JSON.stringify(seen)}`);
    });

    await test('a failing afterCommit callback does not fail the committed transaction', async () => {
      const r = await db.withTransaction(async (tx) => {
        tx.afterCommit(() => { throw new Error('callback boom'); });
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (7, 'g')`);
        return 'ok';
      });
      assert(r === 'ok' && (await ids()).includes(7), 'committed and resolved');
    });

    await test('the old begin/commit/rollbackTransaction API throws with the fix in the message', async () => {
      for (const m of ['beginTransaction', 'commitTransaction', 'rollbackTransaction']) {
        let msg = '';
        try { await db[m](); } catch (e) { msg = e.message; }
        assert(/withTransaction/.test(msg), `${m}: ${msg}`);
      }
    });

    await test('another caller\'s query during an open transaction is not part of it, not rolled back with it, and never sees its uncommitted row', async () => {
      const order = [];
      let open;
      const gate = new Promise((r) => { open = r; });
      const txp = db.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (10, 'tx-uncommitted')`);
        order.push('tx:inserted');
        await gate;
        order.push('tx:ending');
        throw new Error('roll back the transaction');
      }).catch(() => order.push('tx:rolledback'));
      await sleep(30);
      const plainWrite = db.query(`INSERT INTO ${T} (id, v) VALUES (11, 'plain')`).then(() => order.push('plain:write'));
      const plainRead = db.query(`SELECT count(*) AS n FROM ${T} WHERE id = 10`).then(({ rows }) => {
        order.push('plain:read');
        return Number(rows[0].n);
      });
      await sleep(60);
      open();
      await txp;
      await plainWrite;
      const sawUncommitted = await plainRead;
      const final = await ids();
      assert(sawUncommitted === 0, 'other caller saw the uncommitted row');
      assert(final.includes(11), 'the other caller\'s write was rolled back with the transaction');
      assert(!final.includes(10), 'the transaction\'s own row survived its rollback');
      if (!isPg()) {
        // One shared connection: the other caller must WAIT for the transaction to end.
        assert(order.indexOf('plain:write') > order.indexOf('tx:ending'),
          `SQLite: plain query ran inside the open transaction (order ${order.join(' → ')})`);
      }
    });

    await test(isPg()
      ? 'a stray adapter query inside its own transaction runs outside it (PG: warned, not joined)'
      : 'a stray adapter query inside its own transaction throws instead of deadlocking (SQLite)', async () => {
      let msg = '';
      await db.withTransaction(async (tx) => {
        await tx.query(`INSERT INTO ${T} (id, v) VALUES (20, 'tx')`);
        try { await db.query(`INSERT INTO ${T} (id, v) VALUES (21, 'stray')`); } catch (e) { msg = e.message; }
        throw new Error('roll back');
      }).catch(() => {});
      const final = await ids();
      assert(!final.includes(20), 'tx row rolled back');
      if (isPg()) {
        assert(msg === '' && final.includes(21), 'PG stray query ran on the pool, outside the transaction');
      } else {
        assert(/use tx\.query/i.test(msg) && !final.includes(21), `SQLite stray query should throw, got: ${msg || '(no error)'}`);
      }
    });
  } finally {
    await db.query(`DROP TABLE IF EXISTS ${T}`);
  }
}

// ---------------------------------------------------------------------------
// B. dms.controller writes
// ---------------------------------------------------------------------------

async function testControllerWrites() {
  console.log('\n--- B. dms.controller writes ---');
  // Warm: per-app schema/table/sequence DDL happens before any burst.
  await controller.createData([TEST_APP, 'warm', { warm: true }], USER);

  await test('C4: 50 concurrent createData calls get 50 distinct ids, all rows and change_log entries land', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      controller.createData([TEST_APP, 'c4', { i }], USER)));
    const ids = results.map((r) => Number(r[0].id));
    assert(new Set(ids).size === 50, `distinct ids: ${new Set(ids).size}/50`);
    const n = await rowCount(`SELECT count(*) AS n FROM ${mainFqn()} WHERE type = 'c4'`);
    assert(n === 50, `rows present: ${n}/50`);
    const byI = new Set((await db.query(`SELECT data FROM ${mainFqn()} WHERE type = 'c4'`)).rows
      .map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data).i));
    assert(byI.size === 50, `no row overwritten another: ${byI.size}/50 distinct payloads`);
    const logged = await rowCount(
      `SELECT count(*) AS n FROM ${changeLogTbl()} WHERE app = $1 AND type = 'c4' AND action = 'I'`, [TEST_APP]);
    assert(logged === 50, `change_log I rows: ${logged}/50`);
  });

  const BAD = 'txreject' + STAMP;
  const drop = await rejectChangeLogWhere(`tx_reject_${STAMP}`, `type <> '${BAD}'`, `NEW.type = '${BAD}'`);
  try {
    await test('Phase 0 repro: failing writes leave no rows while every concurrent success lands', async () => {
      for (let round = 0; round < 3; round++) {
        const jobs = Array.from({ length: 30 }, (_, i) => (i % 3 === 0
          ? controller.createData([TEST_APP, BAD, { round, i }], USER).then(() => ({ bad: true, threw: false }), () => ({ bad: true, threw: true }))
          : controller.createData([TEST_APP, 'txok', { round, i }], USER).then((r) => ({ id: Number(r[0].id) }))));
        const results = await Promise.all(jobs);
        const okIds = results.filter((r) => r.id).map((r) => r.id);
        assert(results.filter((r) => r.bad && r.threw).length === 10, 'all 10 failing writes threw');
        const leaked = await rowCount(`SELECT count(*) AS n FROM ${mainFqn()} WHERE type = $1`, [BAD]);
        assert(leaked === 0, `round ${round}: ${leaked} rows from failed writes committed`);
        const { rows } = await db.query(`SELECT id FROM ${mainFqn()} WHERE type = 'txok'`);
        const present = new Set(rows.map((r) => Number(r.id)));
        const lost = okIds.filter((id) => !present.has(id));
        assert(lost.length === 0, `round ${round}: ${lost.length}/${okIds.length} acknowledged writes lost`);
      }
    });
  } finally {
    await drop();
  }

  await test('20 concurrent setDataById merges on one row keep every key', async () => {
    const [row] = await controller.createData([TEST_APP, 'merge', {}], USER);
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      controller.setDataById(row.id, { [`k${i}`]: i }, USER, TEST_APP)));
    const { rows } = await db.query(`SELECT data FROM ${mainFqn()} WHERE id = $1`, [row.id]);
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const keys = Object.keys(data).filter((k) => /^k\d+$/.test(k));
    assert(keys.length === 20, `keys after merge: ${keys.length}/20`);
  });

  await test('a deleteData whose cascade fails rolls back the source, its view, its split table and the dmsEnv ref together', async () => {
    const ENV = 'txenv';
    const slug = 'txsrc' + STAMP;
    const [env] = await controller.createData([TEST_APP, `${TEST_APP}|${ENV}:dmsenv`, { sources: [] }], USER);
    const [src] = await controller.createData([TEST_APP, `${ENV}|${slug}:source`, { name: slug }], USER);
    const [view] = await controller.createData([TEST_APP, `${slug}|v1:view`, { name: 'v1' }], USER);
    await controller.setDataById(env.id, { sources: [{ id: src.id }] }, USER, TEST_APP);
    await controller.setDataById(src.id, { views: [{ id: view.id }] }, USER, TEST_APP);
    const dataType = `${slug}|${view.id}:data`;
    await controller.createData([TEST_APP, dataType, { col: 'x' }], USER);
    const split = resolveTable(TEST_APP, dataType, db.type, SPLIT_MODE, Number(src.id));
    const splitExists = async () => (isPg()
      ? (await db.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [split.schema, split.table])).rows.length > 0
      : (await db.query(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1`, [split.table])).rows.length > 0);
    assert(await splitExists(), 'fixture: split table exists');

    // Reject the change_log row for the VIEW's cascade delete — after the source row delete,
    // the view row delete and the split-table DROP have already run inside the transaction.
    const viewType = `${slug}|v1:view`;
    const dropTrigger = await rejectChangeLogWhere(`tx_cascade_${STAMP}`,
      `NOT (type = '${viewType}' AND action = 'D')`, `NEW.type = '${viewType}' AND NEW.action = 'D'`);
    let threw = false;
    try {
      await controller.deleteData(TEST_APP, `${ENV}|${slug}:source`, [src.id], USER);
    } catch { threw = true; } finally {
      await dropTrigger();
    }
    assert(threw, 'deleteData threw');
    const exists = async (id) => (await rowCount(`SELECT count(*) AS n FROM ${mainFqn()} WHERE id = $1`, [id])) === 1;
    assert(await exists(src.id), 'source row rolled back (still present)');
    assert(await exists(view.id), 'view row rolled back (still present)');
    assert(await splitExists(), 'split table DROP rolled back (still present)');
    const { rows } = await db.query(`SELECT data FROM ${mainFqn()} WHERE id = $1`, [env.id]);
    const envData = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    assert((envData.sources || []).some((s) => Number(s.id) === Number(src.id)), 'dmsEnv ref rolled back (still present)');

    // And the same delete succeeds once nothing rejects it.
    await controller.deleteData(TEST_APP, `${ENV}|${slug}:source`, [src.id], USER);
    assert(!(await exists(src.id)) && !(await exists(view.id)) && !(await splitExists()), 'clean delete cascades');
  });
}

// ---------------------------------------------------------------------------
// C. /sync/push
// ---------------------------------------------------------------------------

async function testSyncPush() {
  console.log('\n--- C. /sync/push ---');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.availAuthContext = { user: { id: 1 } }; next(); });
  app.use(createSyncRoutes(DB_NAME));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;
  const push = (body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port, path: '/sync/push', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  try {
    await test('unknown action → 400', async () => {
      const r = await push({ action: 'X', item: { app: TEST_APP, type: 'sp', data: {} } });
      assert(r.status === 400 && /Unknown action/.test(r.body.error), `${r.status} ${JSON.stringify(r.body)}`);
    });

    await test('update of a missing id → 404 and no change_log row', async () => {
      const before = await rowCount(`SELECT count(*) AS n FROM ${changeLogTbl()} WHERE item_id = $1`, [987654321]);
      const r = await push({ action: 'U', item: { id: 987654321, app: TEST_APP, type: 'sp', data: { a: 1 } } });
      const after = await rowCount(`SELECT count(*) AS n FROM ${changeLogTbl()} WHERE item_id = $1`, [987654321]);
      assert(r.status === 404, `status ${r.status}`);
      assert(after === before, 'no change_log row written');
    });

    await test('20 concurrent pushed creates get distinct ids and all land with their change_log rows', async () => {
      const rs = await Promise.all(Array.from({ length: 20 }, (_, i) =>
        push({ action: 'I', item: { app: TEST_APP, type: 'spush', data: { i } } })));
      assert(rs.every((r) => r.status === 200), `statuses ${rs.map((r) => r.status)}`);
      const ids = rs.map((r) => Number(r.body.item.id));
      assert(new Set(ids).size === 20, `distinct ids ${new Set(ids).size}/20`);
      const n = await rowCount(`SELECT count(*) AS n FROM ${mainFqn()} WHERE type = 'spush'`);
      assert(n === 20, `rows ${n}/20`);
      const logged = await rowCount(
        `SELECT count(*) AS n FROM ${changeLogTbl()} WHERE app = $1 AND type = 'spush' AND action = 'I'`, [TEST_APP]);
      assert(logged === 20, `change_log rows ${logged}/20`);
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// ---------------------------------------------------------------------------
// D. uda.sources.delete → deleteInternalSource
// ---------------------------------------------------------------------------

async function testInternalSourceDelete() {
  console.log('\n--- D. uda.sources.delete (deleteInternalSource) ---');
  const ENV = 'txudaenv';
  const UDA_ENV = `${TEST_APP}+${ENV}`;

  async function fixture(slug) {
    const [env] = await controller.createData([TEST_APP, `${TEST_APP}|${ENV}:dmsenv`, { sources: [] }], USER);
    const [src] = await controller.createData([TEST_APP, `${ENV}|${slug}:source`, { name: slug }], USER);
    const [view] = await controller.createData([TEST_APP, `${slug}|v1:view`, { name: 'v1' }], USER);
    await controller.setDataById(src.id, { views: [{ id: +view.id }] }, USER, TEST_APP);
    await controller.setDataById(env.id, { sources: [{ id: +src.id }] }, USER, TEST_APP);
    return { envId: +env.id, srcId: +src.id, viewId: +view.id };
  }
  const exists = async (id) => (await rowCount(`SELECT count(*) AS n FROM ${mainFqn()} WHERE id = $1`, [id])) === 1;
  const envRefs = async (envId) => {
    const { rows } = await db.query(`SELECT data FROM ${mainFqn()} WHERE id = $1`, [envId]);
    const d = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    return (d.sources || []).map((s) => +s.id);
  };
  const callDelete = async (srcId) => {
    try { return await deleteInternalSource(UDA_ENV, srcId); } catch (e) { return { error: e.message }; }
  };

  await test('happy path: source, view and dmsEnv ref all removed', async () => {
    const f = await fixture('udaok' + STAMP);
    const result = await callDelete(f.srcId);
    assert(!result.error, `route error: ${result.error}`);
    assert(result.deleted_source === true && result.deleted_view_count === 1, JSON.stringify(result));
    assert(!(await exists(f.srcId)) && !(await exists(f.viewId)), 'rows gone');
    assert(!(await envRefs(f.envId)).includes(f.srcId), 'env ref removed');
  });

  await test('a failure inside the block rolls back the dmsEnv ref update and the view delete', async () => {
    const f = await fixture('udafail' + STAMP);
    const trig = `tx_uda_${STAMP}`;
    const tbl = mainFqn();
    if (isPg()) {
      await db.query(`CREATE OR REPLACE FUNCTION ${trig}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'rejected by ${trig}'; END $$`);
      await db.query(`CREATE TRIGGER ${trig} BEFORE DELETE ON ${tbl} FOR EACH ROW WHEN (OLD.id = ${f.srcId}) EXECUTE FUNCTION ${trig}()`);
    } else {
      await db.query(`CREATE TRIGGER ${trig} BEFORE DELETE ON ${tbl} WHEN OLD.id = ${f.srcId}
        BEGIN SELECT RAISE(ABORT, 'rejected by ${trig}'); END`);
    }
    let result;
    try {
      result = await callDelete(f.srcId);
    } finally {
      if (isPg()) {
        await db.query(`DROP TRIGGER IF EXISTS ${trig} ON ${tbl}`);
        await db.query(`DROP FUNCTION IF EXISTS ${trig}()`);
      } else {
        await db.query(`DROP TRIGGER IF EXISTS ${trig}`);
      }
    }
    assert(result && /rejected by/.test(result.error || ''), `expected the source delete to fail: ${JSON.stringify(result)}`);
    assert(await exists(f.srcId), 'source still present');
    assert(await exists(f.viewId), 'view delete rolled back');
    assert((await envRefs(f.envId)).includes(f.srcId), 'dmsEnv ref update rolled back');
  });
}

// ---------------------------------------------------------------------------
// E. DMS task-queue claim vs an open transaction
// ---------------------------------------------------------------------------

async function testTaskClaim() {
  console.log('\n--- E. DMS task-queue claim during another open transaction ---');
  const table = isPg() ? 'dms.tasks' : 'dms_tasks';
  const worker = 'txtest/claim-' + STAMP;
  // The oldest queued row for this host is claimed first; backdate ours so the claim picks it
  // without touching any other queued rows in the database.
  const { rows } = await db.query(
    `INSERT INTO ${table} (host_id, app, worker_path, status, descriptor, queued_at)
     VALUES ($1, $2, $3, 'queued', $4, '1970-01-01 00:00:00') RETURNING task_id`,
    [dmsTasks.hostId, TEST_APP, worker, { workerPath: worker }]
  );
  const taskId = Number(rows[0].task_id);

  await test('claimNextTask fired while another withTransaction holds the connection claims the task', async () => {
    let open;
    const gate = new Promise((r) => { open = r; });
    const holder = db.withTransaction(async (tx) => { await tx.query('SELECT 1 AS x'); await gate; });
    await sleep(20);
    const claimP = dmsTasks.claimNextTask();
    setTimeout(open, 50);
    const claimed = await claimP;
    await holder;
    assert(claimed && Number(claimed.task_id) === taskId, `claimed ${claimed && claimed.task_id}, want ${taskId}`);
    assert(claimed.status === 'running', `status ${claimed.status}`);
  });

  await db.query(`DELETE FROM ${table} WHERE task_id = $1`, [taskId]);
}

// ---------------------------------------------------------------------------

async function run() {
  console.log(`=== Transaction Tests (${DB_NAME}) ===`);
  db = getDb(DB_NAME);
  await awaitReady();
  graph = createTestGraph(DB_NAME);
  controller = createController(DB_NAME, { splitMode: SPLIT_MODE });

  await testAdapterContract();
  await testControllerWrites();
  await testSyncPush();
  await testInternalSourceDelete();
  await testTaskClaim();

  console.log(`\n=== Transaction Tests: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
