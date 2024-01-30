import React, {useEffect} from 'react'
import { Link } from "react-router-dom";

import { SideNav } from '~/modules/avl-components/src'
import { CMSContext } from '../layout'

import Layout from '../components/avail-layout'
import {dataItemsNav, detectNavLevel} from '../components/utils/navItems'
import {getInPageNav} from "../components/utils/inPageNavItems.js";
import { Header } from '../components/header'

import cloneDeep from 'lodash/cloneDeep'



function PageView ({item, dataItems, attributes, user, logo, rightMenu}) {
  if(!item) return <div> No Pages </div>

  const { baseUrl, theme } = React.useContext(CMSContext)
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
            
            <div className={theme.page.content}>
              <div className={theme.page.container + ' '}>
                {/*<div className='px-6 py-4 font-sans font-medium text-xl text-slate-700 uppercase max-w-5xl mx-auto'>
                  {item['title']}
                </div>*/}
                
                <div className='text-md font-light leading-7'>
                  <ContentView 
                    item={item}
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



