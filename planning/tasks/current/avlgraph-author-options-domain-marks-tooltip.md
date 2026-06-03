# AVL Graph — author-editable options: y-domain, point marks, tooltip format & totals

## Status: IMPLEMENTED — 2026-06-02 (verified on MAP-21 PM3 graphs)

All four options shipped, BC (defaults preserve current render), author-editable via the
section controls. Files touched:
- `ComponentRegistry/graph_new/config.jsx` — controls: yAxis `Domain Min`/`Domain Max`
  inputs; per-series + Line-Graph-Layout `Point Marks` toggle (`showMarks`); `Show Totals`
  toggle on both tooltip groups (`tooltip.showTotal`). (`tooltip.yFormat` already existed,
  with `float1`/`float2` in `ValueFormats` — that's the decimals fix.)
- `ui/components/graph_new/GraphComponent.jsx` — pass `yAxis.domainMin/domainMax`,
  chart-level `showMarks`, and map `tooltip.showTotal` → hoverComp `showTotals` (default true).
- `ui/components/graph_new/components/LineGraph.jsx` — carry per-series `showMarks`.
- `ui/components/graph_new/components/avl-graph/LineGraph.jsx` — clamp yDomain to
  `axisLeft.domainMin/Max` when set; compute per-point screen coords + render `<circle>`
  marks in `<Line>` (per-series `showMarks` overrides chart default); gate the secondary-
  series tooltip total with `showTotals`.

Verified: Interstate/Non-Interstate graphs → y-axis 0–100, data-only marks (target line
unmarked), tooltip `86.9`/`75.0` (1-decimal, no totals); Truck index → 2-decimal tooltip,
auto domain. Applied to graphs `2173963`/`2173964` (% , domain 0–100, float1) and `2173965`
(index, float2). Marks made data-only by setting `showMarks:false` on each dashed target series.

TODO before moving to completed/: BC regression check on a graph elsewhere with none of
the new options set (should render byte-identically), then move file + update todo/completed.

## Objective
Add four backward-compatible, author-editable options to the AVL Graph section
(`patterns/page/components/sections/components/ComponentRegistry/graph_new/`),
driven by the theme/config controls so a page author can set them without code.
Requested for the MAP-21 PM3 report (the % graphs want a fixed 0–100 domain,
point marks like the design mock, decimals in tooltips, and no totals row).

## Options to add (all BC — defaults preserve current behavior)

1. **Custom y-axis domain** — `display.yAxis.domainMin` / `display.yAxis.domainMax`.
   - Default `undefined` → current auto-scale (nice/extent). When set, clamp the
     yScale domain to the author value (e.g. top = 100 for % graphs).
   - Surface as two numeric inputs in the yAxis/"more" controls.
   - Wire into the LineGraph yScale domain in `graph_new/index.jsx` (or wherever the
     scale is built). Confirm whether AreaGraph/BarGraph share the path.

2. **Point marks on the line** — per-series `showMarks` (bool), optionally `markSize`.
   - Default `false` → current (no dots). When on, render a circle at each datum,
     matching the mock (white fill, colored stroke, larger "current" point optional).
   - Per-series control next to interpolation/area/color/dash (those live in
     `config.jsx` controls). Render in the line/area graph component.

3. **Tooltip format function** — `display.tooltip.format` (formatFn key, reuse the
   column `formatFn` set: comma/abbreviate/percent/decimal/…).
   - Today the tooltip effectively renders integers (`yAxis.format: "integer"`).
     Let the tooltip carry its own format so decimals aren't dropped.
   - Default keeps current rendering.

4. **Tooltip totals on/off** — `display.tooltip.showTotal` (bool).
   - These graphs want it **off**. Default = current behavior (verify current default).

## Files (to confirm during impl)
- `graph_new/config.jsx` — add controls + `graphOptions`/per-series defaults.
- `graph_new/index.jsx` — consume the new display/series values; build yScale domain,
  render marks, format + gate tooltip total.
- The underlying graph lib component (avl-graph LineGraph/AreaGraph) — point marks &
  tooltip rendering may live there; trace before editing.

## Constraints
- Backward-compatible by default (see [[feedback_primitive_change_tasks_bc.md]]);
  surface any non-BC need as an explicit question.
- Author-editable via controls, options considered by the theme (no hardcoding on the page).

## Verify
- Playwright loop on `npmrds.localhost:5173/edit/map_21_system_performance` (see
  [[reference_npmrds_dev_auth]] / [[reference_dms_card_conversion_recipe]]):
  - Interstate & Non-Interstate % graphs: domain top = 100, marks on, tooltip shows
    decimals, no totals.
  - An existing graph with none of the options set renders unchanged (BC check).

## Related downstream page work (separate from this primitive task)
- [x] **Split header bands** for all three measures — each is now a **left lexical**
  (kicker + heading, freely editable) + **right card** (value + pill only, cloned from
  the §01 KPI model, trimmed to year/value/pill, helper columns deleted) composing
  flush above its graph via section `height:'fill'`. Graph titles removed (top-level
  `title` + `display.title.title`) and graph chrome set to compose (bottom/side borders,
  rounded-b, tint bg, `padding.top:0`). Sections: Interstate lex `2174073` + card `2174097`
  + graph `2173963`; Non-Int lex `2174098` + card `2174095` + graph `2173964`; Truck lex
  `2174099` + card `2174096` + graph `2173965`. (Notch fix = `sectionArray` `height:'fill'`
  → see [[section-height-setting]] update.)
- [x] ~~Data-driven header cards (single-Card version)~~ — superseded by the split above. Cloned from the
  §01 KPI cards (`2173919`/`2173920`/`2173921`), trimmed to mockup columns (kicker +
  heading + value + meets-target; no delta/bar), value `displayLG`, heading `displayXS`,
  value row-spans the kicker+heading block. Truck keeps its index (non-%) format.
- [ ] Add a **PHED graph** (4th measure; KPI model `2173922`, 4 cols, 7-digit hr/yr —
  not a %) + its header card. Needs the PHED time-series SQL/source — confirm source/version.
