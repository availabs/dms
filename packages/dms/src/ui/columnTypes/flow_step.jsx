import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { flowStepTheme } from "./flow_step.theme";

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
//   stepNote  : optional second line under the label (e.g. "needs a decision or data")
//   stepDashed: truthy → the dashed-box variant (theme `boxDashed`), for a step that
//               sits beside the flow rather than in it

export const FlowStepView = ({ value, customName, display_name, stepColor = "neutral", stepTint, stepDashed, stepNote, connector }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...flowStepTheme, ...getComponentTheme(themeFromContext, "flowStep") };
  const label = customName || display_name || "";
  const count = value?.value ?? value;
  const dots = t.dots || {};
  return (
    <div className={t.wrapper}>
      <div className={stepTint ? t.boxTint : stepDashed ? (t.boxDashed || t.box) : t.box}>
        <span className={`${t.dot} ${dots[stepColor] || dots.neutral || ""}`} />
        {stepNote ? (
          <span className={t.labelStack}>
            <span className={t.label}>{label}</span>
            <span className={t.note}>{stepNote}</span>
          </span>
        ) : <span className={t.label}>{label}</span>}
        <span className={t.count}>{count}</span>
      </div>
      {connector ? <span className={t.connector}>›</span> : null}
    </div>
  );
};

// read-only chrome — nothing to edit in-place
export const FlowStepEdit = (props) => <FlowStepView {...props} />;
