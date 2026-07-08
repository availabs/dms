# Falcor/UDA query cache collision across sibling sections sharing query state

## Status: OPEN, not yet root-caused — non-blocking, tracked as a gap where hit

## Objective

Two (or more) `AVL Graph` / dataWrapper sections on the same page that build the same or
overlapping UDA query state can silently fail to render, because the Falcor client caches by
the request path (the array of path segments — the "route" — passed as the query), and sibling
sections issuing the same or related paths collide. This has now bitten twice, in two different
shapes. Neither manifestation has an official task/bug file — both were previously left as inline
notes in `planning/tasks/current/old-reports-conversion.md`. This file consolidates them and
tracks the still-open follow-up work.

## Manifestation 1 (round 2, 2026-07-07 — old-reports-conversion)

Two BarGraph sections over the **same routes**, differing only in **measure** (e.g. speed vs.
travel-time bars of the same comp) share an identical UDA `options` string but request **different
attributes**. Falcor's cache-dedup collapsed the attribute set down to whatever the first request
asked for; the second section's distinct measure column never got requested. Symptom: the
cross-union `ORDER BY date` then referenced an unprojected column → ClickHouse error `"Unknown
expression identifier 'date'"`, blank graphs.

**Fixed for ClickHouse only**: `dms-server/src/routes/uda/query_sets/clickhouse.js`'s fan-out now
projects arm `GROUP BY` columns even when the request's attribute list omits them (already shipped,
part of the round-2 work).

**Still open**: `postgres.js` has the same latent fan-out flaw — parity fix + verification was
flagged in the round-2 notes as "an open follow-up" but never implemented or tracked as its own
item until now.

## Manifestation 2 (round 5, 2026-07-08 — old-reports-conversion, report 751)

