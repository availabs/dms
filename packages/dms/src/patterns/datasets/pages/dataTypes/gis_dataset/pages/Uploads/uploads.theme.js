// GIS / CSV source Uploads page (gis_dataset/pages/Uploads/{index,list,view}.jsx — the ETL contexts that
// loaded the source → one context's events) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-uploads.html. Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `uploads`. Status cells reuse the task status pills
// (`datasets.udaTaskPage` status* keys) when `statusPill` is set.
const RULE = 'border-[var(--t-rule)]';

export const uploadsTheme = {
    page: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6',   // '' → no page wrapper (pre-v6)

    // index.jsx - UploadsPage header
    indexHeader: 'flex flex-wrap items-baseline gap-2 mb-4',
    indexHeaderLabel: 't-displaySM text-[var(--t-ink)]',
    indexHeaderHint: 't-metaXS text-[var(--t-pencil)]',               // '' → no hint

    // view.jsx - one upload's header
    backLink: 'inline-flex items-center gap-1 t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer',   // '' → no back link / title
    backIcon: 'ArrowLeft',
    backIconClass: 'size-3.5',
    viewTitleRow: 'flex items-center gap-3 mt-3 mb-4',
    viewTitle: 't-displaySM text-[var(--t-ink)]',

    // Shared list/view table structure
    tableWrapper: `rounded-lg border ${RULE} bg-[var(--t-panel)] overflow-hidden`,
    tableStyle: 'list',   // UI.Table named style (2026-10-14, ui-control-tables.md); cell text keys below
    tableCell: 't-metaMD text-[var(--t-graphite)] truncate',
    tableCellId: 't-metaMD text-[var(--t-ink)] truncate',
    statusPill: 'yes',                                                  // '' → plain status text
    noDataMsg: 'px-4 py-6 t-proseSM text-[var(--t-pencil)] text-center',
}
