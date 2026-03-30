# Type System Refactor

## Status: IN PROGRESS — Phase 0-5, 7-16, 18 DONE, Phase 6 DEFERRED

## Objective

Replace the inconsistent DMS type encoding with a uniform `{parent}:{instance}|{rowKind}` scheme. Remove UUID-based doc_types in favor of human-readable names. Eliminate `data.doc_type` entirely — instance names live in the `type` column.

## Problem

The current type system encodes row kind, instance identity, and parent relationship inconsistently:

| Row kind | Current type | Row kind marker | Instance | Parent |
|----------|-------------|-----------------|----------|--------|
| Site | `prod` | **none** | yes | no |
| Pattern | `pattern` | yes | **none** | **none** |
| Page | `43e8f0e7-...` (UUID) | **none** | **none** | yes (pattern doc_type) |
| Section (→ Component) | `43e8f0e7-...\|cms-section` | yes | no | yes |
| dmsEnv | `dmsEnv` | yes | **none** | **none** |
| Source | `test-meta-forms\|source` | yes | no | yes (pattern doc_type) |
| View | `test-meta-forms\|source\|view` | yes | no | yes (chain) |
| Data row | `adamtest1-954604` | **none** | yes (composite) | **none** |

Problems:
- Pages have no row kind — indistinguishable from sites by type alone
- Patterns have no instance or parent info — all patterns in an app share `type = 'pattern'`
- dmsEnvs are unscoped — `type = 'dmsEnv'` with no site or instance info
- Sources use pattern's doc_type as parent, but should use dmsEnv
- Data rows require complex regex to detect (no row kind marker)
- UUIDs are unreadable and scattered across type strings
- `data.doc_type` is a hidden second identity that gets baked into child types at creation time

## New Type Scheme

### Separators

- `|` = hierarchy separator ("belongs to")
- `:` = instance name separator ("is named")
- Row kind is always the **last** segment after the final `|` (or after `:` if no `|`)

### Format

```
{parent}:{instance}|{rowKind}
```

Any segment can be omitted when not needed. Reading right-to-left: kind, then instance (after `:`), then parent chain (before first `:`).

### Type Map

| Row kind | New type format | Example | Instance from | Parent from |
|----------|----------------|---------|---------------|-------------|
| Site | `{name}:site` | `prod:site` | user-defined site name | — |
| Theme | `{name}:theme` | `catalyst:theme` | user-defined theme name | — |
| Pattern | `{site}\|{name}:pattern` | `prod\|test-meta-forms:pattern` | user-defined (was doc_type) | site instance |
| Page | `{pattern}\|page` | `test-meta-forms\|page` | — (by row ID/slug) | pattern instance |
| Component | `{pattern}\|component` | `test-meta-forms\|component` | — (by row ID) | pattern instance |
| dmsEnv | `{site}\|{name}:dmsenv` | `prod\|my-env:dmsenv` | user-defined env name | site instance |
| Source | `{dmsenv}\|{name}:source` | `my-env\|adamtest1:source` | from source name/title | dmsEnv instance |
| View | `{source}\|{name}:view` | `adamtest1\|v1:view` | version name | source instance |
| Data row | `{source}\|{view}:data` | `adamtest1\|v1:data` | composite (source+view) | — |

### Parsing

Split on `|` to get segments. The last segment is `{instance}:{rowKind}` or just `{rowKind}`. If `:` is present in a segment, text before `:` is the instance name, text after is the row kind.

```
prod|test-meta-forms:pattern
  parent: prod
  instance: test-meta-forms
  kind: pattern

test-meta-forms|component
  parent: test-meta-forms
  instance: (none)
  kind: section

adamtest1|v1:data
  parent: adamtest1
  instance: v1
  kind: data
```

### Split table detection

No regex needed:

```js
function isSplitType(type) {
  return type.endsWith(':data');
}
```

### Common queries

| Query | SQL |
|-------|-----|
| All sites | `type LIKE '%:site'` |
| All patterns for site `prod` | `type LIKE 'prod\|%:pattern'` |
| All pages for pattern | `type = '{pattern_instance}\|page'` |
| All components for pattern | `type = '{pattern_instance}\|component'` |
| All dmsEnvs for site | `type LIKE 'prod\|%:dmsenv'` |
| All sources in dmsEnv | `type LIKE 'my-env\|%:source'` |
| All views for source | `type LIKE 'adamtest1\|%:view'` |
| All data rows | `type LIKE '%:data'` |
| Is this a pattern? | `type LIKE '%:pattern'` |

### What disappears

- `data.doc_type` on patterns — becomes instance name in type column
- `data.doc_type` on sources — becomes instance name in type column (was previously the second, hidden doc_type)
- `UUID_SPLIT_REGEX` and `NAME_SPLIT_REGEX` — replaced by `:data` suffix check
- All case-sensitivity workarounds (lowercase normalization, `/i` flags)

## UUID Removal

Patterns and sources currently use UUIDs as doc_type values. Replace with human-readable slugs derived from the name/title field.

### Name-to-slug conversion

Use `nameToDocType()` from `patterns/datasets/utils/nameToDocType.js` (or a shared version):
- Lowercase
- Replace spaces/hyphens with underscores
- Strip non-alphanumeric/underscore chars
- Must start with a letter

### Collision checks

Before creating any row with an instance name, check uniqueness:
- **Pattern**: `SELECT 1 FROM {table} WHERE app = $1 AND type LIKE '{site}|' || $2 || ':pattern'` — unique within site
- **Source**: `SELECT 1 FROM {table} WHERE app = $1 AND type LIKE '%|' || $2 || ':source'` — unique within app
- **dmsEnv**: `SELECT 1 FROM {table} WHERE app = $1 AND type LIKE '{site}|' || $2 || ':dmsenv'` — unique within site
- **Theme**: `SELECT 1 FROM {table} WHERE app = $1 AND type = $2 || ':theme'` — unique within app

On collision, append a numeric suffix: `my_dataset`, `my_dataset_2`, `my_dataset_3`.

### Files that generate UUIDs for doc_type

- `patterns/admin/pages/editSite.jsx` — lines 127, 267, 332 (`crypto.randomUUID()`)
- `patterns/admin/pages/patternEditor/default/settings.jsx` — line 62 (`crypto.randomUUID()`)
- `patterns/admin/components/patternList.jsx` — lines 244, 310 (`uuidv4()`)
- `patterns/datasets/pages/dataTypes/internal/pages/create.jsx` — line 31 (`crypto.randomUUID()`)
- `patterns/datasets/pages/createDataset.jsx` — line 47 (`crypto.randomUUID()`)
- `patterns/forms/components/patternListComponent/index.jsx` — line 163 (`uuidv4()`)

Note: `crypto.randomUUID()` calls in section/page code (sectionArray.jsx, sectionMenu.jsx, settingsPane.jsx, sectionGroupsPane.jsx) are for tracking IDs within `data`, NOT for type column values — these do not need to change.

## Implementation

### Phase 0: Shared utilities — DONE

Created shared parsing/construction utilities used by all subsequent phases.

