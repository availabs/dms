// Ported to tessera's var(--t-*) tokens (2026-09-19), matching
// patterns/admin/pages/themes/editTheme.theme.js's full v6 treatment — this
// is the same theme-editor feature embedded as Pattern Editor's "Theme" tab
// instead of the standalone /theme/:theme_id page, so the two should look
// and feel identical. Kept as a separate implementation (this one edits a
// PATTERN's own theme overrides + lets it switch selectedTheme, editTheme.jsx
// edits one saved theme_refs row) — not unified into one shared component,
// per the same convention used for the two `sectionGroup` implementations
// elsewhere. Preview left, controls sidebar right (unchanged from before —
// editTheme.theme.js was flipped to match THIS file, not the other way).
//
// Redesigned 2026-09-21 per design_system_v6/pages/admin-pattern-theme.html —
// two real fixes, not just a restyle:
// 1. `wrapper` was `h-[calc(100vh_-_3.5rem)]`, a viewport-relative guess that only
//    accounted for the bare topnav. Once this tab moved into the Pattern Editor's
//    sidenav chrome (behind a breadcrumb bar + `patternEditor.theme.js`'s own
//    `content` padding), that guess overshot the real remaining space. `h-full`
//    inherits the correct number from the ancestor flex chain instead of guessing.
// 2. The old `debugPre` (raw JSON dump of the pattern's theme overrides) was a
//    sibling stacked BELOW the sidebar+frame row, with no height cap of its own —
//    it ate the flex space the row needed, squeezing sidebar+frame into a ~240px
//    sliver (confirmed live via DOM measurement: body/sidebar/frameWrapper all
//    clipped to a 239px band while the unbounded `<pre>` claimed the rest). Moved
//    into a Preview/Raw Overrides tab switch inside `frameWrapper` itself — same
//    fixed box, swapped content — so it can never compete for layout space again.
//    `backButton` removed per explicit request (this tab is reached via the
//    Pattern Editor's own sidenav, not a standalone flow that needs its own way
//    back).
export const themeEditorTheme = {
    wrapper: 'flex flex-col w-full h-full min-h-0',
    header: 'flex-none border-b border-[var(--t-rule)] px-5 py-3 flex flex-wrap items-center gap-3',
    headerLeft: 'flex flex-wrap items-center gap-3',
    headerTitle: 'min-w-[180px]',
    componentSelectorWrapper: 'min-w-[180px]',
    exampleSelectorWrapper: 'min-w-[180px]',

    body: 'flex flex-1 min-h-0',
    sidebar: 'w-[300px] flex-none border-l border-[var(--t-rule)] flex flex-col min-h-0 order-2',
    sidebarSelectorWrapper: 'flex-none border-b border-[var(--t-rule)] px-4 py-3 bg-[var(--t-panel)]',
    sidebarActions: 'flex-none border-b border-[var(--t-rule)] px-4 py-2.5 flex items-center gap-2 flex-wrap',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer',
    btnReset: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer',
    // "Full Reset" (clears ALL pattern-level theme overrides, not just the
    // current form's edits) is a more destructive action than `btnReset` —
    // brick-toned like the other section's `btnRemove`, not cobalt.
    btnFullReset: 't-metaXS text-[var(--t-brick)] border border-[var(--t-brick-soft)] bg-[var(--t-brick-soft)] hover:opacity-80 rounded-md px-3 py-1.5 cursor-pointer',
    sidebarControls: 'flex-1 overflow-y-auto scrollbar-sm p-4 flex flex-col gap-5',

    // frameWrapper is now a flex-col hosting the tab bar + whichever pane (Frame
    // or debugPre) is active — both fixed-flex children so neither can ever grow
    // past the box's own bounds.
    frameWrapper: 'flex-1 min-w-0 bg-[var(--t-well)] p-6 overflow-hidden order-1 flex flex-col gap-3 min-h-0',
    frameTabBar: 'flex-none inline-flex bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-md p-0.5 self-start',
    frameTab: 't-metaXS text-[var(--t-pencil)] rounded px-3 py-1 cursor-pointer hover:text-[var(--t-ink)]',
    frameTabActive: 't-metaXS text-[var(--t-ink)] bg-[var(--t-well)] rounded px-3 py-1 cursor-pointer shadow-[var(--t-shadow-lift)]',
    frame: 'w-full flex-1 min-h-0 border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)]',

    // ControlRenderer
    controlGroup: 'flex flex-col gap-2',
    controlLabel: 't-metaXS text-[var(--t-cobalt)] uppercase tracking-[0.08em] font-semibold',

    debugPre: 'flex-1 min-h-0 t-metaXS text-[var(--t-graphite)] bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg p-4 overflow-auto',
}
