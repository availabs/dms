# Task: Fix BarGraph "Color by Value" + named Scheme producing invalid/flat colors

## Objective

`graph_new`'s Bar Graph "Color by Value" toggle (`colors.byValue`, added in the
graph-color-schemes work) is supposed to color each bar by its own magnitude on a continuous
gradient — the single-series "more delay = darker" heatmap-bar pattern. When an author leaves
the Colors → Scheme picker untouched it works (default baked 20-color palette). When an author
explicitly picks a named Scheme, it silently breaks for a single-series/no-`categorize` chart —
live-confirmed by the user 2026-07-22 on a real per-route Speed bar chart ("changes colors
sometimes but definitely doesn't completely work").

## Root cause

`BarGraph.jsx`'s color `useMemo` resolves scheme-type colors with:

```js
colors = getColorRange(props.colors.scheme, dataFromProps.keys?.length);
```

`dataFromProps.keys.length` is **1** for the single-series case `byValue` targets (no
`categorize` column, one `yAxis` data column). `getColorRange(scheme, 1)`
(`colorSchemeUnifier.js:119`) branches by scheme kind:

- The 11 pure-categorical schemes (accent/category10/dark2/observable10/paired/pastel1/
  pastel2/set1/set2/set3/tableau10) aren't in `quantitativeSchemes`, so they fall through to
  the `ordinalSchemes` branch, whose entries are raw arrays — sliced to length 1, this returns
  one valid (but flat) color. This is the "changes colors sometimes" the user saw.
- Every other scheme (all sequential/diverging/cyclical ones — Viridis, Turbo, RdBu, Spectral,
  …) *is* in `quantitativeSchemes`, and `prefer: "quantitative"` is the default, so it takes
  `quantitativeRange(scheme, 1)` → `quantize(interpolator, 1)`
  (`node_modules/d3-interpolate/src/quantize.js:3`): `interpolator(i / (n - 1))` with `n = 1`
  is `interpolator(0/0)` = `interpolator(NaN)`. Every d3-scale-chromatic interpolator resolves
  through `d3-interpolate`'s `basis()` spline, which indexes its color array with
  `Math.floor(t * n)` — `NaN` propagates straight through and the function returns the literal
  string `"rgb(NaN, NaN, NaN)"`. That's invalid CSS; the browser drops the `fill` attribute and
  the bar renders with the SVG default (effectively black/unstyled) — the "doesn't completely
  work" part, identical for every scheme in this bucket since the failure doesn't depend on
  which one is picked.

`GridGraph.jsx:29` never hits this because it always requests a fixed
`getColorRange(props.colors.scheme, 3)` regardless of series count.

Full trace already recorded in `research/report-page-redesign/findings.md` (section
"Follow-up Q&A: value-driven bar color").

## Scope

In:
- `ui/components/graph_new/components/BarGraph.jsx` — request a small fixed swatch count
  (mirroring GridGraph's `3`) when `colors.byValue` is on, instead of
  `dataFromProps.keys?.length`, for the scheme-resolution branch only.

Out:
- No change to the `colors.type === "palette"` branch (already correct — a real array,
  unaffected by series count).
- No change to `GridGraph.jsx` (not broken).
- No change to the Colors/Scheme picker UI itself (`config.jsx`) — the bug is purely in the
  resolution math, not the control surface.
- No dynamic/data-driven N sizing (tracked as a pre-existing follow-up in the completed
  `graph-color-schemes.md` task) — out of scope for a bug fix.

## Proposed Change

`BarGraph.jsx` color `useMemo` (around line 125-136):

```js
else if (props.colors?.type === "scheme") {
  // byValue colors a continuous scale, not discrete series — always request enough
  // stops for a real gradient (mirrors GridGraph.jsx's fixed request), instead of the
  // series count, which is 1 for the common single-series byValue case and sends
  // d3's quantize() a divide-by-zero (NaN interpolation → invalid "rgb(NaN,NaN,NaN)").
  colors = getColorRange(props.colors.scheme, props.colors?.byValue ? 3 : dataFromProps.keys?.length);
}
```

No other files change.

## Files Requiring Changes

- [x] `packages/dms/src/ui/components/graph_new/components/BarGraph.jsx` — fixed swatch count
      for the `byValue` + `scheme` combination.
- [x] Rebuild `packages/dms/dist` via `npx babel src -d dist` (no watcher on this package —
      see `reference_dms_package_dist_rebuild` memory).

## Status: code fix DONE + rebuilt; function-level verified; live browser check NOT done

## Testing Checklist

- [x] Node-level check against the **actual installed d3 primitives** (`d3-interpolate` +
      `d3-scale-chromatic`, run from inside `packages/dms/` so `node_modules` resolves), same
      call shape as `BarGraph.jsx`'s old code (`quantize(interpolator, 1)`):
      - `viridis` n=1 → `[null]`; `turbo` n=1 → `["rgb(NaN, NaN, NaN)"]`; `rdbu` n=1 →
        `["rgb(0, 0, 0)"]` — three *different* degenerate failure modes (not uniformly
        "rgb(NaN,NaN,NaN)" as first guessed — worth noting since it means some schemes would
        have looked like solid black rather than an obviously-broken color, arguably worse for
        an author trying to debug it).
      - Same three schemes at n=3 (the fix): all return 3 valid, visually distinct stop colors
        (e.g. `viridis` → `["#440154","#21918c","#fde725"]`).
      - This confirms both the exact root cause and that the fix resolves it, using the literal
        production functions/inputs — not a re-derived approximation.
- [x] `packages/dms/dist` rebuilt via `npx babel src -d dist` (593 files, no errors).
- [ ] **Not done**: live browser check on a dedicated scratch report. Attempted via the DMS
      CLI (`dms site tree` against `npmrdsv5+dev2:site`) to spin up an isolated test section,
      but hit an unrelated `"no-access"` CLI/auth error even after minting a fresh token via
      `mint_token.sh` — a pre-existing CLI/environment snag, not something this fix touches.
      Didn't chase it further to avoid scope creep on a one-line, deterministic pure-function
      fix; flagging as a real gap rather than claiming it's verified. If a live pixel-check
      matters before calling this fully closed, next session should either fix the CLI access
      issue or drive it through the running Vite app directly.
- [ ] Existing sections using the default baked palette (`colors.type: "palette"`) —
      unaffected in theory (that branch isn't touched by this diff) but not re-screenshotted.
- [ ] Multi-series/`categorize` bar chart with a Scheme picked — unaffected in theory
      (`keys.length >= 2` never hit the NaN path before or after), not re-screenshotted.
