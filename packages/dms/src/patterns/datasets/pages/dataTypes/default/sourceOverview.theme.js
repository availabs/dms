export const sourceOverviewTheme = {
    // Header
    title: 'mt-1 text-2xl text-blue-600 font-medium overflow-hidden sm:mt-0 sm:col-span-3',

    // Body layout
    body: 'flex flex-col md:flex-row',

    // Description column (left)
    descriptionCol: 'w-full md:w-[70%] pl-4 py-2 sm:pl-6 flex justify-between group text-sm text-gray-500 pr-14',

    // Metadata column (right)
    metadataCol: 'w-full md:w-[30%] flex flex-col gap-1',

    // Metadata items
    metaItem: 'flex flex-col px-4 text-sm text-gray-600',
    metaLabel: 'text-sm text-gray-500',
    metaValue: 'text-base font-medium text-blue-600',

    // Editable metadata row (update_interval, categories)
    metaEditRow: 'flex justify-between group',
    metaEditInner: 'flex-1 flex flex-col px-4',

    // Pencil edit button
    pencilWrapper: 'hidden group-hover:block text-blue-500 cursor-pointer',
    pencilIcon: 'fad fa-pencil absolute -ml-4 p-2.5 rounded hover:bg-blue-500 hover:text-white',

    // Column section header
    sectionHeader: 'flex items-center p-2 mx-4 text-blue-600 hover:bg-blue-50 rounded-md',
    sectionBadge: 'bg-blue-200 text-blue-600 text-xs p-1 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300',

    // Column table
    tableWrapper: 'w-full p-4',
    columnName: 'font-semibold',
    columnActualName: 'text-xs font-normal text-gray-400',
    columnType: 'font-light italic',

    // Column table controls
    seeMoreLink: 'w-fit ml-auto mt-1 px-2 py-0.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded cursor-pointer transition-colors',

    // Versions table
    versionsWrapper: 'w-full p-4',
    downloadLink: 'text-sm text-blue-600 hover:text-blue-800 hover:underline',
    downloadUnavailable: 'text-sm text-gray-400 italic',
}
