// GIS Map tab (Map.jsx, Layer2.jsx, legend-components.jsx) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-source-map.html. No accent colour (owner
// direction 2026-10-07): ink marks the selected colour scheme / active state. Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `gisMap` (transportny v2 overrides some keys — unchanged for it).
const RULE = 'border-[var(--t-rule)]';
const FLOAT = `bg-[var(--t-panel)] border ${RULE} rounded-lg shadow-[var(--t-shadow-lift)]`;
const HEAD = `flex items-center gap-2 px-3 py-2 border-b ${RULE}`;
const TITLE = 'flex-1 min-w-0 truncate t-proseSM font-medium text-[var(--t-ink)]';
const ICON_BTN = 'size-6 rounded inline-flex items-center justify-center text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer';
const BTN = 'h-7 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-md t-proseXS cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const ACTION = `${BTN} border ${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const INPUT = 'w-full h-7 px-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-metaMD text-[var(--t-ink)] outline-none focus:border-[var(--t-cobalt)]';
const TICKS = 't-metaMD text-[10px] text-[var(--t-graphite)]';

export const gisMapTheme = {
    // Layer2.jsx - HoverComp
    hoverCompWrapper: `${FLOAT.replace('shadow-[var(--t-shadow-lift)]', 'shadow-[var(--t-shadow-drag)]')} w-60 max-h-64 overflow-y-auto scrollbar-xs pb-2`,
    hoverCompTitle: `px-3 py-2 mb-1 border-b ${RULE} t-proseSM font-medium text-[var(--t-ink)]`,
    hoverCompRow: 'flex gap-3 px-3 py-0.5',
    hoverCompKey: 'flex-1 t-metaMD text-[11px] text-[var(--t-pencil)]',
    hoverCompVal: 't-proseXS text-[var(--t-ink)] text-right',

    // LegendCmp (non-custom legend)
    legendCmpWrapper: `${FLOAT} w-64 pb-2`,
    legendCmpTitleRow: `${HEAD} mb-1`,
    legendCmpTitle: TITLE,
    legendCmpItemRow: 'flex items-center gap-3 px-3 py-0.5',
    legendCmpColorCol: 'flex-none',
    legendCmpColorBar: 'h-3 w-6 rounded-sm',
    legendCmpLabelCol: 'flex-1 min-w-0',
    legendCmpLabel: `${TICKS} text-[11px] truncate`,

    // LegendContainer (custom legend) — title row + settings toggle, then the colour bar
    legendContainerOuter: `${FLOAT} w-64`,
    legendContainerInner: 'relative pointer-events-auto',
    legendContainerTitleRow: HEAD,
    legendContainerTitle: TITLE,
    legendContainerBody: 'px-3 py-2.5',
    legendToggleBtn: ICON_BTN,
    legendToggleIcon: 'Settings',
    legendToggleIconClass: 'size-3.5',

    // GISDatasetRenderComponent — legend card, controls card under it
    renderComponentWrapper: 'absolute top-4 left-4 w-64 flex flex-col gap-2',
    renderComponentLegendCol: 'z-10',
    renderComponentControlsCol: 'z-0',

    // RemoveDomainItem
    removeDomainItem: 'px-1.5 inline-flex items-center rounded text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',

    // DomainItem
    domainItemOuter: 'flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[var(--t-well)] cursor-pointer',
    domainItemIndex: 'w-6 t-metaMD text-[var(--t-pencil)]',
    domainItemContent: 'flex-1 min-w-0',
    domainItemEditRow: 'flex gap-1',
    domainItemEditInput: 'flex-1 min-w-0',
    domainItemEditInputEl: INPUT,
    domainItemEditBtn: ACTION,
    domainItemStaticVal: 't-metaMD text-[var(--t-ink)] px-2 py-1',
    domainItemStopBtn: `${BTN} border border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`,

    // ThresholdEditor — a card beside the controls
    thresholdEditorWrapper: 'absolute left-full top-0 ml-2',
    thresholdEditorInner: `${FLOAT} w-64 pointer-events-auto`,
    thresholdEditorBorder: 'relative',
    thresholdEditorHeader: `${HEAD} t-metaXS text-[var(--t-pencil)]`,
    thresholdEditorBody: 'p-3',
    thresholdEditorGrid: 'flex flex-col gap-0.5',
    thresholdEditorAddRow: `flex gap-2 pt-2 mt-2 border-t ${RULE}`,
    thresholdEditorAddInputWrapper: 'flex-1 min-w-0',
    thresholdEditorAddInput: INPUT,
    thresholdEditorAddBtn: ACTION,
    thresholdEditorResetBtn: `${ACTION} w-full mt-2`,

    // BooleanSlider (reverse colors) — a small switch
    booleanSliderWrapper: 'h-6 inline-flex items-center px-1.5 cursor-pointer',
    booleanSliderTrack: 'w-8 h-1.5 rounded-full relative flex items-center bg-[var(--t-rule-strong)]',
    booleanSliderThumbOn: 'size-3.5 rounded-full absolute bg-[var(--t-ink)]',
    booleanSliderThumbOff: `size-3.5 rounded-full absolute bg-[var(--t-panel)] border ${RULE}`,

    // LegendColorBar
    legendColorBarActive: 'rounded my-0.5 outline outline-2 outline-offset-1 outline-[var(--t-ink)]',
    legendColorBarInactive: 'rounded my-0.5 outline outline-2 outline-offset-1 outline-transparent hover:outline-[var(--t-rule-strong)] cursor-pointer',

    // LegendControls — a card under the legend
    legendControlsWrapper: `${FLOAT} w-64 relative pointer-events-auto`,
    legendControlsBorder: 'relative',
    legendControlsHeader: HEAD,
    legendControlsTitle: TITLE,
    legendControlsCloseCol: '',
    legendControlsCloseBtn: ICON_BTN,
    legendControlsBody: 'px-3 py-3 flex flex-col gap-2.5',
    legendControlsRow: 'grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2',
    legendControlsRowLabel: 't-metaXS text-[var(--t-pencil)]',
    legendControlsRowValue: 'min-w-0',
    legendControlsRowValueSlider: 'min-w-0',
    legendControlsDivider: 't-metaXS text-[var(--t-pencil)] pt-1',
    legendControlsScrollArea: 'overflow-auto flex flex-col gap-1 px-1 scrollbar-sm',
    legendControlsScrollHeight: '12rem',

    // legend-components.jsx - Color
    colorItemBase: 'flex-1 relative',
    colorItemHoverable: 'hover:outline hover:outline-1 outline-current',
    colorItemRounded: 'rounded',
    colorItemRoundedL: 'rounded-l',
    colorItemRoundedR: 'rounded-r',

    // ColorBar
    colorBarWrapper: 'flex rounded w-full overflow-hidden',

    // OrdinalLegend
    ordinalLegendGrid: 'grid gap-0.5',
    ordinalLegendLabelsGrid: `grid gap-1 mt-1.5 text-right ${TICKS}`,
    ordinalLegendLabel: 'pr-1 truncate',

    // NonOrdinalLegend / LegendTicks
    nonOrdinalWrapper: 'w-full relative',
    nonOrdinalRangeWrapper: 'absolute w-full left-0 top-0',
    nonOrdinalRangeBorder: `bg-[var(--t-panel)] border ${RULE} border-t-0 rounded-b px-1`,
    legendTicksThreshold: `flex text-left mt-1.5 ${TICKS}`,
    legendTicksThresholdPad: 'pl-1',
    legendTicksDefault: `flex text-right mt-1.5 ${TICKS}`,
    legendTicksDefaultPad: 'pr-1',

    // Map.jsx — full-width map that fills (almost) the whole page height below the source-page header
    mapPageWrapper: 'w-full',
    mapHeightWrapper: 'w-full h-[calc(100svh-176px)] min-h-[460px]',
    mapInnerWrapper: 'w-full h-full',

    // "Settings" → Sources & Layers modal
    settingsModalStyle: 'settings',                     // UI.Modal named style ('' → default)
    // ! — Modal's panel already carries max-w-lg; this must win (it's a wide JSON editor)
    settingsHeader: 'flex items-center gap-2',
    settingsTitle: 'flex-1 t-displaySM text-[var(--t-ink)]',
    settingsClose: ICON_BTN.replace('size-6', 'size-7'),
    settingsDesc: 't-proseSM text-[var(--t-graphite)] mt-1',
    mapAttrsWrapper: 'mt-4',
    mapAttrsDl: 'flex flex-col gap-3',
    mapAttrsRow: 'flex items-start gap-3',
    mapAttrsGridRow: 'flex-1 min-w-0 grid grid-cols-[80px_minmax(0,1fr)] gap-3 items-start',
    mapAttrsDt: 't-metaMD text-[var(--t-graphite)] pt-2',
    mapAttrsDd: 'min-w-0',
    mapAttrsEditWrapper: '',
    mapAttrsViewWrapper: '',
    mapAttrsPre: 't-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded p-3 overflow-auto max-h-60 scrollbar-xs',
    mapAttrsEditHoverCol: ICON_BTN.replace('size-6', 'size-7'),
    mapAttrsEditIcon: 'PencilSquare',
    mapAttrsEditIconClass: 'size-3.5',

    // Edit (Map.jsx)
    editWrapper: 'flex flex-col gap-2',
    editRow: 'w-full',
    editTextarea: 'w-full min-h-40 t-metaMD text-[var(--t-ink)] bg-[var(--t-panel)] border border-[var(--t-rule-strong)] rounded p-3 outline-none focus:border-[var(--t-cobalt)]',
    editActions: 'flex gap-2',
}
