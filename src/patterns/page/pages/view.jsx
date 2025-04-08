import React, {useEffect, useRef} from 'react'
import { Link, useSubmit } from "react-router-dom";
import { cloneDeep } from "lodash-es"
import { v4 as uuidv4 } from 'uuid';
// -- 
import { CMSContext } from '../siteConfig'
import { json2DmsForm, dataItemsNav } from './_utils'
import { Layout, SectionGroup } from '../ui'

import {PDF, PencilEditSquare, Printer} from '../ui/icons'
import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";
//import {Footer} from "../ui/dataComponents/selector/ComponentRegistry/footer";
export const PageContext = React.createContext(undefined);


function PageView ({item, dataItems, attributes, logo, rightMenu, siteType, apiLoad, apiUpdate, format,busy}) {
  const submit = useSubmit()
  // console.log('page_view')
  // if(!item) return <div> No Pages </div>
  
  if(!item) {
    item = {} // create a default item to set up first time experience.
  }

  React.useEffect(() => {
      // -------------------------------------------------------------------
      // -- This on load effect backfills pages created before sectionGroups
      // -------------------------------------------------------------------
      if(!item.section_groups && item.id) {
        console.log('edit item', item)
        let newItem = {id: item.id}
        newItem.section_groups = [
          {name: 'default', position: 'content', index: 0, theme: 'content'}
        ]
        newItem.sections = cloneDeep(item.sections)

        if(item?.header && item?.header !== 'none' ) {
          newItem.section_groups.push( 
            {name: 'header', position: 'top', index: 0, theme: 'header', full_width: 'show'}
          )
        }
        if(item?.footer && item?.footer !== 'none' ) {
          newItem.section_groups.push( 
            {name: 'footer', position: 'bottom', index: 99, theme: 'clearCentered', full_width: 'show'}
          )
          if(!item.sections.filter(d => d.is_footers)?.[0]){
            newItem.sections.push({
                "size": "2",
                "group": "footer",
                is_footer: 'true',
                "order": 0,
                "element": {
                    "element-type": "Footer: MNY Footer"
                },
                "trackingId": uuidv4(),
            })
          }
        }
        
        newItem.sections?.forEach((section,i) => {
          if(section.is_header) {
            //console.log('section is header', section.id)
            section.group = 'header'
            
          }
        })
        //console.log('new item', newItem)
        submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/${item.url_slug}` })
      }
     
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

  //console.log('menuItems', menuItems)

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
            sections={draftSections.filter(d => d.group === group.name || (!d.group && group?.name === 'default'))}
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

