export const patternEditorTheme = {
    // PatternEditor layout. `content` used to carry its own
    // `bg-[var(--t-panel)]` (a leftover fix for when this page sat inside
    // SectionGroup's white card and stayed light in dark mode even after
    // that outer card got themed) — now that the pattern-editor route uses
    // `<SectionGroup card={false} padding="p-0">` (siteConfig.jsx, matching
    // design_system_v6's pattern pages, which sit directly on the page
    // background with no outer card), that background just repainted the
    // SAME unwanted white box one level down. Padding moves here instead of
    // living on SectionGroup, so the breadcrumb bar above stays flush/full-
    // bleed like the Sites page's own AdminBreadcrumb, while the actual page
    // content still gets a gutter (2026-09-20).
    wrapper: 'h-full flex flex-col w-full',
    noAccess: 'flex items-center justify-center h-48 text-sm text-[var(--t-pencil)]',
    content: 'flex-1 flex flex-col p-5 lg:p-8',

    // Breadcrumbs — `admin / <pattern name> / <tab>`, matching
    // design_system_v6/pages/admin-pattern-overview.html's header trail and
    // siteConfig.jsx's own AdminBreadcrumb (same keys/shapes) rather than the
    // old OL/LI + SVG-triangle-separator markup this replaced (2026-09-20).
    breadcrumbBar: 'h-14 flex-none border-b border-[var(--t-rule)] flex items-center gap-3 px-5 lg:px-8 min-w-0',
    breadcrumbHomeLink: 't-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    breadcrumbLink: 't-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)] truncate',
    breadcrumbSep: 't-metaMD text-[var(--t-pencil)]',
    breadcrumbCurrent: 't-metaMD text-[var(--t-cobalt)]',
}
