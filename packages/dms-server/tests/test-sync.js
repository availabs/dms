/**
 * Sync Integration Tests
 *
 * Tests the change_log, sync REST endpoints (bootstrap/delta/push),
 * and WebSocket broadcast functionality.
 *
 * Uses real SQLite database (no mocks).
 * Supports PostgreSQL via DMS_TEST_DB env var.
 */

const http = require('http');
const express = require('express');
const { createTestGraph } = require('./graph');
const { createSyncRoutes } = require('../src/routes/sync/sync');
const { initWebSocket, notifyChange, getWSS } = require('../src/routes/sync/ws');
const { getDb, awaitReady } = require('../src/db');

const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'sync-test-' + Date.now();
const TEST_TYPE = 'sync-test-page';

let graph = null;
let server = null;
let serverUrl = null;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    failed++;
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
  passed++;
}

async function setup() {
  console.log('=== Sync Integration Tests ===\n');

  // Create test graph for Falcor route access
  graph = createTestGraph(DB_NAME);
  console.log(`Database: ${DB_NAME} (${graph.dbType})`);
  console.log(`Test app: ${TEST_APP}\n`);

  // Wait for DB init
  await awaitReady();

  // Create a small Express app for sync endpoint testing
  const app = express();
  app.use(express.json());

  // Mock auth context for push endpoint
  app.use((req, res, next) => {
    req.availAuthContext = { user: { id: 1 } };
    next();
  });

  // Mount sync routes
  app.use(createSyncRoutes(DB_NAME));

  // Start server on random port
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      console.log(`Test server on port ${port}\n`);

      // Init WebSocket on the test server
      const db = getDb(DB_NAME);
      initWebSocket(server, db);

      // Wire notify callback for push endpoint
      createSyncRoutes._notifyChange = notifyChange;

      // Wire notify callback for controller (Falcor routes)
      graph.controller.setNotifyChange(notifyChange);

      resolve();
    });
  });
}

async function cleanup() {
  // Delete test data
  try {
    await graph.callAsync(
      ['dms', 'data', 'delete'],
      [TEST_APP, TEST_TYPE, ...(createdIds)]
    );
  } catch { /* ignore */ }

  if (server) {
    const wss = getWSS();
    if (wss) {
      for (const client of wss.clients) client.terminate();
    }
    await new Promise(r => server.close(r));
  }
}

// Track created IDs for cleanup
const createdIds = [];

// Helper: HTTP GET
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${serverUrl}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

// Helper: HTTP POST
function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(responseData) }); }
        catch { resolve({ status: res.statusCode, body: responseData }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============================================================================
// TESTS
// ============================================================================

async function testChangeLogGrowsOnCreate() {
  console.log('--- Test: change_log grows on create ---');

  // Get initial change_log count
  const db = getDb(DB_NAME);
  const tbl = graph.dbType === 'postgres' ? 'dms.change_log' : 'change_log';
  const before = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1`, [TEST_APP]);

  // Create via Falcor route
  const result = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE, { title: 'Sync Test 1' }]);
  const id = Number(Object.keys(result.jsonGraph.dms.data.byId)[0]);
  createdIds.push(id);

  const after = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1`, [TEST_APP]);
  assert(Number(after[0].cnt) === Number(before[0].cnt) + 1, `change_log count increased by 1 (was ${before[0].cnt}, now ${after[0].cnt})`);

  // Verify change_log entry
  const logs = await db.promise(`SELECT * FROM ${tbl} WHERE app = $1 AND item_id = $2`, [TEST_APP, id]);
  assert(logs.length === 1, 'One change_log entry for the created item');
  assert(logs[0].action === 'I', `Action is 'I' (got '${logs[0].action}')`);
  assert(Number(logs[0].item_id) === id, `item_id matches (got ${logs[0].item_id})`);

  console.log(`  Created item ${id}, change_log entry: revision=${logs[0].revision}, action=${logs[0].action}`);
  console.log('  \u2713 change_log grows on create\n');
}

async function testChangeLogGrowsOnEdit() {
  console.log('--- Test: change_log grows on edit ---');

  const db = getDb(DB_NAME);
  const tbl = graph.dbType === 'postgres' ? 'dms.change_log' : 'change_log';
  const id = createdIds[0];

  const before = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1 AND item_id = $2`, [TEST_APP, id]);

  // Edit via Falcor route
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, id, { title: 'Updated Sync Test 1' }]);

  const after = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1 AND item_id = $2`, [TEST_APP, id]);
  assert(Number(after[0].cnt) === Number(before[0].cnt) + 1, 'change_log count increased by 1');

  const logs = await db.promise(
    `SELECT * FROM ${tbl} WHERE app = $1 AND item_id = $2 ORDER BY revision DESC LIMIT 1`,
    [TEST_APP, id]
  );
  assert(logs[0].action === 'U', `Action is 'U' (got '${logs[0].action}')`);

  console.log(`  Edited item ${id}, latest revision=${logs[0].revision}, action=${logs[0].action}`);
  console.log('  \u2713 change_log grows on edit\n');
}

