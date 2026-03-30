# Per-Config Split Mode

## Status: DONE

## Objective

Move `DMS_SPLIT_MODE` from a server-wide environment variable to a per-database-config setting, so different database configs can use different split modes on the same server. The env var remains as a fallback for backward compatibility.

## Motivation

After migrating `dms-mercury-2` to per-app schemas, the server needs `DMS_SPLIT_MODE=per-app` to use it — but local dev SQLite databases still use legacy mode. Currently you can't run both on the same server. Making split mode per-config solves this cleanly.

## Implementation (2026-03-17)

### Priority Chain

```
options.splitMode (test override) > config.splitMode > process.env.DMS_SPLIT_MODE > 'legacy'
```

### Changes Made

#### 1. `src/routes/dms/dms.controller.js` — DONE

Added `loadConfig` import. `createController()` now reads `config.splitMode`:

```javascript
const config = loadConfig(dbName);
const splitMode = options.splitMode || config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
```

#### 2. `src/routes/sync/sync.js` — DONE

Added `loadConfig` import. `createSyncRoutes()` now reads `config.splitMode`:

```javascript
const config = loadConfig(dbName);
const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
```

#### 3. `src/routes/uda/utils.js` — DONE

- Added `loadConfig` import
- `dmsMainTable(db, app, splitMode)` — added optional `splitMode` parameter (falls back to env var)
- `getEssentials()` — resolves `splitMode` from config via `loadConfig(dbEnv)`, returns it in result object
- `getSitePatterns({ db, app, splitMode })` — added optional `splitMode`, passes to `dmsMainTable`
- `getSiteSources({ db, app, ..., splitMode })` — added optional `splitMode`, passes to `dmsMainTable`

#### 4. `src/routes/uda/uda.controller.js` — DONE

All 10 functions that call `getEssentials()` now destructure `splitMode` and pass it to `dmsMainTable()`, `getSitePatterns()`, and `getSiteSources()`.

#### 5. `src/index.js` — DONE

Updated startup log to note that split mode may vary per database config.

#### 6. `src/db/configs/dms-mercury-2.config.json` — DONE

Added `"splitMode": "per-app"` to the config.

#### 7. Test graph harness (`tests/graph.js`) — DONE

Added `await graph.ready` (backed by `awaitReady()`) to prevent SQLite nested transaction errors when per-app mode creates tables during `ensureForWrite()` while DB init is still in progress. Updated all 7 test files to await it.

#### 8. Example configs — DONE

Updated `dms-sqlite.example.config.json`, `postgres.example.config.json`, `sqlite.example.config.json` to include `"splitMode": "per-app"` as guidance for new setups.

### No Changes Needed

- **`src/db/config.js`** — `loadConfig()` already returns the full config object; new fields pass through automatically
- **`src/db/table-resolver.js`** — Already receives `splitMode` as a parameter from callers
- **Database adapters** — Don't use splitMode

### Not Yet Migrated

- **Test configs** (`dms-sqlite`, `dms-postgres-test`, `cli-test`, etc.) — Kept in legacy mode because the existing test suite uses the legacy `byId` route (`dms.data.byId[ids][attrs]`) which doesn't pass `app`, so it queries the shared `data_items` table. In per-app mode that table is empty. Migrating tests to per-app requires updating all test code to use the app-namespaced route (`dms.data[app].byId[ids][attrs]`) — a separate task.

## Testing Checklist

- [x] Config without `splitMode` defaults to env var (backward compat) — all existing tests use configs without `splitMode` and pass
- [x] Config with `splitMode: "per-app"` uses per-app mode regardless of env var — dms-mercury-2 config updated
- [x] `options.splitMode` (test override) takes highest priority — unchanged, controller still checks `options.splitMode` first
- [x] Env var fallback works when config has no `splitMode` — tested via existing test suites
- [x] Default to `'legacy'` when neither config nor env var is set — tested via existing test suites
- [x] Existing tests pass unchanged — all tests pass: main (SQLite, controller, graph, workflow), UDA (35/35), sync (75/75), table-splitting (138/138)
- [x] UDA routes respect per-config splitMode — `getEssentials()` resolves from config, threads through all callers
- [x] Sync routes respect per-config splitMode — `createSyncRoutes()` resolves from config
