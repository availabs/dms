# DataWrapper Overview

The dataWrapper is a higher-order component that wraps presentation components (Spreadsheet, Card, Graph) and provides them with data fetched from the UDA (Universal Data Access) API. It manages an internal state that maps to a SQL-like query DSL, handles filters (both server-side and client-side), pagination, and page-level filter synchronization.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Page Section                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  dataWrapper (Edit or View)                                   │  │
│  │                                                               │  │
│  │  ┌──────────┐    ┌──────────────┐    ┌────────────────────┐  │  │
│  │  │ Columns  │───>│ dataRequest  │───>│ getData()          │  │  │
│  │  │ Config   │    │ (query DSL)  │    │  -> options obj    │  │  │
│  │  └──────────┘    └──────────────┘    │  -> apiLoad(uda)   │  │  │
│  │       ▲                              │  -> post-process   │  │  │
│  │       │                              └────────┬───────────┘  │  │
│  │  ┌──────────┐                                 │              │  │
│  │  │ Filters  │                                 ▼              │  │
│  │  │ (server) │                          ┌─────────────┐       │  │
│  │  └──────────┘                          │ state.data  │       │  │
│  │       ▲                                └──────┬──────┘       │  │
│  │       │                                       │              │  │
│  │  ┌──────────┐                                 │              │  │
│  │  │ Page     │                                 ▼              │  │
│  │  │ Filters  │◄──── URL params     ┌──────────────────────┐  │  │
│  │  └──────────┘                     │ Presentation Comp    │  │  │
│  │                                   │ (Spreadsheet/Card/   │  │  │
│  │  ┌──────────┐                     │  Graph)              │  │  │
│  │  │ Local    │───> client-side     └──────────────────────┘  │  │
│  │  │ Filters  │     filtering                                  │  │
│  │  └──────────┘                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
dataWrapper/
├── index.jsx                          # Main entry: Edit + View components, exports getData
├── utils/
│   ├── utils.jsx                      # Core: getData(), getLength(), applyFn(), formatFunctions
│   └── convertOldState.js             # Migrates legacy state formats to current schema
└── components/
    ├── Controls.jsx                   # Control dispatcher (edit mode)
    ├── ColumnControls.jsx             # Column visibility, sort, group, fn, sizing
    ├── MoreControls.jsx               # Display settings (pagination, editing, totals)
    ├── Pagination.jsx                 # Pagination UI
    ├── Attribution.jsx                # Data source attribution display
    ├── ToggleControl.jsx              # Toggle switch component
    ├── InputControl.jsx               # Text/number input component
    ├── FilterableSearch.jsx           # Search with filtering
    ├── AddFormulaColumn.jsx           # Formula column builder (AST-based)
    └── filters/
        ├── RenderFilters.jsx          # Filter UI orchestrator
        ├── utils.js                   # Filter data loading helpers
        └── Components/
            └── RenderFilterValueSelector.jsx  # Individual filter value picker
```

## Data Flow

### 1. Initialization

When a dataWrapper component mounts:

1. The saved JSON state is parsed and passed through `convertOldState()` to handle legacy formats.
2. The state is loaded into a `useImmer()` store, providing immutable state updates.
3. The state contains: `sourceInfo`, `columns`, `dataRequest`, `display`, and cached `data`.

```
saved JSON string ──> convertOldState() ──> useImmer(state) ──> ready
```

### 2. Column Configuration → dataRequest

Whenever `state.columns` changes (user toggles visibility, sort, group, fn, or filters), an effect rebuilds `state.dataRequest`:

```javascript
// index.jsx useSetDataRequest effect (Edit: line 169, View: line 594)

// 1. Scan all columns for filter definitions
filterOptions = columns.reduce((acc, column) => {
    column.filters.forEach(({operation, values}) => {
        // operation: 'filter' | 'exclude' | 'gt' | 'gte' | 'lt' | 'lte' | 'like'
        acc[operation][column.name] = values
    })
}, {})

