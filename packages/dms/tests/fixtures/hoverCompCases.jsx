/**
 * The case table + renderer shared by `hoverCompLegacyMarkup.test.js` and its golden-capture
 * script. Lives outside the test file so the capture script can import it without vitest's
 * `describe` being in scope — same split as `viewSectionHeaderCases.jsx`.
 *
 * These goldens exist to make the DefaultHoverComp de-duplication provable. Sunburst and Treemap
 * are byte-identical copies of each other; Bar, Pie and Grid are the same skeleton with six
 * documented differences between them. Collapsing those into shared components is only safe if
 * the rendered HTML does not move, and "does not move" is asserted here rather than argued.
 *
 * The formatters are deliberately NOT Identity — each one stamps a recognisable prefix, so a
 * golden diff distinguishes "the markup changed" from "the wrong formatter reached this slot"
 * (e.g. Grid's title goes through keyFormat while Bar's goes through indexFormat).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DefaultBarHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/BarGraph.jsx";
import { DefaultPieHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/PieGraph.jsx";
import { DefaultGridHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/GridGraph.jsx";
import { DefaultLineHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/LineGraph.jsx";
import { DefaultSunburstHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/SunburstGraph.jsx";
import { DefaultTreemapHoverComp } from "../../src/ui/components/graph_new/components/avl-graph/TreemapGraph.jsx";

const indexFormat = d => `idx:${ d }`;
const keyFormat = d => `key:${ d }`;
const valueFormat = d => `val:${ d }`;
const idFormat = (d, rest) => `id:${ d }${ rest && rest.secondary ? "/2nd" : "" }`;
const xFormat = d => `x:${ d }`;
const yFormat = d => `y:${ d }`;

// ── Bar / Pie share a data shape: a hovered index, a map of key→value, and a per-key colour
// source that is the ONE thing that differs (barValues vs colorMap).
const barData = key => ({
  index: "2024-03", key,
  data: { alpha: 12, beta: 30 },
  barValues: { alpha: { color: "#1f77b4" }, beta: { color: "#ff7f0e" } }
});
const pieData = key => ({
  index: "2024-03", key,
  data: { alpha: 12, beta: 30 },
  colorMap: { "2024-03": { alpha: "#1f77b4", beta: "#ff7f0e" } }
});

// With alpha < beta the two orderings coincide, so these same-shaped rows carry alpha > beta
// instead: Bar must emit beta-then-alpha (key order, reversed) and Pie alpha-then-beta (value
// descending). Without this pair a shared row component could pick either ordering and still
// match every other golden.
const barDataUnsorted = {
  index: "2024-03", key: null,
  data: { alpha: 30, beta: 12 },
  barValues: { alpha: { color: "#1f77b4" }, beta: { color: "#ff7f0e" } }
};
const pieDataUnsorted = {
  index: "2024-03", key: null,
  data: { alpha: 30, beta: 12 },
  colorMap: { "2024-03": { alpha: "#1f77b4", beta: "#ff7f0e" } }
};

// ── Grid hovers a COLUMN: one key, many indexes, each with its own value+colour. A null value
// is the no-data cell that renders nullColor on the grid itself and is dropped from the tooltip.
const gridData = {
  key: "I-90 EB", index: "06:00",
  indexes: ["05:00", "06:00", "07:00"],
  indexData: {
    "05:00": { value: 55, color: "#2166ac" },
    "06:00": { value: 41, color: "#ef8a62" },
    "07:00": { value: null, color: null }
  },
  keyTotal: 96
};

// ── Line hovers an x-position across every series, and carries a SECOND axis (`secondary`)
// whose rows render through a different 3-column markup path.
const lineData = secondary => ({
  x: "2024-03",
  data: [
    { id: "route_a", y: 61, color: "#1f77b4", isMax: true },
    { id: "route_b", y: 48, color: "#ff7f0e", isMax: false, displayName: "Route B (NB)" }
  ],
  secondary: secondary
    ? [{ id: "volume", y: 1200, color: "#2ca02c", isMax: false, secondary: true }]
    : []
});
const lineTotals = { route_a: 610, route_b: 480, volume: 12000 };

// ── Sunburst / Treemap walk a d3 hierarchy node upward via `.parent`, building the label from
// each ancestor's `data[0]`. depth 1 formats through indexFormat, depth 2 through keyFormat.
const root = { data: [null], depth: 0, parent: null, value: 100 };
const branch = { data: ["Nassau"], depth: 1, parent: root, value: 70 };
const leaf = { data: ["Flooding"], depth: 2, parent: branch, value: 42 };

export const CASES = {
  // ── BarGraph ──────────────────────────────────────────────────────────────────────────────
  // One key takes the `pb-2` wrapper and suppresses the total row regardless of showTotals.
  "bar: single key": {
    Comp: DefaultBarHoverComp,
    props: { data: barData(null), keys: ["alpha"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  // Two keys take `pb-1` and DO draw the total. Rows render in reverse key order.
  "bar: multi key, totals on": {
    Comp: DefaultBarHoverComp,
    props: { data: barData(null), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  "bar: multi key, totals off": {
    Comp: DefaultBarHoverComp,
    props: { data: barData(null), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: false }
  },
  // The hovered key gets `border-current` and full opacity; the others drop to 0.2.
  "bar: highlighted key": {
    Comp: DefaultBarHoverComp,
    props: { data: barData("beta"), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  // Row ORDER discriminator — see barDataUnsorted. Expect beta, then alpha.
  "bar: row order is key-reversed": {
    Comp: DefaultBarHoverComp,
    props: { data: barDataUnsorted, keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  "bar: valueLabel": {
    Comp: DefaultBarHoverComp,
    props: { data: barData(null), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: "mph", showTotals: true }
  },

  // ── PieGraph ──────────────────────────────────────────────────────────────────────────────
  // Pie has NO default for showTotals, so an omitted prop means no total row — a real
  // behavioural difference from Bar that any shared component has to preserve.
  "pie: multi key, showTotals omitted": {
    Comp: DefaultPieHoverComp,
    props: { data: pieData(null), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null }
  },
  // Pie sorts rows by value descending; Bar reverses the key array.
  "pie: multi key, totals on": {
    Comp: DefaultPieHoverComp,
    props: { data: pieData(null), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  "pie: single key": {
    Comp: DefaultPieHoverComp,
    props: { data: pieData(null), keys: ["alpha"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  // Row ORDER discriminator — the mirror of the Bar case. Expect alpha, then beta.
  "pie: row order is value-descending": {
    Comp: DefaultPieHoverComp,
    props: { data: pieDataUnsorted, keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },
  "pie: highlighted key": {
    Comp: DefaultPieHoverComp,
    props: { data: pieData("alpha"), keys: ["alpha", "beta"], indexFormat, keyFormat, valueFormat,
             valueLabel: null, showTotals: true }
  },

  // ── GridGraph ─────────────────────────────────────────────────────────────────────────────
  // Whole-column tooltip: the 07:00 null-value row is dropped, so two rows render, not three.
  "grid: whole column, totals on": {
    Comp: DefaultGridHoverComp,
    props: { data: gridData, indexFormat, keyFormat, valueFormat, valueLabel: null,
             bgColor: "#ffffff", showTotals: true, singleCell: false }
  },
  // singleCell narrows to the hovered index AND suppresses the total.
  "grid: singleCell": {
    Comp: DefaultGridHoverComp,
    props: { data: gridData, indexFormat, keyFormat, valueFormat, valueLabel: null,
             bgColor: "#ffffff", showTotals: true, singleCell: true }
  },
  "grid: totals off": {
    Comp: DefaultGridHoverComp,
    props: { data: gridData, indexFormat, keyFormat, valueFormat, valueLabel: null,
             bgColor: "#ffffff", showTotals: false, singleCell: false }
  },
  "grid: valueLabel": {
    Comp: DefaultGridHoverComp,
    props: { data: gridData, indexFormat, keyFormat, valueFormat, valueLabel: "mph",
             bgColor: "#0f1722", showTotals: true, singleCell: false }
  },

  // ── LineGraph ─────────────────────────────────────────────────────────────────────────────
  // `displayName` on route_b exercises the idFormat fallback; isMax drives the swatch alpha.
  "line: primary only, totals on": {
    Comp: DefaultLineHoverComp,
    props: { data: lineData(false), idFormat, xFormat, yFormat, lineTotals, showTotals: true }
  },
  "line: primary only, totals off": {
    Comp: DefaultLineHoverComp,
    props: { data: lineData(false), idFormat, xFormat, yFormat, lineTotals, showTotals: false }
  },
  // The secondary pass renders a DIFFERENT 3-column markup — the reason LineGraph stays out of
  // any shared row component.
  "line: with secondary series": {
    Comp: DefaultLineHoverComp,
    props: { data: lineData(true), idFormat, xFormat, yFormat, lineTotals, showTotals: true }
  },

  // ── Sunburst / Treemap (byte-identical implementations today) ─────────────────────────────
  "sunburst: leaf node": {
    Comp: DefaultSunburstHoverComp,
    props: { data: leaf, indexFormat, keyFormat, valueFormat }
  },
  // A node whose data[0] is null falls through to its parent, and a root with none returns
  // the literal "total".
  "sunburst: root node": {
    Comp: DefaultSunburstHoverComp,
    props: { data: root, indexFormat, keyFormat, valueFormat }
  },
  "treemap: leaf node": {
    Comp: DefaultTreemapHoverComp,
    props: { data: leaf, indexFormat, keyFormat, valueFormat }
  },
  "treemap: root node": {
    Comp: DefaultTreemapHoverComp,
    props: { data: root, indexFormat, keyFormat, valueFormat }
  }
};

export const render = ({ Comp, props }) => renderToStaticMarkup(React.createElement(Comp, props));