**Files created**:
- `packages/dms-server/src/db/type-utils.js` (server, CommonJS)
- `packages/dms/src/utils/type-utils.js` (client, ESM)
- `packages/dms-server/tests/test-type-utils.js` (74 tests)

- [x] `parseRowType(type)` → `{ parent, instance, kind, raw }` — parse any type string
- [x] `buildType({ parent, instance, kind })` → type string
- [x] `getKind(type)` → row kind string (last segment after final `|`, after `:`)
- [x] `getParent(type)` → parent prefix (everything before last `|`)
- [x] `getInstance(type)` → instance name (text before `:` in the tail segment)
- [x] `isSplitType(type)` → `type.endsWith(':data')`
- [x] `nameToSlug(name)` → sanitized slug from human-readable name (same logic as `nameToDocType.js`)
- [x] `parseSplitDataType(type)` → `{ source, view }` — parse data row type for table routing
- [x] Write unit tests for all utilities — 74 tests, all passing

### Phase 1: Server — table-resolver — DONE

Updated split table detection and routing to support new type format while preserving legacy backward compat.

**File**: `dms-server/src/db/table-resolver.js`

- [x] `isSplitType()` — now checks `:data` suffix first (via type-utils), falls back to legacy `NAME_SPLIT_REGEX`
- [x] `parseType()` — tries new format `parseSplitDataType()` first (returns `{source, view}`), falls back to legacy parse (returns `{docType, viewId, isInvalid}`)
- [x] Legacy `UUID_SPLIT_REGEX`, `NAME_SPLIT_REGEX` kept for backward compat during migration
- [x] Added `splitTableName()` helper — handles both new format (`{source}|{view}:data`) and legacy format, with/without sourceId
- [x] `resolveTable()` refactored to use `splitTableName()` — deduplicated across all 3 paths (legacy, per-app PG, per-app SQLite)
- [x] `sanitize()` unchanged — works for new format names
- [x] Added 22 new tests in `test-table-splitting.js` for new format types (159 total, all passing)

**Design note**: Legacy regex kept as fallback so old-format data still routes correctly during migration period. After migration script runs and all types are converted, legacy regex can be removed.

### Phase 2: Server — controller — DONE

Updated controller type handling to support both old and new formats during transition.

**File**: `dms-server/src/routes/dms/dms.controller.js`

- [x] Import `parseSplitDataType` from type-utils
- [x] `lookupSourceId()` — handles new format (`{source}|{view}:data` → look up `type LIKE '%|{source}:source'`) with legacy fallback (`data.doc_type` match). Legacy source query now matches both `%|source` and `%:source`
- [x] `_sourceIdCache` key format — uses source instance name for new format, docType for legacy
- [x] Tags query (line 537): `type = $2 || '|cms-section'` → `(type = $2 || '|component' OR type = $2 || '|cms-section')` — supports both new and legacy
- [x] `findSourceIdByDocType()` — updated to match both new format (`type LIKE '%|{name}:source'`) and legacy (`data.doc_type` match with `%|source` or `%:source`)
- [x] `type NOT LIKE '%|template'` — unchanged, still works for both formats (templates use `|template`)
- [ ] Name collision check helper — deferred to Phase 9 (admin pattern client-side, where collision checks are needed at creation time)
- [x] All existing tests pass (no test changes needed — these changes are backward-compatible)

**Design note**: `ensureForWrite()`/`ensureForRead()` don't reference type patterns directly — they delegate to `resolve()` which calls `resolveTable()`. No changes needed there. The `NOT LIKE '%|%'` pattern for finding pages/sites was not present in the controller's main queries — it appears only in scripts (Phase 6).

### Phase 3: Server — UDA routes — DONE

Updated UDA source resolution and query routing to support both old and new formats.

**File**: `dms-server/src/routes/uda/utils.js`

- [x] Import `parseSplitDataType` from type-utils
- [x] `getSitePatterns()` — added `type LIKE '%:pattern'` to match new format alongside legacy
- [x] `getSiteSources()` — added `OR data->>'doc_type' IS NULL` to handle new format patterns (where doc_type is removed)
- [x] `getEssentials()` source ID lookup — new format: looks up source by instance name in type column (`type LIKE '%|{source}:source'`); legacy fallback: looks up by `data.doc_type` with both `%|source` and `%:source` patterns
- [ ] Lowercase normalization kept for now — needed during migration for legacy mixed-case types
- [ ] `dmsMainTable()` — unchanged (resolves non-split table, format-independent)

**File**: `dms-server/src/routes/uda/uda.controller.js`

- [x] No changes needed — delegates to `getEssentials()` and `getSiteSources()` which now handle both formats
- [x] All 35 UDA tests pass

### Phase 4: Server — sync module — DONE

**File**: `dms-server/src/routes/sync/sync.js`

- [x] `isSyncExcluded()` — already works (delegates to `isSplitType()` which now checks `:data` first)
- [x] Pattern-scoped bootstrap query — `type = $2 OR type LIKE $2 || '|%'` still works because new format also uses `|` as hierarchy separator (e.g., `{pattern}|page`, `{pattern}|component`)
- [x] Delta endpoint queries — same pattern, still compatible
- [x] Type filters — `isSyncExcluded` handles both formats
- [x] All 75 sync tests pass — no code changes needed

### Phase 5: Server — upload/publish routes — DONE

**File**: `dms-server/src/upload/routes.js`

- [x] Import `isSplitType` and `parseSplitDataType` from type-utils
- [x] `createPublishHandler()` — detects new format (`:data` suffix). New format: all rows get same type, `data.isValid` flag set. Legacy: separate valid/invalid types preserved
- [x] `buildRowData()` — unchanged (still sets `data.isValid`), but publish handler now ignores it for type selection in new format
- [x] `createValidateHandler()` — new format: queries single type, updates `data.isValid` via `setDataById` instead of `batchUpdateType`. Legacy: preserves old valid→invalid type movement
- [x] Source config lookup — new format: extracts source instance from `parseSplitDataType(type).source`. Legacy: strips view ID suffix from type
- [x] All existing tests pass

### Phase 6: Server — scripts — DEFERRED

Scripts operate on existing databases and must be updated AFTER the migration script (Phase 16) runs. Updating them now would break compatibility with pre-migration databases.

- [ ] `scripts/cleanup-db.js` — extensive type pattern usage (~20 LIKE patterns). Must support both formats or be updated after migration
- [ ] `scripts/copy-db.js` — uses `resolveTable()` which already supports both formats
- [ ] `scripts/migrate-to-per-app.js` — uses `isSplitType` which already supports both formats
- [ ] Other scripts (`migrate-split-tables.js`, `migrate-to-dmsenv.js`, etc.) — update after migration

**Design note**: The migration script (Phase 16) will be the trigger for updating these. Once migration runs, the old format patterns become unnecessary. Scripts should be updated in a follow-up pass after migration is verified.

### Phase 7: Client — format system — DONE

Client-side format changes must be applied simultaneously with data migration. The format types define what gets stored in `data_items.type` AND what queries use — changing them before migration breaks the client.

**Key design decisions:**

