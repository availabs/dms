# Task: Combine pgEnv, damaBaseUrl, and datasetPatterns into datasources Array

## Objective

Combine the three separate data source configuration variables (`pgEnv`, `damaBaseUrl`, and `datasetPatterns`) into a single unified `datasources` array for use **exclusively within the page pattern**. Each object in the array will have a `type` key to differentiate between external DAMA sources and internal DMS datasets.

## Scope & Compatibility

### Page Pattern (Breaking Changes Allowed)

- **All changes within the page pattern are breaking changes** - no backwards compatibility required
- The page pattern will **only receive `datasources`** and use it exclusively
- **Never use `pgEnv`, `datasetPatterns`, or `damaBaseUrl`** anywhere in the page pattern
- All files in `src/dms/src/patterns/page/` should be refactored to use `datasources` only

### dmsSiteFactory (Maintains Backwards Compatibility)

- `dmsSiteFactory.jsx` will **create the new `datasources` array** from existing inputs (`pgEnvs`, `damaBaseUrl`, `datasetPatterns`)
- **Continue passing the old variables** (`pgEnv`, `damaBaseUrl`, `datasetPatterns`) to all patterns
- Other patterns (admin, auth, forms, datasets) may still depend on the old variables
- The page pattern config will receive `datasources` in addition to (or instead of) the old variables

## Current State

### pgEnv

**Current structure:** A simple string

```javascript
pgEnv = 'hazmit_dama'
```

**Current origin:**
- `App.jsx` passes `pgEnvs={['hazmit_dama']}` to `DmsSite`
- `dmsSiteFactory.jsx:137` extracts first element: `pgEnv: pgEnvs?.[0] || ''`
- `siteConfig.jsx:48,88` receives and passes to `CMSContext`

**Purpose:** Database environment identifier used in Falcor query paths like `["dama", pgEnv, "sources", ...]`

### damaBaseUrl

**Current structure:** A string URL path (or undefined)

```javascript
damaBaseUrl = '/datasources'  // or similar frontend route
```

**Current origin:**
- `App.jsx` can pass `damaBaseUrl` prop to `DmsSite` (optional)
- `dmsSiteFactory.jsx:60,143` receives and passes through
- `siteConfig.jsx:42,90` receives and passes to `CMSContext`

**Purpose:** Frontend URL path for linking to DAMA source detail pages.

**Current usage in `Attribution.jsx`:**
```javascript
const { damaBaseUrl } = React.useContext(CMSContext) || {}
// ...
<Link to={`${isDms ? `/forms` : damaBaseUrl}/source/${source_id}`}>
```

**Key insight:**
- External DAMA sources link to: `${damaBaseUrl}/source/${source_id}`
- Internal DMS sources link to: `/forms/source/${source_id}`

This shows that each datasource type has its own "base URL" for frontend navigation, making `damaBaseUrl` a natural fit to include in the datasources structure.

### datasetPatterns

**Current structure:** Array of pattern objects

```javascript
datasetPatterns = [
  {
    id: 123,
    pattern_type: 'datasets',  // or 'forms'
    doc_type: 'my-dataset',
    base_url: '/datasets/my-data',
    subdomain: '*',
    authPermissions: '{}',
    config: { ... },
  }
]
```

**Current origin:**
- `dmsSiteFactory.jsx:145` filters patterns: `patterns.filter(p => ['forms', 'datasets'].includes(p.pattern_type))`
- `siteConfig.jsx:46,89` receives and passes to `CMSContext`

---

## Proposed New Structure

### datasources Array

```javascript
datasources = [
  // External DAMA sources (formerly pgEnv + damaBaseUrl)
  {
    type: 'external',           // Differentiator key
    env: 'hazmit_dama',         // The pgEnv string value (for Falcor queries)
    baseUrl: '/datasources',    // The damaBaseUrl (for frontend links)
    label: 'external',          // Display label
    srcAttributes: ['name', 'metadata'],
    viewAttributes: ['version', '_modified_timestamp'],
  },

  // Internal DMS datasets (formerly datasetPatterns)
  {
    type: 'internal',           // Differentiator key
    env: 'myapp+my-dataset',    // Computed as `${app}+${pattern.doc_type}`
    baseUrl: '/forms',          // Internal sources always use /forms
    label: 'managed',           // Display label
    isDms: true,
    srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
    viewAttributes: ['name', 'updated_at'],
    // Include original pattern data for reference
    pattern: { id, pattern_type, doc_type, base_url, ... }
  },
  // ... more internal sources
]
```

