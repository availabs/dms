// file_upload CreatePage + internal_table sourceCreate — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-create.html (#file / #internal). Registered as
// `datasets.fileUploadCreate`; pre-v6 values frozen in src/themes/_legacy/datasets.js. The numbered
// step cards come from components/CreateStep.jsx (`datasets.createPage` step* keys).
const RULE = 'border-[var(--t-rule)]';
const BTN = 'h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md t-proseSM cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const ACTION = `${BTN} border ${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const INPUT = 'block w-full rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] px-3 py-2 t-proseSM text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] focus:outline-none focus:border-[var(--t-cobalt)]';

export const createPageTheme = {
    // CreatePage
    wrapper: 'flex flex-col gap-3 relative',
    topRow: 'flex flex-wrap items-center gap-3',
    fileInputHidden: 'hidden',
    selectFileBtn: ACTION,
    selectFileIcon: 'Upload',
    selectFileIconClass: 'size-3.5',
    noNameHint: 't-proseXS text-[var(--t-amber)]',

    // File (uploading / error overlays, over the flow)
    uploadingOverlay: `absolute inset-0 z-10 rounded-lg border ${RULE} bg-[var(--t-panel)] flex items-center justify-center t-metaSM text-[var(--t-ink)]`,
    uploadingText: 'uploading file…',
    errorOverlay: 'absolute inset-0 z-10 rounded-lg border border-[var(--t-brick)] bg-[var(--t-panel)] flex flex-col items-start justify-center gap-1 p-4 t-proseSM text-[var(--t-brick)]',
    errorCloseBtn: `mt-3 ${ACTION}`,

    // File info
    fileInfoTitle: 'hidden',          // the step title ("File info") already says it
    fileInfoGrid: 'grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 py-0.5',
    fileInfoLabel: 't-proseSM text-[var(--t-pencil)]',
    fileInfoValue: 't-proseSM text-[var(--t-ink)] truncate',
    divider: 'h-4',

    // Directory path
    dirPathRow: 'flex flex-col gap-1.5 max-w-xl',
    dirPathLabel: 't-metaXS text-[var(--t-pencil)]',
    dirPathInput: INPUT,

    // Description
    descRow: 'flex flex-col gap-1.5 max-w-xl',
    descLabel: 't-metaXS text-[var(--t-pencil)]',
    descTextarea: INPUT,

    // Upload button row
    uploadBtnRow: 'flex mt-4',
    uploadBtn: `${ACTION} font-medium`,

    // sourceCreate (internal_table)
    sourceCreateUploading: 'flex flex-col gap-4',
    sourceCreateIdle: 'flex flex-wrap items-center gap-3',
    sourceCreateError: 't-proseXS text-[var(--t-brick)]',
    sourceCreateBtn: `${ACTION} font-medium`,     // '' → UI.Button default
    sourceCreateHint: 't-proseXS text-[var(--t-pencil)]',   // '' → no hint
    goToDatasetBtn: ACTION,                        // '' → UI.Button type plain
}
