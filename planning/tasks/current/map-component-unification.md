# Map Component Unification (`map/` + `map_dama/` → single component)

## Status: P1–P4 BUILT & LIVE-VERIFIED 2026-07-10 (uncommitted; P5 migration/retirement pending) — follow-up to `mapeditor-uda-migration.md`

## 2026-08-07: P5 approach changed — permanent lazy shim, not a one-shot script + delete

Owner instruction: follow the same pattern just used to retire the legacy Graph component
(`migrate-legacy-graph-to-graph-new.md`) instead of the "one-shot migration script + hard delete"
originally planned below. Concretely, this **replaces** the P5 plan in this doc:

- `"Map: Dama Map"` in `ComponentRegistry/index.jsx` now resolves to `Map`'s own `EditComp`/`ViewComp`
  (spread + `name: 'Map: Dama'` + `hideInSelector: true`), the same shape as `"AVL Graph"`. It is
  **hidden from the Type picker** but stays resolvable forever — `map_dama/` is NOT deleted, matching
  `legacy_graph`'s treatment (import commented out, directory kept for reference).
- New `ComponentRegistry/map/Map.migrate.js` (sibling to `graph_new/Graph.migrate.js`) reshapes a
  legacy map_dama element-data object into `Map`'s shape **on every read**, idempotently. Unlike
  Graph, this can't gate on `component.type` (`Map` and `Map: Dama Map` share `type: 'Map'`) or on
  `compName` (`MapSection` renders directly off the raw section `value` prop and never goes through
  `dataWrapper`/`convertOldState`, so no compName/compType is even available at the call site).
  Instead it gates structurally: `basemapStyle` / `legendPosition` / `pluginControlPosition` /
  `zoomToFitBounds` / `display` are fields `Map` has written on every save since before this
  unification work and `map_dama` never had — their presence means "already map-shaped" regardless
  of save age; their total absence alongside a populated `symbologies` object means map_dama-origin
  data. On migration: top-level `shareableState` moves to `display.shareableState`; `display.layerPanel`
  defaults to `'library'` (map_dama's `MapManager` was always on-map, so this is the closest
  equivalent panel) — this part matches the original P5 plan's migration-script mapping below.
- Persistence: exactly like Graph, viewing alone never writes anything back (`MapSection`'s persist
  effect is edit-mode-only); the upgraded shape is only saved once an author opens the section in
  edit mode and saves.
- Found and fixed one more Map-specific name-gated check the Graph migration didn't have to touch:
  `sectionMenu.jsx`'s `componentAPI` selector (`['Map'].includes(currentComponent?.name)`) decided
  whether the section's Settings menu wired up `mapAPI` (the map-specific state handle) or fell back
  to `dwAPI` (which Map/MapDama never populate, since neither uses `dataWrapper`) — without adding
  `'Map: Dama'` to that array, every migrated section's entire Settings panel (Symbologies, Filters,
  Display) would have silently gone dead. Swept the rest of `sectionMenu.jsx`/`section.jsx` for other
  `currentComponent?.name`-gated checks the same way the Graph task did; no other Map-specific ones
  found (the `Graph`/`AVL Graph` array checks are unrelated to Map).
