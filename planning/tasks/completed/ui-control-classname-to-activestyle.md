# UI controls — className → activeStyle, per usage

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com, ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub.

Owner (2026-10-13): "buttons should not override theme using classname … they should use activestyle
prop to control style", then: "this change can't be wholesale. we need to check each usage before
deciding what to choose. only simple ones can be wholesale."

## Status

- [x] 18 simple admin swaps (step 2c below)
- [x] 7 near-simple admin usages (2026-10-13): swapped, extra class dropped (see below)
- [x] auth A, the Users / Groups manage pages (7), 2026-10-13 (see below)
- [x] auth B, the sign-in pages — done in round 3 via `primaryBlock`; was (login, signup ×2, forgot, reset `actionButton`): **skipped (owner,
      2026-10-13: "do A, skip B")**. Project themes (landbank, avail_site v1/v2/v5/v9) set their own
      `actionButton`; the `primaryBlock` idea (ink, full width, h-10) is parked. `ssoButton` stays as is.
- [x] datasets: all 38 UI.Button usages (32 JSX + 6 FieldSet config), 2026-10-13 (see below)
- [x] page pattern (10), 2026-10-13 (see below)
- [x] shared ui: Card form (5), Permissions removeBtn, draggableNav add page, navigableMenu back/close, 2026-10-13 (see below)
- [x] admin filterEditor `clearAllBtn`, 2026-10-13
- [x] ui leftovers: ButtonSelect segments, navigableMenu trigger, auth sign-in + SSO (round 3)
- [x] app-side callers before the lock: mapeditor (18), TransportNY components (11)
- [x] lock `Button.jsx` (className / themeOptions no longer set the look), 2026-10-13

## App-side callers + the Button lock ✅ (2026-10-13)

Owner: "for default theme, the after swap proposed look is good. for mny and transportny the keep via
activestyle looks good." Reviewed on a scratch preview page (repo `scratchpad/ui-lock-preview/`, gitignored)
that renders the real UI.Button with the real themes (registry + `withLegacyUi` + `getPatternTheme`).

**The 29 app-side usages** (`src/patterns/mapeditor` 18 + `src/themes/transportny/components` 11) use 14 new
named styles. On the **default theme** each is the v6 role chosen in the preview; on **project themes**
`_legacy/ui.js` DERIVED `literal` gives each one exactly the string Button's old `themeOptions` /
`className` produced (`OPT` / `OPT_SIZE` / `OPT_COLOR`, copied from the old Button.jsx), so nothing a
project theme already uses changes:

| Name | Default theme | Project themes (today) | Used by |
|---|---|---|---|
| `primaryMd` / `ghostMd` | primary | blue / transparent, base size | symbology modal confirm (ghost while disabled) |
| `dangerMd` | dangerSolid | red base | symbology modal delete |
| `cancelMd` | action | gray base | symbology modal cancel |
| `primarySm` / `dangerSm` | primary / dangerSolid | blue / red sm | save-changes confirm (danger on discard), symbology delete, TNY modal confirms |
| `ghostSm` / `cancelSm` | action | transparent / gray sm | modal cancels, Add Filter, stop editing categories |
| `primaryXs` / `dangerXs` | small / smallDanger | blue / red xs | column add/remove, interactive filter add/remove |
| `bareIcon` / `bareIconBox` | iconRow | `p-0` / `flex h-8 w-8 … p-0` | layer row ⋯ / info, legend ⋯ |
| `barePrimaryFull` / `bareActionFull` | primaryBlock / actionFull | `w-full` (unstyled) | TNY route / detour / closure panels |

Layout that rode in className moved to wrappers (interactive filter margins; TNY panel keys `"mt-3 w-full"`
now class a wrapper div).

**The lock** (`ui/components/Button.jsx`): the class is `theme.button` for the `activeStyle` only;
`className`, `themeOptions`, `padding`, `rounded` are accepted and dropped (not passed to the DOM); `type`
is limited to button / submit / reset (an unknown one like 'plain' made the browser treat it as submit;
the only `<form>` with a UI.Button, login, sets `buttonType="submit"`).

