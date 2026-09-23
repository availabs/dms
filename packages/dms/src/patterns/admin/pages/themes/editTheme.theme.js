// Ported to tessera's var(--t-*) tokens (2026-09-19) from the design-system
// mockup src/themes/tessera/design_system_v6/pages/admin-theme-edit.html —
// the first v6 design this page ever had (previously hardcoded
// gray-700/blue-400 literals, zero theming). AdminLayout always uses the
// hardcoded "default" theme (patterns/admin/siteConfig.jsx), so this is
// what every project sees for the theme editor.
export const editThemeTheme = {
    wrapper: 'flex flex-col w-full h-[calc(100vh_-_3.5rem)] min-h-0',
    header: 'flex-none border-b border-[var(--t-rule)] px-5 py-3 flex flex-wrap items-center gap-3',
    headerLeft: 'flex flex-wrap items-center gap-3',
    headerThemeName: 't-displayMD text-[var(--t-ink)] truncate',
    componentSelectorWrapper: 'min-w-[180px]',
    exampleSelectorWrapper: 'min-w-[180px]',
    backButton: 'inline-flex items-center gap-1.5 t-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer',

    body: 'flex flex-1 min-h-0',
    // Preview left, controls sidebar right — matches
    // patternEditor/default/themeEditor.theme.js's (the same feature,
    // embedded as Pattern Editor's "Theme" tab) existing arrangement
    // (2026-09-19; this file previously had the two panes swapped).
    sidebar: 'w-[300px] flex-none border-r border-[var(--t-rule)] flex flex-col min-h-0 order-2',
    sidebarSelectorWrapper: 'flex-none border-b border-[var(--t-rule)] px-4 py-3 bg-[var(--t-panel)]',
    sidebarActions: 'flex-none border-b border-[var(--t-rule)] px-4 py-2.5 flex items-center gap-2',
    btnSave: 't-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5 cursor-pointer',
    btnReset: 't-proseSM text-[var(--t-graphite)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] rounded-md px-3.5 py-1.5 cursor-pointer',
    sidebarControls: 'flex-1 overflow-y-auto scrollbar-sm p-4 flex flex-col gap-5',
    frameWrapper: 'flex-1 min-w-0 bg-[var(--t-well)] p-6 overflow-auto order-1',
    frame: 'w-full h-full border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)]',

    // ControlRenderer
    controlGroup: 'flex flex-col gap-2',
    controlLabel: 't-metaXS text-[var(--t-cobalt)] uppercase tracking-[0.08em] font-semibold',

    noAccess: 'flex items-center justify-center h-48 t-proseSM text-[var(--t-pencil)]',
}
