# UI controls — tables: one list look, ink grid states

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub. Picks up P4 and the
"Tables" section of [ui-control-inventory.md](./ui-control-inventory.md). Comes before
[ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md) (owner 2026-10-14: "before we take on
ui-raw-html-to-ui-components.md, there are other ui elements that need to look same"; then "let's do tables").

## Objective

Every read-only list table looks the same in the default theme (spec: `ui-controls.html` → "List table",
constants `TBL_*` in `design_system_v6/scripts/controls.py`). Data grids keep their own look, but their
"chosen" states go ink.

## Decisions (owner, 2026-10-14)

- [x] Datasets lists (task list / events, overview Columns, catalog table view, uploads) **move onto
      `UI.Table 'list'`**, not just restyled. Where a list needs something `UI.Table` lacks, enrich it.
- [x] Data grids (Spreadsheet sections, Table tab, Validate, Runs): selected cell, selected header,
      header-menu active and current page **cobalt → ink**. Default theme only; project themes frozen.

## Inventory (2026-10-14)

| Group | Where | Built with | Today |
|---|---|---|---|
| admin / auth lists (always default theme) | site list `editSite.jsx:585`, tenant list `:933` | `UI.Table` `roomy` | 42px, row rules |
| | auth Users `authUsers.jsx:358`, Groups `authGroups.jsx:70` | `roomy` | same |
| | themes list `themes/list.jsx:113` | `rules` | 35px, row rules |
| | pattern list `patternList.jsx:341`, page templates ×2 `pageTemplateManagerPane.jsx:125/147`, Data tab `sourcesTab.jsx:330` | default | full cell grid, `px-1` |
| | Pages tree `pagesEditor.jsx:1359` | `below-row` | row rules, inline openOut |
| datasets lists | task list / events (`TaskTable.jsx`, `UdaTaskList`, `UdaTaskPage`) | `<table>` | no band, `px-3`, header 400 |
| | overview Columns (`default/overview.jsx`) | `<table>` | band, zebra |
| | catalog table view (`DatasetsList/index.jsx`) | `<table>` | band, sticky, `px-3` |
| | uploads + events (`uploads.theme.js`) | div grid | band, `px-4` |
| | gis create: schemaEditor, publish, selectLayer ×2, uploadFile | `<table>` | to list in step 3 |
| data grids | Spreadsheet sections (`display.tableStyle`), Table tab, Validate, Runs (`RunsPage.jsx:531`) | `UI.Table` default | cobalt selection states |

Also found: `table/index.jsx` `AddNew` / `InlineAddRow` / `PlaceholderRow` and `RenderGutter.jsx` hardcode
`bg-white` / `bg-gray-50` / `border-slate-50` / `hover:bg-blue-50` / `bg-blue-300` / green save buttons (not
themed, wrong in dark mode). `_legacy/ui.js` has no `table` freeze; landbank has no `table` of its own, so it
inherits the library default.

## Plan

1. [x] `UI.Table` gets a `'list'` named style (appended; stored indices unchanged): well header band,
       `t-metaXS` pencil labels, `px-4`, row rules + row hover, no zebra, no cell lines, no selection look.
       Authors can pick it for a Spreadsheet section too (`display.tableStyle`).
2. [x] Admin / auth: the 9 tables above → `'list'`; Pages tree keeps inline expand (`below-row` gets the
       list look). Delete `roomy` / `rules` if nothing uses them.
3. [x] Datasets lists → `UI.Table 'list'` (task list / page, overview, catalog, uploads, GIS layer analysis, Runs outputs); drop their table theme keys from the library + `_legacy/datasets.js`.
       Project themes: decide with the owner (freeze a neutral list vs. normalise).
4. [x] Data grid: cobalt → ink in styles[0]; old values frozen in `_legacy/ui.js` `table`. (2026-10-14, agent A)
5. [x] Theme the hardcoded add-row / placeholder / gutter markup (done); sticky header bg and TNY min-width overflow: no change (owner, see below).

Verify each step: live class sets in the default theme, HEAD-baseline pixel diff on MNY / TNY v2 /
landbank, light + dark, build clean, eslint = HEAD. Mirror changes into the mockup scripts.

## Progress

### 2026-10-14 — steps 1 + 2 done (uncommitted, library `design-wip`)

- `table.theme.jsx`: a `LIST` const at the top (stickyHeader well, header `px-4 py-2 t-metaXS` pencil +
  `border-b`, `row: 'group/row'`, cell `border-b` only, cellInner `px-4 py-2.5 t-proseSM` ink, every cell bg
  panel → `group-hover/row:` paper (whole-row hover; no zebra, no selection look), colResizer transparent
  until hover). New `'list'` style appended last. **`roomy` / `rules` were NOT deleted** — a Spreadsheet
  stores `display.tableStyle` (index or name), so deleting would shift later indices; both are now aliases
  of `LIST`. `below-row` = `LIST` + its inline openOut keys.
- `_legacy/ui.js`: new `table` freeze — pre-v6 `roomy`, `rules`, `below-row` kept whole for project themes
  (a same-named style replaces wholesale; a theme's own `below-row` still wins).
- Callers → `activeStyle='list'`: editSite (site list + tenant list), themes list, patternList, page
  templates ×2, sourcesTab (Data tab; it pins the library table theme, which has `list`), auth Users / Groups.
  Pages tree stays `below-row`.
- `editSite.theme.js` `baseUrlLink`: `p-2` → `px-4` (a `ui` column gets no cellInner padding, so the value
  sat 8px in while the header is 16px in; was already 4px off on HEAD).
- Verified on :5199 vs HEAD baseline :5198 (worktrees in this session's scratchpad `base/`): site list,
  themes, users, groups, pages tree, page templates, Data tab — light; site list dark; row hover = whole row
  paper. Rows 35/42 → ~43px, `px-3` → `px-4`, text graphite → ink, per spec. Build OK; eslint = HEAD on all
  10 touched files. Console errors seen are pre-existing (`placeHolder` prop in authGroups / authUsers).
- Mockups: admin-*.html already draw the list table (10/13 re-skin), nothing to mirror.

### 2026-10-14 — step 3a: task list + task page (owner: datasets lists onto UI.Table 'list'; project themes frozen gray)

- Found: on project themes these two ALREADY rendered `UI.Table` (their own default grid look, via the
  `t.table ''` gate); only the default theme used the raw `TaskTable`. So project themes stay on their
  default table (`tableStyle: ''`), not a gray list — that keeps them pixel-identical. The frozen gray
  `'list'` is for the lists that were raw markup on every theme (overview, catalog, uploads, …).
- `UdaTaskList.jsx` / `UdaTaskPage.jsx`: always `<Table … activeStyle={t.tableStyle || undefined}>`;
  `TaskTable.jsx` deleted (no callers). New theme keys `tableStyle: 'list'` and `columnSizes` (px per
  column; unlisted columns share the rest) replace `table` / `tableScroll` / `th` / `tr` / `trAlt` / `td`
  (library + `_legacy/datasets.js`). `capitalize` moved from markup into `typeCell`.
- Cells: the wrapper `div` takes the table's `className` (cellInner), the inner element the task theme's
  class — no two text-colour / font classes on one element.
- Task page: project themes keep the exact pre-v6 `COLUMNS` (event_id 100 / payload 450, plain text
  columns); the default theme uses `eventColumns(t)` (message `wrapText`, `[overflow-wrap:anywhere]` so long
  tokens wrap instead of clipping).
- **Gotcha:** `_legacy` `columnSizes: {}` did NOT clear the library's sizes (theme merge is a deep merge)
  → project task lists changed width. Legacy now lists each key as `null`.
- Verified: MNY / TNY / landbank `/tasks` and `/task/18` (42 events) pixel-identical to HEAD; default
  theme list look, ink text, no zebra. Remaining in the default theme: rows are vertically centred
  (was top-aligned) — fine for single-line rows, visible on the payload rows.

### 2026-10-14 — step 3b: source overview Columns

- `overview.jsx`: the Columns summary is `UI.Table` (`t.tableStyle`, `t.columnSizes` {type 130, req 70}),
  placeholder row "No columns defined" via `display.emptyRowMode: 'placeholder'` (new `emptyRow` key in
  `LIST`), `disableCellSelection`. Cell content keys `nameCell` / `typeCell` / `descCell` replace
  `table` / `theadRow` / `th` / `thReq` / `tr` / `trAlt` / `td*` / `tdEmpty` (library, `_legacy`, TNY v2).
- **Project themes:** `_legacy/ui.js` `table` gets the frozen gray `'list'` (owner's choice; strings from
  `_legacy/datasets.js`), with its own frameless `tableContainer` (a theme's styles[0] may draw a card frame,
  e.g. TNY). **TransportNY v2 styled its own lists**, so it defines its own `'list'` in `themev2.js`
  `table.styles` (appended last) from its overview / catalog strings — same rule as the buttons: a project
  theme defines the role in its own styles. Other projects get the gray list.
- Changes vs HEAD (intended): zebra gone, column widths from the grid (not content), Req dot left-aligned
  under its header (UI.Table headers ignore `justify`; making them honour it would move every Spreadsheet
  header that sets it, so not done).

### 2026-10-14 — step 3c: catalog table view (owner: "own 'list' per theme")

- `DatasetsList/index.jsx`: table view is `UI.Table` (`t.tableStyle`, `t.columnSizes` {type 150}, name
  `wrapText`, `disableCellSelection`); `tableWrap` `overflow-auto` → `overflow-hidden` (UI.Table scrolls).
  Keys `table` / `theadRow` / `th` / `tr` / `td` / `tdMuted` → `tableStyle` / `columnSizes` / `descCell`.
- **12 themes styled this table themselves** (landbank, avail_site v1–v10, TNY v2). Owner chose: each gets
  its own `'list'` in its `table.styles` (appended last), generated from its catalog strings
  (`theadRow` → header band, `th` → header cell, `tr` → row rule + `group-hover/row:` bg, `td` → cellInner,
  `tdMuted` → `descCell`). So those themes' other lists (overview, uploads) take the same brand list.
  Generator: session scratchpad `themelist.py` (one-off). Gotcha fixed by hand: `${BORDER}` / `${HAIR}`
  colour vars don't start with `border-` → first pass put them in the header bg and dropped the row colour.
- MNY (no catalog strings of its own) had been rendering the library's v6 catalog strings; it now gets the
  frozen gray list like its other lists.
- Verified catalog table view: default, MNY, TNY v2, landbank vs HEAD (screens, not pixel-identical by
  design). avail_site has no local test pattern — checked by lint only.

### 2026-10-14 — step 3d: uploads list + upload events

- `Uploads/list.jsx` / `view.jsx`: `UI.Table` (`t.tableStyle`), row click via `onRowMouseClick` (adds the
  pointer). Keys `tableHeaderRow` / `viewHeaderRow` / `tableHeaderCell` / `tableList` / `tableRow` / `viewRow`
  dropped (library + `_legacy`); `tableCell` / `tableCellId` are now cell TEXT classes. Project themes → their
  `'list'` (gray / own).
- **Width fix:** a `UI.Table` grid's column minimums flowed up into TNY's layout column (`flex-1 … lg:ml-60`,
  `min-width: auto`) and widened the page by 190px. Every `'list'` `tableContainer` (library `LIST`, legacy
  gray, TNY v2, landbank, avail_site v1–v10) now has `[contain:inline-size]`. Fixed uploads AND the catalog
  (was +110px). TNY's task list (its own default table, unchanged) still overflows +184px — same on HEAD,
  step 5.

### 2026-10-14 — end of session: state + next

- Mockups mirrored: `ds_common.table()` (task list / events), `source.py` overview columns, `catalog.py`
  table view now use `controls.py` `TBL_*`; `build_all.py` + `check.mjs` clean.
- Verified: build OK; eslint = HEAD on every touched file except `react/prop-types` on the new inline
  cell Comps (the package doesn't follow prop-types; Button / Switch / FileInput precedent). Dark mode OK.
- **Left in step 3:** the GIS create flow's raw tables are mostly NOT lists — select-layer (label/select
  layout), file metadata (key/value), upload / publish / layer-analysis errors (message blocks), schema
  field mapping (a form with inputs + checkboxes). Proposal: those belong to
  ui-raw-html-to-ui-components.md (key/value + form components), not the list style. The two real lists
  left: GIS **layer analysis** (geometry type / count) and **Runs outputs** (`schedule/RunsPage.jsx:106`,
  hardcoded gray/blue classes, unthemed; Runs isn't reachable on the test data). Ask the owner.
- **Next:** step 4 (data-grid cobalt → ink + `_legacy/ui.js` styles[0] freeze), step 5 (add-row /
  placeholder / gutter hardcoded colours; sticky header; TNY task-list +184px overflow on its own default
  table — `[contain:inline-size]` is the likely fix there too, but it changes the data grid on every theme).
- Uncommitted, both repos on `design-wip`. Scratch: dms-server :3457 + Vite :5199 + HEAD baseline Vite
  :5198 (worktrees `<session scratchpad>/base`, remove with `git worktree remove --force`, submodule first).

### 2026-10-14 — steps 4 + 5 (parallel agent A)

- **Step 4, `table.theme.jsx` styles[0] (default theme only):** `headerCellContainerBgSelected` /
  `gutterCellWrapperSelected` → `bg-[var(--t-rule)] !text-[var(--t-ink)]` (an ink fill was tried first and
  read too heavy; `!` because `headerCellContainer` also sets a text colour); `cellBgSelected` → rule fill;
  new `selectionColor: 'var(--t-ink)'` replaces `TableCell.jsx`'s hardcoded `#2100f8` range outline;
  `cellEditableTextBox` border ink; `rowHighlightAccent` → well + ink left edge; `headerCellBtnActive` → rule;
  `pageRangeItemActive` (UI.Pagination reads the table theme) → `bg-ink text-paper` (spec `PAGE_BTN_ON`).
- **Step 5:** the hardcoded markup is themed. `index.jsx` AddNew + InlineAddRow → `addRowGrid`,
  `addRowGutterCell`, `addRowButtonCell`, `addRowButton`, `addRowButtonIcon`, `addRowCell`, `addRowInput`,
  `inlineAddGrid`, `inlineAddGutter`, `inlineAddSave`, `inlineAddSaveFloating`; styles[0] `emptyRow` (the
  PlaceholderRow fallback stays for themes that blank it). `RenderActions.jsx` (actions column: url / delete
  buttons, ⋯ menu) → `actionLinkBtn`, `actionDeleteBtn`, `actionBtnIcon`, `actionsMenuTrigger`,
  `actionsMenuTriggerIcon`, `actionsMenu`, `actionsMenuItem`, `actionsMenuItemDanger` (theme via
  `TableCellContext`). `RenderGutter.jsx` has no importers (dead code) — left alone.
- **Freeze:** `_legacy/ui.js` `table.styles[0]` ('default') now holds every pre-v6 value above, including the
  exact old hardcoded strings and `selectionColor: '#2100f8'`.
- **Verified:** datasets Table tab with a live drag-selection — MNY / TNY v2 / landbank pixel-identical to the
  HEAD baseline; default light + dark checked by eye. Edit chrome (add-row bar, actions column, inline add,
  placeholder, pagination) via a preview harness (`scratchpad/agentA-table/`, also copied into the baseline
  worktree): MNY / TNY v2 / landbank identical to HEAD; default light + dark checked. The test site has no
  page Spreadsheet sections, so /p-* pages had no grids to compare. Build OK; eslint = HEAD apart from
  `react/prop-types` on the new theme keys in `index.jsx` (package doesn't follow it).
- **Sticky header:** `stickyHeader` `bg-[var(--t-panel)]` is right for the default (header cells paint their
  own well band; panel follows dark mode). Changing it for project themes would change them (pre-v6 was
  `bg-white` from Virtual.jsx), so no change.
- **Open questions:**
  - TNY's task list (+184px page overflow, same on HEAD): TNY's own `report` table style has no
    `[contain:inline-size]`; adding it to TNY's table styles would change every TNY data grid's sizing, so not
    done. A container-level fix in `UdaTaskList` (agent B's area) or the TNY layout column's missing
    `min-w-0` (`flex-1 … lg:ml-60`) are the options — owner to pick.
  - The add-row / inline-save / actions buttons stay themed raw `<button>`s (project-theme freeze needs the
    exact old strings); moving them onto `UI.Button` belongs to ui-raw-html-to-ui-components.md.
  - `index.jsx` still forces a Proxima Nova / slate lexical editor theme inside add-row cells (lexical, not
    table chrome) — not touched.
  - Mockups: the datasets Table-tab mockup draws no selection / add-row state, so nothing mirrored.

### 2026-10-14 — step 3e: GIS layer analysis + Runs outputs (agent B, merged by main session)

- `gis_dataset/pages/Create/selectLayer/components.jsx` LayerAnalysisSection → `UI.Table`
  (`t.tableStyle`, `disableCellSelection`); the `legacyInlineStyles` half-width box and the inline cell borders
  (applied on EVERY theme, incl. default) removed. `gisCreate.theme.js`: `tableStyle: 'list'`,
  `layerAnalysisTdType` / `TdCount` text-only; `layerAnalysisTable` / `ThCenter` / `RowBorder` dropped.
  `_legacy/datasets.js` gisCreate: gray `'list'`, `layerAnalysisOuter` keeps the centred half-width box.
- `schedule/RunsPage.jsx` RunOutputs → `UI.Table` (`t.outputsTableStyle`). New `schedule/runsPage.theme.js`
  (`runsPage`, registered in datasets defaultTheme): `outputsTableStyle`, `outputCell`, `outputLink` (cobalt —
  link in text), `outputRows`. `_legacy` `runsPage` keeps the old gray / blue text on the gray list. Rest of
  the Runs page still hardcoded (pre-existing).
- Not moved (raw-HTML task): select-layer layout table, file metadata, upload / publish / layer-analysis
  error blocks, schema field-mapping form.
- Verified: default GIS create flow live vs HEAD (list header band; test file yields no geometry rows on HEAD
  too). MNY create flow not run. Runs not reachable on test data — lint / code only.
- Open: empty Layer Analysis shows only its header ("No features" placeholder?); theme the rest of Runs?

### 2026-10-14 — owner decisions on the open items

- Agent B items: **no** "No features" placeholder for an empty Layer Analysis; **no** theming of the rest of
  the Runs page (owner: "agent b: no to both").
- Agent A items: **no change needed** — TNY task-list overflow and the sticky header stay as they are
  (owner: "agent a: no change needed"). Step 5 closed.

### 2026-10-15 — closed

All done and committed (library `ffc7566f`). The GIS create flow's non-list tables (select-layer layout, file
metadata, error blocks, schema field mapping) and the spreadsheet's raw add-row / inline-save / actions buttons
are tracked in [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md).
