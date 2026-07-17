# Comparison-series "difference" combine mode

**Status: COMPLETED 2026-07-16** — built, unit-tested (93/93 uda), live end-to-end verified
bit-exact on converted pages. Author-facing how-to extracted to
[skills/difference-graphs.md](../../skills/difference-graphs.md).

**Companion library change shipped the same day (same arc, separate concern): diverging
BarGraph + zero-centered value colors** — see "Companion: diverging bar rendering" below.

Isolated library task split out of the old-reports-conversion work (dms-template repo,
`planning/tasks/current/old-reports-conversion.md`, round 52) per the ship-shared-platform-
changes-isolated rule. Full design context and corpus sizing:
`dms-template/scratchpad/npmrds-sub/old-reports/route_difference_scope.md` (user endorsed the
mechanism and all open questions 2026-07-16).

## Objective

Let a comparison-series section render the **difference between series** instead of the series
side by side: the first resolved variant (the "anchor"/"Main" — same convention `__ANCHOR__`
already uses) is joined to each other variant on the query's group-by columns, and the value
columns are returned as `anchor - variant` (old NPMRDS tool's "Main minus Compare"). This is
the platform half of converting the old tool's Route Difference Graph and TMC Difference Grid.

## Scope

- **In**: ClickHouse query set (`query_sets/clickhouse.js`) difference mode in the
  comparison-series fan-out; client forwarding of `state.comparisonSeries.combine` →
  `options.seriesCombine` (`buildUdaConfig.js`); loud Postgres-path refusal (same pattern as
  `__ANCHOR__`); unit tests.
- **Out**: rendering changes (diverging BarGraph — its own isolated change), converter work
  (dms-template repo), Postgres implementation (every corpus measure is ClickHouse-only),
  `simpleFilterLength` exactness (see Design notes).

## Design (endorsed)

- `options.seriesCombine = { mode: "difference", invert?: true }`, read from
  `state.comparisonSeries.combine`.
- In the CH fan-out: with N resolved variants, arms are built exactly as today; instead of
  UNION ALL of all arms, emit for each non-anchor arm K:
  `SELECT <group-by cols from variant side>, (anchor.v - variant.v) as v …,
   variant-label as __series
   FROM (armK) AS compare INNER JOIN (arm0) AS anchor USING (<group-by output names>)`
  then UNION ALL those joined selects (N=2 → single select, no union), then the existing
  ORDER BY / LIMIT / OFFSET wrapper unchanged.
- INNER JOIN = old tool's buckets-present-in-both semantics, per x-bucket for bar graphs and
  per (tmc, bucket) for grids — the group-by columns ARE the alignment keys, no
  graph-type-specific code.
- `invert: true` → `(variant.v - anchor.v)`. Baked per-section by the converter when the old
  report's Main sits later in the shared route-list order than its Compare (the published
  variant order follows the page's route list; reversed explicit pairs are real — report 12).
- Fewer than 2 resolved variants → return no rows (old tool renders empty below 2 routes).
- More than 2 → one difference series per non-anchor variant, labeled by that variant's own
  label (user-endorsed generalization; the converter itself always assigns exactly 2).
- Value columns = projected attributes that are neither group-by columns nor the series-key
  column; all are diffed under their original alias so the response shape is identical to a
  normal fan-out (graphs render unchanged). Non-numeric value columns would be a CH type
  error — request-scoped, acceptable; don't pre-guard.
- `simpleFilterLength` stays the plain union count — a safe OVER-count (client may request
  more rows than the join returns; never truncates). Comment it in code.

## Files — ALL DONE (2026-07-16)

- [x] `packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — difference branch in the
  seriesVariants fan-out (`diffMode`), plus `seriesCombine` in the options destructure and a
  `simpleFilterLength` comment documenting the safe over-count. **Design note (deviation from
  the plan's "USING" sketch)**: the join uses an explicit `ON compare.k = anchor.k AND …`
  clause, not `USING` (avoids CH USING column-coalescing semantics); join keys are classified
  by EXPRESSION match against the group-by list (client refName == expression part of reqName),
  not response-name match, which a calculated group-by would defeat; group-bys no attribute
  covers get synthetic `__gb_N` aliases so the join key name is deterministic; zero group-bys
  (ungrouped aggregate arms) → CROSS JOIN scalar difference (CH ON only accepts
  equi-conditions).
- [x] `packages/dms-server/src/routes/uda/query_sets/postgres.js` — loud refusal when
  `seriesCombine` reaches the PG/SQLite fan-out (mirrors the `__ANCHOR__` refusal).
- [x] `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — forwards `state.comparisonSeries.combine` → `options.seriesCombine` (object-typed only,
  only when comparison series is active).
- [x] Tests: `tests/test-uda.js#testClickHouseSeriesCombineDifference` — 10 assertions:
  2-arm diff SQL shape, invert, 3-arm (two joined selects unioned, shared anchor), <2-arm
  empty-without-querying, grid 2-key join, calculated group-by via expression match (and no
  double `__gb_N`), unprojected group-by synthetic alias, CROSS JOIN scalar case, plain
  fan-out untouched, PG loud refusal.

## Testing checklist

- [x] New unit tests pass (93/93 uda; core `npm test` suites green, 2026-07-16).
- [x] Live smoke against real ClickHouse through the local dms-server falcor endpoint
  (view 982, TMC `120+05858`, two 2-day windows grouped by epoch): per-epoch signed
  differences returned; two values ground-truthed bit-identical against hand-built CH arm
  subtractions (epoch 0 → `40.795000000000016`, epoch 198 → `-15.910000000000025`);
  `chprocs` clean.
- [x] Live end-to-end through real SECTIONS (client forwarding exercised) — DONE same day
  (dms-template round 52): converted report_584 (page 2193032, Route Difference bar with
  invert=true + TMC Difference Grid) and report_354 (page 2193066); 3 per-epoch bar values +
  3 per-(tmc, epoch) grid cells ground-truthed BIT-EXACT against hand-built two-arm ClickHouse
  subtractions; 268/288 epochs returned (inner join drops either-side-missing buckets as
  designed); 0 console/page errors, no stray CH queries.

## Companion: diverging bar rendering (same arc, separate concern, shipped 2026-07-16)

The difference values are signed; the graph_new BarGraph clamped its y-domain to `[0, max]`
so negative bars rendered zero-height. Companion changes (all in `packages/dms`):

- `src/ui/components/graph_new/components/avl-graph/BarGraph.jsx` — value-axis domain always
  spans zero (`[min(0,lo), max(0,hi)]`; stacked mode tracks per-bar positive and negative
  sums separately); stacked + grouped geometry measures every segment from the `YScale(0)`
  baseline in both orientations (positives stack away from zero upward/right, negatives
  downward/left). Byte-identical output for all-positive data — regression-probed live on
  report_1071's bar-heavy page.
- `src/ui/components/graph_new/components/BarGraph.jsx` + `GridGraph.jsx` — new
  `colors.byValueSymmetric`: centers the value color scale on zero (±max(|min|, |max|)),
  so "no change" lands on the middle color (old tool's `scaleQuantize([-max, +max])` parity).
- `.../ComponentRegistry/graph_new/config.jsx` — author-facing "Zero-Centered Colors"
  toggles (Bar Graph Layout group + a new Grid Graph Layout group).
- Verified: 151/151 client vitest (`graphColorScale`/`buildUdaConfig` suites); live diverging
  render + zero-centered legends confirmed on converted report_584.
