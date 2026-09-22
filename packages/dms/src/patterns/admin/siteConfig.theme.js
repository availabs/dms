// bg/border ported to tessera's var(--t-*) tokens (2026-09-16) — this card wraps
// every admin page (Sites/Themes/Pattern editor), which always renders under the
// hardcoded "default" theme (patterns/admin/siteConfig.jsx), so a plain `bg-white`
// here stayed light in dark mode while everything around it (nav, table) flipped.
export const sectionGroupTheme = {
    outer: 'h-full flex flex-1 p-1.5',
    inner: 'flex flex-1 w-full flex-col shadow-md bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg relative text-md font-light leading-7 h-full min-h-[calc(100vh_-_102px)]',
    // `card={false}` variant — the Pattern Editor's own pages (Overview,
    // Access, …) build their OWN per-section cards (bg-panel/border-rule)
    // matching design_system_v6/pages/admin-pattern-*.html, which never wrap
    // the whole page in an outer card — that treatment is Sites/Themes'
    // (still `card` above). Reusing `inner`/`outer` for both meant every
    // pattern-editor page sat inside a second, unwanted white card, and the
    // breadcrumb bar's own border-bottom read as an odd full-width line
    // inside that card instead of a plain header-strip divider on the page
    // background (2026-09-20).
    outerPlain: 'h-full flex flex-1',
    innerPlain: 'flex flex-1 w-full flex-col relative text-md font-light leading-7 h-full min-h-[calc(100vh_-_102px)]',
    content: 'h-full flex flex-col w-full',
    defaultPadding: 'p-4',
    defaultMaxWidth: 'max-w-7xl',
}

// "admin / <page>" breadcrumb — rendered by the wrapping Layout in
// siteConfig.jsx (adminConfig), so it's consistent across Sites/Create/
// Themes/ThemeEdit. Same pattern as the auth pattern's manage-page
// breadcrumb (patterns/auth/defaultTheme.js's `manage.breadcrumbBar` etc).
export const adminChromeTheme = {
    breadcrumbBar: 'h-14 flex-none border-b border-[var(--t-rule)] flex items-center gap-3 px-5 lg:px-8',
    breadcrumbHome: 't-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    breadcrumbSep: 't-metaMD text-[var(--t-pencil)]',
    breadcrumbCurrent: 't-metaMD text-[var(--t-cobalt)]',
    breadcrumbViewSite: 'hidden sm:inline-flex items-center gap-1.5 text-sm text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-md px-3 py-1.5 hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]',
}
