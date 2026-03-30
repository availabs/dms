/**
 * migrateToV2 — converts any legacy element-data format to the v2 canonical schema.
 *
 * THIS IS THE ONLY FILE THAT REFERENCES LEGACY FIELD NAMES.
 * All other code uses v2 names: externalSource, filters, columns, display.
 *
 * Supported input formats:
 * - v0: Very old format with `attributes`, `visibleAttributes`, `format` (pre-2024)
 * - v1: Current legacy format with `sourceInfo`, `columns`, `dataRequest`, `data`
 * - v2: Already canonical (has `externalSource`) — returned as-is
 * - Non-data components: Rich Text, Filter, Map — returned as-is
 *
 * Output is always v2 for data components:
 * {
 *   externalSource: { source_id, view_id, isDms, env, columns, ... },
 *   columns: [{ name, show, group, fn, sort, ... }],
 *   filters: { op, groups },
 *   display: { pageSize, striped, ... },
 *   data: [...],
 *   dataSourceId: string|null,
 * }
 */

import { RUNTIME_DISPLAY_FIELDS } from './schema';

const isJson = (str) => {
    try { JSON.parse(str); return true; } catch { return false; }
};

// ─── Column filter migration ────────────────────────────────────────────────

/**
 * Extract legacy column-level filters into filterGroups conditions.
 * Returns { columns: cleaned columns, conditions: new filter nodes }
 */
function migrateColumnFilters(columns) {
    const conditions = [];
    const cleaned = (columns || []).map(column => {
        // Handle very old internalFilter/externalFilter/internalExclude format
        if (Array.isArray(column.internalFilter) || Array.isArray(column.externalFilter) || Array.isArray(column.internalExclude)) {
            const newFilters = [
                Array.isArray(column.internalFilter) ? { type: 'internal', operation: 'filter', values: column.internalFilter, usePageFilters: false, searchParamKey: column.name } : null,
                Array.isArray(column.externalFilter) ? { type: 'external', operation: 'filter', values: column.externalFilter, usePageFilters: false, searchParamKey: column.name } : null,
                Array.isArray(column.internalExclude) ? { type: 'internal', operation: 'exclude', values: column.internalExclude, usePageFilters: false, searchParamKey: column.name } : null,
            ].filter(Boolean);

            newFilters.forEach(f => {
                const isScalar = ['gt', 'gte', 'lt', 'lte', 'like'].includes(f.operation);
                conditions.push({
                    op: f.operation,
                    col: column.name,
                    value: isScalar ? (Array.isArray(f.values) ? f.values[0] : f.values) : (f.values || []),
                    ...(f.type === 'external' && { isExternal: true }),
                    ...(f.usePageFilters && { usePageFilters: true }),
                    ...(f.searchParamKey && { searchParamKey: f.searchParamKey }),
                });
            });

            return {
                ...column,
                internalFilter: undefined,
                externalFilter: undefined,
                internalExclude: undefined,
                filters: undefined,
            };
        }

        // Handle v1 column.filters array format
        const realFilters = (column.filters || []).filter(f => f.operation);
        if (!realFilters.length) {
            return { ...column, filters: undefined };
        }

        realFilters.forEach(f => {
            const isScalar = ['gt', 'gte', 'lt', 'lte', 'like'].includes(f.operation);
            const condition = {
                op: f.operation,
                col: column.name,
                value: isScalar ? (Array.isArray(f.values) ? f.values[0] : f.values) : (f.values || []),
            };
            if (f.type === 'external') condition.isExternal = true;
            if (f.usePageFilters || f.allowSearchParams) condition.usePageFilters = true;
            if (f.searchParamKey) condition.searchParamKey = f.searchParamKey;
            if (f.isMulti) condition.isMulti = true;
            if (f.fn) condition.fn = f.fn;
            if (f.display) condition.display = f.display;
            conditions.push(condition);
        });

        return { ...column, filters: undefined };
    });

    return { columns: cleaned, conditions };
}

// ─── v0 → v1 migration ─────────────────────────────────────────────────────

/**
 * Convert very old format (attributes/visibleAttributes/format) to v1 shape.
 */
