# LineGraph renders nothing at "day"/"weekday"/"month" resolution

## Status: DONE, fixed and live-verified 2026-08-03

## Objective

A `LineGraph` AVL Graph section rendered a correct axis (real tick labels, correct
domain) but **no visible line at all** whenever its resolution was `day`,
`weekday`, or `month`. Bar Graph at the same resolution, and LineGraph at
`5-minutes`/`hour` (or any numeric-bucket resolution), always worked fine.

Found while building the Dynamic Reports mechanism
(`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md` in the site root,
not this submodule) — Ryan suspected the bug was specific to the Report Page
template or the new Dynamic Reports wiring. It wasn't: reproduced on a brand-new
page created via the plain UI "+ Add Page → Your Templates → Report Page" flow,
with a normal (non-dynamic) concrete route added through the ordinary "+ Add
Route" catalog flow, using the stock Measure Picker to switch Graph
Type/Measure/Resolution — no Dynamic Reports code, no custom script, involved at
all. A pre-existing, general AVL Graph bug.

## Root cause

`avl-graph/LineGraph.jsx`'s line/area/secondary generators all gate on:

```js
.defined(d => !strictNaN(d.x))
```

`strictNaN` (`avl-graph/utils/index.js:116`): `v => (v === null) || (v === "") || isNaN(v)`.

`isNaN(v)` coerces `v` to `Number` first. For a numeric-bucket x (`0`, `1`, `2`,
...) this is fine. But `day`/`weekday`/`month` resolution produces **date
strings** as x (e.g. `"2025-01-01"`) — `isNaN("2025-01-01")` is `true` (the
string isn't numeric), so `strictNaN` returns `true`, so `.defined()` excludes
**every point in the series**. D3's line generator returns an empty path when
zero points are defined — hence a real axis (built from the same `xDomain`, but
`AxisBottom` never routes through `.defined()`) with an invisible line.

Confirmed live via temporary instrumentation: `XScale(d.x)`/`YScale(d.y)`
resolved to correct, finite pixel positions for every one of the 59 real data
points — the scale and data were always correct. The generated `line` path
string itself was `undefined` specifically when `dataLen` matched the day-string
series (59 points) and present/correct for numeric-x series (24-hour, 286-bucket
tests).

## Fix

Replaced the three `.defined(d => !strictNaN(d.x))` call sites (line generator,
area generator, secondary-axis line generator) with a presence check that
doesn't require numeric-coercibility:

```js
const isDefinedX = d => d.x !== null && d.x !== undefined && d.x !== "";
```

`strictNaN` itself is untouched — it's correctly used elsewhere in the same file
or callers who explicitly pre-coerce with `+value` first (e.g. the numeric-vs-
lexicographic sort comparator), where "does this coerce to a number" really is
the right question. The bug was specific to reusing that same numeric-coercion
check for "is this x-value present," which categorical/date x-domains fail by
construction, not because anything is actually missing.

## Verification

Live on a fresh, un-scripted page (`page_13` in the dev DB, `npmrdsv5`+`dev2`) —
Line Graph, one real route, cycled through every resolution:

- **Before fix**: `day`, `weekday`, `month` → axis renders, zero visible line.
  `5 minutes`/`hour` → fine (numeric x).
- **After fix**: all six resolutions (`5 minutes`, `15 minutes`, `hour`, `day`,
  `weekday`, `month`) render a visible line, for both `Speed (mph)` and
  `Travel Time (min)` measures — including the exact combination
  (`Line Graph` / `Travel Time (min)` / `Day`) that was originally reported broken
  on the site-root Dynamic Reports demo page.
- Bar Graph (any resolution) was never affected — confirmed unaffected before
  and after, consistent with the root cause being specific to the line/area path
  generator's `.defined()` predicate.

## Files changed

- `packages/dms/src/ui/components/graph_new/components/avl-graph/LineGraph.jsx`
  — extracted `isDefinedX`, used in place of `!strictNaN(d.x)` at all three
  `.defined()` call sites.
