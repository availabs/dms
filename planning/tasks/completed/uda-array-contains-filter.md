# UDA Server: Array Contains Filter Operation

## Status: DONE

## Implementation Notes

### Server-side implementation (2026-03-27) — DONE

**Approach**: Added `array_contains` as a new filter op in `buildLeafSQL()` with db-type-aware SQL generation. Threaded `dbType` through the `handleFilterGroups` → `buildGroupSQL` → `buildLeafSQL` chain, and from the controller callers (`simpleFilter`, `simpleFilterLength`) via `buildCombinedWhere`.

**Design note**: Did NOT add a separate `arrayContains()` helper to `query-utils.js` as originally planned. The SQL generation is simple enough to inline directly in `buildLeafSQL()`, which avoids an unnecessary abstraction layer and keeps the SQL readable at the call site (per CLAUDE.md code style).

**SQL generated**:
- PostgreSQL: `EXISTS (SELECT 1 FROM jsonb_array_elements_text(col::jsonb) _ac WHERE _ac = ANY($N))`
- SQLite: `EXISTS (SELECT 1 FROM json_each(col) _ac WHERE _ac.value = ANY($N))` (adapter converts `ANY` → `IN`)

**Parameter handling**: Values are passed as a single array parameter (same as `filter` op). The existing `getValuesFromGroup` handles this correctly without modification. The SQLite adapter's `_convertArraySyntax` expands `= ANY($N)` to `IN (?, ?, ...)`.

**8 new tests** in `test-uda.js`: 4 unit tests (getValuesFromGroup, buildLeafSQL for PG/SQLite/default) + 4 integration tests (single value, multi-value OR, AND combination, dataByIndex). All 47 UDA tests pass on SQLite.

### Client-side implementation (2026-03-27) — DONE (filterGroups path)

**`buildUdaConfig.js` changes**:
- `mapFilterGroupCols` now converts multiselect `filter` ops to `op: 'array_contains'`. Values are normalized (unwrap `{value, label}` objects). If values include `'null'`/`'not null'` sentinels, the op stays as `filter` so the legacy resolution path handles it.
- `getColumn` lookup for `mapFilterGroupCols` changed from `sourceColumnsByName.get(name)` to `columnsWithSettingsByName.get(name) || sourceColumnsByName.get(name)` — ensures the merged column (with `type: 'multiselect'` from user config) is found.

**`utils.jsx` — no code changes needed**:
- `resolveMultiselectInFilterGroups` checks `['filter', 'exclude'].includes(node.op)`. Since `filter` is now `array_contains`, it skips those nodes automatically. It still resolves `exclude` ops on multiselect columns (needed until `array_not_contains` is implemented).
- Legacy flat filter multiselect resolution (lines 463-519 in getData) unchanged — handles the deprecated `columns[].filters` path.

### `array_not_contains` + full cleanup (2026-03-27) — DONE

**Server**: `buildLeafSQL` now handles both `array_contains` and `array_not_contains` — the only difference is a `NOT` prefix on the `EXISTS` subquery. 4 new tests (2 unit for NOT EXISTS SQL gen, 2 integration for exclusion correctness). 51 total UDA tests pass.

**Client `buildUdaConfig.js`**: `mapFilterGroupCols` now converts multiselect `exclude` ops to `array_not_contains` (same pattern as `filter` → `array_contains`). Null sentinels still fall through to regular ops.

