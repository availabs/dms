// The QA install's Configure tab (configureTab.jsx). Its cards, save bar and fields reuse the
// Overview's keys (settingsEditor); these are the covered-sites table and the read-only lists.
// Registered as `qaConfigure` in patterns/admin/defaultTheme.js.
export const qaConfigureTheme = {
    spacer: 'flex-1',
    errorBox: 't-metaSM text-[var(--t-brick)] border border-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-lg px-4 py-2.5',
    note: 'p-4 t-proseSM text-[var(--t-graphite)]',

    // covered sites
    tableHead: 'grid grid-cols-[3rem_minmax(0,1fr)_9rem_11rem_4.5rem_8rem] items-center gap-3 px-4 py-2 border-b border-[var(--t-rule)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-[3rem_minmax(0,1fr)_9rem_11rem_4.5rem_8rem] items-center gap-3 px-4 py-2',
    rowWrap: 'flex flex-col',
    patternCell: 'flex flex-col min-w-0',
    patternName: 't-proseSM text-[var(--t-ink)] truncate',
    patternMeta: 't-metaXS text-[var(--t-pencil)] truncate',
    limitBtn: 't-metaSM text-[var(--t-cobalt)] hover:underline text-left cursor-pointer',
    limitRow: 'flex items-center gap-3 px-4 pb-3 pl-[4.75rem]',
    limitPicker: 'flex-1 min-w-0',
    rowError: 't-metaXS text-[var(--t-brick)] px-4 pb-2 pl-[4.75rem]',

    // ticket record, read-only
    recordGrid: 'grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4',
    recordList: 't-proseSM text-[var(--t-graphite)]',
}
