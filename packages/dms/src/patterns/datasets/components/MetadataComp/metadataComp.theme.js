export const metadataCompTheme = {
    // index.jsx — outer container
    container: 'p-2',
    searchWrapper: 'w-full',
    dirtyWarning: 'flex text-sm italic items-center',
    dirtyWarningIcon: 'text-yellow-600 cursor-pointer mx-1 size-6',
    fieldListScroll: 'max-h-[74dvh] overflow-auto scrollbar-sm',
    addFieldWrapper: 'w-full p-2',

    // RenderField.jsx — field rows
    fieldRow: 'hover:bg-blue-100 border-l-4 border-blue-100 hover:border-blue-300 mb-1 px-2 pb-2 w-full flex flex-col',
    fieldRowEven: 'bg-white',
    fieldRowOdd: 'bg-blue-50',
    fieldHeader: 'flex items-center w-full gap-2',
    dragHandle: 'h-4 w-4 m-1 text-gray-800',
    dragHandleSvg: 'nc-icon cursor-move !h-3.75 text-gray-600 mr-1',
    fieldControls: 'w-full flex flex-wrap justify-between flex-col sm:flex-row items-stretch sm:items-center',
    advancedToggle: 'cursor-pointer p-2 text-gray-500 hover:text-gray-900 text-xl',
    advancedPanel: 'flex flex-col',
    advancedDescRow: 'flex flex-row justify-between items-center',

    // Sub-inputs
    inputWrapper: 'flex flex-col items-start',
    label: 'text-sm font-light capitalize font-gray-700',

    // Options tags
    optionsWrapper: 'flex flex-col items-start w-full gap-1',
    optionsInner: 'w-full flex flex-col',
    optionsList: 'flex flex-row flex-wrap',
    optionTag: 'bg-red-500 hover:bg-red-700 text-white text-xs font-semibold px-1.5 py-1 m-1 flex no-wrap items-center rounded-md',
    optionTagLabel: 'hover:cursor-pointer',
    optionRemove: 'p-0.5 px-1 cursor-pointer',
    optionFormRow: 'w-full flex',

    // Delete modal
    deleteModalBorder: 'border border-red-500',
    deleteTitle: 'text-lg font-medium text-gray-900',
    deleteMessage: 'text-md font-medium text-gray-900 py-4 px-2',
    deleteButton: 'bg-red-500 text-red-900',
    deleteWrapper: 'w-full text-end',

    // Mapped options / metadata grids
    mappedGrid: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-1',
    metadataFieldTheme: 'pb-2 flex flex-col',
    customGrid4: 'grid grid-cols-4 gap-1',
    customGrid6: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-1',
    metadataHeader: 'flex justify-between',

    // RenderAddField.jsx — add button
    addFieldRow: 'w-full flex flex-col sm:flex-row',
    addButton: 'p-2 bg-blue-300 hover:bg-blue-500 text-white rounded-md',
    addButtonError: 'p-2 bg-red-500 text-white rounded-md',
    addButtonIcon: 'text-white px-1 size-6',
    addButtonContent: 'flex items-center',
}