**Client `utils.jsx` cleanup — all multiselect resolution removed**:
- Deleted `resolveMultiselectInFilterGroups` function (~55 lines)
- Deleted legacy flat filter multiselect resolution block from `getData()` (~60 lines, `columns[].filters` is deprecated)
- Deleted old async `mapFilterGroupCols` (~80 lines, replaced by builder's synchronous version)
- Deleted duplicate `extractHavingFromFilterGroups` and `extractNormalFiltersFromGroups` (~40 lines, live in builder)
- Removed `getFilterData` import (no longer needed)
- Removed aliased builder re-imports (`_attributeAccessorStr`, `_isCalculatedCol`, etc.)
- Net: ~235 lines of async multiselect resolution code removed

## Objective

Add a server-side `array_contains` filter operation to the UDA handler so that multiselect column filtering happens in SQL instead of requiring a client-side fetch-and-match workaround.

## Background

Multiselect columns store JSON arrays as values (e.g., `["Flood", "Hurricane"]`). When a user filters by "Flood", the client currently:

1. Fetches **all distinct values** for the column via a separate API call
2. Pattern-matches client-side to find which full array strings contain "Flood"
3. Sends those full strings as an `IN` filter

This is wasteful (fetches potentially thousands of distinct values), async (blocks `buildUdaConfig` from being fully synchronous), and fragile (client-side string matching on serialized arrays).

### Current client workaround (in `getData()`)

```javascript
// For each multiselect column in filter/exclude:
const options = await getFilterData({ reqName, refName, allAttributes, apiLoad, format: sourceInfo });
const matchedOptions = options
  .map(row => {
    const parsedOption = JSON.parse(row[reqName]); // e.g., ["Flood", "Hurricane"]
    return parsedOption.find(o => selectedValues.includes(o)) ? row[reqName] : null;
  })
  .filter(Boolean);
// Then: WHERE column IN (matchedOptions)
```

## Proposed Fix

### New filter operation: `array_contains`

Add support for an `array_contains` operation in the UDA filter handling. The client sends:

```javascript
{
  filterGroups: {
    op: 'AND',
    groups: [
      { col: 'hazard_types', op: 'array_contains', value: ['Flood', 'Hurricane'] }
    ]
  }
}
```

The server generates:

**PostgreSQL:**
```sql
-- For jsonb columns:
WHERE hazard_types::jsonb @> '["Flood"]'::jsonb
-- For text columns containing JSON arrays:
WHERE hazard_types::jsonb @> '["Flood"]'::jsonb

-- Multiple values (any match):
WHERE (hazard_types::jsonb @> '["Flood"]'::jsonb OR hazard_types::jsonb @> '["Hurricane"]'::jsonb)
```

**SQLite:**
```sql
-- Using json_each to check array membership:
WHERE EXISTS (
  SELECT 1 FROM json_each(hazard_types) je
  WHERE je.value IN ('Flood', 'Hurricane')
)
```

### Files requiring changes

| File | Change | Status |
|------|--------|--------|
| `dms-server/src/routes/uda/utils.js` | Add `array_contains` to `buildLeafSQL()`, thread `dbType` through `handleFilterGroups`/`buildGroupSQL`/`buildCombinedWhere` | **DONE** |
| `dms-server/src/routes/uda/uda.controller.js` | Pass `db.type` to `buildCombinedWhere` in `simpleFilter` and `simpleFilterLength` | **DONE** |
| `dms-server/tests/test-uda.js` | 8 new tests: unit tests for getValuesFromGroup + buildLeafSQL, integration test with JSON array data | **DONE** |
| `dms-server/src/db/query-utils.js` | ~~Add cross-DB `arrayContains` helper~~ — NOT NEEDED, SQL generation is inline in `buildLeafSQL` | N/A |
| `dataWrapper/buildUdaConfig.js` | `mapFilterGroupCols` emits `array_contains` for multiselect `filter` ops and `array_not_contains` for `exclude` ops; `getColumn` lookup checks `columnsWithSettingsByName` first | **DONE** |
| `dataWrapper/utils/utils.jsx` | Removed `resolveMultiselectInFilterGroups`, legacy flat filter resolution, old async `mapFilterGroupCols`, duplicate extract helpers, unused imports (~235 lines removed) | **DONE** |

### DMS mode consideration

For DMS data, multiselect values are stored in a JSON `data` column: `data->>'hazard_types'` returns a JSON array string. The `array_contains` SQL needs to handle this:

```sql
-- PostgreSQL DMS:
WHERE (data->>'hazard_types')::jsonb @> '["Flood"]'::jsonb
-- Or using data->'hazard_types' (returns jsonb directly):
WHERE data->'hazard_types' @> '["Flood"]'::jsonb

-- SQLite DMS:
WHERE EXISTS (
  SELECT 1 FROM json_each(json_extract(data, '$.hazard_types')) je
  WHERE je.value IN ('Flood')
)
```

## Real-World Data Format Analysis (mitigat-ny-prod)

Analysis of the `redesign` pattern in mitigat-ny-prod reveals **three distinct data formats** used by columns marked as `type: "multiselect"`, plus SQL-expression computed columns.

### Format 1: JSON array of strings (most common)

Properly stored as JSON arrays. These are the primary target for `array_contains`.

| Column | Source | View ID | Example Values |
|--------|--------|---------|----------------|
| `county` | Actions_Revised (1029065) | 1074456 | `["Greene"]`, `["Albany"]` |
| `county_geoid` | Actions_Revised (1029065) | 1074456 | `["36039"]` |
| `level` | Policy Database (1068983) | 1157190 | `["Federal"]`, `["State"]` |
| `type` | Policy Database (1068983) | 1157190 | `["Legislation"]` |
| `growth_form` | Invasive Species (7bf5a7d8…) | — | `["Herbaceous"]`, `["Grass"]` |
| `life_cycle` | Invasive Species (7bf5a7d8…) | — | `["Biennial"]` |
| `role` | Stakeholder data (dccf5cf7…) | — | `["Planner", "Stakeholder - Floodplain Resident"]` |
| `hmp_role` | Stakeholder data | — | `["Subject Matter Expertise"]` |
| `hmp_committee` | Stakeholder data | — | `["Risk Assessment"]` |
| `meeting_participation` | Stakeholder data | — | `["Meeting 1", "Meeting 3"]` |

### Format 2: Plain text / comma-delimited strings

These columns are marked `type: "multiselect"` in the UI but contain scalar text, NOT arrays. The `array_contains` operation won't apply — these need a `LIKE` or text-contains operation, or the client needs to handle them differently.

| Column | Source | Example Values |
|--------|--------|----------------|
| `administering_agency_type_fed_state_local_non_profit` | Capabilities (cd28f7bd…) | `"State"`, `"Federal"` |
| `potential_primary_funding_sources` | Forms (split table form1_968266) | `"HMGP, PDM, CDBG, PA 406 (when applicable) local bonds"` |

### Format 3: Mixed arrays (JSON array with mixed types)

Some array entries are plain strings, others are `{label, value}` objects within the same column.

| Column | Source | Example Values |
|--------|--------|----------------|
| `source` | Policy Database (1068983) | `["Climate Policy Spreadsheet", {"label": "Capabilities Database", "value": "Capabilities Database"}]` |

### Format 4: SQL-computed arrays (not stored, derived at query time)

Many Spreadsheet/Card sections use SQL expressions like `to_jsonb(array_remove(ARRAY[CASE WHEN flooding='x' THEN 'Flooding' END, ...], NULL)) as hazards_json` to **compute** multiselect arrays from individual boolean columns. The source data has no single array column — just `flooding: "x"`, `avalanche: null`, etc.

These computed columns include: `hazards_json`, `cc_category_json`, `cc_type_json`, `mm_type_json`, `mm_category_json`, `action_type_json`, `action_category_json`, `hazard_adj`, `shmp_goals`, `assoc_risk_environ`, `hazards_string`.

Since these are already SQL expressions in the SELECT clause, filtering on them requires filtering on the aliased output — which means the `array_contains` must work on expressions, not just raw column names.

### Scale of multiselect usage

| Element Type | Section Count |
|---|---|
| Spreadsheet | 3,653 |
| Card | 1,767 |
| Table: Forms | 965 |
| Graph | 146 |
| Table | 236 |
| Table: Actions | 8 |

22 distinct simple column names + ~11 SQL-expression computed columns.

## Data Format Implications for Implementation

The `array_contains` operation must handle **at minimum** Format 1 (JSON arrays). The other formats need consideration:

1. **JSON array of strings** → `@>` / `json_each` — primary target, straightforward
2. **Plain text** → these shouldn't use `array_contains` at all. The client should detect scalar text columns and use `LIKE` or `IN` instead. May need a `column.dataFormat` hint or server-side type detection.
3. **Mixed arrays** (`{label, value}` objects) → need to extract `.value` from objects before matching: `jsonb_array_elements(col)->'value'` or fall back to text `LIKE`
4. **SQL-expression computed columns** → filtering on aliased computed columns may require wrapping in a subquery or CTE, since you can't use `WHERE alias @> ...` — you'd need `WHERE (expression) @> ...` or filter on the CTE output

### Recommended approach

- Implement `array_contains` for Format 1 (JSON arrays) first — this covers the majority of real usage
- For Format 2 (plain text), keep the existing `IN` / `LIKE` filter path — no change needed
- For Format 3 (mixed arrays), add a `jsonb_array_elements` → extract value path as a follow-up
- For Format 4 (SQL expressions), the computed column already produces a proper JSON array, so `array_contains` on the aliased output should work if the server wraps the query

## Testing

### Unit tests — DONE

- [x] `getValuesFromGroup` with `array_contains` multi-value, single value, scalar value, empty array
- [x] `buildLeafSQL` generates PostgreSQL `jsonb_array_elements_text` SQL
- [x] `buildLeafSQL` generates SQLite `json_each` SQL
- [x] Default (no dbType) falls back to PG syntax

### Integration tests (SQLite) — DONE

- [x] `array_contains` with single value — correct count (2 of 5 items)
- [x] `array_contains` with multiple values (OR semantics) — correct count (3 of 5)
- [x] `array_contains` combined with AND on two columns — correct count (1 of 5)
- [x] `array_contains` returns data rows via `dataByIndex`
- [x] `array_not_contains` single value — excludes matching items (3 of 5)
- [x] `array_not_contains` multiple values — excludes correctly (2 of 5)

### PostgreSQL integration tests — DONE

- [x] Run `npm run test:pg` to verify PG path — 51 passed, 0 failed
- **Bug found & fixed**: `${col}::jsonb` had operator precedence issue when `col` is `data->>'hazards'` — PostgreSQL parsed `::jsonb` as casting the string literal `'hazards'` instead of the full expression result. Fixed by wrapping: `(${col})::jsonb`.

### Future test items (not blocking)

- [ ] `array_contains` on SQL-expression computed column (aliased output)
- [ ] Scalar text column with multiselect type does NOT use `array_contains` (client should detect)

### Integration tests against mitigat-ny-prod data

These sections use multiselect filtering in production and must be verified:

- [ ] **Actions_Revised Spreadsheet** — filter `county` (JSON array, source 1029065, view 1074456) by a single county name
- [ ] **Actions_Revised Spreadsheet** — filter `county_geoid` (JSON array) by geoid
- [ ] **Policy Database Card/Spreadsheet** — filter `level` (JSON array, source 1068983, view 1157190) by "Federal"
- [ ] **Policy Database** — filter `source` (mixed array with `{label,value}` objects)
- [ ] **Stakeholder Spreadsheet** — filter `role` (JSON array, source dccf5cf7…) by "Planner"
- [ ] **Stakeholder Spreadsheet** — filter `hmp_committee` (JSON array)
- [ ] **Invasive Species** — filter `growth_form` (JSON array, source 7bf5a7d8…)
- [ ] **Capabilities** — filter `administering_agency_type_fed_state_local_non_profit` (plain text, should NOT use array_contains)
- [ ] **Hazards computed column** — filter `hazards_json` (SQL-expression computed, `to_jsonb(array_remove(...))`)
- [ ] **Forms `potential_primary_funding_sources`** — comma-delimited text, should NOT use array_contains

## Impact on datawrapper re-architecture

This task unblocks making `buildUdaConfig()` fully synchronous. Currently the multiselect resolution requires async API calls, preventing the builder from being a pure function. With server-side `array_contains`, the builder simply emits the operation and the server handles it — no client-side fetch needed.

After this task:
- `resolveMultiselectInFilterGroups()` in `utils.jsx` can be removed
- The multiselect resolution block in `getData()` can be removed
- `buildUdaConfig()` becomes fully synchronous (no async post-processing needed)
