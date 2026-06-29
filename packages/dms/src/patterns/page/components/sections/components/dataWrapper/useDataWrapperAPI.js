/**
 * useDataWrapperAPI — structured editing interface for dataWrapper config.
 *
 * Wraps raw setState calls from controls_utils.js into named operations.
 * External consumers (section menu, page data sources panel, modal editors)
 * call this API instead of raw setState.
 *
 * In Phase 3, state lives in section.jsx (useImmer). In Phase 5, config
 * moves to page-level dataSources — the API signature stays the same,
 * only the backing store changes.
 *
 * @param {Object}   state    - dataWrapper immer state
 * @param {Function} setState - immer updater
 * @returns {Object} API object with config, runtime, and mutation methods
 */

import { useCallback, useMemo, useRef } from "react";
import {
    updateColumns as updateColumnsFn,
    updateAllColumns as updateAllColumnsFn,
    duplicate as duplicateFn,
    resetColumn as resetColumnFn,
    resetAllColumns as resetAllColumnsFn,
    toggleIdFilter as toggleIdFilterFn,
    toggleGlobalVisibility as toggleGlobalVisibilityFn,
    addFormulaColumn as addFormulaColumnFn,
    addCalculatedColumn as addCalculatedColumnFn,
    updateDisplayValue as updateDisplayValueFn,
} from "../../controls_utils";

// Re-export from schema.js for backward compat
import { RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS } from "./schema";
export { RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS };

