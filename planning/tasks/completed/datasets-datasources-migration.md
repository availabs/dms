# Task: Migrate Datasets Pattern to Use datasources Variable

## Objective

Update the datasets pattern to use the new unified `datasources` array instead of the separate `pgEnv` and `damaBaseUrl` variables. This follows the approach implemented in the page pattern (see [combine-datasources-task.md](../completed/combine-datasources-task.md)).

## Scope

### Datasets Pattern (Breaking Changes Allowed)

- All changes within the datasets pattern are breaking changes - no backwards compatibility required
- The datasets pattern will receive `datasources` from `dmsSiteFactory.jsx` and use it exclusively
- Remove all references to `pgEnv` and `damaBaseUrl` in the datasets pattern
- All files in `src/dms/src/patterns/datasets/` should be refactored to use `datasources` only

### Already Completed (in dmsSiteFactory)

- `dmsSiteFactory.jsx` already creates the `datasources` array and passes it to all patterns
- The old variables (`pgEnv`, `damaBaseUrl`) are still passed for backwards compatibility

---

## Key Differences from Page Pattern

### 1. No `datasetPatterns` prop

Unlike the page pattern which uses `datasetPatterns` to discover internal DMS datasets, the datasets pattern constructs internal source environments dynamically from the `format` prop:

```javascript
// Internal source env construction
const internalEnv = `${format.app}+${format.type}`  // or ${format.app}+${source.type}
```

This means the migration is primarily about replacing `pgEnv` (for external sources) with `datasources`, while internal source handling remains largely unchanged.

### 2. External datasources are optional (internal-only mode)

**It is valid for no external datasources to exist.** The datasets pattern must work correctly when `datasources` contains only internal entries (i.e., no `pgEnvs` were configured). In this case:

- The system should list and operate on **only internal sources**
- No external source routes or queries should be attempted
- `getExternalEnv(datasources)` will return `''` — components must guard against this
- `DatasetsListComponent` should only show internal sources when no external env is available
- The `externalSourceConfig` routes may still be registered but will have no data to show

This is important because some deployments only use internal DMS datasets without any connection to an external DAMA database.

---

## Current Architecture

### How Sources Are Differentiated

The datasets pattern uses two mechanisms:

1. **Route-level separation** via `siteConfig.jsx`:
   - `externalSourceConfig` - handles `/source/:id` routes (external DAMA sources)
   - `internalSourceConfig` - handles `/internal_source/:id` routes (internal DMS sources)

2. **`isDms` prop** passed to components:
   ```javascript
   // In internalSourceConfig (line 345):
   <SourcePageSelector {...props} isDms={true} />

   // In externalSourceConfig (line 241):
   <SourcePageSelector />  // isDms defaults to false/undefined
   ```

### How Internal Sources Work

**Internal source env is constructed from `format`, not from `datasetPatterns`:**

```javascript
// sourcePageSelector.jsx (line 28)
pgEnv: isDms ? `${format.app}+${format.type}` : pgEnv

// utils.jsx (lines 56, 60, 81, 85)
isDms ? `${format.app}+${source.type}` : pgEnv
```

**The `format` prop comes from DMS routing** and contains `app` and `type` properties that identify the current pattern.

### Current pgEnv Usage Patterns

| Context | How pgEnv is Obtained | Purpose |
|---------|----------------------|---------|
| External sources | From `DatasetsContext.pgEnv` | Falcor queries: `["dama", pgEnv, ...]` |
| Internal sources | Constructed: `${format.app}+${format.type}` | Falcor queries: `["uda", env, ...]` |
| DatasetsListComponent | **HARDCODED**: `'hazmit_dama'` (BUG!) | Should use pgEnv from context |

### Bug: Hardcoded External Env

**`DatasetsListComponent/index.jsx` (lines 174-189)** has a hardcoded external env:

