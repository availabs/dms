import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import { cloneDeep, merge } from "lodash-es"
import { v4 as uuidv4 } from 'uuid';


import { sectionsEditBackill, getInPageNav, dataItemsNav, detectNavLevel  } from '../_utils'

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
	let { baseUrl, user, theme } = React.useContext(CMSContext) || {}
	const [ editPane, setEditPane ] = React.useState({ open: false, index: 1, showGrid: false })
	  
	const menuItems = React.useMemo(() => {
	    let items = dataItemsNav(dataItems,baseUrl,true)
	    return items
	}, [dataItems])

	// console.log('-----------render edit----------------', item.draft_sections.length, item.draft_section_groups.length)
	theme = merge(cloneDeep(theme), item?.theme || {})
	const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);
	const inPageNav = getInPageNav(item, theme);
	const sectionAttr = attributes?.['sections']?.attributes || {}

	React.useEffect(() => {
	  if(!item?.url_slug) {
	      let defaultItem = dataItems
	        .sort((a,b) => a.index-b.index)
	        .find(d=> !d.parent && d.url_slug);
		  if(!defaultItem) return;

			const defaultUrl = `${baseUrl}/edit/${defaultItem?.url_slug}`;

			if(defaultUrl && pathname !== defaultUrl){
			  navigate(defaultUrl)
		  }
	  }
	},[])

	React.useEffect(() => {
	  	// -------------------------------------------------------------------
	    // -- This on load effect backfills pages created before sectionGroups
	  	// -------------------------------------------------------------------]
			if(!item.draft_section_groups && item?.id) {
	  		console.log('backfill------------------')
	  		sectionsEditBackill(item,baseUrl,submit)
	  	}
	   
	},[])



	//console.log('draft_sections', draftSections)

	
	const getSectionGroups =  ( sectionName ) => {
    return (item?.draft_section_groups || [])
    	.filter((g,i) => g.position === sectionName)
    	.sort((a,b) => a?.index - b?.index)
    	.map((group,i) => (
        <SectionGroup
          key={group?.name || i}
          group={group}
           //.filter(d => d.group === group.name || (!d.group && group?.name === 'default'))}
          attributes={ attributes }
          edit={true}
        />
    	))
  }


	if(!item) return;
	return (
	    <PageContext.Provider value={{ item, dataItems, apiLoad, apiUpdate, updateAttribute, editPane, setEditPane, format, busy }} >
	      <div className={`${theme?.page?.container}`}>
	        <PageControls />
	        {/*{React.useMemo(() => getSectionGroups('top'),[item?.draft_section_groups])}*/}
	        <Layout 
	          navItems={menuItems} 
	          secondNav={theme?.navOptions?.secondaryNav?.navItems || []}
	          pageTheme={{navOptions: item.navOptions || {}}}
	        >
	          {React.useMemo(() => getSectionGroups('content'),[item?.draft_section_groups])}
	        </Layout>
	        {/*{React.useMemo(() => getSectionGroups('bottom'),[item?.draft_section_groups])}*/}
	        
	      </div>
	    </PageContext.Provider>
	) 
}

export default PageEdit

