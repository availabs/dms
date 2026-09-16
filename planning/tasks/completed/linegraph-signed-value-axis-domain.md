# LineGraph value axis never spanned zero (difference-mode clipping)

**Status: COMPLETE — fixed, tested, and live-verified 2026-09-16.**

## Objective

A line graph switched to **difference mode** drew the negative half of its line
*outside* the section: the Y axis started at 0 no matter how far below zero the data
went. Make the avl-graph LineGraph's value axis span the data it plots.

## Reported repro (Ryan, 2026-09-16)

1. Add the same route to a report twice, the second offset by 12 months (same span).
2. Add both to a graph — it defaults to two series. Fine.
3. Switch the graph to **Difference** mode → Y-axis scale is way off, the line is drawn
   outside the section bounds.

Also reproduced by adding a fresh graph via the ReportRouteList and choosing difference
mode. Page: `http://www.localhost:5173/npmrds/edit/reports/menands_test_copy`.

The offset and the duplicate route do **not** matter — they are just a convenient way to
make the difference series straddle zero. Any signed series reproduces it.

## Root cause

`src/ui/components/graph_new/components/avl-graph/LineGraph.jsx` built its value-axis
domain with a floor pinned at `aLeft.min` and a ceiling that only ever took a `Math.max`:

```js
yDomain = data.reduce((a, c) => {
  const y = c.data.reduce((a, c) => Math.max(a, +c.y), 0);   // max only, seeded at 0
  if (!isNaN(y)) {
    return [aLeft.min, Math.max(y, get(a, 1, 0))];           // floor === aLeft.min, always
  }
  return a;
}, []);
```

`aLeft.min` comes from `DefaultAxis.min = 0` and **nothing ever overrides it** — the
`yAxis` payload `GraphComponent` builds (`GraphComponent.jsx:325-343`) has no `min` key at
all. So the floor was hard 0 for every line graph, and a difference series (signed by
construction: `Main − Compare`) had everything below zero rendered below the plot area.

This is **not** a Measure Picker gap. The picker never writes an axis floor; the domain is
computed at render time from the data, and the computation simply could not produce a
negative floor. The same defect was present on the secondary (right) axis.

BarGraph already got this right in round 52 — `BarGraph.jsx:256` returns
`[Math.min(0, lo), Math.max(0, hi)]` with the comment "Always spans zero". LineGraph was
never given the same treatment, which is why difference **bar** charts looked fine and
difference **line** charts did not.

## Changes

1. **`src/ui/components/graph_new/components/avl-graph/utils/index.js`** — new exported
   pure helper `buildValueDomain(series, axisMin)`. Ceiling unchanged (`max`, never below
   zero); floor drops below `axisMin` only when a series actually goes there. Preserves the
   long-standing "a series containing a non-numeric y is skipped whole" behavior
   deliberately, so this change is purely about the floor.
2. **`.../avl-graph/LineGraph.jsx`** — both the left-axis (`yDomain`) and secondary-axis
   (`secDomain`) inline reducers now call `buildValueDomain`. Import added.

Author-set `yAxis.domainMin` / `domainMax` / `domainMin: "auto"` still apply afterwards and
still win, unchanged.

## Back-compat

For all-positive data the new domain is **identical** to the old one (floor `axisMin`,
ceiling `max(0, dataMax)`). `tests/lineGraphValueDomain.test.js` keeps the pre-fix
implementation verbatim as an oracle and asserts equality over fixed cases plus 200
randomized all-positive series.

## Testing

- `npx vitest run tests/lineGraphValueDomain.test.js` — 19 pass, incl. the randomized
  back-compat oracle.
- 8 neighboring graph suites (`axisTickSpacing`, `graphColorScale`, `avlGraphThemeDefaults`,
  `graphComponentThemeWiring`, `graphComponentLegendTokens`, `legendThemeTokens`,
  `hoverCompThemeTokens`, `hoverCompLegacyMarkup`) — 98 pass.
- Golden corpus (`node scripts/npmrds-reports/probe_corpus.mjs`) — all entries match
  baseline, including `golden_corpus_linegraph`.
- **New corpus entry `golden_corpus_difference_linegraph`** (9th), spec-built and published at
  `reports/golden_corpus_difference_line_graph`. The existing `golden_corpus_linegraph` entry
  covers `avlGraph.LineGraph` but its series is all-positive, so it could never have caught
  this — a `covers` tag on the code path isn't enough when the bug only fires on a different
  shape of data through that path. The new entry reproduces the reported repro shape (one
  route, two date windows, subtracted) because a same-route year-over-year speed difference at
  5-minute grain reliably straddles zero. At capture: ticks `−25 … 30`, line bbox
  `top 0 / bottom 230` in a 250px plot, no console/page/SQL errors.
- Live on `reports/menands_test_copy` (edit mode, both difference graphs):
  - before: axis `0 … 20`, line bbox ran past the 250px plot area.
  - after: axis `−15 −10 −5 0 5 10 15 20`, line bbox `top 0 / bottom 230` inside `plotH 250`,
    `linesBelowPlot: 0`, `linesAbovePlot: 0`.
  - in-component instrumentation confirmed the mechanism: `yDomain` is now
    `[-17.949, 21.691]` for the 5-minute speed graph and `[-1.336, 0.960]` for the
    15-minute travel-time graph — exactly each series' data range, with
    `hasYScaleProp: false` and no author `domainMin`/`domainMax` in play.

## Verify URL

`http://www.localhost:5173/npmrds/edit/reports/menands_test_copy` — both difference graphs
should show negative Y ticks and keep the whole line inside the section.

## Docs updated

- `skills/difference-graphs.md` — line graphs now span the signed range too; the Unicode-minus
  gotcha; `buildValueDomain` added to the rendering references.
- `skills/traversing-report-pages.md` — new section on reading a graph's Y domain back off the
  axis (the Unicode-minus trap) and checking line containment with `getBBox()` in SVG user units.
- `skills/regression-testing-npmrds-reports.md` — corrected the stale "existing 5 entries"
  count, and added the "a `covers` tag isn't enough when the bug needs a different data shape"
  lesson with this as the worked example.

## Gotcha found while verifying (folded into traversing-report-pages.md)

`AxisLeft` renders tick labels with a **Unicode minus sign** (U+2212 `−`), not an ASCII
hyphen. `Number("−15")` is `NaN`, so any probe that parses axis tick text to recover the
rendered domain silently drops every negative tick and reports a floor of 0 — which looks
exactly like this bug still being present. Normalize `−` to `-` before parsing.
