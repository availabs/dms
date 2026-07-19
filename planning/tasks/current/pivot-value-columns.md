# dataWrapper pivot: multi-value columns (valueColumns[])

**Library sub-task of** `planning/transportny/tasks/current/build-route-comparison-page.md`
(Task 2 / enrichment E1). Lets a Spreadsheet/Graph **pivot** spread MULTIPLE metrics per pivot
combo (each with its own aggregate) — e.g. Speed·avg, Travel-time·avg, Delay·sum side-by-side
under each period. Applied to the working tree; **needs committing** (user owns git). BC.

## Change
- NEW `…/dataWrapper/pivotUtils.js` — shared pivot naming/value helpers (`getPivotValues`,
  `isMultiValue`, `pivotColName`, `valueColLabel`, `slugForPivot`, `colKey`). getData +
  usePivotDistinctValues both import these so the fetched CASE columns and the injected display
  columns share identical names.
- `…/dataWrapper/getData.js` — pivot CASE fan-out is now `combinations.flatMap(combo =>
  getPivotValues(pivot).map(vc => …))` (combos outer / values inner), each with its own
  `aggregateFn` and `valueRef`; alias via `pivotColName(combo, pivotColumns, vc, multiValue)`.
- `…/dataWrapper/usePivotDistinctValues.js` — injects one `pivot_col` per (combo × value).
  Multi-value: `display_name` = metric label, `_pivotCombo = [...combo, metricLabel]`,
  `_pivotColumns = [...pivotColumns, '__value']` → the metric renders as the **leaf** header
  under the pivot-combo group rows. `computePivotFetchKey` now includes `valueColumns` (+ `join`).
- `…/TableHeader.jsx` — **unchanged**; the metric-as-trailing-pivot-dimension reuses the existing
  `computePivotGroupRows` grouping.
- `…/dataWrapper/schema.js` — documented `pivot.valueColumns[]:{column,aggregateFn,label}`.
- `…/sections/sectionMenu.jsx` — author UI: **Value Columns** item (replaces the single Value
  Column + Aggregate items) — add/remove multiple metrics; each drills into its own aggregate
  picker (count/sum/avg/max/min) + Remove; add-list = source columns not yet selected. Legacy
  single `valueColumn`+`aggregateFn` is migrated into the list for display/editing.

## BC
- Legacy single-value pivots (`valueColumn`+`aggregateFn`, no `valueColumns`) are byte-identical:
  `getPivotValues` returns the single value, `pivotColName` uses the old combo-only name
  (`multi=false`), usePivotDistinctValues keeps the prior display/grouping branch.

## Verify / regression
- VERIFIED: throwaway pgFederated pivot rendered route×year with All-veh + Freight avg-TT leaves
  under each year group, real data, no errors (route-comparison FINDINGS.md).
- Regression before commit: a normal single-value pivot (e.g. the map-21 spike style) still
  spreads one column per combo; author menu shows/edits it.
- ⚠ Author-UI: loads clean in edit mode; interactive nested menu not headless-driven — eyeball
  Dataset → Pivot → Value Columns.

## Status
- [x] Applied to working tree (2026-07-17). [ ] Committed (user). [ ] `card-layout.md` doc. [ ] author-UI eyeball.
