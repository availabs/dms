import React, {useEffect} from 'react'
import { Link } from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'
// -- 
import { FormsContext } from '../metaFormsconfig'
import {dataItemsNav, detectNavLevel, getInPageNav} from './_utils'
import Layout from '../ui/avail-layout'
import SideNav from '../ui/nav/Side'

import {PencilEditSquare} from '../ui/icons'
import { SideNavContainer } from '../ui'
import SectionArray from "../components/sections/sectionArray";
import {templateSection} from "../../admin/admin.format";

const HelloWorld = () => <div> hello world </div>

function PageView ({item, dataItems, attributes, logo, rightMenu}) {
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }

  const { baseUrl, theme, user } = React.useContext(FormsContext) || {}
  console.log('forms template page view', item, theme)
  
  const ContentView = React.useMemo(() => {
    return attributes?.['sections']?.ViewComp || SectionArray.ViewComp
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
                <Link className={theme?.page?.iconWrapper} to={`${baseUrl}/edit/${item?.url_slug || ''}`}>
                  <PencilEditSquare  className={theme?.page?.icon} />
                </Link>
              )}
              {item.title}
              <ContentView
                  attr={attr}
                full_width={item.full_width}
                item={item}
                value={sections} 
                attributes={sectionAttr}
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

