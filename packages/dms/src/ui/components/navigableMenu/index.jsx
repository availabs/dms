import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import { useImmer } from "use-immer";
import {isEqual} from "lodash-es";
import { Link } from 'react-router'

import { ThemeContext, getComponentTheme } from "../../useTheme";
import DraggableList from "../DraggableList";
import Button from "../Button";
import Icon from "../Icon";
import Input from "../Input";
import columnTypes from "../../columnTypes";
import Switch from "../Switch";
import Popup from "../Popup";
import { ColorPickerFlat } from "../Colorpicker";
import defaultTheme from "./theme";

const defaultItems = [
  { name: 'Save and schedule', onClick: '#' },
  { name: 'Save and publish', onClick: '#' },
  { name: 'Export PDF', onClick: '#' },
]

// Simple inline color picker control for NavigableMenu
const ColorPickerControl = ({ value, onChange, colors, showColorPicker = false, menuItem }) => {
  const color = value || menuItem?.value || 'rgba(0,0,0,0)';

  return (
    <ColorPickerFlat
      color={color}
      onChange={(newColor) => {
        onChange?.(newColor);
        menuItem?.onChange?.(newColor);
      }}
      colors={colors || menuItem?.colors}
      showColorPicker={showColorPicker ?? menuItem?.showColorPicker}
    />
  );
};

const Comps = {
  input : Input,
  select: columnTypes?.select?.EditComp,
  toggle: Switch,
  colorpicker: ColorPickerControl,
  link : ({ menuItem, activeStyle }) => {
    const { theme: fullTheme = { navigableMenu: defaultTheme } } = React.useContext(ThemeContext) || {};
    const theme = getComponentTheme(fullTheme, 'navigableMenu', activeStyle);
    return (
      <Link className={theme?.menuItemIconLabelWrapper} to={menuItem.path}>
        <Icon className={theme?.menuItemIconWrapper} icon={menuItem?.icon || 'Blank'} />
        <label className={`${theme?.menuItemLabel} ${theme?.menuItemLabelLink}`}>{menuItem.name}</label>
      </Link>
    )
  }
}

const MenuItem = ({menuItem, setActiveParent, goBack, goHome, changeParent, activeStyle}) => {
  const { theme: fullTheme = { navigableMenu: defaultTheme } } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(fullTheme, 'navigableMenu', activeStyle);

  if(menuItem.type === 'separator') return (
    <div key={menuItem.name} className={theme?.menuItem}>
      <div className={theme?.separator} />
    </div>
  )

  if(Comps[menuItem.type]) {
    const Comp = Comps[menuItem.type];
    return (
      <div key={menuItem.name} className={`${theme?.menuItem} ${menuItem.noHover ? '' : theme?.menuItemHover}`}>
        {menuItem.showLabel ? (
            <div className={theme?.menuItemIconLabelWrapper}>
              <Icon className={theme?.menuItemIconWrapper} icon={menuItem?.icon} />
              <label className={theme?.menuItemLabel}>{menuItem.name}</label>
            </div>
        ) : null}

        <Comp {...menuItem} menuItem={menuItem} type={menuItem.inputType} activeStyle={activeStyle} />
      </div>
    )
  }

  if(typeof menuItem.type === 'function') {
    return (
      <div key={menuItem.name} className={`${theme?.menuItem} ${menuItem.noHover ? '' : theme?.menuItemHover}`}>
        {menuItem.type(menuItem, { goBack, goHome, changeParent })}
      </div>
    )
  }

  const hasChildren = menuItem?.items?.length;
  const handleClick = hasChildren
    ? () => setActiveParent(menuItem.id)
    : menuItem.onClickGoBack ? goBack
    : menuItem.onClickGoHome ? goHome
    : menuItem.onClick;

  return (
    <div key={menuItem.id}
         className={`${theme?.menuItem} ${theme?.menuItemHover}`}
         onClick={handleClick}
    >
      <div className={theme?.menuItemIconLabelWrapper}>
        <Icon className={theme?.menuItemIconWrapper} icon={menuItem?.icon} />
        <div className={theme?.menuItemLabel}>{menuItem.name}</div>
      </div>

      <div className={theme?.valueSubmenuIconWrapper}>
        {
          menuItem.showValue ? <div className={theme?.valueWrapper}>{menuItem.value}</div> : null
        }
        {
          hasChildren ?
            <Icon className={theme?.subMenuIconWrapper} icon={theme?.subMenuIcon} /> : null
        }
      </div>
    </div>
  )
}


