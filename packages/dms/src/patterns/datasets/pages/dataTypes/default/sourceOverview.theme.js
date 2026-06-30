// Default (un-branded) source Overview theme. A site theme overrides via
// `datasets.sourceOverview` (see src/themes/transportny for the branded version).
// Layout: content band → 12-col grid (main col-8: Description + Columns;
// side col-4: At-a-glance, Categories, Versions).
export const sourceOverviewTheme = {
    // grid — full-width with px-6 to align with the breadcrumb/header (also px-6); the gray
    // band + bottom-fill live on the SourcePage `body` band, so no band/max-width here.
    grid:        'w-full px-6 py-8 grid grid-cols-12 gap-6',
    mainCol:     'col-span-12 lg:col-span-8 space-y-6',
    sideCol:     'col-span-12 lg:col-span-4 space-y-6',

    // shared card eyebrow + corner edit pencil
    eyebrow:   'text-xs uppercase tracking-wide text-gray-400 mb-2',
    editBtn:   'absolute top-3 right-3 size-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 hover:text-blue-600 cursor-pointer',
    editIcon:  'size-3.5',
    adminPill: 'ml-1.5 inline-flex items-center px-1.5 h-4 rounded text-[9px] bg-gray-900 text-white uppercase tracking-wide',

    // Description card
    descCard:  'relative rounded-lg border border-gray-200 bg-white shadow-sm p-6',
    descProse: 'text-sm leading-7 text-gray-700 space-y-3 max-w-[68ch]',

    // Columns card
    colCard:        'rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden',
    colHeader:      'h-11 px-4 flex items-center gap-2 border-b border-gray-200 bg-gray-50',
    colHeaderTitle: 'text-sm font-medium text-gray-700 flex-1',
    colEditBtn:     'h-7 inline-flex items-center px-2.5 rounded-md border border-gray-200 bg-white text-gray-600 text-xs uppercase tracking-wide hover:bg-gray-50',
    colMetaLink:    'h-7 inline-flex items-center px-2.5 rounded-md text-xs uppercase tracking-wide text-blue-700 hover:bg-gray-50',
    table:          'w-full text-left border-collapse',
    theadRow:       'bg-gray-50 border-b border-gray-200',
    th:             'px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-medium',
    thReq:          'px-4 py-2 text-xs uppercase tracking-wide text-gray-500 font-medium text-center',
    tr:             'border-b border-gray-100',
    trAlt:          'border-b border-gray-100 bg-gray-50/40',
    tdName:         'px-4 py-2 font-mono text-[12px] text-gray-900',
    tdType:         'px-4 py-2 text-sm text-gray-500',
    tdDesc:         'px-4 py-2 text-sm text-gray-700',
    tdReq:          'px-4 py-2 text-center',
    reqYes:         'text-emerald-500',
    reqNo:          'text-gray-300',
    tdEmpty:        'px-4 py-6 text-center text-sm text-gray-400',
    colFooter:      'w-full px-4 py-2 border-t border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400 hover:text-gray-700',

    // At a glance card
    glanceCard:      'rounded-lg border border-gray-200 bg-white shadow-sm p-4',
    glanceList:      'space-y-1.5 text-sm',
    glanceRow:       'flex justify-between items-center',
    glanceLabel:     'text-gray-500',
    glanceValue:     'text-gray-900',
    glanceValueNum:  'text-gray-900 font-mono tabular-nums',
    glanceValueEdit: 'flex items-center gap-1 text-gray-900',
    glanceInput:     'w-28 text-right text-sm rounded border border-gray-300 px-1 py-0.5',
    glanceEditBtn:   'inline-flex items-center justify-center size-5 rounded text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 cursor-pointer',
    glanceEditIcon:  'size-3',

    // Categories card
    catCard: 'relative rounded-lg border border-gray-200 bg-white shadow-sm p-4',
    catHelp: 'mt-2 text-xs text-gray-500 leading-relaxed',
    catSwatches: ['#1F3F8F', '#B45309', '#37576B', '#047857', '#0F2D4D', '#7C3AED', '#0E7490', '#9D174D'],
    catPills:    'flex flex-wrap gap-1.5 items-center',
    catPill:     'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11.5px] text-gray-700 bg-gray-100',
    catDot:      'size-1.5 rounded-full',
    catSubPill:  'inline-flex items-center px-2 py-0.5 rounded text-[11.5px] text-gray-500 bg-gray-50 border border-gray-200',
    catEmpty:    'text-sm text-gray-400',

    // Versions card
    verCard:               'rounded-lg border border-gray-200 bg-white shadow-sm',
    verHeader:             'h-11 px-3 flex items-center gap-2 border-b border-gray-200 bg-gray-50 rounded-t-lg',
    verHeaderTitle:        'text-sm font-medium text-gray-700 flex-1',
    verHeaderCount:        'text-xs uppercase tracking-wide text-gray-500',
    verList:               'divide-y divide-gray-100',
    verEmpty:              'p-4 text-sm text-gray-400',
    verRow:                'p-3',
    verRowTop:             'flex items-center gap-2',
    verRowMain:            'flex-1 min-w-0',
    verNameRow:            'flex items-center gap-2',
    verName:               'text-sm font-medium text-gray-900 hover:text-blue-700',
    verCurrentBadge:       'inline-flex items-center px-1.5 h-4 rounded border border-emerald-300 bg-emerald-50 text-[9px] uppercase tracking-wide text-emerald-700',
    verMeta:               'text-xs uppercase tracking-wide text-gray-400 mt-0.5',
    verDownloadWrap:       'relative shrink-0',
    verDownloadBtn:        'h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-gray-300 bg-white text-gray-700 text-xs uppercase tracking-wide hover:bg-gray-50',
    verDownloadBtnPrimary: 'h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-blue-700 text-white text-xs uppercase tracking-wide hover:bg-blue-800',
    verDownloadIcon:       'size-3.5',
    verCaretIcon:          'size-3',
    verMenu:               'absolute right-0 top-full mt-1 z-20 w-48 p-1 rounded-md border border-gray-200 bg-white shadow-lg',
    verMenuItem:           'flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-gray-900 hover:bg-gray-50',
    verMenuIcon:           'size-3.5 text-gray-400',
    verMenuLabel:          'flex-1',
}
