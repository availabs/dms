import React from "react";
//import { useTheme} from "~/modules/avl-components/src/index.js";
import { CMSContext } from '../../siteConfig'

import TopNav from './nav/Top.jsx'
import SideNav from './nav/Side.jsx'

import { Link, Outlet } from "react-router-dom";

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

const Logos = () => <div className='h-12'/>

const Layout = ({ children, menus, sideNav={}, topNav={}, title }) => {
	//const theme = useTheme()
	const { theme } = React.useContext(CMSContext)
	const sideNavOptions = {
		size: sideNav.size || 'none',
		color: sideNav.color || 'white',
		menuItems: sideNav.menuItems || menus,
		logo: sideNav?.logo || Logos
	}


	const topNavOptions = {
		position: topNav.position || 'block',
		size: topNav.size || 'compact',
		menu: topNav.menu || 'left',
		subMenuStyle: topNav.subMenuStyle || 'row',
		menuItems: (topNav.menuItems || []).filter(page => !page.hideInNav),
		logo: topNav.logo || (
			<div className='flex items-center justify-center h-12'>
				<div to="/" className={`${['none'].includes(sideNavOptions.size)  ? '' : 'md:hidden'}` }>
					{/*<Logo sideNav={sideNavOptions}/>*/}
				</div>
				{title}
			</div>
		),
		rightMenu: topNav.rightMenu || <div />
		
	}
	const Logo = sideNavOptions.logo
	// console.log('layout', topNav)
	
	return (
		<div className='flex' >
			{
				sideNavOptions.size === 'none' ? '' : (
					<div className={`hidden md:block ${marginSizes[sideNavOptions.size]}`}>
						<div className={`fixed h-screen ${fixedSizes[sideNavOptions.size]}`}>
							<SideNav 
								topMenu={<Logo sideNav={sideNavOptions}/>}
								themeOptions={sideNavOptions}
								menuItems={sideNavOptions.menuItems}
							/>
						</div>
					</div>
				)
			}
			<div className={`flex-1 flex items-start flex-col items-stretch w-full min-h-screen`}>
				{
					topNavOptions.size === 'none' ? '' : (<>
						<div className={`${
							topNavOptions.position === 'fixed' ? 
								`sticky top-0 z-20 w-full ` 
								: ''
							}`}>
								<TopNav
									themeOptions={topNavOptions}
									// subMenuActivate={'onHover'}
									leftMenu={topNavOptions.logo}
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