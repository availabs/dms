import React from 'react'
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
  const isControlled = selectedIndex !== undefined && typeof setSelectedIndex === 'function';
  const [internalIndex, setInternalIndex] = React.useState(selectedIndex ?? defaultIndex);
  React.useEffect(() => {
    if (isControlled) setInternalIndex(selectedIndex);
  }, [selectedIndex, isControlled]);

  const activeIndex = isControlled ? selectedIndex : internalIndex;
  const onSelect = (i) => {
    if (isControlled) setSelectedIndex(i);
    else setInternalIndex(i);
  };

  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(themeFromContext, 'tabs', activeStyle);

  const ActivePanel = tabs[activeIndex]?.Component;
  const activeTitle = tabs[activeIndex]?.title;

  return (
    <div className={theme?.tabGroup}>
      <div className={theme?.tabpanels}>
        <div className={theme?.tabpanel} role="tabpanel">
          {activeTitle && <div className={theme?.tabTitle}>{activeTitle}</div>}
          {ActivePanel ? <ActivePanel /> : null}
        </div>
      </div>
      <div className={theme?.tablist} role="tablist">
        {tabs.map(({ name }, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            className={theme?.tab}
            onClick={() => onSelect(i)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
