// PDF Generator section (ExportPdf.jsx), tessera v6, 2026-10-30, from
// design_system_v6/pages/page-pdf-export.html (task: src/dms/planning/tasks/current/pdf-exporter-rework.md).
// Registered as pages.pdfExport. The live component had no theme (inline blue Tailwind), so there is no
// pre-v6 look to freeze: every theme gets this one. Controls (buttons, inputs, select, switch, checkbox)
// are the shared UI primitives with their named styles.
const RULE = 'border-[var(--t-rule)]';
// the draft / hidden-in-nav marks: small text pills, not buttons (owner 2026-11-02)
const CHIP = 'inline-flex items-center flex-none rounded-full px-1.5 text-[10.5px] leading-4';

// Layout B (owner 2026-11-02, design_system_v6/pages/page-pdf-export-b.html): one card. Settings across the
// top, the page list beside "In this PDF", an action bar at the bottom.
export const pdfExportTheme = {
    wrapper: 'flex flex-col gap-4',
    planRow: 'flex flex-wrap items-end gap-3',
    planField: 'w-full max-w-sm',
    planStatic: 't-proseSM text-[var(--t-ink)]',
    planSlug: 't-metaMD text-[var(--t-pencil)] ml-1.5',

    card: `@container flex flex-col min-w-0 bg-[var(--t-panel)] border ${RULE} rounded-lg`,
    cardTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    count: 't-metaXS text-[var(--t-pencil)]',
    sep: 'text-[var(--t-rule-strong)]',

    // settings: cover page · table of contents · export as · file name
    settings: `grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1fr)] gap-x-6 gap-y-4 items-start px-4 py-4 border-b ${RULE}`,
    // a field label with a hint icon beside it (the hint text is its title, shown on hover)
    labelRow: 'flex items-center gap-1 mb-1.5 [&>label]:mb-0',
    help: 'inline-flex cursor-help',
    helpIcon: 'size-3.5 text-[var(--t-pencil)]',
    switchWrap: 'flex items-center h-8',
    seg: 'inline-flex p-0.5 gap-0.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-well)]',
    fileRow: 'flex items-center gap-1',
    fileExt: 't-metaMD text-[var(--t-pencil)]',
    hint: 'block t-proseXS text-[var(--t-pencil)] mt-1',

    // body: the page list (scrolls) beside "In this PDF"
    body: 'grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_340px]',
    pagesPane: 'min-w-0 flex flex-col',
    pagesHead: 'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3',
    filterWrap: 'w-full @md:w-56',
    // select all / clear / expand all / collapse all: one group, so a narrow card wraps it whole
    headActions: 'ml-auto flex flex-none items-center gap-1.5',
    tree: 'px-2 py-2 h-[460px] overflow-auto scrollbar-sm',
    row: 'flex items-center gap-2 h-8 pr-2 rounded-md hover:bg-[var(--t-well)] text-[var(--t-ink)]',
    rowDraft: 'flex items-center gap-2 h-8 pr-2 rounded-md text-[var(--t-pencil)]',
    indentPx: 22,
    chevron: 'inline-flex items-center justify-center size-5 flex-none rounded-sm text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
    chevronIcon: 'size-3.5',
    chevronSpacer: 'size-5 flex-none',
    rowTitle: 'flex-1 min-w-0 truncate t-proseSM text-left cursor-pointer',
    rowTitleDraft: 'flex-1 min-w-0 truncate t-proseSM',
    markDraft: `${CHIP} text-[var(--t-amber)] bg-[var(--t-amber-soft)]`,
    markHidden: `${CHIP} text-[var(--t-pencil)] bg-[var(--t-well)]`,
    treeEmpty: 'px-2 py-6 text-center t-proseSM text-[var(--t-pencil)]',

    outlinePane: `min-w-0 flex flex-col gap-1 px-2 pt-3 border-t @3xl:border-t-0 @3xl:border-l ${RULE} bg-[var(--t-well)]/60 [&>span]:px-2`,
    outline: 'flex flex-col py-1 h-[460px] overflow-auto scrollbar-sm',
    outlineItem: 'flex items-center gap-2 h-7 pr-2 text-[var(--t-ink)]',
    outlineMuted: 'flex items-center gap-2 h-7 pr-2 text-[var(--t-pencil)]',
    outlineIcon: 'size-3.5 flex-none text-[var(--t-pencil)]',
    outlineText: 'flex-1 min-w-0 truncate t-proseSM',
    outlineEmpty: 'px-2 t-proseSM text-[var(--t-pencil)]',
    outlinePadPx: 8,
    outlineIndentPx: 18,

    // the action bar: summary + Export, or the export's progress / result (message above its buttons)
    bar: `border-t ${RULE} px-4 py-3 bg-[var(--t-well)] rounded-b-lg`,
    barIdle: 'flex flex-wrap items-center gap-3',
    barStack: 'flex flex-col gap-3',
    summary: 'block t-proseSM text-[var(--t-ink)] truncate',
    paper: 'block t-metaXS text-[var(--t-pencil)]',
    statusRow: 'flex items-start gap-3',
    statusIcon: 'size-4 mt-0.5 flex-none',
    statusGo: 'text-[var(--t-go)]',
    statusBrick: 'text-[var(--t-brick)]',
    statusAmber: 'text-[var(--t-amber)]',
    statusBody: 'flex-1 min-w-0',
    statusTitle: 'block t-proseSM text-[var(--t-ink)] break-words',
    statusText: 'block t-proseXS text-[var(--t-graphite)]',
    statusActions: 'flex flex-wrap items-center justify-end gap-2',
    spinner: 'inline-block size-4 mt-0.5 flex-none rounded-full border-2 border-[var(--t-pencil)] border-t-transparent animate-spin',
    elapsed: 't-metaMD text-[var(--t-pencil)] mr-1',
    progressTrack: 'block h-1 rounded-full bg-[var(--t-panel)] mt-2 overflow-hidden',
    progressBar: 'block h-full bg-[var(--t-ink)] rounded-full transition-[width] duration-500',
    skippedList: 'mt-2 t-proseXS text-[var(--t-graphite)] list-disc pl-5 max-h-32 overflow-auto',

    empty: 'flex flex-col items-center text-center border border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-10',
    emptyTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    emptyText: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[52ch]',
    emptyAction: 'mt-4',
};
