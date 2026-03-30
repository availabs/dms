# DataWrapper

## Overview

The dataWrapper is the data engine behind data-driven section components (Spreadsheet, Card, Graph). It handles everything between "what data source the user configured" and "here are the rows to render": building SQL-like query configs, fetching data, managing loading/pagination/dedup, and providing state to leaf components via React context.

DataWrapper is a self-contained unit. It owns its own state (via `useImmer`), manages all data hooks internally, and exposes its internals to the parent section via a reactive handle callback. The section is purely presentational for data components — it renders the chrome (title, header, menu, delete modal) and delegates everything data-related to the dataWrapper.

## File Map

All dataWrapper files live in:
```
packages/dms/src/patterns/page/components/sections/components/dataWrapper/
```

| File | Type | Purpose |
|------|------|---------|
| `index.jsx` | React | Edit/View components. Owns state, provides ComponentContext, manages all hooks. |
| `getData.js` | Async | Data fetching. Builds UDA config, fetches length + rows, post-processes results. |
| `useDataLoader.js` | Hook | Loading lifecycle — dedup (fetchKey), debounce, pagination, local filter slicing. |
| `useDataSource.js` | Hook | Loads available sources/views from Falcor. Writes `state.externalSource` on change. |
| `useDataWrapperAPI.js` | Hook | Structured editing API. Named methods replace raw `setState` for external callers. |
| `usePageFilterSync.js` | Hook | Syncs page-level filter values into `state.filters` tree nodes. |
| `useColumnOptions.js` | Hook | Loads `mapped_options` for columns that reference other sources for select/multiselect options. |
| `buildUdaConfig.js` | Pure | Columns + filters + externalSource → UDA options + attributes + outputSourceInfo. No React. |
| `migrateToV2.js` | Pure | Converts any legacy format (v0/v1) to v2 canonical schema. **Only file referencing legacy field names.** |
| `schema.js` | Constants | v2 field names, RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS. |
| `utils/utils.jsx` | Mixed | Shared utilities: `formatFunctions`, `isJson`, `useHandleClickOutside`, `applyFn`, `attributeAccessorStr`. Re-exports `getData`/`getLength` for backward compat. |
| `utils/convertOldState.js` | Legacy | Old format converter. Kept for non-data component edge cases. Superseded by `migrateToV2.js`. |

## v2 Data Schema

The dataWrapper uses a canonical v2 schema for all persisted state. Legacy formats are converted on load by `migrateToV2()`.

### Persisted fields

```javascript
{
  externalSource: {              // the external data source being queried
    source_id: number,           //   (renamed from legacy "sourceInfo")
    view_id: number,
    isDms: boolean,
    env: string,                 // database environment key
    srcEnv: string,              // original source environment
    app: string | null,          // DMS app (only when isDms=true)
    type: string | null,         // DMS type (only when isDms=true)
    columns: [{                  // source column metadata
      name: string,
      type: string,              // "integer", "text", "numeric", etc.
      display: string,           // "number", "text", "multiselect", etc.
    }],
    name: string,                // source display name
    view_name: string,           // version label
    baseUrl: string,             // for attribution links
  },

  columns: [{                    // user column settings
    name: string,
    show: boolean,               // visible in output
    group: boolean,              // GROUP BY
    fn: string | undefined,      // aggregate: "sum", "count", "avg", "list", "max"
    sort: string | undefined,    // "asc", "desc", "asc nulls last", etc.
    customName: string,          // user-facing label override
    meta_lookup: string,         // meta expansion key (e.g. "county_name")
    display: string,             // display type
    type: string,                // data type
    // ... many more per-column settings (see controls in component registry)
  }],

  filters: {                     // user-authored filter tree
    op: "AND" | "OR",            //   (promoted from legacy "dataRequest.filterGroups")
    groups: [{                   //   tree of conditions and nested groups
      col: string,               //   column name (leaf condition)
      op: string,                //   operation: "filter", "exclude", "gt", "gte", "lt", "lte", "like"
      value: any,                //   filter value(s)
      usePageFilters: boolean,   //   sync with page-level URL filter params
      searchParamKey: string,    //   URL param key
      // ... or nested group: { op: "OR", groups: [...] }
    }],
  },

  display: {                     // rendering/presentation config
    pageSize: number,
    usePagination: boolean,
    striped: boolean,
    showTotal: boolean,
    allowDownload: boolean,
    readyToLoad: boolean,        // gate: don't fetch until user interaction
    allowEditInView: boolean,
    showAttribution: boolean,
    showGutters: boolean,
    hideIfNull: boolean,         // hide section when data is empty
    filterRelation: string,      // fallback AND/OR for legacy flat filters
    totalLength: number,         // total row count from last fetch
    // ... component-specific fields (graph options, card layout, etc.)
  },

  data: [...],                   // cached rows from last fetch

  dataSourceId: string | null,   // tracks which page-level template this came from
}
```