Two GridGraph sections with a **byte-for-byte identical** query (same join, same filterGroups,
same groupBy, same seriesVariants, AND the same calculated color-column expression — happened
because two old route comps shared the same graph type/resolution/dataColumn and only differed in
an `overrides.baseSpeed` field the converter doesn't implement) both rendered **completely empty**
— no data, no console error, no server error. A third sibling section with a *different*
calculated column (different attribute, same everything else) rendered correctly with real data.

This is the **inverse** of manifestation 1's trigger condition — manifestation 1 failed when
attributes *differed* under shared options; manifestation 2 failed when the *entire* query
(including attributes) was identical. They may share a root cause (Falcor's path-based request
cache/coalescing) or may be two distinct bugs that happen to look similar. **Not yet root-caused**
— a code-reading investigation (avl-falcor's request coalescing, `useDataLoader.js`'s
`requestIdRef` staleness guard, GraphComponent's cache-subscription lifecycle) was started but not
completed before this file was written; pick up the investigation here rather than re-discovering
the symptom from scratch.

**Investigation starting points** (not yet conclusive):
- `node_modules/@availabs/avl-falcor` — how it batches/dedupes concurrent requests for an
  identical path, and how a coalesced response gets fanned back out to multiple callers.
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js`'s
  `requestIdRef` (from the `dataWrapper-stale-fetch-race` fix) — confirm it's genuinely
  per-component-instance (a `useRef` inside a hook called once per mounted section) and not
  accidentally shared/global across sibling sections.
- `src/dms/packages/dms/src/ui/components/graph_new/` — how `GraphComponent` keys/subscribes to
  Falcor cache updates; whether two sections with identical query state end up reading the same
  cache node but neither actually triggers (or receives) the real fetch.

## Manifestation 1 re-confirmed, round-2 "fix" is narrower than it looked (2026-07-08, report 1071)

Re-running report 1071 (round 6, live-verifying the color_range/graph_layout fixes) surfaced this
again on plain **single-series** BarGraph pairs — no comparison-series fan-out/UNION involved at
all. "Speed AM Peak By Day" and "Travel Time AM Peak By Day" (same route, same filters/groupBy,
differ only in the projected calculated column — `speed_avg` vs `ds_travel_time_all_vehicles_avg`)
share a byte-for-byte identical `uda.npmrds2.viewsById.982.options.<KEY>` Falcor path; same for the
PM Peak pair. Captured both requests' actual HTTP responses directly (bypassing the browser
console): the **server** returned correct, different, non-empty data for each of the two requests
individually — real `speed_avg`/`travel_time_avg` values, no ClickHouse error, no ORDER BY issue.
Both graphs still rendered **completely blank** in the browser (no legend, no bars, no console
error). This means the round-2 "fixed for ClickHouse only" note is misleading: that fix addressed
one specific *symptom* (fan-out `ORDER BY` on an unprojected GROUP BY column, which only occurs
with multiple `seriesVariants`/a UNION). This new instance has exactly one `seriesVariants` entry
per request — no fan-out, no union, no ORDER BY-across-arms — yet the same collision shape (same
options-string key, different requested attribute) still causes both siblings to fail client-side.
**Conclusion**: the real root cause is client-side (Falcor path-cache keyed on the options string,
not on the requested attributes), independent of the ClickHouse fan-out code entirely. The
`postgres.js`-parity framing in "Still open" below undersells the scope — this needs the
client-side investigation (see "Investigation starting points") regardless of backend.
**Not fixed** — logged as a gap for report 1071 (per the same non-blocking precedent set on 751)
and left for this task, not re-litigated inline in the conversion script.

## Impact / when it bites

Any two dataWrapper sections on the same page whose query-affecting state matches closely enough
to produce the same (or a colliding) Falcor path. Concretely seen so far:
- Same routes + different measure (manifestation 1, BarGraph).
- Identical query end-to-end, including calculated columns (manifestation 2, GridGraph) — a
  natural consequence of converting two old route comps that only differ in a
  not-yet-implemented setting (e.g. `overrides.baseSpeed`), since the converter currently has no
  way to make their queries diverge.

## Current gap-logged occurrence

Report **751** ("Van Wyck CO2 Test Single TMC"), sections "CO2 Trucks Actual" (comp-2) and "CO2
Trucks 50 MPH" (comp-3) — both render empty due to manifestation 2. Non-blocking: the CO₂
calculated-column mechanism itself is proven correct (the third sibling section, "CO2 50 MPH" /
comp-1, renders a real heatmap with real data), so this is a rendering/caching gap on top of a
working calculated column, not a defect in the column itself.

## Files potentially involved (not yet confirmed as the fix location)

- `packages/dms-server/src/routes/uda/query_sets/postgres.js` — manifestation 1 parity fix
  (mirror the ClickHouse GROUP BY projection fix already shipped there).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js`,
  `getData.js` — manifestation 2 candidate location.
- `packages/dms/src/ui/components/graph_new/` (GraphComponent + cache subscription) —
  manifestation 2 candidate location.
- `node_modules/@availabs/avl-falcor` — external package; if the root cause lives here, a fix
  requires changes outside this repo (same constraint hit by the stale-fetch-race investigation's
  "true cancellation" follow-up).

## Testing checklist

- [ ] Root-cause manifestation 2 (why do BOTH identical-query sections fail, rather than both
      succeeding off a shared cached response, or one succeeding twice).
- [ ] Postgres parity fix for manifestation 1 (`postgres.js` GROUP BY projection, mirroring
      `clickhouse.js`).
- [ ] Regression test(s) covering both manifestations once fixed.
- [ ] Live verification: two sibling AVL Graph sections with identical query state both render
      correctly.

## Cross-links

- `planning/tasks/current/old-reports-conversion.md` — round 2 (manifestation 1) and round 5
  (manifestation 2) notes, including live-incident context.
- `planning/tasks/completed/dataWrapper-stale-fetch-race.md` — a related-but-distinct bug (response
  *ordering*, not cache *collision*) in the same `useDataLoader.js`/`getData.js` machinery.
- `planning/tasks/current/comparison-series-query-fanout.md` — the general fan-out engine that
  manifestation 1's symptom occurs inside (UNION ALL arms), though the bug itself is about
  attribute projection, not the fan-out design.
