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
const { getDb } = require('../src/db');

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
  await graph.ready;
  console.log(`Database: ${DB_NAME} (${graph.dbType})`);
  console.log(`Test app: ${TEST_APP}\n`);

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
// COLLABORATIVE EDITING TESTS (Phase 4)
// ============================================================================

/**
 * Helper: create a WebSocket client connected and subscribed to TEST_APP.
 * Returns { ws, messages } where messages is an array that accumulates received messages.
 */
async function createWSClient() {
  const WebSocket = require('ws');
  const port = server.address().port;
  const ws = new WebSocket(`ws://localhost:${port}/sync/subscribe`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('open', () => { clearTimeout(timeout); resolve(); });
    ws.on('error', reject);
  });

  ws.send(JSON.stringify({ type: 'subscribe', app: TEST_APP }));
  await new Promise(r => setTimeout(r, 50));

  const messages = [];
  ws.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });

  return { ws, messages };
}

/**
 * Helper: wait for a message of a given type to appear in a messages array.
 */
function waitForMessage(messages, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    const interval = setInterval(() => {
      const found = messages.find(m => m.type === type);
      if (found) {
        clearInterval(interval);
        clearTimeout(deadline);
        resolve(found);
      }
    }, 20);
  });
}

async function testCollabJoinRoomSendsSync() {
  console.log('--- Test: join-room sends yjs-sync-step1 ---');

  const { ws, messages } = await createWSClient();
  const roomId = 'collab-test-' + Date.now();

  ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));

  const syncStep1 = await waitForMessage(messages, 'yjs-sync-step1');
  assert(syncStep1.itemId === roomId, `sync-step1 has correct itemId`);
  assert(typeof syncStep1.stateVector === 'string', 'sync-step1 has stateVector (base64)');

  // Should also get room-peers
  const peers = await waitForMessage(messages, 'room-peers');
  assert(peers.itemId === roomId, 'room-peers has correct itemId');
  assert(peers.count === 1, `room-peers count is 1 (got ${peers.count})`);

  ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  ws.close();

  console.log('  \u2713 join-room sends yjs-sync-step1 + room-peers\n');
}

async function testCollabTwoClientSync() {
  console.log('--- Test: two clients sync Yjs updates ---');

  const Y = require('yjs');

  const client1 = await createWSClient();
  const client2 = await createWSClient();
  const roomId = 'collab-sync-' + Date.now();

  // Client 1 joins
  client1.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client1.messages, 'yjs-sync-step1');

  // Client 2 joins
  client2.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client2.messages, 'yjs-sync-step1');

  // Client 1 should see room-peers update to 2
  const peers = await waitForMessage(client1.messages, 'room-peers');
  // Find the one with count === 2 (there may be a count=1 first)
  const peersMsg = client1.messages.filter(m => m.type === 'room-peers').pop();
  assert(peersMsg.count === 2, `Client 1 sees 2 peers (got ${peersMsg.count})`);

  // Client 1 creates a Yjs doc and sends an update
  const doc1 = new Y.Doc();
  const text1 = doc1.getText('root');
  // Insert text into the doc
  text1.insert(0, 'Hello from client 1');
  const update = Y.encodeStateAsUpdate(doc1);
  const base64Update = Buffer.from(update).toString('base64');

  client1.ws.send(JSON.stringify({
    type: 'yjs-update',
    itemId: roomId,
    update: base64Update,
  }));

  // Client 2 should receive the yjs-update
  const received = await waitForMessage(client2.messages, 'yjs-update');
  assert(received.itemId === roomId, 'yjs-update has correct itemId');
  assert(typeof received.update === 'string', 'yjs-update has base64 update');

  // Apply the received update to a fresh doc and verify content
  const doc2 = new Y.Doc();
  const binaryUpdate = new Uint8Array(Buffer.from(received.update, 'base64'));
  Y.applyUpdate(doc2, binaryUpdate);
  const text2 = doc2.getText('root');
  assert(text2.toString() === 'Hello from client 1', `Client 2 received text: "${text2.toString()}"`);

  // Cleanup
  client1.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  client2.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  doc1.destroy();
  doc2.destroy();
  client1.ws.close();
  client2.ws.close();

  console.log('  \u2713 two clients sync Yjs updates\n');
}

