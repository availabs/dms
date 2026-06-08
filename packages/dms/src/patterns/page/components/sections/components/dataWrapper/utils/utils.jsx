import React from "react";
import { useCallback, useEffect } from "react";
import { Link } from "react-router";
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

// parseIfJson and cleanValue moved to getData.js

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
  const colNameAfterAS = ((
    isCalculatedCol ? // get response name for calculated columns
        splitColNameOnAS(col.name)[1] :
        col.name
  ) || '').toLowerCase();

  const functions = {
    [undefined]: !isDms && !isCalculatedCol ? colNameWithAccessor : `${colNameWithAccessor} as ${colNameAfterAS}`,
    "": !isDms && !isCalculatedCol ? colNameWithAccessor : `${colNameWithAccessor} as ${colNameAfterAS}`,
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

// returns column names with fns applied. these are actually what gets used to fetch values.
const getColAccessor = (col, isDms) => (!col ? null : applyFn(col, isDms));

// getLength moved to getData.js

export const getColumnLabel = (column) =>
  column.customName || column.display_name || column.name;

// evaluateAST moved to getData.js

// getData and getLength moved to ../getData.js
export { getData, getLength } from "../getData";

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

export const DEFAULT_SOURCE_JOIN = {
  source: null,
  view: null,
  sourceInfo: {},
  joinColumns: [],
  mergeStrategy: "join",
  type: "left",
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

// Time-of-day formatter: produces strings like "10:30 am" / "10:30 pm" using
// the browser's locale + resolved timezone. Local tz (rather than UTC like
// formatDate above) is intentional — for time columns the user almost always
// wants the wall-clock time of the event in their own zone, not the stored
// UTC instant. Returns '' for null/empty/unparseable input.
const formatTime = (dateString) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const formatted = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // toLocaleTimeString returns "10:30 AM" — lowercase the period to match
  // the editorial convention requested.
  return formatted.replace(/\s?(AM|PM)$/i, (_, p) => ` ${p.toLowerCase()}`);
};

// Combined date + time-of-day. Falls back to whichever half is parseable.
const formatDateTime = (dateString) => {
  if (!dateString) return "";
  const date = formatDate(dateString);
  const time = formatTime(dateString);
  return [date, time].filter(Boolean).join(" ");
};

export const formatFunctions = {
  abbreviate: (d, isDollar) => fnumIndex(d, 1, isDollar),
  abbreviate_dollar: (d) => fnumIndex(d, 1, true),
  comma: (d, isDollar) => fnum(d, isDollar),
  comma_dollar: (d) => fnum(d, true),
  // append a percent sign to a ready-to-display value (does not multiply by 100 —
  // the value is assumed to already be a percentage, e.g. 79.8 → "79.8%").
  percent: (d) => (d === null || d === undefined || d === "" ? "" : `${d}%`),
  zero_to_na: (d) => (!d || (d && +d === 0) || d === "0" ? "N/A" : d),
  date: (d) => formatDate(d),
  time: (d) => formatTime(d),
  datetime: (d) => formatDateTime(d),
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
  // Renders `<value><separator><row[combineWith]>` — lets a Card cell carry two
  // row fields on one editorial line (e.g. "Stereolab — Lo Boob Oscillator").
  // Non-standard signature: needs the row to resolve the sibling field and the
  // column attr to read `combineWith`/`combineSeparator`. Card.jsx routes the
  // call so this format never goes through the generic value-resolution branch
  // that would strip whitespace from the separator.
  // Renders the cell value as a React Router link using the row's url_slug.
  // Pass this formatFn on the title (or any text) column of a pages spreadsheet.
  page_link: (value, _isDollar, row) => {
    const slug = row?.url_slug;
    if (!slug) return value;
    return <Link to={slug}>{value}</Link>;
  },
  combine: (value, row, attr) => {
    const sep = attr?.combineSeparator ?? " — ";
    const otherField = attr?.combineWith;
    const other = otherField && row ? (row[otherField]?.value ?? row[otherField]) : undefined;
    const a = value?.value ?? value;
    const parts = [a, other].filter(v => v !== undefined && v !== null && v !== "");
    return parts.join(sep);
  },
};
