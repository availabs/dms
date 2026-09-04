import React, {useCallback, useMemo, useRef} from "react";
import {useHandleClickOutside, isEqualColumns} from "../../../utils/utils";
import {filterTheme} from "../RenderFilters.theme";
import {PageContext} from "../../../../../../../context";
import {ThemeContext, getComponentTheme} from "../../../../../../../../../ui/useTheme";

const resetColumn = (originalAttribute, setState, columns) => setState(draft => {
    const idx = columns.findIndex(column => isEqualColumns(column, originalAttribute));
    if (idx === -1) {
        draft.columns.splice(idx, 1);
    }
});
const RenderSearchKeySelector = ({filter, pageState, onChange}) => {
    const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
    const theme = { ...themeFromContext, filters: { ...filterTheme, ...getComponentTheme(themeFromContext, 'filters') } };
    const { Input } = UI || {};
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(filter.searchParamKey || '');
    const menuRef = React.useRef(null);
    const menuBtnId = `search-menu-btn-${filter.type}-${filter.operation}`;
    useHandleClickOutside(menuRef, menuBtnId, () => {setText(filter.searchParamKey || ''); setOpen(false)})
    return (
        <div className={theme.filters.searchKeySelectorWrapper}>
            <Input id={menuBtnId}
                   value={text}
                   onChange={e => setText(e.target.value)}
                   onFocus={() => setOpen(true)}
            />
            {
                open ? (
                    <div ref={menuRef} className={theme.filters.searchKeyMenuWrapper}>
                        {
                            text ? (
                                <div className={theme.filters.searchKeyMenuItem}
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
                                                           className={theme.filters.searchKeyMenuItem}
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
                                              loading, isEdit, filterColumn, filterOptions=[], state, setState, filterWithSearchParamKeys, columns, controlStyle: controlStyleProp, theme: themeProp
                                          }) => {
    const { pageState, updatePageStateFilters } =  React.useContext(PageContext) || {}; // page to extract page filters
    const { theme: themeFromContext = {}, UI} = React.useContext(ThemeContext) || {};
    // Prefer the ALREADY-RESOLVED theme RenderFilters.jsx passes down (it selects the section's
    // `display.filterStyle`, e.g. an author-picked named design) over re-deriving one here with NO
    // selector. Found live, 2026-09-04: re-deriving silently fell back to the filters.styles[0]
    // default for every key EXCEPT `controlStyle` (the one key RenderFilters already threaded
    // through separately) — so a named style's `filterRowWrapper`/`filtersWrapper`/etc. overrides
    // were dropped specifically for this component, even though `RenderFilters.jsx`'s own render
    // (the label, the toggle button, …) picked them up correctly. The local fallback keeps this
    // component usable if ever rendered without a parent providing `theme` (dms/CLAUDE.md's
    // "local-default spread" convention).
    const theme = themeProp || {...themeFromContext, filters: {...filterTheme, ...getComponentTheme(themeFromContext, 'filters')}};
    const {Switch, MultiSelect, Input, Button, ColumnTypes} = UI;
    const options = useMemo(() => filterOptions.find(fo => fo.column === filterColumn.name)?.uniqValues, [filterOptions, filterColumn.name]);
    // The value control's multiselect style comes from the active filter DESIGN
    // (theme.filters.<style>.controlStyle, passed down by RenderFilters), with a
    // legacy display.filterControlStyle fallback. Selecting a named theme style
    // (not a className passthrough) keeps the primitive's API closed.
    const controlStyle = controlStyleProp ?? state?.display?.filterControlStyle;

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
                <div key={`${filterColumn.name}-${filter.operation}`} className={theme.filters.filterRowWrapper}>
                    {
                        isEdit ? (
                            <div className={theme.filters.settingPillsWrapper}>
                                <MultiSelect
                                    activeStyle={controlStyle}
                                    singleSelectOnly
                                    searchable={false}
                                    value={filter.type}
                                    options={[
                                        { label: 'internal', value: 'internal' },
                                        { label: 'external', value: 'external' },
                                    ]}
                                    onChange={v => updateFilter({
                                        key: 'type',
                                        value: v,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                />

                                <MultiSelect
                                    activeStyle={controlStyle}
                                    singleSelectOnly
                                    searchable={false}
                                    value={filter.operation}
                                    options={[
                                        { label: 'include', value: 'filter' },
                                        { label: 'exclude', value: 'exclude' },
                                        { label: 'text', value: 'like' },
                                        { label: ' > ', value: 'gt' },
                                        { label: ' >= ', value: 'gte' },
                                        { label: ' < ', value: 'lt' },
                                        { label: ' <= ', value: 'lte' },
                                    ]}
                                    onChange={v => updateFilter({
                                        key: 'operation',
                                        value: v,
                                        filterColumn,
                                        filter,
                                        setState
                                    })}
                                />

                                {
                                    isGrouping ?
                                        <MultiSelect
                                    activeStyle={controlStyle}
                                            singleSelectOnly
                                            searchable={false}
                                            value={filter.fn}
                                            options={[
                                                { label: 'no fn', value: '' },
                                                { label: 'sum', value: 'sum' },
                                                { label: 'count', value: 'count' },
                                                { label: 'max', value: 'max' },
                                                { label: 'list', value: 'list' },
                                            ]}
                                            onChange={v => updateFilter({
                                                key: 'fn',
                                                value: v,
                                                filterColumn,
                                                filter,
                                                setState
                                            })}
                                        /> : null
                                }

                                {
                                    ['filter', 'exclude'].includes(filter.operation) ? (
                                        <div className={theme.filters.inlineSwitchRow}>
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

                                {
                                    // Single-select only: does the published control offer an × to
                                    // clear back to no-constraint? Off by default — some filters are
                                    // meant to always hold a value (a Year the page is built around),
                                    // others need the way back (a Region that starts statewide).
                                    ['filter', 'exclude'].includes(filter.operation) && !filter.isMulti ? (
                                        <div className={theme.filters.inlineSwitchRow}>
                                            <label className={theme.filters.settingLabel}>Allow clear: </label>
                                            <Switch label={'Allow clear'}
                                                    enabled={filter.allowClear}
                                                    setEnabled={value => updateFilter({
                                                        key: 'allowClear',
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
                                <div className={theme.filters.inlineSwitchRow}>
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
                                        <div className={theme.filters.searchKeyRow}>
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

                                <MultiSelect
                                    activeStyle={controlStyle}
                                    singleSelectOnly
                                    searchable={false}
                                    value={filter.display}
                                    options={[
                                        { label: 'compact', value: '' },
                                        { label: 'expanded', value: 'expanded' },
                                        { label: 'tabular', value: 'tabular' },
                                    ]}
                                    onChange={v => updateFilter({
                                        key: 'display',
                                        value: v,
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
                        activeStyle={controlStyle}
                        className={theme.filters.input}
                        loading={loading}
                        value={value}
                        placeholder={
                            // A leaf may author its own placeholder (mirrors the same
                            // `node.placeholder` fallback ConditionValueInput.jsx already has for
                            // the v2 filter-tree path — this component is the v1 `columns[].filters[]`
                            // path, which had no equivalent). gt/gte/lt/lte render a number input
                            // (see `type` below) — keep the numeric hint there. filter/exclude are
                            // option searches — name the column being searched. like keeps its
                            // generic text-search hint (its column names often already read as
                            // search prompts) unless the leaf overrides it.
                            filter.placeholder || (
                                filter.operation === 'like' ? 'search...' :
                                    ['filter', 'exclude'].includes(filter.operation)
                                        ? `Search ${filterColumn.customName || filterColumn.display_name || filterColumn.name}...`
                                        : 'Please enter a number...'
                            )
                        }
                        options={['filter', 'exclude'].includes(filter.operation) ? (options || []) : undefined}
                        singleSelectOnly={['filter', 'exclude'].includes(filter.operation) ? !filter.isMulti : undefined}
                        // Single-select pickers can offer an × that clears back to no-constraint: it
                        // emits [] and the onChange below drops the key from the page filters, so the
                        // control isn't stuck on its first pick. Author-controlled per filter
                        // (`allowClear`, default off) because some filters are meant to always hold a
                        // value. ConditionValueInput (the filter-TREE path) always allows it — that's
                        // an authoring surface, not a published one.
                        allowDeselect={['filter', 'exclude'].includes(filter.operation) ? (!filter.isMulti && Boolean(filter.allowClear)) : undefined}
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
