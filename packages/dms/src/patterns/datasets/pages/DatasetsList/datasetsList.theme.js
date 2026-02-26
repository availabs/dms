export const datasetsListTheme = {
    // Page layout
    pageWrapper: 'max-w-6xl mx-auto w-full',
    header: 'sticky top-0 z-10 bg-zinc-100 flex flex-col gap-3 pb-3',
    toolbar: 'flex flex-row items-center gap-1 px-4',
    toolbarSearch: 'flex-1',
    body: 'flex flex-row gap-3 px-4 pb-4',

    // Sidebar (category list)
    sidebar: 'w-1/4 flex flex-col gap-1 sticky top-[6.5rem] self-start max-h-[calc(100svh-7.5rem)] overflow-y-auto overflow-x-hidden scrollbar-sm',
    sidebarItem: 'bg-white hover:bg-blue-50 px-3 py-2 rounded-lg flex items-center min-w-0 text-sm text-gray-700 transition-colors',
    sidebarItemActive: 'bg-blue-100 text-blue-800 px-3 py-2 rounded-lg flex items-center min-w-0 text-sm font-medium transition-colors',
    sidebarItemText: 'flex-1 min-w-0 truncate',
    sidebarBadge: 'bg-blue-100 text-blue-600 text-xs w-5 h-5 ml-auto shrink-0 grow-0 rounded-full flex items-center justify-center',
    sidebarSubItem: 'bg-white hover:bg-blue-50 pl-6 pr-3 py-1.5 rounded-lg flex items-center min-w-0 text-sm text-gray-600 transition-colors',
    sidebarSubItemActive: 'bg-blue-100 text-blue-800 pl-6 pr-3 py-1.5 rounded-lg flex items-center min-w-0 text-sm font-medium transition-colors',

    // Source list (main area)
    sourceList: 'w-3/4 flex flex-col gap-2',

    // Source card (SourceThumb)
    sourceCard: 'w-full p-4 bg-white hover:bg-slate-50 rounded-lg border border-gray-200 shadow-sm flex transition-colors',
    sourceTitle: 'text-base font-semibold text-blue-700 hover:text-blue-900 w-full block transition-colors',
    sourceTypeLabel: 'text-xs font-normal text-gray-400 ml-2',
    sourceCategoryBadge: 'text-xs py-0.5 px-2 bg-blue-50 text-blue-600 rounded-full mr-1.5',
    sourceDescription: 'pt-1 text-sm text-gray-500 line-clamp-2',
}