1. **Format `type` fields become kind names**: `cmsSection.type = 'component'` (was `'cms-section'`), `cmsPageFormat.type = 'page'` (was `'docs-page'`) — **implemented in Phase 8**

2. **`initializePatternFormat(format, app, instanceName)`** changes:
   - `format.type = `${instanceName}|${format.type}`` — builds instance + kind
   - All child formats use the same instanceName (flat siblings, not nested)

3. **`pattern2routes` type extraction**: `getInstance(pattern.type)` extracts instance name from migrated type column, falls back to `pattern.doc_type` for backward compat.

4. **Dataset sources decouple from patterns**: Source type is `{dmsenv}|{name}:source` (dmsEnv parent, not pattern). The format registration hierarchy no longer mirrors the type hierarchy for datasets — **addressed in Phase 11/12**.

5. **Admin site type**: `adminConfig` builds full site type as `${type}:site` (appends `:site` suffix if not already present).

**File**: `dms-manager/_utils.jsx`

- [x] Update `initializePatternFormat()` — `instanceName` parameter, builds `${instanceName}|${format.type}`
- [x] Update `updateRegisteredFormats()` — recurses with `instanceName` (flat siblings, not nested types)
- [x] Update `updateAttributes()` — format key uses `instanceName` prefix

**File**: `render/spa/utils/index.js` — `pattern2routes()`

- [x] Update pattern type extraction to use `getInstance()` with `doc_type` fallback
- [x] Update `buildDatasources()` env format — uses `getInstance(dsPattern.type)` with fallback
- [x] Update AdminPattern construction — `siteInstance` for siteType, `doc_type` kept for fallback
- [x] `siteInstance = getInstance(siteType) || siteType` used for all format initialization

**File**: `render/spa/dmsSiteFactory.jsx`

- [x] Import `getInstance`, extract `siteInstance` for format initialization

**File**: `render/ssr2/handler.jsx`

- [x] Import `getInstance`, extract `siteInstance` for format initialization

**File**: `patterns/admin/siteConfig.jsx`

- [x] `adminConfig`: `format.type = type.includes(':') ? type : `${type}:site`` — builds full site type
- [x] `patternConfig`: unchanged (will be updated in Phase 9)

**File**: `patterns/page/siteConfig.jsx`

- [x] `additionalSectionAttributes` finder: matches both `'component'` and `'cms-section'` in format type

### Phase 8: Client — format definitions — DONE

Updated format files to use new row kind names.

- [x] `patterns/admin/admin.format.js`
  - `patternAdminFormat.type`: `'pattern-admin'` → `'site'`
  - `dmsEnvFormat.type`: `'dmsEnv'` → `'dmsenv'`
  - `dms_envs` attribute format ref: `'admin+dmsEnv'` → `'admin+dmsenv'`
  - `pattern.type`: `'pattern'` — unchanged (already correct)
  - `themeFormat.type`: `'theme'` — unchanged (already correct)
- [x] `patterns/page/page.format.js`
  - `cmsSection.type`: `'cms-section'` → `'component'`
  - `cmsPageFormat.type`: `'docs-page'` → `'page'`
  - `sections`/`draft_sections` format refs: `'dms-site+cms-section'` → `'dms-site+component'`
- [x] `patterns/datasets/datasets.format.js` — no changes needed (`source`, `view`, `form-manager` already correct kinds)
- [x] `patterns/forms/forms.format.js` — no changes needed (same structure as datasets)
- [x] `patterns/mapeditor/mapeditor.format.js` — `'map-symbology'` → `'symbology'`

**Code references updated:**
- [x] `patterns/page/components/sections/useDataSource.js` — format finder matches `'component'` (with `'cms-section'` fallback), type constructors use `|component`
- [x] `patterns/admin/pages/patternEditor/default/settings.jsx` — dmsEnv creation type: `'dmsEnv'` → `'dmsenv'`, ref format updated
- [x] `patterns/page/siteConfig.jsx` — already updated in Phase 7 (matches both `'component'` and `'cms-section'`)

### Phase 9: Client — admin pattern — DONE

Updated pattern creation, editing, duplication, and deletion to use slug-based identifiers.

**Key design decisions:**

1. **dms-format loading now returns `type` column**: Added `'type'` to `attrsToFetch` in `loadDmsFormats` (`api/proecessNewData.js`). This makes the DB `type` column available on all dms-format loaded items (patterns, themes, dmsEnvs), enabling `getInstance(item.type)` to extract the instance name from migrated type strings.

2. **Pattern creation bypasses dms-format path**: New patterns are created via direct `falcor.call(['dms', 'data', 'create'], [app, type, data])` with the full type `{siteInstance}|{slug}:pattern`. A `{ref, id}` is then added to the site's patterns array. This avoids the limitation of `updateDMSAttrs` which uses a single format type for all items.

3. **Instance name extraction fallback chain**: `getInstance(item.type) || item?.base_url?.replace(/\//g, '')` — handles migrated rows (type has instance) and legacy rows (base_url fallback). `doc_type` fallback removed since migration strips `doc_type` from data.

4. **Collision detection**: Local check against existing pattern slugs before creation. Uses same fallback chain to extract existing instance names.

**File**: `api/proecessNewData.js`

- [x] Add `'type'` to `attrsToFetch` in `loadDmsFormats` — makes DB type column available on dms-format loaded items

**File**: `patterns/admin/pages/editSite.jsx`

- [x] Import `nameToSlug`, `getInstance` from `utils/type-utils`, `useFalcor` from `@availabs/avl-falcor`
- [x] Get `type: siteType` from AdminContext, compute `siteInstance = getInstance(siteType) || siteType`
- [x] `addNewValue()` — async, creates pattern via direct falcor.call with type `{siteInstance}|{slug}:pattern`, adds ref to site patterns array, local collision check
- [x] `duplicate()` — renamed params to `{oldInstance, newInstance}` (was `{oldType, newType}`)
- [x] Inline duplicate handler — uses `getInstance(d.row.type)` with doc_type/base_url fallback, removes `doc_type` from copied data
- [x] Modal duplicate handler — same changes
- [x] Add button — no longer sets `doc_type: crypto.randomUUID()`

**File**: `patterns/admin/pages/patternEditor/default/settings.jsx`

- [x] Import `nameToSlug`, `getInstance` from `utils/type-utils`
- [x] `handleDuplicate()` — uses `getInstance(value.type)` for old instance, `nameToSlug(newName)` for new slug, creates with type `{siteInstance}|{newSlug}:pattern`, removes `doc_type` from copied data
- [x] `DmsEnvConfig.handleCreateEnv()` — creates dmsEnv with type `{siteInstance}|{envSlug}:dmsenv`, ref format updated to `{app}+{siteInstance}|dmsenv`

**File**: `patterns/admin/components/patternList.jsx`

- [x] Import `nameToSlug`, `getInstance`, `useFalcor`
- [x] `addNewValue()` — same refactor as editSite.jsx (direct falcor.call, collision check)
- [x] `duplicate()` — renamed params to `{oldInstance, newInstance}`
- [x] Modal duplicate handler — uses `getInstance` + fallback, removes `doc_type`
- [x] Add button — no longer sets `doc_type: uuidv4()`

