// Theme for the spreadsheet's Actions control (ActionControls.jsx): the action list, its add / edit forms and the
// icon picker. Pattern-tied — registered in page/defaultTheme.js as `actionControls` (resolved at
// `pages.actionControls`). 2026-10-16 (ui-raw-html-to-ui-components.md): the markup was hardcoded Tailwind on every
// theme; controls are now UI components (Button fieldTrigger / iconPick / linkMeta / small / primary / action, Input,
// Select) and only layout lives here. The old literals are frozen for project themes in src/themes/_legacy/pages.js.
export const actionControlsTheme = {
    triggerWrap: 'relative inline-block text-left',
    triggerIcon: 'size-4',
    panel: 'w-72 flex flex-col gap-1 p-1 rounded-md bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-lift)]',
    panelHidden: 'hidden',
    menuPanel: 'w-72 flex flex-col gap-1',                      // isInMenu (inside the section menu)
    list: 'py-1 max-h-[500px] overflow-auto scrollbar-sm',
    // one action row
    row: 'flex items-center gap-1.5 px-2 mx-1 rounded-md hover:bg-[var(--t-well)] t-proseSM text-[var(--t-ink)]',
    grip: 'size-3.5 text-[var(--t-pencil)] shrink-0 cursor-grab',
    rowIcon: 'size-4 shrink-0 text-[var(--t-graphite)]',
    rowBody: 'flex items-center gap-2 flex-1 min-w-0 my-1',
    rowName: 'flex-1 min-w-0 truncate',
    // add / edit form
    addWrap: 'w-full flex flex-col gap-1 p-1',
    addTriggerWrap: 'self-end',
    form: 'flex flex-col gap-1.5 w-full px-2 py-1.5',
    selectRow: 'grid grid-cols-3 gap-1',
    formActions: 'flex w-full justify-end items-center gap-1',
    urlField: 'flex-1 min-w-0',
    // icon picker
    // the picker opens IN FLOW across the whole select row (an absolute popup was clipped by the section menu panel):
    // the wrapper is `contents`, so the trigger is a grid cell and the open menu a full-width last row
    iconPicker: 'contents',
    iconMenu: 'order-last col-span-3 p-2 flex flex-col gap-2 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-md',
    iconGrid: 'grid grid-cols-6 gap-1 max-h-48 overflow-y-auto',
    iconEmpty: 't-proseXS text-[var(--t-pencil)] px-1 py-2',
    pickIcon: 'size-4',
};
