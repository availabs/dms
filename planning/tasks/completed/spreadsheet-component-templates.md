# Spreadsheet Component Templates ("copy/paste from the DB")

> **STATUS — CLOSED 2026-06-11.** Shipped & verified in the UI: **v1** (Save +
> Load) and **v1.1** (full CRUD — overwrite + delete, inline confirm guards).
> Two author toggles fully partition the saved state: *Include data source* (the
> whole data config — `externalSource`/`join`/`columns`/`filters`/`customBuckets`/
> `pivot`) and *Include layout* (section chrome + `state.display`). Apply falls
> back to the section's live state for excluded buckets. **Phase 3 (drift
> detection) is deferred** — its spec lives in the "Phase 3" section below and is
> tracked as a separate `todo.md` entry; the provenance plumbing it needs
> (`_appliedTemplate.fields[path].templateUpdatedAt` = the row's `data.updatedAt`)
> already ships.

## Objective

Let a power user save a configured **Spreadsheet** section as a named, reusable
**Template** persisted in the DB, and let other users **Load** a template to
initialize/populate a new Spreadsheet. Conceptually: the existing
copy-section-to-clipboard / paste-section flow, but the payload lives in the
database (queryable, shared) instead of the OS clipboard.

First component supported: **Spreadsheet**. The mechanism is generic and gated
behind a registry flag so adding Card / Graph later is a one-line opt-in.

## Scope

**v1 (this task): Save + Load only.**
- Save the current Spreadsheet's config as a named template (two author toggles,
  both default ON: *Include data source*, *Include layout*).
- Load/apply a template into the current section.
- The "Load" submenu queries the DB for **only** templates matching this
  section's component type (clean exact-type match).
- Per-field provenance stamp on applied fields (records the owning template + its DB version at apply time → enables a future "template updated in DB, refresh these fields?" prompt).

**v1.1 (follow-up, separate phase below): Full CRUD.**
- Overwrite (save over a same-named template) + Delete.
- Confirm guards. Auth/ownership still out of scope (but `createdBy` is stored now
  to enable it later).

**Explicitly out of scope (v1 + v1.1):** auth/ownership enforcement, page-level
shared data sources (they don't exist in this codebase — the source binding is
always inline in `element-data.externalSource`), any server changes.

## Design decisions (settled with product owner)

- **Toggle defaults:** both *Include data source* and *Include layout* default
  **ON**. "Layout" = the whole section minus identity + element (title, level,
  tags, size, border, padding, radius, bg, navLabel, anchorId, authPermissions,
  height, offset, rowspan, activeStyle…) **plus the component's display settings
  (`state.display`)** — i.e. everything the "Spreadsheet Settings" menu writes
  (tableStyle, striped, pagination, pageSize, maxHeight, autoResize, …). Those
  settings ride with *Include layout*, NOT *Include data source*: "include
  layout" governs the whole look (section chrome + display). *Include data
  source* gates the whole data config — the source binding (`externalSource` +
  `join`) AND its shape (`columns` / `filters` / `customBuckets` / `pivot`). The
  two toggles fully partition the state (data config vs. look); nothing else is
  unconditionally saved.
- **v1 = Save + Load only**; full CRUD is v1.1.
- **Save from live resolved state** (`dwAPI.state` / `dwHandle.state`), not the
  raw `element-data` blob. The resolved state always carries the concrete
  `externalSource` (source_id/view_id/columns), so the template is self-contained.
- **Cached rows always stripped** (`state.data`, `display.totalLength`,
  `display.loadMoreId`).
- **Almost-zero server changes:** templates are ordinary `data_items` rows under
  a new `type`. Create via `apiUpdate`, list via `apiLoad` — both already route
  through generic Falcor `dms.data.create` / loader paths for arbitrary app+type
  (precedent: `ExportPdf.jsx` lists arbitrary types; all DMS content is created
  by writing new type strings). No allowlist of types exists.

### Namespace / data model

