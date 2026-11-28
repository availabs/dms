import { resolveSubdomainPath } from "../../../../utils/subdomainPath";
import { ABSOLUTE_URL } from "../../../../utils/nav";

/**
 * Where a view of `slug` should be redirected, or null. A LINK PAGE (`nav_link`, page.format.js) carries no
 * content: it puts a nav entry pointing somewhere else into the page tree. The page pattern's loader hook
 * answers its own URL with this redirect, so a direct visit is a 302 from the server instead of an empty
 * page that redirects once the whole site has loaded in the browser (pages/view.jsx still does that for
 * the cases left alone here).
 *
 * Null, leaving it to the view, when:
 *   - the page restricts who sees it (`authPermissions`): the view shows its no-access message first
 *   - the link is `sub://…` and can't be resolved here (the server has no `window`)
 *   - the link is neither a full URL nor a path from the root (the view resolves it against the route)
 *   - the link points at the page's own URL
 *
 * @param {Array} data - the loader's page rows
 * @param {string} slug - the page slug of the request ('' for the pattern's root page)
 * @param {string} requestUrl - the full URL of the request
 */
export function linkPageTarget(data, slug, requestUrl) {
    const page = slug
        ? (data || []).find(d => d?.url_slug === slug)
        : (data || []).find(d => !d?.parent && d?.index == 0);
    if (!page?.nav_link || page.id === 'no-access' || page.authPermissions) return null;
    const to = resolveSubdomainPath(`${page.nav_link}`);
    if (to.startsWith('sub://')) return null;
    if (!ABSOLUTE_URL.test(to) && !to.startsWith('/')) return null;
    try {
        const from = new URL(requestUrl);
        const dest = new URL(to, from);
        if (dest.origin === from.origin && dest.pathname === from.pathname) return null;
    } catch { return null; }
    return to;
}
