import React, {useContext, useEffect} from 'react'
import { Link, useSearchParams, useLocation, useNavigate } from "react-router";
import { cloneDeep, merge } from "lodash-es"
import { useImmer } from "use-immer";
import {
    dataItemsNav, convertToUrlParams, mergeFilters,
    initNavigateUsingSearchParams, updatePageStateFiltersOnSearchParamChange
} from './_utils'
import SectionGroup from '../components/sections/sectionGroup'
import SearchButton from '../components/search'
import { PageContext, CMSContext } from '../context';
import { ThemeContext } from "../../../ui/useTheme";

function PageView ({item, dataItems, attributes, apiLoad, apiUpdate, reqPermissions, format,busy}) {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams();
    const { search } = useLocation()

    const {theme: fullTheme} = useContext(ThemeContext);
    const { UI, Menu, baseUrl, patternFilters=[], isUserAuthed } = React.useContext(CMSContext) || {};
    const [pageState, setPageState] = useImmer({ ...item, filters: mergeFilters(item?.filters, patternFilters) });

    const {Layout} = UI;
    let theme = merge(cloneDeep(fullTheme), item?.theme || {})

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])

    const menuItemsSecondNav = React.useMemo(() => {
        let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,false)
        return items
    }, [theme?.navOptions?.secondaryNav?.navItems])

    useEffect(() => {
        updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
    }, [searchParams]);

    useEffect(() => {
        initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item, isView: true})
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
                navigate(`${baseUrl}/${item.url_slug}${url}`)
            }
        }
    }

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

    if(!item) { item = {} }// create a default item to set up first time experience.

    if(pageState?.authPermissions && typeof pageState.authPermissions === 'string' && !isUserAuthed(reqPermissions, JSON.parse(pageState.authPermissions))){
        return <div>You do not have permission to view this page. <Link to={baseUrl}>Click here to visit Home</Link></div>
    }

    return (
        <PageContext.Provider value={{ item, pageState, setPageState, updatePageStateFilters, dataItems, apiLoad, apiUpdate, format, busy }} >
            <div className={`${theme?.page?.container}`}>
                {getSectionGroups('top')}
                <Layout
                    navItems={menuItems}
                    secondNav={menuItemsSecondNav}
                    pageTheme={{navOptions: item.navOptions || {}}}
                    Menu={Menu}
                    SearchButton={SearchButton}
                >
                    {getSectionGroups('content')}
                </Layout>
                {getSectionGroups('bottom')}
            </div>
        </PageContext.Provider>

    )

}


export default PageView

