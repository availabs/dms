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
// Same deal for the two the unit-path suite at the bottom needs: both must be imported AFTER
// vi.mock above, so the probe stands in for the real avl-graph wrapper there too.
const { ThemeContext } = await import("../src/ui/useTheme");
const Graph = (await import("../src/ui/components/graph_new/index.jsx")).default;

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

// ── The tooltip's UNIT takes a third, longer path ───────────────────────────────────────────
// `theme` dresses the container and `hoverComp.classNames` dresses the body; the unit is
// neither. It starts as site vocabulary, is read by the theme's own `avlGraph.resolveLegendUnit`
// hook, and is injected one level UP — in `graph_new/index.jsx`'s `displayForGraph`, before
// `GraphComponent` is even mounted. So it cannot be seen from the GraphComponent-only harness
// above, which is exactly the shape of gap this file was written for: the legend caption and the
// tooltip unit share a resolver but not a wire, and losing the tooltip half is invisible until
// somebody hovers a graph in a browser.
describe("the resolver's unit reaches the tooltip body, not just the legend", () => {

  const DISPLAY = {
    graphType: "BarGraph",
    xAxis: { name: "yr" },
    yAxis: [{ name: "v" }],
    legend: { show: true, position: "bottom", type: "categorical" },
    margin: { top: 20, right: 20, bottom: 50, left: 100 }
  };

  const renderThroughTheme = (avlGraph, display = DISPLAY) => {
    for (const k of Object.keys(seen)) delete seen[k];
    renderToStaticMarkup(
      React.createElement(ThemeContext.Provider, { value: { theme: { avlGraph } } },
        React.createElement(Graph, {
          isEdit: false, activeStyle: 0, setState: () => {},
          state: { columns: [], data: [{ yr: "2019", v: 10 }], display, comparisonSeries: undefined },
          pageContext: { pageState: {}, setActionParam: () => {}, clearActionParam: () => {} }
        })));
    return seen;
  };

  it("fills hoverComp.valueLabel from resolveLegendUnit", () => {
    expect(renderThroughTheme({ resolveLegendUnit: () => "mph" }).hoverComp?.valueLabel).toBe("mph");
  });

  it("changes NOTHING for a site with no resolver — the MitigateNY case", () => {
    // ~7,415 legend-rendering graphs there, none of which will ever define this hook. An
    // undefined valueLabel is what each hover comp's `!valueLabel ? null :` guard reads.
    expect(renderThroughTheme({}).hoverComp?.valueLabel).toBeUndefined();
    expect(renderThroughTheme({ styles: [{ name: "default" }] }).hoverComp?.valueLabel).toBeUndefined();
  });

  it("an author-set tooltip.valueLabel always wins over the resolver", () => {
    const display = { ...DISPLAY, tooltip: { valueLabel: "AUTHORED" } };
    expect(renderThroughTheme({ resolveLegendUnit: () => "mph" }, display).hoverComp?.valueLabel)
      .toBe("AUTHORED");
  });

  it("a resolver that declines leaves the slot empty rather than writing undefined over it", () => {
    // `getTooltipFormatFunc` and friends spread `...graphFormat.tooltip`, so an explicit
    // `undefined` here would still be a present key — harmless for valueLabel, but the guard is
    // cheap and the same spread has bitten indexFormat before (see GraphComponent's own note).
    expect(renderThroughTheme({ resolveLegendUnit: () => undefined }).hoverComp?.valueLabel)
      .toBeUndefined();
  });
});
