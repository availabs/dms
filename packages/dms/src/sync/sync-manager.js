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

import {
  getState, setState,
  getItem, getItemsByAppType,
  getDistinctAppTypesByApp, getDistinctAppTypesByAppAndPatternPrefix,
  upsertItemNow, upsertItemsFromServer, applyChangeBatch,
  deleteItem, deleteItemsByIds, updateItemData, createItemOffline,
  reassignItemId, sqliteNow, resetDB,
  addPendingMutation, deletePendingMutationById, findFirstPendingMutation,
  countPendingMutationsForItem, countAllPendingMutations, getAllPendingMutationsOrdered,
} from './idb-store.js';
import { applyLocal, applyRemote, initFromData, getData } from './yjs-store.js';
import { addToScope, clearScope } from './sync-scope.js';

// If a delta response exceeds this many changes, discard it and do a full
// re-bootstrap for that scope instead.  This avoids applying extremely large
// change-sets that would be slower than a fresh snapshot.
const STALE_DELTA_THRESHOLD = 1000;

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
// Inflight bootstrap promises — deduplicates concurrent calls for the same pattern
const _inflightBootstraps = new Map();

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
  const value = await getState(key);
  return value !== null ? parseInt(value, 10) : null;
}

async function setLastRevision(rev, scope = null) {
  const key = scope ? `rev:${scope}` : 'last_revision';
  await setState(key, String(rev));
}

async function applyChanges(changes) {
  const ops = [];
  for (const change of changes) {
    if (pendingItemIds.has(change.item_id)) continue;

    if (change.action === 'I' || change.action === 'U') {
      const dataStr = typeof change.data === 'string' ? change.data : JSON.stringify(change.data || {});
      ops.push({ action: 'upsert', id: change.item_id, app: change.app, type: change.type, data: dataStr });
    } else if (change.action === 'D') {
      ops.push({ action: 'delete', id: change.item_id });
    }
  }
  if (ops.length > 0) {
    await applyChangeBatch(ops);
  }
}

async function applyItems(items) {
  const normalized = items.map(item => ({
    id: item.id, app: item.app, type: item.type,
    data: typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {}),
    created_at: item.created_at, created_by: item.created_by,
    updated_at: item.updated_at, updated_by: item.updated_by,
  }));
  await upsertItemsFromServer(normalized);

  // Register types in sync scope + init Yjs docs (these are cheap in-memory ops)
  for (const item of items) {
    addToScope(item.app, item.type);
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
    // Skeleton is always small (<20 items), so we re-fetch the full snapshot
    // on every load. The server follows refs from the site row to discover
    // children (pattern items, etc.) rather than using hardcoded type conventions.
    const t0 = performance.now();
    const res = await fetch(apiUrl(`/sync/bootstrap?app=${encodeURIComponent(_app)}&skeleton=${encodeURIComponent(_siteType)}`));
    if (!res.ok) throw new Error(`skeleton bootstrap failed: ${res.status}`);
    const { items, revision } = await res.json();
    if (_DEV) console.log(`[sync]     skeleton: ${items.length} items (${(performance.now() - t0).toFixed(0)}ms)`);

    // The server response is authoritative for the skeleton. Clean up any
    // stale local items that belong to the skeleton scope but aren't in the
    // response (e.g., site row or pattern children from a previous database).
    const serverIds = new Set(items.map(i => i.id));
    const localSite = await getItemsByAppType(_app, _siteType);
    for (const row of localSite) {
      // Collect stale IDs: the site row itself + any ref children it points to
      const staleIds = [];
      if (!serverIds.has(row.id)) staleIds.push(row.id);
      try {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
        for (const value of Object.values(data)) {
          if (!Array.isArray(value)) continue;
          for (const item of value) {
            // Match serverIds' actual type (String — see api/index.js's ref
            // resolution for the full explanation). This used to coerce to
            // Number, which meant this check could never match anything —
            // every ref looked "stale" here, and the resulting delete was
            // itself a silent no-op for the same reason (deleteItemsByIds
            // querying a numeric key against a string-keyed row also misses).
            // Net effect was inert rather than destructive, but still wrong.
            const refId = item?.id != null ? String(item.id) : (typeof item === 'number' ? String(item) : null);
            if (refId != null && !serverIds.has(refId)) staleIds.push(refId);
          }
        }
      } catch { /* ignore parse errors */ }
      if (staleIds.length > 0) {
        await deleteItemsByIds(staleIds);
        if (_DEV) console.log(`[sync]     skeleton: deleted ${staleIds.length} stale local items`);
      }
    }

    await applyItems(items);
    // Always add the site type to scope — even with 0 items, the site type is a valid sync target
    addToScope(_app, _siteType);
    await setLastRevision(revision, scope);
    invalidate('data_items');
    console.log(`[sync] skeleton bootstrapped: ${items.length} items, rev=${revision}`);
  } catch (err) {
    console.warn('[sync] skeleton bootstrap failed (offline?):', err.message);
    // Offline: seed scope from whatever is in local storage
    try {
      const local = await getDistinctAppTypesByApp(_app);
      for (const row of local) addToScope(row.app, row.type);
    } catch { /* ignore */ }
  }

  await flushPending();
}

