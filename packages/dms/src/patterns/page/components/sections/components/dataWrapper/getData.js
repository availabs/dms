/**
 * getData — fetches data for a dataWrapper component.
 *
 * Builds a UDA config via buildUdaConfig, fetches length + rows via apiLoad,
 * post-processes the response (column name mapping, formula evaluation, total row).
 *
 * This is the main data-fetching function used by useDataLoader, useColumnOptions,
 * triggerDownload, preloadSectionData, and the refresh mechanism.
 */

import {
    buildUdaConfig,
    isCalculatedCol,
    legacyStateToBuildInput,
    attributeAccessorStr,
    isJoinComplete,
} from "./buildUdaConfig";
import { calculateIsJoinPresent } from "./utils/joinUtils";

// ─── Private helpers ────────────────────────────────────────────────────────

const slugForPivot = (v) =>
    String(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// For calculated columns ("expr as alias"), return the alias; otherwise return the name as-is.
const colKey = (name) => {
    const parts = name.split(/\s+as\s+/i);
    return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

// conditions: [{ ref, value }, ...] — ANDed together (one per pivot column)
const buildPivotCaseExpr = ({ conditions, valueRef, fn, alias, isDms }) => {
    const conditionStr = conditions
        .map(({ ref, value }) => `${ref} = '${String(value).replace(/'/g, "''")}'`)
        .join(' AND ');
    const numericValueRef = isDms ? `(${valueRef})::numeric` : valueRef;
    switch (fn) {
        case 'sum':   return `SUM(CASE WHEN ${conditionStr} THEN ${numericValueRef} ELSE 0 END) AS ${alias}`;
        case 'avg':   return `AVG(CASE WHEN ${conditionStr} THEN ${numericValueRef} ELSE NULL END) AS ${alias}`;
        case 'max':   return `MAX(CASE WHEN ${conditionStr} THEN ${numericValueRef} ELSE NULL END) AS ${alias}`;
        case 'min':   return `MIN(CASE WHEN ${conditionStr} THEN ${numericValueRef} ELSE NULL END) AS ${alias}`;
        default:      return `COUNT(CASE WHEN ${conditionStr} THEN 1 ELSE NULL END) AS ${alias}`;
    }
};

const cartesian = (arrays) =>
    arrays.reduce((acc, arr) => acc.flatMap(combo => arr.map(val => [...combo, val])), [[]]);

const parseIfJson = (value) => {
    try { return JSON.parse(value); } catch { return value; }
};

const cleanValue = (value) => {
    let valueType = typeof value;

    if (valueType === "boolean") return JSON.stringify(value);
    if (Array.isArray(value)) return value;

    if (valueType === "object" && value !== null) {
        if (value?.value && value?.originalValue) return value;
        if (value?.value) return cleanValue(value.value);
        return undefined;
    }

    return parseIfJson(value);
};

const evaluateAST = (node, values) => {
    if (!node) return 0;
    if (node.type === "variable") return values[node.key] ?? 0;
    if (node.type === "constant") return node.value;

    if (node.type === "function") {
        const args = (node.args || []).map(a => evaluateAST(a, values));
        switch (node.fn) {
            case "round": {
                if (args.length > 1) {
                    const factor = 10 ** args[1];
                    return Math.round(args[0] * factor) / factor;
                }
                return Math.round(args[0]);
            }
            case "abs":     return Math.abs(args[0]);
            case "ceil":    return Math.ceil(args[0]);
            case "floor":   return Math.floor(args[0]);
            case "sqrt":    return Math.sqrt(args[0]);
            case "log":     return Math.log(args[0]);
            case "pow":     return Math.pow(args[0], args[1] ?? 2);
            case "clamp":   return Math.min(Math.max(args[0], args[1] ?? -Infinity), args[2] ?? Infinity);
            case "percent": return args[1] !== 0 ? (args[0] / args[1]) * 100 : NaN;
            default: return args[0] ?? 0;
        }
    }

    const left = evaluateAST(node.left, values);
    const right = evaluateAST(node.right, values);

    switch (node.operation) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/": return right !== 0 ? left / right : NaN;
        default: return undefined;
    }
};

// ─── Create-time column defaults (addItem — both wrappers) ──────────────────
// BC: only engaged when a column sets the attr, and only for fields the author
// left blank. `defaultValue` is a static fill (a new ticket's status "Triage");
// `defaultFn` is a DYNAMIC fill — 'today' (YYYY-MM-DD, the control-room date
// format), 'now' (full ISO timestamp), 'user' (the logged-in user's email, from
// CMSContext — skipped when anonymous so a later heal can still fill it);
// `autoNumber` assigns the next sequential number for the column across the
// WHOLE source (max+1, floored by autoNumberStart-1) — queried through the same
// uda path the section reads, deliberately WITHOUT the section's filters (an
// add-new form Card often carries a never-match filter so only the form
// renders). Non-numeric stored values are ignored by the max rather than fatal.
// On fetch failure the create proceeds without the number — sync-side healing
// (e.g. cr_sync ticket hygiene) remains the backstop.
const CREATE_DEFAULT_FNS = {
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
    user: ({ user }) => user?.email || undefined,
};

export const applyCreateDefaults = async ({ columns, newItem, apiLoad, externalSource, user }) => {
    const data = { ...newItem };
    // For DMS sources the uda env is `${app}+${instance}` and externalSource.type IS the
    // instance slug. Do NOT trust externalSource.env here: the runtime source-list reconcile
    // (useDataSource getSources) re-derives env from the DISPLAY name's slug, which drifts
    // from the instance whenever they differ ("Site Management — Tickets" →
    // site_management__tickets vs instance sitemgmt_tickets) and the route then resolves no
    // source → aggregate comes back null.
    const src = externalSource || {};
    const format = src.app && src.type ? { ...src, env: `${src.app}+${src.type}` } : src;
    for (const c of (columns || [])) {
        if (data[c.name] != null && data[c.name] !== "") continue;
        if (c.defaultValue != null) { data[c.name] = c.defaultValue; continue; }
        if (c.defaultFn && CREATE_DEFAULT_FNS[c.defaultFn]) {
            const v = CREATE_DEFAULT_FNS[c.defaultFn]({ user });
            if (v !== undefined) data[c.name] = v;
            continue;
        }
        if (!c.autoNumber) continue;
        const attr = `max(nullif(regexp_replace((data->>'${c.name}'), '[^0-9]', '', 'g'), '')::bigint) as _autonum`;
        try {
            const rows = await apiLoad({
                format,
                children: [{
                    type: () => {},
                    action: "uda",
                    path: "/",
                    filter: { fromIndex: 0, toIndex: 0, options: JSON.stringify({}), attributes: [attr], stopFullDataLoad: true },
                }],
            }, "/");
            const raw = rows?.[0]?.[attr];
            const mx = +(raw?.value ?? raw) || 0;
            data[c.name] = String(Math.max(mx, (+c.autoNumberStart || 1) - 1) + 1);
        } catch (e) {
            if (process.env.NODE_ENV === "development") console.error("autoNumber fetch failed", e);
        }
    }
    return data;
};

// ─── getLength ──────────────────────────────────────────────────────────────

export const getLength = async ({ options, state, apiLoad }) => {
    const { orderBy, meta, ...optionsForLen } = options;
    const children = [
        {
            type: () => {},
            action: "udaLength",
            path: "/",
            filter: { options: JSON.stringify(optionsForLen) },
        },
    ];

    const length = await apiLoad({
        format: state.externalSource || state.sourceInfo,
        children,
    });
    return length;
};

// ─── getData ────────────────────────────────────────────────────────────────

export const getData = async ({
    state,
    apiLoad,
    fullDataLoad,
    keepOriginalValues,
    currentPage = 0,
    debugCall,
    debugTime,
    optionsOnly = false,
    refreshToken
}) => {
    debugTime && console.time('getData fn')
    const debug = debugCall || false;
    debug && console.log("=======getData called===========");

    const { join = {} } = state;
    const isJoinPresent = calculateIsJoinPresent(join);

    // Resolve source info — v2 uses externalSource, v1 legacy uses sourceInfo
    const sourceInfo = state.externalSource || state.sourceInfo;

    // ─── Build UDA config via the pure builder ────────────────────────────────
    debugTime && console.time('buildUdaConfig')
    let builderInput = state.externalSource ? state : legacyStateToBuildInput(state);
    // Inject ephemeral table-header filters (state.tableFilters) without touching state.filters.
    // They are ANDed with the persisted filter tree but never saved or shown in the filter editor.
    if (state.tableFilters?.length) {
        builderInput = {
            ...builderInput,
            filters: {
                op: builderInput.filters?.op || 'AND',
                groups: [
                    ...(builderInput.filters?.groups || []),
                    ...state.tableFilters,
                ],
            },
        };
    }
    const isDms = sourceInfo.isDms;

    // Normalize to array format; support legacy single-column saved configs.
    const pivotColumns = state.pivot?.pivotColumns?.length
        ? state.pivot.pivotColumns
        : state.pivot?.pivotColumn ? [state.pivot.pivotColumn] : [];

    const distinctValuesByColumn = state.pivot?.distinctValuesByColumn
        || (state.pivot?.pivotColumn && state.pivot?.distinctValues?.length
            ? { [state.pivot.pivotColumn]: state.pivot.distinctValues }
            : {});

    const isPivotMode = Boolean(
        state.pivot?.enabled &&
        pivotColumns.length &&
        pivotColumns.every(col => distinctValuesByColumn[col]?.length)
    );

    let options, columnsToFetch, columnsWithSettings, outputSourceInfo, skipFetch;

    if (isPivotMode) {
        const { rowColumn, valueColumn, aggregateFn = 'count' } = state.pivot;

        // Call buildUdaConfig with the row column (group: true) when set so filters are
        // resolved correctly. Without a row column, pass an empty columns array —
        // the result will be a single aggregate row with no GROUP BY.
        const pivotBuilderColumns = rowColumn
            ? [{ name: rowColumn, group: true, show: true }]
            : [];
        const pivotBuilderInput = { ...builderInput, columns: pivotBuilderColumns };
        ({ options, columnsToFetch, columnsWithSettings, outputSourceInfo, skipFetch } = buildUdaConfig(pivotBuilderInput));

        const valueRef = valueColumn ? attributeAccessorStr(valueColumn, isDms, false, false) : null;

        // Build CASE columns for every combination of distinct values (cartesian product).
        const combinations = cartesian(pivotColumns.map(col => distinctValuesByColumn[col] || []));
        const caseColumns = combinations.map(combo => {
            const alias = combo.map((v, i) => `${slugForPivot(colKey(pivotColumns[i]))}_${slugForPivot(v)}`).join('__');
            const conditions = combo.map((v, i) => ({
                ref: attributeAccessorStr(pivotColumns[i], isDms, isCalculatedCol({ name: pivotColumns[i] }), false),
                value: v,
            }));
            const expr = buildPivotCaseExpr({ conditions, valueRef, fn: aggregateFn, alias, isDms });
            return { name: alias, reqName: expr, normalName: alias, isPivotCol: true };
        });

        if (rowColumn) {
            const rowRef = attributeAccessorStr(rowColumn, isDms, false, false);
            columnsToFetch = [...columnsToFetch, ...caseColumns];
            options.groupBy = [rowRef];
            if (!Object.keys(options.orderBy || {}).length) {
                options.orderBy = { [rowRef]: 'asc' };
            }
        } else {
            columnsToFetch = caseColumns;
            options.groupBy = [];
        }
    } else {
        ({ options, columnsToFetch, columnsWithSettings, outputSourceInfo, skipFetch } = buildUdaConfig(builderInput));
    }

    if (keepOriginalValues) options.keepOriginalValues = keepOriginalValues;
    // data_refresh subscriber token (useDataLoader): a no-op options key that makes the uda
    // paths (length + rows) DISTINCT per published value, because the falcor cache serves
    // repeat paths without a network trip — same-path "refetches" would return the stale
    // pre-write rows. The server destructures known options keys and ignores `_r`.
    if (refreshToken !== undefined) options._r = refreshToken;

    debugTime && console.timeEnd('buildUdaConfig')

    debug && console.log("debug getdata: options", options, state);

    // Custom buckets with a dynamic page-filter binding haven't resolved their
    // values yet — firing now would scan the entire unfiltered table (see the
    // skipFetch derivation in buildUdaConfig). Bail with an empty result; the
    // section refetches automatically once usePageFilterSync resolves the config.
    if (skipFetch) {
        debugTime && console.timeEnd('getData fn')
        return { length: 0, data: [], outputSourceInfo };
    }

    // ─── Check indices ────────────────────────────────────────────────────────
    debugTime && console.time('check indices')
    const isRequestingSingleRow =
        !options.groupBy.length &&
        columnsToFetch.filter((col) => col.fn).length === columnsToFetch.length;

    // Option-list loads (Filter controls) only enumerate a column's distinct
    // values — no pagination, nothing displays a total — so the length
    // round-trip (a grouped count over the whole table) is pure waste. Skip it:
    // fetch up to a ceiling and recover the real length from data.length below.
    // Hard-guard on !usePagination so a paginated grouped section never loses
    // its real count even if it opts in.
    const isOptionsLoad =
        optionsOnly && options.groupBy.length > 0 && !state.display?.usePagination;
    const OPTIONS_LIMIT = state.display?.optionsLimit ?? 1000;

    let length;
    try {
        debugTime && console.time('length')
        length = isRequestingSingleRow
            ? 1
            : isOptionsLoad
                ? OPTIONS_LIMIT
                : await getLength({ options, state, apiLoad });
        debugTime && console.timeEnd('length')
    } catch (e) {
        console.error("Error:", e);
        return { length: 0, data: [], invalidState: "An Error occurred while fetching data." };
    }
    const actionType = "uda";
    const fromIndex = isOptionsLoad || fullDataLoad ? 0 : currentPage * state.display.pageSize;
    const toIndex = isOptionsLoad
        ? OPTIONS_LIMIT - 1
        : fullDataLoad
            ? length
            : Math.min(length, currentPage * state.display.pageSize + state.display.pageSize) - 1;
    if (fromIndex >= length) {
        // Empty-result fallback. Opt-in via `display.useBlankRowFallback`.
        // When the real query returned 0 rows AND the section has opted in,
        // synthesize a single placeholder row keyed by the same
        // `column.normalName || column.name` shape getData uses for real
        // rows (so Card.jsx's `source[attr.normalName] || source[attr.name]`
        // lookup finds the values without renderer changes). Each cell is
        // populated from `column.blankDefault`, an arbitrary scalar matching
        // the column type's value shape (string for text/calc-text, hue for
        // portrait_banner, URL for image, etc.). Calc columns store their
        // literal final value here — no SQL re-evaluation in fallback mode.
        //
        // Tagged with `_isBlankFallback: true` (underscore-prefixed so it
        // can't collide with a column whose `name` is `isBlankFallback`) so
        // renderers can opt into differentiated styling. Default renderers
        // ignore it and render exactly as they do for a real row with
        // possibly-empty cells. `length` becomes 1 — every consumer of
        // dataWrapper already handles "render N rows," nothing else changes
        // shape.
        //
        // This branch sits in the `fromIndex >= length` guard rather than
        // at the function tail because when `length === 0` we exit here
        // (fromIndex 0 >= length 0 is true) — a tail-positioned synthesis
        // would never run for the case it exists to handle.
        //
        // BC: gated on `display.useBlankRowFallback`; sections that haven't
        // opted in fall through to `{ length: 0, data: [] }` exactly as
        // before.
        if (length === 0 && state.display?.useBlankRowFallback) {
            const blankRow = { _isBlankFallback: true };
            for (const column of state.columns || []) {
                if (column.show === false) continue;
                const key = column.normalName || column.name;
                blankRow[key] = column.blankDefault ?? null;
            }
            return { length: 1, data: [blankRow], outputSourceInfo };
        }
        return { length, data: [] };
    }
    debugTime && console.timeEnd('check indices')

    // ─── Check columns to fetch ───────────────────────────────────────────────
    debugTime && console.time('check columns')
    const fnColumnsExists = columnsToFetch.some((column) => column.fn);

    if (!columnsToFetch.length) {
        const hasVisibleStaticColumns = (state.columns || []).some(c => c.show && c.origin === 'static');
        if (!hasVisibleStaticColumns) {
            return { length, data: [] };
        }
        // Only static columns visible — fall through so the id column gets added below
    }
    // When a join is present, every base-table column reference must be
    // alias-qualified to avoid Postgres "column ambiguous" errors. Use ds.id.
    // isJoinComplete expects a single join-source object (source/view/mergeStrategy/
    // joinColumns), not the {sources:{...}} container — check each alias individually,
    // mirroring the per-alias filtering buildUdaConfig does before it builds the query.
    const joinPresent = isJoinPresent && Object.values(join.sources || {}).some(isJoinComplete);
    // DMS split tables always have a real `id` column. External sources can have a
    // primary key on any column (see set_primary_col_from_meta.md) — for an editable
    // one, request a literal "id" attribute anyway (mirroring the isDms convention
    // below) and let the SERVER resolve it to the real PK column, aliased AS id
    // (uda.controller.js's resolveIdAttribute, the single live-authoritative place
    // this is already resolved for the write path too). This deliberately does NOT
    // have the client track the PK column name itself — an earlier version of this
    // fix did, and broke silently: the persisted metadata.columns[].isPrimaryKey flag
    // is only set when a PK is set *through the metadata UI*, so an auto-detected
    // pre-existing PK (e.g. a GIS source's ogc_fid) never gets it, leaving the
    // client's cached column name null forever even on a genuinely editable source
    // (see external-source-editable-crud.md). Join support for editable-external
    // sources is a follow-on — not handled here, falls through to "no id requested"
    // exactly like the pre-feature external behavior.
    const isEditableExternal = !isDms && Boolean(sourceInfo?.isEditable) && !joinPresent;
    const idRefCol = joinPresent ? "ds.id" : "id";
    const idReq = joinPresent ? "ds.id as id" : "id";
    if ((isDms || isEditableExternal) && !isPivotMode && !options.groupBy.length && !fnColumnsExists) {
        columnsToFetch.push({ name: "id", reqName: idReq });
        options.orderBy[idRefCol] = Object.values(options.orderBy || {})?.[0] || "asc";
    } else {
        const idx = columnsToFetch.findIndex((column) => column.name === "id");
        if (idx !== -1) columnsToFetch.splice(idx, 1);
        delete options.orderBy[idRefCol];
        delete options.orderBy.id;
    }
    debugTime && console.timeEnd('check columns')

    // ─── Check for invalid state ──────────────────────────────────────────────
    if (!isPivotMode) {
        debugTime && console.time('check invalid')
        let visibleColumnsLength = 0;
        let groupedColumnsLength = 0;
        let fnColumnsLength = 0;
        let nonGroupedColumnsLength = 0;

        for (const col of columnsWithSettings) {
            if (col.show && col.origin !== 'static') visibleColumnsLength++;
            if (col.group) groupedColumnsLength++;
            if (col.fn) fnColumnsLength++;
            if (col.show && !col.group && col.origin !== 'static') nonGroupedColumnsLength++;
        }

        const noGroupSomeFnCondition =
            visibleColumnsLength > 1 &&
            !groupedColumnsLength &&
            fnColumnsLength > 0 &&
            fnColumnsLength !== visibleColumnsLength;

        const groupNoFnCondition =
            groupedColumnsLength && fnColumnsLength !== nonGroupedColumnsLength;
        const isInvalidState = noGroupSomeFnCondition || groupNoFnCondition;

        if (isInvalidState) {
            const invalidStateText = noGroupSomeFnCondition
                ? `All visible columns don't have a function. # Visible columns: ${visibleColumnsLength}, # Function applied: ${fnColumnsLength}`
                : groupNoFnCondition
                    ? `All Non grouped columns must have a function applied. # Non grouped columns: ${nonGroupedColumnsLength}, # Function applied: ${fnColumnsLength}.`
                    : "";
            return { length, data: [], invalidState: invalidStateText };
        }
        debugTime && console.timeEnd('check invalid')
    }

    // ─── Fetch data ───────────────────────────────────────────────────────────
    const children = [
        {
            type: () => {},
            action: actionType,
            path: "/",
            filter: {
                fromIndex,
                toIndex,
                options: JSON.stringify(options),
                attributes: columnsToFetch.map((a) => a.reqName).filter((a) => a),
                stopFullDataLoad: true,
            },
        },
    ];
    let data;

    try {
        debugTime && console.time('apiLoad')
        data = await apiLoad({ format: sourceInfo, children }, "/");
        debugTime && console.timeEnd('apiLoad')
    } catch (e) {
        if (process.env.NODE_ENV === "development") console.error(e);
        return { length, data: [], invalidState: "An Error occurred while fetching data." };
    }

    // Option lists carry no length query, so the true count is whatever came
    // back. Filling the ceiling means the column has more distinct values than a
    // multiselect should enumerate (it wants a search box) — flag it, don't fail.
    if (isOptionsLoad) {
        if (data.length >= OPTIONS_LIMIT && process.env.NODE_ENV === "development") {
            console.warn(
                `getData: option list hit the ${OPTIONS_LIMIT}-row ceiling for groupBy ` +
                `${JSON.stringify(options.groupBy)} — values may be truncated; consider a search filter.`
            );
        }
        length = data.length;
    }

    // ─── Fetch total row ──────────────────────────────────────────────────────
    if (!isPivotMode && (state.display.showTotal || columnsToFetch.some((c) => c.showTotal))) {
        const totalRowChildren = [
            {
                type: () => {},
                action: actionType,
                path: "/",
                filter: {
                    fromIndex: 0,
                    toIndex: 1,
                    options: JSON.stringify({
                        filter: options.filter,
                        exclude: options.exclude,
                        filterGroups: options.filterGroups,
                        normalFilter: options.normalFilter,
                    }),
                    attributes: columnsToFetch
                        .filter((c) => c.showTotal || state.display.showTotal)
                        .map((a) => a.totalName)
                        .filter((a) => a),
                    stopFullDataLoad: true,
                },
            },
        ];

        let totalRowData;
        try {
            totalRowData = await apiLoad({ format: sourceInfo, children: totalRowChildren });
        } catch (e) {
            if (process.env.NODE_ENV === "development") console.error(e);
            return { length, data: [], invalidState: "An Error occurred while fetching data." };
        }

        data.push({ ...totalRowData[0], totalRow: true });
    }

    // ─── Post-process ─────────────────────────────────────────────────────────
    debugTime && console.time('post-processing')
    const formulaColumns = state.columns.filter(({ type }) => type === "formula");
    const dataToReturn = data.map((row) => {
        const isTotalRow = row.totalRow;
        const rowWithData = { totalRow: isTotalRow };

        for (const column of columnsToFetch) {
            const key = isTotalRow ? column.totalName : column.reqName;
            rowWithData[column.normalName || column.name] = cleanValue(row[key]);
        }

        if (formulaColumns.length) {
            for (const { name, formula } of formulaColumns) {
                rowWithData[name] = evaluateAST(formula, rowWithData);
            }
        }

        return rowWithData;
    });

    debugTime && console.timeEnd('post-processing')
    debugTime && console.timeEnd('getData fn')

    //If we have a join, we need to remove the prefixed table alias from the response.
    // Skip the strip for calculated columns: their `name` is a SQL expression that
    // typically contains '.' (e.g. `ds.data->>'col'`), so naively splitting on '.'
    // mangles the key. Use isCalculatedCol so calc columns of any return type
    // (text, timestamp, numeric, …) are recognised — checking only `type === 'calculated'`
    // misses calc columns that declare their return type via `type` and use
    // `display: 'calculated'` to mark origin.
    const formattedData = isJoinPresent ? dataToReturn.map(d => {
        const newD = {};

        Object.keys(d).forEach(dKey => {
            const curCol = state.columns.find(c => c.name === dKey);
            const formattedKey = dKey.split(".").length > 1 && !isCalculatedCol(curCol || {}) ? dKey.split(".")[1] : dKey;
            newD[formattedKey] = d[dKey]
        })

        return newD;
    }) : dataToReturn;

    return { length, data: formattedData, outputSourceInfo };
};

export default getData;
