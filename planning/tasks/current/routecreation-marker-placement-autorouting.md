# Route Creation: Marker Placement / Auto-Routing Mode

## Status update (2026-07-30) — read before the rest of this file

This umbrella plan (and its "Cross-repo note" below) predates a major restructuring: on
2026-07-29, the `routecreation` plugin (Phase 2's marker mode included) was **ported natively into
dms-template** via `theme.mapPlugins` — see dms-template's
`planning/transportny/tasks/completed/port-transportny-map-plugins.md`. dms-template's own dev server is now
where this plugin is developed and tested; the "Phases 2-3 live in transportNY" framing below is
historical. Additional feature work also landed in the plugin between this file's last edit
(2026-07-23) and the port (2026-07-29) — search-to-add-TMC and route_id-aware update/overwrite
labeling — and carried over in the port. See dms-template's `route-creation-tool.md` for the
current, consolidated status of the whole arc (this file, the port, and the research trail);
this file remains the record of Phase 1's own design/decisions, which are still accurate.

## Objective

Add a second, mutually-exclusive creation mode ("markers") to the routecreation mapeditor plugin
(transportNY): drop arbitrary points on the map, auto-resolve them to a TMC path via server-side
map-matching, with year-scoped network selection. This is the highest-priority feature gap
identified against the old Route Creation tool (see `research/route-creation/findings.md` in this
repo's root for the full investigative trail — Parts 1-6).

## Cross-repo note

The plugin being extended (`routecreation.plugin.jsx` + friends) lives in **transportNY**, a
separate repo from `dms-template`, not tracked by this repo's git history or CI. This file is the
**overall/umbrella plan** (all 3 phases, all decisions, full derivation) and the **canonical tracker
for Phase 1**, which IS part of this repo's `@availabs/dms` library submodule.

**Phases 2-3 (the transportNY plugin work) now have their own local tracking doc in that repo**,
added 2026-07-23 per user request for a proper todo/planning set over there too:

> `transportNY/planning/tasks/current/routecreation-marker-placement-autorouting.md`

That file restates what's needed to implement Phases 2-3 without needing this repo open, and has
its own todo.md entry under transportNY's `maps` topic. **Update both files as work proceeds** —
this one stays the umbrella/Phase-1 source of truth; the transportNY one is the local Phase 2-3
source of truth. Don't let them drift on status.

## Scope

**In scope:**
- dms-server proxy Falcor/REST route wrapping the external `routing2.availabs.org` map-matching
  service (Phase 1).
- routecreation plugin: marker-drop UI, drag-to-reposition, gradient-by-sequence styling, mode
  toggle vs. the existing tmc-clicks mode (Phase 2).
- Year selector: state + UI to pick a network vintage, driving both (a) the proxy call's `year`
  param and (b) swapping the visible shapefile layer's `view_id` to match (Phase 3).
- Save/load: persisting `points` alongside/instead of `tmc_array`, loading a `points`-based route
  back into marker mode.

**Out of scope** (deferred per user 2026-07-23 — see findings.md Part 4):
- CSV bulk import.
- Folder field in save/move.
- Permissions model.
- `map`/`map_dama` page-section parity for the view-group runtime selector — a separate, already
  tracked gap (`map-component-unification.md`), irrelevant to this plugin since routecreation runs
  inside the mapeditor pattern's own page, not a `map`/`map_dama` section.

## Current state

(Derived from `research/route-creation/findings.md`, dms-template repo, 2026-07-23 — read that doc
for the full derivation/evidence trail behind every claim below.)

- The routecreation plugin currently only implements the old tool's `tmc-clicks` mode — click a
  rendered TMC feature, toggle it in/out of `tmc_array`. A prior bug (empty `.properties` on map
  click, due to no `?cols=` on the tile URL) is fixed via a plugin-local `data-column: 'tmc'`
  addition — user-confirmed live and committed in transportNY (2026-07-23).
- No marker mode, and no "year" concept, exists in the plugin today. Its shapefile layer
  (`SHAPEFILE_LAYER_KEY = "npmrds_shapefile"`, `constants.js`) resolves to whatever single
  `view_id` an admin manually attached once via the generic `SourceSelector` UI
  (`comp.jsx:70-73`) — there is no switching mechanism in the plugin's own code.
- The old tool's server-side map-matching call (`falcor.get(["routes2","get","route", request])`,
  `RouteCreationLayer.jsx:407-430` in transportNY) is served by **avail-falcor**
  (`routes/folders2.route.js:480`, `services/folders2Controller.js:1057` `processRouteRequests` →
  `getRoute` at `:565`), which does a plain HTTP POST to an external, independent microservice:
  ```
  POST https://routing2.availabs.org/route?conflation_map_version={year}_{version}&return_tmcs=1
  Content-Type: application/json
  Body: { "locations": [{ "lat": <num>, "lon": <num> }, ...] }
  → { "ways": ["<tmc_id>", ...] }   (or { "err": {...} } if no match)
  ```
  **Confirmed live 2026-07-23**: reachable with no auth, no VPN, CORS wide open (reflects any
  `Origin`), and replaying a real cached route's exact stored points reproduced the cached
  `tmc_array` byte-for-byte (route 268046, year 2022: `["120N05838","120-05837","120N05837","120-05836"]`
  both ways).
- `version` is a stable, hardcoded constant in avail-falcor (`CONFLATION_VERSION = "v0_6_0"`) — not
  surfaced as a user choice there either.
- Year range: verified live that the old prod DB's `conflation.conflation_map_osm_version` has a
  `v0_6_0` entry for every year **2016 through 2026, no gaps** — which exactly matches the years
  already covered by the new stack's own NPMRDS per-year TMC shapefile metadata
  (`src/dms/documentation/npmrds-data-sources.md`'s "Per-year TMC geometry tile views" table:
  source 582, current-gen, missing only 2016; source 215, older-gen, covers 2016 but stops at 2024).
  Both live in `npmrds2`/dama — a DB the new stack already talks to, so **no new cross-DB
  dependency** is needed to drive the year selector.
- The mapeditor pattern already has a working "swap which view_id a layer points at" runtime
  mechanism: `MapEditor/components/MapViewerLegend.jsx:628-660`
  (`layer.viewGroupEnabled` + `filter-source-views`), including a purpose-built opt-out
  (`isLayerControlledByPlugin`, computed from `state.symbology.pluginData[*]['active-layers']`) for
  exactly the case of a plugin wanting to own view-switching itself instead of showing the generic
  dropdown. The swap itself is a plain `JSON.stringify(...).replaceAll(oldViewId, newViewId)` across
  the layer's `layers[]` and `sources[]` (`MapViewerLegend.jsx:645-659`) — no new
  `metadata.tiles` fetch needed, since only the `view_id` token changes inside an already-baked tile
  URL template. This same runtime dropdown is **not** present in the current `map` page-section type
  (confirmed via `map-component-unification.md` — explicitly deferred, "no current consumer") but
  that gap is irrelevant here since routecreation never runs inside a `map`/`map_dama` section.
  See `src/dms/skills/editing-map-symbologies.md` §5 ("Repoint a layer to a new view/source") for
  the general recipe this mechanism is a runtime instance of.

## Decisions made (2026-07-23, with user — see findings.md Part 6 for full rationale)

1. **Proxy, not direct client call.** New dms-server route wraps `routing2.availabs.org`, isolated
   behind a single swappable module/function (`resolveRoute(locations, year)`-shaped). User expects
   this to move onto a new in-house stack eventually — don't spread knowledge of the external
   contract beyond that one module, so swapping the backing implementation later is a one-function
   edit, not a scattered refactor.
2. **Year list sourced from the new stack's own NPMRDS metadata** (source 582/215 per-year views),
   not the old `conflation` schema — no new cross-DB dependency, and verified this range fully
   covers what the routing service can actually handle under `v0_6_0`.
3. **Version hardcoded** (`v0_6_0`) — stable across the whole investigated history, never
   user-facing in the old tool either.
4. **Selecting a year swaps the visible shapefile layer's `view_id` too**, not just the routing
   call's parameter — author always clicks against the same network they're auto-routing against.
   Implemented by porting the `MapViewerLegend.jsx` swap primitive into the plugin's own
   year-change handler (not the generic dropdown UI — the plugin needs custom "year" semantics on
   top, not a raw view picker).

## Proposed changes

### Phase 1 — dms-server: routing proxy (this repo, `src/dms/packages/dms-server`)

- New module (exact path TBD at implementation time, following existing `dms-server` route
  conventions), exporting one function `resolveRouteFromPoints(locations, year)`:
  - Hardcodes `version = "v0_6_0"`.
  - POSTs to `https://routing2.availabs.org/route?conflation_map_version=${year}_${version}&return_tmcs=1`,
    body `{ locations }`.
  - Returns the `ways` array (decide the `{err}`/empty-result contract at implementation time).
  - This is the **one and only** place that knows about `routing2.availabs.org` — a future
    in-house swap replaces only this function's body.
- Falcor or plain REST route exposing it to the client — **not yet decided**, see open questions
  below. A REST endpoint may fit better since this is a stateless computation passthrough, not DMS
  content (similar in spirit to `uda.colorDomain`, a computation endpoint rather than a content
  route).
- Auth requirement: the old tool's equivalent route (`routes2.get.route`) has **no** auth check,
  unlike its siblings (`routes2.save`/`delete`/`batch.upload`, which all throw without
  `this.user`). Follow dms-server's own existing convention for unauthenticated map-viewing-adjacent
  routes rather than assuming parity — confirm at implementation time.

### Phase 2 — routecreation plugin: marker mode (transportNY, `src/pages/TransportNYDataTypes/plugins/routecreation/`)

- New mode state (mutually exclusive with the existing tmc-clicks mode), mirroring the old tool's
  toggle (`RouteCreationLayer.jsx:63-87`, transportNY `src/sites/npmrds/pages/route_creation/components/`).
- Marker interactions to port (reference line numbers from the old tool — see
  `research/route-creation/findings.md` Part 2 for the full annotated read):
  - Click bare map → drop draggable waypoint marker (`addMarker`, `RouteCreationLayer.jsx:304-333`).
  - ≥2 markers → call the new dms-server proxy route (replacing the old tool's direct
    `routes2.get.route` falcor call) to resolve the TMC sequence.
  - Drag an existing marker → recompute.
  - Gradient coloring by sequence position, green→yellow→red
    (`RouteCreationLayer.jsx:29,213,307-308,346-347`).
- Save/load: `points` becomes the persisted geometry when in marker mode (mutually exclusive with
  `tmc_array`, matching the old tool's save contract). `SaveRouteModal`/`addItem`/the load-for-edit
  `useEffect` in `comp.jsx` need a `points` branch alongside the existing `tmc_array` one.

### Phase 3 — routecreation plugin: year selector (transportNY, same plugin)

- New plugin state: selected year (default: latest available, mirroring the old tool's own
  `YEARS[0]` convention).
- On year change:
  1. Resolve the year's `view_id` from source 582 (falling back to 215 for years 582 lacks, i.e.
     2016) — **not yet decided**: hardcode a lookup table (mirrors Decision 3's reasoning, simplest,
     matches `npmrds-data-sources.md`'s existing table) vs. a live UDA query against `npmrds2`
     (`data_manager.views WHERE source_id IN (582,215)`). Lean hardcoded, but flag for confirmation
     since new years get published periodically and a hardcoded table needs manual upkeep.
  2. Swap the shapefile layer's `view_id`/`sources[]`/sub-layer `source`/`source-layer`, porting
     `MapViewerLegend.jsx:645-659`'s swap logic into the plugin's own handler — not the generic
     dropdown, since the plugin renders its own year `<select>` (Decision 4's "custom semantics").
  3. Pass the same year into the Phase 1 proxy call.

## Files likely touched

**This repo** (`dms-template`, submodule `src/dms`):
- New: a routing-proxy module + route registration under `src/dms/packages/dms-server/src/...`
  (exact path at implementation time).

**transportNY** (separate repo, not tracked here):
- `src/pages/TransportNYDataTypes/plugins/routecreation/routecreation.plugin.jsx`
- `src/pages/TransportNYDataTypes/plugins/routecreation/comp.jsx`
- `src/pages/TransportNYDataTypes/plugins/routecreation/hooks/useMapTmcHandler.js` (or a new
  sibling hook for marker mode — TBD)
- `src/pages/TransportNYDataTypes/plugins/routecreation/dataUpdate.jsx`
- `src/pages/TransportNYDataTypes/plugins/routecreation/components/SaveRouteModal.jsx`
- `src/pages/TransportNYDataTypes/plugins/routecreation/constants.js`
- Reference only, do not modify: `src/sites/npmrds/pages/route_creation/components/RouteCreationLayer.jsx`
  (old tool, same transportNY repo)

## Testing checklist

- [ ] Phase 1 proxy: manual call reproduces the same `ways` result as a direct call to
      `routing2.availabs.org` for a known real route (reuse the 268046/2022 verification from
      findings.md Part 5).
- [ ] Phase 2: drop ≥2 markers, confirm a TMC path is resolved and rendered; drag a marker, confirm
      recompute; save, reload the route, confirm markers restore.
- [ ] Phase 3: change year, confirm the visible shapefile layer's rendered network changes
      (spot-check a road segment known to differ between two years, if one can be identified) and
      confirm the routing call is using the newly-selected year (network tab / proxy log).
- [ ] Mode toggle: switching between tmc-clicks and markers clears the other mode's in-progress
      state, matching old-tool behavior (findings.md Part 2).
- [ ] No regression to the map-properties fix — clicking a TMC in tmc-clicks mode still resolves
      `properties.tmc` after a year swap.

## Open implementation-time decisions (not yet made — flag before/while building)

- REST vs Falcor for the Phase 1 proxy route.
- Exact auth requirement on the Phase 1 proxy route.
- **Resolved 2026-07-23**: year→view_id table for Phase 3 will be **live-queried** against
  `npmrds2`'s `data_manager.views WHERE source_id IN (582,215)`, not hardcoded — user's explicit
  decision, overriding the earlier "leaning hardcoded" note. Not yet implemented (Phase 3 hasn't
  started).
- **Resolved 2026-07-23**: new sibling hook (`hooks/useMapMarkerHandler.js`) for marker mode,
  not an extension of `useMapTmcHandler.js`.

## Correction (2026-07-23): Decision 2's "year range fully covers routing service" claim is wrong

Decision 2 above (and the "Corrected/sharpened timing mechanism" section in findings.md) claimed
the routing service covers 2016-2026 with no gaps, based on a DB metadata table
(`conflation.conflation_map_osm_version`) having a row per year — that query never actually
called the live routing service. Directly testing `routing2.availabs.org` with real coordinates
found **only 2020-2022 actually resolve**; 2016, 2018, and 2023-2026 all returned `{"err":{}}`
for the identical points (one location tested, near Albany on I-90). **Phase 3's year list can't
be sourced straight from source-582/215's per-year metadata as planned — it needs to be filtered
to (or cross-checked against) years the routing service actually supports.** See findings.md's
corrected Part 6 section for the full test results. Not yet re-verified across multiple
locations — do that before finalizing Phase 3's year list design.

## Progress (2026-07-23) — Phase 2 started ahead of Phase 1

Per the umbrella plan's own reasoning (Phases 2-3 don't need the proxy to build/test, since
`routing2.availabs.org` is directly reachable), Phase 2's marker-mode UI was started in
transportNY **before** this repo's Phase 1 proxy exists, using a temporary direct client call
(isolated in `hooks/resolveRoute.js`, swappable to the proxy later per Decision 1). Core
mechanics (drop/drag/gradient/remove/clear/mode-toggle) are implemented and live-verified. Full
details, what's verified, and what's still open live in transportNY's own tracking doc:
`transportNY/planning/tasks/current/routecreation-marker-placement-autorouting.md`. This repo's
Phase 1 (the actual proxy route) has **not** been started — still the next real blocker before
Phase 2's temporary direct call can be retired.

## Related

- `transportNY/planning/tasks/current/routecreation-marker-placement-autorouting.md` — the local
  Phase 2-3 tracking doc in the repo where that code actually lives, plus its `maps`-topic todo.md
  entry there.
- Full investigative trail, evidence, and all research/design-decision provenance:
  `research/route-creation/findings.md` (dms-template repo root) — read before touching any of the
  above, it has the "why" behind every decision here.
- `src/dms/skills/editing-map-symbologies.md` — symbology data model, the "repoint a layer to a new
  view" recipe (§5) Phase 3 builds on.
- `src/dms/planning/research/map-stack-architecture.md` — background architecture for the
  mapeditor/map/map_dama split, relevant to understanding `MapViewerLegend.jsx`'s role.
