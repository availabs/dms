// Shared nav-item shaping — turns authored nav entries (page dataItems or a
// theme's navOptions.*.navItems) into the {name, path, icon, className,
// subMenus} shape SideNav/TopNav render. Lives in utils/ so every pattern can
// consume it (cross-pattern imports are forbidden); the page pattern binds its
// section-aware in-page rail via `getInPageMenuItems`, other patterns take the
// default (no in-page children).

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
            path: `${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`,
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
            const url = `${d.url_slug || d.path || d.id}`;
            let item = {
                id: d.id,
                path: `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`,
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
