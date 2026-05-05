# Unified Column-Type System — Research

Research note (not a plan-of-record). Triggered by a concrete bug: a Card section bound to a DAMA dataset (`now_playing_stream`, `received_at TIMESTAMPTZ`) sorts that column **alphabetically** when the user picks "A→Z" in the Card's Sort control. The deeper question is whether DMS needs a unified column-type system spanning client (datasets pattern, dataWrapper, Card/Spreadsheet/Graph) and server (UDA, DAMA, CSV/GIS analyzers).

## Inventory: how column types are expressed today

### Client `columnTypes/` registry

`src/dms/packages/dms/src/ui/columnTypes/index.jsx:22-57` is the single client registry. It maps a small **rendering** vocabulary to `{ EditComp, ViewComp }` pairs:

```
text, textarea, lexical, number, date, timestamp, boolean,
dms-format, select, multiselect, radio, checkbox, switch, default
```

Each entry is purely an input/render pair — no sort/filter/format hooks. `'date'` and `'timestamp'` are thin wrappers that pass `type='date'` / `type='datetime-local'` to a generic `<TextEdit>`. Consumers: `Card`, `Spreadsheet`, `Graph`, `Form`, datasets `Table` page.

### DAMA `metadata.columns`

Documented at `src/dms/packages/dms-server/src/dama/CLAUDE.md:79-119`. Per-column shape:

```
{ name, display_name, type, desc }
```

`type` is a **bare Postgres type** (`TEXT`, `TIMESTAMPTZ`, `INTEGER`, `JSONB`). Writers:
- `data-types/now_playing/schema.js:148-155`
- `src/dms/packages/dms-server/src/dama/upload/workers/csv-publish.js:138-149`
- `src/dms/packages/dms-server/src/dama/upload/workers/gis-publish.js#L253-L267`

The CSV analyzer (`src/dms/packages/dms-server/src/dama/upload/analyzeSchema.js:42-44`) speaks an even narrower vocabulary: `INT`, `BIGINT`, `TEXT`, `REAL`, `DOUBLE PRECISION`, `NUMERIC`. **It never produces `TIMESTAMPTZ`, `DATE`, `BOOLEAN`, or `JSONB`** — date/boolean inference is explicitly punted. Real-world CSVs with date columns land as `TEXT` in `metadata.columns`.

### Section per-column controls (Card / Spreadsheet / Graph)

`Card.config.jsx:208-212`, `spreadsheet/config.jsx:137-141`, `graph/config.jsx:104-106` all declare a generic Sort control:

```
{ type: 'select', label: 'Sort', key: 'sort',
  options: [{label:'A->Z', value:'asc nulls last'},
            {label:'Z->A', value:'desc nulls last'}] }
```

The `A->Z` labels are the giveaway: Sort is wired with no awareness of column type. **None of the three section configs branches on `column.type`** for sort/filter/format choice.

### dataWrapper — `buildUdaConfig.js`

`buildUdaConfig.js:836-838`:

```
const orderBy = columns.filter(c => c.sort).reduce((a,c)=>({...a, [c.name]: c.sort}), {});
```

Then mapped to server refs at `923-932`. **No type info ever attached to the orderBy entry.** The only `column.type` awareness in this file is line 178 (`'multiselect'` array-contains filter) and lines 131-139 (`TEXT_TYPES` set for null-sentinel filter ops).

### UDA server orderBy/cast logic

`src/dms/packages/dms-server/src/routes/uda/utils.js:473-486`:

```js
function handleOrderBy(orders, dmsAttributes) {
  ...
  const orderMap = sanitized.map(col => {
    let dataType;
    if (dmsAttributes && Array.isArray(dmsAttributes)) {
      const match = dmsAttributes.find(a => `'${a.name}'` === col.replace('data->>',''));
      dataType = match?.dataType;
    }
    return dataType
      ? `(${getResponseColumnName(col)})::${dataType} ${orders[col]}`
      : `${getResponseColumnName(col)} ${orders[col]}`;
  });
}
```

Two findings:

1. `dmsAttributes` is **only populated for DMS sources** (`utils.js:131-150`). For DAMA, it's `undefined` and the cast branch is dead code.
2. The cast vocabulary expects `attr.dataType` — the **DMS form-pattern attribute** field, not the Postgres-type vocabulary `metadata.columns` speaks.

`query_sets/postgres.js:202` passes `dmsAttributes` straight through and never consults `data_manager.sources.metadata.columns`. **DAMA mode never type-casts an orderBy expression** — it emits `ORDER BY received_at asc nulls last` raw.

`handleFilters` at `utils.js:305-348` casts `gt/gte/lt/lte` to `numeric` for DMS only; DAMA columns get no cast.

## Why timestamps sort alphabetically — trace

