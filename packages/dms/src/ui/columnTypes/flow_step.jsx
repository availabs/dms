import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// flow_step column type — one step of a lifecycle flow strip: a boxed
// [dot · label · count] with an optional '›' lead-out connector toward the next
// step and a tinted "terminal" variant for the final (done) step. Reusable on any
// aggregate Card whose cells are stage counts (ticket lifecycles, pipeline
// funnels). It reads ONLY its own value (the count); the label is the column's
// author-facing name. All styling is themed via `flowStep`; the inline default is
// the fallback.
//
// Column attributes:
//   stepColor : theme `dots` key for the status dot (default 'neutral';
//               defaults ship neutral/info/warn/done — themes may add keys)
//   stepTint  : truthy → the tinted terminal-box variant (theme `boxTint`)
//   connector : truthy → renders the '›' lead-out after the box (omit on the
//               last step; it visually sits in the cells-grid gap)
const flowStepDefault = {
  wrapper: "w-full h-full flex items-center",
  box: "flex-1 min-w-0 h-full rounded-md border border-slate-200 bg-slate-50/60 p-3 flex items-center gap-2",
  boxTint: "flex-1 min-w-0 h-full rounded-md border border-emerald-200 bg-emerald-50/50 p-3 flex items-center gap-2",
  dot: "size-2.5 rounded-full shrink-0",
  dots: { neutral: "bg-slate-300", info: "bg-sky-400", warn: "bg-amber-400", done: "bg-emerald-500" },
  label: "font-medium text-[12.5px] text-slate-700 truncate",
  count: "ml-auto pl-2 font-semibold text-[18px] tabular-nums text-slate-900",
  connector: "shrink-0 text-slate-300 text-[16px] pl-1 -mr-1 select-none",
};

export const FlowStepView = ({ value, customName, display_name, stepColor = "neutral", stepTint, connector }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...flowStepDefault, ...getComponentTheme(themeFromContext, "flowStep") };
  const label = customName || display_name || "";
  const count = value?.value ?? value;
  const dots = t.dots || {};
  return (
    <div className={t.wrapper}>
      <div className={stepTint ? t.boxTint : t.box}>
        <span className={`${t.dot} ${dots[stepColor] || dots.neutral || ""}`} />
        <span className={t.label}>{label}</span>
        <span className={t.count}>{count}</span>
      </div>
      {connector ? <span className={t.connector}>›</span> : null}
    </div>
  );
};

// read-only chrome — nothing to edit in-place
export const FlowStepEdit = (props) => <FlowStepView {...props} />;
