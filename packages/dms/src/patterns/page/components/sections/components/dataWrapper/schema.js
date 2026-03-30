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
 * Shape: { source_id, view_id, isDms, env, srcEnv, app, type, columns, name, view_name, baseUrl }
 */
export const EXTERNAL_SOURCE_KEY = 'externalSource';

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
 *   externalSource: { source_id, view_id, isDms, env, srcEnv, app, type,
 *                     columns: [{name, type, display}], name, view_name, baseUrl },
 *   columns:        [{ name, show, group, fn, sort, customName, meta_lookup,
 *                      display, type, origin, serverFn, mapped_options, ... }],
 *   filters:        { op: 'AND'|'OR', groups: FilterNode[] },
 *   display:        { pageSize, usePagination, striped, showTotal, allowDownload,
 *                     readyToLoad, allowEditInView, showAttribution, showGutters,
 *                     hideIfNull, filterRelation, totalLength, ... },
 *   data:           [...],  // cached rows (for view mode immediate rendering)
 *   dataSourceId:   string|null, // ref to page-level data source (tracking only)
 * }
 *
 * NOT persisted: dataRequest, sourceInfo, fullData, localFilteredData,
 *                lastDataRequest, outputSourceInfo
 */
