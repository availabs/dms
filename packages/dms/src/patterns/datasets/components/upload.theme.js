// Upload (components/upload.jsx — the internal source Upload tab and the internal_table create flow's
// "Upload rows" step) — tessera v6, 2026-10-07, from src/themes/tessera/design_system_v6/pages/
// datasets-internal.html. No accent colour (owner direction 2026-10-07). Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `upload`.
const RULE = 'border-[var(--t-rule)]';
const CARD = `rounded-lg border ${RULE} bg-[var(--t-panel)]`;
const LABEL = 't-metaXS text-[var(--t-pencil)]';

export const uploadTheme = {
    publishStatus: `${CARD} px-4 py-3 t-proseSM text-[var(--t-ink)]`,

    // dropzone: UI.FileInput (dropzone shape) — its look is theme.fileInput
    uploaderOuter: 'w-full max-w-xl',
    uploaderDropzone: 'w-full',

    // after upload — map and publish
    postUploadOuter: 'w-full flex flex-col gap-5',
    postUploadLayerRow: 'flex flex-col gap-1.5 max-w-sm',
    pivotColumnsWrapper: `${CARD} p-4 flex flex-col gap-1.5`,
    pivotColumnsTitle: 'flex items-center gap-1.5 t-proseSM font-medium text-[var(--t-ink)]',
    pivotInfoIcon: 'text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-help',
    pivotColumnsHeadGrid: `grid gap-3 ${LABEL}`,
    pivotColumnsGrid: 'grid gap-3 t-proseSM text-[var(--t-ink)]',
    primaryColRow: 'flex flex-col gap-1.5 max-w-sm',
    primaryColHint: 'block mt-0.5 t-proseXS normal-case tracking-normal text-[var(--t-pencil)]',

    // column matching
    columnsHeader: `grid gap-3 items-center px-4 py-2.5 bg-[var(--t-well)] border ${RULE} rounded-t-lg ${LABEL}`,
    columnsSearchLabel: 'flex items-center gap-2 min-w-0',   // the header cell holding a FieldLabel + UI.Input 'headerFilter'
    columnsBody: `flex flex-col max-h-[60vh] overflow-auto scrollbar-sm border-x border-b ${RULE} rounded-b-lg bg-[var(--t-panel)]`,
    columnRow: `grid gap-3 items-center px-4 py-2 border-t ${RULE} first:border-t-0`,
    columnDisplayName: 't-proseSM text-[var(--t-ink)] truncate',
    columnGeoCell: 'flex items-center justify-center',
    noColumnsMsg: 't-proseSM text-[var(--t-pencil)]',
    publishRow: 'flex justify-end',
}
