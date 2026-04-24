# UDA `getSitePatterns` / `getSiteSources` — match by type-column instance

## Status: DONE — all 51 UDA tests pass on SQLite and PostgreSQL

## Objective

Fix the two failing UDA tests by aligning `getSitePatterns` and `getSiteSources` (in `packages/dms-server/src/routes/uda/utils.js`) with the completed type-system refactor. Both functions still rely on legacy substring/`data.doc_type` matching that no longer fits the new `{parent}:{instance}|{rowKind}` type scheme. Update the test fixtures to the new format at the same time.

## Background

The [type system refactor](../completed/type-system-refactor.md) (Phases 0–16, 18 done) moved row identity into the `type` column and stripped `data.doc_type` from new pattern/source rows. After migration, a pattern looks like:

```
type:  prod|my_dataset:pattern
data:  { name: "My Dataset", pattern_type: "datasets", sources: [...], dmsEnvId: 7 }
       (no doc_type)
```

Client-side, `pattern2routes()` extracts the pattern instance via `getInstance(pattern.type)` (e.g., `'my_dataset'`) and constructs Falcor envs as `${app}+${instance}` (e.g., `myapp+my_dataset`). The phrase "doc_type" still appears in some server code/comments but only as a vestigial name — the *value* is the new instance name from the type column.

## Failing tests

`npm run test:uda` aborts at the first throw, but a per-test rerun shows two failures (and 9 passes):

| Test | Failure |
|---|---|
| `testDmsModeSourcesViaPatterns` | Expected 2 sources, got 0 |
| `testDmsModeRealWorldPatternType` | Expected 1 source for `'undefined\|pattern'` type, got 0 |

Both fail at `uda.sources.length` → `getSourcesLength(env)` → `getSitePatterns(...)` → 0 matches → 0 sources.

### Why `getSitePatterns` returns 0

Current SQL (`utils.js:232-243`):

```sql
SELECT id FROM <table>
WHERE app = $1
  AND (type = 'pattern' OR type LIKE '%|pattern' OR type LIKE '%:pattern')
  AND type LIKE '%' || $2 || '%'         -- $2 = instance from env (e.g. 'dataset')
```

The `AND type LIKE '%<instance>%'` clause requires the instance string to appear *as a substring* anywhere inside the pattern's type column. That worked when patterns were stored as `{site}|{instance}|pattern` because the instance was literally inside the string. It does not work for:

- Test fixture A — pattern type is bare `'pattern'`, no instance present. The instance lives only in `data.doc_type`.
- Test fixture B — pattern type is `'undefined|pattern'`, also no instance in the type column.

After the refactor the **instance is the segment between the last `|` and `:`**, and any reliable filter must extract that segment. Substring matching also has a false-positive risk (`'foo' LIKE '%fo%'`).

### Why `getSiteSources` is partially stale

Current SQL (`utils.js:251-261`):

```sql
SELECT data->'sources' AS sources, data->>'dmsEnvId' AS dms_env_id
FROM <table>
WHERE id = ANY($1)
  AND (data->>'doc_type' = ANY($2) OR data->>'doc_type' IS NULL)
```

The `data->>'doc_type' = ANY($2) OR data->>'doc_type' IS NULL` clause is dead weight after migration — `doc_type` is removed from new pattern data, so the `IS NULL` branch always wins. The `pattern_doc_types` parameter is only used for this stale check. The id filter alone is sufficient because `getSitePatterns` already narrowed the IDs.

## Proposed Changes

### `getSitePatterns` — match by type-column instance

Replace the substring filter with an exact match against the instance segment in the type column. New format pattern types are `{site}|{instance}:pattern`; the instance segment is found via `'%|' || $2 || ':pattern'` in SQL.

Drop the broad legacy fallback (`type = 'pattern'`, `type LIKE '%|pattern'`) — production data has been migrated (Phase 16 ran on `dms-mercury-types`, 87,059 type updates applied). New databases use new format from creation. Keeping the legacy fallback re-introduces the substring false-positive risk.

```js
async function getSitePatterns({ db, app, env, splitMode }) {
  const tbl = await dmsMainTable(db, app, splitMode);
  const instance = env.includes('+') ? env.split('+')[1] : null;

  // New format: pattern types are '{site}|{instance}:pattern'.
  // Match by exact instance segment, not by substring (avoids false positives
  // and reflects the type-column refactor — instance no longer lives in data.doc_type).
  const sql = instance
    ? `SELECT id FROM ${tbl} WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'`
    : `SELECT id FROM ${tbl} WHERE app = $1 AND type LIKE '%:pattern'`;
  const params = instance ? [app, instance] : [app];
  const { rows } = await db.query(sql, params);
  return rows.map(r => r.id);
}
```

### `getSiteSources` — drop `doc_type` filter, drop unused parameter

```js
// Remove pattern_doc_types from the signature
async function getSiteSources({ db, app, pattern_ids, splitMode }) {
  if (!pattern_ids.length) return [];

  const tbl = await dmsMainTable(db, app, splitMode);
  const sql = `
    SELECT data->'sources' AS sources, data->>'dmsEnvId' AS dms_env_id
    FROM ${tbl}
    WHERE id = ANY($1)
  `;
  const { rows } = await db.query(sql, [pattern_ids.map(Number)]);
  // ... rest unchanged
}
```

### Update `getSiteSources` callers in `uda.controller.js`

Two call sites pass `pattern_doc_types: [type]` — drop that argument:

```js
// uda.controller.js:23, 42
const sources = await getSiteSources({ db, app, pattern_ids, splitMode });
```

### Update test fixtures in `test-uda.js`

Rewrite the two failing tests to create patterns/sources in the new format. The `TEST_TYPE` constant becomes the pattern instance name (already `'dataset'`, that's fine — it just needs to land in the type column instead of in `data.doc_type`).

**`testDmsModeSourcesViaPatterns`** — change pattern creation to use new-format type:

```js
// Site
[TEST_APP, `${TEST_APP}:site`, { patterns: [] }]