```javascript
const envs = {
    ['hazmit_dama']: {  // <-- HARDCODED! Should use datasources
        label: 'external',
        srcAttributes: ['name', 'type', 'metadata', 'categories', 'description'],
        viewAttributes: ['version', '_modified_timestamp']
    },
    [`${format?.app}+${format?.type}`]: {  // Internal env - correctly constructed
        label: 'managed',
        isDms: true,
        srcAttributes: ['app', 'name', 'type', 'doc_type', 'config', 'default_columns', 'categories', 'description'],
        viewAttributes: ['name', 'updated_at']
    }
};
```

This should be fixed to use `datasources` to build the envs dynamically. When no external datasources exist, the envs object should only contain the internal entry, and the listing should work with internal sources alone.

---

## Proposed Changes

### Helper Functions

Create a utilities file. All helpers must gracefully handle the case where no external datasources exist (returns `''` or empty results):

```javascript
// src/dms/src/patterns/datasets/utils/datasources.js

/**
 * Get the first external datasource's env (for Falcor queries)
 * Returns '' if no external datasources configured - callers must guard against this
 */
export const getExternalEnv = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.env || '';

/**
 * Get the first external datasource's baseUrl (for frontend links)
 * Returns '' if no external datasources configured
 */
export const getExternalBaseUrl = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Check if any external datasources are configured
 */
export const hasExternalDatasources = (datasources) =>
  datasources?.some(ds => ds.type === 'external') || false;

/**
 * Build envs object for source listing (used by DatasetsListComponent)
 * Combines external datasources with internal format-based env.
 * When no external datasources exist, only internal sources are listed.
 */
export const buildEnvsForListing = (datasources, format) => {
  const envs = {};

  // Add external datasources (if any exist)
  datasources?.filter(ds => ds.type === 'external').forEach(ds => {
    envs[ds.env] = {
      label: ds.label,
      srcAttributes: ['name', 'type', 'metadata', 'categories', 'description'],
      viewAttributes: ds.viewAttributes,
    };
  });

  // Always add internal env from format (current pattern's internal sources)
  if (format?.app && format?.type) {
    envs[`${format.app}+${format.type}`] = {
      label: 'managed',
      isDms: true,
      srcAttributes: ['app', 'name', 'type', 'doc_type', 'config', 'default_columns', 'categories', 'description'],
      viewAttributes: ['name', 'updated_at'],
    };
  }

  return envs;
};
```

### Context Changes

Update `DatasetsContext` to receive `datasources`:

```javascript
<DatasetsContext.Provider value={{
    UI,
    datasources,              // NEW: replaces pgEnv and damaBaseUrl
    baseUrl,
    falcor, user,
    // ... rest unchanged
}}>
```

### Component Migration Patterns

**Pattern A: External-only components**

Components that only work with external DAMA sources. These must guard against no external env being available:

```javascript
// Current
const { pgEnv, falcor } = useContext(DatasetsContext);
// ["dama", pgEnv, "sources", ...]

// Change to
import { getExternalEnv } from '../utils/datasources';
const { datasources, falcor } = useContext(DatasetsContext);
const pgEnv = getExternalEnv(datasources);

// Guard: skip Falcor queries when no external env
if (!pgEnv) return null; // or skip the query
```

**Pattern B: Components with isDms branching**

Components that handle both internal and external sources. When `isDms` is true, external env is not needed:

```javascript
// Current (sourcePageSelector.jsx, utils.jsx)
const { pgEnv, falcor } = useContext(DatasetsContext);
const env = isDms ? `${format.app}+${format.type}` : pgEnv;

// Change to
import { getExternalEnv } from '../utils/datasources';
const { datasources, falcor } = useContext(DatasetsContext);
const pgEnv = getExternalEnv(datasources);
const env = isDms ? `${format.app}+${format.type}` : pgEnv;

// Guard for external-only code paths:
if (!isDms && !pgEnv) return null; // no external env configured
```

**Pattern C: DatasetsListComponent (special case)**

Fix the hardcoded env and use datasources. When no external datasources exist, the listing shows only internal sources:

```javascript
// Current (BUGGY - hardcoded, always includes external)
const envs = {
    ['hazmit_dama']: { ... },
    [`${format?.app}+${format?.type}`]: { ... }
};

// Change to - dynamically builds envs, works with internal-only
import { buildEnvsForListing } from '../utils/datasources';
const { datasources, falcor } = useContext(DatasetsContext);
const envs = buildEnvsForListing(datasources, format);
// If no external datasources, envs will only have the internal entry
```