async function testChangeLogGrowsOnDelete() {
  console.log('--- Test: change_log grows on delete ---');

  // Create a throwaway item
  const result = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE, { title: 'To Delete' }]);
  const id = Number(Object.keys(result.jsonGraph.dms.data.byId)[0]);

  const db = getDb(DB_NAME);
  const tbl = graph.dbType === 'postgres' ? 'dms.change_log' : 'change_log';

  // Delete via Falcor route
  await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, TEST_TYPE, id]);

  const logs = await db.promise(
    `SELECT * FROM ${tbl} WHERE app = $1 AND item_id = $2 AND action = 'D'`,
    [TEST_APP, id]
  );
  assert(logs.length === 1, 'One delete change_log entry');
  assert(logs[0].data === null || logs[0].data === 'null', `Data is null for delete (got ${logs[0].data})`);

  console.log(`  Deleted item ${id}, delete log: revision=${logs[0].revision}`);
  console.log('  \u2713 change_log grows on delete\n');
}

async function testChangeLogGrowsOnTypeEdit() {
  console.log('--- Test: change_log grows on type edit ---');

  const db = getDb(DB_NAME);
  const tbl = graph.dbType === 'postgres' ? 'dms.change_log' : 'change_log';
  const id = createdIds[0];

  const before = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1 AND item_id = $2`, [TEST_APP, id]);

  // Edit type via Falcor route
  const newType = TEST_TYPE + '-renamed';
  await graph.callAsync(['dms', 'type', 'edit'], [TEST_APP, id, newType]);

  const after = await db.promise(`SELECT COUNT(*) AS cnt FROM ${tbl} WHERE app = $1 AND item_id = $2`, [TEST_APP, id]);
  assert(Number(after[0].cnt) === Number(before[0].cnt) + 1, 'change_log count increased by 1');

  // Restore original type
  await graph.callAsync(['dms', 'type', 'edit'], [TEST_APP, id, TEST_TYPE]);

  console.log(`  Type edit logged for item ${id}`);
  console.log('  \u2713 change_log grows on type edit\n');
}

async function testBootstrapReturnsItems() {
  console.log('--- Test: bootstrap returns items + revision ---');

  // Create a couple more items
  const r2 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE, { title: 'Sync Test 2' }]);
  const id2 = Number(Object.keys(r2.jsonGraph.dms.data.byId)[0]);
  createdIds.push(id2);

  const r3 = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE, { title: 'Sync Test 3' }]);
  const id3 = Number(Object.keys(r3.jsonGraph.dms.data.byId)[0]);
  createdIds.push(id3);

  const { status, body } = await httpGet(`/sync/bootstrap?app=${TEST_APP}`);
  assert(status === 200, `Status 200 (got ${status})`);
  assert(Array.isArray(body.items), 'items is an array');
  assert(typeof body.revision === 'number', `revision is a number (got ${typeof body.revision})`);

  // Should contain our items
  const ourItems = body.items.filter(i => i.type === TEST_TYPE);
  assert(ourItems.length >= 3, `At least 3 items of our type (got ${ourItems.length})`);
  assert(body.revision > 0, `Revision > 0 (got ${body.revision})`);

  console.log(`  Bootstrap: ${body.items.length} items, revision=${body.revision}`);
  console.log('  \u2713 bootstrap returns items + revision\n');
}

async function testBootstrapExcludesSplitTypes() {
  console.log('--- Test: bootstrap excludes split-table types ---');

  // Create a split-table type item directly
  const db = getDb(DB_NAME);
  const mainTbl = graph.dbType === 'postgres' ? 'dms.data_items' : 'data_items';
  await db.promise(
    `INSERT INTO ${mainTbl} (app, type, data) VALUES ($1, $2, $3)`,
    [TEST_APP, 'test_dataset-1', '{"val": 123}']
  );

  const { body } = await httpGet(`/sync/bootstrap?app=${TEST_APP}`);

  const splitItems = body.items.filter(i => i.type === 'test_dataset-1');
  assert(splitItems.length === 0, `Split-table type excluded from bootstrap (found ${splitItems.length})`);

  // Clean up
  await db.promise(`DELETE FROM ${mainTbl} WHERE app = $1 AND type = $2`, [TEST_APP, 'test_dataset-1']);

  console.log('  \u2713 bootstrap excludes split-table types\n');
}

async function testDeltaReturnsChangesSinceRevision() {
  console.log('--- Test: delta returns changes since revision N ---');

  // Get current revision
  const boot = await httpGet(`/sync/bootstrap?app=${TEST_APP}`);
  const currentRev = boot.body.revision;

  // Make a new edit
  const id = createdIds[0];
  await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, id, { title: 'Delta Test Edit' }]);

  // Get delta since the revision before our edit
  const { status, body } = await httpGet(`/sync/delta?app=${TEST_APP}&since=${currentRev}`);
  assert(status === 200, `Status 200 (got ${status})`);
  assert(Array.isArray(body.changes), 'changes is an array');
  assert(body.changes.length >= 1, `At least 1 change (got ${body.changes.length})`);
  assert(body.revision > currentRev, `Revision increased (was ${currentRev}, now ${body.revision})`);

  // The latest change should be our edit
  const lastChange = body.changes[body.changes.length - 1];
  assert(Number(lastChange.item_id) === id, `Last change is for item ${id}`);
  assert(lastChange.action === 'U', `Action is 'U' (got '${lastChange.action}')`);

  console.log(`  Delta since ${currentRev}: ${body.changes.length} changes, new revision=${body.revision}`);
  console.log('  \u2713 delta returns changes since revision\n');
}

async function testDeltaWithZeroReturnsAll() {
  console.log('--- Test: delta with since=0 returns all changes ---');

  const { body } = await httpGet(`/sync/delta?app=${TEST_APP}&since=0`);
  assert(body.changes.length >= 3, `At least 3 total changes (got ${body.changes.length})`);

  console.log(`  Delta since 0: ${body.changes.length} changes`);
  console.log('  \u2713 delta with since=0 returns all changes\n');
}

async function testPushCreate() {
  console.log('--- Test: push create ---');

  const { status, body } = await httpPost('/sync/push', {
    action: 'I',
    item: { app: TEST_APP, type: TEST_TYPE, data: { title: 'Push Created' } }
  });

  assert(status === 200, `Status 200 (got ${status})`);
  assert(body.item, 'Response has item');
  assert(body.item.id, 'Item has id');
  assert(typeof body.revision === 'number', 'Response has revision');
  createdIds.push(body.item.id);

  console.log(`  Push created item ${body.item.id}, revision=${body.revision}`);
  console.log('  \u2713 push create works\n');
}

async function testPushUpdate() {
  console.log('--- Test: push update ---');

  const id = createdIds[createdIds.length - 1];
  const { status, body } = await httpPost('/sync/push', {
    action: 'U',
    item: { id, app: TEST_APP, type: TEST_TYPE, data: { title: 'Push Updated' } }
  });

  assert(status === 200, `Status 200 (got ${status})`);
  assert(body.item, 'Response has item');
  const data = typeof body.item.data === 'string' ? JSON.parse(body.item.data) : body.item.data;
  assert(data.title === 'Push Updated', `Title updated (got '${data.title}')`);

  console.log(`  Push updated item ${id}, revision=${body.revision}`);
  console.log('  \u2713 push update works\n');
}

async function testPushDelete() {
  console.log('--- Test: push delete ---');

  const id = createdIds.pop(); // Remove from tracked IDs since we're deleting
  const { status, body } = await httpPost('/sync/push', {
    action: 'D',
    item: { id, app: TEST_APP, type: TEST_TYPE }
  });

  assert(status === 200, `Status 200 (got ${status})`);
  assert(typeof body.revision === 'number', 'Response has revision');

  console.log(`  Push deleted item ${id}, revision=${body.revision}`);
  console.log('  \u2713 push delete works\n');
}

async function testBootstrapRequiresApp() {
  console.log('--- Test: bootstrap requires app param ---');

  const { status, body } = await httpGet('/sync/bootstrap');
  assert(status === 400, `Status 400 (got ${status})`);
  assert(body.error, 'Error message present');

  console.log('  \u2713 bootstrap returns 400 without app\n');
}

async function testDeltaRequiresApp() {
  console.log('--- Test: delta requires app param ---');

  const { status, body } = await httpGet('/sync/delta?since=0');
  assert(status === 400, `Status 400 (got ${status})`);
  assert(body.error, 'Error message present');

  console.log('  \u2713 delta returns 400 without app\n');
}

async function testWebSocketBroadcast() {
  console.log('--- Test: WebSocket receives broadcast on mutation ---');

  const WebSocket = require('ws');
  const port = server.address().port;

  const ws = new WebSocket(`ws://localhost:${port}/sync/subscribe`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('open', () => { clearTimeout(timeout); resolve(); });
    ws.on('error', reject);
  });

  // Subscribe to our test app
  ws.send(JSON.stringify({ type: 'subscribe', app: TEST_APP }));

  // Wait a moment for subscription to register
  await new Promise(r => setTimeout(r, 100));

  // Create a new item via push endpoint — should trigger WS broadcast
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS message timeout')), 5000);
    ws.on('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });

  const { body } = await httpPost('/sync/push', {
    action: 'I',
    item: { app: TEST_APP, type: TEST_TYPE, data: { title: 'WS Test' } }
  });
  createdIds.push(body.item.id);

  const msg = await received;
  assert(msg.type === 'change', `WS message type is 'change' (got '${msg.type}')`);
  assert(msg.action === 'I', `WS message action is 'I' (got '${msg.action}')`);
  assert(msg.item.id === body.item.id, `WS message item id matches`);

  ws.close();
  console.log(`  WS received: type=${msg.type}, action=${msg.action}, item.id=${msg.item.id}`);
  console.log('  \u2713 WebSocket receives broadcast on mutation\n');
}

