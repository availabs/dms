# Deprecate internal_dataset for internal_table

## Status: IN PROGRESS — Phase 1 complete, Phase 3 complete, Phase 2 not started

## Objective

Eliminate the `internal_dataset` type by converting all existing `internal_dataset` sources to `internal_table` format. This moves dataset row data out of the main `data_items` table into per-type split tables, and gives tables human-readable names instead of UUIDs.

## Motivation

`internal_dataset` and `internal_table` are functionally identical — same upload component, same admin page, same UDA query paths, same split table infrastructure. The only differences are:

1. **doc_type generation**: `internal_dataset` uses `crypto.randomUUID()`, `internal_table` uses `nameToDocType(name)` (sanitized lowercase)
2. **Split table routing**: `isSplitType()` only matches `NAME_SPLIT_REGEX` (`^[a-z][a-z0-9_]*-\d+`), so UUID-based types stay in `data_items` while name-based types get their own tables
3. **Creation flow**: `internal_table` combines create + upload in one step; `internal_dataset` requires separate create → add version → upload steps

Having two nearly-identical types adds confusion, and UUID-based data rows bloat the main table.

## Current State (mitigat-ny-prod on dms-mercury-2)

- **27 UUID-based datasets**: 60,069 rows in `data_items` (should be in split tables)
- **7 uppercase DAMA-era datasets** (e.g., `Actions_Revised`): 57,405 rows in `data_items` — uppercase start doesn't match `NAME_SPLIT_REGEX` either
- **Total dataset rows in data_items**: 117,474 out of 276,725 (42%)
- **2 dataset patterns**: ID 1499197 (0 sources), ID 1499610 (3 phantom source refs — IDs 1626198-1626200 don't exist as rows)
- **Per-app mode**: schema `dms_mitigat_ny_prod`, config has `"splitMode": "per-app"`

## Scope

Focus on `mitigat-ny-prod` in `dms-mercury-2` first. The migration script should be general-purpose for any database/app.

## Implementation

### Phase 1: Migration Script — COMPLETE

**File**: `src/scripts/deprecate-internal-dataset.js`

Follow the pattern of `migrate-to-per-app.js` / `copy-db.js` (dry-run default, `--apply` to execute).

#### CLI

```bash
node src/scripts/deprecate-internal-dataset.js --source dms-mercury-2                           # dry-run, all apps
node src/scripts/deprecate-internal-dataset.js --source dms-mercury-2 --app mitigat-ny-prod     # dry-run, one app
node src/scripts/deprecate-internal-dataset.js --source dms-mercury-2 --app mitigat-ny-prod --apply  # execute
```

#### Algorithm

1. **Connect to database**, resolve split mode from config.

2. **Find all dataset data rows** in the main `data_items` table that match UUID or uppercase-name patterns but are NOT already split-eligible:

   For per-app mode (PostgreSQL):
   ```sql
   SELECT DISTINCT type FROM dms_{app}.data_items
   WHERE type ~ '^[0-9a-f]{8}-[0-9a-f]{4}-.*-\d+(-invalid-entry)?$'      -- UUID pattern
      OR (type ~ '^[A-Z].*-\d+(-invalid-entry)?$' AND type !~ '\|')       -- Uppercase name pattern
   ```

   These are the types that need migration. Group by doc_type (strip `-{viewId}` suffix).

3. **For each doc_type group**:
   a. Find the source record (if any) with `data->>'doc_type' = '{uuid_or_name}'`
   b. Generate `newDocType = nameToDocType(sourceName)`. If no source record exists, derive from the existing doc_type.
   c. Check for collisions — if `newDocType` already exists as another source's doc_type, append `_2`, `_3`, etc.
   d. Log: `{doc_type} → {newDocType} ({rowCount} rows, {versionCount} versions)`

4. **If `--apply`**:
   a. For each type string (`{oldDocType}-{viewId}` and `{oldDocType}-{viewId}-invalid-entry`):
      - Compute new type: `{newDocType}-{viewId}` (and `-invalid-entry` variant)
      - The new type matches `NAME_SPLIT_REGEX`, so `resolveTable()` will route it to a split table
      - Use `ensureTable()` to create the split table if needed
      - INSERT rows from main table into split table with updated `type` column
      - Verify row counts match
      - DELETE old rows from main table
   b. Update source record (if exists): set `data.type = 'internal_table'`, `data.doc_type = newDocType`
   c. Clean up phantom source refs from pattern `data.sources` arrays

5. **Summary**: sources migrated, rows moved, phantom refs cleaned, collisions resolved.

#### Key Details

- `nameToDocType(name)`: `name.toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')`
- For UUID doc_types with no source record, use UUID prefix as fallback name (e.g., `550e8400` → `ds_550e8400`)
- For uppercase DAMA-era names like `Actions_Revised`, `nameToDocType` produces `actions_revised` which is valid
- Batch inserts for large datasets (follow `BATCH_SIZE` pattern from other scripts)
- For PostgreSQL per-app mode, split tables go in the app schema (e.g., `dms_mitigat_ny_prod.data_items__actions_revised_1030277`)
- Use `resolveTable()` to compute correct table names — don't hardcode naming

### Phase 2: Client-Side Changes (after migration verified)

#### 2a. Remove `internal_dataset` from type selector

**File**: `src/dms/src/patterns/datasets/siteConfig.jsx`

Remove `internal_dataset` from `damaDataTypes`. New datasets will always be `internal_table`.

#### 2b. Default creation uses `nameToDocType`

**File**: `src/dms/src/patterns/datasets/pages/CreatePage.jsx`

Line 71: Replace `crypto.randomUUID()` with `nameToDocType(data.name)`. Set `data.type = 'internal_table'` when no type is selected.

#### 2c. SourcePage uses actual source type

**File**: `src/dms/src/patterns/datasets/pages/SourcePage.jsx`

Lines 86-87: Change hardcoded `'internal_dataset'` to use `source?.type || 'internal_dataset'` so migrated sources pick up the `internal_table` config. Fallback preserves backward compatibility for un-migrated databases.

#### 2d. Extract `nameToDocType` to shared utility

Move from `sourceCreate.jsx` to a shared location (e.g., `datasets/utils.js` or inline in both files since it's 4 lines).

### Phase 3: Tests — COMPLETE

**File**: `tests/test-deprecate-internal-dataset.js` (25 tests, all passing on SQLite)

- [x] Migration script tests (create UUID-based data, run migration, verify split tables, verify source records updated, verify row counts)
- [x] Collision avoidance test (two sources with same name)
- [x] Phantom ref cleanup test
- [x] Dry-run no-changes test
- [x] Idempotent re-run test
- [ ] UDA query regression test (data still accessible after migration) — deferred to post-production run

## Files

| File | Change |
|------|--------|
| `dms-server/src/scripts/deprecate-internal-dataset.js` | New migration script |
| `dms/src/patterns/datasets/siteConfig.jsx` | Remove `internal_dataset` from type registry |
| `dms/src/patterns/datasets/pages/CreatePage.jsx` | Default to `nameToDocType` instead of UUID |
| `dms/src/patterns/datasets/pages/SourcePage.jsx` | Use actual `source.type` instead of hardcoded `internal_dataset` |
| `dms/src/patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx` | Extract `nameToDocType` |
| `dms-server/src/db/table-resolver.js` | No changes needed — `isSplitType` already handles name-based types |

## Testing Checklist

- [x] Migration script dry-run shows correct plan for mitigat-ny-prod (34 datasets, 117,474 rows)
- [ ] Migration script `--apply` moves all UUID dataset rows to split tables
- [x] Migration script handles uppercase DAMA-era names (Actions_Revised → actions_revised)
- [x] Migration script handles phantom source refs gracefully
- [x] Migration script handles doc_type collisions
- [x] Row counts verified (no data loss) — SQLite tests verify exact counts
- [ ] UDA queries work after migration (data accessible via new type strings)
- [ ] New dataset creation uses `internal_table` type and name-based doc_type
- [ ] Existing `internal_table` sources unaffected
- [ ] Site loads correctly after migration