Verified: in the preview, Final = proposed swap 18/18 on the default theme (computed size, colours, type,
padding, radius, border, cursor); Final = today on MNY / TNY v2 (the 3 flagged diffs are harness
artifacts: capitalised text labels where the real buttons hold icons, and a harness-name collision on the
legend ⋯ whose Final 32×32 equals the measured "today"). No UI.Button with className / themeOptions left
anywhere (library, `src/patterns`, `src/themes`); raw `<button>`s with stray `themeOptions` attributes
(map editor SourceSelector) belong to the raw-HTML task. `vite build` clean; eslint no worse than HEAD;
no page errors on /data, version, metadata, admin, /p edit, /list, theme editor, auth users, /data-mny,
/p-mny edit. Not live on real pages: map editor and TNY components (no such pages in the local test data).

### Production themes check (2026-10-13, read-only CLI)

Owner asked "are you sure these look correct for mny and transportny?". The real patterns were read from
production (`dms raw get`): TNY pages / datasets use `transportnyv2` (the TNY components keep today's look, as
previewed); MNY datasets uses `mny_admin` (= `...mny` + admin layout; buttons rendered identical to `mnyv1`).
Both map editor patterns (MNY `/mapeditortest` 1920082, TNY `map_editor_test` 2226347) select **no theme**,
so they render with the library default and get the default "after swap" look, not the kept one. Owner:
"leave it."

## Round 3 ✅ (2026-10-13, owner: "If you'd rather keep a theme's old toolbar look… do it. #1: auth sign in can use activestyle to keep project specific look. #2: yes, adding named activestyle is okay… #3: okay to swap if you can keep the functionality. admin filter remove button: yes, change it.")

New named styles (`Button.theme.jsx`): `segment` / `segmentOn` (selected = ink, spec P1), `primaryBlock`
(full-width ink submit), `menuTrigger` (navigableMenu trigger).

| Item | Change | Project themes |
|---|---|---|
| Datasets toolbar look on TNY v2 / landbank | each theme pushes `iconTool` / `iconToolOn` = its own `styles[0]` | pixel-identical to HEAD again |
| Auth sign-in / signup ×2 / forgot / reset submit | `activeStyle='primaryBlock'`; `actionButton` deleted from auth defaultTheme | each theme's old `actionButton` became its own `primaryBlock`: avail_site v1–v10, landbank, TNY v2, fusion (an `AUTH_SUBMIT` const + push), MNY, wcdb (moved from `auth.js` / `auth.theme.js` into their `button.styles`); themes without one keep the old library cobalt via DERIVED `literal` (checked live: catalyst) |
| SSO button (login) | `ssoButton` is now only an on/off flag; look `actionFull` | no registered theme sets it |
| ButtonSelect | theme keys `buttonStyle` / `buttonActiveStyle` name Button styles (default `plain` / `active`, `segmented` → `segment` / `segmentOn`) | DERIVED `literal` = the exact pre-swap segmented classes; MNY history pane pixel-identical |
| navigableMenu trigger | Button `activeStyle={theme.buttonStyle \|\| 'menuTrigger'}` inside a `<span>` that carries `buttonHidden` (Popup clones it: ref, onClick, sm:hidden toggle) + `w-fit`; theme key `button` → `buttonStyle`, theme-editor setting too | `withLegacyUi` turns each theme's own `navigableMenu.styles[i].button` into a button style `navigableMenu_i` and points `buttonStyle` at it; DERIVED `menuTrigger` literal = the old library string |
| Admin filter editor row "remove" | `activeStyle: 'danger'` (was bare → ink primary) | admin theme only |

**Bug caught by the owner:** the first navigableMenu wrapper had no `w-fit`. `buttonHidden`'s `flex` made the
span block-level and full-width, and Popup positions the menu from that rect, so the section menu opened in
the wrong place. Fixed with `w-fit`. Verified by opening the menu on HEAD and on the new build: default
trigger / wrapper / menu rects are identical ([1034,318,32,24] / menu [1074,318,256,265]), and MNY's
opened-menu screenshot is pixel-identical. Lesson: the earlier pixel diff only hovered and never opened the
menu, so always open a Popup when its trigger changes.

Verified: `vite build` clean; eslint same as HEAD; live: default sign-in = `primaryBlock`; history pane
segments ink on default, MNY unchanged; datasets list TNY / landbank identical to HEAD; `withLegacyUi`
evaluated in the browser on landbank / TNY v2 / avail_site v5 / MNY / wcdb / catalyst returns each
theme's old sign-in string as `primaryBlock` and its own menu trigger.

