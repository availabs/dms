import React, { useCallback, useEffect, useMemo, useState } from "react";
import { isEqual, uniqBy } from "lodash-es"
import { PageContext, ComponentContext } from "../../../../../../context";
import { attributeAccessorStr, isJson } from "../../utils/utils";
import {
    getData,
    parseIfJson,
    getFilters,
    isCalculatedCol,
    formattedAttributeStr,
    getNormalFilters, getData as getFilterData, isSystemCol
} from "./utils"
import { RenderFilterValueSelector } from "./Components/RenderFilterValueSelector";
import { ThemeContext, getComponentTheme } from "../../../../../../../../ui/useTheme";
import { filterTheme } from "./RenderFilters.theme";

const filterValueDelimiter = '|||';

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
    const [filterOptions, setFilterOptions] = useState([]); // [{column, uniqValues}]
    const [loading, setLoading] = useState(false);
    const isDms = state.externalSource?.isDms;
    const filterColumnsToTrack = useMemo(() => (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && !isDuplicate), [state.columns]);
    const filterValuesToTrack = useMemo(() =>
        (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && filters?.[0]?.values?.length && !isDuplicate).reduce((acc, f) => {acc.push(f.filters[0].values); return acc;}, []), [state.columns]);
    const normalFilterColumnsToTrack = useMemo(() => (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && isDuplicate), [state.columns]);
    const filters = useMemo(() => getFilters(filterColumnsToTrack), [filterColumnsToTrack]);
    const normalFilters = useMemo(() => getNormalFilters(normalFilterColumnsToTrack), [normalFilterColumnsToTrack]);

    const debug = false;
    const getFormattedAttributeStr = useCallback((column) => formattedAttributeStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);
    const getAttributeAccessorStr = useCallback((column) => attributeAccessorStr(column, isDms, isCalculatedCol(column, state.columns), isSystemCol(column, state.columns)), [state.columns, isDms]);
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
        // fetch filter data
        async function load() {
            setLoading(true);
            const fetchedFilterData = await Promise.all(
                [...Object.keys(filters), ...normalFilters?.map(f => f.column)]
                    // don't pull filter data for internal filters in view mode
                    .filter(f => {
                        const filter = (state.columns || []).find(({ name }) => name === f)?.filters?.[0];

                        if (['gt', 'gte', 'lt', 'lte', 'like'].includes(filter.operation)) return false; // never load numerical data
                        if (isEdit) return true;
                        if (filter?.type === 'external') return true;
                    })
                    .map(async columnName => {
                        // STATIC options: a column may carry an author-provided `options`
                        // [{value,label}] list (e.g. months with no real DB column) — use it
                        // directly and skip the DB query. Opt-in; no impact on data-driven filters.
                        const staticCol = (state.columns || []).find(c => c.name === columnName);
                        if (Array.isArray(staticCol?.options) && staticCol.options.length) {
                            return { column: columnName, uniqValues: staticCol.options.map(o => ({ label: o.label ?? o.value, value: o.value })) };
                        }
                        // other filter values to filter by

                        const filterBy = await Object.keys(filters)
                            .filter(f => f !== columnName)
                            .reduce(async (accPromise, columnName) => {
                                const acc = await accPromise;

                                const filterColumn = (state.columns || []).find(({ name }) => name === columnName);
                                const filter = filterColumn?.filters?.[0];
                                if (!filter?.values?.length) return acc;

                                if (filterColumn.type === 'multiselect') {
                                    const reqName = getFormattedAttributeStr(columnName);
                                    const options = await getFilterData({
                                        reqName,
                                        refName: getAttributeAccessorStr(columnName),
                                        allAttributes: [filterColumn],
                                        apiLoad,
                                        format: state.externalSource,
                                    });

                                    const selectedValues = filter.values
                                        .map(o => o?.value || o)
                                        .map(o => o === null ? 'null' : o)
                                        .filter(o => o);

                                    const matchedOptions = options
                                        .map(row => {
                                            const option = row[reqName]?.value || row[reqName];
                                            const parsedOption =
                                                isJson(option) && Array.isArray(JSON.parse(option)) ? JSON.parse(option) :
                                                    Array.isArray(option) ? option :
                                                        typeof option === 'string' ? [option] : [];
                                            return parsedOption.find(o => selectedValues.includes(o)) ? option : null;
                                        })
                                        .filter(option => option);

                                    acc[filter.operation] = {
                                        ...(acc[filter.operation] || {}),
                                        [getAttributeAccessorStr(columnName)]: matchedOptions
                                    };
                                } else {
                                    const values = ['gt', 'gte', 'lt', 'lte', 'like'].includes(filter.operation) ? filter.values[0] : filter.values;
                                    acc[filter.operation] = {
                                        ...(acc[filter.operation] || {}),
                                        [getAttributeAccessorStr(columnName)]: values
                                    };
                                }

                                return acc;
                            }, Promise.resolve({}));

                        // get all the filters with value
                        // build a filterOptions object including each filter type (filter, exclude, gt, gte...),
                        // for filter and exclude types, and multiselect column combination, pull value sets for
                        // optional per-column option ordering by an aggregate (e.g. busiest-first by
                        // sum(aadt)); when set, the query orders the options and we keep that order.
                        const optionOrderBy = (state.columns || []).find(c => c.name === columnName)?.optionOrderBy;
                        let data = await getData({
                            format: state.externalSource,
                            apiLoad,
                            // length,
                            reqName: getFormattedAttributeStr(columnName), // column name with as
                            refName: getAttributeAccessorStr(columnName), // column name without as
                            rawName: columnName, // column name without accessor (response name)
                            allAttributes: state.columns,
                            filterBy,
                            orderBy: optionOrderBy
                        })

                        // console.log('fo data?', columnName, data)

                        // not adding options from meta to allow options to filter down wrt other filter values
                        const metaOptions = [] //(state.columns || []).find(({name}) => name === columnName)?.options;
                        const formattedAttrStr = getFormattedAttributeStr(columnName);

                        const dataOptions = data.reduce((acc, d, i) => {

                            const responseValue = d[formattedAttrStr]?.value || d[formattedAttrStr];

                            const metaValue = parseIfJson(responseValue?.value || responseValue);

                            const originalValue = parseIfJson(responseValue?.originalValue || responseValue);

                            const value = Array.isArray(originalValue)
                                ? originalValue.map((pv, i) => ({ label: metaValue?.[i] || pv, value: pv }))
                                : [{ label: metaValue || originalValue, value: originalValue }];
                            value.forEach(({ label, value }) => { if (label && typeof label !== 'object') acc.push({ label, value }); });
                            return acc;
                        }, []);
                        debug && console.log('debug filters: data', data)
                        const uniq = uniqBy(Array.isArray(metaOptions) ? [...metaOptions, ...dataOptions] : dataOptions, d => d.value);
                        return {
                            column: columnName,
                            // optionOrderBy → preserve the query's aggregate order (uniqBy keeps first-seen
                            // order); otherwise the default alphabetical/numeric sort.
                            // numeric:true = NATURAL sort, so numbered labels order by value
                            // ("Region 2" before "Region 10" — plain localeCompare put 10/11
                            // between 1 and 2). Identical to alphabetical for unnumbered labels.
                            uniqValues: optionOrderBy ? uniq : uniq.sort((a, b) =>
                                typeof a?.label === 'string' && typeof b?.label === 'string' ?
                                    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }) :
                                    b?.label - a?.label
                            ),
                        }
                    }));

            debug && console.log('debug filters: filter data use effect', fetchedFilterData)
            if(!isEqual(fetchedFilterData, filterOptions)){
                setFilterOptions(fetchedFilterData)
                setLoading(false);
            }else{
                setLoading(false)
            }
        }

        const timeoutId = setTimeout( () => load(), 300);
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
        <Button
            className={theme.filters.toggleButton}
            onClick={() => setOpen(o => !o)}
        >
            <Icon icon={'Filter'} className={theme.filters.toggleIcon} title={'Filter'} />
        </Button>
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
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
