// Colors ported to tessera's var(--t-*) tokens (2026-09-16) — this admin page always
// renders under the "default" theme (patterns/admin/siteConfig.jsx hardcodes
// `selectedTheme: "default"`), so it's tessera's own base palette regardless of which
// project's admin a user is looking at. Using the tokens (rather than plain Tailwind
// grays) is what makes this page dark-mode aware, matching the Table right below it.
export const editSiteTheme = {
    // PatternList / TenantList shared
    wrapper: 'flex flex-1 flex-col w-full overflow-auto',
    header: 'w-full flex items-center justify-between border-b-2 border-[var(--t-cobalt)] pb-2',
    headerTitle: 'text-2xl font-semibold text-[var(--t-ink)]',
    searchBar: 'w-full flex',
    modalForm: 'flex flex-col',

    // Site identity + stats strip (PatternList header)
    identityWrapper: 'flex flex-wrap items-center gap-x-5 gap-y-3 pb-3 mb-3 border-b border-[var(--t-rule)]',
    identityTitle: 't-displayMD text-[var(--t-ink)]',
    identitySubtitle: 't-metaSM text-[var(--t-pencil)] mt-1',
    statsStrip: 'flex items-stretch divide-x divide-[var(--t-rule)] border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] overflow-hidden',
    statItem: 'px-4 py-2',
    statValue: 'text-xl font-semibold tracking-[-0.015em] tabular-nums leading-none text-[var(--t-ink)]',
    statValueWarn: 'text-xl font-semibold tracking-[-0.015em] tabular-nums leading-none text-[var(--t-amber)]',
    statLabel: 't-metaXS text-[var(--t-pencil)] mt-1',

    // Toolbar (search + add pattern) and the filter/sort row beneath it
    toolbarRow: 'flex items-center gap-3',
    searchWrapper: 'flex flex-1 items-center gap-2.5 border border-[var(--t-rule-strong)] rounded-md px-3.5 h-10 bg-[var(--t-panel)] text-[var(--t-graphite)] focus-within:border-[var(--t-cobalt)]',
    searchIcon: 'w-4 h-4 flex-none',
    // UI.Input's className replaces its themed default entirely, so this
    // carries the whole look of the text itself — the bordered box is
    // `searchWrapper` around it.
    searchInput: 'w-full min-w-0 bg-transparent text-sm placeholder:text-[var(--t-pencil)] outline-none border-none p-0 h-auto',
    searchKbdHint: 't-metaXS text-[var(--t-pencil)] border border-[var(--t-rule)] rounded px-1.5 hidden md:block',
    addPatternBtn: 'inline-flex items-center gap-2 text-sm font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-4 h-10 flex-none',

    toolbarFilterRow: 'flex flex-wrap items-center gap-3 mt-2.5',
    filterCount: 't-metaSM text-[var(--t-pencil)]',
    sortBtn: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-md px-2 py-1 hover:border-[var(--t-rule-strong)]',
    chipsWrapper: 'flex items-center gap-1.5 flex-wrap',
    chip: 't-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-full px-2 py-0.5 hover:border-[var(--t-rule-strong)]',
    chipActive: 't-metaXS text-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)] rounded-full px-2 py-0.5',
    // The table's own card — this page previously had NO local card at all; the
    // white-box look came entirely from siteConfig.jsx's outer `SectionGroup`
    // wrapping the WHOLE page (title + table) in one card, so the title read as
    // merged into it (flagged live, 2026-09-21). `SectionGroup` now renders this
    // route with `card={false}`, so the table needs its own card, matching
    // admin-site.html's separate "patterns-table" section.
    tableCard: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden mt-3',
    // 'forms' patterns are creatable but not currently registered/routable
    // (patterns/index.js has that entry commented out) — dashed instead of
    // solid so an author isn't surprised when visiting one does nothing.
    chipInactive: 't-metaXS text-[var(--t-pencil)] border border-dashed border-[var(--t-rule-strong)] rounded-full px-2 py-0.5 hover:border-[var(--t-ink)]',

    // PatternList table cell
    baseUrlLink: 'flex items-center p-2 w-full h-full py-1 font-[400] text-[14px] leading-[18px] text-[var(--t-graphite)]',
    patternName: 't-proseSM font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    patternNamePlain: 't-proseSM font-medium text-[var(--t-graphite)]',

    typePill: 't-metaXS rounded-full px-2 py-0.5',
    typePillPage: 'text-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]',
    typePillDatasets: 'text-[var(--t-go)] bg-[var(--t-go-soft)]',
    typePillAuth: 'text-[var(--t-amber)] bg-[var(--t-amber-soft)]',
    typePillMapeditor: 'text-[var(--t-graphite)] bg-[var(--t-well)] border border-[var(--t-rule)]',
    // Dashed, like chipInactive — same "not currently routable" signal.
    typePillForms: 'text-[var(--t-pencil)] border border-dashed border-[var(--t-rule-strong)]',
    typePillUnknown: 'text-[var(--t-brick)] bg-[var(--t-brick-soft)]',

    cellActions: 'flex items-center justify-end gap-1 w-full h-full py-1 text-[var(--t-pencil)]',
    editLink: 'p-1.5 hover:text-[var(--t-ink)] rounded-md hover:bg-[var(--t-well)]',
    iconSm: 'size-4',
    emptyValue: 'p-2 text-[14px] text-[var(--t-pencil)]',
    btnNoShrink: 'shrink-0',
    iconLabel: 'hidden',
    duplicateBtn: 'p-1.5 hover:text-[var(--t-ink)] rounded-md hover:bg-[var(--t-well)]',
    deleteBtn: 'p-1.5 hover:text-[var(--t-brick)] rounded-md hover:bg-[var(--t-brick-soft)]',
    noAccessBadge: 'inline-flex items-center gap-1.5 t-metaXS text-[var(--t-pencil)] justify-end w-full',

    // Edit / Add modal actions
    modalEditActions: 'w-full flex items-center justify-start gap-0.5',
    modalAddActions: 'w-full flex items-center justify-start',
    btnSave: 'bg-[var(--t-cobalt-soft)] hover:opacity-80 text-sm text-[var(--t-cobalt)] px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnCancel: 'bg-[var(--t-brick-soft)] hover:opacity-80 text-sm text-[var(--t-brick)] px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnDuplicate: 'bg-[var(--t-go-soft)] hover:opacity-80 text-[var(--t-go)] px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnRemove: 'bg-[var(--t-brick-soft)] hover:opacity-80 text-[var(--t-brick)] px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnAdd: 'bg-[var(--t-cobalt-soft)] hover:opacity-80 text-sm text-[var(--t-cobalt)] px-2 py-0.5 m-1 rounded-lg w-fit h-fit',

    // Delete confirmation modal
    deleteModal: 'flex flex-col gap-4 p-2',
    deleteModalTitle: 'text-lg font-semibold text-[var(--t-ink)]',
    deleteModalDesc: 'text-sm text-[var(--t-graphite)]',
    deleteModalHighlight: 'font-medium text-[var(--t-ink)]',
    deleteModalFooter: 'flex items-center justify-end gap-2',
    btnSecondary: 'px-3 py-1.5 text-sm text-[var(--t-graphite)] bg-[var(--t-well)] hover:bg-[var(--t-rule)] rounded-lg',
    btnDanger: 'px-3 py-1.5 text-sm text-[var(--t-accent-ink)] bg-[var(--t-brick)] hover:brightness-90 rounded-lg',

    // TenantList
    tenantLink: 'flex items-center p-2 w-full h-full py-1 font-[400] text-[14px] leading-[18px] text-[var(--t-cobalt)] hover:underline',
    tenantModalForm: 'flex flex-col gap-3 p-1',
    tenantModalTitle: 'text-lg font-semibold text-[var(--t-ink)]',
    fieldGroup: 'flex flex-col gap-1',
    fieldLabel: 'text-sm text-[var(--t-graphite)]',
    errorText: 'text-sm text-[var(--t-brick)]',
    tenantModalActions: 'flex items-center gap-2 pt-1',

    // RenderFilters
    filtersWrapper: 'flex flex-col gap-1 p-1 border border-[var(--t-rule)] rounded-md',
    filtersLabel: 'text-sm',
    filterRow: 'grid grid-cols-3 gap-1',
}
