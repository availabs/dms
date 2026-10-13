// Default DatasetsList (catalog) theme — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-catalog.html
// (task: src/dms/planning/tasks/current/datasets-page-pattern-v6-port.md).
// A site theme overrides via `datasets.datasetsList`. Project themes keep their pre-v6 look
// through src/themes/_legacy/datasets.js (`withLegacyDatasets`), so only a site with no theme
// sees these values.
//
// `categorySwatches` is the palette top-level categories hash into (rail dots + card pills).
// Keys that hold icon names (`newBtnIcon`, `sidebarHiddenIcon`, `emptyIcon`) name icons in the
// library registry. An empty `toolbarDivider` / `emptyWrap` / `sidebarHiddenIcon` means "don't
// render that piece".
export const datasetsListTheme = {
    categorySwatches: ['#0A46D8', '#B97516', '#1F8A4C', '#CA3214', '#50545C', '#6B4FBB', '#0F7C8C', '#9C3B6E'],

    // The catalog is viewport-tall at every width: header + toolbar stay put and the rail and the
    // results scroll on their own (owner 2026-10-06).
    pageWrapper: 'w-full flex flex-col h-svh',
    iconMd: 'size-4',

    // header band: count line + toolbar
    header: 'w-full flex-none border-b border-[var(--t-rule)] pl-6 lg:pl-12 pr-6 lg:pr-8 py-3 flex flex-col gap-3',
    count: 't-metaSM text-[var(--t-pencil)]',
    toolbar: 'flex flex-wrap items-center gap-2',
    toolbarSearch: 'flex-1 min-w-[220px]',
    // plain toolbar buttons (sort, show all, uploads) — passed to the shared Button as className
    toolbarBtn: 'size-8 inline-flex items-center justify-center rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
    toolbarBtnActive: 'size-8 inline-flex items-center justify-center rounded-md border border-[var(--t-cobalt-line)] bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)] cursor-pointer',
    settingsLink: 'size-8 inline-flex items-center justify-center rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]',
    toolbarDivider: 'w-px h-6 bg-[var(--t-rule)] mx-1',

    // view switcher
    viewSwitcher: 'inline-flex items-center gap-0.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] p-0.5',
    viewBtn: 'w-8 h-7 inline-flex items-center justify-center rounded text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer',
    viewBtnActive: 'w-8 h-7 inline-flex items-center justify-center rounded bg-[var(--t-ink)] text-[var(--t-paper)] cursor-pointer',
    viewBtnIcon: 'size-4',
    newBtn: 'h-8 inline-flex items-center gap-1.5 px-3.5 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)]',
    newBtnIcon: 'Plus',
    newBtnText: 'new source',

    // body + rail
    body: 'flex-1 min-h-0 flex flex-row gap-6 pl-6 lg:pl-12 pr-6 lg:pr-8 pt-6',
    sidebar: 'hidden md:flex w-56 flex-none flex-col gap-0.5 h-full overflow-y-auto pb-6',
    sidebarItem: 'flex items-center gap-2 px-2 py-1.5 rounded-md t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    sidebarItemActive: 'flex items-center gap-2 px-2 py-1.5 rounded-md t-proseSM font-medium bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',
    sidebarItemText: 'flex-1 min-w-0 truncate flex items-center gap-2',
    sidebarDot: 'size-2 rounded-full shrink-0',
    sidebarBadge: 'ml-auto shrink-0 t-metaXS tabular-nums text-[var(--t-pencil)]',
    // Hidden lifecycle buckets (Sandbox, Archive, Data Processing, …) — last in the rail,
    // set off by a dashed rule: a back door, not part of the catalog's browse structure.
    sidebarHiddenGroup: 'mt-3 pt-2 border-t border-dashed border-[var(--t-rule-strong)]',
    sidebarHiddenLabel: 'px-2 pb-1 t-metaXS text-[var(--t-pencil)]',
    sidebarItemHidden: 'flex items-center gap-2 px-2 py-1.5 rounded-md t-proseSM text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    sidebarHiddenIcon: 'EyeClosed',
    sidebarHiddenIconClass: 'size-3.5 shrink-0',
    sidebarSubItem: 'flex items-center ml-3 pl-4 pr-2 py-1 border-l border-[var(--t-rule)] t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    sidebarSubItemActive: 'flex items-center ml-3 pl-4 pr-2 py-1 border-l-2 border-[var(--t-cobalt)] t-proseXS font-medium text-[var(--t-cobalt)]',

    // card grid / stack
    sourceGrid: 'flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-4 content-start h-full overflow-y-auto pb-6 pr-1',
    sourceStack: 'flex-1 min-w-0 flex flex-col gap-3 h-full overflow-y-auto pb-6 pr-1',

    // card
    card: 'group relative flex flex-col rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 hover:border-[var(--t-rule-strong)] hover:shadow-[var(--t-shadow-lift)] transition',
    cardFull: 'group relative flex items-start gap-4 rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 hover:border-[var(--t-rule-strong)] hover:shadow-[var(--t-shadow-lift)] transition',
    cardFullMain: 'flex-1 min-w-0',
    cardBadges: 'flex items-center flex-wrap gap-1.5 mb-2',
    typeBadge: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded px-1.5 py-0.5',
    typeBadgeIcon: 'size-3',
    categoryPill: 'inline-flex items-center gap-1 t-proseXS text-[var(--t-ink)] bg-[var(--t-well)] hover:bg-[var(--t-rule)] rounded px-1.5 py-0.5',
    categoryDot: 'size-1.5 rounded-full',
    subCategoryPill: 'inline-flex items-center t-proseXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded px-1.5 py-0.5 hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]',
    cardTitle: 'block t-displaySM text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    cardDescription: 'mt-1 t-proseSM text-[var(--t-graphite)] line-clamp-2',
    cardView: 'self-start shrink-0 mt-3 t-metaXS text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]',

    // table
    tableWrap: 'flex-1 min-w-0 rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] self-start max-h-[calc(100%-1.5rem)] overflow-auto',
    table: 'w-full text-left border-collapse',
    theadRow: 'bg-[var(--t-well)] border-b border-[var(--t-rule)]',
    th: 'px-3 py-2 t-metaXS text-[var(--t-pencil)] font-medium sticky top-0 z-[1] bg-[var(--t-well)]',
    tr: 'border-b border-[var(--t-rule)] last:border-0 hover:bg-[var(--t-well)]',
    td: 'px-3 py-2.5 t-proseSM align-top',
    tdName: 'font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    tdMuted: 'px-3 py-2.5 t-proseSM text-[var(--t-graphite)] align-top max-w-[40ch] truncate',
    tableCatWrap: 'flex flex-wrap items-center gap-x-3 gap-y-1',
    tableCatItem: 'inline-flex items-center gap-1.5 t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    tableCatDot: 'size-1.5 rounded-full',

    // empty state — no sources in this view, or a search with no hits
    emptyWrap: 'flex-1 min-w-0 self-start flex flex-col items-center text-center border border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-12',
    emptyIcon: 'Search',
    emptyIconClass: 'size-6 text-[var(--t-pencil)]',
    emptyTitle: 't-displaySM text-[var(--t-ink)] mt-3',
    emptyText: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[60ch]',
    emptyLink: 'text-[var(--t-cobalt)] underline underline-offset-2',
}
