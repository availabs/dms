/**
 * DMS Sync Manager
 *
 * Orchestrates bootstrap, delta sync, WebSocket connection, and pending mutation queue.
 * Port from research/toy-sync/client/sync-manager.js, adapted for DMS:
 *   - All operations scoped by `app`
 *   - Populates sync scope registry at bootstrap
 *   - Uses DMS table/column names (data_items)
 *   - Push mutations go through /sync/push endpoint
 *   - WebSocket subscribes per-app
 */

import { exec } from './db-client.js';
import { applyLocal, applyRemote, initFromData, getData } from './yjs-store.js';
import { addToScope } from './sync-scope.js';

// Event bus for invalidation
const listeners = new Set();
export function onInvalidate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function invalidate(scope) {
  if (_batchMode) return; // suppress during batch saves
  for (const fn of listeners) fn(scope);
}

// Track pending item IDs for echo suppression
const pendingItemIds = new Set();

let ws = null;
let wsRetryDelay = 500;
const wsMaxDelay = 30000;

// API host (set during init)
let _apiHost = '';
let _app = '';
let _siteType = '';

// Track which patterns have been bootstrapped
const _loadedPatterns = new Set();

export function configure(app, apiHost, siteType = '') {
  _app = app;
  _apiHost = apiHost || '';
  _siteType = siteType;
  if (_DEV) console.log(`[sync] configure: app=${app} apiHost=${_apiHost} siteType=${siteType}`);
}

function apiUrl(path) {
  return `${_apiHost}${path}`;
}

// --- Bootstrap / Delta ---

async function getLastRevision(scope = null) {
  const key = scope ? `rev:${scope}` : 'last_revision';
  const result = await exec(
    "SELECT value FROM sync_state WHERE key = ?",
    [key]
  );
  return result.rows.length > 0 ? parseInt(result.rows[0].value, 10) : null;
}

async function setLastRevision(rev, scope = null) {
  const key = scope ? `rev:${scope}` : 'last_revision';
  await exec(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
    [key, String(rev)]
  );
}

async function applyChanges(changes) {
  for (const change of changes) {
    if (change.action === 'I' || change.action === 'U') {
      if (pendingItemIds.has(change.item_id)) continue;

      const dataStr = typeof change.data === 'string' ? change.data : JSON.stringify(change.data || {});
      await exec(
        `INSERT INTO data_items (id, app, type, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           app = excluded.app, type = excluded.type,
           data = excluded.data, updated_at = datetime('now')`,
        [change.item_id, change.app, change.type, dataStr]
      );
    } else if (change.action === 'D') {
      if (pendingItemIds.has(change.item_id)) continue;
      await exec('DELETE FROM data_items WHERE id = ?', [change.item_id]);
    }
  }
}

async function applyItems(items) {
  for (const item of items) {
    const dataStr = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});
    await exec(
      `INSERT INTO data_items (id, app, type, data, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         app = excluded.app, type = excluded.type,
         data = excluded.data, updated_at = excluded.updated_at`,
      [item.id, item.app, item.type, dataStr,
       item.created_at, item.created_by, item.updated_at, item.updated_by]
    );

    // Register type in sync scope
    addToScope(item.app, item.type);

    // Initialize Yjs doc
    try {
      const parsed = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
      initFromData(item.id, parsed);
    } catch { /* ignore parse errors */ }
  }
}

const _DEV = typeof globalThis.__SYNC_DEV !== 'undefined' ? globalThis.__SYNC_DEV
  : (typeof import.meta !== 'undefined' && import.meta.env?.DEV);

/**
 * Bootstrap the site skeleton (site row + pattern rows).
 * This is always small (<20 items) and provides the nav/route structure.
 */
