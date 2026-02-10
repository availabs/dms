import { useCallback, useEffect } from "react";
import { getData as getFilterData } from "../components/filters/utils";
import { isEqual } from "lodash-es";

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
const operations = {
  gt: (a, b) => +a > +b,
  gte: (a, b) => +a >= +b,
  lt: (a, b) => +a < +b,
  lte: (a, b) => +a <= +b,
  like: (a, b) =>
    b.toString().toLowerCase().includes(a.toString().toLowerCase()),
};

export const useHandleClickOutside = (menuRef, menuBtnId, onClose) => {
  const handleClickOutside = useCallback(
    (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        e.target.id !== menuBtnId
      ) {
        onClose();
      }
    },
    [menuRef, menuBtnId, onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside]);
};

const fnum = (number, currency = false) =>
  `${currency ? "$ " : ""} ${isNaN(number) ? 0 : parseInt(number).toLocaleString()}`;
export const fnumIndex = (d, fractions = 2, currency = false) => {
  if (isNaN(d)) return "0";
  if (typeof d === "number" && d < 1)
    return `${currency ? "$" : ``} ${d?.toFixed(fractions)}`;
  if (d >= 1_000_000_000_000_000) {
    return `${currency ? "$" : ``} ${(d / 1_000_000_000_000_000).toFixed(fractions)} Q`;
  } else if (d >= 1_000_000_000_000) {
    return `${currency ? "$" : ``} ${(d / 1_000_000_000_000).toFixed(fractions)} T`;
  } else if (d >= 1_000_000_000) {
    return `${currency ? "$" : ``} ${(d / 1_000_000_000).toFixed(fractions)} B`;
  } else if (d >= 1_000_000) {
    return `${currency ? "$" : ``} ${(d / 1_000_000).toFixed(fractions)} M`;
  } else if (d >= 1_000) {
    return `${currency ? "$" : ``} ${(d / 1_000).toFixed(fractions)} K`;
  } else {
    return typeof d === "object" ? `` : `${currency ? "$" : ``} ${parseInt(d)}`;
  }
};
export const isEqualColumns = (column1, column2) =>
  column1?.name === column2?.name &&
  column1?.isDuplicate === column2.isDuplicate &&
  column1?.copyNum === column2?.copyNum;

const columnRenameRegex = /\s+as\s+/i;
const splitColNameOnAS = (name) => name.split(columnRenameRegex); // split on as/AS/aS/As and spaces surrounding it

// takes in column, and returns if it's a calculated column
export const isCalculatedCol = ({ display, type, origin }) => {
  return (
    display === "calculated" ||
    type === "calculated" ||
    origin === "calculated-column"
  );
};

// returns column name to be used as key for options. these are names without 'as' and data->> applied.
export const attributeAccessorStr = (
  col,
  isDms,
  isCalculatedCol,
  isSystemCol,
) =>
  isCalculatedCol ||
  isSystemCol ||
  splitColNameOnAS(col)[0]?.includes("data->>")
    ? splitColNameOnAS(col)[0]
    : isDms
      ? `data->>'${col}'`
      : col;

const parseIfJson = (value) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
};

const cleanValue = (value) => {
    let valueType = typeof value;

    if (valueType === "boolean") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return value; // calculated column only
    }

    if (valueType === "object" && value !== null) {
        if (value?.value && value?.originalValue) {
            return value; // meta column with original and meta value
        } else if (value?.value) {
            return cleanValue(value.value);
        } else {
            return undefined;
        }
    }

    if (valueType === "string") {
        return parseIfJson(value);
    }

    return parseIfJson(value);
}

