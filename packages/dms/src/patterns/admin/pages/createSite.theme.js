// The "New site" page (/create) and SiteTemplatePicker (also used by TenantList's "Add tenant" modal and the
// multi-tenant sign-up page). v6, 2026-10-15: matches design_system_v6/pages/admin-create-site.html — one form
// card in sections (site / first admin / start from), radio template cards, inline validation, and a step
// list while the site is being created. Admin pages always render the library default (getAdminTheme).
const SECTION_LABEL = 't-metaXS text-[var(--t-pencil)] uppercase tracking-[0.06em]';
const CARD = 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg';

export const createSiteTheme = {
    // page: the sibling admin pages' geometry (Sites / Themes): title + rule, then the form card across the column
    wrapper: 'w-full flex flex-col gap-4',
    header: 'flex flex-col gap-1 pb-3 border-b border-[var(--t-rule)]',
    headerTitle: 't-displayMD text-[var(--t-ink)]',
    headerSubtitle: 't-proseSM text-[var(--t-graphite)]',
    grid: 'grid grid-cols-12 gap-4',
    formColumn: 'col-span-12 min-w-0',

    // the form card
    form: CARD,
    formSection: 'p-4 flex flex-col gap-3',
    formSectionDivided: 'p-4 flex flex-col gap-3 border-t border-[var(--t-rule)]',
    sectionLabel: SECTION_LABEL,
    fieldPair: 'grid sm:grid-cols-2 gap-3',
    field: 'min-w-0',
    fieldHint: 't-proseXS text-[var(--t-pencil)] mt-1',
    fieldError: 't-proseXS text-[var(--t-brick)] mt-1',
    sectionHint: 't-proseXS text-[var(--t-pencil)]',   // a section-level note; the section's gap spaces it
    // fields are UI.Input's default style; an invalid field gets `aria-invalid` (brick border)
    formFooter: 'px-4 py-3 border-t border-[var(--t-rule)] flex items-center justify-end gap-3',
    submitButtonStyle: 'primary',

    // creating: the form is replaced by progress
    progress: `${CARD} p-4`,
    progressTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    progressSteps: 'mt-3 flex flex-col gap-2',
    progressHint: 't-proseXS text-[var(--t-pencil)] mt-3',
    step: 'flex items-center gap-2.5 t-proseSM',
    stepDone: 'text-[var(--t-graphite)]',
    stepNow: 'text-[var(--t-ink)] font-medium',
    stepTodo: 'text-[var(--t-pencil)]',
    stepIconDone: 'size-5 rounded-full bg-[var(--t-go-soft)] text-[var(--t-go)] flex items-center justify-center flex-none',
    stepIconDoneGlyph: 'size-3.5',
    stepIconNow: 'size-5 rounded-full bg-[var(--t-cobalt-soft)] flex items-center justify-center flex-none',
    stepIconNowDot: 'size-2 rounded-full bg-[var(--t-cobalt)] animate-pulse',
    stepIconTodo: 'size-5 rounded-full border border-[var(--t-rule)] flex-none',

    // failed: message above the form, Create enabled again
    errorBox: 'rounded-md border border-[var(--t-brick)] bg-[var(--t-brick-soft)] px-3 py-2',
    errorTitle: 't-proseSM text-[var(--t-brick)] font-medium',
    errorText: 't-proseXS text-[var(--t-graphite)] mt-0.5',

    // Site template picker
    templateSection: 'flex flex-col gap-2',
    templateLabel: 'block t-metaXS text-[var(--t-pencil)] mb-0.5',
    templateGrid: 'grid sm:grid-cols-2 gap-2',
    templateRadio: 'mt-0.5 size-4 rounded-full border border-[var(--t-rule-strong)] flex-none',
    templateRadioSelected: 'mt-0.5 size-4 rounded-full border-[5px] border-[var(--t-ink)] flex-none',
    templateCardBody: 'min-w-0',
    templateCardName: 'block t-proseSM font-medium text-[var(--t-ink)]',
    templateCardDesc: 'block t-proseXS text-[var(--t-pencil)] mt-0.5 leading-snug',
}
