import React, {memo, useCallback, useEffect, useMemo, useState} from "react";
import dataTypes from "../../../../../../../data-types";
import {formattedAttributeStr, attributeAccessorStr} from "../../spreadsheet/utils/utils";
import {Filter} from "../../../../../ui/icons";
import {getLength, getData, getDataToTrack, parseIfJson, getFilters, isCalculatedCol, convertToUrlParams} from "./utils"
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
    const [filterOptions, setFilterOptions] = useState({}); // {col1: [vals], col2:[vals]}
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const isDms = state.sourceInfo?.isDms;
    // a filter has the format: {column: [...internalFilter, ...externalFilter]}.
    // impose internalFilter when fetching external values. so the user never sees what they can't select in view mode
    const filters = useMemo(() => getFilters(state.columns), [state.columns]);
    console.log('filters', filters, state.columns)

    const debug = false;
    const getFormattedAttributeStr = useCallback((column) => formattedAttributeStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);
    const getAttributeAccessorStr = useCallback((column) => attributeAccessorStr(column, isDms, isCalculatedCol(column, state.columns)), [state.columns, isDms]);

        // external filters exist; search params exist; they are not the same: update external filters
            // filters updated to add a value : works fine
            // filters updated to remove a value : works fine
            // url has more / different search params than filters
        // external filters exist; search params don't exist: navigate to search params
        // external filters don't exist; search params exist: set external filters



        // init only user comes to a page (with or without search params) and the url is set to the merge of existing filters and the url
        // user then changes filters, and the url is changed to reflect that
        // but if you refresh the page, it is again reset to the merge



        // Initial Load Without Search Params:
        // User navigates to the page without search params.
        // Expected behavior: Load saved filters and navigate to a URL with these filters.

        // Initial Load With Search Params:
        // User navigates to the page with search params.
        // Expected behavior: Merge search params with saved filters and update the UI to reflect both. Navigate only if the URL needs to change.

        // Filter Changes via UI:
        // User modifies filters in the UI.
        // Expected behavior: Update the filters, reflect changes in the URL, and avoid redundant navigation.

        // Search Param Updates via URL Change:
        // Search params are updated externally (e.g., browser back/forward navigation).
        // Expected behavior: Sync search params with filters without overwriting user-selected filters unnecessarily.
        // Avoid Redundant Navigation:
        //
        // Ensure that navigating to the same URL or unnecessarily updating the state is avoided.
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

                        // if (urlFilters[column.name]) {
                        //     column.externalFilter = uniq([
                        //         ...(column.externalFilter || []).map(v => v.toString()),
                        //         ...urlFilters[column.name],
                        //     ]);
                        // }
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
            console.log('testing useEffects: filters updated')
        }, [state.display.allowSearchParams, filters]);

        useEffect(() => {
            console.log('testing useEffects: searchparams updated')
        }, [state.display.allowSearchParams, searchParams]);


        // useEffect(() => {
        //     // handle init: merge search params and existing filters. set state, (and navigate?)
        //     if (!state.display.allowSearchParams) return;
        //
        //     const filterCols = Array.from(searchParams.keys());
        //     const filtersFromURL = filterCols.reduce((acc, column) => ({
        //         ...acc,
        //         [column]: searchParams.get(column)?.split(filterValueDelimiter),
        //     }), {});
        //
        //     const existingExternalFilters = getFilters(
        //         state.columns.map(({ name, externalFilter }) => ({ name, externalFilter }))
        //     );
        //
        //     if (!isEqual(filtersFromURL, existingExternalFilters)) {
        //         const newExternalFilters = uniq([...filterCols, ...state.columns.filter(c => Array.isArray(c.externalFilter)).map(c => c.name)])
        //             .map(filterColumn => {
        //                 const fullColumn = state.columns.find(({ name }) => name === filterColumn);
        //                 const externalFilter = uniq([
        //                     ...(fullColumn.externalFilter || []).map(v => v.toString()),
        //                     ...filtersFromURL[filterColumn],
        //                 ]);
        //                 return { name: fullColumn.name, externalFilter };
        //             });
        //         console.log('testing filters newExternalFilters', newExternalFilters)
        //         setState(draft => {
        //             newExternalFilters.forEach(({ name, externalFilter }) => {
        //                 const idx = draft.columns.findIndex(column => column.name === name);
        //                 if (idx !== -1 && !isEqual(externalFilter, existingExternalFilters[name])) {
        //                     console.log('testing filters in setting loop', name, externalFilter)
        //                     draft.columns[idx].externalFilter = externalFilter;
        //                 }
        //             });
        //         });
        //     }
        // }, [state.display.allowSearchParams]);


        useEffect(() => {
        let isStale = false;

        async function load() {
            const data = await Object.keys(filters).reduce(async (acc, columnName) => {
                const prev = await acc;

                const filterBy = {};

                const length = await getLength({
                    format: state.sourceInfo, apiLoad,
                    groupBy: [getAttributeAccessorStr(columnName)],
                    filterBy
                });
                if(isStale) return;

                debug && console.log('debug filters: length', length)
                const data = await getData({
                    format: state.sourceInfo,
                    apiLoad,
                    length,
                    attribute: getFormattedAttributeStr(columnName),
                    allAttributes: state.columns,
                    filterBy
                })
                if(isStale) return;

                debug && console.log('debug filters: data', data, acc)
                prev[columnName] = {
                    uniqValues: data.reduce((acc, d) => {
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

                        return uniqBy([...acc, ...value.filter(({label, value}) => label && typeof label !== 'object')], d => d.value)
                    }, []),
                    allValues: data.reduce((acc, d) => {
                        // everything we get
                        const parsedValue = d[getFormattedAttributeStr(columnName)]
                        return [...acc, parsedValue];
                        // for multiselect: [[], [], []], for others: [val1, val2, val3]
                    }, []).filter(d => Array.isArray(d) || typeof d !== "object")
                };

                return prev;
            }, {});

            if(isStale) return;
            debug && console.log('debug filters: filter data use effect', data)
            setFilterOptions(data)
        }

        load()
        return () => {
            isStale = true;
        }
    }, [filters]);
    const filterColumns = state.columns.filter(column => isEdit ? (Array.isArray(column.internalFilter) || Array.isArray(column.externalFilter)) : Array.isArray(column.externalFilter));

    if(!filterColumns.length) return null;
    const MultiSelectComp = dataTypes.multiselect.EditComp;
    console.log('testing filters cols', state.columns)
    return (
        open ?
            <div className={'p-4 flex flex-col border border-blue-300 rounded-md'}>
                <Filter className={'-mt-4 -mr-6 text-blue-300 bg-white self-end rounded-md hover:cursor-pointer'}
                        onClick={() => setOpen(false)}/>
                {filterColumns.map((filterColumn, i) => (
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