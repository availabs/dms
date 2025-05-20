import React, { useState } from "react";
import { useMatch, useNavigate, Link } from "react-router";
import Icon from './Icon'
import { MobileMenu } from './TopNav'
import useTheme from '../useTheme'

const NOOP = () => { return {} }

const sideNavTheme = {
   "fixed": "",
   "logoWrapper": "w-44 bg-neutral-100 text-slate-800",
   "topNavWrapper": "flex flex-row md:flex-col", //used in layout
   "sidenavWrapper": "hidden md:block bg-white border-r w-44 h-full z-20",
   "menuItemWrapper": "flex flex-col",
   "menuIconSide": "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
   "menuIconSideActive": "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
   "itemsWrapper": "border-slate-200 pt-5  ",
   "navItemContent": "transition-transform duration-300 ease-in-out flex-1",
   "navItemContents": ['text-[14px] font-light hover:bg-blue-50 text-slate-700 px-4 py-2'],
   "navitemSide": `
   	group  flex flex-col
   	group flex 
   	focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
   	transition-all cursor-pointer border-l-2 border-white`,
   "navitemSideActive": `
   	group  flex flex-col   
    	focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
   	transition-all cursor-pointer border-l-2 border-blue-500`,
   "indicatorIcon": "ArrowRight",
   "indicatorIconOpen": "ArrowDown",
   "subMenuWrappers": ['w-full bg-[#F3F8F9] rounded-[12px]','w-full bg-[#E0EBF0]'],
   "subMenuOuterWrappers": ['pl-4'],
   "subMenuWrapper": "pl-2 w-full",
   "subMenuParentWrapper": "flex flex-col w-full",
   "bottomMenuWrapper": ""
}

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
	const fullTheme = useTheme() || {}
	const theme = (fullTheme?.['sidenav'] || {})//(themeOptions);
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
	const fullTheme = useTheme() || {}
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


export const SideNavItem = ({
	navItem,
	parent,
	depth = 0,
	maxDepth = 1,
	children,
	icon,
	to,
	onClick,
	className = null,
	active = false,
	subMenus = [],
	themeOptions,
	subMenuActivate = 'onHover',
	subMenuOpen = false
}) => {
	// console.log('renderMenu')
	//const { theme: fullTheme  } = React.useContext(CMSContext) || {}
	const fullTheme = useTheme() || {}
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

	const linkClasses = theme?.navitemSide
	const activeClasses = theme?.navitemSideActive 

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
										(isActive ? theme?.menuIconSideActive : theme?.menuIconSide)
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
									className={className}
									maxDepth={maxDepth}
								/> : ''
							}
					</div>
				</div>
			</div>
	);
};


const SubMenu = ({ parent, depth, showSubMenu, subMenus, hovering, subMenuActivate, active, maxDepth }) => {
	//const { theme: fullTheme  } = React.useContext(CMSContext)
	const fullTheme = useTheme() || {}
	const theme = (fullTheme?.['sidenav'] || {}) //(themeOptions);
	
	// if(depth === 0) {
	// 	console.log('submenu parent',parent)
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
						<SideNavItem
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
						/>
					))}
				</div>
			</div>
		</div>
	);
};