import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";

import Layout from './components/avail-layout'
import SideNav from './components/nav/Side'
import EditControls from './components/editControls'

import { CMSContext } from './layout'

import { dataItemsNav, detectNavLevel } from './components/utils/navItems'
import { getInPageNav } from "./components/utils/inPageNavItems.js";
import { json2DmsForm, getUrlSlug, toSnakeCase } from './components/utils/navItems'


import cloneDeep from 'lodash/cloneDeep'


function PageEdit ({
  item, dataItems, updateAttribute ,attributes, setItem, status, logo, rightMenu
}) {
  const navigate = useNavigate()
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl, user, theme } = React.useContext(CMSContext)
  
  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,true)
    return items
  }, [dataItems])

  console.log('-----------render edit----------------')
  const level = detectNavLevel(dataItems, baseUrl);
  const inPageNav = getInPageNav(dataItems, baseUrl);
  
  //console.log('page edit', item)
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

  React.useEffect(() => {
    // ------------------------------------------------------------
    // -- This on load effect backfills pages created before drafts
    // -- will be removed after full adoption of draft / publish
    // ------------------------------------------------------------
    if(item.sections && item?.sections?.length > 0 && !item.draft_sections) {
      const draftSections = cloneDeep(item.sections)
      draftSections.forEach(d => delete d.id)
      const newItem = cloneDeep(item)
      newItem.draft_sections = draftSections
      item.draft_sections = draftSections
      updateAttribute('draft_sections', draftSections)
      submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
    }
  },[])

  const headerSection = item['draft_sections']?.filter(d => d.is_header)?.[0]
  const draftSections = item['draft_sections']?.filter(d => !d.is_header && !d.is_footer)

  const saveHeader = (v) => {
    
    let history = item.history ? cloneDeep(item.history) : []
  
    history.push({
      type: 'Header updated.',
      user: user?.email || 'user', 
      time: new Date().toString()
    })
    
    updateAttribute('','',{
      'has_changes': true,
      'history': history,
      'draft_sections': [...v, ...draftSections].filter(d => d)
    })
    const newItem = {
      id: item.id, 
      draft_sections: [...v, ...draftSections].filter(d => d),
      has_changes: true,
      history, 
    }
    console.log('save header', newItem)
    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${item.url_slug}` })
  }

  const saveSection = (v,action) => {
    //console.log('save section', v,action)
    let edit = {
      type: action,
      user: user?.email || 'user', 
      time: new Date().toString()
    }

    let history = item.history ? cloneDeep(item.history) : []
    if(action){
      history.push(edit)
    }
    updateAttribute('','',{
      'has_changes': true,
      'history': history,
      'draft_sections': [headerSection, ...v].filter(d => d)
    })

    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------

    const newItem = {
      id: item?.id, 
      draft_sections: [headerSection, ...v].filter(d => d),
      has_changes: true,
      history, 
    }
    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${item.url_slug}` })
    //.then(d => console.log('on submit',d))
  }

  const ContentEdit = React.useMemo(() => {
    return attributes['sections'].EditComp
  }, [])

  //console.log('headerSection', headerElement.position)
  
  // /img/landing_header2.png
  return (
    <div>
       {item?.header === 'above' && <div className='w-full'> 
         <ContentEdit
            item={item}
            value={[headerSection]} 
            onChange={saveHeader}         
            {...attributes['draft_sections']}
          />
        </div>
      } 
      <Layout 
        topNav={{menuItems, position: 'fixed', logo, rightMenu }} 
        sideNav={inPageNav}
      >
        <div className={`${theme.layout.page} ${theme.navPadding[level]}`}>
          <div className={theme.layout.container}>
            {item?.header === 'below' && <div className='w-full'> 
                   <ContentEdit
                      item={item}
                      value={[headerSection]} 
                      onChange={saveHeader}         
                      {...attributes['draft_sections']}
                    />
                  </div>
                }
            {/* PAGE EDIT */}

            <div className='flex flex-1 h-full w-full px-1 md:px-6 py-6'>
              {item?.sidebar === 'show' ? 
                  (<div className='w-64 hidden xl:block'>
                    <div className='w-64 fixed hidden xl:block h-screen'> 
                      <div className='h-[calc(100%_-_8rem)] overflow-y-auto overflow-x-hidden'>
                        <SideNav {...inPageNav} /> 
                      </div>
                    </div>
                  </div>)
                : ''}
              <div className={theme.page.content + ' border-r'}>

                <div className={theme.page.container}>
                {item?.header === 'inpage' && <div className='w-full'> 
                   <ContentEdit
                      item={item}
                      value={[headerSection]} 
                      onChange={saveHeader}         
                      {...attributes['draft_sections']}
                    />
                  </div>
                } 
                <div className='text-base font-light leading-7'>
                  {user?.authLevel >= 5 ?  
                    <div className='w-full flex relative'>
                      <div className='flex-1' />
                      <Link className='absolute -right-[10px] -top-[13px]' to={`${baseUrl}/${item.url_slug}`}>
                        <i className={`fad fa-eye  fa-fw flex-shrink-0 text-lg text-slate-400 hover:text-blue-500`}/>
                      </Link> 
                    </div>
                    : ''    
                  }
                    <ContentEdit
                      full_width={item.full_width}
                      value={draftSections} 
                      onChange={saveSection}         
                      {...attributes['draft_sections']}
                    />
                </div>
              </div>
              </div>
              <div className='w-52 hidden xl:block'>
                <div className='w-52 sticky top-24 hidden xl:block h-screen'> 
                  <EditControls 
                    item={item} 
                    dataItems={dataItems}
                    setItem={setItem}
                    edit={true}
                    status={status}
                    attributes={attributes}
                    updateAttribute={updateAttribute}
                    pageType={'page'}
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
