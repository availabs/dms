# ClickHouse unfiltered probe queries — no server-side cap, run indefinitely

## Status: DONE for Option B (2026-07-08, live-verified) — Option A (server-side caps) explicitly deferred, not abandoned

Implemented and live-verified the preventive client-side fix (Option B below): extended
`buildUdaConfig.js`'s `skipFetch` guard to also cover a comparison-series section with no
base-filter fallback. User explicitly chose "B only" this round; Option A (real
`max_execution_time`/`max_memory_usage` caps on the CH adapter) is still valuable
defense-in-depth for *other* future runaway-query bugs and should be picked up separately
if this class of issue resurfaces.

**Correction (same session):** the first implementation attempt targeted the wrong signal
(`comparisonSeries.config === undefined`, a pre-effect race) and did NOT fix the live bug —
confirmed by reproducing report_1070 in a headless browser and capturing raw `/graph`
traffic. The actual live failure mode is different: a persisted `comparisonSeries.config`
(real variants, saved from a prior edit session) gets overwritten to `[]` by
`usePageFilterSync`'s live-resolve effect on mount (no page-session publish yet for this
section's `$self`-keyed param) — `config` is well past "undefined," it resolves cleanly,
just to empty. Since this Graph's base `filters` tree is *also* empty (comparison-series
variants are its only scoping mechanism), "resolved but inactive" collapses to "fully
unscoped query against the multi-billion-row NPMRDS table" — captured live as a `length`
call with `filterGroups: {groups: []}` and no `seriesKey`/`seriesVariants`, still pending
after 6+ seconds. See "How it was implemented" under Option B for the corrected condition
and how it was verified. **Lesson for next time:** reproduce and capture the actual network
traffic before trusting a plausible-sounding pre-existing signal (`config === undefined`) —
the real defect was one step removed from where the original hazard doc's analysis pointed.

## New confirmed trigger (2026-07-10, old-reports-conversion round 33) — a DIFFERENT mechanism from the one fixed above, not a regression

Found live on two published `old-reports-conversion` pages (`report_1032`, `report_392`), root-caused
with certainty via a real captured failing request (not inferred). **Distinct from the
`hasUnscopedComparisonSeries`/empty-filter-TREE case fixed above** — this is a filter LEAF that
exists (a real `{op:"filter", col:"tmc", value:[]}` node) but whose value array is empty.

