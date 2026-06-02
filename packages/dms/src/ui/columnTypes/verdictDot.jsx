import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// verdict_dot column type — renders a numeric value preceded by a colored dot
// (emerald = meets, red = below) based on whether the value clears a threshold.
// Reusable on any scored matrix where each cell carries an implicit pass/fail
// against a target (LOTTR compliance, TTTR, congestion budget, etc.). Sibling
// of `status_pill` (which carries a status string) and `target_bar` (which
// visualizes the gap) — `verdict_dot` is the compact inline-cell variant for
// dense tables.
//
// Column attributes (set per-column in the Spreadsheet/Card toolbar):
//   verdictThreshold  : number — comparison target (e.g. 75, 70, 2.0)
//   verdictDirection  : 'ge' (default) | 'le' — meets when value >=/<= threshold
//   verdictEmphasize  : bool (default false) — render the failed value in
//                       bold + dark red, matching the design's "below" emphasis.
//                       Default off keeps a quiet color; set true when the
//                       table is a compliance matrix and below-target should
//                       read as alarming.
const verdictDotDefault = {
  // The dot + value group. Stays `inline-flex` (shrinks to content) so the CELL's
  // own justify (left/right/center, threaded via `className`) decides alignment —
  // the column type must not hardcode its own justify or it overrides the author's
  // per-column setting.
  wrapper: "inline-flex items-center gap-1.5 tabular-nums",
  good:    "",
  bad:     "",
  badEmphasized: "font-semibold text-[#991B1B]",
  dotGood: "size-1.5 rounded-full bg-emerald-500",
  dotBad:  "size-1.5 rounded-full bg-red-500",
  dotNa:   "size-1.5 rounded-full bg-slate-300",
};

const isMeet = (n, threshold, direction) => {
  if (Number.isNaN(n) || threshold === undefined || threshold === null) return null;
  return direction === "le" ? n <= threshold : n >= threshold;
};

export const VerdictDotView = ({ value, className = "", verdictThreshold, verdictDirection = "ge", verdictEmphasize = false }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...verdictDotDefault, ...getComponentTheme(themeFromContext, "verdict_dot") };

  // `className` is the cell's resolved class (theme `cellInner` w-full flex + the
  // column's `justify-*` + any `valueFontStyle`). Apply it on the outer element so
  // the dot+value group honours the column's alignment, exactly like a plain cell.
  if (value === null || value === undefined || value === "") return <div className={className} />;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return <div className={className}>{value}</div>;

  const threshold = parseFloat(verdictThreshold);
  const meets = isMeet(n, threshold, verdictDirection);

  const dotClass = meets === null ? t.dotNa : meets ? t.dotGood : t.dotBad;
  const valueClass = meets === false && verdictEmphasize ? t.badEmphasized : (meets ? t.good : t.bad);

  return (
    <div className={className}>
      <span className={`${t.wrapper} ${valueClass}`}>
        <span className={dotClass}></span>
        {value}
      </span>
    </div>
  );
};

export const VerdictDotEdit = (props) => <VerdictDotView {...props} />;
