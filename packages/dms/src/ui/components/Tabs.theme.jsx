import React from 'react'

export const tabsTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      tabGroup: 'flex flex-col-reverse',
      tablist: 'flex gap-4',
      tab: `
    py-1 px-3 font-semibold text-slate-600 focus:outline-none border-b-2 border-white text-xs hover:text-slate-900
    data-[selected]:border-blue-500 data-[selected]:bg-white/10 data-[hover]:bg-white/5 data-[selected]:data-[hover]:bg-white/10 data-[focus]:outline-1 data-[focus]:outline-white
  `,
      tabpanels: 'w-full h-screen max-h-screen overflow-y-auto scrollbar-sm',
      tabpanel: 'rounded-xl bg-white/5'
    },
    {
      tabGroup: 'flex flex-row divide-x divide-slate-300',
      tablist: 'flex flex-col gap-1 pt-12',
      tab: `
    p-3 font-semibold text-slate-600 focus:outline-none border-b-2 border-white text-xs hover:text-slate-900
    data-[selected]:bg-blue-600 data-[selected]:text-white data-[hover]:bg-white/5 data-[focus]:outline-1 data-[focus]:outline-white cursor-pointer
  `,
      tabpanels: 'w-full h-screen max-h-screen overflow-y-auto scrollbar-sm',
      tabpanel: 'rounded-xl bg-white/5 divide-y divide-slate-300',
      tabTitle: 'p-2 text-lg'
    },
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