---

## Files Requiring Changes

### 1. New File: utils/datasources.js

Create helper functions for working with datasources array.

### 2. siteConfig.jsx (6 context providers)

**Lines:** 53, 61, 88-89, 140, 160, 168, 194, 211, 213, 263, 271, 298, 315, 317

**Changes:**
- Remove `pgEnv` and `damaBaseUrl` from function parameters
- Add `datasources` parameter
- Update all `DatasetsContext.Provider` value props

### 3. components/DatasetsListComponent/index.jsx (CRITICAL - fixes hardcoded env)

**Lines:** 162, 174-189

**Changes:**
- Get `datasources` from context
- Replace hardcoded `'hazmit_dama'` with dynamic env from datasources
- Use `buildEnvsForListing` helper

### 4. pages/sourcePageSelector.jsx

**Lines:** 18, 28, 36

**Changes:**
- Get `datasources` from context
- Use helper for external env, keep `${format.app}+${format.type}` for internal

### 5. pages/dataTypes/default/utils.jsx

**Lines:** 4, 6, 12, 31, 34-35, 48, 56, 60, 74, 81, 85

**Note:** These utility functions receive `pgEnv` as a parameter. The calling code will pass the appropriate env value. The `isDms` branching logic (`isDms ? ${format.app}+${source.type} : pgEnv`) remains unchanged.

### 6. components/upload.jsx

**Lines:** 143-145, 175, 226, 250

**Changes:**
- Get `datasources` from context
- Use helper to derive `pgEnv` for Falcor paths and server URLs

### 7. components/ExternalVersionControls.jsx

**Lines:** 181, 255, 265-267, 300, 356, 376, 618, 625-628, 665, 671

**Changes:**
- Get `datasources` from context
- Use helper to derive `pgEnv`

### 8. pages/dataTypes/default/*.jsx

**Files and lines:**
- `admin.jsx` (122, 163, 184, 194, 213, 234, 244)
- `overview.jsx` (63, 99, 131, 150)
- `version.jsx` (128, 160)

**Changes:**
- Get `datasources` from context
- Use helper to derive `pgEnv`

### 9. pages/dataTypes/default/Tasks/*.jsx

**Files:**
- `TaskList.jsx` (91, 137-138, 154, 163, 173-174, 188)
- `TaskPage.jsx` (70, 77, 98, 112)
- `components/TasksBreadcrumb.jsx` (22, 30, 42, 54, 71)

**Changes:**
- Get `datasources` from context
- Use helper to derive `pgEnv`

### 10. pages/dataTypes/gis_dataset/pages/*.jsx

**Files:**
- `Create/index.jsx` (27, 42, 89, 97, 102, 120)
- `Map/Map.jsx` (32, 106, 293, 322, 326)
- `Map/Layer2.jsx` (33, 43, 51, 56, 59, 211, 283, 286)
- `Uploads/index.jsx` (11, 26, 35, 51, 56)
- `Uploads/view.jsx` (6, 10, 13, 18)
- `metadata.jsx` (17, 30)
- `table.jsx` (20, 61-62)

**Changes:**
- Get `datasources` from context
- Use helper to derive `pgEnv`

### 11. pages/dataTypes/internal/pages/*.jsx

**Files:**
- `upload.jsx` (17)
- `validate.jsx` (14)

**Note:** These internal-only pages destructure `pgEnv` from context but may not actually use it for queries (internal sources use the format-constructed env). Verify whether these can simply stop destructuring `pgEnv` or if they need `datasources` at all. These pages must work in internal-only mode without any external datasources.

### 12. pages/metadata.jsx

**Lines:** 22-23, 30, 32, 42-43, 57

**Special case:** This file gets `pgEnv` from URL params. Review whether this is still needed or can be derived.

---

## Implementation Strategy

### Phase 1: Setup

1. Create `utils/datasources.js` with helper functions
2. Update `siteConfig.jsx` to use `datasources` in context

### Phase 2: Fix Critical Bug

