# Falcor/UDA query cache collision across sibling sections sharing query state

## Status: FIXED (2026-07-08) — live-verified on report 1071; see "Fix" section below

## Fix (2026-07-08)

**Root cause, pinned down**: the Falcor path for a UDA request is built purely from `options`
(filter/groupBy/join/orderBy JSON, via `createRequest.js`'s `'uda'` case) plus the attributes array
and index range — nothing in that path ties a request back to *which section on the page* issued
it. Two sibling sections whose filter/groupBy/join happen to match (different attributes, same
filter — Manifestation 1; or a byte-identical query — Manifestation 2) compute the same Falcor
cache key and collide. Server-side query building was independently confirmed correct both times
(round 6/7 network captures showed the server returning correct, distinct data per request) — this
is a client-side cache-key problem, not a SQL/ClickHouse-fan-out problem. (The round-2 ClickHouse
GROUP BY projection fix was real but only covered one narrow fan-out symptom, not the general
cache-key collision.)

**Fix**: `getData()` (`packages/dms/src/patterns/page/components/sections/components/dataWrapper/getData.js`)
now takes an optional `sectionId` and folds `trackingId || sectionId` into the `options` object
*before* it's `JSON.stringify()`'d into the Falcor path — for the main data fetch, the length fetch
(`getLength`'s `optionsForLen`, which already strips `orderBy`/`meta` but inherits everything else),
and the total-row fetch. This mirrors an existing precedent in the same file
(`options.keepOriginalValues = keepOriginalValues`, a client-only flag folded into `options` and
never read server-side) and the existing `selfParamKey(trackingId || sectionId)` idiom in
`buildUdaConfig.js`. Confirmed safe: every server query_set (`clickhouse.js`, `postgres.js`)
destructures only known fields out of `JSON.parse(options)` — an unrecognized extra key is silently
ignored, so this only changes the cache key, never the SQL.

`sectionId`/`trackingId` were already flowing through `dataWrapper/index.jsx` (via
`usePageFilterSync`) from `section.jsx`/`SectionView` (`value?.id`/`value?.trackingId`) — just not
into `useDataLoader`/`getData`. Threaded through:
- `useDataLoader.js` (both the main load effect and `onPageChange`)
- `useColumnOptions.js` and `usePivotDistinctValues.js` (same collision precondition — two columns/
  sections with matching `mapped_options` or pivot config could hit the same bug)
- `api/preloadSectionData.js` (server/router-loader preload path, concurrent `Promise.all` over
  sibling sections — same shared-cache mechanism, same risk)
- `index.jsx`'s Edit/View call sites for all of the above

**Trade-off, accepted deliberately**: two sections with a genuinely byte-identical query no longer
coalesce into one shared Falcor fetch — each now gets its own. Given that "sharing" was the thing
silently returning empty data for both, correctness wins over the minor duplicated-query cost
(only matters in the rare byte-identical case, e.g. 751's `overrides.baseSpeed` situation below).

**Verified**:
- Unit: `packages/dms/tests/getData.sectionCacheKey.test.js` (new) — two calls with identical
  filter/groupBy/attributes but different `sectionId` produce different `options` strings (both
  main and length fetch); same `sectionId` reproduces the identical string (caching still works);
  omitting `sectionId` leaves `options` unchanged (no regression); `sectionId` never leaks into the
  requested attributes list. Full `packages/dms` suite green (187/187, +5, no regressions).
  `dms-server`'s `test:uda` also green (70/70) — confirms the extra `options` field is inert
  server-side, as expected.
- Live, Playwright against the local dev stack, **Manifestation 1 (report 1071) — confirmed fully
  fixed**: "Speed AM Peak By Day"/"Travel Time AM Peak By Day" and the PM Peak pair (same
  route+filter, different attribute — previously both rendered completely blank) now both render
  real, distinct bar graphs with real legends and real (different) values. Zero console errors.
  Confirmed via network capture that each sibling's Falcor `options` string now carries a distinct
  `sectionId` and the two no longer share a cache path.
- Live, **Manifestation 2 (report 751) — the Falcor collision itself is fixed, but a second,
  previously-masked bug surfaced**: the two truck CO₂ sections ("CO2 Trucks Actual"/"CO2 Trucks 50
  MPH") now issue genuinely separate requests (distinct `sectionId` confirmed in both the request
  and the response's cache key) and the server returns a full, distinct response to each — but
  **both truck responses have `avg_co2_emissions_avg = NULL` for all 289 rows**, while the sibling
  passenger CO₂ section (same report, same shape) correctly resolves 220/289 non-null values. This
  is NOT the Falcor collision (that mechanism is provably no longer in play — separate requests,
  separate responses) — it's a distinct, pre-existing bug in the truck CO₂ SQL expression's
  `coalesce(ds.travel_time_freight_trucks, ds.travel_time_all_vehicles)` (passenger's parallel
  `coalesce(ds.travel_time_passenger_vehicles, ds.travel_time_all_vehicles)` works, so either
  `travel_time_freight_trucks` isn't the real column name on this view or it's null for a
  different reason). Previously indistinguishable from the Falcor collision because both bugs
  produce the same "silently blank, no error" symptom. **Not fixed here — logged as a new,
  separate follow-up** in `old-reports-conversion.md`; out of scope for this task (SQL/column
  correctness, not caching).

**Files changed**: `packages/dms/src/patterns/page/components/sections/components/dataWrapper/
getData.js`, `useDataLoader.js`, `useColumnOptions.js`, `usePivotDistinctValues.js`, `index.jsx`;
`packages/dms/src/api/preloadSectionData.js`; `packages/dms/tests/getData.sectionCacheKey.test.js`
(new).

## Original investigation (rounds 2, 5, 6 — kept for context)

## Status (superseded): OPEN, not yet root-caused — non-blocking, tracked as a gap where hit

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

- [x] Root-cause the collision (client-side Falcor cache key, not the ClickHouse fan-out — see
      "Fix" section at the top).
- [x] ~~Postgres parity fix for manifestation 1 (`postgres.js` GROUP BY projection)~~ — superseded:
      the `sectionId` cache-key fix is backend-agnostic, so the Postgres-specific parity fix is no
      longer needed for this bug (Postgres may still independently want the GROUP BY projection fix
      for other reasons, but not to close this task).
- [x] Regression test(s) covering the fix — `getData.sectionCacheKey.test.js`.
- [x] Live verification: report 1071's two previously-blank sibling pairs (Manifestation 1) both
      render correctly.
- [ ] New follow-up (not this task): root-cause report 751's truck CO₂ formula returning NULL for
      all rows — see "Fix" section above and the new gap logged in `old-reports-conversion.md`.

## Cross-links

- `planning/tasks/current/old-reports-conversion.md` — round 2 (manifestation 1) and round 5
  (manifestation 2) notes, including live-incident context.
- `planning/tasks/completed/dataWrapper-stale-fetch-race.md` — a related-but-distinct bug (response
  *ordering*, not cache *collision*) in the same `useDataLoader.js`/`getData.js` machinery.
- `planning/tasks/current/comparison-series-query-fanout.md` — the general fan-out engine that
  manifestation 1's symptom occurs inside (UNION ALL arms), though the bug itself is about
  attribute projection, not the fan-out design.
