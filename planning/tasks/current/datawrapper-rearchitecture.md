# DataWrapper & Data Sources Re-Architecture

## Objective

Redesign how datawrappers and data sources work in the page pattern to achieve:

1. **Clean separation of datawrapper from section** — small, well-defined interface between them (currently they share state deeply through ComponentContext)
2. **Separate UDA config creation from data loading** — the logic for building UDA configs (a DSL for SQL) should be distinct from the logic for loading data, caching it, and knowing when to refetch
3. **Self-describing datawrappers** — each datawrapper consumes sourceInfo (metadata about its input) and produces its own sourceInfo (metadata about its output), enabling chainability
4. **Join support** — datawrappers should be able to join multiple sources (DAMA views, internal tables, or other UDA configs) via a join DSL that compiles to server-side SQL
5. **Page-level data source management** — data sources created at the page level with a dedicated editPane, assignable to sections, while still allowing creation from within a section

---

## Current State

### Key Files

| File | Role |
|------|------|
| `patterns/page/components/sections/section.jsx` | Wraps ComponentContext.Provider with state, setState, apiLoad, apiUpdate; calls `convertOldState()` and `useDataSource()` |
| `patterns/page/components/sections/useDataSource.js` | Hook that loads available sources, views, builds sourceInfo with column metadata |
| `patterns/page/components/sections/components/dataWrapper/index.jsx` | Edit/View HOC — useImmer state, effects for filter sync / dataRequest rebuild / getData() / auto-save |
| `patterns/page/components/sections/components/dataWrapper/utils/utils.jsx` | Core: `getData()`, `getLength()`, `applyFn()`, column name transforms (refName, reqName, totalName) |
| `patterns/page/components/sections/components/dataWrapper/utils/convertOldState.js` | Legacy state migration |
| `patterns/page/context.js` | CMSContext, PageContext, ComponentContext definitions |
| `patterns/page/components/sections/components/ComponentRegistry/index.jsx` | Registers components with `useDataSource: true` flag |

### Current State Shape (persisted as section `element-data` JSON)

```javascript
{
  sourceInfo: {                    // data source identification
    app, type, isDms, env, srcEnv,
    source_id, view_id, view_name, name,
    columns: [{ name, type, display }],
    doc_type
  },
  columns: [{                      // column definitions + user settings
    name, display_name, customName, type, display, origin,
    show, size, openOut, wrapText,
    group, fn, sort,
    filters: [{ type, operation, values, usePageFilters, searchParamKey, isMulti, fn, display }],
    localFilter, excludeNA,
    formatFn, isDollar, justify,
    meta_lookup, serverFn, mapped_options, options,
    // card/graph/formula/editing-specific fields...
  }],
  dataRequest: {                   // intermediate query repr (rebuilt from columns)
    filter, exclude, gt, gte, lt, lte, like,
    filterRelation, groupBy, orderBy, fn, serverFn, meta, normalFilter
  },
  display: {                       // presentation settings
    pageSize, totalLength, filteredLength, usePagination,
    showGutters, striped, showTotal, showAttribution, allowDownload,
    allowEditInView, allowAdddNew, hideSection, hideIfNull, readyToLoad,
    // graph/card/spreadsheet-specific fields...
  },
  data: [...]                      // cached rows
}
```

### Proposed State Shape (after re-architecture)

A "data source" in the new architecture is a **complete dataWrapper source config** — not just an external source reference. It contains everything needed to define and query data: the external source identity, column configuration, filters, and join specs.

#### Section element-data (new shape)

```javascript
{
  // ── Data source binding ──
  dataSourceId: "ds-1",               // ref to page-level data source (single-source mode)

  // ── Display config (same as today, section-specific) ──
  display: {
    usePagination: true,
    pageSize: 25,
    striped: false,
    showTotal: true,
    allowDownload: true,
    // ... all existing display fields preserved
  },

  // ── REMOVED fields ──
  // sourceInfo     → moved into page-level data source as externalSource
  // columns        → moved into page-level data source
  // filters        → moved into page-level data source
  // join           → moved into page-level data source
  // dataRequest    → derived at runtime by buildUdaConfig()
  // data           → runtime cache only, never persisted
}
```

The section becomes thin — it holds a reference to a data source and display-only config (how to render, not what to query). Multiple sections can share the same data source with different display settings.

#### Page element-data (gains `dataSources` map)

A page-level data source is a **full dataWrapper source config** — everything needed to build a UDA query:

```javascript
{
  // ... existing page fields (title, url_slug, etc.) ...

  dataSources: {
    "ds-1": {
      id: "ds-1",
      name: "Fusion Events",

      // ── External source identity (renamed from sourceInfo) ──
      externalSource: {
        source_id: 870,
        view_id: 1648,
        isDms: false,
        srcEnv: "external-data",
        env: "dama",
        app: null,                     // only set when isDms=true
        type: null,                    // only set when isDms=true
        columns: [                     // source column metadata — needed by buildUdaConfig
          { name: "event_id", type: "integer", display: "number" },
          { name: "county_fips", type: "character varying", display: "text",
            meta_lookup: "county_name" },
          { name: "property_damage", type: "numeric", display: "number" },
        ]
      },

      // ── Column config (user settings per column) ──
      columns: [
        {
          name: "county_fips",
          show: true,
          customName: "County",
          type: "text",
          justify: "left",
          formatFn: "title",
          group: true,
          fn: "",
          sort: "asc nulls last",
          meta_lookup: "county_name",
          // ... all existing per-column fields preserved
          // filters: [...]            // DEPRECATED — use top-level filters instead
          table: "events",             // only present in join mode
        }
      ],

      // ── Filters (promoted from dataRequest.filterGroups) ──
      filters: {
        op: "AND",
        groups: [
          {
            col: "property_damage",
            op: "gt",
            value: 0,
            usePageFilters: false,
            searchParamKey: null,
            isExternal: false,
            isMulti: false,
            fn: null,                  // if set, filter applies in HAVING clause
            isNormalFilter: false,     // if true, uses CASE WHEN expression
          },
          {
            op: "OR",
            groups: [
              { col: "event_type", op: "filter", value: ["Flood", "Hurricane"] },
              { col: "event_type", op: "filter", value: ["Tornado"] }
            ]
          }
        ]
      },

      // ── Join config (only present in multi-source mode) ──
      // When present, externalSource above is the "primary" source,
      // and additional sources are referenced by ID from other page dataSources
      join: {
        sources: {
          events: null,                // null = use this data source's externalSource
          counties: "ds-2",           // ref to another page-level data source
        },
        on: [
          { type: "left", tables: ["events", "counties"],
            on: "events.county_fips = counties.geoid" }
        ]
      }
    },

    "ds-2": {
      id: "ds-2",
      name: "NRI Counties",
      externalSource: {
        source_id: 422,
        view_id: 1370,
        isDms: false,
        srcEnv: "external-data",
        env: "dama",
        columns: [
          { name: "geoid", type: "character varying", display: "text" },
          { name: "county_name", type: "character varying", display: "text" },
          { name: "population", type: "integer", display: "number" },
        ]
      },
      columns: [...],
      filters: { op: "AND", groups: [] }
    }
  }
}
```

#### `buildUdaConfig()` input — what it needs and where it comes from

```javascript
// Pure function — all inputs come from persisted state, no API calls
function buildUdaConfig({
  // From data source (page-level)
  externalSource,                     // needed for:
  //   .isDms        → column reference syntax (data->>'col' vs col)
  //   .view_id      → resolves server-side table
  //   .source_id    → resolves server-side table
  //   .columns      → column metadata (types, meta_lookup keys)
  //   .env          → which database/API to query

  columns,                            // user column config — derives:
  //   groupBy       → columns where group=true
  //   orderBy       → columns where sort is set
  //   fn            → columns where fn is set (sum, count, avg, list)
  //   serverFn      → columns with serverFn config
  //   meta          → columns with meta_lookup
  //   attributes    → columns where show=true (the SELECT list)

  filters,                            // top-level filter tree — derives:
  //   filterGroups  → mapped to server column refs
  //   having        → conditions with fn set (aggregate filters)
  //   normalFilter  → conditions with isNormalFilter (CASE WHEN)

  join,                               // optional join config — derives:
  //   WITH clauses  → for subquery sources
  //   JOIN clauses  → table relationships
  //   table-prefixed column refs

  // From runtime context (not persisted)
  pageFilters,                        // current URL search params for usePageFilters conditions
}) => {
  return {
    options: { /* complete UDA options object */ },
    attributes: [ /* SELECT column list */ ],
    outputSourceInfo: { /* describes output schema for chainability */ }
  }
}
```

#### `columns[].filters` — DEPRECATED

The per-column `filters` array in `columns` is **deprecated**. It is the legacy filter system:

```javascript
// DEPRECATED — do not use in new code
columns: [{
  filters: [{ type, operation, values, usePageFilters, searchParamKey }]  // OLD
}]
```

`convertOldState()` already migrates these to the `filterGroups` tree structure. In the new architecture, all filter state lives in the top-level `filters` field on the data source. The `columns[].filters` field should be ignored if `filters` exists, and migrated on load if it doesn't.

#### What changes and why

| Field | Current | Proposed | Rationale |
|-------|---------|----------|-----------|
| `sourceInfo` | Inline in section | **Renamed to `externalSource`**, moved to page-level data source | Clarifies this is the external source identity (not output schema). Lives at page level for sharing. |
| `columns` | In section | **Moved to page-level data source** | Part of the query definition, not display config. Shared when sections share a data source. |
| `columns[].filters` | Per-column filter array | **DEPRECATED**. Migrated to top-level `filters` on load. | Legacy system — `convertOldState` already does this migration. |
| `filters` | Not present (buried in `dataRequest.filterGroups`) | **New top-level field** on data source. Tree structure: `{op, groups}` | `filterGroups` is user-authored state that was incorrectly stored inside the derived `dataRequest`. Promoting it makes the data source self-contained. |
| `dataSourceId` | Not present | **New** on section. String ref to page-level data source. | Section references a complete data source config, not just an external source. |
| `join` | Not present | **New** on data source. `{sources, on}` with refs to other page-level data sources. | Defines multi-source relationships within the data source config. |
| `columns[].table` | Not present | **New** (join mode only). Source alias this column belongs to. | Disambiguates columns across joined sources. |
| `dataRequest` | Persisted with mixed user/derived state | **Removed**. `filters` promoted to top-level. `groupBy`/`orderBy`/`fn`/`meta`/`serverFn` derived from `columns` by `buildUdaConfig()`. | Eliminates the sync problem — today the same info exists in both `columns` and `dataRequest`, requiring effects to keep them in sync. |
| `data` | Persisted cached rows | **Removed**. Runtime only, held in data loader hook. | Reduces element-data size. Data fetched fresh via API-layer pre-fetch or on-demand. |
| `display` | In section | **Stays in section** | Display is section-specific — two sections can share a data source but render differently. |

#### Migration path

Old element-data still works via `convertOldState()` (which already exists). The migration logic:

1. If `sourceInfo` is inline in section → create page-level data source with `externalSource: sourceInfo`, set `dataSourceId` on section
2. If `columns` is in section → move to the page-level data source
3. If `dataRequest.filterGroups` exists → promote to `filters` on the data source
4. If `columns[].filters` exists (legacy) → migrate to `filters` via existing `convertOldState` logic
5. If `dataRequest` has `groupBy`/`orderBy`/`fn` → ignore (derived from `columns` at runtime)
6. If `data` is present → strip it (fetched fresh)
7. If no `dataSourceId` → legacy mode, fall back to current behavior

Non-breaking migration — sections without `dataSourceId` continue working through the existing code path.

#### Net effect

- **Section element-data becomes minimal**: just `dataSourceId` + `display`. Query config (columns, filters, joins, source identity) lives in the page-level data source.
- **Page element-data gets a `dataSources` map**: each entry is a complete, self-contained data source config (externalSource + columns + filters + join).
- **`filters` is promoted to first-class state**: no longer buried inside the derived `dataRequest` object. User-authored filter tree is persisted directly.
- **`columns` is the single source of truth** for groupBy/orderBy/fn/meta/serverFn — `buildUdaConfig()` derives these deterministically, eliminating the sync effects.
- **`buildUdaConfig()` has a clear, explicit contract**: it receives `externalSource` (for isDms, view_id, column metadata), `columns`, `filters`, and optional `join` — all from the persisted data source config — plus runtime `pageFilters`.

### Current Problems

1. **Entangled state**: Section and dataWrapper share mutable state through ComponentContext. `section.jsx` provides `{state, setState}` where `state` is the full dataWrapper state blob. The section reads/writes sourceInfo, the dataWrapper reads/writes everything — there's no boundary.

2. **Monolithic getData()**: `utils.jsx:getData()` does everything — builds columnsWithSettings, transforms column names, resolves multiselect filters, builds UDA options, makes the API call, post-processes data. UDA config creation is inseparable from data loading.

3. **No output schema**: DataWrappers consume sourceInfo but don't produce one. There's no way for a downstream component to know what columns/types a datawrapper outputs, preventing chaining.

4. **Single source per section**: `useDataSource()` manages exactly one source/view pair. Joins require a fundamentally different approach.

5. **No page-level data source management**: Sources are created per-section. There's no way to see all data sources on a page or share/reuse them.

---

## Proposed Architecture

### Design Principle: Three Separated Concerns

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  UDA Config      │    │  Data Loader     │    │  DataWrapper UI  │
│  Builder         │    │  & Cache         │    │  (Section Comp)  │
│                  │    │                  │    │                  │
│  - Column defs   │───>│  - Fetch logic   │───>│  - Presentation  │
│  - Filter rules  │    │  - Cache mgmt    │    │  - Controls      │
│  - Join specs    │    │  - Invalidation  │    │  - CRUD          │
│  - SQL DSL       │    │  - Pagination    │    │  - Formatting    │
│                  │<───│                  │<───│                  │
│  Pure data/logic │    │  Side-effect     │    │  React component │
└─────────────────┘    └─────────────────┘    └──────────────────┘
```

### 1. UDA Config Builder (pure logic, no React)

A pure function/module that takes column definitions + filter state + join specs and produces a complete UDA options object + attributes list. No API calls, no React hooks, no side effects.

**Input**: columns config, filters, joins, sourceInfo(s)
**Output**: `{ options: UDAOptions, attributes: string[], sourceInfo: SourceInfo }`

This replaces the scattered logic currently split across:
- The useSetDataRequest effect in `dataWrapper/index.jsx`
- `getData()` steps 3a-3b in `utils.jsx`
- `mapFilterGroupCols()`, `applyFn()`, `attributeAccessorStr()`

Key design: the builder is **testable in isolation** — given inputs, it deterministically produces the UDA config without touching any API.

### 2. Data Loader & Cache (React hook, side-effect boundary)

A hook that takes a UDA config and manages fetching, caching, pagination, and invalidation.

**Input**: UDA config from builder, sourceInfo, pagination state
**Output**: `{ data, length, loading, error, refetch }`

Knows when to refetch:
- UDA config changed (deep compare)
- Pagination changed
- Manual invalidation (CRUD operation)
- Page filter changed

Does NOT know how to build a UDA config — it just executes what it's given.

### 3. DataWrapper UI (React component)

The presentation layer that:
- Renders controls (column settings, filters, display options)
- Passes user changes to the UDA config builder
- Consumes data from the loader
- Handles CRUD operations
- Produces output sourceInfo for downstream consumers

**Interface with section**: Receives from section only what it needs:
- `sourceInfo` (or `dataSources` for joins)
- `onChange` callback for persisting config
- `apiLoad` / `apiUpdate` for data operations

Does NOT receive raw `setState` — the section doesn't reach into dataWrapper internals.

### 4. Output SourceInfo (chainability)

Each datawrapper produces a `sourceInfo` describing its output:

```javascript
// Produced by datawrapper after config is built
outputSourceInfo: {
  columns: [
    { name: "county_name", type: "text", source: "meta_lookup" },
    { name: "total_damage", type: "number", source: "aggregation", fn: "sum" },
    { name: "event_count", type: "number", source: "aggregation", fn: "count" },
  ],
  // When used as input to a join, this becomes a WITH clause
  asUdaConfig: { /* the UDA config that produces this output */ }
}
```

A downstream datawrapper can reference this outputSourceInfo as one of its inputs, and the UDA config builder will compile it into a `WITH` clause in the join.

### 5. Join Support

#### Join UDA Config Format

```javascript
const joinConfig = {
  sources: {
    table_a: { view_id: 5456 },                    // direct DAMA view
    table_b: { view_id: 42323 },                   // direct DAMA view
    table_c: { udaConfig: { /* full UDA config */ } }, // subquery → WITH clause
  },
  join: [
    {
      type: 'left',                                 // 'left' | 'inner' | 'right' | default 'join'
      tables: ['table_a', 'table_b'],
      on: 'table_a.county_fips = table_b.geoid'
    },
    {
      type: 'inner',
      tables: ['table_b', 'table_c'],
      on: 'table_b.fid = table_c.fid AND table_b.aid = table_c.aid'
    }
  ],
  // Standard UDA options apply to the joined result
  filter: { ... },
  groupBy: [ ... ],
  attributes: ['table_a.col_a', 'table_b.col_b']
}
```

The UDA config builder compiles this into SQL with `WITH` clauses for udaConfig sources and `JOIN` clauses for the table relationships. The server UDA handler needs to be extended to support this format.

#### Server-Side Execution

The server receives the join config and:
1. Resolves each source to a table or subquery
2. Builds `WITH` clauses for UDA config sources
3. Constructs `JOIN` SQL from the join specs
4. Applies standard filter/group/order/pagination on top
5. Returns rows as normal

### 6. Page-Level Data Source Management

#### State Shape

Page-level data sources stored in page data (alongside existing page state):

```javascript
// In page data (element-data for the page item)
{
  dataSources: {
    "ds-1": {
      id: "ds-1",
      name: "Fusion Events",
      sourceInfo: { source_id: 870, view_id: 1648, ... },
      // No UDA config here — that's per-section
    },
    "ds-2": {
      id: "ds-2",
      name: "NRI Counties",
      sourceInfo: { source_id: 422, view_id: 1370, ... },
    }
  }
}
```

#### Section → Data Source Binding

Each section references page-level data sources by ID:

```javascript
// Section element-data
{
  dataSourceId: "ds-1",          // reference to page-level source
  // OR for joins:
  dataSources: {
    table_a: "ds-1",             // page-level source ID
    table_b: "ds-2",             // page-level source ID
  },
  columns: [...],                // section-specific column config
  display: {...},                // section-specific display config
}
```

#### Edit Pane

A page-level "Data Sources" edit pane (alongside existing Sections, Settings panes) where:
- All data sources on the page are listed
- Sources can be created, renamed, deleted
- Source/view selection happens here
- Sections reference sources by ID
- Creating a source from within a section auto-creates it at the page level too

---

## Interface Definitions

### Section ↔ DataWrapper Interface

```typescript
// What section provides to dataWrapper
interface DataWrapperProps {
  // Data source(s) — resolved from page-level dataSources
  sourceInfo: SourceInfo;                    // single source mode
  dataSources?: Record<string, SourceInfo>;  // join mode

  // Persistence
  savedConfig: string;                       // JSON string of saved columns/display/joins
  onChange: (config: string) => void;         // persist config changes

  // Data operations
  apiLoad: Function;                         // Falcor data loading
  apiUpdate: Function;                       // Falcor data mutation

  // Page context (read-only)
  pageFilters: Record<string, any>;          // current page-level filter values
}

