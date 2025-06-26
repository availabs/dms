import React, {useContext} from "react";
import { useMatch, useNavigate } from "react-router";
import { CMSContext } from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";

const NavItem = ({
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
	const {UI} = useContext(CMSContext)
	const {Icon} = UI;
	const { theme: fullTheme  } = React.useContext(ThemeContext) || {}
	const theme = (fullTheme?.['sidenav'] || {}) 

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
							<div className={`${theme?.navItemContent} ${className ? '' : theme?.navItemContents?.[depth] || theme?.navItemContents }`}
								onClick={(e) => {
									e.stopPropagation();
									if (onClick) return onClick(To[0]);
									if (To[0]) navigate(To[0]);
								}}
							>	
								{navItem?.name}
							</div>
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
export default NavItem;

const SubMenu = ({ depth, showSubMenu, subMenus, type, hovering, subMenuActivate, active }) => {
	const { theme: fullTheme  } = React.useContext(CMSContext)
	const theme = (fullTheme?.['sidenav'] || {}) 


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
					<NavItem
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