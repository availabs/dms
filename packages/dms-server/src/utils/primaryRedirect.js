'use strict';

// Primary domain redirect (tenant hub, Phase B, 7): a page request for a tenant on any host but its
// primary domain → 301 to the same pattern subdomain and path there
// (`albany.mny.availabs.com/x` → `albany.devmny.org/x`), and a `www.` host to the same host without it
// (`www.devmny.org` → the primary; with no primary, `www.<alias>` → `<alias>`, `www.mny.<root>` → `mny.<root>`). Hand mirror of the client's
// utils/primaryDomain.js resolvePrimaryRedirect (the SPA fallback); keep the two in step.
//
// Only page loads: GET / HEAD asking for HTML. API calls, assets, uploads and websockets pass, as do
// /.well-known/ and the tenant admin (/list, DMS_BASE_URL) on the DEFAULT domain — the way back if
// an alias breaks. Mounted ahead of site hosting and SSR in index.js, on the hub only.
const { resolveHost, rootDomain, primaryDomainOf } = require('./subdomain');

function resolvePrimaryRedirect({ host = '', pathname = '/', search = '', protocol = 'https:', adminPath = '/list', root = rootDomain() }) {
  const r = resolveHost(host, root);
  if (!r || !r.tenant) return null;
  // where this tenant is served: its primary, else the alias or default domain it was asked on
  const defaultDomain = `${r.tenant}.${`${root}`.toLowerCase().split(':')[0]}`;
  const domain = primaryDomainOf(r.tenant) || r.alias || defaultDomain;
  const canonical = `${r.patternSubdomain ? `${r.patternSubdomain}.` : ''}${domain}`;
  // same host (www dropped included: `www.devmny.org` → `devmny.org`) → serve it
  if (`${host}`.toLowerCase().split(':')[0].replace(/\.$/, '') === canonical) return null;
  const path = pathname || '/';
  if (path === '/.well-known' || path.startsWith('/.well-known/')) return null;
  const admin = `/${`${adminPath || ''}`.replace(/^\/+|\/+$/g, '')}`;
  if (!r.alias && domain !== defaultDomain && admin !== '/' && (path === admin || path.startsWith(`${admin}/`))) return null;
  const colon = `${host}`.indexOf(':');
  const port = colon === -1 ? '' : `${host}`.slice(colon);
  return `${protocol}//${canonical}${port}${path}${search}`;
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