### Runtime-only fields (NOT persisted)

These are stripped by the save effect before writing to element-data:

- `fullData` — full dataset (when loaded for download)
- `localFilteredData` — client-side filtered rows
- `lastDataRequest` — dedup artifact (replaced by fetchKey)
- `outputSourceInfo` — computed by buildUdaConfig (Phase 4 chainability)
- `display.filteredLength` — length of locally filtered data
- `display.invalidState` — error message for invalid column/fn configuration
- `display.hideSection` — computed from data + hideIfNull flag

### Legacy field names (v1 → v2 mapping)

`migrateToV2()` handles these conversions:

| v1 (legacy) | v2 (canonical) | Notes |
|-------------|----------------|-------|
| `sourceInfo` | `externalSource` | Clarifies this is the input source, not output schema |
| `dataRequest.filterGroups` | `filters` | Promoted to first-class — it's authored state, not derived |
| `dataRequest.groupBy/orderBy/fn/meta/serverFn` | REMOVED | Derived at runtime by `buildUdaConfig()` from `columns` |
| `columns[].filters` | Migrated into `filters` tree | Per-column filter array is deprecated |
| `columns[].internalFilter/externalFilter` | Migrated into `filters` tree | Very old format |

## Data Flow

```
Section.jsx
  │ resolves page-level source if dataSourceId present
  │ passes element-data as value prop
  ▼
components/index.jsx
  │ for data components: delegates to DataWrapper
  │ for non-data: creates own state + ComponentContext
  ▼
DataWrapper Edit/View (index.jsx)
  │
  ├── migrateToV2(value) → useImmer(state)        [state initialization]
  │
  ├── useDataSource(state)                          [loads source/view list]
  │     writes: state.externalSource
  │
  ├── useDataWrapperAPI(state)                      [editing API for menus]
  │     exposes: setDisplay, updateColumn, etc.
  │
  ├── useDataLoader(state)                          [fetch lifecycle]
  │     calls: getData(state) → buildUdaConfig → apiLoad
  │     writes: state.data, state.display.totalLength
  │     dedup: computeFetchKey vs lastFetchKeyRef
  │
  ├── usePageFilterSync(state)                      [page filter injection]
  │     reads: PageContext.pageState.filters
  │     writes: state.filters nodes where usePageFilters=true
  │
  ├── useColumnOptions(state)                       [mapped_options loading]
  │     writes: state.columns[].options
  │
  ├── Save effect                                   [persistence]
  │     produces v2 JSON: { externalSource, columns, filters, display, data }
  │     strips runtime fields
  │     calls: onChange(serialized)
  │
  ├── onHandle callback                             [reactive bridge to section]
  │     exposes: { dwAPI, dataSource, state, setState }
  │     section stores in useState → triggers re-render for menu
  │
  └── ComponentContext.Provider                     [context for leaf components]
        provides: { state, setState, apiLoad, apiUpdate, controls }
        consumed by: Spreadsheet, Card, Graph, Pagination, Attribution,
                     RenderFilters, ExternalFilters, etc.
```

## Section↔DataWrapper Interface

### Props in (via components/index.jsx)

