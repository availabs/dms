export const sectionGroupTheme = {
    // ── Default section-group scaffold (read at page creation / backfill) ──
    // The layoutGroup style name used for the `content` + `sidebar` groups a new
    // page is seeded with. A brand can override `pages.sectionGroup.defaultStyle`.
    // Unknown style names resolve to layoutGroup style 0, so 'content' is safe on
    // any theme. (Every new page always gets a `sidebar` group so the in-page-nav
    // rail has an author-reachable content area.)
    defaultStyle: 'content',

    // ── Content ↔ rail two-column row (owned by the pages theme, not layoutGroup) ──
    // contentRow wraps [content col][rail] as a flex row inside the band; contentCol
    // takes the remaining width. When the rail is hidden (below xl) the row has a
    // single flex child, so content fills full width — BC for non-rail bands.
    // items-stretch (NOT items-start) is load-bearing: it stretches the rail column
    // to the full band height so its inner `sticky` container has room to pin while
    // you scroll the band. items-start would collapse the column and kill sticky.
    contentRow: 'flex flex-row gap-8 items-stretch',
    contentCol: 'flex-1 min-w-0',

    // ── Rail layout containers (the sticky "on this page" aside) ──
    // container1 = width + responsive visibility (rail hides below xl, content reflows full-width)
    // container2 = sticky positioning + scroll region
    // container3 = vertical stack of rail blocks (the nav card + any sidebar-group sections)
    sideNavContainer1: 'w-[302px] shrink-0 hidden xl:block',
    sideNavContainer2: 'sticky top-[60px] h-[calc(100vh_-_68px)] overflow-y-auto pr-2',
    sideNavContainer3: 'flex flex-col gap-4 h-full',

    // ── In-page nav (InPageNav.jsx) ──
    // Minimal neutral defaults so legacy `item.sidebar` docs pages render ~unchanged
    // (a plain list of jump links, no card, no label). Brands opt into the card look
    // by overriding these keys under their own `pages.sectionGroup`.
    navWrapper:    '',
    navLabelText:  '',                 // e.g. 'On this page' — brand sets the label text
    navLabel:      'text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2',
    navList:       'flex flex-col',
    navItem:       'block w-full text-left text-sm text-slate-500 hover:text-slate-900 py-1 cursor-pointer transition-colors',
    navItemActive: 'block w-full text-left text-sm text-slate-900 font-medium py-1 cursor-pointer',
}
