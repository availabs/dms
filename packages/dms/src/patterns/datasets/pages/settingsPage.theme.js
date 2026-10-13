// Datasets settings page (pages/SettingsPage.jsx) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-settings.html. No accent colour (owner direction
// 2026-10-07); amber stays for the warning / overridden / deprecated states. Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `settingsPage`.
const RULE = 'border-[var(--t-rule)]';
const CARD = `rounded-lg border ${RULE} bg-[var(--t-panel)]`;
const EYEBROW = 't-metaXS text-[var(--t-pencil)]';

export const settingsPageTheme = {
    pageWrapper: 'w-full min-w-0',
    // box-content: max-w-4xl measures the content, as in the mockup ('' → LayoutGroup, pre-v6)
    content: 'box-content max-w-4xl pl-6 lg:pl-12 pr-6 lg:pr-8 py-8 flex flex-col gap-5',
    heading: 't-displayMD text-[var(--t-ink)]',

    // Environment (read-only)
    envPanel: `${CARD} px-5 py-4 flex flex-col gap-2`,
    envPanelLabel: 't-proseSM font-medium text-[var(--t-ink)] mb-1',
    envRow: 'flex items-baseline gap-4',
    envRowLabel: 't-proseSM text-[var(--t-pencil)] w-24 shrink-0',
    envRowValue: 't-metaMD text-[var(--t-ink)]',
    envRowMuted: 't-metaMD text-[var(--t-pencil)]',
    envRowEmpty: 't-proseSM italic text-[var(--t-pencil)]',

    // Source lists
    togglePanel: `${CARD} px-5 py-4 flex flex-col gap-2`,
    togglePanelLabel: 't-proseSM font-medium text-[var(--t-ink)]',
    toggleRow: 'flex items-center gap-3',
    toggleLabel: 't-proseSM text-[var(--t-ink)]',
    toggleHint: 't-proseXS text-[var(--t-graphite)] max-w-[70ch]',

    // Legacy category filter
    searchWrapper: 'px-5 pt-4 max-w-sm',
    columnsWrapper: 'grid grid-cols-1 md:grid-cols-2 gap-6 px-5 py-4',
    column: 'min-w-0',
    columnLabel: EYEBROW,
    columnHint: 'ml-1 normal-case tracking-normal',
    categoryList: 'flex flex-wrap gap-1.5 mt-2 max-h-[50vh] overflow-auto',
    categoryButton: `inline-flex items-center gap-1.5 t-proseXS text-[var(--t-ink)] bg-[var(--t-panel)] border ${RULE} rounded-full pl-2.5 pr-1 py-0.5 hover:border-[var(--t-rule-strong)] cursor-pointer disabled:opacity-50`,
    categoryCount: 't-metaXS rounded-full bg-[var(--t-well)] text-[var(--t-graphite)] px-1.5',

    // ── lifecycle visibility ───────────────────────────────────────────────
    lcPanel: CARD,
    lcHeader: `px-5 py-4 border-b ${RULE} flex items-start justify-between gap-4 flex-wrap`,
    lcTitle: 't-proseSM font-medium text-[var(--t-ink)] flex items-center gap-2',
    lcSub: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[70ch]',
    lcScope: `inline-flex items-center gap-1.5 ${EYEBROW} border ${RULE} rounded px-1.5 py-0.5 flex-none`,
    lcScopeValue: 'font-medium text-[var(--t-ink)]',
    lcRows: `border-t ${RULE} divide-y divide-[var(--t-rule)]`,
    lcRow: 'px-5 py-3 flex items-start gap-4',
    lcRowBody: 'flex-1 min-w-0',
    lcRowTitle: 'flex items-center gap-2 flex-wrap',
    lcRowName: 't-proseSM text-[var(--t-ink)]',
    lcRowCount: EYEBROW,
    lcRowHint: 't-proseXS text-[var(--t-graphite)] mt-0.5',
    lcRequired: 'inline-flex items-center t-metaXS text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded px-1.5 py-0.5',
    lcState: 'shrink-0 mt-0.5 text-right',
    lcStateDefault: EYEBROW,
    lcStateOverridden: 't-metaXS text-[var(--t-amber)]',
    lcReset: 'block mt-1 t-metaXS text-[var(--t-graphite)] hover:text-[var(--t-ink)] underline decoration-dotted cursor-pointer',
    lcNote: `px-5 py-3 border-t ${RULE} t-proseXS text-[var(--t-pencil)]`,
    lcWarn: 'px-5 py-3 border-t border-[var(--t-amber)] bg-[var(--t-amber-soft)] t-proseSM text-[var(--t-amber)]',
    // live effect
    fxPanel: 'flex flex-wrap items-center gap-x-6 gap-y-1 bg-[var(--t-well)] rounded-lg px-4 py-3',
    fxBig: 'text-2xl font-semibold leading-none tabular-nums text-[var(--t-ink)] basis-full sm:basis-auto',
    fxBigMuted: 'text-base font-normal text-[var(--t-pencil)]',
    fxCaption: `${EYEBROW} basis-full sm:basis-auto`,
    fxRow: 'inline-flex items-center gap-1.5 t-proseSM',
    fxRowLabel: 'text-[var(--t-pencil)]',
    fxRowValue: 'font-medium tabular-nums text-[var(--t-ink)]',
    fxHint: 't-proseXS text-[var(--t-pencil)] mt-2',
    // new-source defaults
    nsGrid: 'px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6',
    nsLabel: `${EYEBROW} mb-1.5`,
    nsPill: 'inline-flex items-baseline gap-2 t-proseSM text-[var(--t-ink)]',
    nsMuted: EYEBROW,
    nsCheckRow: 'flex items-center gap-2 t-proseSM text-[var(--t-ink)] py-1 [&_input]:size-4 [&_input]:accent-[var(--t-ink)] [&_input]:cursor-pointer',
    nsHint: 't-proseXS text-[var(--t-graphite)] mt-1.5',
    // legacy panel
    legacyPanel: CARD,
    legacyHeader: `px-5 py-4 border-b ${RULE}`,
    legacyBadge: 'inline-flex items-center t-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded px-1.5 py-0.5',
    emptyMessage: 't-proseSM text-[var(--t-pencil)]',
}
