# Wire the Y-axis "Tick Spacing" control (avlGraph)

## Objective

Let an author thin a busy numeric Y axis to exactly the rounds they want. The
graph editor already exposes a **"Tick Spacing"** input (`yAxis.tickSpacing`,
graph_new `config.jsx`), but it did nothing — setting it had no effect. Surfaced
on the tsmo congestion bar graph (2175686): the Y axis showed ~16 ticks
(0,20,…,300); the design wants far fewer.

## Root cause

Two gaps, both "control exists but isn't plumbed":
1. `GraphComponent.jsx` built the `yAxis` prop object but never read
   `yAxis.tickSpacing` (or `yAxis.ticks`) from `graphFormat`, so the value never
   reached the axis renderer.
2. `AxisLeft.jsx` (the numeric value axis) only honored an approximate `ticks`
   count (d3 `.ticks(n)`); it had no notion of an explicit tick STEP. And its
   gridlines were drawn from `scale.ticks(ticks)` independently of the tick
   labels, so even a label change wouldn't thin the grid.

## Change (BC)

- `GraphComponent.jsx` yAxis block: pass `tickSpacing: get(graphFormat,
  ["yAxis","tickSpacing"])` and `ticks: get(graphFormat,["yAxis","ticks"])`.
  Unset → undefined → renderer default (~10 ticks). BC.
- `AxisLeft.jsx`:
  - destructure `tickSpacing`; thread through render + deps.
  - new numeric branch: when `tickSpacing` is set (and the axis isn't
    band/ordinal), compute `tickValues` from the live `scale.domain()` —
    `ceil(lo/step)*step … hi` by `step`. Flows into the existing
    `axisLeft.tickValues(...)` path.
  - gridlines: `const gridTicks = tickValues || scale.ticks(ticks)` — grid now
    follows the same positions as the labels (thins with them). Only touches the
    `type === "linear"` block; tickValues was always undefined there before, so
    BC for every existing linear/line graph.

The chain (already intact for other yAxis keys):
`graphFormat.yAxis → GraphComponent → BarGraphWrapper axisLeft={...yAxis} → avl
BarGraph AxisLeftData={...axisLeft} → AxisLeft`.

## Section reconfig (2175686, congestion_v2)
Set `display.yAxis.tickSpacing = 50` → ticks/grid at 0,50,…,300 (7, was ~16).

## Testing — DONE (verified live on congestion_v2 2175686)
- [x] Y axis renders 7 labels (0,50,…,300) — confirmed via DOM tick texts.
- [x] gridlines align to the 7 labels (no leftover dense grid).
- [x] BC: unset tickSpacing → unchanged ~10-tick behavior; band/ordinal axes
      untouched (gridline change is inside the linear block only). 0 console errors.

## Outcome
"Tick Spacing" now works for the numeric value axis (dms submodule, BC). The
existing editor control is finally plumbed; authors set a step (e.g. 50) instead
of hand-fighting d3's auto ticks. Pairs with the bar-graph `barOpacity` wiring
(same GraphComponent pass-through pattern).
