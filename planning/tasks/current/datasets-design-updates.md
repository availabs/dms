# Datasets pattern — implement design updates (DataManager redesign)

## Objective
Port the converged TransportNY mockup of the **datasets pattern (DataManager)** into the live
`patterns/datasets` code. Two intertwined dimensions:

1. **Functional / structural changes to the pattern itself** (land in `patterns/datasets/**` so
   *every* theme benefits) — new layouts, nav behavior, per-view download, the Admin Tasks panel,
   catalog view-switcher, editable-table persistence, etc.
2. **Theming** — express the full visual design in the **transportny2** theme (`datasets.*` keys),
   and give the **default theme** a sensible baseline so the pattern looks coherent out of the box.
   Move every datasets surface onto `getComponentTheme` (no inline Tailwind / `theme.x || 'fallback'`).

**Design source of truth (mockups):**
- `src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/datasets-catalog.html`
- `.../pages/datasets-source.html`
- `.../design-system/patterns.html` §08 (Dataset catalog) / §09 (Source page)

**Guiding principle:** BC by default (see [[feedback_primitive_change_tasks_bc]]). Each phase ships
the functional change additively where possible; the visual redesign rides on theme keys.
Non-BC items are collected in "Decisions to confirm" and must be approved before implementing.

## Current-state reference (theming audit, this session)
Most datasets pages **hand-roll** `const t = {...local, ...(theme?.datasets?.x || {})}` instead of
`getComponentTheme`; `overview.jsx` / `SourcePage.jsx` / `CreatePage.jsx` lean on
`theme.x || 'inline tailwind'` fallbacks; `schedule/*`, `internal/admin.jsx`, `version.jsx`,
`UdaTaskList.jsx` are effectively unthemed. The redesign is also the moment to normalize theming.

## Decisions to confirm (non-BC / behavior changes) — ASK before building
1. **Metadata becomes admin-only.** Remove "Metadata" from the public source tab bar; reach the
   column editor from the Admin tab ("Edit columns"). Changes `SourcePage` nav + dataType page
   registries (`cdn`). *Behavior change.*
2. **Per-view download = direct-format dropdown.** Replace the "Create Download" modal
   (`ExternalVersionControls`) with a per-version `Download ▾` menu that downloads a chosen
   `OUTPUT_FILE_TYPES` format directly. Changes the download UX (and possibly the server export
   contract). *Behavior change — confirm whether the create-download/columns flow is retired or kept behind an advanced affordance.*
3. **Map tab simplification.** Mockup shows a full-width map + legend overlay and **drops** the
   side Symbology + Basemap panels. Confirm we relocate (not delete) symbology, since gis Map
   currently exposes color-by/classification/opacity. *Potential feature loss.*
4. **Falcor API panel → admin-only** on the source Overview. *Visibility change (minor).*
5. **Catalog "hidden" category buckets** (Sandbox/Data Processing/Inactive) shown to admins in the
   rail — depends on `filtered_categories` (SettingsPage). Confirm read path.

## Phases