Not live-walked: project-theme sign-in pages (no project-themed auth pattern in the test data, so only the
`withLegacyUi` output was checked); admin filter remove (needs saved pattern filters).

**Before locking `Button.jsx`:** the library has no Button with a className / themeOptions look left. The
app still has 29: `src/patterns/mapeditor` (18) and TransportNY's own components in
`src/themes/transportny/components` (11: AddGraphModal, ReportPickerModal, RouteTagBrowserModal, detour /
routing panels). These need swapping first. Also `type='plain'` (invalid HTML type) remains on 2 bare
Buttons (settingsPane, editSite tenant add).

## Page pattern ✅ (2026-10-13, owner: "go ahead with the page pattern buttons")

The 10 remaining `UI.Button` usages with className in `patterns/page` (the editor drawer / section menu
ones were done in library-port step 2a):

| Where | Was | Now |
|---|---|---|
| Filter panel toggle (RenderFilters + ExternalFilters) | `filters.toggleButton` (round bordered, cobalt hover icon) | `iconTool`; `toggleButton` now classes a **wrapper** (position, or `hidden` — almost every project theme hides the toggle, so the key kept its name and meaning); `toggleIcon` → `size-4` |
| ExportPdf "PDF Pages / Cover pages" | literal blue / gray | `chipOn` / `chip` |
| Spreadsheet "Action ▾", dataWrapper "Columns ▾", "More ▾" | literal gray-ring string + `type='transparent'` (invalid HTML type) | `action` |
| Pages pane "+ Add Page" (pre-v3 branch, what project themes render) | `className='w-full'` — **replaced the theme, so it rendered unstyled on every theme** | `actionFull`; the bordered box that faked a button lost its border |
| Pages pane delete modal (pre-v3 branch): Delete / Cancel | bare (ink primary) / `mr-1` + `type="plain"` | `dangerSolid` / `action`; footer `flex flex-row-reverse gap-2` |
| Pages pane rename modal (pre-v3 branch): Cancel | `mr-1` + `type="plain"` | `action`; same footer |

