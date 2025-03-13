import React, {useEffect} from "react";
import { useMatch, useNavigate, Link } from "react-router-dom";
import Icons, {ArrowDown} from '../../icons'

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

	const [showSubMenu, setShowSubMenu] = React.useState(subMenuOpen);

	// when subMenuActivate !== onHover, and submenu needs to flyout for non-active menuItem
	const [hovering, setHovering] = React.useState(false);

	useEffect(() => {
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
							<div className={theme?.navItemContent}>
								<div>{navItem?.name}</div>
								{navItem?.description && (
									<div className={theme?.navItemDescription?.[depth] || theme?.navItemDescription}>
										{navItem?.description}
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
									depth < maxDepth && subMenus.length ? <ArrowDown height={12} width={12} /> : null
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
									themeOptions={themeOptions}
									className={className}
									maxDepth={maxDepth}
								/> : ''
							}
					</div>
				</div>
			</div>
	);
};
export default NavItem;

const SubMenu = ({ parent, depth, showSubMenu, subMenus, type, hovering, subMenuActivate, active, maxDepth, themeOptions }) => {
	const { theme: fullTheme  } = React.useContext(CMSContext)
	const theme = (fullTheme?.[type === 'side' ? 'sidenav' : 'topnav'] || {}) //(themeOptions);
	
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
						<NavItem
							parent={parent}
							depth={depth+1}
							key={i}
							to={sm.path}
							icon={sm.icon} 
							type={type} 
							className={sm.className}
							onClick={sm.onClick}
							themeOptions={themeOptions}
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