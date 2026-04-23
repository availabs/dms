# Task: Protect dmsEnv-Linked Sources in DB Cleanup

## Status: CLOSED (unnecessary) — 2026-04-23

The type-system refactor (see `tasks/completed/type-system-refactor.md`) changed how sources are scoped: source types are now `{dmsEnv}|{name}:source`, with dmsEnv ownership baked into the type column. The original concern — that pattern-`doc_type`-based orphan detection would miss dmsEnv-linked sources — predates that change. After migration, the cleanup script's source-validity model needs to be redesigned around dmsEnvs anyway, not patched in place. Closing this as no longer the right framing; if/when cleanup-db.js is revisited, it'll be a fresh task scoped to the new type scheme rather than this incremental fix.

## Original Objective (kept for reference)

Update `scripts/cleanup-db.js` so that `findOrphanedSources()` does not flag sources referenced by dmsEnv rows as orphaned.

## Problem

The current `findOrphanedSources()` (line 480) builds a set of valid source types from pattern `doc_type` values only. Sources linked through `dmsEnv.data.sources[]` (rather than directly on a pattern) are not recognized as valid and may be deleted.

## Root Cause

When a pattern has `dmsEnvId` set, its own `doc_type` may not match the source's type. The valid source type set is built from patterns, not from dmsEnv refs.

## Fix

### Phase 1: SQLite path (`findOrphanedSources`)

**File**: `scripts/cleanup-db.js`, line 480+

After building `validSourceTypes` from patterns:
1. Load all dmsEnv rows (type = `dmsEnv`)
2. For each dmsEnv, extract `data.sources[]` IDs
3. Add those source IDs to an `alwaysKeep` set
4. When filtering orphans, exclude any source whose ID is in `alwaysKeep`

### Phase 2: PostgreSQL path (`pgFindOrphanedSources`)

**File**: `scripts/cleanup-db.js`, line 248+

Update the CTE to also exclude sources referenced by dmsEnv rows:
```sql
WITH valid_source_types AS (...),
dmsenv_source_ids AS (
  SELECT jsonb_array_elements(data->'sources')->>'id' AS source_id
  FROM {table} WHERE type = 'dmsEnv'
)
SELECT s.id, s.app, s.type
FROM {table} s
WHERE s.type LIKE '%|source' AND s.type NOT LIKE '%|source|view'
  AND NOT EXISTS (SELECT 1 FROM valid_source_types ...)
  AND s.id::text NOT IN (SELECT source_id FROM dmsenv_source_ids)
```

### Phase 3: Test

- [ ] Add test: create a source referenced only by dmsEnv (not by any pattern doc_type) → verify it is NOT flagged as orphaned
- [ ] Add test: source not referenced by any pattern or dmsEnv → verify it IS flagged as orphaned

## Files

- `src/scripts/cleanup-db.js` — findOrphanedSources (line 480), pgFindOrphanedSources (line 248)
- `tests/test-db-cleanup.js` — add dmsEnv-aware tests

## Context

See research doc: `planning/research/dmsenv-datasets-uda.md`