### Alternative: Support Multiple External Environments

Since `pgEnvs` is already an array, we could support multiple external environments, each with its own baseUrl:

```javascript
datasources = [
  // Multiple external environments with different base URLs
  { type: 'external', env: 'hazmit_dama', baseUrl: '/dama', label: 'DAMA Production', ... },
  { type: 'external', env: 'staging_dama', baseUrl: '/dama-staging', label: 'DAMA Staging', ... },

  // Internal datasets (all share /forms baseUrl)
  { type: 'internal', env: 'myapp+dataset1', baseUrl: '/forms', label: 'Dataset 1', ... },
  { type: 'internal', env: 'myapp+dataset2', baseUrl: '/forms', label: 'Dataset 2', ... },
]
```

---

## Files Requiring Changes

### 1. App.jsx (Entry Point)

**No changes required.** The existing props (`pgEnvs`, `damaBaseUrl`) will continue to work. The conversion to `datasources` happens internally in `dmsSiteFactory.jsx`.

```javascript
// This continues to work unchanged
<DmsSite
  pgEnvs={['hazmit_dama']}
  damaBaseUrl="/datasources"
  ...
/>
```

### 2. dmsSiteFactory.jsx (Creates datasources, keeps old variables)

**Location:** `src/dms/src/render/spa/dmsSiteFactory.jsx`

**Lines to modify:** Around 126 (before the configObj creation)

**Key principle:** Create the new `datasources` array, but **continue passing old variables to all patterns** for backwards compatibility with other pattern types.

**Current (around lines 126-146):**
```javascript
const configObj = config({
    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
    type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
    siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
    baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`,
    adminPath,
    format: pattern?.config,
    pattern: pattern,
    pattern_type: pattern?.pattern_type,
    authPermissions,
    pgEnv: pgEnvs?.[0] || '',
    themes,
    useFalcor,
    API_HOST,
    DAMA_HOST,
    PROJECT_NAME,
    damaBaseUrl,
    datasets,
    datasetPatterns: patterns.filter(p => ['forms', 'datasets'].includes(p.pattern_type))
});
```

**Change to:**
```javascript
// Build unified datasources array (created once, before the reduce)
const datasetPatterns = patterns.filter(p => ['forms', 'datasets'].includes(p.pattern_type));

const datasources = [
  // External sources from pgEnvs (with damaBaseUrl)
  ...(pgEnvs || []).map(env => ({
    type: 'external',
    env,
    baseUrl: damaBaseUrl || '',
    label: 'external',
    srcAttributes: ['name', 'metadata'],
    viewAttributes: ['version', '_modified_timestamp'],
  })),

  // Internal sources from datasetPatterns
  ...datasetPatterns.map(pattern => ({
    type: 'internal',
    env: `${dmsConfigUpdated?.format?.app || dmsConfigUpdated.app}+${pattern.doc_type}`,
    baseUrl: '/forms',
    label: 'managed',
    isDms: true,
    srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
    viewAttributes: ['name', 'updated_at'],
    pattern,
  }))
];

