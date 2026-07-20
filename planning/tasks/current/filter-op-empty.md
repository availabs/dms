# Filter system: `empty` / `notempty` operation (is-null / has-a-value)

**Status:** NOT STARTED
**Topic:** patterns/page (filters) + dms-server (UDA)
**Driver:** MNY Action Prioritize Phase 3 #4.

## Objective

Add a filter operation that matches rows where a column **has no value**
(`col IS NULL OR col = ''`) and its inverse (**has a value**). Enables the Action Prioritize
"Needs priority" toggle (`county_priority` empty) and the progress-lede "N to go" deep-link. No
existing op (`filter`, `like`, `exclude`, comparison ops) can express emptiness.

## Change (additive, opt-in, BC)

Add op **`empty`** (and **`notempty`**) end-to-end:

1. **Leaf editor** — `.../sections/ComplexFilters.jsx`: add `empty` / `notempty` to the operation
   picker. These ops take **no value input** (like a unary op) — render no value field (or a disabled
   one). Follow how `exclude`/`like` are presented.
2. **Client query builder** — `.../dataWrapper/.../buildUdaConfig.js` (and any `mapFilterGroupCols`
   / filter-serialisation it calls): translate an `empty` leaf into the UDA filter representation the
   server understands for is-null-or-blank; `notempty` = its negation. A leaf with op `empty` must be
   emitted even though its `value` is empty (unlike `filter`/`like`, which drop when value is blank —
   do NOT let the empty-value drop-out logic discard an `empty` leaf).
3. **Server UDA** — the dms-server UDA SQL builder (in `src/dms/packages/dms-server/.../uda/`): render
   `empty` → `("<col>" IS NULL OR "<col>" = '')` and `notempty` → `NOT (... )` /
   `("<col>" IS NOT NULL AND "<col>" <> '')`. Match the existing op-to-SQL switch; quote/qualify the
   column exactly as the sibling ops do (incl. the `ds.`-alias-under-join case).

## Investigate before coding

- Where ops are enumerated for the editor UI (grep `ComplexFilters.jsx` for `like`, `exclude`,
  `'filter'`, operation lists).
- Where the client maps a leaf's op → the request (grep `buildUdaConfig.js` and utils for `op`,
  `operation`, `exclude`, `like`; note the empty-value drop-out at the leaf level and exempt `empty`).
- The server op→SQL switch (grep dms-server uda for `ILIKE`/`LIKE`/`exclude`/`IN`); add the two cases.
- Confirm whether the op token is named `op` or `operation` at each layer and keep it consistent.

## Backward compatibility

Two new op values; every existing op untouched. A section only behaves differently if an author adds
an `empty`/`notempty` leaf.

## Testing checklist

- [ ] A data section with an `empty` leaf on `county_priority` returns only rows where it is null/blank.
- [ ] `notempty` returns the complement. Combines correctly under an AND/OR group with other leaves.
- [ ] The `empty` leaf is NOT dropped for having a blank value.
- [ ] Editor shows the new ops and hides the value field for them.
- [ ] Existing filters unaffected. Lint passes (client). Server change is SQL-only, no API shape change.

## Verification note for the orchestrator

The server change needs a dms-server running the new code. Do NOT restart the user's server on
:3001. The orchestrator will run a second dms-server instance on another port (same DB env
`dms-mercury-3`) and point a dev frontend at it to verify. The subagent should implement + reason
about the SQL; it does not need to run a server.

## Notes

Consuming page: dms-template 2262755. Wiring the "Needs priority" toggle (a Filter leaf) + the
"to go" deep-link is the orchestrator's job. Do not edit the page or publish here.
