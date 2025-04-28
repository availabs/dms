import React, {useCallback, useEffect, useMemo, useState} from "react";
import {attributeAccessorStr, isJson} from "../../../dataWrapper/utils/utils";
import {
    getData,
    parseIfJson,
    getFilters,
    isCalculatedCol,
    convertToUrlParams,
    formattedAttributeStr,
    getNormalFilters, getData as getFilterData
} from "./utils"
import {isEqual, uniqBy} from "lodash-es"
import {RenderFilterValueSelector} from "./Components/RenderFilterValueSelector";
import {useSearchParams} from "react-router-dom";
import {CMSContext} from "../../../../../../siteConfig";
import {Icon} from "../../../../../index";

const filterValueDelimiter = '|||';

export const filterTheme = {
    filterLabel: 'py-0.5 text-gray-500 font-medium',
    loadingText: 'pl-0.5 font-thin text-gray-500',
    filterSettingsWrapper: 'flex flex-col w-full',
    input: 'w-full max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white p-2',
    settingPillsWrapper: 'flex flex-row flex-wrap gap-1',
    settingPill: 'px-1 py-0.5 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded-md',
    settingLabel: 'text-gray-900 font-regular min-w-fit',
    filtersWrapper: 'w-full py-6 flex flex-col rounded-md',
}

export const RenderFilters = ({
  isEdit,
  state = {columns: [], sourceInfo: {}}, setState,
  apiLoad, defaultOpen = true, showNavigate = false,
}) => {
    const { theme = { filters: filterTheme } } = React.useContext(CMSContext) || {};
        const [open, setOpen] = useState(defaultOpen);
        const [filterOptions, setFilterOptions] = useState([]); // [{column, uniqValues}]
        const [loading, setLoading] = useState(false);
        const [searchParams] = useSearchParams();
        const isDms = state.sourceInfo?.isDms;
        const filterColumnsToTrack = useMemo(() => state.columns.filter(({filters, isDuplicate}) => filters?.length && !isDuplicate), [state.columns]);
        const filterValuesToTrack = useMemo(() =>
            state.columns.filter(({filters, isDuplicate}) => filters?.length && filters?.[0]?.values?.length && !isDuplicate).reduce((acc, f) => [...acc, ...f.filters[0].values], []), [state.columns]);
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
                    draft.display.readyToLoad = true;
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
                            // other filter values to filter by

                            const filterBy = await Object.keys(filters)
                                .filter(f => f !== columnName)
                                .reduce(async (accPromise, columnName) => {
                                    const acc = await accPromise;

                                    const filterColumn = state.columns.find(({name}) => name === columnName);
                                    const filter = filterColumn?.filters?.[0];
                                    if (!filter?.values?.length) return acc;

                                    if (filterColumn.type === 'multiselect') {
                                        const reqName = getFormattedAttributeStr(columnName);
                                        const options = await getFilterData({
                                            reqName,
                                            refName: getAttributeAccessorStr(columnName),
                                            allAttributes: [filterColumn],
                                            apiLoad,
                                            format: state.sourceInfo,
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
                            const data = await getData({
                                format: state.sourceInfo,
                                apiLoad,
                                // length,
                                reqName: getFormattedAttributeStr(columnName), // column name with as
                                refName: getAttributeAccessorStr(columnName), // column name without as
                                allAttributes: state.columns,
                                filterBy
                            })
                            // console.log('fo data?', columnName, data)
                            if(isStale) {
                                setLoading(false)
                                return;
                            }
                            // not adding options from meta to allow options to filter down wrt other filter values
                            const metaOptions = [] //state.columns.find(({name}) => name === columnName)?.options;
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
    }, [filterColumnsToTrack, filterValuesToTrack]);

    const filterColumnsToRender = state.columns.filter(column => isEdit ? column.filters?.length : (column.filters || []).find(c => c.type === 'external'));
    if(!filterColumnsToRender.length) return null;

    // initially you'll have internal filter
    // add UI dropdown to change filter type
    // add UI to change filter operation
    //console.log('filters', filterOptions)
    return (
        open ?
            <div className={theme.filters.filtersWrapper}>
                <div className={'w-fit -mt-4 p-2 border rounded-full self-end'}>
                    <Icon icon={'Filter'}
                          className={'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer'}
                          title={'Filter'}
                          onClick={() => setOpen(false)} />
                </div>
                {filterColumnsToRender.map((filterColumn, i) => (
                    <div key={i} className={'w-full flex flex-row flex-wrap items-center'}>
                        <div className={'w-full min-w-fit text-sm'}>
                            <span className={theme.filters.filterLabel}>{filterColumn.customName || filterColumn.display_name || filterColumn.name}</span>
                            <span className={theme.filters.loadingText}>{loading ? 'loading...' : ''}</span>
                        </div>
                        <div className={theme.filters.filterSettingsWrapper}>
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
            <div className={theme.filters.filtersWrapper}>
                <div className={'w-fit -mt-4 p-2 border rounded-full self-end'}>
                    <Icon icon={'Filter'}
                          className={'text-slate-400 hover:text-blue-500 size-4 hover:cursor-pointer'}
                          title={'Filter'}
                          onClick={() => setOpen(true)} />
                </div>
            </div>
    )
}