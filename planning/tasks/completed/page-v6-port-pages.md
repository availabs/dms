# Page pattern v6 port — per-page record (pages 13–19)

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

Part of [datasets-page-pattern-v6-port.md](./datasets-page-pattern-v6-port.md). The hub keeps the process rules,
the mechanism (`_legacy/*` freezes), the decisions and the file list; this file is the per-page
implementation record, in page order.

### 13. page · view (published page chrome) — DONE + APPROVED 2026-10-08 (owner: "continue page edit")

Mockup: `page-view.html` (`scripts/page_view.py`). Scope = the page pattern's own chrome around
sections in view mode; section *content* (lexical, Card, Graph…) and Phase A primitives (Layout,
SideNav, LayoutGroup, NavigableMenu) are out of scope.

**Mechanism — `src/themes/_legacy/pages.js`** (new): `legacyPages` + `withLegacyPages(own)`, wired
into all 18 project themes next to `withLegacyDatasets` (mny_admin inherits via `...mny.pages`).
Unlike datasets, it freezes **only the keys a port changes/adds**, and merges with the library's
own `mergeTheme` (imported from `ui/useTheme`) so `styles[]` components merge styles[0] and keep a
theme's named styles at their indices. Future page-pattern ports: add the pre-port values of the
keys you change; nothing else to wire.

**Ported (library defaults → v6, no accent colour):**
- `section.theme.jsx` styles[0] header band: `headerRow/Inner/TitleWrap/Actions` (sentence-case,
  no uppercase/font-display; help + tags beside the title via `order-*`), `headerKicker` ON
  (`description` shown as a right-edge t-metaXS meta line). New keys: `headerTitleLevels`
  (per-level title classes replacing `theme.heading[level]` for section titles; '' = old lookup),
  `tagButton/tagIcon/tagPopup/tagList`, `helpButton/helpIcon/helpPopup` (were hardcoded in
  `section_components.jsx`; `TagComponent` gained `wrapperClassName/listClassName`).
  HEADER_DEFAULTS carry the old literals → `viewSectionHeaderLegacy` + `sectionHeaderTokens`
  tests pass (24/24).
- `sectionGroup.theme.js`: InPageNav ("On this page" label, hairline rail, ink marker on the
  section in view), modal band (scrim, panel card, XMark close that overlaps instead of pushing
  content), rail `sideNavContainer2` pins at top-6 (default Layout has no top nav).
