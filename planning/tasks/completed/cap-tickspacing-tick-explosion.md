# Cap tickSpacing tick generation in AxisLeft (browser-freeze guard)

## Objective

Prevent an author-supplied `yAxis.tickSpacing` from freezing the browser when the
data's magnitude no longer matches the spacing.

## Root cause analysis

Field incident (2026-07-21, transportNY `incidents_v2` page, app `npmrdsv5`,
draft graph section 2195175): a QA edit changed the graph's y column from
`round(sum(vehicle_delay)/1e6,1) as delay_mvh` (values ~4–10) to
`round(sum(vehicle_delay),0) as delay_vh` (values ~4,300,000–9,800,000), but the
section's `display.yAxis.tickSpacing` stayed `2` — sized for the old
millions-scale.

`AxisLeft.jsx` builds explicit tick values from `tickSpacing` with an unbounded
loop over the scale domain:

```js
for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) tickValues.push(v);
```

Domain [0, 9,786,360] at step 2 → ~4.9 million tick values, each becoming a d3
tick group (line + text + gridline). The main thread locks up building/rendering
them — the edit page "hangs the computer" and the graph never paints. The
published page was unaffected only because its copy of the section still uses
the `/1e6` column, so its domain is ~[0, 10].

Verified server-side data path is NOT the problem: both draft and pub configs
produce identical uda requests (groupBy year, 8 rows) completing in ~4s against
dmsserver.availabs.org.

## Fix

Extract the spaced-tick computation into a pure helper
`buildSpacedTickValues(lo, hi, step)` in `graph_new/components/utils.js` with a
`MAX_SPACED_TICKS` cap (200). When the domain/step ratio exceeds the cap, return
`null` so AxisLeft falls back to the default approximate `ticks` count (d3 picks
~10 sensible ticks) instead of honoring a spacing that would melt the client.
Warn once via `console.warn` so authors can find and fix the stale spacing.

## Files requiring changes

- `packages/dms/src/ui/components/graph_new/components/utils.js` — new helper + cap
- `packages/dms/src/ui/components/graph_new/components/avl-graph/components/AxisLeft.jsx` — use helper
- `packages/dms/tests/axisTickSpacing.test.js` — new unit tests

## Testing checklist

- [x] helper returns exact spaced ticks for sane domain/step combos
- [x] helper returns null (fallback) when ratio exceeds cap (regression: domain 0–9.8M, step 2)
- [x] helper handles zero/negative/NaN step and non-finite domain
- [x] vitest run passes (8 files, 207 tests)

## Status

- [x] Root cause investigated and confirmed
- [x] Tests written (failing first — 7/7 fail before impl)
- [x] Fix implemented (`utils.js` helper + `AxisLeft.jsx` wiring)
- [x] Tests pass

## Follow-ups

- transportNY vendors its own dms copy (`transportNY/src/modules/dms`) — the QA
  app won't pick this up until that copy is synced.
- Immediate content unblock for incidents_v2: draft section 2195175 still has
  `yAxis.tickSpacing: 2` against raw veh-hrs data; either set spacing to
  ~2000000, clear it, or revert the column to the `/1e6` form.
