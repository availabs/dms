import React, { useState } from "react";
import { get } from "lodash-es";
import { useMatch, useNavigate, Link } from "react-router";
import { SideNavItem } from './SideNav'
import Icon from './Icon'
import useTheme from '../useTheme'

const NOOP = () => { return {} }

 export const topNavTheme = {
      fixed: 'mt-8',
      topnavWrapper: `px-[24px] bg-slate-100  w-full h-full flex items-center md:rounded-lg shadow pointer-events-auto`,
      topnavContent: `flex items-center w-full h-full  `,
      topnavMenu: `hidden py-2  md:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
      mobileButton:`md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
      indicatorIcon: 'ArrowDown',
      indicatorIconOpen: 'ArrowDown',
      indicatorIconWrapper: 'size-3',
      menuItemWrapper1: [
        ' ',
        ''
      ],
      menuItemWrapper1Parent: [
        ' ',
        'bg-[#F3F8F9] p-4 rounded-lg'
      ],
      menuItemWrapper2: [
        'flex text-[#37576B] ',
        ' '
      ],
      menuIconTop: `text-blue-400 mr-3 text-lg group-hover:text-blue-500`,
      menuIconTopActive : `text-blue-500 mr-3 text-lg group-hover:text-blue-500`,
      menuOpenIcon: `Menu`,
      menuCloseIcon: `XMark`,
      navitemTop: `
          w-fit group  whitespace-nowrap
          flex items-center 
          text-[16px] font-['Proxima_Nova'] font-[500] 
          px-2 uppercase
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer
      `,
      navitemTopActive:
        ` w-fit group  whitespace-nowrap
          flex  items-center 
          text-[16px] font-['Proxima_Nova'] font-[500] 
          px-2 text-blue uppercase
          focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
          transition cursor-pointer 
        `,
      navItemDescription: ['hidden',`text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B] text-wrap`],
      //`px-4 text-sm font-medium tracking-widest uppercase inline-flex items-center  border-transparent  leading-5 text-white hover:bg-white hover:text-darkblue-500 border-gray-200 focus:outline-none focus:text-gray-700 focus:border-gray-300 transition duration-150 ease-in-out h-full`,
      topmenuRightNavContainer: "hidden md:flex h-full items-center",
      topnavMobileContainer: "bg-slate-50 pointer-events-auto",
     
      
      subMenuWrapper1: [
        'absolute left-0 right-0 normal-case mt-4 z-10 px-4 pt-[42px] px-[62px] cursor-default'
      ],
      subMenuWrapper2: `bg-white flex items-stretch rounded-lg p-4 shadow`,
      subMenuParentContent: 'basis-1/3  text-wrap pr-[64px]',
      subMenuParentName: `text-[36px] font-['Oswald'] font-500 text-[#2D3E4C] uppercase pb-2`,
      subMenuParentDesc: `text-[16px] font-['Proxima_Nova'] font-[400] text-[#37576B]`,
      subMenuParentLink: `w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]`,
      subMenuItemsWrapperParent: 'grid grid-cols-2 gap-1 flex-1',
      subMenuItemsWrapper: 'grid grid-cols-4 flex-1'

      
}

export const MobileMenu = ({ open, toggle, menuItems = [], rightMenu = null,themeOptions={}}) => {
  //const { theme: fullTheme  } = React.useContext(CMSContext) || {}
  const fullTheme = useTheme()
  const theme = (fullTheme?.['topnav'] || {} ) //(themeOptions);

  return (
    <div
      className={`${open ? "md:hidden" : "hidden"} ${
        theme?.topnavMobileContainer
      }`}
      id="mobile-menu"
    >
      <div className="">
        {menuItems.map((page, i) => (
          <SideNavItem
            key={i}
            type="top"
            to={page.path}
            icon={page.icon}
            themeOptions={themeOptions}
            subMenus={get(page, "subMenus", [])}
            navItem={page}
          />
           
        ))}
      </div>
      <div className="">{rightMenu}</div>
    </div>
  );
};

