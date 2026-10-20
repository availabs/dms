// Default (un-branded) theme for the gis_dataset sub-pages (Table, Metadata).
// Brand override: src/themes/transportny `datasets.gisPages`.
export const gisPagesTheme = {
    // metadata.jsx — tessera v6 (2026-10-07, metadata page port)
    // definite height (breadcrumb 56px + source header 120px) so the column list scrolls, not the
    // page — same approach as the Table tab's tableContainer (the layout above is min-h only)
    metaOuter: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6 flex flex-col h-[calc(100svh-176px)] min-h-[480px]',
    metaInner: 'flex-1 min-h-0 flex flex-col',
    readOnlyBanner: 'flex-none t-proseSM text-[var(--t-graphite)] bg-[var(--t-well)] border border-[var(--t-rule)] rounded-md px-3 py-2 mb-4',

    // table.jsx — fill-height spreadsheet container, CONSTRAINED to the viewport width and
    // scrolling within itself (overflow-auto + min-w-0/max-w-full) so a wide table never makes the
    // whole page scroll horizontally. ("Set Default Columns" now lives in the source-page header.)
    // wraps the (definite-height) table; flex-col + overflow-hidden so the inner table owns scrolling
    // (no competing height / double scrollbars). min-w-0/max-w-full keeps the page from h-scrolling.
    // tessera v6 (2026-10-06, source page port). Project themes keep their pre-v6 values via
    // src/themes/_legacy/datasets.js.
    tableWrap: 'w-full max-w-full min-w-0 flex flex-col overflow-hidden border-t border-[var(--t-rule)]',
    tableLoadingMsg: 'pl-6 lg:pl-12 pr-6 py-8 t-proseSM text-[var(--t-pencil)]',
}