**File**: `patterns/admin/pages/themes/list.jsx`

- [x] Import `nameToSlug` from `utils/type-utils`
- [x] Theme creation — `theme_id: nameToSlug(newItem.name)` instead of `crypto.randomUUID()`
- [x] Theme duplication — `theme_id: nameToSlug(duplicate_theme.name)` instead of `crypto.randomUUID()`

**Note**: `createSite.jsx` unchanged — the initial auth pattern doesn't use `doc_type`. Site type (`{name}:site`) is handled by `adminConfig` in `siteConfig.jsx` (Phase 7).

### Phase 10: Client — page pattern — DONE

Most page pattern files needed no changes — the format system (Phase 7+8) already produces correct `{instance}|page` and `{instance}|component` types. The main change was in `useDataSource.js` for internal source keys.

**File**: `patterns/page/pages/edit/editFunctions.jsx`

- [x] `newPage()` — no changes needed. Page type comes from format (`{instance}|page`), set by `initializePatternFormat` in siteConfig
- [x] Component creation — no changes needed. Component type comes from format (`{instance}|component`)

**File**: `patterns/page/components/sections/sectionArray.jsx`

- [x] Parent ref `${item.app}+${item.type}` — no changes needed. `item.type` is the DB type column (e.g., `my_docs|page`), which matches the format key. Works because `createRequest` includes `type` in requested attributes.

**File**: `patterns/page/components/sections/sectionMenu.jsx`

- [x] Reviewed — UUID usage (`crypto.randomUUID()`) is for tracking IDs within data, NOT for type column. No changes needed.

**File**: `patterns/page/siteConfig.jsx`

- [x] Format initialization already correct: `initializePatternFormat(cmsFormat, app, type)` where `type` is the pattern instance name
- [x] `datasources` passed through to CMSContext unchanged — already constructed correctly in `pattern2routes` (Phase 7)
- [x] No hardcoded type strings to update

**File**: `patterns/page/components/sections/useDataSource.js`

- [x] Internal source keys updated: `${app}+${type}|page` (was `${app}+${type}`) and `${app}+${type}|component` (was `${app}+${type}+sections`)
- [x] Source type detection: `sourceId.endsWith("|component")` replaces `sourceId.includes("+sections")`
- [x] `sourceInfo.type` for pages: `${type}|page` (was bare `type`) — matches DB type for page rows
- [x] `sourceInfo.env` simplified: uses `sourceId` directly for both pages and sections (removes `type.replace("+sections", "")` hack)

### Phase 11: Client — datasets pattern — DONE

Updated dataset creation flows to use new type scheme. Removed `doc_type` from source data.

**Key design decisions:**

1. **Source type uses dmsEnv parent**: `{dmsEnvInstance}|{sourceSlug}:source` (e.g., `my_env|traffic_counts:source`). Falls back to pattern `type` when no dmsEnv.

2. **View type uses source parent**: `{sourceSlug}|v1:view` (e.g., `traffic_counts|v1:view`).

3. **Data row type uses `:data` suffix with numeric view ID**: `{sourceSlug}|{viewId}:data` (e.g., `traffic_counts|10:data`) instead of `{doc_type}-{viewId}`. Uses numeric view ID (not `v1`) so downstream table/upload pages can reconstruct the type from `nameToSlug(source.name)` + `params.view_id`.

4. **`doc_type` removed from source data**: No longer set during creation. Removed from `datasets.format.js` attribute definition, `InternalSourceAttributes` in `consts.js`, and `buildEnvsForListing` srcAttributes.

5. **Dead code skipped**: `createDataset.jsx` and `internal/pages/create.jsx` are not imported anywhere — no changes needed.

**File**: `patterns/datasets/pages/CreatePage.jsx`

- [x] Import `nameToSlug`, `getInstance` from `utils/type-utils` (replaces `nameToDocType`)
- [x] Source creation type: `${dmsEnvInstance}|${sourceSlug}:source` (dmsEnv path)
- [x] Source ref: `${app}+${dmsEnvInstance}|source`
- [x] Removed `newData.doc_type` assignment

**File**: `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx`

- [x] Import `nameToSlug`, `getInstance` from `utils/type-utils` (replaces `nameToDocType`)
- [x] Source type: `${dmsEnvInstance}|${sourceSlug}:source`
- [x] View type: `${sourceSlug}|v1:view`
- [x] View ref: `${app}+${sourceSlug}|view`
- [x] Source ref: `${app}+${dmsEnvInstance}|source`
- [x] Data row type (Upload format): `${sourceSlug}|${viewId}:data` (uses numeric view ID for reconstructability)
- [x] Removed `doc_type` from source creation data
- [x] Store `sourceSlug` on createdSource (instead of `doc_type`) for upload format

**File**: `patterns/datasets/pages/dataTypes/internal/pages/create.jsx`

- [x] SKIPPED — dead code (exports undefined `UploadPage`, not imported anywhere)

**File**: `patterns/datasets/pages/createDataset.jsx`

- [x] SKIPPED — dead code (not imported anywhere)

**File**: `patterns/datasets/utils/nameToDocType.js`

- [x] Shared `nameToSlug()` already exists in `utils/type-utils.js` (identical logic). Imports updated in CreatePage and sourceCreate.

**File**: `patterns/datasets/utils/datasources.js`

- [x] Removed `'doc_type'` from internal `srcAttributes` in `buildEnvsForListing()`
- [x] `getExternalEnv()` — no changes needed (external env format unchanged)

**File**: `patterns/datasets/datasets.format.js`

- [x] Removed `doc_type` attribute definition from source format

**File**: `patterns/datasets/pages/dataTypes/default/consts.js`

- [x] Removed `'doc_type'` from `InternalSourceAttributes`

**File**: `patterns/datasets/siteConfig.jsx`

- [x] No changes needed — format initialization already correct via `initializePatternFormat`, dmsEnv passing already correct

**Downstream `doc_type` consumer fixes — DONE:**

All files that referenced `source.doc_type` for constructing data query types, env keys, or display fallbacks have been updated to use `nameToSlug(source.name)` and the new type format:

- [x] `ValidateComp.jsx` — data row type `${doc_type}-${view_id}` → `${sourceSlug}|${view_id}:data`, invalid entry type uses `:data-invalid-entry` suffix
- [x] `version.jsx` — `ClearDataBtn` renamed `type` prop to `sourceSlug`, constructs `${sourceSlug}|${view_id}:data` and `:data-invalid-entry`
- [x] `DatasetsList/index.jsx` — removed `doc_type` env construction, sort by `name`, display fallbacks cleaned
- [x] `overview.jsx` — display fallback uses `name` and `type` instead of `doc_type`
- [x] `SourcePage.jsx` — breadcrumb fallback uses `name`
- [x] `SettingsPage.jsx` — display fallback uses `name`
- [x] `gis_dataset/pages/table.jsx` — sourceInfo type: `${sourceSlug}|${view_id}:data`
- [x] `internal/pages/upload.jsx` — format type: `${nameToSlug(source.name)}|${view_id}:data`
- [x] `createDataset.jsx` — removed `doc_type = crypto.randomUUID()`, clone count uses `name` instead of `doc_type`
- [x] `internal/pages/create.jsx` — removed `doc_type = crypto.randomUUID()`

