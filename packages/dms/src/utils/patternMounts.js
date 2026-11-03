// Where a pattern is served: its mounts, and which of them answer on a given subdomain. The router
// (render/spa/utils/index.js) registers routes from mountsForSubdomain, and anything that needs to know
// "is this pattern on the site I'm on, and at what path" asks the same function, so the two can't
// drift. Lives in utils/ because patterns import from here, never from render/ or from each other.

const parseLocations = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return []; }
};

/**
 * A pattern's mount list: the primary {subdomain, base_url} pair plus any
 * additional `locations` rows, so one pattern can be served at more than one
 * location (e.g. freightatlas2:/ AND www:/freightatlas). Additive + BC — no
 * `locations` → [primary] → identical single-mount behavior. Invalid rows are
 * dropped and duplicates of an earlier mount (same subdomain + normalized
 * base_url) are deduped so a location echoing the primary can't register the
 * same routes twice. See planning/tasks/current/pattern-multi-location-mounts.md.
 */
// Hosts whose subdomain is treated as the ROOT domain (see the SUBDOMAIN
// normalization in pattern2routes) — location rows use the same aliasing so
// "www" means what authors expect.
export const ROOT_SUBDOMAIN_ALIASES = ['www', 'hazardmitigation'];

export function getPatternMounts(pattern) {
    const normalize = (u) => `/${(u || '').replace(/^\/|\/$/g, '')}`;
    const mounts = [{ subdomain: pattern.subdomain, base_url: pattern.base_url, isPrimary: true }];
    const extra = parseLocations(pattern?.locations) || [];
    (Array.isArray(extra) ? extra : []).forEach(loc => {
        if (!loc || typeof loc !== 'object') return;
        if (loc.base_url === undefined && loc.subdomain === undefined) return;
        mounts.push({ subdomain: loc.subdomain, base_url: loc.base_url });
    });
    const seen = new Set();
    return mounts.filter(m => {
        const key = `${m.subdomain ?? ''}|${normalize(m.base_url)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * The pattern's mounts that answer on `subdomain` (already normalized: '' for the root domain and its
 * aliases), each with its `navPrefix`. The primary mount keeps the pre-existing matching byte-for-byte
 * (BC); location mounts additionally alias root subdomains ("www" ≡ root) so a location like
 * {subdomain: "www", base_url: "/freightatlas"} works as authored.
 *
 * navPrefix: the mount's extra path prefix vs the primary mount, for site-absolute link building
 * (secondary navs that link into sibling patterns mirrored under the same prefix — e.g. primary
 * /freight_data mounted at /fa/freight_data → prefix "/fa", so "/freight_data?cat=…" style links become
 * "/fa/freight_data?…"). Primary mounts and mounts that don't extend the primary base get ''.
 */
export function mountsForSubdomain(pattern, subdomain) {
    return getPatternMounts(pattern).filter(mount => {
        const mountSub = mount.isPrimary || !ROOT_SUBDOMAIN_ALIASES.includes(mount.subdomain)
            ? mount.subdomain
            : '';
        return (!subdomain && !mountSub) || mountSub === subdomain || mountSub === '*';
    }).map(mount => {
        const norm = (u) => `/${(u || '').replace(/^\/|\/$/g, '')}`;
        const primaryBase = norm(pattern.base_url);
        const mountBase = norm(mount.base_url);
        let navPrefix = '';
        if (!mount.isPrimary && mountBase !== primaryBase) {
            if (primaryBase === '/') navPrefix = mountBase === '/' ? '' : mountBase;
            else if (mountBase.endsWith(primaryBase)) navPrefix = mountBase.slice(0, mountBase.length - primaryBase.length);
        }
        return { ...mount, navPrefix };
    });
}
