import React, {useEffect, useMemo, useRef, useState} from "react";
import { useImmer } from "use-immer";
import { Link } from 'react-router'

import {ThemeContext} from "../../useTheme";
import Button from "../Button";
import Icon from "../Icon";
import Input from "../Input";
import Popup from "../Popup";
import {isEqual} from "lodash-es";
import { v4 as uuidv4 } from 'uuid';

const defaultItems = [
  { name: 'Save and schedule', onClick: '#' },
  { name: 'Save and publish', onClick: '#' },
  { name: 'Export PDF', onClick: '#' },
]

// import this in defaultTheme after theme changes are pushed
export const navigableMenuTheme = {
    button: 'px-1 py-0.5',
    icon: 'Menu',
    iconWrapper: 'size-4',
    menuWrapper: 'bg-white border w-64 p-1 min-h-[75px] rounded-md shadow-md',

    menuCloseIcon: 'XMark',
    menuCloseIconWrapper: 'hover:cursor-pointer size-4',

    menuItem: 'group flex items-center justify-between px-2 py-1 rounded-md text-sm text-slate-800',
    menuItemHover: 'hover:bg-blue-300',
    menuItemIconLabelWrapper: 'flex flex-grow items-center gap-1',
    menuItemIconWrapper: 'size-5 stroke-slate-500 group-hover:stroke-slate-800',
    menuItemLabel: '',
    subMenuIcon: 'ArrowRight',

    valueSubmenuIconWrapper: 'flex gap-0.5',
    subMenuIconWrapper: 'place-self-center',
    valueWrapper: 'p-0.5 rounded-md bg-gray-100 text-gray-900 text-sm',

    separator: 'w-full border-b'
}



const Comps = {
  input : Input,
  link : ({ menuItem }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = { ...themeFromContext, navigableMenu: { ...navigableMenuTheme, ...(themeFromContext.navigableMenu || {}) } };
    return (
      <Link className={`${theme.navigableMenu?.menuItemIconLabelWrapper}`} to={menuItem.path}>
        <Icon className={theme.navigableMenu?.menuItemIconWrapper} icon={menuItem?.icon || 'Blank'} />
        <label className={theme.navigableMenu?.menuItemLabel + 'cursor-pointer' }>{menuItem.name}</label>
      </Link>
    )
  }
}
const MenuItem = ({menuItem, setActiveParent}) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, navigableMenu: {...navigableMenuTheme, ...(themeFromContext.navigableMenu || {})}};

    if(menuItem.type === 'separator') return (
        <div key={menuItem.name} className={theme.navigableMenu?.menuItem}>
            <div className={theme.navigableMenu.separator} />
        </div>
    )

    if(Comps[menuItem.type]) {
        const Comp = Comps[menuItem.type];
        return (
            <div key={menuItem.name} className={`${theme.navigableMenu?.menuItem}  ${theme.navigableMenu?.menuItemHover}`}>
              <Comp {...menuItem} menuItem={menuItem} type={menuItem.inputType} />
            </div>
        )
    }

    if(typeof menuItem.type === 'function') {
        return (
            <div key={menuItem.name} className={theme.navigableMenu?.menuItem}>
                {menuItem.type(menuItem)}
            </div>
        )
    }

    const hasChildren = menuItem?.items?.length;

    return (
        <div key={menuItem.name}
             className={`${theme.navigableMenu?.menuItem} ${theme.navigableMenu?.menuItemHover}`}
             onClick={hasChildren ? () => setActiveParent(menuItem.id) : menuItem.onClick}
        >
            <div className={theme.navigableMenu?.menuItemIconLabelWrapper}>
                <Icon className={theme.navigableMenu?.menuItemIconWrapper} icon={menuItem?.icon} />
                <label className={theme.navigableMenu?.menuItemLabel}>{menuItem.name}</label>
            </div>

            <div className={theme.navigableMenu.valueSubmenuIconWrapper}>
                {
                    menuItem.showValue ? <div className={theme.navigableMenu.valueWrapper}>{menuItem.value}</div> : null
                }
                {
                    hasChildren ?
                        <Icon className={theme.navigableMenu?.subMenuIconWrapper} icon={theme.navigableMenu?.subMenuIcon} /> : null
                }
            </div>
        </div>
    )
}