// What dataWrapper exposes (via ref or context, for downstream consumers)
interface DataWrapperOutput {
  outputSourceInfo: SourceInfo;              // schema of the output
  data: any[];                               // current data
  loading: boolean;
}
```

### UDA Config Builder Interface

```typescript
// Pure function — no side effects
function buildUdaConfig(input: {
  columns: ColumnConfig[];
  sourceInfo: SourceInfo;
  dataSources?: Record<string, SourceInfo>;  // for joins
  joinConfig?: JoinConfig;
  pageFilters?: Record<string, any>;
}): {
  options: UDAOptions;          // the query config for the server
  attributes: string[];         // SELECT clause
  outputSourceInfo: SourceInfo; // describes the output schema
}
```

### Data Loader Interface

```typescript
// React hook
function useDataLoader(config: {
  udaConfig: UDAOptions;
  attributes: string[];
  sourceInfo: SourceInfo;
  pagination: { fromIndex: number; toIndex: number };
  apiLoad: Function;
  enabled: boolean;             // skip fetch when false
}): {
  data: any[];
  length: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  invalidate: () => void;
}
```

---

## Implementation Phases

### Phase 0: Research & Specification — DONE

- [x] Map every place ComponentContext is read/written
- [x] Map every place `state.sourceInfo` is read/written
- [x] Map all callers of `getData()` and `getLength()`
- [x] Identify all state fields that are section concerns vs. datawrapper concerns
- [x] Document the exact current data flow for: initial load, filter change, page filter sync, CRUD operation, source change
- [x] Research server-side UDA handler to understand what changes are needed for joins
- [x] Write the exact UDA join config format with server SQL generation examples
- [x] Define the exact output sourceInfo schema

---

#### Phase 0 Results

##### 0.1 ComponentContext Usage Map

**Provider** (7 files):

| File | Context |
|------|---------|
| `sections/section.jsx` — `SectionEdit()`, `SectionView()` | Primary provider. Provides `{state, setState, apiLoad, apiUpdate, controls, isActive, activeStyle}` |
| `patterns/forms/pages/table.jsx` | Wraps Spreadsheet/DataWrapper for forms pattern |
| `patterns/datasets/pages/dataTypes/gis_dataset/pages/table.jsx` | Wraps Spreadsheet/DataWrapper for datasets pattern |
| `patterns/datasets/components/ValidateComp.jsx` | Wraps validation spreadsheet |

**Consumers** (18 files reading `useContext(ComponentContext)`):

| File | Fields Read | Purpose |
|------|-------------|---------|
| `sections/components/index.jsx` | `state`, `setState` | Generic EditComp/ViewComp wrapper — passes state down, handles onChange |
| `dataWrapper/index.jsx` | `state`, `setState` (+ `apiLoad` from PageContext) | Main data management — all effects, getData, CRUD |
| `ComponentRegistry/spreadsheet/index.jsx` | `state.columns`, `state.sourceInfo`, `state.display`, `state.data`, `state.localFilteredData`, `state.fullData`, `setState`, `controls`, `isActive`, `activeStyle` | Most complex consumer — 8+ fields |
| `ComponentRegistry/Card.jsx` | `state.columns`, `state.data`, `state.display`, `state.sourceInfo`, `setState`, `controls` | Card rendering + controls |
| `ComponentRegistry/graph/index.jsx` | `state` (full), `setState`, `controls` | Graph rendering |
| `ComponentRegistry/richtext/index.jsx` | `state.display.{isCard,bgColor,showToolbar}`, `setState` | Rich text editor config |
| `ComponentRegistry/footer.jsx` | `state.display.{disclaimer,privacyPolicyURL,termsURL}` | Footer display only |
| `ComponentRegistry/UploadComponent.jsx` | `state.sourceInfo`, `setState`, `apiLoad`, `apiUpdate` | Upload component |
| `ComponentRegistry/ValidateComponent.jsx` | `state.sourceInfo`, `setState`, `apiLoad`, `apiUpdate` | Validate component |
| `ComponentRegistry/FilterComponent.jsx` | `state`, `setState` | Filter config storage |
| `dataWrapper/components/Controls.jsx` | `controls` | Dispatches control rendering |
| `dataWrapper/components/Pagination.jsx` | `state.columns`, `state.display.*`, `state.data`, `activeStyle` | Pagination UI + readyToLoad gate |
| `dataWrapper/components/filters/RenderFilters.jsx` | `state.columns`, `state.sourceInfo.isDms`, `state.display`, `setState`, `apiLoad` | Filter UI + options loading |
| `sections/ExternalFilters.jsx` | `state.sourceInfo.columns`, `state.dataRequest.filterGroups`, `state.display.{gridSize,placement}`, `setState` | FilterGroups tree editing |
| `sections/ConditionValueInput.jsx` | `state.sourceInfo` (isDms, format), `apiLoad` | Column value autocomplete |
| `sections/sectionMenu.jsx` | `state.sourceInfo.columns` | Column list for menu |
| `dataWrapper/components/ColumnControls.jsx` | `sourceInfo.columns` | Available column filtering |
| `dataWrapper/components/ColumnManager.jsx` | `state.sourceInfo.columns` | Column picker (add columns) |

**Key insight for re-architecture**: ComponentContext is used for two fundamentally different purposes:
1. **Data pipeline** (dataWrapper, filters, pagination) — needs `state`, `setState`, `apiLoad`
2. **Display components** (card, graph, spreadsheet, richtext, footer) — needs read-only data + controls

The display components don't need `setState` for data pipeline mutations — they only use it for display-config changes (column sizes, display toggles). This is the natural boundary for the interface split.

##### 0.2 sourceInfo Flow

**Creation**: `useDataSource.js` — loads sources from Falcor API, builds sourceInfo on source/view selection.

**Fields and their consumers**:

| Field | Set By | Read By | Purpose |
|-------|--------|---------|---------|
| `source_id` | useDataSource | Attribution, Upload, Validate, queries | Identifies data source |
| `view_id` | useDataSource, onViewChange | Upload (builds type string), Validate, queries | Identifies view/version |
| `columns` | useDataSource (from metadata) | ColumnManager, all filters, spreadsheet, sectionMenu, ColumnControls, ExternalFilters, ConditionValueInput | Available column metadata — **most widely read field** |
| `isDms` | useDataSource | RenderFilters, utils.jsx (getData), queries | Switches SQL accessor format (`data->>'col'` vs `col`) |
| `app`, `type` | useDataSource | Upload, Validate | DMS identifiers for write operations |
| `env`, `srcEnv` | useDataSource | Falcor API calls | Database environment routing |
| `baseUrl` | useDataSource (from env config) | Attribution | Source link URL |
| `name`, `view_name`, `updated_at` | useDataSource | Attribution | Display metadata |
| `doc_type` | useDataSource | Validate | DMS document type |

**Mutation pattern**: Always via Immer `setState(draft => { draft.sourceInfo.field = value })` in `useDataSource.js`.

**Persistence**: Entire state (including sourceInfo) → `JSON.stringify()` → section `element-data` → DMS data_items. Restored via `convertOldState()` on load.

##### 0.3 getData() and getLength() Callers

**getData() — 8 call sites**:

| Location | Trigger | Purpose |
|----------|---------|---------|
| `index.jsx:41` | User clicks download | Excel export (full data) |
| `index.jsx:284` | Effect: dataRequest/sourceInfo/pageSize/columns change | **Edit mode primary data fetch** |
| `index.jsx:320` | User scrolls / clicks page | Edit mode pagination (infinite scroll) |
| `index.jsx:354` | Effect: mapped_options column change | Load dropdown options for editable selects |
| `index.jsx:729` | Effect: dataRequest/readyToLoad change | **View mode primary data fetch** (gated by readyToLoad) |
| `index.jsx:759` | User scrolls / clicks page | View mode pagination |
| `index.jsx:792` | Effect: mapped_options change | View mode dropdown options |
| `RenderFilters.jsx:185` | Filter component mount / filter change | Load distinct values for filter dropdowns |

**getLength() — 1 call site**:
| Location | Trigger | Purpose |
|----------|---------|---------|
| `utils.jsx:696` | Called inside getData() | Gets total row count for pagination display |

##### 0.4 State Fields: Section vs DataWrapper Concerns

**Section concerns** (config that the section/page cares about):

| Field | Why Section |
|-------|------------|
| `sourceInfo` | Source selection happens in section menu (useDataSource hook) |
| `display.hideSection` | Section visibility toggle |
| `display.allowEditInView` | Page-level permission decision |
| `display.allowDownload` | Page-level feature toggle |
| `display.pageSize` | Configured once, not data-dependent |
| `display.usePagination` | Configured once |
| `display.filterRelation` | AND/OR configured in section settings |
| `display.gridSize`, `display.placement` | Filter layout configured in section |
| Component-specific display (graph options, card styles, etc.) | Presentation config |

**DataWrapper internal concerns** (runtime state the section shouldn't touch):

| Field | Why Internal |
|-------|-------------|
| `dataRequest` | Derived from columns — rebuilt by effect, never directly configured |
| `data`, `fullData`, `localFilteredData` | Fetched data — ephemeral runtime state |
| `display.totalLength`, `display.filteredLength` | Server-reported counts — set by getData() |
| `display.readyToLoad` | Internal gate for View mode data loading |
| `display.invalidState` | Error state from getData() |
| `lastDataRequest` | Duplicate-fetch prevention — compared against current dataRequest |
| `columns[].filters[].values` (runtime) | Filter values change at runtime (persisted but mutated by effects) |

**Hybrid** (configured by section but mutated by dataWrapper):

| Field | Why Hybrid |
|-------|-----------|
| `columns` | Initially configured (add/remove/settings), but filter values, sort state, and loaded options mutate at runtime |
| `sourceInfo.columns` | Set by useDataSource, but also read widely by dataWrapper children |

##### 0.5 Data Flow Scenarios

**a. Initial Load (component mounts)**

*Edit mode — immediate load:*
```
element-data JSON
  → convertOldState() parses into state
  → useImmer(state)
  → Effect [columns, filterGroups, filterRelation] rebuilds dataRequest
  → Effect [dataRequest, sourceInfo.source_id, sourceInfo.view_id, pageSize, columns.length] fires
    → getData({state, apiLoad})
      → builds columnsWithSettings (refName, reqName, totalName)
      → builds UDA options object from dataRequest
      → apiLoad({format: sourceInfo, children: [{action: 'uda', filter: {options, attributes}}]})
      → post-process: map reqName → column.name, cleanValue, evaluate formulas
    → setState: data, totalLength, lastDataRequest
  → Effect [mapped_options] loads select dropdown options
  → Effect [state] auto-saves via onChange(JSON.stringify(state))
```

*View mode — gated load:*
```
element-data JSON → convertOldState() → useImmer(state)
  → Effect [pageState.filters] syncs page filters
    → sets readyToLoad = true (if page filters present or no page filters needed)
  → Effect [filterOptions, filterGroups, ...] rebuilds dataRequest
  → Effect [dataRequest, readyToLoad] fires — ONLY if readyToLoad === true
    → getData() → same as Edit mode
```

**b. Filter change (user selects filter value)**
```
User interaction → setState(draft.columns[i].filters[0].values = newValues)
  → Effect [columns, filterGroups, filterRelation] fires
    → walks columns, extracts filter/exclude/gt/gte/lt/lte/like per column
    → setState(draft.dataRequest = newDataRequest)
  → Effect [dataRequest, ...] fires → getData() → new data from server
```

**c. Page filter sync (URL param changes)**
```
URL change → React Router → PageContext.pageState.filters updated
  → Effect [pageState.filters] in dataWrapper fires
    → walks filterGroups tree, finds nodes with usePageFilters=true
    → updates their values from pageState.filters[searchParamKey]
    → (View mode) sets readyToLoad = true
  → Effect rebuilds dataRequest → Effect calls getData()
```

**d. CRUD operation (user edits/adds/deletes row)**
```
updateItem(value, attribute, row):
  → Optimistic: setState(draft.data[row][attribute] = value)
  → apiUpdate({data: {id, [attribute]: value}, config: sourceInfo})
  → No automatic refetch — relies on Falcor cache invalidation

addItem():
  → apiUpdate({data: {}, config: sourceInfo}) // creates empty row
  → On success: setState(draft.data.unshift({id: newId}))

removeItem(item):
  → setState(draft.data = draft.data.filter(d => d.id !== item.id))
  → apiUpdate({data: {id: item.id}, config: sourceInfo, requestType: 'delete'})
```

**e. Source change (user picks different source/view)**
```
User selects source in dropdown → onSourceChange(sourceId) in useDataSource
  → Falcor API loads source metadata (columns, views)
  → setState(draft.sourceInfo = {source_id, columns, env, isDms, ...})
  → setState(draft.columns = mergeColumns(sourceInfo.columns, existingColumns))
  → Effect [sourceInfo.source_id, sourceInfo.view_id] fires → triggers dataRequest rebuild → getData()

User selects view → onViewChange(viewId) in useDataSource
  → setState(draft.sourceInfo.view_id = viewId)
  → Effect fires → getData() with new view_id
```

**f. Pagination change**
```
User clicks page N or scrolls → onPageChange(currentPage)
  → If local filters active:
    → setState(currentPage) + getFilteredData() (client-side slice)
  → Else:
    → getData({state, currentPage, apiLoad, keepOriginalValues})
      → computes fromIndex = currentPage * pageSize
      → Same UDA call with different fromIndex/toIndex
    → If usePagination: setState(data = newPage)
    → Else (infinite scroll): setState(data = [...existing, ...newPage])
```

##### 0.6 Server UDA Handler Analysis

**Key files**:

| File | Purpose |
|------|---------|
| `dms-server/src/routes/uda/uda.route.js` | Falcor route definitions (3 routes: length, dataByIndex, dataById) |
| `dms-server/src/routes/uda/uda.controller.js` | SQL generation: `simpleFilterLength()`, `simpleFilter()`, `dataById()`, `applyMeta()` |
| `dms-server/src/routes/uda/utils.js` | SQL builders: `handleFilters()`, `handleGroupBy()`, `handleOrderBy()`, `handleHaving()`, `handleFilterGroups()`, `buildCombinedWhere()` |
| `dms-server/src/db/table-resolver.js` | Maps view_id/app/type → actual database table |
| `dms-server/src/db/query-utils.js` | Cross-DB helpers: `jsonExtract()`, `typeCast()`, `buildArrayComparison()` |

**SQL generation pipeline** (in `simpleFilter()`):
```
options JSON string
  → parse
  → getEssentials(env, view_id) → resolves {table_schema, table_name, dbType}
  → sanitizeName() each attribute (blocks SQL injection keywords)
  → translatePgToSqlite() if SQLite (array_agg→json_group_array, etc.)
  → buildCombinedWhere(filter, exclude, gt, gte, lt, lte, like, filterGroups, filterRelation)
  → handleGroupBy(groupBy)
  → handleHaving(having)
  → handleOrderBy(orderBy)
  → Assemble: SELECT attributes FROM table WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT/OFFSET
  → Execute query
  → applyMeta() post-processing (lookup enrichment)
```

**Table resolution** (`getEssentials()`):
- **DMS mode** (env contains `+`): parses `app+type`, looks up view metadata from DMS data, calls `resolveTable()` → per-app or legacy table
- **DAMA mode**: looks up `view_id` in `data_manager.views` → gets `{table_schema, table_name}`

**Existing WITH clause support**: Already used for `jsonb_array_elements_text` / `json_each` in groupBy expressions — wraps inner query in `WITH t AS (...)`. This proves the pattern works.

**Existing meta lookups (proto-join)**: `applyMeta()` is a JavaScript-side join — for each meta column, it queries another view via `simpleFilter()`, builds a lookup map, and replaces values in the result. This is slower than SQL joins but already handles cross-view enrichment.

**What's needed for server-side JOIN support**:

1. **New `joins` field in options**: `{ sources: {alias: {view_id} | {udaConfig}}, join: [{type, tables, on}] }`
2. **Multi-table resolution**: Call `getEssentials()` for each source in the join → get each table's `{schema, table}`
3. **WITH clause generation**: For sources that are UDA configs (not direct views), compile them as `WITH alias AS (SELECT ... FROM ... WHERE ...)`
4. **FROM + JOIN construction**: `FROM table_a alias_a LEFT JOIN table_b alias_b ON (condition)` — replace the current single-table `FROM`
5. **Column qualification**: Attributes must be prefixed with table alias (`table_a.col` not just `col`) — the attribute sanitizer needs to allow dot-qualified names
6. **Filter scope**: WHERE/HAVING clauses may reference columns from any joined table

**SQL generation example** for a join config:

```sql
-- Input:
-- sources: { events: {view_id: 1648}, counties: {view_id: 1370} }
-- join: [{ type: 'left', tables: ['events', 'counties'], on: 'events.geoid = counties.stcofips' }]
-- attributes: ['events.disaster_number', 'counties.formatted_name']
-- filter: { 'events.nri_category': ['riverine'] }

-- Generated SQL:
SELECT events.disaster_number, counties.formatted_name
FROM hazmit_dama.avail_fusion_events_v2 events
LEFT JOIN hazmit_dama.nri_counties_v2 counties
  ON events.geoid = counties.stcofips
WHERE events.nri_category = ANY($1)
ORDER BY events.disaster_number ASC
LIMIT 10 OFFSET 0

