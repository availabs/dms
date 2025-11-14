import React, { useState } from "react";
import { useMatch, useNavigate, Link } from "react-router";
import Icon from './Icon'
import { MobileMenu } from './TopNav'
import {ThemeContext, getComponentTheme} from '../useTheme'
// import menu from "../../patterns/datasets/components/menu";

const NOOP = () => { return {} }

export const VerticalMenu = ({ menuItems = [], activeStyle }) => {
  const theme = getComponentTheme(React.useContext(ThemeContext),'layout', activeStyle)
  return menuItems.map((item, i) => (
		<div key={i} className={item.sectionClass}>
  		<SideNavItem
  			key={i}
  			to={item.path}
  			navItem={item}
  			icon={item.icon}
  			className={item.className}
  			onClick={item.onClick}
        activeStyle={activeStyle}
  			subMenuActivate={theme?.sideNav?.subMenuActivate}
  			subMenus={item?.subMenus || []}
  		/>
		</div>
	))
}

const MobileSidebar = ({
   open,
   toggle,
   topMenu=null,
   mainMenu=null,
   bottomMenu=null,
   menuItems = [],
}) => {
	const { theme: fullTheme } = React.useContext(ThemeContext);
	const theme = getComponentTheme(fullTheme, 'sidenav')
	console.log('test 123', theme, fullTheme['sidenav'])
  mainMenu = mainMenu ? mainMenu : <VerticalMenu menuItems={ menuItems } />
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
							  {mainMenu}
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
	topMenu,
	mainMenu,
	bottomMenu,
	toggle,
	open,
	mobile,
	activeStyle,
	subMenuActivate='onClick',
	subMenuStyle,
	...props }) => {
	//let theme = useTheme()['sidenav'](themeOptions);
	//const { theme: fullTheme  } = React.useContext(CMSContext) || {}
	const { theme: fullTheme } = React.useContext(ThemeContext);
	const theme = getComponentTheme(fullTheme, 'sidenav',activeStyle)
	console.log('test 123', theme, fullTheme['sidenav'])
	//const theme = (fullTheme?.['sidenav'] || {})//(themeOptions);
  mainMenu = mainMenu ? mainMenu : <VerticalMenu menuItems={menuItems} activeStyle={activeStyle} />

	return (
		<>
      <div className={`${theme?.layoutContainer1}`}>
    		<div className={`${theme?.layoutContainer2}`}>
     			<div className={`${theme?.sidenavWrapper}`}>
        		{topMenu}
    				<nav className={`${theme?.itemsWrapper}`}>
     					{mainMenu}
    				</nav>
    				<div className={theme?.bottomMenuWrapper}>
      				{bottomMenu}
    				</div>
     			</div>
        </div>
      </div>
			{/*mobile === 'side' ? '' :
				<div className={`${theme?.topnavWrapper} md:hidden`}>
			      <div className={`${theme?.topnavContent} justify-between`}>
			        <div>{topMenu}</div>
			        <div className="flex items-center justify-center h-full">
			          <div className={`${theme?.topmenuRightNavContainer}`}>{bottomMenu}</div>


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
			*/}
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
					<MobileMenu open={open} {...props} />
				}

		</>
	);
};

export const SideNavItem = ({
	depth = 0,
	navItem,
	icon,
	to,
	onClick,
	className = null,
	active = false,
	subMenus = [],
	activeStyle,
	subMenuActivate = 'onClick',
	subMenuOpen = false
}) => {
  const { theme: fullTheme } = React.useContext(ThemeContext);
  const theme = getComponentTheme(fullTheme, 'sidenav', activeStyle)
  //console.log('sidenavItem', theme, fullTheme['sidenav'])
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

	const linkClasses = theme?.navitemSide;
	const activeClasses = theme?.navitemSideActive

	const isActive = routeMatch || active
	const navClass = isActive ? activeClasses : linkClasses;

	const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen || routeMatch);

	// when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
	const [hovering, setHovering] = React.useState(false);

	return (
			<div className={theme?.subMenuParentWrapper}
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
					<div className={theme?.[`menuItemWrapper_level_${depth+1}`] || theme?.menuItemWrapper}>
						<div className='flex-1 flex items-center' >
							{!icon ? null : (
								<Icon
									icon={icon}
									className={ isActive ? theme?.menuIconSideActive : theme?.menuIconSide }
								/>
							)}
							{onClick ?
              (<div className={`${theme?.navItemContent} ${theme?.[`navItemContent_level_${depth+1}`]}`}
									onClick={(e) => {
										e.stopPropagation();
										if (onClick) return onClick(To[0]);
										if (To[0]) navigate(To[0]);
									}}
								>
									{navItem?.name}
								</div>) :
								(<Link to={To[0]}
									className={`${theme?.navItemContent} ${theme?.[`navItemContent_level_${depth+1}`]}`}
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
						<div className={theme?.subMenuOuterWrapper}>
						{	subMenus.length ?
								<SubMenu
                depth={depth}
                showSubMenu={showSubMenu}
                subMenuActivate={subMenuActivate}
                active={routeMatch}
                hovering={hovering}
                subMenus={subMenus}
                className={className}
                activeStyle={activeStyle}
								/> : ''
						}
						</div>
					</div>
				</div>
			</div>
	);
};

const SubMenu = ({ depth, showSubMenu, subMenus, type='side', hovering, subMenuActivate, active, activeStyle }) => {
	// const { theme: fullTheme  } = React.useContext(CMSContext)
	// const theme = (fullTheme?.['sidenav'] || {})
	const { theme: fullTheme } = React.useContext(ThemeContext);
	const theme = getComponentTheme(fullTheme, 'sidenav', activeStyle)

	const inactiveHoveing = !active && subMenuActivate !== 'onHover' && hovering;
	if ((!showSubMenu || !subMenus.length) && !(inactiveHoveing)) {
		return null;
	}

	// console.log('subMenu theme', i, type, theme?.subMenuWrappers?.[i], theme)

	return (
		<div
			className={ (theme?.subMenuWrappers?.[depth] || theme?.subMenuWrapper) }
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
						className={sm.className}
						onClick={sm.onClick}
						subMenus={sm.subMenus}
						activeStyle={activeStyle}
					/>
				))}
			</div>

		</div>
	);
};
