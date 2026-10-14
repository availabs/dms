import React from 'react'

export const tabsTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      // v6 (2026-10-14, ui-controls.html "Tabs", ui-control-tabs-overlays.md): ink active tab (owner
      // 2026-10-13), tab row on top (DOM order is panels → tab row, hence flex-col-reverse), panel sized
      // to its content. The rule is an inset shadow and the row hides vertical overflow, so the active
      // underline never makes the bar scroll; it scrolls sideways on a phone. Pre-v6 values frozen in
      // src/themes/_legacy/ui.js `tabs`.
      tabGroup: 'w-full flex flex-col-reverse',
      tablist: 'flex items-end gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--t-rule)]',
      tab: 'inline-flex flex-none items-center gap-1.5 h-10 px-1 border-b-2 border-transparent t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)] aria-selected:border-[var(--t-ink)] aria-selected:text-[var(--t-ink)] aria-selected:font-medium',
      tabpanels: 'w-full',
      tabpanel: 'pt-6'
    },
    {
      tabGroup: 'flex flex-row divide-x divide-slate-300',
      tablist: 'flex flex-col gap-1 pt-12',
      tab: `
    p-3 font-semibold text-slate-600 focus:outline-none border-b-2 border-white text-xs hover:text-slate-900
    aria-selected:bg-blue-600 aria-selected:text-white hover:bg-white/5 focus-visible:outline-1 focus-visible:outline-white cursor-pointer
  `,
      tabpanels: 'w-full h-screen max-h-screen overflow-y-auto scrollbar-sm',
      tabpanel: 'rounded-xl bg-white/5 divide-y divide-slate-300',
      tabTitle: 'p-2 text-lg'
    },
    {
      // 'panel' — mirrors the inline tabs in LayerManager/index.jsx (left pane
      // of the map editor) so UI.Tabs consumers inside compact side panels
      // share that look.
      name: 'panel',
      tabGroup: 'flex flex-col-reverse',
      tablist: 'flex border-b',
      tab: 'mx-1 text-sm p-2 cursor-pointer text-slate-400 aria-selected:text-slate-600 aria-selected:font-medium aria-selected:border-b aria-selected:border-slate-600 focus:outline-none',
      tabpanels: 'w-full',
      tabpanel: ''
    },
    {
      // 'compact' — tessera v6 inline tabs (tab row on top, panel sized to its content). Opt-in;
      // used by the datasets metadata editor's Datasource / Custom lookup tabs (2026-10-07).
      // Appended LAST: project themes define at most 3 tabs styles (index-merged), so it survives.
      name: 'compact',
      tabGroup: 'flex flex-col-reverse',
      tablist: 'flex items-center gap-4 border-b border-[var(--t-rule)]',
      tab: 'h-8 t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] border-b-2 border-transparent -mb-px cursor-pointer aria-selected:text-[var(--t-ink)] aria-selected:font-medium aria-selected:border-[var(--t-ink)]',
      tabpanels: 'w-full',
      tabpanel: 'pt-3'
    },
    {
      // 'editDrawer' — the page editor's drawer (patterns/page EditDrawer, picked by
      // `pages.editPane.tabsStyle`): a row of equal icon tabs under the drawer's close button, ink
      // underline on the open pane, the pane scrolls below it. tessera v6, 2026-10-08. Opt-in by
      // name and appended LAST (project themes keep `pages-pane` via src/themes/_legacy/pages.js).
      name: 'editDrawer',
      // DOM order is panels → tab row, so flex-col-reverse puts the tabs on top. The pane title
      // is lifted (absolute, outside the scroller) into the drawer's header row beside the close
      // button the Drawer draws at top-right.
      tabGroup: 'relative flex flex-col-reverse h-full pt-14',
      tablist: 'flex flex-none border-y border-[var(--t-rule)]',
      tabTitle: 'absolute top-0 left-0 right-12 h-14 flex items-center px-4 t-displaySM text-[var(--t-ink)] truncate',
      tab: 'flex-1 h-10 flex items-center justify-center border-b-2 border-transparent -mb-px text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer focus:outline-none aria-selected:text-[var(--t-ink)] aria-selected:border-[var(--t-ink)]',
      tabpanels: 'flex-1 min-h-0 w-full overflow-y-auto scrollbar-sm',
      tabpanel: 'px-4 pt-2 pb-24'
    },
    {
      // 'editDrawerLegacy' — the same drawer layout in a plain gray palette (no --t-* tokens), for
      // project themes that define no 'pages-pane' tabs style (`pages.editPane.tabsStyleFallback`).
      // Before 2026-10-08 those fell back to style 0, whose full-height panel pushed the tab row
      // below the viewport — the panes could not be switched.
      name: 'editDrawerLegacy',
      tabGroup: 'relative flex flex-col-reverse h-full pt-14',
      tablist: 'flex flex-none border-y border-gray-200',
      tabTitle: 'absolute top-0 left-0 right-12 h-14 flex items-center px-4 text-base font-semibold text-gray-900 truncate',
      tab: 'flex-1 h-10 flex items-center justify-center border-b-2 border-transparent -mb-px text-gray-400 hover:text-gray-900 cursor-pointer focus:outline-none aria-selected:text-gray-900 aria-selected:border-gray-900',
      tabpanels: 'flex-1 min-h-0 w-full overflow-y-auto scrollbar-sm',
      tabpanel: 'px-2 pt-2 pb-24'
    }
  ]
}

export const docs = {
  tabs: [
    {
      name: 'Tab1',
      Component: () => <div>This is Tab 1</div>
    },
    {
      name: 'Tab2',
      Component: () => <div>This is Tab 2</div>
    }
    ]
}
