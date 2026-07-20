# dataWrapper: pivot + join fixes (join threading + qualified-column double-prefix)

**Library sub-task of** `planning/transportny/tasks/current/build-route-comparison-page.md`
(Task 1.4 spike). Two general dataWrapper bugs surfaced the first time **pivot** was combined with
a **join** (a pgFederated CH↔PG join, but the bugs are join-generic). Both fixes applied to the
working tree; **need committing** (user owns git). BC.

## Fix 1 — pivot distinct-values fetch drops the join
`…/dataWrapper/usePivotDistinctValues.js` built its distinct-values `getData` call with a
hardcoded `join: {}`, so with a join present the fetch referenced join aliases (`ds.`/`rt.`, from
the filters and the alias-qualified pivot column) with no join FROM → CH `Database <alias> does
not exist`. **Fix:** pass `join: state.join || {}` (the main data query already threads the join
via `builderInput` in `getData.js`). Only affected joined pivots (single-source pivots sent
`{}` correctly, so BC). *(Consider also adding `join` to `computePivotFetchKey` so a join change
re-fetches distinct values — not required for correctness of a static join.)*

## Fix 2 — buildUdaConfig double-prefixes already-qualified plain columns under a join
`…/dataWrapper/buildUdaConfig.js` (the `sourceColumns` map ~:1250 and the `columns` map ~:1291)
prefixes a plain (non-calc) column with its table alias: `` `${alias}.${col.name}` ``. A column
with no `source_id` defaults to the base alias `ds`, so a **pre-qualified** name like
`rt.route_id` / `ds.travel_time` became `ds.rt.route_id` / `ds.ds.travel_time` → CH "Identifier
… cannot be resolved". Never hit before because real joined sections use **calc** columns (which
skip this branch); the pivot's `rowColumn`/`valueColumn` are the first plain qualified columns
through it. **Fix:** skip re-prefixing when `col.name.includes('.')` (already alias-qualified) at
both sites. Matches the documented "write joined columns alias-prefixed" contract
(`live-cross-view-joined-section.md`). BC — only changes the previously-broken qualified-plain
case; bare-name+source_id columns still prefix; calc columns unaffected.

## Verify / regression
- VERIFIED: joined pgFederated pivot renders real route×year data (Task 1.4 / route-comparison
  FINDINGS.md).
- Regression check before commit: a normal joined section (e.g. the TSMO corridor grid, CH
  982⋈983 calc columns) still renders — calc columns skip the changed branch, so expected clean.
  Spot-check a joined Card/Spreadsheet in `/edit`.

## Status
- [x] Both fixes applied to working tree (2026-07-17). [ ] Committed (user). [ ] Regression spot-check.
