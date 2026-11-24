import React, { useEffect } from 'react'
import { useSearchParams, useLocation, useNavigate } from "react-router";
import { useImmer } from "use-immer";
import {
    buildSearchString,
    getPageVariableRegistry,
    resolveClearedPageVariables,
    initNavigateUsingSearchParams,
    updatePageStateFiltersOnSearchParamChange
} from './_utils'

/**
 * A view page's page state: its page variables (filters), kept in step with the URL's search params,
 * and the setters sections reach through PageContext. Used by the page view (view.jsx) and by the islands
 * path's section islands (render/islands/SectionIslands.jsx), which rebuild PageContext in the browser
 * around the sections that stay live on a server-rendered page.
 *
 * @param {object} o
 * @param {object} o.item            the page row
 * @param {Array}  o.patternFilters  the pattern's page variables (CMSContext.patternFilters)
 * @param {string} o.baseUrl
 * @param {boolean} o.syncUrl        false for a link page (`nav_link`): it never writes its variables to the URL
 */
export function usePageViewState({ item, patternFilters = [], baseUrl, syncUrl = true }) {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams();
    const { search } = useLocation()

    const [pageState, setPageState] = useImmer({
      ...item,
      filters: getPageVariableRegistry(item, patternFilters)
    });

    useEffect(() => {
        updatePageStateFiltersOnSearchParamChange({searchParams, item, patternFilters, setPageState})
        // Depend on item?.id, not just item?.filters: a page's DERIVED page vars
        // (e.g. a map section's `layers`) come from item.sections, and item.filters
        // is usually undefined — so on SPA navigation to such a page this URL→state
        // mapping must re-run when the item itself resolves, or the params never
        // register (they only worked on a full reload, where the item is present at
        // mount). item?.sections?.length also covers sections arriving after the id.
    }, [searchParams, item?.id, item?.filters, item?.sections?.length]);

    useEffect(() => {
        // A link page never syncs its own page variables into the URL. It may still
        // carry `filters` from whatever it was before it became a link (the MitigateNY
        // county Actions Dashboard kept 12 url-bound variables), and this effect
        // navigates to `${baseUrl}/${item.url_slug}?<params>` — which lands straight
        // back on the link page and cancels the <Navigate> below, so the redirect
        // silently never happened.
        if (!syncUrl) return;
        initNavigateUsingSearchParams({pageState, search, navigate, baseUrl, item, isView: true})
    }, [])

    const setActionParam = React.useCallback((key, value) => {
        setPageState(draft => {
            const existing = draft.filters.find(f => f.searchKey === key && f.type === 'action');
            const arrayValue  = Array.isArray(value) ? value : [value];
            if (existing) {
                existing.values = arrayValue;
            } else {
                draft.filters.push({ searchKey: key, values: arrayValue, useSearchParams: false, type: 'action' });
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
        // A cleared URL-bound variable with a registered default resets to that default instead of
        // emptying (see resolveClearedPageVariables) — rewrite those keys as a set-to-default.
        const resets = resolveClearedPageVariables(removeFilter, pageState.filters, getPageVariableRegistry(item, patternFilters));
        const resetKeys = Object.keys(resets);
        if(resetKeys.length){
            filters = [...filters.filter(f => !resets[f.searchKey]), ...resetKeys.map(searchKey => ({searchKey, values: resets[searchKey]}))];
            removeFilter = Object.fromEntries(Object.entries(removeFilter).filter(([searchKey]) => !resets[searchKey]));
        }
        const searchParamFilters = pageState.filters.filter(f => f.useSearchParams && !removeFilter[f.searchKey]).map(f => filters.find(updatedFilter => updatedFilter.searchKey === f.searchKey) || f)
        const nonSearchParamFilters = filters
            .filter(({searchKey}) => {
                const matchingFilter = (pageState.filters || []).find(f => f.searchKey === searchKey);
                return matchingFilter && !matchingFilter.useSearchParams
            })
        // set non navigable filters
        const searchKeysToRemove = Object.keys(removeFilter).filter(searchKey => removeFilter[searchKey])
        if(nonSearchParamFilters?.length || searchKeysToRemove?.length || resetKeys.length){
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

                // Written even when the URL already carries the default (so there is no navigation and no
                // URL→pageState pass): the clearing control has already emptied its own leaf and only
                // re-syncs from a pageState.filters change (usePageFilterSync). A fresh array guarantees one.
                resetKeys.forEach(sk => {
                    const idx = page.filters.findIndex(({searchKey}) => searchKey === sk);
                    if(idx >= 0) {
                        page.filters[idx].values = [...resets[sk]];
                    }
                })
            })
        }

        // navigate (always: an emptied URL-bound variable leaves the URL too)
        const filtersObject = searchParamFilters
            .reduce((acc, curr) => ({...acc, [curr.searchKey]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {});
        const url = buildSearchString(filtersObject);
        if(url !== search){
            navigate(`${baseUrl}/${item.url_slug}${url}`)
        }
    }

    return { pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam }
}
