# DataWrapper API-Layer Loading

## Objective

Move dataWrapper data fetching into the DMS API layer so that section data is loaded at navigation time (React Router 7 loader) instead of after page render. This eliminates the current waterfall: page loads → sections render → each dataWrapper mounts → each fires its own `getData()`.

Secondary: identify and apply obvious optimizations to dataWrapper during the analysis.

## Background

- **Research**: `planning/research/datawrapper-overview.md`, `planning/research/uda-config-overview.md`
- **Key files**: `patterns/page/components/sections/components/dataWrapper/index.jsx`, `dataWrapper/utils/utils.jsx`
- **Current flow**: Page navigates → loader fetches page + sections → components render → dataWrapper mounts → `useEffect` builds `dataRequest` from columns → `getData()` calls `apiLoad` with UDA action → data arrives → re-render
- **Desired flow**: Page navigates → loader fetches page + sections → loader detects dataWrapper sections → loader runs `getData()` for each → components render with data already available

## Key Concepts

### Cache Freshness System

DataWrapper already has a mechanism to avoid duplicate fetches:

```javascript
// index.jsx ~line 224 (View component)
// useGetDataOnSettingsChange effect
if (!isEqual(state.dataRequest, state.lastDataRequest)) {
    getData(state, setState, apiLoad, ...)
}
```

After `getData()` completes, it sets `state.lastDataRequest = state.dataRequest`. If the API layer pre-loads data and populates the state correctly, the component-level effect will see `dataRequest === lastDataRequest` and skip the fetch.

### URL-Mapped Filters (Page Filters)

Some dataWrapper columns have filters with `usePageFilters: true` and a `searchParamKey`. These sync with URL search params via `PageContext.pageState.filters`. For API-layer loading, these URL params must be extracted from the route match and injected into the dataRequest before calling `getData()`.

### DataWrapper State in Sections

Each dataWrapper section stores its full state as a JSON string in `element-data`. The state includes `sourceInfo`, `columns`, `dataRequest`, `display`, and cached `data`. The API layer can parse this to reconstruct the query without mounting the component.

## Phases

### Phase 0: Analysis & Quick Wins — DONE

- [x] Re-read dataWrapper `index.jsx` and `utils/utils.jsx` in detail
- [x] Re-read `convertOldState.js` to understand state migration
- [x] Identify obvious optimizations (see findings below)
- [x] Document findings and apply quick wins

#### Phase 0 Findings

**getData() is already API-ready (good news for Phase 1):**
- `getData()` in `utils/utils.jsx` is a standalone async function: `({state, apiLoad, ...}) → {length, data}`
- No React hooks, DOM APIs, or navigation dependencies
- Needs: `state.dataRequest`, `state.sourceInfo`, `state.columns`, `state.display`
- Only external dependency is `apiLoad` (Falcor wrapper from ComponentContext)
- `convertOldState()` must run first — state may be in legacy format

**readyToLoad gate (important for Phase 5 integration):**
- View only fetches when `readyToLoad === true` OR `allowEditInView === true`
- `readyToLoad` starts `undefined` (falsy), set to `true` by: Pagination component (non-paginated views), filter interactions, admin toggle, or restored from saved state
- For pre-loaded sections: set `readyToLoad = true` and `lastDataRequest = dataRequest` so the component's `isEqual` check skips re-fetch

**300ms debounce on ALL data fetches (including initial load):**
- Both Edit (line 297) and View (line 739): `setTimeout(() => load(), 300)`
- First mount pays an unnecessary 300ms penalty. Could distinguish initial vs subsequent.

**Massive Edit/View code duplication (~400 lines):**
- `getFilteredData`, page filter sync, `useSetDataRequest`, `useGetDataOnSettingsChange`, `onPageChange`, `loadOptionsData`, CRUD fns — all near-identical between Edit and View
- Not a quick fix (larger refactor), but noted for future cleanup

**View redundant dataRequest rebuild:**
- After `convertOldState` migrates column filters to `filterGroups` and clears `column.filters`, the View effect at line 674 rebuilds an identical `newDataReq` that fails the `isEqual` check and is skipped. Harmless but wasteful.

