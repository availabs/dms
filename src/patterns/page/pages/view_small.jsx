import React, {useEffect, useRef} from 'react'
import { cloneDeep, merge } from "lodash-es"
// -- 
import { CMSContext, PageContext } from '../context'
import { /*sectionsBackill,*/ dataItemsNav } from './_utils'
import SectionGroup from '../ui/dataComponents/sections/sectionGroup'

// import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";



function PageView ({item, dataItems, attributes, logo, rightMenu, siteType, apiLoad, apiUpdate, format,busy}) {
  let { UI, baseUrl, theme, user, API_HOST } = React.useContext(CMSContext) || {};
  const { Layout } = UI;
  // if(!item) return <div> No Pages </div>
  
  if(!item) { item = {} }// create a default item to set up first time experience.

  // React.useEffect(() => {
  //     // -------------------------------------------------------------------
  //     // -- This on load effect backfills pages created before sectionGroups
  //     // -- This should be deleted by JUNE 1 2025
  //     // -------------------------------------------------------------------
  //     //sectionsBackill(item,baseUrl,submit)
  //   
  // },[])

  //console.log('item', item, dataItems, status)
 
  theme = merge(cloneDeep(theme), item?.theme || {})
  const ContentView = React.useMemo(() => {
    return attributes['sections'].ViewComp
  }, [])

  const menuItems = React.useMemo(() => {
    let items = dataItemsNav(dataItems,baseUrl,false)
    return items
  }, [dataItems])


  // const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);

  const draftSections = item?.['sections'] || [] 

  // //console.log('draft_sections', draftSections)

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

