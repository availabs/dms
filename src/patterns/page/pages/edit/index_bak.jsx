import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import { cloneDeep } from "lodash-es"

import { json2DmsForm, getUrlSlug, toSnakeCase, getInPageNav, dataItemsNav, detectNavLevel  } from '../_utils'
import { saveHeader, saveSection } from './editFunctions'

import { Layout, SideNav, SideNavContainer } from '../../ui'
import { ViewIcon } from '../../ui/icons'
//import EditControls from './editControls'
import { PageContext } from '../view'


import { CMSContext } from '../../siteConfig'
import EditPane, { EditDrawer } from './editPane'
import {Footer} from "../../ui/dataComponents/selector/ComponentRegistry/footer";


function SectionGroup ({sectionGroup, sections, saveSection}) {
  const { baseUrl, user, theme } = React.useContext(CMSContext) || {}

}

function PageEdit ({
  format, item, dataItems, updateAttribute,attributes, setItem, apiLoad, apiUpdate, status, navOptions, siteType, busy
}) {
  // console.log('props in pageEdit', siteType)
  const navigate = useNavigate()
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
  const [ creating, setCreating ] = React.useState(false)
  const [ editPane, setEditPane ] = React.useState({ open: false, index: 1, showGrid: false })
  const isDynamicPage = true; // map this flag to the UI. when true, the page gets data loading capabilities.
  // console.log('item', item, dataItems, status)
  
  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,true)
    return items
  }, [dataItems])

  // console.log('-----------render edit----------------')
  const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);
  const inPageNav = getInPageNav(item, theme);
  const sectionAttr = attributes?.['sections']?.attributes || {}

  React.useEffect(() => {
    if(!item?.url_slug) { 
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

  const sectionGroups = [
    ...item.sectionGroups, 
    {name: 'defaultGroup', position: 'content', index: 0} 
  ]


  //console.log('page edit render', item)

  const SectionArray = React.useMemo(() => {
    return attributes['sections'].EditComp
  }, [])

  return (
    <PageContext.Provider value={{ item, dataItems, apiLoad, apiUpdate, editPane, setEditPane, format }} >
      <div className={`${theme?.page?.container}`}>
        <EditPane />
        <EditDrawer /> 
        {item?.header === 'above' && (
          <SectionArray
            full_width={'show'}
            item={item}
            value={[headerSection]} 
            onChange={(v,action) => saveHeader(v, item, user, apiUpdate)}         
            attributes={sectionAttr}
            siteType={siteType}
            apiLoad={isDynamicPage ? apiLoad : undefined}
            apiUpdate={isDynamicPage ? apiUpdate : undefined}
            format={isDynamicPage ? format : undefined}
          />
        )} 
        
        <Layout 
          navItems={menuItems} 
          secondNav={theme?.navOptions?.secondaryNav?.navItems || []}
          pageTheme={{navOptions: item.navOptions || {}}}
          
           
        >
          <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[level]}`}>
            {item?.header === 'below' && (
              <SectionArray
                full_width={'show'}
                item={item} 
                value={[headerSection]} 
                onChange={(v,action) => saveHeader(v, item, user, apiUpdate)} 
                attributes={sectionAttr} 
                siteType={siteType}
                apiLoad={isDynamicPage ? apiLoad : undefined}
                apiUpdate={isDynamicPage ? apiUpdate : undefined}
                format={isDynamicPage ? format : undefined}
              />
            )}
            <div className={`${theme?.page?.wrapper2}`}>
              {item?.sidebar === 'left' && (
                <SideNavContainer>
                  <SideNav {...inPageNav} /> 
                </SideNavContainer>
              )}  
              <div className={theme?.page?.wrapper3 + ''}>
                {item?.header === 'inpage' && (
                  <SectionArray
                    full_width={'show'}
                    item={item} 
                    value={[headerSection]} 
                    onChange={(val,action) => saveHeader(v, item, user, apiUpdate)}
                    attributes={sectionAttr}
                    siteType={siteType}
                    apiLoad={isDynamicPage ? apiLoad : undefined}
                    apiUpdate={isDynamicPage ? apiUpdate : undefined}
                    format={isDynamicPage ? format : undefined}
                  />
                )} 
                {user?.authLevel >= 5 && (
                  <Link className={theme?.page?.iconWrapper} to={`${baseUrl}/${item?.url_slug || ''}${window.location.search}`}>
                    <ViewIcon className={theme?.page?.icon} />
                  </Link>
                )}
                <SectionArray
                  full_width={item.full_width}
                  value={draftSections} 
                  onChange={(val,action) => saveSection(val, action, item, user, apiUpdate)}         
                  siteType={siteType}
                  attributes={sectionAttr}
                  apiLoad={isDynamicPage ? apiLoad : undefined}
                  apiUpdate={isDynamicPage ? apiUpdate : undefined}
                  format={isDynamicPage ? format : undefined}
                />
              </div>
              {item?.sidebar === 'right' && (
                <SideNavContainer>
                  <SideNav {...inPageNav} /> 
                </SideNavContainer>
              )}
              {/*<div className='w-64 h-screen border-2 border-blue-400' />*/}
            </div>

          </div>
          <div className={`fixed bottom-4 right-4 p-6 border rounded bg-white shadow ${busy?.loading > 0 || busy?.updating > 0 ? 'block' : 'hidden'} `}>
            <div>{busy?.updating > 0 && `Updating... ${busy?.updating}`}</div>
            <div>{busy?.loading > 0 && `Loading... ${busy?.loading}`}</div>
          </div>
          
        </Layout>
        <Footer show={item.footer} dataItems={dataItems} />
      </div>
    </PageContext.Provider>
  ) 
}

export default PageEdit

