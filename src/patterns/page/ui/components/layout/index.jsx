import React from "react";
import { merge, cloneDeep } from "lodash-es"

import TopNav from '../topnav';
import SideNav from '../sidenav';
import { SearchButton } from '../../../components/search';
import { CMSContext } from '../../../siteConfig';
import { matchRoutes, useLocation } from 'react-router-dom'


const Logos = () => <div className='h-12'/>

export const layoutTheme = {
	wrapper: 'relative isolate flex min-h-svh w-full max-lg:flex-col',
	wrapper2: 'flex-1 flex items-start flex-col items-stretch max-w-full',
	wrapper3: 'flex flex-1',
	childWrapper: 'flex-1 h-full',
	topnavContainer1:`sticky top-0 left-0 right-0 z-20 `,
	topnavContainer2:``,
	sidenavContainer1: 'w-44',
	sidenavContainer2: 'sticky top-12 h-[calc(100vh_-_50px)]',
	navTitle: `flex-1 text-[24px] font-['Oswald'] font-[500] leading-[24px] text-[#2D3E4C] py-3 px-4`
}

function nav2Level(items, level=1, path, navTitle='') {
	let output =  null
	if(level > 1) {
		let levelPath = '/'+path.replace('/edit','').split('/').filter(d => d).filter((d,i) => i < level-1).join('/')
		let matchItems = items.map(d => {
			return {...d, path: d.path.replace('/edit','') }
		})
		let matches = matchRoutes(matchItems, {pathname: levelPath })
		output = matches?.[0]?.route?.subMenus || []
		if(navTitle && matches?.[0]?.route?.name) {
			output = [{name: matches?.[0]?.route?.name, className: navTitle},...output]
		}
		// console.log('nav2Level', matchItems, output, matches, levelPath, path)
	}
	return output || items
}

const Layout = ({ children, navItems, secondNav, title, pageTheme, EditPane, yPadding = '0px', ...props }) => {
	
	// ------------------------------------------------------
	// ------- Get Options from Context and Defaults
	// ------------------------------------------------------ 
	const { theme: defaultTheme, app, type, Menu } = React.useContext(CMSContext) || {}
	const { pathname } = useLocation();
	const theme = merge(cloneDeep(defaultTheme), cloneDeep(pageTheme))
	// console.log('theme navOptions', pageTheme)
	const { sideNav={ }, topNav={}, logo=Logos } = cloneDeep(theme?.navOptions) || {}
	
	const sideNavOptions = {
		size: sideNav.size || 'none',
		color: sideNav.color || 'transparent',
		menuItems: (sideNav?.nav === 'main' ? nav2Level(navItems, sideNav.depth, pathname, theme.layout.navTitle)  : sideNav?.nav === 'secondary' ? secondNav || [] : []).filter(page => !page.hideInNav),
		topMenu: (
			<div className={'flex flex-row md:flex-col'}>
				{sideNav?.logo === 'top' && logo}
	        	{sideNav?.dropdown === 'top' && <Menu />}
	        	
	        	{sideNav?.search === 'top' && <SearchButton app={app} type={type}/>}

	      	</div>),
		bottomMenu:  (
	      	<div className={'flex flex-row md:flex-col'}>
	      		{sideNav?.logo === 'bottom' && logo}
	      		{sideNav?.search === 'bottom' && <SearchButton app={app} type={type}/>}
	        	{sideNav?.dropdown === 'bottom' && <Menu />}
	        	{(EditPane && sideNav?.dropdown ==='bottom') && <EditPane />}
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
	        	{topNav?.search === 'left' && <SearchButton app={app} type={type}/>}
	        	{topNav?.dropdown === 'left' && <Menu />}
	      	</div>),
		rightMenu:  (
	      	<>
	      		{topNav?.rightMenu}
	        	{topNav?.search === 'right' && <SearchButton app={app} type={type}/>}
	        	{topNav?.dropdown === 'right' && <Menu />}
	        	{topNav?.logo === 'right' && logo}
	        	{EditPane && <EditPane />}
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
		
		<div className={theme?.layout?.wrapper} >
			
			<div 
				className={theme?.layout?.wrapper2} 
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
				<div className={`${theme.layout.wrapper3}`}>
					{
						sideNavOptions.size === 'none' ? '' : (
							<div className={`${theme?.layout?.sidenavContainer1} `}>
								<div className={`${theme?.layout?.sidenavContainer2} ${topNav.size !== 'none' && topNav.position === 'fixed' ? theme.topnav.fixed : ''}`}>
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
						${sideNav.size !== 'none' && sideNav.position === 'fixed' ? theme.sidenav.fixed : ''} 
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