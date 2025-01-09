import React, {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {dmsDataTypes} from "../../../../../../../data-types";
import {formattedAttributeStr, attributeAccessorStr, convertToUrlParams} from "../utils/utils";
import {Filter} from "../../../../../../admin/ui/icons";
import {isJson} from "../../../index";
import {uniqBy} from "lodash-es"

export const getData = async ({format, apiLoad, length, attributes, allAttributes, groupBy=[], filterBy={}}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const finalAttributes = attributes || (
        isJson(format?.config) ? (format.config?.attributes || []) :
            (JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [])
    );

    const {name, display, meta_lookup} = allAttributes.find(attr => attr.name === attributes[0]) || {};
    const meta = ['meta-variable', 'geoid-variable', 'meta'].includes(display) && meta_lookup ? {[name]: meta_lookup} : {};
    const fromIndex = 0;
    const toIndex = length-1;
    const children = [{
        type: () => {
        },
        action: 'uda',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({groupBy, aggregatedLen: groupBy.length, filter: filterBy, exclude: {[groupBy[0]]: ['null']}, meta, keepOriginalValues: true}),
            attributes: finalAttributes,
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: finalAttributes,
        children
    });
    return data;
}

export const getLength = async ({format, apiLoad, groupBy= [], filterBy}) =>{
    const finalAttributes = isJson(format?.config) ? (format.config?.attributes || []) :
        (JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || []);

    const children = [{
        type: () => {
        },
        action: 'udaLength',
        path: '/',
        filter: {
            options: JSON.stringify({groupBy, aggregatedLen: groupBy.length, filter: filterBy})
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: finalAttributes,
        children
    });
    return length;
}
const isCalculatedCol = (col, attributes) => {
    const attr = (attributes || []).find(attr => attr.name === col);
    if(!attr) console.log(`${col} not found in filters.`, attributes)
    return attr.display === 'calculated' || attr.type === 'calculated' || attr.origin === 'calculated-column';
}

const parseIfJson = value => {
    try {
        return JSON.parse(value)
    }catch (e){
        return value;
    }
}
export const RenderFilters = ({attributes, filters, setFilters, format, apiLoad}) => {
    const [filterOptions, setFilterOptions] = useState({}); // {col1: [vals], col2:[vals]}
    // console.log('render filters props', format, attributes)
    // filters don't work for newly added values. this has started happening after accommodating multiselect filters using valueSets. can be solved by using merge of values and valuesets in format filters.

    const getFormattedAttributeStr = useCallback((column, isDms, attributes) => formattedAttributeStr(column, isDms, isCalculatedCol(column, attributes)), [attributes]);
    const getAttributeAccessorStr = useCallback((column, isDms, attributes) => attributeAccessorStr(column, isDms, isCalculatedCol(column, attributes)), [attributes]);
    useEffect(() => {
        async function load(){
            if(!attributes.length) return;

            const data = await filters.reduce(async (acc, filter, filterI) => {
                await acc;
                // only fetch data relevant to already set filters.
                // const filterBy = filters
                //     .filter((f, fI) =>
                //         f.valueSets?.length &&  // filters all other filters without any values
                //         f.valueSets.filter(fv => fv.length).length && // and even blank values
                //         fI !== filterI // and the current filter. as we're gonna use other filters' values to determine options for current filter.
                //     )
                //     .reduce((acc, f) => {
                //         acc[getAttributeAccessorStr(f.column, format.isDms, attributes)] = f.valueSets.filter(fv => fv.length);
                //         return acc;
                //     }, {});
                const filterBy = {};
                const length = await getLength({
                    format: {...format, type: format.doc_type}, apiLoad,
                    groupBy: [getAttributeAccessorStr(filter.column, format.isDms, attributes)],
                    filterBy
                });

                const data = await getData({
                    format: {...format, type: format.doc_type},
                    apiLoad,
                    length,
                    attributes: [getFormattedAttributeStr(filter.column, format.isDms, attributes)],
                    allAttributes: attributes,
                    groupBy: [getAttributeAccessorStr(filter.column, format.isDms, attributes)],
                    filterBy
                })

                acc[filter.column] = {
                        uniqValues: data.reduce((acc, d) => {
                            // array values flattened here for multiselects.
                            const formattedAttrStr = getFormattedAttributeStr(filter.column, format.isDms, attributes);
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
                            const parsedValue = d[getFormattedAttributeStr(filter.column, format.isDms, attributes)]
                            return [...acc, parsedValue];
                            // for multiselect: [[], [], []], for others: [val1, val2, val3]
                        }, []).filter(d => Array.isArray(d) || typeof d !== "object")
                    };

                return acc;
            }, {});

            setFilterOptions(
                data
            )
        }

        load()
    }, [filters.length, attributes]);

    console.log('foptions', filterOptions, filters)
    const MultiSelectComp = dmsDataTypes.multiselect.EditComp;
    if(!filters.length || !attributes.length) return null;
    return (
        <div className={'p-4 flex flex-col border border-blue-300 rounded-md'}>
            <Filter className={'-mt-4 -mr-6 text-blue-300 bg-white self-end rounded-md'}/>
            {filters.map((f, i) => (
                <div className={'w-full flex flex-row items-center'}>
                    <div className={'w-1/4 p-1 text-sm'}>
                        {attributes.find(attr => attr.name === f.column)?.display_name || f.column}
                    </div>
                    <div className={'w-3/4 p-1 relative'}>
                        <MultiSelectComp
                            className={`max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white ${f.values?.length ? `p-1` : `p-4`}`}
                            placeholder={'Search...'}
                            value={f.values}
                            onChange={e => {
                                const newValues = (e || []).map(filterItem => filterItem?.value || filterItem);
                                const newFilters =
                                    filters.map((filter, fI) => fI === i ?
                                        {...f,
                                            values: e,
                                            valueSets:
                                                (filterOptions?.[f.column]?.allValues || [])
                                                    .filter(v => {
                                                        const parsedValueSet = parseIfJson(v);
                                                        return newValues.some(e1 => Array.isArray(parsedValueSet) ? v.includes(e1) : v === e1)
                                                    })
                                                    // .filter(v => Array.isArray(v) ? v.some(v1 => e.includes(v1)) : e.includes(v)).map(v => `[${v.map(v1 => `"${v1}"`)}]`)
                                        } : filter);
                                // const url = `?${convertToUrlParams(newFilters, delimiter)}`;
                                console.log('new filters', newFilters)
                                setFilters(newFilters)
                                // navigate(url)
                            }}
                            options={filterOptions?.[f.column]?.uniqValues || []}
                            displayInvalidMsg={false}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}