### Phase 12: Client — forms pattern — DONE

**File**: `patterns/forms/components/patternListComponent/index.jsx`

- [x] Replaced `uuidv4()` import with `nameToSlug` from `utils/type-utils`
- [x] Removed `clonedData.doc_type = uuidv4()` — doc_type no longer set on source creation (instance name lives in DB type column)

**File**: `patterns/forms/forms.format.js`

- [x] Removed `doc_type` attribute definition from source format (matches datasets.format.js change)

**File**: `patterns/forms/siteConfig.jsx`

- [x] No changes needed — format initialization already uses `initializePatternFormat`, no hardcoded type strings in route config

**Downstream `doc_type` consumer fixes — DONE:**

- [x] `patternListComponent/index.jsx` — display, sort, search, clone count all use `name` instead of `doc_type`
- [x] `forms/pages/table.jsx` — sourceInfo type: `${itemSlug}|${view_id}:data`
- [x] `forms/pages/upload.jsx` — format type: `${nameToSlug(item.name)}|${view_id}:data`
- [x] `forms/pages/version.jsx` — ClearDataBtn uses `sourceSlug` prop, constructs `:data` and `:data-invalid-entry`
- [x] `forms/pages/admin.jsx` — ClearDataBtn uses `nameToSlug(item.name)`
- [x] `forms/pages/overview.jsx` — display uses `name` and `type` instead of `doc_type`
- [x] `forms/pages/validate.jsx` — display fallback uses `name`
- [x] `forms/pages/manage/metadata.jsx` — display fallback uses `name`

### Phase 13: Client — auth pattern — DONE

- [x] Reviewed `patterns/auth/siteConfig.jsx` — no type strings constructed. Format is bare `{app, attributes: []}` with no `type` field. Auth routes don't create/query DMS data items. No changes needed.

### Phase 14: Client — mapeditor pattern — DONE

- [x] Reviewed `patterns/mapeditor/` — no type strings constructed. All `falcor.call` uses pass `[app, type, ...]` from `MapEditorContext` (already correct values from `pattern2routes`). No `doc_type` references, no UUID generation for types.
- [x] `siteConfig.jsx` sets `format.type = type` directly (not via `initializePatternFormat`) — pre-existing pattern-specific behavior, no change needed.
- [x] Symbology CRUD uses `["dms", "data", "create/edit/delete"]` with context values — no hardcoded types.

### Phase 15: Client — API layer — DONE

No changes needed. The API layer is type-agnostic — it passes through `format.app` and `format.type` from config without constructing type strings:

- [x] `api/index.js` — `dmsDataLoader`/`dmsDataEditor` use format values, no hardcoded types
- [x] `api/updateDMSAttrs.js` — splits `configs[attr].format` on `+` for app/type; format strings already contain new-format types after Phase 8
- [x] `api/createRequest.js` — builds Falcor paths from format, no hardcoded types
- [x] `api/proecessNewData.js` — already updated in Phase 9 (added `'type'` to `attrsToFetch`)

### Phase 16: Migration script — DONE

**File**: `dms-server/src/scripts/migrate-type-system.js`

Transforms all existing data from old type format to new format. Dry-run by default, `--apply` to execute.

**Full migration of `dms-mercury-types` completed**: 238,340 rows scanned across 49 per-app schemas + shared table. 87,059 type updates applied. All apps migrated successfully.

**Key features**:
- Idempotent: already-migrated types (containing `:`) are skipped
- Source/view matching: uses `sourceByPrefix` index (keyed by pattern doc_type) for view→source resolution
- View slug to data row mapping: `viewIdToSlug` map ensures data rows use the same slug as their view
- Removes `data.doc_type` from pattern and source rows
- Collision detection with `_2`, `_3` suffixes
- Memory-optimized: only loads `data` column for config rows (sites, patterns, themes, dmsEnvs, sources, views); pages/sections/data rows load id/app/type only
- Streaming per-table processing: processes one schema at a time, applies updates immediately, then frees memory
- Per-app schema discovery: auto-discovers `dms_*` PostgreSQL schemas for per-app split mode databases
- Partial re-run support: rebuilds patternMap, dmsEnvMap, sourceMap, sourceByPrefix, viewIdToSlug from already-migrated rows

**Bugs fixed during testing**:
- View matching: views use pattern's doc_type as type prefix, not source's doc_type. Fixed with `sourceByPrefix` index.
- Data row view slug: used view row ID instead of view name slug. Fixed with `viewIdToSlug` map.
- Idempotency: `isAlreadyMigrated()` check prevents re-transformation of already-migrated types.
- Per-app schema discovery: migration only queried shared `dms.data_items` — per-app schemas like `dms_asm.data_items` were missed. Fixed with `loadAllApps()`.
- OOM at 4GB: loading 159k rows with full JSON data exceeded V8 heap. Fixed by only loading `data` for config rows + streaming per-table processing.

**Remaining limitation**: Split table DDL rename not implemented — new data will be written to correctly-named tables, but existing split tables keep their old names. A follow-up table rename step can be added if needed.

### Phase 17: Tests — NOT STARTED

- [ ] Update all test files for new type format:
  - `test-sqlite.js`
  - `test-controller.js`
  - `test-graph.js`
  - `test-workflow.js`
  - `test-table-splitting.js`
  - `test-uda.js`
  - `test-auth.js`
  - `test-db-cleanup.js`
  - `test-db-copy.js`
  - `test-sync.js`
  - `test-sqlite-compat.js`
- [ ] Add new tests for type parsing utilities
- [ ] Add collision check tests
- [ ] Run full test suite on SQLite and PostgreSQL

### Phase 18: Site migration script (legacy → modern) — DONE

A purpose-built migration script that takes a legacy database and produces a clean modern database with the new type scheme, split tables for internal datasets, and proper dmsEnvironment ownership. Unlike Phase 16's in-place type updater, this script copies data between two separate databases, following parent-child relationships from a single site record to only transfer referenced content.

#### Scope

- **Input**: Source `db_env`, target `db_env`, `app+type` identifying a single site record
- **Source assumptions**: Legacy database — single `data_items` table (no split tables, no per-app schemas), uses old type format (no `:` in types), internal tables only (no external/DAMA sources)
- **Output**: Target database gets cleanly migrated rows with new type scheme, split tables for data rows, dmsEnvironments for dataset/form sources
- **Dry run by default**, `--apply` flag to execute
- **Pattern ignore list**: `--ignore pattern1,pattern2` to skip specific patterns by name/doc_type

