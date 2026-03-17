# DMS Server API Reference

Falcor JSON Graph API served at `POST /graph`. All routes use the Falcor protocol: `GET` routes return JSON Graph fragments, `CALL` routes execute mutations and return updated data.

## Table of Contents

- [DMS Data Routes](#dms-data-routes)
  - [Length & Counting](#length--counting)
  - [Data Lookup](#data-lookup)
  - [Data by ID](#data-by-id)
  - [Search & Tags](#search--tags)
  - [Mutations](#mutations)
- [UDA Routes](#uda-routes)
  - [Sources](#sources)
  - [Views](#views)
  - [Data Queries](#data-queries)
- [Table Splitting](#table-splitting)
  - [Split Modes](#split-modes)
  - [Split Type Detection](#split-type-detection)
  - [Table Naming](#table-naming)
  - [ID Sequences](#id-sequences)
  - [Table Resolver API](#table-resolver-api)
- [Migration](#migration)
  - [Legacy to Per-App](#legacy-to-per-app)
  - [Migration Script](#migration-script)
- [Environment Variables](#environment-variables)

---

## DMS Data Routes

All DMS routes live under the `dms` key in the JSON Graph. The `appKey` used throughout is a concatenation of `app+type` (e.g., `myapp+pattern`).

### Length & Counting

#### `dms.data[{keys}].length`

Row count for an `app+type` pair.

```
GET: dms.data["myapp+page"].length
→ { value: 42 }
```

#### `dms.data[{keys}].options[{keys}].length`

Filtered row count. The `options` key is a JSON-stringified filter object.

```
GET: dms.data["myapp+page"].options['{"filter":{"status":["published"]}}'].length
→ { value: 15 }
```

**Filter object properties:**

| Property | Type | Description |
|----------|------|-------------|
| `filter` | `{col: [values]}` | Include rows where column matches any value |
| `exclude` | `{col: [values]}` | Exclude rows matching values |
| `gt`, `gte`, `lt`, `lte` | `{col: value}` | Comparison operators |
| `like`, `notLike` | `{col: value}` | SQL LIKE pattern matching |
| `groupBy` | `[cols]` | Group results |
| `aggregatedLen` | `boolean` | Count groups instead of rows |

### Data Lookup

#### `dms.data[{keys}].byIndex[{integers}]`

Fetch row references by index (pagination). Returns `$ref` to `byId`.

```
GET: dms.data["myapp+page"].byIndex[0, 1, 2]
→ [
    { path: [..., "byIndex", 0], value: $ref(["dms", "data", "myapp", "byId", 101]) },
    { path: [..., "byIndex", 1], value: $ref(["dms", "data", "myapp", "byId", 102]) },
    ...
  ]
```

The `$ref` always includes the app: `["dms", "data", app, "byId", id]`.

#### `dms.data[{keys}].searchOne[{keys}]`

Find a single row matching a search query. The search key is a JSON-stringified object.

```
GET: dms.data["myapp+page"].searchOne['{"wildKey":"data->>'url_slug'","params":"my-page"}']
→ { value: $ref(["dms", "data", "myapp", "byId", 101]) }  // or null
```

**Search object properties:**

| Property | Type | Description |
|----------|------|-------------|
| `wildKey` | `string` | SQL expression for primary search (e.g., `data->>'title'`) |
| `defaultSearch` | `string` | Fallback SQL expression if wildKey finds nothing |
| `params` | `string` | Value to match against |

#### `dms.data[{keys}].options[{keys}].byIndex[{integers}][{keys}]`

Filtered data with attributes. Returns raw values (not `$ref`).

```
GET: dms.data["myapp+dataset-1"].options['{"filter":{"status":["valid"]}}'].byIndex[0, 1]["id", "data->>'name' as name"]
→ [
    { path: [..., "byIndex", 0, "id"], value: 501 },
    { path: [..., "byIndex", 0, "data->>'name' as name"], value: "Row A" },
    ...
  ]
```

SQL aliases work: `"data->>'name' as title"` returns under the key `"data->>'name' as title"` in the Falcor path, but the value is extracted from the `title` column alias.

#### `dms.data[{keys}].opts[{keys}].byIndex[{integers}]`

Shorthand filtered pagination — returns `$ref` instead of raw attributes. Only requests `id` internally.

```
GET: dms.data["myapp+page"].opts['{"filter":{...}}'].byIndex[0]
→ { value: $ref(["dms", "data", "myapp", "byId", 101]) }
```

### Data by ID

#### `dms.data.byId[{keys}][{keys}]` (legacy)

Fetch rows by ID from the main `data_items` table. No app context — always queries the shared table.

```
GET: dms.data.byId[101]["id", "app", "type", "data"]
→ [
    { path: ["dms", "data", "byId", 101, "id"], value: 101 },
    { path: ["dms", "data", "byId", 101, "data"], value: $atom({...}) },
    ...
  ]
```

#### `dms.data[{keys:apps}].byId[{keys}][{keys}]` (app-namespaced)

Fetch rows by ID from the app's table. In per-app mode, queries `data_items__{app}`.

```
GET: dms.data["myapp"].byId[101]["id", "data"]
→ [
    { path: ["dms", "data", "myapp", "byId", 101, "id"], value: 101 },
    { path: ["dms", "data", "myapp", "byId", 101, "data"], value: $atom({...}) },
  ]
```

Both routes support SQL expressions as attribute keys: `"data->>'title'"` extracts from the JSON `data` column. Objects are wrapped in `$atom()`.

### Search & Tags

#### `dms.search[{keys}][{keys:types}]`

Get all tags or titles for a content type. Used for tag clouds and search indexes.

```
GET: dms.search["myapp+page"]["tags"]
→ { value: $atom(["tag1", "tag2", ...]) }
```

#### `dms.search[{keys}][{keys}][{keys:tags}]`

Search pages/sections by tag value.

```
GET: dms.search["myapp+page"]["byTag"]["infrastructure"]
→ { value: $atom([{ page_id: 101, section_id: 205, ... }]) }
```

#### `dms.data[{keys}].sections`

Get all sections across all pages for a content type. Returns section metadata extracted from `draft_sections` JSON.

```
GET: dms.data["myapp+page"].sections
→ { value: $atom([
    { page_id: 101, section_id: 205, url_slug: "intro", page_title: "Home", ... },
    ...
  ]) }
```

### Mutations

#### `dms.data.create`

Create a new row. Returns data at both legacy and app-namespaced paths.

```
CALL: ["dms", "data", "create"], [app, type]           // empty data
CALL: ["dms", "data", "create"], [app, type, data]     // with initial data
```

**Returns:**
- `dms.data.byId[newId][...attrs]` (legacy path)
- `dms.data[app].byId[newId][...attrs]` (app-namespaced path)
- Invalidates `dms.data["app+type"]` (index)

#### `dms.data.edit`

Update a row's `data` column (JSON merge). Detects format by argument count.

```
CALL: ["dms", "data", "edit"], [app, id, data]     // new format (3 args)
CALL: ["dms", "data", "edit"], [id, data]           // legacy format (2 args)
```

**3-arg format:** Resolves the app's table (per-app mode aware). Returns data at the app-namespaced path.

**2-arg format:** Queries the shared `data_items` table. Returns data at the legacy path.

The `data` argument is merged into the existing `data` column — it does not replace it entirely.

#### `dms.type.edit`

Change a row's type. Same argument detection as `edit`.

```
CALL: ["dms", "type", "edit"], [app, id, newType]  // new format
CALL: ["dms", "type", "edit"], [id, newType]        // legacy format
```

Useful when moving rows between types (e.g., publishing changes the type from draft).

#### `dms.data.massedit`

Bulk update a single JSON field across all rows matching `app+type`.

```
CALL: ["dms", "data", "massedit"], [app, type, column, maps, user]
```

**Arguments:**

| Arg | Type | Description |
|-----|------|-------------|
| `column` | `string` | JSON field to update (e.g., `"status"`) |
| `maps` | `[{invalidValue, validValue}]` | Value replacement pairs |
| `user` | `number` | User ID for audit trail |

#### `dms.data.delete`

Delete rows by ID. Variadic — any number of IDs after `app` and `type`.

```
CALL: ["dms", "data", "delete"], [app, type, id1, id2, id3]
```

**Returns:** Invalidation entries for both legacy and app-namespaced paths, plus the index path.

---

## UDA Routes

UDA (Unified Data Access) routes provide data queries for dataset content. They support two backend modes:

- **DMS mode:** `env` contains `+` (e.g., `myapp+my_dataset`) — queries DMS `data_items` tables
- **DAMA mode:** `env` is a pgEnv config name (e.g., `transportny-prod`) — queries native `data_manager` tables

### Sources

#### `uda[{keys:envs}].sources.length`

Count of dataset sources.

```
GET: uda["myapp+my_dataset"].sources.length → { value: 5 }
```

#### `uda[{keys}].sources.byIndex[{integers}]`

Source IDs by index. Returns `$ref` to `sources.byId`.

```
GET: uda["myapp+ds"].sources.byIndex[0]
→ $ref(["uda", "myapp+ds", "sources", "byId", 101])
```

#### `uda[{keys}].sources.byId[{integers}][{keys}]`

Source metadata. Supports both GET and SET.

```
GET: uda["myapp+ds"].sources.byId[101]["name", "title", "config"]
→ { name: "Traffic Counts", title: "...", config: $atom({...}) }

SET: uda["myapp+ds"].sources.byId[101] = { name: "Updated Name" }
```

In DMS mode, attributes are extracted from the `data` JSON column. Special handling: `source_id` returns `COALESCE(data->>'source_id', CAST(id AS TEXT))`.

#### `uda[{keys}].sources.byId[{integers}].views.length`

View count per source.

```
GET: uda["myapp+ds"].sources.byId[101].views.length → { value: 3 }
```

#### `uda[{keys}].sources.byId[{integers}].views.byIndex[{integers}]`

View IDs by index. Returns `$ref` to `views.byId`.

### Views

#### `uda[{keys}].views.byId[{integers}][{keys}]`

View metadata. Supports both GET and SET.

```
GET: uda["myapp+ds"].views.byId[201]["id", "version", "config"]
SET: uda["myapp+ds"].views.byId[201] = { version: 2 }
```

### Data Queries

#### `uda[{keys}].viewsById[{keys}].options[{keys}].length`

Filtered row count for a view.

```
GET: uda["myapp+ds"].viewsById["201"].options['{"filter":{"county":["Albany"]}}'].length
→ { value: 1520 }
```

**Filter options** (same as DMS options, plus):

| Property | Type | Description |
|----------|------|-------------|
| `filterRelation` | `'and' \| 'or'` | Join logic for filter conditions |
| `filterGroups` | `{groups: [...], op: 'and'}` | Nested filter group tree |
| `having` | `[conditions]` | HAVING clause for aggregated queries |
| `normalFilter` | `[{column, values}]` | Array of `{column, values}` filter objects |

#### `uda[{keys}].viewsById[{keys}].options[{keys}].dataByIndex[{integers}][{keys}]`

Filtered data rows with attributes. The main route for reading dataset table data.

```
GET: uda["env"].viewsById["201"].options['...'].dataByIndex[0, 1]["county", "population"]
→ [
    { path: [..., "dataByIndex", 0, "county"], value: "Albany" },
    { path: [..., "dataByIndex", 0, "population"], value: 314000 },
    ...
  ]
```

Long column names (>60 chars) are automatically aliased to `col_N` in the SQL query.

#### `uda[{keys}].viewsById[{keys}].options[{keys}].byIndex[{integers}]`

Filtered pagination — returns `$ref` to `dataById`.

#### `uda[{keys}].viewsById[{keys}].dataById[{integers}][{keys}]`

Fetch data rows by explicit ID.

```
GET: uda["env"].viewsById["201"].dataById[5001]["county", "population"]
```

---

## Table Splitting

### Split Modes

Controlled by `DMS_SPLIT_MODE` environment variable:

| Mode | Table structure | ID sequence | When to use |
|------|----------------|-------------|-------------|
| `legacy` (default) | Single `data_items` for all apps; split types get per-type tables | One global sequence | Existing databases, backward compat |
| `per-app` | `data_items__{app}` per app + per-type tables for dataset rows | One sequence per app | New deployments, after migration |

### Split Type Detection

Dataset row data has a distinctive type pattern that the server auto-detects:

```
traffic_counts-1                → split (name-based, viewId=1)
traffic_counts-1-invalid-entry  → split (invalid rows)
550e8400-...-42                 → NOT split (UUID types stay in data_items)
page                            → NOT split (DMS content type)
my-site|pattern                 → NOT split (contains |)
```

Only name-based types matching `/^[a-z][a-z0-9_]*-\d+(-invalid-entry)?$/` are split. UUID-based types are left in the main table to match production behavior.

### Table Naming

**Legacy mode:**

| Content | Table |
|---------|-------|
| All non-split types | `data_items` |
| Split type `traffic_counts-1` (with sourceId 290) | `data_items__s290_v1_traffic_counts` |
| Split type `traffic_counts-1` (no sourceId) | `data_items__traffic_counts_1` |
| Split type `traffic_counts-1-invalid-entry` (sourceId 290) | `data_items__s290_v1_traffic_counts_invalid` |

**Per-app mode:**

| Content | Table |
|---------|-------|
| Non-split types for app `myapp` | `data_items__myapp` |
| Split type (with sourceId 290) | `data_items__s290_v1_traffic_counts` |
| Split type (no sourceId) | `data_items__myapp__traffic_counts_1` |

Split table naming with `sourceId` is the same in both modes — source IDs are globally unique, so no app prefix is needed.

Tables are auto-created on first write and cached in memory for the process lifetime.

### ID Sequences

Each split mode uses a different sequencing strategy:

**Legacy mode:**
- PostgreSQL: `dms.data_items_id_seq` (shared global sequence)
- SQLite: `dms_id_seq` table (simulated via AUTOINCREMENT)

**Per-app mode:**
- PostgreSQL: `dms.seq__{app}` per app (e.g., `dms.seq__myapp`)
- SQLite: `seq__{app}` table per app

All tables for an app share that app's sequence, ensuring unique IDs within the app. The sequence is created automatically on first use.

### Table Resolver API

Module: `src/db/table-resolver.js`

#### `resolveTable(app, type, dbType, splitMode?, sourceId?)`

Map an `(app, type)` pair to a database table.

```js
const { resolveTable } = require('./db/table-resolver');

// Legacy, non-split → data_items
resolveTable('myapp', 'page', 'sqlite', 'legacy')
// → { schema: 'main', table: 'data_items', fullName: 'data_items' }

// Legacy, split with sourceId → data_items__s290_v1_traffic_counts
resolveTable('myapp', 'traffic_counts-1', 'postgres', 'legacy', 290)
// → { schema: 'dms', table: 'data_items__s290_v1_traffic_counts', fullName: 'dms.data_items__s290_v1_traffic_counts' }

// Per-app, non-split → data_items__myapp
resolveTable('myapp', 'page', 'sqlite', 'per-app')
// → { schema: 'main', table: 'data_items__myapp', fullName: 'data_items__myapp' }
```

#### `isSplitType(type)`

Returns `true` if the type matches the name-based split pattern.

#### `parseType(type)`

Parse a split type into components.

```js
parseType('traffic_counts-1')
// → { docType: 'traffic_counts', viewId: '1', isInvalid: false }

parseType('traffic_counts-1-invalid-entry')
// → { docType: 'traffic_counts', viewId: '1', isInvalid: true }

parseType('page')
// → null (not a split type)
```

#### `sanitize(name)`

Prepare a name for SQL identifiers: lowercase, hyphens to underscores, strip special chars.

#### `allocateId(db, app, dbType, splitMode)`

Allocate a unique ID from the app's sequence (or global sequence in legacy mode).

#### `ensureTable(db, schema, table, dbType, seqName)`

Create a split/per-app table if it doesn't exist. No-op for `data_items`.

#### `ensureSequence(db, app, dbType, splitMode)`

Create a per-app sequence if it doesn't exist. Returns the sequence name.

#### `clearCaches()`

Clear the in-memory table and sequence existence caches. Used in tests.

---

## Migration

### Legacy to Per-App

To switch an existing database from `legacy` to `per-app` mode:

1. **Run migration script in dry-run** to preview changes:
   ```bash
   node src/scripts/migrate-to-per-app.js --source dms-sqlite
   ```

2. **Run with `--apply`** to execute:
   ```bash
   node src/scripts/migrate-to-per-app.js --source dms-sqlite --apply
   ```

3. **Verify** the output shows matching row counts for each app.

4. **Set `DMS_SPLIT_MODE=per-app`** in the environment and restart the server.

5. The original `data_items` table is preserved — the legacy `byId` route continues to query it as a read-only fallback.

### Migration Script

`src/scripts/migrate-to-per-app.js`

**Options:**

| Flag | Description |
|------|-------------|
| `--source <config>` | Database config name (required) |
| `--app <name>` | Migrate only this app (optional) |
| `--apply` | Execute the migration (default is dry-run) |
| `--batch-size <n>` | Rows per INSERT batch (default 500) |

**What it does:**

1. Scans `data_items` for distinct `app` values with row counts
2. For each app: creates `data_items__{app}` table and per-app sequence
3. Groups rows by type — non-split types go to the per-app table, split types route to per-type tables
4. Copies rows in batches (PostgreSQL: `unnest()` bulk inserts with `ON CONFLICT DO NOTHING`; SQLite: `INSERT OR IGNORE`)
5. Initializes per-app sequences to `max(id)` across all tables for that app
6. Verifies row counts match after migration

The script is idempotent — re-running it skips already-migrated rows.

---

## Environment Variables

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `DMS_DB_ENV` | Config name (e.g., `dms-sqlite`, `dms-postgres`) | `dms-sqlite` | Database to connect to |
| `DMS_SPLIT_MODE` | `legacy`, `per-app` | `legacy` | Table split mode |
| `DMS_LOG_REQUESTS` | `1` or unset | unset | Log all Falcor requests to `logs/` |

### Database Config Files

Located in `src/db/configs/`:

```json
// SQLite
{ "type": "sqlite", "role": "dms", "filename": "../data/dms.sqlite" }

// PostgreSQL
{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5432,
  "database": "dms_db", "user": "postgres", "password": "..." }
```
