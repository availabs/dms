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
    // v6 (2026-10-08): the default Layout has no top nav, so the rail pins near the top.
    sideNavContainer2: 'sticky top-6 max-h-[calc(100vh_-_3rem)] overflow-y-auto pr-2 scrollbar-xs',
    sideNavContainer3: 'flex flex-col gap-4 h-full',

    // ── Modal band chrome (`isModal` groups, view mode) ──
    // tessera v6, 2026-10-08 (page-view.html "modal section group"). Pre-v6 values are frozen
    // in src/themes/_legacy/pages.js `sectionGroup`. `modalWidth` is still picked by the
    // group's `modalSize` (a whitelist, because Tailwind only emits literal classes).
    modalOverlay: 'fixed inset-0 z-50 flex items-center justify-center bg-[var(--t-scrim)] p-4',
    modalCard:    'relative w-full bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)] p-4 max-h-[85vh] overflow-y-auto',
    modalClose:   'sticky float-right top-0 -mb-8 z-10 size-8 inline-flex items-center justify-center rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    // The close affordance: an icon-registry glyph, or text when modalCloseIcon is ''.
    modalCloseText: '✕',
    modalCloseIcon: 'XMark',
    modalCloseIconClass: 'size-4',

    // ── Collapsible band chrome (`collapsible` groups, view mode) ──
    // collapseToggle: the corner button of a band whose `showWhenCollapsed` sections stay
    // visible while collapsed. It's absolutely placed, so it sits in the corner of the
    // nearest `relative` band wrapper (every library layoutGroup style has one).
    // collapseHeader: the full-width row (the band's display name + the icon) a band with
    // no such sections shows instead, so a collapsed band still has something to click.
    // The icon points down when open; collapseIconCollapsed turns it while collapsed.
    collapseToggle: 'absolute top-3 right-3 z-10 inline-flex items-center justify-center size-7 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    collapseHeader: 'w-full flex items-center justify-between gap-2 py-2 text-left cursor-pointer',
    collapseHeaderTitle: 'font-medium text-[var(--t-ink)]',
    collapseIcon: 'CaretDown',
    collapseIconClass: 'size-4 transition-transform',
    collapseIconCollapsed: '-rotate-90',

    // ── In-page nav (InPageNav.jsx) ──
    // v6: "on this page" label + a hairline rail; the section in view gets an ink marker
    // (scroll-spy). Pre-v6 (a plain list, no label) is frozen in _legacy/pages.js.
    navWrapper:    '',
    navLabelText:  'On this page',     // '' → no label
    navLabel:      't-metaXS text-[var(--t-pencil)] mb-2',
    navList:       'flex flex-col border-l border-[var(--t-rule)]',
    navItem:       'block w-full text-left -ml-px pl-3 py-1 border-l-2 border-transparent t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer transition-colors',
    navItemActive: 'block w-full text-left -ml-px pl-3 py-1 border-l-2 border-[var(--t-ink)] t-proseSM font-medium text-[var(--t-ink)] cursor-pointer',
}
