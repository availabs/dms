import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'

import { json2DmsForm, getUrlSlug, toSnakeCase, getInPageNav,dataItemsNav, detectNavLevel  } from '../_utils'
import { saveHeader, saveSection } from './editFunctions'
import Layout from '../../ui/avail-layout'
import SideNav from '../../ui/nav/Side'
import {PencilEditSquare, ViewIcon} from '../../ui/icons'
import { SideNavContainer } from '../../ui'
import EditControls from './editControls'
import {FormsContext} from "../../metaFormsconfig";
import {templateSection} from "../../../admin/admin.format";

function PageEdit ({
  item={}, dataItems, updateAttribute,attributes, setItem, apiLoad, apiUpdate, status, navOptions, format
}) {
  const navigate = useNavigate()
  const submit = useSubmit()
  const params = useParams()
  const { pathname = '/edit' } = useLocation()
  const { baseUrl, user, theme } = React.useContext(FormsContext) || {}
  const [ creating, setCreating ] = React.useState(false)

  const urlWithoutId = item.url_slug?.replace(':id', '')
  const itemId = params['*']?.split(urlWithoutId)[1]
  const viewUrl = `${urlWithoutId}${itemId || ''}`;

  console.log('Form Tempate Edit', baseUrl)

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
    if(item.sections && item?.sections?.length > 0 && !item?.draft_sections) {
      const draftSections = cloneDeep(item.sections)
      draftSections.forEach(d => delete d.id)
      const newItem = cloneDeep(item)
      newItem.draft_sections = draftSections
      item.draft_sections = draftSections
      updateAttribute('draft_sections', draftSections)
      submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${newItem.url_slug}` })
    }
  },[])

  const headerSection = item?.['draft_sections']?.filter(d => d.is_header)?.[0]
  const draftSections = item?.['draft_sections']?.filter(d => !d.is_header && !d.is_footer)

  const HelloWorld = () => <div> hello world </div>

  const ContentEdit = React.useMemo(() => {
    return attributes?.['sections'].EditComp //|| SectionArray.EditComp
  }, [])
  // console.log('contentEdit', format, attributes?.['sections'])
  const attr = {attributes: templateSection.attributes}
  console.log('item', item)
  return (
    <div>
      {item?.header === 'above' && (
        <ContentEdit
          item={item}
          value={[headerSection]}
          onChange={(val,action) => saveHeader(v, item, user, apiUpdate)}
          attributes={sectionAttr}
        />
      )}
      <Layout>
        <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[level]}`}>
          {item?.header === 'below' && (
            <ContentEdit item={item} value={[headerSection]} onChange={(val,action) => saveHeader(v, item, user, apiUpdate)} attributes={sectionAttr} />
          )}
          <div className={`${theme?.page?.wrapper2}`}>
            {item?.sidebar === 'show' && (
              <SideNavContainer>
                <SideNav {...inPageNav} />
              </SideNavContainer>
            )}
            <div className={theme?.page?.wrapper3 + ''}>
              {item?.header === 'inpage' && (
                 <ContentEdit item={item} value={[headerSection]} onChange={(val,action) => saveHeader(v, item, user, apiUpdate)} attributes={sectionAttr}/>
              )}
              {user?.authLevel >= 5 && (
                <Link className={theme?.page?.iconWrapper} to={`/${baseUrl}/${viewUrl || ''}`}>
                  <ViewIcon className={theme?.page?.icon} />
                </Link>
              )}
              {item.title}
              <ContentEdit
                  attr={attr}
                  full_width={item?.full_width}
                  value={item.draft_sections}
                  onChange={(val,action) => {
                    console.log('save section', val, action, item, user)
                    saveSection(val, action, item, user, apiUpdate)
                  }}
                  attributes={sectionAttr}
                  format={format}
                  apiLoad={apiLoad}
                  apiUpdate={apiUpdate}
              />
            </div>
            {/*<SideNavContainer witdh={'w-52'}>
              <EditControls 
                item={item} 
                dataItems={dataItems}
                setItem={setItem}
                edit={true}
                status={status}
                apiUpdate={apiUpdate}
                attributes={attributes}
                updateAttribute={updateAttribute}
                pageType={'page'}
              />
            </SideNavContainer>*/}
          </div>

        </div>
      </Layout>
      {item?.footer && <div className='h-[300px] bg-slate-100' />}
    </div>
  )
}

export default PageEdit

