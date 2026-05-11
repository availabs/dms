# Pivot Table Feature — Research & Spec

## Background

DataWrapper fetches data using what SectionMenu sets up via columns, filters, and other
controls. This works well for simple requests with/without group-by and filters. This
document specifies adding pivot table support: pivot controls in SectionMenu, data
fetching changes in DataWrapper, and rendering in Spreadsheet.

---

## Concept

A pivot table is similar to Excel's PivotTable. The user picks:

- **Row Column** — the column whose values form the rows (e.g., `county`)
- **Pivot Column** — the column whose distinct values become column headers (e.g., `direction` → N, NE, W …)
- **Value Column** — the column to aggregate per cell (e.g., `speed`)
- **Aggregate Function** — how to summarize the value per cell (count, sum, avg, max, min; default: count)
- **Max Values** — cap on how many distinct pivot values to expand (user-settable, default: 10)

The system fetches distinct values of the pivot column (separate API call), then generates
CASE-based calculated columns server-side:

```sql
-- Example: pivot direction, value = speed, fn = sum, row = county
SELECT
  data->>'county' AS county,
  SUM(CASE WHEN data->>'direction' = 'N'  THEN (data->>'speed')::numeric ELSE 0 END) AS direction_n,
  SUM(CASE WHEN data->>'direction' = 'NE' THEN (data->>'speed')::numeric ELSE 0 END) AS direction_ne,
  SUM(CASE WHEN data->>'direction' = 'W'  THEN (data->>'speed')::numeric ELSE 0 END) AS direction_w
FROM my_table
GROUP BY data->>'county'
```

---

## Decisions

| Question | Decision |
|---|---|
| Row column | Pivot config owns it (not driven by existing `group: true` columns) |
| Value column limit | Start with one; expand later |
| Distinct values fetch | Separate `apiLoad` call when pivot column is selected |
| Max distinct values | User-settable, default 10 |
| Pivot columns in UI | Own block in SectionMenu and ColumnManager, next to the normal Columns block |
| Validation / error state | Auto-apply aggregate (default count) — user never hits invalid state |
| Column resizing | Out of scope for now; focus on correct data first |

---

## State Shape

A new top-level `pivot` key is added to persisted DataWrapper state alongside `columns`,
`filters`, `display`, etc.

```js
{
  pivot: {
    enabled: false,
    rowColumn: 'county',          // string — column name for rows
    pivotColumn: 'direction',     // string — column name to pivot on
    valueColumn: 'speed',         // string — column name to aggregate
    aggregateFn: 'count',         // 'count' | 'sum' | 'avg' | 'max' | 'min'
    distinctValues: ['N','NE','W'], // string[] — fetched, NOT persisted (runtime)
    maxValues: 10,                // number — cap on distinct values
  }
}
```

`distinctValues` is runtime-only and stripped from the save payload (like `fullData`).

---

## Architecture / Data Flow

### 1. Distinct values fetch (`usePivotDistinctValues` hook)

Fires when `pivot.enabled && pivot.pivotColumn` changes. Builds a minimal UDA request
to select the pivot column grouped by itself (effectively DISTINCT), limited to
`pivot.maxValues` rows. Writes result to `state.pivot.distinctValues`.

### 2. Pivot column injection (in `getData`)

When `state.pivot?.enabled` and `distinctValues` are populated, `getData` transforms the
request before building the UDA config:

- Sets the row column as the sole `group: true` column
- For each distinct value, builds a CASE expression string and adds it as a calculated
  column to `columnsToFetch` (bypasses normal columns — these are ephemeral)
- Skips the existing group/fn validation for pivot-mode requests

Pivot columns are named `{pivotColumn}_{slug(value)}` (e.g., `direction_n`).

### 3. Pivot column display

Distinct values drive an ephemeral set of columns in `state.columns` with
`origin: 'pivot_col'`. These are:
- Injected into `state.columns` (not persisted — stripped from the save effect)
- Shown in a separate **Pivot Columns** block in ColumnManager / Spreadsheet
- Hidden from the regular columns block

### 4. SectionMenu — Pivot block

New menu group added to `getSectionMenuItems`, rendered between `columns` and `filter`:

```
Pivot
├── Enabled (toggle)
├── Row Column (select from source columns)
├── Pivot Column (select from source columns)
├── Value Column (select from source columns)
├── Aggregate Function (select: Count / Sum / Avg / Max / Min)
└── Max Values (number input, default 10)
```

### 5. `dwAPI` additions

New `setPivot(key, value)` mutation method on `useDataWrapperAPI`, used by the
SectionMenu pivot controls (parallel to `setDisplay`).

---

## Files Requiring Changes

| File | Change |
|---|---|
| `dataWrapper/schema.js` | Document `pivot` as a persisted field; add `distinctValues` to runtime fields |
| `dataWrapper/index.jsx` | Save effect: add `pivot` to `toSave`, strip `pivot_col` columns and `distinctValues`; wire `usePivotDistinctValues` |
| `dataWrapper/useDataLoader.js` | Add `pivot` fields to `computeFetchKey` |
| `dataWrapper/getData.js` | Pivot mode: inject CASE columns, set group, skip validation |
| `dataWrapper/usePivotDistinctValues.js` | NEW — fetches distinct values, injects pivot columns into state |
| `dataWrapper/useDataWrapperAPI.js` | Add `setPivot(key, value)` mutation |
| `sections/sectionMenu.jsx` | Add pivot menu block |
| `sections/ColumnManager.jsx` | Add pivot columns block (separate from regular columns) |
| `ComponentRegistry/spreadsheet/index.jsx` | Render pivot columns from state |

---

## Out of Scope (Now)

- Column resizing for pivot columns (requires special header design)
- Multiple value columns
- Pivot column sorting / ordering beyond the default distinct value order