const Menu = ({config, title, showTitle=true, open, setOpen}) => {
    const menuRef = useRef();
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, navigableMenu: {...navigableMenuTheme, ...(themeFromContext.navigableMenu || {})}};
    const [activeParent, setActiveParent] = useState(undefined);

    const prevParent = useMemo(() => {
        if(!activeParent) return undefined;
        return config[activeParent]?.parent;
    }, [activeParent]);

    if(!open) return null;

    return (
        <div className={theme.navigableMenu.menuWrapper} ref={menuRef}>
            { showTitle &&
                <div className={'flex px-2 py-1 justify-between'}>
                    <div className={'flex gap-2 items-center w-full'}>
                        {
                            activeParent ? (
                                <Button type={'plain'}
                                        className={'w-fit'}
                                        onClick={() => setActiveParent(prevParent)}
                                >
                                    <Icon icon={'ArrowLeft'}
                                          className={'size-4'}
                                    />
                                </Button>
                            ) : null
                        }
                        <label className={'font-semibold text-gray-900'}>{config[activeParent]?.name ? config[activeParent]?.name : title}</label>
                    </div>
                    <Button type={'plain'}
                            className={'w-fit'}
                            onClick={() => setOpen(false)}
                    >
                        <Icon icon={theme.navigableMenu.menuCloseIcon}
                              className={theme.navigableMenu.menuCloseIconWrapper}
                        />
                    </Button>
                </div>
            }
            {
                Object.values(config)
                    .filter(c => !activeParent ? !c.parent : c.parent === activeParent)
                    .map(menuItem => <MenuItem key={menuItem.name} menuItem={menuItem} setActiveParent={setActiveParent}/>)
            }
        </div>
    )
}

export const docs = []

const flattenConfig = (config, parent) => {
    const flatConfig = {};

    config.forEach((item, idx) => {
        const itemName = item.name || `${parent}_${idx}`;
        const itemId = flatConfig[item.id || itemName] ? uuidv4() : (item.id || itemName); // itemId needs to be uniq
        flatConfig[itemId] = {...item, name: itemName, parent, idx, id: itemId};

        if(item.items){
            const obj = flattenConfig(item.items, itemId);
            Object.entries(obj).forEach(([key, val]) => {
                const itemKey = flatConfig[key] ? uuidv4() : key;
                flatConfig[itemKey] = val
            })
        }
    })

    return flatConfig;
}

// @params btnVisibleOnGroupHover: hides button until group is hovered. parent needs to have group class.
export default function ({config=defaultItems, title, showTitle, btnVisibleOnGroupHover, defaultOpen, preferredPosition, children}) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, navigableMenu: {...navigableMenuTheme, ...(themeFromContext.navigableMenu || {})}};
    const [configStateFlat, setConfigStateFlat] = useImmer(flattenConfig(config));

    useEffect(() => {
        const newConfigStateFlat = flattenConfig(config);
        if(!isEqual(configStateFlat, newConfigStateFlat)) setConfigStateFlat(newConfigStateFlat);
    }, [config]);

    const popUpButton = children ? children : (
      <Button type={'plain'} className={`${theme.navigableMenu?.button} ${btnVisibleOnGroupHover ? `hidden group-hover:flex` : ``}`}>
          <Icon className={theme.navigableMenu?.iconWrapper} icon={theme.navigableMenu?.icon}/>
      </Button>
    )

  return (
    <Popup
      button={popUpButton}
      btnVisibleOnGroupHover={btnVisibleOnGroupHover}
      defaultOpen={defaultOpen}
      preferredPosition={preferredPosition}
    >
      {
        ({open, setOpen}) => (
            <Menu
              config={configStateFlat}
              title={title}
              showTitle={showTitle}
              open={open}
              setOpen={setOpen}
            />
        )
      }
    </Popup>
  )
}
