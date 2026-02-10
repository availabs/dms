export const validateCompTheme = {
    // Main layout
    container: 'flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4',
    innerWrapper: 'w-full max-w-7xl mx-auto',
    headerRow: 'flex justify-between w-full',

    // Stat boxes
    statGroup: 'flex gap-2 text-gray-500',
    statBox: 'bg-gray-100 rounded-md px-2 py-1',
    statValue: 'text-gray-900',

    // Re-validate button
    revalidateButton: 'px-2 py-1 text-sm bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 rounded-md',
    revalidateButtonError: 'px-2 py-1 text-sm bg-red-300 hover:bg-red-600 text-white rounded-md',

    // Loading / section header
    sectionHeader: 'w-full flex items-center justify-between px-2 py-1 text-gray-500 bg-gray-100 rounded-md my-2',

    // RenderMassUpdater modal
    modalBackdrop: 'fixed inset-0 h-full w-full z-[100] content-center bg-black/40',
    modalPanel: 'w-3/4 h-1/2 overflow-auto scrollbar-sm flex flex-col gap-3 p-4 bg-white place-self-center rounded-md',
    modalCloseRow: 'w-full flex justify-end',
    modalCloseButton: 'w-fit h-fit p-2 text-gray-600 border border-gray-200 rounded-full cursor-pointer',
    modalTitle: 'text-lg',
    modalBody: 'max-h-3/4 overflow-auto scrollbar-sm border rounded-md p-4',
    modalGridHeader: 'grid grid-cols-3',
    modalGridRow: 'group grid grid-cols-3 items-center gap-y-1 rounded-md',
    modalGridRowOdd: 'bg-gray-50',
    modalInvalidBadge: 'mx-1 px-1 py-0.5 text-sm bg-red-50 text-red-500',
    modalUpdateButton: 'px-2 py-1 bg-blue-500/15 text-blue-700 hover:bg-blue-500/25',

    // Column header badges (spreadsheet controls)
    columnHeader: 'truncate select-none',
    columnHeaderWithErrors: 'truncate select-none min-w-[15px]',
    errorBadgeGroup: 'flex ml-1 gap-0.5 font-light',
    errorCount: 'flex px-1 py-0.5 text-xs bg-red-50 text-red-500 rounded-sm',
    filterToggle: 'flex place-items-center px-1 py-0.5 text-sm bg-blue-50 rounded-sm',
}