Templates are pattern-scoped (the user's spec put `${Pattern}` in the key) and
live in the **site's own app**.

- `app`  = `format.app` (the site app, same as every other item in the site).
- `type` = `` `${pattern}|${componentTypeSlug}_template` ``
  - `pattern` = parent of the page type. The page pattern's `format.type` is
    `` `${pattern}|page` `` (see `initializePatternFormat` in
    `dms-manager/_utils.jsx`), so `pattern = getParent(format.type)` (fallback
    `format.type.split('|')[0]`).
  - `componentTypeSlug` = `nameToSlug(currentComponent.name)` → `spreadsheet`.
  - e.g. `my_docs|spreadsheet_template`.

**Template name is a data attribute (`name`), NOT encoded in the type.** This is
the deliberate (small) deviation from the literal "app, type, instance" sketch:
keeping the name out of the type makes "list only my component type's templates"
a single **exact-type** query (`apiLoad` with `format.type = templateType`)
instead of a `LIKE`/wildcard the loader doesn't support. This exactly mirrors how
**pages** work — all pages share `${pattern}|page` and are distinguished by data
attributes; all spreadsheet templates share `${pattern}|spreadsheet_template` and
are distinguished by `name`.

### Template row shape (the row's `data` JSON)

State and layout are stored as **JSON strings** (mirroring how `element-data` is
itself a stringified blob — safest for Falcor path-walking; avoids nested-object
projection surprises in the loader).

```js
{
  name,            // human-readable, as typed
  slug,            // nameToSlug(name)
  componentType,   // 'Spreadsheet' (currentComponent.name)
  elementType,     // element-type to set on apply (== componentType for now)
  includesSource,  // bool — was externalSource captured
  includesLayout,  // bool — were layout attrs captured
  stateJson,       // JSON.stringify(cleanedState)  — (if includeSource) externalSource/join/columns/filters/customBuckets/pivot; (if includeLayout) display
  layoutJson,      // JSON.stringify(layoutAttrs) or ''  (only when includesLayout)
  createdBy,       // user?.email — preserved across overwrite; for future ownership/auth
  createdAt,       // ISO string — preserved across overwrite (the row's "born" time)
  updatedBy,       // user?.email — who last saved/overwrote (v1.1)
  updatedAt,       // ISO string — bumped on every overwrite; the drift-check timestamp
  // id present only when overwriting (carried so apiUpdate routes to edit-not-create)
}
```

## Current State (how things work now)

- **Copy/paste** (`section_utils.js`): `handleCopy` = `clipboard.writeText(JSON.stringify(value))`
  — the entire section `value` (element + every attribute, incl. `id`/`ref`, incl.
  cached rows). `handlePaste` reads it back, `setKey(element-type)` + `setState(element-data)`,
  then `onChange({...value, ...all keys except id/ref})`. The remount (compKey
  change) + new `element-data` is what actually re-initializes the component.
- **Section menu** (`sectionMenu.jsx` `getSectionMenuItems`): builds the
  NavigableMenu config. Has in scope: `currentComponent` (registry entry, incl.
  `.name`), `value` (section), `state` (live resolved `dwHandle.state`), and
  actions `setKey`, `setState` (= `dwHandle.setState`), `onChange`,
  `updateAttribute`. Menu items can render arbitrary React via `type: () => <Comp/>`
  (precedent: `ColumnManager`, `ComplexFilters`, custom-bucket `CommitInput`s).
- **API** (`dms-manager/wrapper.jsx`): `apiUpdate({ data, config={format}, requestType, newPath })`
  and `apiLoad(config, path)` are provided through `PageContext`. `apiUpdate` with
  a custom `config.format.{app,type}` writes to any namespace; create (no `data.id`)
  returns the new id. `apiLoad({ format:{app,type,attributes}, children:[{action:'list',path:'/'}] })`
  lists all rows of an exact app+type (precedent: `ExportPdf.jsx`).
- **Spreadsheet registry entry** (`spreadsheet/config.jsx`): `name:'Spreadsheet'`,
  `useDataSource:true`, `controls: buildControls`, `defaultState`, etc.

## Proposed Changes

### New: `TemplateManager` menu component

Rendered inside a new **"Templates"** menu group via `type: () => <TemplateManager .../>`.
Reads `apiLoad`, `apiUpdate`, `format` from `PageContext`; receives the section
primitives as props. UI primitives (`Button`, `Input`, `Switch`, `Icon`) come
from `ThemeContext`.

Responsibilities:
- **List (Load):** on mount, `apiLoad` the templates for `templateType` with
  `children:[{action:'list', path:'/'}]`; render each with an **Apply** button.
  (v1.1 adds a Delete trash icon here.) The `list` action returns the whole
  `data` blob flattened (`createRequest.js` + `processNewData`), so every data
  field — including `data.updatedAt`/`data.createdAt` used for provenance — comes
  back automatically; no per-attribute projection needed.
- **Save:** a name `Input` + two `Switch`es (*Include data source* ON, *Include
  layout* ON) + a **Save** button. Builds the payload from live `dwState` + section
  `value`, `apiUpdate` creates the row, then reloads the list and clears the input.
  - *Include data source* gates `externalSource`/`join`; *Include layout* gates
    BOTH the section layout attrs AND `state.display` (the Spreadsheet Settings).
  - v1.1: if the typed name matches an existing template (by slug) the button
    becomes **Overwrite…** with an inline confirm (was a v1 disable-guard).
- **Apply:** mirror paste — `onChange({ ...value, ...layout, element:{
  'element-type':elementType, 'element-data':JSON.stringify(appliedState) },
  _appliedTemplate: mergedProvenance })` + a unique `setKey(`tmpl_${id}_${now}`)`
  to force the dataWrapper remount, where `mergedProvenance` carries **per-field**
  ownership (see below).
  - **`appliedState` = template state merged over the section's CURRENT live
    state for excluded buckets.** For a bucket a toggle excluded we fall back to
    `dwState`: `!includesLayout` → keep current `display`; `!includesSource` →
    keep the current whole data config (`externalSource` + `join` + `columns` +
    `filters` + `customBuckets` + `pivot`). Two reasons: (1) intuitive
    partial-apply ("apply what I captured, keep the rest"), and (2)
    **load-bearing** — `migrateToV2` discards a state that lacks `externalSource`
    back to `defaultState` (dropping columns), so `appliedState.externalSource`
    must always be present (fallback `{columns:[]}`).
  - Provenance uses the TEMPLATE's `parsedState` keys (not the merged fallbacks),
    so the section only records ownership of fields the template actually carried.

### New: `template_utils.js` (pure, testable, no React/Falcor)

- `buildTemplateType({ pattern, componentType })` → `` `${pattern}|${nameToSlug(componentType)}_template` ``
- `cleanStateForTemplate(state, { includeSource, includeLayout })` → strips
  `data` + runtime fields (`display.totalLength`, `display.loadMoreId`,
  RUNTIME_FIELDS/RUNTIME_DISPLAY_FIELDS, runtime pivot values, `origin:'pivot_col'`
  columns, empty `join` placeholder); when `!includeSource`, drops the whole data
  config (`externalSource` + `join` + `columns` + `filters` + `customBuckets` +
  `pivot`); when `!includeLayout`, drops `state.display` (the Spreadsheet Settings).
- `extractLayout(value)` → `value` minus `['id','ref','element','_appliedTemplate']`.
- `buildTemplatePayload({ name, componentType, state, value, includeSource, includeLayout, user })`
  → the row-shape object above.
- `affectedFieldPaths({ layout, state })` → the list of field paths this apply
  wrote: each layout attr key (`title`, `size`, …) plus each kept state key as
  `state.columns` / `state.display` / `state.filters` / `state.externalSource` /
  `state.customBuckets` / `state.pivot`.
- `mergeAppliedProvenance(prevAppliedTemplate, { fields, templateId, templateName, templateUpdatedAt, appliedAt })`
  → returns `{ ...prev, fields: { ...prev.fields, [each path]: { templateId,
  templateName, templateUpdatedAt, appliedAt } } }`. Most-recent apply wins per
  field, so field A can be owned by template X while field B is owned by template Y.

### Per-field provenance (`_appliedTemplate`)

Granularity = **one entry per affected field** (the unit the author would
re-apply): each layout attribute and each top-level state key. Stored as a
**sidecar map on the section**, NOT inlined into `columns`/`display`/etc. —
inlining would pollute data that gets serialized, diffed, rendered, and sent to
the server.

```js
value._appliedTemplate = {
  fields: {
    'title':                { templateId, templateName, templateUpdatedAt, appliedAt },
    'size':                 { templateId, templateName, templateUpdatedAt, appliedAt },
    'state.columns':        { templateId, templateName, templateUpdatedAt, appliedAt },
    'state.display':        { templateId, templateName, templateUpdatedAt, appliedAt },
    'state.filters':        { templateId, templateName, templateUpdatedAt, appliedAt },
    'state.externalSource': { templateId, templateName, templateUpdatedAt, appliedAt }, // only if includeSource
    // …one entry per field the apply actually wrote
  }
}
```

- `templateUpdatedAt` = the template row's **`data.updatedAt`** (fallback
  `data.createdAt`) at apply time. **Future drift check** (its own phase): reload
  the template by `templateId`, compare its current `data.updatedAt` to the
  stored `templateUpdatedAt`; if newer, surface "template changed — refresh these
  fields" and re-apply only the still-owned fields.
