# Pivot Table — Implementation Task

## Objective

Add pivot table support to the DataWrapper/Spreadsheet stack. When enabled, the user
picks a row column, a pivot column, a value column, and an aggregate function. The system
fetches distinct values of the pivot column and generates CASE-based calculated columns
server-side, producing a cross-tab result rendered in Spreadsheet.

See `planning/research/pivot.md` for the full spec and architecture rationale.

---

## Scope

**In:** Pivot config state, distinct-values fetch, CASE column generation in getData,
SectionMenu pivot block, ColumnManager pivot columns block, Spreadsheet rendering.

**Out:** Column resizing, multiple value columns, pivot-column sort customization.

---

## Current State

DataWrapper fetches data via `getData` → `buildUdaConfig` → UDA query. The SectionMenu
controls regular columns, group-by, aggregate functions, and filters. There is no
cross-tab/pivot concept.

---

## Proposed Changes

### Pivot state shape (persisted)

```js
{
  pivot: {
    enabled: false,
    rowColumn: 'county',
    pivotColumn: 'direction',
    valueColumn: 'speed',
    aggregateFn: 'count',   // default
    distinctValues: [],     // runtime only — stripped on save
    maxValues: 10,
  }
}
```

### CASE column SQL pattern (per distinct value `v`)

```sql
-- fn = sum
SUM(CASE WHEN data->>'direction' = 'N' THEN (data->>'speed')::numeric ELSE 0 END) AS direction_n

-- fn = count
COUNT(CASE WHEN data->>'direction' = 'N' THEN 1 ELSE NULL END) AS direction_n

-- fn = avg
AVG(CASE WHEN data->>'direction' = 'N' THEN (data->>'speed')::numeric ELSE NULL END) AS direction_n

-- fn = max / min
MAX(CASE WHEN data->>'direction' = 'N' THEN (data->>'speed')::numeric ELSE NULL END) AS direction_n
```

Pivot column names follow the underscore convention: `{pivotColumn}_{slug(value)}`.
`slug(value)` = value lowercased, spaces/special chars replaced with `_`.

### Pivot column injection into state.columns

After distinct values are fetched, a set of `origin: 'pivot_col'` columns is injected
into `state.columns`. These are ephemeral — never persisted. They enable the Spreadsheet
and ColumnManager to discover and render them without special-casing the table renderer.

Shape of each injected pivot column:
```js
{
  name: 'direction_n',
  display_name: 'N',
  show: true,
  origin: 'pivot_col',
  _pivotValue: 'N',    // internal — used for CASE generation in getData
}
```

---

## Implementation Plan

### Phase 1: State & schema — DONE

- [x] `dataWrapper/schema.js` — added `pivot` to the persisted fields doc comment; documented runtime-only fields (`pivot.distinctValues`, `origin='pivot_col'` columns)
- [x] `dataWrapper/index.jsx` save effect — strip `pivot_col` columns from saved columns; include `pivot` (minus `distinctValues`) via destructure when `pivot.enabled`
- [x] `dataWrapper/useDataLoader.js` `computeFetchKey` — added full pivot sub-object when enabled; added `state.pivot` to `useMemo` deps array

### Phase 2: `usePivotDistinctValues` hook — DONE

New file: `dataWrapper/usePivotDistinctValues.js`

```js
// Fires when pivot.enabled + pivot.pivotColumn changes.
// Builds a minimal state for getData that selects only the pivot column, grouped,
// limited to maxValues rows, ordered by the pivot column.
// Writes results to state.pivot.distinctValues.
// Also injects/replaces pivot_col columns in state.columns.
```

Implementation:
- [x] Created `usePivotDistinctValues.js` — effect deps include `pivotEnabled, pivotColumn, maxValues, viewId, sourceId, filters` so distinct values re-fetch when filters change
- [x] Stale-request guard via `reqRef` counter (same pattern as other async hooks)
- [x] When disabled/unset: clears `pivot_col` columns and resets `distinctValues = []`
- [x] Builds minimal state with just the pivot column (`group: true`), respects parent filters, limits via `pageSize = maxValues`
- [x] Injects `pivot_col` columns: `{ name: '{pivotCol}_{slug(v)}', display_name: v, show: true, origin: 'pivot_col', _pivotValue: v }`
- [x] Wired into both `Edit` and `View` components in `index.jsx`, after `useColumnOptions`

### Phase 3: `getData` pivot mode — DONE