async function testCollabPeerCountUpdates() {
  console.log('--- Test: peer count updates on join/leave ---');

  const client1 = await createWSClient();
  const client2 = await createWSClient();
  const client3 = await createWSClient();
  const roomId = 'collab-peers-' + Date.now();

  // Client 1 joins
  client1.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client1.messages, 'room-peers');
  let lastPeers = client1.messages.filter(m => m.type === 'room-peers').pop();
  assert(lastPeers.count === 1, `After client1 join: 1 peer (got ${lastPeers.count})`);

  // Client 2 joins
  client2.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client2.messages, 'room-peers');

  // Wait for client1 to get the updated count
  await new Promise(r => setTimeout(r, 100));
  lastPeers = client1.messages.filter(m => m.type === 'room-peers').pop();
  assert(lastPeers.count === 2, `After client2 join: 2 peers (got ${lastPeers.count})`);

  // Client 3 joins
  client3.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client3.messages, 'room-peers');
  await new Promise(r => setTimeout(r, 100));
  lastPeers = client1.messages.filter(m => m.type === 'room-peers').pop();
  assert(lastPeers.count === 3, `After client3 join: 3 peers (got ${lastPeers.count})`);

  // Client 2 leaves
  client2.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 200));
  lastPeers = client1.messages.filter(m => m.type === 'room-peers').pop();
  assert(lastPeers.count === 2, `After client2 leave: 2 peers (got ${lastPeers.count})`);

  // Cleanup
  client1.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  client3.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  client1.ws.close();
  client2.ws.close();
  client3.ws.close();

  console.log('  \u2713 peer count updates on join/leave\n');
}

async function testCollabYjsStatePersistence() {
  console.log('--- Test: Yjs state persists to yjs_states table ---');

  const Y = require('yjs');
  const db = getDb(DB_NAME);
  const yjsTbl = graph.dbType === 'postgres' ? 'dms.yjs_states' : 'yjs_states';

  // We need a real item ID for persistence (yjs_states references data_items)
  // Use a simple numeric room ID — the ws.js code doesn't enforce FK constraints
  const roomId = '999999';

  // Clean up any pre-existing state
  try { await db.promise(`DELETE FROM ${yjsTbl} WHERE item_id = $1`, [roomId]); } catch {}

  const { ws, messages } = await createWSClient();

  // Join room
  ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(messages, 'yjs-sync-step1');

  // Send a Yjs update
  const doc = new Y.Doc();
  doc.getText('root').insert(0, 'Persisted text');
  const update = Y.encodeStateAsUpdate(doc);
  ws.send(JSON.stringify({
    type: 'yjs-update',
    itemId: roomId,
    update: Buffer.from(update).toString('base64'),
  }));

  // Wait for flush (FLUSH_DELAY is 2000ms in ws.js)
  await new Promise(r => setTimeout(r, 2500));

  // Check yjs_states table
  const rows = await db.promise(`SELECT * FROM ${yjsTbl} WHERE item_id = $1`, [roomId]);
  assert(rows.length === 1, `yjs_states has 1 row for item ${roomId} (got ${rows.length})`);
  assert(rows[0].state, 'state column is not null');

  // Verify the persisted state contains the text
  const persistedDoc = new Y.Doc();
  const buf = rows[0].state instanceof Buffer ? rows[0].state : Buffer.from(rows[0].state);
  Y.applyUpdate(persistedDoc, new Uint8Array(buf));
  const persistedText = persistedDoc.getText('root').toString();
  assert(persistedText === 'Persisted text', `Persisted text matches: "${persistedText}"`);

  // Leave room — triggers final flush + cleanup
  ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 500));
  ws.close();

  doc.destroy();
  persistedDoc.destroy();

  // Clean up
  try { await db.promise(`DELETE FROM ${yjsTbl} WHERE item_id = $1`, [roomId]); } catch {}

  console.log('  \u2713 Yjs state persists to yjs_states table\n');
}

async function testCollabStateRestoredOnRejoin() {
  console.log('--- Test: Yjs state restored when new client joins ---');

  const Y = require('yjs');
  const db = getDb(DB_NAME);
  const yjsTbl = graph.dbType === 'postgres' ? 'dms.yjs_states' : 'yjs_states';
  const roomId = '999998';

  // Clean up
  try { await db.promise(`DELETE FROM ${yjsTbl} WHERE item_id = $1`, [roomId]); } catch {}

  // Client 1: join, write, leave (wait for flush + cleanup)
  const client1 = await createWSClient();
  client1.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client1.messages, 'yjs-sync-step1');

  const doc1 = new Y.Doc();
  doc1.getText('root').insert(0, 'Restored text');
  const update = Y.encodeStateAsUpdate(doc1);
  client1.ws.send(JSON.stringify({
    type: 'yjs-update',
    itemId: roomId,
    update: Buffer.from(update).toString('base64'),
  }));

  // Wait for debounced flush
  await new Promise(r => setTimeout(r, 2500));

  // Leave — triggers cleanupRoom which flushes again and destroys the Y.Doc
  client1.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 500));
  client1.ws.close();
  doc1.destroy();

  // Client 2: join the same room — should get the persisted state via sync-step2
  const client2 = await createWSClient();
  client2.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));

  // Should receive sync-step1 + sync-step2 with the persisted content
  await waitForMessage(client2.messages, 'yjs-sync-step1');

  // Wait a bit for sync-step2
  await new Promise(r => setTimeout(r, 200));
  const syncStep2 = client2.messages.find(m => m.type === 'yjs-sync-step2');
  assert(syncStep2, 'Client 2 received yjs-sync-step2 with persisted state');
  assert(syncStep2.itemId === roomId, 'sync-step2 has correct itemId');

  // Decode and verify
  const doc2 = new Y.Doc();
  Y.applyUpdate(doc2, new Uint8Array(Buffer.from(syncStep2.update, 'base64')));
  const restoredText = doc2.getText('root').toString();
  assert(restoredText === 'Restored text', `Restored text matches: "${restoredText}"`);

  // Cleanup
  client2.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  client2.ws.close();
  doc2.destroy();
  try { await db.promise(`DELETE FROM ${yjsTbl} WHERE item_id = $1`, [roomId]); } catch {}

  console.log('  \u2713 Yjs state restored when new client joins\n');
}

