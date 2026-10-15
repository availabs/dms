# Datasets + Page patterns v6 port — mockups first, then the default theme

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** doing · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

**Project:** DMS library (`src/dms` submodule) + mockups in `src/themes/tessera/design_system_v6/pages/`

The sibling of [`admin-pattern-v6-port.md`](./admin-pattern-v6-port.md). The admin surfaces (sites,
themes, pattern editor, users, groups, profile, login) are done; this file covers the two remaining
pattern families — **datasets** and **page** — and takes over the page/datasets half of
[`tessera-component-theme-port.md`](./tessera-component-theme-port.md)'s unstarted **Phase B**
(that file's `patterns/auth` bullet is already covered by the admin port).

## Current status (2026-10-13) — read first

**All 19 pages are implemented and approved** (12 datasets, 7 page; page 19 "link page notice" got
its spacing fix, then the owner said "looks good"). Committed on local `design-wip` in both repos
(unpushed). The per-page records moved out of this file:
- [datasets-v6-port-pages.md](./datasets-v6-port-pages.md): pages 1–12 (catalog → errors)
- [page-v6-port-pages.md](./page-v6-port-pages.md): pages 13–19 (view → link page notice)

The follow-on work is the shared control looks (buttons, pills, switches, tabs, fields), tracked in
[ui-control-consistency-audit.md](../completed/ui-control-consistency-audit.md) and its sub-tasks; start there
when resuming design work. That effort closed 2026-10-15; its follow-on is
[ui-raw-html-to-ui-components.md](./ui-raw-html-to-ui-components.md).

Still open from this port:
- Live findings 2, 3 and 5 (below, "Earlier status notes"): dead "Delete View" link, gis Uploads
  page, unthemed surfaces. Decision 15: fix after the design implementation.
- FLAGGED: mobile TopNav for the default Layout (logo + user menu below lg), see page 1.
- The schedule / runs pages were never walked live (no loader source in the test data). 2026-10-15: the Runs
  page is now themed to the `datasets-schedule.html` mockup (default theme; project themes frozen in
  `_legacy/datasets.js` `runsPage`), checked with a stubbed-data preview harness, not on a real loader source.
- Project-theme re-key audit beyond MNY / TNY / landbank (wcdb, avail, tessera) not done.
- Move this file (and the two page records) to `completed/` once the owner closes it.

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

## Earlier status notes (kept for history)

### Status (2026-10-06, session 2 end)

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

### Status (2026-10-05, session 1 end)

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
