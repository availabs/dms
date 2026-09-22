import React from 'react'

export const tabsTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      tabGroup: 'w-full',
      tablist: 'flex items-center gap-0 border-b border-[var(--t-rule)]',
      tab: `
    cursor-pointer font-mono text-[13px] font-medium px-4 py-2.5 text-[var(--t-graphite)] hover:text-[var(--t-ink)] border-b-2 border-transparent -mb-px transition-colors duration-150
    aria-selected:text-[var(--t-cobalt)] aria-selected:border-[var(--t-cobalt)]
  `,
      tabpanels: 'w-full h-screen max-h-screen overflow-y-auto scrollbar-sm',
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
