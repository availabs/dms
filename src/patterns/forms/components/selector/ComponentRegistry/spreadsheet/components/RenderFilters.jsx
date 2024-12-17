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
                            f.values?.length &&  // filters all other filters without any values
                            f.values.filter(fv => fv.length).length && // and even blank values
                            fI !== filterI // and the current filter. as we're gonna use other filters' values to determine options for current filter.
                        )
                        .reduce((acc, f) => {
                            acc[attributeAccessorStr(f.column, format.isDms, isCalculatedCol(f.column, attributes))] = f.values.filter(fv => fv.length);
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
                    return {[filter.column]: data.map(d => d[formattedAttributeStr(filter.column, format.isDms, isCalculatedCol(filter.column, attributes))]).filter(d => typeof d !== "object")};
                })
            );

            setFilterOptions(
                data.reduce((acc, d) => ({...acc, ...d}), {})
            )
        }

        load()
    }, [filters, attributes]);

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
                                const newFilters = filters.map((filter, fI) => fI === i ? {...f, values: e} : filter);
                                // const url = `?${convertToUrlParams(newFilters, delimiter)}`;
                                setFilters(newFilters)
                                // navigate(url)
                            }}
                            options={filterOptions[f.column]}
                            displayInvalidMsg={false}
                        />
                    </div>
                </div>
            ))}
        </div>
    )
}