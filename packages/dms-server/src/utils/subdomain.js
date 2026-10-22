'use strict';

// Extract subdomain from the request. Mirrors getSubdomain() in render/spa/utils/index.js.
// Reads Origin (the frontend's host on cross-origin requests) rather than Host
// (which is the API server's own hostname and carries no subdomain info).
function getSubdomain(req) {
  const origin = req.headers.origin || '';
  const raw = origin ? origin.replace(/^https?:\/\//, '') : (req.headers.host || '');
  const hostname = raw.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost || process.env.NODE_ENV === 'development' ? 2 : 3;
  const parts = hostname.split('.');
  // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
  // a subdomain; real TLDs are never all-digits.
  if (/^\d+$/.test(parts[parts.length - 1])) return '';
  return parts.length >= minParts ? parts[0].toLowerCase() : '';
}

module.exports = { getSubdomain };
