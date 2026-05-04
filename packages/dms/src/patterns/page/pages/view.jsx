import React, {useContext, useEffect, useRef} from 'react'
import { Link, useSearchParams, useLocation, useNavigate } from "react-router";
import { cloneDeep } from "lodash-es"
import { useImmer } from "use-immer";
import {
    dataItemsNav,
    nav2Level,
    convertToUrlParams,
    mergeFilters,
    initNavigateUsingSearchParams,
    updatePageStateFiltersOnSearchParamChange
} from './_utils'
import SectionGroup from '../components/sections/sectionGroup'
import { PageContext, CMSContext, DataSourceContext } from '../context';
import { ThemeContext, mergeTheme } from "../../../ui/useTheme";

function PageView ({item, dataItems: allDataItems, attributes, apiLoad, apiUpdate, reqPermissions, format,busy}) {
    //console.log('create doc', { item, dataItems: allDataItems })
    const navigate = useNavigate()
    const [searchParams] = useSearchParams();
    const { search, pathname } = useLocation()
    const pdfRef = useRef(); // To capture the section of the page to be converted to PDF
    const {theme: fullTheme, UI, getComponentTheme} = useContext(ThemeContext);
    const { Menu, baseUrl, patternFilters = [], isUserAuthed = () => true, authPermissions } = React.useContext(CMSContext) || {};
    const dataItems = allDataItems.filter(d => !d.authPermissions || isUserAuthed(reqPermissions, d.authPermissions));

    const [pageState, setPageState] = useImmer({
      ...item,
      filters: mergeFilters(item?.filters, patternFilters)
    });
    const {Layout} = UI;
    let theme = mergeTheme(fullTheme, item?.theme || {})

    if( !isUserAuthed(reqPermissions || []) ||
        (pageState?.authPermissions && !isUserAuthed(reqPermissions, pageState.authPermissions))
    ){
        return <div>You do not have permission to view this page. <Link to={baseUrl}>Click here to visit Home</Link></div>
    }

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])

    const menuItemsSecondNav = React.useMemo(() => {
        let items = dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [],baseUrl,false)
        return items
    }, [theme?.navOptions?.secondaryNav?.navItems])

    const resolveNav = React.useCallback((navDepth, navTitle) => {
        return nav2Level(menuItems, navDepth, pathname, baseUrl, navTitle)
    }, [menuItems, pathname, baseUrl])

    // React.useEffect(() => {
    //     // -------------------------------------------------------------------
    //     // -- This on load effect backfills pages created before sectionGroups
    //     // -- This should be deleted by JUNE 1 2025
    //     // -------------------------------------------------------------------
    //     //sectionsBackill(item,baseUrl,apiUpdate)

    // },[])

    useEffect(() => {
        updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
    }, [searchParams, item?.filters]);

    useEffect(() => {
        initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item, isView: true})
    }, [])

    const updatePageStateFilters = (filters, removeFilter={}) => {
        const existingPageFilters = pageState.filters || [];
        const getResolvedFilter = (filter) => {
            const matchingFilter = existingPageFilters.find(f => f.searchKey === filter.searchKey);
            return {
                ...(matchingFilter || {}),
                ...filter,
                useSearchParams: matchingFilter?.useSearchParams ?? filter.useSearchParams ?? false
            };
        };

        const resolvedFilters = filters.map(getResolvedFilter);
    const searchParamFilters = resolvedFilters.filter(f => f.useSearchParams && !removeFilter[f.searchKey]);
    // set non navigable filters
    const searchKeysToRemove = Object.keys(removeFilter).filter(searchKey => removeFilter[searchKey])
    if(resolvedFilters?.length || searchKeysToRemove?.length){
        setPageState(page => {
            if(!Array.isArray(page.filters)) {
                page.filters = [];
            }
            resolvedFilters.forEach(f => {
                const idx = page.filters.findIndex(({searchKey}) => searchKey === f.searchKey);
                if(idx >= 0) {
                    page.filters[idx] = {
                            ...page.filters[idx],
                            ...f
                        };
                    } else {
                        page.filters.push(f);
                    }
                })

                searchKeysToRemove.forEach(sk => {
                    const idx = page.filters.findIndex(({searchKey}) => searchKey === sk);
                    if(idx >= 0) {
                        page.filters[idx].values = [];
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

  const dataSourceActions = React.useMemo(() => ({
      dataSources: item.dataSources || {},
      setDataSource: () => {},
      removeDataSource: () => {},
      createDataSource: () => {},
  }), [item.dataSources]);

  return (
      <DataSourceContext.Provider value={dataSourceActions}>
      <PageContext.Provider
        value={{ item, pageState, setPageState, updatePageStateFilters, dataItems, apiLoad, apiUpdate, format, busy, baseUrl }}
      >
        <ThemeContext.Provider value={{theme, UI, getComponentTheme}}>
          <Layout
              navItems={menuItems}
              resolveNav={resolveNav}
              secondNav={menuItemsSecondNav}
              headerChildren={getSectionGroups('top')}
              footerChildren={getSectionGroups('bottom')}
          >
              {getSectionGroups('content')}
          </Layout>
        </ThemeContext.Provider>
      </PageContext.Provider>
      </DataSourceContext.Provider>

  )
}


export default PageView
