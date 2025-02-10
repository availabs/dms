import React, {memo, useCallback, useEffect, useMemo, useState} from "react";
import dataTypes from "../../../../../../../../data-types";
import {attributeAccessorStr} from "../../spreadsheet/utils/utils";
import {Filter} from "../../../../../icons";
import {getData, parseIfJson, getFilters, isCalculatedCol, convertToUrlParams, formattedAttributeStr} from "./utils"
import {isEqual, mergeWith, uniq, uniqBy} from "lodash-es"
import {RenderFilterValueSelector} from "./Components/RenderFilterValueSelector";
import {useNavigate, useSearchParams} from "react-router-dom";

const filterValueDelimiter = '|||';
// filters don't use context as it's intended to be reusable
// filters need to be retrieved from columns.
// a column should have two keys to represent filters. internalFilter, and externalFilter.
// if both are undefined, a column doesn't have a filter. if they have values or a blank array, a column has filters.
export const RenderFilters =
    // memo(
    ({
                                       isEdit,
                                       state = {columns: [], sourceInfo: {}},
                                       setState,
                                       apiLoad, cachedFilters,
                                       defaultOpen = false
                                   }) => {
        const [open, setOpen] = useState(defaultOpen);
        const [filterOptions, setFilterOptions] = useState([]); // [{column, uniqValues}]
        const [loading, setLoading] = useState(false);
        const [searchParams] = useSearchParams();
        const navigate = useNavigate();
        const isDms = state.sourceInfo?.isDms;
        // a filter has the format: {column: [...internalFilter, ...externalFilter]}.
        // impose internalFilter when fetching external values. so the user never sees what they can't select in view mode
        const filterColumnsToTrack = useMemo(() =>
            state.columns.filter(({internalFilter, externalFilter}) =>
            (Array.isArray(internalFilter) && internalFilter.length ) || (Array.isArray(externalFilter) && externalFilter.length)),
            [state.columns]);
        const filters = useMemo(() => getFilters(state.columns), [filterColumnsToTrack]);

        const debug = false;
        const getFormattedAttributeStr = useCallback((column) => formattedAttributeStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);
        const getAttributeAccessorStr = useCallback((column) => attributeAccessorStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);

        useEffect(() => {
            // run only when using search params
            if (!state.display.allowSearchParams) return;
            // Extract filters from the URL
            const urlFilters = Array.from(searchParams.keys()).reduce((acc, searchKey) => {
                const column = state.columns.find(c => c.searchParamKey === searchKey);
                if (column) acc[column.name] = searchParams.get(searchKey)?.split(filterValueDelimiter);
                return acc;
            }, {});

            console.log('debug filters: isEqual', isEqual(urlFilters, filters), urlFilters, filters);
            const filtersMatchURL = isEqual(urlFilters, filters);

            // If searchParams have changed, they should take priority and update the state
            if (!filtersMatchURL) {
                setState(draft => {
                    draft.columns.forEach(column => {
                        const urlFilterValues = urlFilters[column.name] || [];
                        if (!isEqual(column.externalFilter, urlFilterValues) && urlFilterValues?.length) {
                            console.log('debug filters: updating state', column.name, urlFilterValues);
                            column.externalFilter = urlFilterValues;
                        }
                    });
                });

                // return;
            }

            // // If filters have changed (but not from searchParams), update the URL
            // const filtersWithSearchParams = Object.keys(filters).reduce((acc, column) => {
            //     const searchKey = state.columns.find(c => c.name === column)?.searchParamKey || column;
            //     acc[searchKey] = filters[column];
            //     return acc;
            // }, {});
            //
            // const newUrl = convertToUrlParams(filtersWithSearchParams, filterValueDelimiter);
            // if (newUrl !== window.location.search.replace('?', '')) {
            //     navigate(`?${newUrl}`);
            // }
        }, [state.display.allowSearchParams, searchParams, filters]);

        useEffect(() => {
            let isStale = false;
            async function load() {
                setLoading(true);
                const fetchedFilterData = await Promise.all(Object.keys(filters).map(async columnName => {
                    const filterBy = {};

                    const data = await getData({
                        format: state.sourceInfo,
                        apiLoad,
                        // length,
                        reqName: getFormattedAttributeStr(columnName), // column name with as
                        refName: getAttributeAccessorStr(columnName), // column name without as
                        allAttributes: state.columns,
                        filterBy
                    })
                    if(isStale) {
                        setLoading(false)
                        return;
                    }

                    debug && console.log('debug filters: data', data)
                    return {
                        column: columnName,
                        uniqValues: uniqBy(data.reduce((acc, d) => {
                            // array values flattened here for multiselects.
                            const formattedAttrStr = getFormattedAttributeStr(columnName);
                            // if meta column, value: {value, originalValue}, else direct value comes in response
                            const responseValue = d[formattedAttrStr]?.value || d[formattedAttrStr];
                            const metaValue = parseIfJson(responseValue?.value || responseValue); // meta processed value
                            const originalValue = parseIfJson(responseValue?.originalValue || responseValue);
                            const value =
                                Array.isArray(originalValue) ?
                                    originalValue.map((pv, i) => ({label: metaValue?.[i] || pv, value: pv})) :
                                    [{label: metaValue || originalValue, value: originalValue}];

                            return [...acc, ...value.filter(({label, value}) => label && typeof label !== 'object')];
                        }, []), d => d.value),
                    }
                }));
                // const data = fetchedFilterData.reduce((acc, filterData) => ({...acc, [filterData.column]: filterData.uniqValues}) , {})
                if(isStale) {
                    setLoading(false);
                    return
                }
                debug && console.log('debug filters: filter data use effect', fetchedFilterData)
                setFilterOptions(fetchedFilterData)
                setLoading(false);
            }

            load()
            return () => {
                isStale = true;
                setLoading(false);
            }
    }, [filterColumnsToTrack]);

    const filterColumnsToRender = state.columns.filter(column => isEdit ? column.filter : Array.isArray(column.externalFilter));
    if(!filterColumnsToRender.length) return null;
    const MultiSelectComp = dataTypes.multiselect[state.display.allowSearchParams ? 'ViewComp' : 'EditComp'];

    return (
        open ?
            <div className={'w-full px-4 py-6 flex flex-col border border-blue-300 rounded-md'}>
                <Filter className={'-mt-4 -mr-6 p-0.5 text-blue-300 hover:text-blue-500 hover:bg-zinc-950/5 rounded-md bg-white self-end rounded-md hover:cursor-pointer'}
                        title={'Filter'}
                        onClick={() => setOpen(false)}/>
                {filterColumnsToRender.map((filterColumn, i) => (
                    <div key={i} className={'w-full flex flex-row items-center'}>
                        <div className={'w-1/4 p-1 text-sm flex flex-col'}>
                            <span className={'py-0.5 text-gray-500 font-medium'}>{filterColumn.customName || filterColumn.display_name || filterColumn.name}</span>
                            {/* UI to match to search params. only show if using search params.*/}
                            {
                                state.display.allowSearchParams && isEdit ?
                                    <div className={'flex items-center'}>
                                        <label className={'text-xs text-gray-900 font-regular'}>Search key: </label>
                                        <select className={'p-1 text-xs rounded-md bg-blue-500/15 text-blue-700 hover:bg-blue-500/25'}
                                                value={filterColumn.searchParamKey}
                                                onChange={e => setState(draft => {
                                                    const idx = draft.columns.findIndex(column => column.name === filterColumn.name);
                                                    if (idx !== -1) {
                                                        draft.columns[idx].searchParamKey = e.target.value;
                                                    }
                                                })}
                                        >
                                            <option key={'default'} value={''}></option>
                                            {
                                                Array.from(searchParams.keys()).map(key => <option key={key} value={key}>{key}</option>)
                                            }
                                        </select>
                                    </div>: null
                            }
                        </div>
                        <div className={'flex flex-col w-3/4'}>
                            <RenderFilterValueSelector key={`${filterColumn.name}-internalFilter`}
                                                       isEdit={isEdit}
                                                       filterColumn={filterColumn}
                                                       filterType={'internalFilter'}
                                                       filterOptions={filterOptions}
                                                       setState={setState}
                                                       MultiSelectComp={MultiSelectComp}
                                                       loading={loading}
                            />
                            <RenderFilterValueSelector key={`${filterColumn.name}-externalFilter`}
                                                       isEdit={isEdit}
                                                       filterColumn={filterColumn}
                                                       filterType={'externalFilter'}
                                                       filterOptions={filterOptions}
                                                       setState={setState}
                                                       MultiSelectComp={MultiSelectComp}
                                                       state={state}
                                                       delimiter={filterValueDelimiter}
                                                       loading={loading}
                            />
                        </div>
                    </div>
                ))}
            </div> :
            <div className={'px-4 pt-2 flex flex-col'}>
                <Filter className={'-mr-6 p-0.5 text-blue-300 hover:text-blue-500 hover:bg-zinc-950/5 rounded-md bg-white self-end rounded-md hover:cursor-pointer'} onClick={() => setOpen(true)}/>
            </div>
    )
}/*, (prev, next) => {
    if(!isEqual(prev.state, next.state)) {
        console.log('memo check')
        Object.keys(next.state).forEach(key => !isEqual(prev.state[key], next.state[key]) ? console.log('memo check', key, prev.state[key], next.state[key]) : console.log(`${key} is the same`));
    }
    return isEqual(prev.state, next.state) &&
        isEqual(getDataToTrack(prev.state.columns), getDataToTrack(next.state.columns)) &&
        isEqual(prev.state?.sourceInfo?.source_id, next.state?.sourceInfo?.source_id)
}*/ //)