| Prop | Type | Description |
|------|------|-------------|
| `value` | string | Serialized element-data (v2 JSON or legacy — migrateToV2 handles both) |
| `onChange` | function | Callback to persist changes. Called by save effect with serialized v2 JSON. |
| `component` | object | Component registry entry: `{ EditComp, ViewComp, controls, defaultState, name }` |
| `onHandle` | function | Callback for reactive bridge. DataWrapper calls with `{ dwAPI, dataSource, state, setState }`. Section stores in `useState` to trigger re-renders. |

### Handle out (via onHandle)

| Field | Type | Description |
|-------|------|-------------|
| `dwAPI` | object | Structured editing API: `setDisplay`, `updateColumn`, `updateAllColumns`, `duplicateColumn`, `resetColumn`, `resetAllColumns`, `toggleIdFilter`, `toggleGlobalVisibility`, `addFormulaColumn`, `addCalculatedColumn`, `reorderColumns`. Also has `config` (read access) and `runtime` (read access). |
| `dataSource` | object | `{ activeSource, activeView, sources, views, onSourceChange, onViewChange }` from useDataSource. |
| `state` | object | Current immer state. Read-only from section's perspective (escape hatch for paste, custom controls). |
| `setState` | function | Immer updater. Escape hatch — prefer dwAPI methods. |

### Why onHandle instead of useRef

Refs don't trigger re-renders. When dataWrapper loads sources or fetches data, the section menu needs to update (show source list, column count, etc.). Using `useState` + `onHandle` callback means the section re-renders when the handle changes. A ref would leave the menu stale until the next unrelated re-render.

## Page-Level Data Sources

### DataSourceContext

Provided by `PageEdit` and `PageView` (wraps the page tree). Stores page-level data source templates.

```javascript
{
  dataSources: { "ds-1": {...}, "ds-2": {...} },  // the map
  setDataSource: (id, updater) => {},              // update a source
  removeDataSource: (id) => {},                    // delete a source
  createDataSource: (config) => id,                // create, returns new ID
  saveDataSources: () => {},                       // explicit save
}
```

### Data Sources Pane

Tab in the page edit pane (editPane/dataSourcesPane.jsx). Lists all page-level sources. Each source can be edited: name, source/version picker, column manager, filter editor.

The pane creates its own local `useImmer` state per source and syncs back to DataSourceContext on changes (debounced 500ms).

### Section ↔ Page-Level Sources

Sections can reference a page-level source via `dataSourceId` in their element-data:

**Inline mode** (default):
```javascript
// Section element-data contains full config
{ externalSource: {...}, columns: [...], filters: {...}, display: {...}, data: [...] }
```

**Page-level reference mode** (after selecting from menu):
```javascript
// Section element-data contains just a reference + display + cached data
{ dataSourceId: "ds-1", display: {...}, data: [...] }
```

When a section has `dataSourceId`, `section.jsx` resolves the config from `DataSourceContext` and merges it with the section's display before passing to the dataWrapper. The dataWrapper doesn't know or care where the config came from.

On save, `section.jsx` routes config changes (externalSource, columns, filters) back to `DataSourceContext` and slims the element-data to `{ dataSourceId, display, data }`.

### switchDataSource

When a user selects a page-level source from the section menu:
1. Full config is read from `DataSourceContext`
2. DataWrapper's live state is updated directly via `dwHandle.setState`
3. Section element-data is persisted with the full config + `dataSourceId` tag

### Publish

`editFunctions.jsx` copies `draft_dataSources` to `dataSources` when publishing a page.

## buildUdaConfig

Pure function. No React, no API calls, no side effects. Given data source config, produces the UDA query specification.

### Input

```javascript
buildUdaConfig({
  externalSource,   // source identity + column metadata (isDms, view_id, columns)
  columns,          // user column settings (show, group, fn, sort, meta_lookup, ...)
  filters,          // user-authored filter tree { op, groups }
  join,             // join config (null for single-source — Phase 7)
  pageFilters,      // runtime URL params for usePageFilters conditions
})
```

### Output

