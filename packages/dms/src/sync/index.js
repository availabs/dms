/**
 * DMS Sync — Public API
 *
 * Entry point for the local-first sync system.
 * Opt-in via VITE_DMS_SYNC=1 environment variable.
 *
 * Usage:
 *   import { initSync, isReady } from './sync';
 *   await initSync('myapp', 'http://localhost:3001');
 */

import { initDB, exec } from './db-client.js';
import { configure, bootstrapSkeleton, bootstrapPattern, isPatternLoaded,
         connectWS, localCreate, localUpdate, localDelete,
         beginBatch, endBatch,
         onInvalidate, onStatusChange, getStatus, getWS, onWSChange, getPendingCount,
         isCollabReady,
         registerCollabRoom, unregisterCollabRoom, updateCollabPeers, getCollabInfo, onCollabChange,
         resetAndRebootstrap } from './sync-manager.js';
import { isLocal, addToScope, getSyncedTypes, clearScope } from './sync-scope.js';
import { useQuery } from './use-query.js';

let _ready = false;
let _initPromise = null;

const _DEV = import.meta.env?.DEV;

/**
 * Initialize the sync system.
 *
 * Loads only the site skeleton (site + pattern rows) initially.
 * Pattern data is loaded on-demand via bootstrapPattern().
 *
 * @param {string} app - DMS application name
 * @param {string} [apiHost] - API host URL (e.g., 'http://localhost:3001').
 * @param {string} [siteType] - Site type for skeleton bootstrap.
 * @returns {Promise<Object>} Sync API
 */
export async function initSync(app, apiHost = '', siteType = '') {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const t0 = performance.now();
    if (_DEV) console.log('[sync] starting init for app:', app, 'siteType:', siteType);

    configure(app, apiHost, siteType);

    const t1 = performance.now();
    if (_DEV) console.log('[sync]   initDB (SQLite WASM worker)...');
    await initDB();
    const t2 = performance.now();
    if (_DEV) console.log(`[sync]   initDB done (${(t2 - t1).toFixed(0)}ms)`);

    if (_DEV) console.log('[sync]   skeleton bootstrap...');
    await bootstrapSkeleton();
    const t3 = performance.now();
    if (_DEV) console.log(`[sync]   skeleton bootstrap done (${(t3 - t2).toFixed(0)}ms)`);

    if (_DEV) console.log('[sync]   connectWS...');
    connectWS();

    _ready = true;
    const total = performance.now() - t0;
    if (_DEV) {
      console.log(`[sync] initialized in ${total.toFixed(0)}ms (initDB: ${(t2 - t1).toFixed(0)}ms, skeleton: ${(t3 - t2).toFixed(0)}ms)`);
    } else {
      console.log('[sync] initialized for app:', app);
    }
    return getSyncAPI();
  })();

  return _initPromise;
}

/**
 * Check if sync is initialized and ready.
 */
export function isReady() {
  return _ready;
}

/**
 * Get the sync API object (after init).
 */
export function getSyncAPI() {
  return {
    exec,
    localCreate,
    localUpdate,
    localDelete,
    beginBatch,
    endBatch,
    isLocal,
    addToScope,
    getSyncedTypes,
    onInvalidate,
    onStatusChange,
    getStatus,
    getWS,
    onWSChange,
    getPendingCount,
    useQuery,
    bootstrapPattern,
    isPatternLoaded,
    isCollabReady,
    resetAndRebootstrap,
  };
}

// Re-export key functions for direct import
export {
  exec,
  localCreate,
  localUpdate,
  localDelete,
  beginBatch,
  endBatch,
  isLocal,
  addToScope,
  getSyncedTypes,
  onInvalidate,
  onStatusChange,
  getStatus,
  getWS,
  onWSChange,
  getPendingCount,
  useQuery,
  bootstrapPattern,
  isPatternLoaded,
  isCollabReady,
  resetAndRebootstrap,
};