export const applyFn = (col = {}, isDms = false) => {
  // apply fns if: column is not calculated column or it is calculated, and does not have function in name

  // calculated columns should never get data->>
  const isCalculatedCol =
    col.type === "calculated" ||
    col.display === "calculated" ||
    col.origin === "calculated-column" ||
      col.name.toLowerCase().includes(' as '); // when a column is referenced to get "options" for select/multiselect, we don't have other properties available.

  const colNameWithAccessor = attributeAccessorStr(
    col.name,
    isDms,
    isCalculatedCol,
    col.systemCol,
  );
  const colNameAfterAS = (
    isCalculatedCol ? // get response name for calculated columns
        splitColNameOnAS(col.name)[1] :
        col.name
  ).toLowerCase();

  const functions = {
    [undefined]: !isDms && !isCalculatedCol ? colNameWithAccessor : `${colNameWithAccessor} as ${colNameAfterAS}`,
    "": !isDms && !isCalculatedCol ? colNameWithAccessor : `${colNameWithAccessor} as ${colNameAfterAS}`,
    list: `array_to_string(array_agg(distinct ${colNameWithAccessor}), ', ') as ${colNameAfterAS}`,
    sum: isDms
      ? `sum((${colNameWithAccessor})::integer) as ${colNameAfterAS}`
      : `sum(${colNameWithAccessor}) as ${colNameAfterAS}`,
    avg: isDms
      ? `avg((${colNameWithAccessor})::integer) as ${colNameAfterAS}`
      : `avg(${colNameWithAccessor}) as ${colNameAfterAS}`,
    count: `count(${colNameWithAccessor}) as ${colNameAfterAS}`,
    max: `max(${colNameWithAccessor}) as ${colNameAfterAS}`,
  };

  return functions[col.fn];
};

// returns column names with fns applied. these are actually what gets used to fetch values.
const getColAccessor = (col, isDms) => (!col ? null : applyFn(col, isDms));

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
    format: state.sourceInfo,
    children,
  });
  return length;
};

const getFullColumn = (columnName, columns) =>
  columns.find((col) => col.name === columnName);

// Recursively maps filterGroups col names to refNames for the API,
// and resolves multiselect column values to matched DB options.
const mapFilterGroupCols = async (node, getColumn, { isDms, apiLoad, sourceInfo }) => {
  if (!node) return node;
  if (node.groups && Array.isArray(node.groups)) {
    return {
      ...node,
      groups: await Promise.all(
        node.groups.map(child => mapFilterGroupCols(child, getColumn, { isDms, apiLoad, sourceInfo })),
      ),
    };
  }
  // condition node: map col to refName
  const col = getColumn(node.col);
  const refName = attributeAccessorStr(
      col.name,
      isDms,
      isCalculatedCol(col),
      col.systemCol,
  );

  const mapped = {
    ...node,
    value: node.op === 'like' && node.value ? `%${node.value}%` :  node.value,
    col: refName || node.col,
  };

  // for multiselect columns with filter/exclude, resolve values to matched DB options
  if (col?.type === 'multiselect' && ['filter', 'exclude'].includes(node.op)) {
    const selectedValues = (Array.isArray(node.value) ? node.value : [node.value])
      .map(o => o?.value || o)
      .map(o => o === null ? 'null' : o)
      .filter(o => o);

    if (selectedValues.length) {
      const { name, display, meta } = col;
      const reqName = getColAccessor({ ...col, fn: undefined }, isDms);
      try {
        const options = await getFilterData({
          reqName,
          refName,
          allAttributes: [{ name, display, meta }],
          apiLoad,
          format: sourceInfo,
        });

        const matchedOptions = options
          .map(row => {
            const option = row[reqName]?.value || row[reqName];
            const parsedOption =
              isJson(option) && Array.isArray(JSON.parse(option))
                ? JSON.parse(option)
                : Array.isArray(option)
                  ? option
                  : typeof option === 'string'
                    ? [option]
                    : [];
            return parsedOption.find(o => selectedValues.includes(o)) ? option : null;
          })
          .filter(option => option);

        if (selectedValues.includes('null')) matchedOptions.push('null');
        mapped.value = matchedOptions;
      } catch (e) {
        console.error('mapFilterGroupCols: could not resolve multiselect for', node.col, e);
      }
    }
  }

  return mapped;
};

export const getColumnLabel = (column) =>
  column.customName || column.display_name || column.name;