/**
 * Bootstrap a specific pattern's data (pages, sections, sources, views).
 * Called on-demand when the user navigates to a pattern.
 *
 * @param {string} patternType - The full DB `type` of the item being loaded
 *   (e.g. 'my_docs|page'), as passed by api/index.js's dmsDataLoader. This is
 *   NOT the bare pattern instance name — the server (`/sync/bootstrap`,
 *   `/sync/delta`) derives the instance prefix itself (everything before the
 *   first '|') and matches all sibling types under it. This parameter was
 *   named `docType` before the type-system refactor removed `data.doc_type`
 *   entirely; renamed here for accuracy — see sync-bring-up-to-date.md Phase 1.
 * @returns {Promise<void>}
 */
export function bootstrapPattern(patternType) {
  if (!patternType) return Promise.resolve();
  if (_loadedPatterns.has(patternType)) {
    if (_DEV) console.log(`[sync]     pattern '${patternType}' already loaded, skipping`);
    return Promise.resolve();
  }
  // Deduplicate concurrent calls — return existing inflight promise if one exists
  if (_inflightBootstraps.has(patternType)) {
    if (_DEV) console.log(`[sync]     pattern '${patternType}' bootstrap already inflight, waiting...`);
    return _inflightBootstraps.get(patternType);
  }
  const promise = _bootstrapPatternImpl(patternType);
  _inflightBootstraps.set(patternType, promise);
  promise.finally(() => _inflightBootstraps.delete(patternType));
  return promise;
}

async function _bootstrapPatternImpl(patternType) {
  const scope = `pattern:${patternType}`;
  const lastRev = await getLastRevision(scope);
  if (_DEV) console.log(`[sync]     pattern '${patternType}' lastRev=${lastRev} (${lastRev === null ? 'cold' : 'warm'})`);

  try {
    if (lastRev === null) {
      const t0 = performance.now();
      let url = `/sync/bootstrap?app=${encodeURIComponent(_app)}&pattern=${encodeURIComponent(patternType)}`;
      if (_siteType) url += `&siteType=${encodeURIComponent(_siteType)}`;
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(`pattern bootstrap failed: ${res.status}`);
      const { items, revision } = await res.json();
      const tFetch = performance.now();
      if (_DEV) console.log(`[sync]     pattern '${patternType}': ${items.length} items (${(tFetch - t0).toFixed(0)}ms)`);
      await applyItems(items);
      // Always add the pattern type to scope — even with 0 items, creates should go through sync
      addToScope(_app, patternType);
      await setLastRevision(revision, scope);
      invalidate('data_items');
      console.log(`[sync] pattern '${patternType}' bootstrapped: ${items.length} items, rev=${revision}`);
    } else {
      // Warm start: delta for this pattern
      const t0 = performance.now();
      let url = `/sync/delta?app=${encodeURIComponent(_app)}&pattern=${encodeURIComponent(patternType)}&since=${lastRev}`;
      if (_siteType) url += `&siteType=${encodeURIComponent(_siteType)}`;
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(`pattern delta failed: ${res.status}`);
      const { changes, revision } = await res.json();
      if (_DEV) console.log(`[sync]     pattern '${patternType}' delta: ${changes.length} changes (${(performance.now() - t0).toFixed(0)}ms)`);

      // Stale delta — too many changes, fall back to full re-bootstrap
      if (changes.length > STALE_DELTA_THRESHOLD) {
        console.warn(`[sync] pattern '${patternType}' delta too large (${changes.length} > ${STALE_DELTA_THRESHOLD}), re-bootstrapping`);
        await setLastRevision(null, scope);
        _loadedPatterns.delete(patternType);
        return bootstrapPattern(patternType);
      }

      if (changes.length > 0) {
        await applyChanges(changes);
        invalidate('data_items');
      }
      await setLastRevision(revision, scope);

      // Re-seed scope from local data for this pattern
      const local = await getDistinctAppTypesByAppAndPatternPrefix(_app, patternType);
      for (const row of local) addToScope(row.app, row.type);
    }
  } catch (err) {
    console.warn(`[sync] pattern '${patternType}' bootstrap failed (offline?):`, err.message);
    try {
      const local = await getDistinctAppTypesByAppAndPatternPrefix(_app, patternType);
      for (const row of local) addToScope(row.app, row.type);
    } catch { /* ignore */ }
  }

  _loadedPatterns.add(patternType);

  // Subscribe WebSocket to this pattern
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'subscribe', app: _app, pattern: patternType }));
  }
}