1. Card writes `column.sort = 'asc nulls last'` into section state.
2. `buildUdaConfig` produces `options.orderBy = { received_at: 'asc nulls last' }`. `column.type` is `'TIMESTAMPTZ'` but nothing reads it.
3. POST `/graph` → `simpleFilter` → `query_sets/postgres.js:202` → `handleOrderBy(orderBy, dmsAttributes=undefined)` (DAMA path).
4. Cast branch skipped. SQL: `ORDER BY received_at asc nulls last`.

Against a true `TIMESTAMPTZ` column that *should* sort chronologically. So the bug is one of:

- **The orderBy ref is `data->>'received_at'`** (lexicographic text), not `received_at`. Happens if `state.externalSource.isDms` is stale-true on a DAMA source — `buildUdaConfig.js:32-39` wraps any column in `data->>` when `isDms`. Verify by capturing SQL via `DMS_LOG_REQUESTS=1`.
- **The CSV analyzer typed the column as `TEXT`** in some other source — guaranteed for any CSV with a date column.

Either way, the deeper bug: **no part of the pipeline thinks of `received_at` as a timestamp.** DAMA's `metadata.columns` knows the type, but the SQL generation never sees it.

## Vocabulary gaps

Three independent type vocabularies, no mapping between them:

| Vocabulary | Source | Sample values |
|---|---|---|
| Client render | `columnTypes/index.jsx` | `text`, `date`, `select`, `multiselect`, `boolean` |
| Postgres | DAMA `metadata.columns.type` | `TEXT`, `TIMESTAMPTZ`, `INTEGER`, `JSONB` |
| CSV analyzer | `analyzeSchema.js` | `INT`, `BIGINT`, `TEXT`, `REAL` |
| DMS form attribute | `data.config.attributes[].dataType` | free-text-ish |

When DAMA column metadata gets merged onto a section column entry (`useDataSource.js:261-263`), `column.type` becomes the Postgres string — so consumers that branch on `column.type === 'multiselect'` (e.g. `buildUdaConfig.js:178`) silently miss for `'TIMESTAMPTZ'` columns.

**Where type gets lost in transit:**

- **Sticky sourceInfo binding.** `useDataSource.js:142-191` re-syncs `externalSource.columns` from the live source only on a deep-equality mismatch — saved sections hold stale type info.
- **Section state is the source of truth.** `state.columns[i].type` is whatever was there when last persisted. dataWrapper trusts state over a fresh DAMA fetch.
- **Aggregations overwrite type.** `computeOutputSourceInfo` (`buildUdaConfig.js:646-658`) hard-codes `type='number'` for aggregated columns and `type='text'` for meta_lookups, regardless of input.
- **CSV analyzer never emits date/boolean/timestamp.** Real-world CSVs with date columns land as `TEXT` — even a future type-aware sort path can't help them without re-analysis.

**Sections that should respect column type but don't:**

- Card / Spreadsheet / Graph **Sort** — single label `A->Z` for everything.
- Card / Spreadsheet **Format** — static options (`Date`, `Comma Separated`, …) independent of column type. User must know to pick `Date` for a `received_at` column.
- Filter operators — same operators offered for every column. `gt/gte/lt/lte` on `TEXT` does lexicographic comparison silently.

## Architectural paths forward

### Option A — Server-authoritative type cast (smallest)

`metadata.columns` (already authoritative for DAMA) becomes the source for orderBy/filter casts. UDA controller threads `metadata.columns` into `handleOrderBy`/`handleFilters` the way `dmsAttributes` is threaded today. Map Postgres types to a small set of cast strategies:

- `TIMESTAMPTZ`, `TIMESTAMP`, `DATE` → `(col)::timestamptz` for orderBy and `gt/gte/lt/lte`
- `INT`, `BIGINT`, `INTEGER`, `NUMERIC`, `REAL`, `DOUBLE PRECISION` → `(col)::numeric`
- `JSONB` → no orderBy (or `(col)::text`); flag in error
- Everything else → no cast

**Solves:** the timestamp-sort bug for DAMA. Generalizes to any future Postgres-typed column. Zero client churn.

**Leaves open:** client column-types vocabulary; format functions still hardcoded; CSV analyzer still doesn't infer dates. DMS sources continue using the parallel `dmsAttributes.dataType` path (or get retrofitted later).

**Migration:** zero. Server-only. Works against existing `metadata.columns` data with no rewrites. Sources missing `metadata.columns` keep current behavior — no regression.

**Half-implemented failure mode:** mis-spelling `'TIMESTAMPTZ'` in the type→cast table ships a source-specific bug. Easy to test (one regression test per type).

**Size:** 1 PR. Three files: `routes/uda/utils.js`, `routes/uda/query_sets/postgres.js`, one regression test in `dms-server/tests`.

### Option B — Shared `columnTypes` package, dual-vocabulary mapping

Single canonical column-type registry (e.g. `packages/column-types`) consumed by both client and server. Each canonical type carries:

- `pgTypes[]` — Postgres types it absorbs (`{TIMESTAMPTZ, TIMESTAMP}` → `'datetime'`)
- SQL cast expression for orderBy/filter
- Client `EditComp` / `ViewComp`
- Default format function
- Which filter operators apply

