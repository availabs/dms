/**
 * buildUdaConfig — Pure function that produces a complete UDA options object + attributes list
 * from persisted data source state (externalSource, columns, filters).
 *
 * This replaces the scattered logic previously split across:
 * - useSetDataRequest effect in dataWrapper/index.jsx (derives groupBy/orderBy/fn/meta from columns)
 * - getData() steps in utils.jsx (builds UDA options, resolves column refs, compiles filters)
 *
 * The builder is testable in isolation — given inputs, it deterministically produces the UDA config.
 * It does NOT make API calls or use React hooks.
 *
 * NOTE: Multiselect filter value resolution requires async API calls and is NOT handled here.
 * The caller (getData or the data loader) must resolve multiselect values before or after calling this.
 */

// ─── Column name helpers ────────────────────────────────────────────────────

const columnRenameRegex = /\s+as\s+/i;
const splitColNameOnAS = (name) => name.split(columnRenameRegex);
import { EXTERNAL_SOURCE_KEY } from "./schema";
import { calculateIsJoinPresent } from "../dataWrapper/utils/joinUtils";
import { parseTimeFilterURL, mergeUrlOntoExposedAxes } from "./utils/timeFilter";
export const isCalculatedCol = ({ display, type, origin, name }) =>
  display === "calculated" ||
  type === "calculated" ||
  origin === "calculated-column" ||
  (name && name.toLowerCase().includes(" as "));

/**
 * Column reference string — the SQL accessor used in WHERE/GROUP BY/ORDER BY.
 * DMS columns use data->>'col', DAMA columns use col directly.
 *
 * When joins are present, buildUdaConfig prefixes each column name with its
 * table alias (e.g., "djs.on_air_name"). DMS sources store column values inside
 * a single `data` JSONB column on the split table, so the SQL must read
 * `<alias>.data->>'<rawName>'` rather than `data->>'<alias>.<rawName>'` (which
 * would look up a JSON property literally named "alias.rawName" — never exists).
 */
export const attributeAccessorStr = (col, isDms, isCalculated, isSystemCol) => {
  if (
    isCalculated ||
    isSystemCol ||
    splitColNameOnAS(col)[0]?.includes("data->>")
  ) {
    return splitColNameOnAS(col)[0];
  }
  if (!isDms) return col;
  const dotIdx = col.indexOf(".");
  if (dotIdx > 0 && /^[a-zA-Z_]\w*\.\w+$/.test(col)) {
    const alias = col.slice(0, dotIdx);
    const name = col.slice(dotIdx + 1);
    return `${alias}.data->>'${name}'`;
  }
  return `data->>'${col}'`;
};

/**
 * Ref name — column reference for use in SQL expressions (WHERE, GROUP BY).
 * No 'AS' alias, just the accessor.
 */
export const refName = (column, isDms) =>
  attributeAccessorStr(
    column.name,
    isDms,
    isCalculatedCol(column),
    column.systemCol,
  );

/**
 * Apply aggregate function to a column accessor, returning the full "expr AS alias" string.
 * This is what goes into the SELECT clause.
 */
export const applyFn = (col = {}, isDms = false) => {
  const isCalculated = isCalculatedCol(col);

  const colNameWithAccessor = attributeAccessorStr(
    col.name,
    isDms,
    isCalculated,
    col.systemCol,
  );
  const colNameAfterAS = (
    (isCalculated ? splitColNameOnAS(col.name)[1] : col.name) || ""
  ).toLowerCase().replace(".", "_");

  const functions = {
    [undefined]:
      !isDms && !isCalculated
        ? colNameWithAccessor
        : `${colNameWithAccessor} as ${colNameAfterAS}`,
    "":
      !isDms && !isCalculated
        ? colNameWithAccessor
        : `${colNameWithAccessor} as ${colNameAfterAS}`,
    "exempt":
      !isDms && !isCalculated
        ? colNameWithAccessor
        : `${colNameWithAccessor} as ${colNameAfterAS}`,
    list: `array_to_string(array_agg(distinct ${colNameWithAccessor}), ', ') as ${colNameAfterAS}_list`,
    sum: isDms
      ? `sum((${colNameWithAccessor})::integer) as ${colNameAfterAS}_sum`
      : `sum(${colNameWithAccessor}) as ${colNameAfterAS}_sum`,
    avg: isDms
      ? `avg((${colNameWithAccessor})::integer) as ${colNameAfterAS}_avg`
      : `avg(${colNameWithAccessor}) as ${colNameAfterAS}_avg`,
    count: `count(${colNameWithAccessor}) as ${colNameAfterAS}_count`,
    max: `max(${colNameWithAccessor}) as ${colNameAfterAS}_max`,
  };

  return functions[col.fn];
};

/**
 * Req name — the full SELECT expression including 'AS' alias.
 * This is what the server returns the column as.
 */
export const reqName = (col, isDms) => (!col ? null : applyFn(col, isDms));

/**
 * Total name — SUM(CASE WHEN numeric THEN value END) expression for total row.
 */
export const totalName = (column, isDms) => {
  const ref = refName(column, isDms);
  const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);
  const totalAlias = colNameAfterAS || colNameBeforeAS;
  return `SUM(CASE WHEN (${ref})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${ref})::numeric ELSE NULL END ) as ${totalAlias}_total`;
};

// ─── Filter tree processing ─────────────────────────────────────────────────