### Phase 0 — Foundations (shared, unblocks the rest)  — IN PROGRESS
- **Breadcrumbs** ✅ DONE — redesigned `components/Breadcrumbs.jsx` to the converged bar:
  visible "Data Sources" root (icon + label), `/` separators, `current`-vs-`link` distinction,
  and moved onto `getComponentTheme(theme, 'datasets.breadcrumbs')` (the convention exemplar).
  Default baseline in `Breadcrumbs.theme.js` (neutral slate); brand treatment in
  `themev2.js` `datasets.breadcrumbs` (bar + mono-uppercase + `#37576B` root, nudged `-top-[2px]`).
  BC: same `items` API; SourcePage already passes the right items. (Full-bleed *placement*
  finalizes in Phase 2 — currently still inside SourcePage's pageWrapper.)
- **Theming infra / convention** — establish `{...localTheme, ...getComponentTheme(theme,
  'datasets.<key>')}` as the standard read (Breadcrumbs + SettingsPage are the references);
  per-page normalization happens in each page's phase. Audit/register missing `datasets.*` keys
  in `defaultTheme.js`.  *(remaining)*
- **Shared column types / affordances the design needs everywhere:** source-type badge (GIS/CSV/
  Internal icon+label), area **category pill** (color-coded by top-level area), status pill
  (`status_pill` exists), "admin-gated affordance" (ink `admin` pill via `isUserAuthed`).
  Decide theme tokens vs `columnTypes`.  *(remaining — likely fold into Phase 1 where the cards consume them)*
- Files: `patterns/datasets/defaultTheme.js`, `components/Breadcrumbs.*` ✅, `src/themes/transportny/themev2.js` (`datasets.*`).

### Phase 1 — Catalog (DatasetsList)  — DONE (pending live verify)
Design: `datasets-catalog.html`. Files: `pages/DatasetsList/index.jsx` + `datasetsList.theme.js`,
`src/themes/transportny/themev2.js` (`datasets.datasetsList`).
**Shipped:** rewrote `index.jsx` preserving ALL data logic (getSources, category filtering,
counts, breadcrumb, `filtered_categories`, search, sort) and rebuilt the render —
compact header (count + toolbar), rail with **color-coded dots** (generic hash→`categorySwatches`
palette, since real categories are arbitrary) + an **"All datasets"** item, redesigned source
cards (type badge from `type`/`isDms` → GIS/CSV/Internal/External, colored **category pill**,
name, description, "view →"), and the **grid / full-width-cards / table** view switcher
(inline SVG icons; choice persisted to `localStorage`). Themed in the default (`datasetsList.theme.js`,
neutral) + transportny2 (brand, solid `bg-[var(--cat)]` category pills); on `getComponentTheme`.
**Deliberate deviations from the mockup** (data reality): cards show only `name/type/category/
description` — NOT rows/views/updated/geom (those are per-view; avoided N fetches for 50+ sources).
Color-coding is a stable hash, not the hardcoded FA/TSMO map. `categories.jsx` left untouched (unused).
**Deferred:** explicit "Hidden (admin)" rail section (kept the existing Show-all/filtered toggle);
per-card admin edit pencil (card links to the source); full-bleed header alignment → Phase 9.
- Compact header (eyebrow + title + count + admin "New source" CTA); prominent search; sort.
- **Category rail:** area list with counts + **color-coded dots**, type filter, admin-gated
  "hidden" buckets (filtered_categories).
- **Source cards:** type icon, color-coded category pill, status, geom·rows·views·**last-updated**,
  hover edit affordance (admin). Map card to a configured `dataCard` where possible.
- **View switcher (functional):** grid (2-up) / full-width cards (1-up) / table-list — three render
  modes + a segmented control; persist the choice (display state or local). 
- Theming: transportny2 + default.

### Phase 2 — Source page shell (SourcePage.jsx)  — DONE (pending live verify)
Design: `datasets-source.html` chrome. File: `pages/SourcePage.jsx` + `sourcePage.theme.js`,
`src/themes/transportny/themev2.js` (`datasets.sourcePage`), `dataTypes/default/overview.jsx`.
**Shipped:**
- Rewrote `SourcePage.jsx` preserving ALL data logic verbatim (getSourceData, `sourceFormat` from
  registerFormats, `sourceType`/`sourceDataType` → `damaDataTypes` page merge, `allNavItems`,
  view-dependent auto-nav to latest view, breadcrumbItems) — verified against the pre-edit file
  recovered from the session transcript. Stripped the `console.log`s.
- **Moved onto `getComponentTheme`**: `const t = {...sourcePageTheme, ...getComponentTheme(fullTheme,
  'datasets.sourcePage')}` (was the hand-rolled `fullTheme?.datasets?.sourcePage || {}`). `SourceNav`
  now takes `t` and reads `t.tab*`/`t.tabNav` with **no `theme.x || 'inline'` fallbacks**.
- **New shell chrome**: full-bleed breadcrumb bar (Phase 0 `datasets.breadcrumbs`, already full-bleed)
  → **header band** (`t.header`) with a one-row `headerInner` (title `h1` + `headerRight` version
  selector) → **tab bar** (`tabBarWrap`/`tabNav`) with the **amber active underline**
  (`tabActive: border-[#FACC15]`). Version `<select>` moved out of the old tab row into the header
  (only on view-dependent pages, existing `showVersionSelector` logic preserved).
- **Title now lives in the shell** (shows on *every* tab) — removed the duplicate `{source?.name}`
  title div from `overview.jsx` (it only showed on Overview before).
- Theming both sides: default neutral keys in `sourcePage.theme.js` (full rewrite: pageWrapper,
  header, headerInner, title, headerRight, versionLabel, versionSelect, tabBarWrap, tabNav, tab,
  tabActive, tabInactive, loading); brand `datasets.sourcePage` added to transportny2 (max-w-[1480px]
  pl-12 band, `font-display uppercase` title, `#37576B` ring version select, amber tab underline).
- `sourcePage` was already registered in `defaultTheme.js` (line 33) → new keys flow automatically.
**Deferred (not Phase-2 shell concerns):**
- **Status/`new` pills** next to the title — omitted (user asked to drop the `source · type ·
  production · new` row and make the header *less* tall; no reliable status field on the source). Can
  reintroduce as theme-gated pills if a status field is wired later.
- **Admin "Add version" button** in the header → Phase 7 (needs `create-view` wiring; lives with
  version management).
- **Metadata-as-admin-only** (Decision #1) — left the nav as-is for now; Metadata is *already*
  hidden from the public tab via its dataType `cdn: () => false`, so Decision #1 is largely moot.
  Revisit when building the Admin tab (Phase 7) "Edit columns" entry.

### Phase 3 — Overview tab (default/overview.jsx)  — DONE (pending live verify)
Design: `datasets-source.html` Overview. Files: `pages/dataTypes/default/overview.jsx` +
`sourceOverview.theme.js`, `src/themes/transportny/themev2.js` (`datasets.sourceOverview`).
**Shipped — full rewrite into the mockup's 12-col card layout, all data logic preserved:**
- **Content band → 12-col grid** (`pageWrapper`/`grid`); main col-8, side col-4.
- **MAIN**: **Description card** (Lexical view/edit via `ColumnTypes.lexical`, admin corner pencil,
  `updateSourceData` unchanged) + **Columns card** (themed `<table>` of name/type/description/Req
  from `config.attributes`|`metadata.columns`; header "Columns · N" with admin "Edit columns" +
  public "Full metadata →" → `/metadata`; `+ N more` show-all toggle, replaces the old `UI.Table`).
- **SIDE**: **At a glance** `<dl>` (Type, Columns, Versions, **Update interval** [inline-editable,
  admin], Created, Updated — only real source fields; mockup's Geometry/Rows/Vintage/CRS/License
  fabrications dropped per data reality), **Categories card** (keeps `SourceCategories` view/editor +
  corner pencil + helper caption), **Versions card** (per-version list: name→version page, **current**
  badge on latest, `rows · published` meta, **per-view `Download ▾` menu** of available
  `OUTPUT_FILE_TYPES` from `view.metadata.download`).
- **Moved fully onto `getComponentTheme`** — `{...sourceOverviewTheme, ...getComponentTheme(theme,
  'datasets.sourceOverview')}`; replaced **all** `theme.x || 'inline'` fallbacks. `RenderPencil` now a
  themed corner button. `sourceOverview.theme.js` fully rewritten (neutral); brand
  `datasets.sourceOverview` added to transportny2 (full card chrome). `sourceOverview` already
  registered in `defaultTheme.js`.
- **The shared `eyebrow` key** styles all three side-card labels uniformly (skipped the mockup's
  amber `// description` flourish — needs a markup `//` prefix; trivial to add later if wanted).
**Decisions touched (kept BC — no behavior change to confirm yet):**
- **Decision #2 (per-view download)**: implemented as a `Download ▾` menu over the **existing**
  `view.metadata.download` links (same hrefs, restyled) — did **not** retire the "Create Download"
  modal / `ExternalVersionControls` creation flow. Still need to confirm whether create-download is
  retired or kept behind an advanced affordance before touching `ExternalVersionControls`.
**Deferred:**
- **Falcor API card (Decision #4, admin-only)** — omitted. Need the exact falcor path shape + confirm
  the `view-source-api` perm before rendering (don't want to display a wrong/misleading path). Side
  column is one card shorter than the mockup until then.

**Refinements (review round 1):**
- **Alignment + full-bleed gray (Phase 2 amendment)**: `LayoutGroup` in `SourcePage` was
  double-wrapping the content — in transportny2 its style-0 `wrapper2` is already
  `max-w-[1480px] pl-12`, so the overview's own `max-w/pl-12` stacked → cards sat one gutter right of
  the nav; in the default theme style-0 is a white-card wrapper entirely (inconsistent). **Removed
  `LayoutGroup`**; `SourcePage` now owns a full-bleed `body` band (`w-full bg-… flex-1`) that fills to
  the page bottom (`pageWrapper` is `flex flex-col flex-1`; layout `childWrapper` is `flex-1 h-full`
  under `min-h-svh`). Overview dropped its own band and renders the `grid` as the aligned inner
  container (`max-w-[1480px] pl-12` brand / `w-full px-6` default) → cards left-align with
  breadcrumb/header/tabs, and the gray reaches the bottom regardless of content height.
- **Category editing surfaced**: the corner pencil now renders a real `UI.Icon` (`PencilSquare`)
  instead of the FontAwesome `<i>` (which was invisible without FA-Pro), so the admin edit affordance
  is discoverable; it toggles the existing `SourceCategories` add/remove editor (same
  `updateSourceData({attrKey:'categories'})` save path).
- **Category styling**: view mode now renders **colored area pills** (solid `bg-[var(--cat)]` brand /
  gray-pill + colored dot default) matching the catalog, via shared
  `utils/categoryColors.js` (`catColor`/`splitCategories`/`FALLBACK_SWATCHES` **extracted** from
  `DatasetsList` so catalog + overview hash to the same swatch). Secondary cats render as light chips.
- **Default breadcrumb**: nudged `homeIcon` `relative -top-[1px]` to vertically center the Database
  icon with the crumb text (mirrors the brand fix).
- **Round 2 polish:** category **editor** (SourceCategories edit mode) restyled — modern chips
  (parent vs sub), clean adder input, hidden carets, styled remove/plus/stop buttons — in both the
  default `categories.theme.js` and a new brand `datasets.categories` (themev2). Edit **pencils** got
  `cursor-pointer` (`editBtn`/`glanceEditBtn`, both themes — native `<button>` defaults to
  `cursor:default`). Description **lexical** editor now passes `hideControls={true}` (toolbar hidden
  by default).

> **Autonomous pass (2026-06-28):** owner away, asked to take Phases 4→9 as far as safe without
> feedback. Strategy: **theme-first + BC** (the core design work), preserve all existing
> functionality, lint each, and **defer functional changes that touch shared/complex code** (the
> dataWrapper persistence fix has site-wide Card reach — see [[feedback_card_edits_bc]]) since
> nothing can be browser-verified here. Phase 8 stays blocked-on-mockup (a prior decision).

**Owner-feedback refinements (2026-06-29):** added a **header-actions slot** to `SourcePage`
(`setHeaderActions([{label,onClick}])` on the context; rendered in `headerRight` next to the version
selector, themed `headerActionBtn`). **Table:** container now `overflow-auto min-w-0 max-w-full` +
fixed height so a wide table **scrolls within itself** (no page h-scroll; `body` got `min-w-0`);
spreadsheet **download off** (`allowDownload:false`); "Set Default Columns" **moved to the header**
via the slot (removed from the table body). **Map:** now **full page height**
(`mapHeightWrapper: h-[calc(100svh-150px)]`); the sources/layers `mapAttrs` panel is now an
**edit-gated `Settings` widget** in the header (`update-source`) that opens a **modal** (was an inline
`view-source-api` panel).

### Phase 4 — Table tab (spreadsheet)  — DONE (container theming; functional fixes deferred)
Design: `datasets-source.html` Table. File: `pages/dataTypes/gis_dataset/pages/table.jsx` + `gisPages.theme.js`.
**Shipped:** full-bleed, fill-height **table container** (`tableWrap` — `min-h-[calc(100svh-180px)]`,
the source-page body is `flex-1` so it fills the viewport; the DataWrapper inside scrolls); themed the
"Set Default Columns" admin button; default `gisPages.theme.js` + brand `datasets.gisPages`.
**Deferred (need a browser + carry shared-code risk):** the **column-type control** fold-in (the Table
clones the spreadsheet config and clears `controls`; the column-type control already exists in
`spreadsheet/config.jsx`) and the **editable-persistence fix** (the `allowEditInView` + smart/seeded
`state.data` dedup bug lives in the shared page-pattern dataWrapper → site-wide Card reach; diagnosis
retained, wants a regression test). The spreadsheet's *internal* look (dark header etc.) is the shared
spreadsheet theme, not re-themed per-tab.

### Phase 5 — Map tab (gis_dataset Map)  — DONE (container theming; symbology kept)
Design: `datasets-source.html` Map. Files: `Map/gisMap.theme.js` (+ `Map.jsx` from the permissions
pass). **Shipped:** full-width, **fill-height rounded/bordered map container** (`mapHeightWrapper` →
`h-[calc(100svh-220px)] min-h-[460px] rounded border shadow`); default + brand `datasets.gisMap`
(container keys; the rest inherits `gisMapTheme`). **Kept the side Symbology/Basemap panels** —
Decision #3 (relocate-vs-remove) was flagged "confirm first" and the owner is away, so no feature
loss. Count-chip / zoom / legend are AvlMap-rendered chrome.

### Phase 6 — Metadata editor (admin sub-page)  — PARTIAL (functional + based-themed; mockup table deferred)
Design: `datasets-source.html` Metadata. Files: `components/MetadataComp/**` +
`metadataComp.theme.js`, `pages/dataTypes/gis_dataset/pages/metadata.jsx`.
**State:** the column editor (`MetadataComp`) **already exists and works** (add/remove field, edit
name/display/type/description) and is themed (`metadataComp` default + brand). Metadata is already
admin-reachable (Decision #1 largely moot — it's `cdn:()=>false` on the public tab).
**Deferred (unverifiable internal rewrite):** the mockup's exact **column-editor table** (drag-reorder
handle, `validated` badge, Req ●/○ column, type pills) — a `MetadataComp` restructure best done with a
browser. Container is themed via `gisPages.metaOuter`.

### Phase 7 — Admin tab  — PARTIAL (Access editor + tasks shipped; mockup cards deferred)
Design: `datasets-source.html` Admin. Files: `pages/dataTypes/default/admin.jsx` (+ internal).
**Already shipped (this session, via the permissions task):** the **Access editor**
(`SourceAccessEditor` — replaced the legacy numeric UAC in both admin pages), the sidebar actions
(Advanced Metadata / Add version / Delete), and the **Tasks panel** (`UdaTaskList`, scoped to the
source — the functional run-history the phase asks for already renders). Admin content sits in the
SourcePage gray `body` band (Phase 2).
**Deferred (unverifiable):** the mockup's exact **card layout** (Versions / Schedule / Schema /
Danger-zone cards), the DAMA **Schedule** card (cron/run-now), and theming `version.jsx`/`schedule/*`.

### Phase 8 — Create / upload flow  — BLOCKED on a mockup (unchanged); partial functional done
Files: `pages/CreatePage.jsx`, `pages/dataTypes/*/sourceCreate|Create/**`.
**Blocked on a mockup** (`datasets-create.html` not designed) — per the original plan, hold the wizard
redesign. **Functional bit done this session:** new sources default **private + creator-owned**
(`auth_permissions`) in `CreatePage` + internal `sourceCreate` + server `dama/upload/metadata.js`.

### Phase 9 — Theme completion + default baseline + sync  — PARTIAL (brand keys added; sync deferred)
**Done across this session:** brand `datasets.*` keys now exist for breadcrumbs, datasetsList,
sourcePage, sourceOverview, categories, gisPages, gisMap, metadataComp (8 keys in themev2), each with
a neutral default baseline; the redesigned surfaces moved onto `getComponentTheme`.
**Deferred (deliberately not run autonomously):** port the mockup `theme/theme.js` tokens + **sync to
TransportNY** (a copy recipe — [[reference_transportnyv2_theme_sync]] — that overwrites vendored
copies; needs a human to run/verify). `SettingsPage` already uses `getComponentTheme`.
- Sweep remaining datasets surfaces onto `getComponentTheme`; complete transportny2 `datasets.*`
  keys; ensure the **default theme** renders coherently (baseline tokens).
- Port `theme.js` tokens from the mockup `theme/theme.js` into `src/themes/transportny/themev2.js`;
  sync to TransportNY per [[reference_transportnyv2_theme_sync]].
- **SettingsPage** (`pages/SettingsPage.jsx`): the `filtered_categories` hide-lever that backs the
  catalog's hidden buckets (already uses `getComponentTheme` — the gold-standard reference).

## Testing checklist (per phase)
- [ ] transportny2: page matches the mockup; no inline Tailwind left (audit `className="..."` /
      `theme.x || '...'`).
- [ ] default theme: page renders coherently (no missing-style breakage).
- [ ] Functional: view switcher persists; per-view download fires; Admin Tasks list scoped to source;
      editable table edits survive refresh; Metadata reachable only via Admin.
- [ ] BC: existing datasets sites (internal + external/DAMA) still render & operate.

## Related
- Spin-off already logged: [Spreadsheet Column Type control](./spreadsheet-column-type-control.md).
- Editable-spreadsheet persistence fix (Phase 4) — needs its own commit/regression test.
- Memory: [[project_datasets_design_topic]] (the mockup), [[feedback_design_iterate_in_mockup_first]],
  [[reference_transportnyv2_theme_sync]], [[feedback_datawrapper_fetch_modes]].
