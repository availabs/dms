import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { dataBarTheme } from "./dataBar.theme";

// data_bar column type — an in-cell horizontal bar whose width is the cell value
// scaled within [barMin, barMax]. Reusable on any numeric Spreadsheet/Card column;
// the value reads as a mini bar chart while real labels/values live in sibling
// columns. Scale + colour are author-configured (static) OR read from sibling row
// columns, so they can be data-driven — e.g. a `max(sum(x)) over ()` window column
// for the scale and a CASE column for a top-N colour highlight. All styling is
// themed via `dataBar`; the inline default is the fallback.
//
// Column attributes:
//   barMin         : scale min (default 0).
//   barMax         : scale max (static). OR
//   barMaxColumn   : name of a sibling row column holding the scale max (auto-scales
//                    to the column's own maximum with no hardcoded ceiling).
//   barColorKey    : theme.fills key for the fill colour (static; default 'primary'). OR
//   barColorColumn : sibling column holding the fills key per row (e.g. 'primary'
//                    for the top N, 'muted' otherwise).

const clampPct = (n) => Math.max(0, Math.min(100, n));
// Strip thousands separators before parsing: a column with formatFn:'comma' hands us
// "31,677", and bare parseFloat stops at the comma (→ 31), collapsing the bar scale.
const num = (x) => parseFloat(String(x?.value ?? x ?? "").replace(/,/g, ""));

export const DataBarView = ({ value, row, barMin = 0, barMax, barMaxColumn, barColorKey = "primary", barColorColumn, barShowValue, barUnit = "" }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...dataBarTheme, ...getComponentTheme(themeFromContext, "dataBar") };

  const v = num(value);
  if (Number.isNaN(v)) return null;

  const min = num(barMin) || 0;
  const max = barMaxColumn && row ? num(row[barMaxColumn]) : num(barMax);
  const span = (max - min) || 1;
  const fillPct = clampPct(((v - min) / span) * 100);

  const fills = t.fills || {};
  const colorKey = barColorColumn && row ? (row[barColorColumn]?.value ?? row[barColorColumn]) : barColorKey;
  const fillClass = fills[colorKey] || fills[barColorKey] || fills.primary || "";

  return (
    <div className={t.wrapper}>
      <div className={t.track}>
        <div className={`${t.fill} ${fillClass}`} style={{ width: `${fillPct}%` }} />
      </div>
      {barShowValue ? <span className={t.value}>{value?.value ?? value}{barUnit}</span> : null}
    </div>
  );
};

export const DataBarEdit = (props) => <DataBarView {...props} />;