-- With a UDA config source:
WITH derived_data AS (
  SELECT data->>'fid' as fid, sum((data->>'amount')::numeric) as total
  FROM dms_myapp.data_items
  WHERE app = 'myapp' AND type = 'mytype-42'
  GROUP BY data->>'fid'
)
SELECT events.disaster_number, derived_data.total
FROM hazmit_dama.avail_fusion_events_v2 events
INNER JOIN derived_data ON events.fid = derived_data.fid
```

##### 0.7 Output SourceInfo Schema

Based on the research, the output sourceInfo should mirror the input sourceInfo structure so downstream consumers (ColumnManager, filters, spreadsheet, etc.) can use it without changes:

```javascript
outputSourceInfo: {
  // Identity — describes this datawrapper's output, not its input
  name: "Flood Events by County",           // user-assigned or auto-generated
  isDms: false,                              // inherited from primary source (affects accessor format)

  // Column metadata — the OUTPUT columns after transforms
  columns: [
    {
      name: "county_name",                   // output column name (post-alias)
      type: "text",                          // data type
      display: "data-variable",              // role
      origin: "meta_lookup",                 // how this column was produced
      sourceColumn: "stcofips",              // original column name (if transformed)
    },
    {
      name: "total_damage",
      type: "number",
      display: "data-variable",
      origin: "aggregation",
      fn: "sum",                             // aggregate function applied
      sourceColumn: "fusion_total_damage",
    },
    {
      name: "event_count",
      type: "number",
      display: "data-variable",
      origin: "aggregation",
      fn: "count",
      sourceColumn: "disaster_number",
    },
  ],

  // For use as a join source — the UDA config that produces this output
  asUdaConfig: {
    env: "hazmit_dama",
    view_id: 1648,
    options: { /* full UDA options */ },
    attributes: ["county_name", "sum(fusion_total_damage) as total_damage", "..."],
  },

  // Lineage — which source(s) this output derives from
  inputSources: [
    { source_id: 870, view_id: 1648, name: "Fusion Events V2" }
  ],
}
```

##### 0.8 Updated Open Questions (with answers from research)

1. **ComponentContext elimination**: **Partial elimination possible.** Display components (Card, Graph, Spreadsheet, richtext, footer) only need read-only data + controls — they could receive props. But filter components (RenderFilters, ExternalFilters, ConditionValueInput) need both `state` and `setState` for filter value mutations, plus `apiLoad` for loading filter options. These could use a narrower "FilterContext" instead of the full ComponentContext.

2. **Server UDA join complexity**: **Moderate.** The existing WITH clause pattern and `getEssentials()` multi-resolution provide a foundation. The main work is: (a) multi-table FROM/JOIN construction, (b) column alias qualification, (c) WITH clause generation for UDA-config sources. The `applyMeta()` post-process join can remain as a fallback for cross-database joins that can't be done in SQL.

3. **Forms and datasets pattern impact**: Both `forms/pages/table.jsx` and `datasets/pages/table.jsx` provide their own ComponentContext.Provider wrapping Spreadsheet/DataWrapper. These would need to adopt whatever new interface replaces ComponentContext for data-driven components.

### Phase 1: Extract UDA Config Builder — DONE

**Goal**: Create a pure function `buildUdaConfig()` that takes the new persisted state shape (`externalSource`, `columns`, `filters`) and produces a complete UDA options object + attributes list. This function replaces the scattered logic currently split across the `useSetDataRequest` effect, `getData()` steps 3a-3b, and various helpers in `utils.jsx`.

**Key design decision**: The builder operates on the **new state shape** from the start, even though the rest of the system still uses the old shape. A thin adapter (`legacyStateToBuildInput()`) bridges old state → builder input during the transition. This means the builder is forward-looking and doesn't accumulate legacy debt.

#### 1.1 Define builder input/output types — DONE

Types are implicitly defined by the working `buildUdaConfig()` implementation and `legacyStateToBuildInput()` adapter. The shapes documented below match the actual code.

- [x] Define `BuildUdaConfigInput` — the builder's contract:
  ```javascript
  {
    externalSource: {              // from page-level data source (renamed sourceInfo)
      source_id,                   // → request routing
      view_id,                     // → table resolution
      isDms,                       // → column accessor format (data->>'col' vs col)
      env,                         // → database/API target
      columns: [{                  // → column metadata for type/meta_lookup resolution
        name, type, display,
        meta_lookup,               // → drives meta post-processing
        metadata,                  // → additional column config
      }],
    },
    columns: [{                    // user column config — drives SELECT, GROUP BY, ORDER BY, aggregation
      name,
      show,                        // → included in attributes (SELECT list)
      group,                       // → GROUP BY clause
      sort,                        // → ORDER BY clause ('asc nulls last', 'desc nulls last', '')
      fn,                          // → aggregate function (sum, count, avg, list, '')
      serverFn,                    // → server-side computed column
      meta_lookup,                 // → meta post-processing key
      excludeNA,                   // → exclude nulls filter
      table,                       // → table alias prefix (join mode only)
      // display fields (show, formatFn, justify, etc.) are NOT consumed by builder
    }],
    filters: {                     // top-level filter tree (promoted from dataRequest.filterGroups)
      op: 'AND' | 'OR',
      groups: [
        { col, op, value, usePageFilters, searchParamKey, isExternal, isMulti,
          fn, display, isNormalFilter, valueCol },
        { op: 'AND' | 'OR', groups: [...] },  // nested groups
      ]
    },
    join: {                        // optional — multi-source mode
      sources: { alias: dataSourceId | null },
      on: [{ type, tables, on }],
    },
    pageFilters: {},               // runtime: URL search params for usePageFilters conditions
  }
  ```
- [x] Define `BuildUdaConfigOutput`:
  ```javascript
  {
    options: {                     // complete UDA options object for server
      filter, exclude, gt, gte, lt, lte, like,  // legacy flat filters (from filterGroups leaves)
      filterGroups,                // mapped tree with server column refs
      normalFilter,                // CASE WHEN conditions (extracted from filterGroups)
      having,                      // aggregate filter conditions (extracted from filterGroups)
      groupBy,                     // derived from columns where group=true
      orderBy,                     // derived from columns where sort is set
      fn,                          // derived from columns where fn is set
      serverFn,                    // derived from columns with serverFn config
      meta,                        // derived from columns with meta_lookup
      // join: { sources, on },    // pass-through for server (Phase 6)
    },
    attributes: [],                // SELECT column list (refNames for shown columns)
    outputSourceInfo: {},          // describes output schema (Phase 4 — stub initially)
  }
  ```

#### 1.2 Extract pure helper functions from utils.jsx — DONE

All extracted to `dataWrapper/buildUdaConfig.js`:

- [x] `attributeAccessorStr(col, isDms, isCalculated, isSystemCol)` → column reference format
- [x] `refName(column, isDms)` → server-side column reference
- [x] `reqName(col, isDms)` → full SELECT expression with AS alias
- [x] `totalName(column, isDms)` → SUM(CASE WHEN) for total row
- [x] `applyFn(col, isDms)` → wraps accessor in aggregate function SQL
- [x] `mapFilterGroupCols(node, getColumn, isDms)` → synchronous version (maps col names to server refs, no multiselect resolution)
- [x] `extractHavingFromFilterGroups(node)` → separates conditions with `fn`
- [x] `extractNormalFiltersFromGroups(node)` → separates `isNormalFilter` conditions
- [x] `applyPageFilters(filterTree, pageFilters)` → applies URL params to usePageFilters conditions
- [x] `buildColumnsWithSettings(columns, sourceColumns, isDms)` → enriches columns with refName/reqName/totalName
- [x] `getColumnsToFetch(columnsWithSettings, allColumns)` → visible + formula variable columns
- [x] `buildNormalFilterColumns(allNormalFilters, columns, columnsWithSettingsByName, isDms)` → CASE WHEN expressions

**Design note**: `mapFilterGroupCols` is synchronous in the builder. As of the `array_contains` task (2026-03-27), it also converts multiselect `filter` ops to `array_contains` and `exclude` ops to `array_not_contains`, so the server handles array membership in SQL. This eliminated the need for `resolveMultiselectInFilterGroups()` entirely — multiselect resolution is no longer async.

#### 1.3 Implement buildUdaConfig() — DONE

- [x] Create `dataWrapper/buildUdaConfig.js` — single exported pure function
- [x] Derive `groupBy` from `columns` where `group === true`
- [x] Derive `orderBy` from `columns` where `sort` is set
- [x] Derive `fn` from `columns` where `fn` is set
- [x] Derive `serverFn` from `columns` with `serverFn` config
- [x] Derive `meta` from `columns` with `meta_lookup`
- [x] Derive `attributes` from `columnsToFetch` using `reqName()` for server refs
- [x] Process `filters` tree: `extractNormalFiltersFromGroups()` → `mapFilterGroupCols()` → `extractHavingFromFilterGroups()`
- [x] Apply `pageFilters` to conditions with `usePageFilters === true` via `applyPageFilters()`
- [x] Handle `excludeNA` columns (add null exclusion to exclude filter)
- [x] Handle legacy column-based filters via `extractLegacyColumnFilters(columns)`
- [x] Handle comparison filters (gt/gte/lt/lte/like) with HAVING for aggregated columns
- [x] Return `{ options, attributes, columnsToFetch, columnsWithSettings }` (outputSourceInfo deferred to Phase 4)

#### 1.4 Create legacy adapter — DONE

- [x] `legacyStateToBuildInput(state, pageFilters)` implemented in `buildUdaConfig.js`
- [x] Maps `state.sourceInfo` → `externalSource`, `state.columns` → `columns`, `state.dataRequest.filterGroups` → `filters`
- [x] Injects `display.filterRelation` as `filters.op` when filterGroups has no explicit op
- [x] This adapter is temporary — removed once state migration (Phase 5) is complete

#### 1.5 Wire builder into existing getData() — DONE

- [ ] Replace the `useSetDataRequest` effect in `index.jsx` — deferred to Phase 2 (effects still serve as data-fetch triggers via `dataRequest` change; removing them requires the data loader hook)
- [x] Replace the inline UDA options construction in `getData()` (utils.jsx lines ~366-675) with `buildUdaConfig()` via `legacyStateToBuildInput()`
- [x] `getData()` now calls `buildUdaConfig()` for options/attributes/columnsToFetch/columnsWithSettings — no async post-processing needed
- [x] ~~Added `resolveMultiselectInFilterGroups()` async helper~~ — REMOVED (2026-03-27): server-side `array_contains`/`array_not_contains` ops handle multiselect filtering in SQL; `mapFilterGroupCols` in the builder converts multiselect ops synchronously
- [x] The data-fetching portion of `getData()` (length query, index calc, id injection, invalid state, API call, total row, post-processing) is unchanged

**Design note**: The `useSetDataRequest` effects in `index.jsx` are NOT replaced yet — they still derive `dataRequest` from columns and serve as triggers for the data-loading effects. This coupling will be broken in Phase 2 when `useDataLoader` takes over. For now, `getData()` calls `buildUdaConfig()` internally, and the `dataRequest` it receives via effects is effectively redundant (the builder re-derives everything from columns). This is intentional — it means the builder produces the same output as the effect chain, proving correctness before we remove the effects.

**Update (2026-03-27)**: `buildUdaConfig()` is now **fully synchronous**. The `array_contains` task removed all async multiselect resolution code from `utils.jsx` (~235 lines): `resolveMultiselectInFilterGroups`, the legacy flat filter multiselect resolution block in `getData()`, the old async `mapFilterGroupCols`, and duplicate extract helpers. The builder's `mapFilterGroupCols` converts multiselect `filter`→`array_contains` and `exclude`→`array_not_contains` ops, and the server handles array membership in SQL. This means Phase 2's `useDataLoader` hook can call `buildUdaConfig()` synchronously without needing any async post-processing step — simplifying the data loader design significantly.

#### 1.6 Tests — DONE

77 unit tests in `packages/dms/tests/buildUdaConfig.test.js` (Vitest, `npm test` from project root):

- [x] Unit tests for each extracted helper (isCalculatedCol, attributeAccessorStr, refName, applyFn, reqName, totalName, mapFilterGroupCols, extractHavingFromFilterGroups, extractNormalFiltersFromGroups, applyPageFilters, buildColumnsWithSettings, getColumnsToFetch)
- [x] Unit tests for `buildUdaConfig()` covering: DMS/DAMA modes, groupBy, orderBy, fn, meta, filterGroups (incl. DMS col mapping), multiselect→array_contains/array_not_contains, pageFilters, hidden cols, excludeNA, serverFn, empty input
- [x] Unit tests for `legacyStateToBuildInput()` — state mapping, filterRelation injection, pageFilters passthrough
- [x] Manual verification against live client — all data-driven sections work correctly

#### 1.7 Verify no behavior change — DONE

- [x] All existing data-driven sections produce the same API requests
- [x] All filter, sort, group, pagination behaviors work identically
- [x] Auto-save still persists state
- [x] No UI changes — purely internal refactoring (verified manually on live client)

### Phase 2: Extract Data Loader — DONE

**Goal**: Create a `useDataLoader` hook that owns the entire data-fetching lifecycle — loading state, dedup, debounce, pagination, and local filtering. The dataWrapper `index.jsx` effects for data loading (~200 lines across edit/view modes) collapse into a single hook call.

**Prerequisite**: Phase 1 complete — `buildUdaConfig()` produces `{ options, attributes, columnsToFetch, columnsWithSettings }`.

**Key simplification from Phase 1**: `buildUdaConfig()` is fully synchronous (no async multiselect resolution step). The hook can call the builder inline and immediately proceed to the fetch — no two-stage async pipeline needed. The old `resolveMultiselectInFilterGroups()` async step has been eliminated by server-side `array_contains`/`array_not_contains` ops.

**Implementation approach**: Took the pragmatic incremental path — the hook wraps `getData()` (which already calls `buildUdaConfig()` internally) rather than extracting getData's internals. This avoids touching `getData()`'s well-tested pipeline while still consolidating the loading lifecycle into one place. The deeper extraction (splitting getData into discrete steps) can happen in a future phase if needed.

#### 2.1 Define hook interface — DONE

Hook input (pragmatic interface — delegates to `getData()` internally):
```javascript
useDataLoader({
  state,        // The dataWrapper immer state (columns, sourceInfo, display, dataRequest)
  setState,     // The immer setState updater
  apiLoad,      // DMS data loader function
  component,    // Component config (fullDataLoad, keepOriginalValues, useGetDataOnPageChange)
  readyToLoad,  // Whether this component should fetch data (mode-specific gating stays in caller)
})
```

Hook output:
```javascript
{
  loading,      // true during fetch
  currentPage,  // current page index
  onPageChange, // (pageNum) => void — handles pagination fetch or local filter slice
}
```

**Design decision**: Data flows through `setState()` (writing to `draft.data`, `draft.display.totalLength`, etc.) rather than being returned directly by the hook. This preserves compatibility with all existing downstream consumers (Spreadsheet, Card, Graph) that read data from ComponentContext state. Extracting data out of the shared state is Phase 3's job (clean section↔dataWrapper interface).

#### 2.2 Hook implementation — DONE

Created `dataWrapper/useDataLoader.js` containing:

- [x] **Local filters** — `getFilteredData()` logic (client-side slicing by column localFilter values, text search vs select/multiselect handling)
- [x] **Local filter reset** — clears `localFilteredData` when filters are removed
- [x] **Fetch key dedup** — `JSON.stringify` of relevant state fields (columns config, filterGroups, source/view ids, pageSize, showTotal) compared against `lastFetchKeyRef`. Replaces old `preventDuplicateFetch + isEqual(state.dataRequest, state.lastDataRequest)` pattern
- [x] **Debounced main load effect** — 300ms setTimeout, calls `getData()` for server fetch or `getFilteredData()` for local filter path
- [x] **Page change handler** — routes to local filter slice when active, otherwise fetches via `getData()` with page offset. Supports both replace (pagination) and append (infinite scroll) via `state.display.usePagination`

#### 2.3 Consolidate loading effects from index.jsx — DONE

- [x] Removed `useSetDataRequest` effect from both Edit and View (~60 lines each) — now redundant because `buildUdaConfig()` re-derives everything from columns directly (the intermediate `dataRequest` trigger is gone)
- [x] Removed data-loading `useEffect` from both Edit (~35 lines) and View (~33 lines)
- [x] Removed `onPageChange` handlers from both Edit (~25 lines) and View (~22 lines)
- [x] Removed `[loading, setLoading]` and `[currentPage, setCurrentPage]` state from both components
- [x] Removed `localFilters`/`hasLocalFilters`/`getFilteredData` logic from both components (~45 lines each)
- [x] Removed `filterOptions`/`orderBy` memos from View (~28 lines) — were only used by the removed `useSetDataRequest` effect
- [x] Replaced all of the above with single hook call in each component:
  ```javascript
  // Edit
  const { loading, currentPage, onPageChange } = useDataLoader({
      state, setState, apiLoad, component,
      readyToLoad: isValidState,
  });

  // View
  const { loading, currentPage, onPageChange } = useDataLoader({
      state, setState, apiLoad, component,
      readyToLoad: isValidState && (state.display.readyToLoad || state.display.allowEditInView),
  });
  ```

#### 2.4 Handle local filters — DONE

- [x] `getFilteredData()` logic moved into hook — client-side slicing when local filters active
- [x] Hook writes `localFilteredData` and `filteredLength` to state via `setState()` (downstream consumers read from state)
- [x] `onPageChange` routes to local slice when local filters active, API fetch otherwise
- [x] Local filters derived from `state.columns` inside the hook (no separate input needed)

#### 2.5 Handle mapped_options loading — DEFERRED

- [x] Kept as separate concern in `index.jsx` — NOT folded into `useDataLoader` (correct decision, different data source)
- [ ] Extract into `useColumnOptions` hook — deferred to Phase 3 (section↔dataWrapper interface cleanup)

#### 2.6 Stop persisting `data` in element-data — DEFERRED

- [ ] Deferred to Phase 3 — requires changing the save effect and `convertOldState()`. Currently the hook writes data to shared state (`setState(draft => { draft.data = ... })`), and the save effect still persists the full state blob. This is safe for now but wasteful.

#### 2.7 Wire hook into dataWrapper index.jsx — DONE

- [x] Edit-mode: replaced ~165 lines of loading/dedup/filter/pagination logic with 4-line hook call
- [x] View-mode: replaced ~162 lines with 4-line hook call
- [x] Kept in both: page filter sync effect, loadOptionsData effect, save/onChange effect, CRUD handlers
- [x] Kept in View only: hideSection effect, convertOldState effect, setReadyToLoad callback
- [x] Build verified: Vite transform phase completed all 2588 modules with zero compilation errors

#### 2.8 Preload compatibility fix — DONE

Phase 2's fetchKey dedup broke compatibility with `preloadSectionData.js` (api layer). The old dedup used `isEqual(dataRequest, lastDataRequest)` + `preventDuplicateFetch`, which the preloader set up via `enrichDataRequest()`. The new `useDataLoader` uses `fetchKey` string comparison against `lastFetchKeyRef`, which started as `null` — causing a redundant re-fetch of already-preloaded data on every mount.

**Fix**:
- Extracted `computeFetchKey(state)` as a standalone function (was inline in `useMemo`)
- Seeded `lastFetchKeyRef` from preloaded state: `useRef(state.data?.length && state.dataRequest ? computeFetchKey(state) : null)` — when preloadSectionData has already loaded data, the initial fetchKey matches the ref, so the load effect skips
- `enrichDataRequest()` in preloadSectionData is no longer load-bearing for dedup (computeFetchKey reads `filterGroups` from `dataRequest`, not the enriched fields like `filter`/`exclude`/`orderBy`). It's harmless but could be simplified in a future cleanup

**Files changed**: `dataWrapper/useDataLoader.js`

#### 2.9 Tests — DEFERRED

- [ ] Hook tests require React testing utilities (react-testing-library or similar) for hook testing — more complex than pure function tests. Deferred to when the hook interface stabilizes further.
- [ ] Preload compatibility: verify on live client that preloaded sections don't re-fetch on mount (check for absence of duplicate network requests in dev tools)
- [x] Integration: manual verification on live client pending user confirmation

### Phase 3: Clean Section ↔ DataWrapper Interface — NOT STARTED

**Goal**: Reduce coupling between section.jsx and the dataWrapper by extracting duplicated hooks and defining a structured editing API. This phase does NOT move state ownership — that happens in the combined Phase 5 when config moves to page level. Phase 3 is scoped to: deduplicate logic, stop persisting runtime data, and replace raw `setState` calls from the section menu with a well-defined API that will survive the Phase 5 restructuring.

**Prerequisite**: Phases 1-2 complete — `buildUdaConfig()` + `useDataLoader` already centralize the two biggest pieces of internal logic.

**Deferred items landing in Phase 3**:
- Extract `useColumnOptions` hook (mapped_options loading) — from Phase 2.5
- Stop persisting `data` in element-data — from Phase 2.6

**What Phase 3 intentionally does NOT do** (deferred to Phase 5):
- Move state ownership out of section.jsx
- Move useDataSource into dataWrapper
- Create/remove ComponentContext providers
- Change where `useImmer` + `convertOldState` lives

---

#### 3.0 Inventory: Who reads what from ComponentContext — RESEARCH

Before defining the editing API, catalog every consumer. This informs both Phase 3 (what the API must cover) and Phase 5 (what changes when state moves).

**Current ComponentContext shape** (provided by section.jsx):
```javascript
{ state, setState, apiLoad, apiUpdate, controls, isActive, activeStyle, sectionId }
```

**Consumers by field** (from grep of `useContext(ComponentContext)`):

| Field | Consumers | Notes |
|-------|-----------|-------|
| `state` + `setState` | dataWrapper Edit/View, Spreadsheet, Card, Graph, RenderFilters, ComplexFilters, ExternalFilters, Pagination, Attribution, footer, header, richtext, FilterComponent, ValidateComponent, UploadComponent, ConditionValueInput, mnyHeaderDataDriven, components/index.jsx (Edit+View) | Nearly everything |
| `apiLoad` | dataWrapper Edit/View, RenderFilters, ConditionValueInput, ValidateComponent, UploadComponent | Data fetching |
| `apiUpdate` | dataWrapper Edit/View, ValidateComponent, UploadComponent | Mutations |
| `controls` | Spreadsheet, Card, Graph | Component-specific control panel config |
| `isActive` | Spreadsheet | Active styling toggle |
| `activeStyle` | Pagination | Custom styling |
| `sectionId` | richtext | Lexical editor instance key |

**Key insight**: `state` and `setState` are used by *everything*, but most leaf components only read specific slices:
- Spreadsheet reads: `columns, sourceInfo, display, data, localFilteredData, fullData` from state; writes nothing except via CRUD callbacks
- Card reads: `columns, display, data, localFilteredData` from state; writes via `setState` for column config changes
- Graph reads: `columns, display, data` from state; writes via `setState` for graph config
- Pagination reads: `state.display.{totalLength, filteredLength, pageSize, usePagination}`
- Attribution reads: `state.sourceInfo.{source_id, name, view_name, updated_at, baseUrl}`
- RenderFilters reads/writes: `state.columns[].filters`, `state.dataRequest.filterGroups`, needs `apiLoad`
- footer reads: `state.display`

**Section menu reads/writes on state** (from sectionMenu.jsx + controls_utils.js):
- **Reads**: `state.display` (display conditions, totalLength), `state.columns` (column count, list), `state.sourceInfo.columns` (all available columns)
- **Writes via `setState`**:
  - `updateDisplayValue(key, value, onChange, setState)` → `draft.display[key] = value` + side effects (allowEditInView propagation)
  - `updateColumns(column, key, value, onChange, setState)` → column property changes + group/fn cascading logic
  - `updateAllColumns(key, value, onChange, setState)` → batch column property update
  - `duplicate(column, setState)` → clone column with `isDuplicate` + `copyNum`
  - `resetColumn(column, setState)` → remove column from `draft.columns`
  - `resetAllColumns(setState)` → clear all columns and dataRequest
  - `toggleIdFilter(setState)` → add/remove system `id` column
  - `toggleGlobalVisibility(show, setState)` → show/hide all source columns with fn cascading
  - `addFormulaColumn(column, setState)` → add calculated formula column
  - `addCalculatedColumn(column, setState)` → add calculated column
  - `handlePaste(e, setKey, setState, value, onChange)` → paste section config (replaces state)
  - `ComplexFilters` component receives `state, setState` directly
  - `ColumnManager` receives `state, setState` directly
  - Custom control types: `item.type({ value, setValue, state, setState })` — component-defined controls get raw state access

---

#### 3.1 Extract usePageFilterSync hook — DONE

The page filter sync effect is duplicated identically in Edit (index.jsx:127-164) and View (index.jsx:387-428), with one difference: View also sets `readyToLoad = true` on filter change.

**Create**: `dataWrapper/usePageFilterSync.js`

```javascript
/**
 * usePageFilterSync — syncs page-level filters into filterGroups tree.
 *
 * @param {Object}   state    - dataWrapper state (reads dataRequest.filterGroups)
 * @param {Function} setState - immer updater
 * @param {boolean}  setReadyOnChange - if true, sets display.readyToLoad on filter change (View mode)
 */
export function usePageFilterSync({ state, setState, setReadyOnChange = false })
```

**Logic**: Same tree-walk as today. Reads `pageState.filters` from `PageContext`. Walks `state.dataRequest.filterGroups`, updates conditions where `usePageFilters: true`.

**Files changed**:
- New: `dataWrapper/usePageFilterSync.js`
- Modified: `dataWrapper/index.jsx` — replace duplicated effects in Edit and View with hook call

---

#### 3.2 Extract useColumnOptions hook — DONE

The mapped_options loading effect is duplicated in Edit (index.jsx:167-247) and View (index.jsx:430-510) with only the gate condition differing.

**Create**: `dataWrapper/useColumnOptions.js`

```javascript
/**
 * useColumnOptions — loads option lists for columns with mapped_options config.
 *
 * @param {Object}   state     - dataWrapper state (reads columns, sourceInfo)
 * @param {Function} setState  - immer updater
 * @param {Function} apiLoad   - DMS data loader
 * @param {Object}   component - component config (keepOriginalValues)
 * @param {boolean}  enabled   - gate condition (differs between Edit and View)
 */
export function useColumnOptions({ state, setState, apiLoad, component, enabled })
```

**Edit gate**: `!!cms_context` (don't load unless on Table/Validate page)
**View gate**: `allowEdit || state.display.allowAdddNew || state.columns?.some(c => c.allowEditInView && c.mapped_options)`

**Files changed**:
- New: `dataWrapper/useColumnOptions.js`
- Modified: `dataWrapper/index.jsx` — replace duplicated effects with hook call

---

#### 3.3 Define the dataWrapper editing API — DONE

**Motivation**: The section menu (sectionMenu.jsx, ColumnManager.jsx, ComplexFilters, controls_utils.js) currently calls raw `setState` to modify dataWrapper state. When config moves to page level in Phase 5, the backing store changes but the editing operations stay the same. By wrapping these operations in a named API now, all external consumers (section menu, future page-level panel, modal pop-outs) call the same interface. Only the implementation changes in Phase 5.

**Create**: `dataWrapper/useDataWrapperAPI.js`

The hook takes `state` and `setState` (wherever they live) and returns a structured API object:

```javascript
/**
 * useDataWrapperAPI — structured editing interface for dataWrapper config.
 *
 * Wraps raw setState calls from controls_utils.js and sectionMenu.jsx into
 * named operations. External consumers (section menu, page data sources panel,
 * modal editors) call this API instead of raw setState.
 *
 * @param {Object}   state    - dataWrapper immer state
 * @param {Function} setState - immer updater
 * @returns {Object} API object with config, runtime, and mutation methods
 */