`_legacy/ui.js` DERIVED gained `chipOn: { from: 'active' }`, so an on/off chip pair stays
distinguishable on project themes (chip = theme default, chipOn = the theme's `active`). No earlier
caller used chip / chipOn.

Verified: the scan finds no Button with className / themeOptions left in `patterns/page`. Default
theme: the rename modal Cancel is exactly `action` (the default theme's delete modal is the shared
`UI.DeleteModal`, whose raw buttons belong to [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md)).
Project themes (HEAD pixel diff): page edit view is unchanged on MNY / TNY v2 / landbank. The pages drawer
changed only at "+ Add Page", which went from unstyled text to each theme's own button at full width.
eslint same as HEAD.

Not live-walked (no seeded page has them): filter toggle, ExportPdf, the three dropdown triggers, and the
pre-v3 delete / rename modals on project themes. Checked in code only.

## Shared ui + clearAllBtn ✅ (2026-10-13, parallel fork)

| Where | Was | Now |
|---|---|---|
| Card form: save / add | `formSaveButton` / `formAddButton` (fallback `'active'`); QA `qa_form` set a cobalt `formAddButton` | `primary` |
| Card form: cancel / keep | `formCancelButton` | `action` |
| Card form: delete / confirm delete | `formDeleteButton` / `formDeleteConfirmButton` (fallback `'active'`) | `danger` / `dangerSolid` |
| Permissions: remove grant | `removeBtn` | `iconRowDanger` |
| draggableNav "+ Add Page" | `className='w-full'` (replaced the theme: unstyled) | `actionFull` |
| navigableMenu header back / close | `backButton` / `closeButton` = `'w-fit'` (layout only, replaced the theme) | `iconRow` |
| admin filterEditor "clear all filters" | `clearAllBtn` | `linkMetaDanger`, in a block `<div>` so the flex-col doesn't stretch it (was `self-start`) |

Keys deleted: Card form keys (library comment, `qa.theme.js` `qa_form.formAddButton`, wcdb's 5),
`Permissions.theme.js` `removeBtn`, `filterEditor.theme.js` `clearAllBtn`, navigableMenu `backButton` /
`closeButton` (library theme + its 2 theme-editor settings entries + 32 `'w-fit'` copies in project
themes, incl. the TNY "Design System" theme copy). Card `formEditButtonsWrapper` gap 0.5 → 2 (default).

**wcdb** was the only project theme with branded Card form buttons. Its 5 strings became wcdb's own
`button.styles` roles `primary` / `action` / `danger` / `dangerSolid` (appended after `footLink`, so
indices hold). That's the recipe, but it is wider than the Card: every caller asking for those roles on
wcdb (datasets pages, the page editor drawer's named buttons) now gets the brand pills. Its delete
button's `mr-auto` (layout) was dropped.

Verified:
- Live, default theme: Permissions remove grant = `iconRowDanger` exactly (28px), no page errors.
- Pixel diff vs HEAD, `/data*/internal_source/4/admin` (note: HEAD lacks this session's earlier
  uncommitted datasets work, so other diffs there are expected). Permissions remove grant: default =
  spec look (grant rows ~4px taller, size-7 vs size-6); TNY v2 ≈ unchanged; **MNY → its round pill,
  landbank → a solid blue block**. That's the icon-role fallback problem below.
- eslint same as HEAD on all touched files; `vite build` clean.

Not live-walked (code level only): Card forms (no form-mode card seeded), filterEditor "clear all"
(renders only with existing pattern filters), draggableNav (UI component, no library caller found
besides the docs), navigableMenu's own header (every library caller passes `showTitle={false}` except
`sectionGroupsPane`; the section menu's "Back" is the page pattern's own and is unchanged).

**Open: icon roles on project themes.** `iconRow` / `iconRowDanger` / `iconTool` are registered empty in
`_legacy/ui.js`, so a project theme renders its default *text* button around an icon (MNY pill,
landbank solid block). Needs a DERIVED/legacy entry for icon roles (e.g. a theme-neutral icon-button
string), or per-theme definitions. Not done here (fork rule: `_legacy/ui.js` belongs to the main session).

Not swapped (need decisions / named styles): `ButtonSelect` segments (`buttonSelect.button` /
`buttonActive`, falls back to `'active'` / `'plain'`): needs `segment` / `segmentOn` in
`Button.theme.jsx`. navigableMenu trigger (`button` + `buttonHidden`, `btnVisibleOnGroupHover`): every
project theme brands it and `buttonHidden` is a visibility class, so normalising changes every
section-menu trigger. Raw `<button>`s seen (filterEditor reset / save, userMenuEditor remove) belong to
ui-raw-html-to-ui-components.md. Auth sign-in `actionButton` / `ssoButton` stay skipped (owner).

### Icon roles on project themes (2026-10-13, after the parallel fork)

`iconTool` / `iconToolOn` / `iconRow` / `iconRowDanger` were empty on project themes, so they drew the
theme's *text* button around a bare icon (MNY round pill, landbank solid blue block). `_legacy/ui.js`
DERIVED now gives a theme that doesn't define them a neutral gray icon button (`literal`). Pixel diff vs
HEAD: the Permissions remove-grant icon on MNY / TNY v2 / landbank looks as before (rows ~4px taller). The
datasets list toolbar changed: TNY's bare icons got bordered squares, and landbank's solid blue blocks
became neutral squares. MNY is nearly unchanged. A theme that wants its own icon look defines the role.

## Datasets ✅ (2026-10-13)

Owner (2026-10-13): "no ui component should allow classname to override theme. it should be done
using active style. give me a solution so that mny, and transportny themes can keep their look and we
can use activestyle." Then: "normalise. no block prop, add it to activeStyle."

**The solution (applies to every remaining area):**
- Every look is a `UI.Button` named style. Per-pattern button keys are deleted from the library
  defaults **and** from `_legacy/datasets.js`; callers pass only `activeStyle`.
- Project themes get their look by defining the role names in their own `button.styles`. Styles merge
  by name (`mergeComponentStyles`), so a theme's `danger` replaces the library's on that theme only.
- `_legacy/ui.js` registers every role empty on project themes, so a role a theme doesn't define
  renders that theme's own default button. `withLegacyUi` fills the derived names (`DERIVED`):
  `actionFull` = the theme's default + `w-full`; `dangerFull` / `dangerSolid` = the theme's own
  `danger` if it has one (TNY v2, landbank, avail_site, fusion), + `w-full` for dangerFull.
- Layout is never className: full width is its own named style (`actionFull`, `dangerFull`).
- Normalise (owner): the pre-v6 library strings the project themes still rendered (pastel
  download / cache / delete buttons, gray modal buttons, blue-tint Re-Validate / Update, TNY v1's own
  revalidate strings, which were deleted) now render the theme's role look.
- The pattern-scoped `datasets.button.styles` idea was dropped: with normalise nothing needs it.
- `Button.jsx` still honours `className` / `themeOptions` until every caller has moved; locking it
  is the last step.

New named styles (`Button.theme.jsx`, mirrored in `controls.py`): `iconToolOn` (ink fill, the on state
of an icon toggle), `actionFull`, `dangerFull`. Appended, so stored indices don't move.

Role per usage (default-theme choices for B1–B7 were my recommendations; the owner didn't object):

| Where | Was | Now |
|---|---|---|
| Version sidebar: Create Download / Cache PM Tiles / Delete Download | `createDownloadBtn` … | `actionFull` / `actionFull` / `dangerFull` |
| Download modal: Start download creation / Cancel | `createModalConfirmBtn` / `createModalCancelBtn` | `primary` / `action` |
| Delete-download modal: Delete / Cancel | `deleteModalConfirmBtn` / `deleteModalCancelBtn` | `dangerSolid` / `action` |
| Download modal: Toggle all | `toggleAllBtn` / themeOptions sm | `linkMeta` |
| PmTiles modal: Cache / Close | `pmTilesModalBtnBase + Green/Slate` | `primary` / `action` |
| Metadata: save, filter replace | `btnInlinePrimary` / `btnPrimary` (fallback `'active'`) | `primary` |
| Metadata: update, add option, add field, modal cancel | `btnInline` / `btn` / `addFieldBtn` | `action` |
| Metadata: remove, clear metadata, remove column | `btnInlineDanger` / `btnDanger` | `danger` |
| Metadata: delete-column / remove-PK confirm | `btnDangerSolid` (fallback `'danger'`) | `dangerSolid` |
| Validate: Re-Validate (ok / error) | `revalidateButton(Error)` | `action` / `danger`; the error text moved out of the button into `revalidateError` beside it |
| Validate modal: update / reset | `modalUpdateButton` / `modalResetBtn` | `primary` / `linkMeta` |
| Create page: Create / Cancel | `createBtn` / `cancelBtn` (ghost) | `primary` / `action` |
| Internal-table create: Create & Upload / Go to Dataset | `sourceCreateBtn` / `goToDatasetBtn` | `primary` / `action` |
| Datasets list toolbar: sort, show all, uploads | `toolbarBtn` / `toolbarBtnActive` (cobalt) | `iconTool` / `iconToolOn` |
| Admin sidebar: Add Version, Advanced Metadata (DAMA + internal) | `admin.actionBtn` | `actionFull` |
| GIS map popup: Save / Cancel | `editSaveBtn` / `editCancelBtn` / themeOptions | `small` |

Structural flags that used to be button keys now use a non-button key that `_legacy` freezes to `''`:
`RenderAddField` → `addFieldInputWrap`, metadata FieldSet button wrapper → `metadataFieldLabel`.
`type="plain"` (an invalid HTML button type) dropped from the touched callers.

Legacy layout that lived inside the old button strings moved to containers: `_legacy` download
modal footers get `flex flex-row-reverse gap-3`; the PmTiles footer is a right-aligned flex row
(was a 12-col grid sized for w-full buttons).

Verified:
- Default theme, live: every swapped button's class set equals its named style exactly (list toolbar
  on/off, create page, internal-table create, both admin sidebars, version sidebar, download /
  delete-download / PmTiles modals, metadata add / remove column / delete modal, validate ok + a
  routed error). No page errors.
- Project themes: HEAD-baseline pixel diff on MNY, TNY v2, landbank (list, create, admin, version,
  3 modals, metadata delete modal, validate). Unchanged: list, create, admin, metadata modal. Changed
  only where normalised: version sidebar + download modals (theme default buttons, MNY pills), and
  Re-Validate (theme default). TNY v2's default button is a mono text link, so its normalised buttons
  read as links; give TNY v2 its own `action` / `primary` if that's not wanted.
- `vite build` clean; eslint same as HEAD.

Not live-walked (code level only, same names): GIS map popup Save / Cancel (no GIS data locally),
"Go to Dataset" after a create, the datasource-type metadata FieldSet.

Seen, not changed: raw `<button>`s are outside this pass (e.g. DeleteSource's modal buttons,
internal "Add Version", "Delete Source"). Metadata "add" is now 32px beside a 42px input until the
fields pass brings inputs to 32px.

## Auth A — the manage pages ✅ (2026-10-13, owner: "do A, skip B")

The Users / Groups / Profile pages render with `getAdminTheme` (library default + only the theme's
`admin` key), so they look the same on every site. WCDB's `auth.authPages.manage` overrides
(`headerAction` / `rowAction` / `modalAction`) never reached them; they're dead config, left alone.

| Button | Was | Now |
|---|---|---|
| Users "Add new" (`authUsers.jsx`) | `m.headerAction` (cobalt) | `primary` |
| Groups "Add new" (`authGroups.jsx`) | `m.headerAction` (cobalt) | `primary` |
| Add-user modal "Add" | `m.modalAction` (cobalt) | `primary` |
| Reset-password modal "reset" | `m.modalAction` (cobalt) | `primary` |
| Add-group modal "Add" | `m.modalAction` (cobalt) | `primary` |
| User row "view as" / "reset password" | `m.rowAction` | `small` |

Deleted `headerAction` / `modalAction` / `rowAction` from `auth/defaultTheme.js` (+ the `shrink-0`
fallbacks in `authUsers.jsx` MANAGE_DEFAULTS and `authGroups.jsx`). Verified live: every button
renders exactly its named style; "Add new" is 85px with or without `shrink-0` at 1440 and 390; no
page errors; build clean; eslint same as HEAD. `headerInput` (3 table-header search inputs) left
for the fields pass.

Seen, not changed: the user-group chips in the Users table are still cobalt (spec: tags), and the
selected table cell has a cobalt outline.

## The 7 near-simple admin usages ✅

Each key's string is a `UI.Button` named style plus one extra class.

| # | Where | Key | Named style | Extra |
|---|---|---|---|---|
| 1 | `admin/pages/editSite.jsx:555` (site page "Add pattern") | `editSite.addPatternBtn` | `primary` | `flex-none` |
| 2 | `admin/pages/editSite.jsx:926` (tenant list "Add tenant") | `editSite.addPatternBtn` | `primary` | `flex-none` |
| 3 | `admin/pages/themes/list.jsx:107` ("add theme") | `themes/list.addButton` | `primary` | `flex-none` |
| 4 | `admin/pages/editSite.jsx:626` (pattern row, save) | `editSite.btnSave` | `small` | `m-1` |
| 5 | `admin/pages/editSite.jsx:640` (pattern row, cancel) | `editSite.btnCancel` | `small` | `m-1` |
| 6 | `admin/pages/editSite.jsx:651` (pattern row, duplicate) | `editSite.btnDuplicate` | `small` | `m-1` |
| 7 | `admin/pages/editSite.jsx:675` (pattern row, remove) | `editSite.btnRemove` | `smallDanger` | `m-1` |

Owner (2026-10-13): "1,2,3 don't need flex-none. 4-7 also don't need the extra class. 4-7 are
unreachable atm." All 7 now use `activeStyle` with no className. Deleted `editSite.addPatternBtn /
btnSave / btnCancel / btnDuplicate / btnRemove` and `themeList.addButton` (no other readers, no
project-theme overrides). Verified:
- Add pattern (`/list`) and add theme (`/list/themes`) render exactly the `primary` class set;
- their width is unchanged with or without `flex-none` at 1440, 390 and 320 (127px / 120px);
- Add tenant renders only for a multi-tenant platform admin, so it isn't reachable on the test
  site; it sits in the same toolbar as Add pattern;
- 4–7 are unreachable for now (owner);
- build clean; eslint same as HEAD.

### Analysis: removing inline style overrides (owner 2026-10-13: "buttons should not override theme using classname … see the effects")

How the primitives treat `className` today:

| Component | Behaviour | Callers passing className |
|---|---|---|
| `UI.Button` | **replaces** the theme (`className \|\| theme.button`) | 93: 70 via pattern theme keys (datasets 32, admin 26, auth 13, page 10, ui 12 overlap), 19 literal looks, 4 layout-only |
| `UI.Input` | **replaces** (spread after the theme class) | 5 (admin 3, auth 2) |
| `UI.MultiSelect`, `UI.Table` | **replaces** (`className \|\|`) | 0 / 1 (auth groups header cell) |
| `UI.Pill` | `...rest` would replace | 0 real (the scan hits are `className` on an Icon inside `text`) |
| `UI.Modal`, `UI.Dialog` | appends | fine |
| `UI.Icon` | appends (sizing) | 285, legitimate |

Effects of making Button / Input / MultiSelect / Table ignore or stop replacing with className:
1. **Project themes would change.** Pattern keys (datasets.admin.actionBtn, pages.editPanes.btn …)
   carry each project's frozen look through `_legacy/*`; dropping className loses that, against the
   "other themes don't change" rule. Fix: a gate. A pattern key becomes `''` in the default theme and
   the caller uses `activeStyle`; the legacy freeze keeps the old string, which still replaces (only
   when non-empty).
2. **Layout is lost.** About 25 callers mix layout into the look string (w-full, mt-1, flex-none,
   self-start, m-1, ml-auto) and 4 pass layout only. Fix: a layout-only append path (className appends
   when an activeStyle is given, or a separate prop).
3. **Contextual looks need their own named styles:** the dark edit bar / Publish, auth's full-width
   submit, ButtonSelect segments (`segment` / `segmentOn`), and the dataWrapper toggles.
4. **The theme-editor / DB-authored customisation surface moves.** Per-pattern button keys would stop
   being honoured on the default theme; authors restyle via the theme's `button.styles` instead. Global
   per name, which is the point (one action look), but a DB theme that set a pattern key would see no
   effect.
5. **Literal looks to replace:** ExportPdf blue / gray toggles, dataWrapper MoreControls /
   ColumnControls / ActionControls (gray-900 ring), and auth's `m.*` / `sectionGroupTheme.actionButton`
   per-page strings.
6. Cleanup on the way: `type='plain'` is used as if it were a style; it's an HTML button type.

Proposed plan (awaiting owner OK): Button gets a gated path (non-empty className = legacy replace;
otherwise theme style by `activeStyle` + appended layout). Then per area: default-theme pattern keys
→ `''` + an `activeStyle` per role, legacy freezes untouched, verified pixel-identical on MNY / TNY /
landbank. Admin and auth have no project-theme surface, so they just drop the keys. Same for Input /
MultiSelect / Table afterwards.

Owner (2026-10-13): "this change can't be wholesale. we need to check each usage before deciding
what to choose. only simple ones can be wholesale."

### Step 2c — the 18 simple admin swaps (2026-10-13, owner: "go ahead with the 18 simple ones") ✅

Simple means the admin key held only a spec look, with no layout, and no project theme overrides
it. Each caller went from `className={t.KEY}` to `activeStyle='…'`, and the key was deleted:
- `editSite.jsx` (both delete-pattern modals): btnSecondary → `action`, btnDanger → `dangerSolid`
- `themeEditor.jsx`: btnSave / btnReset / btnFullReset → `primary` / `action` / `smallDanger`
- `themes/list.jsx`: btnSave / btnCancel / btnDuplicate / btnRemove → `primary` / `action` / `small` / `smallDanger`
- `themes/editTheme.jsx`: btnSave / btnReset → `primary` / `action`
- `components/patternList.jsx`: addButton / btnSave / btnCancel / btnDuplicate / btnRemove →
  `primary` / `primary` / `action` / `small` / `smallDanger`

16 keys were deleted from the five matching `.theme.js` files. Auth only names them in comments.
Verified:
- The live class sets match the named styles exactly. This was checked for the delete-pattern
  modal (Cancel, Delete) and the theme editor (save, reset, full reset). The pattern list renders
  with no page errors.
- Every `activeStyle` name in the diff exists in `Button.theme.jsx`.
- `vite build` is clean, and eslint shows no new issues against HEAD.

Not live-walked: the themes list and editTheme states, because the test data has no themes, and
the pattern list save / cancel states. Those use the same names and were checked at the code level.

### 2026-10-15 — closed

Done: every library and app-side `UI.Button` takes its look from `activeStyle` only; `Button.jsx` locked.
Raw `<button>` elements are the follow-on, [ui-raw-html-to-ui-components.md](../completed/ui-raw-html-to-ui-components.md).
