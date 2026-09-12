// Mount-aware resolution for SITE-ABSOLUTE authored links.
//
// A pattern can be served at more than one location (`locations` — see
// render/spa/utils/index.js `getPatternMounts`). Nav items already follow the
// mount, because dataItemsNav composes them from the mount's `baseUrl`. Authored
// link VALUES do not: a lexical ButtonNode hands its `path` straight to
// `navigate()`, and a table/Card `isLink` column hands its cell value straight to
// `<Link to>`. So a page authored with `/congestion_v2` works on the pattern's
// primary `/` mount and 404s on a `/tsmo` mount.
//
// Authored site-absolute links inside a page pattern mean "this pattern's page",
// so the fix is to resolve them against the CURRENT MOUNT's baseUrl. Two values
// must be left alone:
//
//   1. paths that belong to ANOTHER pattern (`/datasources/source/2039`,
//      `/docs/npmrds/overview`, `/auth/login`) — `siteRootPaths` carries every
//      pattern mount's first path segment, and a match means "not ours".
//      This also covers a pattern that is itself based at a non-root path and
//      whose authored links repeat that base (`/docs/...` inside npmrds_docs).
//   2. anything already carrying the mount prefix — makes the helper idempotent.
//
// BC: a `/` (or empty) baseUrl returns the input unchanged, which is every mount
// that exists today apart from the Freight Atlas `www:/fa` pair — where these
// links are broken right now and this makes them work.
//
// See planning/tasks/current/mount-aware-absolute-links.md.

// Leading slash, no trailing slash; '' and '/' both normalize to ''.
const normalizeBase = (base) => {
    const trimmed = `${base ?? ''}`.replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
};

// First path segment of a path or base_url, e.g. '/docs/npmrds/x' -> '/docs'.
export const firstSegment = (path) => {
    const seg = `${path ?? ''}`.replace(/^\/+/, '').split(/[/?#]/)[0];
    return seg ? `/${seg}` : '';
};

export function resolveMountPath(path, mountBaseUrl, siteRootPaths = []) {
    const base = normalizeBase(mountBaseUrl);
    if (!base) return path;                                   // primary/root mount — no-op (BC)
    if (typeof path !== 'string' || !path.startsWith('/')) return path; // relative slug, sub://, http(s), ''
    // `//host/path` also starts with '/' but leaves the app — same carve-out as
    // nav.js's ABSOLUTE_URL (and react-router's own), which the scheme check above
    // already covers for `http:` / `sub:`.
    if (path.startsWith('//')) return path;
    if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)) return path; // idempotent
    if (path === '/') return base;                            // the pattern's own home
    if (siteRootPaths.includes(firstSegment(path))) return path;        // another pattern's mount
    return `${base}${path}`;
}

// Every pattern mount's first path segment — the set `resolveMountPath` treats as
// "belongs to another pattern". Built once in pattern2routes from the same mount
// list the router registers, so it cannot drift from the live route table.
export function collectSiteRootPaths(mountBaseUrls) {
    const roots = new Set();
    (mountBaseUrls || []).forEach((base) => {
        const seg = firstSegment(normalizeBase(base));
        if (seg) roots.add(seg);
    });
    return [...roots];
}
