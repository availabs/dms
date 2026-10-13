// Validate (components/ValidateComp.jsx — the internal source Validate tab) — tessera v6, 2026-10-07,
// from src/themes/tessera/design_system_v6/pages/datasets-internal.html (#validate). No accent colour
// (owner direction 2026-10-07); brick marks invalid, go marks valid. Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `validateComp`. The invalid-rows spreadsheet itself is the page
// pattern's Spreadsheet (Controls / RenderFilters / DataWrapper) and keeps that theme.
const RULE = 'border-[var(--t-rule)]';
const BTN = 'h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md t-proseSM cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const ACTION = `${BTN} border ${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;

export const validateCompTheme = {
    // Main layout
    container: 'w-full',
    innerWrapper: 'w-full flex flex-col gap-4',
    headerRow: 'flex flex-wrap items-center justify-between gap-3',

    // Stat boxes — "Label: <value>" markup; flex-col-reverse puts the number on top
    statGroup: `flex items-stretch divide-x divide-[var(--t-rule)] border ${RULE} rounded-lg bg-[var(--t-panel)] overflow-hidden [&>*:nth-child(2)>span]:text-[var(--t-brick)] [&>*:nth-child(3)>span]:text-[var(--t-go)]`,
    statBox: 'flex flex-col-reverse px-4 py-2 t-metaXS text-[var(--t-pencil)]',
    statValue: 'block mb-1 text-xl font-semibold leading-none tabular-nums text-[var(--t-ink)] normal-case tracking-normal font-sans',

    // Re-validate button
    revalidateButton: ACTION,
    revalidateButtonError: `${BTN} h-auto py-1.5 text-left t-metaMD border border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] max-w-xl break-all`,

    // Loading / section header ("Invalid Rows")
    sectionHeader: `w-full flex items-center gap-2 pt-2 pb-1 border-b ${RULE} t-proseSM font-medium text-[var(--t-ink)]`,

    // RenderMassUpdater modal
    modalBackdrop: 'fixed inset-0 h-full w-full z-[100] content-center bg-[var(--t-scrim)]',
    modalPanel: `w-full max-w-xl max-h-[80vh] overflow-auto scrollbar-sm flex flex-col gap-3 p-5 bg-[var(--t-panel)] border ${RULE} shadow-[var(--t-shadow-drag)] place-self-center rounded-lg`,
    modalHeader: 'flex items-start gap-2',
    modalEyebrow: 't-metaXS text-[var(--t-pencil)]',
    modalCloseRow: 'order-last',
    modalCloseButton: 'size-7 rounded-md inline-flex items-center justify-center text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    modalTitle: 'flex-1 t-displaySM text-[var(--t-ink)]',
    modalBody: 'flex flex-col',
    modalGridHeader: 'grid grid-cols-[1fr_1fr_auto] gap-3 pb-1 t-metaXS text-[var(--t-pencil)]',
    modalGridRow: `group grid grid-cols-[1fr_1fr_auto] items-center gap-3 py-2 border-t ${RULE} t-proseSM text-[var(--t-ink)]`,
    modalGridRowOdd: 'bg-[var(--t-well)] -mx-5 px-5',
    modalInvalidBadge: 'ml-1.5 t-metaXS text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-full px-1.5',
    modalResetBtn: 't-metaXS text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
    modalFooter: 'flex justify-end',
    modalUpdateButton: `${ACTION} font-medium`,

    // Column header badges (spreadsheet controls)
    columnHeader: 'truncate select-none',
    columnHeaderWithErrors: 'truncate select-none min-w-[15px] text-[var(--t-brick)]',
    errorBadgeGroup: 'inline-flex items-center ml-1.5 gap-1',
    errorCount: 'inline-flex items-center justify-center t-metaXS text-[var(--t-accent-ink)] bg-[var(--t-brick)] rounded-full px-1.5 min-w-[18px] cursor-pointer',
    filterToggle: 'inline-flex items-center text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer',
    filterIcon: '',
}
