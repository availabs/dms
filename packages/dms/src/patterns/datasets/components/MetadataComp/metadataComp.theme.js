// Default column-metadata editor theme (MetadataComp + RenderField + Metadata + RenderAddField) —
// tessera v6, ported 2026-10-07 from src/themes/tessera/design_system_v6/pages/datasets-metadata.html.
// A site theme overrides via `datasets.metadataComp`; project themes keep their pre-v6 look through
// src/themes/_legacy/datasets.js. Several keys gate markup: '' → the pre-v6 structure (see each).
const RULE = 'border-[var(--t-rule)]';
const SECTION = `px-4 py-3 border-t ${RULE}`;

export const metadataCompTheme = {
    // index.jsx — outer container
    // fills the page's bounded height; only the column card scrolls (owner 2026-10-07)
    container: 'flex-1 min-h-0 flex flex-col gap-4',
    searchWrapper: 'flex-none flex flex-col gap-3',
    searchRow: 'w-full',
    searchInputWrap: 'w-full',
    dirtyWarning: 'flex items-start gap-2 t-proseSM text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded-md px-3 py-2',
    dirtyWarningIcon: 'size-4 mt-0.5 flex-none',
    // shrinks + scrolls when the columns don't fit; natural height otherwise
    fieldListScroll: `min-h-0 overflow-y-auto scrollbar-sm rounded-lg border ${RULE} bg-[var(--t-panel)]`,
    addFieldWrapper: 'flex-none max-w-md',

    // RenderField.jsx — field rows
    pkBadge: `t-metaXS text-[var(--t-graphite)] bg-[var(--t-panel)] border ${RULE} rounded px-1 py-px`,
    fieldRow: `border-t ${RULE} first:border-t-0`,
    // expanded row: outlined, neutral well body (no blue). Same box as a closed row (same border-t, no
    // margin) so expanding never shifts it (owner 2026-10-07); the outline is an inset `outline` — painted
    // over the children (an inset ring is a box-shadow, hidden under their backgrounds) and takes no space.
    fieldRowOpen: `border-t ${RULE} first:border-t-0 outline outline-1 -outline-offset-1 outline-[var(--t-rule-strong)]`,
    fieldRowEven: '',
    fieldRowOdd: 'bg-[var(--t-well)]',
    fieldHeader: 'flex items-end gap-3 px-4 py-3',
    fieldHeaderOpen: 'flex items-end gap-3 px-4 py-3 bg-[var(--t-panel)]',
    gripCol: 'flex flex-col items-center gap-1 pb-2 text-[var(--t-pencil)]',   // badges + drag handle
    dragHandle: 'size-4 cursor-grab',
    dragHandleSvg: 'size-4',
    fieldControls: 'flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-start',
    // same padding as the UI.Input / column-type select beside it (py-2.5 + 1px border around a 20px
    // line — the icon is size-4 + my-0.5), so all three are one height (owner 2026-10-07). 2026-10-14: fields are
    // 32px (ui-control-fields.md), so the toggle is a 32px square.
    advancedToggle: `self-end size-8 inline-flex items-center justify-center rounded-md border ${RULE} text-[var(--t-graphite)] hover:bg-[var(--t-well)] hover:text-[var(--t-ink)] cursor-pointer`,
    advancedToggleOpen: 'self-end size-8 inline-flex items-center justify-center rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-well)] text-[var(--t-ink)] cursor-pointer',
    advancedToggleIcon: 'MenuDots',       // '' → the toggle shows "..."
    advancedToggleIconOpen: 'CaretDown',
    advancedToggleIconClass: 'size-4 my-0.5',
    advancedPanel: `border-t ${RULE} bg-[var(--t-well)]`,
    advancedSwitchRow: 'flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3',
    advancedDescRow: SECTION,
    descEditor: `border ${RULE} rounded-md bg-[var(--t-panel)] overflow-hidden`,
    descBgColor: 'var(--t-panel)',          // lexical EditComp bgColor (inline style)
    buttonSelectStyle: 'segmented',         // UI.ButtonSelect named style ('' → its default)
    typeSelectStyle: 'input',                 // UI.MultiSelect named style for column type ('' → its default)
    tabsStyle: 'compact',                   // UI.Tabs named style for the lookup editor ('' → its default)

    // Sub-inputs
    inputWrapper: 'flex flex-col gap-1.5 min-w-0',
    labelUpperCase: 't-metaXS text-[var(--t-pencil)]',
    labelHint: 'ml-1 t-proseXS normal-case tracking-normal text-[var(--t-pencil)]',   // '' → no hint

    // Options tags
    optionsWrapper: `${SECTION} flex flex-col gap-2`,
    optionsInner: 'flex flex-col gap-2',
    optionsList: 'flex flex-wrap gap-1.5',
    optionTag: `inline-flex items-center gap-1 t-proseXS text-[var(--t-ink)] bg-[var(--t-panel)] border ${RULE} rounded-full pl-2.5 pr-1 py-0.5`,
    optionTagLabel: 'cursor-pointer hover:underline',
    optionRemove: 'size-4 rounded-full inline-flex items-center justify-center text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',
    optionRemoveIcon: 'XMark',              // '' → "x"
    optionRemoveIconClass: 'size-3',
    optionFormRow: 'flex items-stretch gap-2 max-w-md',
    optionEditRow: 'grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start p-2 rounded-md bg-[var(--t-panel)]',

    // Buttons pick their look by UI.Button activeStyle (primary / action / danger / dangerSolid). In
    // FieldSet grids they also get metadataFieldTheme; metadataFieldLabel '' → the FieldSet's own wrapper (pre-v6).
    btnIcon: 'size-3.5',
    removeColumnIcon: 'TrashCan',           // '' → the row's remove button reads "delete", no icon

    // Delete column / remove primary key modals (plain UI.Modal on every theme — owner 2026-10-14 dropped
    // the project themes' red `deleteModalBorder`)
    deleteTitle: 'text-left t-displaySM text-[var(--t-ink)]',
    deleteMessage: 'text-left mt-2 t-proseSM text-[var(--t-graphite)]',
    emphasis: 'font-medium text-[var(--t-ink)]',
    modalFooter: 'mt-5 flex justify-end gap-2',   // '' → no footer / cancel button (action button only)
    deleteWrapper: `${SECTION} flex justify-end`,

    // Mapped options / metadata grids
    mappedWrapper: `${SECTION} flex flex-col gap-2`,
    mappedGrid: 'grid grid-cols-2 md:grid-cols-5 gap-2 items-end',
    metadataFieldTheme: 'flex flex-col gap-1.5',
    metadataFieldLabel: 't-metaXS text-[var(--t-pencil)]',   // FieldSet label ('' → the field theme's own)
    metaWrapper: `${SECTION} flex flex-col gap-2`,
    customGrid4: 'grid grid-cols-2 md:grid-cols-4 gap-2 items-end',
    // fixed button columns so the add row's inputs line up with the key/value rows above it
    customGrid6: 'grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem_5.5rem] gap-2 items-end',
    customList: 'flex flex-col gap-2',      // wraps the key/value rows ('' → plain block, pre-v6)
    metadataHeader: 'flex items-center gap-2',
    metadataHeaderLabel: 't-metaXS text-[var(--t-pencil)] flex-1',

    // RenderAddField.jsx — add row
    addFieldRow: 'flex items-stretch gap-2',
    addFieldInputWrap: 'flex-1 min-w-0',
    addFieldError: 'mt-1 t-proseXS text-[var(--t-brick)]',
    addButtonIcon: 'size-3.5',
    addButtonContent: 'flex items-center gap-1.5 text-nowrap',
}
