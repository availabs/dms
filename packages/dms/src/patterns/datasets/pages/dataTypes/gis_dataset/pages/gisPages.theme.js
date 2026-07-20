// Default (un-branded) theme for the gis_dataset sub-pages (Table, Metadata).
// Brand override: src/themes/transportny `datasets.gisPages`.
export const gisPagesTheme = {
    // metadata.jsx
    metaOuter: 'overflow-auto flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4',
    metaInner: 'w-full',

    // table.jsx — fill-height spreadsheet container, CONSTRAINED to the viewport width and
    // scrolling within itself (overflow-auto + min-w-0/max-w-full) so a wide table never makes the
    // whole page scroll horizontally. ("Set Default Columns" now lives in the source-page header.)
    // wraps the (definite-height) table; flex-col + overflow-hidden so the inner table owns scrolling
    // (no competing height / double scrollbars). min-w-0/max-w-full keeps the page from h-scrolling.
    tableWrap: 'w-full max-w-full min-w-0 flex flex-col overflow-hidden bg-white border-t border-gray-200',
    tableLoadingMsg: 'p-4 text-gray-400',
}
