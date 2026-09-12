import React, { useState } from "react";
import { get } from "lodash-es";
import { useMatch, useNavigate, Link } from "react-router";
import { SideNavItem } from './SideNav'
import Icon from './Icon'
import { ThemeContext, getComponentTheme } from '../useTheme'

const NOOP = () => { return {} }

const TopNav = ({ activeStyle, ...props }) => {
  const [open, setOpen] = useState(false);
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'topnav', activeStyle)
  return (
  <div className={`${theme?.layoutContainer1}`}>
		<div className={`${theme?.layoutContainer2}`}>
      <nav>
        <DesktopMenu open={open} toggle={setOpen} {...props} activeStyle={activeStyle}/>
        <MobileMenu open={open} {...props} activeStyle={activeStyle}/>
      </nav>
		</div>
  </div>
  );
};

export default TopNav;

export const MobileMenu = ({ open, toggle, menuItems = [], rightMenu = null, activeStyle}) => {
  //const { theme: fullTheme  } = React.useContext(CMSContext) || {}
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'topnav',activeStyle)

  return (
    <div
      className={`
        ${open ? "md:hidden" : "hidden"}
        ${theme?.mobileNavContainer}`
      }
      id="mobile-menu"
    >
      {menuItems.map((page, i) => (
        <SideNavItem
          key={i}
          type="top"
          to={page.path}
          icon={page.icon}
          subMenus={get(page, "subMenus", [])}
          navItem={page}
        />
      ))}
      <div className="">{rightMenu}</div>
    </div>
  );
};

export const DesktopMenu = ({
  open,
  toggle,
  menuItems = [],
  mainMenu = null,
  rightMenu = null,
  leftMenu = null,
  subMenuActivate,
  activeStyle
}) => {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'topnav', activeStyle)
  mainMenu = mainMenu ?
    mainMenu :
    (
      <HorizontalMenu
        menuItems={menuItems}
        subMenuActivate={subMenuActivate}
        activeStyle={activeStyle}
      />
    )
  // console.log('TopNav', mainMenu, menuItems)
  return (
    <div className={`${theme?.topnavWrapper}`}>
      <div className={`${theme?.topnavContent}`}>
        <div className={`${theme?.leftMenuContainer}`}>{leftMenu}</div>
        <div className={`${theme?.centerMenuContainer}`}>{mainMenu}</div>
        <div className={`${theme?.rightMenuContainer}`}>{rightMenu}</div>
        <div className={`${theme?.mobileButtonContainer}`}>
          <button className={`${theme?.mobileButton}`} onClick={() => toggle(!open)}>
            <span className="sr-only">Open main menu</span>
            <div className={`flex justify-center items-center text-2xl`}>
              <Icon icon = {!open ? theme?.menuOpenIcon : theme?.menuCloseIcon} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export const HorizontalMenu = ({menuItems, subMenuActivate, activeStyle}) => {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const maxDepth = fullTheme?.topnav?.options?.maxDepth ?? 1;

  return menuItems.map((item, i) => {
    return (
      <div key={i} className={item.sectionClass}>
        <TopNavItem
          key={i}
          navItem={item}
          subMenuActivate={subMenuActivate}
          subMenus={get(item, "subMenus", [])}
          activeStyle={ activeStyle }
          maxDepth={maxDepth}
        />
      </div>
    )
  })
}

const TopNavItem = ({
  navItem,
  parent,
  depth = 0,
  maxDepth = 1,
  className = null,
  active = false,
  subMenus = [],
  subMenuActivate = 'onHover',
  subMenuOpen = false,
  activeStyle
}) => {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'topnav', activeStyle);
  const navigate = useNavigate();
  const To = React.useMemo(() => {
    if (!Array.isArray(navItem.path)) {
      return [navItem.path];
    }
    return navItem.path;
  }, [navItem.path]);

  const subTos = React.useMemo(() => {
    const subs = subMenus.reduce((a, c) => {
      if (Array.isArray(c.path)) {
        a.push(...c.path);
      } else if (c.path) {
        a.push(c.path);
      }
      return a;
    }, []);
    return [...To, ...subs];
  }, [To, subMenus]);

  // Absolute destinations (cross-pattern nav items resolved to full URLs) are
  // not router paths: match same-origin ones by their pathname so the active
  // state still tracks, and navigate them as a normal document load below —
  // react-router's navigate() would mangle a full URL into a garbage path.
  const isAbsolute = (p) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p || '');
  const matchBase = React.useMemo(() => {
    const p = subTos[0] || '';
    if (!isAbsolute(p)) return p;
    try {
      const u = new URL(p, typeof window === 'undefined' ? 'http://x' : window.location.origin);
      return (typeof window === 'undefined' || u.origin === window.location.origin) ? u.pathname : '';
    } catch { return ''; }
  }, [subTos]);
  const routeMatch = Boolean(useMatch({ path: `${matchBase}/*` || '', end: true }));

  const linkClasses = theme?.navitem
  const activeClasses = theme?.navitemActive;

  const isActive = routeMatch || active
  const navClass = isActive ? activeClasses : linkClasses;

  const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen);

  // when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
  const [hovering, setHovering] = React.useState(false);

  React.useEffect(() => {
    setShowSubMenu(routeMatch && subMenuActivate === 'onActive');
  }, [routeMatch]);


  return (
      <div className={ theme?.[`navitemWrapper_level_${depth+1}`] || theme?.navitemWrapper }
        onMouseOutCapture={() => {
          setHovering(false);
          setShowSubMenu(false)
        }}
        onMouseMove={() => {
          setHovering(true);
          setShowSubMenu(true);
        }}
      >

        <div  className={`${className ? className : navClass}`}
          onClick={(e) => {
            e.stopPropagation();
            if (navItem?.onClick) return onClick(To[0]);
            // Full URLs leave the SPA as a document load (another pattern's page
            // or another site) — navigate() only understands router paths.
            if (To[0] && isAbsolute(To[0])) return window.location.assign(To[0]);
            if (To[0]) navigate(To[0]);
          }}
        >
          {/* -- Nav Item Contents */ }
          <div className={theme?.navitemContent} >
              {!navItem?.icon ? null : (
                <Icon
                  icon={navItem?.icon}
                  className={(isActive ? theme?.navIconActive : theme?.navIcon)}
                />
              )}
              <div>
                {navItem?.description ? (
                  <>
                    <div className={''}>
                      {navItem?.name}
                    </div>
                    <div className={ theme?.[`navitemDescription_level_${depth+1}`] || theme?.navitemDescription }>
                      {navItem?.description}
                    </div>
                  </>
                ) : (
                  <div  className={theme?.[`navitemName_level_${depth+1}`] || theme?.navitemName}>
                    {navItem?.name}
                  </div>
                )}
              </div>
              <div
                onClick={() => {
                  if (subMenuActivate === 'onClick') {
                    setShowSubMenu(!showSubMenu);
                  }
                }}
              >
                {
                  (depth < maxDepth && subMenus.length) ?
                    <Icon
                      icon={theme?.indicatorIcon || 'ArrowDown'}
                      className={theme?.indicatorIconWrapper}
                    /> : ""
                }

              </div>
            </div>

            { depth < maxDepth && subMenus.length ?
                <SubMenu
                  parent={navItem}
                  depth={depth}
                  showSubMenu={showSubMenu}
                  subMenuActivate={subMenuActivate}
                  active={routeMatch}
                  hovering={hovering}
                  subMenus={subMenus}
                  className={className}
                  maxDepth={maxDepth}
                  activeStyle={ activeStyle}
                /> : ''
              }
        </div>
      </div>
  );
};

