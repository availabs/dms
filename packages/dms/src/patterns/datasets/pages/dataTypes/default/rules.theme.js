// Default (un-branded) theme for the source Rules page (rules.jsx) and the Auto-number banner on
// the Metadata page. Brand override: a site theme's `datasets.rulesPage`.
export const rulesPageTheme = {
    // page
    page: 'w-full flex flex-col gap-4 p-4 bg-white shadow',
    header: 'flex flex-row items-start justify-between gap-4',
    title: 'text-lg font-semibold text-gray-900',
    intro: 'mt-1 max-w-3xl text-sm text-gray-600',
    readOnlyBanner: 'rounded bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-800',
    notice: 'rounded bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600',
    loading: 'p-4 text-sm text-gray-400',
    empty: 'rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 text-center',

    // buttons
    buttonPrimary: 'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonSecondary: 'px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md ring-1 ring-inset ring-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonDanger: 'px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 text-sm font-medium rounded-md ring-1 ring-inset ring-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonDangerConfirm: 'px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md cursor-pointer disabled:opacity-40',

    // attached rule card
    list: 'flex flex-col gap-3',
    card: 'rounded-md border border-gray-200 p-4 flex flex-col gap-2',
    cardHeader: 'flex flex-row items-center justify-between gap-4 flex-wrap',
    cardTitle: 'text-sm font-semibold text-gray-900',
    cardSummary: 'text-sm text-gray-600',
    cardMeta: 'text-xs text-gray-400',
    cardActions: 'flex flex-row flex-wrap items-center gap-2',
    statusOk: 'inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20',
    statusPartial: 'inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20',
    statusBad: 'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20',
    tableStatusList: 'text-xs text-gray-500',
    removeNote: 'text-xs text-gray-500',
    backfillResult: 'rounded bg-gray-50 px-3 py-2 text-xs text-gray-700',
    errorText: 'rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700',

    // add / edit form
    form: 'rounded-md border border-blue-200 bg-blue-50/40 p-4 flex flex-col gap-3',
    formTitle: 'text-sm font-semibold text-gray-900',
    formDescription: 'text-sm text-gray-600',
    formGrid: 'grid grid-cols-1 md:grid-cols-2 gap-3',
    formField: 'flex flex-col gap-1',
    formFieldWide: 'flex flex-col gap-1 md:col-span-2',
    label: 'text-xs font-medium text-gray-600',
    labelHint: 'pl-1 font-normal text-gray-400',
    input: 'w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
    select: 'w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
    bboxGrid: 'grid grid-cols-2 sm:grid-cols-4 gap-2',
    bboxCell: 'flex flex-col gap-0.5',
    bboxLabel: 'text-[11px] text-gray-400',
    checkboxRow: 'flex items-center gap-2 text-sm text-gray-700',
    formActions: 'flex flex-row items-center gap-2',

    // Metadata page banner (gis_dataset/pages/metadata.jsx)
    autoNumberBanner: 'mb-3 flex flex-row items-center justify-between gap-4 rounded bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-900',
    autoNumberBannerText: 'flex-1',
    autoNumberBannerColumn: 'font-mono font-semibold',
    autoNumberBannerLink: 'underline font-medium hover:text-amber-700',
}
