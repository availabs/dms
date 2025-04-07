import React, {useCallback, useMemo, useRef} from "react";
import dataTypes from "../../../../../../../../../data-types";
import RenderSwitch from "../../../../dataWrapper/components/Switch";
import {useHandleClickOutside} from "../../utils";
import {convertToUrlParams} from "../utils";
import {useNavigate} from "react-router-dom";
import {isEqualColumns} from "../../../../dataWrapper/utils/utils";

const RenderSearchKeySelector = ({filter, searchParams, onChange}) => {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(filter.searchParamKey || '');
    const menuRef = React.useRef(null);
    const menuBtnId = `search-menu-btn-${filter.type}-${filter.operation}`;
    useHandleClickOutside(menuRef, menuBtnId, () => {setText(filter.searchParamKey || ''); setOpen(false)})
    const optionsClass = 'p-1 hover:bg-blue-500/15 hover:text-blue-700 cursor-pointer rounded-md'
    return (
        <div className={'min-w-fit w-full relative bg-white'}>
            <input className={'px-1 text-xs rounded-md bg-blue-500/15 text-blue-700 hover:bg-blue-500/25'}
                   id={menuBtnId}
                   value={text}
                   onChange={e => setText(e.target.value)}
                   onFocus={() => setOpen(true)}
            />
            {
                open ? (
                    <div ref={menuRef} className={'absolute w-full bg-white p-1 text-xs rounded-md shadow-md'}>
                        {
                            text ? (
                                <div className={optionsClass}
                                     onClick={() => {
                                         onChange(text)
                                         setOpen(false)
                                     }}>+ add {text}</div>
                            ) : null
                        }
                        {
                            Array.from(searchParams.keys())
                                .filter(key => key.toLowerCase().includes(text.toLowerCase()))
                                .map((key) => <div key={`${key}`}
                                                   className={optionsClass}
                                                   onClick={() => {
                                                       setText(key)
                                                       onChange(key)
                                                       setOpen(false)
                                                   }}>{key}</div>)
                        }
                    </div>
                ) : null
            }
        </div>
    )
}

