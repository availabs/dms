# Graph legend top/bottom position — scoping

## Objective

User request (routed here from dms-template's `old-reports-conversion.md` / TransportNY report
work): all report graph legends currently render to the right of the chart, which sometimes eats
into valuable horizontal space. Scope out what it would take, at the `@availabs/dms` library
level, to let an author put the legend at the top or bottom of the graph instead.

## Scope

- All chart types under the `avlGraph` section (`ui/components/graph_new/`): BarGraph, LineGraph,
  PieGraph, GridGraph, SunburstGraph, TreemapGraph.
- The shared `Legend` primitive (`ui/components/graph_new/components/avl-graph/components/
  Legend.jsx`) and the author-facing Settings control (`patterns/page/.../ComponentRegistry/
  graph_new/config.jsx`).
- Out of scope: the legacy standalone `graph` element-type has already been fully retired at the
  registry level (see Finding 3) and is a non-issue; Card-cell mini-charts (e.g. `columnTypes/
  stacked_bar.jsx`) are a different, unrelated "legend" and weren't investigated.

## Finding: already fully implemented — no dms code change needed

This capability already exists end-to-end in the current `@availabs/dms` submodule (checked at
commit `2c2864d6`, which is what `dms-template` currently points at — `git submodule status
src/dms`). An author can already set a graph's legend to top or bottom today, no code change
required:

1. **Render layer** — every chart wrapper (`BarGraph.jsx`, `LineGraph.jsx`, `PieGraph.jsx`,
   `TreemapGraph.jsx`, `SunburstGraph.jsx`, `GridGraph.jsx`, all under `ui/components/graph_new/
   components/`) computes `isColumnLegend = ["top","bottom"].includes(legend.position)` and
   switches its outer flex container to `flex-col`, rendering the shared `<Legend/>` into
   whichever of four (GridGraph: six, corner-based) slots `legend.position` names. This is
   symmetric, already-shipped code — not a partial/stubbed feature. `GraphComponent.jsx` passes
   `legend={ get(graphFormat, "legend", {}) }` straight through with no filtering, so nothing
   upstream blocks a `"top"`/`"bottom"` value from reaching the wrapper.
2. **Author-facing control** — `ComponentRegistry/graph_new/config.jsx`'s "Legend" settings group
   (lines ~470-486) already offers a "Position" select with **Right / Left / Top / Bottom** for
   every non-GridGraph chart type, and a separate "Legend" group for GridGraph (~488-507) offers
   **Right / Left / Top Right / Top Left / Bottom Right / Bottom Left** (GridGraph's legend is a
   linear color-scale gradient, not a per-series swatch list, so corner placement next to the
   grid makes more sense than a full-width top/bottom band — that's an intentional difference,
   not a gap).
3. **No legacy-component gap** — `ComponentRegistry/index.jsx` resolves both the legacy `Graph`
   element-type and the current `AVL Graph` element-type to the exact same `GraphNew` component
   (`Graph: GraphNew`, `"AVL Graph": { ...GraphNew, hideInSelector: true }`). There is no separate
   legend implementation anywhere else to worry about, and per the user, no one is authoring new
   legacy-`Graph` sections going forward anyway.

**How an author uses it today:** open the graph section's settings → "Legend" group → "Position"
→ Top or Bottom.

### Two small friction points found (not blockers, left for the user to decide on)

- **Position resets on Graph Type change.** `config.jsx`'s Graph Type `onChange` handler
  hard-resets `state.display.legend.position = "right"` whenever the chart type changes (it also
  resets column `target`s at the same time). An author who sets Top/Bottom and then later changes
  the chart type loses that choice silently. One-line fix if wanted; left alone since it's
  bundled with other intentional per-type resets and wasn't asked for.
- **A `legend.show:true` with no `position` key renders nothing.** None of a wrapper's position
  checks match `undefined`. The shipped `defaultState` always sets an explicit `"right"`, so this
  only bites hand-built section data (e.g. a CLI-created section with a partial `legend` object),
  not anything authored through the UI.

## Proposed changes

None required for the ask itself. Documentation fix applied this session (see below).

## Files touched this session

- `src/dms/skills/authoring-graphs.md` — the "Legend" bullet under "Pattern: BarGraph" claimed
  "BarGraph only renders the legend at position: 'left' | 'right'", which is stale/incorrect
  against the current code (verified top/bottom work identically across all 5 non-GridGraph chart
  types). Corrected to document the real, current position surface for every chart type
  (including GridGraph's corner scheme), the `undefined`-position-renders-nothing gotcha (which
  *is* still real and accurate), and the graph-type-switch reset gotcha.

## Testing checklist

- [x] Verified via direct source read: `BarGraph.jsx`, `LineGraph.jsx`, `PieGraph.jsx`,
  `TreemapGraph.jsx`, `SunburstGraph.jsx`, `GridGraph.jsx` all branch on
  `legend.position` for top/bottom (or GridGraph's corner variants) identically.
- [x] Verified `GraphComponent.jsx` passes `legend` through unfiltered.
- [x] Verified the author Settings control (`config.jsx`) already exposes Top/Bottom (and
  GridGraph's corner options) as selectable, not just a render-layer capability with no way to
  reach it.
- [x] Verified the legacy `Graph` / current `AVL Graph` element-types share one implementation
  (`ComponentRegistry/index.jsx`), so there's no second code path to check.
- [x] Confirmed the `dms-template` submodule pointer (`2c2864d6`) matches the checked-out `src/dms`
  working tree HEAD — the code read is what's actually running locally.
- [ ] **Not done**: an interactive live click-through (open a real graph section's Settings →
  Legend → Position, pick "Top", confirm the legend visually moves). Started a live check on the
  `monthly_congestion` report (localhost:5173) to confirm a real graph section renders correctly,
  but stopped short of entering section-edit mode to avoid risking live report content — per
  project convention, that kind of interactive edit should go through a dedicated scratch report,
  not a page that might be in active use. If a live demo is wanted, next step is: create/reuse a
  scratch report (see `skills/traversing-report-pages.md` for the click path), add any graph
  section, open its Settings → Legend group, switch Position to Top or Bottom, screenshot.
