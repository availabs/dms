// GIS / CSV create + add-version flow (gis_dataset/pages/Create/**) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-create.html (#gis). The numbered step cards come
// from components/CreateStep.jsx; these keys style what's inside them. Pre-v6 values (and the inline
// style={} objects, behind `legacyInlineStyles`) frozen in src/themes/_legacy/datasets.js `gisCreate`.
const RULE = 'border-[var(--t-rule)]';

export const gisCreateTheme = {
    legacyInlineStyles: '',          // 'yes' → keep the old inline style={} objects
    nameHint: 't-proseSM text-[var(--t-amber)]',

    // publish/index.jsx - PublishButton: UI.Button primary (danger after an error) in this row
    publishRow: 'flex flex-wrap items-center gap-3',
    publishHint: 't-proseXS text-[var(--t-pencil)]',

    // ErrorTable.jsx — upload / layer analysis / publish errors (2026-10-15): UI.Table named style, in a wrapper;
    // the cells' inner text classes
    errorTableStyle: 'error',
    errorTableWrap: 'mt-3',
    errTd: 't-proseSM',
    errTdCtx: 't-metaMD text-[var(--t-graphite)]',

    // schemaEditor/components.jsx — the column-name field is UI.Input 'mono' / UI.Select
    constrainedText: 't-metaMD text-[var(--t-ink)]',
    allAssigned: 't-proseXS text-[var(--t-pencil)]',
    // GisDatasetLayerDatabaseDbSchemaForm
    schemaFormTitle: 'hidden',       // the step title ("Map fields") says it
    schemaFormWaitMsg: 'block t-proseSM text-[var(--t-graphite)]',
    // the mapping table is UI.Table `tableStyle` (2026-10-15); key cell text class, and the Omit / Mbtile header
    // (label + select-all checkbox)
    schemaFormCard: `rounded-lg border ${RULE} overflow-hidden`,
    schemaFormTdKey: 't-metaMD text-[var(--t-ink)]',
    schemaFormHeaderCheck: 'inline-flex items-center gap-2',
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
    // selectLayer/index.jsx - SelectLayer: UI.FieldLabel 'inline' + UI.Select in this row (2026-10-15)
    selectLayerWrapper: '',
    selectLayerField: 'flex items-center gap-4 max-w-sm',
    selectLayerControl: 'flex-1 min-w-0',

    // uploadFile/components.jsx - GisDatasetFileMeta: a headerless UI.Table `tableStyle` (2026-10-15) in this box;
    // label / value cell text classes
    fileMetaTitle: 'hidden',         // the step title ("Upload file") says it
    fileMetaOuter: 'max-w-xl',
    fileMetaTdLeft: 't-proseSM text-[var(--t-pencil)]',
    fileMetaTdCenter: 't-proseSM text-[var(--t-ink)] break-all',
    // ProgressBar ('' progressWrap → the inline-styled bar)
    progressWrap: 'w-full flex items-center gap-3 py-1',   // w-full: it sits in a UI.Table cell
    progressLabel: 't-proseSM text-[var(--t-graphite)] w-12',
    progressTrack: 'flex-1 h-2 rounded-full bg-[var(--t-well)] overflow-hidden',
    progressFill: 'h-full bg-[var(--t-ink)]',
    progressText: 't-metaMD text-[var(--t-ink)]',

    // uploadFile/index.jsx - UploadGisDataset: the UI.FileInput drop zone, in this wrapper (2026-10-15)
    uploadFileField: 'w-full',
}
