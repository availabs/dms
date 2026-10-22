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
    // settings link, beside the toolbar's UI.Button 'iconTool' buttons (sort, show all, uploads)
    settingsLink: 'size-8 inline-flex items-center justify-center rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]',
    toolbarDivider: 'w-px h-6 bg-[var(--t-rule)] mx-1',

    // view switcher
    viewSwitcher: 'inline-flex items-center gap-0.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] p-0.5',
    viewBtnIcon: 'size-4',
    // ink controls (owner 2026-10-14: "turn it into ink"; were cobalt) — the primary matches UI.Button 'primary'
    newBtn: 'h-8 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-md border border-[var(--t-ink)] t-proseSM font-medium text-[var(--t-paper)] bg-[var(--t-ink)] hover:bg-[var(--t-graphite)] hover:border-[var(--t-graphite)] whitespace-nowrap',
    newBtnIcon: 'Plus',
    newBtnText: 'new source',

    // body + rail
    body: 'flex-1 min-h-0 flex flex-row gap-6 pl-6 lg:pl-12 pr-6 lg:pr-8 pt-6',
    sidebar: 'hidden md:flex w-56 flex-none flex-col gap-0.5 h-full overflow-y-auto pb-6',
    sidebarItem: 'flex items-center gap-2 px-2 py-1.5 rounded-md t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    sidebarItemActive: 'flex items-center gap-2 px-2 py-1.5 rounded-md t-proseSM font-medium bg-[var(--t-well)] text-[var(--t-ink)]',
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
    // authority facet (authoritative · keyed · undecided) — rows reuse sidebarItem / sidebarItemActive /
    // sidebarBadge; '' sidebarFacetGroup → facet not rendered
    sidebarFacetGroup: 'mt-3 pt-2 border-t border-[var(--t-rule)]',
    sidebarFacetLabel: 'px-2 pb-1 t-metaXS text-[var(--t-pencil)]',
    sidebarFacetMark: 'w-3 shrink-0 text-center t-metaXS text-[var(--t-go)]',
    sidebarFacetBadgeUndecided: 'ml-auto shrink-0 t-metaXS tabular-nums text-[var(--t-amber)]',
    sidebarSubItem: 'flex items-center ml-3 pl-4 pr-2 py-1 border-l border-[var(--t-rule)] t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    sidebarSubItemActive: 'flex items-center ml-3 pl-4 pr-2 py-1 border-l-2 border-[var(--t-ink)] t-proseXS font-medium text-[var(--t-ink)]',

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
    // authority (2026-10-21, datasets-catalog-authority-and-archive-visibility.md) — the source Overview's
    // verAuthBadge look: ★ <view label> · ★ N keyed. Undecided sources stay blank (owner 2026-10-21);
    // a theme that wants a chip sets authUndecidedChip (e.g. the Overview's verUndecidedChip classes).
    authChip: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] rounded px-1.5 py-0.5 whitespace-nowrap',
    authUndecidedChip: '',
    supersededLine: 't-proseXS text-[var(--t-amber)] mt-0.5',
    supersededLink: 'text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]',
    cardTitle: 'block t-displaySM text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    cardDescription: 'mt-1 t-proseSM text-[var(--t-graphite)] line-clamp-2',
    cardView: 'self-start shrink-0 mt-3 t-metaXS text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]',

    // table
    tableWrap: 'flex-1 min-w-0 rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] self-start overflow-hidden',   // UI.Table scrolls inside
    // table view — UI.Table named style + per-column px widths (2026-10-14, ui-control-tables.md)
    tableStyle: 'list',
    columnSizes: { type: 150, authority: 190 },
    tdName: 'font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    descCell: 'text-[var(--t-graphite)] truncate',
    tableCatWrap: 'flex flex-wrap items-center gap-x-3 gap-y-1',
    tableCatItem: 'inline-flex items-center gap-1.5 t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    tableCatDot: 'size-1.5 rounded-full',

    // signed-in search hits in a hidden lifecycle — their own labelled group under the results.
    // hiddenMatchWrap spans the grid (it sits inside sourceGrid / sourceStack); hiddenMatchColumn holds the
    // table or the empty state plus the group, only while the group shows. '' hiddenMatchWrap → no group.
    hiddenMatchColumn: 'flex-1 min-w-0 h-full overflow-y-auto pb-6 pr-1 space-y-4',
    hiddenMatchWrap: 'col-span-full mt-2 pt-3 border-t border-dashed border-[var(--t-rule-strong)]',
    hiddenMatchHeader: 'flex items-center gap-2 mb-2 t-metaXS text-[var(--t-pencil)]',
    hiddenMatchIcon: 'EyeClosed',
    hiddenMatchIconClass: 'size-3 shrink-0',
    hiddenMatchNote: 'ml-auto',
    hiddenMatchList: 'flex flex-col gap-2',
    hiddenMatchRow: 'flex items-start gap-4 bg-[var(--t-paper)] border border-dashed border-[var(--t-rule-strong)] rounded-lg px-4 py-3',
    hiddenMatchMain: 'flex-1 min-w-0',
    hiddenMatchBadges: 'flex flex-wrap items-center gap-1.5 mb-1',
    lifecycleChip: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-pencil)] border border-[var(--t-rule)] rounded px-1.5 py-0.5',
    lifecycleChipIcon: 'EyeClosed',
    lifecycleChipIconClass: 'size-3 shrink-0',
    hiddenMatchTitle: 't-proseSM font-medium text-[var(--t-graphite)] hover:text-[var(--t-cobalt)]',
    hiddenMatchDescription: 't-proseXS text-[var(--t-pencil)] mt-0.5 line-clamp-1',
    hiddenMatchView: 'shrink-0 mt-1 t-metaXS text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]',

    // empty state — no sources in this view, or a search with no hits
    emptyWrap: 'flex-1 min-w-0 self-start flex flex-col items-center text-center border border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-12',
    emptyIcon: 'Search',
    emptyIconClass: 'size-6 text-[var(--t-pencil)]',
    emptyTitle: 't-displaySM text-[var(--t-ink)] mt-3',
    emptyText: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[60ch]',
    emptyLink: 'text-[var(--t-cobalt)] underline underline-offset-2',
}
