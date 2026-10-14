// Default source Overview theme — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-source.html. A site theme overrides via
// `datasets.sourceOverview`; project themes keep their pre-v6 look through
// src/themes/_legacy/datasets.js.
// Layout: 12-col grid (main col-8: Description + Columns; side col-4: At a glance, Categories,
// Versions). Also styles components/AuthorityControl.jsx (the verAuth* keys).
const CARD = 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)]';

export const sourceOverviewTheme = {
    grid:        'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6 grid grid-cols-12 gap-5',
    mainCol:     'col-span-12 lg:col-span-8 flex flex-col gap-5 min-w-0',
    sideCol:     'col-span-12 lg:col-span-4 flex flex-col gap-5 min-w-0',

    // shared card eyebrow + corner edit pencil
    eyebrow:   't-metaXS text-[var(--t-pencil)] mb-2',
    editBtn:   'absolute top-3 right-3 size-7 inline-flex items-center justify-center rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    editIcon:  'size-3.5',
    adminPill: 'ml-1.5 inline-flex items-center px-1 rounded border border-dashed border-[var(--t-rule-strong)] t-metaXS text-[var(--t-graphite)]',

    // Description card
    descCard:  `relative ${CARD} p-5`,
    descProse: 't-prose text-[var(--t-ink)] space-y-3 max-w-[68ch]',

    // Columns card
    colCard:        `${CARD} overflow-hidden`,
    colHeader:      'px-4 py-3 flex items-center gap-3 border-b border-[var(--t-rule)]',
    colHeaderTitle: 't-proseSM font-medium text-[var(--t-ink)] flex-1',
    colEditBtn:     'inline-flex items-center gap-1 t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]',
    colMetaLink:    't-metaXS text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]',
    // the card clips (rounded corners) — the table scrolls sideways inside it
    tableScroll:    'overflow-x-auto scrollbar-xs',
    // Columns summary — UI.Table named style + per-column px widths (2026-10-14, ui-control-tables.md)
    tableStyle:     'list',
    columnSizes:    { type: 130, required: 70 },
    nameCell:       't-metaMD text-[var(--t-ink)]',
    typeCell:       't-metaMD text-[12px] text-[var(--t-graphite)]',
    // the description is a Lexical view: size its paragraphs to the table, not the page prose
    descCell:       'min-w-0 t-proseSM text-[var(--t-graphite)] [&_p]:!mb-0 [&_p]:!text-[13px] [&_p]:!leading-[1.5] [&_p]:!text-[var(--t-graphite)]',
    reqYes:         'text-[var(--t-cobalt)]',
    reqNo:          'text-[var(--t-pencil)]',
    // file_upload: File card body (reuses colCard/colHeader chrome)
    fileBody:       'px-4 py-3 space-y-3',
    fileRow:        'space-y-1',
    fileName:       't-proseSM font-medium text-[var(--t-ink)]',
    fileUrl:        'block t-metaMD text-[12px] text-[var(--t-cobalt)] hover:underline break-all',
    fileEmpty:      'py-3 text-center t-proseSM text-[var(--t-pencil)]',
    colFooter:      'w-full px-4 py-2.5 t-metaXS text-[var(--t-cobalt)] hover:bg-[var(--t-well)] text-left cursor-pointer',

    // At a glance card
    glanceCard:      `${CARD} p-4`,
    glanceList:      'divide-y divide-[var(--t-rule)]',
    glanceRow:       'flex justify-between items-center gap-3 py-2',
    glanceLabel:     't-proseSM text-[var(--t-graphite)]',
    glanceValue:     't-proseSM text-[var(--t-ink)] text-right',
    glanceValueNum:  't-metaMD text-[var(--t-ink)] tabular-nums',
    glanceValueEdit: 'flex items-center gap-1.5',
    glanceInput:     'w-36 text-right t-proseSM rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] px-2 py-0.5 outline-none focus:border-[var(--t-cobalt)]',
    glanceEditBtn:   'inline-flex items-center justify-center size-5 rounded text-[var(--t-pencil)] hover:text-[var(--t-ink)] opacity-0 group-hover:opacity-100 cursor-pointer',
    glanceEditIcon:  'size-3',

    // Categories card
    catCard: `relative ${CARD} p-4`,
    catHelp: 'mt-3 t-proseXS text-[var(--t-pencil)]',
    // Promotion — deliberately quiet: a normal next step, not an error state.
    promoBox: 'mt-3 pt-3 border-t border-dashed border-[var(--t-rule-strong)]',
    promoTitle: 't-metaXS text-[var(--t-amber)]',
    promoHint: 't-proseSM text-[var(--t-graphite)] mt-1',
    promoBlockers: 'mt-2 space-y-1',
    promoBlocker: 't-proseSM text-[var(--t-ink)] flex items-start gap-2 before:content-["•"] before:text-[var(--t-amber)]',
    promoBtn: 'mt-3 h-8 inline-flex items-center px-3.5 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] cursor-pointer',
    promoBtnDisabled: 'mt-3 h-8 inline-flex items-center px-3.5 rounded-md t-proseSM font-medium bg-[var(--t-well)] text-[var(--t-pencil)] cursor-not-allowed',
    demoteBtn: 'mt-2 t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-amber)] cursor-pointer',
    catSwatches: ['#0A46D8', '#B97516', '#1F8A4C', '#CA3214', '#50545C', '#6B4FBB', '#0F7C8C', '#9C3B6E'],
    catPills:    'flex flex-wrap gap-1.5 items-center',
    catPill:     'inline-flex items-center gap-1 t-proseXS text-[var(--t-ink)] bg-[var(--t-well)] rounded px-1.5 py-0.5',
    catDot:      'size-1.5 rounded-full',
    catSubPill:  'inline-flex items-center t-proseXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded px-1.5 py-0.5',
    catEmpty:    't-proseSM text-[var(--t-pencil)]',

    // Versions card
    verCard:               CARD,
    verHeader:             'px-4 py-3 flex items-center gap-2 border-b border-[var(--t-rule)]',
    verHeaderTitle:        't-proseSM font-medium text-[var(--t-ink)] flex-1',
    verHeaderCount:        't-metaXS text-[var(--t-pencil)]',
    verList:               'divide-y divide-[var(--t-rule)]',
    verEmpty:              'px-4 py-4 t-proseSM text-[var(--t-pencil)]',
    verRow:                'px-4 py-3',
    verRowTop:             'flex items-start gap-3',
    verRowMain:            'flex-1 min-w-0',
    verNameRow:            'flex flex-wrap items-center gap-1.5',
    verName:               't-proseSM font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]',
    verCurrentBadge:       't-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded px-1.5 py-0.5',
    verMeta:               't-metaXS text-[var(--t-pencil)] mt-1',
    verDownloadWrap:       'relative shrink-0',
    verDownloadBtn:        'h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseXS font-medium text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
    verDownloadBtnPrimary: 'h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-transparent t-proseXS font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] cursor-pointer',
    verDownloadIcon:       'size-3.5',
    verCaretIcon:          'size-3',
    verMenu:               `absolute right-0 top-full mt-1 z-20 w-48 p-1 ${CARD} shadow-[var(--t-shadow-drag)]`,
    verMenuItem:           'flex items-center gap-2 px-2.5 py-1.5 rounded t-proseSM text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    verMenuIcon:           'size-3.5 text-[var(--t-pencil)]',
    verMenuLabel:          'flex-1',

    // ── authoritative views (components/AuthorityControl.jsx) ──
    verAuthBadge:          't-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] rounded px-1.5 py-0.5',
    verUndecidedChip:      't-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded px-1.5 py-0.5',
    verAuthWrap:           'mt-1.5',
    verAuthNote:           'mt-1 border-l-2 border-[var(--t-go)] pl-3 t-proseXS text-[var(--t-graphite)]',
    verAuthNoteText:       '',
    verAuthNoteBy:         'text-[var(--t-pencil)]',
    verAuthActions:        'mt-1',
    verAuthLink:           't-metaXS text-[var(--t-pencil)] hover:text-[var(--t-cobalt)] disabled:opacity-40 cursor-pointer',
    verAuthForm:           'mt-2 p-3 rounded-md bg-[var(--t-well)] space-y-2',
    verAuthHint:           't-proseXS text-[var(--t-graphite)]',
    verAuthCheck:          'flex items-start gap-2 t-proseXS text-[var(--t-graphite)]',
    verAuthKeys:           'space-y-1.5',
    verAuthKeyRow:         'flex items-center gap-2',
    verAuthInput:          'h-7 flex-1 min-w-0 px-2 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseXS text-[var(--t-ink)] outline-none focus:border-[var(--t-cobalt)]',
    verAuthTextarea:       'w-full px-2 py-1.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseXS text-[var(--t-ink)] outline-none focus:border-[var(--t-cobalt)]',
    verAuthError:          't-proseXS text-[var(--t-brick)]',
    verAuthButtons:        'flex items-center gap-3',
    verAuthSave:           'h-7 inline-flex items-center px-3 rounded-md t-proseXS font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] cursor-pointer',
    verAuthSaveDisabled:   'h-7 inline-flex items-center px-3 rounded-md t-proseXS font-medium bg-[var(--t-panel)] text-[var(--t-pencil)] cursor-not-allowed',
    verAuthCancel:         't-metaXS text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',

    // ── view lineage + delete version (components/LineageControls.jsx, default/outputs.jsx) ──
    verInputsChangedChip:  'inline-flex items-center px-1.5 h-4 rounded border border-violet-300 bg-violet-50 text-[9px] uppercase tracking-wide text-violet-800',
    linCard:               'rounded-lg border border-gray-200 bg-white shadow-sm p-3 space-y-3',
    linSection:            'space-y-1',
    linLabel:              'text-xs uppercase tracking-wide text-gray-500',
    linList:               'flex flex-col gap-1',
    linItem:               'flex items-baseline gap-2 text-sm text-gray-800',
    linLink:               'text-sm text-blue-700 hover:underline',
    linMeta:               'text-xs text-gray-400',
    linMissing:            'text-sm text-gray-400',
    // External (DAMA) Delete version — buttons are UI.Button roles (dangerFull / action / dangerSolid), 2026-10-14
    verDeleteIcon:         'TrashCan',        // '' → no icon
    verDeleteIconClass:    'size-3.5',
    verDeleteDialog:       'space-y-3 p-1',
    verDeleteTitle:        't-proseSM font-medium text-[var(--t-ink)]',
    verDeleteText:         't-proseSM text-[var(--t-graphite)] leading-snug',
    verDeleteRefusal:      't-proseSM text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-md p-2 leading-snug',
    verDeleteButtons:      'flex items-center justify-end gap-2',
}
