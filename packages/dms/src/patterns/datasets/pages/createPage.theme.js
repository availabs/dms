// Create page (pages/CreatePage.jsx) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-create.html. Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `createPage`; keys marked '' → … gate the v6 markup.
// No accent colour (owner direction on the metadata page, 2026-10-07): the selected type card is ink.
const RULE = 'border-[var(--t-rule)]';
const BTN = 'h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md t-proseSM cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const createPageTheme = {
    pageWrapper: 'w-full min-w-0',
    // box-content: max-w-4xl measures the content, not content + padding — the mockup's 56rem column
    content: 'box-content max-w-4xl pl-6 lg:pl-12 pr-6 lg:pr-8 py-8',   // '' → the page sits in a LayoutGroup (pre-v6)
    heading: 't-displayMD text-[var(--t-ink)]',
    headingText: 'New source',
    intro: 't-proseSM text-[var(--t-graphite)] mt-1',               // '' → no intro line
    form: 'flex flex-col gap-6 mt-6',
    field: 'flex flex-col gap-1.5',
    nameField: 'flex flex-col gap-1.5 max-w-md',
    fieldLabel: 't-metaXS text-[var(--t-pencil)]',

    // Type as a card picker (Decision 13) — '' → the MultiSelect dropdown (pre-v6)
    typeCards: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3',
    typeCard: `text-left flex gap-3 p-3 rounded-lg border ${RULE} bg-[var(--t-panel)] hover:border-[var(--t-rule-strong)] cursor-pointer`,
    typeCardActive: 'text-left flex gap-3 p-3 rounded-lg border border-[var(--t-ink)] bg-[var(--t-panel)] shadow-[var(--t-shadow-lift)] cursor-pointer',
    typeCardIcon: 'size-8 rounded-md flex items-center justify-center flex-none bg-[var(--t-well)] text-[var(--t-graphite)]',
    typeCardIconActive: 'size-8 rounded-md flex items-center justify-center flex-none bg-[var(--t-ink)] text-[var(--t-paper)]',
    typeCardIconClass: 'size-4',
    typeCardText: 'min-w-0',
    typeCardLabel: 'block t-proseSM font-medium text-[var(--t-ink)]',
    typeCardKey: 'block t-metaMD text-[11px] text-[var(--t-pencil)]',
    typeCardBlurb: 'block t-proseXS text-[var(--t-graphite)] mt-1',

    // plain create (a type with no create page of its own)
    actions: 'flex gap-2',
    createBtn: `${BTN} font-medium border ${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`,   // '' → UI.Button default
    cancelBtn: `${BTN} text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]`,                                // '' → UI.Button type plain
    externalWrapper: 'flex flex-col gap-3',     // the chosen type's own create flow (its numbered steps)

    // numbered steps of the create flows (components/CreateStep.jsx) — step '' → no step chrome
    step: `rounded-lg border ${RULE} bg-[var(--t-panel)]`,
    stepTodo: `rounded-lg border ${RULE} bg-[var(--t-panel)] opacity-60`,
    stepHead: 'flex items-center gap-3 px-4 py-3',
    stepHeadBordered: `flex items-center gap-3 px-4 py-3 border-b ${RULE}`,
    stepDot: 'size-6 flex-none rounded-full bg-[var(--t-ink)] text-[var(--t-paper)] flex items-center justify-center t-metaXS',
    stepDotDone: 'size-6 flex-none rounded-full bg-[var(--t-go)] text-[var(--t-accent-ink)] flex items-center justify-center',
    stepDotTodo: 'size-6 flex-none rounded-full border border-[var(--t-rule-strong)] text-[var(--t-pencil)] flex items-center justify-center t-metaXS',
    stepDoneIcon: 'CircleCheck',
    stepDoneIconClass: 'size-4',
    stepTitle: 't-proseSM font-medium text-[var(--t-ink)] flex-1',
    stepNote: 't-metaXS text-[var(--t-pencil)] text-right',
    stepBody: 'px-4 py-4',
    stepBodyCollapsed: 'hidden',
}
