// Theme for the section menu's Columns sub-menu (ColumnManager.jsx) and its add-column dialogs
// (AddFormulaColumn / AddCalculatedColumn / AddStaticColumn). Pattern-tied — registered in
// page/defaultTheme.js as `columnManager` (resolved at `pages.columnManager`). tessera v6,
// 2026-10-08, from design_system_v6/pages/page-section-menu.html; no accent colour. These were all
// hardcoded before; the old literals are frozen in src/themes/_legacy/pages.js `columnManager`.
// 2026-10-16 (ui-raw-html-to-ui-components.md): controls are UI components — FieldLabel inline captions, Button
// iconInline / iconInlineOn / iconInlineWarn row icons, actionFull add triggers, iconRow close, action / primary
// dialog buttons, small fn keys, menuItem column rows, Input / Textarea mono. Only layout keys remain here.
export const columnManagerTheme = {
    root: "flex flex-col gap-2 w-full p-1",
    picker: "flex flex-col p-1.5 gap-1.5 w-full relative bg-[var(--t-well)] rounded-md",
    pickerButtons: "flex gap-1",
    dropdown: "max-h-40 overflow-y-auto overflow-x-hidden scrollbar-sm border border-[var(--t-rule)] rounded-md bg-[var(--t-panel)] shadow-[var(--t-shadow-lift)]",
    dropdownItem: "flex items-center justify-between px-2 h-7 t-proseXS text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer min-w-0",
    dropdownLabel: "truncate mr-2",
    joinBadgeWrap: "relative flex-shrink-0 h-4 w-4 flex items-center justify-center text-[var(--t-pencil)]",
    joinBadge: "absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-[var(--t-ink)] text-[7px] font-bold text-[var(--t-paper)] border border-[var(--t-panel)]",
    sourceIcon: "text-[var(--t-pencil)]",
    staged: "flex flex-wrap items-center gap-1",
    stagedText: "flex items-center gap-1",
    stagedX: "size-3 cursor-pointer",
    controlRow: "flex items-center gap-2",
    controlLabelCell: "flex shrink-0 min-w-16",   // holds a UI.FieldLabel inline caption
    row: "border border-[var(--t-rule)] rounded-md bg-[var(--t-panel)] mb-0.5",
    rowHead: "flex items-center justify-between px-2 py-1.5 gap-1",
    rowTitleWrap: "flex items-center gap-1.5 flex-1 min-w-0",
    grip: "size-3.5 text-[var(--t-pencil)] shrink-0 cursor-grab",
    settingsIcon: "size-3.5 text-[var(--t-pencil)] shrink-0",
    rowLabel: "t-proseSM text-[var(--t-ink)] truncate",
    rowLabelStrong: "t-proseSM font-medium text-[var(--t-ink)] truncate",
    rowIcons: "flex items-center gap-0.5 shrink-0",
    fnBadge: "p-0.5 text-[var(--t-graphite)]",
    fnIcon: "size-3.5 text-[var(--t-graphite)]",
    icon: "size-3.5",
    expanded: "px-2.5 py-2 border-t border-[var(--t-rule)] bg-[var(--t-well)] rounded-b-md flex flex-col gap-2",
    colName: "t-metaMD text-[11px] text-[var(--t-pencil)]",
    pillRow: "flex flex-wrap gap-1 pt-1",
    bulk: "flex flex-wrap gap-1",
    pivotWrap: "flex flex-col gap-1",
    pivotTitle: "t-metaXS text-[var(--t-pencil)] px-1 pt-1",
    empty: "t-proseSM text-[var(--t-pencil)] text-center py-2",
    addTriggerWrap: "flex flex-1 min-w-0",       // + Formula / + Calculated / + Static (UI.Button actionFull)
    dialogHeader: "w-full flex justify-between items-center",
    dialogBody: "flex flex-col gap-3 w-full text-left",   // inside UI.Modal 'aboveMenu' (the Modal positioner centres text)
    dialogTitle: "t-displaySM text-[var(--t-ink)]",
    calcBody: "w-full flex flex-col gap-3",
    staticBody: "w-full flex flex-col gap-3",
    staticField: "flex flex-col gap-1",
    dialogActions: "flex gap-2 justify-end",
    formulaGrid: "flex w-full gap-4",
    formulaLeft: "w-1/3 flex flex-col gap-3",
    formulaLabel: "t-metaXS text-[var(--t-pencil)] mb-1",
    opsRow: "flex gap-1 flex-wrap",
    fnRow: "flex flex-wrap gap-1",
    roundRow: "flex items-center gap-1.5 mt-1.5",
    roundField: "w-14",                          // UI.Input compact
    constRow: "flex gap-1",
    constField: "flex-1 min-w-0",                // UI.Input
    colsWrap: "flex-1 flex flex-col min-h-0",
    colsList: "overflow-y-auto border border-[var(--t-rule)] rounded-md max-h-48 scrollbar-xs",
    formulaRight: "flex-1 flex flex-col gap-2",
    formulaDisplay: "flex-1 min-h-[80px] p-3 rounded-md bg-[var(--t-well)] t-metaMD text-[var(--t-ink)] break-all",
    formulaPlaceholder: "text-[var(--t-pencil)]",
    formulaWarn: "t-proseXS text-[var(--t-amber)]",
    formulaActions: "flex gap-2 justify-end",
}