export const DesktopMenu = ({
  open,
  toggle,
  menuItems = [],
  rightMenu = null,
  leftMenu = null,
  subMenuActivate,
  themeOptions={}
}) => {
  //const { theme: fullTheme  } = React.useContext(CMSContext) || {}
  const fullTheme = useTheme()
  const theme = (fullTheme?.['topnav'] || {} ) //(themeOptions);
  return (
    <div className={`${theme?.topnavWrapper}`}>
      <div className={`${theme?.topnavContent} justify-between`}>
        <div>{leftMenu}</div>
        <div className={`${theme?.topnavMenu}`}>
          {menuItems.map((page, i) => (
            <NavItem
              key={i}
              type="top"
              to={page.path}
              icon={page.icon}
              subMenuActivate={subMenuActivate}
              themeOptions={themeOptions}
              subMenus={get(page, "subMenus", [])}
              navItem={page}
            />
          ))}
        </div>

        <div className="flex items-center justify-center h-full">
          <div className={`${theme?.topmenuRightNavContainer}`}>{rightMenu}</div>

          {/*<!-- Mobile menu button -->*/}
          <button
            type="button"
            className={`${theme?.mobileButton}`}
            onClick={() => toggle(!open)}
          >
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

const TopNav = ({ ...props }) => {
  const [open, setOpen] = useState(false);
  return (
    <nav>
      <DesktopMenu open={open} toggle={setOpen} {...props} />
      <MobileMenu open={open} {...props} />
    </nav>
  );
};

export default TopNav;


const NavItem = ({
  navItem,
  parent,
  depth = 0,
  maxDepth = 1,
  children,
  icon,
  to,
  onClick,
  className = null,
  type = "side",
  active = false,
  subMenus = [],
  themeOptions,
  subMenuActivate = 'onHover',
  subMenuOpen = false
}) => {
  // console.log('renderMenu')
  //const { theme: fullTheme  } = React.useContext(CMSContext) || {}
  const fullTheme = useTheme()
  const theme = (fullTheme?.[type === 'side' ? 'sidenav' : 'topnav'] || {}) //(themeOptions);

  const navigate = useNavigate();
  const To = React.useMemo(() => {
    if (!Array.isArray(to)) {
      return [to];
    }
    return to;
  }, [to]);

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

  const routeMatch = Boolean(useMatch({ path: `${subTos[0]}/*` || '', end: true }));

  const linkClasses = type === "side" ? theme?.navitemSide : theme?.navitemTop;
  const activeClasses =
    type === "side" ? theme?.navitemSideActive : theme?.navitemTopActive;

  const isActive = routeMatch || active
  const navClass = isActive ? activeClasses : linkClasses;

  const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen);

  // when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
  const [hovering, setHovering] = React.useState(false);

  React.useEffect(() => {
         setShowSubMenu(routeMatch && subMenuActivate === 'onActive');
  }, [routeMatch]);

  // console.log('item', theme, theme?.menuItemWrapper1?.[depth])

  return (
      <div className={
        parent?.description ? 
        (theme?.menuItemWrapper1Parent?.[depth] || theme?.menuItemWrapper1Parent) :
        (theme?.menuItemWrapper1?.[depth] || theme?.menuItemWrapper1) }
        onMouseOutCapture={() => {
          setHovering(false); 
          setShowSubMenu(false)
        }}
        onMouseMove={() => {
          setHovering(true);
          setShowSubMenu(true);
        }}
      >
        
        <div
          className={`${className ? className : navClass}`}
          
          onClick={(e) => {
            e.stopPropagation();
            if (onClick) return onClick(To[0]);
            if (To[0]) navigate(To[0]);
          }}
        >
          <div className={theme.menuItemWrapper2?.[depth] || theme?.menuItemWrapper2}>
            <div className='flex-1 flex items-center gap-[2px]' >
              {!icon ? null : (
                <Icon
                  icon={icon}
                  className={
                    type === "side" ? 
                      (isActive ? theme?.menuIconSideActive : theme?.menuIconSide)
                      : (isActive ? theme?.menuIconTopActive : theme?.menuIconTop)

                  }
                />
              )}
              <div>
                {navItem?.description ? (
                  <>
                    <div  className={''}>
                      {navItem?.name}
                    </div>
                    <div className={theme?.navItemDescription?.[depth] || theme?.navItemDescription}>
                      {navItem?.description}
                    </div>
                  </>
                ) : (
                  <div  className={theme?.navItemContent?.[depth] || theme?.navItemContent?.[0]}>
                    {navItem?.name}
                  </div>
                )}
              </div>
              <div
                onClick={() => {
                  if (subMenuActivate === 'onClick') {
                    // localStorage.setItem(`${to}_toggled`, `${!showSubMenu}`);
                    setShowSubMenu(!showSubMenu);
                  }
                }}
              >
                {
                  depth < maxDepth && subMenus.length ? <Icon icon={theme?.indicatorIcon || 'ArrowDown'} className={theme?.indicatorIconWrapper} /> : null
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
                  type={type}
                  className={className}
                  maxDepth={maxDepth}
                /> : ''
              }
          </div>
        </div>
      </div>
  );
};

const SubMenu = ({ parent, depth, showSubMenu, subMenus, type, hovering, subMenuActivate, active, maxDepth }) => {
  const fullTheme = useTheme()
  //const { theme: fullTheme  } = React.useContext(CMSContext)
  const theme = (fullTheme?.[type === 'side' ? 'sidenav' : 'topnav'] || {}) //(themeOptions);
  
  // if(depth === 0) {
  //  console.log('submenu parent',parent)
  // }
  
  if (!showSubMenu) {
    return <></>;
  }

  return (
    <div
      className={   
        theme?.subMenuWrapper1?.[depth] || theme?.subMenuWrapper1 
      }
    >
      
      <div
        className={`${ theme?.subMenuWrapper2?.[depth]} || ${theme?.subMenuWrapper2}`}
      >
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
            <NavItem
              parent={parent}
              depth={depth+1}
              key={i}
              to={sm.path}
              icon={sm.icon} 
              type={type} 
              className={sm.className}
              onClick={sm.onClick}
              subMenus={sm.subMenus}
              navItem={sm}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      </div>
      
    </div>
  );
};