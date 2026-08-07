import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {uniqBy} from "lodash-es";
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {ComponentContext} from "../../context";
import {PageContext} from "../../context";
import {attributeAccessorStr} from "./components/dataWrapper/utils/utils";
import {
    getData,
    formattedAttributeStr,
    isCalculatedCol,
    isSystemCol,
    parseIfJson
} from "./components/dataWrapper/components/filters/utils";
import {resolveFilterGroupsForQuery} from "./components/dataWrapper/buildUdaConfig";
import {TimePicker} from "./components/dataWrapper/components/filters/TimePicker/TimePicker";
import {serializeTimeFilterURL} from "./components/dataWrapper/utils/timeFilter";
import {complexFiltersTheme} from "./ComplexFilters.theme";

const OPTIONS_LIMIT = 100;

const parseDataOptions = (data, reqName) =>
    data.reduce((acc, d) => {
        const responseValue = d[reqName]?.value || d[reqName];
        const metaValue = parseIfJson(responseValue?.value || responseValue);
        const originalValue = parseIfJson(responseValue?.originalValue || responseValue);

        const values = Array.isArray(originalValue)
            ? originalValue.map((pv, i) => ({label: metaValue?.[i] || pv, value: pv}))
            : [{label: metaValue || originalValue, value: originalValue}];

        values.forEach(({label, value}) => {
            if (label && typeof label !== 'object') acc.push({label, value});
        });
        return acc;
    }, []);

const sortOptions = (options) =>
    options.sort((a, b) =>
        typeof a?.label === 'string' && typeof b?.label === 'string'
            ? a.label.localeCompare(b.label)
            : b?.label - a?.label
    );

const OPTIONS_COUNT_ATTR = 'count(1) as _count';

