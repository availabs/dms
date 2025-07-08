import React, { useState } from "react";
import { useMatch, useNavigate, Link } from "react-router";
import Icon from './Icon'
import { MobileMenu } from './TopNav'
import {ThemeContext} from '../useTheme'

const NOOP = () => { return {} }



const sideBarItem = ({i, item, subMenuActivate}) => (
	<SideNavItem
		key={i}
		to={item.path}
		navItem={item}
		icon={item.icon}
		className={item.className}
		onClick={item.onClick}
		subMenuActivate={subMenuActivate}
		subMenus={item?.subMenus || []}
	/>
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
	const { theme: fullTheme } = React.useContext(ThemeContext);
	const theme = (fullTheme?.['sidenav'] || {});
	// theme = props.theme || theme;

	return (
		<>
			<div className="md:hidden" onClick={() => toggle(!open)}>
				<span className={open ? theme?.menuIconOpen : theme?.menuIconClosed} />
			</div>
			<div style={{ display: open ? "block" : "none" }} className={`md:hidden`} >
				<div className="fixed inset-0 z-20 transition-opacity ease-linear duration-300">
					<div className="absolute inset-0 opacity-75" />
				</div>
				<div className={`fixed inset-0 flex z-40 ${theme?.contentBgAccent}`}>
					<div className={`flex-1 flex flex-col max-w-xs w-full transform ease-in-out duration-300 ${theme?.contentBg}`}>
						<div className="absolute top-0 right-0 -mr-14 p-1">
							<button
								onClick={() => toggle(!open)}
								className="flex items-center justify-center h-12 w-12 rounded-full focus:outline-none focus:bg-gray-600 os-icon os-icon-x"
							/>
						</div>
						<div
							className={`flex-1 h-0 pt-2 pb-4 overflow-y-auto overflow-x-hidden flex`}
						>
							<div>{topMenu}</div>
							<nav className="flex-1">
								{menuItems.map((page, i) => (
									<div key={i} className={page.sectionClass}>
										{sideBarItem({i, page, themeOptions, subMenuActivate})}
									</div>
								))}
							</nav>
							<div className={theme.bottomMenuWrapper}>
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
	subMenuActivate='onClick', 
	subMenuStyle,
	...props }) => {
	//let theme = useTheme()['sidenav'](themeOptions);
	//const { theme: fullTheme  } = React.useContext(CMSContext) || {}
	const { theme: fullTheme } = React.useContext(ThemeContext);
	const theme = (fullTheme?.['sidenav'] || {})//(themeOptions);


	return (
		<>
			<div
				className={`${theme?.sidenavWrapper}`}
			>
				{topMenu}
				<nav className={`${theme?.itemsWrapper}`}>
					{menuItems.map((item, i) =>
						sideBarItem({i, item, themeOptions, subMenuActivate})
					)}
				</nav>
				<div className={theme.bottomMenuWrapper}>
				{bottomMenu}
				</div>
			</div>
			{mobile === 'side' ? '' :
				<div className={`${theme?.topnavWrapper} md:hidden`}>
			      <div className={`${theme?.topnavContent} justify-between`}>
			        <div>{topMenu}</div>
			        <div className="flex items-center justify-center h-full">
			          <div className={`${theme?.topmenuRightNavContainer}`}>{bottomMenu}</div>

			          {/*<!-- Mobile menu button -->*/}
			          <button
			            type="button"
			            className={theme?.mobileButton}
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
			}
		</>
	);
};