File: `dataWrapper/getData.js`

- [x] Added `slugForPivot` and `buildPivotCaseExpr` helpers at top of `getData.js`
- [x] `isPivotMode` gate: enabled when `pivot.enabled && rowColumn && pivotColumn && distinctValues.length`
- [x] Pivot branch calls `buildUdaConfig` with a minimal state (row column only, group:true) to resolve filters correctly, then appends CASE columns to `columnsToFetch` and forces `options.groupBy = [rowRef]`
- [x] Validation block wrapped in `if (!isPivotMode)` — pivot CASE columns are inherently aggregate, no error state
- [x] Total-row fetch guarded by `!isPivotMode` — CASE columns have no `totalName`
- [x] `isDms`-aware `numericValueRef`: DMS sources cast value column to `::numeric`; non-DMS uses raw ref
- [x] Single-quote SQL-escaping on pivot values (`replace(/'/g, "''")`)

### Phase 4: `useDataWrapperAPI` — DONE

File: `dataWrapper/useDataWrapperAPI.js`

- [x] Added `setPivot(key, value)` useCallback — initializes `draft.pivot` with defaults on first call; eagerly clears `distinctValues` and `pivot_col` columns when `pivotColumn` changes
- [x] Exposed `setPivot` in the returned useMemo object and added to deps array
- [x] Added `pivot` to the `config` getter for consistent read access

### Phase 5: SectionMenu pivot block — DONE

File: `sections/sectionMenu.jsx`

- [x] Added `pivot` const object between `columns` and `filter` consts — toggle, row/pivot/value column pickers (with `showSearch: true`), aggregate fn selector, max values number input; inner items use `.filter(item => !item.cdn || item.cdn())` so row/pivot/value/aggregate/maxValues items only show when pivot is enabled
- [x] Added `pivot,` to return array between `...columns` and `...filter`; top-level `cdn` gates it behind `isEdit && useDataSource && canEditSection`

### Phase 6: ColumnManager pivot block — DONE

File: `sections/ColumnManager.jsx`

- [x] Added `pivotColumns` memo filtering `origin === 'pivot_col'` from `stateColumns`
- [x] Filtered pivot_col out of `activeColumns` so they don't appear in the DraggableList or get drag handles
- [x] Filtered pivot_col out of `allColumns` so they don't appear in the ColumnPicker search
- [x] Added read-only "Pivot Columns" section below active columns list — shows `display_name` (raw distinct value) per column with Eye/EyeClosed show-hide toggle via `dwAPI.updateColumn`
- [x] Empty-state message now only renders when both `activeColumns` and `pivotColumns` are empty

### Phase 7: Spreadsheet rendering — DONE

File: `ComponentRegistry/spreadsheet/index.jsx`

- [x] `visibleAttributes` currently = `columns.filter(({show}) => show)`. Pivot columns
  injected into `state.columns` with `show: true` will already appear — no change needed
  to the main render loop.
- [x] Verified `TableHeaderCell` uses `attribute.customName || attribute.display_name || colIdName` (line 159) — pivot columns show display_name (raw distinct value like "N") correctly.
- [x] Confirmed `TableCell` uses `item[attribute.name]` — resolves pivot column data keys (e.g., `direction_n`) correctly from post-processed rows.
- [x] Fixed autoResize bug: added `v.origin === 'pivot_col'` to `availableVisibleAttributes` filter so pivot columns get initial sizes and the size check stabilizes (preventing infinite re-renders when pivot columns aren't in sourceInfo.columns).

---

## Testing Checklist

- [ ] Pivot disabled: normal DataWrapper behavior is completely unchanged
- [ ] Toggle pivot on: distinct values fetch fires, pivot columns appear in ColumnManager
- [ ] Change pivot column: old pivot columns removed, new distinct values fetched
- [ ] Data renders correctly: rows keyed by row column, cells contain aggregate values
- [ ] Changing aggregate fn triggers re-fetch with correct CASE SQL
- [ ] Max values cap respected: only N columns shown when `maxValues = N`
- [ ] Save/reload round-trip: pivot config persists, `distinctValues` does NOT persist
- [ ] Pivot columns not shown in normal Columns block
- [ ] Download (xlsx): pivot columns included in export
- [ ] Non-Spreadsheet components: pivot config stored but ignored (no crash)
- [ ] SQL injection safety: single quotes in pivot values are escaped in CASE expressions
