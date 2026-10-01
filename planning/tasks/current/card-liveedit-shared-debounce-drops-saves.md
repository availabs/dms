# Card liveEdit: one shared save timer per section drops quick edits

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Logged 2026-09-30, found while planning phase 2 of [`qa-pattern-type.md`](./qa-pattern-type.md).

**Built 2026-10-01 (uncommitted)** as option (b) of that task's status-change writes (owner approved; the TransportNY
effects are fixes). Per-row pending saves + flush on unmount (`dataWrapper/utils/liveEditSaves.js`
`createPendingSaves`, View `updateItem`), and `setDateOnValue` now runs on live pages. Live-verified on `qa_test`:
two picks 334 ms apart → one merged save, both kept; the committed code dropped the first (reproduced). Pick then
navigate inside the window: the committed code sent nothing, the new code saves at unmount. Details, tests and the
pre-push TransportNY checks: `qa-pattern-type.md`, "The status-change writes". Move to completed once committed.

## Objective

Two live edits in one Card section within half a second should both be saved. Today only the last one is.

## The bug

- **What a user sees.** In a Card section with live editing (e.g. a status pill), change one cell, then another cell
  in the same section within 500 ms. Both show the new value. After a reload the first change is gone.
- **Where.** View mode's `updateItem`, the live-edit branch (`attribute?.name`), in
  `patterns/page/components/sections/components/dataWrapper/index.jsx:609-633`:
  - the optimistic `setState` applies the edit at once;
  - the save is deferred: `clearTimeout(liveEditTimerRef.current)`, then
    `liveEditTimerRef.current = setTimeout(() => apiUpdate(...), 500)` (628-631);
  - `liveEditTimerRef` is one ref for the whole section, so each new edit cancels the previous edit's pending save;
  - the payload is built from the caller's `d` alone (`{id, [attribute.name]: newValue}`), so the surviving save
    carries only the last edit's row and field.
- **Scope.** The only caller of that branch is Card's live edit (`ui/components/Card.jsx:339-344`; a repo-wide grep
  of `updateItem(` finds no other caller passing a column). Spreadsheet cells are unaffected: `TableCell.jsx:343-356`
  debounces per cell and calls `updateItem(undefined, undefined, newItem)`, the immediate bulk branch.
- **Who's exposed.** Any Card with live editing. TransportNY's control-room ticket rail and page QA pills are examples:
  changing status and then priority within half a second loses the status.

## Related finding: `setDateOnValue` doesn't run in view mode

- [`livedit-set-date-on-value.md`](./livedit-set-date-on-value.md) (2026-07-15, marked done) added the option to
  the section **Edit** component's `updateItem` (`dataWrapper/index.jsx:352-356`, inside `Edit` 204-464). The View
  component's `updateItem` never reads it, so a status change on a published page never stamps the date. That task's
  live checklist is unticked.
- `src/themes/transportny/qa_skills/qa-process.md` ("Resolved vs Closed") says the UI stamps `resolved_date`; on
  view pages it doesn't. TransportNY's CLI path stamps it itself (fixed 2026-09-22).
- Same function, same owner decision: logged here, not fixed.

## Proposed fix (when scheduled)

- Keep pending live-edit saves per row (a ref map keyed by row id), merging fields edited on the same row, and send
  each row's merged patch when its own timer fires. Flush pending saves on unmount.
- Optionally honour `setDateOnValue` in the same branch, as the July task intended.
- Both change TransportNY's live Card pages (saves no longer dropped; status flips start stamping `resolved_date`).
  Owner call before scheduling.

## Testing checklist

- [x] Unit: two live edits on different rows within 500 ms → two saves; two fields on one row → one merged save (`tests/liveEditSaves.test.js`).
- [x] Live: a Card with two live-edit pills, flip both quickly, reload, both persisted (QA Ticket rail, row 150).
- [ ] A Card without live edit, and Spreadsheet cell edits, behave as before.