export function useDataWrapperAPI({ state, setState })
```

**Return shape**:

```javascript
{
  // ── Read access (snapshots) ──
  config: {                          // persisted config fields
    columns,                         // state.columns
    display,                         // state.display
    sourceInfo,                      // state.sourceInfo
    dataRequest,                     // state.dataRequest
  },
  runtime: {                         // transient runtime fields
    data,                            // state.data
    fullData,                        // state.fullData
    localFilteredData,               // state.localFilteredData
    totalLength,                     // state.display.totalLength
    filteredLength,                  // state.display.filteredLength
    invalidState,                    // state.display.invalidState
    hideSection,                     // state.display.hideSection
  },

  // ── Display operations ──
  setDisplay(key, value),            // wraps updateDisplayValue — handles allowEditInView propagation
                                     // also accepts onChange callback for component-specific side effects

  // ── Column operations ──
  updateColumn(column, key, value, onChange),  // wraps updateColumns — handles group/fn cascading
  updateAllColumns(key, value, onChange),      // wraps updateAllColumns — batch property change
  duplicateColumn(column),                     // wraps duplicate
  resetColumn(column),                         // wraps resetColumn — removes from columns array
  resetAllColumns(),                           // wraps resetAllColumns — clears columns + dataRequest
  toggleIdFilter(),                            // wraps toggleIdFilter — adds/removes system id column
  toggleGlobalVisibility(show),                // wraps toggleGlobalVisibility — show/hide all + fn cascading
  addFormulaColumn(column),                    // wraps addFormulaColumn
  addCalculatedColumn(column),                 // wraps addCalculatedColumn
  reorderColumns(newOrder),                    // direct draft.columns reorder

  // ── Filter operations ──
  // (ComplexFilters currently takes state+setState directly — wrapping individual
  // filter operations is lower priority since ComplexFilters is a self-contained component.
  // For Phase 3, pass the API object to ComplexFilters and it can use state + setState from it.
  // Phase 5 will need to separate filterGroups editing from the rest of state.)

  // ── Raw access (escape hatch) ──
  // Needed for: ComplexFilters, ColumnManager, custom control types that receive (state, setState).
  // These are the consumers that Phase 5 will need to refactor to use named operations.
  state,                             // raw state reference
  setState,                          // raw immer updater
}
```

**Implementation**: The hook body is thin — each method delegates to the existing functions in `controls_utils.js`, just pre-binding `setState`:

```javascript
export function useDataWrapperAPI({ state, setState }) {
    // Column operations — delegate to controls_utils with pre-bound setState
    const updateColumn = useCallback(
        (column, key, value, onChange) => updateColumns(column, key, value, onChange, setState),
        [setState]
    );
    const setDisplay = useCallback(
        (key, value, onChange) => updateDisplayValue(key, value, onChange, setState),
        [setState]
    );
    // ... etc for each operation ...

    return useMemo(() => ({
        config: {
            columns: state.columns,
            display: state.display,
            sourceInfo: state.sourceInfo,
            dataRequest: state.dataRequest,
        },
        runtime: {
            data: state.data,
            fullData: state.fullData,
            localFilteredData: state.localFilteredData,
            totalLength: state.display?.totalLength,
            filteredLength: state.display?.filteredLength,
            invalidState: state.display?.invalidState,
            hideSection: state.display?.hideSection,
        },
        setDisplay,
        updateColumn,
        updateAllColumns: useCallback((key, value, onChange) => updateAllColumnsFn(key, value, onChange, setState), [setState]),
        duplicateColumn: useCallback((column) => duplicateFn(column, setState), [setState]),
        resetColumn: useCallback((column) => resetColumnFn(column, setState), [setState]),
        resetAllColumns: useCallback(() => resetAllColumnsFn(setState), [setState]),
        toggleIdFilter: useCallback(() => toggleIdFilterFn(setState), [setState]),
        toggleGlobalVisibility: useCallback((show) => toggleGlobalVisibilityFn(show, setState), [setState]),
        addFormulaColumn: useCallback((column) => addFormulaColumnFn(column, setState), [setState]),
        addCalculatedColumn: useCallback((column) => addCalculatedColumnFn(column, setState), [setState]),
        state,
        setState,
    }), [state, setState, setDisplay, updateColumn]);
}
```

**Where the API is created and consumed**:

In Phase 3, state still lives in section.jsx. So section.jsx creates the API and passes it down:

```javascript
// section.jsx (Phase 3 — state still here)
const [state, setState] = useImmer(convertOldState(...));
const dwAPI = useDataWrapperAPI({ state, setState });

// Section menu uses the API
const sectionMenuItems = getSectionMenuItems({
    sectionState: { ..., state: dwAPI.config },   // reads config snapshot
    actions: { ..., dwAPI },                       // writes through API
    ...
});

// DataWrapper receives the API (or continues reading from ComponentContext — see 3.5)
<ComponentContext.Provider value={{ ...dwAPI, apiLoad, apiUpdate, controls, ... }}>
```

**Phase 5 change**: When config moves to page level, the API is created at the page level (or wherever config state lives) and passed down to both sections and the page data sources panel. The API methods stay the same — only the backing `state`/`setState` changes from section-level immer to page-level state management. The section menu and the page panel both call `dwAPI.setDisplay(...)`, `dwAPI.updateColumn(...)`, etc.

---

#### 3.4 Wire section menu to use the editing API — DONE

**Goal**: Replace raw `setState` calls in sectionMenu.jsx, ColumnManager.jsx, and controls_utils consumers with calls through the `dwAPI` object.

**Step 3.4a: sectionMenu.jsx**

Currently `getSectionMenuItems` receives `{ actions: { setState } }` and passes `setState` to `updateDisplayValue`, `controlItemTransformers`, `handlePaste`, etc.

Change: receive `dwAPI` instead. The `controlItemTransformers` call `dwAPI.setDisplay(key, value)` instead of `updateDisplayValue(key, value, onChange, setState)`.

```javascript
// Before (sectionMenu.jsx)
onClick: () => updateDisplayValue(item.key, opt.value, item.onChange, setState)

// After
onClick: () => dwAPI.setDisplay(item.key, opt.value, item.onChange)
```

For custom control types that receive `(state, setState)` as a function:
```javascript
// Before
type: () => item.type({ value, setValue, state, setState })

// After — pass raw access through API escape hatch (Phase 5 will tighten this)
type: () => item.type({ value, setValue: v => dwAPI.setDisplay(item.key, v, item.onChange), state: dwAPI.state, setState: dwAPI.setState })
```

**Step 3.4b: ColumnManager.jsx**

Currently receives `state, setState` as props. Change to receive `dwAPI`:

```javascript
// Before
<ColumnManager state={state} setState={setState} resolvedControls={...} ... />

// After
<ColumnManager dwAPI={dwAPI} resolvedControls={...} ... />
```

Inside ColumnManager, replace:
- `updateColumns(column, key, value, onChange, setState)` → `dwAPI.updateColumn(column, key, value, onChange)`
- `duplicate(column, setState)` → `dwAPI.duplicateColumn(column)`
- `resetColumn(column, setState)` → `dwAPI.resetColumn(column)`
- `resetAllColumns(setState)` → `dwAPI.resetAllColumns()`
- `toggleIdFilter(setState)` → `dwAPI.toggleIdFilter()`
- `toggleGlobalVisibility(show, setState)` → `dwAPI.toggleGlobalVisibility(show)`
- `addFormulaColumn(col, setState)` → `dwAPI.addFormulaColumn(col)`
- `addCalculatedColumn(col, setState)` → `dwAPI.addCalculatedColumn(col)`
- Direct `setState(draft => { ... })` for column reorder → `dwAPI.reorderColumns(newOrder)` or raw `dwAPI.setState`
- Read `state.columns`, `state.sourceInfo.columns` → `dwAPI.config.columns`, `dwAPI.config.sourceInfo.columns`

**Step 3.4c: ComplexFilters**

Currently receives `state, setState` as props. For Phase 3, pass through raw access:
```javascript
<ComplexFilters state={dwAPI.state} setState={dwAPI.setState} />
```

Phase 5 will extract individual filter operations into the API. ComplexFilters is a self-contained filter tree editor — wrapping every tree mutation as a named API method now would be premature. The raw escape hatch is fine.

**Files changed**:
- Modified: `sectionMenu.jsx` — replace `setState` calls with `dwAPI` methods
- Modified: `ColumnManager.jsx` — replace `state`/`setState` with `dwAPI`
- Modified: `controls_utils.js` — no changes (functions stay as-is, they're called by the API hook internally)
- Modified: `section.jsx` — create `dwAPI`, pass to menu and components

---

#### 3.5 Stop persisting `data` in element-data — DONE

**Problem**: The save effect (Edit index.jsx:252-255) serializes the entire state including `data` (the fetched rows). This bloats the saved element-data JSON, slows saves, and causes stale data to be persisted.

**Fix**: Strip runtime-only fields before saving. The runtime fields are exactly the ones in `dwAPI.runtime`:

```javascript
// Runtime fields to strip before persisting
const RUNTIME_FIELDS = ['data', 'fullData', 'localFilteredData', 'lastDataRequest'];
const RUNTIME_DISPLAY_FIELDS = ['totalLength', 'filteredLength', 'invalidState', 'hideSection'];
```

```javascript
// dataWrapper/index.jsx Edit save effect
useEffect(() => {
    if (!isEdit || !isValidState) return;
    const toSave = { ...state };
    // Strip runtime fields
    RUNTIME_FIELDS.forEach(f => delete toSave[f]);
    if (toSave.display) {
        toSave.display = { ...toSave.display };
        RUNTIME_DISPLAY_FIELDS.forEach(f => delete toSave.display[f]);
    }
    const serialized = JSON.stringify(toSave);
    if (serialized !== value) {
        onChange(serialized);
    }
}, [state]);
```

**Also update** `convertOldState` to handle the case where persisted data is missing — it should initialize `data: []` as default, which it already does.

**Impact on preloadSectionData**: The preloader injects `data` into the element-data JSON for the initial render. This is fine — the data is consumed on mount and then re-derived by `useDataLoader`. The save effect strips it before persisting. The preload→mount→save cycle works:
1. Preloader sets `data` in element-data JSON
2. dataWrapper mounts, `convertOldState` parses it, state has `data`
3. `useDataLoader` sees seeded `lastFetchKeyRef`, skips re-fetch
4. Save effect strips `data` before persisting — clean save

**Defining the config/runtime boundary explicitly here** also sets up Phase 5. The `config` fields are what moves to page-level data sources. The `runtime` fields stay per-section (each section has its own data slice, pagination state, etc. even when sharing a config).

---

#### 3.6 Verify no behavior change — INTEGRATION TESTING

- [ ] Edit mode: column config changes persist correctly (via dwAPI)
- [ ] Edit mode: display setting changes via section menu work (via dwAPI)
- [ ] Edit mode: source/view picker works (unchanged — still useDataSource in section)
- [ ] Edit mode: page filter sync works (via usePageFilterSync hook)
- [ ] Edit mode: mapped_options loading works (via useColumnOptions hook)
- [ ] Edit mode: ColumnManager fully functional (duplicate, reset, reorder, formula, calculated)
- [ ] Edit mode: ComplexFilters functional (raw state/setState escape hatch)
- [ ] Edit mode: custom control types functional (receive state/setState through API)
- [ ] View mode: data loads on mount
- [ ] View mode: preloaded data is not re-fetched
- [ ] View mode: page filter sync triggers readyToLoad + fetch
- [ ] View mode: hideSection logic works
- [ ] View mode: CRUD (update/add/delete) works
- [ ] View mode: refresh button works
- [ ] Non-data components (lexical, Filter, Upload, Validate) unchanged
- [ ] `data` is no longer persisted in element-data (check saved JSON)
- [ ] Build compiles with zero errors

---

#### Phase 3 Implementation Order & Status

1. **3.1** — Extract `usePageFilterSync` hook — **DONE**
   - Created `dataWrapper/usePageFilterSync.js`
   - Replaced duplicated effects in Edit (~38 lines) and View (~41 lines) with single hook call each
   - Removed `pageState` destructuring and `isGroup` import from index.jsx
   - Removed `PageContext` import from index.jsx (hook reads it internally)

2. **3.2** — Extract `useColumnOptions` hook — **DONE**
   - Created `dataWrapper/useColumnOptions.js`
   - Replaced duplicated effects in Edit (~80 lines) and View (~80 lines) with single hook call each
   - Edit gate: `!!cms_context`, View gate: `allowEdit || allowAdddNew || allowEditInView columns`

3. **3.3** — Define `useDataWrapperAPI` hook — **DONE**
   - Created `sections/useDataWrapperAPI.js`
   - Exports: `config` (columns, display, sourceInfo, dataRequest), `runtime` (data, fullData, etc.), named mutation methods, raw `state`/`setState` escape hatch
   - Also exports `RUNTIME_FIELDS` and `RUNTIME_DISPLAY_FIELDS` constants (used by save effect)

4. **3.4** — Wire section menu + ColumnManager to use the API — **DONE**
   - `section.jsx`: creates `dwAPI = useDataWrapperAPI({state, setState})`, passes to `getSectionMenuItems`
   - `sectionMenu.jsx`: all `updateDisplayValue(..., setState)` → `dwAPI.setDisplay(...)`, removed `controls_utils` import
   - `ColumnManager.jsx`: receives `dwAPI` prop instead of `state`/`setState`, all `updateColumns/duplicate/resetColumn/etc` → `dwAPI.updateColumn/duplicateColumn/resetColumn/etc`
   - `ComplexFilters`: receives `dwAPI.state`/`dwAPI.setState` (raw escape hatch, Phase 5 tightens)
   - Custom control types: receive `state: dwAPI.state, setState: dwAPI.setState` (escape hatch)

5. **3.5** — Stop persisting runtime fields in element-data — **DONE**
   - Save effect strips `RUNTIME_FIELDS` (`data`, `fullData`, `localFilteredData`, `lastDataRequest`) and `RUNTIME_DISPLAY_FIELDS` (`totalLength`, `filteredLength`, `invalidState`, `hideSection`) before `JSON.stringify`
   - Preload compatibility preserved (preloaded data consumed on mount, stripped on save)

6. **3.6** — Integration testing — **PENDING MANUAL VERIFICATION**

---

#### Phase 3 → Phase 5 Handoff Notes

The following decisions and context from Phase 3 discussions are critical for Phase 5 planning:

**1. Config/runtime split is the right internal model**

DataWrapper state is two things:
- **Config** (columns, display settings, filterGroups, sourceInfo, dataRequest) — persisted, edited via section menu or page panel
- **Runtime** (data, fullData, localFilteredData, totalLength, filteredLength, invalidState, hideSection) — derived from config + fetch, transient

Phase 3 defines these boundaries explicitly in `RUNTIME_FIELDS` / `RUNTIME_DISPLAY_FIELDS` constants and in the `dwAPI.config` / `dwAPI.runtime` split. Phase 5 makes the split structural: config moves to page-level `dataSources` map, runtime stays per-section in dataWrapper.

**2. Data sources are page-level entities, not section-level**

Multiple sections can reference the same dataWrapper config with different display settings (pagination, local filters). Some configs exist purely as intermediate chain nodes never bound to a section (Phase 4 chainability). This means:
- Config ownership moves to `page.dataSources` map (keyed by `dataSourceId`)
- Section element-data shrinks to: `{ dataSourceId, display, localOverrides }`
- DataWrapper receives resolved config as a prop from the page data source system
- `useDataSource` moves from section to the page-level data sources panel

**3. The editing API (`useDataWrapperAPI`) is the stable interface**

When config moves to page level, the API stays the same — the section menu, the page data sources panel, and any modal pop-out all call `dwAPI.setDisplay(...)`, `dwAPI.updateColumn(...)`, etc. Only the backing store changes:
- Phase 3: `useDataWrapperAPI({ state, setState })` where state is section-level immer
- Phase 5: `useDataWrapperAPI({ state, setState })` where state is a slice of page-level dataSources

The API is deliberately designed to work with either backing store. Consumer code doesn't change.

**4. Section-specific vs shared config fields**

When multiple sections share a data source, some fields are per-section and some are shared:
- **Shared** (lives in page dataSources): `sourceInfo`, `columns` (schema + user settings), `filters`/`filterGroups`, `join` config
- **Per-section** (lives in section element-data): `display` (pageSize, striped, showTotal, etc.), local filter state, pagination position

The `dwAPI` must route writes to the correct store. `dwAPI.setDisplay(...)` writes to section state. `dwAPI.updateColumn(...)` writes to page-level data source. Phase 5 implementation:
```javascript
// Phase 5 version of useDataWrapperAPI
export function useDataWrapperAPI({ dataSource, setDataSource, sectionDisplay, setSectionDisplay }) {
    return {
        config: { ...dataSource, display: sectionDisplay },
        setDisplay: (key, value, onChange) => setSectionDisplay(key, value, onChange),  // section-level
        updateColumn: (col, key, value, onChange) => setDataSource(/* ... */),          // page-level
        // ...
    };
}
```

**5. Page filter values are runtime, not config**

Today `usePageFilterSync` mutates `state.dataRequest.filterGroups` in place — injecting page filter values into filter nodes that have `usePageFilters: true`. This writes runtime data (current URL params, page-level filter defaults) into config state, which means:
- Page filter values get persisted in element-data (wrong — they're transient, per-navigation)
- When config is shared across sections (Phase 5), one section's resolved filter values would stomp the shared config

The correct model:
- **Config** stores filter *structure*: which columns have `usePageFilters: true`, `searchParamKey`, `operation`, etc. The `.value` field in config is the *default* or *last manually set* value, not the runtime-resolved value.
- **Runtime** resolves actual filter *values* at query time by merging config structure with current page filter state.
- `buildUdaConfig()` receives both config filterGroups (structure) and a separate resolved page filter map, composing them into final UDA options.

`preloadSectionData` already does this correctly — it keeps config filterGroups intact and passes `pageFilterMap` as a separate parameter to `injectPageFilters()` before building the query. The React-side `usePageFilterSync` takes the opposite (wrong) approach of mutating config.

**Phase 3 action**: `usePageFilterSync` (step 3.1) should be aware of this, but the fix is deferred to Phase 5. In Phase 3 the hook still mutates filterGroups in place (preserving current behavior). But the hook should be documented as "mutates config in place — Phase 5 must change this to compute resolved filters in runtime only."

**Phase 5 action**: Replace `usePageFilterSync` with a runtime resolution approach:
- Filter nodes in config keep `usePageFilters: true` + `searchParamKey` but their `.value` is not mutated
- `useDataLoader` (or `buildUdaConfig`) receives a `pageFilterMap` parameter
- The builder merges page filter values into the UDA options at query time, without touching config state
- The `RUNTIME_DISPLAY_FIELDS` / runtime boundary must include "resolved filter values" as a concept

This also means `computeFetchKey` in `useDataLoader` needs to include page filter values in the key (so filter changes trigger re-fetch), but the key should read from the resolved map, not from mutated config nodes.

**6. Escape hatches that Phase 5 must close**

Phase 3's API includes `state` and `setState` raw access for consumers that are too complex to wrap now:
- `ComplexFilters` — receives raw `state, setState`. Phase 5 needs to either: (a) make ComplexFilters operate on an isolated filterGroups slice, or (b) add named filter operations to the API
- Custom control types — `item.type({ state, setState })`. Phase 5 needs to audit which controls actually need raw state access vs. which can use the API
- `handlePaste` — replaces entire state from clipboard. Phase 5 needs a `dwAPI.replaceConfig(newConfig)` that routes fields to the correct store
- `ColumnManager` direct `setState` for reorder — Phase 3 adds `reorderColumns()` but ColumnManager may still use raw access for edge cases

**6. Source picker moves to page-level UI**

The section menu's "Dataset" section (source picker, version picker) currently calls `onSourceChange`/`onViewChange` from `useDataSource`. In Phase 5, source selection happens in the page data sources panel, not the section menu. The section menu would instead show a "Data Source" picker listing page-level sources by name, and link to the data sources panel for editing.

### Phase 4: Output SourceInfo & Chainability — DONE

**Goal**: Make each dataWrapper self-describing — it consumes a source and produces an `outputSourceInfo` that describes what comes out (column names, types, whether they're aggregated, renamed, or derived). This enables chainability: one dataWrapper's output becomes another's input. Phase 4 focuses on computing and exposing outputSourceInfo; the actual chaining mechanism (joining/composing queries) is Phase 6.

**Prerequisite**: Phase 3 complete — `useDataWrapperAPI` provides the structured interface. Phase 1's `buildUdaConfig` is the natural place to compute output schema since it already knows what columns, functions, and transforms are applied.

**Why this matters before Phase 5**: When data sources move to page level (Phase 5), the page-level data sources panel needs to show what each source produces — what columns are available for downstream consumers, what types they are, whether they're grouped/aggregated. Without outputSourceInfo, a user configuring a join or chain would have to mentally trace through column settings to figure out what's available. OutputSourceInfo makes the data source graph inspectable.

---

#### 4.0 What is outputSourceInfo? — DESIGN

OutputSourceInfo is a computed description of what a dataWrapper produces *after* all its transforms (column selection, renaming, aggregation, meta lookups, formula columns). It's derived from the same information that `buildUdaConfig` already processes — it just describes the output schema rather than the query to produce it.

**Shape:**

```javascript
outputSourceInfo: {
  columns: [
    {
      name: string,           // output column name (customName or original name)
      originalName: string,   // original source column name (before rename)
      type: string,           // output data type ('text', 'number', 'integer', etc.)
      display: string,        // display type ('text', 'number', 'multiselect', etc.)
      source: string,         // how this column was derived:
                              //   'passthrough' — direct from source, no transform
                              //   'aggregation' — result of fn (sum, count, avg, etc.)
                              //   'meta_lookup' — expanded via meta lookup
                              //   'formula'     — client-side calculated column
                              //   'calculated'  — server-side calculated column
                              //   'serverFn'    — server-side function (joinKey, etc.)
      fn: string | null,      // aggregate function if source === 'aggregation'
      meta_lookup: string | null, // meta key if source === 'meta_lookup'
    }
  ],

  // The UDA config that produces this output — needed when this source
  // is used as input to a downstream join (becomes a WITH clause).
  // Only set when the output differs from the raw source (has transforms).
  asUdaConfig: {
    options: Object,          // the UDA options object from buildUdaConfig
    attributes: string[],     // the SELECT clause
    sourceInfo: Object,       // the externalSource identity (env, view_id, etc.)
  } | null,

  // Grouping state — does this output have GROUP BY applied?
  // Important for downstream: if grouped, columns without fn are group keys.
  isGrouped: boolean,
}
```

**Key design decisions:**

1. **`columns` describes the output, not the input.** If a column has `fn: 'sum'`, the output column name is `colname` (not `colname_sum` — the reqName alias is internal to the UDA request). The output type is `'number'` regardless of the input type.

2. **`asUdaConfig` is the serializable query spec.** When a downstream dataWrapper references this as a join source, the server can compile `asUdaConfig` into a WITH clause. It contains everything needed to independently execute this query.

3. **Formula columns appear in outputSourceInfo but NOT in `asUdaConfig`.** Formula columns are client-side — they don't exist in the SQL. OutputSourceInfo includes them (so downstream consumers know they exist) but marks them as `source: 'formula'`. A downstream server-side join can't reference formula columns.

4. **Hidden columns are excluded.** If `show: false`, the column isn't in the output — a downstream consumer can't use it. This is intentional: the output schema reflects what's actually returned, not what's configured.

---

#### 4.1 Compute outputSourceInfo in buildUdaConfig — DONE

**Where**: `buildUdaConfig.js` — add an `outputSourceInfo` field to the return value.

The builder already computes `columnsWithSettings` which contains the fully enriched columns with `reqName`, `refName`, `fn`, `meta_lookup`, etc. OutputSourceInfo is derived from this.

**Implementation:**

```javascript
// At the end of buildUdaConfig, after columnsToFetch is computed:

function computeOutputSourceInfo({ columnsToFetch, columnsWithSettings, externalSource, options, attributes }) {
    const outputColumns = columnsToFetch
        .filter(c => !c.isCalculatedColumn || c.origin === 'calculated-column' || c.formula)
        .map(col => {
            const source =
                col.formula ? 'formula' :
                col.origin === 'calculated-column' ? 'calculated' :
                col.fn ? 'aggregation' :
                col.meta_lookup ? 'meta_lookup' :
                col.serverFn ? 'serverFn' :
                'passthrough';

            // Output type: aggregations produce numbers, meta lookups produce text
            const type =
                source === 'aggregation' ? 'number' :
                source === 'meta_lookup' ? 'text' :
                col.type || 'text';

            const display =
                source === 'aggregation' ? 'number' :
                source === 'meta_lookup' ? 'text' :
                col.display || 'text';

            return {
                name: col.normalName || col.name,
                originalName: col.name,
                type,
                display,
                source,
                fn: col.fn || null,
                meta_lookup: col.meta_lookup || null,
            };
        });

    const isGrouped = columnsWithSettings.some(c => c.group);

    // Only set asUdaConfig if there are transforms (not a passthrough)
    const hasTransforms = isGrouped ||
        columnsWithSettings.some(c => c.fn || c.meta_lookup || c.serverFn) ||
        Object.keys(options.filter || {}).length > 0 ||
        (options.filterGroups?.groups?.length > 0);

    const asUdaConfig = hasTransforms ? {
        options,
        attributes,
        sourceInfo: externalSource,
    } : null;

    return { columns: outputColumns, isGrouped, asUdaConfig };
}
```

**Return shape change:**
```javascript
// buildUdaConfig now returns:
{
    options,
    attributes,
    columnsToFetch,
    columnsWithSettings,
    outputSourceInfo,    // NEW
}
```

**Files changed:**
- Modified: `buildUdaConfig.js` — add `computeOutputSourceInfo`, include in return value

---

#### 4.2 Update legacyStateToBuildInput and getData — DONE

`getData()` in `utils.jsx` calls `buildUdaConfig` via `legacyStateToBuildInput`. It currently destructures only `{ options, attributes, columnsToFetch, columnsWithSettings }`. It needs to also capture `outputSourceInfo` and return it.

**Changes to getData:**
```javascript
// In getData():
const { options, attributes, columnsToFetch, columnsWithSettings, outputSourceInfo } = buildUdaConfig(builderInput);

// Return it alongside data and length:
return { length, data: dataToReturn, outputSourceInfo };
```

This lets callers of `getData` access the output schema. `useDataLoader` and `preloadSectionData` both call `getData` and can propagate it.

**Files changed:**
- Modified: `utils.jsx` — destructure and return `outputSourceInfo` from `getData`

---

#### 4.3 Expose outputSourceInfo from useDataLoader — DONE

`useDataLoader` calls `getData` and writes results to state. It should also surface `outputSourceInfo` so that the dataWrapper (and anything above it) can read the output schema.

**Approach**: Store `outputSourceInfo` in a ref (not state — it doesn't need to trigger re-renders, and it changes only when the config changes, not on every data fetch). Expose it from the hook return.

```javascript
// In useDataLoader:
const outputSourceInfoRef = useRef(null);

// In the load() function, after getData returns:
const { length, data, invalidState, outputSourceInfo } = await getData({...});
outputSourceInfoRef.current = outputSourceInfo;

// Return from hook:
return { loading, currentPage, onPageChange, outputSourceInfo: outputSourceInfoRef.current };
```

**Files changed:**
- Modified: `useDataLoader.js` — capture and expose outputSourceInfo

---

#### 4.4 Surface outputSourceInfo in useDataWrapperAPI — DONE

The `useDataWrapperAPI` hook (from Phase 3) provides the structured interface that the section menu and future page-level panel consume. Add `outputSourceInfo` to the API's `runtime` object.

Since `useDataLoader` returns it and `useDataLoader` is called inside `dataWrapper/index.jsx` (not in section.jsx where `useDataWrapperAPI` is currently created), we need a path to get it up. Options:

**Option A**: Store outputSourceInfo in the immer state (e.g., `state.outputSourceInfo`). Simple, but bloats persisted state if we're not careful — though step 3.5 already strips runtime fields, and we'd add `outputSourceInfo` to `RUNTIME_FIELDS`.

**Option B**: Pass it through ComponentContext. DataWrapper's Edit/View already provides ComponentContext — add `outputSourceInfo` to the context value. Section.jsx can read it from context... but section.jsx is the *provider* of ComponentContext, not a consumer, so this doesn't work.

**Option C**: DataWrapper stores it in a ref exposed upward. But we decided against refs for permanent architecture (Phase 3 discussion).

**Go with Option A** — store in state, strip from persistence:

```javascript
// In dataWrapper/index.jsx Edit, after useDataLoader:
const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({...});

// Write to state when it changes:
useEffect(() => {
    if (outputSourceInfo && !isEqual(state.outputSourceInfo, outputSourceInfo)) {
        setState(draft => { draft.outputSourceInfo = outputSourceInfo; });
    }
}, [outputSourceInfo]);
```

Add `'outputSourceInfo'` to `RUNTIME_FIELDS` in `useDataWrapperAPI.js` so it's stripped from persistence.

Then `useDataWrapperAPI` exposes it:
```javascript
runtime: {
    // ... existing fields ...
    outputSourceInfo: state.outputSourceInfo,
}
```

**Files changed:**
- Modified: `dataWrapper/index.jsx` — write outputSourceInfo to state from useDataLoader
- Modified: `useDataWrapperAPI.js` — add `outputSourceInfo` to `RUNTIME_FIELDS` and `runtime` object

---

#### 4.5 Tests — DONE (16 tests added, 93 total pass)

Add tests for `computeOutputSourceInfo` to the existing `buildUdaConfig.test.js`:

- [ ] Passthrough columns: source column with `show: true`, no fn → `source: 'passthrough'`, type preserved
- [ ] Aggregated column: `fn: 'sum'` → `source: 'aggregation'`, `type: 'number'`
- [ ] Meta lookup column: `meta_lookup: 'county_name'` → `source: 'meta_lookup'`, `type: 'text'`
- [ ] Formula column: `formula: '...'` → `source: 'formula'`, included in columns
- [ ] Hidden columns: `show: false` → excluded from output
- [ ] isGrouped flag: columns with `group: true` → `isGrouped: true`
- [ ] asUdaConfig: non-passthrough config → populated with options/attributes/sourceInfo
- [ ] asUdaConfig: pure passthrough (no filters, no grouping, no fns) → `null`
- [ ] Duplicate columns: `isDuplicate: true` → each copy appears with distinct normalName
- [ ] Column rename: `customName` set → outputSourceInfo uses customName as `name`

**Files changed:**
- Modified: `packages/dms/tests/buildUdaConfig.test.js` — add outputSourceInfo test suite

---

#### 4.6 Verify end-to-end — INTEGRATION

- [ ] Build compiles with zero errors
- [ ] Existing dataWrapper behavior unchanged (outputSourceInfo is additive)
- [ ] `outputSourceInfo` visible in `dwAPI.runtime.outputSourceInfo` after data loads
- [ ] `outputSourceInfo` is NOT persisted in element-data (check saved JSON)
- [ ] `outputSourceInfo.columns` correctly reflects current column config (show, fn, meta_lookup, formula)
- [ ] `outputSourceInfo.asUdaConfig` is non-null when transforms are applied
- [ ] `outputSourceInfo.asUdaConfig` is null for a raw passthrough config

---

#### Phase 4 Implementation Order & Status

1. **4.1** — Compute outputSourceInfo in buildUdaConfig — **DONE**
   - Added `computeOutputSourceInfo()` exported function to `buildUdaConfig.js`
   - Derives output columns from `columnsToFetch` + formula columns from `columns`
   - Computes `isGrouped`, `asUdaConfig` (null for passthrough, populated for transforms)
   - Added to `buildUdaConfig` return value as step 10

2. **4.5** — Unit tests — **DONE** (16 new tests, 93 total)
   - `computeOutputSourceInfo`: passthrough type preservation, aggregation→number, meta_lookup→text, formula inclusion, hidden exclusion, calculated/serverFn sources, isGrouped flag, asUdaConfig null/populated, normalName usage
   - `buildUdaConfig integration`: includes outputSourceInfo in return, passthrough has null asUdaConfig

3. **4.2** — Thread through getData — **DONE**
   - `utils.jsx`: destructures `outputSourceInfo` from `buildUdaConfig`, includes in return value

4. **4.3** — Expose from useDataLoader — **DONE**
   - Added `outputSourceInfoRef` to hook, captured from `getData` result
   - Returned from hook alongside `loading`, `currentPage`, `onPageChange`

5. **4.4** — Surface in state + useDataWrapperAPI — **DONE**
   - `dataWrapper/index.jsx`: both Edit and View write `outputSourceInfo` to state from hook
   - `useDataWrapperAPI.js`: added `'outputSourceInfo'` to `RUNTIME_FIELDS` (stripped from persistence), added to `runtime` object

6. **4.6** — Integration testing — **PENDING MANUAL VERIFICATION**

---

#### Phase 4 → Phase 5/6 Handoff Notes

**1. Page-level data sources panel uses outputSourceInfo for display**

When the page-level data sources panel (Phase 5) shows a list of configured sources, it should display each source's output schema — "This source produces: county_name (text), total_damage (number, sum), event_count (number, count)". This comes directly from `outputSourceInfo.columns`.

**2. Chain validation in Phase 6**

When configuring a join in Phase 6, the UI needs to show which columns are available from each source for the join condition. `outputSourceInfo.columns` provides this. Additionally, the UI can warn when attempting to join on a formula column (which only exists client-side and can't participate in server-side joins).

**3. asUdaConfig becomes a WITH clause in Phase 6**

When a downstream dataWrapper references an upstream as a join source, the server receives `asUdaConfig` and compiles it into a `WITH` (CTE) clause:

```sql
WITH upstream_data AS (
  SELECT col1, sum(col2) as col2_sum
  FROM source_table
  WHERE ...
  GROUP BY col1
)
SELECT upstream_data.col1, downstream.col3
FROM downstream_table
LEFT JOIN upstream_data ON ...
```

The server needs to:
- Receive `asUdaConfig` in the join config
- Generate the CTE SQL from the nested UDA options + attributes
- Resolve column references across CTEs and direct tables

This is the heaviest Phase 6 server-side change. Phase 4 prepares the client-side data (`asUdaConfig`) that the server will consume.

**4. Formula columns can't chain server-side**

`outputSourceInfo` marks formula columns as `source: 'formula'`. Phase 6's join UI should filter these out when building server-side join conditions. However, if a downstream dataWrapper simply consumes data (not joining at the SQL level), formula columns are available in the client-side data — they just can't be referenced in SQL.

**5. outputSourceInfo stability**

OutputSourceInfo is recomputed on every call to `buildUdaConfig`. It changes when columns, filters, or grouping change — exactly when the query changes. It does NOT change when data arrives or pagination changes. This makes it safe to use as a stable dependency key for downstream config validation.

**6. Meta lookup columns in output**

A column with `meta_lookup: 'county_name'` produces TWO output values: the original value and the looked-up name. Currently `getData` post-processes meta lookups client-side (the server returns an expanded object). For chainability, the downstream consumer needs to know that `county_fips` will contain the looked-up `county_name` value after meta expansion. OutputSourceInfo marks these as `source: 'meta_lookup'` so downstream configs can account for the type change (number → text after lookup).

### Phase 5: Page-Level Data Sources + State Ownership Restructuring — NOT STARTED

**Goal**: Move data source configurations from section element-data to a page-level `dataSources` map. Multiple sections can share a data source with different display settings. Standalone data sources (chain-only, no section) are supported. The section menu edits display config (per-section) directly and links to the page panel for shared config edits. State ownership inverts: section.jsx no longer creates immer state for data components — config lives at page level, runtime lives inside dataWrapper.

**Prerequisite**: Phases 1-4 complete — `buildUdaConfig`, `useDataLoader`, `useDataWrapperAPI`, and `outputSourceInfo` all in place.

**Combined scope**: This phase merges the original Phase 5 (page-level data sources) with the state ownership restructuring originally planned for Phase 3. The decision to combine them was made because config can't live in section.jsx — it's shared across sections and may exist without any section (chain nodes).

---

#### 5.0 Architecture Overview — DESIGN

**Three state layers after Phase 5:**

```
Page (persisted in page element-data)
  └─ dataSources: {
       "ds-1": {
         id: "ds-1",
         name: "Fusion Events",
         sourceInfo: { source_id, view_id, isDms, env, columns, ... },
         columns: [{ name, show, group, sort, fn, customName, meta_lookup, ... }],
         dataRequest: { filterGroups: { op, groups } },
       },
       "ds-2": { ... }
     }

Section (persisted in section element-data)
  └─ {
       dataSourceId: "ds-1",         // ref to page-level source
       display: { pageSize, striped, showTotal, allowDownload, ... },
       // NO sourceInfo, columns, dataRequest — those live in dataSources
     }

DataWrapper (transient, per-section React state)
  └─ {
       data: [...],                  // fetched rows
       loading: boolean,
       currentPage: number,
       localFilteredData: [...],
       totalLength, filteredLength,
       outputSourceInfo: {...},
     }
```

**Key data flow:**

```
PageEdit
  ├─ Loads page item with dataSources map
  ├─ Provides dataSources via PageContext (or new DataSourceContext)
  │
  └─ SectionArray
      └─ SectionEdit/View
          ├─ Reads dataSourceId from section element-data
          ├─ Resolves config from page dataSources[dataSourceId]
          ├─ Owns section display state
          ├─ Creates dwAPI for section menu:
          │     dwAPI = useDataWrapperAPI({
          │       dataSource,        // from page dataSources
          │       setDataSource,     // writes to page dataSources
          │       sectionDisplay,    // section-level display config
          │       setSectionDisplay, // writes to section element-data
          │     })
          │
          └─ DataWrapper (child)
              ├─ Receives resolved config (dataSource + display) as props
              ├─ Creates runtime state internally (data, loading, etc.)
              ├─ Provides ComponentContext to leaf components
              └─ Calls useDataLoader with merged config + runtime
```

---

#### 5.1 Add `dataSources` to page format — DONE

Add `dataSources` as a JSON attribute to the page format so it persists alongside sections.

**File**: `patterns/page/page.format.js`

```javascript
// Add to attributes array (after section_groups, before sections):
{ key: "dataSources", type: "json", hidden: true },
{ key: "draft_dataSources", type: "json", hidden: true },
```

Using `draft_dataSources` mirrors the `draft_sections` / `sections` pattern — edits go to draft, publish copies to live. This keeps data source changes isolated to edit mode.

**Save path**: `apiUpdate({ data: { id: item.id, draft_dataSources: newMap } })` — same as any page field, flows through `dmsDataEditor` automatically.

**Files changed:**
- Modified: `page.format.js` — add `dataSources` and `draft_dataSources` attributes

---

#### 5.2 Create DataSourceContext — DONE

A new context provides page-level data sources to all descendants. This sits alongside PageContext (which provides page metadata, apiLoad/apiUpdate, etc.).

**Create**: `patterns/page/dataSourceContext.js`

```javascript
export const DataSourceContext = React.createContext({
    dataSources: {},
    setDataSource: () => {},
    removeDataSource: () => {},
    createDataSource: () => {},
});
```

**Provided by PageEdit** (and PageView):

```javascript
// In pages/edit/index.jsx:
const [draftDataSources, setDraftDataSources] = useImmer(item.draft_dataSources || {});

const dataSourceActions = useMemo(() => ({
    dataSources: draftDataSources,

    setDataSource: (id, updater) => {
        setDraftDataSources(draft => {
            if (typeof updater === 'function') {
                updater(draft[id]);
            } else {
                draft[id] = { ...draft[id], ...updater };
            }
        });
        // Persist to server
        apiUpdate({ data: { id: item.id, draft_dataSources: { ...draftDataSources, [id]: updater } } });
    },

    removeDataSource: (id) => {
        setDraftDataSources(draft => { delete draft[id]; });
        const { [id]: _, ...rest } = draftDataSources;
        apiUpdate({ data: { id: item.id, draft_dataSources: rest } });
    },

    createDataSource: (config) => {
        const id = `ds-${crypto.randomUUID().slice(0, 8)}`;
        const newSource = { id, name: config.name || 'New Source', ...config };
        setDraftDataSources(draft => { draft[id] = newSource; });
        apiUpdate({ data: { id: item.id, draft_dataSources: { ...draftDataSources, [id]: newSource } } });
        return id;
    },
}), [draftDataSources, apiUpdate, item.id]);

// Wrap page tree:
<DataSourceContext.Provider value={dataSourceActions}>
    <PageContext.Provider value={...}>
        {children}
    </PageContext.Provider>
</DataSourceContext.Provider>
```

**Design note on save batching**: The naive approach above calls `apiUpdate` on every change. In practice, data source edits (column config, filter changes) are frequent — we should debounce saves. Options:
- Debounced `apiUpdate` (300-500ms) — simple, matches how section saves work today
- Save only on explicit user action (save button) — more control, but diverges from current auto-save pattern
- Go with debounced auto-save for consistency with the rest of the system

**Files changed:**
- New: `patterns/page/dataSourceContext.js`
- Modified: `pages/edit/index.jsx` — create DataSourceContext.Provider with draft_dataSources state
- Modified: `pages/view.jsx` — create DataSourceContext.Provider with dataSources (read-only in view)

---

#### 5.3 Create Data Sources edit pane — DONE

Add a "Data Sources" tab to the page edit pane. This is the primary UI for managing page-level data source configs.

**Create**: `pages/edit/editPane/dataSourcesPane.jsx`

The pane shows:
1. **Source list**: All data sources in the page, each showing name, external source info, column count, outputSourceInfo summary
2. **Add source button**: Creates a new empty data source
3. **Source editor**: Click a source to expand/edit its config — source picker (useDataSource), column manager, filter editor, name

The source editor reuses existing components through `dwAPI`:
- Source/version picker: `useDataSource` (currently in section.jsx, will move here)
- Column manager: `<ColumnManager dwAPI={sourceDwAPI} />` — same component, different backing store
- Filter editor: `<ComplexFilters state={...} setState={...} />`

**Component structure:**

```javascript
function DataSourcesPane() {
    const { dataSources, setDataSource, removeDataSource, createDataSource } = useContext(DataSourceContext);
    const [selectedId, setSelectedId] = useState(null);

    return (
        <div>
            <h2>Data Sources</h2>
            {/* Source list */}
            {Object.values(dataSources).map(ds => (
                <DataSourceCard
                    key={ds.id}
                    dataSource={ds}
                    selected={selectedId === ds.id}
                    onSelect={() => setSelectedId(ds.id)}
                    onRemove={() => removeDataSource(ds.id)}
                />
            ))}
            <button onClick={() => { const id = createDataSource({}); setSelectedId(id); }}>
                Add Data Source
            </button>

            {/* Source editor (expanded) */}
            {selectedId && dataSources[selectedId] && (
                <DataSourceEditor
                    dataSource={dataSources[selectedId]}
                    setDataSource={(updater) => setDataSource(selectedId, updater)}
                />
            )}
        </div>
    );
}
```

**DataSourceEditor** creates a `dwAPI` for the selected data source:

```javascript
function DataSourceEditor({ dataSource, setDataSource }) {
    // Create an immer state for the data source config (local editing state)
    const [editState, setEditState] = useImmer(dataSource);

    // Sync back to page-level on changes (debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (!isEqual(editState, dataSource)) {
                setDataSource(editState);
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [editState]);

    // Create dwAPI for column manager, filter editor, etc.
    const dwAPI = useDataWrapperAPI({ state: editState, setState: setEditState });

    // useDataSource for source/version picker
    const dataSourceInfo = useDataSource({ state: editState, setState: setEditState });

    return (
        <div>
            <SourcePicker {...dataSourceInfo} />
            <ColumnManager dwAPI={dwAPI} ... />
            <ComplexFilters state={dwAPI.state} setState={dwAPI.setState} />
        </div>
    );
}
```

**Register in editPane/index.jsx:**

```javascript
import DataSourcesPane from './dataSourcesPane';

