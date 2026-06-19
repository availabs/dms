export const filterEditorTheme = {
    // PatternFilterEditor outer
    wrapper: 'flex flex-col gap-2 p-1 border rounded-md max-w-5xl',
    label: 'text-sm font-medium',

    // Per-subdomain section
    subdomainSection: 'flex flex-col gap-1 border rounded p-2',
    subdomainHeader: 'flex items-center gap-2',
    subdomainBadge: 'text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded',
    subdomainRemoveBtn: 'text-xs text-red-500 hover:text-red-700',

    // Add subdomain row
    addSubdomainRow: 'flex gap-2 items-center mt-1',
    subdomainInput: 'border rounded px-2 py-1 text-sm',
    addSubdomainBtn: 'border rounded px-3 py-1 text-sm hover:bg-gray-50',

    // Save row
    saveGrid: 'grid grid-cols-12 gap-1 border rounded p-4',

    // FilterRows
    filterRowsWrapper: 'flex flex-col gap-1',
    filterRow: 'grid grid-cols-3 gap-1',
}
