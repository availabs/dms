import React, {useEffect} from "react";
import { useMatch, useNavigate, Link } from "react-router-dom";
import Icons from '../../icons'

import { CMSContext } from '../../../siteConfig'

function Icon ({ icon, className }) {
	let Icon = ''
	if(!icon || icon?.includes('fa')) {
		Icon = <span className={icon} /> 
	} else {
		let Comp = Icons[icon]
		Icon = <Comp />
	}

	return (
  	<div className={`${className} flex justify-center items-center`}>
   		{Icon}
  	</div>
	)
};
const NOOP = () => { return {} }

const NavItem = ({
	depth = 0,
	children,
	icon,
	to,
	onClick,
	className = null,
	type = "side",
	active = false,
	subMenus = [],
	themeOptions,
	subMenuActivate = 'onClick',
	subMenuOpen = false
}) => {
	console.log('renderMenu', subMenuActivate)
	const { theme: fullTheme  } = React.useContext(CMSContext) || {}
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

	const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen || routeMatch);

	// when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
	const [hovering, setHovering] = React.useState(false);

	// useEffect(() => {

	//       setShowSubMenu(routeMatch);
	// }, [showSubMenu,to]);

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
					<div className={theme.menuItemWrapper}>
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
							<div className={`${theme?.navItemContent} ${theme?.navItemContents?.[depth]}`}
								onClick={(e) => {
									e.stopPropagation();
									if (onClick) return onClick(To[0]);
									if (To[0]) navigate(To[0]);
								}}
							>	
								{children}
							</div>
							<div
								onClick={() => {
									if (subMenuActivate === 'onClick') {
										console.log('click ', to )
										// localStorage.setItem(`${to}_toggled`, `${!showSubMenu}`);
										setShowSubMenu(!showSubMenu);
									}
								}}
							>
								{
									subMenus.length ?
										<Icon

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
									themeOptions={themeOptions}
									className={className}
								/> : ''
						}
						</div>
					</div>
				</div>
			</div>
	);
};
export default NavItem;

const SubMenu = ({ depth, showSubMenu, subMenus, type, hovering, subMenuActivate, active, themeOptions }) => {
	const { theme: fullTheme  } = React.useContext(CMSContext)
	const theme = (fullTheme?.[type === 'side' ? 'sidenav' : 'topnav'] || {}) //(themeOptions);


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
					flex ${(type === "side" || inactiveHoveing ? "flex-col" : "flex-row")}
				`}
			>
				{subMenus.map((sm, i) => (
					<NavItem
						depth={depth+1}
						key={i}
						to={sm.path}
						icon={sm.icon} 
						type={type} 
						className={sm.className}
						onClick={sm.onClick}
						themeOptions={themeOptions}
						subMenus={sm.subMenus}
					>
						{sm.name}
					</NavItem>
				))}
			</div>
			
		</div>
	);
};