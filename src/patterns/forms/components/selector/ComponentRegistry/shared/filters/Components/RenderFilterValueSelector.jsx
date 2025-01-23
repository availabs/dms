import {Pill} from "./Pill";
import {convertToUrlParams} from "../utils";
import {useNavigate} from "react-router-dom";

export const RenderFilterValueSelector = ({isEdit, filterType, filterColumn, filterOptions, MultiSelectComp, state, setState, delimiter}) => {
    const navigate = useNavigate();

    return (!isEdit && filterType === 'internalFilter') || !Array.isArray(filterColumn[filterType]) ? null : (
        <div className={'w-full p-1 relative'}>
            <Pill text={filterType.replace('Filter', '')} color={'orange'} />
            <MultiSelectComp
                key={`filter-${filterColumn.name}-${filterType}`}
                className={`max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white ${filterColumn[filterType]?.length ? `p-1` : `p-2`}`}
                placeholder={'Search...'}
                value={filterColumn[filterType] || []}
                onChange={e => {
                    const newValues = (e || []).map(filterItem => filterItem?.value || filterItem);

                    if(isEdit || true){
                        // save internal and external filter values in edit mode. no navigation needed.
                        setState(draft => {
                            const idx = draft.columns.findIndex(column => column.name === filterColumn.name);
                            draft.columns[idx][filterType] = newValues;
                            console.log('testing filters setting value using UI', newValues)
                            // if(filterType === 'externalFilter' && !isEdit) {
                            //     // navigate on external filter change.
                            //     const newExternalFilters = state.columns.filter(({externalFilter}) => Array.isArray(externalFilter))
                            //         .reduce((acc, {name, externalFilter}) => ({[name]: name === filterColumn.name ? newValues : externalFilter}), {});
                            //     console.log('testing filters: new values', filterColumn.name, newValues, newExternalFilters);
                            //     const url = `?${convertToUrlParams(newExternalFilters, delimiter)}`;
                            //     console.log('testing filters: navigating on value change', url)
                            //     navigate(url)
                            // }

                        })
                    }
                    // todo value sets should be calculated in getData only if column is multiselect.
                    // const newFilters = {
                    //     values: e,
                    //     valueSets:
                    //         (filterOptions?.[filterColumn.name]?.allValues || [])
                    //             .filter(v => {
                    //                 const parsedValueSet = parseIfJson(v);
                    //                 return newValues.some(e1 => Array.isArray(parsedValueSet) ? v.includes(e1) : v === e1)
                    //             })
                    // }


                }}
                options={filterOptions?.[filterColumn.name]?.uniqValues || []}
                displayInvalidMsg={false}
            />
        </div>
    )
}

// edit mode
// user can select internal and excternal filter values, and they get saved. not navigation happens.
// view mode
// use can select external filters, and the page gets new search params. nothing gets saved.