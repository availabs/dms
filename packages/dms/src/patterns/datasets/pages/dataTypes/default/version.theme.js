// Version page (dataTypes/default/version.jsx) theme — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-version.html. Was UNTHEMED (hardcoded classes);
// those classes are frozen in src/themes/_legacy/datasets.js `version`, so project themes render
// exactly as before. A site theme overrides via `datasets.version`. The DAMA controls column is
// components/ExternalVersionControls (`datasets.externalVersionControls`); the authority badge /
// form reuse `datasets.sourceOverview` (verAuth* keys).
const CARD = 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)]';

export const versionTheme = {
    page: 'w-full',
    inner: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6 flex flex-col gap-4',

    // title row: version name + authority badge (+ view id on the right)
    titleRow: 'flex flex-wrap items-center gap-3',
    title: 't-displaySM text-[var(--t-ink)]',
    titleSourceSep: '',            // '' → version name only (the source name is already in the page header)
    viewIdLabel: 'ml-auto t-metaXS text-[var(--t-pencil)]',   // '' → not rendered
    authorityWrap: 'w-full',   // '' → no wrapper (pre-v6 spacing)

    // body: version card + controls column
    body: 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start',
    mainCol: `${CARD} p-4 flex flex-col gap-1.5`,
    versionLabel: 't-metaXS text-[var(--t-pencil)]',
    versionHint: 't-proseXS text-[var(--t-pencil)]',          // '' → not rendered
    sideCol: `${CARD} p-4 flex flex-col gap-2 empty:hidden`,

    // created / updated
    metaInMain: 'yes',             // '' → created / updated sit at the top of the controls column (pre-v6)
    metaList: 'grid grid-cols-2 gap-4 mt-3',
    metaItem: 'min-w-0',
    metaLabel: 't-metaXS text-[var(--t-pencil)]',
    metaValue: 't-metaMD text-[var(--t-ink)] mt-1 truncate',

    // DMS controls (ClearDataBtn / DeleteViewBtn)
    btnWrap: 'w-full',
    dangerBtn: 'w-full h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-[var(--t-brick)] t-proseSM text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] cursor-pointer',
    dangerIcon: 'TrashCan',        // '' → no icon
    btnIconClass: 'size-3.5',
}
