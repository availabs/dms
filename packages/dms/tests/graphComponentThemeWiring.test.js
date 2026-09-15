/**
 * The theme must actually REACH the graph.
 *
 * This test exists because of a real miss. The tooltip's container token (`theme.tooltip`) was
 * implemented, unit-tested and green — every avl-graph wrapper destructured a `theme` prop, and
 * BarGraph had forwarded it to `HoverCompContainer` for years. But `GraphComponent` never passed
 * `theme` to the graph component at all, so every one of those reads saw `EmptyObject` and the
 * token silently did nothing on a real page. Component-level tests could not see the gap: each
 * half was correct in isolation and only the wire between them was missing.
 *
 * So this asserts the PLUMBING rather than any rendered class: the graph component that
 * `GraphComponent` chooses is handed the resolved avlGraph style, alongside the `hoverComp`
 * carrying the tooltip-body `classNames`. Those are two independent paths to the same tooltip —
 * `theme` dresses the container, `hoverComp.classNames` dresses the body — and losing either one
 * is invisible until someone hovers a graph in a browser.
 *
 * Run: npx vitest run packages/dms/tests/graphComponentThemeWiring.test.js
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Stand in for whichever avl-graph wrapper getGraphComponent would pick, and record its props.
// Keeps d3 / ResizeObserver / the real SVG render out of the test entirely.
const seen = {};
vi.mock("../src/ui/components/graph_new/components", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGraphComponent: () => function GraphProbe(props) {
      Object.assign(seen, props);
      return React.createElement("div", { "data-probe": "" });
    }
  };
});

const { GraphComponent } = await import("../src/ui/components/graph_new/GraphComponent.jsx");

const THEME = {
  bgColor: "bg-white",
  tooltip: "THEME-TOOLTIP-LOOK",
  tooltipTitle: "THEME-TITLE",
  tooltipSwatch: "THEME-SWATCH",
  tooltipValue: "THEME-VALUE",
  tooltipRow: "THEME-ROW",
  tooltipRowActive: "THEME-ACTIVE",
  legend: "THEME-LEGEND-ROW"
};

const render = () => renderToStaticMarkup(
  React.createElement(GraphComponent, {
    graphType: "BarGraph",
    theme: THEME,
    graphFormat: { title: {}, tooltip: {}, legend: { show: true } },
    viewData: [],
    columns: [],
    activeGraphType: "BarGraph"
  }));

describe("GraphComponent hands the avlGraph style to the graph", () => {

  it("renders through the probe", () => {
    expect(render()).toContain("data-probe");
  });

  it("passes `theme` — the wire whose absence made the tooltip token a no-op", () => {
    render();
    expect(seen.theme, "the graph component received no theme at all").toBeDefined();
    expect(seen.theme.tooltip).toBe("THEME-TOOLTIP-LOOK");
  });

  it("passes the tooltip BODY tokens on the separate hoverComp path", () => {
    render();
    expect(seen.hoverComp?.classNames).toEqual({
      title: "THEME-TITLE",
      swatch: "THEME-SWATCH",
      value: "THEME-VALUE",
      row: "THEME-ROW",
      rowActive: "THEME-ACTIVE"
    });
  });

  // Every `tooltip*` key a theme can author must appear in the injection. `tooltipRow` was
  // added to the components and to the transportny theme but NOT to this object, so it silently
  // did nothing on a real page and the two rendered tooltips were byte-identical. An exhaustive
  // check costs nothing and catches the next one.
  it("injects EVERY tooltip* token the theme defines — no silently dropped key", () => {
    render();
    const authored = Object.keys(THEME)
      .filter(k => k.startsWith("tooltip") && k !== "tooltip")
      .map(k => k.replace(/^tooltip/, "").replace(/^./, c => c.toLowerCase()));
    expect(Object.keys(seen.hoverComp?.classNames || {}).sort()).toEqual(authored.sort());
  });

  it("still passes the legend tokens it passed before (no regression)", () => {
    render();
    expect(seen.legend?.classNames?.row).toBe("THEME-LEGEND-ROW");
  });
});
