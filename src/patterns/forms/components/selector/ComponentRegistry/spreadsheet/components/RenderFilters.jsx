import React, {useEffect, useMemo, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {dmsDataTypes} from "../../../../../../../data-types";
import {formattedAttributeStr, attributeAccessorStr, convertToUrlParams} from "../utils";
import {Filter} from "../../../../../../admin/ui/icons";
import {isJson} from "../../../index";

export const getData = async ({format, apiLoad, length, attributes, groupBy=[], filterBy={}}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const finalAttributes = attributes || (
        isJson(format?.config) ? (format.config?.attributes || []) :
            (JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [])
    );
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
            options: JSON.stringify({groupBy, aggregatedLen: groupBy.length, filter: filterBy}),
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
export const RenderFilters = ({attributes, filters, setFilters, format, apiLoad, delimiter}) => {
    const navigate = useNavigate();
    const [filterOptions, setFilterOptions] = useState({}); // {col1: [vals], col2:[vals]}
    // console.log('render filters props', format, attributes)
    useEffect(() => {
        async function load(){
            if(!attributes.length) return;

            const data = await Promise.all(
                filters.map(async (filter, filterI) => {
                    const filterBy = filters
                        .filter((f, fI) =>
                            f.valueSets?.length &&  // filters all other filters without any values
                            f.valueSets.filter(fv => fv.length).length && // and even blank values
                            fI !== filterI // and the current filter. as we're gonna use other filters' values to determine options for current filter.
                        )
                        .reduce((acc, f) => {
                            acc[attributeAccessorStr(f.column, format.isDms, isCalculatedCol(f.column, attributes))] = f.valueSets.filter(fv => fv.length);
                            return acc;
                        }, {});
                    const length = await getLength({
                        format: {...format, type: format.doc_type}, apiLoad,
                        groupBy: [attributeAccessorStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))], filterBy});

                    const data = await getData({
                        format: {...format, type: format.doc_type},
                        apiLoad,
                        length,
                        attributes: [formattedAttributeStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))],
                        // visibleAttributes: [formattedAttributeStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))],
                        groupBy: [attributeAccessorStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))],
                        filterBy
                    })
                    return {[filter.column]: {
                            uniqValues: data.reduce((acc, d) => {
                                // for multiselect, you get arrays that need to be spread
                                const originalValue = d[formattedAttributeStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))];
                                const parsedValue = parseIfJson(originalValue);
                                const value = Array.isArray(parsedValue) ? parsedValue : originalValue;
                                return [...new Set([...acc, ...(Array.isArray(parsedValue) ? value : [value])])]
                            }, []).filter(d => typeof d !== "object"),
                            allValues: data.reduce((acc, d) => {
                                const parsedValue =
                                    d[formattedAttributeStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))]

                                return [...acc, parsedValue];
                                // for multiselect: [[], [], []], for others: [val1, val2, val3]
                        }, []).filter(d => Array.isArray(d) || typeof d !== "object")
                        }}
                })
            );

            setFilterOptions(
                data.reduce((acc, d) => ({...acc, ...d}), {})
            )
        }

        load()
    }, [filters, attributes]);
    console.log('foptions', filterOptions)
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
                                const newFilters =
                                    filters.map((filter, fI) => fI === i ?
                                        {...f,
                                            values: e,
                                            valueSets:
                                                (filterOptions?.[f.column]?.allValues || [])
                                                    .filter(v => e.some(e1 => v.includes(e1)))
                                                    // .filter(v => Array.isArray(v) ? v.some(v1 => e.includes(v1)) : e.includes(v)).map(v => `[${v.map(v1 => `"${v1}"`)}]`)
                                        } : filter);
                                // const url = `?${convertToUrlParams(newFilters, delimiter)}`;
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