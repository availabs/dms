# Modal/create-form polish enrichments + input placeholder bug fix

**Status: BUILT + VERIFIED (2026-07-15)**
**Origin:** control-room Page-QA Add-ticket modal redesign (Alex: only title/severity/description,
bigger+darker labels, tighter/friendlier; then "modal doesn't close on add"; then "show the new
ticket without refreshing"). BC core changes fell out; all verified on throwaway published pages
(modal open → create → close → live table update → detail).

## 1. `group.modalSize` — sectionGroup.jsx

The view-mode modal card hardcoded `max-w-4xl`; a 3-field create form stretched across it reads
empty. New optional group key `modalSize: 'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'|'5xl'` resolved
through a literal whitelist map (Tailwind can't see interpolated classes), default `max-w-4xl`.
BC: absent key = old behavior.

## 2. `display.addItemLabel` — ui/components/Card.jsx

The allowAdddNew create button was hardcoded `add`. `{display?.addItemLabel || 'add'}` — the
control-room modal uses "Add ticket". BC.

## 3. `display.closeModalOnAdd` — ComponentRegistry/Card.jsx (+ Card.config.jsx control)

The modal never closed after a create ("no auto-close" gap, now user-reported). New display key
holding the group's `modalParamKey`: CardSection wraps `addItem`; on a **successful** create
(`res?.id`) it calls `clearActionParam(key)` → the modal group closes. A failed apiUpdate throws
past the clear, so the modal stays open with the form intact. No-op outside modals/edit mode.
Toolbar input "Close modal on add (param key)" shown under Allow Add New. BC.

## 4. `add_publish` provider + `data_refresh` subscriber — live cross-section refresh

"Get the ticket to show on the page right away without a refresh." New component-function pair
(component-actions system):

- **`add_publish` (Card provider, trigger `add`)**: after a successful create, publishes the new
  ROW ID to its `paramKey` (fresh value per create → consecutive adds re-trigger). Implemented in
  the same CardSection addItem wrapper as closeModalOnAdd.
- **`data_refresh` (subscriber, Card + Spreadsheet declarations)**: implemented ONCE in the shared
  `useDataLoader` — the subscribed action param's value is mixed into the fetchKey (the nowTick
  pattern) AND passed to getData as `refreshToken`, which injects a no-op `_r` key into the uda
  options JSON. The `_r` matters: falcor caches by path, so a same-path "refetch" would be served
  the stale pre-write rows with no network trip; a distinct options string is a distinct path.
  Server destructures known options keys and ignores `_r`. Inert while the param is unset;
  requires fetchMode smart/force (cache sections never fetch).

Control-room wiring (`build_cr_page.mjs`): modal Card publishes `tickets_v`; tickets table +
work-completed counters subscribe. A modal-created ticket appears in the table and bumps the
counters instantly, no reload.

## 5. ROOT-CAUSE FIX: getSources env drift (was a filed BUG) + server `row_type` attr

The refresh initially failed because refetches queried env `npmrdsv5+site_management__tickets` —
`getSources` (useDataSource.js) built env from `nameToSlug(display name)` and the runtime
source-list reconcile wrote that drifted env into section state (initial loads happen BEFORE the
reconcile and worked; anything AFTER silently resolved no source). Fix:

- **dms-server** (`uda.controller.js getSourceById`): new `row_type` attribute for isDms sources
  (`type AS row_type` — the row's type string; the plain `type` attr serves `data->>'type'`, the
  source KIND). Filtered out of the DAMA branch (no such column). ⚠ needs a server
  restart/redeploy — old servers return null and the client falls back to the old behavior.
- **client** (`useDataSource.js getSources`): fetch `row_type` for isDms envs; env =
  `${app}+${getInstance(row_type)}` (display-name slug only as legacy fallback); the returned
  source object's `type` = the instance slug (addItem composes the split data type from it).
- **client** (`onSourceChange`/`onJoinSourceChange`): prefer the isDms match's instance `type`
  over `nameToSlug(name)` — picking a source in the UI no longer bakes a drifted env/type into
  saved configs.

Also fixed here: `#` columns in the control-room builds widened 56→80px — the 7-digit row-id
fallback display clipped to a misleading 5 digits.

## 6. `defaultFn` — dynamic create-time column defaults (getData.js applyCreateDefaults)

"Do these tickets have an updated date? Can the logged-in user be the reporter?" `defaultValue`
was static-only; new per-column `defaultFn`: `'today'` (YYYY-MM-DD, the control-room format),
`'now'` (datetime), `'user'` (logged-in user's email — from CMSContext, threaded through
both addItems; skipped when anonymous so sync healing can still fill it). Fill-only-blank like
the other create defaults. Control-room modal: reporter=user, opened/updated=now — dates were
previously a cr_sync backfill (healing remains the backstop for CLI-created rows).
2026-07-16: `'now'` format changed from raw ISO to **`YYYY-MM-DD HH:MM:SS` (UTC)** before it had
any consumers — raw ISO (`T`/`Z`/ms) displays ugly in cells and string-sorts ABOVE space-format
datetimes from the control-room report-issue widget within the same day; the space format matches
the widget's rows exactly and sorts correctly against date-only values too.
NB: `updated` is stamped at CREATE only — later edits (e.g. the detail page's liveEdit status
pill) don't advance it; a `touchOnEdit` counterpart is a logged candidate enrichment. Partial
cousin already in core (added in a parallel session, dataWrapper `index.jsx` updateItem): per-column
**`setDateOnValue: {field, values}`** — live-editing the column to a value in `values` stamps
`field` with the datetime (same `YYYY-MM-DD HH:MM:SS` format), clears it otherwise (e.g. status
pill → `resolved_date`).

## 7. BUG: Input/Textarea primitives dropped `placeholder`

`ui/components/Input.jsx` (default Input + named Textarea) and `ui/components/Textarea.jsx`
destructured `placeholder` from props and **never applied it to the DOM element** — every
placeholder anywhere in the app was silently invisible (Card's own hardcoded
`'please enter value...'` included, for any column type routing through these primitives; the
column-level `placeholder` attr appeared to "not work" because of this). Fixed by passing
`placeholder={placeholder}` through on all three elements. BC (placeholders that were always
meant to show now show).

Note: per-column `placeholder` needed NO core change — Card's CompWrapper spreads
`{...attributeProps}` after its hardcoded placeholder, so a `placeholder` key on the column
config already wins; it was only invisible because of this bug.

## Docs

`skills/modal-section-group.md` updated: modalSize, form-polish knobs (placeholder/rows/
headerFontStyle/addItemLabel), "keep create forms short", and a row-id identity gotcha row
(link/filter by DMS row id, display-number fallback).

## Testing (2026-07-15)

- [x] Edit-mode inline band: labels (labelSM), placeholders on title/description, rows=4
      textarea, "Add ticket" button — all render (Playwright probe)
- [x] View mode (throwaway published page): modal opens at `max-w-xl`, 3 fields, create works
- [x] closeModalOnAdd (second throwaway publish): modal closes after add, re-opens with a
      cleared form, no console errors
- [x] add_publish + data_refresh (third throwaway publish): create via modal → modal closes →
      the new ticket row appears in the tickets table with NO navigation/reload; refetch hits
      env npmrdsv5+sitemgmt_tickets (post-fix) with the _r token; probe rows deleted (13)
- [x] Created row: autoNumber ticket_id 116, status Triage, source client, page_key pre-filled
- [x] defaultFn (probe #143): reporter availabs@gmail.com, opened/updated 2026-07-15 — all
      stamped at create; probe row deleted
- [x] Detail page resolves by row id for numbered (2192207→#116) AND un-numbered (2191744)
      tickets; no console errors
- [x] Throwaway page + probe ticket deleted

## Consumers

Control room builds `build_cr_page.mjs` (modal + header), `build_cr_tickets.mjs` (row-id links +
id filter leaf), `build_cr_design.mjs` (header) — see the transportny task
`cr-page-header-modal-redesign.md`. Joins the transportNY core-sync batch (Input.jsx,
Textarea.jsx, Card.jsx, sectionGroup.jsx).