// Fetches unique values for a column (for filter/exclude multiselect).
// When withCounts=true, also fetches per-value row counts via a grouped query.
// metaOptions: predefined {label,value} pairs — those missing from server results appear with count 0.
// `siblingFilterTree`: a filter-tree node (`{op, groups:[...]}`, or null/undefined for
// none) representing everything else that should narrow this column's options — NOT a
// flat list. Callers build this from whatever leaves actually apply: ComplexFilters'
// own leaf editor wraps its immediate-group siblings as `{op:'AND', groups: siblings}`;
// TableHeaderCell's server filter wraps the merged persisted-tree + tableFilters group
// (see mergeTableFilters/pruneColumnFromFilterTree/restrictFilterTreeToSource in
// buildUdaConfig.js). Passing a real tree (instead of a hand-flattened list) means this
// hook can reuse buildUdaConfig's own leaf-shape handling below instead of a second,
// independently-drifting reducer.
export const useColumnOptions = (columnName, columns, operation, search, selectedValues, siblingFilterTree = null, col_source_id = null, withCounts = false, metaOptions = []) => {
    const {apiLoad, state} = useContext(ComponentContext) || {};
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const prevSearchRef = useRef('');

    const { join } = state || {};

    const sourceInfo =
      (!col_source_id || col_source_id === state?.externalSource.source_id)
        ? state.externalSource
        : Object.values(join.sources || {}).find((s) => s.source === col_source_id)?.sourceInfo;
    const isDms = sourceInfo?.isDms;

    // Mirrors buildUdaConfig's getFilterColumn: `columns` (the section's display config)
    // first, then fall back to the raw source schema — externalSource.columns plus any
    // join sources' columns. A filter leaf can reference a real source column that was
    // never added to (or was mistakenly renamed/removed from) the display config; without
    // this fallback such a leaf silently fails to resolve (getColumn returns undefined,
    // mapFilterGroupCols passes the leaf through unmapped — no data->> wrapping, no value
    // normalization) even though the column genuinely exists on the source.
    const allSourceColumns = useMemo(() => {
        const joinCols = Object.values(join?.sources || {})
            .flatMap((s) => s.sourceInfo?.columns || []);
        return [...(state?.externalSource?.columns || []), ...joinCols];
    }, [state?.externalSource, join]);

    const getColumnRef = useCallback(
        (name) => columns.find(c => c.name === name) || allSourceColumns.find(c => c.name === name),
        [columns, allSourceColumns]
    );

    // Reuse buildUdaConfig's own normalFilter/HAVING-extraction + column-mapping pipeline
    // on the sibling tree, instead of hand-rolling a filterBy per leaf — see
    // resolveFilterGroupsForQuery for why (unary/time/multiselect/HAVING leaf shapes all
    // need the same handling the main query already gets right).
    const filterGroups = useMemo(
        () => resolveFilterGroupsForQuery(siblingFilterTree, getColumnRef, isDms),
        [siblingFilterTree, getColumnRef, isDms]
    );
    // Stable dep key — only recompute the query when the resolved filterGroups actually change
    const filterGroupsKey = useMemo(() => JSON.stringify(filterGroups), [filterGroups]);

    const metaOptionsKey = useMemo(() => JSON.stringify((metaOptions || []).map(o => o.value)), [metaOptions]);

    useEffect(() => {
        if (!['filter', 'exclude'].includes(operation)) {
            setOptions([]);
            return;
        }
        if (!apiLoad || !sourceInfo || !columnName) return;

        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const isCalc = isCalculatedCol(columnName, columns);
                const isSys = isSystemCol(columnName, columns);
                const reqName = formattedAttributeStr(columnName, isDms, isCalc);
                const refName = attributeAccessorStr(columnName, isDms, isCalc, isSys);

                // filterGroups already carries every sibling condition, correctly mapped to
                // server refs and with unary/time/multiselect/HAVING leaf shapes resolved the
                // same way the main query resolves them (see resolveFilterGroupsForQuery).
                const baseFilterBy = filterGroups ? { filterGroups } : {};
                const filterBy = search
                    ? { ...baseFilterBy, like: { [refName]: `%${search}%` } }
                    : baseFilterBy;

                let allOptions;
                if (withCounts) {
                    // GROUP BY already produces unique values + counts in one query — no need
                    // for a separate DISTINCT fetch or a getLength preflight.
                    const countAttrs = [reqName, OPTIONS_COUNT_ATTR];
                    const {name: metaName, display, meta_lookup} = columns.find(a => a.name === reqName || a.name === columnName) || {};
                    const meta = ['meta-variable', 'geoid-variable', 'meta'].includes(display) && meta_lookup ? {[metaName]: meta_lookup} : {};
                    const countData = await apiLoad({
                        app: sourceInfo.app,
                        type: sourceInfo.type,
                        format: sourceInfo,
                        attributes: countAttrs,
                        children: [{
                            type: () => {},
                            action: 'uda',
                            path: '/',
                            filter: {
                                fromIndex: 0,
                                toIndex: OPTIONS_LIMIT - 1,
                                options: JSON.stringify({
                                    ...filterBy,
                                    meta,
                                    groupBy: [refName],
                                    keepOriginalValues: true,
                                }),
                                attributes: countAttrs,
                                stopFullDataLoad: true,
                            },
                        }],
                    }).catch(e => {
                        console.warn('useColumnOptions: count query failed', e);
                        return [];
                    });
                    if (cancelled) return;

                    // Build countMap and raw options from the same result set
                    const countMap = new Map();
                    const rawOptions = [];
                    (countData || []).forEach(row => {
                        const parsed = parseDataOptions([row], reqName);
                        const count = parseInt(row[OPTIONS_COUNT_ATTR] ?? '0', 10) || 0;
                        parsed.forEach(opt => {
                            if (opt.value != null) {
                                countMap.set(String(opt.value), (countMap.get(String(opt.value)) || 0) + count);
                                rawOptions.push(opt);
                            }
                        });
                    });

                    const fetched = uniqBy(rawOptions, d => d.value);
                    const withCountLabels = fetched.map(opt => ({
                        ...opt,
                        label: countMap.has(String(opt.value))
                            ? `${opt.label} (${countMap.get(String(opt.value))})`
                            : opt.label,
                    }));
                    const fetchedValueSet = new Set(fetched.map(o => String(o.value)));
                    const missingMeta = (metaOptions || [])
                        .filter(o => o.value != null && !fetchedValueSet.has(String(o.value)))
                        .map(o => ({ ...o, label: `${o.label} (0)` }));
                    allOptions = [...withCountLabels, ...missingMeta];
                } else {
                    const data = await getData({
                        format: sourceInfo,
                        apiLoad,
                        reqName,
                        refName,
                        rawName: columnName,
                        allAttributes: columns,
                        filterBy,
                        limit: OPTIONS_LIMIT,
                    });
                    if (cancelled) return;
                    allOptions = uniqBy(parseDataOptions(data, reqName), d => d.value);
                }

                // merge selected values so they stay visible in the list
                const selectedSet = new Set((selectedValues || []).map(v => v?.value ?? v));
                if (search && selectedSet.size) {
                    setOptions(prev => {
                        const selectedFromPrev = prev.filter(o => selectedSet.has(o.value));
                        return sortOptions(uniqBy([...selectedFromPrev, ...allOptions], d => d.value));
                    });
                } else {
                    setOptions(sortOptions(allOptions));
                }
            } catch (e) {
                console.error('ConditionValueInput: failed to load options', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        prevSearchRef.current = search;
        return () => { cancelled = true; };
    }, [columnName, operation, search, apiLoad, sourceInfo, isDms, columns, filterGroupsKey, withCounts, metaOptionsKey]);

    return {options, loading};
};

export const ConditionValueInput = ({node, path, columns, updateNodeAtPath, siblingConditions = [], activeStyle}) => {
    const {UI, theme: themeFromContext = {}} = useContext(ThemeContext) || {};
    const {ColumnTypes} = UI;
    const t = { ...complexFiltersTheme, ...getComponentTheme(themeFromContext, 'complexFilters') };
    const {pageState, updatePageStateFilters} = useContext(PageContext) || {};

    const [search, setSearch] = useState('');
    const isMultiselect = ['filter', 'exclude'].includes(node.op);
    const selectedValues = isMultiselect ? (Array.isArray(node.value) ? node.value : []) : [];

    // All hooks must run unconditionally — the op-based branch below changes
    // when the user toggles between 'time' and other ops, and React requires
    // a stable hook-call order across renders. useColumnOptions is a no-op
    // for non-multiselect ops (it short-circuits internally) so running it
    // for the 'time' op costs nothing.
    // siblingConditions (this leaf's immediate-group siblings, computed by
    // ComplexFilters.jsx's renderNode) is wrapped as a tree so useColumnOptions can
    // run the same leaf-shape pipeline TableHeaderCell's server filters use — the
    // narrowing SCOPE (same-AND-group siblings only) is unchanged from before.
    const siblingFilterTree = siblingConditions.length ? { op: 'AND', groups: siblingConditions } : null;
    const {options, loading} = useColumnOptions(node.col, columns, node.op, search, selectedValues, siblingFilterTree, node.source_id);

    const onSearch = useCallback((term) => setSearch(term), []);

    // The `time` op carries a structured value object — render the TimePicker
    // editor instead of the multiselect / scalar paths below. Branching here
    // (after all hooks have been called) keeps hook order stable.
    if (node.op === 'time') {
        const handleTimeChange = (next) => {
            updateNodeAtPath(path, n => { n.value = next; });
            // When this leaf is wired to URL search params, also push the
            // compact token to pageState so the URL stays in sync. We only
            // serialize what the Phase 2 token grammar can express; richer
            // values (multi-range OR, DOW, time-of-day) round-trip through
            // node.value but not through the URL until Phase 3.
            if (node.usePageFilters && updatePageStateFilters) {
                const searchKey = node.searchParamKey || node.col;
                const token = serializeTimeFilterURL(next);
                const currentPageFilters = (pageState?.filters || [])
                    .filter(f => f.searchKey !== searchKey)
                    .map(f => ({searchKey: f.searchKey, values: f.values}));
                if (token) currentPageFilters.push({ searchKey, values: [token] });
                updatePageStateFilters(currentPageFilters, { [searchKey]: !token });
            }
        };
        return (
            <TimePicker
                value={node.value && typeof node.value === 'object' && !Array.isArray(node.value) ? node.value : {}}
                onChange={handleTimeChange}
                columns={columns}
                startCol={node.col}
            />
        );
    }

    const selector = isMultiselect ? 'multiselect' : 'text';
    const Comp = ColumnTypes[selector].EditComp;

    const value = isMultiselect
        ? selectedValues
        : (Array.isArray(node.value) ? node.value[0] ?? '' : node.value ?? '');

    const column = columns.find(c => c.name === node.col);
    const isNumber = column?.type === 'number' || ['gt', 'gte', 'lt', 'lte'].includes(node.op);

    return (
        <Comp
            activeStyle={activeStyle}
            className={t.valueComp}
            loading={loading}
            value={value}
            placeholder={node.op === 'like' ? 'search...' : isMultiselect ? 'select...' : 'enter a number...'}
            options={isMultiselect ? options : undefined}
            singleSelectOnly={isMultiselect ? !node.isMulti : undefined}
            // Single-select filter pickers stay clearable: an × deselects back to
            // "no value" (emits []), so an unset page-filter widens (no constraint)
            // instead of being stuck on the first picked value.
            allowDeselect={isMultiselect && !node.isMulti}
            displayDetailedValues={!node.display}
            keepMenuOpen={node.display === 'expanded'}
            tabular={node.display === 'tabular'}
            type={isMultiselect ? undefined : node.op === 'like' ? 'text' : 'number'}
            displayInvalidMsg={false}
            onWheel={e => e.target.blur()}
            onSearch={isMultiselect ? onSearch : undefined}
            onChange={e => {
                let newValues;
                if (isMultiselect) {
                    newValues = (Array.isArray(e) ? e : [e]).map(item => item?.value ?? item);
                } else {
                    newValues = isNumber && e ? [+e] : [e];
                }

                updateNodeAtPath(path, n => {
                    n.value = isMultiselect ? newValues : (isNumber && e ? +e : e);
                });

                if (node.usePageFilters && updatePageStateFilters) {
                    const searchKey = node.searchParamKey || node.col;
                    const currentPageFilters = (pageState?.filters || [])
                        .filter(f => f.searchKey !== searchKey)
                        .map(f => ({searchKey: f.searchKey, values: f.values}));

                    if (newValues.length) {
                        currentPageFilters.push({searchKey, values: newValues});
                    }

                    updatePageStateFilters(currentPageFilters, {[searchKey]: !newValues.length});
                }
            }}
        />
    );
};
