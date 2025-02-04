import {Pill} from "./Pill";
import {useMemo} from "react";

export const RenderFilterValueSelector = ({loading, isEdit, filterType, filterColumn, filterOptions=[], MultiSelectComp, state, setState, delimiter}) => {
    const options = useMemo(() => filterOptions.find(fo => fo.column === filterColumn.name)?.uniqValues, [filterOptions, filterColumn.name]);

    return (!isEdit && filterType === 'internalFilter') || !Array.isArray(filterColumn[filterType]) ? null : (
        <div className={'w-full p-1 relative'}>
            <Pill text={filterType.replace('Filter', '')} color={'orange'} />

            <MultiSelectComp
                key={`filter-${filterColumn.name}-${filterType}`}
                className={`max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white ${filterColumn[filterType]?.length ? `p-1` : `p-2`}`}
                placeholder={'Search...'}
                loading={loading}
                value={filterColumn[filterType] || []}
                options={options || []}
                onChange={e => {
                    const newValues = (e || []).map(filterItem => filterItem?.value || filterItem);
                    setState(draft => {
                        const idx = draft.columns.findIndex(column => column.name === filterColumn.name);
                        draft.columns[idx][filterType] = newValues;
                    })
                }}
                displayInvalidMsg={false}
            />
        </div>
    )
}