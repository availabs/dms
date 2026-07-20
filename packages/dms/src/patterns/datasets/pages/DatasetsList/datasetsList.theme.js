// Default (un-branded) DatasetsList theme. A site theme overrides via
// `datasets.datasetsList` (see src/themes/transportny for the branded version).
// `categorySwatches` is the palette the catalog hashes top-level categories into
// (color dots in the rail + on the card category pills).
export const datasetsListTheme = {
    categorySwatches: ['#1F3F8F', '#B45309', '#37576B', '#047857', '#0F2D4D', '#7C3AED', '#0E7490', '#9D174D'],

    pageWrapper: 'w-full',
    iconMd: 'size-5',

    // header
    header: 'w-full bg-white border-b border-gray-200 px-6 py-3 flex flex-col gap-2',
    count: 'text-xs uppercase tracking-wide text-gray-400',
    toolbar: 'flex flex-row items-center gap-2',
    toolbarSearch: 'flex-1 min-w-[200px]',

    // view switcher
    viewSwitcher: 'inline-flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5',
    viewBtn: 'size-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-50',
    viewBtnActive: 'size-8 inline-flex items-center justify-center rounded-md bg-gray-900 text-white',
    viewBtnIcon: 'size-4',
    newBtn: 'inline-flex items-center text-gray-500 hover:text-gray-900',

    // body + rail
    body: 'flex flex-row gap-4 px-6 py-4 bg-gray-50',
    sidebar: 'w-1/4 min-w-[180px] flex flex-col gap-0.5 sticky top-2 self-start max-h-[calc(100svh-7rem)] overflow-y-auto',
    sidebarItem: 'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50',
    sidebarItemActive: 'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-semibold bg-gray-100 text-gray-900',
    sidebarItemText: 'flex-1 min-w-0 truncate flex items-center gap-2',
    sidebarDot: 'size-2 rounded-full shrink-0',
    sidebarBadge: 'ml-auto shrink-0 text-xs tabular-nums text-gray-400',
    sidebarSubItem: 'flex items-center pl-6 pr-2 py-1 rounded-md text-[13px] text-gray-500 hover:bg-gray-50',
    sidebarSubItemActive: 'flex items-center pl-6 pr-2 py-1 rounded-md text-[13px] font-medium bg-gray-100 text-gray-900',

    // card grid / stack
    sourceGrid: 'flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 content-start',
    sourceStack: 'flex-1 flex flex-col gap-3',

    // card
    card: 'group relative flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm p-4 hover:border-gray-400 transition-colors',
    cardFull: 'group relative flex items-start gap-4 rounded-lg border border-gray-200 bg-white shadow-sm p-4 hover:border-gray-400 transition-colors',
    cardFullMain: 'flex-1 min-w-0',
    cardBadges: 'flex items-center flex-wrap gap-1.5 mb-2',
    typeBadge: 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500',
    typeBadgeIcon: 'size-3',
    categoryPill: 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-gray-700 bg-gray-100 hover:bg-gray-200',
    categoryDot: 'size-1.5 rounded-full',
    subCategoryPill: 'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-gray-500 bg-gray-50 border border-gray-200 hover:text-gray-700',
    cardTitle: 'block text-base font-semibold text-gray-900 hover:text-blue-700',
    cardDescription: 'mt-1 text-sm text-gray-500 line-clamp-2',
    cardView: 'shrink-0 mt-2 text-xs uppercase tracking-wide text-blue-700',

    // table
    tableWrap: 'flex-1 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden self-start',
    table: 'w-full text-left border-collapse',
    theadRow: 'bg-gray-50 border-b border-gray-200',
    th: 'px-3 py-2 text-xs uppercase tracking-wide text-gray-500 font-medium',
    tr: 'border-b border-gray-100 hover:bg-gray-50',
    td: 'px-3 py-2 text-sm align-top',
    tdName: 'font-medium text-gray-900 hover:text-blue-700',
    tdMuted: 'px-3 py-2.5 text-sm text-gray-500 align-middle max-w-[40ch] truncate',
    tableCatWrap: 'flex flex-wrap items-center gap-x-3 gap-y-1',
    tableCatItem: 'inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900',
    tableCatDot: 'size-1.5 rounded-full',
}
