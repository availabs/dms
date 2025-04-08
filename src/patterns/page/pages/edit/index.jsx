import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import { cloneDeep } from "lodash-es"
import { v4 as uuidv4 } from 'uuid';


import { json2DmsForm, getInPageNav, dataItemsNav, detectNavLevel  } from '../_utils'

import { Layout, SectionGroup } from '../../ui'
import { PageContext } from '../view'

import { CMSContext } from '../../siteConfig'
import PageControls from './editPane'
import {Footer} from "../../ui/dataComponents/selector/ComponentRegistry/footer";



function PageEdit ({
  format, item, dataItems, updateAttribute, attributes, setItem, apiLoad, apiUpdate, status, navOptions, busy
}) {
	// console.log('props in pageEdit', siteType)
	const navigate = useNavigate()
	const submit = useSubmit()
	const { pathname = '/edit' } = useLocation()
	const { baseUrl, user, theme } = React.useContext(CMSContext) || {}
	const [ editPane, setEditPane ] = React.useState({ open: false, index: 1, showGrid: false })
	  
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
	      let defaultItem = dataItems
	        .sort((a,b) => a.index-b.index)
	        .find(d=> !d.parent && d.url_slug);

			const defaultUrl = `${baseUrl}/edit/${defaultItem.url_slug}`;

			if(defaultUrl && pathname !== defaultUrl){
			  navigate(defaultUrl)
		  }
	    }
	},[])

	React.useEffect(() => {
		if(!item?.id) return;
	  	// -------------------------------------------------------------------
	    // -- This on load effect backfills pages created before sectionGroups
	  	// -------------------------------------------------------------------
	  	if(!item.draft_section_groups) {
	    	let newItem = {id: item.id}
	    	newItem.draft_section_groups = [
	    		{name: 'default', position: 'content', index: 0, theme: 'content'}
	    	]
	    	if(item?.header && item?.header !== 'none' ) {
	    		newItem.draft_section_groups.push( 
	    			{name: 'header', position: 'top', index: 0, theme: 'header', full_width: 'show'}
	    		)
	    	}
	    	newItem.draft_sections = cloneDeep(item.draft_sections || [])

	    	if(item?.footer && item?.footer !== 'none' ) {
          newItem.draft_section_groups.push( 
            {name: 'footer', position: 'bottom', index: 99, theme: 'clearCentered', full_width: 'show'}
          )
          if(!item.draft_sections.filter(d => d.is_footer)?.[0]){
            newItem.draft_sections.push({
                "size": "2",
                "group": "footer",
                is_footer: true,
                "order": 0,
                "element": {
                    "element-type": "Footer: MNY Footer"
                },
                "trackingId": uuidv4(),
            })
          }
        }


    		newItem.draft_sections.forEach((section,i) => {
    			if(section.is_header) {
    				section.group = 'header'
    			}
    		})
	    	submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${item.url_slug}` })
	    }
	   
	},[])

	const draftSections = item?.['draft_sections'] || [] 

	//console.log('draft_sections', draftSections)

	
  	const getSectionGroups =  ( sectionName ) => {
	    return (item?.draft_section_groups || [])
	      	.filter((g,i) => g.position === sectionName)
	      	.sort((a,b) => a?.index - b?.index)
	      	.map((group,i) => (
		        <SectionGroup
		          key={group?.name || i}
		          group={group}
		          sections={draftSections.filter(d => d.group === group.name || (!d.group && group?.name === 'default'))}
		          attributes={attributes}
		          item={item}
		          edit={true}
		        />
	      	))
    }

	if(!item) return ;
	return (
	    <PageContext.Provider value={{ item, dataItems, apiLoad, apiUpdate, editPane, setEditPane, format, busy }} >
	      <div className={`${theme?.page?.container}`}>
	        <PageControls />
	        {getSectionGroups('top')}
	        <Layout 
	          navItems={menuItems} 
	          secondNav={theme?.navOptions?.secondaryNav?.navItems || []}
	          pageTheme={{navOptions: item.navOptions || {}}}
	        >
	          {getSectionGroups('content')}
	        </Layout>
	        {getSectionGroups('bottom')}
	        {/*<Footer show={item.footer} dataItems={dataItems} />*/}
	      </div>
	    </PageContext.Provider>
	) 
}

export default PageEdit

