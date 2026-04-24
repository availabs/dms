/**
 * Module-level cache of the datasets list page's source array.
 *
 * The DatasetsList page populates this on first load so that returning to
 * the page (via navigation) skips the UDA refetch — that fetch is the main
 * cost on revisit, even with Falcor's own cache, because we used to call
 * `falcor.invalidate(...)` on every mount.
 *
 * Mutation sites (CreatePage, source/view delete, etc.) MUST call
 * `clearDatasetsListCache()` after `falcor.invalidate` so the next visit
 * sees fresh data.
 */

const sourcesCache = new Map();

export function getCachedSources(key) {
  return sourcesCache.get(key);
}

export function setCachedSources(key, value) {
  sourcesCache.set(key, value);
}

export function hasCachedSources(key) {
  return sourcesCache.has(key);
}

export function clearDatasetsListCache() {
  sourcesCache.clear();
}
