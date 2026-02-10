import React, {useContext, useEffect, useMemo, useState} from "react";
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

// Fetches unique values for a column (for filter/exclude multiselect)
const useColumnOptions = (columnName, columns, operation) => {
    const {apiLoad, state} = useContext(ComponentContext) || {};
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);

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

                const data = await getData({
                    format: sourceInfo,
                    apiLoad,
                    reqName,
                    refName,
                    rawName: columnName,
                    allAttributes: columns,
                });

                if (cancelled) return;

                const dataOptions = data.reduce((acc, d) => {
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

                setOptions(
                    uniqBy(dataOptions, d => d.value)
                        .sort((a, b) =>
                            typeof a?.label === 'string' && typeof b?.label === 'string'
                                ? a.label.localeCompare(b.label)
                                : b?.label - a?.label
                        )
                );
            } catch (e) {
                console.error('ConditionValueInput: failed to load options', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [columnName, operation, apiLoad, sourceInfo, isDms, columns]);

    return {options, loading};
};

export const ConditionValueInput = ({node, path, columns, updateNodeAtPath}) => {
    const {UI} = useContext(ThemeContext);
    const {ColumnTypes} = UI;
    const {pageState, updatePageStateFilters} = useContext(PageContext) || {};
    const {options, loading} = useColumnOptions(node.col, columns, node.op);

    const isMultiselect = ['filter', 'exclude'].includes(node.op);
    const selector = isMultiselect ? 'multiselect' : 'text';
    const Comp = ColumnTypes[selector].EditComp;

    const value = isMultiselect
        ? (Array.isArray(node.value) ? node.value : [])
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
            type={isMultiselect ? undefined : node.op === 'like' ? 'text' : 'number'}
            displayInvalidMsg={false}
            onWheel={e => e.target.blur()}
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
