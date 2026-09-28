// Map section option tables. Kept out of ./index.jsx (which re-exports them)
// so the eagerly-loaded section settings (settings/more.jsx) can read them
// without pulling the lazily-loaded MapSection — and maplibre — into the
// initial bundle. See planning/tasks/completed/bundle-split-initial-graph.md.

export const HEIGHT_OPTIONS = {
    "full": 'calc(95vh)',
    // True viewport height for full-screen workbench pages (pair with the
    // `workbench` sectionGroup style + a p-0 section).
    "screen": '100vh',
    1: "900px",
    "2/3": "600px",
    // Half-column embeds beside a stacked sibling column (e.g. a map + two
    // chart cards): 600 overshoots the band, 300 undershoots it. The settings
    // Height select derives from Object.keys here, so this is the only edit.
    "1/2": "450px",
    "1/3": "300px",
    "1/4": "150px",
};

export const PANEL_POSITION_OPTIONS = {
    'top-left':"top-0 left-0",
    'top':"left-[40%] top-0",
    'top-right':"top-0 right-0",
    'bottom-left':"bottom-0 left-0",
    'bottom':"left-[40%] bottom-0",
    'bottom-right':"bottom-0 right-0",
    'hide':'hidden'
}
