// Page-pattern failure states — the routes' errorElement (pages/error.jsx) and the no-access /
// page-does-not-exist states in pages/view.jsx + pages/edit/index.jsx, all drawn with
// components/PageStatePanel.jsx (icon + title + one sentence + actions). tessera v6, 2026-10-09,
// from design_system_v6/pages/page-error.html; mirrors datasets.errorPage (page 12). No accent
// colour. Pre-v6 values frozen in src/themes/_legacy/pages.js `errorPage` (`page` / `statePanel`
// '' → the old plain text).
const RULE = 'border-[var(--t-rule)]';
const BTN = `h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border ${RULE} bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer`;

export const errorPageTheme = {
    // error.jsx (errorElement)
    keepNav: 'yes',                 // '' → hide the side nav (pre-v6)
    page: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-8',   // '' → the pre-v6 markup
    card: `rounded-lg border ${RULE} bg-[var(--t-panel)]`,
    title: 'Something went wrong',
    // pre-v6 markup (used when `page` is ''), the old inline classes verbatim
    legacyWrap: 'pt-[88px]',
    legacyInner: 'hidden scrollbar-sm lg:block sticky top-[120px] h-[calc(100vh_-_125px)] bg-white rounded-lg shadow-md w-full overflow-y-auto overflow-x-hidden mt-8',
    legacyText: 'mx-auto max-w-fit pt-[120px] text-lg',

    // view.jsx / edit/index.jsx — no permission (signed in) + page does not exist
    statePanel: 'yes',              // '' → the old one-line <div> (pre-v6)

    // PageStatePanel
    panel: 'flex flex-col items-center text-center px-6 py-14',
    panelIcon: 'size-12 rounded-full flex items-center justify-center',
    panelIconBrick: 'bg-[var(--t-brick-soft)] text-[var(--t-brick)]',
    panelIconAmber: 'bg-[var(--t-amber-soft)] text-[var(--t-amber)]',
    panelIconNeutral: 'bg-[var(--t-well)] text-[var(--t-graphite)]',
    panelIconSvg: 'size-6',
    panelTitle: 'mt-4 t-displaySM text-[var(--t-ink)]',
    panelText: 'mt-1.5 max-w-[48ch] t-proseSM text-[var(--t-graphite)]',
    panelActions: 'mt-5 flex flex-wrap justify-center gap-2',
    actionBtn: BTN,
    actionIcon: 'size-3.5',
}
