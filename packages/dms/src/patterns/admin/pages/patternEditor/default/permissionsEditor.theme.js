// Ported to tessera's var(--t-*) tokens, card treatment matching
// design_system_v6/pages/admin-pattern-access.html's "permissions" section
// (2026-09-20) — same card conventions as editSite.theme.js/settings.theme.js
// (bg-panel/border-rule/rounded-lg shell, t-metaSM/t-metaXS headers).
export const permissionsEditorTheme = {
    outerWrapper: 'flex flex-col gap-3',
    // Title styled like a page-level heading (settings.theme.js's `headerTitle` /
    // pagesEditor.theme.js's `headerTitle` — both `t-displayMD`) AND laid out like one —
    // flush on the page background, no card/panel behind it — not a small in-card label
    // sitting on the card's own `bg-panel` (that's what the mockup does, but the mockup
    // doesn't give Permissions/Filters a page-level heading treatment at all; this is a
    // deliberate deviation per explicit request). Access merges what were separate
    // Permissions/Filters concepts onto one page, so each keeps its own prominent,
    // flush heading instead of reading as a sub-card.
    header: 'flex flex-wrap items-center gap-x-2.5 gap-y-1',
    headerTitle: 't-displayMD text-[var(--t-ink)]',
    headerHint: 't-metaXS text-[var(--t-pencil)]',
    wrapper: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',

    // Per-subdomain section
    subdomainSection: 'border-b border-[var(--t-rule)] last:border-b-0',
    subdomainHeader: 'px-4 pt-3 pb-2 flex items-center gap-2',
    subdomainBadge: 't-metaXS text-[var(--t-pencil)] uppercase tracking-[0.06em]',
    subdomainRemoveBtn: 't-metaXS text-[var(--t-brick)] hover:opacity-80 ml-auto cursor-pointer',
    subdomainBody: 'px-4 pb-3',

    // Add subdomain row
    addSubdomainRow: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex gap-2 items-center',
    subdomainInput: 'border border-[var(--t-rule-strong)] rounded-md px-2.5 py-1.5 t-proseSM bg-[var(--t-panel)] outline-none focus:border-[var(--t-cobalt)]',
    addSubdomainBtn: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-md px-2.5 py-1.5 hover:border-[var(--t-rule-strong)] cursor-pointer',

    // Footer: can't-lock-yourself-out note (see ui/components/Permissions.jsx's
    // own lockoutNote — this is the domain-vocabulary summary alongside it) +
    // Save/Reset.
    saveGrid: 'px-4 py-2.5 flex flex-wrap items-center gap-3',
    domainSummary: 't-metaXS text-[var(--t-pencil)]',
    btnReset: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',

    noAccess: 'flex items-center justify-center h-48 t-proseSM text-[var(--t-pencil)]',
}
