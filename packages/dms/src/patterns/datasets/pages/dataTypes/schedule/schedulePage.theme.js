// Schedule page (schedule/SchedulePage.jsx): the schedule list (ScheduleRow) and the new / edit form
// (ScheduleForm). It was unthemed (module-level Tailwind strings) until 2026-10-15 (ui-raw-html-to-ui-components.md,
// owner: theme it in the raw-HTML pass). v6 per design_system_v6/pages/datasets-schedule.html, schedule tab
// (scripts/schedule.py). The pre-theme strings are frozen for project themes in src/themes/_legacy/datasets.js
// `schedulePage`. Controls are UI components: buttons pick a UI.Button role (`*ButtonStyle`), fields are
// UI.FieldLabel / UI.Input / UI.Select, the boolean param is ColumnTypes.checkbox with `rowLabel`.
const CARD = 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg';
const EYEBROW = 't-metaXS text-[var(--t-pencil)]';
const LINK = 't-proseSM text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]';   // links in text stay cobalt

export const schedulePageTheme = {
    page: 'w-full flex flex-col gap-4',
    notExternal: `${CARD} px-4 py-3 t-proseSM text-[var(--t-pencil)]`,
    header: 'flex items-center gap-3',
    headerTitle: 't-proseSM text-[var(--t-graphite)]',
    headerName: 'font-medium text-[var(--t-ink)]',
    spacer: 'grow',
    newButtonStyle: 'primary',          // UI.Button role
    newIcon: 'Plus',                    // '' → no icon
    buttonIcon: 'size-3.5',
    loadError: 't-proseSM text-[var(--t-brick)]',
    listCard: `${CARD} divide-y divide-[var(--t-rule)]`,
    listNote: 'px-4 py-3 t-proseSM text-[var(--t-pencil)]',     // loading
    listEmpty: 'px-4 py-3 t-proseSM text-[var(--t-graphite)]',

    // ── ScheduleRow ──
    row: 'px-4 py-3 flex flex-col gap-2',
    rowHead: 'flex flex-wrap items-center gap-x-3 gap-y-1',
    rowLabel: 't-proseSM font-medium text-[var(--t-ink)]',
    rowHuman: 't-proseSM text-[var(--t-graphite)]',
    rowCron: 't-metaXS text-[var(--t-pencil)]',
    rowTz: 't-metaXS text-[var(--t-pencil)]',
    rowMeta: 'flex flex-wrap items-center gap-x-5 gap-y-2 t-proseSM text-[var(--t-graphite)]',
    metaLabel: 'text-[var(--t-pencil)]',
    runLink: `${LINK} ml-1`,
    rowActions: 'flex gap-2',
    runButtonStyle: 'primary',
    runIcon: '',                        // '' → no icon (the mockup's Play is in tessera v6's icon set, not the library's)
    editButtonStyle: 'action',
    deleteButtonStyle: 'danger',
    fireResult: 'w-fit t-proseXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded px-2 py-1',
    fireType: 'font-semibold',

    // ── ScheduleForm ──
    formCard: `${CARD} p-5 flex flex-col gap-4`,
    formTitle: 't-displaySM text-[var(--t-ink)]',
    field: '',                          // one caption + control
    loaderPath: 't-proseXS text-[var(--t-pencil)] mt-1',
    cadenceRow: 'flex flex-wrap items-center gap-2',
    cadenceSeg: 'inline-flex flex-wrap bg-[var(--t-well)] rounded-md p-0.5',
    cadenceButtonStyle: 'segment',      // UI.Button roles for the preset buttons
    cadenceButtonStyleOn: 'segmentOn',
    cronField: 'w-40',
    cronText: 't-metaXS text-[var(--t-pencil)]',
    previewWrap: 'mt-1.5',
    preview: 't-proseXS text-[var(--t-graphite)]',
    previewHuman: 'font-medium text-[var(--t-ink)]',
    previewNext: 'ml-2 text-[var(--t-pencil)]',
    previewCustom: 't-proseXS text-[var(--t-amber)]',
    twoCol: 'grid grid-cols-1 md:grid-cols-2 gap-3',
    twoColItem: 'min-w-0',
    paramsSection: 'pt-3 border-t border-[var(--t-rule)] flex flex-col gap-2',
    paramsTitle: EYEBROW,
    paramsGrid: 'grid grid-cols-1 md:grid-cols-2 gap-3',
    paramDesc: 'normal-case text-[var(--t-pencil)]',   // the descriptor note inside a param's caption
    boolRow: 'flex items-center gap-2 self-end min-h-8',
    boolDesc: 't-proseXS text-[var(--t-pencil)]',
    error: 't-proseXS text-[var(--t-brick)]',
    formActions: 'flex gap-2',
    saveButtonStyle: 'primary',
    cancelButtonStyle: 'action',
}