const operationToExpressionMap = {
  filter: "IN",
  exclude: "NOT IN",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

const fnToTextMap = {
  list: (colNameBeforeAs, colNameAfterAS) =>
    `array_to_string(array_agg(distinct ${colNameBeforeAs}), ', ') as ${colNameAfterAS}`,
  default: (colNameBeforeAs, colNameAfterAS, fn = "max") =>
    `${fn}(${colNameBeforeAs}) as ${colNameAfterAS}`,
};

const TEXT_TYPES = new Set([
  "text",
  "string",
  "varchar",
  "char",
  "character varying",
]);
const isTextColumn = (col) =>
  TEXT_TYPES.has((col?.dataType || col?.type || "").toLowerCase());

/**
 * Map filter tree column names to server-side ref names.
 * This is the SYNCHRONOUS version — it does NOT resolve multiselect values.
 * Multiselect resolution requires API calls and must happen separately.
 */
export const mapFilterGroupCols = (node, getColumn, isDms) => {
  if (!node || !Object.keys(node).length) return node;

  if (node.groups && Array.isArray(node.groups)) {
    return {
      ...node,
      groups: node.groups
        .map((child) => mapFilterGroupCols(child, getColumn, isDms))
        .filter(Boolean),
    };
  }

  // Leaf condition: map col name to refName
  const col = getColumn(node.col);
  if (!col) return node;

  // For like ops, skip the node entirely when value is empty (all-empty-string array
  // or empty array). This matches the guard in extractLegacyColumnFilters and prevents
  // `LIKE '%%'` from being sent — which would silently exclude NULL rows.
  if (node.op === "like") {
    const vals = Array.isArray(node.value) ? node.value : (node.value != null ? [node.value] : []);
    if (!vals.length || !vals.every((v) => String(v).length)) return null;
  }

  // For filter/exclude ops, skip the node entirely when no real value remains
  // (empty array, or all-empty-string/null). An empty IN-list compiles to either
  // `col IN ()` — a Postgres syntax error that fails the whole query — or
  // `col IN ('')`, which silently matches nothing. Neither is ever the author's
  // intent: an unset page-filter leaf (e.g. a `usePageFilters` region control with
  // no selection) should WIDEN the query to "no constraint", not blank it. This
  // mirrors the `like` guard above and the multiselect empty-strip below; null
  // sentinels ('null'/'not null') survive (String length > 0) for IS NULL handling.
  if (node.op === "filter" || node.op === "exclude") {
    const vals = (Array.isArray(node.value) ? node.value : (node.value != null ? [node.value] : []))
      .filter((v) => v != null && String(v).length);
    if (!vals.length) return null;
  }

  const ref = attributeAccessorStr(
    col.name,
    isDms,
    isCalculatedCol(col),
    col.systemCol,
  );

  const mapped = {
    ...node,
    value: node.op === "like" ? `%${node.value}%` : node.value,
    col: ref || node.col,
  };

  // Time-filter instant mode: resolve `compareEnd` (a column name or alias)
  // to its full SQL accessor and stash on the value. The server's instant
  // predicate prefers `compareEndAccessor` when present, falling back to its
  // built-in `data->>'<name>'` derivation (which only works for stored
  // columns). Without this, calc columns referenced as compareEnd would
  // resolve server-side to `data->>'<calc_alias>'` — a non-existent JSON key.
  if (node.op === "time" && node.value?.compareEnd) {
    const endCol = getColumn(node.value.compareEnd);
    if (endCol) {
      const endRef = attributeAccessorStr(
        endCol.name,
        isDms,
        isCalculatedCol(endCol),
        endCol.systemCol,
      );
      if (endRef) {
        mapped.value = { ...mapped.value, compareEndAccessor: endRef };
      }
    }
  }

  // For multiselect columns with filter/exclude ops, use array_contains/array_not_contains
  // so the server does JSON array membership check instead of the old client-side fetch-and-match.
  // Null sentinels ('null'/'not null') are kept as-is for IS NULL / IS NOT NULL handling.
  if (col.type === "multiselect" && (node.op === "filter" || node.op === "exclude")) {
    const normalized = (Array.isArray(node.value) ? node.value : [node.value])
      .map((v) => v?.value ?? v)
      .filter((v) => v != null && v !== "");

    const hasNullSentinel = normalized.includes("null") || normalized.includes("not null");
    const realValues = normalized.filter((v) => v !== "null" && v !== "not null");

    if (realValues.length && !hasNullSentinel) {
      mapped.op = node.op === "exclude" ? "array_not_contains" : "array_contains";
      mapped.value = realValues;
    }
  }

  // Map is_null / is_not_null ops to null sentinels (and blank strings for text columns)
  if (node.op === "is_not_null" || node.op === "is_null") {
    const sentinels = isTextColumn(col) ? ["null", ""] : ["null"];
    mapped.op = node.op === "is_not_null" ? "exclude" : "filter";
    mapped.value = sentinels;
  }

  // If condition has an aggregate fn, compute the HAVING expression
  if (node.fn) {
    const fnExpr = splitColNameOnAS(
      applyFn({ ...col, fn: node.fn }, isDms),
    )[0];
    const opExpr = operationToExpressionMap[node.op];
    const val = Array.isArray(mapped.value) ? mapped.value[0] : mapped.value;
    if (fnExpr && opExpr && val != null) {
      mapped.havingExpr = `${fnExpr} ${opExpr} ${val}`;
    }
  }

  return mapped;
};

/**
 * Extract conditions with havingExpr from a mapped filter tree.
 * Returns { filterGroups: cleaned tree, having: string[] }
 */
export const extractHavingFromFilterGroups = (node) => {
  if (!node || !Object.keys(node).length)
    return { filterGroups: node, having: [] };

  if (!node.groups) {
    if (node.havingExpr) return { filterGroups: null, having: [node.havingExpr] };
    return { filterGroups: node, having: [] };
  }

  const having = [];
  const keptGroups = [];
  for (const child of node.groups) {
    const result = extractHavingFromFilterGroups(child);
    having.push(...result.having);
    if (result.filterGroups) keptGroups.push(result.filterGroups);
  }
  return { filterGroups: { ...node, groups: keptGroups }, having };
};

/**
 * Extract conditions with isNormalFilter from a filter tree.
 * Returns { cleaned: tree without normal filters, normalFilters: array }
 */
export const extractNormalFiltersFromGroups = (node) => {
  if (!node || !Object.keys(node).length)
    return { cleaned: node, normalFilters: [] };

  if (!node.groups) {
    if (node.isNormalFilter) {
      return {
        cleaned: null,
        normalFilters: [
          {
            column: node.col,
            values: Array.isArray(node.value) ? node.value : [node.value],
            operation: node.op,
            fn: node.fn,
            valueCol: node.valueCol,
          },
        ],
      };
    }
    return { cleaned: node, normalFilters: [] };
  }

  const normalFilters = [];
  const keptGroups = [];
  for (const child of node.groups) {
    const result = extractNormalFiltersFromGroups(child);
    normalFilters.push(...result.normalFilters);
    if (result.cleaned) keptGroups.push(result.cleaned);
  }
  return { cleaned: { ...node, groups: keptGroups }, normalFilters };
};

// ─── Custom bucket filtering ────────────────────────────────────────────────

/**
 * Build filter leaves that restrict fetched rows to those that fall into at
 * least one defined custom bucket.
 *
 * Reads the RESOLVED `customBuckets.config` (built by resolveAliasGroups —
 * works for both static groups and dynamic page-filter-bound groups). Produces
 * one `IN (...)` leaf per alias: `col` is that alias's source column, `value`
 * is the union of all its group value-arrays (deduped). Fallback labels are
 * intentionally excluded — fallback rows are exactly the ones "filter to
 * buckets" mode is meant to drop.
 *
 * Gating:
 * - Master switch: bucket behavior is OFF unless `customBuckets.enabled === true`.
 * - When enabled, "filter to buckets" defaults ON; `filterToBuckets === false`
 *   disables just the row-filtering while keeping the bucket column/aliasGroups.
 * - Empty/missing groups → no leaf for that alias (toggle-on with nothing
 *   configured is a safe no-op that returns all rows).
 *
 * `source_id` is stamped on the leaf so applyTableAliasToJoin aliases the
 * column to `ds.` under a join (avoids ambiguous `data->>` in DMS-on-DMS joins).
 *
 * `isDms` text-coerces the leaf values: DMS columns resolve to `data->>'col'`
 * (always TEXT), so a numeric bucket value left native would compile to
 * `data->>'col' IN (2022)` — a text/integer mismatch Postgres rejects. DAMA
 * physical columns keep native typing. Mirrors the server's `isJsonText`
 * handling in buildAliasGroupCase.
 */
export const buildCustomBucketFilters = (customBuckets, baseSourceId, isDms = false) => {
  if (
    !customBuckets ||
    customBuckets.enabled !== true ||
    customBuckets.filterToBuckets === false
  )
    return [];
  const cfg = customBuckets.config || {};

  // A group's values may be a real array (static groups, split from CSV) OR a
  // JSON-stringified array (dynamic page-filter bindings whose value field holds
  // a stringified list). Normalize both — mirrors the server's CASE builder,
  // which does `typeof values === 'string' ? JSON.parse(values) : values`.
  // Without this, a stringified array survives as a single scalar and the leaf
  // compiles to `col = '["a","b"]'` instead of `col IN ('a','b')`.
  const coerceGroupValues = (values) => {
    if (Array.isArray(values)) return values;
    if (typeof values === "string") {
      try {
        const parsed = JSON.parse(values);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [values];
      }
    }
    return values == null ? [] : [values];
  };

  return Object.values(cfg)
    .map(({ column, groups } = {}) => {
      const values = [
        ...new Set(
          Object.values(groups || {})
            .flatMap(coerceGroupValues)
            .filter((v) => v != null && v !== "")
            // DMS columns are JSON text (`data->>`), so values must be text too.
            .map((v) => (isDms ? String(v) : v)),
        ),
      ];
      return column && values.length
        ? { col: column, op: "filter", value: values, source_id: baseSourceId }
        : null;
    })
    .filter(Boolean);
};

// ─── Page filter application ────────────────────────────────────────────────

const isGroup = (node) => node?.groups && Array.isArray(node.groups);

export const applyTableAliasToJoin = (filterTree, sourceIdToAlias, baseSourceId) => {
    if (!filterTree) return filterTree;
  
  const applyToNode = (node) => {
    if (isGroup(node)) {
      return { ...node, groups: node.groups.map(applyToNode) };
    }

    let newNode = { ...node };

    const prefix = sourceIdToAlias[node.source_id] || (node.source_id === baseSourceId ? 'ds' : "");
    // Always alias 'col' if it exists
    if (newNode.col && prefix) {
      newNode.col = `${prefix}.${newNode.col.split('.').pop()}`;
    }

    // Alias 'searchParamKey' if it exists to allow PageFilter application to find it
    if (newNode.searchParamKey && prefix) {
      //TODO JOIN TESTING -- need to test page filters / search params
      const paramKey = newNode.searchParamKey.split('.').pop();
      newNode.searchParamKey = `${prefix}.${paramKey}`;
    }

    return newNode;
  };

  return applyToNode(filterTree, sourceIdToAlias);
};

/**
 * Apply page-level filter values to conditions with usePageFilters=true.
 * Returns a new filter tree with values updated from pageFilters.
 */
export const applyPageFilters = (filterTree, pageFilters) => {
  if (
    !filterTree ||
    !pageFilters ||
    !Object.keys(pageFilters).length
  )
    return filterTree;

  const applyToNode = (node) => {
    if (isGroup(node)) {
      return { ...node, groups: node.groups.map(applyToNode) };
    }
    if (!node?.usePageFilters) return node;

    const key = node.searchParamKey || node.col;
    const pageValues = pageFilters[key];
    if (!pageValues) return node;

    // Time filters carry a structured value object — pageState stores a
    // compact URL token like 'last:7d' as a single-element string array.
    // Parse the token into a TimeFilterValue so the leaf flows correctly into
    // the SQL builder. Bad tokens leave the saved value untouched so a typo'd
    // URL doesn't blow away an admin's configured filter.
    if (node.op === 'time') {
      const token = Array.isArray(pageValues) ? pageValues[0] : pageValues;
      const parsed = typeof token === 'string' ? parseTimeFilterURL(token) : null;
      // mergeUrlOntoExposedAxes preserves author-locked axes when the leaf has
      // `exposedAxes` set; a Phase 2-4 leaf without `exposedAxes` continues to
      // wholesale-replace as before (back-compat).
      return parsed ? { ...node, value: mergeUrlOntoExposedAxes(node.value, parsed) } : node;
    }

    const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
    return { ...node, value: normalized };
  };

  return applyToNode(filterTree);
};

/**
 * A filter leaf can opt into `requireResolved: true` — its value must be supplied
 * by a page/action param (resolved via usePageFilterSync) before the section is
 * allowed to query. Until then the leaf value is empty, and firing the query would
 * (after the empty-IN strip in mapFilterGroupCols) drop the only intended constraint
 * and scan the whole table — the same trap the custom-bucket skipFetch guards. It
 * also avoids the "flash": a section that resolves its scope from a published action
 * param (e.g. a load_publish driver) would otherwise paint its saved default first,
 * then re-query once the param lands. Returns true while ANY requireResolved leaf is
 * still unresolved (empty value); callers defer the fetch. usePageFilterSync writes
 * the value once the param publishes → fetchKey changes → the section fetches once.
 */
export const hasUnresolvedRequiredLeaf = (node) => {
  if (!node) return false;
  if (isGroup(node)) return node.groups.some(hasUnresolvedRequiredLeaf);
  if (!node.requireResolved) return false;
  const vals = Array.isArray(node.value) ? node.value : node.value == null ? [] : [node.value];
  return !vals.some((v) => v != null && String(v).length);
};

/**
 * "Include prior period" expansion. For any leaf flagged
 * `includePriorPeriod`, expand each NUMERIC value `v` to also include
 * `v - step`, `v - 2*step`, … (`priorPeriodCount` steps) so the prior
 * period(s) land in scope alongside the selected one. This lets a card
 * compute "vs prior period" deltas (GROUP BY period + lag() + a formula
 * column) from a SINGLE period control.
 *
 * Runs as its own pass over the RESOLVED filter tree — AFTER applyPageFilters —
 * so it catches the value whether it arrived via a live page filter or sits on
 * the section's saved leaf. Non-numeric values pass through untouched; leaf op
 * stays `filter` (IN). Leaves without the flag are returned unchanged, so
 * existing rows are byte-identical.
 */
export const applyPriorPeriodExpansion = (filterTree) => {
  if (!filterTree) return filterTree;

  const applyToNode = (node) => {
    if (isGroup(node)) {
      return { ...node, groups: node.groups.map(applyToNode) };
    }
    if (!node?.includePriorPeriod) return node;
    if (!Array.isArray(node.value) || !node.value.length) return node;

    const step = Number(node.priorPeriodStep) || 1;
    const count = Number(node.priorPeriodCount) || 1;
    const expanded = [];
    for (const raw of node.value) {
      expanded.push(raw);
      const v = Number(raw);
      if (raw !== '' && raw !== null && Number.isFinite(v)) {
        const isStr = typeof raw === 'string';
        for (let i = 1; i <= count; i++) {
          const prior = v - i * step;
          expanded.push(isStr ? String(prior) : prior);
        }
      }
    }
    return { ...node, value: [...new Set(expanded)] };
  };

  return applyToNode(filterTree);
};

export const flattenFilterValues = filterTree => {
  if (!filterTree) return filterTree;

  const applyToNode = (node) => {
    if (isGroup(node)) {
      return { ...node, groups: node.groups.map(applyToNode) };
    }

    if (!Array.isArray(node.value) || !node.value.length) return node;

    return { ...node, value: node.value.flat() };
  };

  return applyToNode(filterTree);
}

/**
 * Comparison-series filter patch: merge a variant's filter tree over the base.
 *
 * A variant is a *patch*, not a blind AND. On any column the patch constrains it
 * **replaces** the base's leaf for that column; columns the patch doesn't touch are
 * inherited; the patch's own leaves are AND-appended. This one rule covers every
 * combination an author needs:
 *   • base `tmc IN(route)` + patch `date BETWEEN …` → AND (period appended)
 *   • base `date …`        + patch `tmc IN(route)`  → base date kept, route replaces
 *   • base (metric/axis only) + patch `tmc + date`  → patch is the whole tree
 *
 * Both trees are the standard `{ op, groups:[…leaf{col,op,value}] }` shape (raw
 * column names, pre-resolution). Returns a new tree; never mutates the inputs.
 */
export const mergeVariantFilters = (baseTree, patchTree) => {
  const patch = patchTree && patchTree.groups?.length ? patchTree : null;

  // Columns the patch constrains (any depth) → these base leaves get pruned.
  const touched = new Set();
  const collect = (node) => {
    if (!node) return;
    if (node.groups) { node.groups.forEach(collect); return; }
    if (node.col) touched.add(node.col);
  };
  if (patch) collect(patch);

  const prune = (node) => {
    if (!node) return null;
    if (node.groups) {
      const groups = node.groups.map(prune).filter(Boolean);
      return groups.length ? { ...node, groups } : null;
    }
    return touched.has(node.col) ? null : node;
  };
  const prunedBase = baseTree && baseTree.groups?.length ? prune(baseTree) : null;

  const groups = [];
  if (prunedBase) groups.push(prunedBase);
  if (patch) groups.push(patch);

  if (!groups.length) return { op: 'AND', groups: [] };
  if (groups.length === 1) return groups[0];
  return { op: 'AND', groups };
};

/**
 * Comparison-series dynamic binding: resolve a published page-state list into the
 * engine's `[{ label, filters }]` variant shape (Piece 3).
 *
 * This is the dynamic counterpart of the static `comparisonSeries.variants` JSON.
 * The list comes from a `pageState.filters` action param (a "comparison_series"
 * componentFunctions subscriber publishes/binds it); `subArgs` carries the keys the
 * subscriber was configured with. Pure + exported so it unit-tests without React.
 *
 * @param {Object} subArgs - { labelKey, valueKey, column } from the subscriber config.
 * @param {Array}  rawList - the action param's `values` array (one entry per variant).
 * @returns {Array<{label, filters}>} resolved variants (entries missing label/filters dropped).
 *
 * Each entry becomes one variant:
 *   • `label`   = entry[labelKey]  (or the bare entry when it's a string and no labelKey).
 *   • `filters` = entry[valueKey] when that is already a filter tree (`op`/`col`/`groups`);
 *                 otherwise, when `column` is set, a leaf `{ col, op:'filter', value:[…] }`
 *                 built from the value(s). Mirrors the base/variant filter-tree shape so
 *                 `mergeVariantFilters` + `resolveArmTree` consume it unchanged.
 *
 * Composite `{ id, value }` payloads (spreadsheet click_publish per-row identity) are
 * unwrapped to `.value` first — same rule as resolveAliasGroups in usePageFilterSync.
 */
export const resolveComparisonVariants = (subArgs, rawList) => {
  const { labelKey, valueKey, column } = subArgs || {};
  return (rawList || [])
    .map((entry) => {
      const entryVal =
        entry && typeof entry === 'object' &&
        labelKey && entry[labelKey] === undefined && entry.value !== undefined
          ? entry.value
          : entry;

      const label = labelKey
        ? entryVal?.[labelKey]
        : typeof entryVal === 'string'
          ? entryVal
          : undefined;

      const rawVal = valueKey ? entryVal?.[valueKey] : entryVal;

      let filters;
      if (rawVal && typeof rawVal === 'object' && (rawVal.op || rawVal.col || rawVal.groups)) {
        filters = rawVal; // already a filter tree
      } else if (column && rawVal !== undefined && rawVal !== null && rawVal !== '') {
        filters = {
          op: 'AND',
          groups: [{ col: column, op: 'filter', value: Array.isArray(rawVal) ? rawVal : [rawVal] }],
        };
      }

      return label && filters ? { label, filters } : null;
    })
    .filter(Boolean);
};

// ─── Legacy column filter extraction ────────────────────────────────────────

/**
 * Extract filter/exclude/gt/gte/lt/lte/like from deprecated columns[].filters arrays.
 * This handles the old filter format that hasn't been migrated to filterGroups yet.
 */
const extractLegacyColumnFilters = (columns) => {
  const result = {};

  for (const column of columns) {
    const isNormalisedColumn =
      columns.filter(
        (col) => col.name === column.name && col.filters?.length,
      ).length > 1;

    for (const f of column.filters || []) {
      if (
        !Array.isArray(f.values) ||
        !f.values.every((v) => typeof v !== "object") ||
        !f.values.length
      )
        continue;

      const { operation, fn } = f;
      let { values } = f;

      // For filter/exclude, drop empty-string/null values before they reach the
      // server. An unset page-filter leaf (e.g. a blank `?system=` driving an
      // `is_interstate` control, or a blank `?region=`) resolves to [""], which
      // compiles to `col IN ('')` and errors on numeric columns ("Error getting
      // length"). Null sentinels ('null'/'not null') survive (String length > 0)
      // for IS NULL handling. Mirrors the filterGroups guard in mapColumnFilters.
      // Skip the leaf entirely when no real value remains.
      if (operation === "filter" || operation === "exclude") {
        values = values.filter((v) => v != null && String(v).length);
        if (!values.length) continue;
      }

      if (
        operation === "like" &&
        !(values.length && values.every((v) => v.length))
      ) {
        result[operation] = {};
      } else if (isNormalisedColumn) {
        (result.normalFilter ??= []).push({
          column: column.name,
          values,
          operation,
          fn,
        });
      } else {
        result[operation] = {
          ...(result[operation] || {}),
          [column.name]: values,
        };
      }
    }

    if (column.excludeNA) {
      result.exclude =
        result.exclude && result.exclude[column.name]
          ? {
              ...result.exclude,
              [column.name]: [...result.exclude[column.name], "null"],
            }
          : { ...(result.exclude || {}), [column.name]: ["null"] };
    }
  }

  return result;
};

// ─── Column settings computation ────────────────────────────────────────────

/**
 * Build columnsWithSettings — enriches user columns with server-side ref/req/total names.
 * This is the core column metadata computation previously inline in getData().
 */
export const buildColumnsWithSettings = (columns, sourceColumns, isDms) => {
  const sourceColumnsByName = new Map([
    ...(columns || [])
      .filter((c) => c.systemCol)
      .map((col) => [col.name, col]),
    ...sourceColumns.map((col) => [col.name, col]),
  ]);

  const duplicatedColumnNames = new Set(
    columns.filter((col) => col.isDuplicate).map((col) => col.name),
  );

  return columns
    .filter(({ actionType, type }) => !actionType && type !== "formula")
    .map((column) => {
      const originalColumn = sourceColumnsByName.get(column.name);
      const fullColumn = { ...(originalColumn ?? {}), ...column };

      const isCalculated = isCalculatedCol(column);
      const isCopiedColumn =
        !column.isDuplicate && duplicatedColumnNames.has(column.name);
      // Synthetic server-side aliases (the custom-bucket dimension and the
      // comparison-series discriminator) are not real columns: their ref/req must
      // stay the bare alias (verbatim). If they went through attributeAccessorStr
      // they'd become `data->>'<alias>'` for DMS sources — a phantom JSON key. For
      // custom buckets the server's `groupBy.includes(alias)` match would miss
      // (silently disabling the dimension); for comparison series the discriminator
      // is provided by the fan-out's `'<label>' as <seriesKey>` literal, so the
      // attribute must round-trip by the bare seriesKey. (DAMA returns the bare name
      // anyway, so this only changes the DMS path.)
      const isSyntheticAlias =
        column.origin === "custom-bucket" || column.origin === "comparison-series";
      const colReqName = isSyntheticAlias ? column.name : reqName(fullColumn, isDms);
      const colRefName = isSyntheticAlias
        ? column.name
        : attributeAccessorStr(column.name, isDms, isCalculated, column.systemCol);
      const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);
      const totalAlias = (colNameAfterAS || colNameBeforeAS).replace(".", "_");
      const colTotalName = `SUM(CASE WHEN (${colRefName})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${colRefName})::numeric ELSE NULL END ) as ${totalAlias}_total`;

      return {
        ...fullColumn,
        isCalculatedColumn: isCalculated,
        isCopiedColumn,
        reqName: colReqName,
        refName: colRefName,
        totalName: colTotalName,
      };
    });
};

