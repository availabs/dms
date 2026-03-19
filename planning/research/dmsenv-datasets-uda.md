# dmsEnv, Datasets, and UDA Architecture

Research document covering the dmsEnv data model, source creation flow, UDA query resolution, table splitting, and fixes applied to support migrated datasets.

## Type Hierarchy

```
Site:         app=myapp  type=my-site-type
  ├─ Pattern: app=myapp  type=my-site-type|pattern
  │     data.pattern_type = "datasets"
  │     data.doc_type = "my_datasets"
  │     data.dmsEnvId = 2051753          ← points to dmsEnv row
  │
  ├─ dmsEnv:  app=myapp  type=dmsEnv
  │     data.name = "Production Environment"
  │     data.sources = [{ref: "myapp+my_datasets|source", id: 1029065}, ...]
  │
  ├─ Source:  app=myapp  type=my_datasets|source
  │     data.type = "internal_table"
  │     data.doc_type = "actions_revised"
  │     data.views = [{ref: "myapp+my_datasets|source|view", id: 1074456}, ...]
  │     data.config = '{"attributes": [...]}'
  │
  ├─ View:    app=myapp  type=my_datasets|source|view
  │     data.name = "version 1"
  │
  └─ Data:    app=myapp  type=actions_revised-1074456     ← split table
        data = {county: "Greene", action_name: "...", ...}
```

### Key relationships

- **Site → dmsEnv**: Site's `data.dms_envs` array holds refs `[{ref, id}]` to dmsEnv rows
- **Pattern → dmsEnv**: Pattern's `data.dmsEnvId` (integer) points to which dmsEnv row owns its sources
- **dmsEnv → Sources**: dmsEnv's `data.sources` array holds refs `[{ref, id}]` to source rows
- **Source → Views**: Source's `data.views` array holds refs `[{ref, id}]` to view rows
- **View → Data rows**: Data rows have type `{doc_type}-{view_id}`, stored in split tables

### Legacy path (no dmsEnv)

Before dmsEnvs, patterns stored sources directly in `data.sources`. The dmsEnv is an indirection layer that decouples source ownership from patterns, allowing multiple patterns to share the same set of sources.

## dmsEnv Creation and Configuration

### Admin UI

**File**: `patterns/admin/pages/patternEditor/default/settings.jsx` (lines 233-310)

The DmsEnvConfig component in pattern settings allows:
1. Creating a new dmsEnv row (type `dmsEnv`, data `{name, sources: []}`)
2. Adding a ref to the site's `data.dms_envs` array
3. Setting `pattern.data.dmsEnvId` to point to the chosen dmsEnv

### Loading into the app

**File**: `render/spa/utils/index.js` (lines 111-149)

`pattern2routes()` loads dmsEnvs from site data:
```js
// Lines 111-119
const dmsEnvs = siteData
  .reduce((acc, curr) => [...acc, ...(curr?.dms_envs || [])], []);
const dmsEnvById = {};
for (const env of dmsEnvs) {
  if (env.id) dmsEnvById[env.id] = env;
}
```

Then `buildDatasources(pattern)` at line 122 resolves `pattern.dmsEnvId` → `dmsEnvById[dmsEnvId]` and passes the dmsEnv through to pattern config.

### Passing to datasets pattern

**File**: `patterns/datasets/siteConfig.jsx` (line 58)

```js
dmsEnv: pattern.dmsEnvId ? dmsEnvById[pattern.dmsEnvId] : null
```

The resolved `dmsEnv` object (with its `sources` array) flows into `DatasetsContext` and is available to all datasets pages.

## Source Creation Flow

### Internal table creation

**File**: `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` (lines 25-92)

Steps:
1. **Create source row** (line 37-44):
   ```js
   falcor.call(["dms", "data", "create"],
     [app, `${type}|source`, {name, type: 'internal_table', doc_type}])
   ```

2. **Create view row** (line 49-54):
   ```js
   falcor.call(["dms", "data", "create"],
     [app, `${type}|source|view`, {name: 'version 1'}])
   ```

3. **Link view to source** (line 57-59): Updates source's `data.views` array

4. **Add source ref to owner** (line 61-69):
   ```js
   const sourceOwner = dmsEnv || parent;  // dmsEnv if available, else pattern
   falcor.call(["dms", "data", "edit"], [app, sourceOwner.id,
     {sources: [...existingRefs, {ref: `${app}+${type}|source`, id: +sourceId}]}])
   ```

**Critical**: If `dmsEnv` exists, the source ref is added to `dmsEnv.data.sources`. If not, it falls back to `pattern.data.sources` (legacy path).

### General creation page

**File**: `patterns/datasets/pages/CreatePage.jsx` (lines 75-100)

Same logic: checks `if (dmsEnv)` to decide where to store the source ref.

## UDA Source Resolution

### How UDA finds sources for a site

**File**: `dms-server/src/routes/uda/utils.js`

#### `getSitePatterns()` (lines 192-199)
Finds all patterns (type `%|pattern`) for an app.

#### `getSiteSources()` (lines 206-243)
This is the key function that resolves sources through dmsEnvs:

```js
// Line 210-215: Query patterns for sources OR dmsEnvId
SELECT data->'sources' AS sources, data->>'dmsEnvId' AS dms_env_id
FROM ${tbl}
WHERE id = ANY($1) AND data->>'doc_type' = ANY($2)
```

Then (lines 224-240):
- If pattern has `dms_env_id` → collect the ID, fetch the dmsEnv row, extract its `data.sources`
- If pattern has direct `sources` → use those directly
- Merge all sources from both paths

### getEssentials() (lines 85-165)

Resolves database, table, and type for a UDA query:

