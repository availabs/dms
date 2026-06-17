export const adminTheme = {
    // Button classes (used inline as const)
    buttonRed: 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md',
    buttonGreen: 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md',

    // Admin page layout
    adminWrapper: 'p-2',
    adminRow: 'flex gap-12',
    adminMain: 'w-3/4',
    adminSidebar: 'w-1/4',

    // UAC panels
    uacPanel: 'shadow-md rounded-md place-content-center p-4 w-full',
    uacPanelLabel: 'text-xl text-gray-900 font-semibold',
    uacMultiSelect: 'w-1/2',
    uacGrid: 'grid grid-cols-3',
    uacGroupPanel: 'shadow-lg rounded-md place-content-center p-4 w-full',

    // Sidebar actions
    sidebarActionsPanel: 'flex flex-col gap-4 shadow-lg rounded-md place-content-center p-4',

    // Tasks
    tasksWrapper: 'w-full pt-12',
    tasksLabel: 'text-sm font-medium text-gray-500 pb-2',

    // DeleteDamaSourceBtn modal content
    deleteModalTitle: 'text-base font-semibold text-gray-900',
    deleteModalDesc: 'mt-2 text-sm text-gray-600',
    deleteModalDescHard: 'mt-2',
    deleteModalConfirmLabel: 'mt-3 text-sm text-gray-700',
    deleteModalInput: 'mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-500',
    deleteModalFooter: 'mt-5 flex flex-row-reverse gap-2',
    deleteModalHardBtn: 'inline-flex justify-center rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-40',
    deleteModalSoftBtn: 'inline-flex justify-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-700 disabled:opacity-40',
    deleteModalCancelBtn: 'inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50',

    // Inline text emphasis
    emphasisBold: 'font-semibold',
    emphasisBoldDanger: 'font-semibold text-red-700',
    codeInline: 'ml-1',
    errorText: 'mt-2 text-sm text-red-700',
}