/**
 * Get columns to fetch — visible, non-formula, non-static columns + formula variable columns.
 */
export const getColumnsToFetch = (columnsWithSettings, allColumns) => {
  const columnsToFetch = columnsWithSettings.filter(
    (column) =>
      column.show && column.type !== "formula" && column.origin !== "static",
  );

  // Collect variables used in formula columns and add them to fetch list
  const formulaVariableColumns = columnsWithSettings
    .filter((column) => column.type === "formula")
    .reduce((acc, curr) => {
      const variablesYetToBeFetched = (curr.variables || []).filter(
        (variable) =>
          !columnsToFetch.find(
            (ctf) =>
              ctf.name === variable.name &&
              ctf.isDuplicate === variable.isDuplicate &&
              ctf.copyNum === variable.copyNum,
          ),
      );
      acc.push(...variablesYetToBeFetched);
      return acc;
    }, []);

  if (formulaVariableColumns.length) {
    columnsToFetch.push(...formulaVariableColumns);
  }

  return columnsToFetch;
};

// ─── Normal filter column generation ────────────────────────────────────────

/**
 * Build normal filter columns (CASE WHEN expressions) from normalFilter array.
 * These are added to the columnsToFetch list.
 */
const buildNormalFilterColumns = (
  allNormalFilters,
  columns,
  columnsWithSettingsByName,
  isDms,
) => {
  // Build a map of isDuplicate columns by name for matching
  const duplicateColumnsByName = {};
  columns.forEach((col) => {
    if (col.normalName) {
      (duplicateColumnsByName[col.name] ??= []).push(col);
    }
  });
  const usedDuplicateIndices = {};

  const normalColumns = [];

  allNormalFilters.forEach(
    ({ column, values, operation, fn, valueCol: explicitValueCol }, i) => {
      const valueColumnName =
        explicitValueCol ||
        columns.find((col) => col.valueColumn)?.name ||
        "value";
      const fullValueColumn = columnsWithSettingsByName.get(valueColumnName);
      const valueColumn =
        fullValueColumn?.refName ||
        attributeAccessorStr(valueColumnName, isDms, false, false);

      let fullColumn;
      if (explicitValueCol) {
        const dupes = duplicateColumnsByName[column] || [];
        const idx = usedDuplicateIndices[column] || 0;
        fullColumn = dupes[idx] || { normalName: `${column}_nf_${i}` };
        usedDuplicateIndices[column] = idx + 1;
      } else {
        fullColumn = columns.find(
          (col) =>
            col?.name === column &&
            JSON.stringify(values) ===
              JSON.stringify(col?.filters?.[0]?.values),
        );
      }

      const filterColRef = explicitValueCol
        ? columnsWithSettingsByName.get(column)?.refName ||
          attributeAccessorStr(column, isDms, false, false)
        : column;

      if (column && fullColumn?.normalName && values?.length) {
        const name = fullColumn.normalName;
        const filterValues =
          ["gt", "gte", "lt", "lte"].includes(operation) &&
          Array.isArray(values)
            ? values[0]
            : Array.isArray(values)
              ? values.map((v) => `'${v}'`)
              : values;
        const nameBeforeAS = `CASE WHEN ${filterColRef} ${operationToExpressionMap[operation] || "IN"} (${filterValues}) THEN ${valueColumn} END`;
        const colReqName = fnToTextMap[fn]
          ? fnToTextMap[fn](nameBeforeAS, name)
          : fnToTextMap.default(nameBeforeAS, name, fn);
        normalColumns.push({ name, reqName: colReqName });
      }
    },
  );

  return normalColumns;
};

