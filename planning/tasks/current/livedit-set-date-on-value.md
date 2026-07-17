# liveEdit `setDateOnValue` — stamp a companion date field when a column is set to a value

**Status:** IN PROGRESS (2026-07-15)
**Topic:** patterns/page (dataWrapper liveEdit) + ui (editable columns)
**Origin (Alex, 2026-07-15):** On the Control Room ticket page, changing a ticket's status to
`Resolved` or `Closed` should record *when* it was resolved (stamp `resolved_date`), at the moment
of the change. Clear it if the ticket is reopened.

## Objective

A backward-compatible, config-driven enrichment to the liveEdit save path so an **editable column**
can stamp a **companion field** with the current datetime when it is edited to one of a configured
set of values (and clear it otherwise). Reusable for any "flip a status → record a date" pattern.

## Design

New optional per-column config:

```js
attribute.setDateOnValue = { field: "resolved_date", values: ["Resolved", "Closed"] }
```

Semantics (liveEdit only): when the column is live-edited to `value`,
- if `values.includes(value)` → also write `{ [field]: <now> }` (now = `YYYY-MM-DD HH:MM:SS`)
- else → also write `{ [field]: "" }` (clear)

Opt-in: absent config ⇒ identical behavior to today (BC).

## Implementation

- **`patterns/page/components/sections/components/dataWrapper/index.jsx`** — `updateItem`, the
  single-field (`attribute?.name`) branch (~line 342-354). Compute `stamp` from
  `attribute.setDateOnValue`, and spread it into BOTH the optimistic `setState` and the
  `apiUpdate` payload. `new Date()` is fine here (browser runtime component).
- **`src/themes/transportny/qa_skills/tools/builds/build_cr_tickets.mjs`** — ticket-detail
  Details rail: add `setDateOnValue: { field: "resolved_date", values: ["Resolved","Closed"] }`
  to the editable status pill (`pcol("status", ... allowEditInView: true)`). `resolved_date` is
  already shown in the rail.
- **Schema** — ensure `resolved_date` (text) exists on `sitemgmt_tickets` (source 2184923).

## Testing checklist

- [ ] Change a ticket's status to Resolved on `/sitemgmt/ticket?id=` → `resolved_date` stamps with
      a datetime; verify via CLI read.
- [ ] Change status back to an open value → `resolved_date` clears.
- [ ] A liveEdit on a column WITHOUT `setDateOnValue` behaves exactly as before (BC).
