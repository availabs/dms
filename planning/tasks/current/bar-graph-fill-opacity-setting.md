# Bar graph `barOpacity` format setting

## Objective

Let a page author control the **fill-opacity of bar-graph bars**. The avl-graph
bars have always rendered at a translucent `fill-opacity: 0.75` (a CSS default),
which reads washed-out next to the solid bars in the tsmo congestion design.
Motivating consumer: the congestion_v2 "main" bar graph (section 2175686) — the
mockup bars are solid. Author-empowerment: a new `graphFormat` knob, not a custom
graph, so every bar graph can opt into solid (or any) opacity.

## Root cause / mechanism

`avl-graph.css` sets `rect.avl-stack { fill-opacity: 0.75 }` with `:hover → 1`.
The bar rects had no inline override except the highlight case
(`fillOpacity: highlight ? 1.0 : null`), so authors couldn't change the resting
opacity at all.

## Change (BC)

Threaded a `barOpacity` prop, default **unset**, so when an author doesn't set it
the CSS `0.75` (and its `:hover → 1`) still governs — identical to before.

- `graph_new/GraphComponent.jsx` — `barOpacity={ get(graphFormat, "barOpacity") }`
  (next to `areaOpacity`; no default → undefined when unset).
- `graph_new/components/avl-graph/BarGraph.jsx`:
  - `BarGraph` destructures `barOpacity = null`, passes it to `<Bar>`.
  - `Bar` forwards it to `Stack` via `...restOfProps`.
  - `Stack` rect style: `fillOpacity: highlight ? 1.0 : (barOpacity ?? null)`.
    `null` → CSS governs (BC); a number → inline wins over the CSS (and over the
    `:hover` rule, which is fine at `1` — already max).

The `display` object on a graph section IS the `graphFormat`, so an author sets
`display.barOpacity` (the same place `graphType`, `paddingInner`, axes live).

## Section reconfig (2175686, congestion_v2)
Set `display.barOpacity = 1` → solid bars. Backup at
`scratchpad/npmrdsv5-dev2/backups/section_2175686.bargraph_pre_opacity.json`.

## Testing — DONE (verified live on congestion_v2 2175686)
- [x] bars render at `fill-opacity: 1` (36 bars, all `1`) — solid, design-matching.
- [x] BC: `barOpacity` unset → CSS 0.75 + hover-darken preserved (no other graph
      touched). highlight still forces full opacity.
- [x] 0 console errors.

## Follow-ups — DONE (2026-06-18)
- [x] **Editor control**: added a "Bar Opacity" number input to the "Bar Graph
      Layout" control group (graph_new `config.jsx`, `key: "barOpacity"`,
      `displayCdn` already scopes the group to `graphType === 'BarGraph'`). Authors
      now set it from the toolbar instead of hand-editing `display`.
- [x] **Brand default**: `barOpacity: 1` added to transportnyv2
      `graph.chartDefaults` (themev2.js) — every transportny bar graph is solid by
      default; a section can still override per-graph. (The congestion §2175686
      explicit `display.barOpacity=1` is now redundant but harmless.)

## Outcome
`barOpacity` shipped (dms submodule, BC) + author-facing control + brand default.
Pairs with the Y-axis `tickSpacing` wiring (graph-yaxis-tickspacing-wiring.md) —
same "plumb a graphFormat knob through GraphComponent" pattern.