export default function SideNav (props) {
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



export const SideNavItem = ({
	depth = 0,
	navItem,
	children,
	icon,
	to,
	onClick,
	className = null,
	type = "side",
	active = false,
	subMenus = [],
	subMenuActivate = 'onClick',
	subMenuOpen = false
}) => {
	//console.log('renderMenu', subMenuActivate)
	// const { theme: fullTheme  } = React.useContext(CMSContext) || {}
	// const theme = (fullTheme?.['sidenav'] || {}) 
	const { theme: fullTheme } = React.useContext(ThemeContext);
   const theme = (fullTheme?.['sidenav'] || {}) //(themeOptions);


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

	const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen || routeMatch);

	// when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
	const [hovering, setHovering] = React.useState(false);

	return (
			<div className={type === "side" ? theme?.subMenuParentWrapper : null}
				 onMouseOutCapture={() =>
					 (subMenuActivate === 'onHover' && setHovering(true) && setShowSubMenu(false)) 
					
				 }
				 onMouseMove={() =>
					 (subMenuActivate === 'onHover' && setHovering(true) && setShowSubMenu(true))
				 }
			>
				
				<div
					className={`${className ? className : navClass}`}
				>
					<div className={theme?.menuItemWrapper?.[depth] || theme?.menuItemWrapper?.[0] || theme?.menuItemWrapper}>
						<div className='flex-1 flex items-center' >
							{!icon ? null : (
								<Icon
									icon={icon}
									className={
										type === "side" ? 
											(isActive ? theme?.menuIconSideActive : theme?.menuIconSide )
											: (isActive ? theme?.menuIconTopActive : theme?.menuIconTop )

									}
								/>
							)}
							{onClick ? 
								(<div className={`${theme?.navItemContent} ${className ? '' : theme?.navItemContents?.[depth] || theme?.navItemContents }`}
									onClick={(e) => {
										e.stopPropagation();
										if (onClick) return onClick(To[0]);
										if (To[0]) navigate(To[0]);
									}}
								>	
									{navItem?.name}
								</div>) : 
								(<Link to={To[0]} 
									className={`
										${theme?.navItemContent} 
										${className ? '' : theme?.navItemContents?.[depth] || theme?.navItemContents }`
									}
								>	
									{navItem?.name}
								</Link>)
							}

							<div
								className='pr-2'
								onClick={() => {
									if (subMenuActivate === 'onClick') {
										//console.log('click ', to )
										// localStorage.setItem(`${to}_toggled`, `${!showSubMenu}`);
										setShowSubMenu(!showSubMenu);
									}
								}}
							>
								{
									subMenus.length ?
										<Icon
											className={theme?.indicatorIconWrapper}
											icon={showSubMenu ? theme?.indicatorIconOpen || 'ArrowRight' : theme?.indicatorIcon || 'ArrowDown'}/>
										: null
								}
								
							</div>
						</div>
						<div className={theme?.subMenuOuterWrappers?.[depth]}>
						{	subMenus.length ?
								<SubMenu
									depth={depth}
									showSubMenu={showSubMenu}
									subMenuActivate={subMenuActivate}
									active={routeMatch}
									hovering={hovering}
									subMenus={subMenus}
									type={type}
									className={className}
								/> : ''
						}
						</div>
					</div>
				</div>
			</div>
	);
};

const SubMenu = ({ depth, showSubMenu, subMenus, type, hovering, subMenuActivate, active }) => {
	// const { theme: fullTheme  } = React.useContext(CMSContext)
	// const theme = (fullTheme?.['sidenav'] || {}) 
	const { theme: fullTheme } = React.useContext(ThemeContext);
   const theme = (fullTheme?.['sidenav'] || {}) //(themeOptions);

	const inactiveHoveing = !active && subMenuActivate !== 'onHover' && hovering;
	if ((!showSubMenu || !subMenus.length) && !(inactiveHoveing)) {
		return null;
	}

	// console.log('subMenu theme', i, type, theme?.subMenuWrappers?.[i], theme)

	return (
		<div
			className={ type === "side" ?
				(theme?.subMenuWrappers?.[depth] || theme?.subMenuWrapper) :
				inactiveHoveing && depth === 0 ? theme?.subMenuWrapperInactiveFlyout :
					inactiveHoveing && depth > 0 ? theme?.subMenuWrapperInactiveFlyoutBelow :
					theme?.subMenuWrapperTop
		}
		>
			
			<div
				className={`
							${inactiveHoveing && theme?.subMenuWrapperInactiveFlyoutDirection}
							${!inactiveHoveing && theme?.subMenuWrapperChild}
				`}
			>
				{subMenus.map((sm, i) => (
					<SideNavItem
						depth={depth+1}
						key={i}
						to={sm.path}
						icon={sm.icon}
						navItem={sm}
						type={type} 
						className={sm.className}
						onClick={sm.onClick}
						subMenus={sm.subMenus}
					/>
						
				))}
			</div>
			
		</div>
	);
};

