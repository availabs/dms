// CardColumnPicker (Card + Spreadsheet header column insert) — v6 2026-10-17, ui-primitives-default-theme.md. Spec:
// design_system_v6/pages/ui-controls.html#column-picker (owner-approved). The insert point uses the add-section
// language (page-edit.html addSection): a neutral rule-strong line with a small bordered +; the bare form is a
// row-icon. The popup is a menu panel; the column search lists matches in a bordered box; picked columns wait as
// tags with an ×. The pills / Add are UI.Button styles (chip / chipOn / small). Pre-v6 strings (blue line, white
// popup): src/themes/_legacy/ui.js `cardColumnPicker`.
export const cardColumnPickerTheme = {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    // the insert point (orientation 'horizontal' | 'vertical' | 'icon')
    insertH: 'w-full flex items-center',
    insertV: 'h-full flex flex-col items-center',
    lineH: 'flex-1 h-px bg-[var(--t-rule-strong)]',
    lineV: 'flex-1 w-px bg-[var(--t-rule-strong)]',
    dot: 'shrink-0 size-4 rounded-full border border-[var(--t-rule-strong)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] flex items-center justify-center',
    dotIcon: 'size-3',
    iconTrigger: 'flex items-center justify-center w-4 h-4 rounded text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]',
    iconTriggerIcon: 'size-3',
    // the popup
    panel: 'flex flex-col gap-2 p-2 w-64 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)]',
    pills: 'flex flex-wrap gap-1 [&>*]:shrink-0',   // + Formula / + Calculated / + Static wrap as whole pills
    pillAlone: 'self-start',                        // + Static Column when it is the only pill
    form: 'flex flex-col gap-1',                    // the column search / the static-column form
    stagedRow: 'flex flex-wrap gap-1 pt-0.5',
    list: 'max-h-40 overflow-y-auto rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] p-1',
    listRow: 'px-2 py-1 rounded t-proseSM text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer',
    staged: 'inline-flex items-center gap-1 h-6 px-1.5 rounded bg-[var(--t-well)] t-proseXS text-[var(--t-ink)] cursor-pointer hover:bg-[var(--t-rule)]',
    stagedIcon: 'size-3 text-[var(--t-pencil)]',
  }],
};

export default cardColumnPickerTheme;
