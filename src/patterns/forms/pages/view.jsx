import React, {useEffect} from 'react'
import { Link, useParams } from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'
// -- 
import { FormsContext } from '../'
import {dataItemsNav, detectNavLevel, getInPageNav} from './_utils'
import Layout from '../ui/avail-layout'
import SideNav from '../ui/nav/Side'

import {PencilEditSquare} from '../ui/icons'
import { SideNavContainer } from '../ui'
import {templateSection} from "../../admin/admin.format";

const HelloWorld = () => <div> hello world </div>

function PageView ({item, dataItems, attributes, logo, rightMenu, format, apiLoad, apiUpdate, ...rest}) {
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  const params = useParams()
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }
  const urlWithoutId = item.url_slug?.replace(':id', '')
  const itemId = params['*']?.split(urlWithoutId)[1]
  const editUrl = `edit/${urlWithoutId}${itemId || ''}`;
  const { baseUrl, theme, user } = React.useContext(FormsContext) || {}

  console.log('Form Tempate View', item.url_slug , urlWithoutId, itemId, baseUrl, params)
  // console.log('forms template page view', item, theme)
  
  const ContentView = React.useMemo(() => {
    return attributes?.['sections']?.ViewComp //|| SectionArray.ViewComp
  }, [])



  // const menuItems = React.useMemo(() => {
  //   let items = dataItemsNav(dataItems,baseUrl,false)
  //   return items
  // }, [dataItems])

  const level = 1 //item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);

  //const inPageNav = getInPageNav(item,theme);

  const headerSection = (item?.['sections'] || [])?.filter(d => d.is_header)?.[0]
  const sections = (item?.['sections'] || item?.['draft_sections'] || [])?.filter(d => !d.is_header && !d.is_footer)
  const sectionAttr = attributes?.['sections']?.attributes || {}
  const attr = {attributes: templateSection.attributes}

  //console.log('test 123', attributes['sections'])



  return (
    <div id='page_view'>
      {/* Header */}
      {(item?.header === 'above') && <ContentView item={item} value={[headerSection]} attributes={sectionAttr} />}
      {/* Layout */}
      <Layout >
        <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[level]}`}>
          {(item?.header === 'below') && <ContentView item={item} value={[headerSection]} attributes={sectionAttr} />}
          <div className={`${theme?.page?.wrapper2}`}>
            {item?.sidebar === 'show' && (
              <SideNavContainer>
                <SideNav /> 
              </SideNavContainer>
            )}      
            <div className={theme?.page?.wrapper3}>
              {/* Content */}
              {(item?.header === 'inpage') && <ContentView item={item} value={[headerSection]} attributes={sectionAttr} />}
              {user?.authLevel >= 5 && (
                <Link className={theme?.page?.iconWrapper} to={`${baseUrl}/${editUrl || ''}`}>
                  <PencilEditSquare  className={theme?.page?.icon} />
                </Link>
              )}
              {/*{item.title}*/}
              <ContentView
                attr={attr}
                full_width={item.full_width}
                item={item}
                value={sections}
                attributes={sectionAttr}
                format={format}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
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

