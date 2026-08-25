# Modal section groups — button-triggered modals with an add-row form

How to put a section group in a MODAL, open it from a button on the page, and use it to create
rows in an internal dataset with fields pre-populated from the page's context. Everything here is
existing core behavior — no custom components. Worked example: the control room's Page QA
"Add ticket" modal (`scratchpad/npmrdsv5-dev2/build_cr_page.mjs`, page 2185886).

> **TL;DR** — a group with `isModal: true` + `modalParamKey: '<key>'` renders as a modal overlay
> in VIEW mode, opened by an **action param** with that key. Publish the param from a Card
> `click_publish` provider on a static button cell; close via the built-in overlay/✕
> (`clearActionParam`). Put an `allowAdddNew` Card inside the group as the create form; columns
> with `usePageParams + pageParamKey` pre-fill from the page's filters.

## 1. The modal group

A `draft_section_groups` entry (same shape as any band) plus two keys:

```js
{ name: "<uuid>", index: 9, theme: "content", position: "content",
  displayName: "Add-ticket modal", isModal: true, modalParamKey: "addticket", modalSize: "xl" }
```

`sectionGroup.jsx` behavior:
- **View mode**: renders `null` while closed; when open, renders a fixed overlay
  (`bg-black/50`) with a white card containing the group's sections. `modalSize`
  (sm…5xl, whitelist map; default `4xl`) picks the card's max-width — a short create form
  reads better at `xl` than stretched across `4xl`. Overlay click
  and the ✕ button call `clearActionParam(modalParamKey)`.
- **Edit mode** (`/edit/...`): `isModal` is ignored — the group renders as a normal inline band,
  which is how authors reach and edit the modal's sections.
- ⚠ **The view-mode modal renders `item.sections` — the PUBLISHED sections.** On a draft-only
  page you cannot see the modal behave; verify on a published page (a throwaway page works).

## 2. Opening — action params, not URL params

Open state = `pageState.filters` contains `{ searchKey: modalParamKey, type: 'action' }` with a
value. Action params are **in-memory only** (`component-actions.md`): they are set by component
*providers* via `setActionParam`, never by URL search params — a link with `?addticket=1` will
NOT open the modal, and the modal state doesn't survive reload.

**The trigger button** is a Card cell with the `click_publish` provider. It works on `static`
cells (publishes `staticValue` — `ui/components/Card.jsx` static branch), so a link-free themed
button cell is enough:

```js
// a Card section (e.g. the card header) — element-data fragment
{
  columns: [
    // ...other header cells...
    { name: "add_ticket", origin: "static", staticValue: "+ Add ticket",
      valueFontStyle: "btnPrimary", show: true, hideHeader: true, justify: "right" },
  ],
  display: {
    // provider config lives under display._functions
    _functions: { providers: [{
      functionId: "click_publish", enabled: true,
      paramKey: "addticket",              // must equal the group's modalParamKey
      args: { column: "add_ticket" },     // the cell whose click publishes
    }] },
  },
}
```

Authors can also wire this from the section menu ("Actions" → Click: Publish Column).

## 3. The add-row form — an `allowAdddNew` Card inside the group

A Card with `display.allowAdddNew: true` appends a **new-item form card** after its data rows
(`ui/components/Card.jsx` maps `[...data, newItem]`) with an **add** button that calls
`addItem()` → `apiUpdate` (dms.data.create on the split type) → `setNewItem({})`.

- **Show ONLY the form** (no existing rows listed in the modal): give the section a never-match
  filter, e.g. `{ col: "ticket_id", op: "filter", value: ["__none__"] }`. Empty result sets
  render cleanly.
- **Editable inputs**: ⚠ every form column MUST carry an explicit `type` (`"text"`,
  `"textarea"`, `"select"` + `options`, …). The edit component is resolved by
  `ColumnTypes[attribute.type]` — a column WITHOUT `type` falls to `DefaultComp` (a plain
  value div) even in new-item edit mode, and renders as an empty non-editable box.
