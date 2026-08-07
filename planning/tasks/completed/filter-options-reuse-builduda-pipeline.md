# Reuse buildUdaConfig's filter-tree pipeline for options queries (server filters + ComplexFilters value editor)

**Status:** DONE (implemented; two scope reductions from the original plan — see Design notes)
**Topic:** patterns/page (filters)
**Related:** [filter-leaf-show-in-header.md](./filter-leaf-show-in-header.md) — that task's `showInHeader` leaf
will also need its options fetched correctly; this task is the prerequisite that makes it easy, since a
`showInHeader` leaf's options now narrow exactly like any other leaf's options do.

## Objective

Replace `useColumnOptions`'s hand-rolled `filterBy` builder (in
`patterns/page/components/sections/ConditionValueInput.jsx`) with a payload built by
reusing `buildUdaConfig.js`'s own filter-tree processing pipeline, for both (a) the
`ComplexFilters` leaf editor's own value input and (b) the table-header
`ServerFilterControl` (server filters).

## Why this was the right fix, not just a workaround

- The server's options-query handler (`simpleFilter`/`simpleFilterLength` in
  `dms-server/src/db/postgres.js`) is the same function used for the main data query —
  it already recognizes `filterGroups` (an arbitrary nested AND/OR tree, any depth, any
  op). The wire format already supported sending the real, whole tree.
- The old reducer (a flat, single-level `filterBy` built from a curated sibling list)
  couldn't represent unary ops (`is_null`/`is_not_null`/`empty`/`notempty`), the
  structured `time` op, or `isNormalFilter`/`fn` (HAVING/aggregate) leaves — and silently
  collided two same-column sibling sources under one dict key instead of both surviving
  as independent ANDed conditions.
- `mapFilterGroupCols`/`extractNormalFiltersFromGroups`/`extractHavingFromFilterGroups`
  (all already exported, pure, standalone) do this correctly for the main query — reusing
  them means no second leaf-shape interpretation to keep in sync.

## What was implemented

**`buildUdaConfig.js`** — four new exported functions, colocated with `isGroup`/`hasAnyFilterLeaf`:

- `mergeTableFilters(filters, tableFilters)` — the two-group AND-wrap (persisted tree as
  one sibling group, `tableFilters` as the other), extracted from `getData.js` so both
  the main query and the options path share one implementation instead of two that could
  drift apart. `getData.js`'s tableFilters-merge block now calls this directly.
- `pruneColumnFromFilterTree(node, col, sourceId)` — removes the leaf(s) for one column
  (matched by name **and** source) from a tree, at any depth, collapsing any group left
  empty by the removal (so a stripped nested group can never reach the SQL builder as an
  empty `()`). Used to keep a column from narrowing its own dropdown by its own condition.
- `restrictFilterTreeToSource(node, sourceId)` — drops any leaf whose `source_id` doesn't
  match, same empty-group collapse. See Design notes — this is the join-alias scope
  reduction.
- `resolveFilterGroupsForQuery(tree, getColumn, isDms)` — runs a tree through
  `extractNormalFiltersFromGroups → mapFilterGroupCols → extractHavingFromFilterGroups`
  and returns only the resulting WHERE-clause `filterGroups` (discarding the extracted
  `normalFilters`/`having` — see Design notes on why they're discarded, not forwarded).
  Guards against a bare `{}` (e.g. an unconfigured legacy filters value) being
  misclassified as a leaf by `hasAnyFilterLeaf` and reaching `mapFilterGroupCols`/
  `buildGroupSQL`, which assume every non-group node is a proper `{col, op, value}` leaf.

**`getData.js`** — the tableFilters-merge block now calls `mergeTableFilters` instead of
building the two-group wrap inline (no behavior change, just de-duplication).

**`ConditionValueInput.jsx`** —
- `useColumnOptions`'s 6th param is now `siblingFilterTree` (a filter-tree node, or
  `null`) instead of `siblingConditions` (a flat array). Internally it calls
  `resolveFilterGroupsForQuery` and sends the result as `filterBy.filterGroups`,
  replacing the old per-leaf reducer entirely — multiselect `array_contains`, unary
  `empty`/`is_null`, `time`, and HAVING-exclusion are all handled by the reused pipeline,
  not re-implemented here.
- The `ConditionValueInput` component (ComplexFilters' own leaf editor) now wraps its
  existing `siblingConditions` prop as `{op:'AND', groups: siblingConditions}` before
  passing it in. Its narrowing **scope is unchanged** — still only the immediate parent
  group's leaf siblings, same as before (see Design notes on why this wasn't widened).

