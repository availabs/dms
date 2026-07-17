# graph_new BarGraph — optional time/linear x-axis (proportional spacing)

**Status:** ✅ DONE + VERIFIED (2026-07-16). `scaleTime` added to `ScaleMap`; `BarGraph.jsx` gained
an opt-in non-band positioning branch (extent domain, computed bar width from min adjacent gap,
centered `barPos`) + dynamic AxisBottom/AxisLeft type; `GraphComponent.jsx` passes
`xScale={{type: xAxis.scaleType||"band"}}`. Wired into the two Control-Room per-day charts
(`build_cr_tickets.mjs`, `scaleType:"time"`). Verified on the dev server: the tickets charts render a
continuous daily axis (Tue 07 → Wed 15) with proportional gaps; the tsmo **congestion band BarGraph
renders identically (no regression)**; the tickets table still loads (74 rows). No console errors.
(Not yet synced into transportNY's vendored `src/modules/dms` — do that with the next dms submodule sync.)
**Topic:** ui (graph_new / avl-graph BarGraph)
**Origin (Alex, 2026-07-16):** The Control-Room tickets page wants per-day "opened / day" and
"resolved / day" bar charts on a **time-proportional** x-axis — every day represented, empty days
showing as gaps sized to their duration — using only the days-with-data the live query returns (no
generated zero-rows / no separate series). Today `graph_new`'s BarGraph is hardcoded to a
categorical `scaleBand` x-axis, so it can only place days-with-data at equal spacing.

## Objective

Add an **opt-in** time/linear x-scale to `graph_new`'s BarGraph. When enabled, bars are positioned
by their real x-value on a continuous scale (so gaps between distant dates are proportional), rather
than as equal-width categories. Default behavior (band scale) is unchanged — fully backward-compatible.

## Current mechanics (recon)

- `utils/index.js` — `getScale({type, domain, range, …})` already supports `ScaleMap` types:
  `band` / `point` / `linear` / `power` / `log`. `DefaultXScale = { type: "band" }`. **Scale creation
  is already type-driven; the gap is bar positioning.**
- `BarGraph.jsx`:
  - Builds `XScale` via `getScale({ ...DefaultXScale, ...xScale, getter: d=>d[indexBy], … })`.
  - Positions bars with **band-only methods**: `bandwidth = XScale.bandwidth()`, `step = XScale.step()`,
    `outer = paddingOuter*step` (lines ~208-210); bar `left = XScale(d[indexBy])` (stacked) or
    `outer + i*step` (grouped); bar `width = bandwidth` (or `bandwidth/keys.length`).
  - `xdGetter = data.map(d => d[indexBy])` — for a linear/time scale these must be **numeric/dates**.

## Design

Add `type: "time"` to `ScaleMap` (`scaleTime` from d3-scale) alongside the existing `linear`. In
BarGraph, branch on whether the x-scale is a band scale:

- **Band (default, unchanged):** current code path (`bandwidth`/`step`).
- **Non-band (time/linear):**
  - Domain: numeric/date extent of `d[indexBy]`. For `time`, coerce index values to `Date`
    (parse the `YYYY-MM-DD` day string); for `linear`, use them as numbers.
  - Bar width: no `bandwidth()`. Compute `barWidth = clamp(minStepPx * (1 - paddingInner), MINW, MAXW)`
    where `minStepPx` = smallest pixel gap between adjacent sorted x-positions (falls back to
    `adjustedWidth / domainSpanDays` when only one point). Center bars: `left = XScale(x) - barWidth/2`.
  - Keep stacked/grouped y-logic identical; only x-position + width change.
  - AxisBottom: pass the time/linear scale through; ticks come from the scale (d3 time ticks for
    `time`), formatted via `axisBottom.format` (a date formatter for `time`).

Opt-in via the section display config: `xAxis.scaleType: "time" | "linear"` (default falls through to
`band`). Surface it in `graph_new/config.jsx` controls (an xAxis "Scale" select) so authors can pick it.

## Files

- `ui/components/graph_new/components/avl-graph/utils/index.js` — add `time: scaleTime` to `ScaleMap`.
- `ui/components/graph_new/components/avl-graph/BarGraph.jsx` — non-band positioning branch (bar width
  + centered `left`), numeric/date `xdGetter` coercion, pass scale to AxisBottom.
- `ui/components/graph_new/components/avl-graph/components/AxisBottom.jsx` — ensure it renders ticks
  for a time/linear scale (it already handles `type="linear"`; verify time tick formatting).
- `ComponentRegistry/graph_new/config.jsx` — add an `xAxis.scaleType` control (band/linear/time).
- Consumer: `themes/transportny/qa_skills/tools/builds/build_cr_tickets.mjs` — the two per-day charts
  set `xAxis.scaleType: "time"`, feed the day as the index (live grouped query, days-with-data only).

## Backward compatibility

- Default `xScale.type` stays `band`; every existing BarGraph is untouched.
- New behavior only when a section sets `xAxis.scaleType` to `time`/`linear`.

## Testing checklist

- [ ] Existing band BarGraphs (e.g. tsmo congestion) render identically (visual diff).
- [ ] A `time` BarGraph over sparse daily data: bars sit at their dates, gaps proportional, one day
      apart ≈ N× closer than N days apart; axis shows date ticks.
- [ ] Single-day and empty datasets don't throw (bar-width fallback).
- [ ] Hover tooltip + colors still work on the non-band path.
- [ ] Wire into build_cr_tickets opened/resolved charts; verify on the live tickets page (logged in)
      that the table still loads (length-safe — graphs proven innocent) and the charts span the range.
