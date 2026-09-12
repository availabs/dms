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
// The host minus its subdomain label — `tsmo2.devtny.org` → `devtny.org`,
// `npmrds.localhost:5173` → `localhost:5173`, `devtny.org` → `devtny.org`
// (nothing to strip). Single-depth, mirroring getSubdomain; the port rides along.
// Second consumer since 2026-08-27: the retired-subdomain redirect
// (utils/retiredSubdomain.js) needs the same base to build its target host.
export function getBaseHost(host) {
  const hostname = `${host || ''}`.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost ? 2 : 3;
  const parts = hostname.split('.');
  return parts.length >= minParts ? host.slice(host.indexOf('.') + 1) : host;
}

export function resolveSubdomainPath(path) {
  if (!path?.startsWith('sub://') || typeof window === 'undefined') return path;
  const rest = path.slice('sub://'.length);
  const slash = rest.indexOf('/');
  const sub = slash === -1 ? rest : rest.slice(0, slash);
  const tail = slash === -1 ? '/' : rest.slice(slash);
  const baseHost = getBaseHost(window.location.host); // host includes port
  return `${window.location.protocol}//${sub}.${baseHost}${tail}`;
}
