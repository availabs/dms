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
    legacyStateToBuildInput,
} from "./buildUdaConfig";

// ─── Private helpers ────────────────────────────────────────────────────────

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
    debugTime
}) => {
    debugTime && console.time('getData fn')
    const debug = debugCall || false;
    debug && console.log("=======getData called===========");

    // Resolve source info — v2 uses externalSource, v1 legacy uses sourceInfo
    const sourceInfo = state.externalSource || state.sourceInfo;

    // ─── Build UDA config via the pure builder ────────────────────────────────
    debugTime && console.time('buildUdaConfig')
    const builderInput = state.externalSource ? state : legacyStateToBuildInput(state);
    console.log({builderInput})
    const { options, attributes, columnsToFetch, columnsWithSettings, outputSourceInfo } = buildUdaConfig(builderInput);
    console.log("build uda config result::", {options, outputSourceInfo})
    if (keepOriginalValues) options.keepOriginalValues = keepOriginalValues;
    const filterRelation = state.display?.filterRelation;
    if (filterRelation) options.filterRelation = filterRelation;

    debugTime && console.timeEnd('buildUdaConfig')

    const isDms = sourceInfo.isDms;

    debug && console.log("debug getdata: options", options, state);

    // ─── Check indices ────────────────────────────────────────────────────────
    debugTime && console.time('check indices')
    const isRequestingSingleRow =
        !options.groupBy.length &&
        columnsToFetch.filter((col) => col.fn).length === columnsToFetch.length;
    let length;
    try {
        debugTime && console.time('length')
        length = isRequestingSingleRow
            ? 1
            : await getLength({ options, state, apiLoad });
        debugTime && console.timeEnd('length')
    } catch (e) {
        console.error("Error:", e);
        return { length: 0, data: [], invalidState: "An Error occurred while fetching data." };
    }
    const actionType = "uda";
    const fromIndex = fullDataLoad ? 0 : currentPage * state.display.pageSize;
    const toIndex = fullDataLoad
        ? length
        : Math.min(length, currentPage * state.display.pageSize + state.display.pageSize) - 1;
    if (fromIndex > length) {
        return { length, data: [] };
    }
    debugTime && console.timeEnd('check indices')

    // ─── Check columns to fetch ───────────────────────────────────────────────
    debugTime && console.time('check columns')
    const fnColumnsExists = columnsToFetch.some((column) => column.fn);

    if (!columnsToFetch.length) {
        return { length, data: [] };
    }
    if (isDms && !options.groupBy.length && !fnColumnsExists) {
        columnsToFetch.push({ name: "id", reqName: "id" });
        options.orderBy.id = Object.values(options.orderBy || {})?.[0] || "asc";
    } else {
        const idx = columnsToFetch.findIndex((column) => column.name === "id");
        if (idx !== -1) columnsToFetch.splice(idx, 1);
        delete options.orderBy.id;
    }
    debugTime && console.timeEnd('check columns')

    // ─── Check for invalid state ──────────────────────────────────────────────
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

    // ─── Fetch total row ──────────────────────────────────────────────────────
    if (state.display.showTotal || columnsToFetch.some((c) => c.showTotal)) {
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
                        filterRelation: options.filterRelation,
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
    return { length, data: dataToReturn, outputSourceInfo };
};

export default getData;
