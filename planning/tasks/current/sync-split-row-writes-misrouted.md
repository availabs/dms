# Sync-on dataset-row writes land in the main table

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** review — one live sync-on ticket filing, then rebuild/deploy the sync-on domain · **Created by:** rdubowsky@albany.edu · **Edited by:** —

## Objective

With `VITE_DMS_SYNC=1`, a create of a dataset row (a split `:data` type) is written to the app's
**main** `data_items` table instead of the dataset's split table, so nothing that reads the dataset
ever sees it. Make dataset-row writes take the same Falcor path a sync-off build uses.

## How it was found (2026-10-15)

A QA demo on MitigateNY: two tickets filed with sync on (one from devmny.org, one from localhost)
never showed in the install's Tickets tab. One filed from a sync-off localhost build did.

Read-only queries on the prod DB (`dms_mitigat_ny_prod`) found both sync-on tickets in the main
table under type `qa_tickets|2860549:data`, and the sync-off one in
`data_items__s2860548_v2860549_qa_tickets`:

| id | where | ticket | title |
|---|---|---|---|
| 2865892 | main table | #102 | `[test] Another test` (devmny.org) |
| 2865902 | main table | #102 | `[test] local sync file ticket` (localhost, sync on) |
| 2865904 | split table | #102 | `[test] NO SYNC local ticket` (localhost, sync off) |

All three are #102 because `autoNumber` reads the max over the split table (`getData.js:190`),
which the misfiled rows never joined. The sync-on tickets also have no `qa_history` rows; the
sync-off one has two (2865905/6), written by the controller's change-history step.

The same bug misfiled two `lhmp_ia|1441681:data` rows (2727827 `Test123`, 2727828) on 2026-10-01.
2727828 was re-entered as 2727921 in the split table 11 minutes later. **All four orphans are
left in place on purpose:** they are test or duplicate rows, and nothing reads them.

## Root cause

1. `dmsDataEditor` (`api/index.js`) treated every create as sync-eligible
   (`!id && attributeKeys.length > 0`), whatever the type, so dataset-row creates went to
   `sync.localCreate` → `POST /sync/push`.
2. `/sync/push` (`dms-server/src/routes/sync/sync.js`) always writes `mainTable(item.app)`, which
   resolves with an empty type, so it never reaches a split table. It also skips the
   controller's change-history write.
3. Updates fared worse (from reading the code, not reproduced): the editor awaits
   `bootstrapPattern(type)` for an unscoped type, which always `addToScope`s it, so the update
   then goes through `localUpdate` → `/sync/push` → an `UPDATE` on the main table that matches
   nothing → 404, which the client drops as permanent. A delete matches nothing and reports
   success.

## What sync gave dataset rows before this change

Nothing that worked, which is why the change below removes no function:

- Reads: bootstrap and delta exclude `:data` (`sync.js` `isSyncExcluded`), the client purges any
  local split rows at startup (`purgeLocalSplitRows`), and dataset views read through UDA.
- Writes: the create, the offline queue and the echo suppression all served a write that
  landed in the wrong table.
- The receive side doesn't deliver another user's dataset edit either. A tab subscribed to a
  dataset's channel does invalidate and refetch on a `change` message (`sync-manager.js`
  `ws.onmessage`), but no visible write produces one: a Falcor (sync-off) write is logged and
  **not broadcast**, because `dms.route.js:13` builds its own controller while `index.js:411` wires
  `setNotifyChange` onto `defaultController` (open: todo.md "Falcor writes are never
  live-broadcast"); a sync-on create is broadcast but is the misfiled row; a sync-on update 404s.
  Live refresh of dataset views for other users depends on that broadcast fix, not on this one.

## Change

`dmsDataEditor`: `isSyncEligible` is false for a split type, so the write falls through to the
existing Falcor create/edit/delete. The `await bootstrapPattern(type)` ahead of it is left as it
was. It is what subscribes the tab to that dataset's WebSocket channel, so leaving it keeps which
tabs hear about which datasets exactly as before.

Not changed: `/sync/push` still writes split types to the main table if an old client sends one.
A deployed build keeps misfiling until it is rebuilt with this change.

## Files

- [x] `packages/dms/src/api/index.js` — `isSplitType` guard on `isSyncEligible`
- [x] `packages/dms/tests/syncSplitRowWrites.test.js` — new
- [x] `packages/dms/src/sync/CLAUDE.md` — `dmsDataEditor` integration note

## Testing checklist

- [x] Unit: a split-type create/update/delete goes to Falcor, not `localCreate`/`localUpdate`/`localDelete`
- [x] Unit: a split-type update still awaits `bootstrapPattern` (subscription kept)
- [x] Unit: a non-split create and update still go through `localCreate`/`localUpdate` (regression guard)
- [x] Red check: with the guard removed, the 3 dataset-row tests fail and the 2 regression guards pass (2026-10-15)
- [ ] Live: with `VITE_DMS_SYNC=1`, file a ticket from Report an issue and see it on `/qa/tickets`

`syncDeltaConvergence.test.js` has 2 failures ("catchUp with a backlog too large to apply") that are
already there without this change (same 2 failed / 5 passed with `api/index.js` stashed); that file
never imports `api/index.js`.
