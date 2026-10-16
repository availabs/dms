# Raw HTML controls → UI components

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** doing · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

## Objective

Owner (2026-10-13): "html `<button>` should be replaced with UI buttons. for that matter, every html
element that exists in ui, should use component from ui. this should be a separate task."

Every control that the UI library already provides gets rendered through that UI component, never as a
raw HTML element with its own classes. Its look then comes from the theme (`activeStyle`), like the
buttons in [ui-control-classname-to-activestyle.md](../completed/ui-control-classname-to-activestyle.md). A theme
or an author can then restyle every control in one place.

Separate from, but built on, the UI controls effort ([ui-control-consistency-audit.md](../completed/ui-control-consistency-audit.md)).

## Scope

**In:** library code in `packages/dms/src/patterns/*` and UI's own *composite* components
(`ui/components/*` that render another primitive's element: Card, Permissions, Tabs, DeleteModal,
Drawer, TopNav, SideNav, ThemeToggle, Colorpicker, CardColumnPicker, table, graph). A primitive renders
its own element (Button.jsx → `<button>`, Input.jsx → `<input>`); that stays.

**Element → UI component**

| HTML | UI component | Notes |
|---|---|---|
| `<button>` | `UI.Button` + `activeStyle` | roles from `Button.theme.jsx` |
| `<input>` text / number / search | `UI.Input` | |
| `<select>` | `UI.Select` | |
| `<textarea>` | `UI.Textarea` | |
| `<label>` | `UI.Label` | |
| `<table>` | `UI.Table` | owner: move the datasets markup tables onto it |
| modal / dialog markup | `UI.Modal` / `UI.Dialog` / `UI.DeleteModal` | |
| `<input type=checkbox>` / `<input type=radio>` | `UI.ColumnTypes.checkbox` / `.radio` | already in `ui/columnTypes/` (owner) |
| `<input type=file>` | `UI.FileInput` (**new primitive, built 2026-10-13**) | see "Step 0" below |

**Out:** Link (`<a>` / router `Link`), layout elements (`div`, `span`, …), Lexical's own editor DOM,
map / graph canvases.

## Current state (static count, 2026-10-13, occurrences)

| | admin | auth | datasets | page | ui composites |
|---|---|---|---|---|---|
| `<button>` | 102 | 4 | 64 | 77 | ~65 (13 files) |
| `<input>` | 14 | 0 | 36 | 40 | ~30 |
| `<select>` | 1 | 0 | 10 | 9 | 7 |
| `<textarea>` | 1 | 0 | 5 | 4 | 6 |
| `<label>` | 19 | 0 | 40 | 50 | 31 |
| `<table>` | 0 | 0 | 12 | 0 | 0 |

Input types found: checkbox 11, number 4, file 4, radio 3. There's nothing in `dms-manager`, `render`
or `api`.

## Proposed approach

Prerequisite: `Button.jsx` locked. Step 0: build `UI.FileInput`. Then area by area (admin → auth →
datasets → page → ui composites), one confirm per area, as in the className → activeStyle work:
1. List each area's raw elements with the proposed component + role, and get the owner's OK.
2. Swap. Delete the pattern theme keys that only styled the raw element, from the library default
   and from `_legacy/*`. Project themes take the role look ("normalise", owner 2026-10-13). Layout
   that lived in the element's classes moves to its container.
3. Verify: in the default theme, the live class set equals the named style. Project themes (MNY, TNY v2,
   landbank) get a HEAD-baseline pixel diff (memory `reference_baseline_pixel_diff`), where only the
   intended normalised changes are allowed. Also no page errors, a clean build, and eslint the same as HEAD.
4. Mirror changed looks into the mockup scripts (`src/themes/tessera/design_system_v6/scripts/`).

## Step 0 — `UI.FileInput` ✅ (2026-10-13)

Built; no caller swapped yet (that's per-area, with the owner's OK).

Files: `ui/components/FileInput.jsx`, `ui/components/FileInput.theme.js` (new); registered in `ui/index.js`
(`UI.FileInput`), `ui/defaultTheme.js` (`fileInput`), `ui/docs.js`, and both theme-editor component lists
(`admin/pages/themes/editTheme.jsx`, `admin/pages/patternEditor/default/themeEditor.jsx`). Spec:
`controls.py` (`FILE_WRAP`, `FILE_NAME`, `FILE_EMPTY`, `DROPZONE`, `DROPZONE_DRAG`) and a "File input" block on
`ui-controls.html` (`ui_controls.py`).

API (designed from the 4 existing callers: `columnTypes/image.jsx`, datasets `file_upload/CreatePage.jsx`,
`gis_dataset/.../uploadFile/index.jsx`, `components/upload.jsx`):

| Prop | Default | |
|---|---|---|
| `onChange(files)` | — | always an **array of File** (empty if nothing chosen); the native value is reset after each pick, so the same file can be chosen again |
| `accept`, `multiple`, `id` | — / false / — | passed to the hidden native input |
| `disabled`, `loading` | false | either one disables; `loading` shows `loadingLabel` ('Uploading…') |
| `label` | 'Select a file' | trigger text (button shape) |
| `dropzone` | false | the drop-zone shape: click, Enter/Space or drag a file onto it |
| `title`, `hint` | default "Click to upload or drag and drop" / — | drop-zone texts; `hint` is also the empty-state text beside the button |
| `showFileName`, `defaultFileName` | true / — | chosen-name text beside the button |
| `activeStyle` | — | picks a `fileInput.styles[]` entry; **no className** |

Theme keys (`fileInput.styles[0]` 'default'): `nativeInput`, `wrapper`, `buttonStyle` (the UI.Button
activeStyle of the trigger — 'action'), `icon` / `iconClass`, `fileName` / `fileNameEmpty`, `dropzone`,
`dropzoneDragging`, `dropzoneDisabled`, `dropzoneIcon` / `dropzoneIconClass`, `dropzoneTitle`,
`dropzoneTitleBold`, `dropzoneHint`, `loadingText`. The trigger is `UI.Button` from ThemeContext, so its look
stays a Button named style. Project-theme freeze for `_legacy/ui.js`: proposed in the session report, not yet
applied (main session owns that file).

Proposed `_legacy/ui.js` entry (add with the first caller swap; neutral gray for project themes):

```js
  fileInput: {
    styles: [{
      name: 'default',
      fileName: 'text-xs text-gray-700 truncate',
      fileNameEmpty: 'text-xs text-gray-400',
      dropzone: 'flex flex-col items-center justify-center text-center w-full border-2 border-dashed border-gray-300 rounded-lg px-6 py-12 bg-white hover:border-gray-400 cursor-pointer',
      dropzoneDragging: 'border-gray-600 bg-gray-50',
      dropzoneIconClass: 'size-7 text-gray-400',
      dropzoneTitle: 'text-sm text-gray-900 mt-2',
      dropzoneHint: 'text-xs text-gray-500 mt-0.5',
      loadingText: 'text-sm text-gray-500 mt-2',
    }],
  },
```

