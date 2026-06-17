export const gisMapTheme = {
    // Layer2.jsx - HoverComp
    hoverCompWrapper: 'bg-white p-4 max-h-64 max-w-lg scrollbar-xs overflow-y-scroll',
    hoverCompTitle: 'font-medium pb-1 w-full border-b',
    hoverCompRow: 'flex border-b pt-1',
    hoverCompKey: 'flex-1 font-medium text-sm pl-1',
    hoverCompVal: 'flex-1 text-right font-thin pl-4 pr-1',

    // LegendCmp
    legendCmpWrapper: 'shadow-lg box-content min-h-32 min-w-48 w-fit p-1 border-2 bg-slate-50 bg-opacity-55',
    legendCmpTitleRow: 'flex mb-1',
    legendCmpTitle: 'flex-1 font-medium',
    legendCmpItemRow: 'flex m-2',
    legendCmpColorCol: 'flex-none w-16',
    legendCmpColorBar: 'h-8 w-[2px] rounded dark:ring-1 dark:ring-inset dark:ring-white/10 sm:w-full',
    legendCmpLabelCol: 'flex-initial ml-6 w-32',
    legendCmpLabel: 'h-6 w-2 ml-1 p-[2px] sm:w-full text-left',

    // LegendContainer
    legendContainerOuter: 'p-1 rounded bg-white',
    legendContainerInner: 'p-1 relative rounded border pointer-events-auto',
    legendContainerTitleRow: 'flex mb-1',
    legendContainerTitle: 'flex-1 font-medium',

    // GISDatasetRenderComponent
    renderComponentWrapper: 'absolute top-0 left-0 w-96 grid grid-cols-1 gap-4',
    renderComponentLegendCol: 'z-10',
    renderComponentControlsCol: 'z-0',

    // RemoveDomainItem
    removeDomainItem: 'px-2 flex items-center hover:bg-gray-200 rounded cursor-pointer text-red-500',

    // DomainItem
    domainItemOuter: 'flex px-2 py-1 rounded cursor-pointer hover:bg-gray-100',
    domainItemIndex: 'w-8 mr-1 py-1',
    domainItemContent: 'flex-1 mr-1',
    domainItemEditRow: 'flex',
    domainItemEditInput: 'flex-1 mr-1',
    domainItemEditInputEl: 'w-full px-2 py-1 border rounded text-sm',
    domainItemEditBtn: 'px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white',
    domainItemStaticVal: 'px-2 py-1',
    domainItemStopBtn: 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white',

    // ThresholdEditor
    thresholdEditorWrapper: 'absolute left-full top-0',
    thresholdEditorInner: 'bg-white p-1 pointer-events-auto rounded w-96',
    thresholdEditorBorder: 'border rounded border-current relative',
    thresholdEditorHeader: 'p-1 border-b border-current rounded-t flex font-bold bg-gray-100',
    thresholdEditorBody: 'p-1',
    thresholdEditorGrid: 'grid grid-cols-1 gap-1',
    thresholdEditorAddRow: 'flex border-t pt-1',
    thresholdEditorAddInputWrapper: 'mr-1 flex-1',
    thresholdEditorAddInput: 'w-full px-2 py-1 border rounded text-sm',
    thresholdEditorAddBtn: 'px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50',
    thresholdEditorResetBtn: 'w-full px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white',

    // BooleanSlider
    booleanSliderWrapper: 'px-4 py-1 h-8 rounded flex items-center w-full cursor-pointer',
    booleanSliderTrack: 'rounded flex-1 h-2 relative flex items-center bg-blue-100',
    booleanSliderThumbOn: 'w-4 h-4 rounded absolute bg-blue-500',
    booleanSliderThumbOff: 'w-4 h-4 rounded absolute bg-gray-500',

    // LegendColorBar
    legendColorBarActive: 'outline outline-2 rounded-lg my-2 outline-black',
    legendColorBarInactive: 'outline outline-2 rounded-lg my-2 outline-transparent cursor-pointer',

    // LegendControls
    legendControlsWrapper: 'bg-white p-1 pointer-events-auto rounded w-96 relative',
    legendControlsBorder: 'border rounded border-current relative',
    legendControlsHeader: 'p-1 border-b border-current rounded-t flex font-bold bg-gray-100',
    legendControlsTitle: 'flex-1',
    legendControlsCloseCol: 'flex-0',
    legendControlsCloseBtn: 'px-2 py-1 rounded cursor-pointer hover:bg-gray-200',
    legendControlsBody: 'p-1 grid grid-cols-1 gap-1',
    legendControlsRow: 'flex items-center px-1',
    legendControlsRowLabel: 'w-40 text-right',
    legendControlsRowValue: 'flex-1 ml-1',
    legendControlsRowValueSlider: 'flex-1',
    legendControlsDivider: 'border-b-2 border-current',
    legendControlsScrollArea: 'overflow-auto px-2 rounded bg-gray-100 scrollbar-sm scrollbar-blue',

    // legend-components.jsx - Color
    colorItemBase: 'flex-1 relative',
    colorItemHoverable: 'hover:outline hover:outline-1 outline-current',
    colorItemRounded: 'rounded',
    colorItemRoundedL: 'rounded-l',
    colorItemRoundedR: 'rounded-r',

    // ColorBar
    colorBarWrapper: 'flex rounded w-full',

    // OrdinalLegend
    ordinalLegendGrid: 'grid gap-1',
    ordinalLegendLabelsGrid: 'grid gap-1 text-right',
    ordinalLegendLabel: 'pr-1',

    // NonOrdinalLegend / LegendTicks
    nonOrdinalWrapper: 'w-full relative',
    nonOrdinalRangeWrapper: 'absolute w-full left-0 top-0',
    nonOrdinalRangeBorder: 'bg-white border border-b border-x rounded-b px-1',
    legendTicksThreshold: 'flex text-left',
    legendTicksThresholdPad: 'pl-1',
    legendTicksDefault: 'flex text-right',
    legendTicksDefaultPad: 'pr-1',

    // Map.jsx
    mapPageWrapper: '',
    mapHeightWrapper: 'w-full h-[900px]',
    mapAttrsWrapper: 'border-t border-gray-200 px-4 py-5 sm:p-0',
    mapAttrsDl: 'sm:divide-y sm:divide-gray-200',
    mapAttrsRow: 'flex justify-between group',
    mapAttrsGridRow: 'flex-1 sm:grid sm:grid-cols-5 sm:gap-4 sm:px-6',
    mapAttrsDt: 'text-sm font-medium text-gray-500 py-5',
    mapAttrsDd: 'mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-4',
    mapAttrsEditWrapper: 'pt-3 pr-8',
    mapAttrsViewWrapper: 'py-3 pl-2 pr-8',
    mapAttrsPre: 'bg-gray-100 tracking-tighter overflow-auto scrollbar-xs',
    mapAttrsEditHoverCol: 'hidden group-hover:block text-blue-500 cursor-pointer',
    mapAttrsEditIcon: 'fad fa-pencil absolute -ml-12 mt-3 p-2.5 rounded hover:bg-blue-500 hover:text-white',

    mapInnerWrapper: 'w-full h-full',

    // Edit (Map.jsx)
    editWrapper: 'w-full',
    editRow: 'w-full flex',
    editTextarea: 'flex-1 px-2 shadow text-base bg-blue-100 focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-none rounded-l-md',
}
