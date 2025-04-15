import React, {useEffect, useRef} from 'react'
import { Link, useSubmit } from "react-router-dom";
import { cloneDeep } from "lodash-es"

// -- 
import { CMSContext } from '../siteConfig'
import { sectionsBackill, dataItemsNav } from './_utils'
import { Layout, SectionGroup } from '../ui'

import {PDF, PencilEditSquare, Printer} from '../ui/icons'
import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";
//import {Footer} from "../ui/dataComponents/selector/ComponentRegistry/footer";
export const PageContext = React.createContext(undefined);


function PageView ({item, dataItems, attributes, logo, rightMenu, siteType, apiLoad, apiUpdate, format,busy}) {
  const submit = useSubmit()
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  
  if(!item) { item = {} }// create a default item to set up first time experience.

  React.useEffect(() => {
      // -------------------------------------------------------------------
      // -- This on load effect backfills pages created before sectionGroups
      // -- This should be deleted by JUNE 1 2025
      // -------------------------------------------------------------------
      sectionsBackill(item,baseUrl,submit)
     
  },[])

  //console.log('test 123', item)

  //console.log('item', item, dataItems, status)
  const pdfRef = useRef(); // To capture the section of the page to be converted to PDF
  const { baseUrl, theme, user, API_HOST } = React.useContext(CMSContext) || {}
  
  const ContentView = React.useMemo(() => {
    return attributes['sections'].ViewComp
  }, [])

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])

  console.log('menuItems', menuItems)

  // const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);

  const draftSections = item?.['sections'] || [] 

  //console.log('draft_sections', draftSections)

  
  const getSectionGroups =  ( sectionName ) => {
    return (item?.section_groups || [])
        .filter((g,i) => g.position === sectionName)
        .sort((a,b) => a?.index - b?.index)
        .map((group,i) => (
          <SectionGroup
            key={group?.name || i}
            group={group}
            attributes={attributes}
          />
        ))
  }

  return (
      <PageContext.Provider value={{ item, dataItems, apiLoad, apiUpdate, format, busy }} >
        <div className={`${theme?.page?.container}`}>
          {getSectionGroups('top')}
          <Layout 
            navItems={menuItems} 
            secondNav={theme?.navOptions?.secondaryNav?.navItems || []}
            pageTheme={{navOptions: item.navOptions || {}}}
          >
            {getSectionGroups('content')}
          </Layout>
          {getSectionGroups('bottom')}
        </div>
      </PageContext.Provider>
  ) 
}


export default PageView

