/**
 * DAMA task migration tests.
 * Seeds a SQLite database with fake etl_contexts/event_store data,
 * then runs the migration SQL logic and verifies the results.
 *
 * Note: The actual migrate-dama-tasks.js script is PG-only (etl_contexts are PG).
 * These tests simulate the migration logic on SQLite by running equivalent SQL.
 */

const { join } = require('path');
const { unlinkSync, existsSync } = require('fs');
const { SqliteAdapter } = require('../src/db/adapters/sqlite');

const TEST_DB_PATH = join(__dirname, '..', 'src', 'db', 'data', 'migrate-dama-test.sqlite');

let db;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

async function setup() {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);

  db = new SqliteAdapter({ filename: TEST_DB_PATH });

  // Create legacy DAMA schema (simplified for SQLite)
  await db.query(`
    CREATE TABLE etl_statuses (etl_status TEXT PRIMARY KEY);
  `);
  await db.query(`INSERT INTO etl_statuses VALUES ('OPEN'), ('DONE'), ('ERROR')`);

  await db.query(`
    CREATE TABLE etl_contexts (
      etl_context_id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_context_id INTEGER,
      source_id INTEGER,
      etl_task_id TEXT,
      etl_status TEXT,
      initial_event_id INTEGER,
      latest_event_id INTEGER,
      _created_timestamp TEXT DEFAULT (datetime('now')),
      _modified_timestamp TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.query(`
    CREATE TABLE event_store (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      etl_context_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      meta TEXT,
      error INTEGER DEFAULT 0,
      _created_timestamp TEXT DEFAULT (datetime('now'))
    );
  `);

  // Create new task tables (Phase 0 schema, SQLite version)
  await db.query(`
    CREATE TABLE tasks (
      task_id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT NOT NULL,
      source_id INTEGER,
      worker_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL DEFAULT 0,
      result TEXT,
      error TEXT,
      descriptor TEXT,
      queued_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      worker_pid INTEGER
    );
  `);

  await db.query(`
    CREATE TABLE task_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed test data — 6 contexts with various statuses
  // Context 1: DONE with INITIAL + FINAL events
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (1, 1, 'gis-dataset:INITIAL', '{"file":"test.zip"}', '{"__dama_task_manager__":{"worker_path":"gis/publish"}}', '2024-01-01 10:00:00')`);
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (2, 1, 'gis-dataset:PROGRESS', '{"pct":50}', null, '2024-01-01 10:05:00')`);
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (3, 1, 'gis-dataset:FINAL', '{"view_id":42,"source_id":10}', null, '2024-01-01 10:10:00')`);
  await db.query(`INSERT INTO etl_contexts (etl_context_id, source_id, etl_task_id, etl_status, initial_event_id, latest_event_id, _created_timestamp) VALUES (1, 10, 'task-abc', 'DONE', 1, 3, '2024-01-01 09:55:00')`);

  // Context 2: ERROR
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (4, 2, 'csv-dataset:INITIAL', null, null, '2024-01-02 10:00:00')`);
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (5, 2, 'csv-dataset:ERROR', '{"message":"connection refused"}', null, '2024-01-02 10:01:00')`);
  await db.query(`INSERT INTO etl_contexts (etl_context_id, source_id, etl_status, initial_event_id, latest_event_id, _created_timestamp) VALUES (2, 20, 'ERROR', 4, 5, '2024-01-02 09:55:00')`);

  // Context 3: OPEN (running)
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (6, 3, 'analysis:INITIAL', null, null, '2024-01-03 10:00:00')`);
  await db.query(`INSERT INTO etl_contexts (etl_context_id, source_id, etl_status, initial_event_id, latest_event_id, _created_timestamp) VALUES (3, 30, 'OPEN', 6, 6, '2024-01-03 09:55:00')`);

  // Context 4: NULL status (never started)
  await db.query(`INSERT INTO etl_contexts (etl_context_id, source_id, etl_status, _created_timestamp) VALUES (4, 40, null, '2024-01-04 09:55:00')`);

  // Context 5: DONE with parent
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (7, 5, 'upload:INITIAL', null, null, '2024-01-05 10:00:00')`);
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (8, 5, 'upload:FINAL', '{"ok":true}', null, '2024-01-05 10:05:00')`);
  await db.query(`INSERT INTO etl_contexts (etl_context_id, parent_context_id, source_id, etl_status, initial_event_id, latest_event_id, _created_timestamp) VALUES (5, 1, 10, 'DONE', 7, 8, '2024-01-05 09:55:00')`);

  // Context 6: DONE with no source
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (9, 6, 'test:INITIAL', null, null, '2024-01-06 10:00:00')`);
  await db.query(`INSERT INTO event_store (event_id, etl_context_id, type, payload, meta, _created_timestamp) VALUES (10, 6, 'test:FINAL', null, null, '2024-01-06 10:05:00')`);
  await db.query(`INSERT INTO etl_contexts (etl_context_id, etl_status, initial_event_id, latest_event_id, _created_timestamp) VALUES (6, 'DONE', 9, 10, '2024-01-06 09:55:00')`);
}

// Simulate the migration INSERT (SQLite version of the PG SQL)
async function runTaskMigration() {
  // SQLite doesn't have jsonb operators, so we simplify the worker_path extraction
  await db.query(`
    INSERT OR IGNORE INTO tasks (task_id, host_id, source_id, worker_path, status, progress, descriptor, queued_at, started_at, completed_at)
    SELECT
        a.etl_context_id,
        'migrated',
        a.source_id,
        COALESCE(a.etl_task_id, 'unknown'),
        CASE a.etl_status
            WHEN 'DONE' THEN 'done'
            WHEN 'ERROR' THEN 'error'
            WHEN 'OPEN' THEN 'running'
            ELSE 'queued'
        END,
        CASE WHEN a.etl_status = 'DONE' THEN 1 ELSE 0 END,
        json_object('migrated_from', 'etl_context', 'parent_context_id', a.parent_context_id, 'etl_task_id', a.etl_task_id),
        a._created_timestamp,
        (SELECT _created_timestamp FROM event_store WHERE event_id = a.initial_event_id),
        CASE WHEN a.etl_status IN ('DONE', 'ERROR') THEN
            (SELECT _created_timestamp FROM event_store WHERE event_id = a.latest_event_id)
        END
    FROM etl_contexts a
  `);
}

async function runEventMigration() {
  await db.query(`
    INSERT OR IGNORE INTO task_events (event_id, task_id, type, message, payload, created_at)
    SELECT
        e.event_id,
        e.etl_context_id,
        e.type,
        COALESCE(e.type, ''),
        e.payload,
        e._created_timestamp
    FROM event_store e
    WHERE e.type LIKE '%:INITIAL'
       OR e.type LIKE '%:FINAL'
       OR e.type LIKE '%:ERROR'
  `);
}

async function runTests() {
  console.log('\n=== DAMA Task Migration Tests ===\n');
  await setup();

  // --- Task backfill ---

  await test('backfills correct number of tasks', async () => {
    await runTaskMigration();
    const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM tasks');
    assert(+rows[0].cnt === 6, `should create 6 tasks, got ${rows[0].cnt}`);
  });

  await test('status mapping: DONE → done', async () => {
    const { rows } = await db.query('SELECT status, progress FROM tasks WHERE task_id = 1');
    assert(rows[0].status === 'done', `status should be done, got ${rows[0].status}`);
    assert(rows[0].progress === 1, 'progress should be 1 for done tasks');
  });

  await test('status mapping: ERROR → error', async () => {
    const { rows } = await db.query('SELECT status FROM tasks WHERE task_id = 2');
    assert(rows[0].status === 'error', `status should be error, got ${rows[0].status}`);
  });

  await test('status mapping: OPEN → running', async () => {
    const { rows } = await db.query('SELECT status FROM tasks WHERE task_id = 3');
    assert(rows[0].status === 'running', `status should be running, got ${rows[0].status}`);
  });

  await test('status mapping: NULL → queued', async () => {
    const { rows } = await db.query('SELECT status FROM tasks WHERE task_id = 4');
    assert(rows[0].status === 'queued', `status should be queued, got ${rows[0].status}`);
  });

  await test('host_id is "migrated"', async () => {
    const { rows } = await db.query('SELECT DISTINCT host_id FROM tasks');
    assert(rows.length === 1 && rows[0].host_id === 'migrated', 'all tasks should have host_id=migrated');
  });

  await test('source_id preserved', async () => {
    const { rows } = await db.query('SELECT source_id FROM tasks WHERE task_id = 1');
    assert(+rows[0].source_id === 10, `source_id should be 10, got ${rows[0].source_id}`);
  });

  await test('source_id null when not set', async () => {
    const { rows } = await db.query('SELECT source_id FROM tasks WHERE task_id = 6');
    assert(rows[0].source_id === null, 'source_id should be null');
  });

  await test('worker_path from etl_task_id', async () => {
    const { rows } = await db.query('SELECT worker_path FROM tasks WHERE task_id = 1');
    assert(rows[0].worker_path === 'task-abc', `worker_path should be task-abc, got ${rows[0].worker_path}`);
  });

  await test('worker_path defaults to unknown', async () => {
    const { rows } = await db.query('SELECT worker_path FROM tasks WHERE task_id = 4');
    assert(rows[0].worker_path === 'unknown', `worker_path should be unknown, got ${rows[0].worker_path}`);
  });

  await test('queued_at from etl_context _created_timestamp', async () => {
    const { rows } = await db.query('SELECT queued_at FROM tasks WHERE task_id = 1');
    assert(rows[0].queued_at === '2024-01-01 09:55:00', `queued_at should match, got ${rows[0].queued_at}`);
  });

  await test('started_at from INITIAL event timestamp', async () => {
    const { rows } = await db.query('SELECT started_at FROM tasks WHERE task_id = 1');
    assert(rows[0].started_at === '2024-01-01 10:00:00', `started_at should match INITIAL event, got ${rows[0].started_at}`);
  });

  await test('completed_at from FINAL event timestamp for done tasks', async () => {
    const { rows } = await db.query('SELECT completed_at FROM tasks WHERE task_id = 1');
    assert(rows[0].completed_at === '2024-01-01 10:10:00', `completed_at should match FINAL event, got ${rows[0].completed_at}`);
  });

  await test('completed_at null for running tasks', async () => {
    const { rows } = await db.query('SELECT completed_at FROM tasks WHERE task_id = 3');
    assert(rows[0].completed_at === null, 'completed_at should be null for running tasks');
  });

  await test('started_at null for never-started tasks', async () => {
    const { rows } = await db.query('SELECT started_at FROM tasks WHERE task_id = 4');
    assert(rows[0].started_at === null, 'started_at should be null for queued tasks');
  });

  await test('descriptor contains migration metadata', async () => {
    const { rows } = await db.query('SELECT descriptor FROM tasks WHERE task_id = 5');
    const desc = typeof rows[0].descriptor === 'string' ? JSON.parse(rows[0].descriptor) : rows[0].descriptor;
    assert(desc.migrated_from === 'etl_context', 'should have migrated_from');
    assert(+desc.parent_context_id === 1, 'should have parent_context_id');
  });

  // --- Idempotency ---

  await test('idempotent: second run creates no duplicates', async () => {
    const before = (await db.query('SELECT COUNT(*) AS cnt FROM tasks')).rows[0].cnt;
    await runTaskMigration();
    const after = (await db.query('SELECT COUNT(*) AS cnt FROM tasks')).rows[0].cnt;
    assert(+before === +after, `count should be unchanged: ${before} vs ${after}`);
  });

  // --- Event backfill ---

  await test('milestone events backfilled', async () => {
    await runEventMigration();
    const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM task_events');
    // Should have: 2 INITIAL+FINAL for ctx 1, 1 INITIAL+1 ERROR for ctx 2, 1 INITIAL for ctx 3,
    // 2 for ctx 5, 2 for ctx 6 = 9 milestone events
    assert(+rows[0].cnt === 9, `should have 9 milestone events, got ${rows[0].cnt}`);
  });

  await test('progress events NOT backfilled', async () => {
    const { rows } = await db.query("SELECT COUNT(*) AS cnt FROM task_events WHERE type LIKE '%PROGRESS%'");
    assert(+rows[0].cnt === 0, 'should have 0 progress events');
  });

  await test('event task_id maps to etl_context_id', async () => {
    const { rows } = await db.query('SELECT DISTINCT task_id FROM task_events ORDER BY task_id');
    const taskIds = rows.map(r => +r.task_id);
    assert(taskIds.includes(1), 'should have events for task 1');
    assert(taskIds.includes(2), 'should have events for task 2');
    assert(!taskIds.includes(4), 'task 4 had no events');
  });

  await test('event idempotent: second run creates no duplicates', async () => {
    const before = (await db.query('SELECT COUNT(*) AS cnt FROM task_events')).rows[0].cnt;
    await runEventMigration();
    const after = (await db.query('SELECT COUNT(*) AS cnt FROM task_events')).rows[0].cnt;
    assert(+before === +after, `count should be unchanged: ${before} vs ${after}`);
  });

  // --- Old tables untouched ---

  await test('etl_contexts unchanged after migration', async () => {
    const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM etl_contexts');
    assert(+rows[0].cnt === 6, 'etl_contexts should still have 6 rows');
  });

  await test('event_store unchanged after migration', async () => {
    const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM event_store');
    assert(+rows[0].cnt === 10, 'event_store should still have 10 rows');
  });

  // Cleanup
  try { unlinkSync(TEST_DB_PATH); } catch (e) {}

  // --- Summary ---
  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