/**
 * Check if a pattern has been bootstrapped.
 */
export function isPatternLoaded(patternType) {
  return _loadedPatterns.has(patternType);
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

      // Stale delta — too many changes, fall back to full re-bootstrap
      if (changes.length > STALE_DELTA_THRESHOLD) {
        console.warn(`[sync] full delta too large (${changes.length} > ${STALE_DELTA_THRESHOLD}), re-bootstrapping`);
        await setLastRevision(null);
        return bootstrapFull();
      }

      if (changes.length > 0) {
        await applyChanges(changes);
        invalidate('data_items');
        if (_DEV) console.log(`[sync]     applied ${changes.length} deltas (${(performance.now() - tFetch).toFixed(0)}ms)`);
      }
      await setLastRevision(revision);

      // Re-seed sync scope from local data (warm start)
      const local = await getDistinctAppTypesByApp(_app);
      for (const row of local) {
        addToScope(row.app, row.type);
      }
      if (_DEV) console.log(`[sync]     scope seeded: ${local.length} types from local data`);
    }
  } catch (err) {
    console.warn('[sync] bootstrap/delta failed (offline?):', err.message);

    // Still seed scope from existing local data if we're offline
    try {
      const local = await getDistinctAppTypesByApp(_app);
      for (const row of local) {
        addToScope(row.app, row.type);
      }
      if (_DEV) console.log(`[sync]     offline — scope seeded from ${local.length} local types`);
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
    for (const patternType of _loadedPatterns) {
      ws.send(JSON.stringify({ type: 'subscribe', app: _app, pattern: patternType }));
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

          await upsertItemNow({ id: msg.item.id, app: msg.item.app, type: msg.item.type, data: mergedStr });

          // Ensure type is in scope
          addToScope(msg.item.app, msg.item.type);
        } else if (msg.action === 'D') {
          await deleteItem(msg.item.id);
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

        // Stale delta — too many changes, re-bootstrap skeleton
        if (changes.length > STALE_DELTA_THRESHOLD) {
          console.warn(`[sync] catchUp delta too large (${changes.length} > ${STALE_DELTA_THRESHOLD}), re-bootstrapping`);
          await bootstrapSkeleton();
          return;
        }

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
      await upsertItemNow({ id: serverId, app, type, data: serverDataStr });

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
  const now = sqliteNow();
  const tempId = await createItemOffline({
    app, type, data: dataStr, created_at: now, updated_at: now, created_by: null, updated_by: null,
  });

  await addPendingMutation({ item_id: tempId, action: 'I', app, type, data: dataStr });

  pendingItemIds.add(tempId);
  invalidate('data_items');
  invalidate(`data_items:${app}+${type}`);
  updateStatus('syncing');

  pushMutation('I', { id: tempId, app, type, data: dataStr });
  return String(tempId);
}

export async function localUpdate(id, data) {
  // Get existing row (needed for app/type and to seed Yjs if not initialized)
  const existing = await getItem(id);
  const app = existing?.app || _app;
  const type = existing?.type || '';

  // Seed Yjs doc from local storage if not already initialized — prevents
  // partial updates from wiping fields when the in-memory doc was lost (e.g. page refresh)
  if (!getData(id) && existing?.data) {
    try {
      const existingData = typeof existing.data === 'string'
        ? JSON.parse(existing.data) : existing.data;
      initFromData(id, existingData);
    } catch { /* ignore parse errors */ }
  }

  // Merge via Yjs
  const merged = applyLocal(id, data);
  const dataStr = JSON.stringify(merged);
  if (_DEV) console.log(`[sync] localUpdate id=${id} app=${app} type=${type} keys=${Object.keys(data).join(',')}`);

  await updateItemData(id, dataStr, sqliteNow());

  await addPendingMutation({ item_id: id, action: 'U', app, type, data: dataStr });

  pendingItemIds.add(id);
  invalidate('data_items');
  invalidate(`data_items:${app}+${type}`);
  updateStatus('syncing');

  pushMutation('U', { id, app, type, data: dataStr });
}

export async function localDelete(id) {
  const existing = await getItem(id);
  const app = existing?.app || _app;
  const type = existing?.type || '';

  await deleteItem(id);

  await addPendingMutation({ item_id: id, action: 'D', app, type, data: null });

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
      // ADR 2: IndexedDB can't change a record's key via put(), so this is
      // delete-old + add-new under the hood — done as one cross-store
      // transaction with the matching pending_mutations rewrite (see
      // idb-store.js's reassignItemId), which is actually a small
      // correctness improvement over the original two independent UPDATEs.
      await reassignItemId(item.id, serverItem.id);
      pendingItemIds.delete(item.id);
      pendingItemIds.add(serverItem.id);
    }

    await setLastRevision(revision);
    await removePending(serverItem.id || item.id, action);
  } catch (err) {
    console.error(`[sync] push ${action} FAILED id=${item.id}:`, err.message, err);
    retryFlush();
  }
}

