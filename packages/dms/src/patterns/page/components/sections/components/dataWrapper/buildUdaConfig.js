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

export const isCalculatedCol = ({ display, type, origin, name }) =>
  display === "calculated" ||
  type === "calculated" ||
  origin === "calculated-column" ||
  (name && name.toLowerCase().includes(" as "));

/**
 * Column reference string — the SQL accessor used in WHERE/GROUP BY/ORDER BY.
 * DMS columns use data->>'col', DAMA columns use col directly.
 */
export const attributeAccessorStr = (col, isDms, isCalculated, isSystemCol) =>
  isCalculated ||
  isSystemCol ||
  splitColNameOnAS(col)[0]?.includes("data->>")
    ? splitColNameOnAS(col)[0]
    : isDms
      ? `data->>'${col}'`
      : col;

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
  console.log({colNameAfterAS})
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
      groups: node.groups.map((child) =>
        mapFilterGroupCols(child, getColumn, isDms),
      ),
    };
  }

  // Leaf condition: map col name to refName
  const col = getColumn(node.col);
  if (!col) return node;

  const ref = attributeAccessorStr(
    col.name,
    isDms,
    isCalculatedCol(col),
    col.systemCol,
  );

  const mapped = {
    ...node,
    value: node.op === "like" && node.value ? `%${node.value}%` : node.value,
    col: ref || node.col,
  };

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

// ─── Page filter application ────────────────────────────────────────────────

const isGroup = (node) => node?.groups && Array.isArray(node.groups);

export const applyTableAliasToJoin = (filterTree, sourceIdToAlias) => {
    if (!filterTree) return filterTree;

  const applyToNode = (node) => {
    if (isGroup(node)) {
      return { ...node, groups: node.groups.map(applyToNode) };
    }

    let newNode = { ...node };

    const prefix = sourceIdToAlias[node.source_id] || "ds";

    // Always alias 'col' if it exists
    if (newNode.col) {
      newNode.col = `${prefix}.${newNode.col.split('.').pop()}`;
    }

    // Alias 'searchParamKey' if it exists to allow PageFilter application to find it
    if (newNode.searchParamKey) {
      newNode.searchParamKey = `${prefix}.${newNode.searchParamKey.split('.').pop()}`;
    }

    return newNode;
  };

  return applyToNode(filterTree, sourceIdToAlias);
}


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

    const normalized = Array.isArray(pageValues) ? pageValues : [pageValues];
    return { ...node, value: normalized };
  };

  return applyToNode(filterTree);
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

      const { operation, values, fn } = f;

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
  console.log("build with settings::", columns, sourceColumns)
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
      const colReqName = reqName(fullColumn, isDms);
      const colRefName = attributeAccessorStr(
        column.name,
        isDms,
        isCalculated,
        column.systemCol,
      );
      const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);
      const totalAlias = (colNameAfterAS || colNameBeforeAS).replace(".", "_");
      const colTotalName = `SUM(CASE WHEN (${colRefName})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${colRefName})::numeric ELSE NULL END ) as ${totalAlias}_total`;

      console.log({colNameBeforeAS, colNameAfterAS, totalAlias, colTotalName })
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

export const buildJoin = ({join, externalSource}) => {
  console.log("IN BUILD JOIN NEW FUNC::", join, externalSource)
  return {
    sources: buildJoinSources({join, externalSource}),
    on: [
      buildJoinOnClause({join, externalSource})
    ]
  };
}

/**
 * TODO does not work with udaConfig as join source
 * key of sources is the "alias" given to each source. Eventually this should come from user
 * value is either { view_id: 1648, env: "dama" }, or an udaConfig
 */
export const buildJoinSources = ({join, externalSource}) => {
  const { sources } = join; 
  return Object.keys(sources).reduce((acc, curKey) => {
    const curSource = sources[curKey].source ? sources[curKey] : externalSource;
    console.log({curSource})
    acc[curKey] = {
      view_id: curSource.view || curSource.view_id,
      env: curSource?.env || curSource?.sourceInfo?.env 
    }

    return acc;
  }, {});
};

export const buildJoinOnClause = ({ join, externalSource }) => {
  //TODO get type of join from user;
  //TODO get operator from user
  const { type = "left", sources, operator = "=" } = join; 
  const tableAliases = Object.keys(sources);
  const aliasedColumnNames = tableAliases.map((sourceAlias) =>
    buildJoinColumn({
      sourceAlias,
      column: sources[sourceAlias]?.joinColumn?.name,
    }),
  );

  return {
    type,
    tables: tableAliases,
    on: aliasedColumnNames.join(` ${operator} `)
  };
};

