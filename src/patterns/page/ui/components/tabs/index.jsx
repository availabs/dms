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
  tabpanels: '',
  tabpanel: 'rounded-xl bg-white/5'
}

export default function Tabs ({tabs=defaultTabs, defaultIndex=0, selectedIndex, setSelectedIndex}) {
  const [internalIndex, setInternalIndex] = React.useState(selectedIndex || defaultIndex)

  React.useEffect(() => setInternalIndex(selectedIndex),[selectedIndex])

  const { theme = { tabs: tabsTheme } } = React.useContext(CMSContext) || {}
  return (
    <TabGroup selectedIndex={internalIndex} onChange={setSelectedIndex || setInternalIndex}>
      <TabList className={theme?.tabs?.tablist}>
        {tabs.map(({ name }, i) => (
          <Tab
            key={i}
            className={theme?.tabs?.tab}
          >
            {name}
          </Tab>
        ))}
      </TabList>
      <TabPanels className={theme?.tabs?.tabpanels}>
        {tabs.map(({ name, Component }, i) => (
          <TabPanel key={i} className={theme?.tabs?.tabpanel}>
              <Component />
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
}
