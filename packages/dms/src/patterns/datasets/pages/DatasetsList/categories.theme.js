// Default (un-branded) category-editor theme (SourceCategories add/remove UI shown in edit mode).
// A site theme overrides via `datasets.categories` (see src/themes/transportny).
export const categoriesTheme = {
    // CategoryItem — a chip; sub-categories use this, the parent uses categoryItemBold
    categoryItem: 'inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-md bg-gray-100 text-gray-700 text-xs my-0.5',
    categoryItemInner: 'truncate',
    categoryItemRemoveBtn: 'inline-flex items-center justify-center size-4 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer',
    removeIcon: 'size-3',
    categoryItemBold: 'inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-md bg-gray-200 text-gray-800 text-xs font-semibold my-0.5',

    // Spanner — chips are self-delimiting, no caret needed
    spanner: 'hidden',

    // Plus — add a sub-category
    plus: 'inline-flex items-center justify-center size-5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-gray-100 cursor-pointer',
    plusIcon: 'size-3',

    // CategoryList
    categoryListWrapper: 'flex flex-wrap items-center gap-1 py-0.5',
    categoryListWrapperEditing: 'flex flex-wrap items-center gap-1 py-1.5 border-b border-gray-100',
    categoryListRow: 'flex flex-wrap items-center gap-1',
    categoryListRowEditing: 'flex flex-wrap items-center gap-1',
    categoryListAddBtn: 'flex items-center',
    categoryListSubRow: 'flex flex-wrap items-center gap-1 ml-3',

    // SourceCategories
    sourceCategoriesNewWrapper: 'flex flex-col gap-2 mt-2 pt-2 border-t border-gray-100',
    stopBtn: 'w-fit text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer',

    // Input
    input: 'w-full text-sm rounded-md border border-gray-300 px-2 py-1 outline-none focus:border-blue-500',

    // CategoryAdder
    categoryAdderWrapper: 'w-full',
    categoryAdderInner: 'flex flex-col gap-0.5',
    categoryAdderInputRow: '',
    categoryAdderHint: 'text-[11px] text-gray-400',
}
