# Map filter-bounds: point layers crash the page, arrive unprojected, and can't provide bounds

> **Status:** FIXED 2026-07-28, verified live · all three changes BC · driven by TransportNY
> row 2196812 (incident map empty state) and its blocker ticket row 2197157.

## Objective

Make `zoomToFilterBounds` work for **point** layers and for layers backed by a view in any SRID, and
let a layer other than the active one supply bounds when the active layer's filter matches nothing.

## The three defects (all in one code path)

Reproducer: the tsmo2 incident map, whose symbology holds a line layer over `transcom_event_tmc`
(view 2799, MULTILINESTRING/4326) and a new circle layer over the transcom events master
(view 1947, **POINT/3857**).

### 1. A single-feature extent crashed the whole route

`fetchBoundsForFilter` returns `ST_AsGeojson(ST_Extent(wkb_geometry))`, and **the GeoJSON type depends
on the degeneracy of the extent, not the layer**: many features → `Polygon`, a filter matching one
point → `Point`, colinear features → `LineString`. The consumer assumed `Polygon` and read
`coordinates[0]`, so a `Point` extent handed `.reduce` a **number**:

```
TypeError: coordinates?.reduce is not a function   (map/index.jsx)
```

React Router caught it and replaced the entire page with *"Unable to complete your request at the
moment."* — no console error a reader would connect to a map layer, no failed request. Any point layer
with `zoomToFilterBounds` and a filter resolving to one feature took the page down.

**Fix:** normalize by geometry type (`Point` → `[coords]`, `LineString`/`MultiPoint` → coords,
`Polygon`/`MultiLineString` → `coords[0]`, `MultiPolygon` → `coords[0][0]`), validate every pair is
finite, and warn-and-return instead of throwing when nothing is usable.

### 2. The extent arrived in the view's native SRID

`ST_Extent` was never transformed, so view 1947 returned metres —
`{"type":"Point","coordinates":[-8206944.09, 4977613.25]}` — which `LngLatBounds` reads as absurd
lng/lat. Line layers happened to work only because their views are already 4326.

**Fixing this server-side is not available:** the attribute is a falcor **path key**, and adding the
comma that `ST_Transform(geom, 4326)` requires makes the request throw. Verified by A/B: with
`'ST_AsGeojson(ST_Transform(ST_Extent(wkb_geometry), 4326)) as bextent'` the awaited call never
returned; reverting to the comma-free original returned the extent immediately. (Related, and broader
than previously recorded: commas break these attribute keys for EXTERNAL DAMA sources too, not just
`isDms` calc columns.)

**Fix:** invert spherical Mercator client-side, only when values are out of lng/lat range —
`|x| > 180 || |y| > 90`. 4326 views are untouched.

### 3. Only the ACTIVE layer could supply bounds

The effect probes exactly one layer. A layer whose filter matches nothing yields an empty extent and
the map then does **not zoom at all** — so on the incident page an event with no TMC footprint left the
segment layer empty, the map never centred on the incident, and the event-point tile was never even
requested (measured: map fetched z8/75/96 while the point sits in z8/76/96, one tile east).

**Fix:** try the active layer first (unchanged), then fall back to any other layer whose
`dynamic-filters` ask to zoom and have resolved values. `fetchBoundsForFilter` derives the view from
`symbology.activeLayer`, so probing another layer means passing a clone with `activeLayer` repointed —
no change to `stateUtils`.

### Bonus: zero-area extents zoomed to maximum

A single point yields `sw === ne`, so `fitBounds` solves for infinite zoom and slams to `maxZoom`.
Buffered to a ~1 km window (`±0.0045°`) only when the extent is degenerate.

## Files changed

| File | Change |
|---|---|
| `…/ComponentRegistry/map/index.jsx` | geometry-type normalization + finite-pair validation; spherical-Mercator inversion for projected extents; candidate-layer fallback; degenerate-bounds buffer |
| `…/mapeditor/MapEditor/stateUtils.jsx` | `BEXTENT_ATTR` extracted to one constant so the request path and the response key can't drift (the attribute string is used as both) |

## BC check

- [x] Polygon extents (every existing layer) take the same path and produce identical bounds — the
      normalization returns `coordinates[0]` for `Polygon`, exactly as before.
- [x] 4326 views are unchanged: the Mercator inversion only fires when a coordinate is outside
      lng/lat range.
- [x] Non-degenerate extents are not buffered.
- [x] The fallback runs **only** when the active layer yields no usable extent, so pages where the
      active layer resolves keep their existing framing (verified: the incident map still frames the
      affected-segment extent, not the point).
- [x] No config, theme, or schema keys added; nothing to migrate.

## Verified live (tsmo2 incident_view, both branches)

| case | before | after |
|---|---|---|
| event with a footprint | segment framed; point layer's tile never matched the viewport | segment framed **and** pin renders — point tile z12/1208/1534 → 64 b |
| event with **no** footprint | no zoom at all; map sat one tile east of the event; bare basemap | falls back to the point extent, centres on the event — point tile z12/1216/1537 → 65 b |
| point layer as `activeLayer` | **entire page replaced with "Unable to complete your request"** | loads normally |

## Follow-ups (not done)

- [ ] `fetchBoundsForFilter` still can't transform server-side because of the comma-in-path-key limit.
      Worth fixing properly at the falcor/UDA layer so attribute expressions can contain commas.
- [ ] The same bounds effect ignores `interactive-filters`; only `dynamic-filters` are considered as
      fallback candidates.
