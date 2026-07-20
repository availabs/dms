# dataWrapper pivot: data-fetch range + join-key fixes

**Library sub-task of** `planning/transportny/tasks/current/build-route-comparison-page.md`
(surfaced while building the Route Comparison pivot page). Three bugs in
`…/dataWrapper/getData.js` that prevented a **pivot cross-tab with a join** from rendering.
All applied to the working tree; **need committing** (user owns git). BC.

## Symptom
A pivot Spreadsheet (rowColumn = joined `rt.route_id`, pivotColumns = `[period]`,
valueColumns = [TT all, TT freight]) over a pgFederated join rendered its **headers**
(year groups × metric leaves) but the body stuck on "loading…" forever, with a blank
Route column. Static-filter spikes "worked" only because they happened to set `pageSize`.

## Root causes & fixes (all in getData.js)

1. **Null pagination range → 0 rows (the blocker).**
   A `usePagination:false` section can omit `display.pageSize`. The row-index math was
   `currentPage * state.display.pageSize` → `0 * undefined` = **NaN**, which serialises to a
   `null` `dataByIndex` range. The server returns 0 rows for a null range, so the section
   hangs on "loading" (length query still returns a count, so it never shows "no data").
   **Fix:** a pivot cross-tab is bounded (one row per row-group) and has no pagination UI,
   so it now **loads all rows** (`loadAllRows = isPivotMode || fullDataLoad`). `pageSize` is
   coerced to a safe number (`Number(pageSize) > 0 ? … : 25`) so the paginated path can never
   produce a NaN/null range either.

2. **Off-by-one on the load-all end index → phantom "loading" row.**
   `dataByIndex`'s `to` is **inclusive** (a length-N result spans indices 0..N-1). The
   full-load branch used `toIndex = length`, fetching one extra out-of-range slot that comes
   back as an empty Falcor atom and renders as a phantom "loading" row under the real data.
   **Fix:** `toIndex = length - 1` for the load-all branch. (This also corrects the
   pre-existing `fullDataLoad ? length` off-by-one.)

3. **Join alias-strip blanked qualified display columns (blank Route).**
   With a join present, getData strips the table alias from data keys (`rt.route_id` →
   `route_id`) so unqualified display columns resolve. But a **pivot row column keeps its
   qualified `name`** (`rt.route_id`) as its display key, so the lookup missed → blank cell.
   (Metric CASE aliases like `period_2019__…` have no dot, so they were never stripped and
   always rendered.)
   **Fix:** in the strip, keep **both** the stripped key and the original qualified key.
   Additive/BC — the stripped key is unchanged (non-pivot join columns keyed on it still
   work), and it also disambiguates same-base-name columns from two join sources. The xlsx
   download iterates column names (not raw data keys), so the extra key is ignored there.

## BC
- Non-pivot sections: `loadAllRows` is false unless `fullDataLoad`; the safe-pageSize coerce
  only changes behavior when pageSize was undefined (previously NaN/broken).
- Non-pivot joins: stripped keys preserved verbatim; qualified keys are additive.
- fullDataLoad: now fetches exactly `length` rows (was length+1 with a trailing empty atom).

## Verify / regression
- VERIFIED live (route_comparison page 2194923/section 2194924, npmrdsv5 dev2): route×year×
  [TT all, TT freight] renders 2 route rows with real per-cell travel times, no phantom row,
  Route column shows ids, no stray pivot-dimension column (that one is a config choice —
  set the pivot calc column `show:false`). No console errors; request count stable (no loop).
- Direct UDA replay confirmed: valid range (from 0, to length-1) → real rows; null range → 0 rows.
- Regression to run before commit:
  - a normal paginated non-pivot Spreadsheet (pageSize set) still paginates;
  - a non-pivot join section still resolves stripped columns;
  - **a Graph / graph_new section** (these set `fullDataLoad:true`, so fix #2 now fetches
    `length` rows instead of `length+1`) — confirm the last real data point still renders and no
    point is dropped. Reasoning says it's strictly correct (the dropped index was an out-of-range
    empty Falcor atom — directly observed: `dataByIndex {from:0,to:5}` on a 2-row result returned
    rows 0,1 real and 2–5 as `{"$type":"atom"}`), and it shares the exact `loadAllRows` code path
    verified live for the pivot Spreadsheet — but eyeball one real graph before committing since
    `fullDataLoad` is used broadly.

## Status
- [x] Applied to working tree (2026-07-17). [ ] Committed (user). [ ] Non-pivot regression eyeball.

## Related
- [[pivot-value-columns.md]] (the multi-metric valueColumns[] enrichment these fixes support)
- [[pivot-join-column-fixes.md]] (earlier join-threading + double-prefix guard)
