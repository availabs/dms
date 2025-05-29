import React, {useEffect, useRef} from 'react'
import { Link, useSubmit, useSearchParams, useLocation, useNavigate } from "react-router";
import { cloneDeep, merge } from "lodash-es"
// -- 
import { /*sectionsBackill,*/ 
    dataItemsNav, 
    convertToUrlParams,
    mergeFilters,
    initNavigateUsingSearchParams,
    updatePageStateFiltersOnSearchParamChange 
} from './_utils'


//import {PDF, PencilEditSquare, Printer} from '../ui/icons'
//import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";
import {useImmer} from "use-immer";
import { PageContext, CMSContext } from '../context'




function PageView ({item, dataItems, attributes, logo, rightMenu, siteType, apiLoad, apiUpdate, format,busy}) {
    
    const submit = useSubmit()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams();
    let { baseUrl, theme, patternFilters=[], user, API_HOST } = React.useContext(CMSContext) || {}
    const [pageState, setPageState] =
        useImmer({
            ...item,
            filters: mergeFilters(item?.filters, patternFilters)
        });
    const { search } = useLocation()

    if(!item) { item = {} }// create a default item to set up first time experience.

    // React.useEffect(() => {
    //     // -------------------------------------------------------------------
    //     // -- This on load effect backfills pages created before sectionGroups
    // /     // -- This should be deleted by JUNE 1 2025
    //     // -------------------------------------------------------------------
    //     //sectionsBackill(item,baseUrl,submit)
    //   
    // },[])

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
                navigate(`${baseUrl}/edit/${item.url_slug}${url}`)
            }
        }
    }


    
    let { baseUrl, theme, user, API_HOST } = React.useContext(CMSContext) || {}
      //let pageTheme = {page: {container: `bg-[linear-gradient(0deg,rgba(33,52,64,.96),rgba(55,87,107,.96)),url('/themes/mny/topolines.png')] bg-[size:500px] pb-[4px]`}}
    theme = merge(cloneDeep(theme), item?.theme || {})

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])

    const menuItemsSecondNav = React.useMemo(() => {
    let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,false)
    return items
  }, [theme?.navOptions?.secondaryNav?.navItems])

  
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
      <PageContext.Provider value={{ item, pageState, setPageState, updatePageStateFilters, dataItems, apiLoad, apiUpdate, format, busy }} >
        <div className={`${theme?.page?.container}`}>
          {getSectionGroups('top')}
          <Layout 
            navItems={menuItems} 
            secondNav={menuItemsSecondNav}
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