export async function bootstrapSkeleton() {
  if (!_siteType) {
    console.warn('[sync] no siteType — falling back to full app bootstrap');
    return null
    //return bootstrapFull();
  }

  const scope = `skeleton:${_siteType}`;
  const lastRev = await getLastRevision(scope);
  if (_DEV) console.log(`[sync]     skeleton lastRev=${lastRev} (${lastRev === null ? 'cold' : 'warm'})`);

  try {
    if (lastRev === null) {
      const t0 = performance.now();
      const res = await fetch(apiUrl(`/sync/bootstrap?app=${encodeURIComponent(_app)}&skeleton=${encodeURIComponent(_siteType)}`));
      if (!res.ok) throw new Error(`skeleton bootstrap failed: ${res.status}`);
      const { items, revision } = await res.json();
      if (_DEV) console.log(`[sync]     skeleton: ${items.length} items (${(performance.now() - t0).toFixed(0)}ms)`);
      await applyItems(items);
      await setLastRevision(revision, scope);
      invalidate('data_items');
      console.log(`[sync] skeleton bootstrapped: ${items.length} items, rev=${revision}`);
    } else {
      // Warm start: re-seed scope from local skeleton data
      const local = await exec(
        "SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type = ? || '|pattern')",
        [_app, _siteType, _siteType]
      );
      for (const row of local.rows) addToScope(row.app, row.type);
      if (_DEV) console.log(`[sync]     skeleton scope seeded: ${local.rows.length} types`);
    }
  } catch (err) {
    console.warn('[sync] skeleton bootstrap failed (offline?):', err.message);
    try {
      const local = await exec(
        "SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type = ? || '|pattern')",
        [_app, _siteType, _siteType]
      );
      for (const row of local.rows) addToScope(row.app, row.type);
    } catch { /* ignore */ }
  }

  await flushPending();
}

/**
 * Bootstrap a specific pattern's data (pages, sections, sources, views).
 * Called on-demand when the user navigates to a pattern.
 *
 * @param {string} docType - The pattern's doc_type
 * @returns {Promise<void>}
 */
export async function bootstrapPattern(docType) {
  if (!docType) return;
  if (_loadedPatterns.has(docType)) {
    if (_DEV) console.log(`[sync]     pattern '${docType}' already loaded, skipping`);
    return;
  }

  const scope = `pattern:${docType}`;
  const lastRev = await getLastRevision(scope);
  if (_DEV) console.log(`[sync]     pattern '${docType}' lastRev=${lastRev} (${lastRev === null ? 'cold' : 'warm'})`);

  try {
    if (lastRev === null) {
      const t0 = performance.now();
      let url = `/sync/bootstrap?app=${encodeURIComponent(_app)}&pattern=${encodeURIComponent(docType)}`;
      if (_siteType) url += `&siteType=${encodeURIComponent(_siteType)}`;
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(`pattern bootstrap failed: ${res.status}`);
      const { items, revision } = await res.json();
      const tFetch = performance.now();
      if (_DEV) console.log(`[sync]     pattern '${docType}': ${items.length} items (${(tFetch - t0).toFixed(0)}ms)`);
      await applyItems(items);
      await setLastRevision(revision, scope);
      invalidate('data_items');
      console.log(`[sync] pattern '${docType}' bootstrapped: ${items.length} items, rev=${revision}`);
    } else {
      // Warm start: delta for this pattern
      const t0 = performance.now();
      let url = `/sync/delta?app=${encodeURIComponent(_app)}&pattern=${encodeURIComponent(docType)}&since=${lastRev}`;
      if (_siteType) url += `&siteType=${encodeURIComponent(_siteType)}`;
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(`pattern delta failed: ${res.status}`);
      const { changes, revision } = await res.json();
      if (_DEV) console.log(`[sync]     pattern '${docType}' delta: ${changes.length} changes (${(performance.now() - t0).toFixed(0)}ms)`);
      if (changes.length > 0) {
        await applyChanges(changes);
        invalidate('data_items');
      }
      await setLastRevision(revision, scope);

      // Re-seed scope from local data for this pattern
      const local = await exec(
        "SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type LIKE ? || '|%')",
        [_app, docType, docType]
      );
      for (const row of local.rows) addToScope(row.app, row.type);
    }
  } catch (err) {
    console.warn(`[sync] pattern '${docType}' bootstrap failed (offline?):`, err.message);
    try {
      const local = await exec(
        "SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type LIKE ? || '|%')",
        [_app, docType, docType]
      );
      for (const row of local.rows) addToScope(row.app, row.type);
    } catch { /* ignore */ }
  }

  _loadedPatterns.add(docType);

  // Subscribe WebSocket to this pattern
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'subscribe', app: _app, pattern: docType }));
  }
}

/**
 * Check if a pattern has been bootstrapped.
 */
export function isPatternLoaded(docType) {
  return _loadedPatterns.has(docType);
}

/**
 * Legacy full-app bootstrap (backward compat / fallback).
 */
