// Theme for the DMS map section component ("Map" / the unified dama map).
// Registered in patterns/page/defaultTheme.js as its OWN object (`damaMap`) so
// sites can re-skin the whole component through the UI theme system — every
// tailwind class the component renders belongs here, read via
// getComponentTheme(theme, 'damaMap' / 'damaMap.layerLibrary').
//
// NOTE: LegendPanel / HoverComp still read the shared ui map theme
// (ui/components/map/map.theme.js `legend`/`hover` keys) — migrating them into
// this object is part of map-component-unification.md's themeability scope.

export const damaMapTheme = {
  // wrappers rendered by map/index.jsx
  container: "w-full relative",
  layerLibraryWrapper: "absolute top-0 left-0 flex pointer-events-none",
  legendWrapper: "flex pointer-events-none",
  legendInner: "max-w-[300px]",
  legendInnerHorizontal: "max-w-[350px]",
  pluginWrapper: "flex pointer-events-none",

  // the multi-symbology Layer Library panel (LayerLibraryPanel.jsx)
  layerLibrary: {
    panel: "p-4 pointer-events-none",
    panelInner: "w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-140px)] flex flex-col rounded-lg border border-zinc-950/10 bg-white/95 shadow-sm pointer-events-auto overflow-hidden",
    header: "h-10 px-3 flex items-center gap-2 border-b border-zinc-950/10 bg-zinc-50/80 shrink-0",
    headerTitle: "flex-1 text-sm font-medium text-zinc-700 truncate select-none",
    headerCount: "px-1.5 h-5 inline-flex items-center rounded-full bg-blue-600 text-white text-[10px] font-semibold tabular-nums",
    headerCollapseBtn: "size-6 inline-flex items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 cursor-pointer",
    headerCollapseIcon: "size-4",
    body: "overflow-y-auto scrollbar-sm",
    searchWrapper: "p-2.5 border-b border-zinc-950/5",
    searchInput: "w-full h-8 px-2.5 rounded-md border border-zinc-950/10 bg-zinc-50 text-[13px] text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500/50",
    activeSection: "p-2.5 border-b border-zinc-950/5 bg-blue-500/[0.04]",
    activeSectionHeader: "flex items-center gap-2 mb-1.5",
    activeSectionLabel: "text-[10px] font-semibold uppercase tracking-wider text-blue-700",
    activeSectionRule: "h-px flex-1 bg-blue-500/20",
    activeClearBtn: "text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-600 cursor-pointer",
    activeRow: "rounded-md border border-zinc-950/10 bg-white px-2 py-1.5 mb-1.5 last:mb-0",
    activeRowTop: "flex items-center gap-2",
    activeRowInfo: "flex-1 min-w-0",
    activeRowName: "text-[13px] font-medium text-zinc-800 truncate",
    activeRowMeta: "text-[9.5px] uppercase tracking-wider text-zinc-400 truncate",
    activeRowRemove: "size-6 shrink-0 inline-flex items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-red-600 cursor-pointer",
    activeRowRemoveIcon: "size-3.5",
    filterSelectRow: "flex items-center gap-2 mt-1.5",
    filterSelectLabel: "text-[9.5px] uppercase tracking-wider text-zinc-500 shrink-0",
    filterSelect: "flex-1 min-w-0 h-7 px-1.5 rounded border border-zinc-950/10 bg-zinc-50 text-[12px] text-zinc-700 cursor-pointer focus:outline-none",
    libraryHeader: "px-3 pt-2.5 pb-1 flex items-center gap-2",
    libraryLabel: "text-[10px] font-semibold uppercase tracking-wider text-zinc-500",
    libraryRule: "h-px flex-1 bg-zinc-950/10",
    libraryMeta: "text-[9.5px] uppercase tracking-wider text-zinc-400",
    categoryHeader: "w-full px-3 py-2 flex items-center gap-2 border-b border-zinc-950/5 hover:bg-zinc-50 cursor-pointer select-none",
    categoryHeaderOpen: "w-full px-3 py-2 flex items-center gap-2 border-b border-zinc-950/5 bg-zinc-50 cursor-pointer select-none",
    categoryName: "flex-1 min-w-0 text-left text-[13px] font-semibold text-zinc-800 truncate",
    categoryBadge: "px-1.5 h-[18px] inline-flex items-center rounded-full bg-blue-600/10 text-blue-700 text-[9.5px] font-semibold tabular-nums",
    categoryCount: "text-[10px] text-zinc-400 tabular-nums",
    categoryChevron: "size-3.5 text-zinc-400 shrink-0",
    categoryRows: "pb-1 border-b border-zinc-950/5",
    row: "flex items-center gap-2.5 pl-5 pr-3 py-1.5 cursor-pointer hover:bg-zinc-50 select-none",
    rowActive: "flex items-center gap-2.5 pl-5 pr-3 py-1.5 cursor-pointer bg-blue-500/[0.07] select-none",
    rowCheckbox: "size-4 shrink-0 rounded accent-blue-600 cursor-pointer",
    rowName: "flex-1 min-w-0 text-[12.5px] text-zinc-700 truncate",
    rowHint: "text-[9.5px] text-zinc-400 shrink-0",
    empty: "p-3 text-sm text-zinc-500",
  },
};
