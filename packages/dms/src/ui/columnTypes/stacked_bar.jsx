import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// stacked_bar column type — a single-track, multi-segment proportional bar with an
// optional counts legend:
//
//   [██████████▓▓▓▓░░░░]
//   3 proposed · 0 design · 1 impl · 2 qa
//
// One row supplies EVERY segment via sibling columns (the data_bar `row` convention):
// put the per-category counts on the row as aggregate calculated columns
// (`count(*) filter (where …)`, fn:"exempt", selectOnly so they stay in the query but
// render no cell) and point `segments` at them. Proportions are computed client-side
// from the row, so the bar is exactly as live as the query behind it. Reads segment
// values ONLY from `row` — its own cell value is unused. All styling is themed via
// `stackedBar`; the inline default is the fallback.
//
// Column attributes:
//   segments   : [{ col, label?, color? }] — col = sibling column (its normalName)
//                holding the count; label = legend text (default col); color =
//                '#hex'/'rgb…'/'hsl…' rendered inline, else a theme `fills` key.
//                Array order = bar left→right = legend order.
//   showLegend : false → bar only (default true: counts line under the bar, zeros
//                included so the categories read stably as the data moves).
//   emptyText  : shown in place of the all-zero legend when the total is 0 (e.g.
//                "no tickets yet"); the bar renders as a bare track.
const stackedBarDefault = {
  wrapper: "w-full",
  track: "w-full flex h-2 rounded bg-slate-200 overflow-hidden",
  segment: "h-full shrink-0",
  legend: "pt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 tabular-nums",
  empty: "pt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400",
  // key → segment colour class for non-literal `color` values. Site themes override
  // these (and may add keys).
  fills: { primary: "bg-blue-700", muted: "bg-slate-400" },
};

// Strip thousands separators before parsing (the data_bar lesson): a formatted count
// hands us "1,204" and bare parseFloat stops at the comma.
const num = (x) => parseFloat(String(x?.value ?? x ?? "").replace(/,/g, ""));
const isLiteralColor = (c) => /^(#|rgb|hsl)/i.test(c || "");

export const StackedBarView = ({ segments, showLegend = true, emptyText, row }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...stackedBarDefault, ...getComponentTheme(themeFromContext, "stackedBar") };
  const fills = t.fills || {};

  const segs = (Array.isArray(segments) ? segments : []).map((s) => {
    const n = num(row?.[s.col]);
    return { ...s, n: Number.isNaN(n) ? 0 : Math.max(0, n) };
  });
  if (!segs.length) return null;
  const total = segs.reduce((sum, s) => sum + s.n, 0);

  return (
    <div className={t.wrapper}>
      <div className={t.track}>
        {segs.filter((s) => s.n > 0).map((s, i) => {
          const pct = (100 * s.n) / total;
          const literal = isLiteralColor(s.color);
          return (
            <div
              key={i}
              className={`${t.segment} ${literal ? "" : fills[s.color] || fills.primary || ""}`}
              style={{ width: `${pct}%`, ...(literal ? { background: s.color } : {}) }}
              title={`${s.label ?? s.col}: ${s.n} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      {showLegend ? (
        total === 0 && emptyText
          ? <div className={t.empty}>{emptyText}</div>
          : <div className={t.legend}>{segs.map((s) => `${s.n} ${s.label ?? s.col}`).join("  ·  ")}</div>
      ) : null}
    </div>
  );
};

// Derived from sibling aggregates — nothing to edit in-place; edit renders the same
// view so edit-mode screenshots/QA passes don't go blank.
export const StackedBarEdit = (props) => <StackedBarView {...props} />;
