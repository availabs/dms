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

### Phase 1: Extract UDA Config Builder — NOT STARTED

**Goal**: Create a pure function `buildUdaConfig()` that takes the new persisted state shape (`externalSource`, `columns`, `filters`) and produces a complete UDA options object + attributes list. This function replaces the scattered logic currently split across the `useSetDataRequest` effect, `getData()` steps 3a-3b, and various helpers in `utils.jsx`.

**Key design decision**: The builder operates on the **new state shape** from the start, even though the rest of the system still uses the old shape. A thin adapter (`legacyStateToBuildInput()`) bridges old state → builder input during the transition. This means the builder is forward-looking and doesn't accumulate legacy debt.

#### 1.1 Define builder input/output types

- [ ] Define `BuildUdaConfigInput` — the builder's contract:
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
- [ ] Define `BuildUdaConfigOutput`:
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

#### 1.2 Extract pure helper functions from utils.jsx

These functions are already mostly pure — they just need to be moved out and given clean signatures:

- [ ] `attributeAccessorStr(columnName, isDms)` → column reference format (`data->>'col'` vs `col`)
- [ ] `refName(column, isDms)` → server-side column reference (applies accessor + fn wrapper)
- [ ] `reqName(column)` → request-side column name (what the server returns as)
- [ ] `totalName(column)` → name for total/aggregate row
- [ ] `applyFn(fn, accessor)` → wraps accessor in aggregate function SQL
- [ ] `mapFilterGroupCols(filterGroups, sourceColumns, isDms)` → maps user column names to server refs
- [ ] `extractHavingFromFilterGroups(filterGroups)` → separates conditions with `fn` (aggregate filters)
- [ ] `extractNormalFiltersFromGroups(filterGroups)` → separates `isNormalFilter` conditions

#### 1.3 Implement buildUdaConfig()

- [ ] Create `dataWrapper/buildUdaConfig.js` — single exported pure function
- [ ] Derive `groupBy` from `columns` where `group === true` (replaces effect in index.jsx lines 230-240)
- [ ] Derive `orderBy` from `columns` where `sort` is set (replaces effect in index.jsx lines 241-250)
- [ ] Derive `fn` from `columns` where `fn` is set (replaces effect in index.jsx lines 251-260)
- [ ] Derive `serverFn` from `columns` with `serverFn` config
- [ ] Derive `meta` from `columns` with `meta_lookup`
- [ ] Derive `attributes` from `columns` where `show === true`, using `refName()` for server refs
- [ ] Process `filters` tree: `mapFilterGroupCols()` → `extractHavingFromFilterGroups()` → `extractNormalFiltersFromGroups()`
- [ ] Apply `pageFilters` to conditions with `usePageFilters === true`
- [ ] Handle `excludeNA` columns (add null exclusion to filter)
- [ ] Return `{ options, attributes, outputSourceInfo: null }` (outputSourceInfo stubbed for Phase 4)

#### 1.4 Create legacy adapter

- [ ] Create `legacyStateToBuildInput(state)` — maps old state shape → builder input:
  ```javascript
  function legacyStateToBuildInput(state) {
    return {
      externalSource: state.sourceInfo,           // same shape, different name
      columns: state.columns,                      // same
      filters: state.dataRequest?.filterGroups     // promote from dataRequest
                || migrateColumnFilters(state.columns),  // or migrate legacy
      join: null,                                  // no join support in old state
      pageFilters: {},                             // injected at call site from PageContext
    }
  }
  ```
- [ ] This adapter is temporary — removed once state migration (Phase 5) is complete

#### 1.5 Wire builder into existing getData()

- [ ] Replace the `useSetDataRequest` effect in `index.jsx` with a call to `buildUdaConfig()` via the adapter
- [ ] Replace the inline UDA options construction in `getData()` (utils.jsx lines ~580-675) with the builder's output
- [ ] `getData()` now receives `{ options, attributes }` from the builder instead of constructing them
- [ ] The `dataRequest` field in state becomes a **runtime-only derived value** — still computed (for dedup comparison via `lastDataRequest`) but no longer persisted or user-mutated

#### 1.6 Tests

