// PluginsCard (components/pluginsCard.jsx): a site's plugins, on its settings page in the hub.
// Same card frame and Tessera tokens as pgEnvsCard.theme.js.
export const pluginsCardTheme = {
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex flex-wrap items-center gap-2',
    cardTitle: 't-metaSM text-[var(--t-graphite)]',
    cardSubtitle: 't-metaXS text-[var(--t-pencil)]',
    headRow: 'hidden md:grid grid-cols-[minmax(0,1fr)_9rem_9rem_5rem] gap-x-4 px-4 py-2.5 border-b border-[var(--t-rule-strong)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_9rem_9rem_5rem] gap-x-4 gap-y-1 px-4 py-2.5 border-b border-[var(--t-rule)] last:border-b-0 items-center',
    nameCell: 'min-w-0',
    // Not t-meta*: those uppercase, and a plugin's name is case-sensitive.
    name: 'font-mono text-[13px] leading-5 text-[var(--t-ink)]',
    note: 't-metaXS text-[var(--t-pencil)] mt-0.5',
    versionCell: 'min-w-0',
    versionText: 't-metaXS text-[var(--t-graphite)]',
    actions: 'flex items-center md:justify-end gap-2',
    footer: 'px-4 py-3 border-t border-[var(--t-rule)]',
    errorText: 't-metaSM text-[var(--t-brick)]',
    confirmText: 't-metaSM text-[var(--t-ink)]',
    confirmActions: 'flex flex-wrap items-center gap-2 mt-2',
    loading: 'px-4 py-6 t-metaSM text-[var(--t-pencil)]',
}
