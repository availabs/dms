import React, {useEffect, useRef} from 'react'
import { Link } from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'
// -- 
import { CMSContext } from '../siteConfig'
import {dataItemsNav, detectNavLevel, getInPageNav} from './_utils'
import Layout from '../ui/avail-layout'
import SideNav from '../ui/nav/Side'

import {PDF, PencilEditSquare, Printer} from '../ui/icons'
import { SideNavContainer } from '../ui'
import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";

function PageView ({item, dataItems, attributes, logo, rightMenu}) {
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }

  //console.log('item', item, dataItems, status)
  const pdfRef = useRef(); // To capture the section of the page to be converted to PDF
  const { baseUrl, theme, user } = React.useContext(CMSContext) || {}
  const ContentView = React.useMemo(() => {
    return attributes['sections'].ViewComp
  }, [])

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);

  const inPageNav = getInPageNav(item,theme);

  const headerSection = item['sections']?.filter(d => d.is_header)?.[0]
  const sections = item['sections']?.filter(d => !d.is_header && !d.is_footer)
  const sectionAttr = attributes?.['sections']?.attributes || {}
  //console.log('test 123', attributes['sections'])


  return (
    <div id='page_view'>
      {/* Header */}
      {(item?.header === 'above') && <ContentView item={item} value={[headerSection]} attributes={sectionAttr} />}
      {/* Layout */}
      <Layout navItems={menuItems} secondNav={theme?.navOptions?.secondaryNav?.navItems || []}>
        <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[level]}`}>
          {(item?.header === 'below') && <ContentView item={item} value={[headerSection]} attributes={sectionAttr} />}
          <div className={`${theme?.page?.wrapper2}`}>
            {item?.sidebar === 'show' && (
              <SideNavContainer>
                <SideNav {...inPageNav} /> 
              </SideNavContainer>
            )}
            <div className={theme?.page?.wrapper3} ref={pdfRef}>
              {/* Content */}
              {(item?.header === 'inpage') &&
                  <ContentView item={item} value={[headerSection]} attributes={sectionAttr}/>}
              {user?.authLevel >= 5 && (
                  <Link className={theme?.page?.iconWrapper} to={`${baseUrl}/edit/${item?.url_slug || ''}`}>
                    <PencilEditSquare className={theme?.page?.icon}/>
                  </Link>
              )}
              <div className={'flex absolute right-10 top-2'}>
                <button className={'mx-1'} onClick={() => selectablePDF(pdfRef)}>
                  <PDF className={'hover:text-blue-500 text-blue-300'}/>
                </button>
              </div>
              <ContentView
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
      {item?.footer && <div className='h-[300px] bg-slate-100'/>}
    </div>
  )
}


export default PageView

