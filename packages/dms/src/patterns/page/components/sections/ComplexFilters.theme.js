// Theme for the ComplexFilters editor (filter-tree builder used inside the
// dataWrapper's edit view). Pattern-tied — registered into page/defaultTheme.js
// so site themes can override individual keys.
// tessera v6, 2026-10-08 (page-section-menu.html "filters"); pre-v6 values frozen in
// src/themes/_legacy/pages.js `complexFilters`.
export const complexFiltersTheme = {
    // root
    root: 'w-full rounded-md',

    // group container
    groupWrapper: 'flex flex-col gap-2 border border-[var(--t-rule)] rounded-md p-2 bg-[var(--t-well)]',
    groupWrapperNested: 'ml-3',
    groupHeader: 'flex items-center justify-between gap-2',
    groupHeaderLabel: 'flex items-center gap-1.5 t-proseXS text-[var(--t-graphite)]',
    groupHeaderMatch: 'font-medium text-[var(--t-ink)]',
    groupChildren: 'flex flex-col gap-2',
    groupActions: 'flex gap-2',

    // leaf condition card
    leafWrapper: 'relative w-full flex flex-col gap-2 p-2 border rounded-md',
    leafWrapperDefault: 'border-[var(--t-rule)] bg-[var(--t-panel)] hover:border-[var(--t-rule-strong)]',
    leafWrapperStale: 'border-[var(--t-amber)] bg-[var(--t-amber-soft)]',
    leafEllipsisWrapper: 'absolute top-1 right-1 z-10',
    leafEllipsisIcon: 'size-4 text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
    leafStaleBadge: 't-metaXS text-[var(--t-amber)]',

    // labeled field rows inside the leaf
    field: 'flex flex-col gap-1',
    // Column row needs a right gutter so its <MultiSelect> doesn't run under
    // the absolute-positioned ellipsis menu.
    fieldWithEllipsisGutter: 'flex flex-col gap-1 pr-8',
    fieldLabel: 't-metaXS text-[var(--t-pencil)]',

    // ellipsis popup body
    popup: 'flex flex-col gap-2 p-2 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-md shadow-[var(--t-shadow-drag)] t-proseXS text-[var(--t-ink)]',
    popupRow: 'flex items-center gap-1.5',
    popupRowLabel: 't-proseXS text-[var(--t-graphite)]',
    popupRemove: 'flex gap-1 text-[var(--t-brick)] hover:underline cursor-pointer',
    popupIcon: 'size-4',
    popupTrash: 'size-4',

    // value editor (used by ConditionValueInput's scalar/multiselect Comp)
    valueComp: 'w-full max-h-[150px] flex t-proseXS overflow-auto scrollbar-sm border border-[var(--t-rule)] rounded-md bg-[var(--t-panel)] p-2',

    // bottom action bar
    filterActions: 'flex gap-1 items-center pt-1',
};
