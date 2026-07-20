# allowAdddNew form-card fixes — editable:false honor + page-param re-sync

> **Status:** ✅ BUILT + VERIFIED (2026-07-07). Two small BC changes, surfaced by the control-room
> Page-QA "Add ticket" modal (task `planning/transportny/tasks/current/qa-page-add-ticket-modal.md`,
> skill `skills/modal-section-group.md`).

## 1. `Card.jsx` — CompWrapper honors `editable: false`

New-item/edit mode put EVERY non-static data column into edit mode; a column explicitly marked
`editable: false` (already excluded from save payloads by dataWrapper's `editableColumns`) still
rendered pointless edit chrome (the `border` outline + an edit comp). Now
`attribute.editable !== false` gates `editMode`, so e.g. a pre-filled read-only field on an
add-row form (the modal's target-page chip) renders its ViewComp cleanly. BC: only affects
columns that explicitly set `editable: false` — which previously got dead edit chrome.

## 2. `dataWrapper/index.jsx` — usePageParams re-sync after `addItem()` (both blocks)

The "Sync newItem from page params" effects didn't depend on `newItem`; `addItem()` ends with
`setNewItem({})`, so the SECOND row added in one session silently lost the pre-filled
page-param fields (e.g. `page_key`). Fix: `newItem` added to deps with an equality guard
(only set when a synced value actually differs) so the effect refills after a clear without
looping. Verified: two consecutive modal adds both carried `page_key`.

## Verify

Published test page (throwaway, deleted): add-ticket modal — read-only target chip (no edit
border), two consecutive adds both saved `page_key: tsmo2:home`.

**Sync both files to transportNY** with the pending core batch.
