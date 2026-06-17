export const editSiteTheme = {
    // PatternList / TenantList shared
    wrapper: 'flex flex-1 flex-col w-full overflow-auto',
    header: 'w-full flex items-center justify-between border-b-2 border-blue-400 pb-2',
    headerTitle: 'text-2xl font-semibold text-gray-700',
    searchBar: 'w-full flex',
    modalForm: 'flex flex-col',

    // PatternList table cell
    baseUrlLink: 'flex items-center p-2 w-full h-full py-1 font-[400] text-[14px] leading-[18px] text-slate-600',
    cellActions: 'flex items-center justify-center gap-1 w-full h-full py-1',
    editLink: 'flex items-center px-2 py-1 text-sm text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-full',
    iconSm: 'size-4',
    emptyValue: 'p-2 text-[14px] text-slate-400',
    btnNoShrink: 'shrink-0',
    iconLabel: 'pl-1',
    duplicateBtn: 'p-1.5 text-slate-400 hover:text-blue-600 rounded-full hover:bg-blue-50',
    deleteBtn: 'p-1.5 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50',

    // Edit / Add modal actions
    modalEditActions: 'w-full flex items-center justify-start gap-0.5',
    modalAddActions: 'w-full flex items-center justify-start',
    btnSave: 'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnCancel: 'bg-red-100 hover:bg-red-300 text-sm text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnDuplicate: 'bg-green-100 hover:bg-green-300 text-green-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnRemove: 'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit',
    btnAdd: 'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit',

    // Delete confirmation modal
    deleteModal: 'flex flex-col gap-4 p-2',
    deleteModalTitle: 'text-lg font-semibold text-slate-700',
    deleteModalDesc: 'text-sm text-slate-500',
    deleteModalHighlight: 'font-medium text-slate-700',
    deleteModalFooter: 'flex items-center justify-end gap-2',
    btnSecondary: 'px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg',
    btnDanger: 'px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg',

    // TenantList
    tenantLink: 'flex items-center p-2 w-full h-full py-1 font-[400] text-[14px] leading-[18px] text-blue-600 hover:underline',
    tenantModalForm: 'flex flex-col gap-3 p-1',
    tenantModalTitle: 'text-lg font-semibold text-slate-700',
    fieldGroup: 'flex flex-col gap-1',
    fieldLabel: 'text-sm text-slate-600',
    errorText: 'text-sm text-red-600',
    tenantModalActions: 'flex items-center gap-2 pt-1',

    // RenderFilters
    filtersWrapper: 'flex flex-col gap-1 p-1 border rounded-md',
    filtersLabel: 'text-sm',
    filterRow: 'grid grid-cols-3 gap-1',
}