- In v1 (no overwrite yet) `updatedAt == createdAt`, so this is forward-looking
  plumbing — exactly the hook the drift feature needs. The detection/refresh UI
  is **not** built in v1.

> **Implementation deviation (verified):** `templateUpdatedAt` is stored as a
> **data attribute (`data.updatedAt`)**, NOT the server's `updated_at` column.
> The `list` action's Falcor leaf is `["id","app","type",...dataAttrs]`
> (`createRequest.js`) — it does **not** return `updated_at`/`created_at`, and
> the whole `data` blob is returned + flattened by `processNewData` regardless.
> Keeping `createdAt`/`updatedAt` inside `data` makes the row fully
> self-contained, removes any dependence on server columns or the list-leaf
> shape, and is what v1.1 overwrite will bump to make drift real. This is
> strictly within the "zero server changes" constraint.

### Edit: `sectionMenu.jsx`

Add a `templates` group (gated `cdn: () => isEdit && canEditSection &&
currentComponent?.supportsTemplates`) holding a single `type: () => <TemplateManager
componentType={currentComponent?.name} sectionValue={value} dwState={state}
setKey={setKey} setState={setState} onChange={onChange} />` item. Insert near the
`component` / `componentSettings` groups in the returned array. **No signature
change** — everything needed is already in scope.

