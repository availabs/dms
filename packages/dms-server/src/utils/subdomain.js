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
function hostOf(req) {
  const origin = req.headers.origin || '';
  return origin ? origin.replace(/^https?:\/\//, '') : (req.headers.host || '');
}

function resolveHost(host, rootDomain) {
  const root = `${rootDomain || ''}`.trim().toLowerCase().replace(/^\.+|\.+$/g, '').split(':')[0];
  if (!root || !host) return null;
  const hostname = `${host}`.toLowerCase().split(':')[0];
  let labels;
  if (hostname === root) labels = [];
  else if (hostname.endsWith(`.${root}`)) labels = hostname.slice(0, -(root.length + 1)).split('.');
  else return null;
  const blankWww = (l) => (l === 'www' ? '' : l);
  const tenant = blankWww(labels.length ? labels[labels.length - 1] : '');
  const patternSubdomain = tenant ? blankWww(labels.slice(0, -1).join('.')) : '';
  return { tenant, patternSubdomain };
}

function getSubdomain(req) {
  const raw = hostOf(req);
  const multiTenant = (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1';
  const resolved = multiTenant ? resolveHost(raw, process.env.DMS_ROOT_DOMAIN || process.env.VITE_DMS_ROOT_DOMAIN) : null;
  if (resolved) return resolved.patternSubdomain;
  const hostname = raw.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost || process.env.NODE_ENV === 'development' ? 2 : 3;
  const parts = hostname.split('.');
  // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
  // a subdomain; real TLDs are never all-digits.
  if (/^\d+$/.test(parts[parts.length - 1])) return '';
  return parts.length >= minParts ? parts[0].toLowerCase() : '';
}

module.exports = { getSubdomain, resolveHost };
