# Internal PgEnv (dmsEnv)

## Status: IN PROGRESS — Phases 1-6 implemented, Phase 7 (invalid-entry consolidation) DONE, needs testing

## Objective

Decouple dataset source ownership from the datasets display pattern by introducing a new `dmsEnv` row type in `data_items`. Currently, sources (internal datasets) are stored directly on a datasets pattern's `data.sources` array, tightly coupling the data storage layer to a specific display instance. This means:

- A source can only belong to one datasets pattern
- Page patterns can only access internal sources by finding datasets patterns and reading their sources
- The `datasources` array in `pattern2routes()` is built by scanning all datasets patterns at route-build time

With `dmsEnv`, sources are owned by a named environment rather than a display pattern. Multiple datasets and page patterns can reference the same `dmsEnv`, and source management becomes independent of any particular UI.

## Current Architecture

### How sources are owned today

1. **Datasets pattern** has a `data.sources` array of `{ref, id}` references (via `dms-format` attribute in `datasets.format.js`)
2. When creating a source, `CreatePage.jsx` or `sourceCreate.jsx` calls `apiUpdate` which creates the source row and adds its ref to the pattern's `sources` array
3. The pattern's `doc_type` namespaces all child content: sources have type `{doc_type}|source`, views have type `{doc_type}|source|view`, data rows have type `{doc_type}-{viewId}`

### How datasources are built

In `render/spa/utils/index.js` `pattern2routes()`:
- External: each `pgEnv` string from `DmsSite` props becomes a datasource entry
- Internal: each datasets/forms pattern becomes a datasource entry with `env: '{app}+{doc_type}'`
- The combined `datasources` array is passed to every pattern config

### How patterns consume datasources

- **Datasets pattern**: receives `datasources` via siteConfig, uses `buildEnvsForListing()` to query sources
- **Page pattern**: receives `datasources` and `pgEnv` via siteConfig, passes to `CMSContext`, data wrapper components use `getExternalEnv()` and `getInternalDatasources()`
- Both patterns currently get ALL datasources — no per-pattern filtering

### Key files

| File | Role |
|------|------|
| `patterns/datasets/datasets.format.js` | Format definition — `sources` as `dms-format` array |
| `patterns/datasets/siteConfig.jsx` | Datasets config, receives `datasources`, provides `DatasetsContext` |
| `patterns/datasets/pages/CreatePage.jsx` | Creates sources, adds to pattern's `sources` array |
| `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` | Internal table creation flow |
| `patterns/datasets/utils/datasources.js` | `buildEnvsForListing()`, `getExternalEnv()` helpers |
| `patterns/page/siteConfig.jsx` | Page config, receives `datasources` and `pgEnv` |
| `patterns/page/pages/_utils/datasources.js` | Page-side datasource helpers |
| `patterns/page/components/sections/components/dataWrapper/index.jsx` | Data components consuming datasources |
| `render/spa/utils/index.js` | `pattern2routes()` — builds unified `datasources` array |
| `patterns/admin/pages/patternEditor/` | Pattern editor (overview, settings, theme, permissions) |

## Proposed Design

### New row type: `dmsEnv`

A `dmsEnv` is a `data_items` row with:
- **type**: `{siteType}|dmsEnv`  (scoped to the site, like patterns are `{siteType}|pattern`)
- **data**:
  ```json
  {
    "name": "My Internal Database",
    "sources": [
      { "ref": "myapp+my_datasets|source", "id": 42 },
      { "ref": "myapp+my_datasets|source", "id": 43 }
    ]
  }
  ```

The `sources` array uses the same `dms-format` ref pattern that datasets patterns use today. Sources continue to be `data_items` rows with type `{doc_type}|source` — the only change is which parent row owns the references.

### How patterns reference a dmsEnv

Each pattern's `data` gets two new optional fields:
- **`pgEnv`**: string — the external pgEnv name (e.g., `'dama_db'`). Currently set globally on `DmsSite`, this moves to per-pattern config.
- **`dmsEnvId`**: number — the ID of the `dmsEnv` row this pattern uses for internal sources.

When a pattern has `dmsEnvId` set, it reads sources from that `dmsEnv` row instead of from its own `data.sources`. When unset, it falls back to legacy behavior (sources on the pattern itself, for backward compatibility).

### datasources array changes

`pattern2routes()` changes from scanning all datasets patterns to:

