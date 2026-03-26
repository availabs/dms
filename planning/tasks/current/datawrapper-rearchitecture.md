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

### Phase 0: Research & Specification — NOT STARTED
- [ ] Map every place ComponentContext is read/written (beyond section.jsx and dataWrapper)
- [ ] Map every place `state.sourceInfo` is read/written
- [ ] Map all callers of `getData()` and `getLength()`
- [ ] Identify all state fields that are section concerns vs. datawrapper concerns
- [ ] Document the exact current data flow for: initial load, filter change, page filter sync, CRUD operation, source change
- [ ] Research server-side UDA handler to understand what changes are needed for joins
- [ ] Write the exact UDA join config format with server SQL generation examples
- [ ] Define the exact output sourceInfo schema

### Phase 1: Extract UDA Config Builder — NOT STARTED
- [ ] Create `dataWrapper/udaConfigBuilder.js` — pure module
- [ ] Extract column name transforms (`refName`, `reqName`, `totalName`) from utils.jsx
- [ ] Extract `applyFn()`, `attributeAccessorStr()`, `mapFilterGroupCols()`, `extractHavingFromFilterGroups()`
- [ ] Extract dataRequest → UDA options transformation from `getData()`
- [ ] Extract filter compilation logic
- [ ] Builder produces `{ options, attributes, outputSourceInfo }`
- [ ] Add unit tests for the builder (pure function, easy to test)
- [ ] Refactor `getData()` to use the builder instead of inline logic
- [ ] Verify all existing behavior preserved (no UI changes)

### Phase 2: Extract Data Loader — NOT STARTED
- [ ] Create `dataWrapper/useDataLoader.js` hook
- [ ] Move API call logic from `getData()` into the hook
- [ ] Move cache/invalidation logic (preventDuplicateFetch, readyToLoad)
- [ ] Move pagination state management
- [ ] Move post-processing (cleanValue, formula evaluation)
- [ ] Hook returns `{ data, length, loading, error, refetch }`
- [ ] Refactor dataWrapper/index.jsx to use the hook
- [ ] Verify all existing behavior preserved

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
