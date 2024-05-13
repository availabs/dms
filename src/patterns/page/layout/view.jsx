import React, {useEffect} from 'react'
import { Link } from "react-router-dom";

import SideNav from './components/nav/Side'

import { CMSContext } from '../siteConfig'

import Layout from './components/avail-layout'
import {dataItemsNav, detectNavLevel} from './components/utils/navItems'
import {getInPageNav} from "./components/utils/inPageNavItems.js";

import cloneDeep from 'lodash/cloneDeep'


function PageView ({item, dataItems, attributes, logo, rightMenu}) {
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }

  const { baseUrl, theme, user } = React.useContext(CMSContext)
  const ContentView = React.useMemo(() => {
    return attributes['sections'].ViewComp
  }, [])

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  const level = item?.index === '999' ? 1 : detectNavLevel(dataItems, baseUrl);
  const inPageNav = getInPageNav(item);

  const headerSection = item['sections']?.filter(d => d.is_header)?.[0]
  const sections = item['sections']?.filter(d => !d.is_header && !d.is_footer)

  //console.log('page view', sections)
  
  return (
    <div id='page_view'>
      {/* Header */}
      {(item?.header === 'above') && <ContentView item={item} value={[headerSection]} {...attributes['sections']}/>}
      {/* Layout */}
      <Layout 
        topNav={{menuItems, position: 'fixed', logo, rightMenu }}
        sideNav={item.sideNav ? item.sideNav : inPageNav}
      >
        <div className={`${theme.page.wrapper1} ${theme.navPadding[level]}`}>
          {(item?.header === 'below') && <ContentView item={item} value={[headerSection]} {...attributes['sections']}/>}
          <div className={`${theme.page.wrapper2}`}>
            {item?.sidebar === 'show' && <RenderSideNav inPageNav={inPageNav} />}      
            <div className={theme.page.wrapper3}>
              {/* Content */}
              {(item?.header === 'inpage') && <ContentView item={item} value={[headerSection]} {...attributes['sections']}/>}
              {user?.authLevel >= 5 && <ToggleEdit item={item} baseUrl={baseUrl} />}
              <ContentView 
                item={item}
                value={sections} 
                {...attributes['sections']}
              />
            </div>    
          </div>
        </div>
      </Layout>
      {/*Footer*/}
      {item?.footer && <div className='h-[300px] bg-slate-100' />}
    </div>
  ) 
}


export default PageView

function ToggleEdit({baseUrl, item}) {
  return (
    <Link className='z-30 absolute right-[10px] top-[5px]' to={`${baseUrl}/edit/${item.url_slug}`}>
      <i className={`fad fa-edit fa-fw flex-shrink-0 text-lg text-slate-400 hover:text-blue-500`}/>
    </Link> 
  )
}
 
function RenderSideNav({inPageNav}) {
  return (
    <div className='w-64 hidden xl:block'>
      <div className='w-64 sticky top-20 hidden xl:block h-screen'> 
        <div className='h-[calc(100%_-_5rem)] overflow-y-auto overflow-x-hidden font-display'>
          <SideNav {...inPageNav} /> 
        </div>
      </div>
    </div>
  )
}

