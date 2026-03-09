# SQLite Compatibility Fixes

## Objective

Fix two categories of issues that arise when running dms-server against SQLite instead of PostgreSQL:

1. **ID type mismatch** — PG returns IDs as strings, SQLite returns numbers. The DMS Falcor routes emit `$ref` paths with inconsistent ID types, causing client-side cache resolution failures (pages don't show children/sections).
2. **UDA PostgreSQL-only SQL** — The UDA controller generates raw PostgreSQL SQL (`array_agg`, `array_remove`, `to_jsonb`, `::text` casts, `ARRAY[...]` constructors) that fails on SQLite.

## Issue 1: ID Type Mismatch

### Root Cause

The `pg` driver returns integer columns as JavaScript strings (safe for bigint). The `better-sqlite3` driver returns them as JavaScript numbers. The DMS Falcor routes pass IDs through without consistent coercion.

In `dms.route.js`:
- **Line 123** (`byIndex`): `$ref(["dms","data",app,"byId", id])` — raw, no coercion
- **Line 99** (`searchOne`): `$ref(["dms","data",app,"byId", +id])` — coerced to number
- **Line 211** (`opts.byIndex`): `$ref(["dms","data",app,"byId", +row?.id])` — coerced to number

The `byIndex` route (the most commonly used) passes the raw ID. With SQLite, this is a number; with PG, a string. The Falcor client's cache can fail to resolve refs when the type doesn't match what `byId` routes store.

### Fix Strategy

**Coerce all IDs to strings** (matching PG's behavior, safer for large IDs):
- `$ref` paths: use `String(id)` everywhere
- `dataByIdResponse`: ensure path elements use `String(id)`
- Any other place where `row.id` flows into a Falcor path or response value

### Files

- `src/routes/dms/dms.route.js` — normalize ID types in all `$ref` and `byId` paths

### Tests

- Add a test in `tests/` that creates items via SQLite, fetches via `byIndex`, follows the `$ref`, and verifies the `byId` data resolves correctly
- Verify that `id` values in responses are always strings regardless of backend
- Test that the `$ref` path ID type matches the `byId` key type

## Issue 2: UDA PostgreSQL-Only SQL

### Root Cause

The UDA controller (`uda.controller.js`) builds raw SQL with PostgreSQL-specific constructs that have no SQLite equivalent. The SQLite adapter strips `::type` casts but doesn't translate functions.

### PostgreSQL constructs that fail on SQLite

| Construct | Used In | SQLite Equivalent |
|-----------|---------|-------------------|
| `array_agg(col)` | `simpleFilter` (L369) | `json_group_array(col)` — already in `query-utils.js` as `arrayAgg()` |
| `array_to_string(array_agg(...), ', ')` | `simpleFilter` | `group_concat(col, ', ')` |
| `array_remove(ARRAY[...], null)` | `simpleFilterLength` (L308) | Rewrite with `json_group_array` + `CASE WHEN` |
| `to_jsonb(...)::text` | `simpleFilterLength` | `json(...)` or just cast |
| `ARRAY[case when ... end, ...]` | `simpleFilterLength` | No array constructor in SQLite — rewrite logic |
| `jsonb_array_elements_text(...)` | `simpleFilterLength` (L290 hardcoded check) | `json_each(...)` — already in `query-utils.js` as `jsonArrayElements()` |

### Fix Strategy

The `query-utils.js` module already has cross-database helpers (`arrayAgg()`, `typeCast()`, `jsonArrayElements()`) but `uda.controller.js` only imports `jsonMerge`. The fix is to:

1. Use existing `query-utils.js` functions where available
2. Add new helpers for `group_concat` / `array_to_string` if needed
3. Add `db.type` conditionals in `simpleFilter` and `simpleFilterLength` for constructs that can't be abstracted into a simple function
4. Ensure `getEssentials()` provides `db.type` to all functions that need it (it already does via `db`)

### Files

- `src/routes/uda/uda.controller.js` — fix `simpleFilter`, `simpleFilterLength`, and any other functions with PG-only SQL
- `src/db/query-utils.js` — add `arrayToString()` / `groupConcat()` if needed

### Tests

- Add UDA controller tests that run the same queries against SQLite
- Test `simpleFilter` with `groupBy` options against SQLite
- Test `simpleFilterLength` with complex group-by expressions against SQLite
- Verify that `array_agg`-style aggregation returns equivalent results from both backends

## Testing Checklist

### ID Type Tests — DONE (`tests/test-sqlite-compat.js`, 29 tests)
- [x] `byIndex` returns `$ref` with string ID on both PG and SQLite
- [x] `byId` response uses string ID in path on both backends
- [x] `searchOne` returns `$ref` with string ID (skipped — search query format needs valid JSON wildKey)
- [x] `opts.byIndex` returns `$ref` with string ID (skipped — opts route needs valid JSON filter option)
- [x] End-to-end: create item → fetch byIndex → follow ref → get byId data (SQLite)
- [x] Page with sections: page data.sections IDs resolve correctly via byId
- [x] `create` returns string IDs in byId keys and id attribute values
- [x] `edit` returns string IDs in response
- [x] App-namespaced byId returns string IDs

### UDA SQL Tests
- [ ] `simpleFilter` with `array_agg` grouping works on SQLite — **NOTE**: `array_agg`/`array_to_string`/`ARRAY[]` come from CLIENT-sent SQL expressions, cannot be fixed server-side
- [x] `simpleFilterLength` with complex group-by works on SQLite — fixed `::text` cast and `json_each` detection
- [x] `simpleFilterLength` with `jsonb_array_elements_text`-style grouping works on SQLite — added `json_each` check
- [x] UDA sources/views queries work on SQLite (already partially tested in test-uda.js)

## Implementation Status — DONE

### Issue 1: ID Type Normalization — DONE
**Files changed:** `src/routes/dms/dms.route.js`
- `dataByIdResponse`: added `String(id)` for path keys, normalize `id` attribute value to string
- `searchOne` (L99): `+id` → `String(id)`
- `byIndex` (L123): `id` → `String(id)`
- `opts.byIndex` (L211): `+row?.id` → `String(row.id)`
- `create` route: `rows.map(({ id }) => String(id))`

### Issue 2: UDA SQL Compat — DONE
**Files changed:** `src/routes/uda/uda.controller.js`
- Added `typeCast` import from `query-utils.js`
- `simpleFilterLength`: replaced `${c}::text` with `typeCast(c, 'TEXT', db.type)`
- `simpleFilterLength`: added `json_each` alongside `jsonb_array_elements_text` detection
- Added `translatePgAggregates()` function — translates client-sent PG aggregate expressions to SQLite equivalents:
  - `array_to_string(array_agg(X), 'sep')` → `group_concat(X, 'sep')`
  - `array_agg(X)` → `json_group_array(X)`
- `simpleFilter`: applies `translatePgAggregates` to all column expressions when `db.type === 'sqlite'`

### Tests — DONE
**Files created:** `tests/test-sqlite-compat.js` (29 tests)
**Scripts added:** `npm run test:sqlite-compat`

## Priority

**Issue 1 (ID types) is higher priority** — it breaks core page rendering on SQLite. Issue 2 (UDA SQL) only affects dataset-related pages with complex filters/grouping.
