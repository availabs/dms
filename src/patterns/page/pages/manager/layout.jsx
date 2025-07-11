import React from 'react'
import { CMSContext } from '../../context'
import {ThemeContext} from "../../../../ui/useTheme";


const managerTheme={
  navOptions: {
    sideNav: {
      size: 'compact',
      search: 'none',
      logo: 'none',
      dropdown: 'none',
      nav: 'main'
    },
    topNav: {
      size: 'compact',
      dropdown: 'right',
      search: 'none',
      logo: 'left',
      position: 'fixed',
      nav: 'none'
    }
  }
}



function CmsManager ({children}) {
 
  
  const { baseUrl, UI } = React.useContext(CMSContext) || {};
  const {Layout} = UI;
  const { theme ={}} = React.useContext(ThemeContext);
  

  const managerNavItems = [
    { name: '< Manage Site', path: '/list' },
    {name:'', className: 'p-2'},
    {name: 'Dashboard', path: `${baseUrl}/manage`},
    {name: 'View Site', path: `${baseUrl}/`},
    {name: 'Content', className: theme.navLabel},
    {name: 'Pages', path: `${baseUrl}/manage/pages`},
    {name: 'Templates', path: `${baseUrl}/manage/templates`},
    {name: 'Tags', path: `${baseUrl}/manage/tags`},

    {name: 'Layout', className: theme.navLabel},
    //{name: 'Navigation', path: `${baseUrl}/manage/nav`},
    {name: 'Design', path: `${baseUrl}/manage/design`}
  ]



  return (
    <div id='page_view'>
      {/* Layout */}
      <Layout navItems={managerNavItems} theme={managerTheme}>
        <div className={`${theme?.page?.wrapper1} `}>
          {children}
        </div>
      </Layout>
    </div>
  ) 
}


export default CmsManager

