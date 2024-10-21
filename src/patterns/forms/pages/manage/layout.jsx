import React, {useEffect} from 'react'



//import { saveHeader, saveSection } from './editFunctions'
import Layout from '../../ui/avail-layout'
// import SideNav from '../../ui/nav/Side'
import { ViewIcon } from '../../ui/icons'
import { FormsContext } from '../../siteConfig'


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
 
  
  const { baseUrl, theme={}, user } = React.useContext(FormsContext) || {}
  

  const managerNavItems = [
    { name: '< Manage Site', path: '/list' },
    { name:'', className: 'p-2' },
    { name: 'Dashboard', path: `${baseUrl}/manage` },
    
    {name: 'View Site', path: `${baseUrl}/`},
    // { name: 'Metadata', path: `${baseUrl}/manage/metadata` },
    // { name: 'Validate', path: `${baseUrl}/manage/validate` },
    

    { name: 'Layout', className: theme.navLabel },
    { name: 'Design', path: `${baseUrl}/manage/design` }
  ]



  return (
    <Layout navItems={managerNavItems} theme={managerTheme}>
      <div className={`${theme?.page?.wrapper1} `}>
        {children}
      </div>
    </Layout>
  ) 
}


export default CmsManager