const Menu = ({config, title, showTitle=true, showBreadcrumbs, open, setOpen, activeStyle}) => {
  const menuRef = useRef();
  const { theme: fullTheme = { navigableMenu: defaultTheme } } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(fullTheme, 'navigableMenu', activeStyle);
  const [activeParent, setActiveParent] = useState(undefined);
  const [search, setSearch] = useState('');

  const prevParent = useMemo(() => {
    if(!activeParent) return undefined;
    return config[activeParent]?.parent;
  }, [activeParent]);

  const breadcrumbTrail = useMemo(() => {
    const trail = [];
    let current = activeParent;
    while (current) {
      trail.unshift({ id: current, name: config[current]?.name });
      current = config[current]?.parent;
    }
    return trail;
  }, [activeParent, config]);

  const showSearch = config[activeParent]?.showSearch;

  if(!open) return null;
  const menuItems = useMemo(() =>
      Object.values(config)
          .filter(c =>
              (!activeParent ? !c.parent : c.parent === activeParent) &&
              String(c.name ?? "").toLowerCase().includes(search.toLowerCase())
          ), [config, activeParent, search]);

  const changeParent = useCallback((parent) => {
    setActiveParent(parent);
    setSearch('')
  }, [])

  const goBack = useCallback(() => changeParent(prevParent), [prevParent, changeParent]);
  const goHome = useCallback(() => changeParent(undefined), [changeParent]);

  return (
    <div className={theme?.menuWrapper} ref={menuRef}>
      { showTitle &&
        <div className={theme?.menuHeaderWrapper}>
          <div className={theme?.menuHeaderContent}>
            {
              activeParent ? (
                <Button type={'plain'}
                        className={theme?.backButton}
                        onClick={() => changeParent(prevParent)}
                >
                  <Icon icon={theme?.backIcon}
                        className={theme?.backIconWrapper}
                  />
                </Button>
              ) : null
            }
            <div className={theme?.menuTitle}>{config[activeParent]?.name ? config[activeParent]?.name : title}</div>
          </div>
          <Button type={'plain'}
                  className={theme?.closeButton}
                  onClick={() => setOpen(false)}
          >
            <Icon icon={theme?.menuCloseIcon}
                  className={theme?.menuCloseIconWrapper}
            />
          </Button>
        </div>
      }
      {showBreadcrumbs && activeParent && breadcrumbTrail.length > 0 && (
        <div className={theme?.breadcrumbWrapper}>
          <span className={theme?.breadcrumbItem} onClick={() => changeParent(undefined)}>
            {title || 'Home'}
          </span>
          {breadcrumbTrail.map((crumb, i) => (
            <React.Fragment key={crumb.id}>
              <span className={theme?.breadcrumbSeparator}>/</span>
              {i < breadcrumbTrail.length - 1 ? (
                <span className={theme?.breadcrumbItem} onClick={() => changeParent(crumb.id)}>
                  {crumb.name}
                </span>
              ) : (
                <span className={theme?.breadcrumbItemActive}>{crumb.name}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      {
        showSearch && <Input placeHolder={'search...'} value={search} onChange={e => setSearch(e.target.value)} />
      }
      <div className={theme?.menuItemsWrapper}>
        {
          config[activeParent]?.canReorder ?
              <DraggableList
                  dataItems={menuItems}
                  onChange={value => config[activeParent].onReorder?.(value)}
                  renderItem={({item: menuItem}) => <MenuItem key={menuItem.id} menuItem={menuItem} setActiveParent={changeParent} goBack={goBack} goHome={goHome} changeParent={changeParent} activeStyle={activeStyle} /> }
              /> :
          menuItems.map(menuItem => <MenuItem key={menuItem.id} menuItem={menuItem} setActiveParent={changeParent} goBack={goBack} goHome={goHome} changeParent={changeParent} activeStyle={activeStyle} />)
        }
      </div>
    </div>
  )
}



const flattenConfig = (config, parent) => {
  const flatConfig = {};

  config.forEach((item, idx) => {
    const itemName = item.name || `${parent}_${idx}`;
    const itemId = flatConfig[item.id || itemName] ? crypto.randomUUID() : (item.id || itemName); // itemId needs to be uniq
    flatConfig[itemId] = {...item, name: itemName, parent, idx, id: itemId};

    if(item.items){
      const obj = flattenConfig(item.items, itemId);
      const keyRemap = {};
      const mergedKeys = [];

      Object.entries(obj).forEach(([key, val]) => {
        const itemKey = flatConfig[key] ? crypto.randomUUID() : key;
        if (itemKey !== key) {
          keyRemap[key] = itemKey;
          val = {...val, id: itemKey};
        }
        flatConfig[itemKey] = val;
        mergedKeys.push(itemKey);
      })

      // Fix parent references for items whose parent was remapped
      if (Object.keys(keyRemap).length) {
        mergedKeys.forEach(k => {
          if (keyRemap[flatConfig[k].parent]) {
            flatConfig[k].parent = keyRemap[flatConfig[k].parent];
          }
        });
      }
    }
  })

  return flatConfig;
}

// @params btnVisibleOnGroupHover: hides button until group is hovered. parent needs to have group class.
export default function NavigableMenu({config=defaultItems, title, showTitle, showBreadcrumbs, btnVisibleOnGroupHover, defaultOpen, preferredPosition, activeStyle, preventCloseOnClickOutside, children}) {
  const { theme: fullTheme = { navigableMenu: defaultTheme } } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(fullTheme, 'navigableMenu', activeStyle);
  const [configStateFlat, setConfigStateFlat] = useImmer(flattenConfig(config));

  useEffect(() => {
    const newConfigStateFlat = flattenConfig(config);
    if(!isEqual(configStateFlat, newConfigStateFlat)) setConfigStateFlat(newConfigStateFlat);
  }, [config]);

  const popUpButton = children ? children : (
    <Button type={'plain'} className={`${theme?.button} ${btnVisibleOnGroupHover ? theme?.buttonHidden : ''}`}>
      <Icon className={theme?.iconWrapper} icon={theme?.icon}/>
    </Button>
  )

  return (
    <Popup
      button={popUpButton}
      btnVisibleOnGroupHover={btnVisibleOnGroupHover}
      defaultOpen={defaultOpen}
      preferredPosition={preferredPosition}
      preventCloseOnClickOutside={preventCloseOnClickOutside}
    >
      {
        ({open, setOpen}) => (
          <Menu
            config={configStateFlat}
            title={title}
            showTitle={showTitle}
            showBreadcrumbs={showBreadcrumbs}
            open={open}
            setOpen={setOpen}
            activeStyle={activeStyle}
          />
        )
      }
    </Popup>
  )
}
