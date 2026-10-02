# UDA: a filter on an `expr as alias` column errors when a value is picked

**Initiatives:** [mny_county_sites](../../../../../planning/initiatives/mny_county_sites.md) (primary), [mny_county_actions_workflow](../../../../../planning/initiatives/mny_county_actions_workflow.md) · **Status:** built · **Release:** deploy — frontend (dataWrapper filters); commit — submodule · **Created by:** amuro@albany.edu · **Edited by:** —

**Topic:** dms-server (uda) / dataWrapper filters · **Created:** 2026-09-30 · **Found in:**
[mny-actions-alignment.md](../../../../../planning/mitigateny/tasks/completed/mny-actions-alignment.md)
(Phase 3 step 6)

## Objective

A section can filter on a computed column, i.e. a column whose name is an SQL expression with an
alias, such as MNY's action-category column `to_jsonb(array_remove(array[case when … end, …], null))::text as action_category_json`. The filter's option list works. **Picking a
value fails**: the page swallows the error and the section goes empty. Make picking a value filter
the rows correctly, on both internal (DMS) and external (DAMA) sources.

## What happened (observed 2026-09-29; corrected by browser reproduction 2026-09-30)

- The filter leaf stores `col` = the full column name, `expr as alias`.
- The option list is requested as `distinct <col>`, so the server writes `SELECT distinct expr as
  alias`, which works. With the alias stripped, it writes `SELECT distinct expr as expr`, a syntax
  error (this happened when the MNY rebind stripped it; reverted).
- Applying a value puts `col` into the WHERE clause, giving `WHERE expr as alias = ANY($1)`, a
  syntax error ("syntax error at or near as"). It errors the same way on Actions_Revised (internal)
  and Actions Cleaned (external).
- A second issue, even without the alias: these expressions return a **JSON array as text**
  (`'["planning & regulatory","structural"]'`), so plain equality only matches rows whose whole
  list equals the picked value. The filter needs "contains" matching.

Where it bites in MNY: 13 sections, including SHMP `explore_progress/action_tracking` and the admin
`jurisdictional_entry_page` (the action-category and hazard-category filters).

**Correction (2026-09-30).** A browser reproduction showed that the section's **own** data query was
fine. `buildUdaConfig`'s `mapFilterGroupCols` finds the calc column, drops the alias
(`attributeAccessorStr`) and sends `array_contains`. That returned 47 "structural" state actions on
SHMP `action_tracking`. Two other paths were broken:

## Root cause — DONE 2026-09-30

1. **Sibling filters' option lists (and their counts) errored after a pick.**
   - `ExternalFilters.jsx` (view mode) and `ComplexFilters.jsx` (the editor) handed
     `ConditionValueInput` the **source** schema (`state.externalSource.columns`). The component's
     own comment says it expects the section's display config.
   - A calculated `expr as alias` column exists only in `state.columns`, so
     `resolveFilterGroupsForQuery` couldn't resolve the picked leaf and passed it through unmapped
     (`op: filter`, alias intact).
   - Every other filter's `distinct …` / length query then failed with "syntax error at or near
     as", and their dropdowns came back empty. The same miss made the filter **label** show the raw
     SQL instead of "Action Category".
2. **Legacy column-level filters on a multiselect column never matched.**
   - `extractLegacyColumnFilters` → `options.filter[<refName>] = values` → the server writes
     `<expr> = ANY(['structural'])`. A JSON-array text never equals one category, so on
     `actions_database_dep` a reacting section returned **0** rows.
   - `mapFilterGroupCols` already turns multiselect filter/exclude leaves into `array_contains`.
     The legacy flat path didn't.

## Fix — DONE 2026-09-30

- `components/dataWrapper/components/filters/utils.js`: new `filterConditionColumns(sectionColumns,
  sourceColumns)`, which returns the section columns first plus any source-only ones, with no
  duplicates.
- `ExternalFilters.jsx`: `ConditionValueInput` gets that list (memoized). The label and
  active-token lookups stay **source-first** and only fall back to it, so existing filter labels
  don't change and only unresolved calc labels are fixed.
- `ComplexFilters.jsx`: its value editor gets the same list. The column picker still lists
  `columns` as before.
- `buildUdaConfig.js`:
  - A legacy flat filter/exclude on a `multiselect` column (real values, no null sentinel) now goes
    out as an `array_contains` / `array_not_contains` leaf, ANDed onto `options.filterGroups`.
  - Every comparison-series arm gets the leaf too, because the fan-out reads only the arm's own
    filterGroups while the flat objects apply to all arms.
  - Server-side `array_contains` wraps a non-array value as a one-element array, so scalar
    multiselect columns match exactly as before on Postgres.
- No server change was needed. Stripping the alias for WHERE on the server was considered, but the
  client already sends the bare expression on every path once the column resolves.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/components/filters/utils.js` | `filterConditionColumns` |
| `packages/dms/src/patterns/page/components/sections/ExternalFilters.jsx` | pass section-first columns to `ConditionValueInput`; label fallback |
| `packages/dms/src/patterns/page/components/sections/ComplexFilters.jsx` | same, for the editor's value input |
| `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js` | legacy multiselect filters → array leaves (+ comparison arms) |
| `…/filters/filterConditionColumns.test.js` (new) | 7 vitest cases |

## Testing Checklist

- [x] vitest `filterConditionColumns.test.js`, 7/7:
  - list merge;
  - the unmapped leaf with the source-only list (reproduces the bug);
  - `array_contains` with the fix;
  - legacy filter → `array_contains`, exclude → `array_not_contains`, null sentinel stays flat;
  - comparison arms carry the leaf.
- [x] Full dms-template vitest: 1,950 pass. The 3 failures (avlGraphThemeDefaults 1,
      syncDeltaConvergence 2) and 28 falcor-router spec files that don't load under vitest are
      unrelated; none imports a changed file.
- [x] Browser, local vite + :3011 (the same MNY data):
  - SHMP `explore_progress/action_tracking` (v1): pick Action Category = structural. **0 errors**
    (was 3 "syntax error at or near as"). The table has 47 rows = SQL. The label now reads "Action
    Category".
  - `…/actions_database_dep` (v2): 0 errors, **no zero-row request** (one was 0 before). The
    reacting section has 438 rows = SQL (`dam_rehabilitation_removal` OR
    `other_large_flood_control…` non-empty).
- [ ] After deploy: repeat the two page checks on devmny / hazardmitigation.ny.gov.
- ESLint: ExternalFilters has the same 2 findings as HEAD. ComplexFilters gains 6 `react/prop-types`
  findings on `state.*` (the file has no propTypes; the existing lines trip the same rule).
  buildUdaConfig has only 2 pre-existing unused-var findings.
