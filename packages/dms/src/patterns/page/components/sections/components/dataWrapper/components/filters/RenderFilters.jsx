import React, { useCallback, useEffect, useMemo, useState } from "react";
import { isEqual } from "lodash-es"
import { PageContext, ComponentContext } from "../../../../../../context";
import { getFilters } from "./utils"
import { loadFilterOptions, filterOptionsKey } from "./loadFilterOptions";
import { RenderFilterValueSelector } from "./Components/RenderFilterValueSelector";
import { ThemeContext, getComponentTheme } from "../../../../../../../../ui/useTheme";
import { filterTheme } from "./RenderFilters.theme";

const filterValueDelimiter = '|||';
// how recent preloaded option lists must be to stand in for the first load (as PRELOAD_FRESH_MS, useDataLoader.js)
const PRELOADED_OPTIONS_FRESH_MS = 120000;

const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
}
export const RenderFilters = ({ isEdit, defaultOpen = true }) => {
    const {state, setState, apiLoad} = React.useContext(ComponentContext) || {};
    const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, filters: {...filterTheme, ...getComponentTheme(themeFromContext, 'filters', state?.display?.filterStyle)}}
    const { Icon, Button } = UI;
    const { pageState, updatePageStateFilters } = React.useContext(PageContext) || {}; // page to extract page filters
    const [open, setOpen] = useState(defaultOpen);
    // Option lists the page loader read for this page load (api/preloadSectionData.js, `display.filterOptions`:
    // { key, at, options }). Used in place of the first load while the filters they were read for still
    // stand (the key); a copy saved with the section's settings carries an old time and is not used.
    const [preloadedOptions] = useState(() => {
        const p = state?.display?.filterOptions;
        return !isEdit && p?.key && Array.isArray(p.options) && Math.abs(Date.now() - Number(p.at)) < PRELOADED_OPTIONS_FRESH_MS ? p : null;
    });
    const [filterOptions, setFilterOptions] = useState(() => preloadedOptions?.options || []); // [{column, uniqValues}]
    const loadedOnceRef = React.useRef(false);
    const [loading, setLoading] = useState(false);
    const isDms = state.externalSource?.isDms;
    const filterColumnsToTrack = useMemo(() => (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && !isDuplicate), [state.columns]);
    const filterValuesToTrack = useMemo(() =>
        (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && filters?.[0]?.values?.length && !isDuplicate).reduce((acc, f) => {acc.push(f.filters[0].values); return acc;}, []), [state.columns]);
    const filters = useMemo(() => getFilters(filterColumnsToTrack), [filterColumnsToTrack]);

    const debug = false;
    const filterWithSearchParamKeys = useMemo(() =>
        Object.keys(filters).reduce((acc, filterColumn) => {
            const currFilters = (state.columns || []).find(c => c.name === filterColumn)?.filters; // for now, it's always just 1 filter.
            if (filters[filterColumn] && currFilters?.[0]?.usePageFilters) {
                acc[currFilters?.[0]?.searchParamKey] = filters[filterColumn];
            }
            return acc;
        }, {}),
        [filters]);

    useEffect(() => {
        // this component simply accepts page filters if available,
        // and updates the page filters if a filter using 'search(page)params' changes.
        // the relationship to search params shifts to page params at this level. and page is the only place search params are synced

        // ======================== filter preference:
        // pattern level filter: mutable / immutable
        // page level filter: inherits pattern filter;
        //                    sync with search params if enabled
        // component level filter: inherits page filter;
        //                         sync with page level filter if enabled.
        // if any filter is synced, changes should propagate both ways.
        const pageFilters = (pageState?.filters || []).reduce((acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {});
        const hasMatchingFilters = (state.columns || []).some(c => {
            const hasFiltersToUpdate = (c.filters || []).some(f => {
                if(!f.usePageFilters) return false;

                const tmpValue = Array.isArray(pageFilters[f.searchParamKey]) ? pageFilters[f.searchParamKey] : [pageFilters[f.searchParamKey]];
                return !isEqual(f.values, tmpValue)
            })

            return hasFiltersToUpdate;
        })
        // Extract filters from the URL
        // If searchParams have changed, they should take priority and update the state
        if (Object.keys(pageFilters).length && hasMatchingFilters) {
            setState(draft => {
                (draft.columns || []).forEach(column => {
                    if (column.filters?.length) {
                        // filter can be either internal or external. and one of the operations
                        column.filters.forEach((filter) => {
                            const tmpValue = pageFilters[filter.searchParamKey]
                            const pageFilterValues = !tmpValue ? [] : Array.isArray(tmpValue) ? tmpValue : [tmpValue];
                            if (filter.usePageFilters && pageFilterValues && !isEqual(filter.values, pageFilterValues)) {
                                filter.values = pageFilterValues;
                            }
                        })
                    }
                });
                if(draft.display){
                    draft.display.readyToLoad = true;
                }
            });
        }
    }, [filters, pageState?.filters]);

    useEffect(() => {
        if (preloadedOptions && preloadedOptions.key === filterOptionsKey(state, isEdit)) {
            if (!isEqual(preloadedOptions.options, filterOptions)) setFilterOptions(preloadedOptions.options);
            return;
        }
        // fetch filter data
        async function load() {
            loadedOnceRef.current = true;
            setLoading(true);
            const fetchedFilterData = await loadFilterOptions({ state, apiLoad, isEdit });

            debug && console.log('debug filters: filter data use effect', fetchedFilterData)
            if(!isEqual(fetchedFilterData, filterOptions)){
                setFilterOptions(fetchedFilterData)
                setLoading(false);
            }else{
                setLoading(false)
            }
        }

        // the debounce collects quick changes; the first load has none to collect
        const timeoutId = setTimeout( () => load(), loadedOnceRef.current ? 300 : 0);
        return () => {
            clearTimeout(timeoutId)
            setLoading(false);
        }
    }, [filterColumnsToTrack, filterValuesToTrack]);

    // OPT-IN (display.autoSelectFirstWhenInvalid): for a CASCADING filter — one whose options are
    // narrowed by another filter (e.g. Direction narrowed by Corridor) — when the parent changes and
    // the reloaded options no longer contain this filter's selected value, the selection goes stale
    // and the dependent viz breaks (empty). This auto-corrects the page var to the first valid option.
    // Off by default → no behavior change for existing filters. Uses updatePageStateFilters (the same
    // search-param path a manual pick takes), so the chip + all subscribing sections update together.
    useEffect(() => {
        if (!state?.display?.autoSelectFirstWhenInvalid || typeof updatePageStateFilters !== 'function') return;
        for (const fo of (filterOptions || [])) {
            const column = (state.columns || []).find(c => c.name === fo.column);
            const filter = (column?.filters || []).find(f => f.type === 'external' && f.usePageFilters && f.searchParamKey);
            if (!filter) continue;
            const opts = (fo.uniqValues || []).map(o => String(o?.value ?? o));
            if (!opts.length) continue; // no options loaded yet — don't touch the value
            const cur = (filter.values || []).map(v => String(v?.value ?? v)).filter(Boolean);
            if (cur.length && !cur.some(v => opts.includes(v))) {
                const first = fo.uniqValues[0]?.value ?? fo.uniqValues[0];
                updatePageStateFilters([{ searchKey: filter.searchParamKey, values: [first] }]);
            }
        }
    }, [filterOptions]);

    const filterColumnsToRender = (state.columns || []).filter(column => isEdit ? column.filters?.length : (column.filters || []).find(c => c.type === 'external'));
    if (!filterColumnsToRender.length) return null;

    // initially you'll have internal filter
    // add UI dropdown to change filter type
    // add UI to change filter operation
    //console.log('filters', filterOptions)
    const gridSize = Math.min(state?.display?.gridSize || 1, filterColumnsToRender.length);
    const placement = state?.display?.placement || theme.filters.placement || 'stacked';
    const placementClass = {
        inline: theme.filters.filterSettingsWrapperInline,
        stacked: theme.filters.filterSettingsWrapperStacked
    }
    const labelWrapperClass = {
        inline: theme.filters.labelWrapperInline,
        stacked: theme.filters.labelWrapperStacked
    }
    const rowClass = placement === 'inline'
        ? theme.filters.conditionRowInline
        : theme.filters.conditionRowStacked;

    const toggleButton = (
        <div className={theme.filters.toggleButton}>
            <Button activeStyle='iconTool' title={'Filter'} onClick={() => setOpen(o => !o)}>
                <Icon icon={'Filter'} className={theme.filters.toggleIcon} />
            </Button>
        </div>
    );

    if(!open) {
        return (
            <div className={`${theme.filters.filtersWrapper} print:hidden`}>
                {toggleButton}
            </div>
        )
    }

    return (
        <div className={`${theme.filters.filtersWrapper} print:hidden`}>
            {toggleButton}
            <div className={`${theme.filters.conditionsGrid} ${gridClasses[gridSize]}`}>
                {filterColumnsToRender.map((filterColumn, i) => (
                    <div key={i} className={rowClass}>
                        <div className={labelWrapperClass[placement]}>
                            <span className={theme.filters.filterLabel}>{filterColumn.customName || filterColumn.display_name || filterColumn.name}</span>
                            {/* fixed-size CSS spinner (inherits text color via border-current) instead of
                                the variable-width word "loading…", which shifted layout / jittered.
                                `invisible` (not `hidden`) when idle: the spinner's box stays in the
                                layout permanently, so it appearing/disappearing never shifts the
                                label or re-flows the bar. */}
                            <span className={`${theme.filters.loadingSpinner || 'inline-block shrink-0 size-3 ml-1 rounded-full border-2 border-current border-t-transparent opacity-50'} ${loading ? 'animate-spin' : 'invisible'}`} aria-label="loading" role="status" />
                        </div>
                        <div className={placementClass[placement]}>
                            <RenderFilterValueSelector key={`${filterColumn.name}-filter`}
                                                       isEdit={isEdit}
                                                       filterColumn={filterColumn}
                                                       filterOptions={filterOptions}
                                                       state={state}
                                                       setState={setState}
                                                       loading={loading}
                                                       filterWithSearchParamKeys={filterWithSearchParamKeys}
                                                       delimiter={filterValueDelimiter}
                                                       columns={state.columns}
                                                       controlStyle={theme.filters.controlStyle}
                                                       theme={theme}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
