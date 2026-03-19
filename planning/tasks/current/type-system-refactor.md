# Type System Refactor

## Status: NOT STARTED

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

### Phase 0: Shared utilities — NOT STARTED

Create shared parsing/construction utilities used by all subsequent phases.

**File**: new `packages/dms/src/utils/type-utils.js` (shared client) and `packages/dms-server/src/db/type-utils.js` (server)

- [ ] `parseRowType(type)` → `{ parent, instance, kind, raw }` — parse any type string
- [ ] `buildType({ parent, instance, kind })` → type string
- [ ] `getKind(type)` → row kind string (last segment after final `|`, after `:`)
- [ ] `getParent(type)` → parent prefix (everything before first `:` or the full prefix before last `|`)
- [ ] `getInstance(type)` → instance name (between `:` and `|` in the segment that has `:`)
- [ ] `isSplitType(type)` → `type.endsWith(':data')`
- [ ] `nameToSlug(name)` → sanitized slug from human-readable name (extracted from `nameToDocType.js`)
- [ ] `parseSplitDataType(type)` → `{ source, view }` — parse data row type for table routing
- [ ] Write unit tests for all utilities

### Phase 1: Server — table-resolver — NOT STARTED

Update split table detection and routing to use new type format.

**File**: `dms-server/src/db/table-resolver.js`

- [ ] Replace `isSplitType()` — `return type.endsWith(':data')`
- [ ] Replace `parseType()` — split on `|` and `:` instead of regex. Extract source instance and view instance from `{source}|{view}:data`
- [ ] Remove `UUID_SPLIT_REGEX`, `NAME_SPLIT_REGEX`
- [ ] Update `resolveTable()` — derive table name from parsed source+view instead of docType+viewId
- [ ] Update `sanitize()` if needed for new name patterns
- [ ] Update all tests in `test-table-splitting.js`

### Phase 2: Server — controller — NOT STARTED

Update controller type handling.

**File**: `dms-server/src/routes/dms/dms.controller.js`

- [ ] Update `lookupSourceId()` — query pattern changes from `type LIKE '%|source'` to `type LIKE '%:source'`
- [ ] Update `_sourceIdCache` key format
- [ ] Update `ensureForWrite()` / `ensureForRead()` type resolution
- [ ] Update all SQL queries with `type LIKE` patterns:
  - `%|pattern` → `%:pattern`
  - `%|source` → `%:source`
  - `%|source|view` → `%:view`
  - `%|cms-section` → `%:component` (rename from cms-section to component)
  - `%|template` → `%:template` (if still used)
  - `%|page-edit` → `%:page-edit`
- [ ] Update `type = $2 || '|cms-section'` concatenation (line 537) to new format
- [ ] Update `type NOT LIKE '%|%'` queries — this pattern was used to find pages/sites (no pipe = top-level). New equivalent: `type LIKE '%:page'` or `type LIKE '%:site'`
- [ ] Add name collision check helper used by create flow
- [ ] Update tests in `test-controller.js`, `test-graph.js`, `test-workflow.js`

### Phase 3: Server — UDA routes — NOT STARTED

Update UDA source resolution and query routing.

**File**: `dms-server/src/routes/uda/utils.js`

- [ ] Update `getSitePatterns()` — `type LIKE '%:pattern'` instead of `'%|pattern'`
- [ ] Update `getSiteSources()` — source type matching, dmsEnv resolution
- [ ] Update `getEssentials()` — type parsing for split detection. The `env` format changes from `app+{doc_type}` to use the new source instance name
- [ ] Remove lowercase normalization hack (`type = type.toLowerCase()`) — no longer needed with consistent naming
- [ ] Remove case-insensitive source lookup (`lower()` calls) — slugs are always lowercase
- [ ] Update `dmsMainTable()` helper

**File**: `dms-server/src/routes/uda/uda.controller.js`

- [ ] Update `getSourceById()` type field handling
- [ ] Update any source type pattern matching

### Phase 4: Server — sync module — NOT STARTED

**File**: `dms-server/src/routes/sync/sync.js`

- [ ] Update `isSyncExcluded()` — use new `isSplitType()` (`:data` check)
- [ ] Update pattern-scoped bootstrap query — `type = $2 OR type LIKE $2 || '|%'` needs updating for new hierarchy
- [ ] Update delta endpoint queries
- [ ] Update type filters

### Phase 5: Server — upload/publish routes — NOT STARTED

**File**: `dms-server/src/upload/routes.js`

- [ ] Update valid/invalid type construction. Current: `{doctype}-{viewId}` / `{doctype}-{viewId}-invalid-entry`. New: `{source}|{view}:data` — invalid entries share the same type/table (already consolidated), so the `isValid` flag in `data` is sufficient. Remove `-invalid-entry` type entirely.
- [ ] Update `buildRowData()` — remove `isValid` flag from type selection (all rows get same `:data` type)
- [ ] Update `createValidateHandler()` — validation no longer changes the `type` column, only updates `data.isValid`
- [ ] Remove `batchUpdateType()` usage — rows stay in same table with same type
- [ ] Update source config lookup to use new type format

