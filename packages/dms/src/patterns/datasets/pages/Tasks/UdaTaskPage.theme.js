export const udaTaskPageTheme = {
    // StatusBadge color map entries
    statusDone: 'bg-green-100 text-green-800',
    statusError: 'bg-red-100 text-red-800',
    statusRunning: 'bg-blue-100 text-blue-800',
    statusQueued: 'bg-gray-100 text-gray-600',
    statusDefault: 'bg-gray-100',
    statusBadge: 'px-2 py-0.5 rounded text-xs font-medium',

    // Task info row
    taskInfoRow: 'flex flex-wrap gap-4 mb-4 text-sm',
    taskInfoLabel: 'text-gray-500',
    taskInfoWorker: 'capitalize',
    taskInfoError: 'text-red-600 w-full',

    // Content pane
    contentWrapper: 'w-full',
    lookupMsg: 'text-gray-400 text-sm py-4',
    notFoundMsg: 'text-gray-400 text-sm py-4',
    noEventsMsg: 'text-gray-400 text-sm py-4',

    // Payload textarea (inside COLUMNS definition)
    payloadTextarea: 'w-full max-h-[150px] overflow-auto text-wrap scrollbar-sm text-xs',
}