async function bootstrapFull() {
  const lastRev = await getLastRevision();
  if (_DEV) console.log(`[sync]     lastRevision=${lastRev} (${lastRev === null ? 'cold start — full bootstrap' : 'warm start — delta sync'})`);

  try {
    if (lastRev === null) {
      const t0 = performance.now();
      const res = await fetch(apiUrl(`/sync/bootstrap?app=${encodeURIComponent(_app)}`));
      if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
      const { items, revision } = await res.json();
      const tFetch = performance.now();
      if (_DEV) console.log(`[sync]     fetched ${items.length} items (${(tFetch - t0).toFixed(0)}ms)`);
      await applyItems(items);
      const tApply = performance.now();
      if (_DEV) console.log(`[sync]     applied to local SQLite (${(tApply - tFetch).toFixed(0)}ms)`);
      await setLastRevision(revision);
      invalidate('data_items');
      console.log(`[sync] bootstrapped ${items.length} items, revision=${revision}`);
    } else {
      const t0 = performance.now();
      const res = await fetch(apiUrl(`/sync/delta?app=${encodeURIComponent(_app)}&since=${lastRev}`));
      if (!res.ok) throw new Error(`delta failed: ${res.status}`);
      const { changes, revision } = await res.json();
      const tFetch = performance.now();
      if (_DEV) console.log(`[sync]     delta: ${changes.length} changes since rev ${lastRev} (${(tFetch - t0).toFixed(0)}ms)`);
      if (changes.length > 0) {
        await applyChanges(changes);
        invalidate('data_items');
        if (_DEV) console.log(`[sync]     applied ${changes.length} deltas (${(performance.now() - tFetch).toFixed(0)}ms)`);
      }
      await setLastRevision(revision);

      // Re-seed sync scope from local data (warm start)
      const local = await exec('SELECT DISTINCT app, type FROM data_items WHERE app = ?', [_app]);
      for (const row of local.rows) {
        addToScope(row.app, row.type);
      }
      if (_DEV) console.log(`[sync]     scope seeded: ${local.rows.length} types from local data`);
    }
  } catch (err) {
    console.warn('[sync] bootstrap/delta failed (offline?):', err.message);

    // Still seed scope from existing local data if we're offline
    try {
      const local = await exec('SELECT DISTINCT app, type FROM data_items WHERE app = ?', [_app]);
      for (const row of local.rows) {
        addToScope(row.app, row.type);
      }
      if (_DEV) console.log(`[sync]     offline — scope seeded from ${local.rows.length} local types`);
    } catch { /* ignore */ }
  }

  await flushPending();
}

// --- WebSocket ---

