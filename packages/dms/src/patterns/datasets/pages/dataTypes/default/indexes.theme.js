// Default (un-branded) theme for the source Indexes page (indexes.jsx).
// Brand override: a site theme's `datasets.indexesPage`.
export const indexesPageTheme = {
    // page
    page: 'w-full flex flex-col gap-4 p-4 bg-white shadow',
    header: 'flex flex-row items-start justify-between gap-4',
    title: 'text-lg font-semibold text-gray-900',
    intro: 'mt-1 max-w-3xl text-sm text-gray-600',
    readOnlyBanner: 'rounded bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-800',
    notice: 'rounded bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600',
    loading: 'p-4 text-sm text-gray-400',
    empty: 'rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 text-center',
    sectionTitle: 'text-sm font-semibold text-gray-700 mt-2',

    // buttons
    buttonPrimary: 'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonSecondary: 'px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md ring-1 ring-inset ring-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonDanger: 'px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 text-sm font-medium rounded-md ring-1 ring-inset ring-red-300 cursor-pointer disabled:opacity-40 disabled:cursor-default',
    buttonDangerConfirm: 'px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md cursor-pointer disabled:opacity-40',
    buttonIcon: 'px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-900 rounded cursor-pointer disabled:opacity-30 disabled:cursor-default',

    // index card
    list: 'flex flex-col gap-3',
    card: 'rounded-md border border-gray-200 p-4 flex flex-col gap-2',
    cardHeader: 'flex flex-row items-center justify-between gap-4 flex-wrap',
    cardTitle: 'text-sm font-semibold text-gray-900',
    cardKey: 'font-mono text-sm text-gray-800 break-all',
    cardDetail: 'text-xs text-gray-600',
    cardDetailCode: 'font-mono text-gray-800',
    cardMeta: 'text-xs text-gray-400',
    cardActions: 'flex flex-row flex-wrap items-center gap-2',
    tableStatusList: 'text-xs text-gray-500',
    statusOk: 'inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20',
    statusBusy: 'inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20',
    statusPartial: 'inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20',
    statusBad: 'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20',
    errorText: 'rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 break-words',

    // indexes made outside DMS
    otherList: 'flex flex-col divide-y divide-gray-100 rounded-md border border-gray-200',
    otherRow: 'flex flex-col gap-0.5 px-4 py-2',
    otherName: 'text-sm text-gray-800 flex flex-row items-center gap-2 flex-wrap',
    otherDefinition: 'font-mono text-xs text-gray-500 break-all',
    tag: 'inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600',

    // add form
    form: 'rounded-md border border-blue-200 bg-blue-50/40 p-4 flex flex-col gap-3',
    formTitle: 'text-sm font-semibold text-gray-900',
    kindRow: 'flex flex-row items-center gap-4 text-sm text-gray-700',
    kindOption: 'flex items-center gap-1.5 cursor-pointer',
    formField: 'flex flex-col gap-1',
    label: 'text-xs font-medium text-gray-600',
    labelHint: 'pl-1 font-normal text-gray-400',
    input: 'w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
    textarea: 'w-full min-h-[80px] px-2 py-1 border border-gray-300 rounded text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
    select: 'w-full max-w-sm px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
    pickedList: 'flex flex-col gap-1',
    pickedItem: 'flex flex-row items-center gap-2 rounded bg-white border border-gray-200 px-2 py-1 text-sm font-mono text-gray-800 max-w-sm',
    pickedName: 'flex-1 truncate',
    formActions: 'flex flex-row items-center gap-2',
}