1. **Split env** into `[app, rawType]` from `env.split('+')`
2. **Look up view_id** to check if versioned data, suffix type with view_id
3. **Lowercase split types** (line 140): `type = type.toLowerCase()` — stored data uses lowercase
4. **Look up source_id** (lines 142-152): Case-insensitive query on `data->>'doc_type'`
5. **Resolve table** via `resolveTable(app, type, dbType, splitMode, sourceId)`

### getSourceById() in uda.controller.js

Returns `data->>'type'` (e.g., `internal_table`) instead of the row's `type` column (e.g., `my_datasets|source`). This was a fix — the `type` column is the DMS structural type, not the datatype identifier.

## Table Splitting

### Detection

**File**: `dms-server/src/db/table-resolver.js`

`isSplitType()` uses case-insensitive regex: `/^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/i`

Matches types like `actions_revised-1074456` — these are dataset row data that gets its own table.

### Naming convention

**New naming** (when sourceId is found):
```
data_items__s{sourceId}_v{viewId}_{sanitized_docType}
```
Example: `data_items__s1029065_v1074456_actions_revised`

**Old naming** (fallback when no sourceId):
```
data_items__{sanitize(type)}
```
Example: `data_items__actions_revised_1074456`

The `sanitize()` function lowercases and replaces hyphens with underscores.

### Source ID lookup for table naming

Both the DMS controller (`lookupSourceId`, line 132) and UDA utils (`getEssentials`, line 147) query:
```sql
SELECT id FROM ${mainTbl}
WHERE app = $1
  AND lower(data->>'doc_type') = lower($2)
  AND type LIKE '%|source'
ORDER BY id DESC LIMIT 1
```

The `lower()` on both sides handles mixed-case `doc_type` values from old data.

## Fixes Applied (This Session)

### 1. maxPaths 50K → 500K
**File**: `routes/index.js` line 28

Wide tables (121+ columns × 1000 rows = 121K paths) exceeded the Falcor router's path limit.

### 2. Case-insensitive split type regex
**File**: `table-resolver.js` line 24

Added `/i` flag to `NAME_SPLIT_REGEX`. Old datasets have mixed-case `doc_type` like `Actions_Revised`.

### 3. sanitize() in new table naming
**File**: `table-resolver.js` lines 124, 146, 160

`resolveTable()` was using `parsed.docType` directly (mixed case) instead of `sanitize(parsed.docType)` (lowercase). Generated `data_items__s1029065_v1074456_Actions_Revised` instead of `data_items__s1029065_v1074456_actions_revised`.

### 4. Case-insensitive source lookup
**Files**: `uda/utils.js` line 147, `dms.controller.js` line 143

Added `lower()` on both sides of `doc_type` comparison so `Actions_Revised` matches `actions_revised`.

### 5. Lowercase type for split queries
**File**: `uda/utils.js` line 140

The client sends `Actions_Revised-1074456` (from `source.doc_type`) but stored rows have `type = 'actions_revised-1074456'`. Added `type = type.toLowerCase()` before querying.

### 6. --max-http-header-size=1MB
**File**: `package.json` lines 8-9

Falcor GET requests with 120+ columns containing long computed SQL expressions exceed Node.js's default 16KB header limit.

### 7. Renamed 39 old-named split tables
**Script**: `scripts/rename-split-tables.js`

Renamed tables from old convention (`data_items__actions_revised_1074456`) to new convention (`data_items__s1029065_v1074456_actions_revised`).

## DB Cleanup Script Vulnerability

### Current behavior

**File**: `scripts/cleanup-db.js`, `findOrphanedSources()` (lines 480-504)

The cleanup script determines orphaned sources by:
1. Loading all patterns with `type LIKE '%|pattern'` and `pattern_type IN ('datasets', 'forms')`
2. For each pattern, extracting `data.doc_type` and building valid source types: `{doc_type}|source`
3. Any source row whose type is NOT in this valid set → marked as orphaned

### The problem

**Sources linked only through dmsEnv are not protected.**

When a pattern has `dmsEnvId` set, its own `doc_type` may not match the source's type. The source is valid because it's referenced by `dmsEnv.data.sources[]`, but the cleanup script doesn't check dmsEnv refs.

Example:
- Pattern has `doc_type = "my_datasets"` and `dmsEnvId = 100`
- dmsEnv #100 has `sources: [{id: 500}]`
- Source #500 has type `other_doc_type|source`
- Cleanup sees `other_doc_type|source` is not in `{my_datasets|source}` → deletes it

### Fix needed

See task file: `planning/tasks/current/cleanup-protect-dmsenv-sources.md`

## Key File Reference

| Component | File | Key Functions |
|-----------|------|---------------|
| dmsEnv admin UI | `patterns/admin/.../settings.jsx` | DmsEnvConfig (line 233) |
| Source creation | `patterns/datasets/.../sourceCreate.jsx` | handleSubmit (line 25) |
| Datasets context | `patterns/datasets/siteConfig.jsx` | routes config (line 24) |
| Route building | `render/spa/utils/index.js` | pattern2routes, buildDatasources |
| UDA source lookup | `dms-server/routes/uda/utils.js` | getSiteSources (line 206) |
| UDA query resolution | `dms-server/routes/uda/utils.js` | getEssentials (line 85) |
| UDA controller | `dms-server/routes/uda/uda.controller.js` | getSourceById, simpleFilter |
| Table resolution | `dms-server/db/table-resolver.js` | resolveTable, isSplitType, parseType |
| DMS controller | `dms-server/routes/dms/dms.controller.js` | lookupSourceId (line 132) |
| DB cleanup | `dms-server/scripts/cleanup-db.js` | findOrphanedSources (line 480) |
| Copy sources | `dms-server/scripts/copy-sources-to-dmsenv.js` | run (line 50) |
| Rename tables | `dms-server/scripts/rename-split-tables.js` | run |
