# Pattern Creation Refresh Bug

## Objective

Fix the bug where creating a new pattern in the admin pattern list shows a new row with blank data, requiring a full page refresh to see the correct data.

## Symptom

1. User opens admin → Sites → clicks "Add site"
2. Fills in pattern fields (name, base_url, subdomain, pattern_type) → clicks "add"
3. New row appears in the table but **all columns are blank** (no name, no base_url, etc.)
4. Hard refresh (F5) shows the data correctly

## Root Cause Analysis (partial — not yet confirmed)

### Flow

1. `editSite.jsx` → `addNewValue()` → `onChange(newData)` + `onSubmit(newData)`
2. `onChange` calls `updateAttribute('patterns', v)` — sets `item.patterns` to full pattern objects (optimistic local state)
3. `onSubmit` calls `updateData(data, 'patterns')` → `apiUpdate({data: {...item, patterns: newData}})`
4. `apiUpdate` calls `dmsDataEditor(falcor, config, data, requestType)`
5. `dmsDataEditor` **mutates** the `data` object:
   - Extracts dms-format attrs (`delete row['patterns']`)
   - Processes children via sync (`localCreate`) or Falcor (`updateDMSAttrs`)
   - Sets `row['patterns'] = [{ref, id}, ...]` (refs only — no name/base_url/etc.)
6. Back in wrapper, optimistic merge uses the mutated `data` → new pattern has only `{ref, id}`
7. Revalidation (navigate or revalidate) should trigger loader to fetch fresh data with resolved refs, but the correct data never appears

### What was investigated

- **Falcor path**: Added cache invalidation in `updateDMSAttrs` after creating new dms-format children — didn't fix it (sync is active, Falcor path bypassed)
- **Sync path**: Sync IS enabled (`VITE_DMS_SYNC=1`). The sync `localCreate` stores the pattern in local SQLite, `localUpdate` updates the site row with refs, `endBatch()` fires invalidation
- **Revalidation**: Replaced `navigate(samePath)` with `useRevalidator().revalidate()` — cleaner but same result
- **Optimistic merge**: Added `structuredClone(data)` snapshot before `dmsDataEditor` to preserve full pattern data for the merge — didn't fix it either

### Remaining hypotheses

1. **Revalidation timing**: `revalidate()` fires but the loader's `loadFromLocalDB` returns data before the sync writes are fully committed to the browser's wa-sqlite (Web Worker message ordering?)
2. **useEffect dependency**: The `useEffect([data, params])` in wrapper.jsx might not fire because `data` reference doesn't change (React Router may re-use the same object?)
3. **React batching**: The optimistic `setItem` and the loader data update may conflict in React's batching, with the stale update winning
4. **loadFromLocalDB ref resolution**: The ref query (`SELECT * FROM data_items WHERE id IN (?)`) might not find the newly created pattern due to type mismatch (string vs integer IDs in wa-sqlite)
5. **Yjs merge in localUpdate**: The Yjs `applyLocal` merge for the site row might not correctly handle the patterns array replacement

## Changes Made So Far (keep these)

### `wrapper.jsx` (`dms-manager/wrapper.jsx`)
- Added `useRevalidator` import and hook
- Changed post-mutation behavior: `revalidate()` for same-path, `navigate()` only for path changes
- Added `structuredClone(data)` snapshot before `dmsDataEditor` for the optimistic merge

### `updateDMSAttrs.js` (`api/updateDMSAttrs.js`)
- Added `falcor.invalidate` for both cache paths after creating new dms-format children (fixes the non-sync Falcor path)

## Files to Investigate

- `dms-manager/wrapper.jsx` — the optimistic merge + revalidation flow
- `api/index.js` — `dmsDataEditor` sync intercept, `loadFromLocalDB` ref resolution
- `sync/sync-manager.js` — `localCreate`, `localUpdate`, `endBatch`
- `sync/yjs-store.js` — `applyLocal` merge behavior for arrays
- `sync/db-client.js` — Web Worker exec ordering
- `render/spa/dmsSiteFactory.jsx` — `onInvalidate` → `router.revalidate()` (150ms debounce)

## Debugging Strategy

1. Add `console.log` in `loadFromLocalDB` to see if the new pattern row exists in local SQLite when the loader runs
2. Add `console.log` in the wrapper `useEffect([data, params])` to see if/when it fires after revalidation
3. Check if `useLoaderData()` actually returns new data after `revalidate()`
4. Check browser DevTools for wa-sqlite state (IndexedDB → data_items table)

## Testing

- Create a new pattern in the admin and verify it appears with correct data immediately (no refresh needed)
- Verify existing pattern CRUD still works (edit, duplicate, delete)
- Test with sync enabled and disabled (`VITE_DMS_SYNC=1` vs removed)
