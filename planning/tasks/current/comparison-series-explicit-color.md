# Comparison-series explicit per-key color (render-path primitive)

## Status: IMPLEMENTED, live-verified 2026-07-22. Planned 2026-07-22, built same day.

All 8 files in the plan below are done. `npx babel src -d dist` rebuilt clean. Unit tests: 200/200
pass (`npx vitest run` from `src/dms/packages/dms/`), including the pre-existing
`resolveComparisonVariants` suite (unaffected — none of those fixtures carry `color`, so the new
passthrough contributes nothing to their expected output).

Live regression check (`node scripts/report_probe.mjs
"http://npmrds.localhost:5173/converted_reports/rexford_bridge_pre_post_comparison_created_on_6_14_19"`
— a real `ReportRouteList`-driven report with 3 routes and 5 graphs, Bar + Line types):
console errors 0, page errors 0, all 5 graph sections rendered SVG content with real data, bars/
lines show their normal (positional-fallback) red — expected, since no route has an explicit
`color` yet (theme-side task not built). Confirms the render-path change is fully backward
compatible before the theme-side half ships.

**Full end-to-end loop now confirmed live 2026-07-22** (after the theme side shipped): on
`claude_scratch_measure_picker`, a route's explicit `color` renders as the actual line color and
legend swatch on a real LineGraph with real ClickHouse data, and updates live when the color is
changed via the picker. See `report-route-color-assignment.md` for the full session (also caught
and fixed an infinite-render-loop bug in `RouteRow.jsx`, and a separate dormant Tailwind-compilation
bug in the shared `Colorpicker.jsx` that made the HSV picker's saturation panel render as a flat
color).

**A genuine, separate, pre-existing limitation was also confirmed live**: two routes with an
identical `name` collapse into a single series/line when both are assigned to the same graph,
because `label` (the route's display name) doubles as the ONLY series discriminator — both the
server's `__series` SQL alias and the client's `d3groups`/Set-based key collection group purely by
that string value. `colorsByKey` (keyed by the same `label`) inherits this: whichever duplicate-
named route appears later in the variant array simply overwrites the earlier one's color in the
map. This is **not** something this task's color threading caused or could have avoided — it's an
inherent property of `comparisonSeries` using the human-editable display name as the sole identity
key, predating this feature entirely. A real fix would mean splitting "series key" from "display
label" throughout `comparisonSeries` (buildUdaConfig's fan-out, the server union, every chart
wrapper's `labelForKey`-style resolution) — a nontrivial, separate task. Not fixed here; flagged for
the user, who found it live while testing and called it "kind of unrelated."

Old note (superseded by the above; kept for the historical record): "Not yet verified live (blocked
on the theme-side task landing): an actual route with an explicit `color` rendering that color and
winning over positional cycling. Re-verify once `report-route-color-assignment.md`'s theme-side work
ships — same report/graphs, expect the 3 routes to render in their assigned colors instead of
positional red."

## Origin