const evaluateAST = (node, values) => {
  if (node.type === "variable") {
    return values[node.key] ?? 0; // Default value handling
  }

  const left = evaluateAST(node.left, values);
  const right = evaluateAST(node.right, values);

  switch (node.operation) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right !== 0 ? left / right : NaN;
    default:
      return undefined; //throw new Error(`Unknown operation: ${node.operation}`);
  }
};

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
    const {
    groupBy = [],
    orderBy = {},
    filter = {},
    normalFilter = [],
    fn = {},
    exclude = {},
    meta = {},
    filterGroups={},
    filterRelation,
    serverFn = {},
    ...restOfDataRequestOptions
  } = state.dataRequest || {};
  const debug = debugCall || false;
  debug && console.log("=======getDAta called===========");
  // get columns with all settings and info about them.
    debugTime && console.time('columnsWithSettings')
    const isDms = state.sourceInfo.isDms;
    const sourceColumnsByName = new Map(
        state.sourceInfo.columns.map(col => [col.name, col]),
    );
    const getSourceColumnsByName = name => sourceColumnsByName.get(name);

    const duplicatedColumnNames = new Set(
        state.columns
            .filter(col => col.isDuplicate)
            .map(col => col.name),
    );
  const columnsWithSettings = state.columns
    .filter(({ actionType, type }) => !actionType && type !== "formula")
    .map((column) => {
        const originalColumn = sourceColumnsByName.get(column.name);
        const fullColumn = {...(originalColumn ?? {}), ...column};

        const isCalculatedColumn = isCalculatedCol(column);
        const isCopiedColumn = !column.isDuplicate && duplicatedColumnNames.has(column.name);
        const reqName = getColAccessor(fullColumn, isDms);
        const refName = attributeAccessorStr(
            column.name,
            isDms,
            isCalculatedColumn,
            column.systemCol,
        );
        const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);

        const totalAlias = colNameAfterAS || colNameBeforeAS;
      const totalName = `SUM(CASE WHEN (${refName})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${refName})::numeric ELSE NULL END ) as ${totalAlias}_total`;
      return {
        ...fullColumn,
        isCalculatedColumn, // currently this cached value is used to determine key of order by column. for calculated columns idx is used to avoid sql errors.
        isCopiedColumn, // this column has copies
        reqName, // used to fetch data. name with fn, data->> (is needed), and 'as'
        refName, // used to reference column name with appropriate data->>, and without 'as'
        totalName, // used to make total row calls.
      };
    });
    const columnsWithSettingsByName = new Map(
        columnsWithSettings.map(col => [col.name, col]),
    );
    const getFullColumnFromColumnsWithSettings = (name) => columnsWithSettingsByName.get(name);

    debugTime && console.timeEnd('columnsWithSettings')
    const columnsToFetch = columnsWithSettings.filter(
    (column) => column.show && !column.isDuplicate && column.type !== "formula",
  );
  // collect variables used in formula columns, and add them to fetch list
  const formulaVariableColumns = columnsWithSettings
    .filter((column) => column.type === "formula")
    .reduce((acc, curr) => {
      const variablesYetToBeFetched = curr.variables.filter(
        (variable) =>
          !columnsToFetch.find((ctf) => isEqualColumns(ctf, variable)),
      );
      acc.push(...variablesYetToBeFetched);
      return acc;
    }, []);
  if (formulaVariableColumns.length) {
    columnsToFetch.push(...formulaVariableColumns);
  }

  // add normal columns to the list of columns to fetch
  if (normalFilter.length) {
    const normalColumns = [];
    const valueColumnName =
      state.columns.find((col) => col.valueColumn)?.name || "value";
    const fullColumn = getFullColumnFromColumnsWithSettings(valueColumnName);
    const valueColumn = fullColumn?.refName || "value";
    normalFilter.forEach(({ column, values, operation, fn }, i) => {
      const fullColumn = state.columns.find(
        (col) => col.name === column && isEqual(values, col.filters[0]?.values),
      );
      if (column && fullColumn?.normalName && values?.length) {
        const name = fullColumn.normalName;
        const filterValues =
          ["gt", "gte", "lt", "lte"].includes(operation) &&
          Array.isArray(values)
            ? values[0]
            : Array.isArray(values)
              ? values.map((v) => `'${v}'`)
              : values;
        const nameBeforeAS = `CASE WHEN ${column} ${operationToExpressionMap[operation] || "IN"} (${filterValues}) THEN ${valueColumn} END`;
        const reqName = fnToTextMap[fn]
          ? fnToTextMap[fn](nameBeforeAS, name)
          : fnToTextMap.default(nameBeforeAS, name, fn);
        normalColumns.push({ name, reqName });
      }
    });

    if (normalColumns.length) columnsToFetch.push(...normalColumns);
    debug &&
      console.log(
        "debug getdata: columns with settings, columns to fetch:",
        columnsWithSettings,
        columnsToFetch,
      );
  }

  const multiselectValueSets = {};
  const filterAndExcludeColumns = [
    ...Object.keys(filter),
    ...Object.keys(exclude).filter(
      (col) => !(exclude[col]?.length === 1 && exclude[col][0] === "null"),
    ),
  ];
  debugTime && console.time('filterAndExcludeColumns')
  for (const columnName of new Set(filterAndExcludeColumns)) {
    const { name, display, meta, refName, type } = getFullColumnFromColumnsWithSettings(columnName);
    const fullColumn = { name, display, meta, refName, type };
    const reqName = getColAccessor(
      { ...fullColumn, fn: undefined },
      isDms,
    );

    const selectedValues = (filter[columnName] || exclude[columnName] || [])
      .map((o) => o?.value || o)
      .map((o) => (o === null ? "null" : o))
      .filter((o) => o);

    if (!selectedValues.length) continue;

    if (type === "multiselect" /* || type === 'calculated'*/) {
        // todo await inside loop; change to promise.all?
      const options = await getFilterData({
        reqName,
        refName,
        allAttributes: [{ name, display, meta }],
        apiLoad,
        format: state.sourceInfo,
      });

      try {
        const matchedOptions = options
          .map((row) => {
            const option = row[reqName]?.value || row[reqName];
            const parsedOption =
              isJson(option) && Array.isArray(JSON.parse(option))
                ? JSON.parse(option)
                : Array.isArray(option)
                  ? option
                  : typeof option === "string"
                    ? [option]
                    : [];
            return parsedOption.find((o) => selectedValues.includes(o))
              ? option
              : null;
          })
          .filter((option) => option);

        if (selectedValues.includes("null")) matchedOptions.push("null");
        multiselectValueSets[columnName] = matchedOptions;
      } catch (e) {
        console.error("Could not load options for", columnName, e);
      }
    }
  }
    debugTime && console.timeEnd('filterAndExcludeColumns')

  // should this be saved in state directly?
    debugTime && console.time('build options')
  const options = {
    keepOriginalValues,
    filterRelation,
    serverFn,
    filterGroups: await mapFilterGroupCols(filterGroups, getSourceColumnsByName, { isDms, apiLoad, sourceInfo: state.sourceInfo }),
    groupBy: groupBy.map(
      (columnName) => getFullColumnFromColumnsWithSettings(columnName)?.refName,
    ),
    orderBy: Object.keys(orderBy)
      .filter((columnName) =>
        columnsToFetch.find((ctf) => ctf.name === columnName),
      ) // take out any sort from non-visible column
      .reduce((acc, columnName) => {
        const { reqName } = getFullColumnFromColumnsWithSettings(columnName);
        const [reqNameWithoutAS] = splitColNameOnAS(reqName);
        acc[reqNameWithoutAS] = orderBy[columnName];
          return acc;
      }, {}),
    filter: Object.keys(filter).reduce((acc, columnName) => {
      const { refName, type } = getFullColumnFromColumnsWithSettings(columnName);
      const valueSets = multiselectValueSets[columnName] ?
          multiselectValueSets[columnName].filter((d) => d === "null" || d.length) :
          filter[columnName] || [];

        if(valueSets.length){
            acc[refName] = valueSets
        }
      return acc;
    }, {}),
    exclude: Object.keys(exclude).reduce((acc, columnName) => {
      const currValues = exclude[columnName] || [];

      acc[getFullColumnFromColumnsWithSettings(columnName)?.refName] =
          currValues?.length === 1 && currValues[0] === "null" ? currValues :
              multiselectValueSets[columnName] ? multiselectValueSets[columnName].filter((d) => d.length) :
                  currValues;
      return acc;
    }, {}),
    normalFilter,
    meta,
    ...(() => {
      const where = {};
      const having = [];

      Object.keys(restOfDataRequestOptions).forEach((filterOperation) => {
        const columnsForOperation = Object.keys(
          restOfDataRequestOptions[filterOperation] || {}
        );

        columnsForOperation.forEach((columnName) => {
          const { refName, reqName, fn, filters, ...restCol } = getFullColumnFromColumnsWithSettings(columnName);
          const reqNameWithoutAS = splitColNameOnAS(reqName)[0];
          const currOperationValues =
            filterOperation === "like"
              ? `%${restOfDataRequestOptions[filterOperation][columnName]}%`
              : restOfDataRequestOptions[filterOperation][columnName];
          const valueToFilterBy = Array.isArray(currOperationValues)
            ? currOperationValues[0]
            : currOperationValues;

          if (valueToFilterBy == null) return;

          const fullFilter = filters?.[0];
          const filterFn = fullFilter?.fn;

          const isAggregated = /*!!fn ||*/ !!filterFn;
          const filterExpr = isAggregated
            ? splitColNameOnAS(
                fn
                  ? reqNameWithoutAS
                  : applyFn(
                      { ...restCol, fn: filterFn },
                      isDms,
                    ),
              )[0]
            : refName;
          if (isAggregated) {
            having.push(
              `${filterExpr} ${operationToExpressionMap[filterOperation]} ${valueToFilterBy}`,
            );
          } else {
            if (!where[filterOperation]) {
              where[filterOperation] = {};
            }
            where[filterOperation][filterExpr] = valueToFilterBy;
          }
        });
      });

      return {
        ...(Object.keys(where).length > 0 && where),
        ...(having.length > 0 && { having }),
      };
    })(),
  };
    debugTime && console.timeEnd('build options')
    debug &&
    console.log(
      "debug getdata: options for spreadsheet getData",
      options,
      state,
    );
  // =================================================================================================================
  // ========================================== check for proper indices begin =======================================
  // =================================================================================================================
  // not grouping by, and all visible columns have fn applied
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
    return {
      length: 0,
      data: [],
      invalidState: "An Error occurred while fetching data.",
    };
  }
  const actionType = "uda";
  const fromIndex = fullDataLoad ? 0 : currentPage * state.display.pageSize;
  const toIndex = fullDataLoad
    ? length
    : Math.min(
        length,
        currentPage * state.display.pageSize + state.display.pageSize,
      ) - 1;
  if (fromIndex > length) {
    debug &&
      console.log(
        "debug getdata: going over limit",
        fromIndex,
        toIndex,
        length,
      );
    return { length, data: [] };
  }
  debug &&
    console.log(
      "debug getdata: indices",
      currentPage,
      state.display.pageSize,
      length,
    );
    debugTime && console.timeEnd('check indices')
    // ========================================== check for proper indices end =========================================

  // =================================================================================================================
  // ======================================= check for attributes to fetch begin =====================================
  // =================================================================================================================
    debugTime && console.time('check columns')
    const fnColumnsExists = columnsToFetch.some((column) => column.fn); // if fns exist, can't pull ids automatically.

  if (!columnsToFetch.length) {
    debug &&
      console.log(
        "debug getdata: can not find columns to fetch",
        columnsToFetch,
      );
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
    // ======================================= check for attributes to fetch end =======================================

  // =================================================================================================================
  // ========================================= check for invalid state begin =========================================
  // =================================================================================================================
    debugTime && console.time('check invalid')
  // invalid state: while NOT grouping by, there are some columns with fn applied. either all of them need fn, or none.
    let visibleColumnsLength = 0;
    let groupedColumnsLength = 0;
    let fnColumnsLength = 0;
    let nonGroupedColumnsLength = 0;

    for (const col of columnsWithSettings) {
        if (col.show) visibleColumnsLength++;
        if (col.group) groupedColumnsLength++;
        if (col.fn) fnColumnsLength++;
        if (col.show && !col.group) nonGroupedColumnsLength++;
    }

  // no column is grouped by, and fns don't equal visible columns (using length but maybe more nuanced matching can be used)
  const noGroupSomeFnCondition =
    visibleColumnsLength > 1 &&
    !groupedColumnsLength &&
    fnColumnsLength > 0 &&
    fnColumnsLength !== visibleColumnsLength;

  // grouping by some column(s), but fns don't equal non-grouped columns (using length but maybe more nuanced matching can be used)
  const groupNoFnCondition =
    groupedColumnsLength && fnColumnsLength !== nonGroupedColumnsLength; // while grouping, all the non-grouped columns should have a fn
  const isInvalidState = noGroupSomeFnCondition || groupNoFnCondition;

  if (isInvalidState) {
    debug &&
      console.log(
        "debug getdata: invalid state",
        noGroupSomeFnCondition,
        groupNoFnCondition,
        "visible column length",
        visibleColumnsLength,
        groupedColumnsLength,
        fnColumnsLength,
      );
    const invalidStateText = noGroupSomeFnCondition
      ? `All visible columns don't have a function. # Visible columns: ${visibleColumnsLength}, # Function applied: ${fnColumnsLength}`
      : groupNoFnCondition
        ? `All Non grouped columns must have a function applied. # Non grouped columns: ${nonGroupedColumnsLength}, # Function applied: ${fnColumnsLength}.`
        : "";
    return { length, data: [], invalidState: invalidStateText };
  }
    debugTime && console.timeEnd('check invalid')
    // ========================================== check for invalid state end ==========================================

  const children = [
    {
      type: () => {},
      action: actionType,
      path: "/",
      filter: {
        fromIndex: fromIndex,
        toIndex: toIndex,
        options: JSON.stringify(options),
        attributes: columnsToFetch.map((a) => a.reqName).filter((a) => a),
        stopFullDataLoad: true,
      },
    },
  ];
  let data;

  debug &&
    console.log(
      "debug getdata: config + index",
      {
        format: state.sourceInfo,
        children,
      },
      fromIndex,
      toIndex,
    );
  try {
      debugTime && console.time('apiLoad')
    data = await apiLoad(
      {
        format: state.sourceInfo,
        children,
      },
      "/",
    );
      debugTime && console.timeEnd('apiLoad')
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.error(e);
    return {
      length,
      data: [],
      invalidState: "An Error occurred while fetching data.",
    };
  }

  debug && console.log("debug getdata: the data", data.length, data);

  // =================================================================================================================
  // =========================================== fetch total row begin  ==============================================
  // =================================================================================================================
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
      totalRowData = await apiLoad({
        format: state.sourceInfo,
        children: totalRowChildren,
      });
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      return {
        length,
        data: [],
        invalidState: "An Error occurred while fetching data.",
      };
    }

    data.push({ ...totalRowData[0], totalRow: true });
  }
  // ============================================== fetch total row end ==============================================
  // console.log('debug getdata', data,
  //     data.map(row => columnsToFetch.reduce((acc, column) => ({
  //         ...acc,
  //         totalRow: row.totalRow,
  //         // return data with columns' original names
  //         [column.name]: cleanValue(row[row.totalRow ? column.totalName : column.reqName])
  //     }) , {}))
  //
  //     )
    debugTime && console.time('post-processing')
    const formulaColumns = state.columns.filter(
        ({ type }) => type === "formula"
    );
    const dataToReturn = data.map((row) => {
        const isTotalRow = row.totalRow;
        const rowWithData = { totalRow: isTotalRow };

        for (const column of columnsToFetch) {
            const key = isTotalRow ? column.totalName : column.reqName;
            rowWithData[column.name] = cleanValue(row[key]);
        }

        // Apply formulas
        if (formulaColumns.length) {
            for (const { name, formula } of formulaColumns) {
                rowWithData[name] = evaluateAST(formula, rowWithData);
            }
        }

        return rowWithData;
    });

    debugTime && console.timeEnd('post-processing')
    debugTime && console.timeEnd('getData fn')
  return {
    length,
    data: dataToReturn
  };
};

