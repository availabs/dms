# Creating NPMRDS routes (route-creation map tool)

Building the route(s) a report will reference — TMC-chain identification plus the
route-creation map tool. This is the prerequisite step for
[`creating-reports.md`](./creating-reports.md): a report spec references routes by
`route_id`, it doesn't create them.

> **Audience:** an engineer/AI (or a future skill/agent) doing this workflow for the
> first time. Written from a real worked example (NY-9D through Beacon, NY) so every
> step below has been driven live through the UI, not inferred from code.

## Prerequisite: route creation only exists in transportNY

The route-creation map tool ("routecreation" plugin — TMC Click/Markers modes, TMC
Search, TMC List panel) lives **only** in the `transportNY` repo
(`/home/ryan/code/transportNY`), not in `dms-template`. If you're working in
dms-template and need new routes, you must switch to transportNY's dev server for this
step, then come back (routes are DMS rows, visible from either app once created,
provided both apps point at the same DMS site/app). See "Cross-repo note" at the
bottom before you do — transportNY pins an older, manually-synced copy of the theme and
the `@availabs/dms` submodule.

**This is the one and only reason to ever touch transportNY.** Everything else in this
workflow — report pages, Measure Picker, RRL — is dms-template work; don't develop it in
transportNY even if the dev server is already open there.

## Step 1 — Identify the real-world segments

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

## Step 2 — Build the route(s) in the map tool (transportNY only)

URL pattern: `http://npmrds.localhost:5173/edit/<some-page>` for a scratch page with a
map section in edit mode, or the dedicated route-creation demo page if one exists
(`/edit/converted_reports/route_creation_demo` in this session).

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

See `planning/tasks/current/report-route-ui-parity-gaps.md` for the full ranked list
(shared with the report-building gaps) — the route-creation-specific ones are:

- Map scroll-zoom is disabled (workaround: double-click zoom, `+`/`-` buttons).
- Hover popovers show TMC code only, no street name; sometimes a click is needed
  instead of hover.
- `route_id` in the map-tool URL means "editing this route" — reusing an existing
  route's URL as a scratch pad silently overwrites it on Save (now clearly labeled in
  the UI as of 2026-07-27, see above — still no confirmation dialog).

## Cross-repo note

transportNY keeps its **own separate copy** of both the `@availabs/dms` library
submodule and the `transportny` theme — pinned to a different, manually-synced commit
than dms-template's. Newer dms-template features do not automatically exist there.
See `research/npmrds-reports/reportroutelist-cross-repo-sync.md` for the sync process
and gotchas (submodule import path rewrite, etc.), and re-run a `diff -rq` before
trusting any claim about current parity — there is no auto-sync, so it drifts again
the moment either side is edited.
