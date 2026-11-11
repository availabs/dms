'use strict';

// Primary domain redirect (tenant hub, Phase B, 7): a page request for a tenant on any host but its
// primary domain → 301 to the same pattern subdomain and path there
// (`albany.mny.availabs.com/x` → `albany.devmny.org/x`). Hand mirror of the client's
// utils/primaryDomain.js resolvePrimaryRedirect (the SPA fallback); keep the two in step.
//
// Only page loads: GET / HEAD asking for HTML. API calls, assets, uploads and websockets pass, as do
// /.well-known/ and the tenant admin (/list, DMS_BASE_URL) on the DEFAULT domain — the way back if
// an alias breaks. Mounted ahead of site hosting and SSR in index.js, on the hub only.
const { resolveHost, rootDomain, primaryDomainOf } = require('./subdomain');

function resolvePrimaryRedirect({ host = '', pathname = '/', search = '', protocol = 'https:', adminPath = '/list', root = rootDomain() }) {
  const r = resolveHost(host, root);
  if (!r || !r.tenant) return null;
  const primary = primaryDomainOf(r.tenant);
  if (!primary || r.alias === primary) return null;
  const path = pathname || '/';
  if (path === '/.well-known' || path.startsWith('/.well-known/')) return null;
  const admin = `/${`${adminPath || ''}`.replace(/^\/+|\/+$/g, '')}`;
  if (!r.alias && admin !== '/' && (path === admin || path.startsWith(`${admin}/`))) return null;
  const colon = `${host}`.indexOf(':');
  const port = colon === -1 ? '' : `${host}`.slice(colon);
  return `${protocol}//${r.patternSubdomain ? `${r.patternSubdomain}.` : ''}${primary}${port}${path}${search}`;
}

function createPrimaryRedirect({ adminPath = process.env.DMS_BASE_URL || process.env.VITE_DMS_BASE_URL || '/list' } = {}) {
  return function primaryRedirect(req, res, next) {
    if (!rootDomain() || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    if (!`${req.headers.accept || ''}`.includes('text/html')) return next();
    const q = req.originalUrl.indexOf('?');
    const target = resolvePrimaryRedirect({
      host: req.headers.host || '',
      pathname: req.path,
      search: q === -1 ? '' : req.originalUrl.slice(q),
      protocol: `${req.protocol}:`,
      adminPath,
    });
    if (!target) return next();
    res.redirect(301, target);
  };
}

module.exports = { resolvePrimaryRedirect, createPrimaryRedirect };