- **Feature-parity audit result (2026-08-07, mitigat-ny-prod, near-exhaustive: 2159/2167 pages
  read, 33 page-bearing patterns, 8 pages blocked by a pre-existing unrelated server 500)**: 28
  live `Map: Dama Map` sections found across 12 pages / 4 patterns.
  - **Filter-group selector, view-group selector, dynamic-filter checkbox popup: 0 usages each.**
    Not ported. `Map.migrate.js` does not touch/strip these layer fields either way — they pass
    through in the saved `symbologies` object untouched — so if a future consumer needs them the
    data is intact; only the authoring/runtime UI (`LayerLibraryPanel`, settings) doesn't expose
    them yet, same as the pre-existing "deferred, no current consumer" status these already had.
  - **Per-tab icon: 1 page uses it** (`putnamcsc_admin` pattern, page 1626087 `scenario_tools`,
    tabs "Parcel Maps"/"Hazard Layers" — `fad fa-map` / `fad fa-traffic-cone`). Also not ported:
    `tabs[].icon` is likewise passed through untouched by the migration (no data loss), and the
    approved Layer Library panel design (`dms_design_system_v2/pages/freight-atlas-map.html`,
    locked per this doc's own scope caps) has no icon slot in its category-accordion headers —
    adding one would mean deviating from the approved mockup for a single page's cosmetic detail.
    If that page's icons matter to its owner, it's a 1-page, low-effort follow-up, not a blocker.
  - **Known blind spots**: 8 pages across 4 patterns (`county_template2_copy`,
    `county_data_site`×2, `shmpcopy`) return a pre-existing, unrelated 500
    (`Cannot read properties of null (reading 'from')`) and couldn't be read at all — whatever
    they contain is unaudited. Neither blind spot changes the ship decision, since the shim is
    structural and permanent (no hard delete, no one-shot rewrite) — any section in an unaudited
    app upgrades identically the first time it's rendered, regardless of when someone gets around
    to auditing that app.
  - **2026-08-10: full exhaustive audit extended to `npmrdsv5` (dev2)** — the earlier "spot-checked
    1 page, tab-icon-only" note was based on a single sandbox page and undersold real usage.
    Audited all 13 page patterns / 142 listed pages (131 readable with an admin token; 11 are
    individually access-gated and excluded) via the DMS CLI against `dmsserver.availabs.org` —
    **8 pages / 18 `Map: Dama Map` sections found** across `sandbox`, `freightatlas2`, and
    `transit` patterns:
    - `filterGroupEnabled`: 0/224 layers true — no real usage, consistent with mitigat-ny-prod.
    - `viewGroupEnabled`: **2/224 layers show `true`** (sandbox page "NPMRDS Shapefile", id
      2063932) — but `viewGroup`/`viewGroupName` are both `undefined` on both, i.e. the toggle
      was flipped with no group ever configured, so there is nothing to switch between. Inert in
      practice; still 0 *functional* view-group usage.
    - `dynamic-filter-display`: 0/224 layers — no usage, consistent with mitigat-ny-prod.
    - **Tab icons: 3 of 8 pages** (not 1) — `page_1423066` (Freight Atlas 2 Figures, sandbox),
      `page_1423075` (BILD, sandbox), and, materially, **`page_1411761` — "Freight Atlas"**,
      `published`, live at the `freightatlas2` pattern's `/freight_atlas` route — 7 tabs, each
      with a real icon (`fad fa-map`, `fa-industry-alt`, `fa-ship`, `fa-subway`, `fa-road`,
      `fa-layer-group`, `fa-truck`). Corrects the earlier "1-page, low-effort" framing: this is a
      live production page, not a demo. Icons still aren't stripped by the migration (`tabs[].icon`
      passes through byte-identical, verified below) so no data is lost, but they won't render
      anywhere until `LayerLibraryPanel` gets an icon slot — a real, visible (if cosmetic) gap on
      a live page, not just a deferred non-issue.
    - **`shareableState: true` found on a live section** — same page 1411761, section `2190241`
      (the second of its two map_dama sections). This is the exact case `deriveMapShareVariables`'s
      element-type gate (fixed earlier this session, `pages/_utils/index.js`) needed to handle:
      confirmed the *unfixed* gate (`=== 'map'`) would NOT have matched `'Map: Dama Map'` for this
      section, and the fix does. Without that fix, this live page's shareable-map-link (`?layers=`
      URL state) would have silently stopped auto-registering as a page variable post-migration.
      This turns that fix from precautionary to load-bearing for a real, currently-published page.
    - Verified `Map.migrate.js` against all 18 real sections: 0 mismatches — idempotent,
      `symbologies`/`tabs` byte-identical, `blankBaseMap` logic correct (all 18 had it explicit,
      already `false`, none needed the new true-default; verified anyway).
  - **Wider sweep, 2026-08-10**: also exhaustively checked every other app reachable without
    special auth — `avail` (46 pages), `wcdb` (10 pages), `tessera` (2 pages), `asm`/`b3nson`
    (15 pages) — **zero `Map: Dama Map` sections** in any of them (real page dumps, not just
    pattern listings). `landbank` was skipped at the user's instruction.
  - Verified `Map.migrate.js` against all 28 real production `element-data` payloads pulled during
    the audit (`scratchpad/mitigat-ny-prod/raw_hits/`): every one lacks `display`/`basemapStyle`
    (confirming the structural detection is safe across the whole live population, not just the
    one hand-picked sample), migrates to the expected `display: {shareableState, layerPanel:
    'library'}` shape, is idempotent on a second pass, and leaves `symbologies`/`tabs` (icons
    included) byte-identical. A synthetic already-migrated/genuine-`Map` sample and an
    empty/new-component sample both pass through untouched, confirming the gate doesn't
    misfire on non-map_dama data.

