# Task: Make avlGraph axis fonts themeable (tick labels + axis labels)

**Topic:** ui (`avlGraph` / `graph_new` primitive) + themes (transportny)
**Status:** ✅ IMPLEMENTED 2026-06-03 — verified live on the §02 trends + PHED graph
(ticks render mono 11px slate-500 on transportny; line/area/marks/domain unchanged = BC).
**Relation:** follow-up to `avlgraph-theme-integration.md` (that task's objective *listed*
"fonts" among the theme-driven chart internals, but the delivered work covered line/area/
gridline/axis-color tokens only — the axis **font** is still hardcoded). This task closes
that gap. **BC by default** (defaults reproduce today's look exactly).

## Problem

The graph axis typography is not reachable from the theme or per-section settings:

- **Tick labels** (`.tick text`) get their size from CSS, hardcoded:
  `components/avl-graph/avl-graph.css:42-45`
  ```css
  .avl-graph text.avl-pie-label,
  .avl-graph g.axis g.tick text { font-size: 0.75rem; }
  ```
  Font-family/weight/color of ticks just inherit (color comes via `currentColor` on the
  parent `<g>`); nothing is settable per-graph or per-brand.
- **Axis labels** (the rotated "axis title" text) hardcode font inline in all three axis
  renderers:
  - `components/avl-graph/components/AxisLeft.jsx:171-173` — `.attr("fill","currentColor")
    .attr("font-size","1rem").attr("font-weight","bold")`
  - `components/avl-graph/components/AxisBottom.jsx:159-161` — same
  - `components/avl-graph/components/AxisRight.jsx:169` — same (font-size 1rem)

So a brand cannot set the report's mono tick font, and a section author cannot bump tick
size for a dense axis. Everything else on the chart (colors, margins, gridlines, line/area,
axis color) already flows theme → `chartDefaults` → per-section `display`; fonts are the
last hardcoded island.

## Goal

Add axis-font tokens that flow the same path as the existing axis tokens, applied via d3
`.style(...)` on `.tick text` and `.axis-label`, with defaults that match the current
render (tick 0.75rem inherited family/weight/color; label 1rem bold currentColor).

Proposed token shape (per axis, both `xAxis` and `yAxis`):
```
xAxis/yAxis: {
  …existing keys…,
  tickFontSize, tickFontFamily, tickFontWeight, tickColor,   // .tick text
  labelFontSize, labelFontFamily, labelFontWeight, labelColor // .axis-label
}
```
(Names TBD during impl — could also nest under `tickFont`/`labelFont` objects. Keep flat
to match the existing flat `axisColor`/`gridLineOpacity` siblings.)

## The threading path (mirror the existing axis-token wiring)

1. **`graph_new/theme.js`** — add the font keys to `ChartDefaults.xAxis` / `.yAxis` with
   today's values as defaults. (`mergeChartDefaults` in `index.jsx` already deep-merges
   xAxis/yAxis one level, so sparse sections inherit; no change needed there.)
