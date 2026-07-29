// Cross-subdomain link scheme: `sub://<subdomain>/<path>` resolves against the
// CURRENT host's base domain at click/render time, so one authored value works in
// every environment (dev `sub://npmrds/x` → npmrds.localhost:5173/x, prod →
// npmrds.devtny.org/x). The base domain is the host minus its subdomain label
// (single-depth, mirroring getSubdomain: on `a.b.tld` the base is `b.tld`; on
// `a.localhost`/2-part prod hosts the base is the whole host... minus `a` when
// there are enough labels).
//
// Returns the input unchanged for anything that is not `sub://`, and on the server
// (no `window`) — an SSR render emits the raw `sub://…` and hydration replaces it.
//
// Consumers: lexical ButtonNode (authored buttons/links, since 2026-07-13) and
// dataItemsNav (nav items, since 2026-07-29). Lived inside ButtonNode until the
// second consumer arrived.
export function resolveSubdomainPath(path) {
  if (!path?.startsWith('sub://') || typeof window === 'undefined') return path;
  const rest = path.slice('sub://'.length);
  const slash = rest.indexOf('/');
  const sub = slash === -1 ? rest : rest.slice(0, slash);
  const tail = slash === -1 ? '/' : rest.slice(slash);
  const host = window.location.host; // includes port
  const hostname = host.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost ? 2 : 3;
  const parts = hostname.split('.');
  const baseHost = parts.length >= minParts ? host.slice(host.indexOf('.') + 1) : host;
  return `${window.location.protocol}//${sub}.${baseHost}${tail}`;
}