**convertOldState migration chain:**
- Oldest: `attributes` + `visibleAttributes` → columns/display/sourceInfo/dataRequest
- Middle: `column.internalFilter/externalFilter/internalExclude` → `column.filters[]`
- Current: `column.filters[]` → `dataRequest.filterGroups` (tree structure with `isGroup`, `op`, `col`, `value`)
- After migration: `column.filters` set to `undefined`, all filter logic in `filterGroups`

**Page filter flow (for Phase 3 URL extraction):**
- URL search params → `PageContext.pageState.filters` → `useEffect` walks `filterGroups` tree → updates conditions with `usePageFilters: true` using their `searchParamKey` → `dataRequest` changes → `getData()` runs
- The filterGroups tree has conditions like: `{ op: 'filter', col: 'county', value: ['36061'], usePageFilters: true, searchParamKey: 'county' }`

**Quick wins applied:**
1. Parallelized multiselect filter resolution in `getData()` — changed sequential `for...await` loop to `Promise.all` (addresses existing TODO comment). Each iteration is independent (writes to different key in `multiselectValueSets`).
2. Removed dead `getFullColumn()` function (defined but never called).

**Components using dataWrapper (via `useDataWrapper: true`):**
Spreadsheet, Card, Graph, ValidateComponent, UploadComponent, MnyHeaderDataDriven

### Phase 1: Extract getData for Server-Side Use — DONE

- [x] Factor out the core `getData()` logic so it can run outside of a React component
  - **Finding**: `getData()` is ALREADY a standalone async function — `({state, apiLoad, ...}) → {length, data}`. No React hooks, DOM, or navigation dependencies. No extraction needed.
  - Created `api/preloadSectionData.js` which provides the `apiLoad` shim and orchestration
- [x] Ensure `convertOldState()` runs before the extracted function — `preloadSectionData()` calls it first
- [x] Handle the column → dataRequest → options transformation chain without React hooks — all pure functions (`applyFn`, `getColAccessor`, `attributeAccessorStr`, `splitColNameOnAS`, `isCalculatedCol`, `mapFilterGroupCols`)
- [x] Ensure `applyFn()`, `getColAccessor()`, `attributeAccessorStr()` work in the API context — confirmed: zero React dependencies in entire getData call chain including `getFilterData` (filters/utils.js) and `getLength`

**New file**: `api/preloadSectionData.js`
- `isPreloadableType(elementType)` — checks if a section type supports pre-loading (Spreadsheet, Card, Graph)
- `preloadSectionData(falcor, elementData, elementType)` — orchestrates pre-load for a single section:
  1. Parses element-data and runs `convertOldState()`
  2. Respects `readyToLoad` gate (skips sections configured for on-demand loading)
  3. Cache freshness check (skips if `lastDataRequest` matches and data exists)
  4. Creates `apiLoad` shim: `(config, path) => dmsDataLoader(falcor, config, path || '/')`
  5. Calls `getData()` with component-specific config (`fullDataLoad`, `keepOriginalValues`)
  6. Returns updated element-data JSON string with pre-loaded data + `lastDataRequest` set
  7. Returns `null` on skip or error (component falls back to its own fetch)

**Design decisions:**
- Returns JSON string (not object) — matches what the View component receives as `value`
- Sets `lastDataRequest = dataRequest` so View's `isEqual` check skips re-fetch
- Sets `readyToLoad = true` to satisfy View's gate check
- Error handling: catch + return null → graceful fallback to component-level fetch
- `apiLoad` shim omits `setBusy` (loading indicator) — not needed outside React

### Phase 2: Integrate Pre-Loading into Page Loader — DONE

**Approach**: Pre-load orchestration lives in `dmsPageFactory.jsx`'s loader (not inside `dmsDataLoader`). The page pattern knows about sections, page filter defaults, and URL params — `dmsDataLoader` stays generic.