Created files:                                                                                                                                                                        
  - src/scripts/migrate-site.js — The migration script
  - tests/test-migrate-site.js — 114 tests, all passing                                                                                                                                 
  - src/db/configs/migrate-test-src.config.json — Source test DB config (legacy SQLite)                                                                                               
  - src/db/configs/migrate-test-tgt.config.json — Target test DB config (per-app SQLite)                                                                                                
                                                                                                                                                                                        
  What the script does:                                                                                                                                                                 
  1. Takes --source, --target, --app, --type arguments to identify a single site in a legacy database                                                                                   
  2. Walks the content tree top-down from site → patterns → children                                                                                                                    
  3. Converts all types to the new {parent}:{instance}|{rowKind} scheme                                                                                                               
  4. For page patterns: copies pages, only referenced sections (orphans skipped), consolidates multi-ref history into single ref                                                        
  5. For dataset/form patterns: creates dmsEnvironments if needed, moves sources under them, migrates views, writes data rows into split tables                                         
  6. Converts -invalid-entry type suffix to data.isValid = false                                                                                                                        
  7. Updates all ref fields to new format                                                                                                                                               
  8. Dry run by default, --apply to execute, --ignore to skip patterns                                                                                                                  
                                                                                                                                                                                        
  Key bugs fixed during implementation:                                                                                                                                                 
  - Data rows use source's doc_type (not pattern's) as type prefix                                                                                                                      
  - SQLite LIKE _ wildcard issue — switched to JS prefix matching                                                                                                                       
  - Schema must be initialized before ID conflict checking                                                                                                                            
  - Sequence must be set past max existing ID before allocating new IDs

#### Production migration fixes (2026-03-20)

After running the migration against real data (`asm+nhomb` from `dms-mercury` → `dms-mercury-3`), these issues were discovered and fixed:

**Duplicate doc_type dedup**: Two patterns can share the same `doc_type` (e.g., both map to `b3`). Added `migratedIds` Set tracking across patterns with `+id` numeric coercion to skip already-written pages/sections/history.

**pattern_type array normalization**: Legacy patterns store `pattern_type` as `["page"]` array instead of `"page"` string. Added `Array.isArray(rawPType) ? rawPType[0] : rawPType` unwrapping.

**Section ID string/number mismatch**: `extractRefIds` returns numbers but PG row IDs are strings. Fixed with `const sid = +s.id` before Set lookups.

**Name backfill**: Legacy patterns had no `name` field (used `doc_type` as display name). Added backfill from `doc_type` or pattern slug to preserve readable names.

**History consolidation bugs**: Two issues — `pageEditMap` used string keys but lookups used numeric keys; legacy page-edit rows have `{time, type, user}` per-row instead of `{entries: [...]}`. Fixed both: `+pe.id` for Map keys, and `else if (peRow._data?.time)` branch to handle per-row legacy format.

**Source doc_type pre-scan (Step 3b)**: Added pre-scan of all dataset/forms pattern sources before the pattern loop to build `sourceDocTypeMap` (old UUID → new slug). This enables section data fixup in page patterns that reference datasets from other patterns.

**Section data fixup**: When building section rows, parses `element-data` JSON and updates `sourceInfo.env`, `sourceInfo.type`, `sourceInfo.srcEnv` — replacing old doc_type UUIDs with new source slugs. Applies to all data-driven components (Spreadsheet, Card, Graph) since they share the same `sourceInfo` structure.

**Split table naming**: Changed data row type from `{sourceSlug}|{viewNameSlug}:data` to `{sourceSlug}|{viewRowId}:data` to match how UDA resolves tables at runtime. Also passes `srcInfo.rowId` to `resolveTable()` for preferred `data_items__s{sourceId}_v{viewId}_{sourceName}` naming.

**View type interpolation**: After changing `sourceMap` to store `{slug, rowId}` objects instead of plain strings, view type was interpolating `[object Object]`. Fixed to use `srcInfo.slug`.

#### Related fixes outside migrate-site.js

**Sync bootstrap sibling types** (`routes/sync/sync.js`): Bootstrap query `type LIKE pattern || '|%'` for `songs_2|page` didn't match sibling types like `songs_2|component`. Added instance prefix extraction and expanded LIKE query to match all types under the same instance prefix. Applied to both bootstrap and delta endpoints.

**Input disabled prop** (`ui/components/Input.jsx`): The `disabled` prop was destructured but not forwarded to `Headless.Input`. Fixed by explicitly passing `disabled={disabled}`.

**Pattern editor settings** (`patterns/admin/pages/patternEditor/default/settings.jsx`): Added read-only display of `type` and `pattern_type` columns as disabled FieldSet inputs at the top of the Pattern Settings form.

#### CLI

```bash
node migrate-site.js \
  --source legacy-db \
  --target modern-db \
  --app myapp \
  --type prod \
  [--apply] \
  [--ignore pattern1,pattern2]
```

#### Algorithm

The script walks the content tree top-down, only copying rows that are referenced by their parents. This ensures orphaned content (unreferenced sections, abandoned pages) is not transferred.

**Step 1: Load and validate site record**
- Query source DB: `SELECT * FROM data_items WHERE app = $1 AND type = $2` (the `--type` argument is the old site type, e.g., `prod` or `pattern-admin`)
- Validate: must have `data.patterns` array
- Compute `siteInstance = nameToSlug(type)` (or use type directly if already a valid slug)
- New site type: `{siteInstance}:site`
- Copy site row to target with new type
- Extract `patterns` refs (array of `{ref, id}`) and `dms_envs` refs
- Extract `theme_refs` refs

**Step 2: Copy themes**
- For each theme ref in site's `theme_refs`:
  - Load theme row by ID from source
  - New type: `{nameToSlug(theme.name)}:theme`
  - Copy to target with new type

**Step 3: Copy dmsEnvs (if any exist)**
- For each dmsEnv ref in site's `dms_envs`:
  - Load dmsEnv row by ID from source
  - New type: `{siteInstance}|{nameToSlug(env.name)}:dmsenv`
  - Copy to target with new type
  - Track: `dmsEnvMap[oldId] → newSlug`

**Step 4: Copy patterns**
- For each pattern ref in site's `patterns` (skip if in `--ignore` list):
  - Load pattern row by ID from source
  - Extract `doc_type` from pattern data
  - Compute `patternSlug = nameToSlug(pattern.name)` (collision check against existing slugs)
  - New type: `{siteInstance}|{patternSlug}:pattern`
  - Remove `doc_type` from data before writing
  - Copy to target with new type
  - Track: `patternMap[oldDocType] → patternSlug`
  - Branch based on `pattern_type`:
    - `page` → Step 5 (pages + sections + history)
    - `datasets` or `forms` → Step 6 (sources + views + data)
    - `auth`, `mapeditor` → no children to migrate

**Step 5: Migrate page pattern children**

For each page pattern:

**5a: Find all pages**
- Query: `SELECT * FROM data_items WHERE app = $1 AND type = $2` (type = old doc_type)
- New type: `{patternSlug}|page`
- Copy each page to target

**5b: Find all sections/components referenced by pages**
- For each copied page, extract section IDs from `data.sections` (array of `{ref, id}`) and `data.draft_sections` (array of `{ref, id}`)
- Collect the union of all referenced section IDs
- Query: `SELECT * FROM data_items WHERE id IN (...)` (only referenced IDs)
- New type: `{patternSlug}|component`
- Copy each referenced section to target