### Edit: `spreadsheet/config.jsx`

Add `supportsTemplates: true` to the default-exported registry entry.

### New theme: `TemplateManager.theme.js` + register in `patterns/page/defaultTheme.js`

Flat key map (`templateManager`) for the panel's classes, read via
`getComponentTheme(themeFromContext, 'templateManager')` with a local-default
spread — per the theming rules (no raw Tailwind in markup).

### Server

**None.** Verified the create/list paths handle arbitrary app+type generically.

## Files Requiring Changes

- NEW `patterns/page/components/sections/TemplateManager.jsx` — menu UI (component-only export).
- NEW `patterns/page/components/sections/TemplateManager.theme.js` — theme keys.
- NEW `patterns/page/components/sections/template_utils.js` — pure transforms (type/clean/extract/payload).
- EDIT `patterns/page/components/sections/sectionMenu.jsx` — add the `templates` menu group.
- EDIT `patterns/page/components/sections/components/ComponentRegistry/spreadsheet/config.jsx` — `supportsTemplates: true`.
- EDIT `patterns/page/defaultTheme.js` — register `templateManager`.
- (Likely **no** change to `section.jsx` — `TemplateManager` reads `PageContext` directly; the menu builder already has the primitives.)

## Implementation Phases

### Phase 1 — v1: Save + Load — ✅ DONE (verified in UI)
- [x] `template_utils.js` (type builder, state cleaner, layout extractor, payload
      builder, `affectedFieldPaths`, `mergeAppliedProvenance`)
