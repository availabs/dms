import React from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';

const defaultTabs = [
  {
    name: 'Tab1',
    Component: () => <div>This is Tab 1</div>
  },
  {
    name: 'Tab2',
    Component: () => <div>This is Tab 2</div>
  },
]

export const tabsTheme = {
  tablist: 'flex gap-4',
  tab: `
    py-1 px-3 font-semibold text-slate-600 focus:outline-none border-b-2 border-white text-xs hover:text-slate-900
    data-[selected]:border-blue-500 data-[selected]:bg-white/10 data-[hover]:bg-white/5 data-[selected]:data-[hover]:bg-white/10 data-[focus]:outline-1 data-[focus]:outline-white
  `,
  tabpanels: 'mt-3',
  tabpanel: 'rounded-xl bg-white/5 p-3'
}

export default function Tabs ({tabs=defaultTabs, selectedIndex=0}) {
  const { theme = { tabs: tabsTheme } } = React.useContext(CMSContext) || {}
  return (  
    <TabGroup defaultIndex={selectedIndex}>
      <TabList className={theme?.tabs?.tablist}>
        {tabs.map(({ name }) => (
          <Tab
            key={name}
            className={theme?.tabs?.tab}
          >
            {name}
          </Tab>
        ))}
      </TabList>
      <TabPanels className={theme?.tabs?.tabpanels}>
        {tabs.map(({ name, Component }) => (
          <TabPanel key={name} className={theme?.tabs?.tabpanel}>
              <Component />
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
}