DAMA writers continue to write Postgres types into `metadata.columns`; the registry's `pgTypeToCanonical` runs both server-side (UDA) and client-side. CSV analyzer is upgraded to emit canonical types directly (date detection, boolean detection — both currently punted).

**Solves:** vocabulary unification. Sort/filter/format UI can be type-aware uniformly. Plugin authors see one vocabulary.

**Leaves open:** existing `columnTypes/` UI registry needs migration — its keys (`text`, `select`, `multiselect`) are control-shape names, not data-type names. They overlap but aren't the same axis. **Prerequisite refactor**: split `column.type` (data type) from `column.inputType` (control kind). Today they share a field — `buildUdaConfig.js:178` checks `'multiselect'` (control kind) on the same field that holds `'TIMESTAMPTZ'` (data type). Until those are split, any shared registry has ambiguous keys.

**Migration:** existing `metadata.columns` rows: nothing to do; lookup is a pure function of `type`. Existing Card/Spreadsheet sections: `state.columns[i].type` is currently a Postgres type post-merge — leave as-is, look up canonical lazily. The `'multiselect'` check needs renaming first.

**Half-implemented failure mode:** the dual-registry split (input control vs data type) leaks. If only some sections are migrated, two `column.type` semantics coexist — worse than current.

**Size:** ~5 PRs. Order: (1) split `column.type` / `column.inputType`; (2) introduce canonical registry, write only on new plugins; (3) retrofit `useDataSource.js` to expose canonical type alongside Postgres type; (4) section configs branch on canonical type for Sort/Filter; (5) server uses canonical, deprecate `dmsAttributes.dataType` path; (6) CSV analyzer emits canonical types.

### Option C — Per-column adapters (richest)

Every column in `metadata.columns` is paired with a `columnAdapter` object: `{ pgType, canonicalType, sortSqlFn, filterOps[], filterSqlFn, formatFn, EditComp, ViewComp, validate }`. Sections delegate everything — sort to `adapter.sortSqlFn`, format to `adapter.formatFn`, etc. Plugin authors register custom adapters per-column (e.g. an `acrid` adapter that links to ACRCloud, a `geoid` adapter that validates).

**Practical implementation:** adapters live in code (not data); `metadata.columns` references them by name (`adapter: 'datetime'`); server has its own adapter table mapping names to SQL builders, client has its own mapping names to React components.

**Solves:** any oddly-typed column gets a single home. Adapter table is the registry both sides import.

**Leaves open:** sending JS expressions to the server is a non-starter (security + duplication); SQL has to be generated server-side. So adapters are split implementations referenced by the same name — adding "missing adapter" as a class of failure.

**Migration:** existing `metadata.columns` rows need `adapter` field added; default to `pgTypeToAdapter(type)`. Existing Card sections re-resolve against the adapter table at section render time. Mechanical state migration.

**Half-implemented failure mode:** adapter referenced by name in `metadata.columns` that the server doesn't have → either crash or silent fallback to `text` (worse — masks breakage). Need strict registry checks at boot and CI test scanning live `metadata.columns` for unknown adapter names.

**Size:** 6+ months. Crosses every section type, dataWrapper, UDA controller, plugin authoring docs, and CSV/GIS analyzers. Worth doing only if 2-3 real per-column behaviors have accumulated as concrete user requests.

## Recommendation

**Ship Option A as the immediate unblock**: server-side cast driven by `metadata.columns`. Three-file change in `dms-server`, one regression test, no client churn, no migration. Fixes the timestamp-sort bug for every DAMA-backed Card/Spreadsheet/Graph today. Crucially, does not introduce a new vocabulary that has to be undone if Option B/C lands later.

The "do it properly" entry point is **Option B**, but only after the prerequisite `column.type` vs `column.inputType` rename PR. Until those are split, any shared registry has ambiguous keys.

Avoid Option C until two or three real per-column behaviors (clickable IDs, custom validation, etc.) have accumulated. It's the right shape eventually but premature today — the user has one bug, not ten.

## Critical files for any of the options

- `src/dms/packages/dms-server/src/routes/uda/utils.js` — `handleOrderBy:473`, `handleFilters:305`, `getEssentials:86-211`
- `src/dms/packages/dms-server/src/routes/uda/query_sets/postgres.js` — caller for `handleOrderBy`/`handleFilters`
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` — orderBy/filter generation, `'multiselect'` branch at line 178
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataSource.js` — sourceInfo sync, line 142-191
- `src/dms/packages/dms/src/ui/columnTypes/index.jsx` — client render registry
- `src/dms/packages/dms-server/src/dama/upload/analyzeSchema.js` — CSV type inference (would need date/boolean detection added in B)
- Section configs: `Card.config.jsx`, `spreadsheet/config.jsx`, `graph/config.jsx` — Sort control wiring