**Page filter defaults**: Page items can set default values for page filters (via `item.filters`). These defaults are overridden by URL search params. The loader must resolve the effective filter values (defaults + URL overrides) before pre-loading, because page filters can mutate the `dataRequest` via `filterGroups` conditions with `usePageFilters: true`.

**Design: `preload` hook pattern** — instead of coupling `dmsPageFactory` to page-specific logic, the page pattern's `siteConfig.jsx` provides a `preload` function on the config object. `dmsPageFactory` calls `dmsConfig.preload(falcor, data, request)` if present. Other patterns don't pay any cost, and any pattern can opt into pre-loading by providing its own `preload` function.

- [x] In `dmsPageFactory.jsx` loader, after `dmsDataLoader` returns page data:
  - Calls `dmsConfig.preload(falcor, data, request)` if the config provides a `preload` function
  - **Design note**: Instead of finding the active page item inside the loader, the preload function (`preloadPageSections`) finds the page item with sections (`data.find(d => d.sections?.length)`). This avoids importing `filterParams` and needing the format definition in the API layer.
- [x] `preloadPageSections()` in `api/preloadSectionData.js`:
  - Finds the page item with sections
  - Resolves effective filters via `resolveFilterMap()` (page defaults → pattern overrides → URL params)
  - Iterates sections, checks `isPreloadableType(element-type)`, calls `preloadSectionData()` for each
  - Embeds pre-loaded `element-data` back into section objects
  - Returns updated data array
- [x] `preloadSectionData()` now accepts optional `pageFilterMap` parameter:
  - After `convertOldState()` parses the state, injects page filter values into `filterGroups` conditions via `injectPageFilters()` tree walker
  - Filter injection happens BEFORE readyToLoad/freshness checks so the dataRequest reflects the URL-mapped filter state
- [x] Pre-load multiple sections in parallel (`Promise.all`)
- [x] Move pre-load module to `api/preloadSectionData.js` so it's importable from any pattern's loader
- [x] Page pattern `siteConfig.jsx` provides `preload` hook wiring `preloadPageSections` with `patternFilters`

**New/modified helper functions in `api/preloadSectionData.js`**:
- `parseIfJSON(text, fallback)` — inline copy, avoids importing from page pattern
- `mergeFilters(pageFilters, patternFilters)` — inline copy, mirrors `_utils/index.js`
- `resolveFilterMap(pageFilters, patternFilters, searchParams)` — full filter resolution chain → `{searchKey: values}` map
- `injectPageFilters(node, filterMap)` — recursive tree walker for filterGroups, mirrors dataWrapper's page filter sync effect

**Files modified**:
- `api/preloadSectionData.js` — added `preloadPageSections`, `resolveFilterMap`, `injectPageFilters`, `mergeFilters`, `parseIfJSON`; added `pageFilterMap` param to `preloadSectionData`
- `patterns/page/siteConfig.jsx` — imported `preloadPageSections`, added `preload` function to config return
- `render/dmsPageFactory.jsx` — added `dmsConfig.preload` call in loader after `dmsDataLoader` returns

### Phase 3: Component Integration — DONE (no code changes needed)

**No code changes required.** The existing View component logic correctly handles pre-loaded data.

- [x] Verify freshness check skips re-fetch when data is pre-loaded
  - `convertOldState` (line 88-89) defaults `preventDuplicateFetch = true` if not explicitly set → guaranteed to be `true` or `false` (never undefined)
  - Pre-loaded state has `lastDataRequest = dataRequest` → `isEqual` check passes → `load()` returns early at line 721
  - `readyToLoad = true` (set by preload) → gate check at line 675 passes
  - DataRequest rebuild effect (line 674) produces same `newDataReq` from unchanged columns → `isEqual` match → no update
  - Page filter sync effect (line 600) finds no diff (pre-load injected same filter values) → exits early
  - Value effect (line 546) re-parses same element-data → identical state content (idempotent)
