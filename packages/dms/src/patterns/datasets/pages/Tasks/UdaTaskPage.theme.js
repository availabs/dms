// Task page (pages/Tasks/UdaTaskPage.jsx — one task's info row + events) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-tasks.html (task view). The status keys are shared
// with UdaTaskList and the Uploads page. No accent colour (owner direction 2026-10-07). Pre-v6 values
// frozen in src/themes/_legacy/datasets.js `udaTaskPage`.
const RULE = 'border-[var(--t-rule)]';
const CARD = `rounded-lg border ${RULE} bg-[var(--t-panel)]`;
const META = 't-metaMD text-[var(--t-graphite)]';

export const udaTaskPageTheme = {
    // StatusBadge color map entries
    // (v6 soft tones, 2026-10-06 — same chip as the source Overview's authority badges; also used by
    // UdaTaskList)
    statusDone: 'text-[var(--t-go)] bg-[var(--t-go-soft)]',
    statusError: 'text-[var(--t-brick)] bg-[var(--t-brick-soft)]',
    statusRunning: 'text-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]',
    statusQueued: 'text-[var(--t-graphite)] bg-[var(--t-well)]',
    statusDefault: 'text-[var(--t-graphite)] bg-[var(--t-well)]',
    statusBadge: 'inline-flex items-center gap-1.5 t-metaXS rounded px-1.5 py-0.5',
    statusRunningDot: 'size-1.5 rounded-full bg-current animate-pulse',   // '' → no dot

    page: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6',       // '' → LayoutGroup (pre-v6)

    // Task info row
    taskInfoRow: `${CARD} px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 t-proseSM text-[var(--t-ink)]`,
    taskInfoItem: '',
    taskInfoLabel: 'text-[var(--t-pencil)] lowercase',
    taskInfoSep: '',                                                      // text after each label
    taskInfoId: 't-metaMD',
    taskInfoStatus: 'inline-flex items-center gap-2',
    taskInfoWorker: 'capitalize',
    taskInfoSourceLink: 'text-[var(--t-ink)] underline decoration-[var(--t-rule-strong)] underline-offset-2 hover:decoration-[var(--t-ink)]',  // '' → plain text
    taskInfoError: 'basis-full text-[var(--t-brick)] break-words max-h-40 overflow-auto scrollbar-xs',

    // Content pane — the events card
    contentWrapper: `${CARD} mt-4 overflow-hidden`,
    eventsHeader: `flex items-center gap-2 px-4 py-3 border-b ${RULE}`,      // '' → no header (pre-v6)
    eventsTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    eventsCount: 't-metaXS text-[var(--t-pencil)]',
    lookupMsg: 'px-4 py-3 t-proseSM text-[var(--t-pencil)]',
    notFoundMsg: 'px-4 py-3 t-proseSM text-[var(--t-brick)]',
    noEventsMsg: 'px-4 py-3 t-proseSM text-[var(--t-graphite)]',

    // Events table — UI.Table named style (2026-10-14, ui-control-tables.md); '' → the theme's default table
    tableStyle: 'list',
    columnSizes: { event_id: 100, created_at: 190, payload: 340 },   // px; unlisted columns share the rest
    eventIdCell: META,
    eventTypeCell: 't-metaMD text-[var(--t-ink)] whitespace-nowrap',
    eventTypeError: 't-metaMD text-[var(--t-brick)] whitespace-nowrap',
    eventMessageCell: 'min-w-0 [overflow-wrap:anywhere]',
    eventDateCell: 'text-[var(--t-graphite)] whitespace-nowrap',
    emptyCell: 'text-[var(--t-pencil)]',

    // Payload textarea (inside COLUMNS definition)
    payloadWrap: 'w-[300px]',   // the read-only payload (UI.Textarea 'readonly')
    payloadRows: '4',                                                     // '' → no rows attr
}
