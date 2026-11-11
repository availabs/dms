// Reading a request host as { tenant, pattern subdomain } on a multi-tenant hub.
//
// Opt-in: nothing changes until a ROOT DOMAIN is set (setRootDomain, from the
// app's VITE_DMS_ROOT_DOMAIN / the SSR server's DMS_ROOT_DOMAIN; only the tenant
// hub sets one). Without it resolveHost returns null and every caller keeps its
// legacy single-label reading (the host's first label is both the tenant and the
// pattern subdomain).
//
// With a root domain (e.g. availabs.com):
//   availabs.com             → tenant '',    pattern subdomain ''   (the platform root)
//   mny.availabs.com         → tenant 'mny', pattern subdomain ''   (the tenant's root)
//   albany.mny.availabs.com  → tenant 'mny', pattern subdomain 'albany'
//   a.b.mny.availabs.com     → tenant 'mny', pattern subdomain 'a.b' (no pattern has that: the tenant's 404)
//   anything else (IPs, other domains) → null: the legacy reading applies.
// `www` in either position reads as '' (nginx redirects www.<root>, but a direct hit must not be a tenant).
//
// dms-server mirrors this in src/utils/subdomain.js (hand mirror; dms-server
// never imports the client package). Keep the two in step.
// See planning/tasks/current/tenant-external-domains.md (Phase A).

let ROOT_DOMAIN = '';

const normalizeDomain = (d) => `${d || ''}`.trim().toLowerCase().replace(/^\.+|\.+$/g, '').split(':')[0];

export function setRootDomain(domain) {
    ROOT_DOMAIN = normalizeDomain(domain);
}

export function getRootDomain() {
    return ROOT_DOMAIN;
}

const blankWww = (label) => (label === 'www' ? '' : label);

// null when no root domain is set or the host isn't under it.
export function resolveHost(host, rootDomain = ROOT_DOMAIN) {
    const root = normalizeDomain(rootDomain);
    if (!root || !host) return null;
    const raw = `${host}`.toLowerCase();
    const colon = raw.indexOf(':');
    const hostname = colon === -1 ? raw : raw.slice(0, colon);
    const port = colon === -1 ? '' : raw.slice(colon);
    let labels;
    if (hostname === root) labels = [];
    else if (hostname.endsWith(`.${root}`)) labels = hostname.slice(0, -(root.length + 1)).split('.');
    else return null;
    const tenant = blankWww(labels.length ? labels[labels.length - 1] : '');
    const patternSubdomain = tenant ? blankWww(labels.slice(0, -1).join('.')) : '';
    return { tenant, patternSubdomain, tenantHost: `${tenant ? `${tenant}.` : ''}${root}${port}` };
}

// The legacy reading the admin and auth patterns used inline (copies in editSite,
// patternList, the pattern settings editor, authSignup): the first label when the
// host has a subdomain (2 labels on *.localhost, 3 elsewhere), '' otherwise and
// for bare IPv4 hosts. Kept byte-for-byte in behaviour for sites without a root domain.
export function legacyFirstLabel(host) {
    const hostname = `${host || ''}`.split(':')[0];
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const minParts = isLocalhost ? 2 : 3;
    const parts = hostname.split('.');
    if (/^\d+$/.test(parts[parts.length - 1])) return '';
    return parts.length >= minParts ? parts[0] : '';
}

// The tenant this host belongs to ('' on the platform root).
export function hostTenant(host) {
    const r = resolveHost(host);
    return r ? r.tenant : legacyFirstLabel(host);
}

// The subdomain a pattern created on this host is stamped with when the author
// gives none. Legacy multi-tenant sites put a tenant's root patterns on the
// tenant's label; with a root domain a tenant's root is '' like any site's.
export function newPatternSubdomain(host) {
    return resolveHost(host) ? '' : legacyFirstLabel(host);
}
