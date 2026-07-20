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

import { useState, useEffect, useRef, useCallback, useMemo, useContext } from "react";
import { isEqual } from "lodash-es";
import { PageContext } from "../../../../context";
import { getData } from "./getData";
import { hasUnresolvedRequiredLeaf } from "./buildUdaConfig";
import { useNowTick } from "./hooks/useNowTick";
import { walkTreeForTickGranularity } from "./utils/timeFilter";

const RESOLVED_TZ = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
})();

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
      tableFilters: state.tableFilters,
      source_id: state.externalSource?.source_id,
      view_id: state.externalSource?.view_id,
      pageSize: state.display?.pageSize,
      showTotal: state.display?.showTotal,
      join: state.join,
      comparisonSeries: state.comparisonSeries,
      pivot: state.pivot?.enabled ? {
        rowColumn: state.pivot.rowColumn,
        pivotColumns: state.pivot.pivotColumns?.length ? state.pivot.pivotColumns
          : state.pivot.pivotColumn ? [state.pivot.pivotColumn] : [],
        valueColumn: state.pivot.valueColumn,
        aggregateFn: state.pivot.aggregateFn,
        distinctValuesByColumn: state.pivot.distinctValuesByColumn,
        maxValues: state.pivot.maxValues,
      } : null,
    });
  } catch {
    return null;
  }
}

/**
 * @param {Object} params
 * @param {Object}   params.state      - The dataWrapper immer state
 * @param {Function} params.setState   - The immer setState updater
 * @param {Function} params.apiLoad    - DMS data loader function
 * @param {Object}   params.component  - Component config (fullDataLoad, keepOriginalValues, useGetDataOnPageChange)
 * @param {boolean}  params.isEditMode - True in Edit mode: always fetch with dedup, ignoring fetchMode
 * @param {string}   [params.sectionId]  - DB row id of the hosting section (Falcor cache-key discriminator)
 * @param {string}   [params.trackingId] - Stable-across-recreate id, preferred over sectionId when present
 * @returns {{ loading: boolean, currentPage: number, onPageChange: Function }}
 */
