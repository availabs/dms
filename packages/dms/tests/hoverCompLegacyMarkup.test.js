/**
 * Pre-refactor lock on the six `DefaultHoverComp` implementations.
 *
 * Every avl-graph wrapper ships its own tooltip body, and they are close enough to each other
 * to be worth collapsing: Sunburst and Treemap are BYTE-IDENTICAL copies (45 lines, down to the
 * same commented-out dead code), and Bar / Pie / Grid are one skeleton — title, then rows of
 * `swatch · label · value`, then an optional total — with a handful of documented differences.
 * LineGraph is genuinely a different shape (three-column rows plus a `secondary` series pass)
 * and is deliberately excluded from any merge.
 *
 * This file asserts the **exact rendered HTML** of all six as they stand today, so that
 * de-duplicating them, and then theming the result, is provable rather than argued. Nothing
 * here describes desired behaviour; it describes CURRENT behaviour, including the parts that
 * look like accidents:
 *
 *   - Pie has no `showTotals` default, so an omitted prop means no total row. Bar defaults it
 *     to true. That asymmetry is load-bearing for existing pages and is pinned below.
 *   - Bar orders rows by reversing the key array; Pie orders by value descending. Two cases
 *     exist purely to tell those apart, because on ordinary data the two orderings agree and a
 *     shared component could pick either one and still match every other golden.
 *   - Grid drops rows whose value is null (the no-data cells that render nullColor).
 *
 * Regenerating goldens is a DELIBERATE act — it means you intend to change what every graph
 * tooltip on every site looks like. See fixtures/capture-hoverCompLegacy.mjs.
 *
 * Run: npx vitest run packages/dms/tests/hoverCompLegacyMarkup.test.js
 */

import { describe, it, expect } from "vitest";

import { CASES, render } from "./fixtures/hoverCompCases.jsx";
import GOLDENS from "./fixtures/hoverCompLegacy.golden.json" with { type: "json" };

describe("DefaultHoverComp — rendered markup is unchanged", () => {

  it("covers every golden, and every golden has a case (no silent drift)", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(GOLDENS).sort());
  });

  for (const [name, testCase] of Object.entries(CASES)) {
    it(`renders byte-identically to the pre-refactor golden: ${ name }`, () => {
      const golden = GOLDENS[name];
      expect(golden, `no golden captured for "${ name }"`).toBeDefined();
      expect(render(testCase)).toBe(golden);
    });
  }

  // The goldens above would still pass if every comp rendered the same empty shell, so say out
  // loud that each one actually drew a formatted value. Line routes values through `yFormat`
  // rather than `valueFormat`, hence the two accepted markers.
  it("every golden is non-vacuous: real markup, not an empty wrapper", () => {
    for (const [name, html] of Object.entries(GOLDENS)) {
      expect(html.length, `"${ name }" looks empty`).toBeGreaterThan(100);
      expect(/(?:val|y):/.test(html), `"${ name }" rendered no formatted value`).toBe(true);
    }
  });
});

describe("the facts that make a merge safe — asserted, not assumed", () => {

  it("Sunburst and Treemap are byte-identical for every shared case", () => {
    expect(GOLDENS["sunburst: leaf node"]).toBe(GOLDENS["treemap: leaf node"]);
    expect(GOLDENS["sunburst: root node"]).toBe(GOLDENS["treemap: root node"]);
  });

  it("Pie suppresses the total when showTotals is omitted; Bar defaults it on", () => {
    expect(GOLDENS["pie: multi key, showTotals omitted"]).not.toContain("Total:");
    expect(GOLDENS["bar: multi key, totals on"]).toContain("Total:");
  });

  it("a single key suppresses the total row regardless of showTotals", () => {
    expect(GOLDENS["bar: single key"]).not.toContain("Total:");
    expect(GOLDENS["pie: single key"]).not.toContain("Total:");
  });

  it("Bar orders rows by reversed key, Pie by descending value", () => {
    const order = html => [...html.matchAll(/key:(\w+):/g)].map(m => m[1]);
    expect(order(GOLDENS["bar: row order is key-reversed"])).toEqual(["beta", "alpha"]);
    expect(order(GOLDENS["pie: row order is value-descending"])).toEqual(["alpha", "beta"]);
  });

  it("Grid drops null-valued rows and suppresses the total in singleCell mode", () => {
    expect(GOLDENS["grid: whole column, totals on"]).not.toContain("idx:07:00");
    expect(GOLDENS["grid: singleCell"]).not.toContain("Total:");
    expect(GOLDENS["grid: singleCell"]).toContain("idx:06:00");
  });

  it("Line keeps its own shape: a secondary series adds three-column rows", () => {
    expect(GOLDENS["line: with secondary series"]).toContain("grid-cols-3");
    expect(GOLDENS["line: primary only, totals on"]).not.toContain("grid-cols-3");
  });
});