1. Load all `dmsEnv` rows for the site (type `{siteType}|dmsEnv`)
2. For each pattern, look up which `dmsEnv` it references (via `data.dmsEnvId`)
3. Build `datasources` per-pattern instead of globally:
   - External: the pattern's `data.pgEnv` (or fallback to global `pgEnvs[0]`)
   - Internal: the pattern's referenced `dmsEnv` sources

### Initialization flow

When creating a new datasets pattern in a fresh project:

1. **Auto-create**: If no `dmsEnv` rows exist for this site, automatically create one named "Default" when the first datasets pattern is created
2. **Auto-assign**: The new datasets pattern's `dmsEnvId` is set to the auto-created `dmsEnv`
3. **Admin UI**: The pattern editor overview shows which `dmsEnv` is assigned and allows changing it
4. **Create new**: A button in the pattern editor or admin overview to create a new `dmsEnv`

### Source creation changes

When creating an `internal_table` source:
- Currently: source is created and ref added to the datasets pattern's `sources` array
- New: source is created and ref added to the pattern's referenced `dmsEnv`'s `sources` array
- The source's type string (`{doc_type}|source`) stays the same

## Implementation

### Phase 1: dmsEnv row type and format — DONE

- [x] Defined `dmsEnvFormat` in `admin.format.js` (type: `dmsEnv`, attributes: `name`, `sources`)
- [x] Registered in `patternAdminFormat.registerFormats` and added `dms_envs` dms-format attribute to site record
- [x] dmsEnv rows load automatically via dms data loader (dms-format ref resolution)
- [x] `pattern2routes()` extracts `dms_envs` from site data and builds `dmsEnvById` index

### Phase 2: Pattern editor config — DONE

- [x] `DmsEnvConfig` component in `patternEditor/default/settings.jsx`
  - Select from existing dmsEnvs or create new inline
  - Sets `dmsEnvId` on pattern data
  - Creates dmsEnv row + adds ref to site's `dms_envs` array
- [x] `dmsEnvs`/`dmsEnvById` passed through `AdminContext` in both admin configs
- [x] Shows for datasets, forms, page, and mapeditor pattern types

### Phase 3: Datasources refactor — DONE

- [x] `pattern2routes()` builds per-pattern datasources via `buildDatasources(pattern)` helper
- [x] Each pattern config gets its own `datasources` array + `dmsEnvs`/`dmsEnvById`
- [x] Datasets `siteConfig.jsx` passes `dmsEnv` object through `DatasetsContext`
- [x] Page `siteConfig.jsx` receives `dmsEnvs`/`dmsEnvById`
- [x] Backward compatible: patterns without `dmsEnvId` fall back to legacy all-datasetPatterns behavior

### Phase 4: Source management changes — DONE

- [x] `CreatePage.jsx`: when `dmsEnv` is set, creates source then adds ref to dmsEnv instead of pattern
- [x] `sourceCreate.jsx` (internal_table): uses `dmsEnv || parent` as source owner for ref updates
- [x] Legacy path preserved when no dmsEnv assigned

### Phase 5: Migration script — DONE

**File**: `dms-server/src/scripts/migrate-to-dmsenv.js`

Follow the pattern of `deprecate-internal-dataset.js` / `migrate-to-per-app.js` (dry-run default, `--apply` to execute).

#### CLI

```bash
node src/scripts/migrate-to-dmsenv.js --source dms-mercury-2                           # dry-run, all apps
node src/scripts/migrate-to-dmsenv.js --source dms-mercury-2 --app mitigat-ny-prod     # dry-run, one app
node src/scripts/migrate-to-dmsenv.js --source dms-mercury-2 --app mitigat-ny-prod --apply  # execute
```

#### Algorithm

1. **Connect to database**, resolve split mode from config.

2. **Find all datasets/forms patterns** with `data.sources` arrays:
   ```sql
   SELECT id, app, type, data FROM {table}
   WHERE type LIKE '%|pattern'
     AND data->>'pattern_type' IN ('datasets', 'forms')
     AND data->'sources' IS NOT NULL
   ```

3. **For each app**, group patterns by their source refs. Patterns that share identical source sets can share a dmsEnv. In practice most apps will have one dmsEnv per datasets pattern, but dedup where possible.

