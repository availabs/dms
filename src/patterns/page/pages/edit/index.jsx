import React, {useEffect} from 'react';
import { Link, useNavigate, useLocation, useSearchParams} from "react-router";
import {cloneDeep, merge} from "lodash-es";
import {useImmer} from "use-immer";
import { ThemeContext } from "../../../../ui/useTheme";
import { CMSContext, PageContext } from '../../context'
import {
    sectionsEditBackill, dataItemsNav, mergeFilters, detectNavLevel, getInPageNav,
    convertToUrlParams, updatePageStateFiltersOnSearchParamChange, initNavigateUsingSearchParams, getPageAuthPermissions
} from '../_utils'
import SectionGroup from '../../components/sections/sectionGroup'
import SearchButton from '../../components/search'
import PageControls from './editPane'

function PageEdit ({format, item, dataItems: allDataItems, updateAttribute, attributes, apiLoad, apiUpdate, reqPermissions, busy}) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { pathname = '/edit', search } = useLocation();

	const { theme: fullTheme, UI } = React.useContext(ThemeContext);
	const {  Menu, baseUrl, user, patternFilters=[], isUserAuthed } = React.useContext(CMSContext) || {};
    const dataItems = allDataItems.filter(d => !d.authPermissions || isUserAuthed(reqPermissions, d.authPermissions));

	const [ pageState, setPageState ] = useImmer({ ...item, filters: mergeFilters(item.filters, patternFilters) });
	const [ editPane, setEditPane ] = React.useState({ open: false, index: 1, showGrid: false });

	const { Layout } = UI;
	const theme = merge(cloneDeep(fullTheme), item?.theme || {});
	// console.log('edit theme merge', fullTheme.layout, item.theme, theme.layout)

	const menuItems = React.useMemo(() => dataItemsNav(dataItems,baseUrl,true), [dataItems]);

	const menuItemsSecondNav = React.useMemo(() => {
		let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,true)
		return items
	}, [theme?.navOptions?.secondaryNav?.navItems])

	// console.log('-----------render edit----------------', item.draft_sections.length, item.draft_section_groups.length)

	// const level = item?.index == '999' || theme?.navOptions?.topNav?.nav !== 'main' ? 1 : detectNavLevel(dataItems, baseUrl);
	// const inPageNav = getInPageNav(item, theme);
	// const sectionAttr = attributes?.['sections']?.attributes || {}

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
			sectionsEditBackill(item,baseUrl,apiUpdate, search)
		}

	},[])


	useEffect(() => {
		updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
	}, [searchParams]);

	useEffect(() => {
		initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item})
	}, [])

	const updatePageStateFilters = (filters, removeFilter={}) => {
		const searchParamFilters = pageState.filters.filter(f => f.useSearchParams && !removeFilter[f.searchKey]).map(f => filters.find(updatedFilter => updatedFilter.searchKey === f.searchKey) || f)
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
		if(searchParamFilters?.length || true){
			const filtersObject = searchParamFilters
				.reduce((acc, curr) => ({...acc, [curr.searchKey]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {});
			const url = `?${convertToUrlParams(filtersObject)}`;
			if(url !== search){
				navigate(`${baseUrl}/edit/${item.url_slug}${url}`)
			}
		}
	}

	const getSectionGroups =  ( sectionName ) => {
		return (item?.draft_section_groups || [])
			.filter((g,i) => g.position === sectionName)
			.sort((a,b) => a?.index - b?.index)
			.map((group,i) => (
				<SectionGroup
					key={group?.name || i}
					group={group}
					attributes={ attributes }
					edit={true}
				/>
			))
	}

	if(!item) return <div>page does not exist.</div>;

    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
	if( !isUserAuthed(reqPermissions) || !isUserAuthed(reqPermissions, pageAuthPermissions) ){
		return <div>You do not have permission to view this page. <Link to={baseUrl}>Click here to visit Home</Link></div>
	}

	return (
		<PageContext.Provider value={{
			item,
			pageState,
			setPageState,
			updatePageStateFilters,
			dataItems,
			apiLoad, apiUpdate,
			updateAttribute,
			editPane, setEditPane,
			format,
			busy,
      baseUrl
		}}>
			<ThemeContext.Provider value={{theme, UI}}>
				<PageControls />
				<Layout
              navItems={menuItems}
              secondNav={menuItemsSecondNav}
              headerChildren={React.useMemo(() => getSectionGroups('top'),[item?.draft_section_groups])}
              footerChildren={React.useMemo(() => getSectionGroups('bottom'),[item?.draft_section_groups])}
          >
            {React.useMemo(() => getSectionGroups('content'),[item?.draft_section_groups])}
        </Layout>
			</ThemeContext.Provider>
		</PageContext.Provider>
	)
}

export default PageEdit
