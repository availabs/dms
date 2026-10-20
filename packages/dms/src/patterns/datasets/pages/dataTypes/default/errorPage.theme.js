// Datasets error / state pages — the routes' errorElement (pages/dataTypes/default/error.jsx) and the
// shared StatePanel (components/StatePanel.jsx: icon + title + text + actions; also the source page's
// "not found" body) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-error.html. No accent colour (owner direction
// 2026-10-07): both actions are neutral. Pre-v6 values frozen in src/themes/_legacy/datasets.js
// `errorPage`.
const RULE = 'border-[var(--t-rule)]';
const BTN = `h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border ${RULE} bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer`;

export const errorPageTheme = {
    // error.jsx
    keepNav: 'yes',                 // '' → hide the side + top nav (pre-v6)
    page: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-8',   // '' → the pre-v6 markup below
    card: `rounded-lg border ${RULE} bg-[var(--t-panel)]`,
    title: 'Something went wrong',
    // pre-v6 markup (used when `page` is ''; inside sectionGroup.default wrapper1 / wrapper3) — the old
    // inline classes, moved here verbatim
    legacyInner: 'hidden scrollbar-sm lg:block sticky top-[120px] h-[calc(100vh)] bg-white rounded-lg shadow-md w-full overflow-y-auto overflow-x-hidden',
    legacyText: 'mx-auto max-w-fit pt-[120px] text-lg',

    // StatePanel
    panel: 'flex flex-col items-center text-center px-6 py-14',
    panelIcon: 'size-12 rounded-full flex items-center justify-center',
    panelIconBrick: 'bg-[var(--t-brick-soft)] text-[var(--t-brick)]',
    panelIconAmber: 'bg-[var(--t-amber-soft)] text-[var(--t-amber)]',
    panelIconSvg: 'size-6',
    panelTitle: 'mt-4 t-displaySM text-[var(--t-ink)]',
    panelText: 'mt-1.5 max-w-[48ch] t-proseSM text-[var(--t-graphite)]',
    panelActions: 'mt-5 flex flex-wrap justify-center gap-2',
    actionBtn: BTN,
    actionIcon: 'size-3.5',
}