export const convertToUrlParams = (arr, delimiter) => {
  const params = new URLSearchParams();

  arr.forEach((item) => {
    const { column, values = [] } = item;
    params.append(
      column,
      values
        .filter((v) => (Array.isArray(v) ? v.length : v))
        .map((v) => (Array.isArray(v) ? v.join(delimiter) : v))
        .join(delimiter),
    );
  });

  return params.toString();
};

export const getNestedValue = (value) =>
  value?.value && typeof value?.value === "object"
    ? getNestedValue(value.value)
    : !value?.value && typeof value?.value === "object"
      ? ""
      : value;

export const isJson = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

const strColorMap = {
  "Very High Risk": "#AA2E26",
  "High Risk": "#DD524C",
  "Moderate Risk": "#EA8954",
  "Low Risk": "#F1CA87",
  "Very Low Risk": "#54B99B",
  default: "#ccc",
};

const formatDate = (dateString) => {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  };
  return dateString
    ? new Date(dateString).toLocaleDateString(undefined, options)
    : ``;
};
export const formatFunctions = {
  abbreviate: (d, isDollar) => fnumIndex(d, 1, isDollar),
  abbreviate_dollar: (d) => fnumIndex(d, 1, true),
  comma: (d, isDollar) => fnum(d, isDollar),
  comma_dollar: (d) => fnum(d, true),
  zero_to_na: (d) => (!d || (d && +d === 0) || d === "0" ? "N/A" : d),
  date: (d) => formatDate(d),
  icon: (strValue, props, Icon) => (
    <>
      <Icon icon={strValue} className={"size-8"} {...props} />{" "}
      <span>{strValue}</span>
    </>
  ),
  color: (strValue, map) => (
    <>
      <div
        style={{
          borderRadius: "1000px",
          height: "10px",
          width: "10px",
          backgroundColor:
            map?.[strValue] || strColorMap[strValue] || strColorMap.default,
        }}
      />
      <div>{strValue}</div>
    </>
  ),
};
