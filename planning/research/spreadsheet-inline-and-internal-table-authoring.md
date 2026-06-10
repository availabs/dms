# Assessment — author-editable tables in a page section (inline data + internal tables)

**Question (from the freight-atlas "What changed, 2019 → 2024" table):** the design is clearly a
table; we built it as a lexical (rich-text) section. Can a section render a **table from data provided
in the component** — either (A) the author types temporary rows right into a Spreadsheet, or (B) a
Spreadsheet connects to a **new internal table** and edits it through authoring? What would each take?

## TL;DR

| Capability | State today | Effort to finish |
|---|---|---|
| **B. Edit an existing internal (`isDms`) table through authoring** | **Already exists** | none — wire it up |
| **B′. Create a *new* internal table inline from the section** | Partial — creation lives in the datasets pattern, not the page-section source picker | Small–medium |
| **A. Inline/temporary rows stored in the section (no dataset)** | Does **not** exist (only Card's *single-row* blank fallback) | Medium, self-contained |

## How section data works today (the relevant machinery)

- Data sections (Card, **Spreadsheet** `type:'table'`, Graph) set `useDataSource/useDataWrapper: true`
  and bind to a source via **`state.externalSource`** (`schema.js`: `{ source_id, view_id, isDms, env,
  type, columns, … }`). The dataWrapper (`getData.js` → `buildUdaConfig` → `apiLoad`) fetches rows.
- **`isDms` = a DMS-internal dataset** (datasets pattern, `internal` dataType): metadata *and* rows live
  in `data_items` (`{source.doc_type}-{view_id}`), unlike external DAMA sources. See
  `patterns/datasets/internal-datasets-overview.md` and completed task `internal-dataset-admin-page.md`.
- **Authoring-edit of rows already flows through the dataWrapper:** `index.jsx` exposes
  `addItem / updateItem / removeItem / newItem / setNewItem` and computes
  `allowEdit = externalSource.isDms && display.allowEditInView && Boolean(apiUpdate)` (index.jsx:395).
  `RenderTable` (spreadsheet/index.jsx:19) already consumes those props and renders add/edit/delete UI.
  The Spreadsheet config ships an **"Allow Edit"** toggle (`allowEditInView`).
- **Static-value precedent:** Card has `display.useBlankRowFallback` + per-column `blankDefault`
  (`getData.js:266`) — when a query returns 0 rows it synthesizes **one** placeholder row from authored
  defaults. This is the existing "data lives in the component" pattern, but it is **single-row only**
  (built for stat/KPI cards), so it does not cover a multi-row table.

## Option B — connect a Spreadsheet to an internal table, edit through authoring

**What already works (today, no code):** create an internal dataset in the datasets pattern → add a
Spreadsheet section to the page → bind its `externalSource` to that dataset (`isDms:true`) → toggle
**Allow Edit** → an author adds/edits/deletes rows in place; writes persist via `apiUpdate` to the
`{type}|{view_id}:data` rows. This is the lowest-effort path and is the "real" answer for any table that
should be queryable, joinable, versioned, reusable, or access-controlled.

**The gap (B′ — inline creation):** today the table must be created up-front in the datasets pattern
admin (CSV upload / "Add Version"). There's no "create a table for this section" button in the page
editor. To close it:
- Add a **"New internal table"** action to the section's source picker that creates the source + view
  records inline. The creation logic already exists — `patterns/datasets/components/ValidateComp.jsx`
  and `pages/dataTypes/internal/pages/admin.jsx` create `isDms` sources via `falcor.call(["dms","data",
  "create"], …)` with `config.attributes` (column defs) — factor that into a small helper the page-section
  source picker can call, seeding columns from the section's authored column list, then set
  `externalSource = { isDms:true, source_id, view_id, type, columns }`.
- Editing then "just works" via the existing `allowEdit` path.
- **Effort: small–medium.** Mostly UI wiring + reusing the existing internal-source creation; no new
  data model. BC: additive (a new source-picker action + a new column-def step).

## Option A — inline/temporary rows stored in the component

**Does not exist.** `state.data` in the Spreadsheet defaultState is the *fetched* buffer, not authored
rows; the dataWrapper always wants an `externalSource`. To support author-typed rows persisted in the
section's `element-data`:
- **New "inline source" mode in the dataWrapper.** A branch where rows come from a new
  `state.inlineRows` (array of `{colKey: value}`) instead of `apiLoad`: `getData.js` short-circuits to
  return `{ length, data: inlineRows }`; `useDataLoader` skips the fetch when the source is inline.
- **Columns** are authored in the section (the Spreadsheet already has a columns control — reuse it to
  define `{name, type, display_name}` for the inline table).
- **Editing** routes add/update/remove to `setState(draft.inlineRows)` (immer) instead of `apiUpdate`,
  so the existing RenderTable edit UI works against local state.
- **Trade-offs:** client-only — server features (server-side filter/sort/pagination, joins, pivots) won't
  apply; would either implement a small client path or disable those controls in inline mode. Rows live in
  `element-data` (page draft), so it's perfect for *small static tables* (the "What changed" 5×3 case),
  travels with the page, no dataset overhead, no orphan dataset to clean up. Not for large or shared data.
- **Effort: medium, self-contained** (one dataWrapper mode + a Spreadsheet inline-edit path + a config
  toggle `display.inlineData`). No data-model or server change.

## Recommendation

1. **For the "What changed" table now:** it's 5 rows × 3 columns of static narrative. The *ideal* fit is
   **Option A (inline)**, which doesn't exist yet. Interim, two working choices: keep the styled lexical
   "table" (cheapest), or stand up a tiny internal dataset + Spreadsheet (Option B, works today but
   heavyweight for 5 rows).
2. **Highest-leverage build: Option A (inline data mode).** It's self-contained, BC, and serves the long
   tail of small author-authored tables (comparison tables, mini matrices, footnote tables) without
   creating a dataset per table — the same niche the Card blank-row fallback fills for single stats.
3. **Then Option B′ (inline internal-table creation)** for when an author needs a *real* table (queryable,
   reusable, versioned). The editing half already exists; only the inline-create affordance is missing.

## Pointers (source of truth)
- `patterns/page/components/sections/components/ComponentRegistry/spreadsheet/{index,config}.jsx` — RenderTable + controls (`allowEditInView`).
- `…/components/dataWrapper/index.jsx` — `allowEdit` (l.395), `addItem/updateItem/removeItem` wiring (l.264–341).
- `…/components/dataWrapper/getData.js` — fetch path + `useBlankRowFallback` (l.266); inline mode would branch here.
- `…/components/dataWrapper/schema.js` — `externalSource` shape (`isDms`).
- `patterns/datasets/internal-datasets-overview.md`, `…/dataTypes/internal/pages/admin.jsx`,
  `components/ValidateComp.jsx` — internal-source creation to reuse for B′.

## Status
Assessment only — **no code written.** Per project norms a primitive/section change like this gets a
planning task and is BC-by-default; flag non-BC choices before building. Awaiting a call on which option(s)
to pursue.