async function removePending(itemId, action) {
  const match = await findFirstPendingMutation(itemId, action);
  if (match) {
    await deletePendingMutationById(match.id);
  }

  // Only clear echo suppression when ALL pending mutations for this item are done
  const remaining = await countPendingMutationsForItem(itemId);
  if (remaining === 0) {
    pendingItemIds.delete(itemId);
  }

  const total = await countAllPendingMutations();
  if (total === 0) {
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
  const rows = await getAllPendingMutationsOrdered();
  if (_DEV && rows.length > 0) console.log(`[sync] flushPending: ${rows.length} pending mutations`);
  for (const row of rows) {
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

// --- Collab readiness + active room tracking ---

export function isCollabReady() {
  return ws && ws.readyState === 1;
}

// Track active collab rooms and their peer counts: itemId → peerCount
const _activeCollabRooms = new Map();
const _collabListeners = new Set();

export function registerCollabRoom(itemId) {
  _activeCollabRooms.set(itemId, _activeCollabRooms.get(itemId) || 1);
  _notifyCollabListeners();
}

export function unregisterCollabRoom(itemId) {
  _activeCollabRooms.delete(itemId);
  _notifyCollabListeners();
}

export function updateCollabPeers(itemId, count) {
  if (_activeCollabRooms.has(itemId)) {
    _activeCollabRooms.set(itemId, count);
    _notifyCollabListeners();
  }
}

export function getCollabInfo() {
  let totalPeers = 0;
  for (const count of _activeCollabRooms.values()) {
    totalPeers = Math.max(totalPeers, count);
  }
  return { rooms: _activeCollabRooms.size, peers: totalPeers };
}

export function onCollabChange(fn) {
  _collabListeners.add(fn);
  return () => _collabListeners.delete(fn);
}

function _notifyCollabListeners() {
  const info = getCollabInfo();
  for (const fn of _collabListeners) fn(info);
}

// --- Error recovery ---

let _recovering = false;

export async function resetAndRebootstrap() {
  if (_recovering) return;
  _recovering = true;
  console.warn('[sync] resetting local database and re-bootstrapping...');
  updateStatus('recovering');

  try {
    await resetDB();

    // Clear in-memory state
    _loadedPatterns.clear();
    pendingItemIds.clear();
    clearScope();

    // Re-bootstrap
    await bootstrapSkeleton();

    updateStatus('connected');
  } catch (err) {
    console.error('[sync] recovery failed:', err);
    updateStatus('error');
  } finally {
    _recovering = false;
  }
}

// --- Pending count ---

export async function getPendingCount() {
  return countAllPendingMutations();
}