// ─── Joins ────────────────────────────────────────

export const buildJoin = ({ join, externalSource }) => {
  return {
    sources: buildJoinSources({ join, externalSource }),
    on: buildJoinOnClause({ join, externalSource }),
  };
};

/**
 * OUTPUT:
 * key is the "alias" given to each source.
 * value is either { view_id: 1648, env: "dama" }, or an udaConfig
 */
export const buildJoinSources = ({ join, externalSource }) => {
  const { sources } = join;
  return Object.keys(sources).reduce((acc, curKey) => {
    // If curKey is 'ds', this is our primary/base source.
    if (curKey === 'ds') return acc;

    const curSource = sources[curKey].source ? sources[curKey] : externalSource;
    acc[curKey] = {
      view_id: curSource.view || curSource.view_id,
      env: curSource?.env || curSource?.sourceInfo?.env,
    };

    return acc;
  }, {});
};

/**
 * Builds the join 'on' clauses.
 * Returns an array of join conditions, one for each extra source.
 *
 * Each side is JSONB-unwrapped when its source is DMS-internal (`alias.data->>'col'`)
 * vs accessed directly when DAMA-backed (`alias.col`). Without this, joining two
 * DMS sources produces SQL referencing physical columns that don't exist.
 */
export const buildJoinOnClause = ({ join, externalSource }) => {
  const { sources, operator = "=" } = join;
  const baseIsDms = !!externalSource?.isDms;
  const accessor = (alias, col, isDmsSide) =>
    isDmsSide ? `${alias}.data->>'${col}'` : `${alias}.${col}`;

  // The 'ds' is our base table. We join every other source onto it.
  return Object.keys(sources)
    .filter((alias) => alias !== "ds")
    .map((sourceAlias) => {
      // Find the joinColumns for this specific source
      const sourceJoinColumns = sources[sourceAlias].joinColumns || [];
      // Use the user-selected join type, defaulting to 'left'
      const type = sources[sourceAlias].type || "left";
      // Use the user-selected merge strategy, defaulting to 'join'
      const mergeStrategy = sources[sourceAlias].mergeStrategy || "join";
      const joinedIsDms = !!sources[sourceAlias].sourceInfo?.isDms;

      // Each sourceAlias should have a corresponding join condition string
      const conditions = sourceJoinColumns.map(
        (col) =>
          `${accessor("ds", col.dsColumn, baseIsDms)} ${operator} ${accessor(
            sourceAlias,
            col.joinSourceColumn,
            joinedIsDms,
          )}`,
      );

      return {
        type,
        mergeStrategy,
        table: sourceAlias,
        on: conditions.join(" AND "),
      };
    });
};

