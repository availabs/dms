import React from "react";
import { merge, cloneDeep } from "lodash-es"

import { ThemeContext } from '../useTheme.js';
import layoutTheme from './Layout.theme';
/*
  // Example
  <Layout
      navItems={menuItems}
      secondNav={menuItemsSecondNav}
      headerChildren={getSectionGroups('top')}
      footerChildren={getSectionGroups('bottom')}
  >
      {getSectionGroups('content')}
  </Layout>
*/


//--- Components and Widgets ------
import TopNav from './TopNav';
import SideNav from './SideNav';

//--------------
// Widgets
// -------------
const NoComp = () => <div className='h-12'/>
const getMenu = (menu = [], widgets = {}) => {
   return <>{(menu).map((widget, i) => getWidget(widget, i, widgets))}</>
}
const getWidget = ({ type, options = {} }, index, widgets = {}) => {
   let Comp = widgets?.[type]?.component || NoComp
   return <Comp key={index} {...options} />
}
//-------------------------------------------------

const Layout = ({
	children,
	headerChildren,
	footerChildren,
	navItems=[],
	secondNav,
	resolveNav,
}) => {

	const { theme: defaultTheme = {layout: layoutTheme} } = React.useContext(ThemeContext);
	const { sideNav={}, topNav={}, activeStyle } = cloneDeep(defaultTheme?.layout.options) || {}
	const theme = merge(cloneDeep(defaultTheme?.layout?.styles?.[activeStyle || 0] || defaultTheme))
	const widgets = defaultTheme?.widgets || {}
	// console.log('Theme', theme, sideNav, activeStyle)
  const navs = (nav) => {
    return {
      "main": (resolveNav
        ? resolveNav(+nav.navDepth, nav?.navTitle)
        : navItems
      ).filter(page => !page.hideInNav),
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
              leftMenu={getMenu(topNav?.leftMenu, widgets)}
              menuItems={ navs(topNav)?.[topNav?.nav] || [] }
							rightMenu={getMenu(topNav?.rightMenu, widgets)}
						/>
  				)}
  				<div className={`${theme?.wrapper3}`}>
  					{ sideNav.size !== 'none' && (
							<SideNav
                activeStyle={ sideNav?.activeStyle }
								topMenu={getMenu(sideNav?.topMenu, widgets)}
                menuItems={ navs(sideNav)?.[sideNav?.nav] || []}
								bottomMenu={getMenu(sideNav?.bottomMenu, widgets)}
							/>
   				  )}
            <div className={`${theme?.childWrapper}`}>
  						{children}
  					</div>
  				</div>
  			</div>
  		</div>
      { footerChildren }
    </div>
	);
};

export default Layout;
