import React from "react";
import merge from 'lodash/merge';
import cloneDeep from 'lodash/cloneDeep';
import { Link } from "react-router-dom";

import TopNav from './nav/Top.jsx';
import SideNav from './nav/Side.jsx';
import { Search } from '../components/search';
import { CMSContext } from '../siteConfig';


let marginSizes = {
	none: '',
	micro: 'mr-14',
	mini: 'mr-20',
	miniPad: 'mr-0',	
	compact: 'mr-44',
	full: 'mr-64'
}

let fixedSizes = {
	none: '',
	micro: 'w-14',
	mini: 'w-20',
	miniPad: 'w-0',
	compact: 'w-44',
	full: 'w-64'
}

let fixedSizePixels = {
	none: '0px',
	micro: '56px',
	mini: '80px',
	miniPad: '0px',
	compact: '176px',
	full: '256px'
}

const Logos = () => <div className='h-12'/>

const Layout = ({ children, navItems, secondNav, title, theme, yPadding = '0px', ...props }) => {
	//const theme = useTheme()

	const { theme: defaultTheme, app, type, Menu } = React.useContext(CMSContext) || {}
	theme = merge(cloneDeep(defaultTheme), cloneDeep(theme))
	const { sideNav={}, topNav={}, logo=Logos } = theme?.navOptions || {}
	
	const sideNavOptions = {
		size: sideNav.size || 'none',
		color: sideNav.color || 'white',
		menuItems: (sideNav?.nav === 'main' ? navItems : []).filter(page => !page.hideInNav),
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
	      	<div className={'flex flex-col md:flex-row'}>
	      		{topNav?.rightMenu}
	        	{topNav?.search === 'right' && <Search app={app} type={type}/>}
	        	{topNav?.dropdown === 'right' && <Menu />}
	        	{topNav?.logo === 'right' && logo}
	      	</div>
	  	)	
	}
	const Logo = sideNavOptions.logo
	// console.log('layout', topNav)
	
	return (
		<div className={`flex ${theme?.bg} max-w-screen`}>
			{
				sideNavOptions.size === 'none' ? '' : (
					<div className={`hidden md:block ${marginSizes[sideNavOptions.size]}`}>
						<div className={`fixed h-screen ${fixedSizes[sideNavOptions.size]}`}>
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
			<div 
				className={`flex-1 flex items-start flex-col items-stretch max-w-full`} 
				style={{
					minHeight: `calc(100vh - ${yPadding}`,
					maxWidth: `calc(100vw - ${fixedSizePixels[sideNavOptions.size]}`
				}}
			>
				{
					topNavOptions.size === 'none' ? '' : (<>
						<div className={`${
							topNavOptions.position === 'fixed' ? 
								`sticky top-0 z-20 w-full ` 
								: 'z-10'
							}`}>
								<TopNav
									themeOptions={topNavOptions}
									// subMenuActivate={'onHover'}
									leftMenu={topNavOptions.leftMenu}
									menuItems={topNavOptions.menuItems}
									rightMenu={topNavOptions.rightMenu}
									
								/>
						</div>
					</>)
				}
				<div id={'content'} className={`flex-1`}>
					{children}
				</div>
			</div>
		</div>
	);
};

export default Layout;