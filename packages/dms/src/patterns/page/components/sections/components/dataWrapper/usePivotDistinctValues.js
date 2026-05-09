import { useEffect, useRef } from "react";
import { getData } from "./getData";

const slug = (v) =>
    String(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function computePivotFetchKey(state) {
    try {
        const pivot = state.pivot;
        if (!pivot?.enabled || !pivot?.pivotColumn) return null;
        return JSON.stringify({
            pivotColumn: pivot.pivotColumn,
            maxValues: pivot.maxValues || 10,
            view_id: state.externalSource?.view_id,
            source_id: state.externalSource?.source_id,
            filters: state.filters,
        });
    } catch {
        return null;
    }
}

/**
 * usePivotDistinctValues — fetches distinct values for the pivot column and
 * injects ephemeral pivot_col columns into state.columns.
 *
 * Fires when pivot.enabled + pivot.pivotColumn changes (or when the source view
 * or active filters change). Uses a minimal getData call that groups by the pivot
 * column only, respecting the section's current filters, limited to maxValues rows.
 *
 * When pivot is disabled or pivotColumn is unset, clears any existing pivot_col
 * columns from state.columns and resets state.pivot.distinctValues.
 *
 * Uses the same fetchKey dedup pattern as useDataLoader: only re-fetches when the
 * relevant state actually changes, not on every mount/render.
 */
export function usePivotDistinctValues({ state, setState, apiLoad }) {
    const pivotEnabled = state.pivot?.enabled;
    const pivotColumn = state.pivot?.pivotColumn;

    const fetchKey = computePivotFetchKey(state);

    // Start null so the initial fetch always fires on mount (to get fresh distinct
    // values). pivot_col columns are persisted in the save payload so the table
    // renders immediately; the fetch updates them in the background.
    const lastFetchKeyRef = useRef(null);
    // Counter-based stale-request guard: only the most recent fetch writes to state.
    const reqRef = useRef(0);

    useEffect(() => {
        if (!pivotEnabled || !pivotColumn) {
            setState(draft => {
                if (!draft) return;
                const hasPivotCols = (draft.columns || []).some(c => c.origin === 'pivot_col');
                if (hasPivotCols) {
                    draft.columns = draft.columns.filter(c => c.origin !== 'pivot_col');
                }
                if (draft.pivot) draft.pivot.distinctValues = [];
            });
            lastFetchKeyRef.current = null;
            return;
        }

        // Dedup: skip if the relevant pivot state hasn't changed.
        if (fetchKey === lastFetchKeyRef.current) return;

        const reqId = ++reqRef.current;

        async function fetchDistinct() {
            const minimalState = {
                externalSource: state.externalSource,
                columns: [{ name: pivotColumn, group: true, show: true }],
                filters: state.filters || { op: 'AND', groups: [] },
                display: { pageSize: state.pivot?.maxValues || 10 },
                join: {},
            };

            try {
                const { data } = await getData({ state: minimalState, apiLoad });
                if (reqId !== reqRef.current) return;

                const distinctValues = (data || [])
                    .map(r => r[pivotColumn])
                    .filter(v => v != null && v !== '');

                lastFetchKeyRef.current = fetchKey;

                setState(draft => {
                    if (!draft?.pivot) return;
                    draft.pivot.distinctValues = distinctValues;
                    draft.columns = [
                        ...(draft.columns || []).filter(c => c.origin !== 'pivot_col'),
                        ...distinctValues.map(v => ({
                            name: `${pivotColumn}_${slug(v)}`,
                            display_name: String(v),
                            show: true,
                            origin: 'pivot_col',
                            _pivotValue: v,
                        })),
                    ];
                });
            } catch (e) {
                console.error('usePivotDistinctValues: fetch error', e);
            }
        }

        fetchDistinct();
    }, [fetchKey]);
}
