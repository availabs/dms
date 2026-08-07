# Unify server filters into ComplexFilters via a `showInHeader` leaf toggle

**Status:** NOT STARTED (deferred — may break existing sections, needs migration)
**Topic:** patterns/page (filters / table)

## Objective

Replace the separate "server filter" mechanism (`ServerFilterControl` in
`ui/components/table/components/TableHeaderCell.jsx`, backed by the ephemeral
`state.tableFilters` array) with a toggle on a `ComplexFilters` leaf condition:
**"Show in header"**. When set (and the column is in visible columns), that
leaf's value editor renders in the table column header instead of (only) in
the filter editor. The admin places the leaf wherever they want in the
AND/OR tree, so there is no separate merge step and no ambiguity about which
group a header filter combines with — it's just a leaf that already lives in
the tree, and options-narrowing for it comes for free from the tree's
existing sibling logic.

## Why (current state has two independent filter systems)

Today there are two parallel filter representations that have to be
reconciled at query-build time:

- `state.filters` — the persisted, admin-authored AND/OR tree built by
  `ComplexFilters.jsx`.
- `state.tableFilters` — a flat, ephemeral, per-viewer array populated by
  `ServerFilterControl` (column-header search/select widgets), merged into
  the query in `getData.js` right before `buildUdaConfig` runs.

Problems this causes (see `filter-server-header-merge-and-options.md` for the
near-term mitigations landing now):

- The merge assumes the root group's `op`, so a section with `Match Any (OR)`
  as its root turns header filters into OR-alternatives instead of narrowing
  conditions — selecting a header filter can *widen* results.
- Options-narrowing for header filters only ever considers other header
  filters, never the `ComplexFilters` tree — so a condition set in the
  filter editor doesn't narrow a header dropdown's option list.
- Two independent leaf-shape/op-handling implementations (`ComplexFilters`'s
  own sibling narrowing vs. `ServerFilterControl`'s ad hoc `filterBy`
  builder) that can drift.

Collapsing to one tree removes all of this by construction: there's only one
place conditions live, one place siblings are computed, and the admin
explicitly controls grouping.

## Proposed design

1. **Leaf flag, not a new tree.** Add `showInHeader: true` to the leaf shape
   in `ComplexFilters.jsx` (toggle in the leaf's ellipsis popup, alongside
   `usePageFilters`/`isMulti`/etc.). Restrict the operation picker to the
   header-compatible ops when this is on (`filter`, `exclude`, `like` — the
   same set `ServerFilterControl` supports today via select/multiselect/text).
2. **Persisted position, per-viewer value.** The leaf's *existence and place
   in the tree* is admin-authored and persisted via `Save`, same as any other
   condition — start it with an empty `value`. The leaf's *value* at
   view/query time comes from a per-viewer runtime overlay, not from
   `state.filters` — mirroring how `usePageFilters` already overrides a
   leaf's value from an external live source (`usePageFilterSync.js`)
   without ever writing back to the saved tree. Key the overlay by column
   identity (`col` + `source_id`), not tree path/index — path/index keys go
   stale the moment the tree is reordered while a viewer's session holds an
   override.
3. **One header leaf per column.** Enforce (UI-level, e.g. disable the
   toggle) that at most one leaf per column may have `showInHeader: true`,
   so `TableHeaderCell` has an unambiguous single leaf to bind its widget to.
4. **Reuse, don't re-implement.** The header widget should render the same
   `ConditionValueInput`/`useColumnOptions` machinery `ComplexFilters` already
   uses for its own leaf editor, just mounted in `TableHeaderCell` and wired
   to write into the runtime overlay instead of `updateNodeAtPath`. Sibling
   narrowing then falls out of the existing `leafSiblings`/`parentOp` logic
   in `ComplexFilters.jsx` (`renderNode`) — no separate `filterBy` builder.
5. **Query-time resolution.** `getData.js` (or `buildUdaConfig`) resolves
   each `showInHeader` leaf's `value` from the runtime overlay before
   building the query — no more `state.tableFilters` splice/merge step.

## Breaking-change / migration surface

- Existing sections with `attribute.serverFilter: true` on a column have no
  equivalent leaf in `state.filters` — there is nothing to auto-convert
  from (the server filter was never a tree leaf). Migration means an admin
  re-authoring: add a leaf for that column with `showInHeader: true`.
- Any section currently relying on `tableFilters`' implicit "works on any
  visible column regardless of the filter tree" behavior needs a leaf added
  explicitly — this is a behavior change, not just a refactor, so audit
  live sections using `serverFilter` before removing `ServerFilterControl`.

## Files likely requiring changes

- `patterns/page/components/sections/ComplexFilters.jsx` — `showInHeader`
  toggle, op restriction, leaf UI.
- `patterns/page/components/sections/ComplexFilters.theme.js` — any new
  classes for the toggle row.
- `ui/components/table/components/TableHeaderCell.jsx` — replace
  `ServerFilterControl` with a component that finds the `showInHeader` leaf
  for `attribute` (by col identity) and renders the shared value-editor,
  writing to the runtime overlay.
- New: a small runtime-overlay store/hook (per dataWrapper instance, keyed by
  col+source_id) — likely lives alongside `usePageFilterSync.js` or in the
  same `dataWrapper` folder, since it's the same shape of problem.
- `patterns/page/components/sections/components/dataWrapper/getData.js` —
  remove the `state.tableFilters` merge block; resolve `showInHeader` leaf
  values from the overlay instead.
- `patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — wherever leaf values are read, resolve the overlay for `showInHeader`
  leaves (mirrors how `usePageFilters` values are already resolved/synced
  before this point today — confirm exact resolution point before coding).

## Testing checklist

- [ ] A `showInHeader` leaf inside a nested OR sub-group renders in the
      header and narrows correctly without affecting sibling branches.
- [ ] Root op `OR` with a `showInHeader` leaf at the root: verify the leaf
      still narrows (ANDs with) the rest of the tree as authored, not as an
      OR-alternative — this is the bug the current `tableFilters` merge has.
- [ ] Two viewers of the same page set different header values on the same
      `showInHeader` leaf concurrently — neither viewer affects the other,
      and neither write reaches the persisted `state.filters`.
- [ ] Options for a `showInHeader` leaf narrow using its real tree siblings
      (same AND group), matching what `ComplexFilters`'s own editor would
      show for that leaf.
- [ ] Reload / re-open the page: header value overlay resets (ephemeral),
      persisted tree unaffected.
- [ ] Admin attempts to mark a second leaf on an already-claimed column as
      `showInHeader` — UI prevents/disables it.
- [ ] Audit of live sections using `attribute.serverFilter` before ripping
      out `ServerFilterControl` — list them, migrate or explicitly accept
      loss of the header widget.

## Notes

Near-term (non-breaking) mitigations for the two biggest bugs in the current
`tableFilters` merge — the OR-root widening bug and header filters not being
narrowed by the `ComplexFilters` tree — are being implemented directly
(no task file, single-session fix) rather than deferred here. See the
`getData.js` two-group AND-wrap and the `TableHeaderCell.jsx` sibling
extension landing alongside this task file's creation.
