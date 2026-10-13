# Datasets + Page patterns v6 port — mockups first, then the default theme

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** doing · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

**Project:** DMS library (`src/dms` submodule) + mockups in `src/themes/tessera/design_system_v6/pages/`

The sibling of [`admin-pattern-v6-port.md`](./admin-pattern-v6-port.md). The admin surfaces (sites,
themes, pattern editor, users, groups, profile, login) are done; this file covers the two remaining
pattern families — **datasets** and **page** — and takes over the page/datasets half of
[`tessera-component-theme-port.md`](./tessera-component-theme-port.md)'s unstarted **Phase B**
(that file's `patterns/auth` bullet is already covered by the admin port).

Read "Current status" first when resuming.

## Current status (2026-10-06, session 2 end)

- **Batch 1 APPROVED** (owner, 2026-10-06). Round-2 fixes: user menu on every page (sticky sidebar
  bottomMenu, sync inside its dropdown, theme toggle kept), catalog hidden buckets last, source
  subtitle specified (Decisions 8–10).
- **Batch 2 reviewed 2026-10-06; revisions applied (Decisions 11–19), awaiting re-review** (all 16 pages; 20 mockups total, all in ds-nav).
  Every page checked in Playwright: no JS errors, no unregistered icons, no horizontal overflow
  at 1440 or 390.
- Generators: **`src/themes/tessera/design_system_v6/scripts/`** (moved from scratchpad
  2026-10-06, owner OK) — `python3 …/scripts/build_all.py` rebuilds all 20; `check.mjs` sweeps them.
  See `scripts/README.md`. Edit the script, not the generated page.
- Gotcha: `t-metaXS`/`t-metaSM` uppercase — use `t-metaMD` for code/JSON/identifiers.
- Gotcha: v6 colors are CSS vars, so Tailwind opacity modifiers (`bg-well/60`) silently render
  nothing — use `opacity-*` or another token (11 instances fixed 2026-10-06).
- **Live findings (bugs / dead code surfaced while mocking — not fixed, nothing touched):**
  1. ~~task page "Tasks" crumb links `/tasks-new`; route is `/tasks`.~~ FIXED 2026-10-07 (page 11).
  2. version page "Delete View" links `/source/:id/versions/:view/delete` — no such route.
  3. gis `Uploads` page is registered on no dataType, yet GIS publish navigates to
     `/source/:id/uploads/:ctx` (falls back to Overview); its list rows also drop `baseUrl`.
  4. `components/search/SearchPage.jsx` is not routed anywhere (and unthemed).
  5. Unthemed surfaces needing keys: UdaTaskList, schedule/runs pages, version.jsx, search page,
     `UI.DeleteModal` (see page 3).
  7. ~~internal source Admin: Add Version always disabled / Tasks list empty on preloaded sources
     (`source.source_id` unset)~~ FIXED 2026-10-07 — see page 3.
  6. Empty states missing live (task list renders nothing; validate hides when all valid; source
     not-found / no-access render blank) — designed as PROPOSED in the mockups.
- **Remaining (2026-10-06):**
  - Mockup gaps: time picker (`pages.timePicker`) and dama map (`pages.damaMap`) not mocked;
    register icons TrashCan / CircleCheck / UserCircle / Logout (+ add Refresh's catalog tile on
    design-system/theme.html).
  - Implementation, per page, each confirmed first (Process rule 1): theme-only ports (19 datasets +
    12 page `.theme.js`, new keys: pages.editPane, datasets schedule / runs / version /
    udaTaskList, search page) → component changes (Settings v3 + Filters pane + panes v3, remove
    Data sources pane, UI.Permissions v3, catalog Type cards + rail order, PROPOSED states, page
    finder / status marks / history filter, uploads hook-up) → project-theme re-key audit
    (mny, transportny ×2, wcdb, avail, landbank, tessera) → build + lint → Playwright check on
    the scratch-sqlite setup, light + dark.
  - After implementation: live findings 1–3, 5.
  - FLAGGED: mobile TopNav for the default Layout (logo + user menu below lg) — see page 1 notes.
  library edit (Process rule 1).

## Status (2026-10-05, session 1 end)

- **Batch 1 reviewed by the owner ("overall looks good") and REVISED** for the feedback + a parity
  pass against the live code:
  - datasets catalog: heading removed (count line only); sidebar reordered to the live order (all →
    hidden buckets → uncategorized → categories); "Uncategorized" (show-all) bucket, sort and
    show-all states added.
  - datasets source: overview "state reference" row added — undecided versions, the
    mark-authoritative form (per-key rows, note, error), file_upload source (File card + single
    download link), empty versions / no columns, categories editor, description editing,
    sandboxed source.
  - page edit: rebuilt to the REAL section chrome (the invented grip/pencil toolbar is gone):
    hover outline + menu trigger, "+ add section" at each section's top edge + one at the end,
    being-edited state with the menu open (action row copy link / copy / paste | save / cancel,
    then the live top-level order), hidden-from-view pill, #anchor highlight, grid overlay toggle,
    delete modal, not-editing menu reference. No top breadcrumb row; "editing" chip dropped.
    Settings pane now has the full filter editor and "Save as template". User menu (sync ring +
    edit/view toggle) moved to the sidebar bottom.
  - New icon `Refresh` registered in `theme/icons.js` (catalog tile on design-system/theme.html
    still to add).
- Next: Batch 2 (see "Mockup set" — every remaining page), then owner review, then CONFIRM before
  any library edit.

## Process rules (owner, 2026-10-05)

1. **Confirm before implementing.** Mockup approval is not a go-ahead for library edits. Ask, per
   page, before touching any `.theme.js` / component file.
2. **Mockups stay the spec.** After the mockup session, every edit made to a real page (theme or
   component) is mirrored into the matching mockup in the same session.
3. **No lost features.** Every mockup is checked against the live component's full feature list
   (all states, admin-only affordances, empty/error states). Anything not shown in the main view
   goes in a "state reference" row on the same page.
4. **Questions name the pattern and page** they're about.

## Objective

1. **Mockups first.** Design tessera_v6 "Graph Paper" versions of every user-facing surface of the
   datasets and page patterns as static pages in `design_system_v6/pages/`, the same way the
   `admin-*.html` set was built (real data where cheaply available, every live feature represented,
   designed empty/loading/error states).
2. **After owner approval, update the default theme** — the library's own per-component
   `.theme.js` files (the Phase A approach: edit the *content* of the defaults, no loader/indirection),
   so a site with no theme (or a theme that leaves keys unset) gets the v6 look.
3. **Keep every other project's theme intact.** Any re-key or structural change (a key renamed or
   split, a hardcoded block moved onto a theme key, a new `styles[]` variant) must be mirrored in the
   project themes that override those keys, so nothing silently falls through to the new default.
   Projects to audit: mny / mny_admin, transportny (v1) + transportny2, wcdb, avail, landbank, tessera
   (v6's own `pages`/`datasets` exports in `src/themes/tessera/tessera-theme-v6.js`).

**Rules carried over from the admin port** (all explicit owner direction):
- 100% feature parity — every pass checks function, not just visuals. Nothing a mockup omits gets
  removed from the live component; it's kept and restyled.
- Default-theme scope, not per-project reskins.
- Theme-driven, not hardcoded: every styled element reads `getComponentTheme(theme, '<key>')`; no
  `theme.x || 'inline tailwind'` fallbacks left behind (author empowerment — see root `CLAUDE.md`).
- BC by default. Anything that changes behavior goes in "Decisions to confirm" and waits for a yes.

## Design sources

- v6 design system: `src/themes/tessera/design_system_v6/` (`_shared.css` tokens, `theme/icons.js`
  registry, `design-system/patterns.html` already has two relevant sketches: §"datasets.datasetsList —
  the library page" and §"What authors see in edit mode" — selected section + floating toolbar, page
  tree).
- Existing page-pattern *view* renders: `pages/docs.html`, `features.html`, `beta-landing.html`
  (these already show what a published page looks like under v6 — the page-view mockups extend them
  rather than redo them).
- Structural reference for datasets: TransportNY's converged mockups
  (`src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/datasets-{catalog,source,settings}.html`)
  — the datasets *structure* (catalog rail + grid/list switcher, source shell, overview cards,
  version download menu, authority control) already landed in the pattern via
  [`datasets-design-updates.md`](./datasets-design-updates.md). The v6 mockups re-skin that structure;
  they don't re-architect it. Its Phase 8 (create/upload flow) is **blocked on a mockup** — the v6
  create-flow mockup below is meant to unblock it.

## Inventory

> **2026-10-09: stash `design` merged onto upstream** (QA pattern, dama lineage/cascade delete, editable user menu).
> Upstream's lineage and delete-version keys (`linCard`/`lin*`/`verDelete*`/`verInputsChangedChip` in `sourceOverview.theme.js`)
> are still pre-v6 gray, so they need a v6 pass plus mockup sync. `DeleteSourceModal` now takes `refusal` (with a has_outputs cascade button).
> `deleteModalSoftBtn` was dropped (upstream removed soft delete). Type classes keep `@layer components` plus upstream's `--t-font-*` vars.

### Datasets pattern (`patterns/datasets/`)

Routes (`siteConfig.jsx`): `""` catalog, `create`, `settings`, `tasks`, `task/:task_id`,
`source/:id/:page?/:view_id?`, `internal_source/:id/:page?/:view_id?`.

| Surface | File(s) | Theme key(s) today |
|---|---|---|
| Catalog (rail + grid/stack/table switcher) | `pages/DatasetsList/{index,categories}.jsx` | `datasets.datasetsList`, `datasets.categories` |
| Source shell (breadcrumb, header, version select, tab bar) | `pages/SourcePage.jsx`, `components/Breadcrumbs.jsx` | `datasets.sourcePage`, `datasets.breadcrumbs` |
| Source overview (desc, columns, glance, categories, versions + download menu + authority) | `dataTypes/default/overview.jsx` | `datasets.sourceOverview` |
| Source table tab | spreadsheet section | `sourceTable` |
| Source map tab (gis) | `dataTypes/gis_dataset/pages/Map` | `datasets.gisMap`, `gisPages` |
| Metadata / column editor | `components/MetadataComp` | `datasets.metadataComp` |
| Source admin (access, editable toggle, tasks, delete modal) | `dataTypes/default/admin.jsx`, `components/SourceAccessEditor.jsx` | `datasets.admin` |
| Version page | `dataTypes/default/version.jsx` | **unthemed** |
| Version controls / downloads | `components/ExternalVersionControls.jsx` | `datasets.externalVersionControls` |
| Validate | `components/ValidateComp.jsx` | `datasets.validateComp` |
| Create (+ per-type create: file_upload, gis) | `pages/CreatePage.jsx`, `dataTypes/file_upload/CreatePage`, `dataTypes/gis_dataset/pages/Create` | `datasets.createPage`, `fileUploadCreate`, `gisCreate`, `upload` |
| Uploads (gis) | `dataTypes/gis_dataset/pages/Uploads` | `uploads` |
| Settings (categories, filtered buckets) | `pages/SettingsPage.jsx` | `datasets.settingsPage` |
| Tasks list + task page | `pages/Tasks/*` | `UdaTaskList` **unthemed**; `datasets.udaTaskPage` |
| Schedule pages, internal admin | `dataTypes/schedule/*`, `dataTypes/internal/admin.jsx` | **unthemed** |
| Error | `dataTypes/default/error.jsx` | — |

Default theme registry: `patterns/datasets/defaultTheme.js` (19 imports). tessera v6's own
`datasetsTheme` only covers `datasetsList` (old key shape — `datasetCard`/`categoryItem`, which the
live component no longer reads) and `metadataComp` — effectively stale; to be replaced by the port.

### Page pattern (`patterns/page/`)

| Surface | File(s) | Theme key(s) today |
|---|---|---|
| Published page (view) | `pages/view.jsx` + Layout / SideNav / TopNav (Phase A primitives) | `pages.section*`, `layout`, `sidenav`, `topnav` |
| Section chrome (header, kicker, actions, hidden/edit states) | `components/sections/section.jsx` | `pages.section` |
| Section array (grid, add-section, edit hover/highlight, grid overlay) | `components/sections/sectionArray.jsx` | `pages.sectionArray` |
| Section groups (in-page sidenav, modal groups) | `components/sections/sectionGroup.jsx` | `pages.sectionGroup` |
| Section menu (the per-section dropdown, 1.5k lines) | `components/sections/sectionMenu.jsx` | mostly via UI primitives |
| **Edit pane** (floating icon bar + publish) | `pages/edit/editPane/index.jsx` | **hardcoded** (`bg-neutral-900`, `slate-*`, `blue-500`) — needs a theme key |
| Edit drawer panes: settings, data sources, section groups, pages, history, permissions | `pages/edit/editPane/*.jsx` | `pages.sectionGroupsPane`; others mostly hardcoded/primitive |
| Busy indicator | `EditPane`'s `LoadingDisplay` | hardcoded (already uses `--t-*` vars) |
| User menu + sync status | `components/userMenu.jsx` | `pages.userMenu` |
| Search button + palette + search page | `components/search/*` | `pages.searchButton`, `pages.searchPallet` |
| Page template picker (new page) | `components/PageTemplatePicker.jsx` | `pages.pageTemplatePicker` |
| Template manager (save/apply section templates) | `components/sections/TemplateManager.jsx` | `pages.templateManager` |
| Complex filters | `components/sections/ComplexFilters.jsx` | `pages.complexFilters` |
| Link page notice | `components/LinkPageNotice.jsx` | `pages.linkPageNotice` |
| Time picker, dama map | `…/TimePicker`, `…/map` | `pages.timePicker`, `pages.damaMap` |
| Error page | `pages/error.jsx` | — |

Default theme registry: `patterns/page/defaultTheme.js` (12 imports). tessera v6's `pagesTheme`
already covers `userMenu`, `complexFilters`, `searchButton`, `searchPallet`, `sectionGroupsPane`,
`sectionArray` (+ landing-only components) — check each against the live key shapes before reusing.

## Mockup set (`design_system_v6/pages/`)

Naming: `datasets-*.html`, `page-*.html` (flat, one level under `pages/` — ds-nav's href logic).
Each mockup: header comment naming the real component + theme key it designs, a one-line **story**,
designed empty/loading/error states where the surface has them. New ds-nav sections `Datasets pages`
and `Page pattern`; footer blocks per the admin-set precedent.

**Batch 1 — direction check (owner sign-off before the rest):**
- [x] `datasets-catalog.html` — catalog: rail (subject areas + hidden lifecycle buckets for admins),
  grid / list / table switcher, search, new-source. Story: *a visitor finds the dataset they need
  in one scan.*
- [x] `datasets-source.html` — source shell + Overview tab: breadcrumb, header + version select,
  tab bar, description, columns, at-a-glance, categories, versions with download menu + authority.
  Story: *an analyst decides whether this source is the right one and grabs it.*
- [x] `page-edit.html` — a page in edit mode: section edit hover/selected states, section menu open,
  add-section affordance, the floating edit pane (re-themed), edit drawer open on one pane, publish
  state. Story: *an author changes one section and publishes without hunting for controls.*

**Batch 2 — every remaining page** (from the route tables + dataType page registries):

Datasets pattern
- [x] `datasets-source-map.html` — gis Map tab (`gis_dataset/pages/Map`, legend, symbology controls)
- [x] `datasets-source-admin.html` — Admin tab (`default/admin.jsx`: SourceAccessEditor, editable
  toggle, UDA tasks list, delete modal soft/hard) — Schedule / Runs moved to its own
  `datasets-schedule.html` (different source type: a DAMA loader)
- [x] `datasets-metadata.html` — column editor (`MetadataComp`, reached from "edit columns")
- [x] `datasets-version.html` — version page (`default/version.jsx`, ExternalVersionControls)
- [x] `datasets-create.html` — CreatePage type chooser + csv/gis upload flow (uploadFile →
  selectLayer → schemaEditor → publish), file_upload create, internal + internal_table create
  (unblocks datasets-design-updates Phase 8)
- [x] `datasets-internal.html` — internal sources: Upload, Validate (`ValidateComp`), Debug tabs
- [x] `datasets-uploads.html` — gis Uploads list + upload view
- [x] `datasets-settings.html` — SettingsPage (categories, filtered/hidden buckets, promotion rules)
- [x] `datasets-tasks.html` — UdaTasks list + UdaTaskPage
- [x] `datasets-error.html` — dataType error page + not-found / no-access

Page pattern
- [x] `page-view.html` — published page as a reader sees it: section groups (in-page sidenav,
  modal groups), content sidebar, external filters, user menu (view mode)
- [x] `page-edit-panes.html` — the other five drawer panes: Data sources, Section groups, Pages,
  History, Permissions (the user-menu dropdown + its states live on page-edit.html)
- [x] `page-section-menu.html` — section-menu sub-pages: Type picker, component settings, Templates
  (TemplateManager), Dataset (source/version, Join, Comparison series, Pivot), Columns
  (ColumnManager, calculated/formula/static columns), Filters (ComplexFilters; **time picker
  not mocked** — `pages.timePicker`, follow-up),
  Display, Layout (style, width, height, rowspan, float, offset, padding, border, radius,
  background, shadow), Permissions; plus the new-section state
- [x] `page-new.html` — PageTemplatePicker modal + LinkPageNotice
- [x] `page-search.html` — search palette + search results page
- [x] `page-error.html` — page error / not found / no access

## Implementation (started 2026-10-06 — one page at a time, owner confirms each)

**Mechanism (owner, 2026-10-06):** only the library DEFAULT gets the v6 look. Pre-v6 default values
are frozen in `src/themes/_legacy/datasets.js` (`legacyDatasets` + `withLegacyDatasets(own)`); every
registered project theme (all 18, tessera_v6 included) wraps its `datasets` object in
`withLegacyDatasets(...)`, so keys it doesn't set keep the old values. When the next datasets
component is ported, copy its pre-port default into `legacyDatasets` verbatim (plus "behave as
before" values for new keys) — no further theme edits needed. Re-keys / structural changes still get
patched per theme. TransportNY's vendored-copy sync must copy `_legacy/datasets.js`. DB-authored
themes (theme editor) are NOT insulated — they inherit the v6 defaults for keys they don't set.
Page pattern: same mechanism, `src/themes/_legacy/pages.js` (`legacyPages` + `withLegacyPages`, built 2026-10-08 with page 13 — see there).

Local check setup (reuse): scratch dms-server copy with only `cli-test.config.json`
(`<scratchpad>/srv/dms-server`, PORT 3457) + seed (`srv/seed.mjs`: app `v6test`, site `main`, dmsEnv
`riverbend` with 12 sources, datasets patterns `/data` (no theme), `/data-mny` (mnyv1), `/data-tny`
(transportnyv2)) + Vite `VITE_API_HOST=http://localhost:3457 VITE_DMS_APP=v6test VITE_DMS_TYPE=main
VITE_DMS_PG_ENVS="," npx vite --port 5199` (the "," disables the `.env` hazmit_dama external env,
which isn't on the local server and fails the whole listing) + `srv/shot.mjs` (token, light/dark via
`dms-color-scheme`).

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

## Decisions

Answered 2026-10-05:
1. Catalog heading — **no** (count line only). [datasets · catalog]
2. v6 `categorySwatches` — **yes, default theme only**. [datasets · catalog/source]
3. Edit bar onto a new `pages.editPane` theme key — **yes**. [page · edit]
4. Breadcrumbs — **none for the page pattern**; datasets keeps its breadcrumb bar as the top row.
5. "Editing · draft" chip — **dropped**. [page · edit]
6. Section-menu value column + grouping — **yes**. [page · edit]
7. Hidden sections in edit — resolved from code: live shows them normally with an orange "Hidden from
   View" pill; mockup restyles the pill only (no dimming). [page · edit]

Answered 2026-10-06 (panes):
22. **UI.Permissions v3 layout for EVERY use** (page pane, section menu, admin pattern Access,
    datasets source Admin) — shared component change; the "who can do what" summary stays
    page-pane only. Mockups updated (admin-pattern-access.html patched by hand; the rest generated
    from ds_common.perm_widget).
- [page · edit · Settings pane] **v3 redesign — APPROVED 2026-10-06**: identity header (icon tile →
  icon picker, draft status + parent path, inline title rename with URL preview + rename/revert,
  borderless description), then collapsible sections that show their values when closed —
  Layout (content sidebar + site nav as page thumbnails, side nav style, cover page), Navigation
  ("Show in nav" = !hide_in_nav, label flipped), Link page (explicit switch over nav_link + field),
  Site theme (pageOptions.settingsPane), Save as template. States on page-edit-panes.html.
  Same fields and data as live; only presentation changes.

- [page · edit panes] **v3 of the other panes — APPROVED 2026-10-06** (generator: scripts/panes.py +
  page_common.filters_body), same language as Settings v3:
  - Filters: one-line rows (key · source chip url / fixed / → derived-from · current value) that
    expand to edit; "+ add filter" opens an inline form.
  - Section groups: top / content / bottom drawn as page bands; group row = name, flags (rail,
    modal), theme chip, section count; sections listed with their type icon (+ hidden marker).
  - Pages: PROPOSED find box + status marks (unpublished · hidden from nav · link page — all
    existing fields); add-page button beside find; menu with icons.
  - History: real comment composer; entries grouped today / this week / earlier; publishes and
    comments as milestones; PROPOSED all / comments / publishes filter.
  - Permissions: summary ("Anyone can view · 2 groups, 1 person can edit"), readable labels from
    page.format permissionDomain (View, Edit content, Publish, Everything…), name line + pills line,
    inherited grants collapsed with disable / undo; note matches the live keep-yourself-on guard.

Answered 2026-10-06 (follow-up):
20. [process] generators moved into `design_system_v6/scripts/` (owner: "sure, move the scripts").
21. [page · edit panes · Filters] derived filters: "derived from" = another (non-derived) filter on
    the same page; only derivation today is "year of YYYYMM"; derived rows stay out of the URL and
    their own value is the fallback. Mockup now shows month (URL) → year (derived).

Answered 2026-10-06 (Batch 2 review):
11. [datasets · uploads] **hook up** the gis Uploads page (register it so GIS publish lands there).
12. [page · search] SearchPage: **keep it, don't route it** (live finding 4 is fine as is).
13. [datasets · create] card picker for Type — **OK**.
14. [all] PROPOSED empty / not-found / no-access states — **adopt**.
15. Live findings 1–3, 5 (dead links, unthemed surfaces) — **fix after the design implementation**.
16. [page · edit panes] **Data sources pane removed** (unused) — implementation deletes it from
    editPane/index.jsx (+ dataSourcesPane.jsx if nothing else imports it).
17. [page · edit panes] **Settings pane redesigned** (grouped rows: page / navigation / layout /
    theme slot / save-as-template collapsed) and **page filters moved to a new Filters pane**
    (same item.filters + edit-page-params). Mockups: page-edit.html (Settings), page-edit-panes.html (Filters).
18. [datasets · metadata] expanded column: no blue — reuse the section menu's ColumnManager
    treatment (outlined row, neutral well body).
19. [page · section menu] Layout sub-pages now mirror the LIVE controls: padding step grid (All +
    per side), border edge picker + width + color swatches, radius corner dots, background swatch
    pills (my earlier 4-input editors were invented). Note: live width/color apply to all lit edges.

Answered 2026-10-06:
8. [datasets · source] `type · rows · versions` subtitle — **keep, implemented correctly**: type =
   resolved `sourceDataType` (never a DMS row's raw `source.type`); rows = `row_count` of the version
   in effect (URL view_id → authoritative → latest), version named, segment dropped when absent;
   versions = `views.length` with singular/empty forms; not rendered until `sourceLoaded`.
9. [page · edit] user menu stays where the live default puts it, sync stays in its dropdown, theme
   toggle stays. [datasets · all] user menu on every page.
10. [datasets · catalog] hidden buckets at the very end of the rail (behavior change from live).

## Files

- New: `src/themes/tessera/design_system_v6/pages/{datasets,page}-*.html`, `ds-nav.js`, `README.md`
- Library: `patterns/datasets/**/*.theme.js`, `patterns/datasets/defaultTheme.js`,
  `patterns/page/**/*.theme.js(x)`, `patterns/page/defaultTheme.js`, `pages/edit/editPane/index.jsx`
- Legacy freezes: `src/themes/_legacy/datasets.js`, `src/themes/_legacy/pages.js` (wired into all 18 project themes)
- Project themes, as the re-key audit finds them: `src/themes/{mny,transportny,wcdb,avail,landbank,tessera}/**`