Library-side half of the root-level task `planning/tasks/current/report-route-color-assignment.md`
(dms-template repo) — Gap 02 of the report-page-redesign old-tool-vs-new-tool audit. That task lets
an author assign each `ReportRouteList` route a persistent identity color; this task is what makes
the chart actually render that color for the matching series, instead of the current pure positional
`colorRange[i % colorRange.length]` cycling (`avl-graph/utils/index.js`'s `getColorFunc`).

Chosen approach: **Option A** from the root task (confirmed with the user 2026-07-22) — a generic,
reusable primitive in the library, not a report-only theme-side workaround. See that task's "Open
architecture question" section for the two options that were weighed.

## Key finding that changed the original sketch

The root task's original note said to thread `color` through `buildUdaConfig.js`'s
`options.seriesVariants` (the server-bound query fan-out). **Reading the actual code shows this is
unnecessary and wrong** — `color` is a pure client-rendering concern; it never needs to reach the
query engine. `buildUdaConfig`'s `activeVariants.map(v => ({ label: v.label, filterGroups: ... }))`
(line ~1606) already constructs a brand new object for `options.seriesVariants` containing only
`label`/`filterGroups` — any extra key on the source variant (like `color`) is simply dropped there,
never sent over the wire. Good: less to touch, and no server-side surface area at all.

The actual data flow that matters is entirely client-side:

1. A route's `color` (dms-template theme, `ReportRouteList`) rides along in the variant object
   `{ label, filters, color }` published via `setActionParam` (`useGraphPublish.js`'s
   `transformReportRoutes`).
2. That list becomes a page-state action param, read back by `usePageFilterSync.js`'s
   `resolveComparisonVariants(sub.args, rawList)` — which **currently drops everything except
   `label`/`filters`** (`buildUdaConfig.js:612-643`). This is the one place `color` needs to survive.
3. The resolved list lands on `state.comparisonSeries.config` (or, for a static author-authored list,
   `state.comparisonSeries.variants`).
4. `state` is the full section state available in `ui/components/graph_new/index.jsx`'s `Graph`
   component (via `ComponentContext` → `ComponentRegistry/graph_new/index.jsx` → `AvlGraph`'s `state`
   prop) — **already accessible, no new plumbing needed to reach it.**
5. That's where a `colorsByKey` map (`{ [label]: color }`) gets computed and threaded down through
   `GraphComponent` into whichever chart-type wrapper is active.

## The render-path mechanism (confirmed by reading each chart type)

Every categorical chart's low-level `avl-graph/*.jsx` component already resolves each series' color
via `getColorFunc(colors)` → `(d, i) => colorRange[i % colorRange.length]` — **purely positional**,
with one exception already found: **`avl-graph/LineGraph.jsx:442`** —
`const color = rest.color || colorFunc(d, i);` — the low-level Line chart ALREADY supports an
explicit per-series `color` override, it's just never populated in categorize/comparison-series mode
today (`ui/components/graph_new/components/LineGraph.jsx`'s `idColumns.length` branch, ~line 63,
builds `line = { id, data: [], interpolation }` with no `color` field — contrast with the
series-per-column branch just below it, which already does `if (yc.color) line.color = yc.color;`
line 102, fed by an existing author-facing "Series Color" text control,
`ComponentRegistry/graph_new/config.jsx:242-246` — but that control only applies to
`target: yAxis` + `graphType: LineGraph`, not categorize mode).

For Bar/Pie/Treemap, `colorFunc` is called with a `key` argument already (the series' actual
identity — a categorize column's raw value, e.g. the route label) that today is accepted but
ignored:
- `avl-graph/BarGraph.jsx:336,387` — `colorFunc(value, ii, key, d)`
- `avl-graph/PieGraph.jsx:234` — `colorFunc(value, ii, key, d)`
- `avl-graph/TreemapGraph.jsx:458` — `colorFunc(n.data[1], i, n.data[0], n)` (key = `n.data[0]`)

So the fix is: make `getColorFunc` accept an optional keyed-color map and prefer it by `key`,
falling back to positional cycling only when the key has no explicit color. This is graph-type
generic — nothing here is comparison-series-specific; comparisonSeries is just this round's one
*source* of `colorsByKey` values (see "Possible future extension" below).

### Explicitly out of scope this round

- **GridGraph** — colors grid cells *by value* (`colors.byValue`/ColorBrewer scheme), a fundamentally
  different, already-shipped system (Gap 02b in the root task, "isColorfull" graph types). Per-route
  identity color is conceptually the wrong system for GridGraph; not touched.
- **SunburstGraph** — `colorFunc(n, i)` call (`avl-graph/SunburstGraph.jsx:501`) has no `key`
  argument at all; it's hierarchy-node coloring, not a flat keyed-series concept. Extending it would
  need real design work disproportionate to this task's actual need (report route comparisons don't
  use Sunburst). Left untouched.
- **A general "assign a color per value of any plain categorize column" authoring UI** (unrelated to
  comparisonSeries — e.g. "Truck is always red, Car is always blue" on an ordinary dashboard bar
  graph). The render-path primitive built here (`getColorFunc`'s keyed lookup + the Legend fix) is
  fully generic and would support this for free — only the *authoring* surface is missing (no
  existing DMS control type lets an author assign colors to runtime-discovered distinct values; it'd
  need a new control comparable in shape to the per-route swatch list this task's sibling
  (`report-route-color-assignment.md`) is building, generalized). Nobody has asked for this; per the
  don't-build-for-hypothetical-future-requirements principle, it's noted here as a natural follow-on,
  not built speculatively.

## Plan

### 1. `patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`

- **Extract a shared precedence helper** (DRY — this logic currently lives inline in
  `buildUdaConfig`'s `effectiveVariants` computation, ~line 1156-1159, and needs to be reused
  identically by the render path):

  ```js
  export const getEffectiveComparisonVariants = (comparisonSeries) =>
    comparisonSeries?.config !== undefined
      ? comparisonSeries.config
      : comparisonSeries?.variants || [];
  ```

  Then have `buildUdaConfig`'s existing `effectiveVariants` line call this helper instead of
  inlining the ternary (behavior-identical refactor).

- **`resolveComparisonVariants(subArgs, rawList)`** (~line 612-643) — pass through `color` when
  present on the raw entry, alongside the existing `label`/`filters` extraction. The entry shape from
  `ReportRouteList` is a flat `{ label, filters, color }` object (not nested under `valueKey`), so:

  ```js
  return label && filters ? { label, filters, ...(entryVal?.color ? { color: entryVal.color } : {}) } : null;
  ```

  (`entryVal` is the already-unwrapped variable in that function — reuse it, don't re-derive.)
  This is additive/BC: any existing dynamic subscriber whose entries don't carry `color` is
  unaffected (map is simply absent downstream).

### 2. `ui/components/graph_new/index.jsx` (the `Graph`/`AvlGraph` default export)

- Import `getEffectiveComparisonVariants` from `buildUdaConfig.js`.
- Destructure `comparisonSeries` from `state` (currently only `columns, data, display` are pulled
  out at ~line 76-78 — `comparisonSeries` is already present on the same `state` object, confirmed via
  `dataWrapper/index.jsx:273,306`, just not read here yet).
- Compute:

  ```js
  const colorsByKey = React.useMemo(() => {
    const variants = getEffectiveComparisonVariants(comparisonSeries);
    const map = {};
    for (const v of variants || []) {
      if (v?.label && v?.color) map[v.label] = v.color;
    }
    return Object.keys(map).length ? map : undefined;
  }, [comparisonSeries]);
  ```

- Pass `colorsByKey={colorsByKey}` as a new prop into `<GraphComponent ... />`.

### 3. `ui/components/graph_new/GraphComponent.jsx`

- Destructure `colorsByKey` from `props` (default `undefined`).
- Forward it to the inner graph-type-specific `<GraphComponent ... colorsByKey={colorsByKey} />`
  (~line 119), alongside the existing `colors={graphFormat.colors}`.

### 4. Chart wrapper files — `ui/components/graph_new/components/{BarGraph,PieGraph,TreemapGraph}.jsx`

For each:
- Accept `props.colorsByKey`.
- Forward it to the low-level avl-graph component: `<BarGraph {...props} colorsByKey={props.colorsByKey} .../>` (same pattern for Pie/Treemap).
- Add it to the `legend` memo object (e.g. `colorsByKey: props.colorsByKey`) so `<Legend {...legend} .../>` receives it (`Legend`'s outer wrapper already spreads all extra props through to the inner categorical/linear variant — confirmed, `Legend.jsx:278`).

### 5. `ui/components/graph_new/components/LineGraph.jsx` (wrapper)

- Accept `props.colorsByKey`.
- In the `idColumns.length` (categorize/comparison-series) branch, right after constructing `line`
  (~line 63): `if (colorsByKey?.[id]) line.color = colorsByKey[id];` — reuses the low-level chart's
  existing `rest.color ||` fallback (`avl-graph/LineGraph.jsx:442`), no low-level Line change needed
  at all.
- Add `colorsByKey: props.colorsByKey` to the `legend` memo, same as the other wrappers.

### 6. `ui/components/graph_new/components/avl-graph/utils/index.js` — `getColorFunc`

Extend the signature to accept a second, optional argument:

```js
export const getColorFunc = (colors, colorsByKey) => {
  if (typeof colors === "function") return colors;

  let colorRange = [...DEFAULT_COLORS];
  if (typeof colors === "string") {
    const [k1, k2, reverse = false] = colors.split("-");
    colorRange = getColorRange(k1, k2);
    reverse && colorRange.reverse();
  } else if (Array.isArray(colors) && colors.length) {
    colorRange = [...colors];
  }

  return (d, i, key) => {
    if (colorsByKey && key != null && colorsByKey[key] != null) return colorsByKey[key];
    return colorRange[i % colorRange.length];
  };
};
```

Fully backward compatible — every existing call site that doesn't pass a second argument behaves
byte-identically (`colorsByKey` is `undefined`, the new branch's condition is always false).

### 7. `ui/components/graph_new/components/avl-graph/{BarGraph,PieGraph,TreemapGraph}.jsx` (low-level)

- Accept `props.colorsByKey`.
- Change `getColorFunc(colors)` → `getColorFunc(colors, props.colorsByKey)` at each call site
  (BarGraph.jsx:180, PieGraph.jsx:222, TreemapGraph.jsx:188).

### 8. `ui/components/graph_new/components/avl-graph/components/Legend.jsx`

- `VerticalCategoricalLegend` currently zips `categories[i]` ↔ `colors[i % l]` purely positionally
  (line 66-71) — same fragility as the chart itself, and independently wrong even after step 6 fixes
  the chart, since Legend never even sees `colorsByKey` today.
- Add a `colorsByKey = {}` prop; change `categoriesAndColors`:

  ```js
  const categoriesAndColors = React.useMemo(() => {
    const l = colors.length;
    return categories.map((cat, i) => [cat, colorsByKey[cat] ?? colors[i % l]]).reverse();
  }, [categories, colors, colorsByKey]);
  ```

- Confirmed the `key`/category strings match `colorsByKey`'s keys with no relabeling in the
  categorize/comparison-series path for all three wired chart types: BarGraph's `labelForKey` only
  rewrites Y-axis *column* labels (`dataColumns.find(...)`), which never matches a categorize value,
  so it passes categorize values through unchanged (confirmed by reading `BarGraph.jsx:188-191`);
  Pie's `categories: dataFromProps.keys` and Line's `categories: dataFromProps.map(l => l.id)` are
  raw values with no transform at all.

## Why this makes cross-graph, order-independent identity color work

Every graph on a report independently computes its own `colorsByKey` from its OWN
`state.comparisonSeries` — but every graph's comparison-series list was populated from the SAME
source (`route.color`, persisted once on `ReportRouteList`'s route object, copied into every
assigned graph's own published variant list by `transformReportRoutes`). So:
- The same route resolves to the identical color on every graph it's assigned to (same source value,
  looked up by label, not position).
- Removing/reordering/adding routes on one graph never shifts another route's color, because lookup
  is by `label` (the route's stable name), not by array index. The positional fallback
  (`colorRange[i % length]`) is only ever exercised for the legacy case of a pre-existing route that
  has no explicit `color` field yet (before the sibling task's auto-assignment ships) — once every
  route always carries a `color` from creation onward, the fallback path is effectively dead code
  for new data, and only matters as a "doesn't crash" guarantee for old rows.

## Possible future extension (not this round)

The exact same `getColorFunc`/Legend primitive built here would support a general "assign a color to
each distinct value of any plain categorize column" feature (unrelated to comparisonSeries) — the
render path doesn't care where `colorsByKey` came from. What's missing is purely an authoring
surface: no existing DMS control type lets an author assign colors against runtime-discovered
distinct values. If this is ever wanted, it's a new control (comparable in shape to the per-route
swatch list in the sibling task) that merges its own map into the same `colorsByKey` computed in
`ui/components/graph_new/index.jsx`.

## Files requiring changes

| File | Change |
|---|---|
| `patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` | Extract `getEffectiveComparisonVariants` helper (reuse in `buildUdaConfig`); `resolveComparisonVariants` passes through `color` |
| `ui/components/graph_new/index.jsx` | Compute `colorsByKey` from `state.comparisonSeries`, pass to `GraphComponent` |
| `ui/components/graph_new/GraphComponent.jsx` | Forward `colorsByKey` prop to the chart-type wrapper |
| `ui/components/graph_new/components/BarGraph.jsx` | Forward `colorsByKey` to low-level chart + legend |
| `ui/components/graph_new/components/PieGraph.jsx` | Same |
| `ui/components/graph_new/components/TreemapGraph.jsx` | Same |
| `ui/components/graph_new/components/LineGraph.jsx` | Set `line.color` from `colorsByKey` in categorize-mode branch; forward to legend |
| `ui/components/graph_new/components/avl-graph/utils/index.js` | `getColorFunc(colors, colorsByKey)` — keyed lookup wins over positional |
| `ui/components/graph_new/components/avl-graph/BarGraph.jsx` | Pass `props.colorsByKey` into `getColorFunc` |
| `ui/components/graph_new/components/avl-graph/PieGraph.jsx` | Same |
| `ui/components/graph_new/components/avl-graph/TreemapGraph.jsx` | Same |
| `ui/components/graph_new/components/avl-graph/components/Legend.jsx` | `VerticalCategoricalLegend` prefers `colorsByKey[cat]` over positional |
| `ui/components/Colorpicker.jsx` *(bugfix, found live 2026-07-22)* | Saturation/value gradient overlay moved to inline `backgroundImage` — the Tailwind arbitrary-value class for it silently compiled to no CSS, leaving a flat color square. Dormant since both pre-existing callers pass `showColorPicker={false}`; first exercised by `RouteRow.jsx`'s picker |

## Testing checklist

- [x] LineGraph: two DISTINCT-named routes with explicit colors on a comparison-series-driven graph
      render those exact colors (line + legend swatch match) — live-verified 2026-07-22 on
      `claude_scratch_measure_picker`; changing a route's color live-updates its line/legend color
- [ ] BarGraph / PieGraph / TreemapGraph: same — not yet tested live (LineGraph proven; same
      `colorsByKey`/`getColorFunc` code path, low risk)
- [ ] Removing one colored route from a graph does not change another route's rendered color — not
      yet explicitly tested (implied by keyed-not-positional lookup, but not directly observed)
- [x] Two routes sharing the IDENTICAL name on the same graph collapse into one series/one legend
      entry (last one's color wins) — confirmed live 2026-07-22; this is a pre-existing
      `comparisonSeries` limitation (label doubles as the only series discriminator), not something
      this task's color threading caused — see the note above. Not fixed, flagged as a follow-up.
- [x] A route with no explicit `color` falls back to positional cycling without crashing —
      live-verified 2026-07-22 (rexford_bridge report, 3 routes, all render positional red, no errors)
- [x] A non-report AVL Graph section with a plain categorize column (no comparisonSeries at all)
      renders unchanged — `colorsByKey` is `undefined`, byte-identical to today — covered by the
      200/200 unit test pass + the live probe's zero console/page errors
- [ ] GridGraph and SunburstGraph sections unaffected (untouched code paths) — not explicitly
      probed live; code paths for these two types were not touched at all, low risk
- [x] `colors.scheme`/`colors.reverse`/`colors.byValue` (existing, unrelated) still work unchanged —
      live-verified (rexford_bridge report's bar graphs use scheme/positional coloring unchanged)

## Cross-references

- `planning/tasks/current/report-route-color-assignment.md` (dms-template repo root) — the
  originating task; owns the theme-side route schema, picker UI, and publish-time threading
- `patterns/page/components/sections/components/dataWrapper/README.md` / comparison-series docs —
  general comparisonSeries mechanism background
