import { resolveHost, primaryDomainOf, getRootDomain } from './hostResolver';

// Primary domain redirect (tenant hub, Phase B). A tenant with a primary domain is served
// there: a page request on any of its other hosts (the default <tenant>.<root>, or a
// non-primary alias) goes to the same pattern subdomain and path on the primary:
//   albany.mny.availabs.com/x → albany.devmny.org/x
// and a `www.` host goes to the same host without it (`www.devmny.org` → the primary; with no
// primary, `www.<alias>` → `<alias>`, `www.mny.<root>` → `mny.<root>`).
// Never redirected: the tenant admin (`adminPath`, /list) on the DEFAULT domain (the way back
// if an alias breaks), and /.well-known/. The server does this first (dms-server
// utils/primaryRedirect.js, in front of the SSR handler, hand mirror); this is the fallback
// for SPA-only builds, applied like the retired-subdomain redirect (utils/retiredSubdomain.js).
// See planning/tasks/current/tenant-external-domains.md (Phase B, 7).

// The absolute URL to send this request to, or null to serve it. Pure.
export function resolvePrimaryRedirect({
    host = '', pathname = '/', search = '', hash = '', protocol = 'https:', adminPath = '/list',
}) {
    const r = resolveHost(host);
    if (!r || !r.tenant) return null;
    // where this tenant is served: its primary, else the alias or default domain it was asked on
    const defaultDomain = `${r.tenant}.${`${getRootDomain()}`.toLowerCase().split(':')[0]}`;
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
    return `${protocol}//${canonical}${port}${path}${search}${hash}`;
}

// Client side: true when a redirect was issued (the caller should stop). A cross-origin move,
// so window.location, not the router; `replace` keeps the old URL out of the back-stack.
export function applyPrimaryDomainRedirect({ adminPath } = {}) {
    if (typeof window === 'undefined') return false;
    const { host, pathname, search, hash, protocol } = window.location;
    const target = resolvePrimaryRedirect({ host, pathname, search, hash, protocol, adminPath });
    if (!target) return false;
    window.location.replace(target);
    return true;
}
