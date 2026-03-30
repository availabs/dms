/**
 * useDataLoader — manages the data-fetching lifecycle for dataWrapper components.
 *
 * Replaces the scattered loading effects, onPageChange handlers, and dedup logic
 * previously duplicated across Edit and View modes in index.jsx.
 *
 * Owns: loading state, currentPage, dedup, debounce, local filter slicing, pagination.
 * Does NOT own: UDA config building (getData calls buildUdaConfig internally),
 *   mapped_options loading, CRUD, save/onChange, page filter sync.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isEqual } from "lodash-es";
import { getData } from "./getData";

const DEBOUNCE_MS = 300;

/**
 * Compute a dedup key from the state fields that affect fetch results.
 * Returns null if serialization fails.
 */
function computeFetchKey(state) {
  try {
    return JSON.stringify({
      columns: state.columns?.map((c) => ({
        name: c.name,
        show: c.show,
        group: c.group,
        sort: c.sort,
        fn: c.fn,
        serverFn: c.serverFn,
        meta_lookup: c.meta_lookup,
        display: c.display,
        type: c.type,
        origin: c.origin,
        filters: c.filters,
        excludeNA: c.excludeNA,
        isDuplicate: c.isDuplicate,
        copyNum: c.copyNum,
        systemCol: c.systemCol,
        normalName: c.normalName,
        variables: c.variables,
        showTotal: c.showTotal,
      })),
      filterGroups: state.filters,
      filterRelation: state.display?.filterRelation,
      source_id: state.externalSource?.source_id,
      view_id: state.externalSource?.view_id,
      pageSize: state.display?.pageSize,
      showTotal: state.display?.showTotal,
    });
  } catch {
    return null;
  }
}

/**
 * @param {Object} params
 * @param {Object}   params.state       - The dataWrapper immer state
 * @param {Function} params.setState    - The immer setState updater
 * @param {Function} params.apiLoad     - DMS data loader function
 * @param {Object}   params.component   - Component config (fullDataLoad, keepOriginalValues, useGetDataOnPageChange)
 * @param {boolean}  params.readyToLoad - Whether this component should fetch data
 * @returns {{ loading: boolean, currentPage: number, onPageChange: Function }}
 */
