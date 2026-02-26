import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {uniqBy} from "lodash-es";
import {ThemeContext} from "../../../../ui/useTheme";
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

// Fetches unique values for a column (for filter/exclude multiselect)
const useColumnOptions = (columnName, columns, operation, search, selectedValues) => {
    const {apiLoad, state} = useContext(ComponentContext) || {};
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const prevSearchRef = useRef('');

    const sourceInfo = state?.sourceInfo;
    const isDms = sourceInfo?.isDms;

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

                const filterBy = search
                    ? { like: { [refName]: `%${search}%` } }
                    : {};

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

                const fetched = uniqBy(parseDataOptions(data, reqName), d => d.value);

                // merge selected values so they stay visible in the list
                const selectedSet = new Set((selectedValues || []).map(v => v?.value ?? v));
                if (search && selectedSet.size) {
                    setOptions(prev => {
                        const selectedFromPrev = prev.filter(o => selectedSet.has(o.value));
                        return sortOptions(uniqBy([...selectedFromPrev, ...fetched], d => d.value));
                    });
                } else {
                    setOptions(sortOptions(fetched));
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
    }, [columnName, operation, search, apiLoad, sourceInfo, isDms, columns]);

    return {options, loading};
};

export const ConditionValueInput = ({node, path, columns, updateNodeAtPath}) => {
    const {UI} = useContext(ThemeContext);
    const {ColumnTypes} = UI;
    const {pageState, updatePageStateFilters} = useContext(PageContext) || {};

    const [search, setSearch] = useState('');
    const isMultiselect = ['filter', 'exclude'].includes(node.op);
    const selectedValues = isMultiselect ? (Array.isArray(node.value) ? node.value : []) : [];

    const {options, loading} = useColumnOptions(node.col, columns, node.op, search, selectedValues);

    const onSearch = useCallback((term) => setSearch(term), []);

    const selector = isMultiselect ? 'multiselect' : 'text';
    const Comp = ColumnTypes[selector].EditComp;

    const value = isMultiselect
        ? selectedValues
        : (Array.isArray(node.value) ? node.value[0] ?? '' : node.value ?? '');

    const column = columns.find(c => c.name === node.col);
    const isNumber = column?.type === 'number' || ['gt', 'gte', 'lt', 'lte'].includes(node.op);

    return (
        <Comp
            className={'w-full max-h-[150px] flex text-xs overflow-auto scrollbar-sm border rounded-md bg-white p-2'}
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
