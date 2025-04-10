import React, { useState } from "react";

import { get } from "lodash-es";;

// import { useTheme } from "../../wrappers/with-theme";
// import { MobileNav } from './awesomeNav/Top'
import NavItem from "./Item";
const NOOP = () => { return {} }

import { CMSContext } from '../../../siteConfig'

// export const topNavTheme = {
//     "fixed": 'mt-12',
//     "topnavWrapper": "w-full bg-slate-100 border-b border-gray-200",
//     "topnavContent": "flex w-full h-full",
//     "topnavMenu": "hidden uppercase md:flex flex-1  divide-x-2 h-full overflow-x-auto overflow-y-hidden scrollbar-sm",
//     "menuItemWrapper": "flex",
//     "menuIconTop": "text-blue-500 mr-3 text-lg group-hover:text-blue-500",
//     "menuIconTopActive": "text-blue-500 mr-3 text-lg group-hover:text-blue-500",
//     "menuOpenIcon": "fa-light fa-bars fa-fw",
//     "menuCloseIcon": "fa-light fa-xmark fa-fw",
//     "navitemTop": `
//       w-fit group font-display whitespace-nowrap
//       flex font-medium tracking-widest items-center text-[14px] px-4 h-12 text-slate-700 border-slate-100
//       hover:bg-white hover:text-blue-500
//       focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//       transition cursor-pointer`,
//     "topmenuRightNavContainer": "hidden md:flex h-full items-center",
//     "topnavMobileContainer": "bg-slate-50",
//     "navitemTopActive": `
//       w-fit group font-display whitespace-nowrap
//       flex font-medium  tracking-widest bg-white items-center text-[14px] px-4 h-12 text-blue-500 border-slate-100
//       hover:bg-white hover:text-blue-500
//       focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//       transition cursor-pointer`,
//     "mobileButton": "md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 ",
//     "indicatorIcon": "fal fa-angle-down pl-2 pt-1",
//     "indicatorIconOpen": "fal fa-angle-down pl-2 pt-1",
//     "subMenuWrapper": "absolute bg-white ml-NaN",
//     "subMenuParentWrapper": "flex flex-row  ",
//     "subMenuWrapperChild": "divide-x overflow-x-auto flex",
//     "subMenuWrapperTop": "absolute top-full left-0 border-y border-gray-200 w-full bg-white normal-case",
//     "subMenuWrapperInactiveFlyout": "absolute  mt-8 normal-case bg-white shadow-lg z-10 p-2",
//     "subMenuWrapperInactiveFlyoutBelow": " absolute ml-40 normal-case bg-white shadow-lg z-10 p-2",
//     "subMenuWrapperInactiveFlyoutDirection": "flex flex-col divide-y-2",
// }

 export const topNavTheme = {
      fixed: 'mt-8',
      topnavWrapper: `px-[24px] bg-slate-100  w-full h-full flex items-center md:rounded-lg shadow pointer-events-auto`,
      topnavContent: `flex items-center w-full h-full  `,
      topnavMenu: `hidden py-2  md:flex items-center flex-1  h-full overflow-x-auto overflow-y-hidden scrollbar-sm`,
      mobileButton:`md:hidden bg-slate-100 inline-flex items-center justify-center pt-[12px] px-2 hover:text-blue-400  text-gray-400 hover:bg-gray-100 `,
      indicatorIcon: 'fal fa-angle-down pl-2 pt-1',
      indicatorIconOpen: 'fal fa-angle-down pl-2 pt-1',
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
      menuOpenIcon: `fa-light fa-bars fa-fw`,
      menuCloseIcon: `fa-light fa-xmark fa-fw"`,
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
      topnavMobileContainer: "bg-slate-50",
     
      
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
  const { theme: fullTheme  } = React.useContext(CMSContext) || {}
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
          <NavItem
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
  const { theme: fullTheme  } = React.useContext(CMSContext) || {}
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
              <span
                className={!open ? theme?.menuOpenIcon : theme?.menuCloseIcon}
              />
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