const SubMenu = ({
  parent,
  depth,
  showSubMenu,
  subMenus,
  hovering, subMenuActivate, active,
  maxDepth,
  activeStyle
}) => {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'topnav', activeStyle)

  // if(depth === 0) {
  //  console.log('submenu parent',parent)
  // }

  if (!showSubMenu) {
    return <></>;
  }

  return (
    <div className={theme?.[`subMenuWrapper_level_${depth+1}`] || theme?.subMenuWrapper}>
      <div className={theme?.[`subMenuWrapper2_level_${depth+1}`] || theme?.subMenuWrapper2 }>
        {parent?.description && (
          <div className={theme?.subMenuParentContent}>
            <div className={theme?.subMenuParentName}>
              {parent?.name}
            </div>
            <div className={theme?.subMenuParentDesc}>
              {parent?.description}
            </div>
            {parent?.path && (
              <div className='pt-8 pb-2'>
                <Link className={theme?.subMenuParentLink} to={parent.path}>{parent.linkText || 'Explore'}</Link>
              </div>
            )}
          </div>
        )}
        <div className={parent?.description ? theme.subMenuItemsWrapperParent : theme.subMenuItemsWrapper}>
          {subMenus.map((sm, i) => (
            <TopNavItem
              parent={parent}
              depth={depth+1}
              key={i}
              to={sm.path}
              icon={sm.icon}
              className={sm.className}
              onClick={sm.onClick}
              subMenus={sm.subMenus}
              navItem={sm}
              maxDepth={maxDepth}
              activeStyle={ activeStyle }
            />
          ))}
        </div>
      </div>
    </div>
  );
};
