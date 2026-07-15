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

    // Needs-value TOGGLE chip — the viewer control for a unary `empty`/`notempty`
    // external leaf (ExternalFilters). A unary op has no value input, so this
    // switch's on/off IS the whole state: ON applies the clause, OFF suppresses
    // the leaf. Neutral library defaults (grays only); a brand theme (mny)
    // overrides these to the "Needs priority" pill look. The on-state is driven
    // by a `data-on` attribute on the chip (`group`), so track/knob respond via
    // `group-data-[on]:` variants — no hardcoded brand colour in the component.
    toggleChip: 'group inline-flex items-center gap-2 cursor-pointer select-none',
    toggleChipOn: '',
    toggleTrack: 'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-gray-200 transition-colors group-data-[on]:bg-gray-600',
    toggleKnob: 'inline-block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform group-data-[on]:translate-x-4',

    // Active-filter TOKENS + clear-all (ExternalFilters, opt-in via
    // display.showActiveTokens / display.showClearAll). Removable chip per
    // external filter that carries a selected value; ✕ clears that filter.
    activeTokensWrapper: 'w-full flex flex-row flex-wrap items-center gap-1 pt-2',
    activeToken: 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700',
    activeTokenRemove: 'cursor-pointer opacity-60 hover:opacity-100 size-3',
    clearAll: 'text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer ml-auto',

    // RenderFilterValueSelector — edit-mode value editor for each filter row.
    filterRowWrapper: 'p-1 relative text-xs',
    inlineSwitchRow: 'flex flex-wrap items-center gap-1',
    searchKeyRow: 'flex items-center gap-0.5',
    searchKeySelectorWrapper: 'min-w-fit w-full relative bg-white',
    searchKeyMenuWrapper: 'absolute w-full bg-white p-1 text-xs rounded-md shadow-md z-1',
    searchKeyMenuItem: 'p-1 hover:bg-blue-500/15 hover:text-blue-700 cursor-pointer rounded-md',
}
