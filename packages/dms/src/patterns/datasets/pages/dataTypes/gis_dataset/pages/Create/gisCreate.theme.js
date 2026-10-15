// GIS / CSV create + add-version flow (gis_dataset/pages/Create/**) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-create.html (#gis). The numbered step cards come
// from components/CreateStep.jsx; these keys style what's inside them. Pre-v6 values (and the inline
// style={} objects, behind `legacyInlineStyles`) frozen in src/themes/_legacy/datasets.js `gisCreate`.
const RULE = 'border-[var(--t-rule)]';
const FIELD = 'h-8 w-full px-2 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] focus:outline-none focus:border-[var(--t-ink)] disabled:opacity-50';
const TH = 'px-3 py-2 text-left font-normal t-metaXS text-[var(--t-pencil)] bg-[var(--t-well)]';
const ERR_TABLE = 'w-full mt-3 rounded-lg border border-[var(--t-brick)] overflow-hidden text-left border-separate border-spacing-0';
const CHECK = 'size-4 accent-[var(--t-ink)] cursor-pointer disabled:cursor-not-allowed';

export const gisCreateTheme = {
    legacyInlineStyles: '',          // 'yes' → keep the old inline style={} objects
    nameHint: 't-proseSM text-[var(--t-amber)]',

    // publish/index.jsx - PublishButton (base + one state class)
    publishRow: 'flex flex-wrap items-center gap-3',
    publishBtn: 'h-8 inline-flex items-center px-3.5 rounded-md border t-proseSM font-medium cursor-pointer',
    publishBtnAwaiting: `${RULE} bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`,
    publishBtnInProgress: 'border-[var(--t-amber)] bg-[var(--t-amber-soft)] text-[var(--t-amber)]',
    publishBtnError: 'border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]',
    publishHint: 't-proseXS text-[var(--t-pencil)]',
    // PublishErrorMessage
    publishErrorTable: ERR_TABLE,

    // shared error-table cells (upload / publish errors had only inline styles)
    errTh: 'px-3 py-2 text-left font-normal t-metaXS text-[var(--t-brick)] bg-[var(--t-brick-soft)]',
    errTd: 'px-3 py-2 t-proseSM text-[var(--t-brick)]',
    errTdCtx: 'px-3 py-2 t-metaMD text-[var(--t-graphite)]',

    // schemaEditor/components.jsx - FreeFormColumnNameInput
    freeFormInput: `${FIELD} t-metaMD`,
    // ConstrainedColumnNameInput
    constrainedSelect: FIELD,
    constrainedText: 't-metaMD text-[var(--t-ink)]',
    allAssigned: 't-proseXS text-[var(--t-pencil)]',
    // GisDatasetLayerDatabaseDbSchemaForm
    schemaFormTitle: 'hidden',       // the step title ("Map fields") says it
    schemaFormWaitMsg: 'block t-proseSM text-[var(--t-graphite)]',
    schemaFormCard: `rounded-lg border ${RULE} overflow-hidden`,
    schemaFormTable: 'w-full',
    schemaFormThCenter: TH,
    schemaFormTdKey: 'px-3 py-2 t-metaMD text-[var(--t-ink)]',
    schemaFormTdVal: 'px-3 py-2',
    schemaFormTdCheck: 'px-3 py-2 text-center',
    schemaFormRow: `border-t ${RULE}`,
    schemaFormCheckboxMl: `ml-2 align-middle ${CHECK}`,
    schemaCheckbox: CHECK,
    schemaFormHint: 'mt-2 t-proseXS text-[var(--t-pencil)]',

    // selectLayer/components.jsx - LayerAnalysisSection
    layerAnalysisTitle: 'block mt-4 mb-2 t-metaXS text-[var(--t-pencil)]',
    layerAnalysisOuter: `max-w-md rounded-lg border ${RULE} overflow-hidden`,
    // Layer Analysis — UI.Table named style (2026-10-14, ui-control-tables.md); cell text classes below
    tableStyle: 'list',
    layerAnalysisTdType: 't-proseSM text-[var(--t-ink)]',
    layerAnalysisTdCount: 't-metaMD text-[var(--t-ink)]',
    analyzingMsg: 't-proseSM text-[var(--t-graphite)]',
    // no features (2026-10-15) — the datasets empty-state look (udaTaskList empty*), sized to the analysis box
    layerAnalysisEmpty: 'max-w-md flex flex-col items-center text-center border border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-8',
    layerAnalysisEmptyTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    layerAnalysisEmptyText: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[52ch]',
    // ErrorMessage (layer analysis)
    errorTable: ERR_TABLE,
    errorThead: 'bg-[var(--t-brick-soft)] t-metaXS text-[var(--t-brick)] [&_th]:px-3 [&_th]:py-2 [&_th]:font-normal [&_th]:text-left',
    errorTdMsg: 'px-3 py-2 t-proseSM text-[var(--t-brick)]',

    // selectLayer/index.jsx - SelectLayer
    selectLayerWrapper: '',
    selectLayerTable: 'w-full max-w-sm',
    selectLayerTdLabel: 'pr-4 t-metaXS text-[var(--t-pencil)] whitespace-nowrap',
    selectLayerTdSelect: 'w-full',
    selectLayerSelect: FIELD,

    // uploadFile/components.jsx - GisDatasetFileMeta
    fileMetaTitle: 'hidden',         // the step title ("Upload file") says it
    fileMetaTable: 'w-full max-w-xl',
    fileMetaRowBorder: '',
    fileMetaTdLeft: 'py-1 pr-4 w-44 t-proseSM text-[var(--t-pencil)]',
    fileMetaTdCenter: 'py-1 t-proseSM text-[var(--t-ink)] break-all',
    fileMetaStatusTd: 'py-1 t-proseSM text-[var(--t-ink)]',
    // ProgressBar ('' progressWrap → the inline-styled bar)
    progressWrap: 'flex items-center gap-3 py-1',
    progressLabel: 't-proseSM text-[var(--t-graphite)] w-12',
    progressTrack: 'flex-1 h-2 rounded-full bg-[var(--t-well)] overflow-hidden',
    progressFill: 'h-full bg-[var(--t-ink)]',
    progressText: 't-metaMD text-[var(--t-ink)]',

    // GisDatasetUploadErrorMessage
    uploadErrorTable: ERR_TABLE,

    // uploadFile/index.jsx - UploadGisDataset (the file picker)
    uploadFileWrapper: 'w-full border border-dashed border-[var(--t-rule-strong)] rounded-lg',
    uploadFileInner: 'px-6 py-8 flex justify-center',
    uploadFileInput: 't-proseSM text-[var(--t-graphite)] cursor-pointer file:mr-3 file:h-8 file:px-3 file:rounded-md file:border file:border-solid file:border-[var(--t-rule)] file:bg-[var(--t-panel)] file:text-[var(--t-ink)] file:cursor-pointer',
}
