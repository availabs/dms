import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";

import { SideNav } from '~/modules/avl-components/src'
import { CMSContext } from '../layout'


import Layout from '../components/avail-layout'
import { dataItemsNav, detectNavLevel } from '../components/utils/navItems'
import { getInPageNav } from "../components/utils/inPageNavItems.js";
import { Header } from '../components/header'
import theme from '../components/theme'


import Nav, {json2DmsForm, getUrlSlug, toSnakeCase}  from './editPages'
import EditHistory from './editHistory'
import { EditControls } from './editControls'

import cloneDeep from 'lodash/cloneDeep'


function PageEdit ({
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
                  <EditControls 
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

export default PageEdit
