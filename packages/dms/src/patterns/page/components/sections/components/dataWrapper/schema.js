/**
 * Canonical data source config schema (v2).
 *
 * This is the target format for all persisted data source state.
 * Legacy formats (v0, v1) are converted to this shape by migrateToV2().
 *
 * RULE: migrateToV2() is the ONLY function that references legacy field names
 * (sourceInfo, dataRequest). All other code uses the v2 names defined here.
 */

// ─── v2 field names ─────────────────────────────────────────────────────────

/**
 * externalSource — the external data source being queried.
 * Renamed from legacy "sourceInfo" to clarify this is the INPUT source identity,
 * not the output schema (which is outputSourceInfo from Phase 4).
 *
 * Shape: { source_id, view_id, isDms, isEditable, env, srcEnv, app, type, columns, name, view_name, baseUrl }
 *
 * isEditable: mirrors the source's metadata.isEditable flag, for internal and external sources
 * (read it through sourceIsEditable below, which knows what a missing value means). dataWrapper's
 * add/edit/delete gates follow it. For an external source (isDms false) apiUpdate/dmsDataEditor routes
 * the writes to the uda.data.* CALL routes instead of dms.data.* — see external-source-editable-crud.md
 * and set_primary_col_from_meta.md.
 */
export const EXTERNAL_SOURCE_KEY = 'externalSource';

/**
 * Whether a section's source takes row edits: the source's `metadata.isEditable`, one flag for internal
 * and external sources alike (planning/tasks/current/source-editable-flag-everywhere.md). The server is
 * the judge; this decides what the section offers.
 *
 * A source with NO value is an older row: an internal one was always editable and still is until the
 * backfill gives it a value (dms-server scripts/backfill-source-editable.js), an external one is not.
 */
export const sourceIsEditable = (externalSource) =>
    externalSource?.isDms ? externalSource.isEditable !== false : Boolean(externalSource?.isEditable);

/**
 * filters — the user-authored filter tree.
 * Promoted from legacy "dataRequest.filterGroups" to first-class status.
 * This is primary authored state, not a derived request parameter.
 *
 * Shape: { op: 'AND'|'OR', groups: FilterNode[] }
 */
export const FILTERS_KEY = 'filters';

// ─── Derived/runtime fields (NOT persisted) ─────────────────────────────────

/** Fields on state that are runtime-only and stripped before persistence. */
export const RUNTIME_FIELDS = [
    'fullData',
    'localFilteredData',
    'lastDataRequest',
    'outputSourceInfo',
    'dataRequest',      // legacy — derived by buildUdaConfig from columns + filters
    'sourceInfo',       // legacy alias — replaced by externalSource
    'tableFilters',     // ephemeral table-header server filters — not persisted, not shown in filter editor
];

/** Fields within display that are runtime-only and stripped before persistence. */
export const RUNTIME_DISPLAY_FIELDS = [
    'filteredLength',
    'invalidState',
    'hideSection',
];

// ─── Fields that ARE persisted ──────────────────────────────────────────────

/**
 * The complete set of persisted fields in a v2 data source config:
 *
 * {
 *   externalSource: { source_id, view_id, isDms, isEditable, env, srcEnv, app, type,
 *                     columns: [{name, type, display}], name, view_name, baseUrl },
 *   columns:        [{ name, show, group, fn, sort, customName, meta_lookup,
 *                      display, type, origin, serverFn, mapped_options, ... }],
 *   filters:        { op: 'AND'|'OR', groups: FilterNode[] },
 *   display:        { pageSize, usePagination, striped, showTotal, allowDownload,
 *                     readyToLoad, allowEditInView, showAttribution, showGutters,
 *                     hideIfNull, filterRelation, totalLength, ... },
 *   data:           [...],  // cached rows (for view mode immediate rendering)
 *   dataSourceId:   string|null, // ref to page-level data source (tracking only)
 *   join:           { operator, sources: { <alias>: { source, view, env, srcEnv,
 *                     type, mergeStrategy, joinColumns, sourceInfo } } }
 *                   // optional — only present when section joins additional sources.
 *                   // Persisted only when sources is non-empty (no `{ sources: {} }`
 *                   // placeholder on the wire).
 *   pivot:          { enabled, rowColumn, pivotColumns[], valueColumn, aggregateFn,
 *                     valueColumns[]:{column,aggregateFn,label}, singleHeader, maxValues }
 *                   // optional — only present when pivot has been configured.
 *                   // valueColumns[] spreads MULTIPLE metrics per pivot combo (each with
 *                   // its own aggregateFn), rendered as a metric leaf under the combo
 *                   // group headers; legacy single valueColumn+aggregateFn still works.
 *                   // pivot.distinctValues is runtime-only and stripped from the save payload.
 *                   // columns with origin='pivot_col' are also runtime-only and stripped.
 * }
 *
 * NOT persisted: dataRequest, sourceInfo, fullData, localFilteredData,
 *                lastDataRequest, outputSourceInfo, pivot.distinctValues,
 *                columns where origin='pivot_col'
 *
 * NOTE: every serializer that emits a v2 element-data string (the save effect
 * in dataWrapper/index.jsx, preloadSectionData.js, and any future round-tripper)
 * MUST include `join` when present, or open editors will round-trip a stripped
 * state back to the server and silently delete user-configured joins.
 */
