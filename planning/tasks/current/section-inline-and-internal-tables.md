# Author-editable tables in a page section — inline data (A) + internal table (B)

> Assessment / source of truth for the analysis: [`research/spreadsheet-inline-and-internal-table-authoring.md`](../../research/spreadsheet-inline-and-internal-table-authoring.md).
> Origin: building the freight-atlas **"What changed, 2019 → 2024"** table (a 5×3 static table currently
> shipped as a lexical rich-text section) — see `planning/transportny/tasks/current/freight-atlas-content-pages.md`
> (in the TransportNY planning tree). We want a real table fed by data the author controls.

## Objective
Let an author render a **table from data they control**, in two modes, **A first**:

- **A — inline/temporary rows in the component.** Author types rows directly into a Spreadsheet; rows
  persist in the section's `element-data`. No dataset created. The multi-row sibling of the Card
  single-row blank fallback. Ideal for small static tables (the "What changed" case).
- **B — connect to a new internal (`isDms`) table, editable through authoring.** The *editing* half
  already exists (`allowEdit = externalSource.isDms && display.allowEditInView && apiUpdate`; RenderTable
  wires add/update/remove). The missing half is **inline creation** of the internal source from the
  section's source picker. For real/reusable/queryable/versioned tables.

One task, shipped in two phases (A, then B).

## Scope
- In: a new dataWrapper "inline data" mode (A); Spreadsheet config + inline edit path (A); an
  "New internal table" create affordance in the section source picker (B); column-definition authoring
  reused across both.
- Out: pivots/joins over inline data; large-data inline (inline is for small tables); a generic Card
  inline-table (Spreadsheet is the target component; revisit Card later if needed).
- Component target: **Spreadsheet** (`type:'table'`). Card stays on the single-row blank fallback.

## Current State (what exists — don't rebuild)
- Spreadsheet binds via `state.externalSource`; dataWrapper (`getData.js`→`buildUdaConfig`→`apiLoad`) fetches.
- **Editing internal rows already works:** `dataWrapper/index.jsx` exposes `addItem/updateItem/removeItem/
  newItem/setNewItem`; `allowEdit` at index.jsx:395; Spreadsheet has an **"Allow Edit"** (`allowEditInView`) toggle;
  `RenderTable` (spreadsheet/index.jsx:19) renders the edit UI.
- **Static-value precedent (single row):** Card `display.useBlankRowFallback` + per-column `blankDefault`
  (`getData.js:266`) — see completed `datawrapper-blank-row-fallback.md`. A is the *multi-row* generalization.
- **Internal datasets exist:** datasets pattern `internal` dataType; rows in `data_items` as
  `{doc_type}-{view_id}`; created via `dataTypes/internal/pages/admin.jsx` + `components/ValidateComp.jsx`
  (`falcor.call(["dms","data","create"], …)`). See `internal-datasets-overview.md`, completed
  `internal-dataset-admin-page.md`.

## Proposed Changes

### Phase A — inline data mode (build first)
- [ ] **dataWrapper inline branch.** New source mode (e.g. `state.externalSource = { inline: true, columns }`
      + `state.inlineRows: [{colKey: value}]`). In `getData.js`, short-circuit to
      `{ length: inlineRows.length, data: inlineRows }` (apply client-side filter/sort/paging only if cheap;
      otherwise none in inline mode). `useDataLoader` skips `apiLoad` when `inline`.
- [ ] **Columns** authored in the section (reuse the existing Spreadsheet columns control to define
      `{name, type, display_name}`); seed `inlineRows` cells by column key.
- [ ] **Inline edit path.** Route add/update/remove to `setState(draft.inlineRows)` (immer) instead of
      `apiUpdate`; reuse RenderTable's existing add/edit/delete UI. Gate via a new `display.inlineData` (or
      reuse `allowEditInView`).
- [ ] **Config toggle** to switch a Spreadsheet into inline mode + a "add column / add row" authoring affordance.
- [ ] **BC:** default off; sections without inline mode render byte-identically. No server change.

### Phase B — inline internal-table create + edit
- [ ] **"New internal table" action** in the section source picker: create source + view records inline
      (factor the existing creation from `dataTypes/internal/pages/admin.jsx`/`ValidateComp.jsx` into a
      reusable helper), seed `config.attributes` from the authored columns, set
      `externalSource = { isDms:true, source_id, view_id, type, columns }`.
- [ ] **Editing** then uses the existing `allowEdit` path (no new edit code).
- [ ] **(optional) Promote inline → internal**: a one-click "make this a real table" that creates the
      internal source from the inline rows/columns. Nice bridge between A and B.
- [ ] **BC:** additive (new source-picker action); existing internal-dataset binding unchanged.

## Files Requiring Changes (anticipated)
- `patterns/page/components/sections/components/dataWrapper/getData.js` — inline branch.
- `…/dataWrapper/useDataLoader.js` — skip fetch in inline mode.
- `…/dataWrapper/index.jsx` — route edits to local state in inline mode; expose inline add/update/remove.
- `…/dataWrapper/schema.js` — document the inline `externalSource` shape + `inlineRows`.
- `…/ComponentRegistry/spreadsheet/{config.jsx,index.jsx}` — inline toggle, column/row authoring, inline edit.
- `patterns/datasets/.../internal/…` + source picker — factor the create helper for Phase B.

## Testing Checklist
- [ ] A: author adds columns + rows inline; renders as a table; persists in `element-data`; edits round-trip; draft-only.
- [ ] A: inline mode adds **no** network fetch; non-inline sections render byte-identically (BC).
- [ ] B: "New internal table" creates source+view; Spreadsheet binds; Allow Edit lets author add/edit/delete rows; persists to `data_items`.
- [ ] B: existing internal-dataset binding + the datasets pattern unaffected.
- [ ] First real consumer: rebuild the freight-atlas "What changed" table on Mode A (replace the lexical section).
- [ ] Skill update: extend `card-layout.md` / `creating-pages-from-a-design-pattern.md` (or a new skill) with the inline-table recipe.

## Notes
- Primitive/section change → BC-by-default; **ask before any non-BC choice** (per project norms).
- Ship A and verify with the "What changed" table before starting B.

## Progress log
- 2026-06-09 — Task created from the freight-atlas content-pages work + the assessment doc. Not started.
