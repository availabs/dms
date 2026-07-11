# Map Component Unification (`map/` + `map_dama/` → single component)

## Status: P1–P4 BUILT & LIVE-VERIFIED 2026-07-10 (uncommitted; P5 migration/retirement pending) — follow-up to `mapeditor-uda-migration.md`

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