2. **`themev2.js`** (transportny `chartDefaults`) — set the brand mono tick font / label
   font so all report graphs pick it up at once. (This is the "style all graphs from the
   brand" payoff.)
3. **`GraphComponent.jsx:131-141`** — extend the `yAxis={{…}}` (and the xAxis block) it
   builds from `graphFormat` to read+pass the new font keys (`get(graphFormat,["yAxis",
   "tickFontSize"])`, …), same as it already does for `axisColor`/`gridLineOpacity`.
4. **`components/LineGraph.jsx:145-148`** — `axisLeft = { ...props.yAxis }` already
   forwards everything; confirm the xAxis path forwards too. Likely no change.
5. **`components/avl-graph/components/AxisLeft.jsx` / `AxisBottom.jsx` / `AxisRight.jsx`**
   — accept the new props (with BC defaults), and apply:
   - on `.tick text`: `.style("font-size", tickFontSize).style("font-family",
     tickFontFamily).style("font-weight", tickFontWeight).style("fill", tickColor)`
     (only set a `.style` when the prop is provided, else leave inheriting → BC).
   - on `.axis-label`: replace the hardcoded `.attr("font-size","1rem")
     .attr("font-weight","bold")` with the label tokens, defaulting to those literals.
   - **avl-graph.css:42-45** — keep the `0.75rem` as the CSS default (inline `.style`
     wins when a token is set); or drop to a `:where()` so JS always wins cleanly.
6. **`ComponentRegistry/graph_new/config.jsx`** — surface the new keys as controls under
   the existing X-Axis / Y-Axis control groups (font-size number, family text, weight
   select, color) so a section author can override per-graph. Match how `axisColor` /
   `Domain Min/Max` / `Point Marks` controls were added.

## Files

| File | Change |
|---|---|
| `ui/components/graph_new/theme.js` | font keys on `ChartDefaults.xAxis/.yAxis` (BC defaults) |
| `src/themes/transportny/themev2.js` | brand tick/label fonts in graph `chartDefaults` |
| `ui/components/graph_new/GraphComponent.jsx` | read+pass font keys in the xAxis/yAxis blocks |
| `ui/components/graph_new/components/LineGraph.jsx` | confirm forward (likely no change) |
| `…/avl-graph/components/AxisLeft.jsx` | apply tick/label font via `.style()`, BC default |
| `…/avl-graph/components/AxisBottom.jsx` | same |
| `…/avl-graph/components/AxisRight.jsx` | same |
| `…/avl-graph/avl-graph.css` | tick `0.75rem` becomes the fallback (let inline win) |
| `ComponentRegistry/graph_new/config.jsx` | X/Y-Axis font controls |
| `src/dms/skills/authoring-graphs.md` | document the axis-font tokens (theme vs per-section) |

## What shipped (2026-06-03)

Implemented exactly along the threading path above. Deviations/decisions:
- **Threading helper:** added a non-exported `axisFontProps(graphFormat, axis)` in
  `GraphComponent.jsx` that collects the 8 keys for an axis and spreads them into the
  xAxis/yAxis prop objects (keeps the JSX terse; Fast-Refresh-safe — not exported).
- **`components/LineGraph.jsx`:** no change needed — `{ ...props.yAxis }` /
  `{ ...props.xAxis }` already forward every key to the avl-graph axes.
- **Axis renderers:** tick keys applied as `.style(_, tick* || null)` (unset → removes
  the inline style → CSS `0.75rem`/inherit wins = BC); label keys default to the historical
  literals in the destructure (`AxisRight` keeps `labelFontWeight` unset to match its
  original no-weight label). `avl-graph.css` `.tick text { font-size: 0.75rem }` left as-is
  (inline wins when set) — no `:where()` needed.
- **Default theme (`graph_new/theme.js`):** per the user's "extend the default theme too",
  set **explicit** values for all 8 keys on both axes (not left unset). Defaults reproduce
  today's look — tick `0.75rem`/`inherit`/`normal`, label `1rem`/bold — with
  `tickColor: "currentColor"` (follows `textColor`; also fixes near-invisible black ticks
  in Dark Mode). Shared by both Light/Dark styles.
- **Brand theme (`themev2.js`):** full set on both axes — ticks mono 11px `#64748b`
  weight 400; labels Proxima 13px weight 600 `#334155`.
- **Controls:** 8 text inputs per axis added to the X-Axis / Y-Axis groups in `config.jsx`
  (colors entered as text, matching the existing `Series Color` control). The new-section
  seed `graphOptions` deliberately does NOT carry font keys (so the theme drives them;
  a seeded value would wrongly beat the brand default).

## Testing checklist

- [x] With no per-section tokens, existing graphs render unchanged — verified live on the
      §02 interstate trend + PHED (line/area/marks/domain identical; BC).
- [x] Brand `chartDefaults.{x,y}Axis.tickFontFamily` (mono) restyles every report graph's
      ticks at once — PHED/interstate ticks now monospace slate-500 (re-shot vs the
      pre-change sans-serif).
- [ ] A per-section `display.yAxis.tickFontSize` override beats the brand default (path is
      identical to the verified brand path; not separately shot).
- [ ] Axis label font tokens (labels aren't used on the report graphs — tokens wired + BC
      defaults preserved; exercise when a graph adds an axis label).
- [x] Dark-mode default tickColor = `currentColor` (follows textColor) — set in
      `graph_new/theme.js` for both styles.

## Notes / context

- This is the author-empowerment move: fonts become theme tokens + per-section knobs, not
  code. No new component.
- Related recent change (same session): the **PHED y-axis decimals** were a *config* fix,
  not a code one — `display.yAxis.format` `fnum2`→`fnum` (graph 2174102) dropped the
  `338.71m`→`339m` clutter. Format options already live in `utils.js ValueFormats`
  (`fnum`, `millions`, `integer`, …) and are author-selectable; no primitive gap there.
  Listed here only so the font work isn't confused with the format work.
