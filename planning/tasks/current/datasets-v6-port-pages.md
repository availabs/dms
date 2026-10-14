# Datasets pattern v6 port — per-page record (pages 1–12)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

Part of [datasets-page-pattern-v6-port.md](./datasets-page-pattern-v6-port.md). The hub keeps the process rules,
the mechanism (`_legacy/*` freezes), the decisions and the file list; this file is the per-page
implementation record, in page order.

### 1. datasets · catalog — DONE 2026-10-06 (awaiting owner OK before page 2)
- `DatasetsList/datasetsList.theme.js` + `components/Breadcrumbs.theme.js` ported to v6 tokens.
- `DatasetsList/index.jsx`: hidden buckets moved to the END of the rail (Decision 10); toolbar
  buttons themed via new `toolbarBtn` / `toolbarBtnActive` (passed as Button className — '' keeps
  the project's Button theme); `settingsLink`; `toolbarDivider`; `newBtnIcon` + `newBtnText`
  ("new source"); `sidebarHiddenIcon(+Class)`; new empty state (`emptyWrap/Icon/IconClass/Title/
  Text/Link`, Decision 14) gated on a new `loaded` flag so it never flashes during load.
- `ui/icons/icon_defs.jsx`: `Upload` stroke `#141B34` → `currentColor` (was invisible in dark mode).
  Same hardcoded-color bug in `Section`, `ListView`, `TouchInteraction`, `Page` — fix when their
  pages are ported.
- Mockup mirrored: sort + show-all are icon buttons (as implemented), not text buttons.
- Owner follow-up (2026-10-06): **results scroll, not the page — at every width** (theme-only in
  the default): `pageWrapper` `h-svh flex-col`, `body` `flex-1 min-h-0`, grid / stack
  `h-full overflow-y-auto`, table `overflow-auto` (both axes — wide on phones) with sticky `th`,
  rail scrolls on its own; breadcrumb `nav` `flex-none`. (First pass was lg+ only; owner: "the
  scroll disappears on smaller screens".) Works because the default Layout renders nothing above
  the page below lg. Verified by measurement at 1440/900/700/390 in grid / stack / table: the
  document is never taller than the viewport, only the results / rail scroll. MNY unchanged
  (legacy classes). Mockup mirrored.
- **FLAGGED — come back to it (owner 2026-10-06):** below lg the default theme shows no logo and no
  user menu (nor site nav / theme toggle). They live in the SideNav (`topMenu: Logo`,
  `bottomMenu: ThemeToggle + UserMenu`), and the SideNav is `max-lg:hidden`; the default topNav is
  `size: 'none'`. Same on the page pattern. Fix needs a new Layout capability: **turn the TopNav on
  only below lg** (e.g. a responsive topNav size / `showBelow: 'lg'` option) carrying Logo +
  UserMenu (+ toggle). Doesn't exist today. Owner: logo and user menu must both be visible.
- TransportNY note: its app keeps a copy of our theme at `transportNY/src/dms_themes/transportny/`
  and the library as the `src/modules/dms` submodule. The next theme copy must also copy
  `src/themes/_legacy/datasets.js` → `transportNY/src/dms_themes/_legacy/datasets.js` (the theme's
  `../_legacy/datasets` import resolves there).
- Verified live (local setup above): default theme light + dark, grid / stack / table, Hazards with
  subcategories, no-hits search empty state, active Sandbox bucket; 0 console errors, no overflow.
  mnyv1 + transportnyv2 catalogs render their old look (only the rail order changed, as approved).
  `npm run build` clean; eslint on index.jsx = 56 problems, identical to HEAD.
- Noted, not caused by this page: the page pattern's UserMenu default renders the email unreadable
  in dark mode (fix with the page-pattern userMenu port); MNY's floating header overlaps the
  datasets toolbar on the local fixture (MNY layout; classes unchanged).

### 2. datasets · source page (shell + Overview + Table container) — DONE 2026-10-06 (awaiting owner OK)
- Ported to v6: `pages/sourcePage.theme.js`, `dataTypes/default/sourceOverview.theme.js` (incl. the
  AuthorityControl `verAuth*` keys and the Sandbox promotion box), `DatasetsList/categories.theme.js`
  (category editor), `gis_dataset/pages/gisPages.theme.js` table keys only (metadata keys wait for
  the metadata page). Pre-v6 values of all four frozen in `_legacy/datasets.js`.
- `SourcePage.jsx`: **subtitle** `type · rows · versions` per Decision 8 (resolved dataType; rows of
  the version in effect — URL view → preferred/authoritative → latest — named, omitted when the view
  has no row_count; "1 version" / "N versions" / "no versions yet"; hidden until loaded, and for DMS
  sources until the real dataType has loaded) — new keys `subtitle` + `titleWrap` (legacy `''` /
  `min-w-0`). **Lock icon on the Admin tab** — `adminTabIcon` + `tabIcon` (legacy `''`).
- `overview.jsx` bug fix: "Req" never showed for columns marked required in the metadata editor
  (it saves `required: 'yes'`; Overview only accepted `true`). Now accepts both — this also shows
  correct dots on project themes.
- Verified live (local): default theme light + dark — overview, Mark-authoritative form open,
  category editor open, Sandbox source (promotion box + "no versions yet"), Table tab with the
  version select + header action; mnyv1 / transportnyv2 unchanged apart from the Req fix. Build
  clean; lint: overview.jsx 40 = HEAD; SourcePage.jsx +4 `react/prop-types` (new Icon / t.* props —
  the file uses no prop-types anywhere).
- **Row count (owner follow-up 2026-10-06):** NO view carries a row count — neither DMS nor DAMA
  view attribute lists fetch one (the `view.row_count` reads were dead). The subtitle now loads ONE
  count, for the version in effect, via the UDA length route (`uda[env].viewsById[id].options['{}']
  .length` — the Table tab's own total), new helper `getViewRowCount` in `dataTypes/default/utils.js`;
  env = pgEnv (DAMA) or `${app}+${nameToSlug(name)}` (DMS), exactly as the Table tab. Owner chose
  **subtitle only** (no per-version counts in the Versions card — one count(*) per version, run
  serially). Skipped entirely when the theme has no `subtitle` (project themes). Verified: Overview
  "3 rows (2025-03 effective)", Table tab v20 → "0 rows (2024-06 preliminary)", v21 → 3, no-versions
  source → "no versions yet", MNY → no subtitle; 0 errors. Decision 23.
- Owner follow-up: the tab row showed a horizontal scrollbar (my `overflow-x-auto` + the tabs'
  `-mb-px` always overflowed). `tabNav` is now `flex flex-wrap` (tabs wrap on phones, never scroll);
  mockups' shared tab bar mirrored. Breadcrumb `homeLink` `shrink-0 whitespace-nowrap` + `li` `first:shrink-0` ("data
  sources" was wrapping at 390). Verified 1440 / 700 / 390: no overflow, no scrollbar.
- Pre-existing, noted: the version `<select>` logs a React duplicate-key warning on the Table tab.

### 3. datasets · source admin — DONE + APPROVED 2026-10-07 (owner: "admin page looks good for internal and external sources")
- **`ui/components/Permissions.jsx` rewritten to the v3 layout (Decision 22)** — the shared grants
  editor, so the page Permissions pane, section menu, admin pattern Access page and datasets source
  Admin all get it (owner: all follow this UI; the who-can-do-what summary stays page-pane only).
  Every behavior kept: "+ group" / "+ person" (MultiSelect style `addAccess`; the pre-existing
  "Add group/user access" dummy option kept), own grants = name line + permission pills
  (`ColumnTypes.multiselect.EditComp`, new MultiSelect style `permissions` appended LAST in
  `MultiSelect.theme.js` — index-safe for mny's 2 / wcdb's 1 styles) + remove; inherited grants in a
  `<details>` ("Inherited from …" + count) with editable perms, disable here / reset / undo,
  changed here / disabled here labels; the keep-yourself-on note. New props `heading`,
  `inheritedFrom`, `summary` (summary to be passed by the page pane port). Callers: admin
  permissionsEditor ('on this pattern' / 'the site'), SourceAccessEditor ('on this source' / 'the
  pattern'), page permissionsPane ('on this page' / 'the pattern'), sectionMenu ('on this section' /
  'the page'). `Permissions.theme.js` re-keyed — no project theme overrides `permissions`, so no
  patches; project themes show the new layout (approved structural change).
- `default/admin.theme.js` ported; pre-v6 frozen in legacy `admin`. New keys (legacy value in
  brackets): `actionBtn` [''], `actionIcon` / `actionIconMetadata` / `actionIconAdd` /
  `actionIconDelete` ['' → no icons], `addVersionBody/Title/Label/Hint/Footer/CancelBtn/Btn` ['' →
  the DMS Add Version modal keeps its bare input + green add], `addVersionInput` [''],
  `addVersionError` (was hardcoded), `editableToggleHint` / `editableToggleMain` ['' → old order,
  reason stays a tooltip].
- `default/admin.jsx` + `internal/pages/admin.jsx`: icons on the three action buttons; DMS Add
  Version modal per mockup (title, "version name" label, "Leave blank for …" hint, cancel + primary
  add) when `addVersionTitle` is set; internal admin's hardcoded classes moved onto `datasets.admin`
  keys (legacy values identical to the old strings). Icon: `Add` (stroke plus) — the library `Plus`
  is a heavy filled cross.
- Mockup mirrored: action labels Title Case as implemented ("Advanced Metadata" / "Add Version" /
  "Delete Source"); no divider before Delete on DMS sources (DAMA keeps it — EditableToggle's border).
- Verified live (default light + dark, MNY): Access card with no grants, inherited expanded (changed
  here / disable here / reset), add group → grant row + keep-yourself-on admin@ `*`, persisted across
  reload; Add Version modal → view created, modal closes, subtitle "1 version"; MNY: old buttons and
  old bare modal, new Permissions layout. 0 console errors. Build clean. Lint: both admin.jsx and
  SourceAccessEditor = HEAD; Permissions.jsx +3 `react/prop-types` (the 3 new props; same rule as
  its existing 15).
- **Open — asked owner:** the DMS **Delete Source** modal is the shared `UI.DeleteModal`
  (`ui/components/DeleteModal.jsx`), which is unthemed (hardcoded gray/red; in dark mode the title
  is invisible and the `fa-danger` icon renders nothing). Used in 10 places (page pattern, table
  actions, metadata, schedule, version). Theming it is a UI-primitive change outside
  `_legacy/datasets.js`.
- **Finding (pre-existing, fix after design work):** internal source Admin's **Add Version is
  always disabled** on route-preloaded sources — it gates on `source.source_id`, which only
  getSourceData sets (preloaded items carry `id`); `addView` and the Tasks list
  (`sourceId={source.source_id}`) read the same field. Verified on the fixture by setting
  `data.source_id` on source 13. Fix: use `source.id || source.source_id` (as DeleteSourceBtn does).
- **Owner follow-up (2026-10-06): task status column too bright → DONE.** Root cause: the Table
  passes the cell's class to the column Comp, and StatusBadge put it on the badge `<span>` — the "pill"
  filled the whole cell. Now the cell wrapper keeps the Table class and a real pill sits inside.
  `UdaTaskList` reads the `datasets.udaTaskPage` status keys (shared with the task page); defaults →
  v6 soft tones (go / brick / cobalt / well, `t-metaXS rounded px-1.5`); pre-v6 values frozen in
  `_legacy/datasets.js` `udaTaskPage` (status keys only). Project themes keep their colors but now as
  a sized pill (structural fix).
- **Owner decision (2026-10-06): "theme it, and other themes can fallback to default for this. they
  can redesign their own delete modal." → DONE.** `ui/components/DeleteModal.jsx` reads a new
  `deleteModal` styles theme (`DeleteModal.theme.js`, registered in `ui/defaultTheme.js`), v6 values
  per the mockup: TrashCan icon in a brick-soft circle (`icon: ''` → none), t-displaySM title,
  graphite prose, cancel + solid brick delete. No legacy freeze — project themes get v6. Key names
  follow the `deleteModal` blocks transportny v2 and fusion had already declared (title / body /
  actions / cancelButton / deleteButton), and both blocks were reshaped to `styles[]` (a flat
  override is ignored once merged over a styles default); tny v2 got `deleteButton` (= its
  `confirmButton`); fusion's "forward-declared" comment updated. Vendored tny copy needs the same.
- Verified live: delete modal default light + dark, transportny v2 (its red uppercase brand title +
  button); task pills default light + dark, tny legacy colors as pills (4 seeded tasks on source 13).
  Build clean; lint DeleteModal.jsx and UdaTaskList.jsx = HEAD.
- **Owner follow-up (2026-10-07): one source delete, owner's wording.** "only hard delete is fine,
  rename hard delete to delete" + the supplied text. New `components/DeleteSource.jsx`:
  `DeleteSourceModal` (title "Delete source"; "Delete removes the source and every version, drops
  each version's data table, removes download files and deletes task history. This cannot be
  undone." / "To retire it without deleting anything, put it in the Archive category on the Overview
  instead." (Overview links to the source) / "To confirm, type the source name" + input; Delete
  disabled until the name matches; Cancel) and `DeleteDmsSourceBtn` (the internal admin's full
  `uda.sources.delete` cleanup, moved here). Used by: DAMA
  `DeleteDamaSourceBtn` in default/admin.jsx (now calls ONLY `uda.sources.hardDelete`; soft delete
  removed; also clears the datasets list cache), the default admin's DMS branch (was a bare
  `dms.data.delete` of the source row only — now the full cleanup, same as internal), and
  internal/pages/admin.jsx. `UI.DeleteModal` is no longer used for sources. Theme: existing
  `datasets.admin` deleteModal* keys + new `deleteModalBody` / `deleteModalLink` (legacy '' /
  'underline'); `deleteModalSoftBtn` now unused. Applies to every theme (behavior change requested
  by owner); project themes keep their legacy colors. Mockup: the two delete modals → one
  (`delete_modal_inner`).
- Verified live: default dark + MNY light render, arming works; a real delete of source 13 removed
  the row and its 4 tasks and returned to the catalog. DAMA hardDelete not exercised (no DAMA env
  locally). Build clean; lint default/admin.jsx 41 (HEAD 49), internal 16 (HEAD 23); new file only
  prop-types + the package-wide unused `React`.
- **Fixed (owner asked, 2026-10-07): internal Add Version always disabled** — finding 7. The
  internal admin gated Add Version, `addView` and the Tasks list on `source.source_id`, which only
  getSourceData sets; route-preloaded sources carry `id`. Now `source.id || source.source_id` in all
  three. Verified on source 4 (no `data.source_id`): button enabled, version created, Tasks list shows
  its task. (The `source_id` set on fixture source 13 earlier is no longer needed.)
- **Fixed: DAMA delete ignored server errors.** `uda.sources.hardDelete` returns failures as an
  `{ error }` atom (never throws); the button navigated away as if deleted. Now checks
  `result.error` / `deleted_source === false` like the DMS delete.
- **DAMA delete tested live 2026-10-07** on the docker test Postgres (`tests/postgres-docker.js`,
  :5499; owner started it). Setup: scratch server copy + `test_dama.config.json` (role dama → the
  server creates `data_manager.*` on first connect), Vite `VITE_DMS_PG_ENVS=test_dama`; seeded
  "Test Bridges" (2 views + `gis_datasets.s1_v1/v2` tables, 2 tasks, a file under
  `var/dama-files/test_dama/s_1/`) and control "Keep Me Roads" (1 view + table + file).
  - Error path (renamed `data_manager.tasks` to force a failure): the modal shows
    `Error: relation "data_manager.tasks" does not exist`, stays open, no navigation.
  - Real delete: source, both views, both tasks, both data tables and the storage folder gone;
    control source / view / table / file untouched; back on the catalog with 10 datasets (cache
    cleared). 0 page errors.
  - **Server finding → FIXED 2026-10-07 (owner chose option 2):** `hardDeleteSource` used to drop
    the view tables and storage files BEFORE the metadata transaction, so a failed delete left a
    listed source whose data was gone. Now (`dms-server/src/routes/uda/uda.tasks.controller.js`)
    the view SELECT, task / view / source deletes AND the `DROP TABLE`s run in one transaction (PG
    DDL is transactional); storage files are removed only after the commit (failures → `warnings`).
    Behavior change: a DROP failure now fails the whole delete instead of being a warning.
    `tests/test-transactions-pg.js` +2 cases (tables dropped on success; tables survive a failure) —
    13/13 pass on the docker PG; the new failure case FAILS against HEAD's function (verified).
    Ran with a local `dama-postgres-test.config.json` (git-ignored; deleted after, since role-dama
    configs auto-load at server start). UI re-check: failed delete → source, both views, both tables
    and the storage file all intact, error shown in the modal.
  - Pre-existing, noted: `uda…sources.byId[id].pkeyInfo` errors on a DAMA source with null
    `metadata` ("Cannot read properties of null (reading 'columns')"), and EditableToggle's
    `falcor.get(...).then` has no catch → 2 unhandled page errors on that Admin tab.
- Pre-existing, noted: UdaTaskList's column Comps spread Table column props (`Comp`, `show`,
  `hideControls`, `_hasFixedSize`) onto DOM elements → React warnings whenever tasks render.
- Admin pattern Access page (`/list/manage_pattern/:id/permissions`) checked light + dark: new
  layout renders. Its console warning (`customTheme` prop on a DOM element) is pre-existing — no
  changed file contains `customTheme`.

### 4. datasets · metadata — DONE + APPROVED 2026-10-07 (owner: "yes" to page 5)
- `components/MetadataComp/metadataComp.theme.js` ported (search row + "N columns · drag to reorder ·
  ⋯ for advanced settings" hint, amber dirty / pkey warning, rows in one card with alternating well,
  expanded row = ColumnManager treatment (Decision 18: outlined, neutral well body, no blue), IDX/PK
  badges over the grip, segmented controls, sectioned advanced panel, pill option tags with ×,
  remove column with icon, v6 modals with cancel). `gisPages` metadata keys (`metaOuter` page padding,
  read-only banner) ported. Pre-v6 values of both frozen in `_legacy/datasets.js`; every new key has
  a legacy value reproducing the old markup (verified: v6 keys ⊆ legacy keys).
- Component changes (all gated by keys whose legacy value is the old markup):
  - MetadataComp + RenderField + Metadata + RenderAddField read the theme as `{...default, ...site}`
    (was `site || default`, so a theme setting one key lost the rest).
  - Hardcoded `bg-blue-50` ×2, `#ffffff` lexical bg (white in dark mode), `font-semibold` → keys
    `fieldHeaderOpen`, `advancedSwitchRow`, `descBgColor`, `emphasis`.
  - New keys: `searchRow`, `searchInputWrap`, `toolbarHint`, `fieldRowOpen`, `gripCol` (legacy
    `contents`), `advancedToggleOpen` + `advancedToggleIcon(Open/Class)` (MenuDots / CaretDown; '' →
    "..."), `descEditor`, `buttonSelectStyle`, `tabsStyle`, `labelHint`, `optionRemoveIcon(Class)`,
    `optionEditRow`, `btn` / `btnPrimary` / `btnDanger` / `btnDangerSolid` (Button className; '' →
    activeStyle as before), `btnIcon`, `removeColumnIcon` ('' → "delete"), `modalFooter` ('' → no
    cancel), `mappedWrapper`, `metaWrapper`, `metadataHeaderLabel`, `metadataFieldLabel` (FieldSet
    label, only passed when set), `addFieldInputWrap`, `addFieldBtn` / `addFieldError` (v6: add
    disabled while empty/duplicate, "already exists" under the input; '' → old in-button error).
  - `placeHolder` → `placeholder` on the UI.Input / Textarea / FieldSet inputs (React DOM warning).
- Shared UI (opt-in, zero blast radius):
  - `UI.ButtonSelect` got a theme (`ButtonSelect.theme.js`, registered as `buttonSelect`): style 0 =
    the old behavior (UI.Button 'active' / 'plain'), named style `segmented` (v6). It had no theme
    and showed no selected state at all.
  - `UI.Tabs` named style `compact` appended (index 3; project themes define ≤3 tabs styles). Style 0
    renders the tab row BELOW a `h-screen` panel (pre-existing) — the lookup editor's Datasource /
    Custom tabs were a screen below the form.
- Project themes: transportny v1 overrides metadataComp almost fully — now also gets legacy `pkBadge`
  / `labelUpperCase` (were unset → unstyled). transportny v2, fusion, tessera(+v6) define stale keys
  the component never read (wrapper/field/…) → they rendered unstyled; now the legacy look.
- Mockup mirrored: plain search input, options-map switch + buttons in the grid, Title Case modal
  titles, the real lexical toolbar, notes on UI.Input height / segmented / compact / icons.
- Verified live (default light + dark, MNY): closed + expanded rows, dropdown column (options, option
  edit, options map), meta column (Datasource / Custom tabs), add-field duplicate → disabled +
  "already exists", add → remove column via modal (server row gone), external source (test_dama)
  remove-PK modal → removed → set on duplicate column → error box → restored on ogc_fid (PG confirms
  `pk_s2_v1`). MNY: unchanged legacy look. No page errors; no overflow. NOT checked live: read-only
  view (fixture has no non-editor user; the pattern redirects anonymous visitors to login).
- Build clean. Lint = HEAD for index / Metadata / RenderAddField / ButtonSelect; RenderField +9, all
  `react/prop-types` on the two new helpers (ModalActions, DescEditorWrap).
- **Owner follow-up (2026-10-07) — all done, verified live:**
  - No blue on this page: lookup tabs (`UI.Tabs` 'compact' active = ink + ink underline), save /
    add buttons (`btnPrimary`, `addFieldBtn` → the neutral bordered button, medium weight), IDX / PK
    badges (graphite on panel, ruled), option-tag hover (underline).
  - Search full width; the "N columns · drag to reorder · ⋯ …" hint removed (code + key + legacy key).
  - Expanding a row no longer shifts it: `fieldRowOpen` = the closed row's box (border-t, no margin)
    + an inset `outline` (an inset ring is a box-shadow and hides under the children's backgrounds).
    Measured: the next row's input stays at the same x/y/width before and after expanding.
  - The column list scrolls, not the page: `metaOuter` gets a definite height
    `h-[calc(100svh-176px)] min-h-[480px]` (breadcrumb 56 + header 120; the layout above is min-h
    only — same approach as the Table tab), `metaInner` / `container` flex-1 min-h-0, the card
    `min-h-0 overflow-y-auto` (natural height when it fits). 1440×900: document = viewport, list
    508 / 888 px. 600px tall: the 480 floor → page scrolls 56px. 390 wide: no overflow.
  - Mockup mirrored (badges, no-shift outline, full-width search, no hint, neutral save / add, ink
    tabs, scrolling card).
  - Still indigo: UI.Switch (unthemed primitive, below).
- **Owner follow-up 2 (2026-10-07): buttons beside inputs didn't line up — DONE.** UI.Input is 42px,
  the v6 buttons 32px, and FieldSet Buttons got the field theme's default wrapper (`mb-4`, lifting them
  16px). New keys `btnInline` / `btnInlinePrimary` / `btnInlineDanger` (min-h 42px) for options add,
  option-edit save, options-map update / remove, lookup save, custom add / update / remove; FieldSet
  Buttons get `customTheme` (metadataFieldTheme) when `btnInline` is set; `optionFormRow` /
  `addFieldRow` items-stretch, `addFieldBtn` min-h 42px. Custom tab: `customList` (gap between the
  key/value rows) + fixed 5.5rem button columns so the add row's inputs line up. Legacy: all '' →
  unchanged (MNY checked). Measured: every button's top/bottom = its input's.
- **Owner follow-up 3 (2026-10-07) — DONE:** column type select = display-name input height via a
  new opt-in `UI.MultiSelect` named style `input` (the default trigger with UI.Input's own padding,
  px-3 py-2.5, no min-height — owner asked for padding, not a fixed height); metadata key
  `typeSelectStyle` ('input'; legacy ''). Measured all 6 rows: select top/bottom = input top/bottom.
  Add / update buttons (options add, options-map update, custom add / update, new-column add) now
  read as action buttons like remove: outlined, no fill — `btnInline` / `addFieldBtn` = graphite
  border + ink text, hover well. (Lookup / option-edit "save" unchanged — `btnInlinePrimary`.)
  Correction: named styles merge by NAME (`mergeComponentStyles`, ui/useTheme.js), not index — the
  "appended last / index-safe" notes above were unnecessary (transportny v2 has 6 multiselect styles).
- **Owner follow-up 4 (2026-10-07) — DONE:** the row's advanced toggle uses the same padding as the
  input / select beside it (`px-2.5 py-2.5` + 1px border, icon `size-4 my-0.5` = a 20px line; was a
  fixed `size-8` + `mb-1`). Measured closed + expanded rows: input, select and toggle all 42px, same
  top/bottom.
- Pre-existing, noted: the pkey error box shows "[object Object]" — the known avl-falcor transport
  bug (server text: "Column bin cannot be a primary key … 2 duplicate value(s)"); UI.Switch is
  unthemed (hardcoded indigo / gray); the lexical toolbar dividers are white in dark mode; FieldSet
  passes `customTheme` to DOM inputs (React warning).

### 5. datasets · version — DONE + APPROVED 2026-10-07 (owner: "yes" to page 6)
- `dataTypes/default/version.jsx` was UNTHEMED → new `version.theme.js` (`datasets.version`,
  registered in datasets `defaultTheme.js`); its hardcoded classes frozen verbatim in legacy
  `version`. v6: title = version name (+ authority badge, "view N" right) — legacy keeps
  "<source> - <version>" via `titleSourceSep`; version card (label, input, "Saved as you type.",
  created / updated grid — legacy keeps them atop the controls column via `metaInMain`); controls
  card. DMS Clear Data / Delete Version → `dangerBtn` (+ TrashCan on delete); the Delete View modal
  title "Delete View" → "Delete Version" (matches its button; all themes).
- `ExternalVersionControls.theme.js` ported (neutral actions + brick destructive, no accent —
  owner's metadata direction; ink checkbox accent); pre-v6 values frozen in legacy. Component:
  Font Awesome `<i>` → `UI.Icon` with icon keys (`downloadIcon` / `pmTilesIcon` / `trashIcon` /
  `layerGroupIcon` / `deleteModalIcon`; legacy values are the old FA class strings, which UI.Icon
  renders as `<i>`); "downloads" eyebrow (`sectionLabel`); toggle-all off Button `themeOptions` blue
  (`toggleAllBtn`); modal widths (`createModalPanel` / `pmTilesModalPanel`); PM tiles modal header
  (`pmTilesModalHeader` / `pmTilesModalTitle`; legacy none).
- Bugs fixed on the way (all themes):
  - "one or more must be selected" icons were `CheckCircleIcon` / `XCircleIcon` — not registered →
    fallback shield. Now `CircleCheck` / `CircleX` (`validIcon` / `invalidIcon`, legacy too).
  - "Delete Download" never showed: it checked `view.metadata.value.download`, but the views route
    unwraps the atom → `view.metadata.download`. Accepts both now.
  - DMS version title / input blank: `currentView` was only refreshed on a view-id change, and DMS
    view names resolve after the first render. Now also refreshes when the name arrives; the input
    is always controlled (`|| ''`, React warning gone).
- Verified live: DMS (internal 4 / v21) + DAMA (test_dama source 2 / view 3) light + dark, create
  download modal, PM tiles modal, delete download modal (fake download in view metadata); MNY both
  source kinds = old look (+ the name fix). 0 page errors, no overflow. Not exercised: actually
  creating / deleting a download or PM tiles (needs the DAMA download workers).
- Mockup mirrored (neutral actions / icon circles, ink checkboxes, Title Case labels, hint, Delete
  Version title). Build clean; lint version.jsx 53 (HEAD 54), ExternalVersionControls 61 (HEAD 62).
- Still open (finding 2): "Delete View" links to `/source/:id/versions/:view/delete` — no route.
- **Owner follow-up (2026-10-07) — DONE:** DMS version created / updated were blank, and the Overview's
  Created / Updated + each version's "published" date too. `InternalViewAttributes` never asked for
  the row timestamps and `resolveInternalViewNames` dropped them; `SourcePage`'s preloaded-item path
  never derived the source's created / updated (getSourceData does: first view / last view). Added
  `created_at` / `updated_at` to `InternalViewAttributes` (the UDA views route serves them — checked),
  copied them through, and the SourcePage resolve effect now sets created = first view, updated =
  last view. Verified: version page 2026-10-06 20:01:57 ×2; Overview Created Oct 6 / Updated Oct 7,
  "published …" on every version.
- **Owner (2026-10-07): after this redesign** → button + pill consistency audit, its own task:
  [ui-control-consistency-audit.md](./ui-control-consistency-audit.md).

### 6. datasets · create — DONE + APPROVED 2026-10-07 (owner: "yes" to page 7)
- `pages/createPage.theme.js` ported (+ now merged over the default — CreatePage read
  `datasets.createPage || {}` with inline fallbacks); pre-v6 values frozen in legacy `createPage`.
  v6: "New source" + intro line, **Type card picker** (Decision 13; `typeCards` '' → the MultiSelect),
  cards for "Create new" (= "Blank table") + every registered dataType, known types first in
  TYPE_INFO order (Table, GIS, CSV, File), unknown plugins get a generic card; selected card = ink
  (no accent colour); name field; plain create / cancel (`createBtn` / `cancelBtn`); no LayoutGroup
  (`content` '' → LayoutGroup). Fix: picking "Create new" wiped the typed name — kept now.
- **Numbered steps** — new `components/CreateStep.jsx` (step* keys on `datasets.createPage`; `step`
  '' → renders only its children, so legacy markup is unchanged). `collapsed` keeps a part MOUNTED
  but hidden: the GIS select-layer / schema-editor parts run the polling + fetches that advance the
  flow (my first pass only mounted them once ready → the flow stalled at "Sending GIS file").
  - internal_table sourceCreate: 1 Create the table (Create & Upload + hint) → 2 Upload rows.
  - file_upload: 1 Select a file (icon button) → 2 File info (kv list, directory, description, Upload).
  - gis / csv: 1 Upload file → 2 Select layer → 3 Map fields → 4 Publish (done / active / todo dots).
- `file_upload/CreatePage.theme.js` ported; the components read `datasets.fileUploadCreatePage` but
  the registered key is `fileUploadCreate` — unified on the registered key; legacy frozen there.
- `gisCreate.theme.js` ported; legacy frozen. Inline `style={}` objects (upload / publish error
  tables, progress bar, layer-analysis thead, schema header padding, "all assigned" gray) now only
  apply with `legacyInlineStyles` ('yes' in legacy). The file input, per-row checkboxes, the
  schema table card, the "analyzing" line, publish row + hint got keys. Publish state colours now
  come from `publishBtnAwaiting / InProgress / Error` (they existed but a hardcoded map was used;
  legacy values equal the old map).
- Bugs fixed (all themes): `PublishErrorMessage` used an undefined `t` → any publish error crashed
  with a ReferenceError; "Create new" name wipe (above).
- File card icon: `PageRound` (`Page` has a hardcoded #2D3E4C fill — still in the icon finding).
- Verified live (default light + dark): card picker + order; table flow steps; file flow (select a
  real file → file info); **GIS flow end to end on test_dama** — upload pts.geojson → select layer →
  map fields → Publish → navigated to `/source/15/uploads/18` (the unregistered uploads page —
  finding 3, its own page later). MNY: dropdown + old GIS layout, flow works. 0 page errors. Lint =
  HEAD on all 9 files (publish/index.jsx −1: the undef); build clean. Mockup mirrored (ink, Blank
  table card, labels as built, ink checkboxes / progress, neutral Publish / Create).
- Not exercised: actually creating a table / file source (create calls are unchanged code).
- Owner follow-up (2026-10-07): page narrower than the mockup — `content` had max-w-4xl on the same
  box as its padding (content ≈ 51rem); the mockup puts max-w-4xl INSIDE the padding. Now
  `box-content max-w-4xl pl-6 lg:pl-12 pr-6 lg:pr-8 py-8` → card grid 896px (56rem) like the mockup;
  no overflow at 1440 / 390.
- **Owner follow-up (2026-10-07): wrong icons + wrong font size / weight — DONE.**
  - Root cause of the type mismatch is SYSTEMIC: `ui/defaultTheme.js` injects the `.t-*` type
    classes UNLAYERED, and Tailwind v4 keeps utilities in `@layer utilities` — unlayered CSS beats
    every layer, so a utility next to a `t-*` class (`t-proseSM font-medium`, `t-metaMD text-[11px]`,
    `t-metaXS normal-case`…) was silently ignored on every default-theme page. The mockups load the
    Tailwind CDN after `_shared.css`, so there the utility wins. Fix: the injected `.t-*` block (+ its
    media query + `.t6-sheet-fade`) now sits in `@layer components`. Create page computed styles now
    = mockup (heading 22/600, card label 14/500, key 11/500, blurb 12.5/400). ~30 theme files mix
    t-* with a size / weight / case utility (datasets, admin, auth, page sections, Tabs, Permissions,
    DeleteModal) — they now render what they say, i.e. closer to their mockups. Spot-checked: catalog,
    source overview (tabs / card titles now medium, per mockup), admin site list, auth users — no
    breakage, no overflow, no page errors. tessera_v6 sites inject their own unlayered `_shared.css`
    → unchanged. Gotcha: that CSS lives in a JS template literal — no backticks in its comments.
  - Icons: added tessera's `Table`, `Map`, `File` and its column-bars glyph as `TableColumns` to the
    library registry (`ui/icons/icon_defs.jsx` + `index.jsx` iconList; library `Columns` is a
    different glyph, kept). Type cards now: Table / Map / TableColumns / File (Blank = `Add`).
  - Noted (not from this change): `/list` shows "undefined" pattern names on the fixture.

### 7. datasets · internal (Upload / Validate / Debug tabs) — DONE + APPROVED 2026-10-07 (owner: "yes" to page 8)
- `components/upload.theme.js` ported (dashed dropzone, sheet / primary-column fields with
  labels + hint, pivot card, column-matching table card, neutral publish); pre-v6 frozen in legacy
  `upload`. Hardcoded classes in upload.jsx moved to keys (pivot info icon, primary-col hint, search
  label / input, geo checkbox, "No columns available."), legacy values = the old strings.
- `components/validateComp.theme.js` ported: stat boxes as one ruled strip, number above label
  (`flex-col-reverse` over the live "Label: <value>" markup; invalid brick / valid go via
  nth-child), neutral Re - Validate (error → brick outline, mono), "Invalid Rows" section header,
  fix-values modal (eyebrow + title + close in one header row — `modalHeader` gate; footer —
  `modalFooter` gate; reset as a quiet link), error-count badge (brick pill), filter toggle neutral
  (`filterIcon` key; legacy keeps the hardcoded `text-blue-500`). ValidateComp now reads
  `{...default, ...site}` (was `site || default`; transportny v1 sets every old key → unchanged).
  The invalid-rows spreadsheet is the page pattern's Spreadsheet — keeps that theme.
- New `internal/pages/internalPages.theme.js` (`datasets.internalPages`) for the three unthemed tab
  wrappers: page padding, the Upload intro line ("Add rows to <version> from a spreadsheet…"),
  "Please select a version" / "Please setup metadata." text, Debug as a "raw source json" card.
  Legacy = the old markup (validate keeps `page.wrapper1 max-w-7xl mx-auto bg-white`).
- Verified live (default light + dark, MNY): Upload (intro + dropzone), Validate with real counts
  (3 / 2 / 1) and the invalid-rows table; MNY unchanged. 0 page errors (the version-select key
  warning is the known one). NOT verifiable on the sqlite fixture: (a) validation counts at all —
  rows store `isValid` as a JSON boolean and sqlite `data->>'isValid'` returns 1/0, not
  'true'/'false' (Postgres-only semantics; I set string flags on two rows to see the counts);
  (b) per-column invalid-count badges + the fix-values modal — their invalid-value query is
  Postgres-only; (c) the Debug tab — the legacy `internal` dataType isn't registered on this site
  (SourcePage falls back to internal_table). Their changes are theme keys + gated wrappers.
- Build clean; lint = HEAD (ValidateComp +2 react/prop-types on the new ModalFooter helper).
  Mockup mirrored (no accent, neutral buttons, as-built notes).



- [ ] Datasets: port the 19 `.theme.js` defaults to the approved mockups; theme the unthemed
  surfaces (`version.jsx`, `UdaTaskList`, `schedule/*`, `internal/admin.jsx`) onto new keys.
- [ ] Page: port the 12 `.theme.js` defaults; move the edit pane / drawer / busy indicator onto a
  new theme key (e.g. `pages.editPane`) — first decide the key shape.
- [ ] Replace tessera v6's stale `datasetsTheme` / reconcile `pagesTheme` with the new defaults
  (delete keys the default now provides identically, keep only genuine tessera-brand deltas).
- [ ] Re-key audit: for every renamed/split/new key, grep every project theme
  (`src/themes/*`) and patch the overrides so each project keeps its current look.
- [ ] `npm run build` clean; eslint on touched files (compare against `git show HEAD:<path>` for
  pre-existing errors).
- [ ] Live verification (Playwright on the scratch-sqlite setup — never the user's 5173 dev server):
  default-theme site + one site per project theme, light + dark.

### 8. datasets · uploads — DONE + APPROVED 2026-10-07 (owner: "yes" to page 9)
- **Data rewired (the page was dead on dms-server):** it read `dama[env].etlContextsbyDamaSourceId`
  / `dama[env].etlContexts.byEtlContextId` — legacy DAMA-server routes dms-server doesn't serve
  (empty atoms). A load is now a DAMA task (the publish returns the task id as `etl_context_id`;
  checked: task 18 = `gis/publish` for source 15, 42 events), so the list reads
  `uda[env].tasks.forSource` (Id · Status · Type · Queued · Completed — was Initial / Latest Event
  Id + Last Updated) and one upload reads `uda[env].tasks.byId[id]` status + `.events` (first 500).
  Same routes as the Tasks list / task page.
- Verified live (test_dama source 15, default light, MNY): list → task 18 with an error pill; row
  click → `/data/source/15/uploads/18`; the 42 events with "all uploads" back link + "Upload 18"
  + status; MNY shows the same data in its old layout. 0 page errors, no overflow. Build clean;
  lint index.jsx 3 (HEAD 4, incl. the 2 rules-of-hooks errors — fixed), list / view only
  react/prop-types; SourcePage +4 react/prop-types. Mockups rebuilt.
- Found: the page-6 GIS publish I ran (task 18) actually ERRORED server-side, yet the create flow
  navigated on as if published (PublishComp treats any final response as success) — logged.
- **Hooked up (Decision 11, finding 3):** `gis_dataset/pages/Uploads` registered as the `uploads`
  page of gis_dataset AND csv_dataset (csv publishes through the GIS create flow), lazy
  (`lazyPages.GisUploads`), `cdn: () => false` (hidden from the tab bar, like Metadata — the
  publish flow lands on `/source/:id/uploads/:ctx`).
- Uploads fixes: reads the ctx id from `params.view_id` (the source route's trailing segment; it
  read `useParams().viewId`, which doesn't exist → the per-upload view could never show); hooks
  before the early return (it returned before `useEffect` → hook-order error); list rows navigate
  with `pageBaseUrl` (was `/source/…` without the pattern base url).
- SourcePage subtitle: the URL's trailing id counts as a version only when it matches one (on
  Uploads it's an ETL context id — would have named a "v18").
- `uploads.theme.js` ported (page padding, "Upload Views" + hint, card tables, id cells ink, back
  link "all uploads" + "Upload N" + status on one upload); status cells reuse the task status pills
  (`datasets.udaTaskPage`, `statusPill`). Pre-v6 frozen in legacy `uploads` (incl. new keys: no
  page wrapper / hint / back link, plain status text).
- Mockup script mirrored (`uploads.py`: ink ids, neutral back link, "Upload Views", registered note).

### 9. datasets · settings — DONE + APPROVED 2026-10-07 (owner: "yes" to page 10)
- `pages/settingsPage.theme.js` ported (it was already fully keyed + on getComponentTheme): one card
  style for every panel (Environment, Source Lists, Catalog visibility, New-source defaults, Legacy
  category filter), quiet well effect strip (was a dark slate panel), required = brick chip,
  overridden / deprecated / Sandbox-visible warning = amber, reset = quiet dotted link, ink
  checkboxes, category pills with count. No accent colour. Pre-v6 frozen in legacy `settingsPage`
  (transportny v1 overrides some keys — unchanged for it).
- `SettingsPage.jsx`: new `content` key — v6 lays the page out in a padded `box-content max-w-4xl`
  column (as the create page / mockup); '' → the LayoutGroup card (pre-v6).
- Verified live (default light + dark with a PG env so all five panels render, MNY): matches the
  mockup bar the switches (UI.Switch — the separate ui-primitives task); MNY unchanged. 0 errors,
  no overflow. Build clean; lint = HEAD. Mockup mirrored (no cobalt, title case, as-built note).

### 10. datasets · map — DONE + APPROVED 2026-10-07 (owner: "yes" to page 11)
- `gis_dataset/pages/Map/gisMap.theme.js` ported (already ~100 keys): floating panel cards
  (legend, legend controls, threshold editor, hover) on panel / rule / lift shadow, eyebrow labels,
  mono ticks, ink selected colour scheme, neutral buttons / inputs, small ink switch for "reverse
  colors"; map height = `100svh − 176px` (the v6 header). No accent colour. Pre-v6 frozen in
  legacy `gisMap` (transportny v2 overrides some keys — unchanged for it).
- Fixes (all themes): **the legend controls were unreachable** — `LegendContainer` got `toggle` /
  `isOpen` but never rendered a button; now a settings-gear button in the legend header
  (`legendToggleBtn` / `legendToggleIcon`; legacy gets it too, plain). Controls scroll area height
  was an inline 30rem → `legendControlsScrollHeight` (v6 12rem; legacy 30rem). Legend body got a
  key (`legendContainerBody`).
- Settings → Sources & Layers modal (Map.jsx): Modal style from `settingsModalStyle` (legacy
  'wide' — that style is light-only; v6 → default + `max-w-3xl! text-left`), a title / close /
  description header (`settingsHeader` gate — UI.Modal renders no title), the edit pencil through
  UI.Icon (`PencilSquare`; legacy = the old Font Awesome class string, which UI.Icon renders as
  <i>), always-visible edit button, Save / Cancel off Button `themeOptions` (`editSaveBtn` /
  `editCancelBtn`, legacy '' → themeOptions).
- Verified live (default light + dark, MNY): map fills to the page bottom, Settings header action,
  the modal + edit mode (textarea, Save / Cancel); MNY modal = old wide style. NOT verifiable
  locally: legend, hover card, legend controls, threshold editor — they need a published view with
  tiles, and every local GIS publish fails: the docker `postgres:17-alpine` has no PostGIS
  (`AddGeometryColumn` missing). Build clean; lint Map.jsx = HEAD, Layer2.jsx 145 (HEAD 147).
  Mockup mirrored.

### 11. datasets · tasks (list + task page) — DONE 2026-10-07 + APPROVED 2026-10-07 (owner: "yes" to page 12)
- `pages/Tasks/UdaTaskPage.theme.js` (`datasets.udaTaskPage`) fully ported (status keys were already
  v6): info row = one card, lowercase pencil labels, mono task id, source = ink underlined link to
  the source (`/source/:id`, or `/internal_source/:id` for DMS tasks), error = brick and capped at
  `max-h-40` with scroll (ogr2ogr errors run to dozens of lines); events = a card with an "Events · N"
  header and a striped plain table (mono ids / types, ERROR types brick, wrapping messages,
  300px payload textarea, 4 rows); running chip gets a pulsing dot (`statusRunningDot`).
- **New `pages/Tasks/UdaTaskList.theme.js` (`datasets.udaTaskList`)** — the list was unthemed:
  plain table, ink underlined task-id links, mono duration, and the empty state ("No tasks yet", with
  per-source wording when `sourceId` is set; shown only once the count came back 0). It also themes
  the /tasks page chrome (UdaTasks.jsx: heading + hint, card). This same list renders in the Tasks
  card on a source's Admin page (page 3), so that card changes too (verified, incl. the empty state).
- New shared `components/TaskTable.jsx`: a plain read-only table for both. Cell Comps get `{value}`
  only, so **the v6 path no longer logs the React non-DOM-prop warnings** (the UI.Table path still
  does; that finding stands for legacy themes).
- Gates (legacy value `''` in `_legacy/datasets.js`, `udaTaskPage` now fully frozen + new
  `udaTaskList`): `table` '' → UI.Table; `page` '' → LayoutGroup; `header` / `eventsHeader` /
  `emptyTitle` / `taskInfoSourceLink` / `statusRunningDot` '' → not rendered; `taskInfoSep` ':' keeps
  "Task:" labels.
- Fixes (all themes): finding 1, the task page's "Tasks" crumb now links `/tasks` (was `/tasks-new`);
  the list crumb is "Tasks" (was "Tasks (New)"). Info-row order: progress now comes before the
  full-width error.
- Pagination stays UI.Pagination (table theme, which already draws its own top rule). Its v6 look,
  including the cobalt active page, is in the on-hold ui-primitives task.
- Verified live (default light + dark, MNY): /tasks (11 DAMA tasks, 2 pages), /task/18 (errored gis
  publish, 42 events, payloads), /task/99999 (not found = brick), source 15 Admin (one task),
  source 2 Admin (empty state). MNY is unchanged (UI.Table). 0 errors on the v6 pages, no overflow.
  Not verified: a live running task (no fixture), so the pulsing dot was seen only in the mockup.
  Build clean; lint delta = only react/prop-types on the new cell Comps (the repo-wide pattern).
  Mockups mirrored (tasks.py + source_admin.py: ink id links, no PROPOSED on the empty state,
  pagination note, as-built comment).
- Follow-up (owner, 2026-10-07: "overview page: the table can't scroll horizontally"): the source
  Overview columns table sat directly in the `overflow-hidden` card, so wide content was clipped. New
  `sourceOverview.tableScroll` wrapper (v6 `overflow-x-auto`; legacy `overflow-x-auto` too, since every
  theme had the bug). v6 table gets `min-w-[36rem]`, so phones scroll instead of squeezing the
  descriptions. Legacy `mainCol` / `sideCol` get `min-w-0` so the grid column can shrink. Verified:
  default 1440 + 390 (light / dark), MNY, injected long column name scrolls, page overflow 0. Mockup
  mirrored (source.py).
- Noted (not from this change): source 15 Admin logs a pageerror because view 30's table was never
  created (its publish failed: no PostGIS).

### 12. datasets · errors — DONE 2026-10-07 + APPROVED 2026-10-08 (owner: "start the page pattern")
- **Error page** (`pages/dataTypes/default/error.jsx`, the datasets routes' errorElement): new theme
  `pages/dataTypes/default/errorPage.theme.js` (`datasets.errorPage`). v6 keeps the site nav
  (`keepNav`; legacy '' hides side + top nav as before) and shows a card: brick alert icon,
  "Something went wrong", the old sentence, **Try again** (`navigate(0)`) + **Back to data sources**
  (`baseUrl`, now passed in from siteConfig since there's no DatasetsContext at the errorElement).
  Both buttons are neutral (no accent). `page` '' → the old markup, its inline classes moved verbatim
  to `legacyInner` / `legacyText`.
- New shared `components/StatePanel.jsx` (icon + title + text + actions, brick / amber tone), styled
  by `datasets.errorPage`.
- **Source page** (`SourcePage.jsx`, `sourcePage.theme.js`):
  - Not found (was PROPOSED; live showed "…" and either an empty Overview for DAMA or a blank body
    for DMS). v6 now shows an amber "No source #id" card with Back to data sources, no header band
    or tabs, and the crumb "#id". Detection: `getSourceData` now flags `missing` when no attribute
    came back (it stamps id / source_id on regardless). A DMS route that preloads no row hands over
    an empty `item`. Gate `notFound` (legacy '' keeps the old behaviour).
  - Loading: title / subtitle placeholder bars (`titleSkeleton` / `subtitleSkeleton`, legacy '' → "…").
- **Follow-up (owner, 2026-10-08: "source not found doesn't work for internal_source. make sure other
  error pages work for internal sources too"):**
  - `internal_source/:id` loads ANY DMS row by id, so a version id (e.g. `/internal_source/20`)
    rendered the version as a source page. New `isNotSourceRow(type)` in `dataTypes/default/utils.js`:
    a source row type must end in `:source` or `|source` (strict, per the owner, so a future kind
    that merely ends in "source" doesn't pass). Used for the preloaded `item` and in `getSourceData`'s
    `missing` flag. The crumb shows "#id" (it showed the version's name).
  - **Version tabs** (table / upload / validate / map; `sourcePage.versionStates`, legacy ''):
    - no versions → amber "No versions yet" card with an **Open admin** link (internal sources
      SHOW these tabs with no versions; live said "Please setup metadata." / "Please select a
      version");
    - a URL version id that isn't one of the source's versions (`/4/table/999`) → "No version #999"
      card with **Open the current version** (the preferred / latest view). Before, it was an empty grid.
    - Uploads (its trailing id is a task id) is not a version tab, so it's unaffected.
  - StatePanel's title is now an `h2` (the source title is the page's h1).
  - Verified (default light + dark; MNY unchanged): internal 20 / 21/table / 1 / 4471 (+ metadata /
    admin / validate) / 13 (deleted) / abc → not found; 14/table, upload, validate → no versions;
    4/table/999, 4/validate/999 → no version; DAMA 2/table/999, 15/map/999 → no version; error page
    on `internal_source/boom` (+ /table) and `source/boom` via a temporary throw (removed, grep
    clean); real pages 4/table/26, 4/upload/21, 4/validate/21, 2/table/3, 15/uploads/18 unaffected.
    Build clean; lint delta = prop-types only. Mockup mirrored.
  - ~~Legacy themes keep the old behaviour~~ — superseded below.
- **Missing states for every theme (owner, 2026-10-08: "it's fine to render the pages other themes miss
  in default look … we mainly care what mny and transportny renders. so adding their own colors is
  fine").** States the pre-v6 pages never had are now on for ALL themes; restyles stay legacy.
  - `_legacy/datasets.js`: the gates for (1) catalog empty / no-hits (`datasetsList.empty*`), (2)
    source not found (`sourcePage.notFound*`), (3) version-tab cards (`sourcePage.versionStates`),
    (4) no-tasks card (`udaTaskList.empty*`) now carry real values in the pre-v6 gray/white
    palette. They use no `--t-*` tokens (a site without the default pattern may not inject them).
    Plus `errorPage` StatePanel keys in that palette. The error page itself (`keepNav` / `page`) and
    the loading skeleton stay legacy (they're restyles; those themes already have them).
  - MNY (`mny/theme.js`, `mnyDatasetStates`): own palette — Oswald uppercase titles #2D3E4C, Proxima
    #37576B text, MNY pill buttons, amber #EAAD43 / red #DD524C icon tints, #C5D7E0 dashed borders.
    `notFound` pads to `pt-28` so the floating MNY header doesn't cover the card (no header band there).
  - TransportNY v2 (`transportny/themev2.js`, `tnyDatasetStates` + `mergeDatasetStates`): navy /
    #0F1722 ink, font-display titles, Proxima text, `rounded-[8px]` cards, the `max-w-[1480px] pl-12
    pr-8` column. TransportNY v1 gets the generic legacy palette.
  - Verified (MNY + TNY v2): catalog no-hits, `/source/4471`, `/internal_source/20`,
    `/internal_source/14/table`, `/internal_source/4/table/999`, `/source/2/admin` (no tasks). 0 new
    errors (the version select's duplicate-key warning is pre-existing), no overflow. Build clean.
- NOT built: the **no-access** state. `view-source` isn't enforced anywhere (route `reqPermissions`
  is a no-op, a known auth gap), so it's a behaviour / security change, not design work. Left
  PROPOSED in the mockup. ~~**Not needed:** "view-dependent tab, no versions yet"~~ — wrong for internal sources, built in
  the follow-up below.
- Verified live (default light + dark, MNY): error page via a temporary forced throw (removed; grep
  clean), not-found for DAMA `/source/4471` and DMS `/internal_source/4471` (+ 390), real sources 2
  and 4 unaffected, MNY error page and not-found unchanged. 0 errors, no overflow. Build clean;
  lint delta = react/prop-types only (SourcePage +6, StatePanel new). Mockup mirrored (ds_error.py).
