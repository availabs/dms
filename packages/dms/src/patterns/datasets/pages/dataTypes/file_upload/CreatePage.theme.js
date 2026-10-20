// file_upload CreatePage + internal_table sourceCreate — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-create.html (#file / #internal). Registered as
// `datasets.fileUploadCreate`; pre-v6 values frozen in src/themes/_legacy/datasets.js. The numbered
// step cards come from components/CreateStep.jsx (`datasets.createPage` step* keys).
const RULE = 'border-[var(--t-rule)]';

export const createPageTheme = {
    // CreatePage
    wrapper: 'flex flex-col gap-3 relative',
    topRow: 'flex flex-wrap items-center gap-3',
    noNameHint: 't-proseXS text-[var(--t-amber)]',

    // File (uploading / error overlays, over the flow)
    uploadingOverlay: `absolute inset-0 z-10 rounded-lg border ${RULE} bg-[var(--t-panel)] flex items-center justify-center t-metaSM text-[var(--t-ink)]`,
    uploadingText: 'uploading file…',
    errorOverlay: 'absolute inset-0 z-10 rounded-lg border border-[var(--t-brick)] bg-[var(--t-panel)] flex flex-col items-start justify-center gap-1 p-4 t-proseSM text-[var(--t-brick)]',
    errorCloseWrap: 'mt-3',          // around the UI.Button 'action' Close

    // File info
    fileInfoTitle: 'hidden',          // the step title ("File info") already says it
    fileInfoGrid: 'grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 py-0.5',
    fileInfoLabel: 't-proseSM text-[var(--t-pencil)]',
    fileInfoValue: 't-proseSM text-[var(--t-ink)] truncate',
    divider: 'h-4',

    // Directory path
    dirPathRow: 'flex flex-col gap-1.5 max-w-xl',
    dirPathLabel: 't-metaXS text-[var(--t-pencil)]',
    dirPathField: '',                // around the UI.Input

    // Description
    descRow: 'flex flex-col gap-1.5 max-w-xl',
    descLabel: 't-metaXS text-[var(--t-pencil)]',
    descField: '',                   // around the UI.Textarea

    // Upload button row
    uploadBtnRow: 'flex mt-4',

    // sourceCreate (internal_table)
    sourceCreateUploading: 'flex flex-col gap-4',
    sourceCreateIdle: 'flex flex-wrap items-center gap-3',
    sourceCreateError: 't-proseXS text-[var(--t-brick)]',
    sourceCreateHint: 't-proseXS text-[var(--t-pencil)]',   // '' → no hint
}
