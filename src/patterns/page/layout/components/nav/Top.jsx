import React, { useState } from "react";

import get from "lodash/get";

// import { useTheme } from "../../wrappers/with-theme";
// import { MobileNav } from './awesomeNav/Top'
import NavItem from "./Item";

import { CMSContext } from '../../../siteConfig'

export const MobileMenu = ({ open, toggle, menuItems = [], rightMenu = null,themeOptions={}}) => {
  const { theme: fullTheme  } = React.useContext(CMSContext)
  const theme = fullTheme['topnav'](themeOptions);

  return (
    <div
      className={`${open ? "md:hidden" : "hidden"} ${
        theme.topnavMobileContainer
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
          >
            {page.name}
          </NavItem>
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
  const { theme: fullTheme  } = React.useContext(CMSContext)
  let theme = fullTheme['topnav'](themeOptions);
  return (
    <div className={`${theme.topnavWrapper}`}>
      <div className={`${theme.topnavContent} justify-between`}>
        <div>{leftMenu}</div>
        <div className={`${theme.topnavMenu}`}>
          {menuItems.map((page, i) => (
            <NavItem
              key={i}
              type="top"
              to={page.path}
              icon={page.icon}
              subMenuActivate={subMenuActivate}
              themeOptions={themeOptions}
              subMenus={get(page, "subMenus", [])}
            >
              {page.name}
            </NavItem>
          ))}
        </div>

        <div className="flex items-center justify-center h-full">
          <div className={`${theme.topmenuRightNavContainer}`}>{rightMenu}</div>

          {/*<!-- Mobile menu button -->*/}
          <button
            type="button"
            className={`${theme.mobileButton}`}
            onClick={() => toggle(!open)}
          >
            <span className="sr-only">Open main menu</span>
            <div className={`flex justify-center items-center text-2xl`}>
              <span
                className={!open ? theme.menuOpenIcon : theme.menuCloseIcon}
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