- **Mechanism**: `buildUdaConfig.js:186-198` intentionally DROPS a `filter`/`exclude` node entirely
  when its cleaned value array ends up empty, rather than compiling it to `col IN ()` — correct and
  deliberate for its intended case (an unset `usePageFilters` region control should widen to "show
  everything," not "show nothing"). But this same code path fires for ANY empty-valued filter leaf,
  regardless of source — including a converter-generated route with no resolvable `tmc_array`.
- **Why it's only a crash on SOME templates, not all**: the dropped TMC filter only becomes
  catastrophic on a template whose `groupBy` includes the real `tmc` column (e.g.
  `old-reports-conversion`'s "Hours of Delay Graph" shape, `groupBy: ["ds.epoch","ds.tmc"]`) — TMC
  cardinality is unbounded (not capped like `epoch`'s 288), so `count(DISTINCT epoch,tmc)` over an
  unfiltered-by-TMC table can be millions of rows. Templates that only group by `__series` (every
  other template in that task) are still unfiltered/wasteful but bounded, since `tmc` never enters
  `groupBy` at all.
- **Real captured evidence**: a `dataByIndex` request with `{"from":0,"to":4407473}` × 3 attributes
  ≈ 13.2M requested falcor paths — tripped `falcor-router`'s `MAX_PATHS=9000` cap
  (`MaxPathsExceededError`) before ever reaching ClickHouse. `4407473/288 ≈ 15,303` — roughly the
  TMC count for the whole NPMRDS TMC-identification table, confirming a nationwide, unfiltered-by-
  TMC scan for what should have been one route's data.
- **Fix applied at the source** (`scripts/convert_old_reports.py`'s `build_route_entry`): a route
  with no resolvable TMC array now gets `graphIds: []` unconditionally — it's never wired into any
  graph's comparison-series fan-out, so this specific empty-filter-leaf path can't be reached via
  the converter anymore. This is a point fix in the converter, not a platform-level fix — the
  underlying `buildUdaConfig.js` widening behavior is untouched (it's correct for its real use
  case) and could in principle still be reached by some other future path that produces a
  real-but-empty filter leaf on a `tmc`-grouped (or any high-cardinality-grouped) template.
- **Full writeup**: `src/dms/planning/tasks/current/old-reports-conversion.md`, "Round 33."
- **Not done**: no platform-level guard was added for empty-valued filter leaves on
  high-cardinality-`groupBy` templates in general — only the one converter-side reachability path
  was closed. If this resurfaces via a different path (author-built filter, different converter,
  etc.), the same class of fix (or a platform-level `col IN () `→ correctly-matches-nothing compile,
  scoped to NOT affect the legitimate unset-page-filter-widening case) would need real design work.

## Objective

Stop stray unfiltered ClickHouse queries (fired by a known client-side race, see below) from
being able to run for hours and pile up on the shared dev ClickHouse server. This has gone from
"known, accepted, occasional annoyance" to "actively disruptive" — during a single ~1.5 hour
session on 2026-07-08 it required **four separate check-and-kill cycles** (roughly 10 stray
queries per report-page load), on top of an earlier same-day incident that piled up 40. The user
now wants this actually fixed rather than managed by hand.

## Background — read these first, don't re-derive

1. `planning/tasks/completed/dataWrapper-stale-fetch-race.md` — the original bug + partial fix
   (2026-07-01). **This is the root cause.** Read it in full before touching anything here.
2. `documentation/npmrds-data-sources.md`'s "Known operational hazard" section — the
   downstream-consequence writeup (2026-07-08), incident history, safe check/kill SQL.
3. `packages/dms-server/CLAUDE.md`'s "Known hazard" note under "ClickHouse auxiliary storage".
4. Memory (if available to you): `project_npmrds_unfiltered_ch_query_risk`,
   `feedback_ch_unfiltered_query_awareness` — condensed versions of the above, plus the
   instruction to check `system.processes` **proactively/periodically**, not just when a page
   hangs.

## Root cause (already fully diagnosed, do not re-investigate)

Any `dataWrapper`-based section (Graph, Spreadsheet, Card) with a comparison-series subscriber
(e.g. `ReportRouteList`-bound AVL Graph) can fire its **first** data/length request before
`state.comparisonSeries.config`/`state.filters` resolve from "unresolved" to their real value —
this correction happens in a `useEffect` in `usePageFilterSync.js` that only runs *after* first
render. Before it lands, `buildUdaConfig.js`'s `activeComparisonSeries` check (~line 1084) treats
the comparison series as inactive, so the first request has **zero route scoping** — a full
unfiltered join across whatever table the section is bound to.

Against a small table this is harmless noise. Against the NPMRDS fact table
(`s583_v982_NPMRDS_V6`, multi-billion rows) it's a full-table unfiltered join.

**The 2026-07-01 fix (`useDataLoader.js`'s `requestIdRef` generation counter) does not prevent
this query from being sent** — it only stops the stale unfiltered *response* from overwriting a
later correctly-scoped one once both resolve. The query itself still fires and still runs to
completion (or until killed) regardless.

**Compounding factor, no cap on the query itself**: `dms-server/src/db/adapters/clickhouse.js`'s
`ClickHouseAdapter` sets `max_execution_time: 0` and `max_memory_usage: 0` on every query — i.e.
**no server-side limit at all**. This is what turns "one wasted query" into "a query that can run
for over an hour, reading tens of billions of rows, with no error." This cap (or lack of it)
applies to literally every ClickHouse query dms-server issues, not just the stray probes.

**New observation this session (2026-07-08, not previously documented)**: the unfiltered probe
isn't limited to the `simpleFilterLength` COUNT(*) shape described in the existing docs — it also
fires as a real, unfiltered **data** query. Captured example:
```sql
SELECT avg(((table1.miles * 3600)/ ds.travel_time_all_vehicles)) as speed_avg, ds.date
FROM npmrds.s583_v982_NPMRDS_V6 as ds left JOIN npmrds_raw_tmc_identification.s455_v3464_NPMRDS_TMC_Identification_V5_V6 as table1 ON ds.tmc = table1.tmc
GROUP BY ds.date
ORDER BY ds.date asc
LIMIT 3469 OFFSET 0
```
No `WHERE`/filter clause at all — same root cause, different UDA query-set entry point
(`simpleFilter`/`dataById`, not just `simpleFilterLength`). Any fix needs to cover both shapes —
don't assume gating only `simpleFilterLength` is sufficient.

**Rate observed this session**: roughly **9-10 stray queries per single report-page load** (a
report with N comparison-series-bound AVL Graph sections fires roughly one stray probe per
section). This is not a rare edge case — it fires on every single load of any report built on the
`ReportRouteList` + AVL Graph pattern (i.e. every page this session's old-reports-conversion work
produces).

## Why the obvious preventive fix hasn't been done

A preventive client-side fix was proposed in the original race task (extend the
`hasUnresolvedRequiredLeaf`/`requireResolved` gating already used for plain filter leaves,
`buildUdaConfig.js:411-429`, to also cover an unresolved comparison-series subscriber — so the
fetch simply doesn't fire until scoping is ready) and **explicitly declined by the user** at the
time, who chose to scope that task down to just the correctness fix. That decision is being
revisited now given how disruptive the hazard has become — **not** a mandate to build that exact
fix; evaluate the options below fresh.

## Candidate fixes (not yet implemented — pick one or combine)

### A. Server-side query caps (recommended starting point — lowest risk, defense in depth)

Set real, non-zero `max_execution_time` / `max_memory_usage` on the ClickHouseAdapter
(`packages/dms-server/src/db/adapters/clickhouse.js`) instead of `0`/`0`. This bounds **any**
runaway query (not just this specific race — any future bug with the same shape) to a sane
worst case instead of "can run for over an hour." Doesn't touch the tricky client-side race code
at all. Needs a real number chosen deliberately: too low and it kills legitimate large aggregate
queries against this same fact table; too high and it doesn't help. Worth checking whether
ClickHouse can apply a *different* cap for probe-shaped queries specifically (e.g. via query
settings passed per-request) vs. a blanket adapter-wide default — investigate before assuming a
single global number is right.

### B. Client-side preventive gating (the previously-declined fix — addresses root cause) — IMPLEMENTED + LIVE-VERIFIED 2026-07-08

Extended `buildUdaConfig.js`'s `skipFetch` guard so a comparison-series section with no base
filter to fall back on skips the fetch entirely whenever the comparison-series fan-out isn't
active. Stops the wasted query from ever being sent, not just from being able to run unbounded.
Covers the `simpleFilter`/`dataById` entry point as well as `simpleFilterLength`, for free —
see below.

**First attempt was wrong — corrected after live reproduction.** The initial implementation
gated on `comparisonSeries.config === undefined` (a pre-effect mount race, mirroring
`hasUnresolvedRequiredLeaf`'s "leaf hasn't received its value yet" shape). Reproduced
report_1070 in a headless Playwright browser against the local dev stack and captured raw
`/graph` traffic — the fix did **not** stop the bad request. Root cause turned out to be one
step removed from that: this section's `comparisonSeries.config` was **not** undefined at
mount — it was a persisted, non-empty array of real variants (saved from a prior edit
session). `usePageFilterSync`'s live-resolve effect runs on mount regardless, finds no
page-session value published for this section's `$self`-keyed param yet, and legitimately
resolves `config` to `[]` (existing, correct behavior — see "dynamic unresolved: config:[]
reads as inactive" test). The problem is that *this specific section's* base `filters` tree is
also `{"op":"AND","groups":[]}` — comparison-series variants are its *only* scoping mechanism.
So "resolved but inactive" collapses straight to "zero constraints at all." Captured live: a
`length` call against `uda.npmrds2.viewsById.982` with `filterGroups: {groups: []}` and no
`seriesKey`/`seriesVariants`, `status: undefined` (still pending) after 6+ seconds — the exact
hazard shape, just triggered by "resolved-empty," not "unresolved."

**How it was actually implemented (corrected):**

- The condition is now: `comparisonSeries?.enabled === true && !activeComparisonSeries &&
  !hasAnyFilterLeaf(filters)` — skip whenever the comparison-series master toggle is on, the
  fan-out isn't currently active (for *any* reason — pre-effect race, resolved-to-`[]`, or a
  stale persisted list the live page state no longer backs), **and** there's no independent
  base filter leaf to fall back on. `hasAnyFilterLeaf` is a small local recursive check (mirrors
  `isGroup`'s tree-walk) — `true` if the tree has any leaf at all, `false` for `{groups: []}`.
- Deliberately does **not** trigger when a real base filter leaf exists — e.g. a section that
  has its own `tmc IN (...)` filter AND an optional, currently-inactive comparison overlay: that
  fetch has a real WHERE constraint regardless of the overlay, so it's left alone (matches the
  pre-existing "dynamic unresolved: config:[] reads as inactive" test's assumption — base data,
  no fan-out — which is still correct when a base filter exists).
- No longer needs `display`/subscriber/`paramKey` inspection at all — simpler than the first
  attempt, and doesn't care *why* the fan-out is inactive, only whether the resulting query
  would have zero constraints.
- Since `getData.js:237` already bails out with `{ length: 0, data: [], outputSourceInfo }`
  *before* calling `apiLoad` when `skipFetch` is true, this gate sits upstream of every UDA
  entry point (`simpleFilterLength`, `simpleFilter`, `dataById`).

**Live verification (2026-07-08):** Reproduced report_1070 twice (initial load + reload) via a
headless Playwright script against the local dev stack (`npmrds.localhost:5173`, local
dms-server on `:3001`, real `npmrds2`/ClickHouse backend) before and after the fix. Before: 2
unscoped `length` calls to `viewsById.982` (no `seriesKey`), both still pending 6+ seconds in.
After: 0 unscoped calls across both loads — all 4 `viewsById.982` requests carried `seriesKey`/
`seriesVariants`. User separately checked `system.processes` on the ClickHouse server directly
and confirmed nothing stray was left running.

**Files changed:**
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — added `hasAnyFilterLeaf`/`hasUnscopedComparisonSeries`, OR'd into `skipFetch`. No new params
  needed (uses `filters`/`comparisonSeries`/`activeComparisonSeries`, all already in scope).
- `packages/dms/tests/buildUdaConfig.test.js` — 6 regression tests under "buildUdaConfig —
  comparison series" covering: unresolved+no-base-filter → skip; resolved-empty+no-base-filter →
  skip (the live report_1070 shape); resolved-with-variants → no skip; resolved-empty-but-real-
  base-filter-exists → no skip; comparisonSeries disabled entirely → no skip (out of scope);
  static-variants-no-config-key → no skip.

### C. True request cancellation (investigated, likely out of scope)

Traced the full chain in the original task: `apiLoad` → `dmsDataLoader` (`api/index.js`) →
`falcor.get()` → `@availabs/avl-falcor`'s `XMLHttpSource`/`request.js`. The lowest layer's
Observable has a dispose function that calls `xhr.abort()`, but no layer above threads an
`AbortController`/signal through. `@availabs/avl-falcor` is an external npm package, not part of
this submodule — fixing this requires changing that package. Even if wired up, client-side abort
doesn't help a request that's already reached ClickHouse and is executing server-side unless the
abort also triggers a server-side `KILL QUERY` (Postgres cancels on connection close; confirm
whether the ClickHouse HTTP client used here does the same, or whether the query keeps running
server-side even after the client aborts — this is unconfirmed and worth checking early since it
changes how much value (C) has even if built).

**Recommendation for whoever picks this up**: start with (A) since it's isolated, backend-only,
and caps worst-case damage regardless of what else is true. Then evaluate (B) as the real fix for
the wasted-query-volume problem (10 queries/page-load is still bad even if each is capped at 30s
instead of an hour). Don't start with (C) — biggest effort, external-package dependency, and
uncertain payoff until the server-side-kill-on-abort question is answered.

**2026-07-08 update**: (B) was implemented first instead (user's explicit choice — root cause
over defense-in-depth this round). (A) is still worth doing as a backstop for *other* future
runaway-query bugs (this adapter has no caps at all, for any query), but is no longer the
immediate priority for *this* hazard specifically, since (B) stops the queries at the source.
Pick up (A) separately if this class of issue resurfaces or as general hardening.

## Live incident history (for context on how bad this actually is)

- 2026-07-01: root cause diagnosed, race-condition fix shipped (see completed task file).
- 2026-07-08 (round 5 of old-reports-conversion): 40 concurrent stray queries piled up during
  normal verification work, elapsed 4-78 minutes, up to ~14B rows read each. Killed with user
  confirmation.
- 2026-07-08 (this session, round 6 of old-reports-conversion): four separate check-and-kill
  cycles over ~1.5 hours, ~10 queries each time, elapsed up to ~350s at time of kill (would have
  kept climbing). Directly caused by routine Playwright-driven page loads during live
  verification of unrelated fixes (color_range/graph_layout wiring, a BarGraph zero-value
  rendering bug) — i.e. **normal dev workflow on this codebase reliably reproduces the hazard**,
  it does not require any unusual action.
- Standing practice adopted this session: check `system.processes` proactively at the start of a
  work session and after any stretch of live page-load verification, not just when something
  looks broken. See `feedback_ch_unfiltered_query_awareness` memory.

## Safe check/kill procedure (until this is fixed)

Needs live ClickHouse credentials (`packages/dms-server/src/db/configs/npmrds2.config.json`'s
`clickhouse` block) — don't embed the password directly in a command; read it from the config
file at run time. The agent/assistant cannot run credentialed commands directly (blocked by the
permission classifier even for read-only queries against a plaintext local config) — hand the
user a self-contained script to run themselves in whatever terminal is convenient (not
necessarily the `!`-prefix mechanism, which this user finds unreliable).

Check:
```sql
SELECT query_id, elapsed, read_rows, memory_usage, query
FROM system.processes ORDER BY elapsed DESC FORMAT Vertical
```

Kill (always list candidates and get explicit confirmation first — this is a shared server):
```sql
KILL QUERY WHERE query_id = '<id>' SYNC
```

Both via ClickHouse's HTTP interface: `curl "http://<host>:<port>/?user=<user>&password=<pass>&database=<db>" --data-binary "<sql>"`.

## Files likely involved

- `packages/dms-server/src/db/adapters/clickhouse.js` — the `max_execution_time`/
  `max_memory_usage` caps (option A).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — `activeComparisonSeries` (~line 1084), `hasUnresolvedRequiredLeaf`/`requireResolved`
  (lines 411-429) (option B).
- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/useDataLoader.js`
  — where the fetch is actually triggered; also where the existing `requestIdRef` counter lives.
- `node_modules/@availabs/avl-falcor` — external package, only relevant if pursuing (C).

## Testing checklist

- [x] Decide which option(s) to implement — user chose (B) only this round; (A) noted above for
      later, not abandoned.
- [ ] (A) Not implemented this round. If picked up later: choose and justify a concrete
      `max_execution_time`/`max_memory_usage` value; confirm it doesn't break any legitimate
      existing large query against NPMRDS or other big CH tables.
- [x] (B) Implemented (corrected after live repro — see above). Confirmed the fix covers both
      `simpleFilterLength` and `simpleFilter`/`dataById` entry points by construction — the
      `skipFetch` gate sits in `getData.js` upstream of the `apiLoad` call that dispatches to
      either shape, not per-query-type.
- [x] Regression tests for (B): 6 cases in `buildUdaConfig.test.js` (rewritten once, after the
      corrected root cause), all passing (136/136 in that file, 175/175 package-wide).
- [x] Live verification: reproduced report_1070 via headless Playwright against the local dev
      stack (real `npmrds2`/ClickHouse backend), before and after the fix. Before: 2 unscoped
      `length` calls to `viewsById.982`, both still pending after 6+ seconds. After: 0 unscoped
      calls across two full page loads (initial + reload); all 4 `viewsById.982` requests carried
      `seriesKey`/`seriesVariants`.
- [x] Re-check `system.processes` is clean after verification — user ran this directly and
      confirmed nothing stray was left running.

## Cross-links

- `planning/tasks/completed/dataWrapper-stale-fetch-race.md` — root cause + partial fix.
- `planning/tasks/current/old-reports-conversion.md` — where this hazard kept recurring
  operationally; not the right place to fix it, just where it was rediscovered repeatedly.
- `planning/tasks/current/falcor-sibling-query-cache-collision.md` — a different bug in the same
  general area (dataWrapper/Falcor caching) but not the same root cause; don't conflate the two.