async function testCollabUpdateNotSentBackToSender() {
  console.log('--- Test: yjs-update not echoed back to sender ---');

  const Y = require('yjs');
  const client1 = await createWSClient();
  const client2 = await createWSClient();
  const roomId = 'collab-echo-' + Date.now();

  client1.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  client2.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client1.messages, 'yjs-sync-step1');
  await waitForMessage(client2.messages, 'yjs-sync-step1');

  // Clear accumulated messages
  client1.messages.length = 0;
  client2.messages.length = 0;

  // Client 1 sends an update
  const doc = new Y.Doc();
  doc.getText('root').insert(0, 'No echo');
  const update = Y.encodeStateAsUpdate(doc);
  client1.ws.send(JSON.stringify({
    type: 'yjs-update',
    itemId: roomId,
    update: Buffer.from(update).toString('base64'),
  }));

  // Wait for relay
  await waitForMessage(client2.messages, 'yjs-update');

  // Client 1 should NOT have received the yjs-update back
  await new Promise(r => setTimeout(r, 200));
  const echoed = client1.messages.filter(m => m.type === 'yjs-update');
  assert(echoed.length === 0, `Client 1 received 0 echoed yjs-updates (got ${echoed.length})`);

  // Client 2 SHOULD have received it
  const relayed = client2.messages.filter(m => m.type === 'yjs-update');
  assert(relayed.length === 1, `Client 2 received 1 yjs-update (got ${relayed.length})`);

  // Cleanup
  client1.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  client2.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  doc.destroy();
  client1.ws.close();
  client2.ws.close();

  console.log('  \u2713 yjs-update not echoed back to sender\n');
}

async function testCollabAwarenessRelay() {
  console.log('--- Test: awareness updates relayed between clients ---');

  const awarenessProtocol = require('y-protocols/awareness');
  const Y = require('yjs');

  const client1 = await createWSClient();
  const client2 = await createWSClient();
  const roomId = 'collab-awareness-' + Date.now();

  client1.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  client2.ws.send(JSON.stringify({ type: 'join-room', itemId: roomId }));
  await waitForMessage(client1.messages, 'yjs-sync-step1');
  await waitForMessage(client2.messages, 'yjs-sync-step1');

  // Clear
  client2.messages.length = 0;

  // Client 1 sends an awareness update
  const doc1 = new Y.Doc();
  const awareness1 = new awarenessProtocol.Awareness(doc1);
  awareness1.setLocalState({ name: 'TestUser', color: '#ff0000' });
  const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness1, [doc1.clientID]);

  client1.ws.send(JSON.stringify({
    type: 'yjs-awareness',
    itemId: roomId,
    update: Buffer.from(awarenessUpdate).toString('base64'),
  }));

  // Client 2 should receive the awareness update
  const received = await waitForMessage(client2.messages, 'yjs-awareness');
  assert(received.itemId === roomId, 'awareness update has correct itemId');
  assert(typeof received.update === 'string', 'awareness update has base64 data');

  // Cleanup
  client1.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  client2.ws.send(JSON.stringify({ type: 'leave-room', itemId: roomId }));
  await new Promise(r => setTimeout(r, 100));
  awareness1.destroy();
  doc1.destroy();
  client1.ws.close();
  client2.ws.close();

  console.log('  \u2713 awareness updates relayed between clients\n');
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
  // Phase 4: Collaborative editing
  testCollabJoinRoomSendsSync,
  testCollabTwoClientSync,
  testCollabPeerCountUpdates,
  testCollabYjsStatePersistence,
  testCollabStateRestoredOnRejoin,
  testCollabUpdateNotSentBackToSender,
  testCollabAwarenessRelay,
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
