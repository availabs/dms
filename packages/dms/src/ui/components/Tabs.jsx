import React from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import {getComponentTheme, ThemeContext} from "../useTheme";

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

export default function Tabs ({tabs=defaultTabs, defaultIndex=0, selectedIndex, setSelectedIndex, activeStyle}) {
  const [internalIndex, setInternalIndex] = React.useState(selectedIndex || defaultIndex)

  React.useEffect(() => setInternalIndex(selectedIndex),[selectedIndex])

  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const theme = getComponentTheme(themeFromContext,'tabs', activeStyle)

  return (
    <TabGroup selectedIndex={internalIndex} onChange={setSelectedIndex || setInternalIndex} className={theme?.tabGroup}>
      <TabPanels className={theme?.tabpanels}>
        {tabs.map(({ name, title, Component }, i) => (
          <TabPanel key={i} className={theme?.tabpanel}>
              <div className={theme?.tabTitle}>{title}</div>
              <Component />
          </TabPanel>
        ))}
      </TabPanels>
      <TabList className={theme?.tablist}>
        {tabs.map(({ name }, i) => (
            <Tab
                key={i}
                className={theme?.tab}
            >
              {name}
            </Tab>
        ))}
      </TabList>
    </TabGroup>
  )
}
