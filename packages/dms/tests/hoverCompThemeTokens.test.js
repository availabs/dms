/**
 * Forward coverage for the tooltip's class-string tokens.
 *
 * `hoverCompLegacyMarkup.test.js` proves an UNSET token changes nothing. This file proves a SET
 * token does the right thing — and, as with the legend, that it does not take the structure with
 * it. The contract each case pins:
 *
 *   a token replaces the LOOK it names, and never the STRUCTURE around it
 *
 * What counts as structure here is not a style opinion, it is measured: `color-square` is not a
 * Tailwind class at all but an ancestor-dependent hook (`.hover-comp .color-square` in
 * avl-graph.css styles every swatch through the container), `w-5 h-5` size the swatch, `flex-1`
 * makes the value column fill, and `absolute z-10 / z-50` are what stack Grid's two swatches.
 * A brand that could delete any of them would break tooltips on every site.
 *
 * The `rowActive` token exists for a specific trap: the row highlight is `border-current`, i.e.
 * currentColor, so it renders in whatever text colour it inherits. transportny's `tooltip` token
 * carries `text-white`, which would otherwise turn every highlight border white-on-white.
 *
 * Run: npx vitest run packages/dms/tests/hoverCompThemeTokens.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DefaultBarHoverComp } from "../src/ui/components/graph_new/components/avl-graph/BarGraph.jsx";
import { DefaultPieHoverComp } from "../src/ui/components/graph_new/components/avl-graph/PieGraph.jsx";
import { DefaultGridHoverComp } from "../src/ui/components/graph_new/components/avl-graph/GridGraph.jsx";
import { DefaultLineHoverComp } from "../src/ui/components/graph_new/components/avl-graph/LineGraph.jsx";
import { DefaultSunburstHoverComp } from "../src/ui/components/graph_new/components/avl-graph/SunburstGraph.jsx";
import { HoverCompContainer } from "../src/ui/components/graph_new/components/avl-graph/components/HoverCompContainer.jsx";

const fmt = p => d => `${ p }${ d }`;
const F = { indexFormat: fmt("i"), keyFormat: fmt("k"), valueFormat: fmt("v") };

const TOKENS = {
  title:     "THEME-TITLE",
  swatch:    "THEME-SWATCH",
  value:     "THEME-VALUE",
  rowActive: "THEME-ACTIVE"
};

const barData = { index: "x", key: "beta",
  data: { alpha: 12, beta: 30 },
  barValues: { alpha: { color: "#111" }, beta: { color: "#222" } } };
const pieData = { index: "x", key: "beta",
  data: { alpha: 12, beta: 30 }, colorMap: { x: { alpha: "#111", beta: "#222" } } };
const gridData = { key: "K", index: "b",
  indexes: ["a", "b"],
  indexData: { a: { value: 5, color: "#111" }, b: { value: 7, color: "#222" } },
  keyTotal: 12 };
const lineData = { x: "x",
  data: [{ id: "one", y: 1, color: "#111", isMax: true },
         { id: "two", y: 2, color: "#222", isMax: false }],
  secondary: [] };

const render = (Comp, props) => renderToStaticMarkup(React.createElement(Comp, props));

const CASES = {
  bar:  [DefaultBarHoverComp,  { data: barData,  keys: ["alpha","beta"], ...F, showTotals: true }],
  pie:  [DefaultPieHoverComp,  { data: pieData,  keys: ["alpha","beta"], ...F, showTotals: true }],
  grid: [DefaultGridHoverComp, { data: gridData, ...F, bgColor: "#fff", showTotals: true }],
  line: [DefaultLineHoverComp, { data: lineData, idFormat: fmt("i"), xFormat: fmt("x"),
                                 yFormat: fmt("y"), lineTotals: { one: 10, two: 20 },
                                 showTotals: true }]
};
const withTokens = name => {
  const [Comp, props] = CASES[name];
  return render(Comp, { ...props, classNames: TOKENS });
};

describe("tooltip tokens reach every graph type", () => {

  it("title: all four row-based tooltips plus the hierarchy one", () => {
    for (const name of Object.keys(CASES)) {
      expect(withTokens(name), name).toContain("THEME-TITLE");
    }
    expect(render(DefaultSunburstHoverComp,
      { data: { data: ["L"], depth: 2, parent: null, value: 3 }, ...F, classNames: TOKENS }))
      .toContain("THEME-TITLE");
  });

  it("swatch and value land wherever that graph type has one", () => {
    // Line is in this loop as of 2026-09-15. Its own 3-column row hardcoded `text-right pr-4`
    // and never consulted `cn.value` at all, so a brand that themed its tooltip numerals got
    // them everywhere EXCEPT line graphs — the most common chart on an NPMRDS report page. It
    // now follows the same `${ cn.value || "text-right" }` shape as Bar/Pie/Grid, which is
    // byte-identical when the token is unset (locked by hoverCompLegacyMarkup.test.js).
    for (const name of ["bar","pie","grid","line"]) {
      expect(withTokens(name), name).toContain("THEME-SWATCH");
      expect(withTokens(name), name).toContain("THEME-VALUE");
    }
  });

  it("valueLabel puts the measure's unit beside the value, on every row-based tooltip", () => {
    // The slot is not new — Bar/Pie/Grid have always rendered `valueLabel` as a `<b>` after the
    // value — but it defaulted to "" so no NPMRDS tooltip ever showed a unit. `graph_new/
    // index.jsx` now fills it from the same `avlGraph.resolveLegendUnit` hook that fills the
    // legend caption, so "30.4" reads "30.4 mph". Line gained the slot in the same change; it
    // had none at all, which would have made it the one chart type still showing bare numbers.
    for (const name of Object.keys(CASES)) {
      const [Comp, props] = CASES[name];
      expect(render(Comp, { ...props, valueLabel: "mph" }), name).toContain("mph");
      // Unset stays absent — this is what keeps every other site's tooltips unchanged.
      expect(render(Comp, props), name).not.toContain("mph");
    }
  });

  it("rowActive replaces border-current on the highlighted row ONLY", () => {
    for (const name of ["bar","pie","line"]) {
      const html = withTokens(name);
      expect(html, `${ name } should use the token for the active row`).toContain("THEME-ACTIVE");
      expect(html, `${ name } should not also emit border-current`).not.toContain("border-current");
      expect(html, `${ name } keeps the inactive rows transparent`).toContain("border-transparent");
    }
  });
});

describe("tokens never take the structure with them", () => {

  it("color-square survives — it is the avl-graph.css hook, not decoration", () => {
    for (const name of ["bar","pie","grid","line"]) {
      expect(withTokens(name), name).toContain("color-square");
    }
  });

  it("swatch sizing and the value column's fill survive", () => {
    for (const name of ["bar","pie","grid"]) {
      expect(withTokens(name), name).toMatch(/w-5 h-5/);
      expect(withTokens(name), name).toContain("flex-1");
    }
  });

  it("Grid keeps the absolute stacking that layers its two swatches", () => {
    const html = withTokens("grid");
    expect(html).toContain("absolute z-10");
    expect(html).toContain("absolute z-50");
  });

  it("Line does not render two title rules when the token carries its own", () => {
    // Line draws the rule on the header ROW, not the title text, so a token with a border would
    // otherwise stack with it.
    const themed = withTokens("line");
    expect((themed.match(/border-b-2/g) || []).length).toBe(0);
    const bare = render(...CASES.line);
    expect(bare).toContain("border-b-2");
  });
});

describe("the tooltip container", () => {
  const container = theme => renderToStaticMarkup(
    React.createElement(HoverCompContainer, {
      show: true, theme, position: "above", pos: [10, 10], windowPos: [10, 10],
      svgWidth: 200, svgHeight: 200, margin: { top: 0, right: 0, bottom: 0, left: 0 }
    }, "body"));

  it("unset: the historical look and the drop shadow are unchanged", () => {
    const html = container({});
    expect(html).toContain("rounded bg-inherit");
    expect(html).toContain("box-shadow:2px 2px 8px 0px rgba(0, 0, 0, 0.75)");
  });

  it("set: the token replaces the look, and owns its own elevation", () => {
    const html = container({ tooltip: "THEME-TIP" });
    expect(html).toContain("THEME-TIP");
    expect(html).not.toContain("bg-inherit");
    expect(html, "a theme that supplies a background owns its shadow too")
      .not.toContain("box-shadow");
  });

  it("hover-comp and the positioning survive in both cases", () => {
    for (const theme of [{}, { tooltip: "THEME-TIP" }]) {
      const html = container(theme);
      expect(html).toContain("hover-comp");
      expect(html).toContain("absolute top-0 left-0 z-50 pointer-events-none");
      expect(html).toContain("pointer-events-none");
    }
  });
});
