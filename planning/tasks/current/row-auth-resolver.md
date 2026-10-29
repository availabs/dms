# Row auth 1: one resolver and one pure check, for every surface

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). **Every other row-auth task depends on this one.** Informed by
[row-auth-chain-spike.md](./row-auth-chain-spike.md).

## Objective

The single decision function the hub requires — all reads and edits for dms, uda and sync go through
it. Two pieces, split by purity:

```
resolve(rows)            → merged auth per row    // the only part that touches a database
can(merged, user, verb)  → boolean                // pure
```

## What it implements

- The **five merge rules** and the **`self`/`descendants` scope** (flat = both), hub sections
  "The merge rules" and "Grants have a scope".
- The **five structural verbs**: `read`, `create`, `edit`, `delete`, `grant`.
- `otherwise` as the ceiling, including the **`public` clamp**.
- `*` expanded at **resolve** time, unable to escalate past an ancestor.
- **Cycle handling**: a `visited` set and depth cap 16; on a hit, resolve against the partial chain
  and log — never deny.
- **Ancestry is pluggable**: `parent_id` for `data_items`, the owning datasets pattern for external
  sources (which live in pgEnv databases and have no parentage). Merge and check stay universal.

## Done when

- `mergeAuth.js` sits beside `routes/dms/auth.js` with the hub's **case tables** as its tests —
  the merge cases, three-level inheritance, flat-by-default, and the `*` cases. Working versions of
  all four are in `scratchpad/auth-as-data/` (gitignored; port them, do not re-derive).
- No caller yet. This task changes no behaviour.


## Progress (2026-10-27)

**Pure half built.** `src/routes/dms/mergeAuth.js` — `mergeAuthChain`, `mergeAuthLevel`, `can`,
`isUnstated`, and `VERBS` (the five, frozen). No database, no type knowledge, no I/O.

`tests/test-merge-auth.js` — **32 cases, all passing**: the five merge rules, `otherwise` and the
`public` clamp, scope (flat vs `self`/`descendants`, three levels deep, mid-chain narrowing), the
chat post-vs-administer and author-owns-message cases, `*` semantics including non-escalation,
pattern verbs riding along without conferring structural access, and anonymous callers.

**One semantic decision was forced** and is recorded in the hub under "Decision made during
implementation" — an ancestor's `otherwise` binds only principals the child does not name. Needs
owner confirmation.

**Ancestry half built.** `src/routes/dms/rowAuth.js` — `createResolver({ loadByIds, loadContainers })`
giving `resolve(rows)`, `resolveForCreate(parentRow)`, plus `authOf`, `parentIdOf`, `identityOf`.
Loaders are injected, so the module touches no adapter and sync can hand it rows it already has.

`tests/test-row-auth.js` — **20 cases, all passing**: the three `data.parent` encodings, the
`parent_id` column winning, the parent_id → type-path sequence, a dangling id falling through to the
type path, cycle truncation, create-resolves-against-the-parent, and batching.

**Verified against production** (read-only, `mitigat-ny-prod`). A real chain:

```
2708442:component → 2542463:page → 2542448:page → 2546036:pattern → 566430:site
```

`parent_id` for the within-pattern hops, then the type path to pattern and site — exactly the
sequence the spike said was needed, and neither source alone produces it.

**Two implementation findings:**

1. **`resolve()` is breadth-first, batched per depth level.** Walking row by row cost ~2ms/row — fine
   for a Falcor read, far too slow for a sync bootstrap. Batched, the cost is ~depth queries
   regardless of how many rows are asked about, which is what lets one function serve both.
2. **Callers must pass PROJECTED rows** (`id, type, parent_id, auth`). Selecting `data` as well
   exhausted the V8 heap at 20,000 rows — production rows average ~10KB of jsonb. Documented as a
   contract at the top of the module. Measured on a 33,764-row migrated clone: 500 rows 151ms/4
   queries/16MB; 5,000 rows 260ms/3 queries/79MB; 33,764 rows 942ms/2 queries/411MB. Above ~30k the
   **heap** is the limit, not time — chunk, or fall back to the recursive CTE the spike measured at
   521ms for 50k.

**One semantic decision was forced** and is recorded in the hub under "Decision made during
implementation" — an ancestor's `otherwise` binds only principals the child does not name. Needs
owner confirmation.
