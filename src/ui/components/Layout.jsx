import React from "react";
import { merge, cloneDeep } from "lodash-es"

import { matchRoutes, useLocation } from 'react-router'
import { ThemeContext } from '../useTheme.js'
import layoutTheme from './Layout.theme'

//--- Components and Widgets ------
import TopNav, { HorizontalMenu } from './TopNav';
import SideNav, { VerticalMenu } from './SideNav';
import Logo from './Logo'
const NoComp = () => <div className='h-12'/>

//--------------
// Widgets
// -------------
const LayoutWidgets = {
  NoComp,
	HorizontalMenu,
	VerticalMenu,
	Logo,
}
export const registerLayoutWidget = (name,widget) => {
  LayoutWidgets[name] = widget
}
const getMenu = (menu = []) => {
   return <>{(menu).map((widget,i) => getWidget(widget,i))}</>
}
const getWidget = ({ type, options = {} },index) => {
   let Comp = LayoutWidgets?.[type] || LayoutWidgets['NoComp']
   return <Comp key={index} {...options} />
}
//-------------------------------------------------

// --- move below function into page pattern
function nav2Level(items, level=1, path, navTitle='') {
	let output =  null
	if(level > 1) {
		let levelPath = '/'+path.replace('/edit','').split('/').filter(d => d).filter((d,i) => i < level-1).join('/')
		let matchItems = items.map(d => {
			return {...d, path: d?.path?.replace('/edit','') }
		})
		let matches = matchRoutes(matchItems, {pathname: levelPath })
		output = matches?.[0]?.route?.subMenus || []
		if(navTitle && matches?.[0]?.route?.name) {
			output = [{name: matches?.[0]?.route?.name, className: navTitle},...output]
		}
	}
  // console.log('nav2Level', output)
	return output || items
}

const Layout = ({
	children,
	headerChildren,
	footerChildren,
	navItems=[],
	secondNav,
	pageTheme,
	yPadding = '0px'
}) => {

	const { pathname } = useLocation();
	const { theme: defaultTheme = {layout: layoutTheme} } = React.useContext(ThemeContext);
	const { sideNav={}, topNav={}, activeStyle } = cloneDeep(defaultTheme?.layout.options) || {}
	const theme = merge(cloneDeep(defaultTheme?.layout?.styles?.[activeStyle || 0] || defaultTheme), cloneDeep(pageTheme))
	// console.log('Theme', theme, sideNav, activeStyle)
  const navs = (nav) => {
    // console.log('layout navs', nav, nav.navDepth)
    return {
      "main": (nav2Level(navItems, +nav.navDepth , pathname, nav?.navTitle) || []).filter(page => !page.hideInNav),
      "secondary": secondNav
    }
  }

	// console.log('Layout', topNav, navs[topNav?.nav])
  return (
    <div className={theme?.outerWrapper}>
      { headerChildren }
  	  <div className={theme?.wrapper} >
  			<div className={theme?.wrapper2} >
  				{ topNav.size !== 'none' && (
            <TopNav
              activeStyle={ topNav?.activeStyle }
              leftMenu={getMenu(topNav?.leftMenu)}
              menuItems={ navs(topNav)?.[topNav?.nav] || [] }
							rightMenu={getMenu(topNav?.rightMenu)}
						/>
  				)}
  				<div className={`${theme?.wrapper3}`}>
  					{ sideNav.size !== 'none' && (
							<SideNav
                activeStyle={ sideNav?.activeStyle }
								topMenu={getMenu(sideNav?.topMenu)}
                menuItems={ navs(sideNav)?.[sideNav?.nav] || []}
								bottomMenu={getMenu(sideNav?.bottomMenu)}
							/>
   				  )}
            <div className={`${theme?.childWrapper}`}>
  						{children}
  					</div>
  				</div>
  			</div>
  		</div>
      {footerChildren}
    </div>
	);
};

export default Layout;
