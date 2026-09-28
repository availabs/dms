// Ported to tessera's var(--t-*) tokens (2026-09-20) from
// src/themes/tessera/design_system_v6/pages/admin-pattern-overview.html —
// this admin page always renders under the hardcoded "default" theme
// (patterns/admin/siteConfig.jsx), so this is what every project sees.
// The mockup's own "identity"/"environment"/"section attributes"/"danger
// zone" cards map directly; "Additional Locations"/"Retired Subdomains"/
// per-pattern-type settings aren't in the mockup at all (real features with
// no mockup coverage) and get their own cards in the same visual language
// instead of being dropped.
export const settingsEditorTheme = {
    wrapper: 'flex flex-col gap-3 max-w-5xl pb-6',

    // Header strip — pattern name + type pill + identity line.
    header: 'flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-3 mb-1 border-b border-[var(--t-rule)]',
    headerTitle: 't-displayMD text-[var(--t-ink)] truncate',
    headerTypePill: 't-metaXS text-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)] rounded-full px-2 py-0.5',
    headerSubtitle: 't-metaSM text-[var(--t-pencil)] w-full mt-0.5',

    // Save/reset bar — deliberately its OWN full-width strip, not nested
    // inside any one card, so it reads as "applies to every editable
    // section above it" (identity + locations + retired subdomains +
    // section attributes all share this one `tmpValue` draft) rather than
    // "the last two cells of the first card's grid", which is what it
    // looked like before (2026-09-20).
    saveBar: 'flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[var(--t-rule)] bg-[var(--t-well)] sticky top-0 z-10',
    saveBarDirty: 'flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[var(--t-amber)] bg-[var(--t-amber-soft)] sticky top-0 z-10',
    saveBarText: 't-metaSM text-[var(--t-graphite)]',
    saveBarTextDirty: 't-metaSM text-[var(--t-amber)]',
    btnReset: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',

    // Generic v6 card — every section below the save bar uses this shell.
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex flex-wrap items-center gap-2',
    cardHeaderLabel: 't-metaSM text-[var(--t-graphite)]',
    cardHeaderHint: 't-metaXS text-[var(--t-pencil)]',
    cardBody: 'divide-y divide-[var(--t-rule)]',
    cardFooter: 'px-4 py-2.5 border-t border-[var(--t-rule)] flex items-center gap-2',

    // Identity card rows (built with FieldSet — customTheme per field
    // controls col-span within this 12-col grid).
    fieldGrid: 'grid grid-cols-12 gap-x-3 gap-y-2 p-4',
    fieldRow: 'pb-1 flex flex-col col-span-6',
    fieldRowFull: 'pb-1 flex flex-col col-span-12',
    fieldRowNarrow: 'pb-1 flex flex-col col-span-3',
    fieldLabel: 't-metaXS text-[var(--t-pencil)]',

    // Locations / retired-subdomains editors (LocationsEditor/RetiredSubdomainsEditor)
    listSection: 'flex flex-col gap-2 p-4',
    listHint: 't-proseXS text-[var(--t-graphite)]',
    listRow: 'w-full flex items-center gap-2',
    listRemoveBtn: 't-metaXS text-[var(--t-pencil)] hover:text-[var(--t-brick)] border border-[var(--t-rule)] hover:border-[var(--t-brick)] rounded-md px-2 py-1 flex-none',
    listAddBtn: 't-proseSM text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)] w-fit cursor-pointer',

    // DmsEnvConfig
    envGrid: 'grid grid-cols-12 gap-3 p-4',
    envColWide: 'col-span-6',
    envColMid: 'col-span-6',
    envLabel: 't-metaXS text-[var(--t-pencil)] mb-1 block',
    envInputRow: 'flex gap-2',
    envSwitchRow: 'px-4 py-2.5 border-t border-[var(--t-rule)] flex items-center gap-3',
    envSwitchLabel: 't-metaXS text-[var(--t-pencil)]',
    envSwitchHint: 't-metaXS text-[var(--t-pencil)]',

    // Simple type-gated settings cards (Page/Auth)
    settingsGrid: 'p-4 flex items-center gap-3',
    settingsLabel: 't-metaSM text-[var(--t-graphite)]',

    // Danger zone
    dangerCard: 'border border-[var(--t-brick)] rounded-lg overflow-hidden',
    dangerHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] bg-[var(--t-brick-soft)] flex items-center gap-2',
    dangerHeaderLabel: 't-metaSM text-[var(--t-brick)]',
    dangerBody: 'divide-y divide-[var(--t-rule)] bg-[var(--t-panel)]',
    dangerRow: 'px-4 py-3 flex flex-wrap items-center gap-3',
    dangerRowTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    dangerRowDesc: 't-proseXS text-[var(--t-graphite)] mt-0.5',
    btnDuplicate: 'inline-flex items-center gap-1.5 t-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 flex-none disabled:opacity-50 disabled:cursor-not-allowed',
    btnDelete: 'inline-flex items-center gap-1.5 t-proseSM font-medium text-[var(--t-brick)] border border-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] rounded-md px-3.5 py-1.5 flex-none',
    confirmRow: 'flex items-center gap-2',
    confirmText: 't-proseSM text-[var(--t-brick)]',
    btnConfirmDelete: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-brick)] hover:brightness-90 rounded-md px-3.5 py-1.5',
    btnCancelDelete: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5',
    duplicateProgressBox: 'mt-3 border border-[var(--t-rule)] rounded-md bg-[var(--t-well)] px-3 py-2.5 w-full',
    duplicateProgressBar: 'h-1 rounded-full bg-[var(--t-rule)] mt-2.5 overflow-hidden',
    duplicateProgressFill: 'h-full bg-[var(--t-cobalt)] rounded-full',
    duplicateProgressText: 't-metaSM text-[var(--t-graphite)]',

    iconSm: 'size-4',
}
