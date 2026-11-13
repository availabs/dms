// PgEnvsCard (components/pgEnvsCard.jsx): the pgEnvs a tenant is attached to, on its settings page.
// Same card frame and Tessera tokens as domainsCard.theme.js.
export const pgEnvsCardTheme = {
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex flex-wrap items-center gap-2',
    cardTitle: 't-metaSM text-[var(--t-graphite)]',
    cardSubtitle: 't-metaXS text-[var(--t-pencil)]',
    headRow: 'hidden md:grid grid-cols-[minmax(0,1fr)_10rem_9rem] gap-x-4 px-4 py-2.5 border-b border-[var(--t-rule-strong)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_10rem_9rem] gap-x-4 gap-y-1 px-4 py-2.5 border-b border-[var(--t-rule)] last:border-b-0 items-center',
    // the remove confirmation, under its row (as the domains card's records box)
    confirm: 'px-4 py-3 border-b border-[var(--t-rule)] last:border-b-0',
    confirmBox: 'border border-[var(--t-rule)] rounded-md bg-[var(--t-well)] px-3 py-2.5',
    confirmText: 't-proseXS text-[var(--t-ink)]',
    confirmNote: 't-metaXS text-[var(--t-graphite)] mt-1',
    confirmActions: 'flex flex-wrap items-center gap-2 mt-2.5',
    nameCell: 'min-w-0',
    // Not t-meta*: those uppercase, and a pgEnv's name is case-sensitive.
    name: 'font-mono text-[13px] leading-5 text-[var(--t-ink)]',
    note: 't-metaXS text-[var(--t-pencil)] mt-0.5',
    actions: 'flex items-center md:justify-end gap-2',
    iconSm: 'size-4',
    footer: 'px-4 py-3 border-t border-[var(--t-rule)]',
    errorText: 't-metaSM text-[var(--t-brick)]',
    loading: 'px-4 py-6 t-metaSM text-[var(--t-pencil)]',
}