**5c: Migrate history (page-edit rows)**
- For each copied page, check `data.history`:
  - If `data.history` is a `{ref, id}` object → single ref format (modern) — load the page-edit row by ID
  - If `data.history` is an array of `{ref, id}` objects → legacy multi-ref format — load all page-edit rows by ID and **consolidate into a single page-edit row** with merged entries
  - If `data.history` has inline `entries` array → already inline, no separate row needed
- Old page-edit type: `{oldDocType}|page-edit`
- New type: `{patternSlug}|page-edit`
- Copy/create the consolidated page-edit row to target
- Update the page's `data.history` to point to the new single ref: `{ref: '{app}+{patternSlug}|page-edit', id: newPageEditId}`

**5d: Update page section refs in data**
- In each copied page's `data.sections` and `data.draft_sections`, update the `ref` field:
  - Old: `{app}+{oldDocType}|cms-section` → New: `{app}+{patternSlug}|component`
  - IDs stay the same (they reference the same row, which was already copied)
- In `data.section_groups` and `data.draft_section_groups`, section IDs are tracking UUIDs (not row IDs) — no changes needed
- Update `data.history` ref format as described in 5c

**Step 6: Migrate dataset/form pattern children**

For each datasets/forms pattern:

**6a: Create or reuse dmsEnvironment**
- If pattern has `dmsEnvId` in data → use existing dmsEnv (already copied in Step 3)
- If no dmsEnvId → create a new dmsEnv for this pattern:
  - Name: `{patternSlug}_env`
  - New type: `{siteInstance}|{patternSlug}_env:dmsenv`
  - Copy to target, add to site's `dms_envs` refs
  - Track in `dmsEnvMap`
- The dmsEnvSlug is the instance name used as parent for sources

**6b: Find all sources**
- Query: `SELECT * FROM data_items WHERE app = $1 AND type = '{oldDocType}|source'`
- For each source:
  - `sourceSlug = nameToSlug(source.name)`
  - New type: `{dmsEnvSlug}|{sourceSlug}:source`
  - Remove `doc_type` from source data
  - Copy to target with new type
  - Add source ref to dmsEnv's `data.sources` array
  - Track: `sourceMap[oldDocType] → { sourceSlug, dmsEnvSlug }`

**6c: Find all views**
- Query: `SELECT * FROM data_items WHERE app = $1 AND type = '{oldDocType}|source|view'`
- For each view:
  - `viewSlug = nameToSlug(view.name || 'v' + viewId)`
  - New type: `{sourceSlug}|{viewSlug}:view`
  - Copy to target with new type
  - Track: `viewMap[oldViewId] → { viewSlug, sourceSlug }`

**6d: Migrate data rows into split tables**
- For each source, find data rows: `SELECT * FROM data_items WHERE app = $1 AND type LIKE '{oldSourceDocType}-{viewId}%'`
  - Match pattern: `{docType}-{viewId}` and `{docType}-{viewId}-invalid-entry`
- New type: `{sourceSlug}|{viewSlug}:data` (same type for valid and invalid — `data.isValid` flag distinguishes)
- For invalid entry rows: if `data.isValid` is not set, set `data.isValid = false`
- **Write to split table** in target: use `resolveTable()` to determine the correct split table name (e.g., `data_items__{sourceSlug}_{viewSlug}_data`)
- Auto-create split table in target if it doesn't exist
- Bulk insert for performance (batch by 500-1000 rows)

#### Data integrity rules

1. **Only copy referenced rows**: Sections are only copied if their ID appears in some page's `sections` or `draft_sections`. Pages are only copied if they have the pattern's doc_type as their type. Sources are only copied if they match the pattern's doc_type prefix.

2. **ID preservation**: Row IDs are preserved from source to target. This means the target DB must be empty or have non-conflicting IDs. If ID conflicts occur, abort with an error.

3. **Ref format updates**: All `{ref, id}` objects in data must have their `ref` field updated to use the new type format:
   - Pattern refs: `{app}+{siteInstance}|pattern`
   - Section refs: `{app}+{patternSlug}|component`
   - Page-edit refs: `{app}+{patternSlug}|page-edit`
   - Theme refs: `{app}+{themeSlug}|theme` (or keep as-is if theme format unchanged)
   - dmsEnv refs: `{app}+{siteInstance}|dmsenv`
   - Source refs: `{app}+{dmsEnvSlug}|source`
   - View refs: `{app}+{sourceSlug}|view`

4. **History consolidation**: Legacy pages may have `data.history` as an array of refs to multiple page-edit rows (one per action). Modern format uses a single page-edit row with an `entries` array. The migration must merge all legacy page-edit entries into one row.

5. **Invalid entries**: Legacy uses separate types (`{docType}-{viewId}-invalid-entry`). Modern uses same type with `data.isValid = false`. Migration must detect `-invalid-entry` suffix and set the flag.

#### Output report

The script should print a summary:
```
=== Migration Report ===
Site: prod → prod:site
Patterns: 5 copied, 2 ignored
  - docs (page): 42 pages, 186 components, 42 history rows
  - my_datasets (datasets): 3 sources, 5 views, 12,400 data rows (3 split tables created)
  ...
Themes: 2 copied
DmsEnvs: 1 existing + 2 created
Total rows: 12,678 copied to target
Orphaned sections skipped: 23
```

#### File

`dms-server/src/scripts/migrate-site.js`

#### Dependencies

- `db/config.js` — load source and target database configs
- `db/adapters/postgres.js`, `db/adapters/sqlite.js` — database adapters
- `db/type-utils.js` — `nameToSlug`, `buildType`, `parseRowType`
- `db/table-resolver.js` — `resolveTable`, `buildCreateTableSQL` for split table creation
- `scripts/copy-db.js` — may reuse `ensureDmsSchema()` for target DB initialization

#### Testing — 114 tests, all passing

**File**: `tests/test-migrate-site.js`
**Config files**: `migrate-test-src.config.json`, `migrate-test-tgt.config.json`

- [x] Unit tests: helper functions (extractRefIds, updateRefs, consolidateHistory, deduplicateById, uniqueSlug, parseOldSplitType, isOldSplitType, buildRow) — 30 tests
- [x] Type conversion for each row kind (site, pattern, page, component, source, view, data, theme, dmsEnv, page-edit, auth pattern)
- [x] Ref format update correctness (sections, draft_sections, history, patterns, dms_envs, theme_refs, sources)
- [x] History consolidation: single ref preserved, multi-ref array → single ref with merged entries
- [x] Invalid entry handling: `-invalid-entry` suffix → same `:data` type with `data.isValid = false`
- [x] Split table creation and data insertion in target (data rows NOT in main table)
- [x] Pattern ignore list works correctly (--ignore flag)
- [x] Dry run produces report without writing to target
- [x] ID conflict detection (ensureDmsSchema before conflict check)
- [x] Orphaned section detection and skip (sections not referenced by any page)
- [x] Auto-created dmsEnv for dataset patterns without dmsEnvId
- [x] Negative ID allocation and ref resolution for synthetic rows
- [x] Row count verification (16 rows in main table)
- [x] doc_type removal from pattern and source data
- [x] Round-trip: legacy site → migrate → client loads and renders correctly (tested with asm+nhomb: 108 rows, 6 patterns, pages/sections/history/datasets all render, new spreadsheets confirmed working with UDA)

