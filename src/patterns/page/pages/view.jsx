import React, {useContext, useEffect, useRef} from 'react'
import { Link, useSubmit, useSearchParams, useLocation, useNavigate } from "react-router";
import { cloneDeep, merge } from "lodash-es"
import { useImmer } from "use-immer";

import { /*sectionsBackill,*/
    dataItemsNav,
    convertToUrlParams,
    mergeFilters,
    initNavigateUsingSearchParams,
    updatePageStateFiltersOnSearchParamChange
} from './_utils'

import SectionGroup from '../components/sections/sectionGroup'
import SearchButton from '../components/search'
//import {PDF, PencilEditSquare, Printer} from '../ui/icons'
//import {selectablePDF} from "../components/saveAsPDF/PrintWell/selectablePDF";
import { PageContext, CMSContext } from '../context';
import { ThemeContext } from "../../../ui/useTheme";


function PageView(props) {
  // console.log('PageView Props', props)
  const { item, dataItems, attributes, logo, rightMenu, siteType, apiLoad, apiUpdate, format, busy } = props
  const navigate = useNavigate()
  const [searchParams] = useSearchParams();
  const { theme: fullTheme, UI = {} } = useContext(ThemeContext) || {};
  const { Menu, baseUrl, patternFilters=[], user, API_HOST } = React.useContext(CMSContext) || {};
  console.log('pageview UI', UI)
  const { Layout = () => <></> } = UI;
  const [pageState, setPageState] =
    useImmer({
        ...item,
        filters: mergeFilters(item?.filters, patternFilters)
    });
  const { search } = useLocation()
  const pdfRef = useRef(); // To capture the section of the page to be converted to PDF

  let theme = merge(cloneDeep(fullTheme), item?.theme || {})


    //console.log('item', item)
    if(!item) { item = {} }// create a default item to set up first time experience.

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])


    const menuItemsSecondNav = React.useMemo(() => {
        let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,false)
        return items
    }, [theme?.navOptions?.secondaryNav?.navItems])
    React.useEffect(() => {
        // -------------------------------------------------------------------
        // -- This on load effect backfills pages created before sectionGroups
        // -- This should be deleted by JUNE 1 2025
        // -------------------------------------------------------------------
        //sectionsBackill(item,baseUrl,apiUpdate)

    },[])

    useEffect(() => {
        updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
    }, [searchParams]);

    useEffect(() => {
        initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item, isView: true})
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

  return (
      <PageContext.Provider value={{ item, pageState, setPageState, updatePageStateFilters, dataItems, apiLoad, apiUpdate, format, busy }} >
        <Layout
            navItems={menuItems}
            secondNav={menuItemsSecondNav}
            pageTheme={{navOptions: item.navOptions || {}}}
            Menu={Menu}
            SearchButton={SearchButton}
            headerChildren={getSectionGroups('top')}
            footerChildren={getSectionGroups('bottom')}
        >
            {getSectionGroups('content')}
        </Layout>
      </PageContext.Provider>

  )
}


export default PageView