export function useDataLoader({ state, setState, apiLoad, component, readyToLoad }) {
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  // Seed the dedup ref when state already has data (e.g., from preloadSectionData).
  // This prevents the load effect from re-fetching data that was already loaded
  // server-side during the route loader phase.
  const lastFetchKeyRef = useRef(
    state.data?.length && (state.externalSource?.source_id || state.externalSource?.isDms) ? computeFetchKey(state) : null
  );
  const outputSourceInfoRef = useRef(null);

  // ─── Local filters (client-side slicing) ───────────────────────────────────

  const localFilters = useMemo(
    () =>
      (state.columns || [])
        .filter((c) => c.localFilter?.length)
        .reduce((acc, c) => ({ ...acc, [c.normalName || c.name]: c.localFilter }), {}),
    [state.columns],
  );
  const localFilterColumns = useMemo(
    () => Object.keys(localFilters).filter((k) => localFilters[k]?.length),
    [localFilters],
  );
  const hasLocalFilters = Boolean(localFilterColumns.length);

  const getFilteredData = useCallback(
    ({ currentPage: page }) => {
      if (!hasLocalFilters) return;

      const textSearchCols = Object.keys(localFilters).filter(
        (col) =>
          !["select", "multiselect", "radio"].includes(
            state.columns?.find((c) => (c.normalName || c.name) === col)?.type,
          ),
      );

      const filteredData = (state.fullData || state.data || []).filter((row) => {
        return Object.keys(localFilters).every((col) => {
          const isTextSearch = textSearchCols.includes(col);
          const rowValue = Array.isArray(row[col]) ? row[col] : [row[col]];
          const filterValue =
            !isTextSearch && !Array.isArray(localFilters[col])
              ? [localFilters[col]]
              : localFilters[col];
          return rowValue.some((v) => {
            const v1 =
              v && typeof v === "object" && v.originalValue
                ? v.originalValue
                : v && typeof v === "object" && v.value
                  ? v.value
                  : v;

            return isTextSearch
              ? (v1 || "").toString().toLowerCase().includes(filterValue.toLowerCase())
              : filterValue.some((fv) => fv === v1);
          });
        });
      });

      const fromIndex = page * state.display.pageSize;
      const toIndex =
        Math.min(filteredData.length, page * state.display.pageSize + state.display.pageSize) - 1;

      setState((draft) => {
        draft.localFilteredData =
          filteredData.length < fromIndex
            ? filteredData
            : filteredData.filter((_, i) => i >= fromIndex && i <= toIndex);
        draft.display.filteredLength = filteredData.length;
      });
    },
    [localFilters, hasLocalFilters, state.columns, state.display?.pageSize, setState, state.data, state.fullData],
  );

  // ─── Reset local filter data when filters are cleared ──────────────────────

  useEffect(() => {
    if (!hasLocalFilters && state.localFilteredData?.length) {
      setState((draft) => {
        draft.localFilteredData = undefined;
        draft.display.filteredLength = undefined;
      });
    }
  }, [hasLocalFilters]);

  // ─── Fetch key for dedup ───────────────────────────────────────────────────
  // Serializes only the inputs that affect the fetch result. When this changes,
  // the load effect fires. Replaces the old preventDuplicateFetch + lastDataRequest.

  const fetchKey = useMemo(() => computeFetchKey(state), [
    state.columns,
    state.filters,
    state.display?.filterRelation,
    state.externalSource?.source_id,
    state.externalSource?.view_id,
    state.display?.pageSize,
    state.display?.showTotal,
  ]);

  const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);

  // ─── Main load effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isValidState || !readyToLoad) return;

    const timeoutId = setTimeout(() => {
      if (hasLocalFilters) {
        getFilteredData({ currentPage: 0 });
        return;
      }

      // Dedup: skip if config hasn't changed
      if (fetchKey === lastFetchKeyRef.current) return;

      async function load() {
        setLoading(true);
        try {
          const { length, data, invalidState, outputSourceInfo } = await getData({
            state,
            apiLoad,
            fullDataLoad: component.fullDataLoad,
            keepOriginalValues: component.keepOriginalValues,
          });

          lastFetchKeyRef.current = fetchKey;
          setCurrentPage(0);
          if (outputSourceInfo) outputSourceInfoRef.current = outputSourceInfo;

          setState((draft) => {
            draft.data = data;
            draft.localFilteredData = undefined;
            draft.display.filteredLength = undefined;
            draft.display.totalLength = length;
            draft.display.invalidState = invalidState;
          });
        } catch (e) {
          console.error("useDataLoader: fetch error", e);
        } finally {
          setLoading(false);
        }
      }

      load();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [fetchKey, readyToLoad, isValidState, hasLocalFilters, localFilters]);

  // ─── Page change handler ───────────────────────────────────────────────────

  const onPageChange = useCallback(
    async (page) => {
      if (!isValidState || !component.useGetDataOnPageChange) return;

      if (hasLocalFilters) {
        setCurrentPage(page);
        getFilteredData({ currentPage: page });
        return;
      }

      const hasMore = page * state.display.pageSize - state.display.totalLength <= 0;
      if (!hasMore) return;

      setLoading(true);
      try {
        const { length, data } = await getData({
          state,
          currentPage: page,
          apiLoad,
          keepOriginalValues: component.keepOriginalValues,
        });

        setCurrentPage(page);
        setState((draft) => {
          draft.data = state.display.usePagination
            ? data
            : [...draft.data.filter((r) => !r.totalRow), ...data];
          draft.display.totalLength = length;
        });
      } finally {
        setLoading(false);
      }
    },
    [
      isValidState,
      component.useGetDataOnPageChange,
      component.keepOriginalValues,
      hasLocalFilters,
      getFilteredData,
      state,
      apiLoad,
      setState,
    ],
  );

  return { loading, currentPage, onPageChange, outputSourceInfo: outputSourceInfoRef.current };
}