const panes = [
    { icon: 'Settings', Component: SettingsPane, ... },
    { icon: 'Database', Component: DataSourcesPane, reqPermissions: ['edit-page'] },  // NEW
    { icon: 'Sections', Component: SectionGroupsPane, ... },
    ...
];
```

**Files changed:**
- New: `pages/edit/editPane/dataSourcesPane.jsx`
- New: `pages/edit/editPane/DataSourceEditor.jsx` (or inline)
- Modified: `pages/edit/editPane/index.jsx` — add DataSourcesPane to panes array

---

#### 5.4 Restructure section element-data — DONE (dual-mode)

Section element-data for data components shrinks from the full state blob to a reference + display config:

**New section element-data (data components):**

```javascript
{
    dataSourceId: "ds-1",           // ref to page-level data source
    display: {
        pageSize: 25,
        usePagination: true,
        striped: false,
        showTotal: true,
        allowDownload: true,
        readyToLoad: true,
        allowEditInView: false,
        showAttribution: true,
        showGutters: false,
        hideIfNull: false,
        hideSection: false,         // runtime — stripped on save but kept for view mode
        filterRelation: "and",
        // ... all display fields stay here
    },
}
```

**Non-data components** (lexical, Filter, Upload, etc.) are unchanged — they don't use data sources, so their element-data stays as-is.

**convertOldState migration**: `convertOldState.js` needs a new migration path:
- If element-data has `sourceInfo` + `columns` but no `dataSourceId`: this is old-format inline config
- Migration: extract `sourceInfo`, `columns`, `dataRequest` → create a page-level data source, store `dataSourceId` + `display` in section
- This can happen lazily on first edit (section loads, detects old format, auto-migrates)

**Files changed:**
- Modified: `convertOldState.js` — add migration for inline → page-level reference format
- Modified: `section.jsx` — detect old vs new format, create data source on first edit if needed

---

#### 5.5 Restructure state ownership — CORE CHANGE

This is the central structural change. Move state creation out of section.jsx for data components.

**Step 5.5a: Section.jsx stops creating data state for data components**

Currently:
```javascript
const [state, setState] = useImmer(convertOldState(value?.['element']?.['element-data'] || '', ...));
```

After:
```javascript
// For data components with dataSourceId:
const sectionData = parseElementData(value?.['element']?.['element-data']);
const { dataSources, setDataSource } = useContext(DataSourceContext);
const dataSource = dataSources[sectionData.dataSourceId];
const [sectionDisplay, setSectionDisplay] = useImmer(sectionData.display || {});

// Create dwAPI that routes writes correctly:
const dwAPI = useDataWrapperAPI({
    dataSource,
    setDataSource: (updater) => setDataSource(sectionData.dataSourceId, updater),
    sectionDisplay,
    setSectionDisplay,
});

// For non-data components: keep current behavior (useImmer + convertOldState)
```

**Step 5.5b: useDataWrapperAPI signature change**

The API must accept either the old single-state shape (backward compat) or the new split shape:

```javascript
export function useDataWrapperAPI(args) {
    // New split interface (Phase 5):
    if (args.dataSource !== undefined) {
        const { dataSource, setDataSource, sectionDisplay, setSectionDisplay } = args;
        return buildSplitAPI({ dataSource, setDataSource, sectionDisplay, setSectionDisplay });
    }
    // Legacy single-state interface (Phase 3):
    const { state, setState } = args;
    return buildLegacyAPI({ state, setState });
}
```

The split API routes:
- `dwAPI.setDisplay(key, value)` → `setSectionDisplay(draft => { draft[key] = value })`
- `dwAPI.updateColumn(...)` → `setDataSource(draft => { /* modify draft.columns */ })`
- `dwAPI.config` → `{ ...dataSource, display: sectionDisplay }`
- `dwAPI.state` → merged view for escape hatches

**Step 5.5c: DataWrapper receives resolved config as props**

DataWrapper no longer reads config from ComponentContext. Instead it receives:

```javascript
<DataWrapper.EditComp
    config={dataSource}                    // page-level source config
    display={sectionDisplay}               // section-level display
    onDisplayChange={setSectionDisplay}     // section-level write
    component={component}
    ...
/>
```

DataWrapper creates its own runtime state internally:

```javascript
const Edit = ({ config, display, onDisplayChange, component, ... }) => {
    // Merge config + display into the shape that useDataLoader/getData expect
    const mergedState = useMemo(() => ({
        sourceInfo: config.sourceInfo,
        columns: config.columns,
        dataRequest: config.dataRequest,
        display: display,
    }), [config, display]);

    // Runtime state for data, loading, etc.
    const [runtimeState, setRuntimeState] = useState({
        data: [], fullData: null, localFilteredData: null,
    });

    // useDataLoader with merged state
    const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
        state: mergedState,
        setState: /* routes config→parent, runtime→local, display→onDisplayChange */,
        apiLoad, component,
        readyToLoad: true,
    });

    // Provide ComponentContext to leaf components (Spreadsheet, Card, Graph)
    const contextValue = useMemo(() => ({
        state: { ...mergedState, ...runtimeState },
        setState: /* routing setState */,
        apiLoad, apiUpdate, controls, ...
    }), [mergedState, runtimeState, ...]);

    return (
        <ComponentContext.Provider value={contextValue}>
            {/* existing JSX */}
        </ComponentContext.Provider>
    );
};
```

**Step 5.5d: Routing setState**

The merged `setState` provided to ComponentContext must route writes:

```javascript
const routingSetState = useCallback((updater) => {
    // Apply updater to a merged draft, then split the result
    // This is needed because leaf components (Spreadsheet, Card) still call
    // setState(draft => { draft.data = ...; draft.display.pageSize = ... })
    //
    // Strategy: apply to a temporary immer draft, diff against the merged state,
    // route changed fields to the correct store.

    // Simpler approach: categorize by field name
    const configFields = new Set(['columns', 'sourceInfo', 'dataRequest']);
    const displayFields = new Set(Object.keys(display));
    const runtimeFields = new Set(['data', 'fullData', 'localFilteredData', 'outputSourceInfo']);

    // Apply updater, inspect what changed, route accordingly
    // (Implementation detail — may use produce() from immer to get patches)
}, [config, display, runtimeState]);
```

**Design note**: The routing setState is the most complex piece. An alternative is to not provide a merged setState at all — instead provide the split API and update leaf components to use it. But that's a much larger blast radius (every component that calls `setState` needs to change). The routing approach preserves backward compat.

**Pragmatic alternative**: Instead of field-level routing, use a simpler heuristic:
- If the updater touches `draft.display.*` → `onDisplayChange`
- If the updater touches `draft.data` / `draft.fullData` / `draft.localFilteredData` → `setRuntimeState`
- Everything else → `setDataSource` (config)

Since `useDataLoader` is the only thing that writes runtime fields, and it already has a well-defined setState call, we can special-case it. The routing setState is mainly needed for display changes from the save effect and column config changes from filters/controls.

**Files changed:**
- Modified: `section.jsx` — stop creating state for data components, read from DataSourceContext
- Modified: `useDataWrapperAPI.js` — add split-state interface
- Modified: `dataWrapper/index.jsx` — receive config as props, create runtime state internally, provide ComponentContext
- Modified: `components/index.jsx` — for data components, don't create state/context (delegate to dataWrapper); for non-data components, keep current behavior

---

#### 5.6 Fix page filter resolution — RUNTIME-ONLY

Replace `usePageFilterSync` (which mutates config filterGroups in place) with runtime-only resolution.

**Step 5.6a: Remove usePageFilterSync mutation**

Instead of mutating `state.dataRequest.filterGroups`, compute a `resolvedPageFilters` map from PageContext and pass it to `buildUdaConfig` / `useDataLoader`.

```javascript
// In dataWrapper:
const { pageState } = useContext(PageContext) || {};
const resolvedPageFilters = useMemo(() => {
    return (pageState?.filters || []).reduce(
        (acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {}
    );
}, [pageState?.filters]);

// Pass to useDataLoader (which passes to getData → buildUdaConfig):
const { loading, ... } = useDataLoader({
    state: mergedState,
    setState: ...,
    apiLoad, component,
    readyToLoad: true,
    pageFilters: resolvedPageFilters,  // NEW param
});
```

**Step 5.6b: Update useDataLoader to accept pageFilters**

`useDataLoader` passes `pageFilters` to `getData`, which passes to `buildUdaConfig` via `legacyStateToBuildInput`. The builder already has a `pageFilters` parameter — it just needs to be threaded through.

Also add `pageFilters` to `computeFetchKey` so filter changes trigger re-fetch:

```javascript
const fetchKey = useMemo(() => computeFetchKey(state, pageFilters), [...deps, pageFilters]);
```

**Step 5.6c: Remove usePageFilterSync calls**

After 5.6a-b, `usePageFilterSync` is no longer needed. Remove the hook calls from dataWrapper/index.jsx and delete the file.

**Files changed:**
- Modified: `dataWrapper/index.jsx` — compute resolvedPageFilters, pass to useDataLoader, remove usePageFilterSync calls
- Modified: `useDataLoader.js` — accept pageFilters param, include in fetchKey, pass to getData
- Modified: `utils/utils.jsx` — pass pageFilters through to buildUdaConfig
- Deleted: `dataWrapper/usePageFilterSync.js`

---

#### 5.7 Section menu updates — UI WIRING

**Step 5.7a: Replace source picker with data source reference picker**

The section menu's "Dataset" section currently shows a source/version picker via `useDataSource`. Replace with a picker that lists page-level data sources by name:

```javascript
// In sectionMenu.jsx, the `dataset` section:
const dataset = {
    name: 'Data Source', icon: 'Database',
    cdn: () => currentComponent?.useDataSource && canEditSection,
    value: dataSources[sectionData.dataSourceId]?.name || 'None',
    showValue: true,
    items: [
        // List all page-level data sources
        ...Object.values(dataSources).map(ds => ({
            icon: ds.id === sectionData.dataSourceId ? 'CircleCheck' : 'Blank',
            name: ds.name,
            onClickGoBack: true,
            onClick: () => updateSectionDataSourceId(ds.id),
        })),
        { type: 'separator' },
        // Link to open data sources panel
        { name: 'Manage Data Sources...', icon: 'Settings',
          onClick: () => setEditPane({ open: true, index: /* dataSources pane index */ }) },
    ],
};
```

**Step 5.7b: Section menu display edits stay local**

Display settings (pageSize, striped, showTotal, etc.) are per-section and write to section element-data via `dwAPI.setDisplay(...)`. This already works — the dwAPI routes display writes to section state.

**Step 5.7c: Config edits link to page panel**

Column config, filter config, and source selection now live at page level. The section menu can either:
- (A) Open the data sources pane directly with the current source selected
- (B) Show a read-only summary and a link to edit

Go with (A) — clicking "Columns" or "Filters" in the section menu opens the data sources pane with the source expanded.

**Files changed:**
- Modified: `sectionMenu.jsx` — replace source picker, add data source reference picker, link config edits to page panel
- Modified: `section.jsx` — pass dataSourceId management to menu

---

#### 5.8 Backward compatibility — DONE (dual-mode in section.jsx)

Existing pages have inline config in section element-data. We need zero-breakage migration.

**Strategy: Lazy migration on first edit**

1. PageEdit loads the page. If no `draft_dataSources` field exists, it's an old page.
2. On page load, scan `draft_sections` for sections with inline `sourceInfo`/`columns`.
3. For each: extract config → create a data source in `draft_dataSources` → update section element-data to `{ dataSourceId, display }`.
4. Save the migrated page.

```javascript
// In PageEdit, after loading item:
function migrateInlineDataSources(item) {
    if (item.draft_dataSources && Object.keys(item.draft_dataSources).length) return null; // already migrated

    const dataSources = {};
    const migratedSections = (item.draft_sections || []).map(section => {
        const elementData = parseElementData(section?.element?.['element-data']);
        if (!elementData?.sourceInfo || elementData.dataSourceId) return section; // skip non-data or already migrated

        // Create data source from inline config
        const dsId = `ds-${crypto.randomUUID().slice(0, 8)}`;
        dataSources[dsId] = {
            id: dsId,
            name: elementData.sourceInfo.name || elementData.sourceInfo.view_name || `Source ${dsId}`,
            sourceInfo: elementData.sourceInfo,
            columns: elementData.columns || [],
            dataRequest: elementData.dataRequest || {},
        };

        // Slim down section element-data
        return {
            ...section,
            element: {
                ...section.element,
                'element-data': JSON.stringify({
                    dataSourceId: dsId,
                    display: elementData.display || {},
                }),
            },
        };
    });

    if (!Object.keys(dataSources).length) return null; // nothing to migrate
    return { dataSources, sections: migratedSections };
}
```

**View mode fallback**: For published pages that haven't been re-published since migration, `sections` still has inline config. `convertOldState` / the dataWrapper must handle both formats:
- If element-data has `dataSourceId` → read from page-level dataSources
- If element-data has `sourceInfo` → use inline (legacy, pre-migration)

**Files changed:**
- New: migration function in PageEdit (or utility file)
- Modified: `convertOldState.js` — handle both formats
- Modified: `dataWrapper/index.jsx` — resolve dataSourceId from DataSourceContext when present

---

#### 5.9 Publish flow — DONE

When publishing a page, `draft_dataSources` must be copied to `dataSources` (same as `draft_sections` → `sections`).

Find the publish action and add:
```javascript
apiUpdate({
    data: {
        id: item.id,
        published: 'published',
        has_changes: false,
        sections: item.draft_sections,
        section_groups: item.draft_section_groups,
        dataSources: item.draft_dataSources,  // NEW
    }
});
```

**Files changed:**
- Modified: publish action in page edit (likely in `editFunctions.jsx` or similar)

---

#### 5.10 Close Phase 3 escape hatches — CLEANUP

**Step 5.10a: ComplexFilters on isolated slice**

ComplexFilters currently receives raw `state, setState` and mutates `state.dataRequest.filterGroups`. In the split model, filterGroups lives in the page-level data source. Pass the data source's filterGroups and a setter:

```javascript
<ComplexFilters
    filterGroups={dataSource.dataRequest?.filterGroups}
    setFilterGroups={(updater) => setDataSource(dsId, draft => {
        if (!draft.dataRequest) draft.dataRequest = {};
        if (typeof updater === 'function') updater(draft.dataRequest.filterGroups);
        else draft.dataRequest.filterGroups = updater;
    })}
/>
```

This requires updating ComplexFilters to accept `filterGroups` + `setFilterGroups` props instead of raw state. The internal tree editing logic stays the same.

**Step 5.10b: Custom control types**

Audit which custom controls use `state` and `setState`. Most should work with `dwAPI.state` (merged view) and `dwAPI.setState` (routing setState). For controls that need deep access, provide the routing setState — it handles field-level routing transparently.

**Step 5.10c: handlePaste**

Add `dwAPI.replaceConfig(newConfig)` that routes fields correctly:
- `sourceInfo`, `columns`, `dataRequest` → page-level data source
- `display` → section element-data
- Ignores runtime fields

**Files changed:**
- Modified: `ComplexFilters.jsx` — accept `filterGroups` + `setFilterGroups` props (with backward compat for raw state)
- Modified: `useDataWrapperAPI.js` — add `replaceConfig` method
- Modified: `sectionMenu.jsx` — use `dwAPI.replaceConfig` for paste

---

#### 5.11 Non-data component handling — CONTEXT SPLIT

Non-data components (lexical, Filter, Upload, Validate, header) don't use data sources. They still need ComponentContext with state/setState.

**Solution**: `components/index.jsx` provides ComponentContext for non-data components. For data components, dataWrapper provides it.

```javascript
// components/index.jsx
function EditComp({ value, onChange, component, ... }) {
    if (component.useDataWrapper) {
        // DataWrapper owns everything — no context created here
        return <DataWrapper.EditComp value={...} onChange={...} component={component} />;
    }

    // Non-data components: create state + context (same as current section.jsx behavior)
    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', ...));
    const { apiLoad, apiUpdate } = useContext(PageContext);

    return (
        <ComponentContext.Provider value={{ state, setState, apiLoad, apiUpdate, ... }}>
            <component.EditComp ... />
        </ComponentContext.Provider>
    );
}
```

**Files changed:**
- Modified: `components/index.jsx` — split data vs non-data component handling

---

#### 5.12 Standalone data sources — CHAIN SUPPORT

Data sources created in the page panel that are not referenced by any section. These exist for:
- Chain-only intermediate transforms (Phase 4 outputSourceInfo enables this)
- Pre-configured sources that sections can opt into later

No special code needed — the dataSources map holds them regardless of whether any section references them. The data sources pane shows all sources including unreferenced ones (perhaps with a visual indicator).

---

#### 5.13 Verify end-to-end — INTEGRATION TESTING

- [ ] New page: data sources pane shows empty state, add source creates entry
- [ ] Existing page: lazy migration converts inline configs to page-level sources
- [ ] Section references data source by ID, renders data correctly
- [ ] Multiple sections sharing same data source: independent display, shared columns/filters
- [ ] Section menu display settings work (per-section)
- [ ] Section menu links to data sources pane for config edits
- [ ] Data sources pane: source picker, column manager, filter editor all functional
- [ ] Page filters resolve at runtime, don't mutate config
- [ ] Publish copies draft_dataSources to dataSources
- [ ] Non-data components (lexical, etc.) unchanged
- [ ] ComplexFilters works on isolated filterGroups
- [ ] Paste section works via dwAPI.replaceConfig
- [ ] Standalone data source (no section ref) persists and shows in pane
- [ ] Preloaded data still works (preloadSectionData resolves dataSourceId from page data)
- [ ] Build compiles with zero errors
- [ ] Backward compat: old pages with inline config work in view mode without migration

---

#### Phase 5 Implementation Order & Status

1. **5.1** — Add dataSources to page format — **DONE**
   - Added `dataSources` and `draft_dataSources` as `type: "json"` attributes in `page.format.js`

2. **5.2** — Create DataSourceContext + provider — **DONE**
   - Added `DataSourceContext` to `context.js`
   - PageEdit: `useImmer` for `draftDataSources`, CRUD actions, debounced save effect (500ms)
   - PageView: read-only provider from `item.dataSources`
   - Both wrap existing tree with `DataSourceContext.Provider`

3. **5.3** — Create data sources edit pane — **DONE**
   - New `dataSourcesPane.jsx`: source list, DataSourceCard, DataSourceEditor
   - DataSourceEditor: name input, source/version picker (useDataSource), ColumnManager (dwAPI), ComplexFilters
   - Registered as "Database" icon tab in editPane panes array (position 2, after Settings)

4. **5.9** — Publish flow — **DONE**
   - `editFunctions.jsx`: `newItem.dataSources = cloneDeep(item.draft_dataSources)` in publish()

5. **5.4 + 5.8** — Section dual-mode + backward compat — **DONE**
   - `useSectionDataState` hook in section.jsx: detects `dataSourceId` vs inline format
   - Page-level mode: resolves config from DataSourceContext, merges with section display
   - Legacy mode: uses convertOldState as before
   - Both SectionEdit and SectionView use the hook, falling back gracefully
   - Config changes from DataSourceContext sync to state via useEffect
   - `safeState` fallback guarantees downstream consumers never receive undefined state

6. **5.5a** — Section.jsx reads from DataSourceContext — **DONE** (merged with step 5 above)

7. **5.7** — Section menu: page-level source picker — **DONE (partial)**
   - `switchDataSource` callback: sections can switch to any page-level source by rewriting element-data to `{ dataSourceId, display }` format
   - Section menu: "Page Data Sources" submenu at top of Dataset menu shows all page-level sources with selection
   - Source/Version pickers still available for inline source configuration
   - **Auto-promote removed**: Attempted auto-promotion (both render-time and save-time) caused cascading state issues — mutating DataSourceContext during section save cycles triggers page re-renders that lose section editing state. See "Lessons learned" below.

8. **5.5b** — useDataWrapperAPI split-state interface — **NOT STARTED** (BLOCKED — see notes)
9. **5.5c** — DataWrapper receives config as props — **NOT STARTED** (BLOCKED — see notes)
10. **5.5d** — Routing setState — **NOT STARTED** (BLOCKED — see notes)
11. **5.6** — Fix page filter resolution — **NOT STARTED**
12. **5.11** — Non-data component context split — **NOT STARTED**
13. **5.10** — Close escape hatches — **NOT STARTED**
14. **5.13** — Integration testing — **NOT STARTED**

---

#### Current state: what works and what doesn't

**Working:**
- Data Sources pane: create, edit, delete page-level data sources (source picker, column manager, filters)
- Section menu: "Page Data Sources" submenu lets sections select a page-level source
- `switchDataSource`: rewrites section element-data to `{ dataSourceId, display }`, loads config from DataSourceContext
- Inline sections: continue to work exactly as before (no regressions)
- Publish flow: copies draft_dataSources to dataSources
- Dual-mode: sections with `dataSourceId` resolve from DataSourceContext; sections without use inline config

**Not working / not connected:**
- Sections using a page-level `dataSourceId` are functional on initial load but have fragile state during edit↔view transitions (the merged state from `useSectionDataState` + inline save effect don't fully align with the page-level format)
- No automatic promotion from inline → page-level (removed due to stability issues)
- Page-level data source edits (via the pane) don't propagate to sections that reference that source in real-time (the sync effect in `useSectionDataState` handles initial load but not live updates during an editing session)

**Root problem**: The section editing pipeline (state ownership in section.jsx → save effect in dataWrapper → updateAttribute → sectionArray → apiUpdate) was designed around a single-owner model where section element-data IS the full state blob. Introducing a second owner (page-level DataSourceContext) creates impedance mismatches:
- The save effect serializes the full merged state (including config from the data source), but element-data should only contain `{ dataSourceId, display, data }`
- Intercepting saves in `updateAttribute` to transform the format causes cascading re-renders (DataSourceContext mutation during save cycle)
- The section component can remount during save cycles, and the `useImmer` initial state doesn't re-initialize correctly for the new format

---

#### Lessons learned from auto-promote attempts

**1. Don't mutate DataSourceContext during section save cycles**

Calling `createDataSource` or `setDataSource` from within `updateAttribute` (the section save path) mutates PageEdit's state, which triggers:
- DataSourceContext.Provider re-render → all sections re-render
- The debounced save effect in PageEdit fires `apiUpdate` → page revalidation → all components remount
- Section editing state is lost; VirtualList (Spreadsheet) enters infinite update loops

**2. Don't transform element-data format during saves**

Rewriting element-data from inline `{ sourceInfo, columns, ... }` to reference `{ dataSourceId, display, data }` during the save cycle creates a mismatch between what the save effect produces (full state blob) and what the section expects on next render (reference format). This causes:
- Save effect fires again because `value !== serialized` (different formats)
- The sync effect re-copies config from DataSourceContext, changing state, triggering another save
- Infinite loop until React's max depth limit

**3. The two state systems need structural separation, not format conversion**

The inline system (section owns state → save effect persists full blob) and the page-level system (DataSourceContext owns config, section owns display) are fundamentally different state models. Converting between them at save time doesn't work because the save effect doesn't know which model it's operating in. Steps 5.5b-d (useDataWrapperAPI split, DataWrapper receives config as props, routing setState) are the correct solution — they structurally separate config from runtime/display at the component level, so the save effect only persists what the section owns.

---

#### What steps 5.5b-d must solve (revised requirements)

The remaining steps (5.5b-d) are **blocked until the state ownership model is restructured**. Specifically:

**5.5b: useDataWrapperAPI split-state interface**
- Must accept `{ dataSource, setDataSource, sectionDisplay, setSectionDisplay }` for page-level mode
- `setDataSource` writes to DataSourceContext (page-level config)
- `setSectionDisplay` writes to section element-data (per-section display)
- Save effect in dataWrapper must only persist section-owned fields (display, data), NOT config fields that come from the data source
- The save effect must be aware of whether it's in page-level or inline mode

**5.5c: DataWrapper receives config as props**
- In page-level mode: receives `config` (from DataSourceContext) and `display` (from section element-data) as separate props
- Creates runtime state internally (data, loading, etc.)
- Does NOT include config fields in its internal state — config is read-only from props
- The save effect only persists display + data back to section element-data
- This eliminates the format mismatch: the save effect never sees sourceInfo/columns/dataRequest in its state, so it never serializes them

**5.5d: Routing setState**
- Leaf components (Spreadsheet, Card, Graph) still call `setState(draft => { draft.display.pageSize = 50 })` or `setState(draft => { draft.data = [...] })`
- The routing setState must direct display writes to `setSectionDisplay` and data writes to local runtime state
- Config writes (from column manager, filter editor) must go through `setDataSource` to DataSourceContext
- The section menu's dwAPI already routes through named methods (setDisplay, updateColumn, etc.) — the escape hatches (raw state/setState) need to be closed or routed

**Key insight**: Steps 5.5b-d cannot be done incrementally alongside the current inline system. They require dataWrapper to operate in a fundamentally different mode when `dataSourceId` is present. The cleanest approach is probably a separate DataWrapper component (or mode flag) for page-level sources, rather than trying to make the existing save effect handle both formats.

---

#### Phase 5 Next Steps: Separation-First Approach

The earlier "stamp model" (deep-copying page-level config into section element-data) was a workaround to avoid the dual-state ownership problem. But the section↔dataWrapper separation solves that problem at the root. Once dataWrapper is a self-contained unit that takes config as input and manages its own runtime, both the section and the page-level data sources pane can reference the same dataWrapper model — the section passes config from element-data OR from DataSourceContext, and dataWrapper doesn't care where it comes from.

**Order of operations:**
1. Section↔DataWrapper separation (the structural change)
2. Page-level references (natural once dataWrapper is decoupled)
3. Page filter runtime resolution (cleanest after separation)

---

##### 5.14 DataWrapper owns its own immer state — DONE

This is the structural change originally planned in Phase 3.3 and deferred. DataWrapper becomes a self-contained unit: it receives serialized config as a `value` prop, creates its own immer state internally, provides ComponentContext to leaf components, and calls `onChange` to persist.

**Step 5.14a: DataWrapper creates state internally**

Modify `dataWrapper/index.jsx` Edit and View:
- Add `useImmer` + `convertOldState` initialization inside Edit/View
- Read `apiLoad`, `apiUpdate` from `PageContext` directly (not ComponentContext)
- Provide ComponentContext to children (Spreadsheet, Card, Graph, filters, pagination, etc.)

```javascript
// dataWrapper/index.jsx Edit (new shape)
const Edit = ({ value, onChange, component, cms_context, siteType, pageFormat }) => {
    const { apiLoad, apiUpdate } = useContext(PageContext) || {};
    const { UI } = useContext(ThemeContext);

    // DataWrapper owns its state — initialized from serialized element-data
    const [state, setState] = useImmer(convertOldState(value || '', initialState(component.defaultState), component.name));
    const isValidState = Boolean(state?.dataRequest);

    // All existing hooks stay here (useDataLoader, usePageFilterSync, useColumnOptions)
    // Save effect stays here (already is)
    // CRUD handlers stay here (already are)

    // DataWrapper provides ComponentContext to children
    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme) : component?.controls;

    return (
        <ComponentContext.Provider value={{ state, setState, apiLoad, apiUpdate, controls: resolvedControls }}>
            {/* existing JSX: loading indicator, download, Comp, pagination, attribution */}
        </ComponentContext.Provider>
    );
};
```

**Step 5.14b: DataWrapper manages useDataSource internally**

`useDataSource` takes `{state, setState}` and mutates `state.sourceInfo` on source/view change. Since dataWrapper now owns state, `useDataSource` moves inside dataWrapper.

DataWrapper exposes the source selection results upward via a ref or callback so the section menu can render the source picker.

**Step 5.14c: DataWrapper manages dwAPI internally**

`useDataWrapperAPI` wraps `{state, setState}`. Since dataWrapper owns both, the API is created inside dataWrapper and exposed upward for the section menu.

**Files changed:**
- Modified: `dataWrapper/index.jsx` — add useImmer, ComponentContext.Provider, useDataSource, useDataWrapperAPI. Remove ComponentContext consumption.
- Modified: `components/index.jsx` — for data components, don't create state (delegate to dataWrapper). For non-data components, create state + context as before.

---

##### 5.15 Section.jsx stops creating data state — DONE

**Step 5.15a: Remove data state from section.jsx**

For data components (`component.useDataSource === true`):
- Remove `useSectionDataState` hook (no longer needed)
- Remove `useImmer(convertOldState(...))` — dataWrapper creates it
- Remove `useDataSource({state, setState})` — dataWrapper manages it
- Remove `useDataWrapperAPI({state, setState})` — dataWrapper manages it
- Remove `ComponentContext.Provider` — dataWrapper provides it

Section.jsx keeps:
- Its own `sectionState` (showDeleteModal, key, listAllColumns)
- Title, header, helpText rendering
- Section menu construction
- Auth permissions, delete modal
- `updateAttribute` / `onChange` plumbing (thin pass-through)

**Step 5.15b: Section menu reads from dataWrapper via ref**

DataWrapper exposes its internals via `useImperativeHandle`:

```javascript
// In dataWrapper:
useImperativeHandle(ref, () => ({
    dwAPI,
    dataSource: { activeSource, activeView, sources, views, onSourceChange, onViewChange },
    switchDataSource: (dsId, dataSources) => {
        // Replace state with config from page-level source
        const ds = dataSources[dsId];
        if (!ds) return;
        setState(convertOldState(JSON.stringify({
            dataSourceId: dsId,
            sourceInfo: ds.sourceInfo || {},
            columns: ds.columns || [],
            dataRequest: ds.dataRequest || {},
            display: state?.display || {},
        }), initialState(component.defaultState), component.name));
    },
}), [dwAPI, activeSource, activeView, sources, views, state?.display]);
```

Section.jsx passes a ref to the dataWrapper (through components/index.jsx) and reads it for menu construction:

```javascript
// section.jsx
const dataWrapperRef = useRef(null);