- **`addNewBehaviour`**: `'append'` pushes the created row into the section's local data;
  `'navigate'` + `navigateUrlOnAdd` jumps to `<baseUrl><navigateUrlOnAdd><newId>`. Default: stays
  put with a cleared form.
- **`display.closeModalOnAdd: '<paramKey>'`** (2026-07-15): after a **successful** create the
  Card section clears that action param — set it to the group's `modalParamKey` and the modal
  closes on add (form already cleared for the next open). A failed create leaves the modal open
  with the form intact. Toolbar: "Close modal on add (param key)" under Allow Add New. Like the
  trigger's `paramKey`, the author names the key explicitly — the Card doesn't know its group.
- **Live refresh — `add_publish` provider + `data_refresh` subscriber** (2026-07-15): to make
  the created row appear in the page's other sections WITHOUT a reload, give the form Card
  `_functions.providers: [{ functionId: 'add_publish', enabled: true, paramKey: '<key>' }]`
  (publishes the new ROW ID on each successful create) and give every section that should
  update (tables, one-row counter Cards) `_functions.subscribers: [{ functionId:
  'data_refresh', enabled: true, paramKey: '<key>' }]`. The subscriber lives in the shared
  dataWrapper loader, so it works for any data section type with fetchMode smart/force.
  Section-menu Actions: "Add: Publish Created Row" / "Refetch Data on Param Change".
- **Form polish knobs** (all per-column / per-display, 2026-07-15):
  - `placeholder` on a text/textarea column → the input's placeholder (Card spreads column
    attrs after its hardcoded `'please enter value...'`, so the column key wins).
  - `rows` on a textarea column → textarea height.
  - `headerFontStyle` styles the field label like any Card header (e.g. a proper-case
    `labelSM` reads friendlier than mono micro-caps on a form).
  - `display.addItemLabel` renames the create button (default `add`).
- **Keep create forms SHORT.** Ask only what the reporter actually knows (the control-room
  ticket modal: title · severity · description); everything triage/deriving can fill later
  goes in as `selectOnly` create defaults or heals via the dataset's sync script.

## 4. Pre-population from the page — `usePageParams`

Columns opt into syncing the new item from the page's filter state
(`dataWrapper/index.jsx` "Sync newItem from page params"):

```js
{ name: "page_key", usePageParams: true, pageParamKey: "key",   // page filter searchKey
  show: true, /* render read-only-ish or hidden as desired */ }
```

Whenever the page filter with `searchKey: "key"` has a value (e.g. the QA page's `?key=` URL
param), `newItem.page_key` is set to it. Works for any page filter, URL-synced or action.

## 5. Build recipe (CLI seed script)

```js
// 1. group (raw update draft_section_groups): add the isModal group (index after real bands)
// 2. trigger: a Card section in a normal band with the static button cell + click_publish
// 3. form: a Card section in the modal group:
sec(MODAL_GROUP, "12", "Card", JSON.stringify({
  externalSource: TICKETS_SRC,
  columns: [
    { name: "page_key", customName: "target page", show: true, usePageParams: true, pageParamKey: "key", editable: false },
    { name: "title", customName: "title", show: true },
    { name: "severity", customName: "severity", show: true, type: "select",
      options: ["Blocker","Major","Minor","Polish"].map(v => ({ label: v, value: v })) },
    // ...priority/status/source selects, assignee, description/steps/expected/actual...
  ],
  filters: { op: "AND", groups: [{ col: "ticket_id", op: "filter", value: ["__none__"] }] },
  display: { usePagination: false, pageSize: 1, fetchMode: "smart", allowAdddNew: true, cardBorder: false },
  data: [], join: { sources: {} },
}))
```

## 6. A modal that is NOT a create form — the search-dialog variant

Nothing in §1–2 is form-specific: the group's sections can be anything. Worked example, verified in
view mode 2026-08-19 — NPMRDS Reports (`npmrdsv5+npmrds_sub`, page **2188366**,
`build_npmrds_reports.mjs`), a **find-a-report dialog** at `modalSize: '4xl'` holding three ordinary
sections:

