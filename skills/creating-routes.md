# Creating NPMRDS routes

Building the route(s) a report will reference. This is the prerequisite step for
[`creating-reports.md`](./creating-reports.md): a report spec references routes by
`route_id`, it doesn't create them.

> **Audience:** an engineer/AI (or a future skill/agent) doing this workflow for the
> first time.

**The CLI (`scripts/npmrds-reports/route_build.py`) is the primary path** — it writes
the exact same 7-key Routes Data row the map tool does, needs no browser at all, and is
Claude's path for turning a client request into routes. The map tool below is kept as
the human path (it still works, and is the only path for a person eyeballing a map),
documented as a second column, not the primary flow — same split as
`creating-reports.md`'s spec-first framing.

## The CLI path (primary)

```bash
# find: read-only TMC chain discovery, no writes
python3 scripts/npmrds-reports/route_build.py find --road 9D --county DUTCHESS
python3 scripts/npmrds-reports/route_build.py find --road 9D --direction NORTHBOUND \
    --from-intersection 'MAIN ST' --to-intersection 'I-84'

# build: validate a route spec, create the row(s), print a ready-to-paste routes[] fragment
python3 scripts/npmrds-reports/route_build.py build myroutes.json --dry-run
python3 scripts/npmrds-reports/route_build.py build myroutes.json
```

`find` prints candidate TMCs in true along-road order with a contiguity check, plus a
ready-to-paste `tmcs` array per direction — this is how you turn "9D through Beacon" or
a pair of named cross-streets into a concrete TMC chain without touching a map.
`--from-intersection`/`--to-intersection` slice the chain to an endpoint-to-endpoint
span; there's no "N segments around this one intersection" affordance yet (the request
shape is usually intersection-centric, not endpoint-to-endpoint — see the intake
checklist in `creating-reports.md`).

`build` takes a JSON file (one or more routes, e.g. one per direction):

```json
{ "routes": [
  { "name": "NY-9D Northbound (Main St/Beacon to I-84)",
    "tmcs": ["120+29712", "120+29713", "120+29714"] }
] }
```

`tmcs` order doesn't have to be correct — the build sorts to true along-road order
(`road_order`) and reports the reorder; that's strictly better than the map tool, which
stores click order. Validation is **three tiers**, deliberately so — deciding whether
two segments "actually touch" has no reliable cheap test (divided highways and
interchanges leave genuine metre-scale gaps a driver experiences as continuous, and
`road_order` numbering holes are not breaks):

- **hard error** (unambiguous data problems): a TMC doesn't exist, mixed directions in
  one route, empty `tmcs`/missing `name`, or a date field present — a route is a
  *geometry*, never a time window (dates belong on the report's route instance, not
  the route; see the rules below).
- **warning** (advisory, exit 0 — promote to hard error with `--strict`): endpoint gap
  > 150m, spans multiple road names/`tmclinear` values, a `road_order` hole, a
  duplicate name.
- `--verify-routing` — **experimental, currently does not work, do not use.** Intended
  as real map-matching via the routing service the plugin's `resolveRoute.js` calls,
  but it appears to ignore the request body entirely (returned a byte-identical,
  geographically wrong TMC list for two completely different waypoint arrays), and
  separately is vintage-bound (only 2020-2022 return TMCs) so even a working version
  would validate against the wrong TMC universe for a report querying a different
  year. Full detail in the script's own docstring — read that before touching this flag.

