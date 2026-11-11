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
// Domain aliases (Phase B): a tenant may add domains it owns (`devmny.org`), verified by DNS. A host
// outside the root domain that IS a verified alias, or ends with `.<alias>`, reads as that tenant:
//   devmny.org         → tenant 'mny', pattern subdomain ''        (tenantHost 'devmny.org', alias 'devmny.org')
//   albany.devmny.org  → tenant 'mny', pattern subdomain 'albany'
// The alias map comes from the platform root site's tenant rows (setDomainAliases, called by
// dmsSiteFactory once the root site has loaded; the SSR handler takes the same path), so until
// then an alias host is only a CANDIDATE (isAliasCandidate): a host that is no root-domain host,
// no IP and no localhost form.
//
// dms-server mirrors this in src/utils/subdomain.js (hand mirror; dms-server
// never imports the client package). Keep the two in step.
// See planning/tasks/current/tenant-external-domains.md (Phases A and B).

let ROOT_DOMAIN = '';
// verified alias domain → tenant subdomain; tenant subdomain → primary domain ('' = its default domain)
let ALIASES = new Map();
let PRIMARY = new Map();

const normalizeDomain = (d) => `${d || ''}`.trim().toLowerCase().replace(/^\.+|\.+$/g, '').split(':')[0];

export function setRootDomain(domain) {
    ROOT_DOMAIN = normalizeDomain(domain);
}

export function getRootDomain() {
    return ROOT_DOMAIN;
}

const blankWww = (label) => (label === 'www' ? '' : label);

// The alias status that serves. Anything else (pending, failed) is shown to the tenant, never served.
export const ALIAS_VERIFIED = 'verified';

// Register the tenants' domains from the platform root site's tenant rows
// ({ subdomain, aliases: [{ domain, status }], primary }). Only verified aliases serve.
export function setDomainAliases(tenants = []) {
    const aliases = new Map(), primary = new Map();
    for (const t of tenants || []) {
        const sub = `${t?.subdomain || ''}`.toLowerCase();
        if (!sub) continue;
        const list = Array.isArray(t.aliases) ? t.aliases : [];
        for (const a of list) {
            const d = normalizeDomain(a?.domain);
            if (d && a?.status === ALIAS_VERIFIED && !aliases.has(d)) aliases.set(d, sub);
        }
        const p = normalizeDomain(t.primary);
        if (p && aliases.get(p) === sub) primary.set(sub, p);
    }
    ALIASES = aliases;
    PRIMARY = primary;
}

export function getDomainAliases() {
    return ALIASES;
}

// The tenant's primary domain, '' when it is the default domain (<tenant>.<root>).
export function primaryDomainOf(tenant) {
    return PRIMARY.get(`${tenant || ''}`.toLowerCase()) || '';
}

const splitHost = (host) => {
    const raw = `${host}`.toLowerCase();
    const colon = raw.indexOf(':');
    return colon === -1 ? [raw, ''] : [raw.slice(0, colon), raw.slice(colon)];
};

// The longest registered alias `hostname` is, or ends with.
function matchAlias(hostname, aliases) {
    let best = '';
    for (const d of aliases.keys()) {
        if ((hostname === d || hostname.endsWith(`.${d}`)) && d.length > best.length) best = d;
    }
    return best;
}

// null when no root domain is set, or the host is neither under it nor a registered alias.
export function resolveHost(host, rootDomain = ROOT_DOMAIN, aliases = ALIASES) {
    const root = normalizeDomain(rootDomain);
    if (!root || !host) return null;
    const [hostname, port] = splitHost(host);
    let labels;
    if (hostname === root) labels = [];
    else if (hostname.endsWith(`.${root}`)) labels = hostname.slice(0, -(root.length + 1)).split('.');
    else {
        const alias = aliases && aliases.size ? matchAlias(hostname, aliases) : '';
        if (!alias) return null;
        const patternSubdomain = blankWww(hostname === alias ? '' : hostname.slice(0, -(alias.length + 1)));
        return { tenant: aliases.get(alias), patternSubdomain, tenantHost: `${alias}${port}`, alias };
    }
    const tenant = blankWww(labels.length ? labels[labels.length - 1] : '');
    const patternSubdomain = tenant ? blankWww(labels.slice(0, -1).join('.')) : '';
    return { tenant, patternSubdomain, tenantHost: `${tenant ? `${tenant}.` : ''}${root}${port}` };
}

// A host that may be a tenant's domain alias: a root domain is set, and the host is no
// root-domain host, no IP and no localhost form. Whether it IS one is known only once the
// alias map is registered (resolveHost then answers, or doesn't).
export function isAliasCandidate(host, rootDomain = ROOT_DOMAIN) {
    const root = normalizeDomain(rootDomain);
    if (!root || !host) return false;
    const [hostname] = splitHost(host);
    if (!hostname.includes('.') || hostname === root || hostname.endsWith(`.${root}`)) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (/^[\d.]+$/.test(hostname) || hostname.includes('[')) return false;
    return true;
}

// A domain as typed ("https://DevMNY.org/x") → as stored ("devmny.org").
export function normalizeAliasDomain(input) {
    return `${input || ''}`.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0].replace(/\.+$/, '');
}

// Why `domain` can't be added as an alias, or '' when it can. The server checks the same
// (dms-server routes/domains.js, hand mirror), plus that no other tenant has it.
export function aliasDomainProblem(domain, rootDomain = ROOT_DOMAIN) {
    const d = normalizeAliasDomain(domain);
    const root = normalizeDomain(rootDomain);
    if (!d) return 'Enter a domain.';
    if (d.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d)) return 'Not a valid domain name.';
    if (/^[\d.]+$/.test(d)) return 'An IP address is not a domain.';
    if (d.startsWith('www.')) return 'Add the domain without www.';
    if (root && (d === root || d.endsWith(`.${root}`))) return `Domains under ${root} are the hub's own.`;
    if (d === 'localhost' || d.endsWith('.localhost')) return 'Not a public domain.';
    return '';
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
