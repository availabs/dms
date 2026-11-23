// The admin's Plugins page (pages/plugins.jsx): installing plugin releases on this server.
// Same card frame and Tessera tokens as components/pluginsCard.theme.js.
export const pluginsPageTheme = {
    stack: 'flex flex-col gap-4',
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex flex-wrap items-center gap-2',
    cardTitle: 't-metaSM text-[var(--t-graphite)]',
    cardSubtitle: 't-metaXS text-[var(--t-pencil)]',
    cardBody: 'px-4 py-3 flex flex-col gap-2',
    installRow: 'flex flex-wrap items-center gap-2',
    installInput: 'flex-1 min-w-[16rem]',
    note: 't-metaXS text-[var(--t-pencil)]',
    okText: 't-metaSM text-[var(--t-ink)]',
    warnText: 't-metaSM text-[var(--t-amber)]',
    errorText: 't-metaSM text-[var(--t-brick)]',
    notice: 'px-4 py-3 bg-[var(--t-panel)] border border-[var(--t-amber)] rounded-lg flex flex-col gap-1',
    headRow: 'hidden md:grid grid-cols-[minmax(0,1fr)_9rem_9rem_minmax(0,1fr)] gap-x-4 px-4 py-2.5 border-b border-[var(--t-rule-strong)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_9rem_9rem_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-2.5 border-b border-[var(--t-rule)] last:border-b-0 items-center',
    nameCell: 'min-w-0',
    // Not t-meta*: those uppercase, and a plugin's name is case-sensitive.
    name: 'font-mono text-[13px] leading-5 text-[var(--t-ink)]',
    rowNote: 't-metaXS text-[var(--t-pencil)] mt-0.5 truncate',
    versionText: 't-metaXS text-[var(--t-graphite)]',
    usesCell: 'min-w-0 t-metaXS text-[var(--t-graphite)] break-words',
    empty: 'px-4 py-6 t-metaSM text-[var(--t-pencil)]',
}