export const buildJoinColumn = ({sourceAlias, column}) => `${sourceAlias}.${column}`

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
 * @returns {{ options: Object, attributes: string[], columnsToFetch: Array, columnsWithSettings: Array, outputSourceInfo: Object }}
 */
export const buildUdaConfig = ({
  externalSource,
  columns: rawColumns,
  filters,
  join,
  pageFilters,
}) => {
  //RYAN TODO -- better join conditional. If initial state gets changed to `null`, this is much cleaner
  const isJoinPresent = !!join && join?.sources?.table2?.view;
  
  const isDms = externalSource?.isDms;


  // const sourceColumns = isJoinPresent
  //   ? [
  //       ...Object.keys(join?.sources)
  //         .map((jSourceKey) => join?.sources[jSourceKey].sourceInfo?.columns?.map((col) => ({...col, name: `${jSourceKey}.${col.name}` })))
  //         .flat(),
  //     ]
  //   : externalSource?.columns;

  //ryan todo move this into a function
  //I need source_id to table_alias
  const sourceIdToTableAlias = isJoinPresent ? Object.keys(join.sources).reduce((acc, curr) => {
    const curJoinSource = join.sources[curr];
    const source_id = curJoinSource.source || externalSource.source_id
    const alias = curJoinSource.source ? curr : 'ds'

    acc[source_id] = alias
    return acc;
  },{}) : {};
  console.log({sourceIdToTableAlias})
  const joinColumns = isJoinPresent? Object.values(join.sources).filter(jSource => !!jSource.sourceInfo).map(jSource => jSource.sourceInfo.columns).flat() : [];
  const allCols = [...externalSource?.columns, ...joinColumns]
  const sourceColumns = allCols.map((col) => {
    const colSourceId = col.source_id || externalSource.source_id;
    return ({ ...col, name: isJoinPresent ? `${sourceIdToTableAlias[colSourceId]}.${col.name}` : col.name })
  });
  const columns = rawColumns.map((col) => {
    const colSourceId = col.source_id || externalSource.source_id;
    return ({ ...col, name: isJoinPresent ? `${sourceIdToTableAlias[colSourceId]}.${col.name}` : col.name })
  });;

  console.log({columns, sourceColumns})



  // 1. Build enriched columns with server-side names
  const columnsWithSettings = buildColumnsWithSettings(
    columns,
    sourceColumns,
    isDms,
  );
  console.log({columnsWithSettings})
  const columnsWithSettingsByName = new Map(
    columnsWithSettings.map((col) => [col.name, col]),
  );
  const getColumn = (name) => columnsWithSettingsByName.get(name);

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

  console.log({filters})
  // 5. Process top-level filter tree
  let filterTree = filters || {};

  // If join is present, append table alias to filter columns
  if (isJoinPresent) {
    const sourceIdToAlias = Object.keys(join.sources).reduce((acc, alias) => {
        const source_id = join.sources[alias].source || externalSource.source_id;
        acc[source_id] = alias;
        return acc;
    }, {});
    filterTree = applyTableAliasToJoin(filterTree, sourceIdToAlias);
  }
  console.log("filter tree after apply join alias::", filterTree)
  if (pageFilters && Object.keys(pageFilters).length) {
    filterTree = applyPageFilters(filterTree, pageFilters);
  }

  // Extract normal filters before mapping (they need raw column names)
  const { cleaned: nonNormalFilterGroups, normalFilters: filterGroupNormalFilters } =
    extractNormalFiltersFromGroups(filterTree);
  console.log({filterTree})
  // Map column names to server refs (synchronous — no multiselect resolution)
  // Use columnsWithSettingsByName first (has merged user+source info including type: 'multiselect'),
  // then fall back to sourceColumnsByName (covers columns not in user config)
  const sourceColumnsByName = new Map([
    ...(columns || [])
      .filter((c) => c.systemCol)
      .map((col) => [col.name, col]),
    ...sourceColumns.map((col) => [col.name, col]),
  ]);

  const mappedFilterGroups = mapFilterGroupCols(
    nonNormalFilterGroups,
    (name) => columnsWithSettingsByName.get(name) || sourceColumnsByName.get(name),
    isDms,
  );

  // Extract HAVING conditions from mapped tree
  const { filterGroups: finalFilterGroups, having: filterGroupHaving } =
    extractHavingFromFilterGroups(mappedFilterGroups);
  console.log({finalFilterGroups, mappedFilterGroups})
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
