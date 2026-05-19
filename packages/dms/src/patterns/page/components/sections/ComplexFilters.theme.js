// Theme for the ComplexFilters editor (filter-tree builder used inside the
// dataWrapper's edit view). Pattern-tied — registered into page/defaultTheme.js
// so site themes can override individual keys.
export const complexFiltersTheme = {
    // root
    root: 'w-full hover:bg-white rounded-md',

    // group container
    groupWrapper: 'flex flex-col gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50/40',
    groupWrapperNested: 'ml-3',
    groupHeader: 'flex items-center justify-between gap-2',
    groupHeaderLabel: 'flex items-center gap-2 text-xs text-slate-500',
    groupHeaderMatch: 'uppercase tracking-wide font-medium',
    groupChildren: 'flex flex-col gap-3',
    groupActions: 'flex gap-2',

    // leaf condition card
    leafWrapper: 'relative w-full flex flex-col gap-3 p-3 border border-dashed rounded-md',
    leafWrapperDefault: 'border-slate-300 bg-white hover:border-slate-400',
    leafWrapperStale: 'border-red-300 bg-red-50',
    leafEllipsisWrapper: 'absolute top-1 right-1 z-10',
    leafEllipsisIcon: 'size-5 text-slate-500 hover:text-slate-800 cursor-pointer',
    leafStaleBadge: 'text-red-500 text-xs',

    // labeled field rows inside the leaf
    field: 'flex flex-col gap-1',
    // Column row needs a right gutter so its <MultiSelect> doesn't run under
    // the absolute-positioned ellipsis menu.
    fieldWithEllipsisGutter: 'flex flex-col gap-1 pr-8',
    fieldLabel: 'text-xs font-medium text-slate-600',

    // ellipsis popup body
    popup: 'flex flex-col gap-2 p-2 bg-white shadow-md border rounded-md text-sm',
    popupRow: 'flex items-center gap-1',
    popupRowLabel: 'text-xs text-slate-600',
    popupRemove: 'flex gap-1 text-red-500 hover:text-red-700 cursor-pointer',
    popupIcon: 'size-4',
    popupTrash: 'size-4',

    // value editor (used by ConditionValueInput's scalar/multiselect Comp)
    valueComp: 'w-full max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white p-2',
};