- `sectionArray.theme.jsx` view keys: `sectionHighlight` (amber dashed outline on the #id
  target), `border`/`borderSides` (#E0EBF0 → `--t-rule`), `backgrounds` (white/tint → panel/well).
  Grid/sizes untouched (6-col default; changing it would remap every stored section size).
- `userMenu.theme.jsx` whole default style: avatar + sync ring (go/amber/brick/rule-strong),
  identity in t-metaXS, bordered edit toggle (hover ink), sync/room rows in tokens, login link
  shows "Login". New key `viewAsText` (the "Viewing as" line was hardcoded amber-700 in
  `userMenu.jsx`).

**Verified** (scratch server; new seed `srv/seed3.mjs`: page patterns `/p` (no theme), `/p-mny`
(mnyv1), `/p-tny` (transportnyv2), each with a Flooding page — header/content/sidebar/footer/
modal groups, nav labels, help text, tags, description, hidden section): default light + dark,
help popup, user-menu dropdown, modal (opened via the PageContext `setActionParam`), `#id`
highlight; MNY + TNY unchanged (legacy band, round pill buttons, uppercase titles, their own
rails/modals). No new console errors, no horizontal overflow. `npm run build` OK. Lint: +2
`react/prop-types` (the two new TagComponent props; file already has 40 of that rule), rest 0.
Mockup mirrored (`page_view.py` header = title · help · tags-popup · right kicker; ink InPageNav
marker; modal close; header band is a content band; `common.py` edit toggle hover ink, collab
count graphite; `icons.py` Tags glyph). `check.mjs` clean.

**Findings (not fixed):**
- Cold-start sync race: on a fresh IndexedDB the first load of a page renders every section
  blank — the post-bootstrap re-render hands `item.sections` back as bare `{id, ref}` stubs; a
  reload renders. (Local only so far; `shot.mjs` now has `RELOAD=1`.)
- A `position: 'top'` section group renders via Layout `headerChildren`, full-bleed above the nav
  wrapper, so with a sticky side nav (default, TNY v2) its content sits under the nav. Pages use
  content bands for headers; worth a Layout look later.
- `UI.Popup` passes `setOpen` to its child DOM node (React unknown-prop warning on opening a
  section's help popup) — pre-existing.
- Rich-text `element-data` must be `{"text": <lexical state>}` (seeding gotcha, not a bug).

### 14. page · edit (edit chrome: section states, edit bar, publish, drawer shell) — DONE + APPROVED 2026-10-08 (owner: "do drawer panes")

Mockup: `page-edit.html` (`scripts/page_edit.py` + `page_common.py`). Page 13 approved by the owner
("continue page edit"). Scope split: this page = the edit CHROME; the drawer's pane CONTENTS (Settings
v3, new Filters pane, Section groups / Pages / History / Permissions v3, removing Data sources) are
page 15 (page-edit-panes); the section menu itself (NavigableMenu, still blue action pills) is the
section-menu page.

**Ported (library defaults → v6, neutral — no accent):**
- `sectionArray.theme.jsx` edit keys: `sectionEditHover` (strong rule), `sectionEditing` (dashed
  ink), `sectionHighlight` (dashed amber overlay), `gridviewGrid/Item` (dashed columns over well),
  `addSection*` (rule · pill · rule; "Add" on pill hover). New `addSectionEndWrapper` /
  `addSectionEndButton`: the add button after the last section is always visible (pre-v6: only on
  hover of a 1px box). **Structural:** view mode now renders `sectionHighlight` as an overlay div
  (as edit mode always did) instead of a class on the section wrapper — one value works in both;
  for legacy themes it's the same dashed box.
- `section.theme.jsx` edit keys: `menuPosition`, `editHeaderRow` / `editHeaderTitleWrap` (the
  SectionEdit header was hardcoded `font-display uppercase`; its title now uses
  `headerTitleLevels` too), `hiddenPill` / `hiddenPillIcon` ('' → UI.Pill orange), `helpEditPopup`
  / `helpDeleteIcon` (HelpTextEditPopups was hardcoded; reuses `helpButton/helpIcon`). The header
  defaults + `sectionToken` / `sectionTitleClass` moved to `section_utils.js` (a .jsx may export
  only components — Fast Refresh rule).
- NEW `pages.editPane` (`pages/edit/editPane/editPane.theme.js`, registered in page
  `defaultTheme.js`): bar on the board surface, lit active pane + lit grid toggle, Draft/Published
  marker, Discard + Publish buttons (chalk on board; '' `publishBtn` → the old UI.Button pair),
  busy indicator (amber dot, above the bar), `drawerWidth`, `tabsStyle`, `tabIcon`. EditPane /
  LoadingDisplay / EditDrawer / PublishButton read it (all hardcoded before).
- UI `Tabs` named style `editDrawer` (appended LAST, opt-in by name): equal icon tabs with an ink
  underline, pane title lifted into the drawer header beside the close button. The drawer used
  `activeStyle 'pages-pane'`, which the library never defined → style 0 (mono, cobalt);
  project themes keep `pages-pane` via the legacy freeze (MNY defines its own).
- `Grid` icon registered in the library (the edit bar's grid toggle drew the fallback glyph in every
  theme without its own `Icons.Grid`) — applies to all themes, like a missing state.
- Fixed the grid overlay's missing React `key` (pre-existing warning).

Legacy freeze (`_legacy/pages.js`): section + sectionArray edit keys above, whole `editPane` (the
old literals, `tabsStyle: 'pages-pane'`, `publishBtn: ''`).

**Owner follow-ups (2026-10-08):**
- "section menu icons, their size don't match to mockup" → the action-row icons (copy link / copy /
  paste / move / refresh / edit / save / cancel / back / home) were hardcoded `size-5` in
  `sectionMenu.jsx`; now `pages.section` `menuActionIcon` (v6 `size-4`, legacy `size-5`). Colours
  (blue/orange pills) wait for the UI-primitive redesign (owner: "i expect the color to be fixed when
  ui component redesign is done" — `ui-primitives-default-theme.md`).
- "none of the section menu items show arrow / carat icon for submenu" → NavigableMenu's
  `subMenuIcon: 'ChevronRight'` was never registered in the library icon set, so it drew the fallback
  shield. Registered (v6 paths) every name the section menu / user menu ask for that was missing:
  ChevronRight, Trash, Users, X, Logout, Column (Width), Row (Height / Rowspan), Layers (new icon on
  the Layout → Style row, as in the mockup); Padding / Border → Blank (no icon in the mockup). Plus
  NavigableMenu falls back to `Blank` (not the shield) for an item with no icon on all three render
  paths (only the link path did). Applies to every theme without its own `Icons.<name>`, the same
  missing-glyph exception as `Grid`; MNY keeps its own icons. Mockup user menu now uses a Logout
  glyph (`icons.py`).
- Seen, not fixed: Layout → Style shows an empty value chip (the section has no named style;
  pre-existing).
- "menuitems also don't show the set value matching the mock … different padding" → NavigableMenu
  row padding / value chip / breadcrumb colours and the action-row Pill colours are UI-primitive
  theming: recorded with the mockup specifics in `ui-primitives-default-theme.md` (owner: okay if
  handled there). Not changed here.

**Verified** (`/p`, `/p-mny`, `/p-tny`, scratch server; `srv/edit14.mjs` drives hover → menu → Edit
→ drawer → grid): default light + dark, hover outline + add pill, editing (dashed ink, sentence-case
header, help popup trigger), drawer header/tabs, grid overlay + lit toggle, Draft state (page flagged
`has_changes` via CLI, reverted) with Discard / Publish. MNY (own vertical pages-pane tabs, pill
buttons, uppercase) and TNY v2 (500px bar, orange pill) unchanged. Build OK; section-header tests
24/24; lint: section_components +3 `react/prop-types` (new props), sectionArray −2, rest unchanged.
Mockup mirrored (neutral hover/editing/add/grid, Draft/Published marker without a change count,
chalk Publish, amber busy dot above the bar, drawer title = pane title, ink tab underline; removed the
invented "#hash" label). `check.mjs` clean.

**Legacy usage check (2026-10-08, owner asked):** values each theme actually takes from the
freezes (keys equal to the legacy value, script `scratchpad/legacy/check.mjs` via vite-node):
- MNY (mnyv1 + mny_admin): sets almost nothing in datasets/pages — every datasets component and
  pages.section / sectionGroup / sectionArray come 100% from legacy (only the state keys it added
  2026-10-08 are its own); mny_admin overrides userMenu.
- TransportNY v1: overrides parts of datasetsList, sourcePage, breadcrumbs, metadataComp,
  validateComp, settingsPage, userMenu; everything else legacy.
- TransportNY v2: overrides catalog / source shell / overview / categories / breadcrumbs heavily and
  its own sectionArray keys; sourceOverview still takes 32 of 102 keys from legacy, all other
  datasets components and pages.section / sectionGroup 100% legacy.
So without the freezes both projects would have switched to v6 almost everywhere.

### 15. page · edit panes (drawer pane contents) — DONE + APPROVED 2026-10-08 (owner: "do section menu")

Owner: "do drawer panes" (page 14 approved). Mockups: `page-edit.html` (Settings v3) +
`page-edit-panes.html` (`scripts/page_common.py` settings_body / filters_body, `scripts/panes.py`).

Plan (structural changes apply to ALL themes per the owner rule; the v3 LOOK only to the default via
new `pages.editPanes` keys whose legacy value is '' → the old markup):
- [x] Pane list (all themes): remove Data sources (Decision 16); add Filters pane (Decision 17 — page
      filters move out of Settings). Delete dataSourcesPane.jsx if nothing else imports it.
- [x] Settings v3 (default) — identity header (icon tile → picker, draft status + parent path,
      inline rename + URL preview + rename/revert, description), collapsible Layout / Navigation /
      Link page / Site theme / Save as template sections with closed-state summaries. Legacy themes:
      the old FieldSet form minus Filters.
- [x] Filters v3 (default) — one-line rows (key · url/fixed/derived chip · current value) expanding
      to edit; "+ add filter" inline form; empty state; auto-registered vars read-only. Legacy: the
      old FilterSettings.
- [x] Section groups v3 — bands top/content/bottom, group rows (flags, theme chip, count, menu),
      sections with type icon + hidden marker.
- [x] Pages v3 — find box + add-page beside it, status marks (unpublished · hidden from nav · link),
      legend, menu with icons.
- [x] History v3 — composer, day groups (today / this week / earlier), publish + comment
      milestones, all / comments / publishes filter.
- [x] Permissions — page-only "who can do what" summary above UI.Permissions (v3 already, page 3).
- [x] Legacy freeze, build, lint, light/dark/MNY/TNY checks, mockup mirror.

**Built:**
- New `pages.editPanes` theme (`pages/edit/editPane/editPanes.theme.js`, registered in page
  `defaultTheme.js`). Gates (`settingsWrap`, `filtersWrap`, `pagesWrap`, `historyWrap`,
  `permSummary`, `groupMeta`) are '' in `_legacy/pages.js`, so project themes keep the pre-v3 panes.
- Pane list (ALL themes): Data Sources pane removed (file deleted, `documentation/datawrapper.md`
  updated); new **Filters** pane (`filtersPane.jsx`, needs edit-page-params) right after Settings —
  v3 rows for the default, the old `FilterSettings` grid for project themes; Filters no longer in
  Settings for anyone.
- Settings v3 (`settingsPane.jsx` `SettingsPaneV3`; old form kept as `LegacySettingsPane`): icon tile →
  icon picker (search, no icon), draft/published chip + parent path, inline rename with old → new URL
  preview + Rename / Revert (Enter renames; same `updateTitle`), copy-link, debounced description;
  collapsible Layout (sidebar + site-nav thumbnails, side nav style, cover page) / Navigation (Show
  in nav = !hide_in_nav, footer) / Link page (switch + field, debounced) / Site theme
  (`pageOptions.settingsPane`, only when the theme has any) / Save as template (same logic, v3
  inputs). Closed sections show their values.
- Section groups: theme restyle (`sectionGroupsPane.theme.js`, now named 'default'; old values
  frozen) + v3 extras: rail flag (same rail-host rule as sectionGroup.jsx), modal flag (+ param
  key tooltip), theme chip, section count when collapsed, section type icon, hidden-from-view
  marker. Dropped a leftover `console.log` per group render.
- Pages v3: find box (flat matches while typing) + "+ page" beside it, rows with caret · title ·
  marks (unpublished · hidden from nav · link) · ⋯ menu with icons (rename / duplicate / delete),
  legend. Drag-reorder unchanged (DraggableNav got optional `containerClassName` / `listClassName`
  so v3 drops the nestable rule + fixed height). Rows read the full page record (Nestable passes a
  stripped node).
- History v3: comment composer (⌘/Ctrl+Enter), all / comments / publishes (ButtonSelect
  'segmented'), today / this week / earlier, comment / publish / create milestones.
- Permissions: (summary built, then removed on the owner's request — see follow-ups).
- Icons registered (v6 paths): ChevronDown, Globe, Publish, Text, Check, Ellipsis.
- Primary action buttons in the panes are NEUTRAL (bordered panel, ink, medium) per the owner's
  no-accent rule; mockup `ds_common.BTN_PRIMARY` + INPUT focus changed to match (affects every
  mockup — they were cobalt, the live pages already neutral).

**Drawer tabs fix (all themes):** themes without a `pages-pane` tabs style (everything except
MNY) fell back to tabs style 0, whose full-height panel put the tab row BELOW the viewport — panes
could not be switched (pre-existing; TNY's own tabs use keys UI.Tabs doesn't read). Now:
`editPane.tabsStyleFallback` → new library tabs style `editDrawerLegacy` (gray, token-free) for
project themes; TransportNY v2 gets its own `pages-pane` style (font-display title, yellow
underline) in `themev2.js`.

**Verified** (scratch server; `srv/panes15.mjs`, `srv/func15.mjs`): all six panes default light +
dark; rename preview, icon picker, filter row expanded; writes through the v3 controls persisted
(sidebar, show-in-nav, new filter `zone`, history comment — checked with `dms raw get`; test values
reverted except the `zone` filter + comment). TNY v2: old panes, tabs reachable in its own style;
MNY: old panes + its vertical tabs, Filters pane present, no Data Sources. Build OK. Lint: new
errors are `react/prop-types` on the `t` theme prop (same rule the files already break) — no new
unused-vars / hooks issues of note. Mockups mirrored (cobalt → neutral/ink across Settings /
Filters / Section groups / Pages / History; filter rows gain the key field + "remove all filters";
section-group bands carry "+ Add Group" in their header). `check.mjs` clean.

**Owner follow-ups (2026-10-08):**
- "add page isn't redesigned" → `PageTemplatePicker.theme.js` ported (v6 modal, underline tabs,
  template cards with the selected one marked in ink, neutral Cancel / Create Page); old values frozen
  in `_legacy/pages.js` `pageTemplatePicker`. Also fixed for EVERY theme: the picker is now portaled
  to `<body>` — opened from the drawer, its `fixed` backdrop was trapped inside the drawer's
  slide-in transform, so it rendered squeezed into the 350px drawer. Mockup `page_new.py` cobalt →
  ink. (LinkPageNotice on the same mockup page is not ported yet.)
- "pages tab left border on subpages can be removed" → new nestableInHouse style `indent`
  (ml-4, no rule); DraggableNav passes `nestableStyle`; Pages v3 uses it (`pagesTreeStyle`).
- "remove the status reading meaning of permissions" → the Permissions summary is removed (code,
  `permSummary` keys, legacy key, mockup `panes.py`). The pane is UI.Permissions only again.
- Test data: Probe is now a sub-page of Flooding on `/p`.

**Findings:**
- The first history comment on a page with no history shows only after a reload (the new history
  row comes back as a bare `{ref, id}` until the next load) — same for the old pane.
- Page-level data sources stored on existing pages still resolve for their sections, but there is no
  longer an editor for them (Decision 16).
- Project themes don't get the v3 panes (find, marks, history filter, summary). If MNY / TNY should,
  that's their own colour pass, like the missing states.

### 16. page · section menu (sub-menu contents) — DONE + APPROVED 2026-10-08 (owner: "do page search")

Owner: "do section menu" (page 15 approved). Mockup: `page-section-menu.html` (`scripts/section_menu.py`).
The menu itself (NavigableMenu rows, value chip, breadcrumbs, action-row Pill colours) is UI-primitive
theming — recorded in `ui-primitives-default-theme.md`, not done here.
- [x] TemplateManager — `pages.templateManager` port (+ legacy freeze)
- [x] ComplexFilters — `pages.complexFilters` port (+ legacy freeze)
- [x] ColumnManager + AddFormula / AddCalculated / AddStatic column dialogs — unthemed (hardcoded):
      new `pages.columnManager` keys, v6 default, legacy = today's literals
- [x] Layout sub-pages (padding steps, border edge picker + width + colour swatches, radius corners,
      background swatches) — in sectionMenu.jsx / sharedControls
- [x] Display rows (tags, help text) as far as they're not NavigableMenu
- [x] build, lint, light/dark/MNY/TNY, mockup mirror

**Built** (default = v6, no accent; every old value frozen in `_legacy/pages.js`):
- `TemplateManager.theme.js` + `ComplexFilters.theme.js` — re-valued (tokens, ink/neutral, amber
  stale, brick delete); old themes frozen whole (`templateManager`, `complexFilters`).
- NEW `pages.columnManager` (`ColumnManager.theme.js`, ~80 keys) — ColumnManager.jsx and the
  AddFormula / AddCalculated / AddStatic dialogs were entirely hardcoded (blue / purple / gray).
  v6: well picker, panel rows, ink "on" toggles, neutral add buttons (`addTrigger`; '' → the old
  UI.Pill / purple Static button), token dialogs on the scrim. Legacy = the exact old literals.
- NEW `pages.sectionMenu` (`sectionMenu.theme.js`) — the Layout pickers in sectionMenu.jsx (padding
  step grid, border edges + width steps, radius corners, background pills; selected = ink, was a
  hardcoded #1F3F8F), the Display free-text inputs, CommitInput's error line, and `ColorControls`
  (shared control, was bg-white — a white band in dark mode).
- Fixes for every theme: `w-full` on the picker wrappers (the border Width steps were squeezed to a
  few px and the edge / radius pickers sat left of centre — legacy values patched too); the three
  add-column dialogs returned before their hooks (React "change in the order of Hooks" warning) —
  now mounted only while open, early return removed.
- Section-menu Pills (action rows, Use ID / Show All / Remove All, ComplexFilters "+ Condition"),
  NavigableMenu breadcrumbs (dark-on-dark in dark mode), UI.Button (Templates "Save") and UI.Switch
  stay as they are → `ui-primitives-default-theme.md`.

**Verified** (`srv/menu16.mjs` — opens a section's menu in edit mode, walks sub-menu paths; it
switched a test section to Spreadsheet bound to "pg (sections)" without saving): Layout → Padding /
Border / Radius / Background, Display, Type, Dataset, Columns (column added + expanded), Filters,
Templates, the formula dialog; light + dark; MNY unchanged (blue steps, pills, purple Static).
Build OK. Lint: ColumnManager −1, the other five files unchanged. Mockup mirrored
(`section_menu.py`: steps / edges / corners / swatch ring ink, neutral add-column buttons, template
"apply", formula dialog chips; menu Pills left for the UI task). `check.mjs` clean.

**Owner follow-ups (2026-10-08):**
- "the top bar where it says settings / is invisible in dark mode" → NavigableMenu `menuTitle` /
  `breadcrumb*` (ui/components/navigableMenu/theme.jsx) now use v6 tokens with the old gray as the
  CSS fallback (`text-[var(--t-ink,#111827)]` …), hover = underline instead of blue. Readable in
  dark mode; where a theme lacks the tokens the colours are the old ones. (Rest of the menu rows
  still → ui-primitives task.)
- "in column menu that is opened from card ui, the background and accent color component doesn't
  open on click or is not visible" → ColorControls' popup was `absolute` inside the long Card cell
  menu (NavigableMenu, scrolls), so it opened ~1450px down, off-screen — every theme. The picker now
  renders in flow, full width under its row (`colorWrap` / `colorPopup`; legacy `colorPopup`
  patched the same way), and the row (not just the swatch) toggles it. Also moved its early
  `return` after the hooks. Verified in the Card cell menu light + dark + MNY. The palette inside
  (UI.ColorPicker) is still white in dark mode → ui-primitives task.

- "not all icons are colored properly for dark mode (type, <comp> settings) … each menuitem can have a
  default icon if none is selected" → six library icons hard-coded their colour (TouchInteraction +
  ListView `#141B34` — the Type / "<comp> Settings" rows —, Page + Section `#2D3E4C`, SortAsc / SortDesc
  `fill="#fff"`) → `currentColor` / `none`; they now follow the row text in every theme (dark navy →
  the theme's text colour in light themes, light in dark mode). NavigableMenu draws a generic icon
  for an item that names none, by kind — sub-menu `Sliders`, toggle `Toggle`, action `Dot`, link
  `Link` (theme keys `menuItemDefaultIcon*`, '' = none); explicit `Blank` (unchecked pick-list
  options) stays blank. New glyphs Toggle / Dot / Sliders / Padding / Border (the last two replace
  the Blank aliases). Applies to every theme (MNY's menus gain the generic icons in its own colour).
  Custom function-type rows (e.g. Display → "Hide Component") have no icon slot.

- "page sidenav doesn't follow mock design for child pages. there's no left border and active looks
  different" → `ui/components/SideNav.theme.jsx` default style: SideNavItem nests an item's sub-menu
  INSIDE its own row wrapper, so the old active background (cobalt-soft) wrapped the children too,
  and the left rule was per child item. Now (values only, no markup change): row chrome targets the
  item's own row via `[&>div>div:first-child]` (active = well + ink + medium), child groups get ONE
  hairline (`subMenuWrapper_N` ml-4 border-l), child rows sit on it with a 2px edge that turns ink on
  the active page, label weight inherits (`navItemContent_level_N` ''). The `admin` style pins the
  old group/icon values it inherited. NEW `src/themes/_legacy/ui.js` (`legacyUi` + `withLegacyUi`,
  the ui-primitives task's planned file) freezes the old SideNav values; applied to every registered
  theme in `src/themes/index.js` (registry, not per file) — nearly all project themes inherit the
  default `navitemSide_level_N` keys, catalyst all of them. Verified default light + dark (Flooding →
  section anchors; Probe made a visible child page to see the active marker), TNY v2 and the admin
  rail unchanged. Mockup `page_common.sidenav` cobalt → ink.

**Seen, not fixed:** a React "key prop spread into JSX" warning when a column is added (not traced;
likely DraggableList); `ColorControls` still has an early `return` before its hooks (only bites if
`setValue` toggles).

### 17. page · search (search button + palette) — DONE + APPROVED 2026-10-09 (owner: "do page error")

Owner: "do page search" (page 16 approved). Mockup: `page-search.html` (`scripts/page_search.py`).

**Built** (`components/search/theme.js` + `index.jsx`; default = v6, old values frozen whole in
`_legacy/pages.js` `searchButton` / `searchPallet`):
- Search button: bordered panel field, icon first (`order-first`), "Search" in pencil, inset in the
  sidenav (mx-3 mt-4). Was the MNY pill with a dark round icon.
- Palette (renders in UI.Modal + UI.Input — `backdrop` / `dialogContainer` / `dialogPanel` / `input`
  are unused since that move; kept, commented): search icon left of the input (row-reverse),
  left-aligned results (the Modal centres text), page rows with a File icon + hover arrow, section
  rows indented with a Text icon, tag chips (exact match = ink on well), loading (Spinner) and
  no-results (Search icon) states.
- Registry icons instead of FontAwesome `<i>` for suggestion / loading / no-results
  (`*IconName` keys; '' → the old `<i className>`), so they render without FontAwesome.
- Tag suggestions row — the tags were loaded but never shown; now shown under the input when
  `showSuggestions` is set (v6 true, legacy false → MNY / TNY behave as before).
- Fixed: the input started uncontrolled (`value={tmpQuery}` undefined) → React warning.

**Not changed:** the default layout doesn't place the SearchButton widget (sideNav.topMenu is just
the Logo; the mockup shows it in the sidenav). Adding it would also put a page search on datasets /
admin layouts, where it has no page pattern to search — left for the owner. `SearchPage.jsx` stays
unrouted + unthemed (Decision 12). Results still navigate with `window.location` (full reload) —
pre-existing. UI.Input focus ring (blue) → ui-primitives task.

**Verified** (`srv/search17.mjs`; the `/p` test pattern's theme now places Logo + SearchButton in its
sideNav — test data): default light + dark — button, results for "flood", "nfip" (suggestion chip +
tag chips), no results; TNY v2 keeps its own palette. Build OK. Lint index.jsx +10, all
`react/prop-types` on the new props. Mockup mirrored (cobalt → ink: tag match, page icon, suggestion
hover, spinner; LIVE STATUS note updated). 

**Findings:**
- (Corrected 2026-10-09.) A pattern's own `theme.layout.options` REPLACES the theme's layout options
  wholesale — by design (`getBaseTheme` / `getPatternTheme`, ui/useTheme.js); the app's theme editor
  always saves the full set. My hand-written test override (only `sideNav.topMenu`) therefore lost
  `size` / `nav` → no page links. Only a hand / CLI / script edit can write a partial set; no theme
  file does. Production data not scanned (owner's call).
- TNY v2's palette centres its tag chips under each section (its own `tagsWrapper`, pre-existing).

### 18. page · errors (error page, no access, page does not exist) — DONE 2026-10-09, approved 2026-10-13

Owner: "do page error" (page 17 approved). Mockup: `page-error.html` (`scripts/page_error.py`).
Same shape as datasets page 12 (patterns don't import each other, so the page pattern has its own).

**Built:**
- NEW `pages.errorPage` (`pages/errorPage.theme.js`, registered in page `defaultTheme.js`) + NEW
  `components/PageStatePanel.jsx` (`PageStatePanel`: tinted icon + title + sentence + actions;
  `PageStateScreen`: the page's Layout → page column → card → panel). Tones brick / amber /
  neutral (no accent).
- `pages/error.jsx` (the routes' errorElement): keeps the site nav (`keepNav`), "Something went wrong"
  panel with Try again (`navigate(0)`) + Go to home; `baseUrl` now passed from siteConfig. Old markup
  kept behind `page` '' (classes moved to `legacyWrap` / `legacyInner` / `legacyText`).
- `pages/view.jsx` + `pages/edit/index.jsx`: no permission (signed in) → neutral Lock panel "You do not
  have permission to view this page" / "Ask an admin of this site for access." + Go to home, inside
  the page's own Layout (nav kept); edit "page does not exist" → amber panel + Go to home. Signed out
  still redirects to login (unchanged). Gate `statePanel` ('' → the old one-line text).
- Legacy (`_legacy/pages.js` `errorPage`): `keepNav` / `page` / `statePanel` '' — every project theme
  keeps the old error page and texts (the datasets page-12 choice: restyles stay legacy).

**Verified:** temporary `TEMP-ERRTEST` throws / forced-deny on test paths (removed; grep clean):
error page light + dark, no-access light + dark; TNY + MNY show their old error page / one-line
no-access. The edit route for an unknown slug opens an empty editor rather than "page does not exist"
(pre-existing — that branch only shows when there's no item at all); it uses the same
PageStateScreen. Build OK. Lint: view / edit unchanged, error.jsx −1, PageStatePanel 8 prop-types
(new file). Mockup mirrored (tones, neutral buttons, signed-out = redirect note, edit not-exist has
only Go to home, BUILT note). `check.mjs` clean.

**Owner question (offered in report):** MNY / TNY's old no-access is a bare unstyled line with no
nav; brand it like the datasets missing states? → **Owner 2026-10-13: yes, branded panel.**

**MNY + TNY branded (2026-10-13):** the panel itself has no logo; the logo is the site nav's, so
both themes turn `keepNav` on (the error page now shows their nav + logo too; no-access / not-exist
already render inside the page Layout). Keys set in the theme files, not `_legacy/pages.js`, so the
other legacy projects keep the old page and lines:
- `src/themes/mny/theme.js` `mnyPageStates` → `pages.errorPage`: `keepNav` / `statePanel` 'yes',
  `page` with `pt-28` (clears the floating MNY header, as datasets' `sourcePage.notFound` does),
  `card`, the `mnyDatasetStates.errorPage` keys (Oswald title, Proxima text, pill buttons) and a
  `panelIconNeutral` for the Lock.
- `src/themes/transportny/themev2.js` `tnyPageStates` (same shape from `tnyDatasetStates`): `page`
  is its own value with a 16px gutter on phones (the datasets `notFound` padding is `pl-12` at
  every width). The old `transportny/theme.js` is untouched (it has no datasets states either).
- Verified on the scratch sqlite server (5199): all three states on /p-mny and /p-tny at 1280 and
  390, forced by patching the served view.jsx / edit/index.jsx inside Playwright only (no source
  edits). MNY has no dark palette (looks the same in dark). Mockup note updated (`page_error.py`).
- **Owner 2026-10-13: the error page lost context.** It showed an empty side nav, even for pages that
  don't use one. Cause: `error.jsx` passed `navItems={[]}` and the plain site theme. **Fixed:** the
  errorElement sits on the pattern's own route, so it reads that route's loader data (`useMatches()`;
  the loader succeeded, only rendering failed). It rebuilds the nav from it (`dataItemsNav`, `nav2Level`,
  the secondary nav) and merges the failed page's own `theme` (matched by url_slug, with an `edit/`
  prefix stripped) like view.jsx. A page that hides its side nav therefore shows none here either. Pages
  with their own `authPermissions` are left out of this nav, because there's no CMSContext to check the
  user against. Only applies when `keepNav` is on (legacy keeps the old nav-less page). Verified:
  default /p/home (nav + Home active), /p/flooding with `sideNav.size: 'none'` (no side nav), MNY
  (top nav items back).
- Found + removed a stray `l` on line 31 of `pages/edit/index.jsx` (not from these edits; it broke
  every edit page with "l is not defined"; appeared at about the same time `.env` changed, 10:13).
- Sections rendered empty on every test page. That is the known cold-start sync race (a fresh
  browser's first load); it is not from the 10/13 merge. Screenshot after a reload.

### 19. page · link page notice — DONE 2026-10-13 (spacing fix per owner; awaiting OK)

Owner: "do the link page notice". Mockup: `page-new.html` state reference (`scripts/page_new.py`).

**Built:**
- `components/LinkPageNotice.theme.js` → v6: solid card like the page-state panels (`--t-rule` /
  `--t-panel`), neutral link icon (`icon` 'Link', `iconWrap` well/graphite; no accent),
  `t-displaySM` title, `t-metaMD` destination on a well, `t-proseXS` hint with an ink `hintEm`.
- The hint now names the control the v6 settings pane actually has: "Link page … switching it off"
  (theme keys `settingName` / `settingOff`). Legacy keeps "Nav Link … clearing that field", which is
  still right there, because legacy themes get `LegacySettingsPane` and its "Nav Link" field.
- Bug fix: the component read `getComponentTheme(theme, 'linkPageNotice')` (the theme root), but the
  key is registered as `pages.linkPageNotice`, so no theme could ever style it. It now reads
  `pages.linkPageNotice`. No project theme set the root key (grep clean).
- Legacy (`_legacy/pages.js` `linkPageNotice`): the old defaults verbatim + `icon` '' + the old
  hint wording, so every project theme renders exactly as before.

**Verified** (scratch server, link pages `fema_flood_maps` seeded in /p, /p-mny, /p-tny, edit
route): default light + dark show the v6 card; MNY + TNY show the old dashed panel and "Nav Link"
text. Lint: only the pre-existing `navLink` prop-types error (same on HEAD). Build OK. Mockup
mirrored (cobalt icon → well/graphite, hint wording, BUILT note).

**Owner 2026-10-13:** no branding needed: the notice already renders inside the page with the
site's brand. The only problem was its top margin: it touched the top bar on MNY. **Fixed:** the notice now
sits in the page's own LayoutGroup band (`LinkPageNotice` `groupTheme` prop; edit/index.jsx passes
the first content band's `theme` ('default' when unset, as SectionGroup does), or 'content', the band
a new page is created with, when the page has none). So it gets the page's spacing in every theme
(MNY `content` = `lg:pt-[118px]`). Verified default / MNY / TNY.

**Project-theme accuracy pass (2026-10-13, owner: "do tny passes, and check main pages for landbank").**
Method: a real baseline. Detached worktrees of both repos at HEAD (`<scratchpad>/base`, node_modules
symlinked) served by a second Vite on :5198 against the same scratch server, then a pixel diff
(PIL, threshold 24) of each page, before vs now, light + dark, plus a scan for v6 classes outside
the nav.
- TNY v2, the 4 datasets pages never checked: version (DAMA + DMS), create, uploads, tasks + task page.
  Create is identical. Every other difference is a recorded fix: Delete Download now shows (page 5:
  the old check read `metadata.value.download` only); DMS version name + dates no longer blank (page
  5); uploads page renders instead of falling back to Overview (Decision 11 / finding 3); "Tasks
  (New)" → "Tasks", status as sized pills, progress before the error (page 11).
  **One real regression, fixed:** on legacy themes, everything below the version title sat 4px
  higher. `version.jsx` wrapped `AuthorityControl` in a new `<div className={tv.authorityWrap}>`. In
  the old markup the control's two nested `mt-1`s stack as a flex item; inside a plain block they
  collapse. Now `authorityWrap` '' (legacy) → no wrapper; the default is `'w-full'`, so v6 is unchanged.
  TNY has no dark palette: dark equals light.
- Landbank (page + datasets patterns `/p-lb`, `/data-lb` seeded by `srv/seedlb.mjs`): page view,
  source overview, table, settings identical. Differences are recorded changes: edit bar (Data
  sources pane → Filters, grid icon; pages 14/15), catalog hidden buckets last (Decision 9), shared
  Permissions v3 (Decision 22, every theme), the every-theme empty states (2026-10-08), required
  dots + version publish dates (data fixes). Landbank has no dark palette.
- Pre-existing, same on the baseline (UI-primitive phase): the shared Table's sticky header uses
  `bg-[var(--t-panel)]` on every theme. On landbank in dark it turns dark. TNY /tasks and /task/18
  overflow by 184 / 240px (the table's min width stretches the TNY layout's `lg:ml-60` column), and
  landbank's internal table overflows by 60px.

**Owner 2026-10-13, edit drawer (pages 14/15): the close button didn't close it on the default
theme.** Cause: `ui/components/Drawer.jsx` renders its absolute close button BEFORE `children` with no
z-index, and the v6 drawer's Tabs wrapper (`relative flex flex-col-reverse h-full pt-14`) painted over
it, so `elementFromPoint` on the X hit the tab panel. MNY / TNY were unaffected (their tab style isn't
positioned). Fix: `z-10` on the close-button container. Verified close on default / MNY / TNY.
