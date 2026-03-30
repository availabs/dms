/**
 * WebSocket Module for Sync
 *
 * Provides two message routing modes:
 *   1. Per-app broadcast — change_log notifications sent to all clients subscribed to an app
 *   2. Per-item rooms — Yjs binary updates routed only to clients editing the same item
 *
 * Port from research/toy-sync/server/ws.js, adapted for per-app subscriptions.
 */

const { WebSocketServer } = require('ws');
const { logEntry, initLogFile, isEnabled: isLoggingEnabled } = require('../../middleware/request-logger');

let wss = null;

// Per-app subscriber sets: app → Set<WebSocket>
const appSubscribers = new Map();

// Room management: itemId → Set<WebSocket>
const rooms = new Map();

// Server-side Yjs docs: itemId → Y.Doc (lazy-loaded when collab is used)
// Yjs import is deferred since it's optional for Phase 1
let Y = null;
let awarenessProtocol = null;
const yjsDocs = new Map();
const awarenesses = new Map();

// Flush timers: itemId → timeout
const flushTimers = new Map();
const FLUSH_DELAY = 2000;

// Heartbeat: detect dead connections that didn't send a close frame.
// Without this, zombie connections accumulate in appSubscribers and their
// outgoing message buffers grow indefinitely (the primary OOM cause).
const PING_INTERVAL = 30_000; // 30 seconds
const MAX_BUFFERED = 1024 * 1024; // 1 MB — skip sending to slow/stuck clients

// ---- Diagnostic stats (for OOM debugging) ----
const STATS_INTERVAL = 30_000; // Log stats every 30 seconds
const _stats = {
  broadcastCount: 0,       // Total notifyChange calls
  broadcastMsgBytes: 0,    // Cumulative bytes serialized for broadcast
  broadcastRecipients: 0,  // Cumulative recipients across all broadcasts
  broadcastSkipped: 0,     // Sends skipped due to bufferedAmount or readyState
  roomMsgCount: 0,         // Total room-level messages relayed
  messagesReceived: 0,     // Total inbound WS messages
  connectionsOpened: 0,
  connectionsClosed: 0,
  peakConnections: 0,
};

// Database reference (set during init)
let _db = null;
let _dbType = null;

function tbl(name) {
  return _dbType === 'postgres' ? `dms.${name}` : name;
}

function getRoom(itemId) {
  if (!rooms.has(itemId)) rooms.set(itemId, new Set());
  return rooms.get(itemId);
}

function getAppSet(app) {
  if (!appSubscribers.has(app)) appSubscribers.set(app, new Set());
  return appSubscribers.get(app);
}

/**
 * Send a message to a WebSocket client, skipping if the send buffer is too large.
 * This prevents memory accumulation when a client is slow or its connection is stuck.
 */
function safeSend(ws, payload) {
  if (ws.readyState !== 1) { _stats.broadcastSkipped++; return; }
  if (ws.bufferedAmount > MAX_BUFFERED) { _stats.broadcastSkipped++; return; }
  ws.send(payload);
}

// ---- Yjs doc management (for Phase 4 collab) ----

async function loadYjs() {
  if (Y) return;
  try {
    Y = require('yjs');
    awarenessProtocol = require('y-protocols/awareness');
  } catch {
    // yjs not installed — room-based collab not available
  }
}

async function getOrCreateYDoc(itemId) {
  if (yjsDocs.has(itemId)) return yjsDocs.get(itemId);
  if (!Y) await loadYjs();
  if (!Y) return null;

  const ydoc = new Y.Doc();
  yjsDocs.set(itemId, ydoc);

  // Try to load persisted state
  if (_db) {
    try {
      const row = await _db.promise(
        `SELECT state FROM ${tbl('yjs_states')} WHERE item_id = $1`, [itemId]
      );
      if (row[0]?.state) {
        const buf = row[0].state instanceof Buffer ? row[0].state : Buffer.from(row[0].state);
        Y.applyUpdate(ydoc, new Uint8Array(buf));
      }
    } catch (err) {
      console.warn(`[ws] failed to load Yjs state for ${itemId}:`, err.message);
    }
  }

  return ydoc;
}

function getOrCreateAwareness(itemId, ydoc) {
  if (awarenesses.has(itemId)) return awarenesses.get(itemId);
  if (!awarenessProtocol) return null;
  const awareness = new awarenessProtocol.Awareness(ydoc);
  awarenesses.set(itemId, awareness);
  return awareness;
}

