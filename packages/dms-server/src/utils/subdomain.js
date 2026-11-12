'use strict';

// Extract subdomain from the request. Mirrors getSubdomain() in render/spa/utils/index.js.
// Reads Origin (the frontend's host on cross-origin requests) rather than Host
// (which is the API server's own hostname and carries no subdomain info).
//
// On the tenant hub (DMS_ROOT_DOMAIN set) a host under the root domain reads as
// <pattern subdomain>.<tenant>.<root>, and this returns the PATTERN subdomain
// (what per-subdomain grants are keyed by): `albany.mny.availabs.com` → 'albany',
// `mny.availabs.com` → ''. Hand mirror of resolveHost() in the client's
// utils/hostResolver.js (dms-server never imports the client package); keep the
// two in step. Without DMS_ROOT_DOMAIN, or for a host outside it, the reading is
// the old single-label one.
//
// Domain aliases (Phase B): a verified alias of a tenant (`devmny.org`) and its subdomains read the
// same way (`albany.devmny.org` → 'albany'). The map is the hub's tenant rows, kept by
// routes/domains/store.js (setDomainAliasMap); sync, so every caller of getSubdomain stays sync.
let ALIASES = new Map();   // verified alias domain → tenant subdomain
let PRIMARY = new Map();   // tenant subdomain → primary domain
function setDomainAliasMap({ aliases, primary } = {}) {
  ALIASES = aliases instanceof Map ? aliases : new Map();
  PRIMARY = primary instanceof Map ? primary : new Map();
}
const primaryDomainOf = (tenant) => PRIMARY.get(`${tenant || ''}`.toLowerCase()) || '';

function hostOf(req) {
  const origin = req.headers.origin || '';
  return origin ? origin.replace(/^https?:\/\//, '') : (req.headers.host || '');
}

function resolveHost(host, rootDomain, aliases = ALIASES) {
  const root = `${rootDomain || ''}`.trim().toLowerCase().replace(/^\.+|\.+$/g, '').split(':')[0];
  if (!root || !host) return null;
  const hostname = `${host}`.toLowerCase().split(':')[0];
  const blankWww = (l) => (l === 'www' ? '' : l);
  // a pattern subdomain drops a leading `www` label: `www.albany` → `albany` (mirror of the client's patternSub)
  const patternSub = (sub) => sub.replace(/^www(\.|$)/, '');
  let labels;
  if (hostname === root) labels = [];
  else if (hostname.endsWith(`.${root}`)) labels = hostname.slice(0, -(root.length + 1)).split('.');
  else {
    // the longest verified alias the host is, or ends with
    let alias = '';
    for (const d of (aliases || new Map()).keys()) {
      if ((hostname === d || hostname.endsWith(`.${d}`)) && d.length > alias.length) alias = d;
    }
    if (!alias) return null;
    return { tenant: aliases.get(alias), patternSubdomain: patternSub(hostname === alias ? '' : hostname.slice(0, -(alias.length + 1))), alias };
  }
  const tenant = blankWww(labels.length ? labels[labels.length - 1] : '');
  const patternSubdomain = tenant ? patternSub(labels.slice(0, -1).join('.')) : '';
  return { tenant, patternSubdomain };
}

const rootDomain = () => ((process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1'
  ? process.env.DMS_ROOT_DOMAIN || process.env.VITE_DMS_ROOT_DOMAIN || '' : '');

function getSubdomain(req) {
  const raw = hostOf(req);
  const resolved = resolveHost(raw, rootDomain());
  if (resolved) return resolved.patternSubdomain;
  // the legacy single-label reading: hand mirror of the client's utils/hostResolver.js legacySplit (with
  // its development reading, as the client router's getSubdomain); keep the two in step
  const hostname = raw.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost || process.env.NODE_ENV === 'development' ? 2 : 3;
  const parts = hostname.split('.');
  // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
  // a subdomain; real TLDs are never all-digits.
  if (/^\d+$/.test(parts[parts.length - 1])) return '';
  return parts.length >= minParts ? parts[0].toLowerCase() : '';
}

module.exports = { getSubdomain, resolveHost, rootDomain, setDomainAliasMap, primaryDomainOf };
