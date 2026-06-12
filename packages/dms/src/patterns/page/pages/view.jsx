import React, {useContext, useEffect, useRef} from 'react'
import { Link, Navigate, useSearchParams, useLocation, useNavigate } from "react-router";
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
    const { Menu, baseUrl, patternFilters = [], isUserAuthed = () => true, authPermissions, user, authBaseUrl } = React.useContext(CMSContext) || {};
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
        if (user?.isAuthenticating) return null;
        if (!user?.authed) {
            return <Navigate to={`${authBaseUrl}/login`} state={{ from: pathname + search }} replace />;
        }
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

    const setActionParam = React.useCallback((key, value) => {
        setPageState(draft => {
            const existing = draft.filters.find(f => f.searchKey === key && f.type === 'action');
            if (existing) {
                existing.values = [value];
            } else {
                draft.filters.push({ searchKey: key, values: [value], useSearchParams: false, type: 'action' });
            }
        });
    }, [setPageState]);

    const clearActionParam = React.useCallback((key) => {
        setPageState(draft => {
            const idx = draft.filters.findIndex(f => f.searchKey === key && f.type === 'action');
            if (idx !== -1) draft.filters.splice(idx, 1);
        });
    }, [setPageState]);

    const updatePageStateFilters = (filters, removeFilter={}) => {
        const searchParamFilters = pageState.filters.filter(f => f.useSearchParams && !removeFilter[f.searchKey]).map(f => filters.find(updatedFilter => updatedFilter.searchKey === f.searchKey) || f)
        const nonSearchParamFilters = filters
            .filter(({searchKey}) => {
                const matchingFilter = (pageState.filters || []).find(f => f.searchKey === searchKey);
                return matchingFilter && !matchingFilter.useSearchParams
            })
        // set non navigable filters
        const searchKeysToRemove = Object.keys(removeFilter).filter(searchKey => removeFilter[searchKey])
        if(nonSearchParamFilters?.length || searchKeysToRemove?.length){
            setPageState(page => {
                nonSearchParamFilters.forEach(f => {
                    const idx = page.filters.findIndex(({searchKey}) => searchKey === f.searchKey);
                    if(idx >= 0) {
                        page.filters[idx].values = f.values;
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

    if (item?.id === 'no-access') {
        if (user?.isAuthenticating) return null;
        if (!user?.authed) {
            return <Navigate to={`${authBaseUrl}/login`} state={{ from: pathname + search }} replace />;
        }
        return <div>You do not have permission to view this page. <Link to={baseUrl}>Click here to visit Home</Link></div>;
    }
  return (
      <DataSourceContext.Provider value={dataSourceActions}>
      <PageContext.Provider
        value={{ item, pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam, dataItems, apiLoad, apiUpdate, format, busy, baseUrl }}
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