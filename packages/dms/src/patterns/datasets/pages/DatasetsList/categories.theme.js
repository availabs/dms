// Default category-editor theme (SourceCategories add/remove UI shown when editing a source's
// categories) — tessera v6, ported 2026-10-06. A site theme overrides via `datasets.categories`;
// project themes keep their pre-v6 look through src/themes/_legacy/datasets.js.
export const categoriesTheme = {
    // CategoryItem — a chip; sub-categories use this, the parent uses categoryItemBold
    categoryItem: 'inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded border border-[var(--t-rule)] t-proseXS text-[var(--t-graphite)] my-0.5',
    categoryItemInner: 'truncate',
    categoryItemRemoveBtn: 'inline-flex items-center justify-center size-4 rounded text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] cursor-pointer',
    removeIcon: 'size-3',
    categoryItemBold: 'inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded bg-[var(--t-well)] t-proseXS font-medium text-[var(--t-ink)] my-0.5',

    // Spanner — chips are self-delimiting, no caret needed
    spanner: 'hidden',

    // Plus — add a sub-category
    plus: 'inline-flex items-center justify-center size-5 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    plusIcon: 'size-3',

    // CategoryList
    categoryListWrapper: 'flex flex-wrap items-center gap-1 py-0.5',
    categoryListWrapperEditing: 'flex flex-wrap items-center gap-1 py-1.5 border-b border-[var(--t-rule)]',
    categoryListRow: 'flex flex-wrap items-center gap-1',
    categoryListRowEditing: 'flex flex-wrap items-center gap-1',
    categoryListAddBtn: 'flex items-center',
    categoryListSubRow: 'flex flex-wrap items-center gap-1 ml-3',

    // SourceCategories
    sourceCategoriesNewWrapper: 'flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--t-rule)]',
    stopBtn: 'w-fit t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',

    // Input
    input: 'w-full t-proseSM rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] px-2.5 h-8 outline-none focus:border-[var(--t-ink)]',

    // CategoryAdder
    categoryAdderWrapper: 'w-full',
    categoryAdderInner: 'flex flex-col gap-0.5',
    categoryAdderInputRow: '',
    categoryAdderHint: 't-proseXS text-[var(--t-pencil)]',
}
