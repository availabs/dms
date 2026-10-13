// EditPane (the floating pane bar at the bottom of a page in edit mode), its PublishButton, the
// busy indicator and the EditDrawer shell — pages/edit/editPane/index.jsx + pagesPane.jsx.
// tessera v6, 2026-10-08, from src/themes/tessera/design_system_v6/pages/page-edit.html: the bar
// sits on the dark "board" surface so it reads as a tool, not page content; no accent colour.
// These were hardcoded (bg-neutral-900 / slate / blue-500) before; the pre-v6 literals are frozen
// in src/themes/_legacy/pages.js `editPane`, so every project theme renders exactly as before.
const BTN = 'size-9 shrink-0 rounded-lg flex items-center justify-center cursor-pointer transition-colors';

export const editPaneTheme = {
    // the bar
    wrapper: 'fixed bottom-3 left-0 right-0 z-50 pointer-events-none',
    bar: 'pointer-events-auto mx-auto w-fit max-w-[calc(100vw_-_1.5rem)] flex items-center gap-1 bg-[var(--t-board)] border border-[var(--t-board-2)] rounded-xl shadow-[var(--t-shadow-drag)] p-1.5',
    paneBtn: `${BTN} text-[var(--t-chalk-dim)] hover:text-[var(--t-chalk)] hover:bg-[var(--t-board-2)]`,
    // the pane whose drawer is open ('' → no active state)
    paneBtnActive: `${BTN} text-[var(--t-chalk)] bg-[var(--t-board-2)]`,
    paneIcon: 'size-5',
    divider: 'w-px h-6 mx-1 bg-[var(--t-board-2)]',
    gridBtn: `${BTN} text-[var(--t-chalk-dim)] hover:text-[var(--t-chalk)] hover:bg-[var(--t-board-2)]`,
    gridBtnActive: `${BTN} text-[var(--t-chalk)] bg-[var(--t-board-2)]`,
    gridIcon: 'size-5',
    spacer: 'hidden',                                 // pre-v6: 'flex-1' (fixed 500px bar)
    publishSlot: 'flex items-center',

    // PublishButton — '' publishBtn → UI.Button (pre-v6)
    publishWrapper: 'flex items-center gap-1',
    // draft / published marker before the buttons ('' → not rendered)
    publishStatus: 'inline-flex items-center gap-1.5 px-1.5 t-metaXS text-[var(--t-chalk-dim)] whitespace-nowrap',
    publishStatusDotDraft: 'size-1.5 rounded-full bg-[var(--t-amber)]',
    publishStatusDotPublished: 'size-1.5 rounded-full bg-[var(--t-go)]',
    discardBtn: 'h-9 px-3 rounded-lg t-proseSM text-[var(--t-chalk)] hover:bg-[var(--t-board-2)] cursor-pointer whitespace-nowrap',
    publishBtn: 'h-9 px-4 rounded-lg t-proseSM font-medium text-[var(--t-board)] bg-[var(--t-chalk)] hover:opacity-90 cursor-pointer whitespace-nowrap',
    publishBtnDisabled: 'h-9 px-4 rounded-lg t-proseSM text-[var(--t-chalk-dim)] border border-[var(--t-board-2)] cursor-not-allowed whitespace-nowrap',

    // LoadingDisplay — the busy indicator
    busy: 'fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-full shadow-[var(--t-shadow-lift)] px-3 py-1.5',
    busyDot: 'size-2 rounded-full bg-[var(--t-amber)] animate-pulse',   // '' → no dot
    busyText: 't-metaXS text-[var(--t-graphite)]',

    // EditDrawer — UI.Drawer width + the UI.Tabs style for its icon tab row
    drawerWidth: 'w-[350px]',
    tabsStyle: 'editDrawer',
    // used when the theme's tabs have no style named `tabsStyle` ('' → tabsStyle as-is)
    tabsStyleFallback: '',
    tabIcon: 'size-[18px]',
}
