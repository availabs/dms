import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
//import cloneDeep from 'lodash/cloneDeep'

import { json2DmsForm, getUrlSlug, toSnakeCase, getInPageNav,dataItemsNav, detectNavLevel  } from '../_utils'
//import { saveHeader, saveSection } from './editFunctions'
import Layout from '../../ui/avail-layout'
import SideNav from '../../ui/nav/Side'
import { ViewIcon } from '../../ui/icons'
import { SideNavContainer } from '../../ui'
import { CMSContext } from '../../siteConfig'

function CmsManager ({item, dataItems, attributes, logo, rightMenu}) {
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }

  //console.log('item', item, dataItems, status)
  
  const { baseUrl, theme, user } = React.useContext(CMSContext) || {}
  const ContentView = React.useMemo(() => {
    return attributes['sections'].ViewComp
  }, [])

  // const menuItems = React.useMemo(() => {
  //   let items = dataItemsNav(dataItems,baseUrl,false)
  //   return items
  // }, [dataItems])

  // const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);

  // const inPageNav = getInPageNav(item,theme);


  //console.log('test 123', attributes['sections'])


  return (
    <div id='page_view'>
      {/* Layout */}
      <Layout navItems={[]}>
        <div className={`${theme?.page?.wrapper1} `}>
          <div className={`${theme?.page?.wrapper2}`}>
            <SideNavContainer>
              Left Nav
            </SideNavContainer>
              
            <div className={theme?.page?.wrapper3}>
              {/* Content */}
              <div>
                Settings Main Content
              </div>
            </div>
            <SideNavContainer>
              Right Nav
            </SideNavContainer>   
          </div>
        </div>
      </Layout>
    </div>
  ) 
}


export default CmsManager