function migrateV0ToV1(state) {
    const columns = (state.attributes || []).map(column => ({
        ...column,
        show: (state.visibleAttributes || []).includes(column.name),
        group: (state.groupBy || []).includes(column.name),
        sort: state.orderBy?.[column.name],
        size: state.colSizes?.[column.name],
        customName: state.customColNames?.[column.name],
        fn: state.fn?.[column.name],
        excludeNA: (state.notNull || []).includes(column.name),
        justify: state.colJustify?.[column.name],
        formatFn: state.formatFn?.[column.name],
        fontSize: state.fontSize?.[column.name],
        openOut: (state.openOutCols || []).includes(column.name),
        hideHeader: (state.hideHeader || []).includes(column.name),
        cardSpan: state.cardSpan?.[column.name],
    })).filter(({ show, group }) => show || group);

    const sourceInfo = {
        app: state.format?.app,
        type: state.format?.type,
        isDms: state.format?.isDms,
        env: state.format?.env,
        srcEnv: state.format?.srcEnv,
        source_id: state.format?.id,
        view_id: typeof state.format?.view_id === 'object' ? state.format?.view_id?.id : state.format?.view_id,
        view_name: state.format?.version || state.format?.name,
        updated_at: state.format?._modified_timestamp || state.format?.updated_at,
        columns: state.format?.metadata?.columns || JSON.parse(state?.format?.config || '{}')?.attributes || [],
    };

    const display = {
        pageSize: state.pageSize,
        usePageFilters: state.usePageFilters || state.allowSearchParams,
        loadMoreId: state.loadMoreId,
        showTotal: state.showTotal,
        striped: state.striped,
        usePagination: state.usePagination,
        allowEditInView: state.allowEditInView,
        allowDownload: state.allowDownload,
    };

    return { sourceInfo, columns, display, dataRequest: {}, data: state.data || [] };
}

// ─── v1 → v2 migration ─────────────────────────────────────────────────────

/**
 * Convert v1 format (sourceInfo/dataRequest) to v2 canonical schema.
 */
function migrateV1ToV2(state) {
    // Rename sourceInfo → externalSource
    const externalSource = state.sourceInfo ? { ...state.sourceInfo } : {};

    // Migrate column-level filters to conditions
    const { columns: migratedColumns, conditions } = migrateColumnFilters(state.columns || []);

    // Promote filters from dataRequest.filterGroups to top-level
    const existingFilterGroups = state.dataRequest?.filterGroups;
    const hasExistingFilterGroups = existingFilterGroups?.groups?.length > 0;

    let filters;
    if (hasExistingFilterGroups) {
        filters = { ...existingFilterGroups };
    } else if (conditions.length) {
        filters = {
            op: state.display?.filterRelation || state.dataRequest?.filterRelation || 'AND',
            groups: conditions,
        };
    } else {
        filters = { op: 'AND', groups: [] };
    }

    // Display: keep as-is, strip derived fields
    const display = { ...(state.display || {}) };
    RUNTIME_DISPLAY_FIELDS.forEach(f => delete display[f]);

    return {
        externalSource,
        columns: migratedColumns,
        filters,
        display,
        data: state.data || [],
        ...(state.dataSourceId && { dataSourceId: state.dataSourceId }),
    };
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Convert any element-data format to v2 canonical schema.
 *
 * @param {string|Object} input - Raw element-data (JSON string or parsed object)
 * @param {Object} [defaultState] - Default state for uninitialized components
 * @param {string} [compName] - Component name (for non-data component passthrough)
 * @returns {Object} v2 canonical state
 */
export function migrateToV2(input, defaultState, compName) {
    if (!input) return defaultState || null;

    const state = typeof input === 'string' ? (isJson(input) ? JSON.parse(input) : {}) : input;

    // Non-data components: return as-is
    if (compName === 'Rich Text' || compName === 'Filter') {
        return Object.keys(state).length ? state : defaultState;
    }
    if (state?.symbologies) return state; // map component

    // Already v2? (has externalSource)
    if (state.externalSource) return state;

    // v1 format (has sourceInfo or dataRequest)
    if (state.sourceInfo || state.dataRequest) {
        return migrateV1ToV2(state);
    }

    // v0 format (has attributes/format)
    if (Array.isArray(state.attributes) || state.format) {
        return migrateV1ToV2(migrateV0ToV1(state));
    }

    // Unknown format — return with defaults
    return defaultState || state;
}

export default migrateToV2;