### Phase 6: Server — scripts — NOT STARTED

Update all database scripts to use new type patterns.

- [ ] `scripts/cleanup-db.js` — update all `LIKE '%|pattern'`, `'%|source'`, `'%|source|view'`, `'%|cms-section'` (→ `'%:component'`), `'%|page-edit'`, `NOT LIKE '%|%'` patterns
- [ ] `scripts/copy-db.js` — update `resolveTable()` calls, split table detection
- [ ] `scripts/migrate-to-per-app.js` — update type matching and `isSplitType` usage
- [ ] `scripts/migrate-split-tables.js` — update type parsing
- [ ] `scripts/migrate-to-dmsenv.js` — update pattern/site type queries
- [ ] `scripts/deprecate-internal-dataset.js` — update type matching (may become obsolete)
- [ ] `scripts/rename-split-tables.js` — update type parsing (may become obsolete)
- [ ] `scripts/consolidate-page-history.js` — update `NOT LIKE '%|%'` query
- [ ] `scripts/extract-images.js` — update type LIKE patterns

### Phase 7: Client — format system — NOT STARTED

Update how formats build type strings.

**File**: `dms-manager/_utils.jsx`

- [ ] Update `initializePatternFormat()` — the `type` parameter becomes the pattern's instance name. Format type construction changes from `${type}|${rFormat.type}` to use `:` and `|` per the new scheme
- [ ] Update `updateRegisteredFormats()` — child format types use new separator rules:
  - Current: `${type}|${rFormat.type}` → e.g., `docs-page|cms-section`
  - New: the format type should encode the row kind correctly
- [ ] Update `updateAttributes()` — format key construction changes from `${app}+${type}|${attr.format.split("+")[1]}` to new scheme
- [ ] Ensure format `type` field matches what gets written to `data_items.type`

**File**: `render/spa/utils/index.js` — `pattern2routes()`

- [ ] Update how pattern types are read — currently reads `pattern.doc_type || pattern.base_url`
- [ ] Update `buildDatasources()` — `env` format changes from `${app}+${dsPattern.doc_type}` to use source instance names from dmsEnv
- [ ] Update dmsEnv loading — type query changes from `'dmsEnv'` to `'%:dmsenv'`
- [ ] Update AdminPattern construction

### Phase 8: Client — format definitions — NOT STARTED

Update all format files to use new row kind names.

- [ ] `patterns/admin/admin.format.js` — `patternAdminFormat`, `dmsEnvFormat`, `themeFormat`
  - Pattern type: `'pattern'` (will become `{site}|{name}:pattern` at runtime)
  - dmsEnv type: `'dmsenv'` (new, was `'dmsEnv'`)
  - Theme type: `'theme'`
  - `dms_envs` attribute format ref: update `'admin+dmsEnv'` → new format
- [ ] `patterns/page/page.format.js` — page format, cmsSection format
  - Component type: `'component'` (was `'cms-section'`)
  - Page type: `'page'` (was implicit — pages used bare doc_type as type)
- [ ] `patterns/datasets/datasets.format.js` — datasets format, source/view formats
  - Source type: `'source'`
  - View type: `'view'` (was implicitly `'source|view'` via nesting — review if nesting still works)
- [ ] `patterns/forms/forms.format.js` — same structure as datasets
- [ ] `patterns/mapeditor/mapeditor.format.js` — symbology source/view format

### Phase 9: Client — admin pattern — NOT STARTED

Update pattern creation, editing, deletion.

**File**: `patterns/admin/pages/editSite.jsx`

- [ ] Replace `crypto.randomUUID()` with `nameToSlug(patternName)` for pattern instance names
- [ ] Add collision check before creating pattern (call server or check locally)
- [ ] Update pattern creation call — type becomes `{siteInstance}|{slug}:pattern`
- [ ] Update duplicate pattern flow — generate unique slug from name

**File**: `patterns/admin/pages/patternEditor/default/settings.jsx`

- [ ] Replace `crypto.randomUUID()` with slug generation for duplicate
- [ ] Update `DmsEnvConfig` — create dmsEnv with type `{siteInstance}|{name}:dmsenv` instead of `'dmsEnv'`
- [ ] Update site ref format for `dms_envs` array

**File**: `patterns/admin/components/patternList.jsx`

- [ ] Replace `uuidv4()` with slug generation
- [ ] Update pattern creation calls

**File**: `patterns/admin/pages/editSite.jsx`

- [ ] Update site creation — type becomes `{name}:site`
- [ ] Update theme creation/refs

### Phase 10: Client — page pattern — NOT STARTED

**File**: `patterns/page/pages/edit/editFunctions.jsx`

- [ ] Update `newPage()` — page type comes from format (should be `{pattern_instance}|page`)
- [ ] Update component creation — type should be `{pattern_instance}|component`

**File**: `patterns/page/components/sections/sectionArray.jsx`

- [ ] Update component data parent ref format

**File**: `patterns/page/components/sections/sectionMenu.jsx`

