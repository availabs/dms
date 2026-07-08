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
  displayName: "Add-ticket modal", isModal: true, modalParamKey: "addticket" }
```

`sectionGroup.jsx` behavior:
- **View mode**: renders `null` while closed; when open, renders a fixed overlay
  (`bg-black/50`) with a white `max-w-4xl` card containing the group's sections. Overlay click
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
  put with a cleared form. There is **no auto-close** of the modal after add (candidate
  enrichment).

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

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Modal never opens in `/edit` | By design — edit renders the group inline. Check the inline band. |
| Modal never opens in view | Page isn't published (view modal reads `item.sections`), or the trigger's `paramKey` ≠ the group's `modalParamKey`, or the trigger cell's `args.column` doesn't match the static column's `name`. |
| `?addticket=1` in the URL does nothing | Action params are in-memory only; only a provider (`setActionParam`) opens the modal. |
| Existing rows render above the form | Add the never-match filter (§3). |
| Pre-filled column is empty | The page filter with `searchKey === pageParamKey` has no value yet (e.g. missing `?key=`), or the page row lacks the `filters` entry. |
| A form field renders as an empty box, not an input | The column has no `type` — `ColumnTypes[undefined]` → DefaultComp. Set `type: "text"`/`"textarea"`/`"select"`. |
| New row missing derived fields (ids, denormalized columns) | `addItem` writes exactly `newItem`. Backfill via the dataset's sync script (control room: `cr_sync.mjs` assigns missing `ticket_id`s + target-page denormalize). |
