# Map: server-side tile `filter=` from a `serverSide` dynamic-filter

> **Status:** ✅ BUILT 2026-07-17, verified live on tsmo2/incident_view (dev). Rides the next
> git sync/deploy.
> **Driver:** the incident-view "Location & affected segment" map (ticket 2192558) must render
> only ONE event's TMCs from `transcom_event_tmc` (view 2799). Unfiltered, 2799 tiles are
> **~64MB each** (the whole event×TMC network). The Map component's dynamic-filters are
> CLIENT-side (a MapLibre `["in", …]` expression on already-downloaded tile features), so they
> can't shrink the download. The tile route already accepts a server-side `filter` (SQL WHERE),
> but `getLayerTileUrl` never emitted it.

## Change (additive/BC)

`ComponentRegistry/map/SymbologyViewLayer.jsx` `getLayerTileUrl`: after the `cols=`/`join=`
composition, a layer dynamic-filter flagged **`serverSide: true`** with resolved `values` now
emits `&filter=<col> = '<v>'` (or `<col> IN ('<v>',…)` for a list) — values single-quoted and
`'`-escaped. The tile route (`dama/tiles/tiles.rest.js`) applies it as `AND <filter>` inside
the PostGIS `ST_AsMVT` query, so rows are filtered BEFORE the tile is built.

Result on 2799 filtered to one `event_id`: **~64MB → ~2KB per tile** (measured). Only emitted
while the filter has values; a no-match `defaultValue` sentinel (e.g. `__none__`) keeps a
missing value from ever producing the whole-network tile.

BC: layers without a `serverSide` dynamic-filter are byte-identical (the block is skipped).

## Important adjacent constraint (why the binding is `event_id`, not the active corridor)

The Map component **deliberately excludes `type: 'action'` page params** from its
dynamic-filter sync (`map/index.jsx` `dataPageFilters = pageFilters.filter(f => f.type !==
'action')`) — to stop its own interaction filters from feeding back. So the active-corridor
params published by the page's data sections (`activeTmcLinear`, `activeCorridorTmcs`, …, all
action-type) **cannot drive the map**. The map CAN read non-action page filters — the page's
`?event_id` (a page-`filters` default / URL param). Hence the incident map binds `event_id`
(the whole-event footprint), which is also the semantically correct "Location & affected
segment" overview and needs no corridor re-scoping.

## Consumer

incident_view map slot ([6], builder `build_tsmo2_incident_view.mjs`): a `Map` section, one
line layer over 2799, `dynamic-filters: [{ column_name: 'event_id', searchParamKey: 'event_id',
serverSide: true, defaultValue: '__none__', zoomToFilterBounds: true }]`, single alert-red
paint (design mockup uses one color for affected TMCs), directional line-offset, `legendPosition:
'hide'` (small card), zoom-to-fit via ST_Extent on 2799 WHERE event_id=…. Verified: 200 tiles
`…?cols=tmc,event_id&filter=event_id='…'`, zoom frames the event, affected TMCs render red.

## Follow-ups (optional)

- Delay-gradient coloring is now trivial (delay is a native 2799 column — add `delay` to
  data-column and a step/interpolate paint) if a richer map is wanted later; the design mockup's
  single-color was chosen for v1.
- An author-facing toggle for `serverSide` on the dynamic-filter control (currently set only via
  the build script) — add to the map layer's filter config UI if authors need it.
- Multi-value `serverSide` filters emit `IN (...)` but are untested beyond single-value equality.