export function useDataLoader({ state, setState, apiLoad, component, isEditMode = false, sectionId, trackingId }) {
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  // Seed the dedup ref when state already has data (e.g., from preloadSectionData).
  // This prevents the load effect from re-fetching data that was already loaded
  // server-side during the route loader phase.
  const lastFetchKeyRef = useRef(
    state.data?.length && (state.externalSource?.source_id || state.externalSource?.isDms) ? computeFetchKey(state) : null
  );
  const outputSourceInfoRef = useRef(null);
  // Generation counter shared by the main load effect and onPageChange — both
  // write draft.data. Two fetches can be in flight at once (e.g. an unfiltered
  // request fired before a page filter/comparison-series binding resolves,
  // superseded moments later by the correctly-scoped request) and network
  // responses can resolve out of order. Only the response matching the most
  // recently issued request is ever applied; a stale, slower response is
  // discarded instead of clobbering fresher data.
  const requestIdRef = useRef(0);

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

  // ─── Clock-anchored refetch ───────────────────────────────────────────────
  // Time filters that anchor to `now` (relative ranges, current_period, named,
  // instant) need the section to refetch when the clock crosses the next
  // boundary at the right granularity. useNowTick schedules a single timeout
  // to that boundary — no polling — and returns a counter we mix into the
  // fetchKey so the existing dedup naturally allows a refetch each tick.
  const tickGranularity = useMemo(() => walkTreeForTickGranularity(state.filters), [state.filters]);

  // A section whose scope arrives from a published action param (requireResolved
  // leaf — e.g. a load_publish driver) must not paint with its saved default and
  // then re-query when the param lands (the "flash"). Hold it in its loading state
  // until usePageFilterSync writes the value; the change to state.filters reopens
  // the gate and the section fetches once with the resolved scope.
  const gatedOnRequiredFilter = useMemo(() => hasUnresolvedRequiredLeaf(state?.filters), [state?.filters]);
  const tickTz = RESOLVED_TZ;
  const nowTick = useNowTick({ granularity: tickGranularity, tz: tickTz });

  // ─── data_refresh subscriber ───────────────────────────────────────────────
  // A section subscribed to an action param refetches whenever that param's
  // published value changes: the value is mixed into the fetchKey (same pattern
  // as nowTick), so the dedup naturally allows exactly one refetch per publish.
  // Providers publish a fresh value per event (e.g. the Card add_publish
  // provider publishes the created row id), which is what lets a create in one
  // section refresh another section's data without a reload. Inert while the
  // param is unset. Note: fetchMode 'cache' sections never fetch (readyToLoad
  // gate) — subscribers should be 'smart'/'force'.
  const { pageState } = useContext(PageContext) || {};
  const refreshSub = state?.display?._functions?.subscribers?.find(
    (s) => s.functionId === 'data_refresh' && s.enabled,
  );
  const dataRefreshToken = refreshSub
    ? pageState?.filters?.find((f) => f.searchKey === refreshSub.paramKey && f.type === 'action')?.values?.[0]
    : undefined;

  const fetchKey = useMemo(() => {
    const base = computeFetchKey(state);
    const withTick = tickGranularity ? `${base}|tick:${nowTick}` : base;
    return dataRefreshToken !== undefined ? `${withTick}|refresh:${dataRefreshToken}` : withTick;
  }, [
    state.columns,
    state.filters,
    state.tableFilters,
    state.display?.filterRelation,
    state.externalSource?.source_id,
    state.externalSource?.view_id,
    state.display?.pageSize,
    state.display?.showTotal,
    state.join,
    state.pivot,
    state.comparisonSeries,
    tickGranularity,
    nowTick,
    dataRefreshToken,
  ]);

  const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);

  // ─── Fetch mode (derived from state, with backward-compat for readyToLoad bool) ──
  // Edit mode always uses 'smart' (fetch with dedup); View mode honors fetchMode.
  const fetchMode =
      // isEditMode ? 'smart' : // doesn't fetch in edit mode and shows stale cached data
      (state?.display?.fetchMode ?? (state?.display?.readyToLoad === true ? 'smart' : 'cache'));
  const readyToLoad = isEditMode || (isValidState && (fetchMode !== 'cache' || state?.display?.allowEditInView));
  const bypassDedup = fetchMode === 'force';

  // ─── Main load effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isValidState || !readyToLoad) return;
    // Hold in loading until a requireResolved leaf gets its action-param value.
    if (gatedOnRequiredFilter) { setLoading(true); return; }

    const timeoutId = setTimeout(() => {
      if (hasLocalFilters) {
        getFilteredData({ currentPage: 0 });
        return;
      }

      // Dedup: skip if config hasn't changed (bypassed in 'force' fetch mode)
      if (!bypassDedup && fetchKey === lastFetchKeyRef.current) return;

      async function load() {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
          const { length, data, invalidState, outputSourceInfo } = await getData({
            state,
            apiLoad,
            fullDataLoad: component.fullDataLoad,
            keepOriginalValues: component.keepOriginalValues,
            optionsOnly: component.optionsOnly,
            refreshToken: dataRefreshToken,
            sectionId: trackingId || sectionId,
          });

          // A newer request has since been issued — discard this stale response.
          if (requestId !== requestIdRef.current) return;

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
          if (requestId === requestIdRef.current) setLoading(false);
        }
      }

      load();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [fetchKey, readyToLoad, bypassDedup, isValidState, hasLocalFilters, localFilters, gatedOnRequiredFilter]);

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

      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const { length, data } = await getData({
          state,
          currentPage: page,
          apiLoad,
          keepOriginalValues: component.keepOriginalValues,
          optionsOnly: component.optionsOnly,
          refreshToken: dataRefreshToken,
          sectionId: trackingId || sectionId,
        });

        // A newer request (page change or filter-driven refetch) has since
        // been issued — discard this stale response.
        if (requestId !== requestIdRef.current) return;

        setCurrentPage(page);
        setState((draft) => {
          draft.data = state.display.usePagination
            ? data
            : [...draft.data.filter((r) => !r.totalRow), ...data];
          draft.display.totalLength = length;
        });
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
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
      dataRefreshToken,
    ],
  );

  return { loading, currentPage, onPageChange, outputSourceInfo: outputSourceInfoRef.current };
}
