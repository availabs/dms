// DAMA version controls (create / delete download, cache PM tiles, delete view) + their modals —
// tessera v6, 2026-10-07, from src/themes/tessera/design_system_v6/pages/datasets-version.html.
// Neutral actions + brick for destructive ones, no accent colour (owner direction on the metadata
// page, 2026-10-07). Pre-v6 values frozen in src/themes/_legacy/datasets.js `externalVersionControls`.
// Icon keys go through UI.Icon, which also renders Font Awesome class strings (the legacy values).
const RULE = 'border-[var(--t-rule)]';
const CARD = `rounded-lg border ${RULE} bg-[var(--t-panel)]`;
const BTN = 'h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md t-proseSM cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const ACTION = `${BTN} border ${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const DANGER = `${BTN} border border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const CHECK = 'size-4 accent-[var(--t-ink)] cursor-pointer disabled:cursor-not-allowed';

export const externalVersionControlsTheme = {
    // Main wrapper (inside the version page's controls card)
    wrapper: 'w-full',
    adminControls: 'w-full flex flex-col gap-2',
    sectionLabel: 't-metaXS text-[var(--t-pencil)]',          // "downloads" eyebrow ('' → none)
    linkClass: ACTION,
    deleteViewLink: `w-full mt-2 ${DANGER}`,
    downloadIcon: 'Download',
    pmTilesIcon: 'MapLayers',
    trashIcon: 'TrashCan',
    btnIconClass: 'size-3.5',

    // DownloadModalCheckbox
    checkboxRow: 'flex items-center gap-2 min-w-0',
    checkboxInput: CHECK,
    checkboxLabel: 't-proseSM text-[var(--t-ink)] truncate',

    // DownloadModalGroupedBy
    groupedByWrapper: `md:col-span-2 ${CARD} p-3 flex flex-col gap-2 text-left`,
    groupedByTitle: 'flex items-center',
    groupedBySubTitle: 't-proseXS text-[var(--t-pencil)]',

    // DownloadModalGroupColumnSelect
    groupColumnSelectRow: 'flex flex-col gap-1.5 max-w-xs',
    groupColumnSelectLabel: 't-proseXS text-[var(--t-graphite)]',
    groupColumnSelect: 'h-8 w-full px-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)]',

    // DownloadModalGroupByToggle
    groupByToggleWrapper: '',
    groupByToggleRow: 'flex items-center gap-2',
    groupByToggleInput: CHECK,
    groupByToggleLabel: 't-proseSM text-[var(--t-ink)]',
    groupByToggleInputNo: `ml-4 ${CHECK}`,

    // DownloadModalCheckboxGroup
    checkboxGroupWrapper: `${CARD} p-3 flex flex-col gap-1.5 text-left max-h-72 overflow-y-auto`,
    checkboxGroupTitleRow: 'flex items-center gap-2',
    checkboxGroupTitleText: 't-metaXS text-[var(--t-pencil)] flex-1',
    checkboxGroupValidRow: 'flex items-center gap-1 t-proseXS text-[var(--t-pencil)]',
    validIcon: 'CircleCheck',
    invalidIcon: 'CircleX',

    // Create Download Modal
    createModalStyle: 'large',   // UI.Modal named style (2026-10-14; was className max-w-2xl, dropped by the Modal lock)
    createModalHeader: 'flex items-center gap-3 text-left',
    createModalIconWrapper: 'size-9 flex-none rounded-full bg-[var(--t-well)] text-[var(--t-graphite)] flex items-center justify-center',
    createModalIconClass: 'size-4',
    createModalTitleWrapper: 'min-w-0',
    createModalTitle: 't-displaySM text-[var(--t-ink)]',
    createModalBody: 'grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3 mt-4',
    createModalFooter: 'mt-5 flex flex-row-reverse flex-wrap gap-2',

    // Delete Download Modal
    deleteModalHeader: 'flex items-center gap-3 text-left',
    deleteModalIconWrapper: 'size-9 flex-none rounded-full bg-[var(--t-brick-soft)] text-[var(--t-brick)] flex items-center justify-center',
    deleteModalIcon: 'TrashCan',
    deleteModalIconClass: 'size-4',
    deleteModalTitleWrapper: 'min-w-0',
    deleteModalTitle: 't-displaySM text-[var(--t-ink)]',
    deleteModalMessage: 'mt-3 t-proseSM text-[var(--t-graphite)] text-left',
    deleteModalFooter: 'mt-5 flex flex-row-reverse flex-wrap gap-2',

    // PmTilesModal
    pmTilesModalStyle: 'large',   // UI.Modal named style (2026-10-14; was className 'max-w-2xl'); '' → the default modal
    pmTilesModalWrapper: 'text-left',
    pmTilesModalHeader: 'flex items-center gap-3 text-left mb-4',
    pmTilesModalTitle: 'Cache PM tiles',   // header (icon + title, the create-modal header keys); '' → no header (pre-v6)
    pmTilesModalContent: 'pb-4',
    pmTilesModalGrid: 'grid grid-cols-1 md:grid-cols-3 gap-3',
    pmTilesModalFooter: 'flex justify-end gap-2',
    pmTilesModalCloseCol: '',
    pmTilesModalCacheCol: '',

    // PmTilesProgressWindow
    progressWindowWrapper: `${CARD} p-3 flex flex-col gap-1 t-metaMD text-[var(--t-graphite)] max-h-60 overflow-y-auto`,
    progressWindowHeader: 'flex items-center gap-2 mb-1',
    progressWindowTitle: 't-metaXS text-[var(--t-pencil)] flex-1',
    eventItemWrapper: 'break-all',

    // Misc
    selectOption: '',
    iconSuccess: 'size-3.5 text-[var(--t-go)]',
    iconError: 'size-3.5 text-[var(--t-brick)]',
    calcColumnWarning: 't-proseXS text-[var(--t-amber)]',
    layerGroupIcon: 'Download',     // create-download modal header icon
    colSpan2: 'md:col-span-2',
}