A route never carries dates — `build` hard-errors if the input JSON has one. Give each
route a clear, self-describing name (inherited by every report reference — RRL
instance or spec `routes[].name` — with no reliable per-instance rename, see the report
skill's known gaps).

## Prerequisite: none — the map tool now runs natively in dms-template

The route-creation map tool ("routecreation" plugin — TMC Click/Markers modes, TMC
Search, TMC List panel) used to exist only in the `transportNY` repo. As of 2026-07-29
it's been ported into dms-template proper, at
`src/themes/transportny/components/routecreation/`, registered through
`theme.mapPlugins` (see `src/dms/planning/tasks/completed/map-plugins-theme-registration.md`
for the registration mechanism and
`planning/transportny/tasks/completed/port-transportny-map-plugins.md` for the port itself). It runs
on dms-template's own dev server like any other themed component — no switching repos,
no separate dev server, nothing to sync back.

`transportNY` is no longer part of this workflow at all. It remains a separately
deployed production frontend for other reasons, but developing or testing routes/reports
features — including route creation — never requires touching it.

## The map tool path (human-driven, still works)

Written from a real worked example (NY-9D through Beacon, NY) so every step below has
been driven live through the UI, not inferred from code.

**Driving this through browser automation?** The map renders as a blank dark rectangle
until the tab gets a resize event — see
[`traversing-report-pages.md`](./traversing-report-pages.md#4-known-state-machine--url-gotchas-check-this-list-before-concluding-a-bug)
for the fix (two `resize_window` calls) before concluding the tool has no UI.

### Step 1 — Identify the real-world segments

Don't try to eyeball TMC segments on the map by pixel-clicking alone — it's slow and
error-prone (see "Known gaps" below). Instead:

1. Get the cross-streets/corridor bounds from the client ask (e.g., a map screenshot).
2. Query ClickHouse directly for the TMC chain:
   ```
   python3 scripts/npmrds-reports/dbq.py ch "select tmc, road, direction, intersection, miles,
     start_latitude, start_longitude, end_latitude, end_longitude
     from npmrds_raw_tmc_identification.s455_v3464_NPMRDS_TMC_Identification_V5_V6
     where road ilike '%9D%' and ... order by direction, ..."
   ```
   TMC codes are directional: `120+29713` (one direction), `120-29713` (the other).
   `intersection` names the cross-street reached at the **end** of the segment in the
   direction of travel — use this to chain segments into a continuous corridor.
3. Cross-check against Google Maps (intersection coordinates, driving directions) to
   confirm the chain is continuous and matches the client's described corridor.
4. Build **one chain per direction** if the report needs both (most corridor studies
   do) — TMC codes for northbound/southbound are different physical rows, not a single
   bidirectional segment.

This ground-truth-first approach replaces unreliable pixel-based map guessing and is
much faster once the TMC chain is known.

### Step 2 — Build the route(s) in the map tool

URL pattern: `http://www.localhost:5173/npmrds/edit/<some-page>` for a scratch page with a
map section in edit mode, or the dedicated route-creation demo page if one exists
(`/npmrds/edit/converted_reports/route_creation_demo` in this session). npmrds_sub moved off
the `npmrds` subdomain to this `www:/npmrds` path-mount 2026-09-02 — see
`traversing-dms-pages.md`'s subdomain gotcha if a page 404s or falls through to the wrong pattern.

- **TMC Click mode**: click directly on the map line for each TMC segment in the
  chain. Thin/divided-highway segments are hard to hit — use the `zoom` tool
  (image-inspection, not map zoom) to compute precise pixel coordinates before
  clicking, or ask the user to click for you (they can see the map too).
- **TMC Search box**: typing a full 9-char TMC code zooms to it, and an **Add** button
  next to the box (or pressing Enter) adds it directly to the route — same effect as
  clicking the segment on the map, no map interaction required. The button is disabled
  (with a "TMC not found" hint) until the typed code resolves to a real geometry, so a
  typo can't silently add a bogus TMC. Added 2026-07-27 specifically so an agent driving
  this tool doesn't need pixel-accurate map clicks. Previously-noted "unreliable for
  `-` codes" bug: attempted live repro 2026-07-27, could not reproduce (tried
  `120-29713` three different typing methods, replayed the exact backing falcor query
  directly — both client and server behaved correctly each time). Dropped per user
  decision rather than keep chasing it; see `report-route-ui-parity-gaps.md` gap 2 if it
  resurfaces with a more specific trigger.
- **Map scroll-zoom is disabled** (confirmed: before/after screenshots after a scroll
  action are pixel-identical). Use double-click zoom or the on-screen `+`/`-` buttons
  instead.
- Hovering a segment shows a popover with the **TMC code only** (no street name) — you
  may need to click, not just hover, depending on the build.

**Critical gotcha — `route_id` in the URL is load-bearing.** If the edit URL carries
`?route_id=<n>`, clicking Save **overwrites that existing route**, silently. This is
intentional tool behavior, not a bug — the URL param means "you are editing this
route." As of 2026-07-27 the UI makes this visible instead of silent: the panel's
Save button reads "Update Route" (not "Save Route"), and the save modal shows an
"Update Route" title plus a red "You are updating an existing route..." banner,
whenever `route_id` is present — still no confirmation dialog, just clear wording, so
don't rely on a prompt to save you. If you want to explore/test-click without risk, do
it from a fresh page load with **no** `route_id` param, and only navigate to an
existing route's URL when you actually intend to edit it.

Give each route a clear, self-describing name (e.g., `"NY-9D Northbound (I-84 to Main
St/Beekman, via Verplanck)"`) — this name is inherited by every report reference to
the route (RRL instance, or a spec `routes[].name`) and there's no reliable way to
override it per-instance later.

Once the route exists, note its `route_id` (query the catalog if needed — Routes Data
source `2107426` / view `2107427`) and hand it to
[`creating-reports.md`](./creating-reports.md).

## Known gaps found while driving this workflow live

See `planning/transportny/tasks/current/report-route-ui-parity-gaps.md` for the full ranked list
(shared with the report-building gaps) — the route-creation-specific ones are:

- Map scroll-zoom is disabled (workaround: double-click zoom, `+`/`-` buttons).
- Hover popovers show TMC code only, no street name; sometimes a click is needed
  instead of hover.
- `route_id` in the map-tool URL means "editing this route" — reusing an existing
  route's URL as a scratch pad silently overwrites it on Save (now clearly labeled in
  the UI as of 2026-07-27, see above — still no confirmation dialog).

## History: this used to require transportNY

Until 2026-07-29, the map tool existed only in the `transportNY` repo and this workflow
required switching to its dev server for Step 2, then coming back — with a whole
separate cross-repo sync discipline (`research/npmrds-reports/reportroutelist-cross-repo-sync.md`)
for keeping theme components in parity between the two repos. That's no longer the case
for route creation: the plugin is now native to dms-template. The sync doc above is kept
for historical context and because a couple of other components (`RouteComparison`) still
live transportNY-only, but nothing in this file requires it anymore.
