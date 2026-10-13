// The QA install's Configure tab (configureTab.jsx) and its datasets card (QaPatternSettings in
// default/settings.jsx, also on the Overview). Its cards, save bar, buttons and fields reuse the
// Overview's keys (settingsEditor); these are the QA-only parts, from the design pass's
// tessera design_system_v6 pages/qa-configure.html. Registered as `qaConfigure` in
// patterns/admin/defaultTheme.js.
export const qaConfigureTheme = {
    spacer: 'flex-1',
    errorBox: 't-metaSM text-[var(--t-brick)] border border-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-lg px-4 py-2.5',
    note: 'px-4 py-6 t-proseSM text-[var(--t-graphite)]',
    noteCode: 't-metaSM normal-case tracking-normal text-[var(--t-ink)]',

    // header: the Overview's title row, with three figures on the right
    headerMain: 'min-w-0 flex flex-col',
    headerTitleRow: 'flex items-center gap-2.5 min-w-0',
    stats: 'flex items-stretch divide-x divide-[var(--t-rule)] border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] overflow-hidden',
    stat: 'px-4 py-2',
    statValue: 't-displaySM tabular-nums leading-none text-[var(--t-ink)]',
    statValueEmpty: 't-displaySM tabular-nums leading-none text-[var(--t-pencil)]',
    statLabel: 't-metaXS text-[var(--t-pencil)] mt-1.5',

    // save bar: inside the Overview's saveBar / saveBarDirty. The backing sticks with it and is solid,
    // since the dirty bar's amber-soft is translucent and would show the cards scrolling under it.
    saveBarSticky: 'sticky top-0 z-10 rounded-lg bg-[var(--t-paper)]',
    saveBarLine: 'inline-flex items-center gap-2 min-w-0',
    savedIcon: 'w-3.5 h-3.5 text-[var(--t-go)] flex-none',
    dirtyDot: 'size-2 rounded-full bg-[var(--t-amber)] flex-none',
    dirtyCount: 'font-medium',

    // datasets beside the ticket record on a wide screen, stacked on a narrow one
    topRow: 'grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch',
    // the datasets card fills its cell, so it matches the ticket record's height
    topDatasets: 'lg:col-span-5 min-w-0 flex flex-col [&>*]:flex-1',
    topRecord: 'lg:col-span-7 min-w-0',

    // datasets card (QaPatternSettings)
    datasetsCard: 'flex flex-col',
    badgeOk: "inline-flex items-center gap-1.5 t-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] rounded-full px-2 py-0.5 before:content-[''] before:size-1.5 before:rounded-full before:bg-[var(--t-go)]",
    badgeWarn: "inline-flex items-center gap-1.5 t-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded-full px-2 py-0.5 before:content-[''] before:size-1.5 before:rounded-full before:bg-[var(--t-amber)]",
    datasetList: 'divide-y divide-[var(--t-rule)] flex-1',
    datasetRow: 'px-4 py-2 flex items-center gap-3',
    datasetTick: 'w-3.5 h-3.5 text-[var(--t-go)] flex-none',
    datasetRing: 'w-3.5 h-3.5 rounded-full border-[1.5px] border-[var(--t-amber)] flex-none',
    datasetName: 't-proseSM text-[var(--t-ink)] flex-1 min-w-0 truncate',
    datasetSlug: 't-metaSM normal-case tracking-normal text-[var(--t-pencil)] truncate',
    datasetCount: 't-proseXS tabular-nums text-[var(--t-graphite)] w-16 text-right flex-none',
    datasetMissing: 't-proseXS text-[var(--t-amber)] w-16 text-right flex-none',
    datasetNote: 'flex-1 t-proseXS text-[var(--t-graphite)]',
    datasetLink: 't-metaSM text-[var(--t-cobalt)] inline-flex items-center gap-1 hover:underline',
    datasetLinkIcon: 'w-3.5 h-3.5',

    // ticket record, read-only
    recordCard: 'h-full',
    recordTag: 't-metaXS text-[var(--t-pencil)] border border-[var(--t-rule)] rounded-full px-2 py-0.5',
    recordRow: 'px-4 py-3 flex flex-col sm:flex-row gap-2 sm:gap-3',
    recordLabel: 't-metaXS text-[var(--t-pencil)] sm:w-24 flex-none sm:pt-1',
    recordChips: 'flex flex-wrap gap-1.5',
    recordStages: 'flex flex-wrap items-center gap-x-1.5 gap-y-1.5 t-proseXS text-[var(--t-graphite)]',
    stage: 'inline-flex items-center gap-1.5',
    stageMarker: 'size-2 rounded-[2px] flex-none',
    stageSep: 'text-[var(--t-pencil)]',

    // covered sites: grip · on · site · label · short key · pages
    tableScroll: 'overflow-x-auto',
    tableInner: 'min-w-[720px]',
    tableHead: 'grid grid-cols-[28px_52px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_120px] items-center gap-3 px-4 py-2 bg-[var(--t-well)] t-metaXS text-[var(--t-pencil)]',
    row: 'grid grid-cols-[28px_52px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_120px] items-center gap-3 px-4 py-2.5',
    rowWrap: 'flex flex-col border-t border-[var(--t-rule)]',
    grip: 'text-[var(--t-pencil)] cursor-grab',
    gripOff: 'text-[var(--t-rule)]',
    gripIcon: 'w-4 h-4 rotate-90',
    patternCell: 'flex flex-col min-w-0',
    patternName: 't-proseSM !font-medium text-[var(--t-ink)] truncate',
    patternNameOff: 't-proseSM text-[var(--t-graphite)] truncate',
    patternMeta: 't-metaXS normal-case tracking-normal text-[var(--t-pencil)] truncate',
    offNote: 't-proseXS text-[var(--t-pencil)]',
    field: 'block min-w-0',
    // an edited, unsaved field: the amber of the dirty save bar
    fieldDirty: 'block min-w-0 [&_input]:border-[var(--t-amber)]',
    keyLocked: 'min-w-0 inline-flex items-center gap-1.5',
    keyLockIcon: 'w-3.5 h-3.5 text-[var(--t-pencil)] flex-none',
    keyText: 't-metaMD normal-case tracking-normal text-[var(--t-ink)] truncate',
    keyHint: 't-proseXS text-[var(--t-pencil)]',
    limitBtn: 'inline-flex items-center justify-between gap-1 t-proseSM text-[var(--t-ink)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-2.5 py-1 cursor-pointer',
    limitIcon: 'w-3.5 h-3.5 text-[var(--t-pencil)]',
    limitRow: 'flex items-center gap-3 px-4 pb-3 pl-[7.5rem]',
    limitPicker: 'flex-1 min-w-0',
    rowError: 't-metaXS text-[var(--t-brick)] px-4 pb-2 pl-[7.5rem]',

    // features: a placeholder until the switches are built
    featuresCard: 'border border-dashed border-[var(--t-rule-strong)] rounded-lg',
    featuresHeader: 'px-4 py-2.5 flex flex-wrap items-center gap-2',
    featuresGrid: 'px-4 pb-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2',
    featureTile: 'rounded-md border border-[var(--t-rule)] px-3 py-2 flex items-center gap-2',
    featureSwitch: 'w-7 h-4 rounded-full bg-[var(--t-cobalt)] opacity-60 flex-none',
    featureName: 't-proseXS text-[var(--t-graphite)]',
}