- [ ] Review — UUID usage here is for tracking IDs within data, NOT for type column. Should not need changes.

**File**: `patterns/page/siteConfig.jsx`

- [ ] Update type references in route config
- [ ] Update how `datasources` / `dmsEnvs` are consumed

### Phase 11: Client — datasets pattern — NOT STARTED

**File**: `patterns/datasets/pages/CreatePage.jsx`

- [ ] Source creation type: `{dmsenv_instance}|{source_slug}:source` instead of `${type}|source`
- [ ] Source ref added to dmsEnv — update ref format
- [ ] Add collision check for source name

**File**: `patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx`

- [ ] Same changes as CreatePage — source type uses dmsEnv parent
- [ ] View creation type: `{source_instance}|v1:view` instead of `${type}|source|view`
- [ ] Data row type: `{source_instance}|v1:data` instead of `${doc_type}-${viewId}`

**File**: `patterns/datasets/pages/dataTypes/internal/pages/create.jsx`

- [ ] Replace `crypto.randomUUID()` with `nameToSlug(name)` for source doc_type

**File**: `patterns/datasets/pages/createDataset.jsx`

- [ ] Replace `crypto.randomUUID()` with slug generation

**File**: `patterns/datasets/utils/nameToDocType.js`

- [ ] Extract to shared `utils/type-utils.js` as `nameToSlug()`

**File**: `patterns/datasets/utils/datasources.js`

- [ ] Update `buildEnvsForListing()`, `getExternalEnv()` — env format changes

**File**: `patterns/datasets/siteConfig.jsx`

- [ ] Update route config type references
- [ ] Update how dmsEnv sources are passed

### Phase 12: Client — forms pattern — NOT STARTED

**File**: `patterns/forms/components/patternListComponent/index.jsx`

- [ ] Replace `uuidv4()` with slug generation for pattern doc_type

**File**: `patterns/forms/siteConfig.jsx`

- [ ] Update type references in route config

### Phase 13: Client — auth pattern — NOT STARTED

- [ ] Review `patterns/auth/siteConfig.jsx` for type references
- [ ] Update if auth pattern constructs any type strings

### Phase 14: Client — mapeditor pattern — NOT STARTED

- [ ] Review `patterns/mapeditor/` for type and source references
- [ ] Update symbology source/view type construction

### Phase 15: Client — API layer — NOT STARTED

**File**: `api/index.js`

- [ ] Update any hardcoded type construction (source creation, dmsEnv updates)
- [ ] Update `dmsDataLoader` / `dmsDataEditor` if they construct type strings

### Phase 16: Migration script — NOT STARTED

**File**: new `dms-server/src/scripts/migrate-type-system.js`

Transforms all existing data from old type format to new format. Dry-run by default, `--apply` to execute.

#### Algorithm

1. **Load all rows** grouped by app
2. **Find sites** (`type NOT LIKE '%|%'` and no `|` — heuristic, or check for known site patterns)
3. **Find patterns** (`type LIKE '%|pattern'` or `type = 'pattern'`) — extract `data.doc_type`, derive slug from `data.name || data.doc_type`
4. **Rename patterns**: `pattern` → `{site_instance}|{slug}:pattern`
5. **Rename pages**: `{old_doc_type}` → `{pattern_slug}|page`
6. **Rename components**: `{old_doc_type}|cms-section` → `{pattern_slug}|component`
7. **Find dmsEnvs** (`type = 'dmsEnv'`) — derive slug from `data.name`
8. **Rename dmsEnvs**: `dmsEnv` → `{site_instance}|{slug}:dmsenv`
9. **Find sources** (`type LIKE '%|source'`) — derive slug from `data.name` or `data.doc_type`
10. **Rename sources**: `{old_doc_type}|source` → `{dmsenv_slug}|{source_slug}:source`
11. **Rename views**: `{old_doc_type}|source|view` → `{source_slug}|{view_name}:view`
12. **Rename data rows**: `{source_doc_type}-{view_id}` → `{source_slug}|{view_slug}:data`
13. **Rename split tables** to match new data row types
14. **Update refs** in parent rows (site's pattern refs, dmsEnv's source refs, source's view refs) to use new type strings
15. **Remove `data.doc_type`** from pattern and source rows (now encoded in type)
16. **Rename themes**: `theme` → `{name}:theme`
17. **Rename sites**: `{siteType}` → `{siteType}:site`
18. **Collision detection**: if two patterns/sources would get the same slug, append `_2`, `_3`, etc.
19. **Verification pass**: for each row, confirm type matches expected format and all refs resolve

#### Edge cases

- Patterns with UUID doc_types: derive slug from `data.name` field, fall back to first 8 chars of UUID
- Sources with UUID doc_types: derive slug from `data.name` or `data.display_name`
- Old `internal_dataset` types with UUID-based data rows: already deprecated, but handle gracefully
- Patterns without a name field: use the doc_type as-is if it's already a readable slug
- Multiple sites in one app: each site's instance name comes from its current type value

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
