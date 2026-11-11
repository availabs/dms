import { resolveHost, primaryDomainOf } from './hostResolver';

// Primary domain redirect (tenant hub, Phase B). A tenant with a primary domain is served
// there: a page request on any of its other hosts (the default <tenant>.<root>, or a
// non-primary alias) goes to the same pattern subdomain and path on the primary:
//   albany.mny.availabs.com/x → albany.devmny.org/x
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
    const primary = primaryDomainOf(r.tenant);
    if (!primary || r.alias === primary) return null;
    const path = pathname || '/';
    if (path === '/.well-known' || path.startsWith('/.well-known/')) return null;
    const admin = `/${`${adminPath || ''}`.replace(/^\/+|\/+$/g, '')}`;
    if (!r.alias && admin !== '/' && (path === admin || path.startsWith(`${admin}/`))) return null;
    const colon = `${host}`.indexOf(':');
    const port = colon === -1 ? '' : `${host}`.slice(colon);
    return `${protocol}//${r.patternSubdomain ? `${r.patternSubdomain}.` : ''}${primary}${port}${path}${search}${hash}`;
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
