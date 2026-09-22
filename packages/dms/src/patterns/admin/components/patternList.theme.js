// Ported to tessera's var(--t-*) tokens (2026-09-19) from the design-system
// mockup src/themes/tessera/design_system_v6/pages/admin-site.html (its
// "patterns-toolbar" section) — previously hardcoded blue-400/gray-700
// literals, zero theming.
//
// NOTE: this component (patternList.jsx's PatternEdit/PatternList) is NOT
// currently rendered by any route — the live "Sites" admin page is
// patterns/admin/pages/editSite.jsx, which has its own separate, already
// fully-v6-tokenized PatternList/toolbar implementation. This file appears
// to be dead/superseded code (only referenced from admin/defaultTheme.js and
// admin.format.js, neither of which mounts it as a page). Tokenized here for
// consistency in case it's revived, but don't treat it as the source of
// truth for the Sites page's actual design — use editSite.jsx/.theme.js for
// that.
export const patternListTheme = {
    // PatternList (view)
    listWrapper: 'p-10 max-w-5xl h-dvh',
    listHeader: 'w-full flex justify-between border-b-2 border-blue-400',
    listTitle: 'text-2xl font-semibold text-gray-700',
    listSiteRow: 'font-semibold',
    listSection: 'py-5',
    listSectionTitle: 'py-2 font-semibold text-l',
    listGrid: 'font-light divide-y-2',
    listGridHeader: 'font-semibold grid grid-cols-4',
    listGridRow: 'grid grid-cols-4',

    // PatternEdit (edit) — the "Sites" page
    editWrapper: 'flex flex-col w-full gap-3 overflow-auto',
    editHeader: 'w-full pb-3 border-b border-[var(--t-rule)]',
    editTitle: 't-displayMD text-[var(--t-ink)] truncate',
    toolbar: 'w-full flex items-center gap-3',
    searchInputWrapper: 'flex-1 max-w-sm',
    addButton: 'inline-flex items-center gap-1.5 t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-2.5 cursor-pointer flex-none',
    tableWrapper: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',

    modalTitle: 't-displaySM text-[var(--t-ink)]',
    modalForm: 'flex flex-col gap-3',
    modalActions: 'w-full flex items-center gap-2 pt-1',
    modalEditActions: 'w-full flex items-center gap-2 pt-1',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer',
    btnCancel: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer',
    btnDuplicate: 't-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3 py-1.5 cursor-pointer',
    btnRemove: 't-metaXS text-[var(--t-brick)] border border-[var(--t-brick-soft)] bg-[var(--t-brick-soft)] hover:opacity-80 rounded-md px-3 py-1.5 cursor-pointer',

    // RenderFilters
    filtersWrapper: 'flex flex-col gap-1 p-1 border border-[var(--t-rule)] rounded-md',
    filtersLabel: 't-metaSM text-[var(--t-graphite)]',
    filterRow: 'grid grid-cols-3 gap-1',
}
