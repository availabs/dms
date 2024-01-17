import React, {useEffect} from 'react'
import { Link } from "react-router-dom";

import { SideNav } from '~/modules/avl-components/src'
import { CMSContext } from '../layout'

import Layout from '../components/avail-layout'
import {dataItemsNav, detectNavLevel} from '../components/utils/navItems'
import {getInPageNav} from "../components/utils/inPageNavItems.js";
import { Header } from '../components/header'
import theme from '../components/theme'

import cloneDeep from 'lodash/cloneDeep'



function PageView ({item, dataItems, attributes, user, logo, rightMenu}) {
  if(!item) return <div> No Pages </div>

  const {baseUrl} = React.useContext(CMSContext)
  const ContentView = attributes['sections'].ViewComp
  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  // console.log('page view', item)

  const level = detectNavLevel(dataItems, baseUrl);

  const inPageNav = getInPageNav(dataItems, baseUrl);


  
  return (
    <div>
    {/* Header */}
    {item?.header && <Header {...item.header}/>} 
    {/* Layout */}
    <Layout 
      topNav={{menuItems, position: 'fixed', logo, rightMenu }}
      sideNav={item.sideNav ? item.sideNav : inPageNav}
    >
      <div className={`${theme.layout.page} ${theme.navPadding[level]}`}>
        <div className={theme.layout.container}>
          {/*----Page ---*/}
          <div className='flex flex-1 h-full w-full px-1 md:px-6 py-6'>
            {/*<div className='w-[264px]' />*/}
            {item?.sidebar === 'show' ? 
                (<div className='w-64 hidden xl:block'>
                  <div className='w-64 fixed hidden xl:block h-screen'> 
                    <div className='h-[calc(100%_-_5rem)] overflow-y-auto overflow-x-hidden font-display'>
                      <SideNav {...inPageNav} /> 
                    </div>
                  </div>
                </div>)
              : ''}
            
            <div className='flex-1 flex border  shadow bg-white px-4'>
              <div className={theme.page.container + ' '}>
                {/*<div className='px-6 py-4 font-sans font-medium text-xl text-slate-700 uppercase max-w-5xl mx-auto'>
                  {item['title']}
                </div>*/}
                <div className='w-full text-right relative py-2 z-10 h-[40px]'>
                  {user?.authLevel >= 5 ?  
                    <Link to={`${baseUrl}/edit/${item.url_slug}`}>
                      <i className='fad fa-edit fa-fw flex-shrink-0  pr-1 text-blue-500'/>
                    </Link> : ''}
                </div>
              
                <div className='text-md font-light leading-7 -mt-[40px]'>
                  <ContentView 
                    value={item['sections']} 
                    {...attributes['sections']}
                  />
                </div>
              </div>    
            </div>
          </div>
          {/*---- END Page ---*/}
          
        </div>
      </div>
    </Layout>
    {/*Footer*/}
    {item?.footer && <div className='h-[300px] bg-slate-100' />}
    </div>
  ) 
}


export default PageView