async function testWebSocketBroadcastFromFalcor() {
  console.log('--- Test: WebSocket receives broadcast from Falcor mutation ---');

  const WebSocket = require('ws');
  const port = server.address().port;

  const ws = new WebSocket(`ws://localhost:${port}/sync/subscribe`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('open', () => { clearTimeout(timeout); resolve(); });
    ws.on('error', reject);
  });

  ws.send(JSON.stringify({ type: 'subscribe', app: TEST_APP }));
  await new Promise(r => setTimeout(r, 100));

  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS message timeout')), 5000);
    ws.on('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });

  // Create via Falcor route (not push endpoint)
  const result = await graph.callAsync(['dms', 'data', 'create'], [TEST_APP, TEST_TYPE, { title: 'Falcor WS Test' }]);
  const id = Number(Object.keys(result.jsonGraph.dms.data.byId)[0]);
  createdIds.push(id);

  const msg = await received;
  assert(msg.type === 'change', `WS message type is 'change'`);
  assert(msg.action === 'I', `WS message action is 'I'`);

  ws.close();
  console.log(`  Falcor create → WS broadcast: item.id=${msg.item.id}`);
  console.log('  \u2713 WebSocket receives broadcast from Falcor mutation\n');
}

async function testSequentialRevisions() {
  console.log('--- Test: sequential revisions ---');

  const db = getDb(DB_NAME);
  const tbl = graph.dbType === 'postgres' ? 'dms.change_log' : 'change_log';

  const logs = await db.promise(
    `SELECT revision FROM ${tbl} WHERE app = $1 ORDER BY revision ASC`,
    [TEST_APP]
  );

  // Verify revisions are strictly increasing
  for (let i = 1; i < logs.length; i++) {
    const prev = Number(logs[i - 1].revision);
    const curr = Number(logs[i].revision);
    assert(curr > prev, `Revision ${curr} > ${prev}`);
  }

  console.log(`  ${logs.length} revisions, all strictly increasing`);
  console.log('  \u2713 sequential revisions\n');
}

// ============================================================================
// RUNNER
// ============================================================================

const tests = [
  testChangeLogGrowsOnCreate,
  testChangeLogGrowsOnEdit,
  testChangeLogGrowsOnDelete,
  testChangeLogGrowsOnTypeEdit,
  testBootstrapReturnsItems,
  testBootstrapExcludesSplitTypes,
  testDeltaReturnsChangesSinceRevision,
  testDeltaWithZeroReturnsAll,
  testPushCreate,
  testPushUpdate,
  testPushDelete,
  testBootstrapRequiresApp,
  testDeltaRequiresApp,
  testWebSocketBroadcast,
  testWebSocketBroadcastFromFalcor,
  testSequentialRevisions,
];

async function run() {
  try {
    await setup();

    for (const test of tests) {
      try {
        await test();
      } catch (err) {
        console.error(`  FAILED: ${err.message}\n`);
        failed++;
      }
    }
  } finally {
    await cleanup();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run();
