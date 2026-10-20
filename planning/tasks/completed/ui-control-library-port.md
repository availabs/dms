# UI controls — library port of the v6 control looks

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub.

Ports the approved spec (`design_system_v6/pages/ui-controls.html`) into the library default theme,
area by area. **Rule:** only the default theme changes; project themes keep their look through the
`_legacy/*.js` freezes, verified with the HEAD-baseline pixel diff on MNY / TNY / landbank.

## Status

- [x] Step 1: `UI.Button` named styles + the `_legacy/ui.js` freeze
- [x] Step 2a: page drawer + section menu (+ follow-up on its sub-pages)
- [x] Step 2b: admin
- [~] Step 2d: auth. The manage pages' buttons (Add new, modal submits, row actions) moved to
      `primary` / `small` on 2026-10-13, see
      [ui-control-classname-to-activestyle.md](./ui-control-classname-to-activestyle.md). The sign-in
      pages' cobalt submit (`sectionGroupTheme.actionButton`) is skipped for now (owner). Still cobalt:
      the user-group chips in the Users table.
- [x] Step 2e: datasets (audit + fixes 2026-10-14)
- [x] P4: `UI.Table` 'list' style for the admin / auth lists (2026-10-14, [ui-control-tables.md](./ui-control-tables.md))

### Library port — step 1: UI.Button (2026-10-13, owner: "start the library port")

- **Owner, mid-step: "don't use shared controls.js. keep each const in their respective theme
  folder for each component."** A generated `ui/controls.js` (from the mockups' `controls.py`) was
  created and then removed, along with its generator. Each component's look constants live in its
  own `.theme` file, and pattern themes copy the string they need. The mockups' `controls.py` stays
  as mockup tooling only.
- `ui/components/Button.theme.jsx`:
  - the v6 constants are defined at the top of the file;
  - styles[0] ('default Buttons') = the ink primary. This is a straight recolour: every bare
    UI.Button was solid cobalt and stays the primary role;
  - named styles are appended after 'plain' / 'active', so stored indices don't move: `primary,
    action, danger, dangerSolid, small, smallDanger, iconTool, iconRow, iconRowDanger, linkMeta,
    linkMetaDanger, linkProse, chip, chipOn`.
- `src/themes/_legacy/ui.js` `button`:
  - styles[0] is frozen to the old cobalt string;
  - every new name is listed **without a class**. A same-named override replaces the library style,
    and a class-less named style inherits styles[0] at lookup, so on a project theme every named
    style renders that theme's own default, exactly what an unknown activeStyle did before;
  - a project's own same-named style (avail_site / landbank 'danger', 'chip') still wins.
- Verified against the HEAD baseline (separate Vite on :5198):
  - MNY / TNY / landbank metadata, page edit, admin, version and create are **pixel-identical**;
  - default theme: admin Access "add" went from cobalt 36px Public Sans to ink 32px Plex Sans.
  - Note: the baseline Vite needs its own `cacheDir` (`vite.base.config.mjs`). With the shared
    symlinked `node_modules/.vite` the two servers invalidate each other's deps (504 "Outdated
    Optimize Dep" → blank pages).
- Scope note: admin pages render the library default on every site (each project theme only
  supplies its admin logo), so admin's bare buttons are ink everywhere, consistent with the admin
  port.
- Build OK; eslint = HEAD.
- **33 bare-button callers keep the primary role they had**, even where it's wrong (Cancel,
  copy / paste, Delete in the Pages pane, ExportPdf select / clear, patternList Edit / remove). Step 2
  assigns roles per page (`activeStyle='action' | 'danger' | …`), confirming each. The 5 callers on
  the old 3D-blue 'active' style and `Button.jsx`'s hardcoded `themeOptions` colours are also left
  for step 2.

### Library port — step 2a: page drawer + section menu (2026-10-13, owner: "go ahead with the page drawer and section menu")

- Finding: the v6 drawer panes (default theme only; legacy themes are gated off by
  `settingsWrap` / `pagesWrap` …) never use bare UI.Button. Their buttons are `pages.editPanes`
  keys. The bare-button calls in `settingsPane` / `pagesPane` are the pre-v3 panes that project
  themes render, so they are left alone, except the row Delete / Rename modals, which the v3
  Pages pane also uses.
- `editPanes.theme.js` (default only):
  - `btn` → action and `btnPrimary` → ink primary (14px Plex; were 12.5px, neutral primary);
  - `input` and `pagesFind` → rule-strong hairline (32px field);
  - `filterChip` (url / fixed / derived) → outlined marker;
  - `filterAddBtn` → prose link;
  - focus rings on `filterAddBtn`, `filterClear` and `pageMenuBtn`;
  - new `modalTitle` / `modalActions`.
- `pagesPane.jsx`: the v3 rows pass `t` to the row modals.
  - Delete → the shared `UI.DeleteModal` (Cancel + solid brick). It was a filled primary "Delete",
    an unstyled Cancel and an empty `fa-danger` icon.
  - Rename → title, a 32px field (Enter submits), Cancel (action) + Rename (primary, disabled
    until the title changes).
  - The pre-v3 pane keeps the old modals.
- Section menu action row: new `ActionBtn` (in `section_components.jsx`, same props as Pill),
  gated by new `pages.section` keys `menuActionBtn` / `menuActionBtnDone` / `menuActionSave`:
  - 28px row icons; save = ink; "copied" = go;
  - legacy `''` → the old blue / orange / green Pill chips.
- Submenu value (e.g. Type "Rich Text"): `navigableMenu` `valueWrapper` → plain pencil meta text.
  The old boxed chip is frozen in `_legacy/ui.js` `navigableMenu`, because MNY / TNY don't set
  navigableMenu and would otherwise inherit the change.
- TemplateManager (section menu → Templates): Save → `primary`, "Overwrite…" → `action`,
  Overwrite → `primary` (the same roles as the drawer's Save-as-template).
- Verified vs the HEAD baseline:
  - MNY / TNY / landbank page edit, section menu open (sections 41 / 53 / 72), settings, filters,
    pages, rename: **pixel-identical** (one 8px anti-alias speck on MNY pages);
  - default theme: menu row icons + pencil value; outlined filter markers + "add filter" link; ink
    "+ page"; the rename dialog renders.
  - Build OK. Lint: only new `react/prop-types` (the rule those files already break); the
    sectionMenu fast-refresh warning predates this.
- **Finding, not fixed (pre-existing, cross-theme leak):** `src/themes/landbank/design_system/_shared.css`
  sets an unlayered `:focus-visible { outline: 2px solid #0B87BC }`. landbank's theme injects it into
  the document head, so on any site that has a landbank pattern it applies to every page, every
  theme. Being unlayered, it beats Tailwind's layered utilities (`outline-none`, the ink focus
  rings). The avail_site `surfaces.css` files carry the same kind of global `:focus-visible` rule.
  Fix idea: scope those rules under the theme's root class, or put them in a CSS layer.
