// Ported to tessera's var(--t-*) tokens, card treatment matching the
// permissions card above it on the merged Access page
// (design_system_v6/pages/admin-pattern-access.html's "row filters" section
// is a bare empty-state placeholder — this extends its visual language to
// the real subdomain-grouped filters + Sync-to-Pages feature, same
// "redesign mockup to accommodate features" precedent as Overview's
// Locations/RetiredSubdomains cards) (2026-09-20).
export const filterEditorTheme = {
    outerWrapper: 'flex flex-col gap-3',
    // Title styled AND laid out like a page-level heading, flush on the page background —
    // see permissionsEditor.theme.js's `header`/`headerTitle` comment; same reasoning
    // applies to this sibling section.
    header: 'flex flex-wrap items-center gap-x-2.5 gap-y-1',
    headerTitle: 't-displayMD text-[var(--t-ink)]',
    headerHint: 't-metaXS text-[var(--t-pencil)]',
    wrapper: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',

    // Per-subdomain section
    subdomainSection: 'border-b border-[var(--t-rule)] last:border-b-0',
    subdomainHeader: 'px-4 pt-3 pb-2 flex flex-wrap items-center gap-2',
    subdomainBadge: 't-metaXS text-[var(--t-pencil)] uppercase tracking-[0.06em]',
    subdomainRemoveBtn: 't-metaXS text-[var(--t-brick)] hover:opacity-80 cursor-pointer',
    subdomainBody: 'px-4 pb-3 flex flex-col gap-2',
    syncBtn: 't-metaXS text-[var(--t-cobalt)] border border-[var(--t-cobalt)] rounded-md px-2.5 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ml-auto',
    syncMessageSuccess: 't-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] border border-[var(--t-go)] rounded-md px-2.5 py-1.5',
    syncMessageError: 't-metaXS text-[var(--t-brick)] bg-[var(--t-brick-soft)] border border-[var(--t-brick)] rounded-md px-2.5 py-1.5',

    // Add subdomain row
    addSubdomainRow: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex gap-2 items-center',
    subdomainInput: 'border border-[var(--t-rule-strong)] rounded-md px-2.5 py-1.5 t-proseSM bg-[var(--t-panel)] outline-none focus:border-[var(--t-cobalt)]',
    addSubdomainBtn: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-md px-2.5 py-1.5 hover:border-[var(--t-rule-strong)] cursor-pointer',

    // Save row
    saveGrid: 'px-4 py-2.5 flex items-center justify-end gap-2',
    btnReset: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',

    // FilterRows
    filterRowsWrapper: 'flex flex-col gap-1.5',
    filterRow: 'grid grid-cols-3 gap-1.5',
    clearAllBtn: 't-metaXS text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer self-start',
}
