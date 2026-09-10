/**
 * Back-compat lock for `Legend`'s LEGACY FLAT PROP SHAPE.
 *
 * Why this file exists
 * --------------------
 * Every graph wrapper renders the legend as `<Legend { ...legend } actions={ actions } />`
 * — one flat bag mixing three unrelated things: author settings (`show`/`position`/`size`),
 * computed draw data (`scale`/`colors`/`categories`/`format`), and (as of the graph-chrome
 * theming work) theme chrome. The theming work adds a `classNames` key to that bag, which
 * means every existing consumer's render path is touched.
 *
 * The blast radius is not npmrds. It is **MitigateNY: ~7,415 legend-rendering graphs**, almost
 * all `CategoricalLegend`, none of which will ever set a `classNames` token. If a legend
 * renders one class differently than it did before, that is 7,415 pages regressed, and no
 * npmrds report probe would catch it.
 *
 * So: this asserts the **exact rendered HTML** of the legacy flat shape against goldens
 * captured from the code as it stood BEFORE the theming change. Not "the props are accepted"
 * — the actual markup, class strings and all. A token that is unset must resolve to the
 * historical literal, byte for byte.
 *
 * Deliberately no jsdom / @testing-library
 * ----------------------------------------
 * `react-dom/server`'s renderToStaticMarkup needs no DOM, so this adds zero dependencies to
 * the package. The cost is that the two LINEAR legends measure their container with a ref at
 * render time, and under SSR that measurement is absent — their goldens therefore lock the
 * pre-measurement paint, not the final geometry. That is a real gap and it is covered
 * elsewhere, by the Playwright geometry probe (`slack_in_box: 0`, see the task file). The
 * CATEGORICAL path — the one MitigateNY actually depends on — has no measurement and is
 * locked here completely.
 *
 * Run: npx vitest run packages/dms/tests/legendLegacyProps.test.js
 * Regenerating goldens is a DELIBERATE act: it means you intend to change what every existing
 * site's legend looks like. Do not do it to make a red test green.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Legend } from "../src/ui/components/graph_new/components/avl-graph/components/Legend.jsx";
import { buildValueColorScale } from "../src/ui/components/graph_new/components/utils.js";

import GOLDENS from "./fixtures/legendLegacyProps.golden.json" with { type: "json" };

// The library's own default palette (graph_new/theme.js's ChartDefaults.colors) and a domain
// taken from a real report's travel-time grid, so the linear cases exercise a genuine ramp
// rather than a two-stop toy.
const RAMP = ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"];
const scale = buildValueColorScale(0, 47.5, RAMP);

// Each case is the flat bag a real call site spreads today. Names are the fixture keys.
const CASES = {
  "categorical/vertical (Bar,Line,Pie,Treemap,Sunburst default)": {
    type: "categorical", orientation: "vertical", size: "medium",
    categories: ["2019", "2020", "2021"], colors: RAMP, actions: []
  },
  "categorical/horizontal (bottom-positioned)": {
    type: "categorical", orientation: "horizontal", size: "medium",
    categories: ["I-87 NB", "I-87 SB"], colors: RAMP, actions: []
  },
  "categorical + colorsByKey (comparison-series identity colors)": {
    type: "categorical", orientation: "vertical", size: "medium",
    categories: ["Main", "Compare"], colors: RAMP,
    colorsByKey: { Main: "#0f766e", Compare: "#b91c1c" }, actions: []
  },
  "categorical + hover_highlight action": {
    type: "categorical", orientation: "vertical", size: "medium",
    categories: ["A", "B"], colors: RAMP,
    actions: [{ action: "hover_highlight", value: ["B"] }]
  },
  "categorical/large": {
    type: "categorical", orientation: "vertical", size: "large",
    categories: ["x"], colors: RAMP, actions: []
  },
  // The bare-minimum shape: no size, no orientation. An external consumer that predates
  // those props must keep getting the historical defaults (vertical / medium).
  "categorical, no explicit size/orientation (bare defaults)": {
    type: "categorical", categories: ["only"], colors: RAMP, actions: []
  },
  "linear/horizontal (GridGraph gradient)": {
    type: "linear", orientation: "horizontal", size: "medium",
    scale, format: d => `${ Math.round(d * 100) / 100 } min`, actions: []
  },
  "linear/vertical (GridGraph right-positioned)": {
    type: "linear", orientation: "vertical", size: "medium",
    scale, format: d => `${ Math.round(d) }`, actions: []
  },
  "linear/large horizontal": {
    type: "linear", orientation: "horizontal", size: "large",
    scale, actions: []
  },
  // Pass 1's fallback guard: no usable colour ramp ⇒ render NOTHING, rather than a
  // fabricated 0/0.25/0.5/0.75/1 key to a scale that never existed.
  "linear with NO usable ramp (blank-graph fallback)": {
    type: "linear", orientation: "horizontal", size: "medium", actions: []
  }
};

const render = props => renderToStaticMarkup(React.createElement(Legend, props));

describe("Legend — legacy flat prop shape", () => {

  it("covers every golden, and every golden has a case (no silent drift)", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(GOLDENS).sort());
  });

  for (const [name, props] of Object.entries(CASES)) {
    it(`renders byte-identically to the pre-theming golden: ${ name }`, () => {
      const golden = GOLDENS[name];
      expect(golden, `no golden captured for "${ name }"`).toBeDefined();
      expect(render(props)).toBe(golden);
    });
  }

  // Spelled out separately from the golden because it is the one case whose CORRECT output is
  // empty — a golden of "" is indistinguishable from a golden that failed to capture.
  it("renders nothing at all when there is no usable colour ramp", () => {
    expect(render(CASES["linear with NO usable ramp (blank-graph fallback)"])).toBe("");
  });

  // The goldens above would also pass if the legend rendered a blank div for everything, so
  // pin the load-bearing categorical internals by name. These are the exact strings
  // MitigateNY's graphs depend on.
  describe("categorical internals that MitigateNY depends on", () => {
    const html = () => render(CASES["categorical/vertical (Bar,Line,Pie,Treemap,Sunburst default)"]);

    it("keeps the historical swatch classes", () => {
      expect(html()).toContain(`class="w-4 h-4 rounded mr-1 flex-shrink-0"`);
    });
    it("keeps the historical vertical container classes", () => {
      expect(html()).toContain(`class="px-4 grid grid-cols-1 gap-1"`);
    });
    it("keeps the historical horizontal container classes", () => {
      expect(render(CASES["categorical/horizontal (bottom-positioned)"]))
        .toContain(`class="px-4 flex flex-wrap items-center justify-left gap-2"`);
    });
    it("keeps the size→text-class mapping (medium ⇒ text-xs, large ⇒ text-sm)", () => {
      expect(html()).toContain(`class="text-xs"`);
      expect(render(CASES["categorical/large"])).toContain(`class="text-sm"`);
    });
    it("still reverses category order and still labels each row with a title attribute", () => {
      const out = html();
      expect(out.indexOf("2021")).toBeLessThan(out.indexOf("2019"));
      expect(out).toContain(`title="2021"`);
    });
    it("still lets an explicit per-key colour beat the positional swatch", () => {
      const out = render(CASES["categorical + colorsByKey (comparison-series identity colors)"]);
      expect(out).toContain("background-color:#0f766e");
      expect(out).toContain("background-color:#b91c1c");
    });
    it("still applies the hover_highlight outline to the highlighted category only", () => {
      const out = render(CASES["categorical + hover_highlight action"]);
      expect(out).toContain("outline outline-2 outline-offset-1 rounded");
      expect(out).toContain("background-color:red");
    });
  });
});
