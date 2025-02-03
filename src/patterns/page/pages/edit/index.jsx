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
import EditPane from './editPane'


function PageEdit ({
  format, item, dataItems, updateAttribute,attributes, setItem, apiLoad, apiUpdate, status, navOptions, siteType
}) {
  // console.log('props in pageEdit', siteType)
  const navigate = useNavigate()
  const submit = useSubmit()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
  const [ creating, setCreating ] = React.useState(false)
  const [ openEdit, setOpenEdit ] = React.useState(false)
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

  // console.log('page edit render', draftSections)

  const ContentEdit = React.useMemo(() => {
    return attributes['sections'].EditComp
  }, [])

  return (
    <PageContext.Provider value={{ item, dataItems, apiLoad, apiUpdate, openEdit, setOpenEdit }} >
      <div className={`${theme?.page?.container}`}>
        {item?.header === 'above' && (
          <ContentEdit
            full_width={'show'}
            item={item}
            value={[headerSection]} 
            onChange={(v,action) => saveHeader(v, item, user, apiUpdate)}         
            attributes={sectionAttr}
            siteType={siteType}
          />
        )} 
        
        <Layout 
          navItems={menuItems} 
          secondNav={theme?.navOptions?.secondaryNav?.navItems || []} 
          EditPane={() => (
            <EditPane 
              item={item}
              dataItems={dataItems}
              open={openEdit}
              setOpen={setOpenEdit}
              apiUpdate={apiUpdate} 
            />
          )}
        >
          <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[level]}`}>
            {item?.header === 'below' && (
              <ContentEdit
                full_width={'show'}
                item={item} 
                value={[headerSection]} 
                onChange={(v,action) => saveHeader(v, item, user, apiUpdate)} 
                attributes={sectionAttr} 
                siteType={siteType}
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
                  <ContentEdit
                    full_width={'show'}
                    item={item} 
                    value={[headerSection]} 
                    onChange={(val,action) => saveHeader(v, item, user, apiUpdate)}
                    attributes={sectionAttr}
                    siteType={siteType}
                  />
                )} 
                {user?.authLevel >= 5 && (
                  <Link className={theme?.page?.iconWrapper} to={`${baseUrl}/${item?.url_slug || ''}${window.location.search}`}>
                    <ViewIcon className={theme?.page?.icon} />
                  </Link>
                )}
                <ContentEdit
                  full_width={item.full_width}
                  value={draftSections} 
                  onChange={(val,action) => saveSection(val, action, item, user, apiUpdate)}         
                  attributes={sectionAttr}
                  siteType={siteType}
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
            </div>

          </div>
        </Layout>
        {item?.footer && <div className='h-[300px] bg-slate-100' />} 
      </div>
    </PageContext.Provider>
  ) 
}

export default PageEdit