export function connectWS() {
  const wsHost = _apiHost.replace(/^http/, 'ws');
  const url = wsHost
    ? `${wsHost}/sync/subscribe`
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/sync/subscribe`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[sync] WebSocket connected');
    wsRetryDelay = 500;

    // Subscribe to our app
    ws.send(JSON.stringify({ type: 'subscribe', app: _app }));

    // Re-subscribe to all loaded patterns
    for (const docType of _loadedPatterns) {
      ws.send(JSON.stringify({ type: 'subscribe', app: _app, pattern: docType }));
    }

    catchUp();
    updateStatus('connected');
    notifyWSListeners();
  };

  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'change') {
        // Skip echoes
        if (msg.item && pendingItemIds.has(msg.item.id)) {
          await setLastRevision(msg.revision);
          return;
        }

        if (msg.action === 'I' || msg.action === 'U') {
          const remoteData = typeof msg.item.data === 'string'
            ? JSON.parse(msg.item.data) : msg.item.data;
          const merged = applyRemote(msg.item.id, remoteData);
          const mergedStr = JSON.stringify(merged);

          await exec(
            `INSERT INTO data_items (id, app, type, data, created_at, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               app = excluded.app, type = excluded.type,
               data = excluded.data, updated_at = datetime('now')`,
            [msg.item.id, msg.item.app, msg.item.type, mergedStr]
          );

          // Ensure type is in scope
          addToScope(msg.item.app, msg.item.type);
        } else if (msg.action === 'D') {
          await exec('DELETE FROM data_items WHERE id = ?', [msg.item.id]);
        }

        await setLastRevision(msg.revision);
        invalidate('data_items');

        // Type-scoped invalidation
        if (msg.item) {
          invalidate(`data_items:${msg.item.app}+${msg.item.type}`);
        }
      }
    } catch (err) {
      console.error('[sync] ws message error:', err);
    }
  };

  ws.onclose = () => {
    console.log(`[sync] WebSocket closed, retrying in ${wsRetryDelay}ms`);
    updateStatus('disconnected');
    setTimeout(() => {
      wsRetryDelay = Math.min(wsRetryDelay * 2, wsMaxDelay);
      connectWS();
    }, wsRetryDelay);
  };

  ws.onerror = () => { /* onclose will fire */ };
}

async function catchUp() {
  try {
    const lastRev = await getLastRevision();
    if (lastRev !== null) {
      const res = await fetch(apiUrl(`/sync/delta?app=${encodeURIComponent(_app)}&since=${lastRev}`));
      if (res.ok) {
        const { changes, revision } = await res.json();
        if (changes.length > 0) {
          await applyChanges(changes);
          invalidate('data_items');
        }
        await setLastRevision(revision);
      }
    }
  } catch (err) {
    console.warn('[sync] catch-up failed:', err.message);
  }
}

// --- Batch mode: suppress invalidation during multi-step saves ---
let _batchMode = false;
export function beginBatch() { _batchMode = true; }
export function endBatch() {
  _batchMode = false;
  invalidate('data_items');
}

// --- Local writes + pending mutations ---

export async function localCreate(app, type, data) {
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  // Push to server first to get the real ID.
  // This ensures parent refs use the server-assigned ID, not a temp SQLite rowid.
  // Falls back to optimistic local-only create when offline.
  try {
    const pushUrl = apiUrl('/sync/push');
    if (_DEV) console.log(`[sync] localCreate ${app}+${type} → pushing to server first`);
    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'I', item: { app, type, data: dataStr } }),
    });

    if (res.ok) {
      const { item: serverItem, revision } = await res.json();
      const serverId = serverItem.id;
      if (_DEV) console.log(`[sync] localCreate → server assigned id=${serverId} rev=${revision}`);

      // Store locally with the server-assigned ID
      const serverDataStr = typeof serverItem.data === 'string'
        ? serverItem.data : JSON.stringify(serverItem.data || {});
      await exec(
        `INSERT INTO data_items (id, app, type, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           app = excluded.app, type = excluded.type,
           data = excluded.data, updated_at = datetime('now')`,
        [serverId, app, type, serverDataStr]
      );

      await setLastRevision(revision);
      pendingItemIds.add(serverId);
      // Clear echo suppression after a short delay (server WS broadcast will arrive)
      setTimeout(() => pendingItemIds.delete(serverId), 2000);

      // Initialize Yjs doc for this new item
      try {
        const parsed = typeof serverItem.data === 'string' ? JSON.parse(serverItem.data) : serverItem.data;
        initFromData(serverId, parsed || {});
      } catch { /* ignore parse errors */ }

      invalidate('data_items');
      invalidate(`data_items:${app}+${type}`);
      addToScope(app, type);

      return String(serverId);
    }
    // Non-ok response — fall through to offline path
    if (_DEV) console.warn(`[sync] localCreate push failed: ${res.status}, using offline path`);
  } catch (err) {
    if (_DEV) console.warn(`[sync] localCreate push failed (offline?):`, err.message);
  }

  // Offline fallback: optimistic local write with temp ID
  await exec(
    `INSERT INTO data_items (app, type, data, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [app, type, dataStr]
  );
  const lastRow = await exec('SELECT last_insert_rowid() AS id');
  const tempId = lastRow.rows[0].id;

  await exec(
    "INSERT INTO pending_mutations (item_id, action, app, type, data) VALUES (?, 'I', ?, ?, ?)",
    [tempId, app, type, dataStr]
  );

  pendingItemIds.add(tempId);
  invalidate('data_items');
  invalidate(`data_items:${app}+${type}`);
  updateStatus('syncing');

  pushMutation('I', { id: tempId, app, type, data: dataStr });
  return String(tempId);
}

export async function localUpdate(id, data) {
  // Get existing row (needed for app/type and to seed Yjs if not initialized)
  const existing = await exec('SELECT app, type, data FROM data_items WHERE id = ?', [id]);
  const app = existing.rows[0]?.app || _app;
  const type = existing.rows[0]?.type || '';

  // Seed Yjs doc from SQLite if not already initialized — prevents partial
  // updates from wiping fields when the in-memory doc was lost (e.g. page refresh)
  if (!getData(id) && existing.rows[0]?.data) {
    try {
      const existingData = typeof existing.rows[0].data === 'string'
        ? JSON.parse(existing.rows[0].data) : existing.rows[0].data;
      initFromData(id, existingData);
    } catch { /* ignore parse errors */ }
  }

  // Merge via Yjs
  const merged = applyLocal(id, data);
  const dataStr = JSON.stringify(merged);
  if (_DEV) console.log(`[sync] localUpdate id=${id} app=${app} type=${type} keys=${Object.keys(data).join(',')}`);

  await exec(
    "UPDATE data_items SET data = ?, updated_at = datetime('now') WHERE id = ?",
    [dataStr, id]
  );

  await exec(
    "INSERT INTO pending_mutations (item_id, action, app, type, data) VALUES (?, 'U', ?, ?, ?)",
    [id, app, type, dataStr]
  );

  pendingItemIds.add(id);
  invalidate('data_items');
  invalidate(`data_items:${app}+${type}`);
  updateStatus('syncing');

  pushMutation('U', { id, app, type, data: dataStr });
}

export async function localDelete(id) {
  const existing = await exec('SELECT app, type FROM data_items WHERE id = ?', [id]);
  const app = existing.rows[0]?.app || _app;
  const type = existing.rows[0]?.type || '';

  await exec('DELETE FROM data_items WHERE id = ?', [id]);

  await exec(
    "INSERT INTO pending_mutations (item_id, action, app, type, data) VALUES (?, 'D', ?, ?, NULL)",
    [id, app, type]
  );

  pendingItemIds.add(id);
  invalidate('data_items');
  invalidate(`data_items:${app}+${type}`);
  updateStatus('syncing');

  pushMutation('D', { id, app, type });
}

// --- Push to server via /sync/push ---

async function pushMutation(action, item) {
  const pushUrl = apiUrl('/sync/push');
  if (_DEV) console.log(`[sync] pushMutation ${action} id=${item.id} → ${pushUrl}`);
  try {
    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`push failed: ${res.status} ${errBody}`);
    }
    const { item: serverItem, revision } = await res.json();
    if (_DEV) console.log(`[sync] push ${action} id=${item.id} → server id=${serverItem?.id} rev=${revision}`);

    // If the server assigned a different ID (create), update local
    if (action === 'I' && serverItem.id !== item.id) {
      await exec(
        'UPDATE data_items SET id = ? WHERE id = ?',
        [serverItem.id, item.id]
      );
      pendingItemIds.delete(item.id);
      pendingItemIds.add(serverItem.id);
      // Update the pending mutation's item_id too
      await exec(
        'UPDATE pending_mutations SET item_id = ? WHERE item_id = ? AND action = ?',
        [serverItem.id, item.id, action]
      );
    }

    await setLastRevision(revision);
    await removePending(serverItem.id || item.id, action);
  } catch (err) {
    console.error(`[sync] push ${action} FAILED id=${item.id}:`, err.message, err);
    retryFlush();
  }
}

