# Unset page variables blanked every reacting section (`IN ('')` regression)

> **Status:** ✅ FIXED 2026-07-16 (verified end-to-end on tsmo2 reliability_v2 + congestion_v2).
> **Severity when found:** every dataWrapper section on any page with an unset URL-registered
> page variable rendered EMPTY ("Rows 1 to 0 of 0") — locally AND on devtny.org after the
> 2026-07-16 morning deploy. Found while working the reliability ticket cluster
> (`planning/transportny/tasks/current/tsmo-reliability-ticket-fixes.md`, ticket 2191484).

## Mechanism

1. A page registers a variable with `values: ""` (e.g. `{ searchKey: "region", values: "",
   useSearchParams: true }`).
2. `initNavigateUsingSearchParams` (pages/_utils/index.js) one-time-redirects with the variable
   in the URL: `typeof values === 'string' ? [values] : values` → `[""]` → `?region=`.
3. `updatePageStateFiltersOnSearchParamChange` reads it back: `searchParams.get(k)?.split('|||')`
   → `"".split('|||')` = **`[""]`** → pageState filter values.
4. `applyPageFilters` (buildUdaConfig.js) substituted `[""]` into every `usePageFilters` leaf —
   clobbering the leaf's saved value, which is also why CLEARING a control never recovered.
5. The empty-IN guard in `mapFilterGroupCols` would normally drop such a leaf, but it sat AFTER
   `if (!col) return node` — so **pass-through leaves** (col = a raw SQL CASE expression, the
   "option A" region controls) skipped it and shipped `(CASE …) IN ('')` → 0 rows for both the
   length gate and the data query.

## Fix (both consumer-side, so any producer shape is handled)

- `applyPageFilters`: blank page values (`""`, `[""]`) now mean UNSET → the leaf keeps its saved
  value. A true `[]` (deliberately cleared control) keeps its long-standing widen-to-no-constraint
  meaning.
- `mapFilterGroupCols`: the like/filter/exclude blank-value drop-outs moved ABOVE the
  `if (!col) return node` pass-through, so option-A leaves are guarded too.

Producers intentionally left alone (URL shape unchanged, BC).

## Verification

- tsmo2 reliability_v2 (edit view, drafts): statewide 872 corridors; `?region=Region 11 - New
  York City%20` → 392; param removed → 872 again; congestion_v2 10 rows (was 0).
- Direct falcor replay: leaf value `[""]` → length 0 (server, correctly); `[]` → length 1.

## Deploy status

- dms-template: live (dev). transportNY: synced same day, build green — **devtny.org is blank
  on data dashboards until redeployed.** The deployed dmsserver needs nothing (server was never
  wrong; it faithfully compiled `IN ('')`).

## Also in this batch: LineGraph `domainMin: "auto"`

`avl-graph/LineGraph.jsx`: `domainMin: "auto"` floats the y-domain bottom to the data minimum
(5% pad, floored to integer) instead of the 0 default / a fixed number. Needed because fixed
floors clip region-scoped series (reliability: Region 10 bottoms at 58.5, Region 11 at 31.5 —
no constant floor fits all). BC: any non-"auto" value behaves exactly as before.

## Lesson (process)

"Build green" is not deploy-ready: this regression shipped in a green build. Deploy-readiness
for transportNY should include one Playwright smoke of a DATA page (rows > 0) against the
target bundle.
