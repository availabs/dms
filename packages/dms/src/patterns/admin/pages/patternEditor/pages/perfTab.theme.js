// The Pattern Editor's Performance tab (perfTab.jsx). Registered as `admin.perfTab` in ../../../defaultTheme.js.
export const perfTabTheme = {
    wrapper: 'flex flex-col gap-4 pt-3',
    intro: 't-proseSM text-[var(--t-pencil)] max-w-3xl',
    notice: 'px-4 py-3 rounded-lg border border-[var(--t-rule)] bg-[var(--t-well)] t-proseSM text-[var(--t-graphite)]',
    error: 't-proseSM text-[var(--t-brick)]',

    // the Run card
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex items-center gap-3',
    cardTitle: 't-metaSM text-[var(--t-ink)]',
    cardNote: 't-metaXS text-[var(--t-pencil)]',
    spacer: 'flex-1',
    cardBody: 'p-4 flex flex-col gap-3',
    fields: 'grid grid-cols-1 sm:grid-cols-4 gap-3 items-end',
    field: 'flex flex-col gap-1 min-w-0',
    fieldLabel: 't-metaXS text-[var(--t-pencil)]',
    actions: 'flex items-center gap-2',

    // progress while a run is going
    progressRow: 'flex items-center gap-3',
    progressTrack: 'flex-1 h-2 rounded-full bg-[var(--t-well)] overflow-hidden',
    progressBar: 'h-full bg-[var(--t-cobalt)] transition-all duration-500',
    progressText: 't-metaXS text-[var(--t-pencil)] tabular-nums',
    progressLine: 't-metaXS text-[var(--t-pencil)] truncate',

    // the runs table
    table: 'w-full',
    headRow: 'grid grid-cols-[28px_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_88px] gap-3 px-4 py-2 border-b border-[var(--t-rule)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-[28px_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_88px] gap-3 px-4 py-2.5 border-b border-[var(--t-rule)] last:border-b-0 items-center hover:bg-[var(--t-well)]',
    rowOpen: 'grid grid-cols-[28px_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_88px] gap-3 px-4 py-2.5 border-b border-[var(--t-rule)] last:border-b-0 items-center bg-[var(--t-well)]',
    runCell: 'min-w-0',
    runName: 't-proseSM font-medium text-[var(--t-ink)] truncate',
    runMeta: 't-metaXS text-[var(--t-pencil)] truncate',
    num: 't-proseSM tabular-nums text-[var(--t-ink)]',
    numMuted: 't-proseSM tabular-nums text-[var(--t-pencil)]',
    score: 't-metaXS tabular-nums',
    scoreGood: 't-metaXS tabular-nums text-[var(--t-go)]',
    scoreOk: 't-metaXS tabular-nums text-[var(--t-amber)]',
    scoreBad: 't-metaXS tabular-nums text-[var(--t-brick)]',
    pills: 'flex flex-wrap gap-1',
    empty: 'px-4 py-6 t-proseSM italic text-[var(--t-pencil)]',
    checkbox: 'w-4 h-4 accent-[var(--t-ink)]',

    // the report, in a frame under the table
    reportCard: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    reportFrame: 'w-full h-[80vh] border-0 bg-white',
}
