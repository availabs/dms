export const filterTheme = {
    filterLabel: 'py-0.5 text-gray-500 font-medium',
    loadingText: 'pl-0.5 font-thin text-gray-500',
    filterSettingsWrapperInline: 'w-2/3',
    filterSettingsWrapperStacked: 'w-full',
    labelWrapperInline: 'w-1/3 text-xs',
    labelWrapperStacked: 'w-full text-xs',
    input: 'w-full max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white p-2 text-nowrap',
    settingPillsWrapper: 'flex flex-row flex-wrap gap-1',
    settingPill: 'px-1 py-0.5 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded-md',
    settingLabel: 'text-gray-900 font-regular min-w-fit',
    filtersWrapper: 'w-full py-6 flex flex-col rounded-md',

    // Round pill that toggles the filter panel open/closed. Pulled out of inline
    // JSX so themes can resize / reposition it (or set display:none) without
    // touching the component. Used by both RenderFilters and ExternalFilters.
    toggleButton: 'w-fit -mt-4 p-2 border rounded-full self-end',
    toggleIcon: 'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer',
    // Grid wrapper holding the rendered filter / condition rows.
    conditionsGrid: 'grid',
    // Per-row layout, parameterized by display.placement.
    conditionRowInline: 'w-full flex flex-row items-center gap-1',
    conditionRowStacked: 'w-full flex flex-col items-center gap-1',

    // RenderFilterValueSelector — edit-mode value editor for each filter row.
    filterRowWrapper: 'p-1 relative text-xs',
    inlineSwitchRow: 'flex flex-wrap items-center gap-1',
    searchKeyRow: 'flex items-center gap-0.5',
    searchKeySelectorWrapper: 'min-w-fit w-full relative bg-white',
    searchKeyMenuWrapper: 'absolute w-full bg-white p-1 text-xs rounded-md shadow-md z-1',
    searchKeyMenuItem: 'p-1 hover:bg-blue-500/15 hover:text-blue-700 cursor-pointer rounded-md',
}
