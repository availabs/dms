import React from "react";
import { AdminContext } from '../context'
import { ThemeContext } from '../../../ui/useTheme'
import { adminLayoutTheme } from './avail-layout.theme'

import TopNav from './nav/Top'
import SideNav from './nav/Side'

import { Link, Outlet } from "react-router";

const Logos = () => <div className='h-12'/>
const Menu = () => <div className='h-12'/>


const Layout = ({ children, navItems=[], title }) => {
	const { theme: themeFromContext } = React.useContext(ThemeContext) || {}
	const tl = { ...adminLayoutTheme, ...(themeFromContext?.admin?.adminLayout || {}) }

	const { theme, app, type } = React.useContext(AdminContext) || {}
	const { sideNav={}, topNav={}, logo=Logos } = theme?.navOptions || {}
	
	const sideNavOptions = {
		size: sideNav.size || 'none',
		color: sideNav.color || 'white',
		menuItems: (sideNav?.nav === 'main' ? navItems : []).filter(page => !page.hideInNav),
		topMenu: (
			<div className={tl.topMenuWrapper}>
	      		{sideNav?.logo === 'top' && logo}
	        	{sideNav?.dropdown === 'top' && <Menu />}
	        	{/*{sideNav?.search === 'top' && <Search app={app} type={type}/>}*/}
	      	</div>),
		bottomMenu:  (
	      	<div className={tl.bottomMenuWrapper}>
	      		{/*{sideNav?.search === 'bottom' && <Search app={app} type={type}/>}*/}
	        	{sideNav?.dropdown === 'bottom' && <Menu />}
	      	</div>
	  	)
	}


	const topNavOptions = {
		position: topNav.position || 'block',
		size: topNav.size || 'compact',
		menu: topNav.menu || 'left',
		subMenuStyle: topNav.subMenuStyle || 'row',
		menuItems: (topNav?.nav === 'main' ? navItems : []).filter(page => !page.hideInNav),
		leftMenu: (
			<div className={tl.leftMenuWrapper}>
	      		{topNav?.logo === 'left' && logo}
	        	{/*{topNav?.search === 'left' && <Search app={app} type={type}/>}*/}
	        	{topNav?.dropdown === 'left' && <Menu />}
	      	</div>),
		rightMenu:  (
	      	<div className={tl.rightMenuWrapper}>
	      		{topNav?.rightMenu}
	        	{/*{topNav?.search === 'right' && <Search app={app} type={type}/>}*/}
	        	{topNav?.dropdown === 'right' && <Menu />}
	      	</div>
	  	)
	}
	const Logo = sideNavOptions.logo
	// console.log('layout', topNav)
	
	return (
		<div className={tl.root}>
			{
				sideNavOptions.size === 'none' ? '' : (
					<div className={`${tl.sidebarContainer} ${tl.sidebarMargin[sideNavOptions.size]}`}>
						<div className={`${tl.sidebarInner} ${tl.sidebarWidth[sideNavOptions.size]}`}>
							<SideNav
								topMenu={sideNavOptions.topMenu}
								themeOptions={sideNavOptions}
								menuItems={sideNavOptions.menuItems}
							/>
						</div>
					</div>
				)
			}
			<div className={tl.contentWrapper}>
				{
					topNavOptions.size === 'none' ? '' : (<>
						<div className={topNavOptions.position === 'fixed' ? tl.topNavSticky : tl.topNavBlock}>
							<TopNav
								themeOptions={topNavOptions}
								leftMenu={topNavOptions.leftMenu}
								menuItems={topNavOptions.menuItems}
								rightMenu={topNavOptions.rightMenu}
							/>
						</div>
					</>)
				}
				<div id={'content'} className={tl.contentInner}>
					<div className={`${theme?.page?.wrapper1}`}>
          				<div className={`${theme?.page?.wrapper2}`}>
	            			<div className={theme?.page?.wrapper3}>
							{children}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Layout;