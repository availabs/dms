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
export const useColumnOptions = (columnName, columns, operation, search, selectedValues, siblingConditions = [], col_source_id = null, withCounts = false, metaOptions = []) => {
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

    // Stable dep key — only recompute when sibling values actually change
    const siblingFilterByKey = useMemo(() => JSON.stringify(
        siblingConditions
            .filter(s => s.col && s.value != null && (Array.isArray(s.value) ? s.value.length > 0 : s.value !== ''))
            .map(s => ({ col: s.col, op: s.op, value: s.value }))
    ), [siblingConditions]);

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

                // Build filterBy from sibling conditions with values
                const siblingFilterBy = siblingConditions.reduce((acc, sibling) => {
                    const val = sibling.value;
                    if (!sibling.col || val == null || (Array.isArray(val) ? !val.length : val === '')) return acc;
                    const sibIsCalc = isCalculatedCol(sibling.col, columns);
                    const sibIsSys = isSystemCol(sibling.col, columns);
                    const sibRef = attributeAccessorStr(sibling.col, isDms, sibIsCalc, sibIsSys);
                    const values = Array.isArray(val) ? val : [val];
                    // Multiselect columns store JSON arrays — use array_contains so the
                    // server checks array membership instead of scalar equality (= ANY).
                    const sibCol = columns.find(c => c.name === sibling.col);
                    if (sibCol?.type === 'multiselect' && (sibling.op === 'filter' || sibling.op === 'exclude')) {
                        const arrayOp = sibling.op === 'exclude' ? 'array_not_contains' : 'array_contains';
                        if (!acc.filterGroups) acc.filterGroups = { op: 'AND', groups: [] };
                        acc.filterGroups.groups.push({ col: sibRef, op: arrayOp, value: values });
                    } else if (sibling.op === 'like') {
                        // flat filterBy.like expects a scalar string with % wildcards already embedded,
                        // not an array — same format the search path uses: `%${search}%`
                        const raw = Array.isArray(val) ? val[0] : val;
                        if (raw != null && raw !== '') {
                            acc.like = { ...(acc.like || {}), [sibRef]: `%${raw}%` };
                        }
                    } else {
                        acc[sibling.op] = { ...(acc[sibling.op] || {}), [sibRef]: values };
                    }
                    return acc;
                }, {});

                const filterBy = search
                    ? { ...siblingFilterBy, like: { ...(siblingFilterBy.like || {}), [refName]: `%${search}%` } }
                    : siblingFilterBy;

                const dataPromise = getData({
                  format: sourceInfo,
                  apiLoad,
                  reqName,
                  refName,
                  rawName: columnName,
                  allAttributes: columns,
                  filterBy,
                  limit: OPTIONS_LIMIT,
                });

                // Parallel grouped count query — same filterBy so counts match current filter state
                let countPromise = Promise.resolve([]);
                if (withCounts) {
                    const countAttrs = [reqName, OPTIONS_COUNT_ATTR];
                    countPromise = apiLoad({
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
                }

                const [data, countData] = await Promise.all([dataPromise, countPromise]);
                if (cancelled) return;

                // Build value→count map from grouped count rows
                const countMap = new Map();
                if (withCounts && countData?.length) {
                    countData.forEach(row => {
                        const parsed = parseDataOptions([row], reqName);
                        const count = parseInt(row[OPTIONS_COUNT_ATTR] ?? '0', 10) || 0;
                        parsed.forEach(opt => {
                            if (opt.value != null) countMap.set(String(opt.value), count);
                        });
                    });
                }

                const fetched = uniqBy(parseDataOptions(data, reqName), d => d.value);

                let allOptions;
                if (withCounts) {
                    const withCountLabels = fetched.map(opt => ({
                        ...opt,
                        label: countMap.has(String(opt.value))
                            ? `${opt.label} (${countMap.get(String(opt.value))})`
                            : opt.label,
                    }));
                    // Predefined options not returned by server get count 0
                    const fetchedValueSet = new Set(fetched.map(o => String(o.value)));
                    const missingMeta = (metaOptions || [])
                        .filter(o => o.value != null && !fetchedValueSet.has(String(o.value)))
                        .map(o => ({ ...o, label: `${o.label} (0)` }));
                    allOptions = [...withCountLabels, ...missingMeta];
                } else {
                    allOptions = fetched;
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
    }, [columnName, operation, search, apiLoad, sourceInfo, isDms, columns, siblingFilterByKey, withCounts, metaOptionsKey]);

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
    const {options, loading} = useColumnOptions(node.col, columns, node.op, search, selectedValues, siblingConditions, node.source_id);

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