async function removePending(itemId, action) {
  const result = await exec(
    'SELECT id FROM pending_mutations WHERE item_id = ? AND action = ? ORDER BY id ASC LIMIT 1',
    [itemId, action]
  );
  if (result.rows.length > 0) {
    await exec('DELETE FROM pending_mutations WHERE id = ?', [result.rows[0].id]);
  }

  // Only clear echo suppression when ALL pending mutations for this item are done
  const remaining = await exec(
    'SELECT COUNT(*) as count FROM pending_mutations WHERE item_id = ?',
    [itemId]
  );
  if (remaining.rows[0].count === 0) {
    pendingItemIds.delete(itemId);
  }

  const total = await exec('SELECT COUNT(*) as count FROM pending_mutations');
  if (total.rows[0].count === 0) {
    updateStatus('connected');
  }
}

let flushTimer = null;
function retryFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushPending();
  }, 500);
}

async function flushPending() {
  const result = await exec('SELECT * FROM pending_mutations ORDER BY id ASC');
  if (_DEV && result.rows.length > 0) console.log(`[sync] flushPending: ${result.rows.length} pending mutations`);
  for (const row of result.rows) {
    pendingItemIds.add(row.item_id);
    await pushMutation(row.action, {
      id: row.item_id,
      app: row.app,
      type: row.type,
      data: row.data,
    });
  }
}

// --- Status ---

const statusListeners = new Set();
let currentStatus = 'disconnected';

export function onStatusChange(fn) {
  statusListeners.add(fn);
  fn(currentStatus);
  return () => statusListeners.delete(fn);
}

function updateStatus(status) {
  currentStatus = status;
  for (const fn of statusListeners) fn(status);
}

export function getStatus() {
  return currentStatus;
}

// --- WebSocket access (for collab provider) ---

export function getWS() {
  return ws;
}

const wsListeners = new Set();
export function onWSChange(fn) {
  wsListeners.add(fn);
  if (ws && ws.readyState === 1) fn(ws);
  return () => wsListeners.delete(fn);
}

function notifyWSListeners() {
  for (const fn of wsListeners) fn(ws);
}

// --- Pending count ---

export async function getPendingCount() {
  const result = await exec('SELECT COUNT(*) as count FROM pending_mutations');
  return result.rows[0]?.count || 0;
}