- **2026-08-10: `blankBaseMap` default change.** Migrated sections that never had an explicit
  `blankBaseMap` saved now come in with it defaulted to `true` (blank basemap on), rather than the
  general `false` default `Map`/`MapDama` both used at render time. Sections that *do* have an
  explicit value (true or false — the author toggled it and saved) keep that value unchanged.
  Verified against all 28 real production payloads: 22/28 had an explicit value (both true and
  false present) and are preserved byte-identical; the remaining 6 now default to `true`. Zero
  mismatches.

- **2026-08-10: filters/legend audit.** Checked every filter mechanism + legend settings for
  migration safety:
  - **Dynamic filters** (page filter ↔ layer filter, matched by `searchParamKey` falling back to
    `column_name`) and **interactive filters** (`interactive-filters`/`selectedInteractiveFilterIndex`)
    use byte-identical field names/shapes in `map_dama` and `map` — confirmed via grep across both
    trees. Both pass through `Map.migrate.js` untouched (it never touches `symbologies`), so this
    data carries over correctly. Dynamic-filter page-binding doesn't depend on element-type at all
    (`map/index.jsx`'s `usePageFilters` gate fires on `dynamic-filters.length` alone), so it works
    for migrated sections with zero further changes needed.
  - **Found and fixed a real bug**: `pages/_utils/index.js`'s `deriveMapShareVariables` (which
    auto-registers a shareable map's `layers`/searchParamKey vars as page filters) gated on the
    literal stored `element-type === 'map'`. Migrated sections keep `element-type: "Map: Dama Map"`
    forever — editing+saving does NOT rewrite it (only explicitly re-picking a Type does, and the
    alias is `hideInSelector` so that's not possible) — so this check would permanently fail for
    every migrated section. `map_dama` never had a UI to set `shareableState` (dead field, 0/28 live
    sections have it set), so there's no live regression today, but the first author to enable
    "shareable" on a migrated section via Map's now-exposed settings would hit this silently. Fixed
    by widening the check to `['map', 'map: dama map'].includes(...)`, same pattern as the
    `sectionMenu.jsx` fix. Swept the rest of `patterns/page/` for other `element-type === 'map'`
    string gates — none found.
  - **Legend**: per-layer legend data (`legend-data`, `legend-orientation`) lives inside
    `symbology.layers[id]` and is untouched by migration — carries over exactly. The panel-position
    concept (`legendPosition`, e.g. `top-right`) is new in `Map`; `map_dama`'s legend was always
    rendered flex-right-aligned near the top (`MapDamaEdit`/`View`'s `absolute inset-0 flex` wrapper,
    `map_dama/index.jsx:277-281`), which visually matches `Map`'s `top-right` default — so defaulting
    migrated sections to `top-right` is not a placement regression.
  - `variables: [{name:'geoid', default:'36'}]` on the old `map_dama/config.js` registry entry (lost
    when the alias inherits `Map`'s `variables: []`) is dead config — confirmed no consumer reads a
    component config's top-level `variables` field anywhere in `patterns/page/`, and `geoid` doesn't
    appear anywhere in `map_dama`'s own component code either.

## P5 status: DONE (permanent shim), feature-parity gaps documented above as accepted/deferred

**What shipped 2026-07-10** (verified live on the new Freight Atlas v2 page 2189762, plus
regression shots of the old map_dama page + tsmo2/npmrds — all unchanged):
- `map/LayerLibraryPanel/LayerLibraryPanel.jsx` — the approved workbench panel (header + on-count ·
  search · ACTIVE MAP strip w/ inline interactive-filter select + remove · category accordion w/
  checkboxes + on-badges). Gated by `display.layerPanel === 'library'` (default `'none'` = today).
- `map/map.theme.js` — **`damaMap` theme object registered in `patterns/page/defaultTheme.js`**
  (owner requirement 2026-07-10: the component must be fully themeable through the UI theme system
  as its own object in pages). Panel + index wrappers read it via the canonical
  `getComponentTheme(theme, 'damaMap'/'damaMap.layerLibrary')` + local-default spread.
  **Remaining themeability scope**: LegendPanel/HoverComp still read the shared ui map theme
  (`ui/components/map/map.theme.js` `legend`/`hover`) — migrate them into `damaMap`; the
  `PANEL_POSITION_OPTIONS` position classes and settings-panel chrome are still inline.
- `map/index.jsx` — multi-aware interactive-filter tracking (all symbologies, not just the first
  visible); deferred `SymbologyViewLayer` construction in library mode (only ever-visible
  symbologies get instances — 1 of 31 built at FA load); **shareable URL state**
  (`display.shareableState`, view-only): `?layers=<ids>` + `f_<symId>=<idx>`, read-once/
  write-on-change (replace), unknown ids ignored. Design note: v1 syncs react-router searchParams
  directly (pageState.filters integration deferred — page filters need page-level authoring).
- `map/settings/` — "Layer Library" settings screen (both display toggles; add-symbology from the
  catalog with a category input, mirroring map_dama `addLayer` semantics: cloned hidden incl.
  interactive-filter variants + a `tabs[]` row; list/remove). Classic replace-on-pick untouched.
- **Share-URL E2E verified 2026-07-10** (sections render their view comp on the edit page):
  read restores layers + filter index; toggles write back. Fixed a dev double-mount write race —
  the write effect serializes desired params into a ref and only navigates when that serialization
  changes (URL comparisons are race-prone: setSearchParams flushes async, so a stale scheduled
  write can land after a fresher compare).
- **Share-URL empty-param fix 2026-07-12** (owner report: `?layers=` on prod wedged the FA map in
  a perpetual-loading/blank state): a bare `?layers=` was parsed as "param present, zero ids" →
  every symbology forced hidden. Now (a) read treats an empty/whitespace `layers` value exactly
  like an absent param (default saved state), (b) write drops the `layers` key when nothing is
  visible instead of emitting `layers=` (the writer path that produced such URLs when a user
  unchecked the last layer — `next.delete('layers')` before applying desired). Consequence: an
  all-off map is intentionally not shareable — it round-trips to the default state. Verified on
  freightatlas2.localhost: no-param ≡ `?layers=` (both "1 on"), `?layers=9001050` still restores
  the DAC layer, uncheck-all yields a paramless URL. **Prod needs a redeploy of the bundle to pick
  this up** (repro'd live on freightatlas2.devtny.org before the fix).
- **Full-screen support** (FA v2 request): `HEIGHT_OPTIONS.screen = 100vh` (additive; `full` stays
  95vh) + a neutral `workbench` style in the default LayoutGroup theme (full-bleed, no padding);
  transportnyv2 ships its own branded `workbench` band. Recipe: workbench band +
  `full_width:"show"` + section `padding:"p-0"` + element height `screen`.
- **Deferred**: drag-reorder of active layers, zoom-to-layer, filter-group/view-group selects in
  the panel (no current consumer — FA uses only interactive-filters), legend per-block eye toggle,
  the SymbologiesList gallery modal (settings uses a compact select). Platform wart noted:
  sectionGroup's rail gate treats `sidebar:"none"` as truthy (renders an empty rail column) —
  add a defensive check when next in that code.

> **2026-07-10:** a full architecture pass of mapeditor + map + map_dama (with refined,
> BC-focused unification recommendations and a redesigned multi-symbology view panel) is in
> [research/map-stack-architecture.md](../../research/map-stack-architecture.md) — read it before
> starting this task. First consumer/driver: the Freight Atlas map redesign
> (workspace `planning/transportny/tasks/current/freight-atlas-map-redesign.md`).

## Objective

Collapse the two parallel map component implementations in the page pattern into a single component that covers the union of their features, then retire the legacy one. Both now render post-UDA-migration, but they have diverged on features that users depend on, so neither can be dropped without work.

## Why this can't be a trivial deprecation

Both trees have unique features that matter to live sites. A naive "rewrite `Map: Dama Map` components to `Map`" migration would silently regress ~171 components in mitigat-ny-prod (plus any others across the fleet).

**Feature inventory after Phase 2c of the UDA migration:**

| Dimension | `map/` (newer) | `map_dama/` (legacy) |
|---|---|---|
| Symbologies per map | Single active | **Multiple simultaneously** |
| Filter UI | Config-only (edit-time) | **Runtime in-map controls** |
| DataWrapper page-state filter binding | **Yes** (reads `pageState.filters`) | No |
| Basemap style selector | **Yes** (runtime toggle) | No (hardcoded) |
| Legend orientation | Yes | Yes |
| Legend per-layer visibility toggle | No | **Yes** |
| PMTiles infrastructure | **Yes** (disabled at runtime) | No |
| Hover popups | HoverComp (same pattern) | HoverComp (same pattern) |
| Layer management UI | Flat controls row | **Full MapManager panel** (42 KB) |
| Saved element-data | `{tabs, symbologies, initialBounds, hideControls, height, zoomPan, zoomToFitBounds, legendPosition, pluginControlPosition, basemapStyle}` | `{tabs, symbologies, initialBounds, hideControls, height, zoomPan}` — missing layout/style fields |
| Plugin support | `ExternalPluginPanel` component at top level | Handled inside MapManager |

**Unique-to-map/**: page-state filter binding; basemap selector; PMTiles protocol code; persisted legend + plugin positions + basemap choice.
**Unique-to-map_dama/**: multi-symbology visibility; in-map filter controls (interactive-filters, filter-group selector, view-group selector, dynamic filter display toggle); per-layer visibility toggle in legend; layered tabs.

## Unification red flags

1. **State shape incompatibility**: `map/` has *single active* symbology, `map_dama/` has *multiple visible*. The unified state needs to be multi-capable (superset), and saved `map/` data (single entry) must upgrade cleanly.
2. **Filter binding model is fundamentally different**: `map/` reads from `PageContext` and `map_dama/` owns filter state locally. The unified component needs both: page-state binding as an opt-in per layer/filter, local state as the default.
3. **UI architecture**: flat controls row vs nested MapManager panel. Can't be mechanically merged — needs a design decision about which UI stays (probably MapManager-style, with map's edit-time config panel folded into it).
4. **Saved-data compatibility**: map_dama's `element-data` is a subset of map/'s. Upgrading map_dama components to the unified component requires defaults for missing fields (legendPosition, basemapStyle, etc.) — not a hard problem but needs migration.
5. **PMTiles** is dead in both today (disabled). Deprioritize porting/rebuilding until someone actually needs it.

## DECIDED approach (owner decision 2026-07-10) — extend `map/`, new Layer Library panel, deprecate map_dama

Owner (Alex) confirmed 2026-07-10: **implement the approved Freight Atlas workbench design inside/on
top of the `map` component**, extending it beyond a single symbology while staying fully BC for
existing single-symbology `map` sections; deprecate `map_dama`. Design + full architecture:
[research/map-stack-architecture.md](../../research/map-stack-architecture.md); approved UI =
`dms_design_system_v2/pages/freight-atlas-map.html` (checkboxes not toggles; tight row indent).
First consumer: new Freight Atlas map page (workspace task `freight-atlas-map-v2-page.md`).

### BC invariants (must hold — regression surface #1)
1. A saved `map` element-data renders **identically** with zero migration; every new field defaults
   to today's behavior. Gate everything new behind `display.layerPanel: 'none' | 'library'`
   (default `'none'` = no on-map panel, legend-only, exactly today).
2. Single-symbology semantics preserved: the existing settings-tree symbology picker keeps its
   replace-on-pick behavior; `_functions` providers/subscribers, click-filter, `searchParamKey`,
   basemap persistence, legend/plugin positions untouched.
3. The activeSym-assuming effects (page-filter sync `index.jsx:361-421`, runtime legend refresh
   `:476-644`) become per-visible-symbology loops that are behavior-identical when exactly one
   symbology is visible.

### Phase P1 — Internal refactor, zero behavior change
- activeSym → visibleSymbologies loops in the filter-sync + runtime-legend effects.
- Verify against existing live `map` sections before proceeding.

### Phase P2 — State + authoring (the add-symbology controls, thought through)
- Element-data additions: `tabs:[{name, icon?, rows:[{name, symbologyId}]}]` (categories) +
  `display.layerPanel` ('none' default). Multi-entry `symbologies{}` (shape unchanged — map_dama's).
- Settings-tree **"Symbologies" panel** (authoring stays in the settings tree — do NOT port
  map_dama's on-map edit menus): list of added symbologies with rename / category assignment /
  reorder / remove / "Update from source" (re-clone from catalog preserving visibility);
  **"Add symbology"** opens the catalog browser (port map_dama `SymbologiesList` gallery as a
  settings-launched modal); add = append `{[id]:{...sym, isVisible:false}}` + a row in the chosen
  category (map_dama `addLayer` semantics). Categories created/renamed/reordered in the same panel.
- Keep symbologies **embedded** in element-data (BC; no fetch fan-out). Follow-on (not now): trim
  `interactive-filters[]` snapshot weight.

### Phase P3 — The Layer Library view panel (the approved design)
- New `map/LayerLibraryPanel/` (+ `.theme.js` sibling per package theming rules) rendered when
  `display.layerPanel==='library'`: header w/ on-count · search · **Active Map** strip (ordered
  visible symbologies, remove, zoom-to-layer, inline interactive-filter select) · category
  accordion with **checkboxes** + per-category on-badges. Filter-group / view-group selects render
  for rows that have them (same rules as map_dama's `groupSelectorElements`).
- Legend: per-symbology blocks with name headers + in-legend visibility (eye) toggle, behind the
  same flag (existing `map` legend unchanged when flag off).
- Perf (needed at Freight Atlas scale, 31 symbologies): defer `SymbologyViewLayer` construction /
  style registration until a symbology is first visible; no per-row view-list fetches at panel
  render (view-group dropdowns fetch lazily on open).

### Phase P4 — URL-shareable state (opt-in)
- `display.shareableState: false` default. When on: `?layers=<symId>,…` (visible set) and
  `f_<symId>=<idx>` (selectedInteractiveFilterIndex), read on mount / written on toggle through
  the page pattern's existing `useSearchParams:true` filter channel (see research doc §6.3).
  Unknown ids in the URL are ignored (links survive symbology removal).

### Phase P5 — Consumer sweep, migration, deprecation
- **Sweep all apps for `element-type:"Map: Dama Map"` first** — the ~171-components-in-
  mitigat-ny-prod figure above predates the UDA migration and conflicts with "freight atlas is the
  only consumer"; establish the true set before deprecating.
- One-shot migration script (dry-run + `--apply`) mapping map_dama element-data into the unified
  shape (defaults for `legendPosition`, `basemapStyle`, `pluginControlPosition`, `zoomToFitBounds`;
  `display.layerPanel:'library'` so ex-map_dama sections keep their panel).
- Then delete `map_dama/` + the `"Map: Dama Map"` registry alias.

## Scope caps

- **Don't port** PMTiles unless a production need surfaces. The existing map/pmtiles/ is already dead code; unification doesn't need to revive it.
- **Don't change** the saved-element-data schema more than is required to add the new multi-symbology + layer-panel/share fields.
- Panel visual design is FIXED by the approved mockup — implement it themeable (default theme
  neutral; transportnyv2 brand pass is a separate theme task).

## Out of scope for this task

- Separate concern: hover popup HoverComp has a `uda[pgEnv].viewsById.dataById` TODO on the dms-server side (noted in comments around `SymbologyViewLayer.jsx`). Track separately if it's actually broken — both trees use the same HoverComp shape so unification doesn't change that.
- Separate concern: the `tmp-cache-files/` directory name under `map/` is misleading; the file it held (`FilterableSearch.jsx`) was removed in 2026-04-17's cleanup. Consider renaming/removing the directory as part of unification.

## Prerequisites

- Phase 2c of `mapeditor-uda-migration.md` complete (DONE 2026-04-17) — both trees now render via UDA/DMS
- Phase 4 of `mapeditor-uda-migration.md` (DAMA symbology data migration) complete — so symbology IDs are stable across map_dama → map migration

## Files Requiring Changes

### Target (accrete features here)
- `patterns/page/components/sections/components/ComponentRegistry/map/index.jsx`
- `patterns/page/components/sections/components/ComponentRegistry/map/LegendPanel/LegendPanel.jsx`
- `patterns/page/components/sections/components/ComponentRegistry/map/LayerLibraryPanel/` (NEW — view panel + `.theme.js`)
- `patterns/page/components/sections/components/ComponentRegistry/map/settings/` — "Symbologies" multi-add panel (catalog modal ported from map_dama `SymbologiesList`)
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx` — pass-through; already migrated

### Source (port from)
- `patterns/page/components/sections/components/ComponentRegistry/map_dama/MapManager/MapManager.jsx` — layer management UI + filter controls
- `patterns/page/components/sections/components/ComponentRegistry/map_dama/LegendPanel/LegendPanel.jsx` — visibility toggle

### To delete after migration verified
- `patterns/page/components/sections/components/ComponentRegistry/map_dama/` (entire directory)
- `"Map: Dama Map": MapDama` alias in `patterns/page/components/sections/components/ComponentRegistry/index.jsx`

### Migration script
- `packages/dms-server/src/scripts/migrate-map-components.js` — NEW

## Testing Checklist (for when this lands)

- [ ] A legacy `Map: Dama Map` component renders identically to pre-unification after data migration
- [ ] A legacy `Map` component renders identically to pre-unification
- [ ] Multi-symbology mode: adding a second symbology from the layer panel works; both visible on map
- [ ] Filter controls in the layer panel drive map rendering in-place
- [ ] Page-state-bound layer still responds to page filter changes
- [ ] Basemap toggle works
- [ ] Hover popups show attribute values
- [ ] Saved element-data round-trips through the unified component without data loss
- [ ] Dry-run migration on a test database reports all components that would be touched
- [ ] `--apply` migrates successfully; re-running is a no-op (idempotent)
