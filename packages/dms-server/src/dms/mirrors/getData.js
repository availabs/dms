'use strict';

/**
 * ⚠ MIRROR — hand-adapted CommonJS copy of the client's
 * src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js
 *
 * See src/dms/planning/tasks/current/pattern-filter-sync.md's Tier 2 design section
 * "⚠ DRIFT WARNING" for why this exists as a mirror instead of an import, and the
 * maintenance discipline: any future change to the client file that affects query-building
 * or post-processing behavior MUST be checked against this file and ported over.
 *
 * Unlike buildUdaConfig.js's mirror (mechanical export-syntax conversion only), this file
 * has real logic changes: every `apiLoad(...)` call in the client original is replaced with
 * a DIRECT, in-process call to `simpleFilter`/`simpleFilterLength` (this server's own
 * uda.controller.js) — see the task file's traced call chain for exactly what apiLoad does
 * under the hood (Falcor path build -> uda.route.js -> these same two functions) and the
 * non-obvious SQL-alias-to-reqName rekey (`getResponseColumnName`) that a direct call must
 * reproduce itself, since it skips the Falcor route that normally does it.
 *
 * DELIBERATELY OUT OF SCOPE for this first mirror pass (real branches in the client
 * original, not exercised by the current pattern-filter-sync test fixture set — port them
 * in when a test case needs them, per the DRIFT WARNING's maintenance discipline):
 *   - pivot mode (state.pivot.enabled) — requires porting pivotUtils.js too
 *   - comparison-series anchor ordering (state.comparisonSeries)
 *   - blank-row fallback (display.useBlankRowFallback)
 *   - total-row fetch (display.showTotal)
 *   - applyCreateDefaults — row-CREATE UI defaults, irrelevant to a read-and-recompute sync
 *   - optionsOnly / isOptionsLoad path — Filter-control distinct-value listing, irrelevant here
 *   - debugCall/debugTime instrumentation — stripped, not needed server-side
 *
 * IN SCOPE (ported faithfully): buildUdaConfig invocation, id-column injection, the
 * invalid-state (visible/grouped/fn column mismatch) check, the main row fetch + `cleanValue`
 * mapping, formula-column evaluation (`evaluateAST`), and join-alias stripping.
 */

const {
  buildUdaConfig,
  isCalculatedCol,
  legacyStateToBuildInput,
  isJoinComplete,
  mergeTableFilters,
} = require('./buildUdaConfig');
const { calculateIsJoinPresent } = require('./joinUtils');
const { simpleFilterLength, simpleFilter } = require('../../routes/uda/uda.controller');
const { getResponseColumnName } = require('../../routes/uda/utils');

// ─── Private helpers (mirrors client getData.js verbatim) ──────────────────

const parseIfJson = (value) => {
  try { return JSON.parse(value); } catch { return value; }
};

