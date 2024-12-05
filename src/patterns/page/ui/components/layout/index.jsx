import React from "react";
import { merge } from "lodash-es"
import { cloneDeep } from "lodash-es";

import TopNav from '../topnav';
import SideNav from '../sidenav';
import { Search } from '../../../components/search';
import { CMSContext } from '../../../siteConfig';

const Logos = () => <div className='h-12'/>

export const layoutTheme = {
	wrapper: '',
	topnavContainer1:``,
	topnavContainer2:`sticky top-0 z-20 w-full max-w-[100vw]`,
	sidenavContainer1: 'mr-44',
	sidenavContainer2: 'fixed h-[calc(100vh_-_52px)]'
}

const Layout = ({ children, navItems, secondNav, title, theme, yPadding = '0px', ...props }) => {
	
	// ------------------------------------------------------
	// ------- Get Options from Context and Defaults
	// ------------------------------------------------------ 
	const { theme: defaultTheme, app, type, Menu } = React.useContext(CMSContext) || {}
	theme = merge(cloneDeep(defaultTheme), cloneDeep(theme))
	console.log('theme navOptions', theme.navOptions)
	const { sideNav={}, topNav={}, logo=Logos } = theme?.navOptions || {}
	
	const sideNavOptions = {
		size: sideNav.size || 'none',
		color: sideNav.color || 'transparent',
		menuItems: (sideNav?.nav === 'main' ? navItems : sideNav?.nav === 'secondary' ? secondNav || [] : []).filter(page => !page.hideInNav),
		topMenu: (
			<div className={'flex flex-row md:flex-col'}>
	      		{sideNav?.logo === 'top' && logo}
	        	{sideNav?.dropdown === 'top' && <Menu />}
	        	{sideNav?.search === 'top' && <Search app={app} type={type}/>}
	      	</div>),
		bottomMenu:  (
	      	<div className={'flex flex-row md:flex-col'}>
	      		{sideNav?.logo === 'bottom' && logo}
	      		{sideNav?.search === 'bottom' && <Search app={app} type={type}/>}
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
			<div className={'flex flex-col md:flex-row'}>
	      		{topNav?.logo === 'left' && logo}
	        	{topNav?.search === 'left' && <Search app={app} type={type}/>}
	        	{topNav?.dropdown === 'left' && <Menu />}
	      	</div>),
		rightMenu:  (
	      	<>
	      		{topNav?.rightMenu}
	        	{topNav?.search === 'right' && <Search app={app} type={type}/>}
	        	{topNav?.dropdown === 'right' && <Menu />}
	        	{topNav?.logo === 'right' && logo}
	      	</>
	  	)	
	}
	const Logo = sideNavOptions.logo
	// console.log('layout', topNav)
	// console.log('topnav stuff', topNav.size !== 'none' && topNav.position === 'fixed' ? topNav.size : '', topNav)
	// ------------------------------------------------------
	// ------- 
	// ------------------------------------------------------ 

	return (
		
		<div className={`${theme?.layout?.wrapper}`} >
			
			<div 
				className={`flex-1 flex items-start flex-col items-stretch max-w-full`} 
				style={{
					minHeight: `calc(100vh - ${yPadding}`,
				}}
			>
				{
					topNavOptions.size === 'none' ? '' : (<>
						<div className={`${theme?.layout?.topnavContainer1}`}>
							<div className={`${theme?.layout?.topnavContainer2}`}>
								<TopNav
									themeOptions={topNavOptions}
									// subMenuActivate={'onHover'}
									leftMenu={topNavOptions.leftMenu}
									menuItems={topNavOptions.menuItems}
									rightMenu={topNavOptions.rightMenu}
									
								/>
							</div>
						</div>
					</>)
				}
				<div className={`flex-1 `}>
					{
						sideNavOptions.size === 'none' ? '' : (
							<div className={`${theme?.layout?.sidenavContainer1} `}>
								<div className={`${theme?.layout?.sidenavContainer2} ${topNav.size !== 'none' && topNav.position === 'fixed' ? topNav.fixedMargin : ''}`}>
									<SideNav 
										topMenu={sideNavOptions.topMenu}
										bottomMenu={sideNavOptions.bottomMenu}
										themeOptions={sideNavOptions}
										menuItems={sideNavOptions.menuItems}
									/>
								</div>
							</div>
						)
					}
					<div className={`
						${theme?.layout?.childWrapper} 
						${sideNav.size !== 'none' && sideNav.position === 'fixed' ? sideNav.fixedMargin : ''} 
						`}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Layout;