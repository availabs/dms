# Render the difference between two comparison-series routes (diverging bar or grid)

**Outcome**: an AVL Graph section that shows `Main − Compare` between two routes/date-windows
as a diverging bar chart (bars above/below zero, per time bucket) or a per-TMC difference
grid — the old NPMRDS tool's "Route Difference Graph" / "TMC Difference Grid", on native DMS
primitives. Built and live-verified 2026-07-16 (round 52 of the old-reports conversion; the
converted `report_584` / `report_354` / `report_1037` pages are working examples).

## The one new state key

Take any comparison-series graph state (the ordinary shape: a value column, a grouped x-axis
column, the `__series` discriminator, `comparisonSeries.enabled`) and add:

```json
"comparisonSeries": {
  "enabled": true,
  "seriesKey": "__series",
  "combine": { "mode": "difference" }
}
```

With `combine` present, the server no longer UNION-ALLs the per-route arms side by side.
Instead the FIRST resolved variant (the anchor — "Main"; same first-in-the-route-list
convention `__ANCHOR__` and Route Compare use) is INNER JOINed to every other arm **on the
query's group-by columns**, and every value column comes back as `anchor − variant` under its
original alias. Consequences worth knowing:

- **The group-by columns ARE the alignment**: group by `epoch` → one difference per epoch
  (diverging bar); group by `tmc` + `epoch` → one difference per cell (difference grid). No
  graph-type-specific configuration.
- **INNER JOIN semantics**: buckets missing on either side are dropped, not zero-filled
  (matches the old tool).
- Fewer than 2 resolved routes → no rows (renders the empty placeholder, no error).
- More than 2 routes → one "vs Main" difference series per extra route, labeled by that
  route's own label.
- `"invert": true` flips the subtraction — use when the route you want as Main sits LATER in
  the page's route list than its Compare (variant order follows the route list; the converter
  bakes this automatically from old reports' explicit Main/Compare picks).
- **ClickHouse-backed sources only** — the Postgres fan-out throws a loud, descriptive error
  rather than silently rendering two stacked raw series.

## Rendering the signed values

Two platform features (also round 52) make the output legible:

1. **Diverging bars are automatic** — BarGraph's value axis always spans zero now, so
   negative values extend below the baseline. Nothing to configure.
2. **Zero-centered colors** — turn on "Color by Value" + **"Zero-Centered Colors"** in the
   Bar Graph Layout menu (`display.colors.byValue` + `display.colors.byValueSymmetric`), or
   just "Zero-Centered Colors" in the Grid Graph Layout menu. This pins zero to the middle
   palette color (±max(|min|, |max|) domain) so "no change" reads neutral. Use a diverging
   palette (e.g. RdYlGn); reverse it for measures where bigger = worse (travel time, delay,
   CO₂) — the converter's `REVERSE_COLORS_MEASURES` list is the reference.

## Gotchas (each cost real debugging)

- The `__series` column must stay in the state's columns for BAR shapes (it's the series
  label source); grids that categorize by `tmc` instead don't need it — the server still
  labels rows from the compare arm.
- The difference is computed AFTER each arm evaluates its ordinary expression — so any
  already-proven measure expression (self-aggregating map-combinator speed, `fn: "sum"`
  delay, joined CO₂) works unchanged. Don't write "diff expressions".
- A calculated group-by column (e.g. a 15-minute `intDiv(ds.epoch, 3)` bucket) is matched to
  its attribute by EXPRESSION, and joined by its alias — keep the groupBy entry (refName) and
  the column's expression text identical, which the normal column plumbing already guarantees.
- Length/`numRows` for a difference section is a deliberate over-count (sum of arm counts);
  clients may request more rows than return. Harmless — never truncates.

## References

- Server: `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` (the `diffMode`
  branch), tests in `tests/test-uda.js#testClickHouseSeriesCombineDifference`.
- Client forwarding: `dataWrapper/buildUdaConfig.js` (search `seriesCombine`).
- Rendering: `graph_new/components/avl-graph/BarGraph.jsx` (zero baseline),
  `BarGraph.jsx`/`GridGraph.jsx` wrappers (`byValueSymmetric`).
- Task trail: `planning/tasks/completed/comparison-series-difference-mode.md` and the
  dms-template old-reports task file's round-52 entries.