export function useDataWrapperAPI({ state, setState }) {
    // Keep a mutable ref to current state so the stable API object's getters
    // always return live data. This lets us exclude state from the useMemo deps,
    // preventing the handle → onHandle → parent re-render → new dwAPI → new handle
    // infinite loop that occurs without React Compiler.
    const stateRef = useRef(state);
    stateRef.current = state;
    // ── Display operations ──
    const setDisplay = useCallback(
        (key, value, onChange) => updateDisplayValueFn(key, value, onChange, setState),
        [setState]
    );

    // ── Column operations ──
    const updateColumn = useCallback(
        (column, key, value, onChange) => updateColumnsFn(column, key, value, onChange, setState),
        [setState]
    );
    const updateAllColumns = useCallback(
        (key, value, onChange) => updateAllColumnsFn(key, value, onChange, setState),
        [setState]
    );
    const duplicateColumn = useCallback(
        (column) => duplicateFn(column, setState),
        [setState]
    );
    const resetColumn = useCallback(
        (column) => resetColumnFn(column, setState),
        [setState]
    );
    const resetAllColumns = useCallback(
        () => resetAllColumnsFn(setState),
        [setState]
    );
    const toggleIdFilter = useCallback(
        () => toggleIdFilterFn(setState),
        [setState]
    );
    const toggleGlobalVisibility = useCallback(
        (show) => toggleGlobalVisibilityFn(show, setState),
        [setState]
    );
    const addFormulaColumn = useCallback(
        (column) => addFormulaColumnFn(column, setState),
        [setState]
    );
    const addCalculatedColumn = useCallback(
        (column) => addCalculatedColumnFn(column, setState),
        [setState]
    );
    const reorderColumns = useCallback(
        (newOrder) => setState(draft => { draft.columns = newOrder; }),
        [setState]
    );

    // ── Pivot operations ──
    const setPivot = useCallback(
        (key, value) => setState(draft => {
            if (!draft.pivot) draft.pivot = { enabled: false, maxValues: 10, aggregateFn: 'count' };
            draft.pivot[key] = value;
            if (key === 'pivotColumns') {
                draft.pivot.distinctValuesByColumn = {};
                draft.columns = (draft.columns || []).filter(c => c.origin !== 'pivot_col');
            }
            if (key === 'rowColumn' && value) {
                const sourceCols = draft.externalSource?.columns || [];
                const sourceCol = sourceCols.find(c => c.name === value);
                if (sourceCol) {
                    const existing = (draft.columns || []).findIndex(c => c.name === value && !c.isDuplicate);
                    if (existing !== -1) {
                        const [col] = draft.columns.splice(existing, 1);
                        col.show = true;
                        draft.columns.unshift(col);
                    } else {
                        draft.columns = [{ ...sourceCol, show: true }, ...(draft.columns || [])];
                    }
                }
            }
        }),
        [setState]
    );

    //setCustomBuckets
    const setCustomBuckets = useCallback(
        (value) => setState(draft => {
            draft.customBuckets = value;
        }),
        [setState]
    );

    // Reconcile the synthetic custom-bucket column in state.columns to match the
    // committed alias. This is an explicit action (fired when the alias field is
    // committed — see sectionMenu) rather than a reactive effect, so typing the
    // alias no longer churns columns on every keystroke.
    //
    // Single-bucket model: the column is identified by origin alone, so an alias
    // change RENAMES the existing column instead of adding a duplicate. The
    // customBuckets config stays multi-capable (keyed by alias) for the future.
    const reconcileCustomBucketColumn = useCallback(
        () => setState(draft => {
            if (!draft) return;
            const alias = draft.customBuckets?.alias;
            const enabled = draft.customBuckets?.enabled === true;
            const idx = (draft.columns || []).findIndex(c => c.origin === 'custom-bucket');

            // No alias or master-off → the synthetic column shouldn't exist.
            // (Config stays on draft.customBuckets so re-enabling restores it.)
            if (!alias || !enabled) {
                if (idx !== -1) draft.columns.splice(idx, 1);
                return;
            }
            if (idx === -1) {
                draft.columns.push({
                    name: alias,
                    alias,
                    type: 'text',
                    show: true,
                    group: true,
                    isCalculatedColumn: false,
                    origin: 'custom-bucket',
                });
            } else {
                draft.columns[idx].name = alias;
                draft.columns[idx].alias = alias;
            }
        }),
        [setState]
    );

    // ── Comparison Series operations ──
    const setComparisonSeries = useCallback(
        (value) => setState(draft => {
            draft.comparisonSeries = value;
        }),
        [setState]
    );

    // Reconcile the synthetic comparison-series discriminator column in
    // state.columns. Like the custom-bucket reconcile, this is an explicit action
    // (fired when the master toggle / series-key field commits) rather than a
    // reactive effect. The column is identified by origin; a seriesKey change
    // renames it. Master-off / no labeled variants → the column shouldn't exist
    // (config stays on draft.comparisonSeries for clean re-enable). It defaults to
    // a categorize dimension so a graph renders one series per variant out of the box.
    const reconcileComparisonSeriesColumn = useCallback(
        () => setState(draft => {
            if (!draft) return;
            const cs = draft.comparisonSeries;
            const seriesKey = cs?.seriesKey || '__series';
            const enabled = cs?.enabled === true;
            // Variants come from either binding mode: static (cs.variants) OR a
            // dynamic "comparison_series" subscriber (Piece 3). For dynamic the list
            // resolves asynchronously into cs.config from page state — its presence
            // (even an empty []) means dynamic binding is active, as does an enabled
            // subscriber whose page value hasn't arrived yet. Either keeps the
            // synthetic categorize column so the chart is ready when data loads.
            const dynamicSubscriber = (draft.display?._functions?.subscribers || []).some(
                s => s.functionId === 'comparison_series' && s.enabled
            );
            const hasVariants =
                (Array.isArray(cs?.variants) && cs.variants.some(v => v && v.label)) ||
                Array.isArray(cs?.config) ||
                dynamicSubscriber;
            const idx = (draft.columns || []).findIndex(c => c.origin === 'comparison-series');

            if (!enabled || !hasVariants) {
                if (idx !== -1) draft.columns.splice(idx, 1);
                return;
            }
            if (idx === -1) {
                draft.columns.push({
                    name: seriesKey,
                    alias: seriesKey,
                    type: 'text',
                    show: true,
                    group: true,
                    target: 'categorize',
                    isCalculatedColumn: false,
                    origin: 'comparison-series',
                });
            } else {
                draft.columns[idx].name = seriesKey;
                draft.columns[idx].alias = seriesKey;
            }
        }),
        [setState]
    );

    return useMemo(() => ({
        // ── Read access (getters — always read live state via ref) ──
        get config() {
            const s = stateRef.current;
            return {
                columns: s?.columns,
                display: s?.display,
                externalSource: s?.externalSource,
                filters: s?.filters,
                join: s?.join,
                pivot: s?.pivot,
                customBuckets: s?.customBuckets,
                comparisonSeries: s?.comparisonSeries,
            };
        },
        get runtime() {
            const s = stateRef.current;
            return {
                data: s?.data,
                fullData: s?.fullData,
                localFilteredData: s?.localFilteredData,
                totalLength: s?.display?.totalLength,
                filteredLength: s?.display?.filteredLength,
                invalidState: s?.display?.invalidState,
                hideSection: s?.display?.hideSection,
                outputSourceInfo: s?.outputSourceInfo,
            };
        },

        // ── Display operations ──
        setDisplay,

        // ── Column operations ──
        updateColumn,
        updateAllColumns,
        duplicateColumn,
        resetColumn,
        resetAllColumns,
        toggleIdFilter,
        toggleGlobalVisibility,
        addFormulaColumn,
        addCalculatedColumn,
        reorderColumns,

        // ── Pivot operations ──
        setPivot,

        // ── Comparison Series operations ──
        setComparisonSeries,
        reconcileComparisonSeriesColumn,

        // ── Raw access (escape hatch) ──
        // Needed for: ComplexFilters, custom control types, handlePaste.
        // Phase 5 must close these — see handoff notes in task file.
        get state() { return stateRef.current; },
        setState,
    }), [
        setState,
        setDisplay,
        updateColumn, updateAllColumns,
        duplicateColumn, resetColumn, resetAllColumns,
        toggleIdFilter, toggleGlobalVisibility,
        addFormulaColumn, addCalculatedColumn, reorderColumns,
        setPivot,
        setComparisonSeries,
        reconcileComparisonSeriesColumn,
    ]);
}
