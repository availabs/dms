import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import Nav, {json2DmsForm, getUrlSlug, toSnakeCase}  from './nav'
import EditHistory from './editHistory'
import { PageControls } from './page-controls'
import { SideNav } from '~/modules/avl-components/src'
import { CMSContext } from './layout'

import Layout from './avail-layout'
import {dataItemsNav, detectNavLevel} from './utils/navItems'
import {getInPageNav} from "./utils/inPageNavItems.js";

import cloneDeep from 'lodash/cloneDeep'


const theme = {
  page: {
    container: 'flex-1 w-full h-full ',
    content: '',
  },
  layout: {
    page: 'h-full w-full bg-slate-100 flex flex-col',
    container: 'w-full flex-1 flex flex-col',
  },
  navPadding: {
    1: 'pt-0 ',
    2: 'md:pt-12 pt-0',
    3: 'md:pt-24 pt-0'
  } 
}

function Header ({bgImg='/img/header.png', logo='/img/nygov-logo.png', title='MitigateNY', subTitle='New York State Hazard Mitigation Plan', note='2023 Update'}) {
  return (
    <div className='h-[300px] bg-cover bg-center w-full flex ' style={{ backgroundImage: `url("${bgImg}")` }}>
      <div className='p-2'>
        {logo && <img src={logo} alt="NYS Logo" />}
      </div>
      <div className='flex-1 flex flex-col  items-center p-4'>
        <div className='flex-1'/>
        <div className='text-3xl sm:text-7xl font-bold text-[#f2a91a] text-right w-full text-display'>
          {title && <div>{title}</div>}
        </div>
        <div className='text-lg tracking-wider pt-2 sm:text-3xl font-bold text-slate-200 text-right w-full uppercase'>
          {subTitle && <div>{subTitle}</div>}
        </div>
        <div className='text-lg tracking-wider sm:text-xl font-bold text-slate-200 text-right w-full uppercase'>
          {note && <div>{note}</div>}
        </div>
        <div className='flex-1'/>
      </div>
    </div>
  )
}

export function PageView ({item, dataItems, attributes, user, logo, rightMenu}) {
  if(!item) return <div> No Pages </div>

  console.log('item', item)

  const {baseUrl} = React.useContext(CMSContext)
  const ContentView = attributes['sections'].ViewComp
  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

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


export function PageEdit ({
  item, dataItems, updateAttribute ,attributes, setItem, status, user, logo, rightMenu
}) {
  const navigate = useNavigate()
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl } = React.useContext(CMSContext)
  
  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,true)
    return items
  }, [dataItems])

  const level = detectNavLevel(dataItems, baseUrl);
  const inPageNav = getInPageNav(dataItems, baseUrl);
  
  // console.log('page edit', item)
  //console.log('page edit', open, setOpen)
  //if(!dataItems[0]) return <div/>

  React.useEffect(() => {
    if(!item?.url_slug ) { 
      let defaultUrl = dataItems
        .sort((a,b) => a.index-b.index)
        .filter(d=> !d.parent && d.url_slug)[0]
      defaultUrl && defaultUrl.url_slug && navigate(`edit/${defaultUrl.url_slug}`)
    }
  },[])

  const saveSection = (v) => {
    updateAttribute('sections', v)
    const newItem = cloneDeep(item)
    newItem.sections = v
    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
  }

  const ContentEdit = attributes['sections'].EditComp
 
  return (
    <div>
       {item?.header && <Header {...item.header}/>} 
      <Layout 
        topNav={{menuItems, position: 'fixed', logo, rightMenu }} 
        sideNav={inPageNav}
      >
        <div className={`${theme.layout.page} ${theme.navPadding[level]}`}>
          <div className={theme.layout.container}>
            {/* PAGE EDIT */}
            <div className='flex flex-1 h-full w-full px-1 md:px-6 py-6'>
              <Nav dataItems={dataItems}  edit={true} />
              <EditHistory item={item} />
              {item?.sidebar === 'show' ? 
                  (<div className='w-64 hidden xl:block'>
                    <div className='w-64 fixed hidden xl:block h-screen'> 
                      <div className='h-[calc(100%_-_8rem)] overflow-y-auto overflow-x-hidden'>
                        <SideNav {...inPageNav} /> 
                      </div>
                    </div>
                  </div>)
                : ''}
              <div className='flex-1 flex border shadow bg-white px-4 '>
                <div className={theme.page.container}>
                  <div className='w-full text-right relative py-2 z-10 h-[40px]'>
                  {user?.authLevel >= 5 ?  
                    <Link to={`${baseUrl}/${item.url_slug}`}>
                      <i className='fad fa-eye fa-fw flex-shrink-0  pr-1 text-blue-500'/>
                    </Link> : ''}
                </div>
                <div className='text-base font-light leading-7 -mt-[40px]'>
                    <ContentEdit
                      value={item['sections']} 
                      onChange={saveSection}         
                      {...attributes['sections']}
                    />
                </div>
              </div>
              </div>
              <div className='w-52 hidden xl:block'>
                <div className='w-52 fixed hidden xl:block h-screen'> 
                  <PageControls 
                    item={item} 
                    dataItems={dataItems}
                    setItem={setItem}
                    edit={true}
                    status={status}
                    attributes={attributes}
                    updateAttribute={updateAttribute}
                  />
                </div>
              </div>
            </div>  
            {/* PAGE EDIT END */}
          </div>
        </div>
      </Layout>
      {item?.footer && <div className='h-[300px] bg-slate-100' />} 
    </div>
  ) 
}