1. a **`Filter`** with `operation: 'like'` + `searchParamKey: 'search'` (the search box —
   `full-text-search-filter.md`);
2. a **Card** result list carrying the matching `OR` group of `like` leaves, `pageSize: 8`,
   `usePagination: false`;
3. a **Card** foot whose bound `count(1)` over the *same* filter tree states how many matched.

Two things this variant makes concrete:

- **The query travels, the open flag does not.** The Filter is URL-bound, so `?search=bridge` still
  works in a shared link — but action params are never URL params, so the page arrives with the
  query live and the dialog **shut**. Give the trigger a bound match count over the same filter
  tree and the closed state reports the result honestly (measured: `?search=bridge` → the closed
  trigger reads `130 reports`). Rendering the query *text* in the trigger is **not expressible** —
  no primitive renders a page variable's value — so don't design around it.
- **`Esc` does not close it.** `sectionGroup.jsx` wires the overlay click and the ✕ to
  `clearActionParam`; there is no key handler. Measured: click-trigger → 1 overlay, ✕ → 0,
  backdrop → 0, `Escape` → still 1. If a design promises Esc, that is an enrichment.

Register the search key in the page's `filters` array (`creating-interactive-pages.md` step 0) or
the control's value never reaches the URL and neither the list nor the trigger reacts. ⚠ `filters`
is a **page-level** field, not draft/published split — writing it goes live immediately.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Modal never opens in `/edit` | By design — edit renders the group inline. Check the inline band. |
| Modal never opens in view | Page isn't published (view modal reads `item.sections`), or the trigger's `paramKey` ≠ the group's `modalParamKey`, or the trigger cell's `args.column` doesn't match the static column's `name`. |
| `?addticket=1` in the URL does nothing | Action params are in-memory only; only a provider (`setActionParam`) opens the modal. |
| Existing rows render above the form | Add the never-match filter (§3). |
| Pre-filled column is empty | The page filter with `searchKey === pageParamKey` has no value yet (e.g. missing `?key=`), or the page row lacks the `filters` entry. |
| A form field renders as an empty box, not an input | The column has no `type` — `ColumnTypes[undefined]` → DefaultComp. Set `type: "text"`/`"textarea"`/`"select"`. |
| New row missing derived fields (ids, denormalized columns) | Set them AT CREATE with column attrs — all `selectOnly` (no form field renders) and all fill only blank fields: `autoNumber: true (+ autoNumberStart)` for sequential ids (max+1 across the whole source, ignoring the form's never-match filter); `defaultValue: "Triage"` for static fills; **`defaultFn` (2026-07-15) for dynamic fills** — `'today'` (YYYY-MM-DD), `'now'` (`YYYY-MM-DD HH:MM:SS`, UTC — displays clean in cells and string-sorts against date-only values; NOT raw ISO), `'user'` (the logged-in user's email from CMSContext; skipped when anonymous). Control-room ticket form: `{ name: "reporter", selectOnly: true, defaultFn: "user" }`, `{ name: "opened"/"updated", selectOnly: true, defaultFn: "now" }` (datetime, matching the sidenav report-issue widget's rows). Denormalized columns (page name/route/stage) still backfill via the dataset's sync script (control room: `cr_sync.mjs`). |
| Created row needs to be immediately linkable/viewable | Don't rest identity on an application-numbered column — key detail links and filters on the **DMS row id**, which exists the instant the row does: link cells with `searchParams: "id"` (rows on non-grouped isDms sections always fetch `id`), detail-page filter leaf `{ col: "id", … }` (unknown col → passes through verbatim → `WHERE id = ANY(…)` on the split table's PK). Keep the friendly number display-only with a row-id fallback: `case when (data->>'ticket_id') is null … then (id)::text else … end` (comma-free — the SELECT list is comma-split). Control-room worked example, 2026-07-15. |
