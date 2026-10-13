// Internal source tab pages (dataTypes/internal/pages/{upload,validate,debug}.jsx) — page chrome only;
// the Upload / Validate bodies are components/upload.jsx (`datasets.upload`) and
// components/ValidateComp.jsx (`datasets.validateComp`). tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-internal.html. These were unthemed; the old
// hardcoded classes are frozen in src/themes/_legacy/datasets.js `internalPages`.
const PAGE = 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6';

export const internalPagesTheme = {
    uploadPage: PAGE,
    uploadIntro: 't-proseSM text-[var(--t-graphite)] mb-4 max-w-[70ch]',   // '' → no intro line
    uploadIntroEm: 'font-medium text-[var(--t-ink)]',
    emptyMsg: 't-proseSM text-[var(--t-pencil)]',                            // "Please select a version" / "Please setup metadata."
    validatePage: PAGE,                                                     // '' → page.wrapper1 + max-w-7xl mx-auto bg-white (pre-v6)
    noMetaMsg: 't-proseSM text-[var(--t-pencil)]',
    debugPage: PAGE,
    debugCard: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4',
    debugLabel: 't-metaXS text-[var(--t-pencil)] mb-2',                     // '' → no label
    debugPre: 't-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded p-3 overflow-auto max-h-[70vh]',
}
