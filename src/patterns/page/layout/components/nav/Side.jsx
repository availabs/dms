import React, { useState } from "react";
import { Link } from "react-router-dom";

import { CMSContext } from '../../../siteConfig'

import get from "lodash/get";

import SidebarItem from "./Item";
import { MobileMenu } from './Top'

const sideBarItem = ({i, item, themeOptions, subMenuActivate}) => (
	<SidebarItem
		key={i}
		to={item.path}
		icon={item.icon}
		className={item.className}
		onClick={item.onClick}
		themeOptions={themeOptions}
		subMenuActivate={subMenuActivate}
		subMenus={get(item, "subMenus", [])}
	>
		{item.name}
	</SidebarItem>
)
const MobileSidebar = ({
   open,
   toggle,
   logo = null,
   topMenu,
   menuItems = [],
   bottomMenu,
   themeOptions={},
	subMenuActivate, subMenuStyle,
   ...props
}) => {
	const { theme: fullTheme  } = React.useContext(CMSContext)
	const theme = fullTheme['sidenav'](themeOptions);
	// theme = props.theme || theme;

	return (
		<>
			<div className="md:hidden" onClick={() => toggle(!open)}>
				<span className={open ? theme.menuIconOpen : theme.menuIconClosed} />
			</div>
			<div style={{ display: open ? "block" : "none" }} className={`md:hidden`} >
				<div className="fixed inset-0 z-20 transition-opacity ease-linear duration-300">
					<div className="absolute inset-0 opacity-75" />
				</div>
				<div className={`fixed inset-0 flex z-40 ${theme.contentBgAccent}`}>
					<div className={`flex-1 flex flex-col max-w-xs w-full transform ease-in-out duration-300 ${theme.contentBg}`}>
						<div className="absolute top-0 right-0 -mr-14 p-1">
							<button
								onClick={() => toggle(!open)}
								className="flex items-center justify-center h-12 w-12 rounded-full focus:outline-none focus:bg-gray-600 os-icon os-icon-x"
							/>
						</div>
						<div
							className={`flex-1 h-0 pt-2 pb-4 overflow-y-auto overflow-x-hidden`}
						>
							<div className="px-6 pt-4 pb-8 logo-text gray-900">
								<Link
									to={"/"}
									className={`flex-shrink-0 flex items-center ${theme.text}`}
								>
									{logo}
								</Link>
							</div>
							<div>{topMenu}</div>
							<nav className="flex-1">
								{menuItems.map((page, i) => (
									<div key={i} className={page.sectionClass}>
										{sideBarItem({i, page, themeOptions, subMenuActivate})}
									</div>
								))}
							</nav>
							<div>
								{bottomMenu}
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

const DesktopSidebar = ({
	menuItems = [],
	logo = null,
	topMenu,
	bottomMenu,
	toggle,
	open,
	mobile,
	themeOptions={},
	subMenuActivate, subMenuStyle,
	...props }) => {
	//let theme = useTheme()['sidenav'](themeOptions);
	const { theme: fullTheme  } = React.useContext(CMSContext)
	const theme = fullTheme['sidenav'](themeOptions);
	// console.log('SideNav', themeOptions, theme, useTheme()['sidenav'](themeOptions))
	// console.log('sideNav', menuItems)
	return (
		<>
			<div
				className={`${theme.sidenavWrapper}`}
			>
				{topMenu}
				<nav className={`${theme.itemsWrapper}`}>
					{menuItems.map((item, i) =>
						sideBarItem({i, item, themeOptions, subMenuActivate})
					)}
				</nav>
				{bottomMenu}
			</div>
			{mobile === 'side' ? '' :
				<div className={`${theme.topnavWrapper} md:hidden`}>
			      <div className={`${theme.topnavContent} justify-between`}>
			        <div>{topMenu}</div>
			        <div className="flex items-center justify-center h-full">
			          <div className={`${theme.topmenuRightNavContainer}`}>{bottomMenu}</div>

			          {/*<!-- Mobile menu button -->*/}
			          <button
			            type="button"
			            className={theme.mobileButton}
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
			}
		</>
	);
};

const SideNav = (props) => {
	const [open, setOpen] = useState(false);
	return (
		<>
			<DesktopSidebar {...props} open={open} toggle={setOpen} />
			{props.mobile === 'side'  ?
				<MobileSidebar open={open} toggle={setOpen} {...props} /> :
				<MobileMenu open={open} {...props} themeOptions={{}}/>
			}

		</>
	);
};
export default SideNav;
