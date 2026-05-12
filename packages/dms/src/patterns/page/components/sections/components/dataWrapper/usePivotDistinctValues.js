import { useEffect, useRef } from "react";
import { getData } from "./getData";

const slug = (v) =>
    String(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// For calculated columns ("expr as alias"), return the alias; otherwise the name as-is.
const colKey = (name) => {
    const parts = name.split(/\s+as\s+/i);
    return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

const cartesian = (arrays) =>
    arrays.reduce((acc, arr) => acc.flatMap(combo => arr.map(val => [...combo, val])), [[]]);

function computePivotFetchKey(state) {
    try {
        const pivot = state.pivot;
        // Normalize legacy single-column format
        const pivotColumns = pivot?.pivotColumns?.length ? pivot.pivotColumns
            : pivot?.pivotColumn ? [pivot.pivotColumn] : [];
        if (!pivot?.enabled || !pivotColumns.length) return null;
        return JSON.stringify({
            pivotColumns,
            maxValues: pivot.maxValues || 10,
            singleHeader: !!pivot.singleHeader,
            view_id: state.externalSource?.view_id,
            source_id: state.externalSource?.source_id,
            filters: state.filters,
        });
    } catch {
        return null;
    }
}

/**
 * usePivotDistinctValues — fetches distinct values for each pivot column and
 * injects ephemeral pivot_col columns (cartesian product) into state.columns.
 *
 * Supports multiple pivot columns: each combination of distinct values becomes
 * one CASE column with a compound name (e.g. direction_n__vehicle_type_car)
 * and a readable display_name (e.g. "N / car").
 *
 * Uses the same fetchKey dedup pattern as useDataLoader: only re-fetches when
 * the relevant state actually changes, not on every mount/render.
 */
export function usePivotDistinctValues({ state, setState, apiLoad }) {
    const pivot = state.pivot;
    const pivotEnabled = pivot?.enabled;
    const singleHeader = !!pivot?.singleHeader;
    // Normalize legacy single-column saved configs
    const pivotColumns = pivot?.pivotColumns?.length ? pivot.pivotColumns
        : pivot?.pivotColumn ? [pivot.pivotColumn] : [];

    const fetchKey = computePivotFetchKey(state);

    // Always start null on mount so the initial fetch fires to get fresh values.
    // pivot_col columns are persisted in the save payload so the table renders
    // immediately; the fetch updates them in the background.
    const lastFetchKeyRef = useRef(null);
    const reqRef = useRef(0);

    useEffect(() => {
        if (!pivotEnabled || !pivotColumns.length) {
            setState(draft => {
                if (!draft) return;
                if ((draft.columns || []).some(c => c.origin === 'pivot_col')) {
                    draft.columns = draft.columns.filter(c => c.origin !== 'pivot_col');
                }
                if (draft.pivot) draft.pivot.distinctValuesByColumn = {};
            });
            lastFetchKeyRef.current = null;
            return;
        }

        if (fetchKey === lastFetchKeyRef.current) return;

        const reqId = ++reqRef.current;
        const maxValues = pivot?.maxValues || 10;

        async function fetchDistinct() {
            try {
                // Fetch distinct values for each pivot column in parallel.
                const results = await Promise.all(
                    pivotColumns.map(col => getData({
                        state: {
                            externalSource: state.externalSource,
                            columns: [{ name: col, group: true, show: true }],
                            filters: state.filters || { op: 'AND', groups: [] },
                            display: { pageSize: maxValues },
                            join: {},
                        },
                        apiLoad,
                    }))
                );

                if (reqId !== reqRef.current) return;

                const distinctValuesByColumn = Object.fromEntries(
                    pivotColumns.map((col, i) => [
                        col,
                        (results[i].data || []).map(r => r[col]).filter(v => v != null && v !== ''),
                    ])
                );

                // Cartesian product of all distinct value arrays.
                const combinations = cartesian(pivotColumns.map(col => distinctValuesByColumn[col] || []));

                lastFetchKeyRef.current = fetchKey;

                setState(draft => {
                    if (!draft?.pivot) return;
                    draft.pivot.distinctValuesByColumn = distinctValuesByColumn;

                    // Snapshot existing pivot_col order and sizes before clearing.
                    const existingOrder = (draft.columns || [])
                        .filter(c => c.origin === 'pivot_col')
                        .map(c => c.name);
                    const existingSizes = Object.fromEntries(
                        (draft.columns || [])
                            .filter(c => c.origin === 'pivot_col' && c.size)
                            .map(c => [c.name, c.size])
                    );

                    const newPivotCols = combinations.map(combo => {
                        const name = combo.map((v, i) => `${slug(colKey(pivotColumns[i]))}_${slug(v)}`).join('__');
                        return {
                            name,
                            display_name: singleHeader || pivotColumns.length === 1
                                ? combo.join(' / ')
                                : String(combo[combo.length - 1]),
                            show: true,
                            origin: 'pivot_col',
                            ...(existingSizes[name] && { size: existingSizes[name] }),
                            ...(!singleHeader && pivotColumns.length > 1 && {
                                _pivotCombo: combo,
                                _pivotColumns: pivotColumns,
                            }),
                        };
                    });

                    // Preserve user-defined column order; new combinations go at end.
                    // Non-pivot columns (including row column) always precede pivot_col.
                    const orderedPivotCols = [
                        ...existingOrder
                            .map(name => newPivotCols.find(c => c.name === name))
                            .filter(Boolean),
                        ...newPivotCols.filter(c => !existingOrder.includes(c.name)),
                    ];

                    draft.columns = [
                        ...(draft.columns || []).filter(c => c.origin !== 'pivot_col'),
                        ...orderedPivotCols,
                    ];
                });
            } catch (e) {
                console.error('usePivotDistinctValues: fetch error', e);
            }
        }

        fetchDistinct();
    }, [fetchKey]);
}