// Pass down to Component.EditComp
<Component.EditComp dataWrapperRef={dataWrapperRef} ... />

// Read for menu
const dwState = dataWrapperRef.current?.dwAPI;
const dataSourceInfo = dataWrapperRef.current?.dataSource;
```

**Important**: `switchDataSource` now lives inside dataWrapper and directly replaces the immer state. No save-cycle interaction, no DataSourceContext mutation, no format conversion. The dataWrapper just gets new state and the normal save effect persists it.

**Step 5.15c: Page-level source picker in section menu**

The section menu's "Page Data Sources" submenu calls `dataWrapperRef.current?.switchDataSource(dsId, dataSources)`. The DataSourceContext provides `dataSources` to the section, which passes them to the ref callback.

This is safe because:
- `switchDataSource` only mutates dataWrapper's own immer state (no external state changes)
- The save effect fires normally after the state change (serializes, calls onChange)
- No DataSourceContext mutation during the save cycle

**Files changed:**
- Modified: `section.jsx` — remove data state creation, read from ref for menu
- Modified: `components/index.jsx` — split data vs non-data component handling, forward ref
- Modified: `sectionMenu.jsx` — read dwAPI and dataSource from ref-based props

---

##### 5.16 Non-data component handling — DONE

`components/index.jsx` provides ComponentContext for non-data components. For data components, dataWrapper provides it.

```javascript
// components/index.jsx
function EditComp({ value, onChange, component, dataWrapperRef, ... }) {
    if (component.useDataWrapper) {
        return <DataWrapper.EditComp ref={dataWrapperRef} value={value?.['element-data']} onChange={...} component={component} />;
    }

    // Non-data components: create state + context
    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', ...));
    const { apiLoad, apiUpdate } = useContext(PageContext);
    return (
        <ComponentContext.Provider value={{ state, setState, apiLoad, apiUpdate }}>
            <component.EditComp ... />
        </ComponentContext.Provider>
    );
}
```

**Files changed:**
- Modified: `components/index.jsx` — split data vs non-data paths, forward ref for data components

---

##### 5.17 Page-level references work naturally — DONE

After the separation, page-level data sources work without a stamp model:

**Inline mode** (default, backward compat):
- Section element-data contains full config blob
- DataWrapper receives it as `value`, creates state, manages everything

**Page-level reference mode** (new):
- Section element-data contains `{ dataSourceId: "ds-1", display: {...} }`
- Section resolves config from `DataSourceContext.dataSources[dataSourceId]`
- Merges with section display: `{ ...resolvedConfig, display: elementData.display }`
- Passes merged config as `value` to DataWrapper
- DataWrapper doesn't know or care where the config came from — it's just a `value` prop
- `onChange` from DataWrapper routes: display changes → section element-data, config changes → DataSourceContext

**The routing in section.jsx** is simple because section.jsx is now thin:
```javascript
// In section.jsx, for page-level mode:
const resolvedConfig = dataSources[elementData.dataSourceId];
const mergedValue = JSON.stringify({
    ...resolvedConfig,
    display: elementData.display || {},
});

// Pass to dataWrapper
<DataWrapper.EditComp value={mergedValue} onChange={(serialized) => {
    const parsed = JSON.parse(serialized);
    // Route: config changes → page-level, display changes → section
    setDataSource(elementData.dataSourceId, {
        sourceInfo: parsed.sourceInfo,
        columns: parsed.columns,
        dataRequest: parsed.dataRequest,
    });
    updateAttribute('element', { ...element, 'element-data': JSON.stringify({
        dataSourceId: elementData.dataSourceId,
        display: parsed.display,
    })});
}} />
```

**Why this doesn't have the earlier problems:**
- DataWrapper owns its own state — no shared immer state between section and dataWrapper
- The `onChange` routing is in section.jsx (the thin layer), not inside the save effect
- `setDataSource` is called from the onChange handler (explicit user action path), not from a render-cycle effect
- DataWrapper never sees DataSourceContext — it just receives `value` and calls `onChange`

**Files changed:**
- Modified: `section.jsx` — add page-level resolution + onChange routing for `dataSourceId` sections

---

##### 5.18 Fix page filter resolution — RUNTIME ONLY

After the separation, this is clean: dataWrapper controls its own data pipeline.

- Remove `usePageFilterSync` hook calls from dataWrapper Edit/View
- Compute `resolvedPageFilters` from `PageContext.pageState.filters` inside dataWrapper
- Pass to `useDataLoader` → `getData` → `buildUdaConfig` via `pageFilters` parameter
- Add `pageFilters` to `computeFetchKey` so filter changes trigger re-fetch
- Delete `usePageFilterSync.js`
- `buildUdaConfig` already has `pageFilters` param and `applyPageFilters` function — just threading

**Files changed:**
- Modified: `dataWrapper/index.jsx` — compute pageFilters, pass to useDataLoader, remove usePageFilterSync
- Modified: `useDataLoader.js` — accept pageFilters, include in fetchKey, pass to getData
- Modified: `utils/utils.jsx` — pass pageFilters to legacyStateToBuildInput
- Deleted: `dataWrapper/usePageFilterSync.js`

---

##### 5.19 Final integration testing

- [ ] Inline sections: create, edit columns/filters/display, save, view, edit again
- [ ] Page-level reference sections: select source from menu, section shows data, edit display independently
- [ ] Page-level config edits: edit source in pane, sections using that source reflect changes
- [ ] Multiple sections sharing same source: independent display, shared config
- [ ] Non-data components: lexical, Filter, Upload, Validate all work
- [ ] Section menu: dataset picker (inline + page-level), column manager, filter editor, display settings
- [ ] Page filters: resolve at runtime, don't mutate config, trigger re-fetch
- [ ] Preloaded data: works for both inline and page-level sections
- [ ] Data Sources pane: create, edit, delete sources
- [ ] Publish: draft_dataSources copied to dataSources
- [ ] Edit→view→edit transitions: no state loss, no loading flash
- [ ] Build compiles with zero errors

---

##### Phase 5 remaining implementation order

1. **5.14a-c** — DataWrapper owns state, manages useDataSource + dwAPI internally, provides ComponentContext (**core separation**)
2. **5.15a-c** — Section.jsx slim-down, ref bridge for menu, page-level source picker via ref
3. **5.16** — Non-data component context split in components/index.jsx
4. **5.17** — Page-level references: section resolves from DataSourceContext, routes onChange
5. **5.18** — Page filter runtime-only resolution
6. **5.19** — Integration testing

Steps 1-3 are the structural separation. Step 4 enables live shared references (the payoff). Step 5 is a correctness fix. Step 6 verifies everything.

---

##### What this means for Phase 6 (joins)

Page-level data sources are even more valuable with live references than with stamps:
- A join config references multiple data sources by ID from the page-level map
- The join UI reads `outputSourceInfo` from each source to show available columns
- When a section uses a join, its dataWrapper receives the merged join config as `value`
- Config changes to any source in the join propagate to all sections using it
- The server receives the complete join spec (all source configs inline in the UDA request) and compiles to SQL with WITH/JOIN clauses
- The section's `onChange` routing handles the join case: config changes route to the appropriate page-level source(s)

### Phase 5B: Clean Data Schema — NOT STARTED

**Goal**: Adopt the data schema designed at the top of this task document. The current persisted format grew incrementally and is hard to read — field names are unclear (`sourceInfo` vs `externalSource`), derived state is persisted alongside authored state (`dataRequest`), runtime data is mixed with config (`data`), and filters live in the wrong place (`dataRequest.filterGroups` instead of top-level `filters`). This phase makes the persisted data human-readable and self-documenting.

**Prerequisite**: Phase 5 separation complete — dataWrapper owns its own state, `buildUdaConfig` already works through `legacyStateToBuildInput` adapter. The adapter maps old → new at runtime; this phase makes the persisted format match the new shape so the adapter becomes a backward-compat shim rather than the primary path.

**Principle**: Data structures should be easy to parse and understand by humans. Every field should have a clear purpose. Derived state should not be persisted. Runtime state should not be mixed with config.

---

#### Designed schema vs current schema

**Page-level data source (designed):**
```javascript
{
  id: "ds-1",
  name: "Fusion Events",
  externalSource: {                     // RENAMED from sourceInfo — clarifies this is the
    source_id: 870,                     // external data source identity, not output schema
    view_id: 1648,
    isDms: false,
    env: "dama",
    srcEnv: "external-data",
    columns: [{ name, type, display }], // source column metadata
  },
  columns: [                            // user column settings
    { name, show, group, fn, sort, customName, meta_lookup, ... }
  ],
  filters: {                            // PROMOTED from dataRequest.filterGroups
    op: "AND",                          // user-authored filter tree — first-class, not buried
    groups: [{ col, op, value, usePageFilters, ... }]
  },
  join: null,                           // Phase 7
  outputSourceInfo: { ... },            // computed by buildUdaConfig, NOT persisted
}
```

**Section element-data (designed):**
```javascript
{
  dataSourceId: "ds-1",                 // ref to page-level source
  display: { pageSize, striped, ... },  // section-specific rendering config
  // NO sourceInfo, columns, dataRequest, data
}
```

**What's wrong with the current format:**

| Problem | Current | Designed | Why it matters |
|---------|---------|----------|----------------|
| Unclear naming | `sourceInfo` | `externalSource` | "sourceInfo" is ambiguous — is it input or output? "externalSource" is clear: it's the external data source this config queries |
| Derived state persisted | `dataRequest: { groupBy, orderBy, fn, meta, serverFn, filter, exclude, ... }` | REMOVED | All of this is derived from `columns` by `buildUdaConfig()`. Persisting it creates a sync problem and doubles the data size |
| Filters buried | `dataRequest.filterGroups` | Top-level `filters` | filterGroups is the user's authored filter tree — it's primary state, not a derived request parameter. Burying it inside `dataRequest` makes it look derived |
| Runtime data persisted | `data: [...]` in element-data | NOT persisted | Hundreds of rows serialized into every save. Bloats the DB, causes stale data, slows saves |
| Mixed concerns | Section has sourceInfo + columns + filters + display + data all in one blob | Section has `dataSourceId` + `display` only. Config lives at page level. | The current blob mixes "what to query" with "how to render" with "cached results" |
| Legacy cruft | `columns[].filters`, `dataRequest.filter`, `dataRequest.exclude`, `dataRequest.normalFilter` | Migrated to `filters` tree on load | Multiple filter formats coexist in the persisted data |

---

#### 5B.1 Define the canonical schema — DONE

Create a schema definition file that documents the canonical shapes. This serves as both documentation and a reference for validation.

**Create**: `dataWrapper/schema.js`

```javascript
/**
 * Canonical data source config schema (v2).
 *
 * This is the target format for all persisted data source state.
 * Legacy formats are converted to this shape by convertOldState/migrateToV2.
 */

// Page-level data source
export const DATA_SOURCE_SCHEMA = {
  id: 'string',              // unique ID within the page
  name: 'string',            // human-readable name
  externalSource: {           // the external data source being queried
    source_id: 'number',
    view_id: 'number',
    isDms: 'boolean',
    env: 'string',
    srcEnv: 'string',
    app: 'string|null',      // only set when isDms=true
    type: 'string|null',     // only set when isDms=true
    columns: 'ColumnDef[]',  // source column metadata
    name: 'string',
    view_name: 'string',
    baseUrl: 'string',
  },
  columns: 'ColumnConfig[]', // user column settings (show, group, fn, sort, etc.)
  filters: {                  // user-authored filter tree
    op: 'string',            // 'AND' | 'OR'
    groups: 'FilterNode[]',
  },
  join: 'JoinConfig|null',   // Phase 7
};

// Section element-data (for data components using page-level source)
export const SECTION_DATA_SCHEMA = {
  dataSourceId: 'string',    // ref to page-level data source
  display: 'DisplayConfig',  // section-specific rendering settings
};

// Fields that are DERIVED at runtime and should NOT be persisted
export const DERIVED_FIELDS = [
  'dataRequest',             // derived from columns + filters by buildUdaConfig
  'data',                    // fetched by useDataLoader
  'fullData',                // fetched by useDataLoader (full dataset)
  'localFilteredData',       // computed by useDataLoader (client-side filter)
  'lastDataRequest',         // dedup artifact
  'outputSourceInfo',        // computed by buildUdaConfig
];

// Fields within display that are DERIVED at runtime
export const DERIVED_DISPLAY_FIELDS = [
  'totalLength',             // set by useDataLoader after fetch
  'filteredLength',          // set by useDataLoader for local filters
  'invalidState',            // set by useDataLoader on error
  'hideSection',             // computed from data + hideIfNull
];
```

**Files changed:**
- New: `dataWrapper/schema.js`

---

#### 5B.2 Create `migrateToV2` — DONE

A pure function that converts legacy element-data (any version) to the v2 canonical format. This replaces `convertOldState` for data components.

**Create**: `dataWrapper/migrateToV2.js`

The migration handles all known formats:

```javascript
/**
 * Convert any legacy element-data format to v2 canonical schema.
 *
 * Input can be:
 * - v0: Very old format with `attributes`, `visibleAttributes`, `format` (pre-2024)
 * - v1: Current format with `sourceInfo`, `columns`, `dataRequest`, `data`
 * - v2: Already canonical — returned as-is
 *
 * Output is always v2:
 * {
 *   externalSource: { source_id, view_id, isDms, env, columns, ... },
 *   columns: [{ name, show, group, fn, sort, ... }],
 *   filters: { op, groups },
 *   display: { pageSize, striped, ... },
 * }
 */
export function migrateToV2(input) {
    if (!input) return null;
    const state = typeof input === 'string' ? JSON.parse(input) : input;

    // Already v2? (has externalSource instead of sourceInfo)
    if (state.externalSource) return state;

    // v1 → v2
    if (state.sourceInfo || state.dataRequest) {
        return migrateV1ToV2(state);
    }

    // v0 → v2 (via v1)
    if (state.attributes || state.format) {
        return migrateV1ToV2(migrateV0ToV1(state));
    }

    return state;
}

