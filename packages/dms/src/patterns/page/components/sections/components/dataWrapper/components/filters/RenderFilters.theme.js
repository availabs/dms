export const filterTheme = {
    // Ported from tessera-theme-v6.js's top-level `filters` export, styles[0]
    // ("panel", the default/activeStyle:0 entry). tessera's `chip` style
    // (styles[1]) is a distinct named variant, not ported here per the
    // styles[]-array porting rule (this file has no styles[] wrapper of its
    // own, so only matching flat keys' values are replaced).
    filterLabel: 'font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t-pencil)]',
    loadingText: 'font-mono text-xs text-[var(--t-pencil)]',
    filterSettingsWrapperInline: 'flex items-center gap-2',
    filterSettingsWrapperStacked: 'w-full',
    labelWrapperInline: 'shrink-0 inline-flex items-center gap-1',
    labelWrapperStacked: 'w-full',
    input: 'w-full font-sans text-sm border border-[var(--t-rule-strong)] rounded-md bg-[var(--t-panel)] text-[var(--t-ink)] p-2',
    settingPillsWrapper: 'flex flex-wrap gap-1.5',
    settingPill: 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] bg-[var(--t-panel)] border border-[var(--t-rule)] text-[var(--t-graphite)]',
    settingLabel: 'font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--t-pencil)]',
    filtersWrapper: 'w-full p-3 flex flex-col gap-2 rounded-lg bg-[var(--t-well)] border border-[var(--t-rule)]',

    // Round pill that toggles the filter panel open/closed. Pulled out of inline
    // JSX so themes can resize / reposition it (or set display:none) without
    // touching the component. Used by both RenderFilters and ExternalFilters.
    // NOT ported from tessera (`hidden`/`hidden`) — that's tessera's OWN filter
    // panel deliberately having no expand/collapse affordance at all, not a
    // portable "look." Several other projects (mny's default filter style,
    // wcdb — neither overrides these) actively use a visible toggle to
    // expand/collapse the panel; inheriting `hidden` silently deleted that
    // working control. Kept as the pre-port library default.
    toggleButton: 'w-fit -mt-4 p-2 border rounded-full self-end',
    toggleIcon: 'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer',
    // Grid wrapper holding the rendered filter / condition rows.
    conditionsGrid: 'grid gap-2',
    // Per-row layout, parameterized by display.placement.
    conditionRowInline: 'inline-flex items-center gap-1.5 w-fit',
    conditionRowStacked: 'flex flex-col gap-1',

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
