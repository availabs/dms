// Runs page (schedule/RunsPage.jsx): the run list (RunsList) and one run (RunDetail). v6 (2026-10-15,
// owner: theme the rest of Runs; spec design_system_v6/pages/datasets-schedule.html, runs + run tabs). The
// Outputs list moved onto UI.Table first (2026-10-14, ui-control-tables.md). Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `runsPage`.
const CARD = 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg';
const EYEBROW = 't-metaXS text-[var(--t-pencil)]';
const LINK = 't-proseSM text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]';   // links in text stay cobalt

export const runsPageTheme = {
    page: 'w-full flex flex-col gap-4',
    // a run's status: UI.Pill kinds ('' statusPill → the frozen span below, project themes)
    statusPill: 'yes',
    statusPillStyles: {
        done: 'status_go', error: 'status_brick', ERROR: 'status_brick', running: 'status_cobalt',
        queued: 'status', SKIPPED_BUSY: 'status_amber', BLOCKED: 'status_amber',
    },
    statusPillDefault: 'status',
    statusRunningDot: 'size-1.5 rounded-full bg-current animate-pulse',   // '' → no dot
    loading: 't-proseSM text-[var(--t-pencil)]',
    link: LINK,

    // ── RunsList ──
    notExternal: `${CARD} px-4 py-3 t-proseSM text-[var(--t-pencil)]`,
    listHeader: 'flex items-center gap-3',
    listTitle: 't-proseSM text-[var(--t-graphite)]',
    listTitleName: 'font-medium text-[var(--t-ink)]',
    listLimit: `ml-1 ${EYEBROW}`,
    manageLink: LINK,
    spacer: 'grow',
    listEmpty: `${CARD} px-4 py-3 t-proseSM text-[var(--t-graphite)]`,
    listTableWrap: `${CARD} overflow-hidden`,
    // the run list — UI.Table named style ('' → the table's default style, striped); cell text classes below
    listTableStyle: 'list',
    runLink: 't-metaMD text-[var(--t-cobalt)] hover:underline',
    cellText: 'text-[var(--t-graphite)]',
    cellMeta: 't-metaMD text-[var(--t-graphite)]',   // '' → the plain text column (duration, progress)
    summaryWrap: '',   // classes on the cell itself (project themes keep theirs there)
    summaryCell: 'block truncate t-proseXS text-[var(--t-graphite)]',

    // ── RunDetail ──
    backRow: 'flex items-center gap-2',
    summaryCard: `${CARD} p-4 flex flex-col gap-2`,
    headRow: 'flex items-center gap-3 flex-wrap',
    runTitle: 't-displaySM text-[var(--t-ink)]',
    workerPath: 't-proseSM text-[var(--t-graphite)] capitalize',
    attempt: EYEBROW,
    rerunButtonStyle: 'primary',   // UI.Button role
    metaRow: 'flex flex-wrap gap-x-5 gap-y-1 t-proseSM text-[var(--t-graphite)]',
    metaLabel: 'text-[var(--t-pencil)]',
    // running progress bar ('' track → none)
    progressTrack: 'h-1.5 rounded-full bg-[var(--t-well)] overflow-hidden',
    progressFill: 'h-full bg-[var(--t-cobalt)]',
    error: 't-proseXS text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded p-2 whitespace-pre-wrap',
    rerunError: 't-proseXS text-[var(--t-brick)]',
    viewLinks: 'flex flex-wrap gap-3',
    sectionCard: `${CARD} p-4`,
    sectionTitle: `${EYEBROW} mb-2`,
    // descriptor: window fields as UI.Pill ('' windowPillStyle → the frozen span)
    descriptorWrap: 'flex flex-col gap-2',
    windowChips: 'flex flex-wrap gap-2',
    windowPillStyle: 'status_cobalt',
    windowChip: '',
    descriptorPre: 't-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded p-3 overflow-auto max-h-72 scrollbar-sm',
    // events timeline
    eventsHeader: 'flex items-center gap-2 mb-2',
    eventsTitle: EYEBROW,
    live: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-cobalt)]',   // activity → cobalt
    liveDot: 'size-1.5 rounded-full bg-[var(--t-cobalt)] animate-pulse',       // '' → no dot
    noEvents: 't-proseSM text-[var(--t-pencil)]',
    eventList: 'flex flex-col',
    event: 'py-1.5 pl-3 border-l-2',
    eventBorder: 'border-[var(--t-rule)]',
    eventBorderError: 'border-[var(--t-brick)]',
    eventLine: 'flex flex-wrap items-baseline gap-2',
    eventType: 't-metaMD',
    eventTypeOk: 'text-[var(--t-ink)]',
    eventTypeError: 'text-[var(--t-brick)]',
    eventMessage: 't-proseSM text-[var(--t-graphite)]',
    eventTime: EYEBROW,
    payloadDetails: 'mt-0.5',
    payloadSummary: `${EYEBROW} cursor-pointer`,
    payloadPre: 't-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded p-2 mt-1 overflow-auto max-h-48 scrollbar-sm',

    // Outputs list — UI.Table named style; cell text classes below
    outputsWrap: 'flex flex-col gap-2 t-proseSM text-[var(--t-graphite)]',
    outputsTableStyle: 'list',
    outputCell: 't-proseSM text-[var(--t-ink)]',
    outputLink: 't-proseSM text-[var(--t-cobalt)] hover:underline',   // links in text stay cobalt
    outputRows: 't-metaMD text-[var(--t-ink)] tabular-nums',
}