- Not mocked: the rename dialog (it follows the ui-controls.html modal shell).

### Step 2a follow-up — section menu sub-pages (owner: "section menu filters still show blue")

- Cause: step 2a converted only the top action row. The section menu's sub-pages (Filters:
  "+ Condition / + Group", copy / paste; Columns: Duplicate, Use ID, Show all, Remove All, + Formula,
  Add; Card config; dataWrapper ColumnControls; "Shown When Collapsed") use the shared `UI.Pill`
  with `color='blue' | 'orange' | 'green'`, and the switches are `UI.Switch`, hardcoded indigo. Page 16
  had deferred both "to the primitives task".
- Every blue / orange / green Pill caller in the library is a page-editor control (checked: no
  status use), so the fix is in the primitives, not per caller:
  - `Pill.theme.js` (default only): `blue` → small toolbar button, `orange` → small danger,
    `green` → small ink confirm. The old tints are frozen in `_legacy/ui.js` `pill`.
  - `Switch.theme.js` gets its first keys (`trackOn` ink, `trackOff` rule-strong, `knob` paper,
    `focus` ink ring), registered as `switch` in `ui/defaultTheme.js`. `Switch.jsx` reads them; sizes
    stay structural. Old indigo-600 / gray-200 / white frozen in `_legacy/ui.js` `switch`.
    transportny v2's unused `switch` object uses other key names (`track` / `trackChecked` / `thumb`),
    so it doesn't activate.
- Known misfit: "Refresh Meta" is `orange` (not destructive) and now renders small-danger on the
  default theme. Changing the caller's colour would change project themes, so it's left.
- Verified:
  - default: Filters and Columns sub-pages (the section switched to Spreadsheet, unsaved) show no
    blue; the switch is ink;
  - MNY / TNY Filters / Columns: **pixel-identical** to HEAD (still blue pills + indigo switch).
- Build OK; lint = HEAD (Switch.jsx 5 vs 6).