function scheduleFlush(itemId) {
  if (flushTimers.has(itemId)) clearTimeout(flushTimers.get(itemId));
  flushTimers.set(itemId, setTimeout(() => flushYjsState(itemId), FLUSH_DELAY));
}

async function flushYjsState(itemId) {
  flushTimers.delete(itemId);
  const ydoc = yjsDocs.get(itemId);
  if (!ydoc || !Y || !_db) return;

  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    const now = _dbType === 'postgres' ? 'NOW()' : "datetime('now')";
    await _db.promise(
      `INSERT INTO ${tbl('yjs_states')} (item_id, state, updated_at) VALUES ($1, $2, ${now})
       ON CONFLICT(item_id) DO UPDATE SET state = excluded.state, updated_at = ${now}`,
      [itemId, Buffer.from(state)]
    );
  } catch (err) {
    console.warn(`[ws] failed to flush Yjs state for ${itemId}:`, err.message);
  }
}

function cleanupRoom(itemId) {
  const room = rooms.get(itemId);
  if (room && room.size === 0) {
    rooms.delete(itemId);
    flushYjsState(itemId).then(() => {
      if (!rooms.has(itemId) || rooms.get(itemId).size === 0) {
        const ydoc = yjsDocs.get(itemId);
        if (ydoc) { ydoc.destroy(); yjsDocs.delete(itemId); }
        const awareness = awarenesses.get(itemId);
        if (awareness) { awareness.destroy(); awarenesses.delete(itemId); }
        if (flushTimers.has(itemId)) {
          clearTimeout(flushTimers.get(itemId));
          flushTimers.delete(itemId);
        }
      }
    });
  }
}

function broadcastToRoom(itemId, msg, excludeWs = null) {
  const room = rooms.get(itemId);
  if (!room) return;
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  _stats.roomMsgCount++;
  for (const client of room) {
    if (client !== excludeWs) {
      safeSend(client, payload);
    }
  }
}

// ---- Connection cleanup ----

/**
 * Remove a WebSocket from all app subscriptions and rooms.
 * Called on close and when ping detects a dead connection.
 */
function cleanupConnection(ws) {
  // Unsubscribe from all apps
  if (ws._apps) {
    for (const app of ws._apps) {
      const subs = appSubscribers.get(app);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) appSubscribers.delete(app);
      }
    }
    ws._apps.clear();
  }
  if (ws._patterns) ws._patterns.clear();

  // Leave all rooms
  if (ws._rooms) {
    for (const itemId of ws._rooms) {
      const room = rooms.get(itemId);
      if (room) { room.delete(ws); cleanupRoom(itemId); }
    }
    ws._rooms.clear();
  }
}

// ---- Message handling ----

