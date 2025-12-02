import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useImmer} from "use-immer";
import {ThemeContext} from "../../useTheme";
import Button from "../Button";
import Icon from "../Icon";
import Input from "../Input";
import Popup from "../Popup";
import {isEqual} from "lodash-es";

// import this in defaultTheme after theme changes are pushed
export const navigableMenuTheme = {
    button: 'px-1 py-0.5',
    icon: 'Menu',
    iconWrapper: 'size-4',
    menuWrapper: 'bg-white border min-w-[250px] min-h-[150px] rounded-md shadow-md',

    menuCloseIcon: 'XMark',
    menuCloseIconWrapper: 'hover:cursor-pointer size-4',

    menuItem: 'flex items-center justify-between px-2 py-1 rounded-md',
    menuItemHover: 'hover:bg-blue-300',
    menuItemIconLabelWrapper: 'flex flex-grow items-center gap-1',
    menuItemIconWrapper: '',
    menuItemLabel: '',
    subMenuIcon: 'ArrowRight',

    valueSubmenuIconWrapper: 'flex gap-0.5',
    subMenuIconWrapper: 'place-self-center',
    valueWrapper: 'p-0.5 rounded-md bg-gray-100 text-gray-900 text-sm',

    separator: 'w-full border-b'
}

const Comps = {
    input: Input,
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
            <div key={menuItem.name} className={theme.navigableMenu?.menuItem}>
                <Comp {...menuItem} type={menuItem.inputType} />
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
             onClick={hasChildren ? () => setActiveParent(menuItem.name) : menuItem.onClick}
        >
            <div className={theme.navigableMenu?.menuItemIconLabelWrapper}>
                <Icon className={theme.navigableMenu?.menuItemIconWrapper} icon={menuItem.icon} />
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


const Menu = ({config, title, open, setOpen}) => {
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
            {
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
                        <label className={'font-semibold text-gray-900'}>{activeParent ? activeParent : title}</label>
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
        flatConfig[itemName] = {...item, name: itemName, parent, idx};

        if(item.items){
            const obj = flattenConfig(item.items, itemName);
            Object.entries(obj).forEach(([key, val]) => {
                flatConfig[key] = val
            })
        }
    })

    return flatConfig;
}

// @params btnVisibleOnGroupHover: hides button until group is hovered. parent needs to have group class.
export default function ({config, title, btnVisibleOnGroupHover, defaultOpen, preferredPosition}) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, navigableMenu: {...navigableMenuTheme, ...(themeFromContext.navigableMenu || {})}};
    const [configStateFlat, setConfigStateFlat] = useImmer(flattenConfig(config));

    useEffect(() => {
        const newConfigStateFlat = flattenConfig(config);
        if(!isEqual(configStateFlat, newConfigStateFlat)) setConfigStateFlat(newConfigStateFlat);
    }, [config]);

    return (
                <Popup button={
                    <Button type={'plain'} className={`${theme.navigableMenu?.button} ${btnVisibleOnGroupHover ? `hidden group-hover:flex` : ``}`}>
                        <Icon className={theme.navigableMenu?.iconWrapper} icon={theme.navigableMenu?.icon}/>
                    </Button>
                }
                       btnVisibleOnGroupHover={btnVisibleOnGroupHover}
                       defaultOpen={defaultOpen}
                       preferredPosition={preferredPosition}
                >
                    {
                        ({open, setOpen}) => (
                            <Menu config={configStateFlat} title={title} open={open} setOpen={setOpen}/>
                        )
                    }
                </Popup>
    )
}