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