4. **For each unique source group**:
   a. Derive a name from the pattern name or `"Default"` if only one group
   b. Create a `dmsEnv` row: `type = '{siteType}|dmsEnv'`, `data = { name, sources: [...refs] }`
   c. Log: `Created dmsEnv "{name}" (ID {id}) with {n} sources`

5. **Update each pattern**:
   a. Set `data.dmsEnvId` to the created dmsEnv's ID
   b. Remove `data.sources` from the pattern (the dmsEnv now owns them)
   c. Log: `Pattern #{id} "{name}" → dmsEnvId={dmsEnvId}`

6. **Verify**: for each pattern, confirm `dmsEnvId` points to a valid dmsEnv row with the correct sources count.

7. **Summary**: dmsEnvs created, patterns updated, sources moved.

#### Key Details

- Patterns without any sources get a dmsEnv with an empty sources array (or share the app's default dmsEnv)
- The source rows themselves (`{doc_type}|source`) are NOT modified — only the ownership refs move from pattern to dmsEnv
- Source `ref` strings stay the same (e.g., `myapp+my_datasets|source`)
- Forms patterns are included — they use the same `sources` dms-format attribute
- Idempotent: patterns that already have `dmsEnvId` set are skipped

### Phase 6: Initialization

- Auto-create a "Default" dmsEnv when first datasets pattern is created and no dmsEnvs exist
- Page patterns: add config to select dmsEnv in pattern editor

## Design Considerations

### Why not just allow multiple datasources patterns to share sources?

The current tight coupling means moving a source between patterns requires deleting the ref from one and adding to another. The dmsEnv abstraction makes sources a first-class shared resource.

### One vs many dmsEnvs per pattern

Start with one `dmsEnvId` per pattern. The schema supports future expansion to `dmsEnvIds: [1, 2, 3]` by changing the field to an array and updating the datasources builder to merge multiple environments.

### Naming

`dmsEnv` was chosen over `internalPgEnv` because:
- It's shorter
- It's not actually PostgreSQL-specific (works with SQLite too)
- It parallels the external `pgEnv` naming without implying the same backend

### Source doc_type scoping

Currently, source doc_types are scoped to the datasets pattern's doc_type (`{patternDocType}|source`). With dmsEnv, sources could use the dmsEnv's name or ID as their namespace. However, changing doc_type scoping would break existing data. **Decision: keep existing doc_type scoping unchanged.** Sources retain their original doc_type regardless of which dmsEnv owns them.

## Files Changed

| File | Change |
|------|--------|
| `patterns/admin/admin.format.js` | Added `dmsEnvFormat` (name, sources), registered in `patternAdminFormat`, added `dms_envs` site attribute |
| `patterns/admin/siteConfig.jsx` | Pass `dmsEnvs`/`dmsEnvById` through both admin configs and `AdminContext` |
| `patterns/admin/pages/patternEditor/default/settings.jsx` | Added `DmsEnvConfig` component (select/create dmsEnv) |
| `patterns/datasets/siteConfig.jsx` | Accept `dmsEnvs`/`dmsEnvById`, pass `dmsEnv` object through `DatasetsContext` |
| `patterns/datasets/pages/CreatePage.jsx` | Add source ref to dmsEnv (when set) instead of pattern |
| `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` | Use `dmsEnv || parent` as source owner |
| `patterns/page/siteConfig.jsx` | Accept `dmsEnvs`/`dmsEnvById` |
| `render/spa/utils/index.js` | Extract `dms_envs` from site data, `buildDatasources()` helper, per-pattern datasources |
| `dms-server/src/scripts/migrate-to-dmsenv.js` | Migration script: groups patterns by source set, creates dmsEnvs, sets `dmsEnvId`, removes `sources` from patterns |
| `dms-server/src/scripts/rename-split-tables.js` | Rename old-named split tables to new naming convention |
| `dms-server/src/db/table-resolver.js` | Case-insensitive regex, sanitize() in new naming, invalid-entry table consolidation |
| `dms-server/src/routes/index.js` | maxPaths 50K → 500K |
| `dms-server/src/routes/uda/utils.js` | Case-insensitive source lookup, lowercase type for split queries |
| `dms-server/src/routes/dms/dms.controller.js` | Case-insensitive source lookup |
| `dms-server/package.json` | `--max-http-header-size=1048576` for large Falcor GET URLs |
| `dms-server/tests/test-table-splitting.js` | Updated assertions for invalid-entry table consolidation |

### Phase 7: Migrated dataset fixes and invalid-entry consolidation — DONE

Fixes discovered and applied while testing old datasets migrated via `copy-db.js` from dms-mercury to dms-mercury-2, where dmsEnv is in use.

#### UDA / table-resolver fixes for migrated datasets

- [x] **Falcor maxPaths 50K → 500K** (`routes/index.js` line 28) — wide tables (121+ columns × 1000 rows = 121K paths) exceeded the router's path limit
- [x] **Case-insensitive split type regex** (`table-resolver.js` line 24) — old datasets have mixed-case `doc_type` (e.g., `Actions_Revised-1074456`); added `/i` flag to `NAME_SPLIT_REGEX`
- [x] **sanitize() in new table naming** (`table-resolver.js` lines 124, 146, 160) — `resolveTable()` used raw `parsed.docType` (mixed case) instead of `sanitize(parsed.docType)` for new naming; generated wrong table names
- [x] **Case-insensitive source lookup** (`uda/utils.js` line 147, `dms.controller.js` line 143) — added `lower()` on both sides of `doc_type` comparison
- [x] **Lowercase type for split queries** (`uda/utils.js` line 140) — client sends mixed case from `doc_type`, stored rows use lowercase; added `type = type.toLowerCase()` for split types
- [x] **`--max-http-header-size=1MB`** (`package.json` lines 8-9) — Falcor GET requests with 120+ columns exceed Node.js 16KB header limit

#### Rename split tables script

- [x] Created `src/scripts/rename-split-tables.js` — renames old-named split tables (`data_items__actions_revised_1074456`) to new naming (`data_items__s1029065_v1074456_actions_revised`); resolves source IDs via view_id→source mapping; handles index renaming; dry-run default, `--apply` to execute
- [x] Successfully renamed 39 tables on dms-mercury-2

#### Invalid-entry table consolidation

- [x] **Removed `_invalid` suffix from table naming** (`table-resolver.js`) — valid and invalid dataset rows now share the same split table, distinguished only by their `type` column value. Previously `-invalid-entry` types got separate `_invalid` suffixed tables, causing two bugs:
  - `getRowsByTypes` resolved the table from the first type (valid), so re-validation never saw rows in the `_invalid` table
  - `batchUpdateType` updated the `type` column but rows stayed physically in the `_invalid` table
- [x] Updated `resolveTable()` to strip `-invalid-entry` before computing table name (all 3 paths: legacy, per-app PG, per-app SQLite)
- [x] Fallback path (no sourceId) also strips `-invalid-entry` before sanitizing
- [x] Updated 5 test assertions in `test-table-splitting.js` to verify invalid entries resolve to same table as valid entries
- [x] All 137 table splitting tests pass

#### Research document

- [x] Created `planning/research/dmsenv-datasets-uda.md` — comprehensive doc covering dmsEnv data model, type hierarchy, source creation flow, UDA query resolution, table splitting, and all fixes applied

#### Cleanup script vulnerability (separate task)

- [ ] `findOrphanedSources` only validates against pattern `doc_type`, not dmsEnv refs; sources owned by a dmsEnv can be incorrectly flagged as orphans → see `planning/tasks/current/cleanup-protect-dmsenv-sources.md`

## Testing Checklist

- [ ] dmsEnv rows can be created, read, updated, deleted
- [ ] Pattern editor shows pgEnv and dmsEnv config
- [ ] Datasets pattern lists sources from its dmsEnv
- [ ] Page pattern accesses internal sources via dmsEnv
- [ ] Source creation adds ref to dmsEnv (not pattern)
- [ ] Multiple patterns can reference the same dmsEnv
- [ ] Auto-create dmsEnv on first datasets pattern in fresh project
- [ ] Existing sites work without changes (backward compatibility)
- [ ] Migration dry-run shows correct plan for existing sites
- [ ] Migration `--apply` creates dmsEnvs, sets `dmsEnvId` on patterns, removes `sources` from patterns
- [ ] Migration is idempotent (re-running is safe)
- [ ] Patterns with no sources get a dmsEnv (empty or shared default)
- [ ] Forms patterns are migrated alongside datasets patterns
- [ ] Old migrated datasets with mixed-case doc_types load data correctly
- [ ] Re-validation correctly finds and moves rows between valid/invalid types (same table)
- [ ] Cleanup script does not flag dmsEnv-linked sources as orphans
