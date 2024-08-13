import React, {useEffect} from 'react'
//import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import ManagerLayout from './layout'


// import { json2DmsForm, getUrlSlug, toSnakeCase, getInPageNav,dataItemsNav, detectNavLevel  } from '../_utils'
// //import { saveHeader, saveSection } from './editFunctions'
// import Layout from '../../ui/avail-layout'
// import SideNav from '../../ui/nav/Side'
// import { ViewIcon } from '../../ui/icons'
// import { SideNavContainer } from '../../ui'
 import { CMSContext } from '../../siteConfig'






function FormsManager ({item, dataItems, attributes, logo, rightMenu}) {
 
  
  const { baseUrl, theme, user } = React.useContext(CMSContext) || {}

  return (
      <div className={`${theme?.page?.wrapper2}`}>
        {/*<SideNavContainer>
          Left Nav
        </SideNavContainer>
       */}   
        <div className={theme?.page?.wrapper3}>
          {/* Content */}
          <div>
            Dashboard
          </div>
        </div>
       {/* <SideNavContainer>
          Right Nav
        </SideNavContainer>   */}
      </div>
  ) 
}


export default FormsManager

