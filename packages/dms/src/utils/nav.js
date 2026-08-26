// Shared nav-item shaping — turns authored nav entries (page dataItems or a
// theme's navOptions.*.navItems) into the {name, path, icon, className,
// subMenus} shape SideNav/TopNav render. Lives in utils/ so every pattern can
// consume it (cross-pattern imports are forbidden); the page pattern binds its
// section-aware in-page rail via `getInPageMenuItems`, other patterns take the
// default (no in-page children).

import { resolveSubdomainPath } from './subdomainPath';

// An already-absolute destination (a resolved `sub://` cross-subdomain link, or an
// author-supplied http(s)/protocol-relative URL) must NOT be treated as a slug
// relative to the pattern's baseUrl. react-router's Link handles the rest: it
// compares origins and renders a plain anchor for a different one, so a nav item
// pointing at another product's subdomain does a normal full page navigation.
export const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

// `rootPath` items resolve to a FULL URL on the viewer's own origin (owner call
// 2026-08-26: cross-pattern nav links must be absolute, not relative) — the
// destination is another pattern's document, so the link leaves the SPA as a
// normal page load and stays subdomain-correct (a county subdomain links into
// its own county plan). SSR renders the bare root path; hydration upgrades it.
const toRootUrl = (slugOrPath) => {
    const path = `/${`${slugOrPath}`.replace(/^\//, '')}`;
    return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
};

export function getChildNav(item, dataItems, baseUrl = '', edit, getInPageMenuItems = () => []) {
    let children = dataItems
        .filter(d => item.id && d.parent === item.id)
        .sort((a, b) => a.index - b.index)

    let inPageChildren = getInPageMenuItems(item) || [];
    if (children.length === 0 && inPageChildren?.length === 0) return false
    if (children.length === 0 && inPageChildren?.length !== 0) return inPageChildren;

    const childrenToReturn = children
        .filter(d => !d?.hide_in_nav)
        .map((d, i) => {
        let item = {
            id: d.id,
            // `rootPath` (authored navItems only): the destination is another
            // pattern's page (e.g. a county-plan page shown in a sibling
            // pattern's secondary nav) — resolved to a full URL on the viewer's
            // origin (see toRootUrl); no baseUrl, no /edit prefix.
            path: d.rootPath
                ? toRootUrl(d.url_slug || d.id)
                : `${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`,
            name: d.title,
            description: d.description,
            hideInNav: d.hide_in_nav
        }
        if(d?.icon && d?.icon !== 'none') {
                item.icon = d.icon
        }
        const childrenForD = getChildNav(d, dataItems, baseUrl, edit, getInPageMenuItems) || [];
        item.subMenus = childrenForD.filter(d => d.name)

        return item
    })

    return childrenToReturn?.length ? childrenToReturn : inPageChildren;
}

export function dataItemsNav(dataItems, baseUrl = '', edit = false, getInPageMenuItems = () => []) {
    // console.log('dataItemsnav', dataItems)
    return dataItems
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent)
        .filter(d => (edit || d.published !== 'draft' ))
        .map((d, i) => {
            // Author-shaped label / section-divider row (e.g. a secondary-nav
            // section header): rendered with a custom className and NO link.
            // Carries no url_slug/path, so don't synthesize a navigable path.
            if (d.noLink || d.type === 'label') {
                const label = {
                    id: d.id,
                    name: `${d.title || d.name || ''}`.trim(),
                    className: d.className,
                    sectionClass: d.sectionClass,
                    hideInNav: d.hide_in_nav,
                }
                if (d?.icon && d?.icon !== 'none') label.icon = d.icon
                return label
            }
            const url = resolveSubdomainPath(`${d.url_slug || d.path || d.id}`);
            let item = {
                id: d.id,
                // Absolute destinations leave the app, so they take neither the baseUrl
                // nor the /edit prefix — they are already a complete URL. `rootPath`
                // (authored navItems only) marks another pattern's page — resolved to
                // a full URL on the viewer's origin (see toRootUrl).
                path: ABSOLUTE_URL.test(url)
                    ? url
                    : d.rootPath
                        ? toRootUrl(url)
                        : `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`,
                name: `${d.title || d.name} ${d.published === 'draft' ? '*' : ''}`,
                description: d.description,
                hideInNav: d.hide_in_nav
            }
            if(d?.icon && d?.icon !== 'none') {
                item.icon = d.icon
            }
            // BC passthrough: author-supplied styling for a link row (the design's
            // icon+label rows). Standard page dataItems set neither, so unaffected.
            if (d.className) item.className = d.className
            if (d.sectionClass) item.sectionClass = d.sectionClass

            if (getChildNav(item, dataItems, baseUrl, edit, getInPageMenuItems)) {
                item.subMenus = getChildNav(d, dataItems, baseUrl, edit, getInPageMenuItems).filter(d => d.name)
            }

            return item
        })
    //return dataItems
}