```javascript
{
  options: {          // complete UDA query options for the server
    filterGroups,     //   mapped filter tree (column names → SQL refs)
    groupBy,          //   server-side GROUP BY column refs
    orderBy,          //   server-side ORDER BY
    filter,           //   legacy flat filters (from old column.filters migration)
    exclude,          //   legacy flat excludes
    normalFilter,     //   CASE WHEN expressions for dual-purpose filters
    meta,             //   meta lookup specs { colName: lookupKey }
    serverFn,         //   server-side functions { colName: { joinKey, valueKey, ... } }
    having,           //   HAVING clause expressions (aggregate filters)
  },
  attributes: [],     // SELECT column list (reqNames with fn applied)
  columnsToFetch: [], // enriched columns with reqName, refName, totalName
  columnsWithSettings: [], // full merged columns (user + source metadata)
  outputSourceInfo: { // describes what this config produces (Phase 4)
    columns: [{       //   output column schema
      name, originalName, type, display, source, fn, meta_lookup
    }],
    isGrouped,        //   whether GROUP BY is active
    asUdaConfig,      //   { options, attributes, sourceInfo } for downstream joins
  },
}
```

### How it derives query fields from columns

| Column field | Derived output | Condition |
|-------------|----------------|-----------|
| `group: true` | `options.groupBy[]` | Column is a GROUP BY key |
| `sort: "asc"` | `options.orderBy[refName]` | Column has sort direction |
| `fn: "sum"` | `attributes[]` with `sum(col) as col_sum` | Aggregate function applied |
| `meta_lookup: "county_name"` | `options.meta[colName]` | Server expands via lookup table |
| `serverFn: {...}` | `options.serverFn[colName]` | Server-side join/transform |
| `show: true` | Included in `attributes[]` | Column appears in SELECT |
| `show: false` | Excluded from `columnsToFetch` | Not fetched |

### Legacy adapter

`legacyStateToBuildInput(state)` maps v1 state shape to the builder's input:
- `state.sourceInfo` → `externalSource`
- `state.dataRequest.filterGroups` → `filters`

Only used when `migrateToV2` encounters v1 data that hasn't been re-saved yet. The primary path for v2 data goes directly to `buildUdaConfig`.

## getData

Async function that orchestrates the full data fetch pipeline:

1. **Build UDA config** — calls `buildUdaConfig` (or `legacyStateToBuildInput` + `buildUdaConfig` for v1 compat)
2. **Fetch length** — calls `apiLoad` with `udaLength` action
3. **Validate** — checks for invalid state (mismatched fn/groupBy), empty columns, out-of-range pagination
4. **Fetch rows** — calls `apiLoad` with `uda` action, pagination indices, column attributes
5. **Fetch total row** — if `showTotal` is enabled, fetches SUM(CASE WHEN...) for numeric columns
6. **Post-process** — maps server column names (reqName) back to user column names, evaluates client-side formula columns, cleans values

Returns `{ length, data, outputSourceInfo }`.

## Testing

93 unit tests in `packages/dms/tests/buildUdaConfig.test.js`:

```bash
# From src/dms/
npx vitest run packages/dms/tests/buildUdaConfig.test.js
```

Coverage:
- Column helpers (attributeAccessorStr, refName, reqName, applyFn, totalName)
- isCalculatedCol detection
- Filter tree mapping (mapFilterGroupCols)
- HAVING extraction from filter tree
- Normal filter extraction (CASE WHEN columns)
- Page filter application
- buildColumnsWithSettings + getColumnsToFetch
- Full buildUdaConfig in DMS and DAMA modes
- Legacy adapter (legacyStateToBuildInput)
- computeOutputSourceInfo (passthrough, aggregation, meta_lookup, formula, grouping, asUdaConfig)

Not covered by automated tests (manual verification):
- React hooks (useDataLoader, useDataSource, useDataWrapperAPI, usePageFilterSync, useColumnOptions)
- Section↔DataWrapper integration (handle bridge, page-level resolution, save routing)
- Data sources pane CRUD
- Edit↔view transitions
- Preloading (preloadSectionData)