1. Update `DatasetsListComponent/index.jsx` to fix hardcoded `'hazmit_dama'`

### Phase 3: Update Components

Work through each directory, applying the appropriate migration pattern:
- Pattern A for external-only components
- Pattern B for isDms-branching components
- Pattern C for DatasetsListComponent

### Phase 4: Handle Special Cases

1. `pages/metadata.jsx` - Review URL-based pgEnv handling
2. Internal-only pages - Confirm they don't need external pgEnv
3. Guard all external Falcor queries - ensure no queries with empty env string
4. Verify internal-only mode works end-to-end (no external datasources configured)

---

## Internal Sources: What Stays the Same

The following aspects of internal source handling remain unchanged:

1. **Env construction**: `${format.app}+${format.type}` or `${format.app}+${source.type}`
2. **`isDms` prop**: Passed from route config, not from context
3. **Internal route**: `/internal_source/:id` handled by `internalSourceConfig`
4. **Falcor path pattern**: `["uda", env, "sources", ...]`
5. **Internal-only mode**: Works without any external datasources configured

The `datasources` array will contain internal datasources (from `datasetPatterns` in dmsSiteFactory), but the datasets pattern does not need to use them directly since it constructs the env from `format`.

### Internal-Only Deployments

When no `pgEnvs` are configured in `App.jsx`, the `datasources` array will contain only internal entries. The datasets pattern must:

- Still list and manage internal sources in `DatasetsListComponent`
- Not error on missing external env (no Falcor queries with empty env string)
- Allow navigation to `/internal_source/:id` routes
- Support all internal source operations (upload, validate, metadata, admin)

---

## Testing Checklist

### External Sources (when configured)
- [ ] Dataset list page shows external sources (fixes hardcoded env bug)
- [ ] External source pages load (Create, Map, Table, Uploads)
- [ ] Tasks list and task detail pages work
- [ ] File upload functionality works
- [ ] Version controls (download, delete) work
- [ ] Map layer symbology saves correctly

### Internal Sources
- [ ] Dataset list page shows internal sources
- [ ] Internal source pages load (upload, validate)
- [ ] Metadata editing works for internal sources
- [ ] Source admin page works for internal sources

### Internal-Only Mode (no pgEnvs configured)
- [ ] Dataset list page loads without errors (shows only internal sources)
- [ ] No Falcor queries attempted with empty/undefined env string
- [ ] Internal source CRUD operations work normally
- [ ] No console errors from missing external datasources
- [ ] Navigation to `/internal_source/:id` works
- [ ] External source routes don't crash (graceful empty state)

### Mixed Mode (both external and internal)
- [ ] Both source types appear in the listing
- [ ] Switching between external and internal sources works
- [ ] Correct env is used for each source type

### Data Loading
- [ ] Falcor queries return correct data for external sources
- [ ] Falcor queries return correct data for internal sources
- [ ] ETL context events load
- [ ] No queries fired with empty env string

### Error Handling
- [ ] Error pages still render correctly
- [ ] No console errors related to undefined datasources
- [ ] Graceful handling when `getExternalEnv()` returns `''`

---

## Summary

| Category | Count |
|----------|-------|
| New files to create | 1 |
| Files to modify | ~15 |
| Context providers to update | 6 (in siteConfig.jsx) |
| Components using pgEnv from context | ~20 |
| Variables consolidated | 2 (`pgEnv`, `damaBaseUrl`) → 1 (`datasources`) |
| Critical bugs fixed | 1 (hardcoded 'hazmit_dama') |

### Key Differences from Page Pattern Migration

| Aspect | Page Pattern | Datasets Pattern |
|--------|--------------|------------------|
| Uses `datasetPatterns` | Yes | No |
| Internal env source | `datasetPatterns` array | `format` prop |
| `isDms` determination | From datasource config | From route config (prop) |
| Route structure | Single config | Separate external/internal configs |
| External env required | Yes (always used) | No (internal-only mode valid) |

---

## Related Tasks

- [combine-datasources-task.md](../completed/combine-datasources-task.md) - Page pattern migration (completed)
- Future: Forms pattern migration
- Future: Admin pattern migration
