# Split Table Naming: `data_items__s{source_id}_v{view_id}_{doc_type}`

## Objective

Rename split tables from `data_items__{sanitized_type}` to `data_items__s{source_id}_v{view_id}_{doc_type}` so tables are immediately identifiable when browsing the database (e.g., `data_items__s290_v291_actions_6` instead of `data_items__actions_6_291`).

## Key Design Decisions

- `resolveTable()` stays synchronous — gains optional `sourceId` parameter
- Controller wrappers do the async lookup — `ensureForWrite`/`ensureForRead` look up source_id via DB query with in-memory cache
- Graceful fallback — if source_id can't be found, falls back to old `data_items__` naming
- Invalid-entry suffix — `data_items__s290_v291_actions_6_invalid`
- No app prefix needed on split tables — source_id is globally unique
- `data_items__` prefix retained for all split tables

## Type String Parsing

For type `actions_6-291`:
- `doc_type` = `actions_6` (strip `-\d+(-invalid-entry)?$`)
- `view_id` = `291` (capture `\d+` before optional `-invalid-entry`)
- `source_id` = DB lookup by `app` + `doc_type` → `290`

For type `actions_6-291-invalid-entry`:
- Same doc_type/view_id/source_id, table gets `_invalid` suffix

## Phases

### Phase 1: table-resolver.js — DONE

- [x] Add `parseType(type)` → `{docType, viewId, isInvalid}`
- [x] Update `resolveTable()` signature: add optional `sourceId` parameter
- [x] When sourceId provided: build `data_items__s${sourceId}_v${viewId}_${docType}${isInvalid ? '_invalid' : ''}`
- [x] When sourceId null: use current `data_items__${sanitize(type)}` naming (fallback)
- [x] Per-app mode: same new naming (no app prefix on split tables since source_id is unique)
- [x] Export `parseType`

### Phase 2: dms.controller.js — DONE

- [x] Add `_sourceIdCache` Map inside factory closure
- [x] Add `lookupSourceId(app, type)` helper — extracts doc_type, checks cache, DB query fallback
- [x] Update `resolve()` to async, calls `lookupSourceId`
- [x] Update `ensureForWrite()` and `ensureForRead()` — call updated async `resolve()`
- [x] Audit all call sites of `resolve()` — only called from ensureForWrite/ensureForRead, both already async
- [x] Update `updateDataById` signature: added `app` parameter (was using dummy `'_'`), updated caller in `upload/routes.js`
- [x] Update UDA `getEssentials` in `routes/uda/utils.js` — added source_id lookup before `resolveTable` call

### Phase 3: Tests — DONE

- [x] Unit tests for `parseType()` — 12 assertions
- [x] Unit tests for `resolveTable()` with sourceId parameter — 8 assertions (legacy, per-app, PG, fallback, string sourceId)
- [x] Fallback tests — verify old naming when sourceId is null
- [x] Integration test: create source record → create split data → verify `data_items__s{id}_v{viewId}_{docType}` table exists
- [x] Integration test: invalid entry variant also uses new naming
- [x] Integration test: fallback naming when no source record exists
- [x] All existing tests pass: splitting 104/104, graph 8/8, workflow, UDA 24/24

### Phase 4: Migration Script — DONE

- [x] Create `src/scripts/migrate-split-tables.js`
- [x] `reverseOldTableName()` — reverse-engineers type from old table name
- [x] Skips: empty tables, new-format tables, per-app tables, tables without source records
- [x] Dry-run by default, `--apply` to execute
- [x] Supports both PostgreSQL and SQLite (index handling differs)
- [x] Tested dry-run: correctly identifies 6 tables to rename in dev database

## Files Modified

| File | Change |
|------|--------|
| `src/db/table-resolver.js` | Added `parseType()`, updated `resolveTable()` with `sourceId` param |
| `src/routes/dms/dms.controller.js` | Added `_sourceIdCache`, `lookupSourceId()`, made `resolve()` async, updated `updateDataById` signature |
| `src/routes/uda/utils.js` | Added source_id lookup in `getEssentials` |
| `src/upload/routes.js` | Updated `updateDataById` call to pass `app` |
| `tests/test-table-splitting.js` | Added parseType, sourceId, integration tests (104 total) |
| `src/scripts/migrate-split-tables.js` | NEW — migration script |

## Testing Checklist

- [x] `npm run test:splitting` — 104 passed, 0 failed
- [x] `npm run test:graph` — all passed
- [x] `npm run test:workflow` — all passed
- [x] `npm run test:uda` — 24 passed, 0 failed
- [x] Migration script dry-run shows correct renames
- [ ] Migration script --apply renames correctly (needs manual verification on real data)
- [ ] PostgreSQL test suite (`npm run test:pg`) — needs Docker