async function handleMessage(ws, rawData) {
  _stats.messagesReceived++;
  try {
    const msg = JSON.parse(rawData);

    // Subscribe to app-level change notifications
    // Optionally scoped to a pattern's doc_type
    if (msg.type === 'subscribe') {
      const { app, pattern } = msg;
      if (!app) return;
      if (!ws._apps) ws._apps = new Set();
      ws._apps.add(app);
      getAppSet(app).add(ws);

      // Track pattern subscriptions for filtered broadcasting
      if (pattern) {
        if (!ws._patterns) ws._patterns = new Set();
        ws._patterns.add(pattern);
      }
      return;
    }

    // Join a per-item room (for collaborative editing)
    if (msg.type === 'join-room') {
      const { itemId } = msg;
      if (!itemId) return;
      if (!ws._rooms) ws._rooms = new Set();
      ws._rooms.add(itemId);
      getRoom(itemId).add(ws);

      // Send Yjs sync state if available
      const ydoc = await getOrCreateYDoc(itemId);
      if (ydoc && Y) {
        const sv = Y.encodeStateVector(ydoc);
        safeSend(ws, JSON.stringify({
          type: 'yjs-sync-step1',
          itemId,
          stateVector: Buffer.from(sv).toString('base64'),
        }));

        const update = Y.encodeStateAsUpdate(ydoc);
        if (update.length > 2) {
          safeSend(ws, JSON.stringify({
            type: 'yjs-sync-step2',
            itemId,
            update: Buffer.from(update).toString('base64'),
          }));
        }

        const awareness = getOrCreateAwareness(itemId, ydoc);
        if (awareness) {
          const states = awarenessProtocol.encodeAwarenessUpdate(
            awareness, Array.from(awareness.getStates().keys())
          );
          if (states.length > 1) {
            safeSend(ws, JSON.stringify({
              type: 'yjs-awareness', itemId,
              update: Buffer.from(states).toString('base64'),
            }));
          }
        }
      }

      // Notify all room members of updated peer count
      broadcastToRoom(itemId, { type: 'room-peers', itemId, count: getRoom(itemId).size });
      return;
    }

    // Leave a per-item room
    if (msg.type === 'leave-room') {
      const { itemId } = msg;
      if (!itemId) return;
      if (ws._rooms) ws._rooms.delete(itemId);
      const room = rooms.get(itemId);
      if (room) {
        room.delete(ws);
        // Notify remaining members of updated peer count
        if (room.size > 0) {
          broadcastToRoom(itemId, { type: 'room-peers', itemId, count: room.size });
        }
        cleanupRoom(itemId);
      }
      return;
    }

    // Yjs binary update relay
    if (msg.type === 'yjs-update') {
      const { itemId, update } = msg;
      if (!itemId || !update) return;
      const binaryUpdate = new Uint8Array(Buffer.from(update, 'base64'));
      const ydoc = await getOrCreateYDoc(itemId);
      if (ydoc && Y) {
        Y.applyUpdate(ydoc, binaryUpdate);
        scheduleFlush(itemId);
      }
      broadcastToRoom(itemId, { type: 'yjs-update', itemId, update }, ws);
      return;
    }

    // Yjs sync response (client → server after sync-step1)
    if (msg.type === 'yjs-sync-response') {
      const { itemId, update } = msg;
      if (!itemId || !update) return;
      const binaryUpdate = new Uint8Array(Buffer.from(update, 'base64'));
      const ydoc = await getOrCreateYDoc(itemId);
      if (ydoc && Y) {
        Y.applyUpdate(ydoc, binaryUpdate);
        scheduleFlush(itemId);
      }
      broadcastToRoom(itemId, { type: 'yjs-update', itemId, update }, ws);
      return;
    }

    // Yjs awareness update relay
    if (msg.type === 'yjs-awareness') {
      const { itemId, update } = msg;
      if (!itemId || !update) return;
      const binaryUpdate = new Uint8Array(Buffer.from(update, 'base64'));
      const ydoc = await getOrCreateYDoc(itemId);
      if (ydoc && awarenessProtocol) {
        const awareness = getOrCreateAwareness(itemId, ydoc);
        if (awareness) {
          awarenessProtocol.applyAwarenessUpdate(awareness, binaryUpdate, ws);
        }
      }
      broadcastToRoom(itemId, { type: 'yjs-awareness', itemId, update }, ws);
      return;
    }

  } catch (err) {
    console.error('[ws] message handling error:', err);
  }
}

// ---- Public API ----

/**
 * Initialize WebSocket server attached to an HTTP server.
 * @param {http.Server} server - The HTTP server returned by app.listen()
 * @param {Object} [db] - Database adapter for yjs_states persistence
 */