export const RenderFilterValueSelector = ({
    loading, isEdit, filterColumn, filterOptions=[], setState, searchParams, delimiter, filterWithSearchParamKeys, columns
}) => {
    const navigate = useNavigate();
    const options = useMemo(() => filterOptions.find(fo => fo.column === filterColumn.name)?.uniqValues, [filterOptions, filterColumn.name]);

    const useDebouncedUpdateFilter = (delay = 300) => {
        const timeoutRef = useRef(null);

        return useCallback(({ key, value, filterColumn, filter, setState }) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                setState((draft) => {
                    const idx = draft.columns.findIndex(column => isEqualColumns(column, filterColumn));
                    if (idx === -1) return;

                    const filterIdx = (draft.columns[idx]?.filters || []).findIndex(f => f.type === filter.type && f.operation === filter.operation);
                    if (filterIdx === -1) return;

                    const targetFilter = draft.columns[idx].filters[filterIdx];
                    targetFilter[key] = value;

                    if (key === 'allowSearchParams' && value === true && !targetFilter['searchParamKey']) {
                        targetFilter['searchParamKey'] = filterColumn.name;
                    }
                    draft.readyToLoad = true;
                });
            }, delay);
        }, [setState]);
    };

    const updateFilter = useDebouncedUpdateFilter(300);
    const isGrouping = useMemo(() => columns.some(({group}) => group), [columns]);

    return (
        filterColumn.filters || [])
        .filter(filter => isEdit || (!isEdit && filter.type === 'external'))
        .map((filter) => {
            const selector = ['filter', 'exclude'].includes(filter.operation) ? 'multiselect' : 'text'

            const Comp = dataTypes[selector].EditComp;

            const value = ['filter', 'exclude'].includes(filter.operation) ? (filter.values || []) :
                (Array.isArray(filter.values) ? filter.values[0] : typeof filter.values === 'object' ? '' : filter.values);
            return (
                <div key={`${filterColumn.name}-${filter.operation}`} className={'w-full p-1 relative text-xs'}>
                    <div className={'flex flex-row flex-wrap gap-1'}>
                        <select
                            className={`${isEdit ? 'cursor-pointer' : 'hidden'} px-1 py-0.5 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded-md`}
                            value={filter.type}
                            disabled={!isEdit}
                            onChange={e => updateFilter({
                                key: 'type',
                                value: e.target.value,
                                filterColumn,
                                filter,
                                setState
                            })}
                        >
                            <option key="internal" value="internal">internal</option>
                            <option key="external" value="external">external</option>
                        </select>
                        <select
                            className={`${isEdit ? 'cursor-pointer' : 'hidden'} px-1 py-0.5 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded-md`}
                            value={filter.operation}
                            disabled={!isEdit}
                            onChange={e => updateFilter({
                                key: 'operation',
                                value: e.target.value,
                                filterColumn,
                                filter,
                                setState
                            })}
                        >
                            <option key="filter" value="filter">include</option>
                            <option key="exclude" value="exclude">exclude</option>
                            <option key="gt" value="gt"> {">"} </option>
                            <option key="gte" value="gte"> {">="} </option>
                            <option key="lt" value="lt"> {"<"} </option>
                            <option key="lte" value="lte"> {"<="} </option>
                        </select>

                        {
                            ['gt', 'gte', 'lt', 'lte'].includes(filter.operation) && isGrouping ?
                                <select
                                    className={`${isEdit ? 'cursor-pointer' : 'hidden'} px-1 py-0.5 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded-md`}
                                    value={filter.fn}
                                    disabled={!isEdit}
                                    onChange={e => updateFilter({
                                        key: 'fn',
                                        value: e.target.value,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                >
                                    <option key="none" value="">no fn</option>
                                    <option key="sum" value="sum">sum</option>
                                    <option key="count" value="conut">count</option>
                                </select> : null
                        }
                        {
                            isEdit && ['filter', 'exclude'].includes(filter.operation) ? (
                                <div className={'flex flex-wrap items-center gap-1'}>
                                    <label className={'text-gray-900 font-regular min-w-fit'}>Multiselect: </label>
                                    <RenderSwitch label={'Use Search Params'}
                                                  enabled={filter.isMulti}
                                                  setEnabled={value => updateFilter({
                                                      key: 'isMulti',
                                                      value,
                                                      filterColumn,
                                                      filter,
                                                      setState
                                                  })}
                                                  size={'xs'}
                                    />
                                </div>
                            ) : null
                        }
                        {/* UI to match to search params. only show if using search params.*/}
                        {
                            isEdit ? (
                                <div className={'flex flex-wrap items-center gap-1'}>
                                    <label className={'text-gray-900 font-regular min-w-fit'}>Use Search Params: </label>
                                    <RenderSwitch label={'Use Search Params'}
                                                  enabled={filter.allowSearchParams}
                                                  setEnabled={value => updateFilter({
                                                      key: 'allowSearchParams',
                                                      value,
                                                      filterColumn,
                                                      filter,
                                                      setState
                                                  })}
                                                  size={'xs'}
                                    />
                                </div>
                            ) : null
                        }
                        {
                            filter.allowSearchParams && isEdit ?
                                <div className={'flex items-center gap-0.5'}>
                                    <label className={'shrink-0 text-gray-900 font-regular min-w-fit'}>Search key: </label>
                                    <RenderSearchKeySelector searchParams={searchParams}
                                                             filter={filter}
                                                             onChange={e => updateFilter({
                                                                 key: 'searchParamKey',
                                                                 value: e,
                                                                 filterColumn,
                                                                 filter,
                                                                 setState
                                                             })}
                                    />
                                </div> : null
                        }
                    </div>
                    {
                        ['filter', 'exclude'].includes(filter.operation) ?
                            <Comp
                                key={`filter-${filterColumn.name}-${filter.type}`}
                                className={`max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white ${filter.values?.length ? `p-1` : `p-2`}`}
                                placeholder={'Search...'}
                                loading={loading}
                                value={value}
                                options={options || []}
                                singleSelectOnly={!filter.isMulti}
                                onChange={e => {
                                    let newValues = (e || []).map(filterItem => filterItem?.value || filterItem);
                                    if(filter.allowSearchParams) {
                                        const newFilters =  Object.keys(filterWithSearchParamKeys).filter(col => {
                                            if((filter.searchParamKey || filterColumn.name) === col) return false;

                                            const currValue = filterWithSearchParamKeys[col];
                                            return currValue?.length;
                                        }).reduce((acc, col) => {
                                            acc[col] = filterWithSearchParamKeys[col];
                                            return acc;
                                        }, {})

                                        if(newValues.length){
                                            newFilters[filter.searchParamKey || filterColumn.name] = newValues;
                                        }
                                        const url = convertToUrlParams(newFilters, delimiter);
                                        navigate(`?${url}`)
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    }else {
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    }
                                }}
                                displayInvalidMsg={false}
                            /> :
                            <Comp
                                key={`filter-${filterColumn.name}-${filter.type}`}
                                className={`max-h-[150px] w-full flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white ${filter.values?.length ? `p-1` : `p-2`}`}
                                placeholder={'Please enter a number...'}
                                value={ value }
                                type={'number'}
                                onChange={e => {
                                    let newValues = [e];
                                    if(filter.allowSearchParams) {
                                        const newFilters =  Object.keys(filterWithSearchParamKeys).filter(col => {
                                            if((filter.searchParamKey || filterColumn.name) === col) return false;

                                            const currValue = filterWithSearchParamKeys[col];
                                            return currValue?.length;
                                        }).reduce((acc, col) => {
                                            acc[col] = filterWithSearchParamKeys[col];
                                            return acc;
                                        }, {})

                                        if(newValues.length){
                                            newFilters[filter.searchParamKey || filterColumn.name] = newValues;
                                        }
                                        const url = convertToUrlParams(newFilters, delimiter);
                                        navigate(`?${url}`)
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    } else {
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    }
                                }}
                                onWheel={e => e.target.blur()}
                                displayInvalidMsg={false}
                            />
                    }
                </div>
            )
        })

}