function migrateV1ToV2(state) {
    // Rename sourceInfo → externalSource
    const externalSource = state.sourceInfo ? { ...state.sourceInfo } : {};

    // Promote filters from dataRequest.filterGroups to top-level
    const filters = state.dataRequest?.filterGroups || state.filters || { op: 'AND', groups: [] };

    // Migrate any remaining column-level filters into the filters tree
    const { columns: migratedColumns, newConditions } = migrateColumnFilters(state.columns || []);

    // Merge migrated column filters into the tree
    if (newConditions.length && !filters.groups?.length) {
        filters.groups = newConditions;
        if (!filters.op) filters.op = state.display?.filterRelation || 'AND';
    }

    // Display: keep as-is, strip derived fields
    const display = { ...(state.display || {}) };
    DERIVED_DISPLAY_FIELDS.forEach(f => delete display[f]);

    return {
        externalSource,
        columns: migratedColumns,
        filters,
        display,
        // NOT included: dataRequest (derived), data (runtime), fullData, lastDataRequest, etc.
    };
}
```

`migrateV0ToV1` reuses the existing v0→v1 logic from `convertOldState.js` (the `attributes`/`visibleAttributes`/`format` conversion at lines 95-165).

`migrateColumnFilters` extracts the column-level `filters` → filterGroups conditions logic already in `convertOldState.js` (lines 40-93).

**Key difference from convertOldState**: `migrateToV2` produces the **designed** output shape. `convertOldState` produces the legacy v1 shape. Both can coexist during the transition — dataWrapper uses `migrateToV2` for new saves, `convertOldState` remains as fallback for edge cases.

**Files changed:**
- New: `dataWrapper/migrateToV2.js`
- Modified: `dataWrapper/schema.js` — import DERIVED_DISPLAY_FIELDS

---

#### 5B.3 Update `buildUdaConfig` to accept v2 directly — DONE

Currently `buildUdaConfig` accepts `{ externalSource, columns, filters, join, pageFilters }` — which IS the v2 shape. But `getData` calls it through `legacyStateToBuildInput` which maps `sourceInfo → externalSource` and `dataRequest.filterGroups → filters`.

After migration to v2, the adapter is no longer needed for new-format data. Keep it for backward compat but make the direct path the primary one.

**Changes to `getData`:**
```javascript
// If state is v2 (has externalSource), call buildUdaConfig directly
// If state is v1 (has sourceInfo), use legacyStateToBuildInput adapter
const builderInput = state.externalSource
    ? { externalSource: state.externalSource, columns: state.columns, filters: state.filters, pageFilters }
    : legacyStateToBuildInput(state, pageFilters);
```

**Files changed:**
- Modified: `utils/utils.jsx` — detect v2 vs v1, call builder directly for v2

---

#### 5B.4 Update dataWrapper save effect — DONE

The save effect in dataWrapper Edit currently serializes the full state and strips `RUNTIME_FIELDS`. Change it to serialize the v2 canonical format:

```javascript
useEffect(() => {
    if (!isEdit || !isValidState) return;

    const toSave = {
        externalSource: state.externalSource || state.sourceInfo,
        columns: state.columns || [],
        filters: state.filters || state.dataRequest?.filterGroups || { op: 'AND', groups: [] },
        display: { ...(state.display || {}) },
    };

    // Preserve dataSourceId if present (page-level reference tracking)
    if (state.dataSourceId) toSave.dataSourceId = state.dataSourceId;

    // Strip derived display fields
    DERIVED_DISPLAY_FIELDS.forEach(f => delete toSave.display[f]);

    // NOT saved: data, dataRequest, fullData, localFilteredData, outputSourceInfo, lastDataRequest

    const serialized = JSON.stringify(toSave);
    if (isEqual(value, serialized)) return;
    onChange(serialized);
}, [state]);
```

**Key changes:**
- `sourceInfo` → `externalSource` in output
- `dataRequest` not persisted (derived from columns + filters)
- `data` not persisted (fetched fresh)
- `filters` promoted to top-level (not buried in dataRequest)
- Result is a clean v2 document

**Files changed:**
- Modified: `dataWrapper/index.jsx` — update save effect to produce v2 format

---

#### 5B.5 Update dataWrapper state initialization — DONE

DataWrapper currently initializes state with `convertOldState(value)`. Change to use `migrateToV2` which produces the v2 internal shape. The internal state shape must include `externalSource` (not `sourceInfo`) so the save effect can serialize cleanly.

All downstream consumers must be updated to read v2 field names in step 5B.10 (which is a hard requirement within this phase, not a gradual cleanup). No aliases — `migrateToV2` is the only place that references legacy names.

```javascript
const v2State = migrateToV2(value);
const [state, setState] = useImmer(v2State);
// state.externalSource — the source identity
// state.filters — the filter tree
// state.columns — column config
// state.display — display settings
// NO state.sourceInfo, NO state.dataRequest
```

**Implementation order:** Steps 5B.4 (save effect) and 5B.5 (initialization) ship together with 5B.10 (consumer migration). All three must land as one change — you can't save v2 format if consumers still read v1 names.

**Files changed:**
- Modified: `dataWrapper/index.jsx` — use `migrateToV2` for initialization, no aliases

---

#### 5B.6 Update page-level data source format — PANE + CONTEXT

The data sources pane (`dataSourcesPane.jsx`) and `DataSourceContext` should use the v2 field names:

- `dataSource.sourceInfo` → `dataSource.externalSource`
- `dataSource.dataRequest.filterGroups` → `dataSource.filters`

The `DataSourceEditor` component already creates its own local state — update it to use v2 field names. The `useDataSource` hook writes to `state.sourceInfo` — add an alias write so it also updates `state.externalSource`.

**Files changed:**
- Modified: `dataSourcesPane.jsx` — use v2 field names in DataSourceEditor
- Modified: `useDataSource.js` — write to both `sourceInfo` and `externalSource` during transition

---

#### 5B.7 Update section.jsx page-level resolution — V2 FORMAT

`resolveElementData` in section.jsx merges page-level config with section display. Update to use v2 field names:

```javascript
function resolveElementData(elementData, dataSources) {
    // ...
    return JSON.stringify({
        dataSourceId: parsed.dataSourceId,
        externalSource: ds.externalSource || ds.sourceInfo || {},   // v2 name, fallback to v1
        sourceInfo: ds.externalSource || ds.sourceInfo || {},       // alias for backward compat
        columns: ds.columns || [],
        filters: ds.filters || ds.dataRequest?.filterGroups || {},  // v2 name, fallback to v1
        dataRequest: { filterGroups: ds.filters || ds.dataRequest?.filterGroups || {} }, // alias
        display: parsed.display || {},
    });
}
```

The `updateAttribute` intercept that routes config changes back to `DataSourceContext` should also write v2 field names.

**Files changed:**
- Modified: `section.jsx` — use v2 names in `resolveElementData` and `updateAttribute`

---

#### 5B.8 Update preloadSectionData — V2 COMPAT

`preloadSectionData.js` reads `state.sourceInfo` and `state.dataRequest`. After v2, these are aliased. Verify the preloader works with both v1 and v2 formats:

- `state.externalSource` or `state.sourceInfo` (check both)
- `state.filters` or `state.dataRequest.filterGroups` (check both)

**Files changed:**
- Modified: `api/preloadSectionData.js` — handle v2 field names with v1 fallback

---

#### 5B.9 View mode data loading — NO PERSISTED DATA

In v2, `data` is not persisted. View mode needs data from either:
1. **Preloading** (route loader) — `preloadSectionData` fetches data and injects it into element-data before React renders
2. **On-demand fetch** — `useDataLoader` fetches when the component mounts

The preloading path already works and is the preferred approach. For sections where preloading doesn't run (non-preloadable component types, or when the route isn't loading fresh), `useDataLoader` fetches on mount.

**The "loading flash" concern**: Without persisted data, view mode shows a loading state briefly before the fetch completes. This is acceptable IF preloading covers the common case. For edit→view transitions within the same page, the data is already in the React state (the component doesn't remount, it just switches modes).

**Files changed:** None — this is a behavioral note, not a code change. Preloading and useDataLoader already handle this.

---

#### 5B.10 Complete consumer migration — DONE

**This is a hard requirement within Phase 5B, not a gradual cleanup.** After steps 5B.1-5B.9, all aliases must be removed and every file in the codebase must use v2 field names. The `migrateToV2` function is the **only place** that should reference legacy field names (`sourceInfo`, `dataRequest`, `dataRequest.filterGroups`). All other code reads and writes v2 names only.

**Why no aliases as permanent state:** Aliases create two names for the same thing. New developers see `state.sourceInfo` in one file and `state.externalSource` in another and can't tell which is canonical. The codebase becomes harder to read, not easier. The whole point of this phase is readability.

**Migration scope — every file that reads `state.sourceInfo`:**
- `dataWrapper/index.jsx` — CRUD handlers (`state.sourceInfo.isDms`, `config: {format: state.sourceInfo}`), download, allowEdit checks, RenderDownload
- `dataWrapper/components/Attribution.jsx` — reads `sourceInfo.{source_id, name, view_name, updated_at, baseUrl}`
- `dataWrapper/components/Pagination.jsx` — may read indirectly via display
- `dataWrapper/components/filters/RenderFilters.jsx` — reads `state.sourceInfo` for filter context
- `dataWrapper/components/filters/ConditionValueInput.jsx` — reads `state.sourceInfo`
- `useDataSource.js` — reads/writes `state.sourceInfo` for source/view changes
- `useDataWrapperAPI.js` — `config.sourceInfo` in the return value
- `useDataLoader.js` — `computeFetchKey` reads `state.sourceInfo.source_id`, `state.sourceInfo.view_id`
- `usePageFilterSync.js` — reads `state.dataRequest?.filterGroups`
- `useColumnOptions.js` — reads `state.sourceInfo.app`
- `sectionMenu.jsx` — reads `state.sourceInfo?.columns` for allColumns
- `ColumnManager.jsx` — reads `state.sourceInfo?.columns` for available columns, refresh meta
- `section.jsx` — `resolveElementData`, `updateAttribute` intercept
- `dataSourcesPane.jsx` — DataSourceEditor reads/writes source config
- `preloadSectionData.js` — reads `state.sourceInfo`, `state.dataRequest`
- `buildUdaConfig.js` — already uses `externalSource` internally; `legacyStateToBuildInput` maps `sourceInfo → externalSource`

**Migration scope — every file that reads `state.dataRequest`:**
- `dataWrapper/index.jsx` — `isValidState = Boolean(state?.dataRequest)`
- `useDataLoader.js` — `computeFetchKey` reads `state.dataRequest?.filterGroups`
- `usePageFilterSync.js` — walks `state.dataRequest.filterGroups`
- `sectionMenu.jsx` — reads `state?.display?.totalLength` (via dataRequest indirectly)
- `buildUdaConfig.js` — `legacyStateToBuildInput` reads `state.dataRequest.filterGroups`

**After migration, the rule is:**
- `state.externalSource` — the external source identity (never `state.sourceInfo`)
- `state.filters` — the user-authored filter tree (never `state.dataRequest.filterGroups`)
- `state.columns` — unchanged
- `state.display` — unchanged
- No `state.dataRequest` anywhere outside `migrateToV2`
- No `state.sourceInfo` anywhere outside `migrateToV2`

**For `buildUdaConfig`:** It already accepts `externalSource` as its input param name. After 5B.10, `legacyStateToBuildInput` still exists but is only called when `migrateToV2` encounters a v1 format. The primary path for v2 data goes direct to `buildUdaConfig({ externalSource, columns, filters, pageFilters })`.

**For `useDataSource`:** Currently writes to `state.sourceInfo` when source/view changes. After migration, writes to `state.externalSource`. All reads change too.

**For CRUD handlers in dataWrapper:** Currently use `state.sourceInfo` for `apiUpdate({config: {format: state.sourceInfo}})`. The Falcor API layer expects a `format` object with `isDms`, `source_id`, `view_id`, etc. — this is the same shape as `externalSource`. Change to `apiUpdate({config: {format: state.externalSource}})`.

**For `computeFetchKey`:** Currently reads `state.sourceInfo.source_id` and `state.sourceInfo.view_id`. Change to `state.externalSource.source_id` and `state.externalSource.view_id`.

**For `isValidState`:** Currently `Boolean(state?.dataRequest)`. Change to `Boolean(state?.externalSource?.source_id)` or `Boolean(state?.filters)` — check that the source is configured, not that a derived object exists.

**Files changed:** Every file listed above. This is ~15 files with mechanical changes. Each change is small (find/replace within the file) but they must all be done together to avoid mixed naming.

---

#### 5B.11 Integration testing

- [ ] New sections: save produces v2 format (`externalSource`, `filters`, no `dataRequest`, no `data`)
- [ ] Existing sections: v1 format loads correctly (migrateToV2 + aliases)
- [ ] Very old sections: v0 format loads correctly (migrateV0ToV1 → migrateV1ToV2)
- [ ] Page-level data sources: use v2 field names
- [ ] Edit mode: column changes, filter changes, display changes persist in v2 format
- [ ] View mode: data loads via preloading or on-demand fetch (no persisted data)
- [ ] Edit→view transition: no loading flash (data in React state)
- [ ] buildUdaConfig: works with both v2 direct and v1 adapter paths
- [ ] preloadSectionData: works with both v2 and v1 formats
- [ ] Build compiles with zero errors
- [ ] 93 existing tests pass

---

#### Phase 5B implementation order

**Preparation (can be done independently, tested in isolation):**

1. **5B.1** — Define canonical schema (documentation file)
2. **5B.2** — Create `migrateToV2` converter (pure function + tests — does NOT touch any other file)
3. **5B.3** — Update `getData` to detect v2 and skip legacy adapter (additive, backward compat)

**Core cutover (these must ship together as one atomic change):**

4. **5B.4 + 5B.5 + 5B.10** — Save effect produces v2, state initialization uses migrateToV2, ALL consumers updated to v2 names. This is the big bang — every file that reads `sourceInfo` or `dataRequest` changes in one pass. After this lands, the only reference to legacy field names is inside `migrateToV2`.

**Surrounding code (after core cutover):**

5. **5B.6** — Update data sources pane + context to v2 names
6. **5B.7** — Update section.jsx resolution to v2 names
7. **5B.8** — Verify preloadSectionData with v2
8. **5B.9** — Verify view mode data loading without persisted data

**Verification:**

9. **5B.11** — Integration testing

Steps 1-3 are safe preparation. Step 4 is the atomic cutover (~15 files, mechanical find/replace + save effect rewrite). Steps 5-8 update the Phase 5 infrastructure. Step 9 verifies.

**The rule after Phase 5B:** `migrateToV2` is the ONLY function in the codebase that knows about `sourceInfo`, `dataRequest`, `columns[].filters` (legacy), or any other v1 field name. Every other file uses `externalSource`, `filters`, and the v2 shape exclusively.

---

#### Phase 5B → Phase 7 handoff

The v2 schema is designed with joins in mind. The `join` field on data sources is null in Phase 5B but the schema slot exists. Phase 7 fills it in:

```javascript
join: {
    sources: {
        events: null,              // null = use this data source's externalSource
        counties: "ds-2",         // ref to another page-level data source
    },
    on: [
        { type: "left", tables: ["events", "counties"],
          on: "events.county_fips = counties.geoid" }
    ]
}
```

The v2 format makes joins natural: each data source already has `externalSource` (what to query) + `columns` (what columns exist) + `filters` (how to filter). A join just references multiple data sources and adds join conditions.

### Phase 6: Developer Documentation — DONE

**Goal**: Create comprehensive developer documentation for the dataWrapper system. The architecture has changed significantly through Phases 1-5B — the codebase is well-structured now but the documentation hasn't kept pace. New developers (or future AI agents) need to understand the data flow, file responsibilities, state ownership, and v2 schema without reading every file.

---

#### 6.1 DataWrapper Architecture Overview

Create `dataWrapper/README.md` covering:

**File map and responsibilities:**
```
dataWrapper/
  index.jsx          — Edit/View components. Owns state (useImmer), provides ComponentContext.
                       Manages all hooks. Exposes internals via onHandle callback.
  getData.js         — Async data fetching. Builds UDA config, fetches length + rows,
                       post-processes (column mapping, formulas, total row).
  useDataLoader.js   — React hook. Loading lifecycle, dedup (fetchKey), debounce,
                       pagination, local filter slicing.
  useDataSource.js   — React hook. Loads available sources/views from Falcor.
                       Writes to state.externalSource on source/view change.
  useDataWrapperAPI.js — React hook. Structured editing API wrapping state/setState.
                       Named methods (setDisplay, updateColumn, etc.) replace raw setState.
  usePageFilterSync.js — React hook. Syncs page-level filters into state.filters tree.
  useColumnOptions.js — React hook. Loads mapped_options for editable columns.
  buildUdaConfig.js  — Pure function. Columns + filters + externalSource → UDA options + attributes.
                       Also computes outputSourceInfo for chainability.
  migrateToV2.js     — Pure function. Converts any legacy format (v0/v1) to v2 canonical schema.
                       THE ONLY FILE that references legacy field names.
  schema.js          — Constants. v2 field names, RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS.
  getData.js         — Async function. Orchestrates buildUdaConfig → apiLoad → post-process.
```

**Data flow diagram:**
```
Page-level dataSources (DataSourceContext)
       │
       ▼
Section.jsx (resolves config if dataSourceId present)
       │
       ▼ value prop (serialized v2 JSON)
       │
DataWrapper index.jsx
  ├── migrateToV2(value) → useImmer(state)
  ├── useDataSource(state) → loads sources, writes state.externalSource
  ├── useDataWrapperAPI(state) → dwAPI for menu
  ├── useDataLoader(state) → getData() → state.data
  ├── usePageFilterSync(state) → mutates state.filters (runtime values)
  ├── useColumnOptions(state) → loads state.columns[].options
  ├── Save effect → v2 JSON → onChange(serialized)
  └── ComponentContext.Provider → { state, setState, apiLoad, apiUpdate }
       │
       ▼
  Leaf components (Spreadsheet, Card, Graph, Pagination, Attribution, etc.)
```

**v2 schema reference:** (link to schema.js, explain each field and why)

**State ownership rules:**
- DataWrapper owns ALL data state. Section does not create useImmer for data components.
- Section reads from dataWrapper via dwHandle (state-based, triggers re-renders via onHandle callback).
- ComponentContext is provided by dataWrapper, consumed by leaf components.
- Non-data components (lexical, Filter, Upload) get their own state from components/index.jsx.

**Legacy migration:** How migrateToV2 handles v0 → v1 → v2. Why convertOldState.js still exists.

---

#### 6.2 Section↔DataWrapper Interface Documentation

Document the interface contract between section.jsx and dataWrapper:

**Props in (via components/index.jsx):**
- `value` — serialized element-data (v2 JSON string or legacy format)
- `onChange` — callback to persist changes
- `component` — component registry entry (EditComp, ViewComp, controls, defaultState)
- `onHandle` — callback for reactive bridge (section stores in useState)

**Handle out (via onHandle):**
- `dwAPI` — structured editing API (setDisplay, updateColumn, etc.)
- `dataSource` — { activeSource, activeView, sources, views, onSourceChange, onViewChange }
- `state` — current immer state (read-only from section's perspective)
- `setState` — immer updater (for escape hatches like paste, custom controls)

**Page-level source flow:**
- How resolveElementData merges DataSourceContext config with section display
- How updateAttribute routes config changes back to DataSourceContext
- How switchDataSource stamps config and updates live state

---

#### 6.3 buildUdaConfig API Documentation

Document the pure function's contract:

**Input:** `{ externalSource, columns, filters, join, pageFilters }`
**Output:** `{ options, attributes, columnsToFetch, columnsWithSettings, outputSourceInfo }`

- What each input field means and where it comes from
- What each output field is used for
- How the builder derives groupBy/orderBy/fn/meta/serverFn from columns
- How filter tree mapping works (column names → server refs)
- How outputSourceInfo is computed and what it's used for (chainability, Phase 7 joins)

---

#### 6.4 Data Sources Pane Documentation

Document the page-level data source management system:

- DataSourceContext: what it provides, how CRUD works, debounced save
- DataSourcesPane: source list, DataSourceEditor, how it uses useDataSource + useDataWrapperAPI
- Publish flow: draft_dataSources → dataSources
- How sections reference page-level sources vs inline config

---

#### 6.5 Testing Documentation

Document what's tested and how to run tests:

- 93 unit tests in `packages/dms/tests/buildUdaConfig.test.js`
- Run: `npx vitest run packages/dms/tests/buildUdaConfig.test.js` from `src/dms/`
- What's covered: column helpers, filter mapping, HAVING extraction, normal filters, page filter application, outputSourceInfo, legacy adapter
- What's not covered: React hooks (useDataLoader, useDataSource — would need react-testing-library)
- Manual testing checklist for integration verification

---

#### Phase 6 Implementation Order

1. **6.1** — DataWrapper README.md (architecture overview, file map, data flow, state ownership)
2. **6.2** — Section↔DataWrapper interface docs (props, handle, page-level flow)
3. **6.3** — buildUdaConfig API docs (input/output contract, derivation logic)
4. **6.4** — Data sources pane docs (DataSourceContext, CRUD, publish)
5. **6.5** — Testing docs (what's tested, how to run, manual checklist)

---

## Remaining Work (outside this task)

### Join Support

Join support has been moved to its own task: `planning/tasks/current/datawrapper-join-support.md`. It builds on the foundation established in this task (buildUdaConfig, outputSourceInfo, page-level data sources, v2 schema with `join: null` placeholder).

### Page Filter Runtime Resolution (5.18)

`usePageFilterSync` still mutates `state.filters` in place. Should compute resolved filters at runtime without touching config. The infrastructure exists (`buildUdaConfig` accepts `pageFilters` param) but the React-side hasn't been switched. Can be done as part of this task or independently.

---

## Testing Strategy

- **Phase 1** — DONE: 77 unit tests for buildUdaConfig (Vitest)
- **Phase 4** — DONE: 16 additional tests for outputSourceInfo (93 total)
- **Phase 5B** — Manual verification of v2 schema migration
- **Phase 6** — Documentation of testing approach and manual checklists

## Reference Documents

- `planning/research/datawrapper-overview.md` — pre-rearchitecture overview
- `planning/research/uda-config-overview.md` — UDA config format and examples
- `dataWrapper/schema.js` — v2 canonical field names and runtime field lists
- `dataWrapper/README.md` — (Phase 6) architecture overview
