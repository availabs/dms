// The section menu's own controls (sectionMenu.jsx) — the Layout sub-pages' pickers: padding
// step grid, border edge picker + width steps, radius corner dots, background swatch pills; plus
// the inline error line. Pattern-tied — registered in page/defaultTheme.js as `sectionMenu`
// (resolved at `pages.sectionMenu`). tessera v6, 2026-10-08, from page-section-menu.html: the
// selected step / edge / corner is ink (was a hardcoded #1F3F8F). Pre-v6 literals frozen in
// src/themes/_legacy/pages.js `sectionMenu`.
export const sectionMenuTheme = {
    menuError: 't-proseXS text-[var(--t-brick)] mt-1',
    // free-text rows (Display → Page Nav Label / Anchor ID)
    textInput: 'w-full h-8 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] outline-none focus:border-[var(--t-ink)] placeholder:text-[var(--t-pencil)]',

    // step grids (padding sides, border width)
    stepsWrap: 'flex flex-col gap-1.5 px-1 py-1.5 w-full',
    stepRow: 'flex items-center gap-2 w-full',
    stepLabel: 'w-12 shrink-0 t-proseXS text-[var(--t-pencil)]',
    stepLabelBold: 'w-12 shrink-0 t-proseXS font-medium text-[var(--t-ink)]',
    stepGrid: 'flex-1 min-w-0',
    step: 'h-8 flex items-center justify-center rounded-md t-proseXS font-medium tabular-nums cursor-pointer transition',
    stepOn: 'bg-[var(--t-ink)] text-[var(--t-paper)] shadow-[var(--t-shadow-lift)]',
    stepOff: 'bg-[var(--t-well)] text-[var(--t-graphite)] hover:bg-[var(--t-rule)]',
    stepDivider: 'border-t border-[var(--t-rule)] my-0.5',

    // border edge picker
    borderWrap: 'w-full flex flex-col gap-2 py-2',
    borderCenter: 'w-full flex justify-center',
    pickerBox: 'relative size-24',
    edgesLabel: 'absolute inset-[10px] bg-[var(--t-well)] rounded flex items-center justify-center t-metaXS text-[var(--t-pencil)]',
    edge: 'rounded cursor-pointer transition',
    edgeOn: 'bg-[var(--t-ink)]',
    edgeOff: 'bg-[var(--t-rule-strong)] hover:bg-[var(--t-pencil)]',
    widthRow: 'w-full flex items-center gap-2 px-1',

    // radius corners
    radiusWrap: 'w-full flex justify-center py-2',
    radiusFrame: 'absolute inset-2 border-2 border-[var(--t-rule-strong)] rounded-lg',
    corner: 'size-3.5 rounded-full cursor-pointer transition',
    cornerOn: 'bg-[var(--t-ink)]',
    cornerOff: 'bg-[var(--t-rule-strong)] hover:bg-[var(--t-pencil)]',

    // background swatch pills
    bgWrap: 'w-full flex flex-wrap gap-1 px-1 py-1.5',
    bgPill: 'pl-1.5 pr-2.5 h-8 inline-flex items-center gap-1.5 rounded-md t-proseXS capitalize cursor-pointer transition',
    bgSwatch: 'size-4 rounded border border-[var(--t-rule-strong)] shrink-0',

    // ColorControls (sharedControls — the border Color row, and component colour settings)
    colorWrap: 'w-full flex flex-col',
    colorRow: 'px-1.5 py-1 w-full inline-flex justify-between items-center gap-2 rounded-md hover:bg-[var(--t-well)] t-proseXS text-[var(--t-graphite)] cursor-pointer',
    colorLabel: 'shrink-0',
    colorSwatch: 'shrink w-[30px] h-[30px] border border-[var(--t-rule-strong)] rounded-md',
    colorPopup: 'w-full mt-1 mb-1 p-1 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)]',
}
