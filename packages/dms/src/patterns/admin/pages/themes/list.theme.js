// Ported to tessera's var(--t-*) tokens (2026-09-19) from the design-system
// mockup src/themes/tessera/design_system_v6/pages/admin-themes.html — the
// first v6 design this page ever had (previously hardcoded
// blue-100/slate-200/gray-700 literals, zero theming). AdminLayout always
// uses the hardcoded "default" theme (patterns/admin/siteConfig.jsx), so
// this is what every project sees for the Themes list.
export const themeListTheme = {
    wrapper: 'flex flex-col w-full gap-3',
    // Title on its own row, then a toolbar row (search + add button) below —
    // matches patterns/admin/pages/editSite.jsx's "Sites" page (the REAL
    // live admin root page — patterns/admin/components/patternList.jsx is a
    // separate, unused/dead component that looks similar but is never
    // actually rendered by any route; don't use it as a reference). Token
    // values below are copied verbatim from editSite.theme.js's
    // identityWrapper/toolbarRow/searchWrapper so the two
    // pages are pixel-consistent, not just similarly-shaped (2026-09-19).
    header: 'flex flex-col gap-3 pb-3 border-b border-[var(--t-rule)]',
    headerTitle: 't-displayMD text-[var(--t-ink)]',
    toolbar: 'flex items-center gap-3',
    searchWrapper: 'flex flex-1 items-center gap-2.5 border border-[var(--t-rule-strong)] rounded-md px-3.5 h-8 bg-[var(--t-panel)] text-[var(--t-graphite)] focus-within:border-[var(--t-ink)]',
    searchIcon: 'w-4 h-4 flex-none',
    // the search field itself is UI.Input activeStyle 'bare' (Input is locked, 2026-10-14)
    iconSm: 'size-4',

    tableWrapper: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    // Same look as editSite.theme.js's patternName, so a theme's name reads
    // with the same weight/color as a pattern's name on the Sites page.
    themeName: 't-proseSM font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',

    modalTitle: 't-displaySM text-[var(--t-ink)]',
    modalForm: 'flex flex-col gap-3',
    modalActions: 'w-full flex items-center gap-2 pt-1',
    modalEditActions: 'w-full flex items-center gap-2 pt-1',

    // Table cell actions — same plain icon-button look as editSite.theme.js's
    // cellActions/editLink/duplicateBtn (no pill/border), so the two list
    // pages' row actions read identically.
    cellActions: 'flex items-center justify-end gap-1 w-full h-full py-1 text-[var(--t-pencil)]',
    editLink: 'inline-flex items-center justify-center gap-1.5 rounded-md border whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    iconMd: 'size-4',
    iconLabel: 'hidden',
    settingsLink: 'inline-flex items-center justify-center gap-1.5 rounded-md border whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',

    noAccess: 'flex items-center justify-center h-48 t-proseSM text-[var(--t-pencil)]',
}
