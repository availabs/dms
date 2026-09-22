// Neutral chrome/surfaces ported to tessera's var(--t-*) tokens (2026-09-16) — the
// "container" bug (bg-white/text-gray-* never adapting to dark mode). Status/category
// colors (draft=amber, published/success=emerald, orphan/danger=red, and the
// per-component-type badges purple/blue/teal/green) are left as literal Tailwind
// colors — they're intentional semantic indicators, not container background, and
// read fine as soft accent chips on a dark panel.
export const pagesEditorTheme = {
    wrapper: 'flex flex-col h-full min-h-0',

    // header strip (page title + live/published/depth stat pills) — the mockup's
    // `admin-pattern-pages.html` "header" LayoutGroup, absent from the pre-v6 implementation.
    // No panel background AND no own horizontal/top padding — like `settings.theme.js`'s
    // `header` (Overview tab), this relies entirely on the outer `patternEditor.theme.js`
    // `content` wrapper's `p-5 lg:p-8` gutter, so the title sits flush at the same left edge
    // as every other tab's title instead of getting an extra inset from a second padding layer.
    header: 'flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 mb-1 border-b border-[var(--t-rule)] flex-shrink-0',
    headerTitleWrap: 'min-w-0',
    headerTitleRow: 'flex items-center gap-2.5',
    headerTitle: 't-displayMD text-[var(--t-ink)] truncate',
    headerSubtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
    statsBar: 'flex items-stretch divide-x divide-[var(--t-rule)] border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] overflow-hidden flex-shrink-0 ml-auto',
    statCell: 'px-4 py-1.5',
    statValue: 'text-lg font-semibold tracking-[-0.015em] tabular-nums leading-none text-[var(--t-ink)]',
    statLabel: 't-metaXS text-[var(--t-pencil)] mt-0.5',

    // toolbar: two rows, matching the mockup — row 1 is search (grows) + the primary "add page"
    // action sitting right next to it; row 2 is the lens/quick-filter chips + scope + secondary
    // controls. Same flush-left reasoning as `header` above — no own horizontal padding.
    toolbar: 'flex flex-col gap-2.5 pt-3 pb-3 border-b border-[var(--t-rule)] flex-shrink-0',
    toolbarRow1: 'flex items-center gap-3',
    toolbarRow2: 'flex items-center gap-2 flex-wrap',
    lensBar: 'flex items-center gap-1.5 flex-wrap',
    lensChip: 'inline-flex items-center gap-1.5 border border-[var(--t-rule)] bg-transparent t-metaXS text-[var(--t-graphite)] rounded-full px-2.5 py-1 cursor-pointer transition-colors hover:border-[var(--t-rule-strong)]',
    lensChipActive: 'inline-flex items-center gap-1.5 border border-transparent bg-[var(--t-cobalt-soft)] t-metaXS text-[var(--t-cobalt)] rounded-full px-2.5 py-1 cursor-pointer',
    lensChipActiveWarn: 'inline-flex items-center gap-1.5 border border-transparent bg-[var(--t-amber-soft)] t-metaXS text-[var(--t-amber)] rounded-full px-2.5 py-1 cursor-pointer',
    lensCount: 't-metaXS font-bold rounded-full px-1.5 bg-[var(--t-well)] text-[var(--t-graphite)]',
    lensCountActive: 't-metaXS font-bold rounded-full px-1.5 bg-[var(--t-panel)] text-inherit',
    divider: 'w-px h-5 bg-[var(--t-rule)] mx-0.5',
    filterSelect: 't-metaXS text-[var(--t-graphite)] bg-[var(--t-panel)] border border-[var(--t-rule)] rounded px-2 py-1 pr-6 appearance-none cursor-pointer focus:outline-none focus:border-[var(--t-rule-strong)] hover:border-[var(--t-rule-strong)]',
    filterSelectActive: 't-metaXS text-[var(--t-ink)] bg-[var(--t-cobalt-soft)] border border-[var(--t-cobalt-line)] rounded px-2 py-1 pr-6 appearance-none cursor-pointer focus:outline-none font-semibold',
    filterWrap: 'relative',
    filterCaret: 'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--t-pencil)] text-[9px]',
    searchWrap: 'relative flex-1',
    searchInput: 'border border-[var(--t-rule-strong)] rounded-md t-proseSM bg-[var(--t-panel)] text-[var(--t-ink)] pl-7 pr-3 py-1.5 w-full outline-none focus:border-[var(--t-cobalt)]',
    searchIcon: 'absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t-pencil)] pointer-events-none',
    scopeSeg: 'inline-flex bg-[var(--t-well)] border border-[var(--t-rule)] rounded-md p-0.5',
    scopeBtn: 'border-none bg-transparent rounded-md px-3 py-1 t-metaXS text-[var(--t-pencil)] cursor-pointer',
    scopeBtnActive: 'border-none bg-[var(--t-panel)] rounded-md px-3 py-1 t-metaXS text-[var(--t-ink)] shadow-[var(--t-shadow-lift)] cursor-pointer',
    ghostBtn: 't-metaXS text-[var(--t-graphite)] px-2.5 py-1 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] cursor-pointer hover:bg-[var(--t-well)] hover:border-[var(--t-rule-strong)]',
    clearFiltersBtn: 't-metaXS text-[var(--t-cobalt)] px-2.5 py-1 rounded-md border border-[var(--t-cobalt-line)] bg-[var(--t-cobalt-soft)] cursor-pointer hover:opacity-80',
    addBtn: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer border-none',
    tableWrap: 'flex-1 min-h-0 overflow-hidden',
    loadingWrap: 'flex items-center justify-center h-32 text-[var(--t-pencil)] t-proseSM',
    footer: 'px-4 py-2 border-t border-[var(--t-rule)] bg-[var(--t-well)] t-metaXS text-[var(--t-pencil)] flex-shrink-0',
    footerInline: 't-metaXS text-[var(--t-pencil)]',

    // page-level action icons (Edit/View) shown inline before the "⋯" overflow menu —
    // same icon-button convention as Permissions.theme.js's removeBtn.
    rowIconBtn: 'w-fit p-1 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] transition-colors duration-150',

    // sections panel (openOut below row)
    sectionsPanel: 'w-full',
    sectionsPanelInner: 'border-l-2 border-[var(--t-rule)] ml-12 my-1',
    sectionsMeta: 'flex items-center gap-2.5 px-3 py-1.5 border-b border-[var(--t-rule)] text-[10px] text-[var(--t-pencil)] font-semibold tracking-widest uppercase flex-wrap',
    sectionsMetaCount: 'text-[11px] text-[var(--t-pencil)] font-normal tracking-normal',
    sectionsScroll: 'max-h-[360px] overflow-y-auto',
    sectionRow: 'grid gap-3 px-3 py-1.5 items-center text-[12px] text-[var(--t-graphite)] border-b border-[var(--t-rule)] hover:bg-[var(--t-well)]',
    sectionRowCols: '1fr 90px 200px 80px 60px 60px',
    sectionTitle: 'font-semibold text-[var(--t-ink)] truncate',
    sectionDerived: 'text-[var(--t-graphite)] truncate',
    sectionEmpty: 'text-[var(--t-pencil)] italic truncate',

    // section group headers
    sectionGroupBlock: '',
    sectionGroupHeaderPublished: 'flex items-center gap-2 px-3 py-1 bg-[var(--t-well)] border-b border-[var(--t-rule)] border-t border-[var(--t-rule)] text-[10px] font-semibold uppercase tracking-widest text-[var(--t-pencil)]',
    sectionGroupHeaderDraft: 'flex items-center gap-2 px-3 py-1 bg-amber-50/60 border-b border-amber-100 border-t border-amber-100 text-[10px] font-semibold uppercase tracking-widest text-amber-600',
    sectionGroupOrphanHeader: 'flex items-center gap-2 px-3 py-1 bg-red-50 border-b border-red-100 border-t border-red-100 text-[10px] font-semibold uppercase tracking-widest text-red-500',
    sectionGroupPosition: 'text-[9px] font-normal normal-case tracking-normal opacity-60',
    sectionGroupCount: 'text-[9px] font-normal normal-case tracking-normal ml-auto opacity-60',
    sectionGroupEmpty: 'px-3 py-2 text-[11px] text-[var(--t-pencil)] italic',
    groupBadgeDraft: 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-700',
    groupBadgePublished: 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200',
    sectionBadgeDraft: 'inline-flex items-center px-1 py-px rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-700 ml-1 flex-shrink-0',
    sectionBadgePublished: 'inline-flex items-center px-1 py-px rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200 ml-1 flex-shrink-0',
    groupRestoreBtn: 'text-[9px] font-semibold px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100',
    groupDeleteBtn: 'text-[9px] font-semibold px-2 py-0.5 rounded border border-red-200 bg-[var(--t-panel)] text-red-600 cursor-pointer hover:bg-red-50',
    groupProcessing: 'text-[9px] text-[var(--t-pencil)] italic',
    badgeBase: 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
    badgeCard: 'bg-purple-50 text-purple-700',
    badgeSpreadsheet: 'bg-blue-50 text-blue-700',
    badgeLexical: 'bg-[var(--t-well)] text-[var(--t-graphite)]',
    badgeMap: 'bg-teal-50 text-teal-700',
    badgeHeader: 'bg-amber-50 text-amber-700',
    badgeFooter: 'bg-amber-50 text-amber-700',
    badgeGraph: 'bg-green-50 text-green-700',
    srcLabel: 'font-mono text-[11px] bg-[var(--t-well)] border border-[var(--t-rule)] px-1.5 py-0.5 rounded text-[var(--t-graphite)] truncate',
    viewChipOk: 'font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--t-well)] text-[var(--t-pencil)] border border-[var(--t-rule)]',
    viewChipStale: 'font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 font-bold cursor-pointer',
    viewChipFresh: 'font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold',
    levelPill: 'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
    levelHidden: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
    levelHeading: 'bg-blue-50 text-blue-700',
    publishBtn: 'text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 border-none',
    publishBtnDisabled: 'text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--t-well)] text-[var(--t-pencil)] border-none cursor-default',
    discardBtn: 'text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--t-panel)] text-amber-700 border border-amber-300 cursor-pointer hover:bg-amber-50',
    deleteBtn: 'text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--t-panel)] text-red-600 border border-red-200 cursor-pointer hover:bg-red-50',
    rowActions: 'flex items-center gap-1 justify-end flex-wrap',
    actionsMenuBtn: 'text-[15px] font-bold text-[var(--t-pencil)] px-2 py-0.5 rounded hover:bg-[var(--t-well)] hover:text-[var(--t-graphite)] cursor-pointer border-none bg-transparent leading-none select-none',
    actionsMenu: 'bg-[var(--t-panel)] rounded-lg shadow-[var(--t-shadow-drag)] border border-[var(--t-rule)] py-1 min-w-[140px] text-[12px] z-50',
    actionsMenuItem: 'block w-full text-left px-3 py-1.5 text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer border-none bg-transparent',
    actionsMenuItemDiscard: 'text-amber-700 hover:bg-amber-50',
    actionsMenuItemDelete: 'text-red-600 hover:bg-red-50',
    actionsMenuSep: 'my-1 border-t border-[var(--t-rule)]',

    // delete confirmation modal
    deleteModal: 'p-6 max-w-sm w-full',
    deleteModalTitle: 'text-[15px] font-semibold text-[var(--t-ink)] mb-2',
    deleteModalDesc: 'text-[13px] text-[var(--t-graphite)] mb-1',
    deleteModalHighlight: 'font-semibold text-[var(--t-ink)]',
    deleteModalWarn: 'text-[12px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4',
    deleteModalInfo: 'text-[12px] text-[var(--t-graphite)] mb-4',
    deleteModalFooter: 'flex items-center justify-end gap-2',
    deleteModalConfirmBtn: 'text-[12px] font-semibold px-3 py-1.5 rounded bg-red-600 text-white border-none cursor-pointer hover:bg-red-700',
    deleteModalCancelBtn: 'text-[12px] font-semibold px-3 py-1.5 rounded border border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] cursor-pointer hover:bg-[var(--t-well)]',

    // element preview modal
    previewPanel: 'relative w-full max-w-lg p-0 overflow-hidden',
    previewHeader: 'flex items-start justify-between px-5 pt-5 pb-3 border-b border-[var(--t-rule)]',
    previewTitle: 'font-semibold text-[var(--t-ink)] text-[15px] truncate max-w-xs',
    previewMeta: 'flex items-center gap-2 mt-1 flex-wrap',
    previewBody: 'px-5 py-4 space-y-3',
    previewRow: 'flex items-center gap-2 text-[12px]',
    previewLabel: 'text-[var(--t-pencil)] uppercase tracking-wide text-[10px] font-semibold w-16 flex-shrink-0',
    previewValue: 'text-[var(--t-ink)] truncate',
    previewFooter: 'px-5 py-3 border-t border-[var(--t-rule)] flex items-center justify-end gap-3',
    previewLink: 'text-[11px] text-[var(--t-cobalt)] hover:underline',
}
