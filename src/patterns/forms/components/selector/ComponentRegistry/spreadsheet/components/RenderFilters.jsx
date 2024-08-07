import React, {useEffect, useMemo, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {getLength, getValues} from "../../../../../../../data-types/form-config/components/RenderField";
import {dmsDataTypes} from "../../../../../../../data-types";
import {formattedAttributeStr, attributeAccessorStr, convertToUrlParams} from "../utils";
import {Filter} from "../../../../../../admin/ui/icons";

export const RenderFilters = ({attributes, filters, setFilters, format, apiLoad, delimiter}) => {
    const navigate = useNavigate();
    const [filterOptions, setFilterOptions] = useState({}); // {col1: [vals], col2:[vals]}

    useEffect(() => {
        async function load(){


            const data = await Promise.all(
                filters.map(async (filter, filterI) => {
                    const filterBy = filters
                        .filter((f, fI) =>
                            f.values?.length &&  // filters all other filters without any values
                            f.values.filter(fv => fv.length).length && // and even blank values
                            fI !== filterI // and the current filter. as we're gonna use other filters' values to determine options for current filter.
                        )
                        .reduce((acc, f) => {
                            acc[attributeAccessorStr(f.column)] = f.values.filter(fv => fv.length);
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
        <div className={'p-4 flex flex-col border border-blue-300 rounded-md'}>
            <Filter className={'-mt-4 -mr-6 text-blue-300 bg-white self-end rounded-md'}/>
            {filters.map((f, i) => (
                <div className={'w-full flex flex-row items-center'}>
                    <div className={'w-1/4 p-1'}>
                        {attributes.find(attr => attr.name === f.column)?.display_name || f.column}
                    </div>
                    <div className={'w-3/4 p-1 relative'}>
                        <MultiSelectComp
                            className={`max-h-[150px] overflow-auto scrollbar-sm border rounded-md bg-white ${f.values?.length ? `p-1` : `p-4`}`}
                            placeholder={'Please select values...'}
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