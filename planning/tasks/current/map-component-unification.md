# Map Component Unification (`map/` + `map_dama/` → single component)

## Status: NOT STARTED — follow-up to `mapeditor-uda-migration.md`

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

## Recommended approach

**Build a new unified `map/` by extending the existing `map/` with map_dama's missing features**, rather than forking a third thing. Rough plan:

### Phase U1 — Decision: which base?

`map/` is more modern (better state coverage, page-state binding, PMTiles infrastructure). Start from it. Port map_dama's features *into* it.

### Phase U2 — State shape upgrade

- Support multi-visible symbologies: `symbologies: {[id]: {...sym, isVisible: boolean}}`
- Keep single-select semantics as the default behavior when only one symbology is present (so `map/` components render identically to today)
- Add `activeFilterMode: "pageState" | "local"` per layer with default `"local"` (matches map_dama legacy behavior); layers originally from `map/` get `"pageState"` on migration

### Phase U3 — Port map_dama's MapManager

- Move the layer-management UI from the 42 KB `map_dama/MapManager/MapManager.jsx` into `map/controls/` as a new LayerManagerPanel component
- Split into smaller files (SymbologyRow, InteractiveFilterSelector, FilterGroupSelector, ViewGroupSelector, DynamicFilterControls) — MapManager is monolithic today
- Wire its interactive/filter-group/view-group dropdowns into the unified state

### Phase U4 — Port in-legend visibility toggle

- Move the VisibilityButton from `map_dama/LegendPanel/LegendPanel.jsx` to `map/LegendPanel/LegendPanel.jsx` behind a config flag (defaults off for existing `map/` components, on for ex-map_dama components)

### Phase U5 — Data migration

- One-shot script that finds components with `element-type: "Map: Dama Map"`, maps their `element-data` into the unified shape, and rewrites the element-type to `"Map"`
- Fields added with defaults: `legendPosition`, `pluginControlPosition`, `basemapStyle`, `zoomToFitBounds`
- Set a per-layer flag indicating origin so UI can default to map_dama's "interactive filter" behavior for these layers
- Same dry-run + `--apply` pattern as the symbology migration script

### Phase U6 — Retire map_dama

- After all affected apps are migrated and verified, delete `map_dama/` directory, remove `"Map: Dama Map"` alias from `ComponentRegistry/index.jsx`, remove any remaining references.

## Scope caps

- **Don't port** PMTiles unless a production need surfaces. The existing map/pmtiles/ is already dead code; unification doesn't need to revive it.
- **Don't redesign** the filter UI. Just combine what's there from both.
- **Don't change** the saved-element-data schema more than is required to add the new multi-symbology + filter-mode fields.

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
- `patterns/page/components/sections/components/ComponentRegistry/map/controls/` (add LayerManagerPanel + subcomponents)
- `patterns/page/components/sections/components/ComponentRegistry/map/SymbologySelector.jsx` — expand for multi-symbology
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
