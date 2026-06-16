export const settingsEditorTheme = {
    // Outer wrapper
    wrapper: 'flex flex-col gap-4 max-w-5xl',

    // Generic section card
    section: 'flex flex-col gap-1 p-4 border rounded-md',
    sectionTitle: 'font-semibold text-lg',
    sectionDesc: 'text-sm text-gray-500 mb-2',
    fieldGrid: 'grid grid-cols-12 gap-1 border rounded p-4',

    // DmsEnvConfig
    envGrid: 'grid grid-cols-12 gap-2',
    envColWide: 'col-span-6',
    envColMid: 'col-span-4',
    envLabel: 'text-sm font-medium text-gray-700',
    envInputRow: 'flex gap-2',

    // Danger zone
    dangerSection: 'flex flex-col gap-2 p-4 border border-red-200 rounded-md',
    dangerLabel: 'font-semibold text-sm text-red-600',
    dangerActions: 'flex items-center gap-2',
    btnDuplicate: 'flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50',
    btnDelete: 'flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg',
    confirmRow: 'flex items-center gap-2',
    confirmText: 'text-sm text-red-600',
    btnConfirmDelete: 'px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg',
    btnCancelDelete: 'px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg',
    iconSm: 'size-4',
}