- [ ] Unit tests for each extracted helper (refName, applyFn, mapFilterGroupCols, etc.)
- [ ] Unit tests for `buildUdaConfig()` covering:
  - Single source, DMS mode (data->>'col' accessors)
  - Single source, DAMA mode (direct column accessors)
  - Grouped + aggregated columns (GROUP BY + fn)
  - Sorted columns (ORDER BY)
  - Filter tree with nested AND/OR groups
  - Filters with `usePageFilters` + pageFilters input
  - Filters with `fn` (HAVING extraction)
  - Filters with `isNormalFilter` (CASE WHEN extraction)
  - `excludeNA` columns
  - `meta_lookup` columns
  - `serverFn` columns
- [ ] Unit test for `legacyStateToBuildInput()` — converts old state correctly
- [ ] Integration: run existing pages (mitigat-ny-prod) and verify identical UDA requests before/after

#### 1.7 Verify no behavior change

- [ ] All existing data-driven sections produce the same API requests
- [ ] All filter, sort, group, pagination behaviors work identically
- [ ] Auto-save still persists state (though `dataRequest` is now derived, it's still included for backward compat during transition)
- [ ] No UI changes — this phase is purely internal refactoring

### Phase 2: Extract Data Loader — NOT STARTED

**Goal**: Create a `useDataLoader` hook that owns the entire data-fetching lifecycle — API calls, length queries, pagination, dedup, total row, post-processing, and local filtering. After Phase 1 gives us a clean UDA config, this hook takes that config and manages everything about getting and holding data. The dataWrapper `index.jsx` effects for data loading (~200 lines across edit/view modes) collapse into a single hook call.

**Prerequisite**: Phase 1 complete — `buildUdaConfig()` produces `{ options, attributes }`.

#### 2.1 Define hook interface

- [ ] Define `useDataLoader` input:
  ```javascript
  useDataLoader({
    // From buildUdaConfig() output
    options,                          // UDA options object
    attributes,                       // SELECT column list (reqNames)

    // From data source config
    externalSource,                   // passed to apiLoad as `format` (needs source_id, view_id, isDms, env, etc.)

    // Column metadata needed for post-processing
    columnsToFetch,                   // array of { name, reqName, totalName, normalName } — for mapping server response → output row keys
    formulaColumns,                   // array of { name, formula } — for client-side formula evaluation

    // Display config (from section)
    pageSize,                         // rows per page
    usePagination,                    // true = replace data on page change, false = append (infinite scroll)
    showTotal,                        // fetch total row (separate UDA call with no groupBy)
    fullDataLoad,                     // fetch all rows (for download/export)
    keepOriginalValues,               // preserve raw values before formatting

    // Loading gates
    enabled,                          // false = don't fetch (replaces readyToLoad logic)

    // Side-effect hooks
    apiLoad,                          // Falcor data loading function
  })
  ```
- [ ] Define `useDataLoader` output:
  ```javascript
  {
    data,                             // current page of processed rows (column.name keys, cleanValue applied, formulas evaluated)
    totalLength,                      // total row count from server
    filteredLength,                   // local filter count (if local filters active)
    loading,                          // true during fetch
    error,                            // error message string or null
    currentPage,                      // current page index
    onPageChange,                     // (pageNum) => void — handles pagination fetch or local filter slice
    refetch,                          // () => void — force re-fetch with same config
    invalidState,                     // validation error string (e.g., "columns without fn while grouping")
  }
  ```

#### 2.2 Extract API call logic from getData()

The current `getData()` in `utils.jsx` (lines 580-940) mixes UDA config building with data fetching. After Phase 1 extracts config building, what remains is the data loading pipeline:

- [ ] Create `dataWrapper/useDataLoader.js`
- [ ] Extract the **length query** — `getLength()` call with `isRequestingSingleRow` short-circuit (lines 688-705)
- [ ] Extract the **index calculation** — `fromIndex`/`toIndex` from currentPage × pageSize (lines 707-723)
- [ ] Extract the **DMS id column injection** — auto-add `id` column + orderBy when isDms + no groupBy + no fns (lines 738-756)
- [ ] Extract the **invalid state validation** — grouped/ungrouped fn mismatch detection (lines 762-805)
- [ ] Extract the **main data fetch** — `apiLoad({ format: externalSource, children: [{ action: 'uda', filter: { fromIndex, toIndex, options, attributes } }] })` (lines 809-852)
- [ ] Extract the **total row fetch** — separate UDA call with filters-only options (no groupBy/orderBy) + totalName attributes (lines 859-901)
- [ ] Extract the **post-processing** — `reqName` → `column.name` key mapping, `cleanValue()`, formula evaluation via `evaluateAST()` (lines 911-939)

#### 2.3 Consolidate loading effects from index.jsx

Currently `index.jsx` has **4 separate data-loading effects** (edit mode: lines 275-306, view mode: lines 712-745) plus **2 pagination handlers** (edit: lines 308-330, view: lines 747-769). These collapse into the hook:

- [ ] Replace `useEffect` for edit-mode data loading (triggers on dataRequest/sourceInfo/pageSize/columns.length change) — hook internally reacts to `options` change via deep compare
- [ ] Replace `useEffect` for view-mode data loading (triggers on dataRequest/readyToLoad/allowEditInView) — hook uses `enabled` prop (caller computes readyToLoad externally)
- [ ] Replace `onPageChange` handler in both edit/view modes — hook exposes `onPageChange(pageNum)` that handles both pagination (replace) and infinite scroll (append) based on `usePagination`
- [ ] Replace `preventDuplicateFetch` + `lastDataRequest` dedup — hook internally tracks last-fetched config via deep compare, skips if unchanged
- [ ] Replace `loading` state (`setLoading(true/false)` calls scattered across effects) — hook owns loading state internally
- [ ] Remove the 300ms `setTimeout` debounce from load effects — hook manages its own debounce internally

#### 2.4 Handle local filters

The current dataWrapper has a local filtering path (`hasLocalFilters`, `getFilteredData`, `localFilteredData`) that slices data client-side instead of re-fetching:

- [ ] Move `getFilteredData()` logic into the hook — when local filters are active, slice `data` in-memory instead of making API calls
- [ ] Hook tracks `localFilteredData` and `filteredLength` internally
- [ ] `onPageChange` routes to local slice when local filters active, API fetch otherwise
- [ ] Local filter state (`localFilters` from column config) passed as input to hook

#### 2.5 Handle mapped_options loading

The current dataWrapper has a separate effect that loads dropdown options for editable columns with `mapped_options` config (lines 334-400 edit, 771-840 view). This is a secondary data fetch that uses `getData()` with a different sourceInfo:

- [ ] Keep this as a **separate concern** — do NOT fold into `useDataLoader`. It's a different data source with different config.
- [ ] Extract into a `useColumnOptions(columns, apiLoad, externalSource)` hook that loads mapped_options data
- [ ] This hook calls `buildUdaConfig()` + `apiLoad()` independently for each mapped_options column
- [ ] Returns `Record<columnName, Option[]>` that the dataWrapper merges into column state

#### 2.6 Stop persisting `data` in element-data

Currently the entire `data` array is persisted to element-data via `JSON.stringify(state)` on every state change. With the hook owning data:

- [ ] `data` is hook-internal state — not part of the persisted state blob
- [ ] `onChange()` callback no longer includes `data`, `localFilteredData`, `fullData`, `totalLength`, `filteredLength`, `lastDataRequest`, `invalidState`
- [ ] Section auto-save only persists config (columns, filters, display) — not runtime data
- [ ] Backward compat: `convertOldState()` strips `data` from loaded element-data if present

#### 2.7 Wire hook into dataWrapper index.jsx

- [ ] Edit-mode dataWrapper: replace ~100 lines of effects + handlers with:
  ```javascript
  const udaConfig = buildUdaConfig(legacyStateToBuildInput(state));
  const { data, totalLength, loading, error, currentPage, onPageChange, invalidState } =
    useDataLoader({
      ...udaConfig,
      externalSource: state.sourceInfo,
      columnsToFetch,
      formulaColumns,
      pageSize: state.display.pageSize,
      usePagination: state.display.usePagination,
      showTotal: state.display.showTotal,
      fullDataLoad: component.fullDataLoad,
      enabled: isValidState,
      apiLoad,
    });
  ```
- [ ] View-mode dataWrapper: same pattern, with `enabled: isValidState && readyToLoad`
- [ ] Data flows down to Spreadsheet/Card/Graph via ComponentContext (unchanged for now — cleaned up in Phase 3)

#### 2.8 Tests

- [ ] Unit test: `useDataLoader` with mocked `apiLoad` — verify correct `format`/`children` structure in API call
- [ ] Unit test: pagination — replace vs append behavior based on `usePagination`
- [ ] Unit test: dedup — same config doesn't trigger re-fetch
- [ ] Unit test: `enabled=false` skips fetch
- [ ] Unit test: total row fetch — verify separate API call with filters-only options
- [ ] Unit test: post-processing — `reqName` → `name` mapping, `cleanValue`, formula evaluation
- [ ] Unit test: invalid state detection — grouped/ungrouped fn mismatch
- [ ] Unit test: local filter path — client-side slice instead of API call
- [ ] Integration: run existing pages and verify identical data loading behavior

### Phase 3: Clean Section ↔ DataWrapper Interface — NOT STARTED
- [ ] Define the props interface (sourceInfo, savedConfig, onChange, apiLoad, apiUpdate, pageFilters)
- [ ] Refactor section.jsx to pass props instead of raw state/setState
- [ ] DataWrapper manages its own internal state (useImmer stays inside)
- [ ] Section no longer reaches into dataWrapper state
- [ ] DataWrapper calls onChange() to persist, section saves it
- [ ] Page filter sync happens through props, not shared context
- [ ] ComponentContext simplified or eliminated for data-driven components

### Phase 4: Output SourceInfo & Chainability — NOT STARTED
- [ ] UDA config builder produces outputSourceInfo from column config + transforms
- [ ] DataWrapper exposes outputSourceInfo (via ref, context, or callback)
- [ ] Design how a downstream datawrapper references an upstream's output
- [ ] Test with a simple chain: source → datawrapper A → datawrapper B

### Phase 5: Page-Level Data Sources — NOT STARTED
- [ ] Add `dataSources` to page data schema
- [ ] Create page-level data source edit pane UI
- [ ] Migrate section sourceInfo to page-level reference (dataSourceId)
- [ ] Section edit UI shows source picker (from page sources) instead of raw source/view selection
- [ ] Creating source from section auto-adds to page level
- [ ] Backward compatibility: sections without dataSourceId fall back to inline sourceInfo

### Phase 6: Join Support — NOT STARTED
- [ ] Define join UDA config format (finalize the DSL)
- [ ] Extend UDA config builder to handle joins
- [ ] Extend server UDA handler to parse join configs and generate SQL with WITH/JOIN
- [ ] UI for configuring joins (source picker for each table, join condition editor)
- [ ] Test with real multi-source queries
- [ ] Test with UDA config as a join source (WITH clause generation)

---

## Open Questions

1. **ComponentContext elimination**: Can we fully remove ComponentContext for data-driven components, or do some components (Filter, etc.) need shared state beyond what props provide?

2. **Backward compatibility**: How do we migrate existing section element-data that has inline sourceInfo? Phase 5 proposes a fallback, but we need to ensure zero breakage.

3. **Join UI complexity**: How do users specify join conditions? Free-text SQL is powerful but error-prone. Could we offer a column-picker UI that generates the ON clause?

4. **Server UDA changes scope**: How much server-side work is needed for joins? The current UDA handler builds SQL from a flat options object — joins require a fundamentally different query shape.

5. **Caching granularity**: Should the data loader cache per-UDA-config (content-addressed), or per-section? Content-addressed caching would allow sharing data between sections with identical configs.

6. **Page-level sources and patterns**: If sources are on the page, how does this interact with pattern-level source configuration in the datasets pattern?

---

## Testing Strategy

- **Phase 1**: Unit tests for UDA config builder — given column configs, assert correct options/attributes output. Test DMS vs DAMA accessors, aggregate functions, filter compilation, meta lookups.
- **Phase 2**: Integration tests for data loader hook — mock apiLoad, verify fetch/cache/invalidation behavior.
- **Phase 3-6**: Manual testing against existing pages (mitigat-ny-prod redesign pattern is the best test case — complex cards, graphs, spreadsheets with filters, meta lookups, and computed columns).

## Reference Documents

- `planning/research/datawrapper-overview.md` — current architecture
- `planning/research/uda-config-overview.md` — UDA config format and examples
