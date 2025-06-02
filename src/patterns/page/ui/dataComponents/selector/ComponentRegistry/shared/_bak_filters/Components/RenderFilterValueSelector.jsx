import React, {useCallback, useMemo, useRef} from "react";
import dataTypes from "../../../../../../../../../data-types";
import RenderSwitch from "../../../../../../../../../ui/components/Switch";
import {useHandleClickOutside} from "../../utils";
import {convertToUrlParams} from "../utils";
import {useNavigate} from "react-router";
import {isEqualColumns} from "../../../../dataWrapper/utils/utils";
import {filterTheme} from "../RenderFilters";
import {CMSContext, PageContext} from "../../../../../../../context";

const resetColumn = (originalAttribute, setState, columns) => setState(draft => {
    const idx = columns.findIndex(column => isEqualColumns(column, originalAttribute));
    if (idx === -1) {
        draft.columns.splice(idx, 1);
    }
});
const RenderSearchKeySelector = ({filter, pageState, onChange}) => {
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
                            (pageState?.filters || [])
                                .filter(({searchKey}) => searchKey.toLowerCase().includes(text.toLowerCase()))
                                .map(({searchKey}) => <div key={`${searchKey}`}
                                                   className={optionsClass}
                                                   onClick={() => {
                                                       setText(searchKey)
                                                       onChange(searchKey)
                                                       setOpen(false)
                                                   }}>{searchKey}</div>)
                        }
                    </div>
                ) : null
            }
        </div>
    )
}

export const RenderFilterValueSelector = ({
    loading, isEdit, filterColumn, filterOptions=[], state, setState, filterWithSearchParamKeys, columns
}) => {
    const navigate = useNavigate();
    const { pageState, updatePageStateFilters } =  React.useContext(PageContext) || {}; // page to extract page filters
    const { theme = { filters: filterTheme } } = React.useContext(CMSContext) || {};
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

                    if (key === 'usePageFilters' && value === true && !targetFilter['searchParamKey']) {
                        targetFilter['searchParamKey'] = filterColumn.name;
                    }
                    draft.display.readyToLoad = true;
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

            const isStaleFilter = state.sourceInfo.columns.findIndex(({name}) => name === filterColumn.name) === -1;
            return (
                <div key={`${filterColumn.name}-${filter.operation}`} className={'w-full p-1 relative text-xs'}>
                    <div className={theme.filters.settingPillsWrapper}>
                        <select
                            className={`${isEdit ? 'cursor-pointer' : 'hidden'} ${theme.filters.settingPill}`}
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
                            className={`${isEdit ? 'cursor-pointer' : 'hidden'} ${theme.filters.settingPill}`}
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
                            /*['gt', 'gte', 'lt', 'lte'].includes(filter.operation) &&*/ isGrouping ?
                                <select
                                    className={`${isEdit ? 'cursor-pointer' : 'hidden'} ${theme.filters.settingPill}`}
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
                                    <option key="count" value="count">count</option>
                                    <option key="max" value="max">max</option>
                                    <option key="list" value="list">list</option>
                                </select> : null
                        }
                        {
                            isEdit && ['filter', 'exclude'].includes(filter.operation) ? (
                                <div className={'flex flex-wrap items-center gap-1'}>
                                    <label className={theme.filters.settingLabel}>Multiselect: </label>
                                    <RenderSwitch label={'Multi'}
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
                                    <label className={theme.filters.settingLabel}>Use Page Filters: </label>
                                    <RenderSwitch label={'Use Page Filters'}
                                                  enabled={filter.usePageFilters}
                                                  setEnabled={value => updateFilter({
                                                      key: 'usePageFilters',
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
                            filter.usePageFilters && isEdit ?
                                <div className={'flex items-center gap-0.5'}>
                                    <label className={`shrink-0 ${theme.filters.settingLabel}`}>Search key: </label>
                                    <RenderSearchKeySelector pageState={pageState}
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

                        {
                            isEdit && isStaleFilter ? <button className={theme.filters.settingPill} onClick={() => resetColumn(filterColumn, setState, state.sourceInfo.columns)}>Reset Stale Column</button> : null
                        }
                    </div>
                    {
                        ['filter', 'exclude'].includes(filter.operation) ?
                            <Comp
                                key={`filter-${filterColumn.name}-${filter.type}`}
                                className={`${theme.filters.input}`}
                                placeholder={'Search...'}
                                loading={loading}
                                value={value}
                                options={options || []}
                                singleSelectOnly={!filter.isMulti}
                                onChange={e => {
                                    let newValues = (e || []).map(filterItem => filterItem?.value || filterItem);
                                    if(filter.usePageFilters) {
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

                                        const newPageFilters = Object.keys(newFilters).map(searchKey => ({searchKey, values: newFilters[searchKey]}))
                                        // const url = convertToUrlParams(newFilters, delimiter);
                                        // navigate(`?${url}`)
                                        updatePageStateFilters( newPageFilters)
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    }else {
                                        updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                                    }
                                }}
                                displayInvalidMsg={false}
                            /> :
                            <Comp
                                key={`filter-${filterColumn.name}-${filter.type}`}
                                className={`${theme.filters.input}`}
                                placeholder={'Please enter a number...'}
                                value={ value }
                                type={'number'}
                                onChange={e => {
                                    const newValue = filterColumn.type === 'number' && e ? +e : e;
                                    let newValues = [newValue];
                                    if(filter.usePageFilters) {
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
                                        // const url = convertToUrlParams(newFilters, delimiter);
                                        // navigate(`?${url}`)
                                        const newPageFilters = Object.keys(newFilters).map(searchKey => ({searchKey, values: newFilters[searchKey]}))

                                        updatePageStateFilters(newPageFilters)
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