- [x] `TemplateManager.jsx` (list+apply, save with 2 toggles, exact-type query,
      v1 "name taken" guard)
- [x] `TemplateManager.theme.js` + registered in `page/defaultTheme.js`
      (resolved at `pages.templateManager`)
- [x] `sectionMenu.jsx` — `templates` group (gated on `supportsTemplates`,
      `isEdit && canEditSection`); inserted after `componentSettings`
- [x] `spreadsheet/config.jsx` — `supportsTemplates: true`
- [x] Per-field `_appliedTemplate.fields` provenance on apply (captures template
      `data.updatedAt` as `templateUpdatedAt`; merge so newest apply owns each field)

**Key mechanism findings (verified against source):**
- Apply = `onChange({...value, ...layout, element, _appliedTemplate})` **+**
  `setKey(`tmpl_${id}_${Date.now()}`)`. `components/index.jsx` uses
  `key={compKey}` on `DataWrapper.EditComp`, so a unique key **remounts** the
  wrapper → it re-inits state from the new `element-data`. Edit-mode DataWrapper
  has **no** `[value]` resync effect (only View mode does), so remount is the
  ONLY reliable re-init path — hence the guaranteed-unique key (paste's key was
  the element-type string, which doesn't change on same-type apply).
- Save reads the live resolved `dwHandle.state` (passed to the menu as `state`,
  to TemplateManager as `dwState`). `apiUpdate` create writes the whole payload
  into the row's `data` JSON via `["dms","data","create"]` and returns the new
  id — **zero server changes** confirmed.
- **`revalidate()` after save is safe:** while a section is being edited,
  `sectionArray` routes `SectionEdit.onChange → setEditValue` (local `edit.value`),
  so the page `item` does NOT diverge from server `data`; the post-create
  `revalidate()` reloads identical data → `isEqual(item,nextItem)` true → no
  reset. The dataWrapper also holds its own state (no `[value]` resync in edit),
  so it never resets except on the `compKey` remount we control.

### Phase 2 — v1.1: Full CRUD — ✅ DONE (verified in UI)
- [x] Overwrite: when the typed name matches an existing template (by slug), the
      Save button becomes **Overwrite…** → inline confirm → `save(existing)`.
      `buildTemplatePayload({ existing })` carries the row `id` (so `apiUpdate`
      routes to edit-not-create), **preserves** `createdAt`/`createdBy`, and bumps
      `updatedAt`/`updatedBy`. This is what first makes `updatedAt` advance past
      `createdAt` → drift becomes real. (v1 "name taken" guard removed.)
- [x] Delete: trash icon per list row → inline "Delete? Yes/No" confirm →
      `apiUpdate({ data:{id}, config:{format:{app,type:templateType}}, requestType:'delete' })`,
      optimistic local removal, then reload.
- [x] Confirm guards on overwrite/delete — inline two-step (no modal): keeps the
      action inside the NavigableMenu panel; name edits abort a pending overwrite.
- [ ] (Later) ownership/auth using stored `createdBy`/`updatedBy` — deferred, out
      of scope per product owner.

**v1.1 mechanism notes (verified against `dmsDataEditor`):**
- Update path: `data` with an `id` + non-id keys → `falcor.call(["dms","data","edit"],
  [app, id, row, type])`, invalidates `${app}+${type}` → list reload is fresh.
  Including `id` inside `data` matches every existing update call (dataWrapper
  `updateItem`, etc.).
- Delete path: `requestType:'delete'` + `data.id` → `["dms","data","delete"]`,
  invalidates `${app}+${type}/length`. Because only `length` is invalidated, the
  UI removes the row optimistically before the reload.

### Phase 3 — drift detection / "template updated, refresh?" — DEFERRED (own todo)
- [ ] On render, for each `_appliedTemplate.fields` entry, compare the live
      template row's `data.updatedAt` to stored `templateUpdatedAt`; flag stale fields.
- [ ] Offer "refresh from template" that re-applies only the still-owned stale
      fields (re-stamping their provenance).
- [ ] (Optional) store an applied-value hash per field so refresh can skip fields
      the user has hand-edited since apply (don't clobber local changes).

## Testing Checklist
- [ ] Save a configured Spreadsheet (both toggles ON) → row created at
      `app=<site app>`, `type=<pattern>|spreadsheet_template` (verify via `dms raw list` / `dms raw get`).
- [ ] Saved `stateJson` (both toggles ON) has columns/display/filters/externalSource
      and **no** `data`/`totalLength`/`loadMoreId`. `layoutJson` has title/size/border/etc.
- [ ] "Load" submenu lists only spreadsheet templates for this pattern (exact-type query); other component types / other patterns excluded.
- [ ] Save with *Include data source* OFF → `stateJson` has **none** of
      `externalSource` / `join` / `columns` / `filters` / `customBuckets` /
      `pivot`; `includesSource:false`. (A layout-only template = just `display`.)
- [ ] Apply a *Include data source* OFF template onto a section that already has
      its own source/columns → the section KEEPS its entire current data config
      (source + columns + filters + buckets + pivot); only `display`/layout change.
      No column loss (regression guard for the `migrateToV2`-discards-without-
      `externalSource` path).
- [ ] Save with *Include layout* OFF → `layoutJson` empty, `includesLayout:false`,
      and **`state.display` absent from `stateJson`** (Spreadsheet Settings ride
      with layout). Apply onto a styled section → the section KEEPS its current
      display settings (apply falls back to live `dwState.display`); the data
      config (if source included) still populates.
- [ ] Save with *Include layout* ON → `state.display` IS present in `stateJson`;
      applying restores tableStyle/striped/pagination/pageSize/etc.
- [ ] Change a Spreadsheet Setting (e.g. Striped), save template (layout ON),
      apply to a different section → that setting transfers. Repeat with layout
      OFF → the setting does NOT transfer (target keeps its own).
- [ ] Save *source ON, layout OFF* → applying onto a fresh section brings the
      source + columns + filters but leaves the section's own display untouched.
- [ ] Apply a template onto a fresh Spreadsheet → columns/display/filters (and source if included) populate; layout applied if included; live preview updates (remount verified).
- [ ] Apply does not require a page reload to take effect; `apiUpdate`'s `revalidate()` after save doesn't disrupt the in-progress edit (item unchanged → no reset).
- [ ] `_appliedTemplate.fields` has one entry per affected field, each with
      `templateId` / `templateName` / `templateUpdatedAt` / `appliedAt`.
- [ ] Applying template B after template A leaves A's untouched fields owned by A
      and B's fields owned by B (per-field, not whole-section, ownership).

### v1.1 (CRUD) checks
- [ ] Type an existing template's name → Save button becomes **Overwrite…**;
      clicking shows inline **Cancel / Overwrite** confirm (no modal).
- [ ] Overwrite → same row id (no duplicate created); `createdAt`/`createdBy`
      unchanged, `updatedAt` advanced past `createdAt`, `updatedBy` set
      (verify via `dms raw get <id>`); the saved config reflects the new state.
- [ ] Editing the name field while an overwrite confirm is pending aborts it.
- [ ] Delete trash icon → inline **Delete? Yes/No**; confirming removes the row
      immediately (optimistic) and it stays gone after the list reload + a fresh
      menu open. `dms raw get <id>` 404s / row absent.
- [ ] Deleting one template doesn't affect others; Apply on the remaining rows
      still works.
- [ ] Overwriting template A does **not** retroactively change a section that
      already applied A (provenance keeps the old `templateUpdatedAt` — that gap
      is exactly what Phase 3 drift detection will surface).
- [ ] Fast Refresh: editing `TemplateManager.jsx` keeps page state (component-only export, theme/utils in siblings).
- [ ] Templates menu hidden for non-Spreadsheet components and in view mode / without `edit`/`edit-section`.

## Open questions / notes
- compKey/remount nuance: same-type apply relies on `element-data` diff + setState;
  if same-type doesn't visibly refresh, force a unique compKey per apply.
- `apiUpdate` runs `revalidate()` after a create when `newPath===currentPath`
  (template type ≠ page type). Harmless (page item unchanged) but confirm in live test.
