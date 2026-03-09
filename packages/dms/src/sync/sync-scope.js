/**
 * Sync Scope Registry
 *
 * Tracks which (app, type) pairs are synced locally.
 * Seeded at bootstrap from the types present in the response.
 * The routing decision: isLocal(app, type) → serve from client SQLite.
 */

const syncedTypes = new Set();

export function addToScope(app, type) {
  syncedTypes.add(`${app}+${type}`);
}

export function isLocal(app, type) {
  return syncedTypes.has(`${app}+${type}`);
}

export function getSyncedTypes() {
  return new Set(syncedTypes);
}

export function clearScope() {
  syncedTypes.clear();
}
