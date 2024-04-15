import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'


import Layout from '../components/avail-layout'
import { getInPageNav } from "../components/utils/inPageNavItems.js";

import SideNav from '../components/nav/Side'
import {json2DmsForm, getUrlSlug, toSnakeCase} from '../components/utils/navItems'
import EditControls from '../components/editControls'
import { CMSContext } from '../../siteConfig'




function TemplateEdit ({
  item, dataItems, updateAttribute ,attributes, setItem, status, params, logo, rightMenu, sideNav=[]
}) {
  const navigate = useNavigate()
  const submit = useSubmit()
  const { baseUrl, user, theme } = React.useContext(CMSContext)
  const { pathname = '/edit' } = useLocation()
  //const { baseUrl } = React.useContext(CMSContext)
  
  const { id } = params
  
  const level = 1;
  const inPageNav = getInPageNav(item);

  // console.log('in page nav', inPageNav)

  const headerSection = item['sections']?.filter(d => d.is_header)?.[0]
  const draftSections = item['sections']?.filter(d => !d.is_header && !d.is_footer)
  const menuItems=[
    {path: `${baseUrl}/templates`, name: 'Templates'}
  ]

  const saveHeader = (v) => {
    
    let history = item.history ? cloneDeep(item.history) : []
  
    history.push({
      type: 'Header updated.',
      user: user.email, 
      time: new Date().toString()
    })
    
    updateAttribute('','',{
      'has_changes': true,
      'history': history,
      'sections': [...v, ...draftSections].filter(d => d)
    })
    const newItem = {
      id: item.id, 
      sections: [...v, ...draftSections].filter(d => d),
      has_changes: true,
      history, 
    }
    console.log('save header', newItem)
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
  }

  const saveSection = (v,action) => {
    //console.log('save section', v,action)
    let edit = {
      type: action,
      user: user.email, 
      time: new Date().toString()
    }

    let history = item.history ? cloneDeep(item.history) : []
    if(action){
      history.push(edit)
    }
    updateAttribute('','',{
      'has_changes': true,
      'history': history,
      'sections': [headerSection, ...v].filter(d => d)
    })

    // ----------------
    // only need to send id, and data to update, not whole 
    // --------------------

    const newItem = {
      id: item.id, 
      sections: [headerSection, ...v].filter(d => d),
      has_changes: true,
      history, 
    }
    submit(json2DmsForm(newItem), { method: "post", action: pathname })
    //.then(d => console.log('on submit',d))
  }

  //console.log('page edit', attributes['sections'])
  const ContentEdit = React.useMemo(() => {
    return attributes['sections'].EditComp
  }, [])
 
  return (
    <div key={id}>
       {item?.header === 'above' && <div className='w-full'> 
         <ContentEdit
            full_width={item.full_width}
            value={[headerSection]} 
            onChange={saveHeader}         
            {...attributes['sections']}
          />
        </div>
      } 
      <Layout 
        topNav={{menuItems, position: 'fixed', logo, rightMenu }} 
        sideNav={sideNav}
      >
        <div className={`${theme.page.wrapper1} ${theme.navPadding[level]}`}>
          {item?.header === 'below' && (
            <div className='w-full'> 
              <ContentEdit item={item} value={[headerSection]} onChange={saveHeader} {...attributes['sections']} />
            </div>
          )}
            {/* PAGE EDIT */}

          <div className={`${theme.page.wrapper2}`}>
            {item?.sidebar === 'show' && <RenderSideNav inPageNav={inPageNav} />}  
            <div className={theme.page.wrapper3 + ' border-r'}>
              {item?.header === 'inpage' && (
                <div className='w-full'> 
                 <ContentEdit item={item} value={[headerSection]} onChange={saveHeader} {...attributes['sections']}/>
                </div>
              )} 
                
              <ContentEdit
                full_width={item.full_width}
                value={draftSections} 
                onChange={saveSection}         
                {...attributes['sections']}
              />
                
            </div>
              
            <div className='w-52 hidden xl:block'>
              <div className='w-52 sticky top-12 hidden xl:block h-screen'> 
                <EditControls
                  item={item}
                  dataItems={dataItems}
                  setItem={setItem}
                  edit={true}
                  status={status}
                  attributes={attributes}
                  updateAttribute={updateAttribute}
                  pageType={'template'}
                />
              </div>
            </div>
          </div>  
            {/* PAGE EDIT END */}
        </div>
      </Layout>
      {item?.footer && <div className='h-[300px] bg-slate-100' />} 
    </div>   
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



export default TemplateEdit