const cleanValue = (value) => {
  let valueType = typeof value;
  if (valueType === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return value;
  if (valueType === 'object' && value !== null) {
    if (value?.value && value?.originalValue) return value;
    if (value?.value) return cleanValue(value.value);
    return undefined;
  }
  return parseIfJson(value);
};

const evaluateAST = (node, values) => {
  if (!node) return 0;
  if (node.type === 'variable') return values[node.key] ?? 0;
  if (node.type === 'constant') return node.value;
  if (node.type === 'function') {
    const args = (node.args || []).map((a) => evaluateAST(a, values));
    switch (node.fn) {
      case 'round': {
        if (args.length > 1) {
          const factor = 10 ** args[1];
          return Math.round(args[0] * factor) / factor;
        }
        return Math.round(args[0]);
      }
      case 'abs': return Math.abs(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'log': return Math.log(args[0]);
      case 'pow': return Math.pow(args[0], args[1] ?? 2);
      case 'clamp': return Math.min(Math.max(args[0], args[1] ?? -Infinity), args[2] ?? Infinity);
      case 'percent': return args[1] !== 0 ? (args[0] / args[1]) * 100 : NaN;
      default: return args[0] ?? 0;
    }
  }
  const left = evaluateAST(node.left, values);
  const right = evaluateAST(node.right, values);
  switch (node.operation) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right !== 0 ? left / right : NaN;
    default: return undefined;
  }
};

// ─── Direct-call replacements for apiLoad (real logic change vs. the client original) ──

// mirrors client getData.js's getLength() — apiLoad({action:'udaLength',...}) replaced by
// a direct simpleFilterLength call.
async function getLength({ options, sourceInfo }) {
  const { orderBy, meta, ...optionsForLen } = options;
  return simpleFilterLength(sourceInfo.env, sourceInfo.view_id, JSON.stringify(optionsForLen));
}

// mirrors client getData.js's main-fetch apiLoad({action:'uda',...}) call — replaced by a
// direct simpleFilter call, with the SQL-alias -> reqName rekey uda.route.js normally does
// for the real Falcor response (routes/uda/uda.route.js's options.dataByIndex handler).
async function fetchRows({ sourceInfo, options, attributes, fromIndex, toIndex }) {
  const rows = await simpleFilter(
    sourceInfo.env, sourceInfo.view_id, JSON.stringify(options), attributes,
    { from: fromIndex, to: toIndex }
  );
  return rows.map((row) => {
    const out = {};
    for (const attr of attributes) out[attr] = row[getResponseColumnName(attr)];
    return out;
  });
}

// ─── getData (mirrors client getData.js, scoped per the file-header DRIFT WARNING) ──────

async function getData({ state, fullDataLoad, keepOriginalValues, currentPage = 0, refreshToken, sectionId }) {
  const { join = {} } = state;
  const isJoinPresent = calculateIsJoinPresent(join);

  // Resolve source info — v2 uses externalSource, v1 legacy uses sourceInfo
  const sourceInfo = state.externalSource || state.sourceInfo;

  let builderInput = state.externalSource ? state : legacyStateToBuildInput(state);
  if (state.tableFilters?.length) {
    builderInput = { ...builderInput, filters: mergeTableFilters(builderInput.filters, state.tableFilters) };
  }
  const isDms = sourceInfo.isDms;

  // Pivot mode deliberately not ported — always take the non-pivot buildUdaConfig call.
  const { options, columnsToFetch, columnsWithSettings, outputSourceInfo, skipFetch } = buildUdaConfig(builderInput);

  if (keepOriginalValues) options.keepOriginalValues = keepOriginalValues;
  if (refreshToken !== undefined) options._r = refreshToken;
  if (sectionId) options.sectionId = sectionId;

  if (skipFetch) {
    return { length: 0, data: [], outputSourceInfo };
  }

  const isRequestingSingleRow =
    !options.groupBy.length && columnsToFetch.filter((col) => col.fn).length === columnsToFetch.length;

  let length;
  try {
    length = isRequestingSingleRow ? 1 : await getLength({ options, sourceInfo });
  } catch (e) {
    return { length: 0, data: [], invalidState: 'An Error occurred while fetching data.' };
  }

  const loadAllRows = Boolean(fullDataLoad);
  const safePageSize = Number(state.display?.pageSize) > 0 ? Number(state.display.pageSize) : 25;
  const fromIndex = loadAllRows ? 0 : currentPage * safePageSize;
  const toIndex = loadAllRows ? length - 1 : Math.min(length, currentPage * safePageSize + safePageSize) - 1;
  if (fromIndex >= length) {
    return { length, data: [] };
  }

  const fnColumnsExists = columnsToFetch.some((column) => column.fn);
  if (!columnsToFetch.length) {
    const hasVisibleStaticColumns = (state.columns || []).some((c) => c.show && c.origin === 'static');
    if (!hasVisibleStaticColumns) return { length, data: [] };
  }
  const joinPresent = isJoinPresent && Object.values(join.sources || {}).some(isJoinComplete);
  const isEditableExternal = !isDms && Boolean(sourceInfo?.isEditable) && !joinPresent;
  const idRefCol = joinPresent ? 'ds.id' : 'id';
  const idReq = joinPresent ? 'ds.id as id' : 'id';
  const alreadyRequestingId = columnsToFetch.some((column) => column.name === 'id');
  if ((isDms || isEditableExternal) && !options.groupBy.length && !fnColumnsExists) {
    if (!alreadyRequestingId) {
      columnsToFetch.push({ name: 'id', reqName: idReq, systemCol: true });
    } else {
      const existingIdCol = columnsToFetch.find((column) => column.name === 'id');
      existingIdCol.reqName = idReq;
      existingIdCol.systemCol = true;
    }
    options.orderBy[idRefCol] = Object.values(options.orderBy || {})?.[0] || 'asc';
  } else {
    const idx = columnsToFetch.findIndex((column) => column.name === 'id');
    if (idx !== -1) columnsToFetch.splice(idx, 1);
    delete options.orderBy[idRefCol];
    delete options.orderBy.id;
  }

  // Invalid-state check (mirrors client verbatim)
  let visibleColumnsLength = 0, groupedColumnsLength = 0, fnColumnsLength = 0, nonGroupedColumnsLength = 0;
  for (const col of columnsWithSettings) {
    if (col.show && col.origin !== 'static') visibleColumnsLength++;
    if (col.group) groupedColumnsLength++;
    if (col.fn) fnColumnsLength++;
    if (col.show && !col.group && col.origin !== 'static') nonGroupedColumnsLength++;
  }
  const noGroupSomeFnCondition = visibleColumnsLength > 1 && !groupedColumnsLength && fnColumnsLength > 0 && fnColumnsLength !== visibleColumnsLength;
  const groupNoFnCondition = groupedColumnsLength && fnColumnsLength !== nonGroupedColumnsLength;
  if (noGroupSomeFnCondition || groupNoFnCondition) {
    const invalidStateText = noGroupSomeFnCondition
      ? `All visible columns don't have a function. # Visible columns: ${visibleColumnsLength}, # Function applied: ${fnColumnsLength}`
      : `All Non grouped columns must have a function applied. # Non grouped columns: ${nonGroupedColumnsLength}, # Function applied: ${fnColumnsLength}.`;
    return { length, data: [], invalidState: invalidStateText };
  }

  const attributes = columnsToFetch.map((a) => a.reqName).filter((a) => a);
  let data;
  try {
    data = await fetchRows({ sourceInfo, options, attributes, fromIndex, toIndex });
  } catch (e) {
    return { length, data: [], invalidState: 'An Error occurred while fetching data.' };
  }

  const formulaColumns = state.columns.filter(({ type }) => type === 'formula');
  const dataToReturn = data.map((row) => {
    const rowWithData = { totalRow: false };
    for (const column of columnsToFetch) {
      rowWithData[column.normalName || column.name] = cleanValue(row[column.reqName]);
    }
    if (formulaColumns.length) {
      for (const { name, formula } of formulaColumns) {
        rowWithData[name] = evaluateAST(formula, rowWithData);
      }
    }
    return rowWithData;
  });

  // Join-alias stripping (mirrors client verbatim)
  const formattedData = isJoinPresent ? dataToReturn.map((d) => {
    const newD = {};
    Object.keys(d).forEach((dKey) => {
      const curCol = state.columns.find((c) => c.name === dKey);
      const isQualified = dKey.split('.').length > 1 && !isCalculatedCol(curCol || {});
      if (isQualified) {
        newD[dKey.split('.')[1]] = d[dKey];
        newD[dKey] = d[dKey];
      } else {
        newD[dKey] = d[dKey];
      }
    });
    return newD;
  }) : dataToReturn;

  return { length, data: formattedData, outputSourceInfo };
}

module.exports = { getData, getLength, cleanValue, evaluateAST };