**Bugs fixed during implementation**:
- Data row type lookup: `findDataRowTypes` must search by source's doc_type, not pattern's doc_type (data rows are `{sourceDocType}-{viewId}`)
- LIKE underscore escaping: SQLite treats `_` as wildcard in LIKE; switched to JS `startsWith` filter
- ID conflict check order: must run `ensureDmsSchema` before checking for conflicts
- Sequence allocation: must set sequence past max existing ID before allocating new IDs to avoid collisions

**Bugs fixed during production migration (asm+nhomb)**:
- Duplicate doc_type across patterns: `migratedIds` Set with numeric coercion prevents double-writing shared pages/sections
- `pattern_type` as array `["page"]`: unwrap before branching on pattern type
- Section ID string/number mismatch: PG returns bigint as string, `+s.id` coercion before Set lookups
- Blank pattern names: backfill from `doc_type` or pattern slug
- History Map key mismatch: `+pe.id` for numeric Map keys
- Legacy per-row page-edit format: detect `{time,type,user}` rows and consolidate into single `{entries:[...]}` row
- View type `[object Object]`: sourceMap changed to objects but interpolation not updated
- Split table naming: use view row ID (not name slug) in data type to match UDA resolution
- Section data old UUID env: pre-scan sources to build UUID→slug map, update `sourceInfo.env/type/srcEnv` in all data-driven components (Spreadsheet, Card, Graph)
- Sync bootstrap missing siblings: expanded LIKE query to match all types under same instance prefix

## Design Notes

### Source ownership moves to dmsEnv

Sources use `{dmsenv_instance}|{name}:source` — the parent is the dmsEnv, not the pattern. This completes the decoupling started in the internal-pgenv task. Patterns reference sources through their dmsEnv, not by sharing a doc_type namespace.

### Invalid entries

With the new scheme, invalid data rows share the same type and table as valid rows (`{source}|{view}:data`). The `data.isValid` flag distinguishes them. This was already implemented in the invalid-entry table consolidation. The `-invalid-entry` type suffix is removed entirely.

### `cms-section` → `component`

The `cms-section` name was a historical artifact. Rename to `component` which better describes what these rows actually are — they are the building blocks placed on pages.

### View naming

Views currently have no user-visible name — they're just numeric IDs. In the new scheme, views need instance names for the type string. Use `v{n}` (e.g., `v1`, `v2`) derived from their creation order, or the `data.name` field if it exists (e.g., `version_1`).

### Backward compatibility

This is a breaking change. The migration script must handle all existing data. During a transition period, the server could support both old and new formats (detect by presence of `:`), but the goal is a clean cutover.

## Files Changed (Summary)

### Server (dms-server/src/)
| File | Change |
|------|--------|
| `db/table-resolver.js` | New split detection (`:data`), new parseType, remove regex |
| `db/type-utils.js` | NEW — shared type parsing/construction utilities |
| `routes/dms/dms.controller.js` | Update all LIKE patterns, collision checks, sourceId lookup |
| `routes/dms/dms.route.js` | Update type extraction from composite keys |
| `routes/uda/utils.js` | Update getSitePatterns, getSiteSources, getEssentials |
| `routes/uda/uda.controller.js` | Update source type handling |
| `routes/sync/sync.js` | Update isSyncExcluded, bootstrap/delta queries |
| `upload/routes.js` | Remove invalid-entry type, simplify validation |
| `scripts/migrate-type-system.js` | NEW — migration script |
| `scripts/cleanup-db.js` | Update all type LIKE patterns |
| `scripts/copy-db.js` | Update resolveTable calls |
| `scripts/migrate-to-per-app.js` | Update type matching |
| `scripts/consolidate-page-history.js` | Update page type detection |
| `scripts/extract-images.js` | Update type patterns |

### Client (packages/dms/src/)
| File | Change |
|------|--------|
| `utils/type-utils.js` | NEW — shared type utilities |
| `dms-manager/_utils.jsx` | Update initializePatternFormat, updateRegisteredFormats, updateAttributes |
| `render/spa/utils/index.js` | Update pattern2routes, buildDatasources, dmsEnv loading |
| `api/index.js` | Update type construction in data operations |
| `patterns/admin/admin.format.js` | Update format type definitions |
| `patterns/admin/pages/editSite.jsx` | Replace UUIDs with slugs, new type format |
| `patterns/admin/pages/patternEditor/default/settings.jsx` | Replace UUIDs, update dmsEnv creation |
| `patterns/admin/components/patternList.jsx` | Replace UUIDs with slugs |
| `patterns/page/page.format.js` | Update component type `cms-section` → `component` |
| `patterns/page/pages/edit/editFunctions.jsx` | Update page/section creation types |
| `patterns/page/components/sections/sectionArray.jsx` | Update component type/ref construction |
| `patterns/page/siteConfig.jsx` | Update route type references |
| `patterns/datasets/datasets.format.js` | Update source/view format types |
| `patterns/datasets/pages/CreatePage.jsx` | Source type uses dmsEnv parent |
| `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` | New source/view/data type format |
| `patterns/datasets/pages/dataTypes/internal/pages/create.jsx` | Replace UUID with slug |
| `patterns/datasets/pages/createDataset.jsx` | Replace UUID with slug |
| `patterns/datasets/utils/datasources.js` | Update env format |
| `patterns/datasets/siteConfig.jsx` | Update route type references |
| `patterns/forms/forms.format.js` | Update format types |
| `patterns/forms/components/patternListComponent/index.jsx` | Replace UUID with slug |
| `patterns/mapeditor/mapeditor.format.js` | Update format types |
| `patterns/auth/siteConfig.jsx` | Review and update type references |
| `sync/worker.js` | Update type handling in local sync |

## Testing Checklist

- [ ] Type parsing utilities handle all formats correctly
- [ ] Split table detection works with `:data` suffix
- [ ] Table names generated correctly from new type format
- [ ] Pattern creation uses human-readable slugs (no UUIDs)
- [ ] Source creation uses dmsEnv as parent, human-readable slug as instance
- [ ] Name collision detection prevents duplicate slugs
- [ ] Pages and components use pattern instance as parent in type
- [ ] dmsEnvs are site-scoped in type column
- [ ] Data rows use `{source}|{view}:data` format
- [ ] Validation works without type changes (uses data.isValid only)
- [ ] Sync correctly detects and excludes `:data` types
- [ ] UDA resolves sources through new type format
- [ ] Migration script correctly transforms all row types in dms-mercury-2
- [ ] Migration script handles UUID doc_types by deriving slugs from names
- [ ] Migration script renames split tables to match new types
- [ ] All 137+ table splitting tests pass
- [ ] Full test suite passes on SQLite and PostgreSQL
- [ ] Admin UI creates patterns/sources/dmsEnvs with correct types
- [ ] Existing sites load correctly after migration