export const isJoinComplete = (joinSource) => {
  const strategy = joinSource.mergeStrategy || 'join';
  if(!joinSource.source || !joinSource.view) {
    console.log("join is missing source or view::", joinSource);
    return false
  } else if (strategy === "union" || strategy === "except") {
    return true;
  } else if (strategy === "join") {
    if (!joinSource.type) {
      console.log("join is missing TYPE")
      return false
    };
    if (!joinSource.joinColumns || joinSource.joinColumns.length === 0) {
      console.log("join is missing 'on columns'::", joinSource);
      return false
    };

    if(!joinSource.joinColumns.every(col => col.dsColumn && col.joinSourceColumn)){
      console.log("join is missing a portion of join column pair")
    }

    return joinSource.joinColumns.every(col => col.dsColumn && col.joinSourceColumn);
  } else {
    console.log("unknown join strategy::", strategy);
    return false;
  }
}

// ─── Output source info (Phase 4: chainability) ────────────────────────────
/**
 * Compute outputSourceInfo — describes what this dataWrapper produces after
 * all transforms (column selection, renaming, aggregation, meta lookups, formulas).
 *
 * Used by:
 * - Phase 5: page-level data sources panel shows output schema
 * - Phase 6: downstream joins reference this to know available columns
 *            and compile asUdaConfig into WITH clauses
 */
export const computeOutputSourceInfo = ({
  columnsToFetch,
  columnsWithSettings,
  externalSource,
  options,
  attributes,
  columns,
}) => {
  const outputColumns = columnsToFetch
    .map((col) => {
      const source = col.formula
        ? "formula"
        : col.origin === "calculated-column"
          ? "calculated"
          : col.fn
            ? "aggregation"
            : col.meta_lookup
              ? "meta_lookup"
              : col.serverFn
                ? "serverFn"
                : "passthrough";

      // Aggregations always produce numbers; meta lookups produce text
      const type =
        source === "aggregation"
          ? "number"
          : source === "meta_lookup"
            ? "text"
            : col.type || "text";

      const display =
        source === "aggregation"
          ? "number"
          : source === "meta_lookup"
            ? "text"
            : col.display || "text";

      return {
        name: col.normalName || col.name,
        originalName: col.name,
        type,
        display,
        source,
        fn: col.fn || null,
        meta_lookup: col.meta_lookup || null,
      };
    });

  // Also include formula columns (client-side only, not in columnsToFetch
  // unless their variables are). Formula columns have type === 'formula'.
  const formulaColumns = (columns || [])
    .filter((c) => c.type === "formula" && c.show && c.name && c.formula)
    .map((col) => ({
      name: col.normalName || col.name,
      originalName: col.name,
      type: "number",
      display: "number",
      source: "formula",
      fn: null,
      meta_lookup: null,
    }));

  const allOutputColumns = [...outputColumns, ...formulaColumns];

  const isGrouped = (columnsWithSettings || []).some((c) => c.group);

  // Only set asUdaConfig if there are transforms beyond raw passthrough
  const hasTransforms =
    isGrouped ||
    (columnsWithSettings || []).some(
      (c) => c.fn || c.meta_lookup || c.serverFn,
    ) ||
    Object.keys(options.filter || {}).length > 0 ||
    (options.filterGroups?.groups?.length > 0);

  const asUdaConfig = hasTransforms
    ? { options, attributes, sourceInfo: externalSource }
    : null;

  return { columns: allOutputColumns, isGrouped, asUdaConfig };
};

// ─── Main builder ───────────────────────────────────────────────────────────

