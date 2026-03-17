# Test Suite Per-App Mode Migration

## Status: DONE

## Objective

Update the test suite to use per-app split mode as the default, and update test configs to set `"splitMode": "per-app"`. This requires migrating all test code from the legacy `byId` Falcor route to the app-namespaced route.

## Motivation

Per-app mode is the direction for all new databases. The test suite currently uses legacy mode because it relies on the legacy `byId` route (`dms.data.byId[ids][attrs]`), which queries the shared `data_items` table — empty in per-app mode. Migrating tests ensures per-app mode is continuously validated and accelerates deprecation of legacy mode.

## Background

The per-config split mode task (completed 2026-03-17) made `splitMode` a per-database-config setting. Production configs like `dms-mercury-2` already use `"splitMode": "per-app"`. But test configs were left on legacy because the tests use legacy Falcor routes that don't work with per-app tables.

### The Problem

Two Falcor routes exist for `byId` lookups:

1. **Legacy**: `dms.data.byId[{keys:ids}][{keys:attributes}]` — calls `getDataById(ids, atts)` with no `app`, queries shared `data_items`
2. **App-namespaced**: `dms.data[{keys:apps}].byId[{keys:ids}][{keys:attributes}]` — calls `getDataById(ids, atts, app)`, queries per-app table

In per-app mode, the shared `data_items` table is empty — all data lives in `data_items__${app}` (SQLite) or `dms_${app}.data_items` (PostgreSQL). The legacy route returns nothing.

Similarly, `edit` has two formats:
- Legacy: `['dms', 'data', 'edit']` with args `[id, data]`
- App-namespaced: `['dms', 'data', 'edit']` with args `[app, id, data]`

### What `create` Already Does

The `create` route already returns data at **both** paths (legacy and app-namespaced), and `delete` already uses the app-namespaced format (`[app, type, ...ids]`). So the migration is primarily about GET and EDIT calls in tests.

## Implementation (2026-03-17)

### 1. Updated test GET calls — DONE

Changed all legacy `byId` GET paths to include the app:

```javascript
// Before (legacy)
await graph.getAsync([['dms', 'data', 'byId', id, ['id', 'app', 'type']]]);
result.jsonGraph.dms.data.byId[id]

// After (app-namespaced)
await graph.getAsync([['dms', 'data', TEST_APP, 'byId', id, ['id', 'app', 'type']]]);
result.jsonGraph.dms.data[TEST_APP].byId[id]
```

Files updated: `test-graph.js` (5 GETs), `test-workflow.js` (3 GETs + getValue paths), `test-sqlite-compat.js` (1 GET + getValue paths)

### 2. Updated test EDIT calls — DONE

Changed all legacy 2-arg edit calls to 3-arg:

```javascript
// Before (legacy)
await graph.callAsync(['dms', 'data', 'edit'], [id, { title: 'New' }]);

// After (app-namespaced)
await graph.callAsync(['dms', 'data', 'edit'], [TEST_APP, id, { title: 'New' }]);
```

Files updated: `test-graph.js` (1 edit), `test-workflow.js` (9 edits), `test-uda.js` (3 edits), `test-auth.js` (1 edit + response path)

### 3. Updated test configs — DONE

Added `"splitMode": "per-app"` to all 7 DMS test configs:
- `dms-sqlite.config.json`
- `dms.config.json`
- `dms-postgres-test.config.json`
- `cli-test.config.json`
- `cleanup-test.config.json`
- `copy-test-src.config.json`
- `copy-test-tgt.config.json`

### 4. Updated table-splitting tests — DONE

The table-splitting integration tests had hardcoded `'legacy'` in `resolveTable()` calls and checked the shared `data_items` table directly. Changes:

- Added `SPLIT_MODE = 'per-app'` constant, replaced all `'legacy'` in integration test `resolveTable` calls
- Added `mainTable()` and `tableExists()` helpers for cleaner table checks
- Updated "not in data_items" assertions to use `mainTable()` (which returns the per-app table)
- Updated hardcoded table name assertions to use `resolveTable()` with `.includes()` checks (table names now include app prefix)
- Removed `testLegacyByIdStillWorks` and `testEditWith2ArgsFallback` (test legacy behavior that doesn't apply in per-app mode)
- Updated `testTwoAppsNoInterference`: in per-app mode each app has its own sequence, so IDs can be the same across apps — changed assertion from "different IDs" to "both created"
- Renamed `testNonSplitTypeStaysInDataItems` → `testNonSplitTypeStaysInMainTable`, `testUuidTypeStaysInDataItems` → `testUuidTypeStaysInMainTable`
- Updated cleanup to use `mainTable()` instead of hardcoded table name

### 5. Test-sync.js — No changes needed

Already uses 3-arg edits and app-namespaced routes.

## Testing Checklist

- [x] All SQLite tests pass with `"splitMode": "per-app"` in test configs
- [x] All PostgreSQL tests pass with `"splitMode": "per-app"` in test configs
- [x] `npm run test:all` passes (SQLite + PostgreSQL)
- [x] Table-splitting tests still pass (137 passed)
- [x] No test code uses the legacy `byId` route without app context
- [x] No test code uses the 2-arg edit format
- [x] Auth test #14 ECONNRESET is pre-existing (documented in todo.md), unrelated to per-app migration
