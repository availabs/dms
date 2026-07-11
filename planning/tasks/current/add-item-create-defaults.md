# addItem create-time defaults — `autoNumber` + `defaultValue` column attrs

**Status: BUILT + E2E-VERIFIED (2026-07-09) — pending human publish of /sitemgmt/page + transportNY core sync**
**Origin:** user report — tickets created via the Page-QA add-ticket modal get no `ticket_id`
until the next `cr_sync` heal, so the ticket-detail link (`/sitemgmt/ticket?id=`) is broken
right after creation.

## Objective

Let an add-new form Card fill derived fields at create instead of waiting for a sync heal:

- `defaultValue` — static fill for a blank field (`status: "Triage"`).
- `autoNumber` (+ `autoNumberStart`) — next sequential number across the WHOLE source:
  `max+1`, floored by `autoNumberStart - 1` (tickets: start 101 → identical rule to
  `cr_sync`'s `max(100, …) + 1` healing).

## Implementation

`applyCreateDefaults({columns, newItem, apiLoad, externalSource})` in `dataWrapper/getData.js` —
walks the columns; for each attr-bearing column whose `newItem` field is blank, fills it. The
autoNumber max is fetched through the SAME `apiLoad`/uda path the section reads
(`action: "uda"`, `options: "{}"` — deliberately ignoring the section's filters, since add-new
form Cards carry a never-match filter). The SQL is regexp-hardened
(`max(nullif(regexp_replace(col,'[^0-9]','','g'),'')::bigint)`) so non-numeric stored values are
ignored rather than fatal. On fetch failure the create proceeds without the number — sync
healing remains the backstop.

**Called from BOTH addItem implementations** — `dataWrapper/index.jsx` has separate edit-wrapper
(~line 380) and view-wrapper (~line 623, useCallback) addItems; the first cut patched only the
edit one and the e2e (edit-page inline band) still went through the view wrapper's.

### Discovered platform bug: source-list env drift (worked around here)

The first working run assigned #101 (the floor) instead of #111: the fetch used
`externalSource.env`, but a runtime source-list reconcile (`useDataSource` `getSources`,
useDataSource.js:32-34) re-derives each source's `env` as `${app}+${nameToSlug(display name)}`
("Site Management — Tickets" → `npmrdsv5+site_management__tickets`), which drifts from the real
instance (`npmrdsv5+sitemgmt_tickets`) whenever display name ≠ instance slug — the uda route
then resolves no source and aggregates return null. `applyCreateDefaults` therefore builds
`env = ${app}+${type}` itself (type IS the instance for DMS sources). The underlying getSources
derivation is a latent bug for ANY refetch after reconcile on such sources — filed separately
in todo.md.

BC: both attrs are opt-in; no existing column config carries them. Blank-only fill means an
author-typed value always wins. Known limit: two simultaneous creators can collide (no server
sequence) — acceptable for the control room; noted in modal-section-group.md.

## Consumers

- Page-QA add-ticket modal (`build_cr_page.mjs`): `ticket_id` (autoNumber, start 101) + `status`
  (defaultValue "Triage") as selectOnly columns — no form fields render; modal caption updated
  to "id assigned on create". `cr_sync` hygiene still stamps `opened`/`updated` (dynamic dates).

## Files

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/index.jsx` (addItem)
- `src/dms/skills/modal-section-group.md` (gotcha table row rewritten)
- `src/themes/transportny/qa_skills/tools/builds/build_cr_page.mjs` (modal columns; owning build re-run)

## Sync

Joins the pending transportNY core-sync batch (dataWrapper is already in it for the
usePageParams re-sync fix).

## Testing (2026-07-09)

- [x] e2e (Playwright, edit-page inline band): create ticket with only a title → row landed with
      ticket_id "111" + status "Triage" + page_key prefilled ("tsmo2:home"); network capture
      confirmed the max query (`…dataByIndex 0 max(…) as _autonum` → "110") against
      `npmrdsv5+sitemgmt_tickets`; probe rows deleted after
- [x] user's original modal ticket (#110, row 2188766) opens at /sitemgmt/ticket?id=110 —
      renders "#110 Layer Controls error" (healed by earlier sync; only pre-existing minor
      mobile-overflow finding)
- [x] author-typed value wins (blank-only fill — code path: `data[c.name] != null && !== ''`
      short-circuits before defaults)

## Publish note

The section-config half (modal's ticket_id/status columns) lives in the DRAFT of /sitemgmt/page
(2185886, rebuilt by build_cr_page.mjs). View-mode creates keep the old behavior until the page
is published (human). The core addItem/applyCreateDefaults half ships with the bundle either way.
