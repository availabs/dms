import React, {memo, useCallback, useEffect, useMemo, useState} from "react";
import dataTypes from "../../../../../../../../data-types";
import {attributeAccessorStr} from "../../spreadsheet/utils/utils";
import {Filter} from "../../../../../../../forms/ui/icons";
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

        function customizer(objValue, srcValue) {
            console.log('customizer', objValue, srcValue);
            if (Array.isArray(objValue)) {
                // return srcValue ? uniq(srcValue) : objValue;
                return uniq(objValue.concat(srcValue)); //can't always merge. find a way to determine if value has been removed.
            }
        }
        useEffect(() => {
            // handle post init filter updates. update the url to match filter change
            if (!state.display.allowSearchParams) return;
            // Extract filters from the URL
            const urlFilters = Array.from(searchParams.keys()).reduce((acc, column) => ({
                ...acc,
                [column]: searchParams.get(column)?.split(filterValueDelimiter),
            }), {});
            console.log('debug filters: isEqual', isEqual(urlFilters, filters), urlFilters, filters);
            // Check if filters match the URL filters or cached filters
            const filtersMatchURL = isEqual(urlFilters, filters);

            // Handle initial load or mismatch between filters and search params
            if (!filtersMatchURL) {
                const mergedFilters = mergeWith(filters, urlFilters, customizer); // Merge filters and URL params
                setState(draft => {
                    draft.columns.forEach(column => {
                        const urlFilterValues = urlFilters[column.name] || [];
                        if (urlFilterValues?.length && !isEqual(column.externalFilter, urlFilterValues)) {
                            column.externalFilter = urlFilterValues; // Replace with URL filters (handles removal)
                        }
                    });
                });

                // Navigate to the merged filters if they differ from the current URL
                const newUrl = convertToUrlParams(mergedFilters, filterValueDelimiter);
                if (newUrl !== window.location.search.replace('?', '')) {
                    navigate(`?${newUrl}`);
                }
            }
        }, [state.display.allowSearchParams, filters]);

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

    const filterColumnsToRender = state.columns.filter(column => isEdit ? (Array.isArray(column.internalFilter) || Array.isArray(column.externalFilter)) : Array.isArray(column.externalFilter));
    if(!filterColumnsToRender.length) return null;
    const MultiSelectComp = dataTypes.multiselect.EditComp;
    return (
        open ?
            <div className={'p-4 flex flex-col border border-blue-300 rounded-md'}>
                <Filter className={'-mt-4 -mr-6 text-blue-300 bg-white self-end rounded-md hover:cursor-pointer'}
                        onClick={() => setOpen(false)}/>
                {filterColumnsToRender.map((filterColumn, i) => (
                    <div key={i} className={'w-full flex flex-row items-center'}>
                        <div className={'w-1/4 p-1 text-sm'}>
                            {filterColumn.customName || filterColumn.display_name || filterColumn.name}
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
            <div className={'px-4 flex flex-col'}>
                <Filter className={'-mr-6 text-blue-300 bg-white self-end rounded-md hover:cursor-pointer'} onClick={() => setOpen(true)}/>
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