- [x] Verify subsequent user interactions still trigger fetches normally
  - Filter/sort/page changes mutate `dataRequest` → `isEqual(dataRequest, lastDataRequest)` fails → `getData()` runs ✓
  - Pagination calls `onPageChange` which directly fetches without the freshness check ✓
- [x] URL params changing client-side handled correctly
  - `searchParams` change → `updatePageStateFiltersOnSearchParamChange` → `pageState.filters` updates → page filter sync effect updates `filterGroups` → `dataRequest` changes → re-fetch triggered ✓
  - React Router 7 also re-runs loaders on search param changes → pre-load runs with new params ✓
- [x] Edge case: `preventDuplicateFetch = false` (user explicitly toggled off)
  - Freshness check doesn't skip, BUT the Falcor cache was warmed by the pre-load (same `falcor` instance in `dmsPageFactory.jsx`) → component's "re-fetch" hits cache → near-instant ✓

### Phase 4: Testing & Edge Cases — DONE

- [x] Test pages with multiple dataWrapper sections (parallel pre-loading)
  - `Promise.all` in `preloadPageSections` fires all sections concurrently ✓
  - Each `preloadSectionData` call is independent (own state copy, own apiLoad call) ✓
- [x] Test pages with mixed section types (some dataWrapper, some not)
  - `isPreloadableType` guard returns non-preloadable sections unchanged ✓
  - `hasPreloadable` early-exit avoids URL parsing when no sections qualify ✓
- [x] Test pages with page filter defaults and URL param overrides
  - `resolveFilterMap` chain: page defaults → pattern overrides → URL params ✓
  - `injectPageFilters` tree walker updates `usePageFilters: true` conditions ✓
  - URL `|||`-delimited values split correctly ✓
- [x] Test URL param changes triggering re-fetch (not using stale pre-loaded data)
  - Client-side: `searchParams` change → page filter sync effect → `dataRequest` changes → re-fetch ✓
  - Server-side: React Router 7 re-runs loaders on search param changes → pre-load runs with new params ✓
- [x] Test legacy state formats (convertOldState path)
  - Current format (filterGroups): `preventDuplicateFetch` defaulted to `true` by convertOldState ✓
  - Middle format (internalFilter/externalFilter): returns early WITHOUT defaulting `preventDuplicateFetch` — **fixed**: preload return now sets `preventDuplicateFetch ?? true` defensively
  - Oldest format (attributes → columns): full migration chain runs, produces current-format state ✓
- [x] Test DMS dataset sources vs DAMA view sources
  - Both handled by same `apiLoad → dmsDataLoader` path — source type distinction is in the UDA action config, not the loader ✓
- [x] Verify no regression in edit mode (edit mode skipped — pre-loading only runs in page view loader)
  - Edit route (`edit/*`) doesn't include `sections` in its filter attributes → `pageItem.sections` is undefined → `preloadPageSections` exits early ✓
  - Even if sections were present, edit mode skips View component entirely ✓
- [x] Performance comparison: verified working on live dev server with SPA navigation

#### Phase 4 Fixes Applied

**1. `preventDuplicateFetch` defensive default** (`api/preloadSectionData.js`):
`convertOldState`'s middle format path (lines 22-38) returns early without defaulting `preventDuplicateFetch`. Fix: preloaded return sets `preventDuplicateFetch ?? true`.

**2. Wrong page selected for preloading** (`api/preloadSectionData.js`, `render/dmsPageFactory.jsx`, `patterns/page/siteConfig.jsx`):
`preloadPageSections` used `data.find(d => d.sections?.length)` which grabbed the first page with sections — often the Home page, not the navigated page. On SPA navigation to `/song` (with Card), the preload was preloading Home's Spreadsheet instead.
- Fix: Pass `params['*']` (URL slug) from the loader through the preload hook. `preloadPageSections` now matches by `url_slug === slug` (or `index == 0 && !parent` for root URL), mirroring EditWrapper's `filterParams` logic.

