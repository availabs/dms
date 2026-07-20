# Map settings — dead-code cleanup (post page-variable + settings reorg)

## Objective

Remove the now-unreferenced legacy controls and their supporting hooks/handlers left behind by the
map share-state → page-variable migration (Phase 5) and the main-settings reorg (Phase 5b), in
`patterns/page/components/sections/components/ComponentRegistry/map/settings/`. Mechanical, behavior-preserving.

**Parent task:** [`map-share-state-via-page-variables.md`](./map-share-state-via-page-variables.md).
Deferred out of that work to avoid a ~250-line deletion mid-session.

## Why it's dead

- **Phase 5** replaced the per-active-symbology filter controls with `MapFilterBridgeList` (per-symbology,
  driven by `getSymbologyBridge`/`listBridgeSymbologies` in `filters.jsx`).
- **Phase 5b** replaced the single-symbology picker + separate Layer Library control with the unified
  `MapSymbologyManager`, and regrouped the menu into **Symbologies / Filters / Display**.

Both removed the old components from the `MapControls()` tree, so they and their now-orphaned data sources
are unreferenced.

## Confirmed dead (each appears only at its own definition — verified via grep 2026-07-14)

In `settings/controls.jsx` — delete these 8 component definitions:
- `MapSymbologyControl`, `MapLayerControl`, `MapLayerLibraryControl` (Phase 5b)
- `MapUsePageFiltersControl`, `MapKeySearchParamControl`, `MapInteractiveFiltersControl`,
  `MapDynamicFiltersControl`, `MapLayerClickFiltersControl` (Phase 5)

## Cascade — becomes dead ONCE the 8 controls are removed (re-verify before deleting each)

- `settings/filters.jsx`: the default hook **`useMapSettingsFilters`** (the activeSym-bound one). Its
  outputs were consumed only by the deleted filter controls. **KEEP `getSymbologyBridge` +
  `listBridgeSymbologies`** in this file — they are live (used by `MapFilterBridgeList`). Remove the
  `useMapSettingsFilters` import + call in `settings/state.jsx`.
- `settings/layers.jsx` (`useMapSettingsLayers`) + its use in `state.jsx`: existed only for the deleted
  `MapLayerControl` (`selectedLayer`/`layerOptions`/`onLayerChange`). Likely deletable whole-file.
- `symbologySelector.jsx`: `onSymbologyChange` (destructive replace — only `MapSymbologyControl` used it)
  and `onLayerChange`. Keep `selectedSymbology` if still referenced (e.g. the `onUpdateSymbology` fallback).
- `symbology.jsx`: stop returning `onSymbologyChange` if removed upstream. **KEEP** `addSymbologyToLibrary`,
  `removeSymbologyFromLibrary`, `setSymbologyVisible`, `setActiveLayer`, `onUpdateSymbology` (all live in
  `MapSymbologyManager`).

## Method (careful, not just grep-and-delete)

1. Delete the 8 controls in `controls.jsx`; parse-check.
2. Re-grep each cascade symbol across the whole `map/` tree (not just `settings/`) to confirm zero live
   references before deleting it. `map_dama/` has its own copies — do **not** touch them.
3. Prune `state.jsx` (drop `useMapSettingsFilters`/`useMapSettingsLayers` imports + spreads) once their
   only consumers are gone.
4. Delete `layers.jsx` only if nothing else imports it.
5. `useMapSettingsUI`/`useMapSettingsControls` stay — just thinner.

## Testing checklist

- [ ] `controls.jsx`, `filters.jsx`, `symbology.jsx`, `symbologySelector.jsx`, `state.jsx`,
      `layers.jsx` all parse (babel) after each deletion.
- [ ] Map Settings still shows **Symbologies / Filters / Display**; all three screens render and function.
- [ ] `MapSymbologyManager`: visibility toggle, active marker, add/remove, per-symbology Refresh,
      active-layer picker, mode toggles all still work.
- [ ] `MapFilterBridgeList`: per-symbology bridge list + drill-in still work.
- [ ] No console errors; single-symbology (county_template) and multi (freight_atlas) both clean.
- [ ] Mirror all changed files to `transportNY/src/modules/dms/...` (verify in-sync).

## Files

`map/settings/controls.jsx`, `filters.jsx`, `symbology.jsx`, `symbologySelector.jsx`, `state.jsx`,
`layers.jsx` (candidate for deletion). Mirror to the transportNY vendored copy.

## DONE — 2026-07-14 (behavior-preserving; owner browser-verify recommended)

- **`controls.jsx`** — deleted the 8 dead controls (`MapSymbologyControl`, `MapLayerControl`,
  `MapLayerLibraryControl`, `MapUsePageFiltersControl`, `MapKeySearchParamControl`,
  `MapInteractiveFiltersControl`, `MapDynamicFiltersControl`, `MapLayerClickFiltersControl`). 1026 → 641 lines.
- **`filters.jsx`** — deleted the `useMapSettingsFilters` hook; kept `getSymbologyBridge` / `listBridgeSymbologies`.
- **`state.jsx`** — dropped the `useMapSettingsFilters` + `useMapSettingsLayers` imports/calls/spreads.
- **`layers.jsx`** — deleted (only `state.jsx` imported it).
- **`symbology.jsx`** — dropped `onSymbologyChange` (destructure + return); refreshed its doc comment.
- **`symbologySelector.jsx`** — dropped `onSymbologyChange`, `onLayerChange`, `selectedLayer`, `layerOptions`
  (defs + returns); kept `selectedSymbology` (Refresh fallback), `symbologyOptions`, `onUpdateSymbology`, etc.
- **`README.md`** — file-responsibilities list updated + a "Removed in the 2026-07 cleanup" note.

Verified: each removed symbol has **zero live references** (only doc comments + the expected
`getSymbologyBridge`/`listBridgeSymbologies` import remain); all files parse (babel); KEEP components
(`MapSymbologyManager`, `MapFilterBridgeList`, Display controls, `useMapSettingsUI`, `MapControls`) intact.
Mirrored to transportNY (incl. deleting its `layers.jsx`). Recommend a quick browser confirm: Settings shows
**Symbologies / Filters / Display**, all three screens function, no console errors, on single (county_template)
+ multi (freight_atlas) maps.
