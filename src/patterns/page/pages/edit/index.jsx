import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router";
import {cloneDeep, isEqual, merge} from "lodash-es"
import { v4 as uuidv4 } from 'uuid';


import {sectionsEditBackill, getInPageNav, dataItemsNav, detectNavLevel, json2DmsForm} from '../_utils'

import { Layout, SectionGroup } from '../../ui'
import { PageContext } from '../view'

import { CMSContext } from '../../siteConfig'
import PageControls from './editPane'
import {Footer} from "../../ui/dataComponents/selector/ComponentRegistry/footer";
import {useSearchParams} from "react-router";
import {useImmer} from "use-immer";

const parseIfJSON = (text, fallback={}) => {
	try {
		if(typeof text !== 'string' || !text) return fallback;
		return JSON.parse(text)
	}catch (e){
		return fallback;
	}
}

export const mergeFilters = (pageFilters=[], patternFilters=[]) => {
	// patternFilters should take over if present

	const pageFiltersFormatted = parseIfJSON(pageFilters, pageFilters || []);
	const patternFiltersFormatted = (patternFilters || []);
	const pageOnlyFilters = pageFiltersFormatted.filter(f => !patternFiltersFormatted.some(patternF => patternF.searchKey === f.searchKey));
	return [...patternFiltersFormatted, ...pageOnlyFilters]
}
export const convertToUrlParams = (obj, delimiter='|||') => {
	const params = new URLSearchParams();

	Object.keys(obj).forEach(column => {
		const values = obj[column];
		if(!values || !Array.isArray(values) || !values?.length) return;
		params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
	});

	return params.toString();
};

export const updatePageStateFiltersOnSearchParamChange = ({searchParams, item, patternFilters, setPageState}) => {
	// Extract filters from the URL
	const urlFilters = Array.from(searchParams.keys()).reduce((acc, searchKey) => {
		const urlValues = searchParams.get(searchKey)?.split('|||');
		acc[searchKey] = urlValues;
		return acc;
	}, {});

	// If searchParams have changed, they should take priority and update the state

	if (Object.keys(urlFilters).length) {
		const existingFilters = mergeFilters(item.filters, patternFilters);
		const newFilters = (existingFilters || []).map(filter => {
			if(filter.useSearchParams && urlFilters[filter.searchKey]){
				return {...filter, values: urlFilters[filter.searchKey]}
			}else{
				return filter;
			}
		})

		if(newFilters?.length){
			setPageState(page => {
				// updates from searchParams are temporary
				page.filters = newFilters
			})
		}
	}
}

export const initNavigateUsingSearchParams = ({pageState, search, navigate, baseUrl, item, isView}) => {
	// one time redirection
	const searchParamFilters = (pageState?.filters || []).filter(f => f.useSearchParams);
	if(searchParamFilters?.length){
		const filtersObject = searchParamFilters
			.reduce((acc, curr) => ({...acc, [curr.searchKey]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {});
		const url = `?${convertToUrlParams(filtersObject)}`;
		if(!search && url !== search){
			navigate(`${baseUrl}${isView ? `/` : `/edit/`}${item.url_slug}${url}`)
		}
	}
}
function PageEdit ({
  format, item, dataItems, updateAttribute, attributes, setItem, apiLoad, apiUpdate, status, navOptions, busy
}) {
	// console.log('props in pageEdit', siteType)
	const navigate = useNavigate()
	const [searchParams] = useSearchParams();
	const submit = useSubmit()
	const { pathname = '/edit', search } = useLocation()
	let { baseUrl, user, theme, patternFilters=[] } = React.useContext(CMSContext) || {}
	const [ editPane, setEditPane ] = React.useState({ open: false, index: 1, showGrid: false })
	const [pageState, setPageState] =
		useImmer({
			...item,
			filters: mergeFilters(item.filters, patternFilters)
		});

	const menuItems = React.useMemo(() => {
	    let items = dataItemsNav(dataItems,baseUrl,true)
	    return items
	}, [dataItems])


	const menuItemsSecondNav = React.useMemo(() => {
		let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,true)
		return items
	}, [theme?.navOptions?.secondaryNav?.navItems])

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
	  		sectionsEditBackill(item,baseUrl,submit, search)
	  	}
	   
	},[])


	useEffect(() => {
		updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
	}, [searchParams]);

	useEffect(() => {
		initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item})
	}, [])

	const updatePageStateFilters = (filters) => {
		const searchParamFilters = pageState.filters.filter(f => f.useSearchParams).map(f => filters.find(updatedFilter => updatedFilter.searchKey === f.searchKey) || f)
		const nonSearchParamFilters = filters
			.filter(({searchKey}) => {
				const matchingFilter = (pageState.filters || []).find(f => f.searchKey === searchKey);
				return matchingFilter && !matchingFilter.useSearchParams
			})
		// set non navigable filters
		if(nonSearchParamFilters?.length){
			setPageState(page => {
				nonSearchParamFilters.forEach(f => {
					const idx = page.filters.findIndex(({searchKey}) => searchKey === f.searchKey);
					if(idx >= 0) {
						page.filters[idx].values = f.values;
					}
				})
			})
		}

		// navigate
		if(searchParamFilters?.length){
			const filtersObject = searchParamFilters
				.reduce((acc, curr) => ({...acc, [curr.searchKey]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {});
			const url = `?${convertToUrlParams(filtersObject)}`;
			if(url !== search){
				navigate(`${baseUrl}/edit/${item.url_slug}${url}`)
			}
		}
	}


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
	    <PageContext.Provider value={{ item, pageState, setPageState, updatePageStateFilters, dataItems, apiLoad, apiUpdate, updateAttribute, editPane, setEditPane, format, busy }} >
	      <div className={`${theme?.page?.container}`}>
	        <PageControls />
	        {React.useMemo(() => getSectionGroups('top'),[item?.draft_section_groups])}
	        <Layout 
	          navItems={menuItems} 
	          secondNav={menuItemsSecondNav}
	          pageTheme={{navOptions: item.navOptions || {}}}
	        >
	          {React.useMemo(() => getSectionGroups('content'),[item?.draft_section_groups])}
	        </Layout>
	        {React.useMemo(() => getSectionGroups('bottom'),[item?.draft_section_groups])}
	        
	      </div>
	    </PageContext.Provider>
	) 
}

export default PageEdit

