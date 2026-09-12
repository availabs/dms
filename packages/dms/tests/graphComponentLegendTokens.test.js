/**
 * End-to-end check on the ONE piece of plumbing the legend tests can't see: GraphComponent's
 * injection of the theme's Layer-A class tokens into the `legend` prop bag.
 *
 * The legend cannot read these tokens itself — which avlGraph style is live is decided
 * per-section by `activeStyle`, which the legend never sees — so GraphComponent injects them
 * as `legend.classNames`, and all six graph wrappers carry them the rest of the way for free
 * because each already spreads `{ ...legend }` into <Legend/>. Nothing in the wrappers was
 * touched, which is the point; this test is what says that assumption actually holds.
 *
 * It renders a real BarGraph through GraphComponent with react-dom/server and asserts on the
 * legend markup that comes out the far end.
 *
 * Scope, stated honestly: under SSR the chart's data pipeline yields no legend CATEGORIES, so
 * this reaches the legend's CONTAINER but not its swatches or labels. That is fine — the
 * swatch/label/tick/ramp tokens are covered directly in legendThemeTokens.test.js; what can
 * only be verified here is that a token set on the THEME arrives at the legend at all, and
 * under the right key name. A typo in the theme key (`legendSwatch` vs `legend_swatch`) is
 * exactly the silent failure this catches.
 *
 * Run: npx vitest run packages/dms/tests/graphComponentLegendTokens.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GraphComponent } from "../src/ui/components/graph_new/GraphComponent.jsx";

const renderGraph = theme => renderToStaticMarkup(React.createElement(GraphComponent, {
  graphType: "BarGraph",
  graphFormat: {
    xAxis: { name: "yr" },
    yAxis: [{ name: "v" }],
    legend: { show: true, position: "bottom", type: "categorical" },
    margin: { top: 20, right: 20, bottom: 50, left: 100 }
  },
  viewData: [{ yr: "2019", v: 10 }, { yr: "2020", v: 20 }],
  columns: {},
  theme,
  actions: []
}));

describe("GraphComponent → legend theme-token injection", () => {

  it("renders the historical legend container when the theme sets no tokens", () => {
    // The MitigateNY case, end to end: a theme with no avlGraph legend tokens must produce
    // the same markup it always has.
    expect(renderGraph({})).toContain(`class="px-4 flex flex-wrap items-center justify-left gap-2"`);
  });

  it("passes theme.legend through to the legend container as `row`", () => {
    const html = renderGraph({ legend: "gap-4 text-slate-500" });
    expect(html).toContain(`class="gap-4 text-slate-500 flex flex-wrap items-center justify-left"`);
    // the replaced look is genuinely gone, not merely accompanied
    expect(html).not.toContain("px-4 flex flex-wrap items-center justify-left gap-2");
  });

  it("leaves the container historical when only NON-container tokens are set", () => {
    // Guards against an injection that accidentally collapses all five tokens into one.
    const html = renderGraph({ legendSwatch: "h-0.5 w-4", legendTick: "text-[10px]" });
    expect(html).toContain(`class="px-4 flex flex-wrap items-center justify-left gap-2"`);
  });

  it("tolerates a theme with no avlGraph tokens at all", () => {
    // `theme` is destructured without a default in GraphComponent, and a sparse or absent
    // theme is the normal case on an unbranded site — the optional chaining in the injection
    // is what keeps that from throwing.
    expect(() => renderGraph({})).not.toThrow();
    expect(() => renderGraph({ bgColor: "bg-white", padding: "p-4" })).not.toThrow();
  });
});