Verified: `vite build` clean; eslint shows only `react/prop-types` (same as Button / Switch, which the
package doesn't follow); mockups rebuilt, `check.mjs` clean. Not live-rendered (nothing uses it yet; the
theme editor's FileInput preview is the first place to look).

## Decisions (owner, 2026-10-13: "checkbox and radio are in columntypes. add fileinput. move them onto
ui.table. locking button can happen before this task")

- [x] Checkbox / radio → the existing `ColumnTypes.checkbox` / `ColumnTypes.radio`.
- [x] File input → a new `UI.FileInput` primitive (first step of this task).
- [x] The datasets markup tables (12) move onto `UI.Table`. Where a table needs something `UI.Table` lacks,
      enrich `UI.Table` (or add a named style), never a local table.
- [x] Locking `Button.jsx` (no `className` / `themeOptions` in the class) happens **before** this task,
      at the end of [ui-control-classname-to-activestyle.md](../completed/ui-control-classname-to-activestyle.md).
      Swapped raw buttons then land on the locked Button.

## Files requiring changes

To be listed per area in step 1. A grep for each element across `packages/dms/src/patterns` and
`packages/dms/src/ui/components` gives the starting list.

## Testing checklist

- [ ] Per area: live class sets match the named styles (default theme)
- [ ] Per area: HEAD-baseline pixel diff on MNY / TNY v2 / landbank
- [ ] Keyboard: each swapped control is still focusable, with the theme's focus ring
- [ ] Forms still submit / don't submit as before (`type` on swapped buttons)
- [ ] Build clean, eslint same as HEAD

## Added 2026-10-14 (owner: "#1 should be covered under ui-raw-html-to-ui-components")

**Pattern-drawn pills → `UI.Pill` kinds** (status / status_go / amber / brick / cobalt, marker, count, tag,
tag_sub — see [ui-control-pills.md](../completed/ui-control-pills.md)). Spans styled by pattern theme keys today:
- admin: type / count / scope / level pills (`editSite.theme.js` `typePill`, `AddPatternPicker` `optTag`,
  format-manager / user-menu counts, `noAccessBadge`)
- datasets: category / admin / namespace pills (`sourceOverview` `catPill` / `catSubPill` / `adminPill`),
  task + upload status badges (`UdaTaskPage` `statusBadge`, uploads `StatusCell`)
- auth: the user's group chip
- `UI.Label` (only used as a section tag chip) → the `tag` kind.
Same recipe as the rest of this task: list per area, owner OK, swap, drop the pattern keys (library +
`_legacy`), HEAD-baseline diff on project themes.

Also from the table work: the spreadsheet add-row / inline-save / actions-column buttons in
`ui/components/table/index.jsx` and `RenderActions.jsx` are still raw `<button>`s reading theme keys
(frozen for project themes) → `UI.Button` roles here.

## Carried over from the UI controls hub (2026-10-15)

The hub ([ui-control-consistency-audit.md](../completed/ui-control-consistency-audit.md)) closed on 2026-10-15.
Items still open from it:
- Auth sign-in / sign-up pages: icon mark, heading accent, "forgot password" link and the icon hover are still
  cobalt (`auth/defaultTheme.js`); the sign-in submit was skipped by the owner on 10/13.
- Profile avatar: solid cobalt square (`auth/defaultTheme.js` `avatar`). Asked 2026-10-15 whether it goes ink.
- Polish from the 10/13 mockup walk (`ui-control-spec-and-mockups.md`): the skeleton is faint on a light cell; the
  tooltip (board) is low-contrast in dark.
- `UI.Switch` in dark mode: the on track is `--t-ink`, which is near-white in dark, with a dark knob. Owner
  (2026-10-15) didn't see a problem on the theme toggle, which is a different control; the Switch is to be
  checked with the owner.
- ~~TNY v2 / MNY define no `action` / `primary` Button roles~~ **Done 2026-10-15 (owner: "snapshots look good").**
  Traced through the real chain (loadThemes → withLegacyUi → getPatternTheme → getComponentTheme, Vite SSR):
  unset roles inherited styles[0], so on TNY v2 primary / action / small / full-width actions were `linkMono` text
  links, and on MNY every role, danger included, was the white default pill. Now defined in the themes' own
  vocabulary: TNY v2 `themev2.js` primary = `default`, action = `secondary`, small = `compact`, linkMeta =
  `linkMonoXS`, linkProse = `footerlink`, + red `smallDanger` / `linkMetaDanger`; MNY `theme.js` primary = amber
  pill, action = the white pill, danger / smallDanger = red-outline pill, dangerSolid = red pill, linkMeta /
  linkMetaDanger = slate text link. `actionFull` is defined in both themes (= their `action` + w-full). A first version
  derived it in `_legacy/ui.js` from the theme's own `action`; the WCDB pixel diff showed that made WCDB's
  full-width actions near-invisible, so it was reverted (see datasets-page-pattern-v6-port.md, closed). Only
  transportnyv2, mnyv1 and mny_admin change; default and WCDB unchanged.
  Now / after snapshots: create, source admin and version pages on /data-tny, /data-mny. Build OK.
- [x] WCDB's own `danger` Button role was its dark-site outline (gray `--ink-3` text, red only on hover), faint
  on the light datasets pages: Delete download, Delete version, the metadata "empty name" warning. **Done
  2026-10-15 (owner: "do WCDB's own red danger"):** `wcdb_theme.js` `danger` is red at rest in WCDB's
  vocabulary (same mono pill, `--on-air` text, red-tinted border, `--on-air-soft` hover fill); `dangerFull`
  derives from it. Resolution: only wcdb `danger` / `dangerFull` change. Checked on /data-wcdb version +
  metadata pages, light and dark. Also changes WCDB's own site: its form Delete buttons are red at rest.
- [x] GIS Layer Analysis empty state ("No features" placeholder) and theming the rest of the Runs page: owner said
  no on 2026-10-14, **yes on 2026-10-15 — done** (library 6043a85a). Layer Analysis: a dashed empty state
  (`gisCreate.theme.js` `layerAnalysisEmpty*`) on every theme — gray in `_legacy/datasets.js`, branded via
  `mnyDatasetStates` / `tnyDatasetStates`; mirrored in `create.py`. Runs (`RunsPage.jsx`): every hardcoded class
  → `runsPage.theme.js` keys (v6 per `datasets-schedule.html`: card sections, `UI.Table 'list'` run list, status
  as `UI.Pill` kinds, window chips as `status_cobalt`, a progress bar, cobalt live dot); re-run is a `UI.Button`
  `primary` (raw `<button>` gone; project themes normalised to their own `primary`). Project themes frozen in
  `_legacy/datasets.js` `runsPage` (`statusPill` / `windowPillStyle` / `listTableStyle` / `progressTrack` `''` →
  the old markup). Verified: resolution check (every key = HEAD string on 6 project themes); preview harness
  (`scratchpad/runs-preview`, stub falcor — Runs isn't reachable on the test data) pixel-identical to HEAD on
  MNY / TNY v2 / landbank with the re-run button hidden; default matches the mockup. Build OK; lint = HEAD +
  `react/prop-types` on the new cell Comps.

## Step 1 — inventory (started 2026-10-15)

Static extractor: `src/themes/tessera/design_system_v6/scripts/inventory/rawhtml.mjs` (`node rawhtml.mjs
patterns/admin --md`). Lists each raw control with file:line, component, label, className, the class string its
theme key resolves to and, for buttons, the nearest `UI.Button` role (`=` exact, `≈` with the extra / missing
classes). Counts on 2026-10-15 (after the merge of master): admin 137, auth 4, datasets 156, page 174, ui
composites 117. Admin: about 73 of 102 buttons already equal a role string exactly. Admin list next, for the
owner's OK.

### Admin list — owner decisions (2026-10-15)

Inventory: 133 raw controls (99 button, 14 input, 18 label, 1 select, 1 textarea). ~73 buttons equal a role
string exactly; ~12 are a role + layout class (moves to the container); near-role links normalised
(`subdomainRemoveBtn` / `removeBtn` / `confirmYes` / `dividerRemove` → `linkMetaDanger`, `addOptionBtn` /
`confirmNo` / `resetBtn` → `linkMeta`, `listAddBtn` → `linkProse`, `listRemoveBtn` → `smallDanger`, formatter
icon buttons → `iconRow` / `iconRowDanger` + `disabled`, pages-editor `modeBtn` → `segment` / `segmentOn`).
- [x] Off-role buttons → **new Button roles**: `menuItem` / `menuItemDanger` (page-actions dropdown),
      `optionCard` / `optionCardOn` (new-site template cards), `iconPick` / `iconPickOn` (user-menu icon grid),
      `fieldTrigger` (icon-picker trigger), `linkTitle` (activity feed page title).
- [x] `<label>` → **new `UI.FieldLabel`** (`ui/components/FieldLabel.jsx` + `.theme.js`, theme key `fieldLabel`,
      styles `default` / `inline`; caption by `htmlFor`, or wraps its control with `text` as the caption). Owner first
      chose "rebuild UI.Label", then on 2026-10-15 picked FieldLabel once it showed that project themes brand the
      UI.Label chip (MNY featured-search pills, TNY v2, WCDB, avail_site v1–v10). UI.Label stays the tag chip.
      Not frozen in `_legacy/ui.js` yet (admin only renders the library theme): freeze before a datasets / page swap.
- [x] Native `<select>` → **`UI.Select`** (the MultiSelect dropdown, single mode) — applies to datasets / page too.
- [x] **Delete** dead `admin/ui/index.jsx`, `avail-layout.jsx`, `nav/Side.jsx`, `nav/Top.jsx` + their theme keys.
- New `mono` / `search` named styles on `UI.Input`, `mono` on `UI.Textarea`; Button roles appended at the end of
  `button.styles` (indices don't move) and listed empty in `_legacy/ui.js`. `menuItemWarn` added for the amber Discard item; picker search → Input `bare`; checkbox →
  `ColumnTypes.checkbox`.

### Admin — done 2026-10-15 (uncommitted, library + root on `design-wip`)

Inventory on `patterns/admin`: **0 raw controls** (was 133). Three forks swapped by file group (pages tab files /
userMenu + formatManager / the rest), each owning its files, no stash; labels done after by the main session.
- Dead code deleted: `admin/ui/index.jsx`, `index.theme.js`, `avail-layout.jsx`, `avail-layout.theme.js`, `nav/*`
  (+ `adminLayout` / `adminUi` in `admin/defaultTheme.js`). `admin/ui/icons.jsx` stays (datasets `upload.jsx` imports it).
- New Button roles (appended, `_legacy` lists them empty): `menuItem` / `menuItemWarn` / `menuItemDanger` (= the v6
  spec's MENU_ROW / MENU_ROW_W / MENU_ROW_D; the pages ⋯ menu panel took the spec's `p-1`), `optionCard` /
  `optionCardOn` (= spec PICK / PICK_ON; **frozen** in `_legacy/ui.js` to the old `templateCard` strings because
  SiteTemplatePicker also renders on the auth sign-up page with the project theme), `iconPick` / `iconPickOn`,
  `fieldTrigger` (open state via `aria-expanded`), `linkTitle` (block, so it truncates).
- New: `UI.FieldLabel`; Input `mono` / `search`; Textarea `mono`. Mirrored in `controls.py` + `ui-controls.html`.
- The extractor's theme-key → class guess takes the first `key:` in the area, so same-named keys in different files
  mislead it (`addBtn`, `doneBtn`): userMenuEditor keeps discard = `action`, add link = `primary`, done = `small`;
  pagesEditor + New Page / Publish Selected = `primary`. Read the file's own theme before trusting a mapping.
- Layout moved to wrappers: `addWrap` (shrink-0), `syncWrap` / `subdomainRemoveWrap` (ml-auto), `deleteWrap`,
  `listAddWrap`, `addSubdomainField` (`block w-48`: UI.Input fills its container, the old input was ~181px natural),
  formatManager `addBtnWrap` / `addOptionWrap` / `fieldControl` / `rawTextareaWrap`, userMenu `dividerRemoveWrap`
  (hover reveal + `focus-within`) and `labelCell` (`flex sm:pt-2` — flex, or the inline label sits on a strut).
- Look changes (normalised, admin only): remove-subdomain / remove-link / confirm-reset links are pencil → brick on
  hover (were brick at rest); settings list remove = `smallDanger` (red at rest); "+ add location" proseSM → proseXS;
  search fields 36 → 32px; formatManager fields lose the well fill, type select is the UI.Select dropdown, locked
  row icons dim 40% (was 30%), "add attribute" = `actionFull`; Draft/Published toggle = segment in the `scopeSeg`
  box (was 10px caps pills); queue lens chip active = ink (was amber — no amber chip role); menu rows t-proseSM.
- Queue checkbox: `ColumnTypes.checkbox.EditComp` with `className={t.queueCheckbox}` — the checkbox column type
  has no theme yet (its fallback is `w-full border p-2`). Follow-up: theme checkbox / radio column types (needs a
  `_legacy` freeze; they render in spreadsheet cells on every theme).
- Left: formatManager's delete-confirm yes / no are clickable `<span>`s (not in the inventory) → `linkMetaDanger` /
  `linkMeta` later. `settings.theme.js` `btnReset` / `btnSave` kept: `src/patterns/qa/admin/*` reads them.
- Verified: live HEAD (:5198 worktree) vs working tree (:5199) control class-diff on /list, /list/create,
  /list/themes and every pattern-editor tab of pattern 27, incl. the ⋯ menu, expanded sections, attribute edit,
  user-menu item editor + icon picker, delete confirm — only the intended changes above, no page errors. Not
  reachable on the test data: the multi-tenant tenant modal and the template cards (class strings checked by
  resolution). Build OK (15 Catalyst `has()` CSS warnings, pre-existing); eslint ≤ HEAD on every file
  (FieldLabel.jsx: 4 `react/prop-types`, like Button / Switch).

- Owner-reported 2026-10-15: Pages tab State column — the unpublished-changes dot wrapped below the Published pill
  (pre-existing: the table's `cellInner` is `flex flex-wrap … px-4` and `publish_state` merged it onto its pill row;
  110px column − 32px padding < pill 68 + gap 4 + dot 8). Fixed: `columnTypes/publishState.jsx` puts `className` on a
  wrapper and the pill + dot in a nowrap row; column size 110 → 120. Checked with an injected dot (inline, in the cell).

- Owner answers 2026-10-15 ("checkbox should not use classname… format manager's spans should be buttons. do the
  fieldlabel _legacy freeze"), all done:
  - `ColumnTypes.checkbox` themed like radio: `columnTypes/checkbox.theme.js` (`theme.checkbox` styles, keys `input` /
    `wrapper`; v6 16px ink accent), registered in `ui/defaultTheme.js`; `activeStyle` picks the style; a host
    `className` (TableCell passes the cell class) is overridden — `{...rest}` comes before `className={t.input}`.
    `_legacy/ui.js` `checkbox` freezes project themes to the old no-className fallback (`w-full border p-2`; view
    wrapper `text-sm font-light truncate`, minus a stray `bg-red-500`). Note: in table cells the old checkbox wore
    the cell's class; that no longer reaches it on any theme. pagesEditor `queueCheckbox` key deleted.
  - formatManager delete-confirm yes / no → `UI.Button` `linkMetaDanger` / `linkMeta` (yes is pencil → brick on
    hover; was brick + semibold at rest); `confirmYes` / `confirmNo` keys deleted. Checked live (Playwright: add
    attribute → delete → confirm row → no restores the icons). Same-pattern spans remain in page `TemplateManager`.
  - `_legacy/ui.js` `fieldLabel`: project themes get a plain gray label (`block text-sm font-medium text-gray-700
    mb-1`; inline without block / mb), not the v6 mono eyebrow.
  - Resolution checked through the real chain (Vite SSR loadThemes → getPatternTheme → getComponentTheme): default =
    v6 checkbox / FieldLabel; mnyv1, transportnyv2, landbank, wcdb = the frozen values (and optionCard frozen).

### Auth — done 2026-10-15 (uncommitted)

Inventory on `patterns/auth`: **0 raw controls** (was 4).
- Modal close (Add user, Reset password, Add a group) → `UI.Button` `iconRow` (was a bare 16px icon; now the 28px
  row icon, as in the spec's modal). `modalCloseBtn` deleted from `auth/defaultTheme.js` and the pages' local fallbacks.
- `ViewAsBar` renders from the auth provider, outside every ThemeContext (default `null`): it now provides the
  library default theme + UI itself (`ui/themeContext` + `ui/defaultTheme` + `ui`; no import cycle — `ui` imports no
  pattern). Exit → new Button role **`smallWarn`** (amber twin of `smallDanger`; was a solid amber-300 fill); group
  chips → `UI.Pill` `tag`. `exitButton` / `groupPill` deleted. The bar itself is still hardcoded Tailwind amber (not a
  control; a later theming pass), and the neutral `tag` chip reads a little grey on it.
- `smallWarn` mirrored in `controls.py` / `ui-controls.html` (Small block); listed empty in `_legacy/ui.js`.
- Verified live (HEAD :5198 vs :5199): users / groups pages, both Add modals, Reset password modal, View As bar —
  only the intended changes; the `placeHolder` console warning is on HEAD too. Build OK; lint = HEAD.

- Owner 2026-10-15: ViewAsBar group chips → Pill `status_amber` (not `tag`). Keyboard in modals ("it starts from
  page and then reaches the close button"): not tabindex — `ui/components/useModalOverlay.js` (shared by Modal /
  DeleteModal / Dialog) now moves focus into the panel on open (`initialFocus` ref — Modal / Dialog took that prop
  but ignored it — else the first focusable control), traps Tab / Shift+Tab in the topmost open panel, Escape closes
  only the topmost, and focus returns to the opener on close (body when the opener unmounted, e.g. a ⋯ menu item).
  `onClose` is read from a ref so the effect runs only when `open` changes (callers pass a fresh close each render;
  re-running would yank focus mid-typing). No library. Checked live: Users "Add new" (HEAD: focus stayed on the page;
  now Close → email → Add → wraps, Shift+Tab wraps back, typing keeps focus, Escape returns to "Add new"); Pages tab
  delete modal (single Cancel keeps focus). Also inlined checkbox.jsx's theme read (package CLAUDE.md: no 1–2 line
  wrappers around ThemeContext + getComponentTheme).

Next area: datasets (156 — 10 `<select>` → UI.Select, 12 tables → UI.Table), page (174), ui composites
(117). `fieldLabel` is frozen in `_legacy/ui.js`.


## Datasets — plan (owner-approved 2026-10-15)

Inventory: 155 raw controls in 31 files (59 button, 40 label, 35 input, 10 select, 6 table, 5 textarea). Three
read-only proposal forks (A: schedule / upload / AuthorityControl / metadata / access / change history / external
version; B: default + internal admin / overview / version / error, Settings, DeleteSource, create pages, lists,
SourcePage, UdaTaskPage; C: gis_dataset Create + Map, file_upload CreatePage — all tables + file inputs) resolved each
key against the file's own theme and `_legacy/datasets.js`.

Owner decisions:
- [x] **Phase 0a — project Button roles first (blocking):** landbank, WCDB, avail_site v10 define `linkMeta` /
      `linkMetaDanger` / `chip` / `chipOn` / `action` / `actionFull` / `dangerFull` / `dangerSolid` / `iconRow` /
      `segment` (+ `segmentOn`, `small`, `smallDanger`, `primary` where missing) in their own vocabulary, like TNY v2 /
      MNY on 10/15 — otherwise unset roles inherit styles[0] (40–44px buttons) and swapped links / chips blow up.
- [x] **Phase 0b — radio + checkbox:** radio column type default → v6 RADIO (16px ink), today's values frozen in
      `_legacy/ui.js`; checkbox `_legacy` freeze → `''` (browser default; `w-full border p-2` was only the no-className
      fallback); checkbox column type gains an optional `label` (themed row + label keys) for checkbox-with-text rows.
- [x] **Phase 0c — MultiSelect option groups** (enrich, for SchedulePage's Loader `<optgroup>`s).
- [x] **Phase 0d — new named styles** (owner standing OK): Button `iconInline` / `iconInlineDanger` (size-5, no border:
      inside chips / text rows), `segmentIcon` / `segmentIconOn` (spec SEG_ICON — each branded project theme defines
      its own from its current `viewBtn`), `linkInline`; Input `compact`; Textarea `readonly`; MultiSelect `muted`;
      Table `error` style + `display.hideHeader`; `_legacy/ui.js` `fileInput` freeze (Step 0 proposal + `icon: ''`).
- [ ] **SchedulePage themed in this pass:** `schedulePage.theme.js` like `runsPage.theme.js`, v6 per
      `datasets-schedule.html`, `_legacy/datasets.js` freeze of today's look.
- Applied by default (owner didn't object): delete dead `pages/createDataset.jsx` + `internal/pages/create.jsx`;
  select-layer 1-row layout table → FieldLabel + UI.Select; "Upload File" + AWAITING "Publish" → `primary`; labels with
  no control → plain div headings (`uacPanelLabel`, `metadataHeaderLabel`, `labelUpperCase`, upload column headings);
  project-theme metadata labels lose `capitalize`; overview `colFooter` → `linkMeta` in a themed footer wrapper; error
  tables → UI.Table `error`; file-metadata table → headerless UI.Table 'list'; schema table → UI.Table 'list' with header
  checkboxes via `controls.header.displayFn`.
- Risks to verify live: `''` / `undefined` option values (UI.Select treats as missing → sentinel), upload's per-column
  selects (100s of MultiSelects — check render time), schema table inputs in a virtualized table, Map DomainItem click
  bubbling, `file_upload/CreatePage.theme.js` is shared with internal_table `sourceCreate`.
- [x] Phase 1 — swaps (groups A / B / C) · [x] Phase 2 — verify (resolution on 6 themes + HEAD-vs-new live diff on
      /data, /data-mny, /data-tny, /data-lb, /data-wcdb) · [x] mirror into mockups (spec board; schedule mockup is the source)

### Phase 0 — done 2026-10-15 (uncommitted)
- Roles defined in each theme's own vocabulary: `landbank/theme.js` (primary = styles[0] press, action = its
  `secondary`, h-7 small, Plex Mono caps linkMeta, `.lb-chip` chips, …), `wcdb/wcdb_theme.js` (colours readable on the
  light datasets panel in both modes: `--ink-3` text, rgba(128,128,128,.35) borders, #2a2a2a selected, `--on-air`
  danger), `avail_site/v10/theme.js` (28–32px pills from its tokens; its existing 44px `danger` kept), MNY + TNY v2
  `linkProse` / `chip` / `chipOn` / `segmentIcon(On)` (segmentIcon = each theme's current `viewBtn` strings).
  Side effects seen: landbank "Advanced Metadata" (actionFull) + create "Cancel" (action) → its white secondary;
  WCDB "Advanced Metadata" → mono outline pill; MNY / TNY ExportPdf TOC chips; WCDB ButtonSelect segments.
  **Open:** avail_site v1–v9 are registered and still lack 11 roles (fall back to their default buttons) — ask owner.
- Shared UI: radio v6 (16px ink; `_legacy` freeze of the old row); checkbox `_legacy` freeze → browser default; checkbox
  `rowLabel` prop (not `label`: table cells spread the column object in); MultiSelect options take `group` (contiguous
  runs; `groupHeading` key); Button `iconInline` / `iconInlineDanger` / `segmentIcon(On)` / `linkInline`; Input
  `compact`; Textarea `readonly`; MultiSelect `muted`; UI.Table `error` style + `display.hideHeader`; `_legacy`
  fileInput freeze (+ `icon: ''`); `_legacy` DERIVED literals for iconInline / iconInlineDanger / linkInline and a
  neutral Input `compact` (project themes' styles[0] are full-size). Mockups rebuilt, check.mjs clean. Build OK; all
  datasets roots + admin load clean on :5199.
- 2026-10-15: Phase 1 forks (A / B / C) hit the session rate limit mid-way (A: checking a Landbank row "Delete"
  (`danger`) that didn't render; B: about to run the 5-pattern live diff; C: mounting GIS create pieces with mock
  state) and were resumed after the reset. Their edits are uncommitted in the working tree — if a later session
  finds them unfinished, re-run the inventory on `patterns/datasets` to see what's left.
- **Group B done** (12 files at 0 raw; dead `createDataset.jsx` + `internal/pages/create.jsx` deleted). Notable: version
  select → UI.Select in `versionSelectWrap` (w-48), the old `value={undefined}` option used to navigate to its own text;
  Settings promotion gate → checkbox `rowLabel` in `nsCheckItem` (flex, no strut); UdaTaskPage payload → Textarea
  `readonly`, cell class on an outer div. `_legacy/ui.js` DERIVED literals `segmentIcon(On)` = the old gray legacy
  `viewBtn` (themes without their own role: avail_site v1–v9, fusion, TNY v1…). Project copies edited: TNY v2
  (sourceOverview / sourcePage / categories / viewBtn), TNY v1 (createPage.fieldLabel, settingsPage.categoryButton),
  landbank + avail_site v10 (viewBtn → their segmentIcon). Live diff on 25 pages (5 patterns × list / overview / admin /
  settings / create) + Add Version / Delete Source modals: only intended changes. Not reached: version, error, tasks.
  Fixed after: `SEGMENT_ICON(_ON)` built from SEGMENT_BASE kept its `px-2.5` (a trailing `px-0` loses in CSS order) →
  icons rendered small; now SEGMENT_BASE minus px-2.5 (spec SEG_ICON same fix). Switcher = HEAD 32×28 / 16px icons.
- **Group C done:** file_upload CreatePage (FileInput button shape, wrappers with legacy positioning, Upload =
  primary), new `gis_dataset/pages/Create/ErrorTable.jsx` (`GisErrorTable` on UI.Table `error`, replaces 3 error tables +
  their inline-style branches), publish state → role map (Publish / Publishing… primary, Error… danger), upload dropzone
  (fixes an `<input>` nested in a `<button>`), file metadata = headerless UI.Table (fixes HEAD's `<div>` in `<tr>`),
  select-layer → FieldLabel + Select, schema table → UI.Table 'list' with module-level cells reading `row.ctx` (stable
  identity: inputs don't remount) + header select-all via `controls.header.displayFn`; fixed a conditional `useContext`
  (rules-of-hooks) in the constrained input; Map legend / domain / threshold editor + settings close + JSON textarea.
  Verified with a mock-state harness (`scratchpad/gisc-preview`, repo scratchpad) on default / mnyv1 / landbank + live
  file_upload create on /data, /data-mny, /data-lb. Not live: error-overlay Close (needs a real upload).
- **Group A done:** SchedulePage themed (`schedulePage.theme.js`, v6 per datasets-schedule.html, registered like
  runsPage; `_legacy/datasets.js` `schedulePage` freeze), Loader select uses option groups, cadence = segment / segmentOn
  (mockup, not chips), row actions Run now primary / Edit action / Delete danger; upload dropzone + selects (`__none__`
  sentinels) + `muted` no-match; AuthorityControl (verAuth* deleted incl. TNY v2 copies); metadata captions FieldLabel
  inline, option tags `linkInline`; ChangeHistory + ExternalVersion radios on ColumnTypes.radio (fixes the Yes/No pair
  that wasn't one group and the "No" label pointing at Yes). Harness `scratchpad/schedule-preview`. Not live: schedule in
  the app (test sources are csv_dataset: no Schedule tab), upload's post-upload mapping step (needs a DAMA upload — render
  cost of 100s of per-row selects still unmeasured), download modal + authority form (class diff only).
  Dead copies left in TNY v1 `theme.js` + fusion `metadataComp.label` (unused).
- "Invisible Landbank danger" reported by both A and C = harness artefact: landbank's interpolated `bg-[${C.rose}]`
  classes are generated by the runtime Tailwind on live pages (measured: Delete Source = rgb(206,91,78)); preview
  harnesses don't load it. No change.
- **Datasets: 0 raw controls** (was 155). Build OK; 20-page error sweep (5 patterns × list / settings / create / tasks)
  clean; admin + auth re-diffed, unchanged. Uncommitted. Open: avail_site v1–v9 lack 11 Button roles (asked owner).

Next area: page (174), then ui composites (117).
- Owner 2026-10-16: avail_site v1–v9 are not in use — no roles needed (they keep falling back; the segmentIcon /
  iconInline / linkInline / compact `_legacy` literals cover them anyway).
- Owner 2026-10-16 ("none of the tables resize columns except the one on table page"): UI.Table resized only through the
  caller's `setState` (`draft.columns[idx].size`) — only the spreadsheet section passes one; every list / admin / auth /
  datasets table showed a handle that did nothing. `ui/components/table/index.jsx`: without `setState` the widths live
  in local state for the session (owner: session only, not localStorage / not saved) keyed like isEqualColumns; drag
  listeners on window (releasing outside the table used to leave the drag stuck); the drag starts from the column's
  RENDERED width (an unsized / stretch column started from its nominal size, so dragging wider shrank it — Pages tab
  title 418 → 203); `display.disableColumnResize` turns it off and hides the handle (GIS error tables + file metadata).
  Checked live: /list, /auth/manage/users, /list/manage_pattern/27/pages, datasets table view on /data, /data-mny,
  /data-lb — +80px drag = +80px, header + body grids together, no movement after release. Spreadsheet path (setState)
  unchanged apart from window listeners + start width; no spreadsheet section on the test pages to try it live.
- Owner 2026-10-16 ("widen it"): the resize handle was a 1px strip (my own test missed it by a pixel). New structural
  table key `colResizerHit` (library styles[0] + LIST; inherited by every named style and every project theme —
  resolved on 4) = an invisible `::before` 4px either side of the line, appended to the handle's `colResizer` class
  in `TableHeader.jsx`. Hovering / pressing the pseudo-element counts as the element, so all 30+ theme `colResizer`
  strings (their `hover:` line colours) work unchanged. Checked: 3 UI.Tables on one harness page
  (`scratchpad/resize-two/`: two without setState, one with) — each drag moved only its own table; and on a page-pattern
  page (`/p/edit/flooding`, a Spreadsheet section on the "pg (pages)" source added in the editor and NOT saved — page
  still 9 sections, no changes): pressing 3px off the line + drag +60 released outside the table → column 115 → 175px
  through the section's setState.

### Committed 2026-10-16: library fa3d6955 / root 59c415f6 (datasets + Phase 0 + table resize; unpushed)

## Page pattern — started 2026-10-16

Inventory: 174 raw controls in 40 files (77 button, 46 label, 38 input, 9 select, 4 textarea, 0 table). Renders on
every project site (keys frozen in `_legacy/pages.js`); search + page filters render for visitors. Three read-only
proposal forks: P1 section / dataWrapper controls (spreadsheet ActionControls, ColumnManager, Add*Column,
ColumnControls, MoreControls, …), P2 edit chrome (editPane panes, sectionMenu, sectionGroup, search, error),
P3 filters (ComplexFilters, FilterControlCell, TimePicker rows). Next: merge → owner decisions → swaps.

### Page pattern — owner decisions (2026-10-16)
Proposals: P1 section / dataWrapper ~62 controls (scratchpad pgP1.json), P2 edit chrome 67 (pgP2.json), P3 filters 41
(pgP3.json) — session scratchpad. Findings: v3 edit panes render only on the default theme (`_legacy/pages.js`
`editPanes.*Wrap ''`); `complexFilters` / `timePicker` registered under `pages.*` but read top-level (the `_legacy`
freeze is dead — flagged, not fixed: fixing it would change project themes); bugs: spreadsheet ActionControls icon
picker always empty (`const Icons = []`), its selects store 'display' / 'type' (undefined option values), section
menu Save icon unstyled (`sec.menuActionSave` undefined).
- [x] **Visitor-facing branded controls → lift per theme** (in-page nav `navRail(On)`, search modal trigger
      `searchTrigger`, external-filter `toggle`, group modal close / collapse `iconRow`, filter-cell toggle checkbox
      style, filter setting labels FieldLabel style): library v6 role; each project theme's missing role / style is
      filled from its OWN current pattern strings (navigableMenu precedent in withLegacyUi) → project sites
      pixel-identical, authors can restyle by named style.
- [x] **TimePicker: mockup first** — add a "time filter" block to the v6 spec board, owner confirms, then swap.
- [x] **TNY v1 (`transportny/theme.js`) gets its own Button roles** (chip / small / … like TNY v2). tessera_v6: not in use, nothing.
- [x] Extras: column dialogs (Static / Calculated / Formula) → UI.Modal + clickable divs → buttons; spreadsheet
      ActionControls themed (+ `_legacy` freeze), icon picker filled from the real icon list (fieldTrigger + iconPick),
      Select sentinels fix the value bug; delete dead code (`richtext/components/colorPickerComp.jsx`, dataWrapper
      `AddFormulaColumn.jsx` duplicate → ColumnControls uses the sections one, `section_components.jsx` DeleteModal,
      and `components/search/SearchPage.jsx` — owner: "nothing uses the search page, only the search modal"; no importers).
- Applied by default: new named styles (Button iconInlineOn / iconInlineWarn / bare / iconTile(On) / boardPrimary /
  boardGhost / iconRowGo; Input title / menu (+ `_legacy` underline freeze) / bareInherit; Textarea quiet / bare;
  FieldLabel row), dialog commits = primary, + Formula / Calculated / Static = actionFull, section-menu Switch
  captions = plain spans, ColumnControls set-value tint dropped, error-page action / collapse toggle → project's own
  role, `useTimePickerTheme` inlined, `_legacy/ui.js` Input `bare` gets a real literal (MNY header search).
### Page Phase 0 — done 2026-10-16 (uncommitted)
- TNY v1 (`transportny/theme.js`) own Button roles in its Catalyst gray/blue vocabulary (primary = styles[0]; no
  local pattern uses TNY v1 — resolution only).
- New named styles: Button iconInlineOn / iconInlineWarn / bare / iconTile(On) / boardGhost / boardPrimary /
  iconRowGo / navRail(On) / searchTrigger / toggle(On) / groupModalClose; Input title / menu / bareInherit; Textarea
  quiet / bare; FieldLabel row. `_legacy/ui.js`: neutral looks for iconInlineOn / iconInlineWarn / bare / iconRowGo
  APPENDED after each theme's own styles (listing them in `_legacy` button.styles would push them in front of a
  theme's trailing generated styles like `navigableMenu_0` and shift stored indices); Input menu = frozen underline,
  Input bare = library literal.
- **Lift** (`liftPatternRoles` at the end of withLegacyUi; generalises the navigableMenu lift): per pattern style with
  its own source string and no selector, creates `<role>_<style>` on the target component, sets the selector key, and
  empties the wrapper key. Selector keys the swaps use: `pages.sectionGroup.navItemStyle` / `navItemActiveStyle`
  (navRail / navRailOn), `.modalCloseStyle` (groupModalClose; wrapper `modalCloseWrap`), `pages.searchButton.buttonStyle`
  (searchTrigger; wrapper `buttonWrap`), `filters[*].toggleStyle` / `toggleOnStyle`, `filters[*].settingLabelStyle`
  (FieldLabel), `filterControlCell.toggleCheckboxStyle` (checkbox: input / row / label). Library pattern themes must
  carry the default selector + wrapper keys. Verified: 85 lifted pairs on 12 themes = the theme's current string
  exactly; every theme's existing style lists unchanged (index + classes) apart from TNY v1 roles + Input bare.
  **Limit:** DB-authored themes (not in the code registry) don't pass through withLegacyUi → no lift.
- TimePicker spec block added to `ui-controls.html` (#time-filter) — awaiting owner confirmation; TimePicker files
  (TimePicker, PresetBar, RangeRow, DowRow, InstantRow, TimeOfDayRow, Chips) excluded from the swap until then.
- 2026-10-16: page Phase 1 forks (P1 / P2 / P3, TimePicker excluded) hit the rate limit and were resumed. Correction to
  the P2 proposal: `section_components.jsx` DeleteModal is NOT dead (section.jsx renders it as the delete-section
  confirmation) — its buttons are swapped instead. Edits uncommitted; if a later session finds them unfinished,
  re-run the inventory on `patterns/page`.
- **P3 done** (non-TimePicker): ComplexFilters captions → FieldLabel `row` / `inline`; FilterControlCell toggle →
  checkbox `rowLabel` + `toggleCheckboxStyle`; RenderFilterValueSelector setting captions → FieldLabel
  `settingLabelStyle` (+ `settingLabelCell`). Verified: ComplexFilters popup live on HEAD vs new (Select menu opens inside
  the Popup on both; picking closes it on both = existing), visitor filter cells in a harness (`scratchpad/p3-harness/`)
  — MNY identical, lifted setting labels identical.
  Fixed after (main session) — P3 found two unintended changes: non-MNY themes' filter toggle fell to the frozen browser
  checkbox, WCDB / catalyst setting captions to the gray FieldLabel inline. New checkbox named style `filterToggle`
  (v6 default; `_legacy/ui.js` = the old library row / input / label exactly) as FilterControlCell's default
  `toggleCheckboxStyle`, and FieldLabel `filterSetting` (= the old library `settingLabel` string, not in `_legacy`) as
  RenderFilters' default `settingLabelStyle`. Resolved on 9 themes: every non-MNY toggle = the old strings, MNY = its
  lifted own; WCDB / catalyst captions = the old string; default = v6 toggle + unchanged caption.
- **Incident 2026-10-16 10:16:** SSR resolve scripts (Vite createServer on the repo root, default cacheDir) overwrote
  `node_modules/.vite/deps` → :5199 504s and the owner's :5173 "Outdated Optimize Dep". Cache rebuilt 14:32 (:5199 OK);
  :5173 needs a restart by the owner. All session resolve scripts now use a private `cacheDir`
  (session scratchpad `vite-ssr-cache`); running forks told. Memory: feedback_vite_ssr_private_cachedir.
- **P1 done** (13 files at 0 raw): ColumnManager captions FieldLabel inline + icon toggles iconInline / iconInlineOn /
  iconInlineWarn; Add* column triggers actionFull, dialog commits primary, formula column rows → menuItem buttons;
  ActionControls themed (`ActionControls.theme.js` as `pages.actionControls`, `_legacy/pages.js` freeze), icon picker
  fed from theme.Icons (120 icons; was always empty), selects → UI.Select (fixes the 'display' / 'type' value bug), add
  and edit forms merged into one `ActionForm`; ColumnControls / MoreControls / InputControl / Card.config (via
  `EmptyDefaultLabel` in Card.jsx) / graph_new config (via `DescriptionField` in graph_new/index.jsx — keeps the configs
  Fast-Refresh-clean) / ColorControls (swatch = fieldTrigger) / ExportPdf; mnyHeader search = Input `bareInherit` (not
  `bare`: keeps MNY's 16px text from the wrapper). Deleted the dataWrapper AddFormulaColumn duplicate + colorPickerComp.
  Not live: MNY / landbank editors (driving "+" there risked a save), datasets ValidateComp (test source has no versions).
  Dialogs → UI.Modal was blocked (section-menu Popup z-index 9999 > modal z-30; the menu's outside-click closed it on a
  click inside the portaled modal). Library fix (main session): `Popup.jsx` ignores a mousedown inside an aria-modal dialog
  that contains neither the popup panel nor its trigger (a popup INSIDE a modal still closes normally); Modal named style
  `aboveMenu` (overlay z-[10000] only; panel etc. inherit each theme's styles[0] — resolved on 4 themes). P1 resumed to
  move the three dialogs onto `UI.Modal activeStyle="aboveMenu"`.
- Column dialogs now on `UI.Modal` (P1, verified live: above the section menu, a click inside closes neither, Escape
  closes only the dialog, focus starts in the first field via `initialFocus` — a field `autoFocus` had stolen focus
  before Modal recorded the opener — and returns to "+"). Inline dialog keys removed (dialogBackdrop / dialogPanel /
  formulaPanel; `dialogBody` added). Formula builder lost its 3xl width on the default `aboveMenu` panel → new Modal
  style `aboveMenuWide` (overlay z-[10000] + the `settings` panel); `_legacy/ui.js` modal `aboveMenuWide` = the frozen
  panel at sm:max-w-3xl **with the overlay repeated** (a same-named `_legacy` style replaces the library one wholesale,
  so without it projects lose the z-index). Resolved on default / mnyv1 / landbank / wcdb.
- **P2 done** (12 files at 0 raw): editor panes (Settings / Filters / Pages / History / Section groups), section menu
  (`CommitInput` gained `activeStyle`, used with Input `menu`; commits on Enter), sectionGroup (modal close via lifted
  `modalCloseStyle` — wrapper only when `modalCloseWrap` is non-empty; collapse toggle iconRow; header row `bare`),
  InPageNav (lifted navItemStyle + aria-current), ExternalFilters toggle (lifted toggleStyle / toggleOnStyle), search
  trigger (lifted `buttonStyle`; `buttonWrap` only when non-empty — a wrapper div moved TNY by 54px; library
  `flex flex-col mx-3 mt-4`; theme editor controls now edit buttonStyle / buttonWrap), error page action,
  section_components DeleteModal → delegates to UI.DeleteModal (it is used — section.jsx), ActionBtn via
  `menuActionStyle` (fixes the unstyled Save; `_legacy` '' keeps Pill chips). Deleted `components/search/SearchPage.jsx`.
  Board Discard / Publish gated by `discardBtnStyle` / `publishBtnStyle` (empty in `_legacy` → projects keep the old pair).
  Verified: visitor pages /p, /p-mny, /p-tny, /p-lb, /p-wcdb and the four project editors with the section menu open —
  **0 px** pixel diff HEAD vs new; open search modal 0 px (default, TNY). Not reachable: group modal close / collapse
  toggle, external-filter toggle, error page (lift equality covered by Phase 0 resolution). No page saved.
  Left: MNY `theme.js` dead `sectionGroupsPane.addGroupBtn`; Button.theme.jsx comments naming old keys.
- **Page pattern: 150 of 174 swapped.** Remaining 24 = the 7 TimePicker files, waiting for the owner's OK on the
  `ui-controls.html#time-filter` mockup block. Build OK; 9-page error sweep clean. Uncommitted.
- Owner 2026-10-16: "delete section modal opens below section menu, in some cases this means not having access to it."
  A regression from P2 (HEAD's hand-built UI.Dialog already layered above; `UI.DeleteModal` opened a plain Modal at
  z-30 under the menu Popup's z-index 9999). Fix: `UI.DeleteModal` takes `modalStyle` (the Modal named style to open
  with — layering is the caller's context, not a look; a `deleteModal` named style wouldn't reach TNY v2's flat
  deleteModal); section_components' DeleteModal passes 'aboveMenu'. Verified with the menu forced over the dialog: the
  dialog is topmost, Cancel reachable, overlay z 10000 (HEAD's Dialog also on top). Other section-launched modals
  already use aboveMenu / aboveMenuWide.
- Owner 2026-10-16: **TimePicker mockup OK** (incl. the visitor view); **commit after the TimePicker swap**; DB-stored
  themes that customised nav / search / filter-toggle classes are on their owners to update (no lift for them).
- **TimePicker done** (per the approved `ui-controls.html#time-filter` block): presets / weekday shortcuts chip(On),
  days segment(On) in a role=group tray, range count Input compact, selects UI.Select (`__none__` sentinel for the
  end column), times Input type=time, UI.Switch for Currently happening, clears iconInline, custom range small + Plus,
  active constraints Pill `tag` + icon theme keys (`rangeChipIcon` / `todChipIcon` ClockIcon, `dowChipIcon` '' — the
  library has no calendar icon), exposure checkbox rowLabel; `useTimePickerTheme` inlined (deleted).
  `timePicker.theme.js` → v6. Project freeze lives in `_legacy/ui.js` `timePicker` (withLegacyUi reaches the
  top-level key the component reads; `_legacy/pages.js` would land at the unread `pages.timePicker`). Visitors get
  viewer mode: `ConditionValueInput` takes `timePickerMode` (default 'author'); ExternalFilters passes 'viewer'.
  `_legacy/ui.js`: frozen Input `compact` gets `relative` (MNY's input container layer hid the text — also the datasets
  glance input on MNY); frozen `dowDayGrid` = the frozen segmented tray. Day buttons follow the letter width (roles
  can't take w-7). Verified in `scratchpad/tp-harness/` (default = mockup; MNY / landbank keep layout, controls take
  their roles), keyboard + selects. Open: dark mode looked washed out in the harness (forced data-theme) — check live;
  viewer shows "Currently happening" when Range is exposed (existing coupling).
- Owner 2026-10-16: "page rename and page delete modals open at different heights" — the v3 Pages pane had rename on
  UI.Dialog (upper-third positioner on themes that don't centre it) and delete on UI.DeleteModal (UI.Modal, centred).
  Rename → UI.Modal + `modalBody` text-left key + initialFocus on the field. The legacy (project) branch uses Dialog
  for both, so they already matched. Measured on the default theme at 900 / 1300px: both centred.
- **Page pattern 0 raw controls** (174 → 0). Admin / auth / datasets / page all 0. Build OK; 12-page sweep clean
  (only HEAD's own `placeHolder` warning); test pages 37 / 49 / 61 / 80 unchanged. Next: ui composites (117).