**3. DataRequest enrichment keys breaking freshness check** (`api/preloadSectionData.js`):
The DataWrapper's data request builder effect (~line 674) enriches `dataRequest` with empty-object keys (`filter: {}`, `exclude: {}`, `gt: {}`, `gte: {}`, `lt: {}`, `lte: {}`, `like: {}`) plus `orderBy` and `meta`. These keys weren't in the preloaded `lastDataRequest`, so `isEqual(dataRequest, lastDataRequest)` always failed → component re-fetched.
- Fix: New `enrichDataRequest(state)` function mirrors the builder effect's computation. Both `dataRequest` and `lastDataRequest` in the preloaded output use the enriched version, so the equality check succeeds after the effect runs.

## Architecture Decision: Pattern-Specific vs Generic Pre-Loading

**Decision**: Pre-load orchestration is pattern-specific (called from each pattern's loader), not embedded in the generic `dmsDataLoader`.

**Rationale**:
1. **Page filter defaults require parent context** — the page item's `filters` array must be merged with URL params before pre-loading. Only the page pattern knows this relationship.
2. **Only the page pattern stores dataWrapper state in `element-data`** — forms and datasets patterns construct dataWrapper state programmatically at render time. There's nothing to pre-load from a loader in those cases.
3. **Generic `dmsDataLoader` shouldn't know about dataWrapper** — it's a general-purpose data fetcher. Adding section-scanning logic would couple it to page-pattern internals.

**Future extensibility**: `api/preloadSectionData.js` is importable from any pattern's loader. If a future pattern stores dataWrapper state in a JSON attribute, it can call `preloadSectionData()` directly — a one-liner addition to that pattern's loader.

## Files Requiring Changes

| File | Change | Status |
|------|--------|--------|
| `dataWrapper/utils/utils.jsx` | ~~Extract `getData()` core~~ Already standalone | DONE |
| `api/preloadSectionData.js` | Pre-load orchestration, slug-based page matching, dataRequest enrichment | DONE |
| `render/dmsPageFactory.jsx` | Call `dmsConfig.preload` in loader with `params` | DONE |
| `patterns/page/siteConfig.jsx` | Import `preloadPageSections`, wire `preload` hook with slug | DONE |
| `dataWrapper/index.jsx` | No changes needed — existing freshness check handles pre-loaded state | DONE |

## Design Decisions (Resolved)

1. **Where to put the pre-load orchestration**: In `dmsPageFactory.jsx` loader, after `dmsDataLoader` returns. Not inside `dmsDataLoader`.
2. **How to pass pre-loaded data to components**: Embed in section's `element-data` (simpler — `preloadSectionData` already returns updated JSON string).
3. **Parallel pre-loading**: Yes — `Promise.all` for all preloadable sections on a page.
4. **Error handling**: `preloadSectionData` catches errors and returns `null` → section keeps original element-data → component falls back to its own fetch.
5. **Edit mode**: Skip — pre-loading only runs in the page view loader. Edit mode sections are handled by their own `getData()` on mount.

## Notes

- The `apiLoad` function wraps `dmsDataLoader` which wraps Falcor. `preloadSectionData()` creates its own `apiLoad` shim using `dmsDataLoader` directly.
- `getData()` does post-processing (mapping `reqName` back to `column.name`, formula evaluation). This runs inside `preloadSectionData()` so pre-loaded data is component-ready.
- The `readyToLoad` flag in `display` controls whether the component should fetch. `preloadSectionData()` respects this — if `readyToLoad` is false, it returns `null`.
- **Page filter defaults**: Page items store filter defaults in `item.filters`. The loader must merge these with URL params (using the same `|||`-delimited format) and inject effective values into `filterGroups` conditions with `usePageFilters: true` before calling `preloadSectionData()`.
- **Filter resolution order**: `item.filters` (page defaults) → `mergeFilters(item.filters, patternFilters)` (pattern overrides) → URL search params override `useSearchParams: true` filters. The loader must replicate this chain.
- **DataWrapper usage outside page pattern**: Forms and datasets construct dataWrapper state programmatically — no `element-data` to pre-load. If this changes in the future, those patterns can import `preloadSectionData()` and add it to their own loaders.
