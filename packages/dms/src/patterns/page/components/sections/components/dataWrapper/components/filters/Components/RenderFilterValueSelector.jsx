import React, {useCallback, useMemo, useRef} from "react";
import {useHandleClickOutside, isEqualColumns} from "../../../utils/utils";
import {filterTheme} from "../RenderFilters.theme";
import {PageContext} from "../../../../../../../context";
import {ThemeContext} from "../../../../../../../../../ui/useTheme";

const resetColumn = (originalAttribute, setState, columns) => setState(draft => {
    const idx = columns.findIndex(column => isEqualColumns(column, originalAttribute));
    if (idx === -1) {
        draft.columns.splice(idx, 1);
    }
});
const RenderSearchKeySelector = ({filter, pageState, onChange}) => {
    const { UI } = React.useContext(ThemeContext) || {};
    const { Input } = UI || {};
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(filter.searchParamKey || '');
    const menuRef = React.useRef(null);
    const menuBtnId = `search-menu-btn-${filter.type}-${filter.operation}`;
    useHandleClickOutside(menuRef, menuBtnId, () => {setText(filter.searchParamKey || ''); setOpen(false)})
    const optionsClass = 'p-1 hover:bg-blue-500/15 hover:text-blue-700 cursor-pointer rounded-md'
    return (
        <div className={'min-w-fit w-full relative bg-white'}>
            <Input id={menuBtnId}
                   value={text}
                   onChange={e => setText(e.target.value)}
                   onFocus={() => setOpen(true)}
            />
            {
                open ? (
                    <div ref={menuRef} className={'absolute w-full bg-white p-1 text-xs rounded-md shadow-md z-1'}>
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
    const { pageState, updatePageStateFilters } =  React.useContext(PageContext) || {}; // page to extract page filters
    const { theme: themeFromContext = {}, UI} = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, filters: {...filterTheme, ...(themeFromContext.filter || {})}};
    const {Switch, Select, Input, Button, ColumnTypes} = UI;
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

                    if (key === 'usePageFilters' && value === false) {
                        targetFilter['allowSearchParams'] = false;
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

            const Comp = ColumnTypes[selector].EditComp;

            const value = ['filter', 'exclude'].includes(filter.operation) ? (filter.values || []) :
                (Array.isArray(filter.values) ? filter.values[0] : typeof filter.values === 'object' ? '' : filter.values);

            const isStaleFilter = (state.externalSource || {})?.columns?.findIndex(({name}) => name === filterColumn.name) === -1;
            return (
                <div key={`${filterColumn.name}-${filter.operation}`} className={'p-1 relative text-xs'}>
                    {
                        isEdit ? (
                            <div className={theme.filters.settingPillsWrapper}>
                                <Select
                                    value={filter.type}
                                    disabled={!isEdit}
                                    options={[
                                        { label: 'internal', value: 'internal' },
                                        { label: 'external', value: 'external' },
                                    ]}
                                    onChange={e => updateFilter({
                                        key: 'type',
                                        value: e.target.value,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                />

                                <Select
                                    value={filter.operation}
                                    disabled={!isEdit}
                                    options={[
                                        { label: 'include', value: 'filter' },
                                        { label: 'exclude', value: 'exclude' },
                                        { label: 'text', value: 'like' },
                                        { label: ' > ', value: 'gt' },
                                        { label: ' >= ', value: 'gte' },
                                        { label: ' < ', value: 'lt' },
                                        { label: ' <= ', value: 'lte' },
                                    ]}
                                    onChange={e => updateFilter({
                                        key: 'operation',
                                        value: e.target.value,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                />

                                {
                                    isGrouping ?
                                        <Select
                                            value={filter.fn}
                                            disabled={!isEdit}
                                            options={[
                                                { label: 'no fn', value: '' },
                                                { label: 'sum', value: 'sum' },
                                                { label: 'count', value: 'count' },
                                                { label: 'max', value: 'max' },
                                                { label: 'list', value: 'list' },
                                            ]}
                                            onChange={e => updateFilter({
                                                key: 'fn',
                                                value: e.target.value,
                                                filterColumn,
                                                filter,
                                                setState
                                            })}
                                        /> : null
                                }

                                {
                                    ['filter', 'exclude'].includes(filter.operation) ? (
                                        <div className={'flex flex-wrap items-center gap-1'}>
                                            <label className={theme.filters.settingLabel}>Multiselect: </label>
                                            <Switch label={'Multi'}
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
                                <div className={'flex flex-wrap items-center gap-1'}>
                                    <label className={theme.filters.settingLabel}>Use Page Filters: </label>
                                    <Switch label={'Use Page Filters'}
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

                                {
                                    filter.usePageFilters ?
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

                                <Select
                                    value={filter.display}
                                    disabled={!isEdit}
                                    options={[
                                        { label: 'compact', value: '' },
                                        { label: 'expanded', value: 'expanded' },
                                        { label: 'tabular', value: 'tabular' },
                                    ]}
                                    onChange={e => updateFilter({
                                        key: 'display',
                                        value: e.target.value,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                />

                                {
                                    isStaleFilter ? (
                                        <Button onClick={() => resetColumn(filterColumn, setState, state.externalSource.columns)}>
                                            Reset Stale Column
                                        </Button>
                                    ) : null
                                }
                            </div>
                        ) : null
                    }

                    <Comp
                        key={`filter-${filterColumn.name}-${filter.type}`}
                        className={theme.filters.input}
                        loading={loading}
                        value={value}
                        placeholder={filter.operation === 'like' ? 'search...' : 'Please enter a number...'}
                        options={['filter', 'exclude'].includes(filter.operation) ? (options || []) : undefined}
                        singleSelectOnly={['filter', 'exclude'].includes(filter.operation) ? !filter.isMulti : undefined}
                        displayDetailedValues={!filter.display}
                        keepMenuOpen={filter.display === 'expanded'}
                        tabular={filter.display === 'tabular'}
                        type={['filter', 'exclude'].includes(filter.operation) ? undefined : filter.operation === 'like' ? 'text' : 'number'}
                        displayInvalidMsg={false}
                        onWheel={e => e.target.blur()}
                        onChange={e => {
                            let newValues =
                                ['filter', 'exclude'].includes(filter.operation) ?
                                    (Array.isArray(e) ? e : ([e] || [])).map(filterItem => filterItem?.value || filterItem) :
                                    filterColumn.type === 'number' && e ? [+e] : [e];

                            if(filter.usePageFilters) {
                                const currentFilterSearchKey = filter.searchParamKey || filterColumn.name;

                                const newFilters =  Object.keys(filterWithSearchParamKeys).filter(col => {
                                    if(currentFilterSearchKey === col) return false;

                                    const currValue = filterWithSearchParamKeys[col];
                                    return currValue?.length;
                                }).reduce((acc, col) => {
                                    acc[col] = filterWithSearchParamKeys[col];
                                    return acc;
                                }, {})

                                if(newValues.length){
                                    newFilters[currentFilterSearchKey] = newValues;
                                }

                                const newPageFilters = Object.keys(newFilters).map(searchKey => ({searchKey, values: newFilters[searchKey]}))

                                updatePageStateFilters(newPageFilters, {[currentFilterSearchKey]: !newValues.length})
                                updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                            }else {
                                updateFilter({key: 'values', value: newValues, filterColumn, filter, setState})
                            }
                        }}
                    />
                </div>
            )
        })

}