**`TableHeaderCell.jsx`** — `ServerFilterControl` now builds its sibling tree via
`mergeTableFilters` → `pruneColumnFromFilterTree` → `restrictFilterTreeToSource` (in a
`useMemo`), replacing the interim `treeSiblings`/`tableFilterSiblings` stopgap and its
`topLevelOp === 'AND'` gate entirely — gating is no longer needed because the tree is
preserved and ANDed as a structural unit rather than flattened, so the section's root
op (AND or OR) no longer changes the correctness of narrowing (see Design notes).

## Design notes (deviations from the original plan)

- **Join-alias resolution (`applyTableAliasToJoin`) was not reused.** Replicating it
  correctly requires the same `sourceIdToTableAlias` map `buildUdaConfig` builds deep in
  its own context, and getting that wrong risks a *wrong* SQL reference (ambiguous or
  pointed at the wrong table) rather than just "no narrowing." Instead,
  `restrictFilterTreeToSource` drops any sibling leaf whose `source_id` doesn't match the
  column currently being explored — conservative (cross-join conditions still don't
  narrow), but safe. Finding 3 (join name-collision) is improved, not fully resolved:
  matching is now by exact `source_id`, not name-guessing, but cross-join narrowing
  itself remains future work if ever needed.
- **`isNormalFilter`/`fn` (HAVING/aggregate) leaves are excluded, not converted into real
  HAVING-based narrowing.** `resolveFilterGroupsForQuery` runs the same extraction the
  main query uses, then discards the extracted `having`/`normalFilters` arrays rather
  than forwarding them — sending real HAVING narrowing to an options/distinct-values
  query would need SELECT-list CASE-WHEN column injection (see `buildUdaConfig.js`'s "6.
  Build normal filter columns" step), which is a meaningfully bigger, separate change.
  Net effect: such a leaf no longer misrepresents itself as a plain WHERE condition
  (finding 2's original bug is gone), but it also doesn't narrow anything — a safe
  under-narrow instead of a wrong over/under-narrow.
- **`ComplexFilters`' own leaf editor keeps its original narrowing scope** (same-AND-group
  siblings only) rather than widening to whole-tree reuse like `TableHeaderCell` now
  does. Only its leaf-shape *handling* was fixed (via the shared pipeline); scope was
  deliberately left alone to avoid changing already-working, already-scoped behavior
  beyond what this task needed.
- **The `topLevelOp === 'AND'` gate was removed entirely**, not just relaxed. The interim
  stopgap needed it because it flattened individual leaves out of the tree (only valid
  under an all-AND assumption). `mergeTableFilters` instead preserves `state.filters`'
  own structure intact as one opaque AND-sibling — the resulting query is exactly "the
  main query's real filter, minus the explored column's own leaf," correct regardless of
  the tree's internal AND/OR structure. No gate needed.

## Testing checklist

- [x] Code-reviewed: `mapFilterGroupCols`/`extractNormalFiltersFromGroups`/
      `extractHavingFromFilterGroups` correctly handle multiselect `array_contains`,
      unary `empty`/`is_null`, `time`-op pass-through, and HAVING-leaf extraction —
      confirmed by reading their implementations (this is exactly what the main query
      already relies on them for).
- [x] Lint clean on all four changed files — no new errors/warnings introduced (only
      pre-existing, unrelated issues remain: `prop-types`, `no-undef process`, etc.).
- [x] No leftover references to removed variables (`treeSiblings`, `tableFilterSiblings`,
      `isGroupNode`, `topLevelOp`, `siblingFilterByKey`, `siblingFilterBy`) — verified via
      grep across all four files.
- [ ] **Needs live verification** — a column with both a `ComplexFilters`-authored
      condition and an active `tableFilters` entry: options for a third column reflect
      BOTH constraints (no dropped condition — this was Finding 1, now structurally
      impossible to drop since the tree isn't flattened).
- [ ] **Needs live verification** — a grouped section with an `isNormalFilter`/`fn` leaf:
      options for another column are unaffected by it (safe exclusion), not misapplied
      as a plain WHERE filter.
- [ ] **Needs live verification** — a joined section: a server filter dropdown for a base-
      source column is not narrowed by a joined-source sibling (expected — cross-join
      narrowing is out of scope per Design notes) and IS narrowed correctly by other
      base-source siblings.
- [ ] **Needs live verification** — `withCounts` (multiselect) and plain distinct-values
      paths both produce correct, matching narrowed option lists for the same filter state.
- [ ] **Needs live verification** — `ComplexFilters`' own leaf editor still narrows
      correctly by same-group siblings after the pipeline swap (regression check on
      existing, previously-working behavior).

## Follow-up (not in this task's scope)

- Join-alias reuse for cross-join sibling narrowing (see Design notes).
- Real HAVING-based narrowing for `isNormalFilter`/`fn` siblings (see Design notes).
- Widening `ComplexFilters`' own leaf editor to whole-tree narrowing (currently
  same-group-only) — would need the same `mergeTableFilters`-style "preserve structure"
  approach `TableHeaderCell` now uses, if ever wanted.
