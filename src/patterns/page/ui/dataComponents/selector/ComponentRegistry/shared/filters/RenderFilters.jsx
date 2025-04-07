import React, {useCallback, useEffect, useMemo, useState} from "react";
import {attributeAccessorStr} from "../../../dataWrapper/utils/utils";
import {Filter} from "../../../../../icons";
import {
    getData,
    parseIfJson,
    getFilters,
    isCalculatedCol,
    convertToUrlParams,
    formattedAttributeStr,
    getNormalFilters
} from "./utils"
import {isEqual, uniqBy} from "lodash-es"
import {RenderFilterValueSelector} from "./Components/RenderFilterValueSelector";
import {useSearchParams} from "react-router-dom";

const filterValueDelimiter = '|||';

export const RenderFilters = ({
  isEdit,
  state = {columns: [], sourceInfo: {}}, setState,
  apiLoad, defaultOpen = true, showNavigate = false,
}) => {
        const [open, setOpen] = useState(defaultOpen);
        const [filterOptions, setFilterOptions] = useState([]); // [{column, uniqValues}]
        const [loading, setLoading] = useState(false);
        const [searchParams] = useSearchParams();
        const isDms = state.sourceInfo?.isDms;
        const filterColumnsToTrack = useMemo(() => state.columns.filter(({filters, isDuplicate}) => filters?.length && !isDuplicate), [state.columns]);
        const normalFilterColumnsToTrack = useMemo(() => state.columns.filter(({filters, isDuplicate}) => filters?.length && isDuplicate), [state.columns]);
        const filters = useMemo(() => getFilters(filterColumnsToTrack), [filterColumnsToTrack]);
        const normalFilters = useMemo(() => getNormalFilters(normalFilterColumnsToTrack), [normalFilterColumnsToTrack]);

        const debug = false;
        const getFormattedAttributeStr = useCallback((column) => formattedAttributeStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);
        const getAttributeAccessorStr = useCallback((column) => attributeAccessorStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);
        const filterWithSearchParamKeys = useMemo(() => showNavigate ?
            Object.keys(filters).reduce((acc, filterColumn) => {
                const currFilters = state.columns.find(c => c.name === filterColumn)?.filters; // for now, it's always just 1 filter.
                if(filters[filterColumn] && filters[filterColumn].length > 0){
                    acc[currFilters?.[0]?.searchParamKey || filterColumn] = filters[filterColumn];
                }
                return acc;
            }, {}) : {},
        [filters, showNavigate]);

        useEffect(() => {
            // Extract filters from the URL
            const urlFilters = Array.from(searchParams.keys()).reduce((acc, searchKey) => {
                const urlValues = searchParams.get(searchKey)?.split(filterValueDelimiter);
                    acc[searchKey] = urlValues;
                return acc;
            }, {});

            // If searchParams have changed, they should take priority and update the state
            if (Object.keys(urlFilters).length) {
                setState(draft => {
                    draft.columns.forEach(column => {
                        if(column.filters?.length) {
                            // filter can be either internal or external. and one of the operations
                            column.filters.forEach((filter) => {
                                const urlFilterValues = urlFilters[filter.searchParamKey];
                                if(filter.allowSearchParams && urlFilterValues && !isEqual(filter.values, urlFilterValues)) {
                                    filter.values = urlFilterValues;
                                }
                            })
                        }
                    });
                    draft.readyToLoad = true;
                });
            }
        }, [searchParams, filters]);

        useEffect(() => {
            // fetch filter data
            let isStale = false;
            async function load() {
                setLoading(true);
                const fetchedFilterData = await Promise.all(
                    [...Object.keys(filters), ...normalFilters?.map(f => f.column)]
                        // don't pull filter data for internal filters in view mode
                        .filter(f => {
                            const filter = state.columns.find(({name}) => name === f)?.filters?.[0];

                            if(['gt', 'gte', 'lt', 'lte', 'like'].includes(filter.operation)) return false; // never load numerical data
                            if(isEdit) return true;
                            if(filter?.type === 'external') return true;
                        })
                        .map(async columnName => {
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
                            const metaOptions = state.columns.find(({name}) => name === columnName)?.options;
                            const dataOptions = data.reduce((acc, d) => {
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
                            }, []);

                            debug && console.log('debug filters: data', data)
                            return {
                                column: columnName,
                                uniqValues: uniqBy(Array.isArray(metaOptions) ? [...metaOptions, ...dataOptions] : dataOptions, d => d.value),
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

    const filterColumnsToRender = state.columns.filter(column => isEdit ? column.filters?.length : (column.filters || []).find(c => c.type === 'external'));
    if(!filterColumnsToRender.length) return null;

    // initially you'll have internal filter
    // add UI dropdown to change filter type
    // add UI to change filter operation
    console.log('filters', filterColumnsToRender)
    return (
        open ?
            <div className={'w-full px-4 py-6 flex flex-col border border-blue-300 rounded-md'}>
                <Filter className={'-mt-4 -mr-6 p-0.5 text-blue-300 hover:text-blue-500 hover:bg-zinc-950/5 rounded-md bg-white self-end rounded-md hover:cursor-pointer'}
                        title={'Filter'}
                        onClick={() => setOpen(false)}/>
                {filterColumnsToRender.map((filterColumn, i) => (
                    <div key={i} className={'w-full flex flex-row flex-wrap items-center'}>
                        <div className={'w-full min-w-fit p-1 text-sm'}>
                            <span className={'py-0.5 text-gray-500 font-medium'}>{filterColumn.customName || filterColumn.display_name || filterColumn.name}</span>
                            <span className={'pl-0.5 font-thin text-gray-500'}>{loading ? 'loading...' : ''}</span>
                        </div>
                        <div className={'flex flex-col w-full'}>
                            <RenderFilterValueSelector key={`${filterColumn.name}-filter`}
                                                       isEdit={isEdit}
                                                       filterColumn={filterColumn}
                                                       filterOptions={filterOptions}
                                                       state={state}
                                                       setState={setState}
                                                       searchParams={searchParams}
                                                       loading={loading}
                                                       filterWithSearchParamKeys={filterWithSearchParamKeys}
                                                       delimiter={filterValueDelimiter}
                                                       columns={state.columns}
                            />
                        </div>
                    </div>
                ))}
            </div> :
            <div className={'px-4 pt-2 flex flex-col'}>
                <Filter className={'-mr-6 p-0.5 text-blue-300 hover:text-blue-500 hover:bg-zinc-950/5 rounded-md bg-white self-end rounded-md hover:cursor-pointer'} onClick={() => setOpen(true)}/>
            </div>
    )
}