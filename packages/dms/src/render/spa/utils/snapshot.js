/**
 * localStorage snapshot of the loaded site data — lets the next boot build
 * routes instantly instead of waiting for the API fetch.
 *
 * When the server auth-blocks a boot request (expired token, transient
 * auth-DB failure), pattern rows come back as minimal `id: 'no-access'`
 * stubs — enough to route and redirect to login, but missing theme/config.
 * Persisting a snapshot that contains stubs would poison the next boot into
 * a default-themed render even when that boot's own fetch is healthy, so
 * those snapshots are dropped and any good prior snapshot survives.
 */

export function hasNoAccessPatterns(siteData) {
  return (siteData || []).some(row =>
    (row?.patterns || []).some(p => p?.id === 'no-access')
  );
}

export function persistSiteSnapshot(storage, key, siteData) {
  if (!storage) return false;
  if (hasNoAccessPatterns(siteData)) return false;
  storage.setItem(key, JSON.stringify(siteData));
  return true;
}