// Pattern: type is '{site_instance}|{pattern_instance}:pattern'
[TEST_APP, `${TEST_APP}|${TEST_TYPE}:pattern`,
 { name: TEST_TYPE, pattern_type: 'forms', sources: [] }]   // no doc_type

// Sources: type is '{pattern_instance}|{source_instance}:source'
[TEST_APP, `${TEST_TYPE}|source_a:source`, { name: 'Source A', display_name: 'Source Alpha' }]
[TEST_APP, `${TEST_TYPE}|source_b:source`,
 { name: 'Source B', display_name: 'Source Beta', views: [{ id: src1Id }] }]
```

env stays the same: `${TEST_APP}+${TEST_TYPE}` — the right half is the pattern instance.

**`testDmsModeRealWorldPatternType`** — the test name documents an obsolete real-world format. Either:
- Rename to `testDmsModeUndefinedSiteInstance` and create the pattern as `'undefined|realworld_test:pattern'` (mimicking a pattern whose site instance is the placeholder "undefined" string but otherwise new format), OR
- Delete the test entirely — `testDmsModeSourcesViaPatterns` already covers the dispatch path.

Recommend option 1: keep coverage of the "site instance not yet set" edge case. Update fixtures to put the instance (`realworld_test`) in the type column instead of `data.doc_type`, drop `data.doc_type` from both pattern and source.

### Cleanup pass on stale comments

Update the now-misleading comments around `getSitePatterns` (lines 235–237) and `getSiteSources` (lines 247–255). Several reference "doc_type" but the value is now an instance name from the type column.

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms-server/src/routes/uda/utils.js` | `getSitePatterns`: instance-segment match in type column. `getSiteSources`: drop `data->>'doc_type'` clause and `pattern_doc_types` parameter. Update comments. |
| `packages/dms-server/src/routes/uda/uda.controller.js` | Two call sites for `getSiteSources` — drop `pattern_doc_types` arg (lines 23, 42). |
| `packages/dms-server/tests/test-uda.js` | Update `testDmsModeSourcesViaPatterns` and `testDmsModeRealWorldPatternType` fixtures to new-format types; remove `data.doc_type` from create/edit payloads. |

## Out of scope

- The wider Phase 17 test suite update (other test files still use legacy types) — track separately.
- Other server-side `data->>'doc_type'` references (in `dms.controller.js`, `dama/upload/routes.js`, `getEssentials` in `utils.js`). Those handle resolving sources from incoming type strings on data-row queries — different code path, not blocking this fix. Worth a follow-up audit but not this task.
- The `_realworld_` test uses `data.doc_type` of source rows (`{ name: 'Real Source', doc_type: 'rs-uuid' }`); per the refactor source rows also no longer carry `doc_type`. Drop it from the fixture.

## Testing Checklist

- [x] `npm run test:uda` runs to completion without early abort — **51 passed, 0 failed**
- [x] All 11 UDA test functions pass on SQLite (42-subassertion full set)
- [x] All 11 UDA tests pass on PostgreSQL via `npm run test:pg` (Docker container)
- [x] `getSitePatterns` returns no false positives — the new `type LIKE '%|' || $instance || ':pattern'` requires an exact `|<instance>:pattern` segment, so instance `foo` cannot match instance `foobar` (no substring leakage)
- [ ] Live smoke test in dev server — deferred, but the end-to-end UDA test paths (`sources.length`, `sources.byIndex`, `sources.byId`) all exercise the fixed code and pass
- [x] No regressions in the rest of the default test suite: `test-sqlite`, `test-controller`, `test-graph`, `test-workflow` all pass. `test-sync`: 75/75. Pre-existing failures in `test-splitting` (`table-resolver.js` unit test, unrelated) and `test-auth` (missing local config) are not caused by this change

## Notes for the implementer

- Read `planning/tasks/completed/type-system-refactor.md` first — Phases 7–11 explain the full client-side migration this task aligns to. Phase 3 (UDA routes) is the prior partial pass on these same functions.
- `packages/dms/src/utils/type-utils.js` (client) and `packages/dms-server/src/db/type-utils.js` (server) export `getInstance(type)` — handy for unit-testing the SQL output if you add a regression test.
- After fixing, the pre-existing `Test failed: ...` early-abort wrapper in `test-uda.js` `run()` will let the suite progress through all 11 tests. If you find further failures behind the previously-blocking one, surface them but don't bundle the fix here.