- **Owner 2026-10-13:** "i don't like how save buttons look on section menu and filters. the black
  there is too dark. in dark mode the white there is too white. it feels out of context. keep them
  the same as other icons around them." Changes:
  - `pages.section` `menuActionSave` = the same row-icon style as `menuActionBtn`;
  - Pill `green` = the same as `blue` (small neutral), so the Filters save / apply, ColumnManager
    "Add" and the "copied" state no longer fill. The action row's "copied" keeps its go icon tint
    (feedback, not a fill);
  - mirrored in `section_menu.py` / `page_edit.py` (save / cancel plain) and the ui-controls.html
    note.
  Rule: inside an icon row, the save / confirm is not set apart by a fill.

### Library port — step 2b: admin (2026-10-13, owner: "go ahead with admin")

Admin always renders the library default on every site (project themes only supply the admin
logo), so these apply to every site's admin. No legacy freeze is involved.
- **105 control keys in 13 admin theme files** mapped to the spec looks (strings inlined in each
  file, per the owner's rule):
  - ink primary: every save / add / done / "+ New Page" / "Add pattern" / "add theme" — 18 cobalt
    fills gone;
  - action: reset / cancel / back / duplicate;
  - danger outline + solid brick confirm: delete pattern;
  - small: raw json, expand / collapse, sync to pages, + add subdomain, row publish / discard /
    restore, the tenant-row save / cancel / add;
  - small danger: remove, full reset, row delete;
  - row icons (28px, pointer): site-list / themes edit, duplicate, delete, format-manager icons,
    pages-editor row icons + ⋯;
  - filter chips: site-list type filter, pages lenses (active = ink);
  - segmented (active = ink): pages scope, theme-editor frame tabs, user-menu Default / own;
  - status r4: activity badges, pages draft / published, view-chip stale / fresh (were hardcoded
    amber / emerald / red);
  - markers / counts: format-manager types, count pills;
  - error callout: the pages delete-modal warning.
- Fields: focus cobalt → ink everywhere in admin. Search boxes 40 → 32px; single-line inputs
  (format manager, filter / permissions subdomain, user-menu, add-pattern) → `h-8`.
- P2: SideNav `admin` style active rows (all levels) + active icon → well + ink.
- P3: type pills keep their tones; the pattern-overview header pill now uses the type's own tone
  (`headerTypeTones`; it was always cobalt, so a datasets pattern showed blue); the add-pattern
  picker tags use the same pill shape.
- Group 1 calls applied in admin: breadcrumb current → ink; activity avatar → neutral; the
  user-menu info notice → neutral.
- "Chosen" → ink:
  - selected template / pattern cards (ink border + lift);
  - the "editing…" tag;
  - the active filter select;
  - open icon picker / select;
  - the selected icon;
  - the drag-over line;
  - the QA feature switch visual.
- Kept cobalt: links (`tenantLink`, `usedByLink`, `qaLink`, `datasetLink`, `previewLink`, row-title
  hovers), the duplicate progress bar, the "edited" status tone, the theme editor's section labels,
  the editSite header rule.
- Bare UI.Button roles:
  - ✕ remove location → `iconRowDanger`;
  - "+ add location" → `linkProse` (it was unstyled: a className replaced the theme);
  - "clear all filters" ×2 → `linkMetaDanger`;
  - patternList "Edit" → `small`;
  - tenant-modal Cancel → `action`;
  - Create / Add stay primary;
  - also `type='plain'` (not a valid button type) → `'button'`.
- `ui/columnTypes/activity_action_badge.jsx` → token status pills (were hardcoded emerald / blue /
  gray, rounded-full).
- Verified:
  - an inventory re-walk of 16 admin states finds **0 buttons without a pointer** (was ~40) and no
    cobalt-filled controls left except the P3 type pills and the "edited" status;
  - visual pass on the site list, pattern overview, pages, access, user menu, format manager;
  - MNY / TNY / landbank pattern pages + datasets: **pixel-identical** to HEAD;
  - build OK; lint = HEAD on every touched file.

- Fix (owner: "pattern editor: pages: the filters empty, orphans etc show no count text when
  selected. same for any filters on admin that uses pills"): `pagesEditor.theme.js`
  `lensCountActive` was a panel-white bubble with `text-inherit`, so on the ink active chip it was
  paper-on-white. It is shared by the Activity tab's filter chips. Counts are now the chip's own text at
  reduced opacity (`lensCount` `opacity-60`, `lensCountActive` `opacity-70`), per the spec. Verified
  "EMPTY 2" (light + dark) and Activity "EDITS 1". The site list's chips carry the count inline, so they
  were fine.


### Step 2e: datasets — AUDIT (2026-10-14, owner: "#2 audit"; nothing changed)

Datasets default-theme keys checked against the spec rules (ink primary, ink focus, links in text stay cobalt,
running status may be cobalt, no hardcoded palette). Already done elsewhere: buttons (className → activeStyle
roles), lists (UI.Table 'list'), catalog rail + "+ new source" (ink, 10/14), tabs (ink), version Delete.

**Still off-spec:**
1. **Cobalt primary buttons (4)** → ink primary: `admin.theme.js` `addVersionBtn`; `sourceOverview.theme.js`
   `promoBtn`, `verAuthSave`, `verDownloadBtnPrimary`. (All raw elements — could go straight to `UI.Button
   'primary'` under the raw-HTML task.)
2. **Cobalt field focus (10)** → ink focus (`focus:border-[var(--t-ink)]`): `upload.theme.js` FIELD,
   `categories.theme.js` `input`, `admin.theme.js` `addVersionInput`, `sourceOverview.theme.js` `glanceInput` /
   `verAuthInput` / `verAuthTextarea`, `CreatePage.theme.js` INPUT, `gisCreate.theme.js` FIELD,
   `gisMap.theme.js` INPUT / `editTextarea`.
3. **Breadcrumb** `Breadcrumbs.theme.js` `current` cobalt → ink (owner Group 1, 10/13: "the current breadcrumb
   item → ink"); `homeIcon` cobalt (keep as a logo-mark? decide).
4. **Cobalt text buttons** → spec: `categories.theme.js` `stopBtn` (→ linkMeta look) and `plus` hover;
   `sourceOverview.theme.js` `colFooter` "+ N more columns" (mockup: graphite → ink hover).
5. **Unported upstream components, hardcoded gray / blue / red:** the version **lineage card**
   (`sourceOverview.theme.js` `linCard` / `linLabel` / `linItem` / `linLink` / `linMeta` / `linMissing`) and
   **ChangeHistoryEditor** (`ChangeHistoryEditor.theme.js`, internal source admin) — no v6 port, wrong in dark mode.
6. **Dead:** `components/sourceTable.theme.js` (`datasets.table`) has no consumer — delete (+ any `_legacy` /
   project copies) after a final check.

Kept (correct per rules): link-in-text cobalt (`cardView`, `emptyLink`, `colMetaLink`, `fileUrl`,
`deleteModalLink`, `outputLink`, hover-cobalt names), `statusRunning`, the overview Req dot (mockup draws it
cobalt). Project themes: each fix needs its pre-change value in `_legacy/datasets.js` if not already frozen.

### Step 2e — fixes applied (2026-10-14, owner: "add version seems ink? but go ahead, do #2.1 … 2.6 and close it"; "breadcrumb icon turns ink")

- "Add version" (the sidebar opener) was already ink; the cobalt one was the modal's `add` submit (`addVersionBtn`).
- 2.1 ink primary: `addVersionBtn`, `promoBtn`, `verAuthSave`, `verDownloadBtnPrimary`.
- 2.2 ink focus: upload `FIELD`, categories `input`, `addVersionInput`, `glanceInput`, `verAuthInput`,
  `verAuthTextarea`, file-upload `INPUT`, gis create `FIELD`, gis map `INPUT` / `editTextarea`.
- 2.3 breadcrumb `homeIcon` + `current` → ink.
- 2.4 categories `stopBtn` → pencil / ink hover, `plus` hover ink; overview `colFooter` → graphite / ink hover.
- 2.5 lineage card (`verInputsChangedChip` → amber status chip, `lin*` → tokens, link stays cobalt) and
  ChangeHistoryEditor (matches the Access panel) ported; pre-change values frozen in `_legacy/datasets.js`
  (`sourceOverview` lin*, new `changeHistoryEditor` block). TNY v2 keeps its own `linCard`.
- 2.6 `components/sourceTable.theme.js` + its `datasets.table` registration deleted (no reader).
- All other keys were already frozen in `_legacy/datasets.js` (checked key by key, incl. every key using the
  shared FIELD / INPUT consts). Verified: build OK; MNY / TNY / landbank internal admin + catalog
  pixel-identical to HEAD (overview / version diffs are the earlier, intended list-table and Delete version
  changes); default internal admin light + dark (change history = Access panel look), breadcrumb ink.
  Lineage card not seen live (no lineage data).

**Task closed 2026-10-14.** Step 2d's auth sign-in submit stays as the owner left it (skipped).
