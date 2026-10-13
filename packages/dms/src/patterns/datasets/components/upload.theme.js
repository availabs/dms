// Upload (components/upload.jsx — the internal source Upload tab and the internal_table create flow's
// "Upload rows" step) — tessera v6, 2026-10-07, from src/themes/tessera/design_system_v6/pages/
// datasets-internal.html. No accent colour (owner direction 2026-10-07). Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `upload`.
const RULE = 'border-[var(--t-rule)]';
const CARD = `rounded-lg border ${RULE} bg-[var(--t-panel)]`;
const FIELD = 'h-8 w-full px-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] cursor-pointer focus:outline-none focus:border-[var(--t-cobalt)]';
const LABEL = 't-metaXS text-[var(--t-pencil)]';

export const uploadTheme = {
    publishStatus: `${CARD} px-4 py-3 t-proseSM text-[var(--t-ink)]`,

    // dropzone
    uploaderOuter: 'w-full max-w-xl',
    uploaderDropzone: 'w-full',
    uploaderLabel: 'flex flex-col items-center justify-center text-center w-full border-2 border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-12 bg-[var(--t-panel)] hover:border-[var(--t-graphite)] cursor-pointer',
    uploaderLabelInner: 'flex flex-col items-center',
    uploaderLoadingText: 't-proseSM text-[var(--t-graphite)] mt-2',
    uploaderSvg: 'size-7 text-[var(--t-pencil)]',
    uploaderClickText: 't-proseSM text-[var(--t-ink)] mt-2',
    uploaderClickBold: 'font-medium',
    uploaderTypeText: 't-proseXS text-[var(--t-pencil)] mt-0.5',
    uploaderInput: 'hidden',

    // after upload — map and publish
    postUploadOuter: 'w-full flex flex-col gap-5',
    postUploadLayerRow: 'flex flex-col gap-1.5 max-w-sm',
    postUploadLabel: LABEL,
    postUploadLayerSelect: FIELD,
    pivotColumnsWrapper: `${CARD} p-4 flex flex-col gap-1.5`,
    pivotColumnsTitle: 'flex items-center gap-1.5 t-proseSM font-medium text-[var(--t-ink)]',
    pivotInfoIcon: 'text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-help',
    pivotColumnsHeadGrid: `grid gap-3 ${LABEL}`,
    pivotColumnsGrid: 'grid gap-3 t-proseSM text-[var(--t-ink)]',
    primaryColRow: 'flex flex-col gap-1.5 max-w-sm',
    primaryColLabel: LABEL,
    primaryColHint: 'block mt-0.5 t-proseXS normal-case tracking-normal text-[var(--t-pencil)]',
    primaryColSelect: FIELD,

    // column matching
    columnsHeader: `grid gap-3 items-center px-4 py-2.5 bg-[var(--t-well)] border ${RULE} rounded-t-lg ${LABEL}`,
    columnsSearchLabel: 'flex items-center gap-2 min-w-0',
    columnsSearch: `flex-1 min-w-0 h-6 px-2 rounded border ${RULE} bg-[var(--t-panel)] t-proseXS normal-case tracking-normal text-[var(--t-ink)] outline-none`,
    columnsBody: `flex flex-col max-h-[60vh] overflow-auto scrollbar-sm border-x border-b ${RULE} rounded-b-lg bg-[var(--t-panel)]`,
    columnRow: `grid gap-3 items-center px-4 py-2 border-t ${RULE} first:border-t-0`,
    columnDisplayName: 't-proseSM text-[var(--t-ink)] truncate',
    columnSelectMatch: FIELD,
    columnSelectNoMatch: `${FIELD} text-[var(--t-pencil)]`,
    columnGeoCell: 'flex items-center justify-center',
    columnGeoCheckbox: 'size-4 accent-[var(--t-ink)] cursor-pointer',
    noColumnsMsg: 't-proseSM text-[var(--t-pencil)]',
    publishRow: 'flex justify-end',
    publishBtn: `h-8 inline-flex items-center px-3.5 rounded-md border ${RULE} bg-[var(--t-panel)] t-proseSM font-medium text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`,
}