/**
 * buildUdaConfig — the main entry point.
 *
 * Takes the data source config and returns a complete UDA options object + attributes list.
 *
 * @param {Object} input
 * @param {Object} input.externalSource - Source identity and column metadata (isDms, view_id, source_id, columns)
 * @param {Array}  input.columns - User column config (show, group, sort, fn, meta_lookup, etc.)
 * @param {Object} input.filters - Top-level filter tree {op, groups} (promoted from dataRequest.filterGroups)
 * @param {Object} [input.join] - Optional join config (Phase 6)
 * @param {Object} [input.pageFilters] - Runtime URL search params for usePageFilters conditions
 * @param {Object} [input.customBuckets] - Configuration for custom bucket columns
 * @returns {{ options: Object, attributes: string[], columnsToFetch: Array, columnsWithSettings: Array, outputSourceInfo: Object }}
 */
export const buildUdaConfig = ({
  externalSource,
  columns: rawUserColumnsInput,
  filters,
  join: rawJoin,
  pageFilters,
  customBuckets,
  comparisonSeries,
}) => {

  // Custom buckets are "active" only when enabled AND the resolved config has at
  // least one alias whose groups actually carry values. A dynamic binding stays
  // unresolved until usePageFilterSync runs (e.g. no page filters present yet),
  // leaving config empty — in that state we must NOT group/select the synthetic
  // bucket column, or the server would reference a phantom alias column that
  // doesn't exist in the table. Inactive → drop the column entirely (safe no-op
  // matching "buckets off"); the config stays on state so it can resolve later.
  const activeCustomBuckets =
    customBuckets?.enabled === true &&
    Object.values(customBuckets.config || {}).some(
      // `def.column` (the source column) is required: after a source swap the
      // sourceField is cleared but a dynamic binding may still resolve groups
      // from page filters — without this guard that would emit a CASE on an
      // empty column and break the server query.
      (def) => def && def.column && Object.keys(def.groups || {}).length > 0,
    );
  // Effective variants — the single list buildUdaConfig fans out over. Two binding
  // modes feed it (Piece 2 static, Piece 3 dynamic):
  //   • dynamic: a "comparison_series" subscriber resolves a page-state list into
  //     `comparisonSeries.config` (usePageFilterSync). Its *presence* (even `[]`)
  //     marks dynamic mode, so `config` wins over static `variants` and an unresolved
  //     dynamic binding (`config: []`) correctly reads as inactive instead of falling
  //     back to the static list.
  //   • static (Piece 2): no `config` → the author-authored `variants` JSON.
  const effectiveVariants =
    comparisonSeries?.config !== undefined
      ? comparisonSeries.config
      : comparisonSeries?.variants || [];

  // Comparison series is "active" only when enabled AND at least one labeled
  // variant exists. Inactive → drop the synthetic discriminator column (like the
  // inactive-custom-bucket case) so we never fetch a phantom alias the fan-out
  // isn't producing; the config stays on state for clean re-enable.
  const activeComparisonSeries =
    comparisonSeries?.enabled === true &&
    Array.isArray(effectiveVariants) &&
    effectiveVariants.some((v) => v && v.label);

  const rawUserColumns = rawUserColumnsInput.filter(
    (c) =>
      (activeCustomBuckets || c.origin !== "custom-bucket") &&
      (activeComparisonSeries || c.origin !== "comparison-series"),
  );

  // Guard against the "unfiltered full-table scan" trap. When custom buckets are
  // enabled with "filter to buckets" active AND the binding is dynamic (its group
  // values come from page filters), an unresolved config — no page params present
  // yet — drops BOTH the bucket column AND the row-restricting bucket filter
  // (buildCustomBucketFilters returns [] for an empty config). That leaves a query
  // whose only intended constraint has vanished, so it scans the whole table
  // (millions of rows → multi-minute hang). Signal the caller to skip the fetch
  // entirely; once usePageFilterSync resolves config from the page filters, the
  // fetchKey changes and the section refetches with the proper bucket constraint.
  // Static buckets are excluded: an empty static config is an intentional no-op
  // ("filter to buckets on, nothing configured" returns all rows by design).
  const skipFetch =
    (customBuckets?.enabled === true &&
      customBuckets?.filterToBuckets !== false &&
      customBuckets?.type !== "static" &&
      !activeCustomBuckets) ||
    // A leaf flagged requireResolved hasn't received its page/action-param value yet —
    // firing now would scan the whole table (see hasUnresolvedRequiredLeaf).
    hasUnresolvedRequiredLeaf(filters);

  const join = { sources:{} };

  //filter out keys from join that are incomplete configs
  Object.keys(rawJoin?.sources || {}).forEach((alias) => {
    if(isJoinComplete(rawJoin.sources[alias])) {
      join.sources[alias] = rawJoin.sources[alias];
    }
  });

  const isJoinPresent = calculateIsJoinPresent(join);
  join.sources.ds = {};
  const isDms = externalSource?.isDms;

  const sourceIdToTableAlias = isJoinPresent ? Object.keys(join.sources).reduce((acc, alias) => {
    const curJoinSource = join.sources[alias];
    const source_id = curJoinSource.source || externalSource.source_id;
    acc[source_id] = alias;
    return acc;
  },{}) : {};
  sourceIdToTableAlias[externalSource.source_id] = 'ds';

  const joinColumns = isJoinPresent
    ? Object.values(join.sources)
        .filter((jSource) => Object.keys(jSource.sourceInfo || {}).length)
        .map((jSource) => jSource.sourceInfo.columns)
        .flat()
    : [];
  
  const allCols = [...(externalSource?.columns || []), ...joinColumns];

  /**
   * Source columns are ALL columns from ALL sources in the section
   *
   */
  const sourceColumns = allCols.map((col) => {
    const colSourceId = col.source_id || externalSource.source_id;
    const alias = sourceIdToTableAlias[colSourceId];
    const isJoin = isJoinPresent && alias && alias !== 'ds';

    //If column is part of a join, and it isn't a calc column, prefix with table alias
    return {
      ...col,
      name: isJoin && !isCalculatedCol(col) ? `${alias}.${col.name}` : col.name,
    };
  });

  /**
   * Columns represent the user input
   * AKA the columns they want to display
   *
   * For non-calc columns: prefix the bare column name with `${alias}.` so
   * the JSON accessor builder produces `${alias}.data->>'col'`.
   *
   * For calc columns: the `name` field already carries the SQL accessor
   * (`<sql expr> as <alias>`). When a join is present we have to rewrite any
   * bare `data->>` references inside the SQL to `${alias}.data->>` —
   * otherwise PG raises "column reference 'data' is ambiguous" because both
   * the schedule and the joined DJ tables have a `data` JSONB column. The
   * negative-lookbehind keeps already-aliased `<x>.data->>` references
   * intact (and avoids matching e.g. `mydata->>` if such a thing existed).
   */
  const aliasCalcSql = (sql, alias) =>
    typeof sql === "string" && sql.includes("data->>")
      ? sql.replace(/(?<![\w.])data->>/g, `${alias}.data->>`)
      : sql;

  const columns = rawUserColumns.map((col) => {
    const colSourceId = col.source_id || externalSource.source_id;
    const alias = sourceIdToTableAlias[colSourceId];
    const isJoin = isJoinPresent && alias;

    if (isCalculatedCol(col)) {
      return isJoin
        ? { ...col, name: aliasCalcSql(col.name, alias) }
        : col;
    }
    return {
      ...col,
      // Synthetic discriminator columns (custom-bucket alias, comparison-series
      // `__series`) are literal SELECT aliases, not real base-table columns — never
      // table-prefix them. Prefixing `__series` → `ds.__series` would make it both a
      // phantom GROUP BY column AND break the server fan-out's `g !== seriesKey` drop
      // (seriesKey is the bare name), yielding "Identifier 'ds.__series' cannot be resolved".
      name:
        isJoin &&
        col.origin !== 'custom-bucket' &&
        col.origin !== 'comparison-series'
          ? `${alias}.${col.name}`
          : col.name,
    };
  });

  // 1. Build enriched columns with server-side names
  const columnsWithSettings = buildColumnsWithSettings(
    columns,
    sourceColumns,
    isDms,
  );
  const columnsWithSettingsByName = new Map(
    columnsWithSettings.map((col) => [col.name, col]),
  );
  // For calc columns whose `name` is `<sql> as <alias>`, also index by the
  // bare alias so callers (notably the time-filter compareEnd resolver) can
  // look them up by the alias the user picked in the UI.
  const aliasOf = (name) => {
    if (!name) return "";
    const parts = name.split(columnRenameRegex);
    return (parts[1] || parts[0] || "").trim();
  };
  const columnsByAlias = new Map(
    columnsWithSettings
      .map((col) => [aliasOf(col.name), col])
      .filter(([alias]) => alias),
  );
  const getColumn = (name) =>
    columnsWithSettingsByName.get(name) || columnsByAlias.get(name);

  // 2. Determine columns to fetch
  const columnsToFetch = getColumnsToFetch(columnsWithSettings, columns);

  // 3. Derive groupBy, orderBy, fn, serverFn, meta from columns
  const groupBy = columns
    .filter((column) => column.group)
    .map((column) => column.name);

  const orderBy = columns
    .filter((column) => column.sort)
    .reduce((acc, column) => ({ ...acc, [column.name]: column.sort }), {});

  const fn = columns
    .filter((column) => column.show && column.fn)
    .reduce((acc, column) => ({ ...acc, [column.name]: column.fn }), {});

  const serverFn = columns
    .filter((column) => column.show && column.serverFn)
    .reduce(
      (acc, { keepOriginal, name, joinKey, valueKey, joinWithChar, serverFn: sfn }) => ({
        ...acc,
        [name]: { keepOriginal, joinKey, valueKey, joinWithChar, serverFn: sfn },
      }),
      {},
    );

  const meta = columns
    .filter(
      (column) =>
        column.show &&
        ["meta-variable", "geoid-variable", "meta"].includes(column.display) &&
        column.meta_lookup,
    )
    .reduce(
      (acc, column) => ({ ...acc, [column.name]: column.meta_lookup }),
      {},
    );

  // 4. Extract legacy column-based filters (deprecated path)
  const legacyFilters = extractLegacyColumnFilters(columns);
  const legacyNormalFilter = legacyFilters.normalFilter || [];
  delete legacyFilters.normalFilter;

  // 5. Process top-level filter tree
  let filterTree = filters || {};

  // "Filter to buckets" — when enabled, restrict rows to those that fall into a
  // defined custom bucket. AND-restrict at the top level regardless of the
  // user's filter relation so the bucket constraint can't be folded into an OR.
  const bucketLeaves = buildCustomBucketFilters(
    customBuckets,
    externalSource?.source_id,
    isDms,
  );
  if (bucketLeaves.length) {
    filterTree = {
      op: "AND",
      groups: [...(filterTree.groups ? [filterTree] : []), ...bucketLeaves],
    };
  }
  
  // If join is present, append table alias to filter columns
  if (isJoinPresent) {    
    filterTree = applyTableAliasToJoin(filterTree, sourceIdToTableAlias, externalSource.source_id);
  }
  if (pageFilters && Object.keys(pageFilters).length) {
    filterTree = applyPageFilters(filterTree, pageFilters);
  }
  // Expand `includePriorPeriod` leaves on the resolved tree — runs whether the
  // value arrived via a page filter or sits on the saved leaf (e.g. year_record
  // → IN(Y, Y-1)). No-op for leaves without the flag.
  filterTree = applyPriorPeriodExpansion(filterTree);

  filterTree = flattenFilterValues(filterTree);
  // Extract normal filters before mapping (they need raw column names)
  const { cleaned: nonNormalFilterGroups, normalFilters: filterGroupNormalFilters } =
    extractNormalFiltersFromGroups(filterTree);
  // Map column names to server refs (synchronous — no multiselect resolution)
  // Use columnsWithSettingsByName first (has merged user+source info including type: 'multiselect'),
  // then fall back to sourceColumnsByName (covers columns not in user config)
  const sourceColumnsByName = new Map([
    ...(columns || [])
      .filter((c) => c.systemCol)
      .map((col) => [col.name, col]),
    ...sourceColumns.map((col) => [col.name, col]),
  ]);
  // Resolve a filter leaf's column name to its source ref. Calc columns: their
  // `name` field is `<sql> as <alias>`, but filter leaves reference them by alias
  // (the user-visible name). Fall through to the alias index so getColumn finds
  // them. Without this, time-filter compareEnd resolution silently no-ops for calc
  // columns. Reused by the comparison-series arm resolution below.
  const getFilterColumn = (name) =>
    columnsWithSettingsByName.get(name) ||
    sourceColumnsByName.get(name) ||
    columnsByAlias.get(name);
  const mappedFilterGroups = mapFilterGroupCols(
    nonNormalFilterGroups,
    getFilterColumn,
    isDms,
  );

  // Extract HAVING conditions from mapped tree
  const { filterGroups: finalFilterGroups, having: filterGroupHaving } =
    extractHavingFromFilterGroups(mappedFilterGroups);

  // Combine normal filters from both legacy columns and filterGroups
  const allNormalFilters = [...legacyNormalFilter, ...filterGroupNormalFilters];

  // 6. Build normal filter columns (CASE WHEN expressions)
  if (allNormalFilters.length) {
    const normalColumns = buildNormalFilterColumns(
      allNormalFilters,
      columns,
      columnsWithSettingsByName,
      isDms,
    );
    if (normalColumns.length) columnsToFetch.push(...normalColumns);
  }

  // 7. Build the options object — maps column names to server refs
  const mappedGroupBy = groupBy.map(
    (columnName) => getColumn(columnName)?.refName,
  );

  const mappedOrderBy = Object.keys(orderBy)
    .filter((columnName) =>
      columnsToFetch.find((ctf) => ctf.name === columnName),
    )
    .reduce((acc, columnName) => {
      const col = getColumn(columnName);
      const [reqNameWithoutAS] = splitColNameOnAS(col?.reqName || columnName);
      acc[reqNameWithoutAS] = orderBy[columnName];
      return acc;
    }, {});

  // Map legacy flat filters to server refs
  const mappedFilter = Object.keys(legacyFilters.filter || {}).reduce(
    (acc, columnName) => {
      const col = getColumn(columnName);
      if (col) acc[col.refName] = legacyFilters.filter[columnName];
      return acc;
    },
    {},
  );

  const mappedExclude = Object.keys(legacyFilters.exclude || {}).reduce(
    (acc, columnName) => {
      const col = getColumn(columnName);
      if (col) acc[col.refName] = legacyFilters.exclude[columnName];
      return acc;
    },
    {},
  );

  // Map legacy comparison filters (gt, gte, lt, lte, like) to server refs
  const comparisonFilters = {};
  const comparisonHaving = [];
  for (const filterOp of ["gt", "gte", "lt", "lte", "like"]) {
    const opValues = legacyFilters[filterOp];
    if (!opValues || !Object.keys(opValues).length) continue;

    for (const columnName of Object.keys(opValues)) {
      const col = getColumn(columnName);
      if (!col) continue;

      const { refName: colRef, reqName: colReq, fn: colFn, filters: colFilters } = col;
      const reqNameWithoutAS = splitColNameOnAS(colReq)[0];
      const currValue =
        filterOp === "like"
          ? `%${opValues[columnName]}%`
          : opValues[columnName];
      const valueToFilterBy = Array.isArray(currValue) ? currValue[0] : currValue;

      if (valueToFilterBy == null) continue;

      const fullFilter = colFilters?.[0];
      const filterFn = fullFilter?.fn;
      const isAggregated = !!filterFn;

      if (isAggregated) {
        const filterExpr = splitColNameOnAS(
          colFn
            ? reqNameWithoutAS
            : applyFn({ ...col, fn: filterFn }, isDms),
        )[0];
        comparisonHaving.push(
          `${filterExpr} ${operationToExpressionMap[filterOp]} ${valueToFilterBy}`,
        );
      } else {
        if (!comparisonFilters[filterOp]) comparisonFilters[filterOp] = {};
        comparisonFilters[filterOp][colRef] = valueToFilterBy;
      }
    }
  }

  const allHaving = [...comparisonHaving, ...filterGroupHaving];
  // 8. Assemble final options
  const options = {
    join: isJoinPresent ? buildJoin({join, externalSource}) : null,
    filterGroups: finalFilterGroups,
    groupBy: mappedGroupBy,
    orderBy: mappedOrderBy,
    filter: mappedFilter,
    exclude: mappedExclude,
    normalFilter: allNormalFilters,
    meta,
    serverFn,
    ...(Object.keys(comparisonFilters).length > 0 && comparisonFilters),
    ...(allHaving.length > 0 && { having: allHaving }),
  };

  if (activeCustomBuckets) {
    // Pass the detailed grouping configuration to the backend via aliasGroups.
    // The backend builds a CASE per alias from `config` (column + groups).
    //
    // Resolve each definition's `column` to its SQL accessor the same way every
    // other column ref is built: DMS internal sources read values out of a JSONB
    // `data` column, so the CASE must compare `data->>'col'`, not a bare physical
    // `col` that doesn't exist on the split table. DAMA columns are physical, so
    // attributeAccessorStr returns them unchanged (isDms=false). The raw column
    // name stays on customBuckets.config (state) for buildCustomBucketFilters,
    // which maps it through its own mapFilterGroupCols accessor path.
    options.aliasGroups = Object.fromEntries(
      Object.entries(customBuckets.config).map(([alias, def]) => {
        // Resolve the bucket's source column to its SQL accessor exactly as a
        // display column would be (mirroring mapFilterGroupCols). Two cases that
        // a naive `data->>'<col>'` gets wrong, both of which the Source Column
        // picker can feed in (it offers every externalSource column, including
        // synthetic ones, and stores the column's full `name` as sourceField):
        //
        //   • `id` — the DMS system column is a physical top-level column, not a
        //     key in the JSONB `data` blob, so it must resolve to a bare `id`.
        //   • A calculated/renamed column whose `name` is `<expr> as <alias>`
        //     (e.g. `id as id`) — the accessor is the `<expr>` half, never
        //     `data->>'id as id'` (a phantom JSON key → CASE matches nothing).
        //
        // The source column is usually NOT one of the section's display columns,
        // so getColumn(def.column) misses. Detect calc form from the raw name the
        // same way isCalculatedCol does (the `" as "` heuristic), and fall back to
        // the codebase-wide `id` system-column convention — don't rely on colInfo.
        const colInfo = getColumn(def.column);
        const isCalculated = colInfo
          ? isCalculatedCol(colInfo)
          : isCalculatedCol({ name: def.column });
        const isSystem = colInfo?.systemCol || def.column === "id";
        return [
          alias,
          {
            ...def,
            column: attributeAccessorStr(
              def.column,
              isDms,
              isCalculated,
              isSystem,
            ),
          },
        ];
      }),
    );
  }

  // 8b. Comparison series — fan out the base query into one arm per variant.
  // Each arm's filterGroups = the base filter tree patched with the variant's delta
  // (mergeVariantFilters: replace-on-column, else append), then run through the same
  // resolution the base tree gets (join alias → page filters → prior-period expand →
  // flatten → col-ref mapping → strip HAVING). The server unions the arms and stamps
  // `'<label>' as <seriesKey>`. The synthetic discriminator column (origin
  // 'comparison-series', kept in rawUserColumns above) lands in `attributes` so the
  // route projects it. Variant normal-filters/having are not extracted (v1: variants
  // are simple value/range/time leaves).
  if (activeComparisonSeries) {
    const resolveArmTree = (rawTree) => {
      let tree = rawTree || {};
      if (isJoinPresent) {
        tree = applyTableAliasToJoin(tree, sourceIdToTableAlias, externalSource.source_id);
      }
      if (pageFilters && Object.keys(pageFilters).length) {
        tree = applyPageFilters(tree, pageFilters);
      }
      tree = applyPriorPeriodExpansion(tree);
      tree = flattenFilterValues(tree);
      const mapped = mapFilterGroupCols(tree, getFilterColumn, isDms);
      return extractHavingFromFilterGroups(mapped).filterGroups;
    };

    // The server fan-out builds each arm's WHERE solely from that arm's filterGroups
    // and ignores the single-arm `options.filterGroups` — where the custom-bucket
    // "filter to buckets" leaf normally lives (injected at step 5 above). So inject
    // the same bucketLeaves into the base tree each arm patches, mirroring the
    // single-arm injection (lines ~1238). mergeVariantFilters only prunes base leaves
    // on columns the variant *touches*, so a bucket leaf (e.g. tmc IN(route)) survives
    // into every arm whenever the variant constrains a different column (e.g. date),
    // and resolveArmTree maps/aliases it exactly as the single-arm path does. Without
    // this, fan-out + filter-to-buckets returns every row and the fallback label
    // ("Other") leaks into the series.
    const baseForArms = bucketLeaves.length
      ? {
          op: "AND",
          groups: [...(filters?.groups ? [filters] : []), ...bucketLeaves],
        }
      : filters || {};

    options.seriesKey = comparisonSeries.seriesKey || "__series";
    const activeVariants = effectiveVariants.filter((v) => v && v.label);
    options.seriesVariants = activeVariants.map((v) => ({
        label: v.label,
        filterGroups: resolveArmTree(mergeVariantFilters(baseForArms, v.filters || {})),
    }));
  }

  if (activeComparisonSeries) {
    const seriesKey = comparisonSeries.seriesKey || "__series";
    const caseExpr = `CASE ${seriesKey} ${effectiveVariants
        .filter((v) => v && v.label)
        .map((v, i) => `WHEN '${v.label}' THEN ${i + 1}`)
        .join(' ')} ELSE ${effectiveVariants.filter((v) => v && v.label).length + 1} END`;
    
    options.orderBy[caseExpr] = 'desc';
  }

  // 9. Build attributes list
  const attributes = columnsToFetch.map((a) => a.reqName).filter((a) => a);

  // 10. Compute output source info (Phase 4: chainability)
  //When a join is present, the output columns come from multiple sources. The outputSourceInfo.columns should indicate which source table each column came from.
  const outputSourceInfo = computeOutputSourceInfo({
    columnsToFetch,
    columnsWithSettings,
    externalSource,
    options,
    attributes,
    columns,
  });

  return {
    options,
    attributes,
    columnsToFetch,
    columnsWithSettings,
    outputSourceInfo,
    skipFetch,
  };
};

// ─── Legacy adapter ─────────────────────────────────────────────────────────

/**
 * Bridge old state shape → buildUdaConfig input.
 * Temporary adapter used during the transition period.
 *
 * Maps:
 * - state.sourceInfo → externalSource
 * - state.columns → columns
 * - state.dataRequest.filterGroups → filters (promoted)
 * - state.display.filterRelation → filters.op (if no existing filterGroups op)
 *
 * @param {Object} state - The current dataWrapper state (old shape)
 * @param {Object} [pageFilters] - Runtime page filter values from PageContext
 * @returns {Object} Input for buildUdaConfig()
 */
export const legacyStateToBuildInput = (state, pageFilters) => {
  const filterGroups = state.dataRequest?.filterGroups;
  const filterRelation = state.display?.filterRelation;

  // If filterGroups exists, use it as the top-level filters.
  // If it has no op but we have a filterRelation, inject it.
  let filters = filterGroups || {};
  if (
    filters.groups &&
    !filters.op &&
    filterRelation
  ) {
    filters = { ...filters, op: filterRelation };
  }

  return {
    externalSource: state.sourceInfo,
    columns: state.columns || [],
    filters,
    join: null,
    pageFilters: pageFilters || {},
  };
};

export default buildUdaConfig;