function initWebSocket(server, db = null) {
  _db = db;
  _dbType = db?.type || 'sqlite';

  wss = new WebSocketServer({ server, path: '/sync/subscribe' });

  wss.on('connection', (ws) => {
    ws._apps = new Set();
    ws._rooms = new Set();
    ws.isAlive = true;
    _stats.connectionsOpened++;
    if (wss.clients.size > _stats.peakConnections) {
      _stats.peakConnections = wss.clients.size;
    }

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => handleMessage(ws, data));
    ws.on('close', () => { _stats.connectionsClosed++; cleanupConnection(ws); });

    ws.on('error', (err) => {
      console.error('[ws] error:', err.message);
    });
  });

  // Heartbeat: ping all clients periodically to detect dead connections.
  // If a client doesn't respond to a ping within one interval, terminate it.
  // This is critical — without it, zombie connections accumulate in
  // appSubscribers and their outgoing message buffers grow until OOM.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        cleanupConnection(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL);
  heartbeat.unref();

  // Periodic stats reporter — logs memory, connection counts, and broadcast stats
  // to help diagnose OOM patterns. Writes to the request logger's JSONL file.
  if (isLoggingEnabled()) initLogFile();

  const statsInterval = setInterval(() => {
    const mem = process.memoryUsage();
    const clientCount = wss.clients.size;

    // Per-app subscriber breakdown
    const appCounts = {};
    for (const [app, subs] of appSubscribers) {
      appCounts[app] = subs.size;
    }

    // Buffered amounts across all clients
    let totalBuffered = 0;
    let maxBuffered = 0;
    for (const ws of wss.clients) {
      totalBuffered += ws.bufferedAmount;
      if (ws.bufferedAmount > maxBuffered) maxBuffered = ws.bufferedAmount;
    }

    const entry = {
      _type: 'sync-stats',
      timestamp: new Date().toISOString(),
      memory: {
        heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
        heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
        rssMB: +(mem.rss / 1048576).toFixed(1),
        externalMB: +(mem.external / 1048576).toFixed(1),
        arrayBuffersMB: +((mem.arrayBuffers || 0) / 1048576).toFixed(1),
      },
      ws: {
        clients: clientCount,
        peak: _stats.peakConnections,
        opened: _stats.connectionsOpened,
        closed: _stats.connectionsClosed,
        rooms: rooms.size,
        yjsDocs: yjsDocs.size,
      },
      subscribers: appCounts,
      broadcast: {
        count: _stats.broadcastCount,
        totalKB: +(_stats.broadcastMsgBytes / 1024).toFixed(1),
        recipients: _stats.broadcastRecipients,
        skipped: _stats.broadcastSkipped,
      },
      inbound: {
        messages: _stats.messagesReceived,
        roomRelays: _stats.roomMsgCount,
      },
      buffers: totalBuffered > 0 ? {
        totalKB: +(totalBuffered / 1024).toFixed(1),
        maxKB: +(maxBuffered / 1024).toFixed(1),
      } : undefined,
    };

    logEntry(entry);
    console.log(`[sync-stats] heap=${entry.memory.heapUsedMB}/${entry.memory.heapTotalMB}MB rss=${entry.memory.rssMB}MB clients=${clientCount} broadcasts=${_stats.broadcastCount} broadcastKB=${entry.broadcast.totalKB}`);
  }, STATS_INTERVAL);
  statsInterval.unref();

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(statsInterval);
  });

  return wss;
}

/**
 * Broadcast a message to all clients subscribed to a specific app.
 * Called by the controller's appendChangeLog or by sync push endpoint.
 * @param {string} app - Application name
 * @param {Object} msg - Message to broadcast
 */
/**
 * Check if a change's item type matches a pattern subscription.
 * A pattern matches if the item type equals the doc_type or starts with doc_type + '|'.
 */
function typeMatchesPattern(itemType, pattern) {
  return itemType === pattern || itemType.startsWith(pattern + '|');
}

function notifyChange(app, msg) {
  const subs = appSubscribers.get(app);
  if (!subs) return;
  const payload = JSON.stringify(msg);
  _stats.broadcastCount++;
  _stats.broadcastMsgBytes += payload.length;

  const itemType = msg.item?.type;
  let recipientCount = 0;

  for (const client of subs) {
    // If client has pattern subscriptions, only send if the change matches one
    if (client._patterns && client._patterns.size > 0 && itemType) {
      let matches = false;
      for (const pat of client._patterns) {
        if (typeMatchesPattern(itemType, pat)) { matches = true; break; }
      }
      // Also allow skeleton types through (siteType and siteType|pattern)
      // Skeleton types don't contain '|' followed by anything other than 'pattern'
      // But we can't know siteType here — so we send all changes that match ANY subscribed pattern
      // plus any type that ends with '|pattern' (skeleton pattern rows)
      if (!matches && !itemType.endsWith('|pattern')) {
        _stats.broadcastSkipped++;
        continue;
      }
    }
    safeSend(client, payload);
    recipientCount++;
  }

  _stats.broadcastRecipients += recipientCount;

  logEntry({
    _type: 'sync-broadcast',
    timestamp: new Date().toISOString(),
    app,
    action: msg.action,
    revision: msg.revision,
    itemId: msg.item?.id,
    itemType: msg.item?.type,
    payloadKB: +(payload.length / 1024).toFixed(1),
    recipients: recipientCount,
  });
}

/**
 * Get the WebSocketServer instance (for testing/inspection).
 */
function getWSS() {
  return wss;
}

module.exports = { initWebSocket, notifyChange, getWSS };
