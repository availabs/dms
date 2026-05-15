export const metadataCompTheme = {
    // index.jsx — outer container
    container: 'p-2',
    searchWrapper: 'w-full',
    dirtyWarning: 'flex text-sm italic items-center',
    dirtyWarningIcon: 'text-yellow-600 cursor-pointer mx-1 size-6',
    fieldListScroll: 'max-h-[74dvh] overflow-auto scrollbar-sm',
    addFieldWrapper: 'w-full p-2',

    // RenderField.jsx — field rows
    pkBadge: 'text-xs font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0',
    fieldRow: 'border-l-4 border-blue-100 hover:border-blue-300 mb-1 px-2 pb-2 w-full flex flex-col items-center',
    fieldRowEven: 'bg-white',
    fieldRowOdd: 'bg-white',
    fieldHeader: 'flex items-center w-full gap-2 p-2',
    dragHandle: 'h-4 w-4 m-1 text-gray-800',
    dragHandleSvg: 'nc-icon cursor-move !h-3.75 text-gray-600 mr-1',
    fieldControls: 'w-full flex flex-wrap justify-between flex-col sm:flex-row items-stretch sm:items-center',
    advancedToggle: 'cursor-pointer p-2 text-gray-500 hover:text-gray-900 text-xl',
    advancedPanel: 'w-full flex flex-col gap-4',
    advancedDescRow: 'flex flex-row justify-between items-center',

    // Sub-inputs
    inputWrapper: 'flex flex-col items-start',
    label: 'text-sm font-light capitalize text-slate-600',
    labelUpperCase: 'text-sm font-light uppercase text-slate-600',

    // Options tags
    optionsWrapper: 'flex flex-col items-start w-full gap-1',
    optionsInner: 'w-full flex flex-col',
    optionsList: 'flex flex-row flex-wrap',
    optionTag: 'bg-red-300 hover:bg-red-200 text-red-800 text-xs font-normal px-1.5 py-1 m-1 flex no-wrap items-center rounded-md',
    optionTagLabel: 'hover:cursor-pointer',
    optionRemove: 'p-0.5 px-1 cursor-pointer',
    optionFormRow: 'w-full flex',

    // Delete modal
    deleteModalBorder: 'border border-red-500',
    deleteTitle: 'text-lg font-medium text-gray-900',
    deleteMessage: 'text-md font-medium text-gray-900 py-4 px-2',
    deleteWrapper: 'w-full text-end pt-2',

    // Mapped options / metadata grids
    mappedGrid: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-1',
    metadataFieldTheme: 'flex flex-col',
    customGrid4: 'grid grid-cols-4 gap-1 items-center',
    customGrid6: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-1 items-center',
    metadataHeader: 'flex justify-between',

    // RenderAddField.jsx — add button
    addFieldRow: 'w-full flex flex-col sm:flex-row',
    addButtonIcon: 'px-1 size-6',
    addButtonContent: 'flex items-center text-nowrap',
}