// Then in the configObj:
const configObj = config({
    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
    type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
    siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
    baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`,
    adminPath,
    format: pattern?.config,
    pattern: pattern,
    pattern_type: pattern?.pattern_type,
    authPermissions,
    // NEW: Add datasources for page pattern
    datasources,
    // KEEP: Old variables for other patterns (admin, auth, forms, datasets)
    pgEnv: pgEnvs?.[0] || '',
    damaBaseUrl,
    datasetPatterns,
    // ... rest unchanged
    themes,
    useFalcor,
    API_HOST,
    DAMA_HOST,
    PROJECT_NAME,
    datasets,
});
```

**Note:** The `datasources` array creation should be moved outside the `.reduce()` loop so it's only computed once.

### 3. siteConfig.jsx (Page Pattern Entry - Breaking Change)

**Location:** `src/dms/src/patterns/page/siteConfig.jsx`

**Lines to modify:** 42, 46-48, 88-90

**Breaking change:** Remove all references to `pgEnv`, `damaBaseUrl`, and `datasetPatterns`. Use only `datasources`.

**Current:**
```javascript
const pagesConfig = ({
  app, type,
  siteType,
  baseUrl = "/",
  damaBaseUrl,           // REMOVE
  authPermissions,
  themes = { default: {} },
  pattern,
  datasetPatterns,       // REMOVE
  site,
  pgEnv,                 // REMOVE
  API_HOST
}) => {
  // ...
  return {
    // ...
    children: [{
      type: ({children, falcor, user, ...props}) => {
        return (
          <CMSContext.Provider value={{
            app, type,
            siteType,
            API_HOST,
            baseUrl,
            pgEnv,              // REMOVE
            datasetPatterns,    // REMOVE
            damaBaseUrl,        // REMOVE
            // ...
          }}>
```

**Change to:**
```javascript
const pagesConfig = ({
  app, type,
  siteType,
  baseUrl = "/",
  authPermissions,
  themes = { default: {} },
  pattern,
  datasources,           // NEW: Only use datasources
  site,
  API_HOST
}) => {
  // ...
  return {
    // ...
    children: [{
      type: ({children, falcor, user, ...props}) => {
        return (
          <CMSContext.Provider value={{
            app, type,
            siteType,
            API_HOST,
            baseUrl,
            datasources,        // NEW: Only datasources in context
            user,
            falcor,
            patternFilters,
            authPermissions,
            isUserAuthed: (reqPermissions, customAuthPermissions) => {
              return isUserAuthed({ user, authPermissions: customAuthPermissions || authPermissions, reqPermissions })
            }
          }}>
```

**Important:** The page pattern will **never** receive or use `pgEnv`, `damaBaseUrl`, or `datasetPatterns` - only `datasources`.

### 4. context.js

**Location:** `src/dms/src/patterns/page/context.js`

No code changes needed, but CMSContext will now contain `datasources` instead of `pgEnv` and `datasetPatterns`.

### 5. useDataSource.js (Breaking Change - Main Logic)

**Location:** `src/dms/src/patterns/page/components/sections/useDataSource.js`

**Lines to modify:** 81, 104-127, ~204 (onSourceChange handler)

**Current:**
```javascript
// Line 81
const { app, type, falcor, pgEnv, datasetPatterns } = useContext(CMSContext) || {};

// Lines 104-127
const envs = useMemo(
  () => ({
    ...(sourceTypes.includes("external") && {
      [pgEnv]: {
        label: "external",
        srcAttributes: ["name", "metadata"],
        viewAttributes: ["version", "_modified_timestamp"],
      },
    }),
    ...(sourceTypes.includes("internal") &&
      datasetPatterns?.length && {
        ...datasetPatterns.reduce((acc, pattern) => {
          acc[`${app}+${pattern.doc_type}`] = {
            label: "managed",
            isDms: true,
            srcAttributes: ["app", "name", "doc_type", "config", "default_columns"],
            viewAttributes: ["name", "updated_at"],
          };
          return acc;
        }, {}),
      }),
  }),
  [app, datasetPatterns?.length, pgEnv, sourceTypes]
);
```

**Change to:**
```javascript
// Line 81
const { app, type, falcor, datasources } = useContext(CMSContext) || {};

// Lines 104-127
const envs = useMemo(
  () => {
    if (!datasources?.length) return {};

    return datasources
      .filter(ds => sourceTypes.includes(ds.type))
      .reduce((acc, ds) => {
        acc[ds.env] = {
          label: ds.label,
          isDms: ds.isDms || false,
          baseUrl: ds.baseUrl,  // Include baseUrl for Attribution component
          srcAttributes: ds.srcAttributes,
          viewAttributes: ds.viewAttributes,
        };
        return acc;
      }, {});
  },
  [datasources, sourceTypes]
);
```

**Additional change in onSourceChange handler (~line 204):**

When setting `sourceInfo`, include `baseUrl` from the matched datasource:

```javascript
// Current: draft.sourceInfo = { ...rest, type: doc_type };
// Change to include baseUrl
const datasource = datasources.find(ds => ds.env === match?.srcEnv);
draft.sourceInfo = {
  ...rest,
  type: doc_type,
  baseUrl: datasource?.baseUrl || ''  // Add baseUrl for Attribution
};
```

This allows `Attribution.jsx` to simply read `baseUrl` from `sourceInfo` instead of looking it up.

### 6. componentsIndexTable.jsx (Breaking Change)

**Location:** `src/dms/src/patterns/page/components/sections/components/componentsIndexTable.jsx`

**Lines to modify:** 336, 352-364

**Current:**
```javascript
// Line 336
const {app, siteType, falcor, pgEnv, user} = useContext(CMSContext) || {}

// Lines 352-364
const envs = useMemo(() => ({
    [pgEnv]: {
        label: 'external',
        srcAttributes: ['name', 'metadata'],
        viewAttributes: ['version']
    },
    [`${app}+${siteType}`]: {
        label: 'managed',
        isDms: true,
        srcAttributes: ['app', 'name', 'doc_type', 'config'],
        viewAttributes: ['name']
    }
}), [pgEnv, app, siteType]);
```

**Change to:**
```javascript
// Line 336
const {app, siteType, falcor, datasources, user} = useContext(CMSContext) || {}

// Lines 352-364
const envs = useMemo(() => {
    if (!datasources?.length) return {};

    return datasources.reduce((acc, ds) => {
        acc[ds.env] = {
            label: ds.label,
            isDms: ds.isDms || false,
            srcAttributes: ds.srcAttributes,
            viewAttributes: ds.viewAttributes,
        };
        return acc;
    }, {});
}, [datasources]);
```

### 7. dataWrapper/index.jsx (Breaking Change)

**Location:** `src/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx`

**Lines to modify:** 109, 356, 515, 738

**Current pattern:**
```javascript
const {pgEnv} = useContext(cms_context || CMSContext);
// ...later used in data loading
```

**Change to (using helper):**
```javascript
import { getExternalEnv } from '../../pages/_utils/datasources';

const {datasources} = useContext(cms_context || CMSContext);
const pgEnv = getExternalEnv(datasources);
```

### 8. Template Components (Breaking Changes)

**Files:**
- `SourceSelect.jsx` (lines 8, 13, 16, 21, 27)
- `ViewsSelect.jsx` (lines 21, 25, 28, 34, 40)
- `ViewInfo.jsx` (lines 10, 30, 33, 37, 56, 67)
- `template/pages.jsx` (lines 117, 146, 153, 156, 167, 176, 182)

These use `pgEnv` for Falcor queries with the `["dama", pgEnv, ...]` path format.

**Change pattern (using helper):**
```javascript
import { getExternalEnv } from '../../../pages/_utils/datasources';

// Current
const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext)

// Change to
const { falcor, falcorCache, datasources } = React.useContext(CMSContext)
const pgEnv = getExternalEnv(datasources);
```

### 9. UploadComponent.jsx (Breaking Change)

**Location:** `src/dms/src/patterns/page/components/sections/components/ComponentRegistry/UploadComponent.jsx`

**Lines to modify:** 35, 42

**Change pattern (using helper):**
```javascript
import { getExternalEnv } from '../../../pages/_utils/datasources';

const { datasources, ...rest } = useContext(CMSContext);
const pgEnv = getExternalEnv(datasources);
```

### 10. Attribution.jsx (Breaking Change - Uses damaBaseUrl)

**Location:** `src/dms/src/patterns/page/components/sections/components/dataWrapper/components/Attribution.jsx`

**Lines to modify:** 13, 24

This is the primary consumer of `damaBaseUrl` - it creates links to source detail pages.

**Current:**
```javascript
// Line 13
const { damaBaseUrl } = React.useContext(CMSContext) || {}

// Line 24
to={`${isDms ? `/forms` : damaBaseUrl}/source/${source_id}`}
```

**Option A: Use helper function:**
```javascript
import { getBaseUrlFromIsDms } from '../../../../../pages/_utils/datasources';

const { datasources } = React.useContext(CMSContext) || {}
const {state:{sourceInfo: {isDms, source_id, name, view_name, updated_at}}} = useContext(ComponentContext);

// Line 24
to={`${getBaseUrlFromIsDms(datasources, isDms)}/source/${source_id}`}
```

**Option B (Preferred): Use baseUrl from sourceInfo:**

If `useDataSource.js` includes `baseUrl` in `sourceInfo` (see section 5), Attribution can simply use it directly:

```javascript
// No need to import datasources or helpers
const {state:{sourceInfo: {source_id, name, view_name, updated_at, baseUrl}}} = useContext(ComponentContext);

// Line 24 - Clean and simple
to={`${baseUrl}/source/${source_id}`}
```

**Recommendation:** Implement Option B by ensuring `useDataSource.js` sets `baseUrl` on `sourceInfo`. This keeps Attribution simple and decoupled from datasources structure.

---

## Migration Strategy

### Approach: Hybrid (Breaking for Page Pattern, Compatible for Others)

This refactor uses a **targeted breaking change** approach:

1. **Page pattern:** Complete breaking change - uses only `datasources`
2. **dmsSiteFactory:** Creates `datasources` but continues passing old variables
3. **Other patterns:** Unaffected - continue using `pgEnv`, `damaBaseUrl`, `datasetPatterns`
4. **App.jsx / DmsSite API:** No changes required

```
┌─────────────────────────────────────────────────────────────────┐
│  App.jsx                                                        │
│  pgEnvs={['hazmit_dama']}                                       │
│  damaBaseUrl="/datasources"                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  dmsSiteFactory.jsx                                             │
│                                                                 │
│  Creates: datasources = [...external, ...internal]              │
│                                                                 │
│  Passes to ALL patterns:                                        │
│    - datasources (NEW)                                          │
│    - pgEnv (KEEP for other patterns)                            │
│    - damaBaseUrl (KEEP for other patterns)                      │
│    - datasetPatterns (KEEP for other patterns)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Page Pattern   │  │  Admin Pattern  │  │  Other Patterns │
│                 │  │                 │  │                 │
│  ONLY uses:     │  │  Uses:          │  │  Uses:          │
│  - datasources  │  │  - pgEnv        │  │  - pgEnv        │
│                 │  │  - damaBaseUrl  │  │  - damaBaseUrl  │
│  NEVER uses:    │  │  - datasetPat.  │  │  - datasetPat.  │
│  - pgEnv        │  │  (unchanged)    │  │  (unchanged)    │
│  - damaBaseUrl  │  │                 │  │                 │
│  - datasetPat.  │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Benefits of This Approach

1. **Clean page pattern code** - No legacy variables, single source of truth
2. **No API changes** - `DmsSite` props remain the same
3. **Other patterns unaffected** - Can migrate incrementally later
4. **Easy rollback** - If issues arise, page pattern can temporarily re-add old variable support

---

## Helper Functions

Create utilities in the page pattern to work with the `datasources` structure. These should be placed in a utils file within the page pattern (e.g., `pages/_utils/datasources.js`).

```javascript
// src/dms/src/patterns/page/pages/_utils/datasources.js

/**
 * Get the first external datasource's env (for Falcor queries)
 * Replaces direct usage of pgEnv
 */
export const getExternalEnv = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.env || '';

/**
 * Get the first external datasource's baseUrl (for frontend links)
 * Replaces direct usage of damaBaseUrl
 */
export const getExternalBaseUrl = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Get baseUrl for a specific source type
 */
export const getBaseUrlByType = (datasources, type) =>
  datasources?.find(ds => ds.type === type)?.baseUrl || '';

/**
 * Get baseUrl from isDms flag (for Attribution component)
 */
export const getBaseUrlFromIsDms = (datasources, isDms) =>
  isDms
    ? datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms'
    : datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Filter to external datasources only
 */
export const getExternalDatasources = (datasources) =>
  datasources?.filter(ds => ds.type === 'external') || [];

/**
 * Filter to internal datasources only
 */
export const getInternalDatasources = (datasources) =>
  datasources?.filter(ds => ds.type === 'internal') || [];

/**
 * Find a specific datasource by its env key
 */
export const getDatasourceByEnv = (datasources, env) =>
  datasources?.find(ds => ds.env === env);
```

**Usage in components:**

```javascript
import { getExternalEnv, getBaseUrlFromIsDms } from '../../pages/_utils/datasources';

// In a component that needs pgEnv for Falcor queries
const { datasources } = useContext(CMSContext);
const pgEnv = getExternalEnv(datasources);

// In Attribution.jsx
const baseUrl = getBaseUrlFromIsDms(datasources, isDms);
```

---

## Testing Checklist

### Page Pattern (Breaking Changes)

After making changes, verify all page pattern functionality:

- [ ] External data sources load correctly in components
- [ ] Internal DMS datasets appear in source selection
- [ ] Views load for selected sources
- [ ] Data displays correctly in Spreadsheet/Graph components
- [ ] Template source selection works
- [ ] File upload functionality works
- [ ] Components index table loads data
- [ ] Multiple external environments work (if supported)
- [ ] **Attribution links work correctly** - external sources link to `${baseUrl}/source/${id}`
- [ ] **Attribution links work correctly** - internal sources link to `/forms/source/${id}`
- [ ] No references to `pgEnv`, `damaBaseUrl`, or `datasetPatterns` remain in page pattern code

### Other Patterns (Should Be Unaffected)

Verify that other patterns continue to work with the old variables:

- [ ] Admin pattern functions correctly (uses `pgEnv`, `datasetPatterns`)
- [ ] Auth pattern functions correctly
- [ ] Forms pattern functions correctly
- [ ] Datasets pattern functions correctly
- [ ] Any custom patterns that use the old variables still work

---

## Summary of Changes

### Outside Page Pattern (Backwards Compatible)

| File | Change Type | Description |
|------|-------------|-------------|
| `App.jsx` | **No change** | Continues using `pgEnvs`, `damaBaseUrl` props |
| `dmsSiteFactory.jsx` | **Additive** | Creates `datasources` array, passes it alongside old variables |

### Inside Page Pattern (Breaking Changes)

| File | Lines | Change Description |
|------|-------|-------------------|
| `siteConfig.jsx` | 42, 46-48, 88-90 | **BREAKING:** Remove pgEnv/damaBaseUrl/datasetPatterns; use only datasources |
| `useDataSource.js` | 81, 104-127 | **BREAKING:** Use datasources instead of pgEnv/datasetPatterns |
| `componentsIndexTable.jsx` | 336, 352-364 | **BREAKING:** Use datasources instead of pgEnv |
| `dataWrapper/index.jsx` | 109, 356, 515, 738 | **BREAKING:** Use helper to get env from datasources |
| `Attribution.jsx` | 13, 24 | **BREAKING:** Use datasources instead of damaBaseUrl |
| `SourceSelect.jsx` | 8, 13, 16, 21, 27 | **BREAKING:** Use helper to get env from datasources |
| `ViewsSelect.jsx` | 21, 25, 28, 34, 40 | **BREAKING:** Use helper to get env from datasources |
| `ViewInfo.jsx` | 10, 30, 33, 37, 56, 67 | **BREAKING:** Use helper to get env from datasources |
| `template/pages.jsx` | 117, 146, 153, 156, 167, 176, 182 | **BREAKING:** Use helper to get env from datasources |
| `UploadComponent.jsx` | 35, 42 | **BREAKING:** Use helper to get env from datasources |

### New Files to Create

| File | Purpose |
|------|---------|
| `pages/_utils/datasources.js` | Helper functions for working with datasources array |

### Summary

- **Files outside page pattern:** 2 (App.jsx unchanged, dmsSiteFactory additive)
- **Files inside page pattern:** 10 (all breaking changes)
- **New files:** 1 (datasources utilities)
- **Variables consolidated:** 3 (`pgEnv`, `damaBaseUrl`, `datasetPatterns`) → 1 (`datasources`)
- **Scope:** Breaking change isolated to page pattern only

---

## Appendix: Full datasources Type Definition

```typescript
interface Datasource {
  // Required fields
  type: 'external' | 'internal';  // Differentiator
  env: string;                     // Environment key for Falcor queries
  baseUrl: string;                 // Frontend URL for source detail links
  label: string;                   // Display label in UI

  // Data fetching configuration
  srcAttributes: string[];         // Attributes to fetch for sources
  viewAttributes: string[];        // Attributes to fetch for views

  // Internal-specific fields
  isDms?: boolean;                 // true for internal DMS datasets
  pattern?: object;                // Original pattern object (internal only)
}

// Example external datasource
const externalDatasource: Datasource = {
  type: 'external',
  env: 'hazmit_dama',
  baseUrl: '/datasources',
  label: 'DAMA',
  srcAttributes: ['name', 'metadata'],
  viewAttributes: ['version', '_modified_timestamp'],
};

// Example internal datasource
const internalDatasource: Datasource = {
  type: 'internal',
  env: 'myapp+my-dataset',
  baseUrl: '/forms',
  label: 'My Dataset',
  isDms: true,
  srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
  viewAttributes: ['name', 'updated_at'],
  pattern: { /* original pattern object */ },
};
```
