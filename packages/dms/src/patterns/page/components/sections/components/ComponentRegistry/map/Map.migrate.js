/**
 * migrateMapState — upgrades a legacy `Map: Dama Map` element-data shape into
 * the canonical `Map` shape, the same way Graph.migrate.js upgrades legacy
 * graph shapes for GraphNew. Idempotent (a no-op on already-new-shape state)
 * so it's safe to call unconditionally on every read.
 *
 * `Map: Dama Map` never had a `display` wrapper — `shareableState` sat at the
 * top level and there was no `layerPanel` concept at all (its MapManager
 * panel was always rendered inline, in both edit and view, unless
 * `hideControls`). Every other field (tabs, symbologies, height,
 * hideControls, zoomPan, initialBounds, setInitialBounds) is identical
 * between the two shapes and needs no change.
 *
 * `blankBaseMap` is the one field that gets a value change, not just a
 * reshape: map_dama sections that never had it explicitly saved should come
 * in with the blank basemap turned ON (`true`) — map_dama's default map
 * style doesn't carry over meaningfully, so blank is the safer landing spot.
 * If the legacy data *did* have an explicit `blankBaseMap` (the author
 * toggled it, on or off, and saved), that explicit choice is preserved as-is.
 *
 * Detecting "this came from map_dama" can't be done via a shared `type`
 * field (both registry entries use `type: 'Map'`) or via `compName` (the
 * component doesn't receive it — it reads the raw section value directly,
 * bypassing dataWrapper/convertOldState entirely). Instead this uses a
 * structural signal: `basemapStyle`/`legendPosition`/`pluginControlPosition`/
 * `zoomToFitBounds`/`display` are fields `Map` has always written on every
 * save (since before the multi-symbology unification work) and `Map: Dama
 * Map` never had at all — their presence means "already map-shaped",
 * regardless of how old the save is. Their total absence alongside a
 * populated `symbologies` object means the data came from map_dama.
 */
const MAP_ONLY_MARKER_FIELDS = ['display', 'basemapStyle', 'legendPosition', 'pluginControlPosition', 'zoomToFitBounds'];

export function migrateMapState(cachedData) {
    if (!cachedData || !cachedData.symbologies) return cachedData;
    if (MAP_ONLY_MARKER_FIELDS.some(field => cachedData[field] !== undefined)) return cachedData;

    const { shareableState, ...rest } = cachedData;
    return {
        ...rest,
        blankBaseMap: cachedData.blankBaseMap !== undefined ? cachedData.blankBaseMap : true,
        display: {
            shareableState: Boolean(shareableState),
            // map_dama's MapManager was always on-map (edit + view, modulo
            // hideControls) — 'library' is the closest existing map panel with
            // equivalent core capability (multi-symbology visibility toggling,
            // interactive-filter switching, categories). See
            // src/dms/planning/tasks/current/map-component-unification.md.
            layerPanel: 'library',
        },
    };
}

export default migrateMapState;
