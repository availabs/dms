import React, {useEffect, useMemo, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {getLength, getValues} from "../../../../../../../data-types/form-config/components/RenderField";
import {dmsDataTypes} from "../../../../../../../data-types";
import {formattedAttributeStr, attributeAccessorStr} from "../utils";

const convertToUrlParams = (arr, delimiter) => {
    const params = new URLSearchParams();

    arr.forEach(item => {
        const { column, values = [] } = item;
        params.append(column, values.join(delimiter));
    });

    return params.toString();
};

export const RenderFilters = ({attributes, filters, setFilters, format, apiLoad, delimiter}) => {
    const navigate = useNavigate();
    const [filterOptions, setFilterOptions] = useState({}); // {col1: [vals], col2:[vals]}

    useEffect(() => {
        async function load(){


            const data = await Promise.all(
                filters.map(async (filter, filterI) => {
                    const filterBy = filters
                        .filter((f, fI) => f.values?.length && fI !== filterI)
                        .reduce((acc, f) => {
                            acc[attributeAccessorStr(f.column)] = f.values;
                            return acc;
                        }, {});
                    const length = await getLength({format, apiLoad, groupBy: [attributeAccessorStr(filter.column)], filterBy});

                    const data = await getValues({
                        format,
                        apiLoad,
                        length,
                        attributes: [formattedAttributeStr(filter.column)],
                        groupBy: [attributeAccessorStr(filter.column)],
                        filterBy
                    })
                    return {[filter.column]: data.map(d => d[formattedAttributeStr(filter.column)]).filter(d => typeof d !== "object")};
                })
            );

            setFilterOptions(
                data.reduce((acc, d) => ({...acc, ...d}), {})
            )
        }

        load()
    }, [filters]);

    const MultiSelectComp = dmsDataTypes.multiselect.EditComp;

    return (
        <div className={'flex flex-col'}>
            {filters.map((f, i) => (
                <div className={'flex flex-row items-center'}>
                    <div className={'w-1/4 p-1'}>
                        {attributes.find(attr => attr.name === f.column)?.display_name || f.column}
                    </div>
                    <div className={'w-3/4 p-1'}>
                        <MultiSelectComp
                            className={`border rounded-md bg-white h-full ${f.values?.length ? `p-1` : `p-4`}`}
                            placeholder={'Please select values...'}
                            value={f.values}
                            onChange={e => {
                                const newFilters = filters.map((filter, fI) => fI === i ? {...f, values: e} : filter);
                                const url = `?${convertToUrlParams(newFilters, delimiter)}`;
                                setFilters(newFilters)
                                navigate(url)
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