// 2. Build dataRequest from column settings
dataRequest = {
    ...filterOptions,                              // filter, exclude, gt, gte, lt, lte, like
    filterRelation: display.filterRelation,        // 'AND' or 'OR'
    groupBy: columns with group=true,
    orderBy: columns with sort set,
    fn: columns with fn set,
    serverFn: columns with serverFn set,
    meta: columns with meta-variable/geoid-variable display
}
```

This `dataRequest` is a **declarative intermediate representation** — the column-level config expressed as a query object. It's not yet the final UDA query.

### 3. dataRequest → getData() → UDA API

When `state.dataRequest` changes, an effect calls `getData()` (utils.jsx:227), which transforms the dataRequest into the actual UDA options object and makes the API call.

**Step 3a: Prepare columns**

```javascript
columnsWithSettings = state.columns.map(col => ({
    ...sourceColumn,        // original column metadata from source
    ...userSettings,        // user's visibility, sort, fn, filter config
    reqName,                // SQL expression: fn(data->>'col') as col  — used in SELECT
    refName,                // data->>'col'  — used in WHERE/GROUP BY
    totalName               // SUM(CASE WHEN numeric...) as col_total  — for totals row
}))
```

**Step 3b: Build options object**

The `options` object is the core UDA query config (see `uda-config-overview.md` for full spec):

```javascript
options = {
    filter: { refName: [values] },         // WHERE col IN (values)
    exclude: { refName: [values] },        // WHERE col NOT IN (values)
    gt/gte/lt/lte → where or having,       // numeric comparisons
    like → where,                          // text LIKE search
    groupBy: [refNames],                   // GROUP BY
    orderBy: { reqName: 'asc'|'desc' },    // ORDER BY
    meta: { col: lookupConfig },           // value transformations (e.g. FIPS → county name)
    serverFn: { col: fnConfig },           // server-side join operations
    normalFilter: [...],                   // CASE WHEN for normalized/duplicate columns
    filterRelation: 'AND'|'OR',            // how to combine filter clauses
    keepOriginalValues: bool               // return both original + meta values
}
```

**Step 3c: API call**

```javascript
apiLoad({
    format: state.sourceInfo,              // source_id, view_id, env, isDms, etc.
    children: [{
        action: 'uda',                     // UDA action type
        path: '/',
        filter: {
            fromIndex, toIndex,            // pagination range
            options: JSON.stringify(options),
            attributes: columnsToFetch.map(c => c.reqName),  // SELECT columns
            stopFullDataLoad: true
        }
    }]
})
```

The `apiLoad` function uses the Falcor data model to make the request. The server-side UDA handler receives `options` and `attributes`, constructs a SQL query, executes it, and returns rows.

**Step 3d: Post-processing**

```javascript
data.map(row => {
    // Map API response keys (reqName) back to column names
    result[column.name] = cleanValue(row[column.reqName])
    // Evaluate formula columns (AST-based)
    result[formulaCol.name] = evaluateAST(formula, result)
})
```

### 4. Filter System

Filters operate at three levels:

#### Server-side filters (in `dataRequest`)

Configured per-column in `column.filters[]`. Each filter has:
- `type`: `'internal'` (edit-mode only) or `'external'` (visible in view mode)
- `operation`: `'filter'` | `'exclude'` | `'gt'` | `'gte'` | `'lt'` | `'lte'` | `'like'`
- `values`: array of filter values
- `usePageFilters`: sync with page-level URL params
- `searchParamKey`: URL param key when syncing
- `isMulti`: allow multiple selections (for filter/exclude)
- `fn`: aggregate function for the filter (when grouping)
- `display`: `''` (compact) | `'expanded'` | `'tabular'`

When filter values change → `dataRequest` is rebuilt → `getData()` runs → new data from server.

**Filter options loading** (`RenderFilters.jsx`): For each filterable column, distinct values are fetched from UDA *with other active filters applied as context*, so dropdown options narrow as you filter. For multiselect columns, value sets are matched against all stored combinations.

#### Page-level filter sync

When `usePageFilters` is enabled on a filter:
1. Filter values sync bidirectionally with `PageContext.pageState.filters`
2. `PageContext` syncs with URL search params
3. Multiple dataWrapper components on the same page can share filter state through the same `searchParamKey`

Flow:
```
URL params ←→ PageContext.pageState.filters ←→ column.filters[].values
```

#### Client-side local filters (`localFilter`)

Applied after data is fetched. Used for text search and client-side multiselect filtering:
- Text columns: case-insensitive substring match
- Select/multiselect: exact value match
- Results stored in `state.localFilteredData`, original in `state.data`

### 5. Component Integration

All data-driven components register with `useDataWrapper: true` in the ComponentRegistry. The dataWrapper provides:

| Prop | Description |
|------|-------------|
| `state.data` | Current page of data (post-filters, post-formulas) |
| `state.localFilteredData` | Result of client-side filters (when active) |
| `state.fullData` | All data when loaded (for local filtering source) |
| `state.columns` | Column config with all user settings |
| `state.sourceInfo` | Data source metadata |
| `state.display` | Display/pagination settings |
| `setState` | Immer draft updater for state mutations |
| `controls` | Control components (filters, column settings) |

Additionally, Spreadsheet and Card receive CRUD props:
- `updateItem(value, attribute, row)` — update a row (DMS sources only)
- `removeItem(item)` — delete a row
- `addItem()` — create a new row
- `newItem / setNewItem` — new row state

### 6. Pagination

Two modes:
- **Pagination** (`display.usePagination = true`): Fetches one page at a time from UDA. Page changes trigger new `getData()` calls with offset.
- **Infinite scroll** (`usePagination = false`): Appends new pages to existing data as user scrolls.

### 7. Data Sources

Two source types:

**DAMA views** (standard): Data from the DAMA data management system. Columns are database columns. Column accessors are plain column names.

**DMS datasets** (`sourceInfo.isDms = true`): Data stored as JSONB in the DMS content system. Column accessors use `data->>'columnName'` syntax. Numeric operations require `::integer` casts. These sources support full CRUD via `apiUpdate`.

### 8. State Persistence

The entire state (columns, dataRequest, display, sourceInfo, and cached data) is serialized to JSON and stored as the section's `element-data`. On load, `convertOldState()` migrates any legacy formats. In edit mode, state changes are auto-saved via `onChange(JSON.stringify(state))`.
