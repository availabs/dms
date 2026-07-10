# Old NPMRDS reports → new DMS report pages (automated conversion)

**Round 22 (2026-07-10): freeflow (`speed_pctl_85`) wired into the Info Box templates — BUILT,
live-verified. Closes round 21's next-step priority (a).**

- `ensure_pm3_join_template` now adds a third calculated column, `pm3.speed_pctl_85 as freeflow`
  (`avg` aggregate, same shape as `lottr_col`/`tttr_col`), to both grains' column lists. Unlike
  LOTTR/TTTR, 1410's speed percentiles carry no bin dimension at all (round 21's schema check: 121
  columns, 52,127 rows = 52,127 distinct TMCs, one row per TMC) — freeflow rides along on the
  identical join regardless of which `bin_` the report resolved to; no new year/bin resolution, no
  new gap kind, no new gating logic needed. Exactly the "same class of small, mechanical change as
  adding another column to an existing join" round 21 already characterized it as.
- The two templates round 21 already minted (`tmc_info_box_reliability_2023_amp`/`_pmp`, live on
  report 1045) predate this column. Rather than mint new, differently-named rows and orphan the
  live ones (the "flat pile of templates" pattern used everywhere else in this task — appropriate
  when nothing still points at the old name, wrong here since report 1045's page still references
  these exact names), `ensure_pm3_join_template` now checks whether an existing template's cached
  columns already include the freeflow expression and, if not, updates the row in place via `dms
  raw update <id>` (a full-replacement `--data` call built by spreading the cached `data` dict so
  every other field — name/slug/layoutJson/elementType/etc. — survives untouched). Confirmed via
  direct `dms raw list` before/after: the two live templates gained the column; the three
  already-orphaned round-18/19 templates (`tmc_info_box_reliability_2023`,
  `tmc_info_box_reliability_2024`, `route_info_box_reliability_2021`) were untouched, since nothing
  calls `ensure_pm3_join_template` with their old un-suffixed names anymore.
- `INFO_BOX_TITLES` updated to read "LOTTR / TTTR / Freeflow" (cosmetic-accuracy only — round 21
  already established this exact string never reaches the rendered page; `convert_report`'s own
  bin/year title-suffix logic, not this constant, drives the live title).
- **Live-verified (2026-07-10, Playwright, report 1045 reconverted via `--replace`, page id
  2189245)**: zero console errors (only the pre-existing benign `HydrateFallback` warning), all 81
  `/graph` requests 200. Both sections' `/graph` requests now select `avg(pm3.speed_pctl_85) as
  freeflow_avg` alongside the existing lottr/tttr aggregates. Real, non-null, plausible freeflow
  (85th-percentile speed, mph) values returned: TMC `104N04284` 56.52, `104P04369` 50.05,
  `104-04284` 54.99, `104+04369` 50.99 — identical between the AM and PM sections for the same TMC,
  exactly as expected since `speed_pctl_85` is a single per-TMC value with no period split (unlike
  LOTTR/TTTR, which correctly differ AM vs. PM for the same TMC). One TMC (`104P11997`) returns
  null across all three columns together in both sections — a pre-existing join-coverage gap for
  that segment, not something freeflow introduced (lottr/tttr were already null there too).
- **Correction to the live-verification agent's own note**: it flagged the freeflow column's
  header rendering as a truncated raw expression (`PM3.SPEED_PCT…`) as a possible regression from
  this round. Checked the screenshot directly — the LOTTR and TTTR column headers render the exact
  same way (`PM3.LOTTR_PMP…`, `PM3.TTTR_PMP…`, truncated raw column names, no friendly label) — this
  is pre-existing Spreadsheet-template header behavior, not something this round introduced. Not
  fixed, not newly gap-logged — same class of pre-existing cosmetic rough edge as round 18's
  title-concatenation note.
- **User direction (2026-07-10), relaxes the orphaning-avoidance above**: don't spend engineering
  effort avoiding orphaned templates/pages in this task — none of this new DMS content is active in
  prod and no one outside this task even knows the converted reports exist yet. Mint new names
  freely going forward; only clean up orphans opportunistically when it's cheap (see
  [[feedback_dont_over_engineer_against_orphaning]]). Acted on immediately: confirmed (via a direct
  `data::text LIKE '%"templateId":"..."%'`  check against every `npmrds_sub|component` row) that the
  three pre-round-21 templates were referenced by zero live sections, then deleted them —
  `tmc_info_box_reliability_2023` (id 2189147), `tmc_info_box_reliability_2024` (id 2189180),
  `route_info_box_reliability_2021` (id 2189022). The update-in-place mechanism built earlier this
  round for the two still-live templates is unaffected by this direction (those two aren't
  orphans — report 1045's page actively references them) and was left as-is rather than reworked,
  since it's already built, tested, and live-verified working.
- **Not done**: bulk-applying this to the rest of the corpus's Info Box reports (same
  "capability proven, scale is a separate decision" pattern as every other round); `avgTT` (round
  21's next-candidate (b), a plain `AVG(tt)` with no percentile math) and a Route Compare Component
  variant (candidate (c)) remain open. Friendly column headers (LOTTR/TTTR/Freeflow all show raw
  expressions today) is a pre-existing rough edge, not scoped to this round.

**Round 21 (2026-07-10): two round-20 next-candidates closed by user review — one noop, one
correction to a stale blocker.**

- **Hours-of-Delay-Graph stacked-vs-single-color "product question" (round 18) — RESOLVED, noop.**
  User reviewed the current rendering (per-TMC stacked bars, distinct legend colors — e.g. round
  12's report 315/228/229 live-verifications) and confirmed it's already correct as-is. No decision
  needed, no engineering work follows. Closed.
- **Freeflow — CORRECTION: not actually gated on round 14's two-stage-aggregation blocker.** Round
  18's "not done" note ("Freeflow (`speed_pctl_85`) untouched — still gated on round 14's separate
  two-stage-aggregation structural blocker") conflated two different paths and is stale. Round 14's
  blocker applies only to computing freeflow **live** from the raw ClickHouse fact table (real,
  unfixed limitation for that path). But round 13's data-source audit already found 1410
  (`gis_datasets.s1410_v{year}_pm_3`, the exact same table LOTTR/TTTR now read from) **also carries
  `speed_pctl_85`** (85th-percentile speed, 100% non-null, checked in the same pass as `lottr_*`/
  `tttr_*`) — so freeflow is reachable through the identical `pgFederated` join already proven live
  on 70 reports (rounds 16-20), a plain column read, no live aggregation, no new lookup table. This
  was never re-evaluated after round 16 invented the `pgFederated` mechanism — round 18 built LOTTR/
  TTTR on this table but never went back to also wire `speed_pctl_85`. **Not yet done, but
  unblocked**: wiring freeflow into the Info Box templates is now the same class of small, mechanical
  change as adding another column to an existing join — not an architecture decision.
  - **Still genuinely open, NOT resolved by this correction**: the *other* old reliability indices
    (percentile95, percentile97, bufferTime, planningTime, miseryIndex, travelTimeIndex) —
    nobody has confirmed whether 1410/2001/1722 carry precomputed columns for these too (round 13's
    audit only went looking for LOTTR/TTTR/freeflow specifically, not the full column list on those
    tables). These remain blocked on round 14's two-stage-aggregation finding unless a full column
    audit of 1410/2001 turns up an equivalent precomputed value — worth doing before assuming a new
    ClickHouse lookup table (round 14's original recommendation, written before the `pgFederated`
    join existed) is actually necessary. **User direction (2026-07-10): gap-log all of these, low
    priority** — except **`avgTT`**, which the user flagged as likely already accessible: it's a
    plain `AVG(tt)` with no percentile math at all (round 13's own finding — it's the one old
    "indices" measure that was never gated on the two-stage-aggregation problem in the first
    place), so it's the same shape of work as the existing avg-travel-time templates, not a new
    capability. Not yet built — flagged as a cheap follow-up, not attempted this round.

**Round 21 continued (2026-07-10): per-report/per-comp reliability BIN selection — BUILT, tested,
live-verified. Closes round 20's #1 next-step priority.** Every Info Box template had the
reliability bin hardcoded to `amp` (AM peak) regardless of what the report's own comps actually
configured; this resolves it per graph from the comps' own peak flags/weekdays.

- **Schema ground-truth established first** (direct `information_schema.columns` read against
  `gis_datasets.s1410_v3425_pm_3` via the `npmrds2` pgEnv config, same credential file dms-server
  itself already uses — no new exposure): 1410 carries exactly **four** usable LOTTR bins —
  `amp`/`midd`/`pmp`/`we` (`lottr_{bin}_lottr` columns) — plus a fifth, `ovn`, for **TTTR only**
  (`tttr_ovn_tttr` exists; **no `lottr_ovn_lottr` column at all**, confirmed empty). No "all
  hours"/unrestricted-time column and no `alt_pmp` column exist either (both confirmed empty).
  `ovn` is therefore excluded from the resolvable set entirely — the template always shows LOTTR
  and TTTR together, and there's no LOTTR value to pair with an OVN TTTR value.
- **User-confirmed product framing (2026-07-10), this decision's actual foundation**: "all day"/
  "no time filter" and any custom/arbitrary time window are the SAME underlying problem, not two
  different ones — 1410 only has precomputed values for the four named FHWA periods, and (per
  round 14) the platform can't compute LOTTR/TTTR live for an arbitrary window either (the same
  two-stage bin-average-then-percentile limitation). So there is no fallback path for anything
  outside amp/midd/pmp/we — never curve-fit an approximate/nearest bin, since that would silently
  show one time period's real number as if it were computed for a different one.
- **Built** (`scripts/convert_old_reports.py`): `comp_reliability_bin(settings)` — weekend-only
  `weekdays` (no weekday day true) → `we`; a mixed weekday+weekend selection → `None` (spans a
  weekday-scoped bin and WE, neither fits); exactly one of `amPeak`/`offPeak`/`pmPeak` true →
  `amp`/`midd`/`pmp`; anything else (0 or 2-3 peak flags true) → `None`. `graph_reliability_bin`
  — same consensus-set idiom as `analyze_graph`'s resolution/dataColumn checks: the single bin
  every one of a graph's assigned comps agrees on, or `None` if mixed. `ensure_pm3_join_template`
  now takes a `bin_` parameter; template name is `{grain}_info_box_reliability_{year}_{bin_}`
  (was `..._{year}`, no bin — old un-suffixed templates are now orphaned, harmless per the
  "flat pile of templates is fine" convention); calculated columns are
  `pm3.lottr_{bin_}_lottr`/`pm3.tttr_{bin_}_tttr`. New gap kind `info_box_bin_undetermined`.
- **Real consequence, confirmed against live data before building anything**: pulled reports
  796/1045's actual comp settings directly. **Report 796 (the Route Info Box demo since round 18)
  has both comps with all three peak flags true** — no single bin fits, so its Info Box section
  now correctly gap-logs instead of rendering (an accepted, deliberate regression from "arbitrary
  AM-peak number" to "correctly blank" — user confirmed this tradeoff before implementation).
  Report 1045 has a mix: 2 of 4 original demo comps resolve cleanly (`amp`, `pmp`), 1 is
  all-three-true (undetermined), 1 has no peak flag and a custom window (undetermined, per the
  "no curve-fitting" rule above).
- **Bonus fix found while live-verifying**: `build_graph_section_data` always overwrites a
  section's title with `info["title"]` (the OLD report's own title, translated via
  `analyze_graph`'s `{type}`/`{data}`/`{name}` substitution) — `ensure_pm3_join_template`'s own
  bin-aware `display.title.title` (both before and after this round) was dead code, never reaching
  the page. This was harmless when every Info Box section showed the same hardcoded bin, but now
  that sibling sections can show DIFFERENT bins with an otherwise-identical title
  ("TMC Info Box, Speed" on both), it needed fixing. **Fixed**: `convert_report` now appends
  `" ({bin label}, {year})"` to the Info Box section's title right before building the section —
  e.g. `"TMC Info Box, Speed (PM Peak, 2023)"` / `"...( AM Peak, 2023)"`. **Separately noticed,
  NOT fixed (pre-existing, unrelated to this round)**: one section's title has the route/series
  label concatenated directly onto the type with no separator
  (`"2023 - PM - Inner Loop 2TMC Info Box, Speed"`) — confirmed via direct DB read that this
  concatenation exists in `info["title"]` itself (i.e. in the old report's own title template, or
  in `analyze_graph`'s substitution), not introduced by this round's title-suffix fix. Cosmetic,
  scoped out — worth its own look if title fidelity becomes a priority.
- **Live-verified (2026-07-10, Playwright, report 1045 / page `2189203` then `2189219` after the
  title fix)**: zero console errors, all 81 `/graph` requests returned 200. The two resolved
  sections' actual response bodies confirmed distinct bins and distinct real values — e.g. TMC
  `104N04284`: LOTTR 1.07/TTTR 1.23 (PM Peak section) vs. LOTTR 1.05/TTTR 1.14 (AM Peak section);
  `104P04369`: 1.18/1.65 (PM) vs. 1.10/1.30 (AM) — every non-null TMC differs between the two,
  proving the mechanism pulls genuinely different data per bin, not coincidentally-identical or
  both-broken output. Captured request select-lists directly:
  `avg(pm3.lottr_pmp_lottr) as lottr_pmp_avg, avg(pm3.tttr_pmp_tttr) as tttr_pmp_avg` vs. the
  `_amp_` equivalent — confirmed bin selection is a column choice against one shared
  `pgFederated` table, not a table swap. Report 796 re-converted live (page `2189235`) and
  confirmed via gap report: `info_box_bin_undetermined` fires, Info Box section correctly absent.
- **Not done**: `ovn` bin support (excluded — asymmetric schema, no LOTTR column); bulk-applying
  this to the rest of the corpus's 70 Info Box reports (this round proved the mechanism on the
  same two demo reports, same "capability built and proven, scale is a separate decision" pattern
  as every other round in this task).

**Round 20 (2026-07-10): Route Info Box pagination-length bug — FIXED, live-verified.** Round
19's #1 next-step priority ("small, contained, server-side only, unblocks a cosmetic issue on
every one of those 70 reports").

- **Root cause, confirmed by direct reproduction (not just re-stated from round 18's note):**
  `simpleFilterLength`'s `seriesVariants` branch — in **both** `query_sets/clickhouse.js` and
  `query_sets/postgres.js` (postgres.js has the identical latent bug, widening round 18/19's
  clickhouse.js-only scoping) — has no visibility into whether the matching `simpleFilter` arm
  query is a raw passthrough (N real rows) or an **ungrouped aggregate**: once `__series` is
  dropped, if there's no other real groupBy dimension, `simpleFilter`'s arm SELECT has no GROUP BY
  clause at all. When every shown column is a real aggregate (`fn: avg/sum/...`), SQL collapses
  that to **exactly one row per arm, even over zero matching source rows** — but
  `simpleFilterLength` always assumed the passthrough case, falling back to a raw
  `count(*)`/`count(1)` (the filtered epoch-row count) regardless. For Route Info Box's
  `__series`-only groupBy this miscounted the true 2-row result as ~100k.
- **Fix**: a new boolean `ungroupedAggregate`, threaded client → server. `buildUdaConfig.js`
  computes it (true when every real non-series groupBy dimension is absent AND at least one shown
  column has a real aggregate `fn` — `sum`/`avg`/`count`/`max`/`list`) and adds it to `options`
  only when true (keeps the payload/test footprint minimal, same pattern as `having`/
  `comparisonFilters`). Both query sets' `simpleFilterLength` check it in two places: the
  `seriesVariants` branch (each arm contributes a literal `1` instead of a `count(*)`/`count(1)`
  subquery) **and** the plain non-fan-out branch (`return 1` immediately when there's no groupBy
  at all) — the plain branch matters too, since a non-comparisonSeries ungrouped-aggregate
  Spreadsheet (a "grand total" row with no route fan-out) has the identical defect, not just the
  Info Box's fan-out case.
- **Known, deliberate simplification**: when `ungroupedAggregate` is true the arm/query
  short-circuits to a literal `1` without even querying the DB — correct for every InfoBox
  template actually shipped (none use `having`), but not proven correct if a future template
  combines `ungroupedAggregate` with a non-empty `having` (a HAVING clause could in principle
  filter the single aggregate row down to 0). Documented in code comments rather than engineered
  for a combination nothing currently uses.
- **Tested**: 2 new `dms-server` tests — `testUngroupedAggregateFanoutLength` (real SQLite
  integration via the Falcor route harness: creates 3 rows across 2 categories, proves the real
  per-arm query genuinely collapses to 1 aggregated row per arm — `avg_amount` 15 for the 2-row
  Alpha arm, 5 for the 1-row Beta arm — and that `.length` now reports 2, matching it) and
  `testClickHouseUngroupedAggregateFanoutLength` (pure stub-`ctx.db` unit test asserting the exact
  generated ClickHouse SQL — `SELECT 1 + 1 AS numRows` for two `ungroupedAggregate` arms, no live
  ClickHouse connection needed; also confirms the pre-fix `count(*)` fallback is unchanged when
  the flag is absent). Full UDA suite 79/79 (+2, no regressions); full `dms-server` `npm test`
  unaffected. 3 new client tests in `buildUdaConfig.test.js` covering the flag's three states
  (unset with no aggregate `fn`; true with `__series`-only groupBy + an aggregate `fn`; unset when
  a real non-series column is also grouped) — full client suite 194/194 (+3, no regressions).
- **Live-verified (2026-07-10, Playwright, report 796 / page `2189168` — the same Route Info Box
  demo rounds 18/19 already established)**: the section's real `/graph` response now reads
  `options[...].length: 2` (captured directly from the response body, not inferred) — matching
  its 2 real rows (Albany Downtown-Broadway NB 1.56 LOTTR/2.18 TTTR, SB 1.63/2.6). The misleading
  pagination footer (round 18's "Rows 1 to 50 of 100493" on an analogous section) no longer
  renders for this section at all — expected, since 2 rows fit on one page (pageSize 50) once the
  count is correct. Confirmed the client request itself carries `"ungroupedAggregate":true`
  verbatim in the captured request URL. Zero console errors (only the pre-existing benign
  `HydrateFallback` warning). The unrelated "Add a Route" route-catalog section on the same page
  still correctly shows its own real pagination ("Rows 1 to 5 of 5884"), confirming the fix is
  scoped correctly and doesn't touch genuine passthrough sections.
- **Files changed**: `packages/dms/src/patterns/page/components/sections/components/dataWrapper/
  buildUdaConfig.js` (client flag), `packages/dms-server/src/routes/uda/query_sets/clickhouse.js`
  + `postgres.js` (server, both branches each), `packages/dms-server/tests/test-uda.js` (2 new
  tests), `packages/dms/tests/buildUdaConfig.test.js` (3 new tests).
- **Not done**: TMC Info Box's pagination (a plain real `tmc` groupBy, not `__series`-only) was
  flagged in round 18 as possibly not sharing this bug at all ("hasn't been checked") — still not
  directly re-verified this round, though by construction the new branches never engage for it
  (`countGroupBy` stays non-empty once a real `tmc` column is grouped, so the existing
  `count(DISTINCT ...)` path — already correct — is untouched). Round 19's remaining next
  candidates, updated per round 21: **(1) DONE, round 21** — per-report/per-comp reliability bin
  selection (`comp_reliability_bin`/`graph_reliability_bin`), live-verified on 1045 (two sibling
  sections now show genuinely different real AM/PM Peak values) and 796 (correctly gap-logs
  instead of showing an arbitrary AM-peak number, per user decision). Next candidates, in order:
  (a) wire freeflow (`speed_pctl_85`) into the Info Box templates via the same `pgFederated`/1410
  join already used for LOTTR/TTTR — needs no new mechanism, just hasn't been done; (b) `avgTT` —
  same story, a plain `AVG(tt)` with no percentile math, likely a small addition once someone
  confirms which existing avg-travel-time template shape to mirror; (c) a Route Compare Component
  variant (round 13's third Info Box family member, still unbuilt). The other old reliability
  indices (percentile95/97, bufferTime, planningTime, miseryIndex, travelTimeIndex) are gap-logged,
  low priority, per user direction (2026-07-10) — no known precomputed source, still blocked on
  round 14's two-stage-aggregation finding.
  (The Hours-of-Delay-Graph stacked-vs-single-color item is closed, round 21 — current rendering is
  correct, no action needed.)

**Round 19 (2026-07-09): generalized per-report/per-year Info Box template selection — the
round-18 standing recommendation. No more hand-built-per-report templates.** Round 18 proved the
`pgFederated` join live but hardcoded one template per grain
(`route_info_box_reliability_2021`/`tmc_info_box_reliability_2023`), picked by hand for exactly
reports 796/1045. This generalizes it so any report's Route/TMC Info Box graph resolves its own
join year automatically.

- **Built** (`scripts/convert_old_reports.py`): `graph_max_year(info, comps_by_id)` — latest
  calendar year touched by a graph's assigned comps' `startDate`/`endDate` (same yyyymmdd
  validation as `to_datetime_str`; skips the ancient ~211-271 "version 2" comps that carry a whole
  object under `settings.startDate` instead of an 8-digit int, rather than crashing — caught live
  during the corpus-wide tally below, not by inspection). `ensure_pm3_join_template(grain, year,
  templates, dry_run)` — mints (or reuses) `{grain}_info_box_reliability_{year}`, built on
  `TEMPLATE_BASE_NAME`'s stateJson exactly like `ensure_graph_templates()` does for
  `TEMPLATE_SPECS` entries (same dry-run stub behavior, same base-template-not-found guard).
  `PM3_VIEW_BY_YEAR` (2021→2587, 2022→2575, 2023→2567, 2024→2568, 2025→3425, from
  `documentation/npmrds-data-sources.md`) and `INFO_BOX_BUCKET` (`speed`/`5-minutes`/
  `travel_time_all`, the one bucket the join supports, matching round 18's two demo reports)
  gate whether a graph is eligible at all — a graph outside the bucket or outside 1410's
  2021-2025 coverage still gap-logs as unmapped (`info_box_year_undetermined`/
  `info_box_year_outside_pm3_coverage`), never guesses a substitute year (round 17's product
  decision, now enforced in code instead of by hand-picking which reports to convert).
  `GRAPH_TEMPLATE_MAP`'s two round-18 static entries for Route/TMC Info Box are removed —
  `convert_report`'s mapping pass now branches on `INFO_BOX_GRAIN` to resolve+mint dynamically
  instead of a static dict lookup.
- **`census_old_reports.py` updated to match** — it was checking `GRAPH_TEMPLATE_MAP.get(key)`
  directly, which (before this round) counted every Route/TMC Info Box graph in the bucket as
  "mapped" with NO year check at all (an existing latent over-count: it would have called a
  report "fully convertible" even when converting it would join to the wrong year). Now mirrors
  the same `graph_max_year`/`PM3_VIEW_BY_YEAR` check, so the census's mapped/unmapped counts are
  actually accurate per report, not just per bucket key.
- **Live-verified, zero regressions**: dry-run against 796/1045 first confirmed the dynamic path
  picks the exact same template names the hand-built ones already used
  (`route_info_box_reliability_2021` for 796's 2 comps, both 2021;
  `tmc_info_box_reliability_2023` for 1045's comp-28/comp-6/comp-5, all 2023) — both templates
  already existed in the DB so `ensure_pm3_join_template` just reused them, no new rows. Then
  `--replace`-converted both live (new page ids 2189168/2189181) and Playwright-verified
  (zero console errors, real distinct LOTTR/TTTR values, correct attribution rows showing the
  right `s1410_v{view_id}_pm_3` table per section).
- **Bonus correctness fix, found by the dynamic resolution itself**: 1045's comp-8 (`"All-time
  Average"`, own range 2017-2024) previously got forced onto the 2023 template — round 18
  explicitly logged this as a "known minor year mismatch." The dynamic path now computes its real
  max year (2024) and mints a brand-new `tmc_info_box_reliability_2024` template (id 2189180,
  joined to `s1410_v2568_pm_3`) automatically — live-verified: its section's attribution reads
  `GIS_DATASETS.S1410_V2568_PM_3` and its values genuinely differ from the other three
  2023-joined sections on the same page. The round-18 tradeoff is fully closed, not just
  documented.
- **Corpus-wide impact, measured directly (not estimated)**: of the corpus's 268 Route Info Box +
  168 TMC Info Box graph instances in the supported bucket, **70 Route Info Box instances (51
  distinct reports) + 30 TMC Info Box instances (25 distinct reports) — 70 distinct reports total
  — now resolve automatically** to a correctly period-matched template (years 2021/2022/2024/2025
  touched for Route Info Box, 2021-2024 for TMC Info Box), with zero hand-authored templates
  beyond the two round-18 already had. The remainder genuinely falls outside 1410's 2021-2025
  coverage and correctly stays gap-logged, per the round-17 decision.
- **Not done**: this round only generalizes the YEAR axis. The reliability bin is still hardcoded
  to `amp` (AM peak) in both templates' calculated-column expressions
  (`pm3.lottr_amp_lottr`/`pm3.tttr_amp_tttr`) — a per-report/per-comp bin selection (matching the
  old tool's peak-button semantics) is unaddressed. The Route Info Box pagination-length bug
  (`simpleFilterLength`, unchanged from round 18) and a Route Compare Component variant remain
  open, same as before this round.

**Round 18 continued (2026-07-09): correction — round 18's build was mislabeled. It's Route Info
Box, not TMC Info Box; re-mapped, re-verified with a genuine multi-route example.** User caught
this by inspecting the old tool directly: TMC Info Box = one row per TMC within the assigned
route; what round 18 built groups by `__series` alone, which the dynamic per-route fan-out
populates as **one arm per selected route** (all of that route's TMCs bundled into one arm's
filter) — so it produces one row per ROUTE, i.e. Route Info Box's real grain, not TMC Info Box's.
A true TMC Info Box needs an additional real `tmc` groupBy column *within* each arm (e.g.
`groupBy: ["ds.tmc as tmc" (calculated), "__series"]`, keeping the arm's real per-route
tmc+date filter for safe scoping while splitting each arm into one row per distinct TMC) — not
attempted this round, per user direction to relabel rather than rebuild.
- **Relabeled, not rebuilt**: renamed the template `tmc_info_box_reliability_2024` →
  `route_info_box_reliability_2021` (repointed its `pgFederated.table` to `s1410_v2587_pm_3`, the
  2021 view, to match the new example report's year). `GRAPH_TEMPLATE_MAP` key changed from
  `("TMC Info Box", ...)` to `("Route Info Box", ...)`. Report 1045 re-converted — its 4 `TMC Info
  Box` graphs now correctly gap-log as unmapped (no template claims to be TMC Info Box anymore)
  instead of silently rendering the wrong grain.
- **New example, chosen specifically to show >1 route in one section** (report 1045's `TMC Info
  Box` graphs were each assigned to exactly one route comp, so never exercised the multi-row
  case): **report 796, "Bus Lane Feasibility Albany Broadway"** — a real `Route Info Box` graph
  with `activeRouteComponents: null` (defaults to ALL comps), 2 route comps (Broadway
  NB/SB, both real, both already in the new route catalog, both point-drawn → resolved via the
  existing `resolve_tmc_array` falcor mechanism), both dated 2021 (matches 1410's 2021 view,
  genuinely period-matched, not reusing 2024 by coincidence). Converted (page `2189135`),
  live-verified (Playwright + screenshot, zero console errors): **2 real rows, one per route,
  with genuinely different LOTTR values (1.56 SB vs. 1.63 NB)** — this is the first live proof
  that different routes actually produce different real numbers through the join, not just that
  the mechanism doesn't crash on one route.
- **Built and live-verified: true TMC Info Box (per-TMC-within-route grain).** Key realization
  (user): TMC Info Box only ever renders **one route at a time** in the old tool — same "first
  assigned comp only" semantics as "Hours of Delay Graph" (round 12's special case). Once that's
  true, `comparisonSeries`'s multi-route fan-out isn't needed for *producing rows* at all — it's
  still kept enabled purely for its real per-route filter scoping (one arm, one route, real
  tmc+date WHERE), and the actual per-row split comes from a plain, direct `tmc` groupBy column —
  exactly `tmc_delay_bar_graph_5min`'s shape (`categorize: "tmc"`, no `__series` column in the
  SELECT list at all). Added `"TMC Info Box"` to `analyze_graph`'s single-comp-default branch
  (alongside `"Hours of Delay Graph"`, docstring updated) — measure resolution stays normal
  (`displayData[0]`), only the comp-selection behavior is shared. New template
  `tmc_info_box_reliability_2023` (joined to `s1410_v2567_pm_3` = 2023, matching report 1045's
  comp-28/comp-6/comp-5 — comp-8's "All-time Average" is a known minor year mismatch, same
  tradeoff class as Route Info Box's period-matching). **Correction to the earlier
  record**: a bare (non-calculated) `"tmc"` groupBy column works FINE here, no ambiguity error —
  the earlier `GROUP BY ds.ds.tmc` double-qualification only happened when `tmc` was *manually
  pre-qualified* to `"ds.tmc"`; leaving it bare (same as `tmc_delay_bar_graph_5min`'s own `tmc`
  column) was never actually the problem. Live-verified (report 1045, page `2189148`,
  Playwright + screenshot, zero console errors): the first TMC Info Box section renders **12
  distinct TMC rows with genuinely different values** (e.g. `104N04286`: LOTTR 1.06/TTTR 1.27 vs.
  `104-04286`: LOTTR 1.09/TTTR 1.31); the other 3 sections (comp-6/comp-5/comp-8) each show their
  own route's real TMC breakdown too. No regression on the report's other 3 graphs.
- **Not done**: freeflow, the pagination-length cosmetic bug (Route Info Box's
  `seriesVariants`-branch `count(*)` issue — TMC Info Box doesn't use `seriesVariants`-driven
  length at all now that it's a plain groupBy, so it may not share this bug, but that hasn't been
  checked), a Route Compare Component variant, and per-report/per-comp year auto-selection
  (both Route and TMC Info Box still hardcode one year per template) are all still open.

**Round 18 (2026-07-09): first real use of the `pgFederated` join — LOTTR/TTTR live on report
1045, BUILT and live-verified. Also found and fixed a real platform bug (`Attribution.jsx`), and
caught/avoided a real unfiltered-CH-query near-miss along the way.** User wanted to actually see a
report using the round-16 cross-engine join, not just have the mechanism proven in isolation.

- **Report pick — reversed twice, both times for good reasons (see
  [[feedback_pivot_report_pick_to_data_coverage]]).** First picked report 40 (single small route,
  literally requests `'LOTTR'`/`'TTTR'` by name in its old InfoBox displayData — a genuine, real
  old-tool measure name, not an inference) — user caught that its route_comps are entirely inside
  2016, before the raw fact table's 2017 start, so avgTT/etc. would be blank for reasons unrelated
  to the join. Broadened the search: **only 10 reports in the whole corpus ever request literal
  `LOTTR`/`TTTR`, all 2014-2018** — none overlap 1410's real 2021-2025 coverage. Rather than convert
  one of those 10 and get correctly-wired-but-blank cells, pivoted to **report 1045 "Rochester Inner
  Loop"** (already converted/live-verified in earlier rounds, date range through 2024) and added a
  *new* Info Box section not tied to what that report's old InfoBox originally asked for. User
  approved this as a general pattern for future picks.
- **Product clarification (reverses part of round 17's wording): "current" was a bad word choice —
  the user does NOT want a year mismatch between a report's own period and the join's year.** The
  join must be **period-matched** (pick the 1410 view for the report's own max year), not "always
  the latest year regardless of report period." For 1045 (max year 2024, per its comp-8 "All-time
  Average" comp's `endDate: 20241231`), that's `s1410_v2568_pm_3`. This means any report whose own
  date range falls outside 1410's 2021-2025 coverage will correctly show **blank** LOTTR/TTTR cells
  (a real gap, gap-logged like every other date-coverage gap in this task), not a substituted
  current-year value — no report has been converted yet that hits this case.
- **1410 confirmed over 2001** (user decision, see
  [[project_npmrds_1410_vs_2001_backfill]]): 1410's 2021-2025 years are already complete on every
  measure; 2001 is missing measures across all years and would need a full pipeline re-run to fix.
  Backfilling 1410 back to 2017-2020 is the planned path for older reports, not falling back to
  2001.
- **Built**: one new `avl_graph_template` row, `tmc_info_box_reliability_2024` (hand-created via a
  one-off script, NOT through `ensure_graph_templates`/`TEMPLATE_SPECS` — that function is
  graph_new-specific (`xAxis`/`graphType`), and this is the first-ever `Spreadsheet`-element-type
  template in this pipeline). `join.sources.pm3 = {pgFederated: {pgEnv: "npmrds2", table:
  "s1410_v2568_pm_3", schema: "gis_datasets"}, joinColumns: [{dsColumn: "tmc", joinSourceColumn:
  "tmc"}], mergeStrategy: "join", type: "left"}` — exactly round 16's shape, first time it's
  actually loaded into a real section. One new `GRAPH_TEMPLATE_MAP` entry (`scripts/
  convert_old_reports.py`): `("TMC Info Box", "speed", "5-minutes", "travel_time_all") →
  "tmc_info_box_reliability_2024"`. Converted via the ordinary `--replace` pipeline — no changes to
  `convert_report`/`build_graph_section_data` needed, both are already generic enough.
- **Real bug found and fixed: `Attribution.jsx` crashed the whole page render on a `pgFederated`
  join source.** `packages/dms/src/patterns/page/components/sections/components/dataWrapper/
  components/Attribution.jsx` destructured `curJoinSource.sourceInfo` unconditionally for every
  join source — a `pgFederated` source has no `sourceInfo` by design (round 16), so this threw
  `Cannot destructure property 'source_id' of 'attribSource' as it is undefined` and React Router's
  error boundary ate the whole page. This is a 4th touchpoint beyond round 16's three
  (`isJoinComplete`/`buildJoinSources`/`sourceIdToTableAlias`) that assumed every join source has
  `sourceInfo` — round 16 didn't catch it because nothing had actually loaded a `pgFederated`
  section into a live page yet. Fixed with a parallel branch (mirrors the round-16 pattern exactly):
  renders `(mergeStrategy) schema.table (pgEnv)` as a plain `<span>` instead of a `<Link>` (no
  DAMA `source_id` to link to). No test added — this file has no existing test coverage to extend
  and the fix is a straightforward one-branch mirror of an established pattern.
- **Three self-inflicted template-config bugs found and fixed, all via live reproduction, not
  guessing:**
  1. **`GROUP BY ds.ds.tmc`** — first attempt named the group column `"ds.tmc"` (manually
     pre-qualified, reasoning that `tmc` is ambiguous once `pm3` is joined in). Something upstream
     of `refName` already qualifies bare join-scoped column names, so the pre-qualification doubled
     up. Fixed by using the bare name and, more fundamentally, by switching to the `__series`
     pattern below instead of a raw `tmc` groupBy column at all.
  2. **Stuck on "loading..." forever, no request ever sent.** Root cause: the template's `display`
     block never set `fetchMode: "force"` (every working template has it) — default `fetchMode`
     is `"cache"`, which never auto-fetches in view mode. `getData.js`'s `readyToLoad` derivation
     is `isEditMode || (isValidState && (fetchMode !== 'cache' || allowEditInView))` — silent, no
     console signal at all when this is missing.
  3. **The real one, see below — disabling `comparisonSeries` removed the platform's own
     unfiltered-query safeguard, not just cosmetic graph-comparison config.**
- **Near-miss: almost re-triggered [[project_npmrds_unfiltered_ch_query_risk]] on the shared dev CH
  server.** After fixing (2), the query fired but crashed client-side (`GROUP BY ds.ds.tmc` SQL
  error, caught and shown as a console error — safe). After fixing that, it fired again — this
  time with **zero base filters and `comparisonSeries.enabled: false`** (an earlier "cleanup" step
  had disabled `comparisonSeries` on the theory that it was inert graph-comparison decoration the
  new section didn't need). `buildUdaConfig.js`'s `hasUnscopedComparisonSeries` guard — the exact
  fix from the completed `clickhouse-unfiltered-probe-hazard` task — only fires when
  `comparisonSeries.enabled === true`; with it explicitly `false`, that guard is bypassed entirely,
  and with an empty `filters` tree there was no fallback scoping either. `page.goto({waitUntil:
  'networkidle'})` hung for 60s+ in the Playwright repro — consistent with a real unfiltered query,
  not a client-side hang. **User independently hit the same hang in a real browser tab.** Checked
  `system.processes` on the CH server (user-run, read-only) before doing anything else — **nothing
  stray was running**, so no query actually got far enough to become a real incident this time
  (probably erroring or getting cut off before real execution — not fully diagnosed, and not worth
  chasing further now that the fix is in). Root cause understood and fixed (see below) rather than
  just avoided.
  - **Real mechanism, traced properly this time**: every working template's actual TMC/date
    scoping comes entirely from `comparisonSeries`'s dynamic fan-out (`usePageFilterSync.js`
    resolves `comparisonSeries.config` from the page's route selection into one real
    `filterGroups` arm per TMC — e.g. `tmc_speed_grid_graph` groups by `[epoch, __series]`, not by
    a raw `tmc` column at all). The `__series` "categorize" column isn't graph-specific
    decoration — it's the load-bearing scoping primitive every dataWrapper section relies on for
    real filtering. `state.filters` is empty on every template, working or not; the real filter
    lives inside `comparisonSeries`'s resolved config. Fixed the template to match:
    `columns = [__series (group, categorize), lottr_amp (calc, fn avg), tttr_amp (calc, fn avg)]`,
    `comparisonSeries` copied verbatim from `tmc_speed_grid_graph` (`enabled: true`), and —
    the piece that was still missing after re-enabling `comparisonSeries` — `display._functions.
    subscribers` needs the `{functionId: "comparison_series", enabled: true, paramKey: "$self",
    args: {labelKey: "label", valueKey: "filters"}}` entry, or `usePageFilterSync` never resolves
    `comparisonSeries.config` at all (silently — `effectiveParamKey` is `undefined`, effect
    no-ops) and the safeguard correctly holds the fetch back forever.
- **Live-verified (2026-07-09, Playwright + screenshot, `page id 2189103`)**: real, non-null,
  plausible LOTTR/TTTR values render for comp-28's route ("I-490 EB AM Peak Child St to Culver
  Rd/Ped Bridge") — **LOTTR (AM peak) 1.0477684017792284, TTTR (AM peak) 1.1813796980884241** —
  pulled live via `ClickHouse postgresql() → gis_datasets.s1410_v2568_pm_3` for that route's real
  TMCs, period-matched to 2024. All 4 of report 1045's `TMC Info Box` graph_comps converted (one
  per route comp: comp-28/comp-6/comp-5/comp-8) using the same template. Zero console errors
  (only the pre-existing harmless `HydrateFallback` warning). No regression on the report's 3
  pre-existing graphs (Route Line Graph/TMC Grid Graph/weekday delay bar all still render real
  data unchanged).
- **Known follow-up, not fixed this round (cosmetic, not a correctness or safety issue)**: the
  section's reported pagination length (`"Rows 1 to 50 of 100493"`) is wrong — with `seriesKey`
  filtered out of `groupBy` and no other groupBy dimension, `simpleFilterLength`'s
  `seriesVariants.length` branch falls back to `armCountExpr = "count(*)"` (raw filtered epoch-row
  count) instead of counting the single aggregated row each arm actually produces. The one real
  row still renders correctly; only the pagination chrome is misleading. Worth fixing before this
  becomes a general InfoBox capability rather than a one-report demo.
- **Not done / scope of this round**: this is one hardcoded-to-2024 template wired to exactly one
  old `(type, measure, resolution, dataColumn)` key, applied to one report. Not a general
  "InfoBox family" capability yet — no author-facing UI for the `pgFederated` join (per round 16,
  still hand-authored), no per-report year selection (a report whose max year isn't 2024 needs its
  own template pointed at the matching `s1410_v{view_id}_pm_3`), no Route Info Box (route-wide
  aggregate across TMCs) or Route Compare Component variants, and the pagination-length bug above
  is unfixed. Freeflow (`speed_pctl_85`) untouched — still gated on round 14's separate two-stage-
  aggregation structural blocker, unrelated to this round's join work.

**Round 17 (2026-07-09): 1410's TMC-id column confirmed + PRODUCT DECISION on the round-13
LOTTR/TTTR question — "surface current/correct," not a faithful old-math replica.**

- **1410's TMC-id column CONFIRMED**: `tmc` (row shape starts `ogc_fid, tmc, urban_code,
  region_code, county, ...`, from a direct `SELECT * FROM gis_datasets.s1410_v2575_pm_3`) — closes
  the last queued item from round 15/16. **Different from 2001's id column** (`travel_time_code`) —
  each source has its own naming, don't assume they match when wiring a `pgFederated` join to
  either. `npmrds-data-sources.md`'s 1410 row updated.
- **Product decision (answers round 13's "replicate old ad hoc math 1:1 vs. surface current
  LOTTR/TTTR" question, left open since 2026-07-08): surface current/correct LOTTR/TTTR.** Not a
  faithful reproduction of the old InfoBox's ad hoc percentile math (round 14's
  bin-average-then-percentile finding, and the whole "can ClickHouse express a two-stage
  aggregation live" investigation) — pull the real, federally-current LOTTR/TTTR values directly
  from a real source via the round-16 `pgFederated` join, same as the round-15/16 proof-of-concept
  already did against source 2001. **This significantly de-scopes the LOTTR/TTTR half of the
  InfoBox work**: no calculated-column quantile math needed for these two measures at all — just a
  plain joined column read (`pm3.lottr_amp`/`pm3.tttr_amp` etc.) through the now-built join
  mechanism. Round 14's quantile/bin-averaging investigation remains relevant only for
  **freeflow** specifically (1410's `speed_pctl_85`, or a live recompute) — that product question
  (does "current/correct" extend to freeflow too, or does freeflow still want a faithful replica?)
  was NOT addressed by this decision and remains open.
- **Still open, for whenever InfoBox work resumes**: which source to join for LOTTR/TTTR — 2001
  (best/current year coverage 2016-2025, periodically re-published — arguably the more literal
  reading of "current") vs. 1410 (narrower 2021-2025, but also carries `speed_pctl_85` if freeflow
  ever gets folded into the same join). Not decided; both are proven-real and both work through the
  same `pgFederated` mechanism, so this is a pick, not a blocker.
- **Not done**: no InfoBox template/section built yet. This round only closed two open questions
  (schema + product decision) — still purely investigation/decision-making, no new code.

**Round 16 (2026-07-09): `pgFederated` join source — BUILT, tested, no template wired to it yet.**
User pushed further on round 15's Reading C (the live `postgresql()` join) with a better question:
why does it need a persistent ClickHouse VIEW or DAMA source/view registration at all, when the
whole point is a "custom column" — could `buildJoin` itself just recognize a join source shaped as
a `postgresql()` call and build it inline, with credentials living server-side exactly as they do
today? Traced the real code before answering (not guessed): `getEssentials`/`getDb(pgEnv)`/
`getChDb(pgEnv)` (`dms-server/src/routes/uda/utils.js`, `src/db/index.js`) all resolve a `pgEnv`
name via the identical `loadConfig(pgEnv)` — the SAME config file already backs both a pgEnv's
Postgres connection (top-level `host`/`port`/`user`/`password`/`database`) and its ClickHouse
sub-connection (`.clickhouse`). Nothing new to store — this is genuinely the lowest-impact option
of the three considered (VIEW+registration / CH Dictionary / this).

- **Server** (`dms-server/src/routes/uda/utils.js`, `buildJoin`, the single join-builder shared by
  both `clickhouse.js` and `postgres.js` query sets): a join source shaped
  `{pgFederated: {pgEnv, table, schema}}` (instead of `{view_id, env}`) skips `getEssentials()`
  entirely — `loadConfig(pgEnv)` resolves the connection, `sanitizeName()` (already imported in
  this file) guards `table`/`schema` against injection, and the FROM-clause expression becomes
  `(SELECT * FROM postgresql('host:port', 'database', 'table', 'user', 'password', 'schema'))`
  instead of `table_schema.table_name`. Throws if `table`/`schema` fail sanitization — never
  splices an unvalidated name into SQL. Deliberately NOT engine-guarded (no new `dbType` parameter
  threaded through all 5 call sites) — `postgresql()` is ClickHouse-only SQL, so a `pgFederated`
  source used against a Postgres-dispatched base query fails naturally and loudly (`function
  postgresql does not exist`) rather than needing a bespoke check; kept the diff small per the
  dms-server CLAUDE.md's "don't create wrapper functions without genuine value" guidance.
- **Client** (`buildUdaConfig.js`): three touchpoints, all found by tracing what actually gates a
  join source from reaching the server, not assumed:
  1. `isJoinComplete` unconditionally required `joinSource.source`/`.view` as its FIRST check,
     before the merge-strategy/joinColumns validation — a `pgFederated` source has neither, so
     without a fix it would be silently filtered out of `join.sources` before `buildJoinSources`
     ever ran (this gate is real, not cosmetic — `buildUdaConfig`'s main body drops any join source
     that fails it). Added a parallel branch checking `pgFederated.{pgEnv,table,schema}` instead,
     falling through to the same shared strategy/type/joinColumns checks either way.
  2. `buildJoinSources` always built `{view_id, env}` regardless of input shape — added an early
     branch passing `{pgFederated: {...}}` through as-is.
  3. Found while reading, not asked for: `sourceIdToTableAlias`'s per-alias `source_id` fallback
     (`curJoinSource.source || externalSource.source_id`) would give a `pgFederated` source (no
     real DAMA `source_id`) the SAME key as the base `ds` source — inert for a single `pgFederated`
     source today (the explicit `sourceIdToTableAlias[externalSource.source_id] = 'ds'` line right
     after the reduce always wins), but would silently collide two DIFFERENT `pgFederated` sources
     used in the same join (e.g. both 2001 and 1410 joined into one InfoBox query at once) before
     that override line even runs. Gave it a synthetic `` `pgFederated:${alias}` `` key instead —
     cheap insurance for a scenario not built yet but plausible (LOTTR/TTTR from 2001 + freeflow
     from 1410 in one query).
- **No new authoring UI** — matches how every other join in this task has been wired
  (`META_1946_JOIN`/`AADT_DIST_JOIN`): a `pgFederated`-shaped join source gets hand-written directly
  into a template's `stateJson` by `convert_old_reports.py`, same as any other join. An
  author-facing UI toggle would be a reasonable follow-up, not required to ship InfoBox measures.
- **Architecture check**: still exactly one query to one ClickHouse connection from the platform's
  perspective — ClickHouse does the Postgres federation internally via its own `postgresql()` table
  function. Does not reopen round 13's "no bespoke multi-query components" correction.
- **Tested** (both suites green, no regressions): server — new `testBuildJoinPgFederated` in
  `dms-server/tests/test-uda.js` (pure SQL-string test, no live DB needed — `loadConfig` just reads
  the existing `dms-postgres-test` config file; asserts the exact generated JOIN SQL, and that a
  malicious table/schema name throws instead of reaching the query), full UDA suite 74/74 (+2, no
  regressions). Client — 5 new cases across `buildJoinSources`/`isJoinComplete` in
  `dms/tests/buildUdaConfig.test.js` (pass-through shape, complete/incomplete pgFederated configs),
  full client suite 191/191 (+5, no regressions). The `sourceIdToTableAlias` collision fix has no
  direct test — internal, currently unreachable with a single `pgFederated` source, and not
  observably returned by `buildUdaConfig`; documented via code comment instead of test scaffolding.
- **Not done**: no template/section actually uses `pgFederated` yet — this round built and tested
  the platform mechanism only, on the strength of round 15's live-query proof (real LOTTR/TTTR/PHED
  data, 0.75s, via the ad hoc `postgresql()` query). Next step is wiring an actual InfoBox
  calculated-column/join config that uses it — still blocked on the earlier-queued schema peeks
  (1410's TMC-id column name unconfirmed) and the still-undecided product question (replicate old
  ad hoc math 1:1 vs. surface current LOTTR/TTTR).

**Round 15 (2026-07-09): user proposed reusing the existing PM3/MAP21 sources instead of round
14's "compute fresh from the raw fact table" plan — investigated, and there are two different
ways to read "port/duplicate the sources," with very different outcomes.** Question was: "can we
get the data we need by just porting/duplicating the pm3/map21 sources we scoped out earlier"
(referring to sources 1722/2001/1410, `npmrds-data-sources.md`'s "Other active old-DAMA NPMRDS
sources" table — the already-computed Postgres LOTTR/TTTR/PHED/freeflow-equivalent tables).

- **Reading A — re-run the live map21/pm3 DAMA pipeline against source 583 to compute FRESH
  results.** Traced the real trigger mechanism in `avail-falcor` (not guessed): `dama/routes/
  index.js` mounts every `dama/routes/**/*routes?.js` file under `/dama-admin`; `map21/
  publish.routes.js` and `pm3/publish.routes.js` expose `POST /dama-admin/:pgEnv/map21/publish`
  and `.../pm3/publish` — each creates/reuses a `data_manager.sources` row (`type` is 100%
  caller-supplied, no enum, confirmed no hardcoded `'map21'`/`'pm3'` type check anywhere) and
  queues an async worker (`map21/publish.worker.mjs`/`pm3/publish.worker.mjs`) that runs
  `calcTtrMeasure`/`calcPhed` per TMC. No admin-UI caller of these routes exists in this repo — the
  UI (if any) is in a separate frontend repo not present locally.
  - **The raw-travel-time half needs NO new mechanism** — `getBinnedYearNpmrdsDataForTmc`
    (`calcTtrMeasure.js:192-247`) already branches to `chQuery` for any `schema_name !== "public"`
    (code's own comment: "THIS IS NEW STUFF IN CLICKHOUSE"), and `NPMRDS_CH_SCHEMA_NAME='npmrds'`
    is already source 583's real CH database. Pointing a fresh publish run at
    `npmrdsSourceId: 583` should just work for the data-fetch side.
  - **The metadata half is a real, live-DB-dependent blocker**: `tmcMeta` is fetched via Postgres
    `query()` (never `chQuery`) against a table resolved from
    `data_manager.sources.metadata.npmrds_meta_layer_view_id[year]` **on source 583's own metadata
    row** (`map21/publish.worker.mjs:185-206`). `ny_2025_tmc_meta` (1946/3298, the meta view every
    other template in this task already joins) is ClickHouse-backed — a Postgres `query()` call
    can't read it, so it's definitely not the answer here. `npmrds-data-sources.md` separately
    notes 583's metadata cross-references `npmrds_tmc_meta_source_id: 582` (a *different* key name
    than what the code reads) and that 582 is "partially duplicated across ClickHouse + Postgres."
    Whether 582 already has a Postgres view with the exact columns this pipeline needs
    (`avg_speedlimit, miles, functionalclass, congestion_level, directionality, nhs_pct,
    avg_vehicle_occupancy, directionalaadt`), and whether 583's metadata blob already has
    `npmrds_meta_layer_view_id` populated in the shape the worker expects, is **undeterminable from
    code alone** — needs a live `SELECT metadata FROM data_manager.sources WHERE source_id IN
    (583, 582)` (queued, see below).
  - **Even if unblocked, this reading doesn't avoid the original problem**: every real write path
    (`pm3Config.METRIC_WRITES_DB` in `pm3/publish.worker.mjs`, `getDataInsertSqlForMap21`/
    `getUpdateColumnsSqlForMap21` in `map21/publish.worker.mjs`) is confirmed plain Postgres
    (`query()`, never `chQuery`; `createAnalysisTableSql` in `map21/helpers.js` is Postgres DDL —
    `SERIAL`/`TEXT`/`NUMERIC`/`JSONB`) into a **fresh per-run `gis_datasets` table** (`createView`
    with `setDefaultTable: true`, `dama/admin/metadata.js`). So a brand-new publish run against 583
    would produce a **4th Postgres PM3 table** — same cross-engine join wall as 1722/2001/1410,
    solving nothing architecturally on its own.
- **Reading B — mirror the ALREADY-COMPUTED 1722/2001/1410 Postgres tables into ClickHouse.**
  This is the one that actually resolves the architecture problem: no DAMA task queue, no worker,
  no `tmcMeta`/metadata blocker, no live aggregation over the fact table — just copy rows that
  already exist and are already verified real/non-null (round 13). ClickHouse's native
  `postgresql(host:port, database, table, user, password, schema)` table function can read
  directly from the same Postgres server in one `INSERT INTO ... SELECT * FROM postgresql(...)`
  query, landing the mirrored table in `clickhouse.avail` (the same CH database
  `aadt_distributions` already lives in) — then register + join it exactly like
  `aadt_distributions` (source_id 2056/view 3524 precedent). No new platform capability needed at
  all, and no expensive fresh aggregation over the multi-billion-row fact table (round 14's
  fallback) — this is strictly cheaper and lower-risk than round 14's plan where it applies.
  - **Candidates to mirror**: 1410 (`s1410_v3425_pm_3` for 2025; other 4 years' table names not
    yet confirmed — queued below) — the only source with a freeflow-equivalent column
    (`speed_pctl_85`), plus LOTTR/TTTR, but **only 2021-2025**. 2001 (`s2001_v3490_map_21_extended`,
    one all-years view, 2016-2025) — LOTTR/TTTR/PHED, no freeflow, better year coverage. 1722 —
    strict column subset of 1410, skip (per existing note).
  - **Residual gap, unresolved by mirroring**: reports whose date range falls entirely in
    2017-2020 still get no freeflow value even after mirroring 1410 (1410 starts 2021). Closing
    that gap would need Reading A's live pipeline re-run (for those years specifically), which is
    still blocked on the metadata question above — parked, not urgent unless the corpus actually
    has reports in that window that need freeflow specifically (not yet checked).
- **Table names for 1410/2001/1722 CONFIRMED (2026-07-09)** via `data_manager.views`: 1410 — 2587
  (2021), 2575 (2022), 2567 (2023), 2568 (2024), 3425 (2025), all `s1410_v{id}_pm_3`. 2001 turned
  out to have **21 views, not 2** — 10 single-year (3396-3405, 2016-2025) + one `all_years` view
  (3394) + **4 separate `map_21_extended` re-publishes over time** (3440 "2025 v052126", 3489
  "2025 v061126", 3490 "all years v61126", 3511 "2025 v061526" — the most recent by version-string
  date). **2001 is a periodically re-run/re-published source, not a static one-time table** — and
  3490 (the "all years" one, still the right pick for full 2016-2025 coverage) may already be one
  re-run behind the latest 2025-only republish (3511). Both docs (`npmrds-data-sources.md`) updated
  with the full list. `start_date`/`end_date` are empty on every 1410/2001/1722 view row (metadata
  field not populated for this source — informational only).
- **Reading C, found via a follow-up user question, supersedes both A and B — a LIVE cross-engine
  join via ClickHouse's `postgresql()` table function, CONFIRMED WORKING end-to-end
  (2026-07-09).** User asked whether `postgresql()` could be used to query the existing Postgres
  tables live, in-place, as a real join — not a one-time mirror. Tested directly: `SELECT ...
  FROM npmrds.s583_v982_NPMRDS_V6 AS ds INNER JOIN (SELECT * FROM postgresql('neptune.availabs.org
  :5758', 'npmrds2', 's2001_v3490_map_21_extended', 'npmrds_admin', '<pw>', 'gis_datasets')) AS pm3
  ON ds.tmc = pm3.travel_time_code WHERE ds.tmc IN (the 3 known-good TMCs)` — **real,
  sane, non-null `lottr_amp`/`tttr_amp`/`phed` values for both TMCs across every available year
  (2016-2025, gaps only where the source itself has none), returned in 0.75s total wall time**
  (HTTP round-trip + Postgres connect + full ~199,165-row remote pull + join + response). This
  settles the performance worry from round 15's first pass: whether or not ClickHouse pushes the
  `tmc IN (...)` filter down into the `postgresql()` call, a full pull of this table is cheap —
  it's a per-TMC-per-year dimension table (thousands of rows), nothing like the multi-billion-row
  raw fact table that the known unfiltered-scan hazard applies to.
  - **Why this beats both A and B**: no DAMA task/worker/tmcMeta blocker (Reading A's problem —
    irrelevant here, we're not running the pipeline, just reading its past output); no one-time
    ETL/mirror step and no staleness risk if the source gets re-published again (Reading B's
    tradeoff — and 2001 evidently DOES get re-published, per the 4-versions finding above, so
    staleness is a real, not hypothetical, concern for a mirror). The mechanism is: wrap the
    `postgresql()` call in a plain ClickHouse `VIEW` (e.g. `CREATE VIEW avail.pm3_map21_live AS
    SELECT * FROM postgresql(...)`), then register that view as a completely normal DAMA
    source/view — **zero platform code changes**, identical registration recipe to
    `aadt_distributions` (`scripts/register_aadt_distributions.sql` is the exact template to copy).
    `buildJoin`/`getEssentials` never need to know the underlying view is secretly backed by a live
    Postgres query — from their perspective it's just another ClickHouse table.
  - **Caveat, not yet resolved**: the Postgres credential would live inside the ClickHouse view's
    definition (stored server-side in CH's own system tables, not exposed via
    `data_manager`/DMS metadata) — a similar exposure level to every other CH credential already
    used in this stack, not a new category of risk, but worth being deliberate about who has
    `SHOW CREATE VIEW`/`system.tables` access on the CH server.
- **Queued, not yet run**: (1) a 1-row schema peek on both 2001 (`s2001_v3490_map_21_extended`)
  and 1410 (`s1410_v3425_pm_3`) via the same `postgresql()` table function, to nail exact column
  names before writing the `CREATE VIEW` + DAMA-registration SQL (2001's columns are well
  characterized already from round 13's verification; 1410's TMC-id column name specifically has
  never been directly confirmed — needed before wiring a join to it). (2) `metadata` column for
  source_id 583/582 (Reading A's blocker check) — lower priority now that Reading C works, but
  still worth resolving to know if the 2017-2020 freeflow gap (1410 starts 2021) could ever be
  closed by a fresh publish run.
- **Not done**: no persistent `CREATE VIEW` created yet, no DAMA source/view registered yet — the
  ad hoc `postgresql()` query above proved the mechanism but was not saved as a reusable object.
  This is the concrete next step once the schema peeks come back.

**Round 14 (2026-07-09): freeflow `quantile()` prototype — DONE, and it surfaced a real
platform-architecture gap that changes the recommendation from round 13.** Picked up round 13's
"recommended next step" (prototype a quantile-based freeflow calculated column; check whether
spreadsheet/Table can render a tmc-grouped result). Both sub-questions are now answered — and the
first one's answer is more consequential than round 13 assumed.

- **Spreadsheet/Table CAN render a one-row-per-TMC result with no new capability** (verified by
  reading `spreadsheet/index.jsx`/`config.jsx`/`constants.js`, `dataWrapper/getData.js`, and
  `buildUdaConfig.js` end-to-end, not assumed): `groupBy` is driven by an explicit per-column
  `.group` boolean (`buildUdaConfig.js:1253-1255`, the "Group" toggle in the column config UI) —
  **correction to round 13's phrasing**, which said "any column without `fn`" becomes a group-by
  key; that's not what the code does, `.group` is its own explicit flag. `GROUP BY tmc` alone
  (no date/xAxis column at all) is issued exactly the same way as every other grouped query
  (`clickhouse.js:276`, pure passthrough of whatever refs `groupBy` contains — nothing date- or
  graph-specific anywhere in that file). Calculated measure columns with self-contained
  aggregation (e.g. `quantile(0.15)(...) as p15_tt`) need `fn: 'exempt'` set (an existing dropdown
  option, `spreadsheet/config.jsx:144-148`) so they pass `getData.js`'s "every non-grouped visible
  column needs a truthy `.fn` once anything is grouped" validity check — already-shipped UI, not a
  gap. Calculated-column authoring itself is wired into spreadsheet/Card (`AddCalculatedColumn`)
  but **not** into graph_new at all (zero hits for `CalculatedColumn`/`calculated` in
  `ComponentRegistry/graph_new/{index,config}.jsx` — every graph_new calculated column in this
  whole task was written as raw JSON by the Python converter, bypassing the UI). Spreadsheet is
  confirmed the right component for InfoBox — closer to the old plain `<table>` than Card's
  grid-of-cards layout.
- **The freeflow calculated column itself is a genuine problem — round 13's "one-line, no new
  mechanism needed" claim is WRONG, not just imprecise.** Traced the old Node computation
  precisely (`avail-falcor/dama/routes/data_types/map21/calcPhed.js`'s
  `calcFreeflowBaseThresholdSpeed` + `calcTtrMeasure.js`'s `getBinnedYearNpmrdsDataForTmc`, both on
  disk at `/home/ryan/code/avail-falcor/`): the old semantic is **NOT** a plain 15th-percentile of
  raw epoch travel times. It's two aggregation levels — (1) `AVG(CASE WHEN tt > 0 THEN tt ELSE
  NULL END)` **per 15-minute bin per date** (`intDiv(epoch, 3)`, 0-as-missing nullification, same
  as the round-9 fix elsewhere), THEN (2) the 15th percentile (`simple-statistics.quantile()`,
  linear interpolation) **across those bin-level averages** for the whole year, all hours/all
  days-of-week. Round 13's proposed one-liner skips step 1 entirely.
- **Quantified the gap directly against ClickHouse** (user ran both variants live, `database=avail`
  HTTP endpoint, full year 2019, the 3 TMCs already verified elsewhere in this task —
  `120-04426`/`120-04427` from report 315, `120P05153` from report 751):

  | tmc | raw one-liner (p15 tt) | faithful binned (p15 tt) | relative diff |
  |---|---|---|---|
  | 120-04426 | 3.02 | 3.107 | −2.8% (one-liner reads *faster*) |
  | 120-04427 | 38.66 | 39.15 | −1.3% (one-liner reads *faster*) |
  | 120P05153 | 30.28 | 30.09 | +0.6% (one-liner reads *slower*) |

  Small in absolute terms but **the direction flips between TMCs** — not a fixed bias correctable
  with a constant factor — so the one-liner isn't just "slightly off," it's a different, cheaper
  statistic that happens to be close. Since freeflow speed is `miles / p15_tt * 3600`, these tt
  deltas translate to comparably-sized freeflow-speed deltas.
  Also checked which ClickHouse quantile function best matches the old Node code's
  `simple-statistics.quantile()` (linear interpolation): `quantileExactInterpolated` doesn't exist
  on this server's version (24.5.3.5); `quantileInterpolatedWeighted(p)(x, 1)` (unit-weighted) is
  the real equivalent. On the already-bin-averaged data, `quantile`/`quantileExact`/
  `quantileInterpolatedWeighted` all agree to within noise (bin-averaging already smooths away the
  raw data's discreteness) — so once the binning step is done right, the choice of quantile
  function barely matters. On raw unbinned data the three diverge more (up to ~1.1% between
  `quantileExact` and `quantileInterpolatedWeighted` on `120P05153`), another symptom of skipping
  the bin-averaging step.
- **New, more important finding: the faithful two-stage formula cannot be expressed in the
  platform's current single-query UDA pipeline at all — not a tuning problem, a structural one.**
  Traced the full path, both sides: client `buildUdaConfig.js`'s `buildJoinSources`/
  `buildJoinOnClause` (~850-933) only ever emit `{view_id, env}` per join source, never an inline
  query/subquery; server `dms-server/src/routes/uda/utils.js`'s `buildJoin` (579-606) resolves each
  join source through `getEssentials({view_id, env})` → `{table_schema, table_name}` → a plain
  `JOIN table_schema.table_name AS alias ON ...` — always a real registered physical table, never a
  derived/aggregated subquery or CTE. Calculated columns (the mechanism used for every measure in
  this task so far) are raw SQL strings spliced into the SELECT list of that one flat
  `ds JOIN table1 JOIN table2 ... GROUP BY <cols>` query — they can contain arbitrarily complex SQL
  *expressions*, but they can't introduce a second, independent GROUP BY stage ahead of the outer
  one, because there's no second FROM/subquery level for them to group within. There IS
  forward-looking metadata for this (`computeOutputSourceInfo`'s `asUdaConfig`,
  `buildUdaConfig.js:1039-1052`, labeled "Phase 4/6 chainability" in comments — meant to let one
  component's aggregated output be joined into another's query as a WITH-clause subquery) but
  **grep-confirmed it is pure output metadata with zero consumers** — nothing in either
  `buildJoinSources` or the server's `buildJoin` reads or compiles it. It's a documented future
  direction, not a built capability.
- **Why this matters beyond freeflow**: LOTTR/TTTR (`calcTtrMeasure.js`) are built on the exact same
  `getBinnedYearNpmrdsDataForTmc` two-stage shape (bin-average, then percentile-of-bin-averages
  over an FHWA reporting-bin window instead of the whole year) — so this isn't a freeflow-specific
  wrinkle, it blocks *every* percentile-based InfoBox measure the same way, independent of the
  still-unanswered round-13 product question (replicate old ad hoc math 1:1 vs. surface current
  LOTTR/TTTR) — both options need a nested aggregation the platform can't do live, in one query,
  today.
- **This retroactively explains something that was previously just noted as a fact, not
  understood as necessary**: the old tool's own `pm3.authoritative_freeflow` precomputed Postgres
  table (round 13's original, later-dissolved "blocker") wasn't legacy cruft or a missed
  optimization — a live per-request nested-aggregation query is a real constraint the old system
  faced too, and precomputing was its answer. The new system is about to need the same answer for
  the same structural reason, not because ClickHouse can't do percentiles (it can, trivially — the
  test above proves that) but because *this specific pipeline's query shape* only supports one
  flat aggregation stage per component request.
- **Recommended path (not yet built, not yet decided by the user)**: precompute freeflow (and
  later LOTTR/TTTR/PHED if the product question resolves that way) into a small ClickHouse
  lookup table — one row per `(tmc, year)`, populated by a batch query using the exact faithful
  two-stage SQL already proven above — then register and join it **exactly like
  `aadt_distributions`** (source_id 2056/view_id 3524, `table_schema: 'clickhouse.avail'`,
  `type: 'gis_dataset'`, registered via a SQL script the user runs directly against `npmrds2`/
  `neptune:5758` — see `documentation/npmrds-data-sources.md` for the established registration
  recipe). This keeps every request-time query flat/single-stage (no new capability needed in
  `buildUdaConfig.js`/`buildJoin` at all) and mirrors the platform's own existing precedent for
  "value that needs its own aggregation pass, precomputed once, joined like meta" (`table1`/
  `table2` are exactly this pattern already). **Caveat, not yet resolved**: the batch query that
  *populates* the lookup table would need to run over the whole fact table grouped by
  `tmc, date, bin` — per [[feedback_ch_unfiltered_query_awareness]] / the CH unfiltered-scan hazard
  (no server-side `max_execution_time`/`max_memory_usage` cap), this must be scoped to the actual
  corpus's TMCs/years (not an unfiltered full-table pass) and run once by the user, not repeated.
  Scoping that batch query hasn't been attempted yet.
- **Not done**: no lookup table built or registered, no template/column shipped, no user decision
  on which path (approximate one-liner now vs. precompute-and-join later) to take. This round was
  prototype + architecture investigation only, matching the pattern of round 13.

**Round 13 (2026-07-09): Info Box family (Route Info Box / TMC Info Box / Route Compare
Component) — SCOPED, nothing built yet.** User picked this as the next "big missing graph
type" to investigate (the top-3 `no_equivalent` types the 2026-07-08 user decision said "we
100% are going to want to convert eventually"). Read all three old components plus their
shared base class and server-side data retrievers before writing anything down, per the
standing plan.

- **All three are literally the same rendering primitive, confirmed by direct comparison of
  `RouteInfoBox.jsx`/`TmcInfoBox.jsx`/`RouteCompareComponent.jsx`** (all in transportNY's
  `pages/analysis/components/tmc_graphs/`): a plain `<table>` (`TableContainer`) with **one row
  per entity, one column per author-selected measure, one scalar value per cell** — no chart at
  all. They differ only in what the row is: Route Info Box = one row per route; TMC Info Box =
  one row per TMC *within a single selected route* (`generateGraphData([route], ...)` — same
  "first-route-only" default already flagged in the a-bis item); Route Compare Component = a
  base row + N compare rows with a %-difference/arrow-colored cell instead of a plain value.
  Census size (all buckets, corpus-wide): Route Info Box 412, TMC Info Box 264, Route Compare
  Component 226 — Route Info Box is the largest of the three, matches the user's "info box"
  example.
- **No existing DMS section type covers this.** `graph_new` has no scalar/stat-table
  component (checked all of `graph_new/components/`: BarGraph, LineGraph, GridGraph, PieGraph,
  ScatterPlot, SunburstGraph, TreemapGraph — all chart types, none render N-measures-as-columns
  scalars). The platform's generic `spreadsheet`/`Table` section
  (`ComponentRegistry/spreadsheet/`) is row-per-dataset-record with author-configured columns —
  built for browsing a real dataset, not for binding to a UDA aggregate query that collapses a
  whole date range into one scalar per route/TMC. **Not fully ruled out as a reusable primitive
  it wasn't investigated deeply enough to say whether the UDA layer could feed it a
  one-row-per-route aggregate result** — worth a closer look before building a bespoke
  component, per the author-empowerment principle, but on first read it looks like a genuinely
  new query *shape* is needed regardless of which component renders it: every existing
  `TEMPLATE_SPECS` entry requires an `xAxis` grouping column (time-series bars/heatmap cells);
  an info-box query has no time axis at all — it's a pure aggregate GROUP BY tmc/route only.
- **Data-source audit, per `DATA_TYPES` group (`utils/dataTypes.js` + `GeneralGraphComp.jsx`'s
  `doFetchFalcorDeps`, which special-cases each group's server response shape):**
  - **`speed`/`travelTime` (BASE_DATA_TYPES, ungrouped)** — already have ClickHouse
    equivalents from prior rounds' work (`SPEED_EXPR`/travel-time templates). Reducers just need
    a Python port (weighted-by-miles average across TMCs, e.g. `speedAllReducer`/`indexReducer`
    in `dataTypes.js`) — no new data dependency.
  - **`hoursOfDelay`/`avgHoursOfDelay`, `co2Emissions`/`avgCo2Emissions`** — same, already built
    (`DELAY_EXPR`, `CO2_EXPR_*` from rounds 9/11/12).
  - **`tmcAttribute` (length, avg_speedlimit, aadt, vmt)** — **low risk, likely already
    available.** Server-side `getTmcAttributes.js` pulls `miles`/`avg_speedlimit`/`aadt`/
    `aadt_combi`/`aadt_singl` from the same per-TMC-per-year metadata (`tmcMeta`/
    `npmrds2.meta.{year}`) that the delay/CO2 templates already join against for AADT and
    length (round 9's `_AADT_*` fragments). Should be a thin wrapper over an existing join, not
    new data engineering.
  - **`dataQuality` ("Percent of Epochs Reporting")** — buildable but **blocked on the
    still-outstanding 0-as-missing sweep** (next-steps item 1, already parked). Old semantic
    (`getDataQuality.js`): `countIf(non-null) / total-possible-epochs-in-the-filtered-calendar *
    100` — Postgres `COUNT(col)` skips real NULLs. The new CH fact table stores `0` for missing
    readings (round 9's finding), so the direct port would need `countIf(col != 0) / count() *
    100` per bucket — mechanically fine, but shares the same latent conflation of "genuinely 0"
    vs "missing" as everything else in that parked item. Do them together.
  - **`indices`/`indices-byDateRange` (avgTT, freeflow, percentile95, percentile97,
    bufferTime, planningTime, miseryIndex, travelTimeIndex) — THE BLOCKER.** Traced to
    `avail-falcor/services/routeDataRetrievers/getIndices.js`: every one of these (except
    `avgTT`, plain `AVG(tt)`) is computed from `PERCENTILE_DISC(array[0.3, 0.95, 0.97])` over
    raw travel times **joined against a Postgres table `pm3.authoritative_freeflow` (columns:
    `tmc`, `year`, `tt_15_pct`)** — an external, precomputed freeflow-speed reference table, not
    something derived from the NPMRDS travel-time distribution itself. `grep`-confirmed **zero
    references to `freeflow`/`authoritative_freeflow` anywhere in `convert_old_reports.py` or
    `dms-server`** — this table has never been touched by the conversion effort and there is no
    known ClickHouse equivalent yet. The percentile math itself is a trivial CH port
    (`quantiles(0.3, 0.95, 0.97)(tt)` vs Postgres's `PERCENTILE_DISC`), but it's gated entirely
    on whether `pm3.authoritative_freeflow` (or an equivalent per-TMC-per-year freeflow value)
    is reachable from the new stack. **Superseded, see round 13's DAMA/pm3 follow-up below** —
    turns out no import is needed at all: `calcPhed.js`'s `calcFreeflowBaseThresholdSpeed`
    already recomputes freeflow live from the real fact table (`npmrds.s583_v982_NPMRDS_V6`) via
    a ClickHouse `quantile()` call, no external Postgres table involved. Also noticed a real
    discrepancy in
    the old SQL worth replicating faithfully rather than "fixing": the resolution-grouped query
    divides planningTime/miseryIndex/travelTimeIndex by `percentiles[1]` (the 30th-percentile
    travel time), while the by-date-range variant divides the same-named measures by `freeflow`
    (the authoritative table's value) instead — two different denominators for the same index
    name depending on which of the two InfoBox-family queries is asking.
- **Not started**: no template, no query builder changes, no new section/component type. This
  round is read-only investigation, matching the pattern of round 10's census.

**Round 13 continued (2026-07-09): the `authoritative_freeflow` blocker is DISSOLVED — freeflow
is computable directly from the live fact table, no external table needed.** User pointed at
the DAMA pm3/map21 pipeline (`avail-falcor/dama/routes/data_types/{map21,pm3}`) as a likely
current source; traced it before concluding anything:
- `pm3_calculator_2` (a separate top-level repo) is confirmed OLD/offline per the user — its
  `FreeflowCalculator.js` computes `fifteenthPctlTravelTime`, which matches `tt_15_pct`'s naming
  in the old `pm3.authoritative_freeflow` table closely enough that it was very likely what
  originally populated it, but it's disconnected from anything current.
- The live pipeline is `avail-falcor/dama/routes/data_types/map21/calcPhed.js`. Its
  `calcFreeflowBaseThresholdSpeed()` computes freeflow **live**: 15th-percentile travel time
  across the whole year, all hours/all days-of-week, converted to speed
  (`miles / p15_tt * 3600`) — queried directly against ClickHouse (`chQuery`) against
  `${schema_name}.${dataTableName}`, where `schema_name` is the hardcoded constant
  `NPMRDS_CH_SCHEMA_NAME = 'npmrds'` (`map21/constants.js`). **Now that the table-identity mixup
  above is resolved, this constant is confirmed correct** — `npmrds` is genuinely the same
  ClickHouse database as source 583's real fact table (`npmrds.s583_v982_NPMRDS_V6`), so this
  pipeline (when pointed at a view whose `dataTableName` resolves to `s583_v982_NPMRDS_V6`) reads
  the exact same data the converter's own templates do. **Practical upshot**: freeflow is a
  one-line ClickHouse calculated column (`quantile(0.15)(nullIf(tt, 0))` over the whole year, no
  hour/dow filter), same style as the existing `DELAY_EXPR`/`SPEED_EXPR` fragments — no Postgres
  import, no external reference table, no backfill question. This single fact unblocks the
  `freeflow` measure specifically.
- `calcTtrMeasure.js` computes the OTHER reliability measures — **LOTTR** (80th/50th percentile
  travel-time ratio) and **TTTR** (95th/50th, trucks) — over specific FHWA reporting-bin windows
  (`REPORTING_BINS`/`BIN_NAMES`: `AMP`=AM peak, `MIDD`=midday, `PMP`=PM peak, `WE`=weekend,
  `OVN`=overnight). **This is NOT the same formula as the old InfoBox's `percentile95`/
  `percentile97`/`bufferTime`/`planningTime`/`miseryIndex`/`travelTimeIndex`** (old tool: 95th/
  97th percentile of the raw resolution bucket, normalized by either the 30th percentile or the
  stored freeflow value) — LOTTR/TTTR are the current, federally-mandated, actually-maintained
  reliability metrics, but a faithful old-report conversion and a "use what's current" approach
  would produce different numbers. **Product question already asked, user said they'll answer
  later**: replicate the old ad hoc math 1:1, or surface real LOTTR/TTTR/PHED instead?
- Bonus corroboration, unprompted: `calcTtrMeasure.js`'s underlying data fetch
  (`getBinnedYearNpmrdsDataForTmc`) uses `AVG(CASE WHEN col > 0 THEN col ELSE NULL END)` — the
  exact same 0-as-missing nullification the round-9 fix (`nullIf(col, 0)`) already applies in
  `convert_old_reports.py`, independently validating that fix from a second, separately-written,
  currently-maintained system.
- **RESOLVED (2026-07-09): sources 1722/2001/1410 checked — real, usable, precomputed data
  exists, verified two ways per the user's method (metadata column check, then real-data check
  against known TMCs), not just schema.** All three confirmed Postgres-backed (`gis_datasets`
  schema, `npmrds2` pgEnv) — user-confirmed directly, matching the same cross-engine constraint
  that gated the AADT-distribution work (ClickHouse ↔ Postgres joins are impossible; these would
  need a **separate query**, not a `join.sources` entry — see full detail and exact column names
  in `npmrds-data-sources.md`'s updated 1722/2001/1410 rows). Headline results:
  - **1410** (5 single-year views, 2021-2025 only) has `speed_pctl_85` — **the only one of the
    three with a usable freeflow-equivalent column** (85th-percentile speed, exactly matching the
    old `pm3_calculator_2`'s speed-based freeflow definition) — plus `lottr_*`/`tttr_*`, all
    100% non-null across 52,127 TMC rows in the 2025 view. Richest measure set, narrowest year
    range.
  - **2001** ("Map 21 Extended," has a real all-years view, `view_id` 3490, 2016-2025) has
    `lottr_*`/`tttr_*`/`phed` (no freeflow/speed-percentile column) — 100% non-null across
    199,165 rows, real per-year counts every year including 2016 (i.e. covers years the new
    ClickHouse fact table itself can never reach). Best year coverage, no freeflow value.
  - **1722** (one experimental-looking view) is a strict column subset of 1410 with no
    freeflow/speed-percentile columns — lowest priority.
  - Both 1410 and 2001 spot-checked directly against 3 TMCs already used in converted reports
    (`120-04426`/`120-04427` from report 315, `120P05153` from report 751) — real, sane,
    non-null values every time, confirming this isn't just populated schema but genuinely
    computed data for TMCs this task already cares about.
  - Grain match is exact: the old InfoBox already reduced everything to **one value per TMC per
    year** (`getMaxYear(route)`), and these tables are already one-row-per-TMC-per-year — a
    direct join/lookup, no aggregation needed, once the cross-engine query is issued separately.

**Architecture correction (2026-07-09) — the "separate query" recommendation above is WRONG,
retracted.** User pushed back: every data-backed component in DMS today is built around issuing
exactly **one** query per instance, and that should stay true for InfoBox too — pointing at the
old tool's own multi-query-per-component behavior as justification for breaking that was the
wrong argument. Had an agent verify this directly against the actual code (not assumed) before
accepting the pushback:
- **Confirmed, structural, not incidental**: Card, the spreadsheet/Table component, and AVL
  Graph/`graph_new` all set `useDataSource: true, useDataWrapper: true` and route through the
  *identical* shared pipeline (`dataWrapper/useDataLoader.js` → `getData.js` →
  `buildUdaConfig.js`) — one `fetchKey`-driven effect, one `sourceInfo`/`externalSource`, one
  connection/engine per instance. `buildJoin`/`buildJoinSources` (`buildUdaConfig.js:850-933`) is
  the *only* mechanism these use to combine tables, and it's genuinely single-engine (confirmed
  server-side in `dms-server/src/routes/uda/query_sets/{postgres,clickhouse}.js`). Card's cells
  (`Card.jsx:76`) all read off one shared `state.data` array — no per-cell fetch.
- **One real exception exists platform-wide, and it's instructive**: the Map section
  (`ComponentRegistry/map/SymbologyViewLayer.jsx`'s `resolveFeatureProperties`) does its own raw
  `falcor.get()` against a layer's `view_id`, and — only when an author configures a "Linked
  Data/Join" — a **second**, independent `falcor.get()` against a different view, merged
  client-side per feature. This is bespoke, non-dataWrapper code, not a generic capability any
  other component can reach for. Exactly the "developer answers with a custom mechanism" pattern
  `CLAUDE.md`'s author-empowerment principle says to avoid defaulting to — confirms the *right*
  reaction to a cross-engine need is not "build a Map-style bespoke two-query component" but to
  find a same-engine way to get the value.
- **The Postgres PM3 tables (1722/2001/1410) are the wrong path for InfoBox, given this** — not
  because the data isn't real (it is, verified above), but because using it would require exactly
  the kind of bespoke multi-query composition the platform deliberately doesn't offer to authors.
  **Correction: we don't need them at all.** `calcFreeflowBaseThresholdSpeed`/`calcTtrMeasure`
  (traced above) compute their percentiles in **Node** (`simple-statistics`'s `quantile()`, after
  fetching raw rows) — but that's an implementation choice of that particular worker, not a
  ceiling on what ClickHouse itself can do: ClickHouse has native `quantile()`/`quantileExact()`/
  `quantiles()` aggregate SQL functions, so the identical freeflow/LOTTR/TTTR values are
  expressible as **calculated columns evaluated server-side inside ClickHouse**, in the exact
  same single query as every other measure — e.g. `quantile(0.15)(nullIf(ds.travel_time_all_vehicles,
  0))` for freeflow, same style as the existing `DELAY_EXPR`/`SPEED_EXPR` fragments, no join, no
  second connection, no Postgres involved.
- **The "no-xAxis aggregate" query shape is also not new platform capability, on closer look**:
  `buildUdaConfig.js` derives `groupBy` **generically from columns** (any column without an `fn`
  becomes a group-by key, line ~1253) and `fn` is a generic per-column property already used
  identically by Table/spreadsheet and `graph_new` (`.filter(c => c.show && c.fn)`, line
  ~1262) — `xAxis`/`categorize` are `graph_new`'s own vocabulary for calling out which grouped
  column is "the axis," not a separate platform mechanism. A query grouped by `tmc` (or route)
  alone, with calculated-column measures, is already expressible through the same generic
  mechanism every other template uses — just an unusual-for-this-codebase column configuration,
  not new capability. (The `fn` map itself only has `sum`/`avg`/`count`/`max`/`list` — no
  `quantile` preset — but calculated columns are already raw opaque SQL per the round-3
  join-key precedent, so the aggregation can live inside the calculated column's own expression
  without needing a new `fn` entry.)
- **Follow-on implication, not yet checked**: since the generic Table/spreadsheet component
  already renders arbitrary column-configured UDA rows, it may be able to render InfoBox's
  one-row-per-TMC/route shape directly with **no new component at all** — worth checking before
  assuming a bespoke stat-table component is needed.
- **Not done**: no calculated-column SQL written yet for freeflow/LOTTR/TTTR-equivalent values,
  no prototype template, no check of whether Table can actually consume a tmc-grouped (not
  time-grouped) UDA result as-is.
- **Recommended next step (pending the product-question answer — replicate old ad hoc math 1:1
  vs. surface current LOTTR/TTTR-style measures computed fresh)**: prototype a `quantile()`-based
  freeflow calculated column against source 583/982 directly (cheap, no new mechanism needed to
  test), and check whether the existing Table/spreadsheet component accepts a tmc-grouped result
  set without modification.

**Round 12 (2026-07-09): "Hours of Delay Graph" stragglers (day/hour/15-minutes/month) — BUILT,
plus a major corpus-wide data-coverage finding.** Picked up round 11's "not yet done" item —
the non-5-minutes resolutions of the per-TMC delay graph. Re-ran the census fresh (round 11's
own bugfixes weren't reflected in the stale round-10 census) to get an accurate straggler list:
**11 real instances across 8 reports**, not the 5-6 round 11 guessed from the stale data —
day×3 (reports 228/229/315), hour×1 + month×1 (both on report 392), 15-minutes×1 (report 54),
and 5× a literal `resolution: 'NONE'` string (reports 269/270/271, the same ancient
"version 2" id range as the round-10 `malformed_state_resolution` fix).
- **`resolution: 'NONE'` is NOT a bug — confirmed intentional, left unmapped.** Traced
  `transportNY`'s `utils/resolutionFormats.js`: `RESOLUTIONS['NONE'] = {name: 'None (data
  download only)', ...}`, and `'NONE'` is explicitly filtered out of the real UI dropdown's
  `resolutions` export (`.filter(r => r !== "NONE")`). It's a genuine old-tool sentinel for
  "no chart, raw data export only" — same "no chart equivalent" class as Route Map/Bar Graph
  Summary, not an ambiguous/malformed value to fix. Documented in a new code comment (`scripts/
  convert_old_reports.py`, above `TEMPLATE_SPECS`) so a future session doesn't re-diagnose it.
- **Built**: 4 new `TEMPLATE_SPECS` entries, same per-TMC/`categorize:"tmc"` shape as round 11's
  `tmc_delay_bar_graph_5min` — only the xAxis grouping expression differs, mirroring the
  weekday-template precedent (`ensure_graph_templates`'s calculated-xAxis-dict path, unchanged):
  `tmc_delay_bar_graph_day_tmc` (xAxis=plain `date` column — named `_tmc` to avoid colliding with
  the existing route-wide-sum `tmc_delay_bar_graph_day`), `tmc_delay_bar_graph_hour_tmc`
  (`intDiv(ds.epoch, 12) as hour`, matching avail-falcor's `queryHelpers.js` `getResolution()`
  hour case exactly), `tmc_delay_bar_graph_15min_tmc` (`intDiv(ds.epoch, 3) as quarter_hour`),
  `tmc_delay_bar_graph_month_tmc` (`toStartOfMonth(ds.date) as month`). 4 new `GRAPH_TEMPLATE_MAP`
  entries. No changes needed to `analyze_graph`'s single-comp resolution logic (already generic
  across resolution values) or `ensure_graph_templates` (the calculated-xAxis-dict path already
  existed for the weekday template).
- **Verified 2 ways, split by resolution because 2 of the 3 new resolutions have no live example
  with real underlying data (both pre-existing, unrelated gaps — see below):**
  - **day (real instances, all 3 reports converted + live-verified, Playwright)**: 228 ("E Shore
    to Round Pond", new page `2188944`) and 229 ("north- south exit 20", new page `2188967`) both
    render real multi-TMC stacked-by-date bars, distinct per-TMC legend colors, zero console
    errors. 315 ("July 7, 2018 Suspected Bridge Hit Hutch SB at Westchester Ave", new page
    `2188979`) is the best confirmation: a single ~1400-hour delay spike on 2018-07-08 (the day
    after the incident date in the report's own title) against a near-zero baseline on every
    other date — exactly the old tool's real-world use case (spot the incident-driven delay
    spike per TMC), not a coincidence.
  - **hour/15-minutes/month (mechanism verified directly against ClickHouse, not through the
    two target reports)**: reports 54 ("Hamilton County", 15-minutes) and 392
    ("Aviation-Quaker Delay 2018", hour + month) both converted cleanly (gap reports show no
    `unmapped_graph` for the Hours-of-Delay-Graph type) but render **zero bars live** — root-caused
    to two *pre-existing, unrelated* gaps, not the new templates:
    - Report 54's route comps are both `20160101`-`20161231` (confirmed directly against
      `admin2.reports.route_comps`) — entirely inside 2016. **CORRECTED 2026-07-09** (see the
      corpus-wide finding below, which had the same error): the original mechanism given here
      ("these 6 rural TMCs specifically lack coverage," checked against a table called
      `avail.npmrds`) was checked against the wrong ClickHouse table — `avail.npmrds` is an
      unidentified, unrelated table (user-confirmed 2026-07-09: "IDK wtf it is... assume we
      should never query this table for anything in life"), not source 583's real fact table
      (`npmrds.s583_v982_NPMRDS_V6`). The corrected mechanism is simpler and still fully
      unfixable: the real fact table's data starts in 2017 (user-confirmed), and 2016 data can
      never be added to the new system at all — so report 54 is blank because **the whole new
      system has zero rows for any TMC in 2016**, not because of anything specific to these 6
      TMCs. Same practical outcome (permanently blank, not a defect), corrected reasoning.
    - Report 392's all 3 route comps reference route_id 1440, which is missing from **both** old
      `admin2.routes` and the new catalog (the pre-existing `route_missing_everywhere` gap class,
      same as report 874's route 5445) — every route entry gets an empty `tmc_array`, which
      throws client-side in `ReportRouteList.jsx` (`JSON.parse` on an empty string) and blocks
      the whole page's comparisonSeries wiring, so no AVL Graph on the page ever fires a query
      (hour AND month graphs both affected identically — confirmed not template-specific).
    - To positively verify the hour/15-minutes/month SQL shape itself (independent of these two
      reports' data issues), ran the exact `DELAY_EXPR` + each new xAxis expression directly
      against ClickHouse using report 315's TMCs (`120-04426`/`120-04427`, real 2018 coverage):
      all three produced real, non-zero, sanely-varying values — hour-bucketed delay peaks at
      16:00-18:00 (afternoon rush, matches real-world traffic patterns), 15-minutes produced the
      expected 96 distinct buckets (0-95), month produced one row per calendar month Jan-Jul 2018
      with real varying totals. Confirms the template mechanism is correct; reports 54/392 are
      genuinely blank for reasons unrelated to this round's work.
- **New corpus-wide finding (2026-07-09, found while root-causing report 54's blank graph),
  CORRECTED 2026-07-09 (round 13 follow-up) after a wrong-table mixup — see below.** Original
  claim used a table called `avail.npmrds`, checked via raw ClickHouse queries
  (`SELECT count() FROM avail.npmrds WHERE date < '2018-01-01'` → 0;
  `SELECT min(date) FROM avail.npmrds` → `2018-01-01`) and concluded the new fact table starts
  2018-01-01, 437/868 reports (50%) affected. **User confirmed (2026-07-09): `avail.npmrds` is
  not the real fact table — "IDK wtf it is... assume we should never query this table for
  anything in life."** The real, current, actually-queried-by-every-template fact table is
  **`npmrds.s583_v982_NPMRDS_V6`** (source 583/view 982 — confirmed by direct user query,
  `SELECT distinct(date) FROM npmrds.s583_v982_NPMRDS_V6 order by date asc`), which has data
  from **2017 through present** (June 30 2026 at last check) — **2016 is the only year that can
  never be recovered**, not 2016-2017. **Scope of the mixup, checked and narrow**: neither
  `convert_old_reports.py` nor `census_old_reports.py` ever contains a literal `avail.` SQL
  reference (grep-confirmed) — both resolve the fact table via `source_id: 583` through the DMS
  platform's own source/view registration, never via raw SQL. **No converted/live-verified
  report page and no round-10 census number used the wrong table** — this was confined to a
  handful of standalone diagnostic ClickHouse queries in this round (this finding + report 54's
  mechanism above) plus one mischaracterization in the earlier (2026-07-08) AADT-distribution
  work (see that section below — wording-only, no implementation impact).
  **Corrected quantification** (recomputed directly against `admin2.reports`, same query
  shape as the original 437 figure — reproduced that exact number with a `< 20180101` cutoff
  before switching to the corrected boundary): **265 of 868 reports (31%)** have a route comp
  with `settings.endDate` before **2017-01-01** (down from the previously-reported 437/50% —
  172 reports that were wrongly written off now have at least partial real 2017+ coverage).
  Pending confirmation of the *exact* earliest date on `npmrds.s583_v982_NPMRDS_V6` (user
  confirmed "back thru 2017" but not the precise day) — the 265 figure uses `2017-01-01` as the
  boundary and may shift slightly once that's pinned down. This remains a real, standing
  data-availability gap (~31% of the corpus permanently affected for any report whose entire
  range predates 2017), just smaller than originally reported (437/50%), and per
  the user's 2026-07-09 direction (see next-steps item 0) it's not worth chasing a backfill —
  treat pre-2017 report date ranges as a standing "old data, not available" gap-log case.
- **Not done**: bulk-converting the ~130 five-minutes Hours-of-Delay-Graph instances beyond
  report 11 (round 11's other "not yet done" item) — still untouched, still pending user
  direction; unrelated to this round's day/hour/15-minutes/month work.

**Round 11 (2026-07-09): "Hours of Delay Graph" (5-minutes) — BUILT + live-verified, plus a
real platform bug found and fixed.** Picked up census item 3b. Traced the old component
(`HoursOfDelayGraph.jsx`, confirmed against `GeneralGraphComp.jsx` and avail-falcor's
`getHoursOfDelay.js`) before building anything, per the standing plan:
- **Not the same shape as the existing delay templates.** `RouteBarGraph` (already converted)
  sums delay across every TMC in the route into one bar per date/weekday.
  `HoursOfDelayGraph.generateGraphData([route], ...)` destructures only `routeComps[0]`
  (`getActiveRouteComponents()` defaults to `[routes[0].compId]`, never "every comp" — same
  single-route default already flagged, unresolved, in the a-bis item below) and renders
  **one bar-series per TMC** in that one route (`keys: route.tmcArray`), not a route-wide sum.
- **Measure is hardcoded, not mislabeled-as-speed by omission**: `getDisplayData()` always
  returns `hoursOfDelay`, fully ignoring `state.displayData` — worse than the generic
  DEFAULT_DISPLAY_DATA fallback the census flagged, since there's no user-choosable measure
  for this graph type at all.
- **Corpus check (correct `activeRouteComponents`/single-route resolution, not the converter's
  existing all-comps fallback)**: 138 instances / 98 reports. Resolution: 131 five-minutes, 3
  day, 1 each of hour/15-minutes/an ambiguous case. `dataColumn`: 131 `travel_time_all` (0
  missing/needing a default). `costPerHour` (optional $/hour multiplier): set on only 1/138.
- **Implemented** (`scripts/convert_old_reports.py`): `analyze_graph` special-cases
  `"Hours of Delay Graph"` — measure forced to `hoursOfDelay` (skips the displayData/
  extra_measures_dropped logic entirely, since the old component never reads it); `assigned`
  resolves to exactly one comp (first `activeRouteComponents` match in report order, else the
  report's first route comp) instead of the general all-comps-when-absent fallback — so no
  `mixed_resolutions_on_graph` gap is possible for this type. New gap kind
  `cost_per_hour_not_applied` (fires once, on the one real instance) — not built, v1 scope.
  New template `tmc_delay_bar_graph_5min`: same `DELAY_EXPR`/AADT-distribution join as the
  day/weekday delay templates, xAxis=`epoch` (reuses the base template's existing column,
  0-287 aggregated across the date range — bounded, not per-timestamp), and a **real `tmc`
  categorize column** in place of the synthetic comparison-series `__series` discriminator
  every other template carries (this graph type never fans out across routes, so `tmc` is the
  actual per-series dimension) — `ensure_graph_templates` extended with a `categorize` spec
  field, same plain-name-or-full-dict shape `xAxis` already has. `overrides.aadt` and
  `color_range` wiring both fall out for free (unchanged mechanisms — `DELAY_EXPR` still
  contains the AADT fragment; "Hours of Delay Graph" was never in `COLOR_RANGE_GRAPH_TYPES`,
  confirmed against the old component, which never reads `colorRange`).
- **Platform bug found + fixed while live-verifying** (`dms-server/src/routes/uda/query_sets/
  clickhouse.js`): a plain joined column selected without an explicit alias (here, `ds.tmc`)
  came back **`undefined` in every row** — root-caused by pulling the exact production query
  from ClickHouse's own `system.query_log` and reproducing it directly against the live DB
  (VPN/CH reachable, confirmed via `/ping`): CH only drops a selected column's table qualifier
  from its default output name when that bare name is unambiguous across the query's joined
  tables. `ds.epoch` (no collision) comes back keyed `"epoch"`; `ds.tmc` (collides with
  `ny_2025_tmc_meta`'s own `tmc`, the join key) comes back keyed **`"ds.tmc"`** — but
  `getResponseColumnName()` always strips to the bare name and looks up `row["tmc"]`, which is
  always `undefined`. Not a template-specific bug: no earlier template had ever selected a
  real (non-calculated) column with a same-named join partner as an actual output attribute —
  they only ever used `tmc` as a join key, never as a projected/categorize column. **Fixed**:
  new `withExplicitAlias()` helper forces every unaliased attribute to carry its own explicit
  `AS <bare_name>` in both the plain and comparison-series-fan-out SELECT lists, so the output
  key never depends on ClickHouse's collision-dependent default. Symptom before the fix: bars
  rendered but as one flat aggregated series (all 13 bars identical color `#D72638`), plus two
  React "duplicate key" console warnings from the legend/series code keying off the same
  `undefined` value for every row.
- **Verified 4 ways**: (a) direct ClickHouse repro — ran the real production SQL (pulled
  verbatim from `system.query_log`) both before the fix (`ds.tmc` comes back as literal key
  `"ds.tmc"`) and after (adding `AS tmc` explicitly comes back keyed `"tmc"`, real distinct TMC
  values, real non-zero delay sums); (b) 2 new unit tests in `tests/test-uda.js`
  (`testClickHouseExplicitAliasing`), full UDA suite green (72/72, +2, no regressions);
  (c) live — converted report 11 ("West Shore Highway Northbound 8 to 9 am", new page `2188935`,
  a genuinely multi-TMC point-drawn route resolved to 14 TMCs, a good stress test), Playwright
  before-fix: 13 bars, 1 legend entry, 1 uniform color, 2 console warnings; after the
  server auto-restarted (nodemon) with the fix: 14 legend entries / 14 distinct swatch colors /
  each x-axis bar correctly stacked into 14 colored segments, zero related console warnings;
  (d) dry-run + real conversion both clean, gap report is just the known non-target
  `graph_layout {h,x,y}` entry (no `w` — `size:"12"`).
- **Not yet done**: the 5 stragglers (day×3, hour×1, 15-minutes×1, 1 ambiguous/ill-formed
  resolution) and bulk-converting the other ~130 five-minutes instances beyond report 11 —
  both pending user direction, same "capability built and proven on one example, scale is a
  separate decision" pattern as every other round.

**Round 10 (2026-07-08): full-corpus gap census — DONE (user-picked next step; awaiting user
direction before building anything).** New `scripts/census_old_reports.py` runs ALL 868
`admin2.reports` through the converter's own analyze path (imports `analyze_graph`/
`flatten_route_comps`/`route_settings_gaps` from `convert_old_reports.py` so it can't drift;
analysis-only — no writes, no falcor point-route resolution, bulk SQL reads only, ~40s).
Outputs: `scratchpad/npmrds-sub/old-reports/census/census.json` (per-report detail) +
`census_summary.md` (ranked tables). Headline numbers:
- **Convertibility today**: 16 full / 527 partial / 311 none / 14 no-graphs; 1,626 of 7,098
  graph instances (23%) map to a template.
- **Unmapped bucket split**: no_equivalent 2,742 (50% — Route Map 849, Bar Graph Summary 649,
  Route/TMC Info Box 676, Compare/Difference 568; ALL ruled gap-log-only by the 2026-07-08
  decisions), buildable 2,450 (45%), tail 280 (5%). I.e. **half of all unconverted graph
  content sits behind the deliberate no-build decisions**, not missing measures — the biggest
  strategic lever if bulk conversion ever becomes the goal.
- **Within buildable, the pre-census prediction (reliability measures) was WRONG**: all
  reliability measures combined ≈ 365 instances (planningTime 144, travelTimeIndex 51, avgTT
  20, bufferTime/percentile97 ≤1 each). The real mass is **existing measures at missing
  resolutions**: speed 1,105 + travelTime 502 unmapped instances, by resolution 5-minutes
  1,051 / hour 341 / None 321 / day 214 / weekday 191 / month 187 / 15-minutes 132.
  Top single keys: Route Bar Graph×speed×5-minutes (290 inst/123 reports), ×speed×hour
  (261/23), ×travelTime×5-minutes (245/57), Route Line×avgHoursOfDelay×5-minutes (152/80).
- **Two cheap, high-leverage census finds**: (a) resolution `None` (~321 buildable instances,
  e.g. TMC Grid×speed×None 95/89 and Route Line×speed×None 84/81) — comps with NO resolution
  setting at all; if the old client defaulted absent resolution to `5-minutes`, these map to
  **already-existing** templates with a one-line converter default (verify old
  `getResolution()`/component defaults first). (b) **"Hours of Delay Graph"** (tail type,
  138 inst/91 reports) has the 2nd-highest single-key full-report flip count of the whole
  corpus (28 reports become fully convertible from this one type — census labels its measure
  "speed" only via the DEFAULT_DISPLAY_DATA fallback, same mislabel class as the round-3
  Traffic Volume fix; its real semantics are unexamined and likely map onto the existing
  weighted-delay infra).
- **Gap kinds corpus-wide**: unmapped_graph 5,472/838 reports; extra_measures_dropped
  865/522 — **decomposed post-census against the old client source (2026-07-08)**: 809 of
  865 (94%) sit on no_equivalent types (Route Info Box 386, Route Compare Component 212,
  TMC Info Box 211 — genuinely multi-measure stat panels, e.g. the 8-measure reliability
  panel, but the whole graph is already skipped/unmapped so the extra-measures gap is
  subsumed and moot there); only **52 instances are on a convertible type — Route Line
  Graph — and those are real fidelity loss**: its two displayData slots are LEFT/RIGHT
  y-axes (`RouteLineGraph.jsx:80` default `['speed','none']`, `setDisplayData1/2`,
  `yAxis: i===0 ? "left" : "right"` — a dual-axis chart; the converted page keeps only the
  left-axis measure). Bar/summary/map/grid components destructure `[displayData]` and only
  ever read the FIRST entry (and the corpus has zero multi-measure instances on them
  anyway). Fix options for the 52: emit a second AVL Graph section for the right-axis
  measure (converter-only), or a real dual-axis AVL Graph capability (platform).
  mixed_resolutions_on_graph 638/244 (comps genuinely disagree — per-arm resolution would
  need platform design); color_range 400; relative_date 49/9; mixed_data_columns 44/14;
  route groups 13/11; station_comps 2.
- **Route-level work quantified**: 797 distinct routes referenced; 518 point-drawn (need
  old-falcor TMC resolution at convert time — mechanism exists, just slow); 31 need catalog
  inserts; **231 missing everywhere** (deleted from old `admin2.routes` and never imported —
  broken in the old system too; preserve-as-broken per the 874 precedent). Also found: the
  Routes Data catalog is ~2× duplicated (64,790 rows, only 32,563 distinct route_ids, +33
  rows with NULL route_id) — pre-existing import debt, harmless to the converter (it checks
  before insert), noted for whoever owns catalog cleanup.
- **Converter crash fixed while running the census**: reports ~211–271 (an ancient
  `"version": 2` client shape) store a whole route-comp OBJECT under `state.resolution`
  where later reports store a string — `analyze_graph` crashed on the unhashable dict (would
  have crashed real conversion too). Fixed in `convert_old_reports.py`: non-string
  `state.resolution` is ignored (falls back to the comps' own resolution) + gap-logged as new
  kind `malformed_state_resolution` (14 instances/12 reports corpus-wide).

**Round 9 (2026-07-08): report 751's truck CO₂ NULL — root-caused and FIXED.** The round-8 suspect
(`coalesce(ds.travel_time_freight_trucks, ds.travel_time_all_vehicles)`) was close but the real
mechanism is a representation mismatch: the CH fact table's travel-time columns are plain
`Float64`, **NOT Nullable** — missing readings are stored as `0`, not NULL (old Postgres `npmrds`
stored real NULLs, which the old tool's `COALESCE(truck, all_vehicles)` handled; the converter
copied that coalesce faithfully but it can never fire against 0s). `3600/0 = inf`, and one `inf`
in an epoch's year-long `avg` makes the whole epoch `inf`, which ClickHouse serializes as JSON
`null`. Diagnostic (TMC `120P05153`, 2019): truck tt = 0 on **71,009 of 103,856 rows touching all
288 epochs** → all-NULL truck response; passenger tt = 0 on only 328 rows across 88 epochs →
exactly the partial (220/289) passenger nulls. **Fix**: `_SPEED_CAR_EXPR`/`_SPEED_TRUCK_EXPR` in
`scripts/convert_old_reports.py` now use `coalesce(nullIf(col, 0), nullIf(fallback, 0))` — 0 →
NULL restores the old semantic (avg skips the row; per-row fallback to all-vehicles works again).
**Verified**: (a) offline — the full 3-way-join query with the fixed expressions returns 288/288
clean epochs for BOTH variants (truck 0.0011–0.0387, passenger 0.0037–0.1464, zero NULL/NaN/inf);
(b) live — patched both template rows (`2188660` truck / `2188661` passenger, 29 occurrences
each), `--replace` re-ran 751 (new page `2188894`), single Playwright load: all three CO₂
sections render real heatmaps (truck legend 0.0009–0.049; passenger 0.0031–0.185 with the
overnight gaps now filled), zero console errors. The two truck sections render identical data —
correct/expected, `overrides.baseSpeed` is still deliberately ignored. Gap report unchanged (23
items, same classes).
**Noticed, NOT fixed (same 0-as-missing class, pre-existing, shared templates)**: `SPEED_EXPR`
(`miles*3600/tt_all`) has the same latent inf-poisoning wherever `travel_time_all_vehicles = 0`
rows exist (none on 120P05153, but possible on low-traffic TMCs overnight → silently null
days/epochs on speed graphs), and `tmc_travel_time_bar_graph_day` averages raw
`travel_time_all_vehicles` including 0-rows (drags the avg down vs. the old NULL-skipping
behavior). Left alone per isolate-shared-code-changes — the speed/travel-time templates are
live-verified on 3 reports; fix+verify separately if it surfaces.

**Round 9 (continued): `overrides.aadt` — DONE + live-verified.** Old semantics confirmed
against the actual old source before implementing:
- delay (`getHoursOfDelay.js` `getAADT`): a truthy override **replaces the AADT wholesale**
  (before facil/distribution weighting); falsy (`'0'`, `''`, null) falls through to the real
  column — i.e. report 1061 comp-7's `aadt: '0'` is query-inert, same class as the peak flags,
  and is no longer gap-logged.
- CO₂ (`getCo2Emissions.js` `calcEmissions`): the override is a TOTAL AADT redistributed by the
  real car/truck proportions — `(override * (aadt_car / aadt_total)) || aadt_car`, the JS `||`
  falling back on 0/NaN (aadt_total = table1.aadt, so the SQL guard is `if(table1.aadt > 0, …)`).
Implementation (all in `scripts/convert_old_reports.py`, conversion-time — templates stay
override-free): the override lives per route comp but the calculated column is shared by every
comparison-series arm, so it's applied per GRAPH via substitution on the section's CLONED
template stateJson (same place color_range is wired), and only when every assigned comp agrees
on one truthy value. New constants `_AADT_DELAY_FRAGMENT`/`_AADT_DELAY_OVERRIDE`/
`_AADT_CAR_OVERRIDE`/`_AADT_TRUCK_OVERRIDE` + `AADT_OVERRIDE_SUBS`; `aadt_override_of()`
normalizer; per-graph decision loop in `convert_report`; `aadt_override` param on
`build_graph_section_data`. New gap kinds: `aadt_override_mixed` (comps disagree — can't express
per-arm), `aadt_override_not_applied` (drift guard: template row no longer contains a known AADT
fragment — loud, never silently converts without the override). Per-comp `overrides` gap now
excludes `aadt` (other keys — baseSpeed, thresholdSpeed — still log). Overrides on comps feeding
skipped graphs are subsumed by those graphs' `unmapped_graph` entries.
**Verified 4 ways**: (a) standalone — 6-case test of normalization + substitution + drift-gap +
passthrough, all passing; (b) fragment byte-match confirmed against all 4 live AADT-consuming
template rows (2188429 day-delay, 2188680 weekday-delay, 2188660/2188661 CO₂); (c) offline CH —
delay expr on TMC `120-11332` (real `aadt=0`): unmodified expr returns 0/day (matches live pages
pre-fix), override-substituted expr returns real 15–34 h/day across 5 days; (d) live —
`--replace` re-ran 1071 (**new page `2188906`**): gap report dropped from 18→16 items losing
exactly the per-comp `overrides {aadt: '20000'}` entries, no `aadt_override_mixed`/
`not_applied` fired, and the full-width "Hours of Delay Weekdays 2026-2024" graph now renders
real, non-zero, spiky delay data (peaks ~150h) where it was invisible/all-zero before. By-day
delay sections show real value ranges in their legends (e.g. 0.39–21.0 h).

**Known platform issue, logged NOT fixed (user direction 2026-07-08: "don't get caught up on
the width thing — mark it as a gap"): bar graphs draw squeezed into the left edge of narrow
sections.** Found while live-verifying 1071's aadt work. Facts established: the server responses
are complete and correct (all 9 dates, distinct values, verified via captured bodies); the
chart's `flex-1` container really is tiny (~50px in a w=4 section, DOM-measured svg widths
57/56/49/52/29px), while the section box is ~293px; the adjacent byValue linear legend renders
full-precision float tick labels ("20.919005675724687") whose max-content width is plausibly
what eats the row; EVERY BarGraph on the page is squeezed to a degree (w=6 → 182px chart,
w=12 weekdays → 564px in a ~1050px section) — the wide ones just look OK-ish. Two candidate
fixes were attempted and **REVERTED** (kept out of the tree per isolate-shared-code-changes):
(1) a ResizeObserver in `useSetSize` (avl-graph/utils/index.js — hook only re-measures on
window resize); (2) default/compiled tick formatting in `Legend.jsx`'s linear legends (also
fixes a latent crash: section-config `valueFormat` is a d3-format STRING but the wrappers pass
it raw to `format(value)`). **Neither changed the rendered geometry on a fresh load even though
Vite verifiably served the edited modules** — so the real mechanism is NOT yet pinned down
(maybe the rendered legend isn't Legend.jsx's linear variant, maybe the constraint isn't the
legend at all). Follow-up should start from that unexplained fact. Affects visual QA of any
converted report with non-full-width bar graphs (1071 w=4/w=6 sections); data underneath is
correct.

## Status: All 6 reports CONVERTED and gap-audited current as of round 7 (1070, 1071, 1061, 751, 1045, 874 — 2026-07-08); CO₂ emissions column + weekday-resolution bar graphs DONE + verified live; five platform bugs found this session, four fixed (comparison-series ORDER BY on calculated columns; ClickHouse ambiguous-identifier on 3-way joins; GridGraph color-scale domain/range truncation — round 7; Falcor sibling-query cache collision — round 8, previously split into its own task and now fixed there). **Round 7 (2026-07-08): user visual QA on round 6's color wiring caught two real defects the standalone/JSON-level verification missed — bar graphs rendered as one solid color, GridGraph heatmaps never showed the far end of a >3-color palette. Root-caused as two independent, unrelated issues (see below), both fixed, unit-tested (182/182 passing, +7 new), and live-verified across 1061/1045/1071/751. New BarGraph capability built (`colors.byValue`, plus a "Color by Value" SectionMenu toggle) rather than working around the gap.**

**Round 8 (2026-07-08): the Falcor sibling-cache-collision task is FIXED** — see
`planning/tasks/completed/falcor-sibling-query-cache-collision.md`. Root-caused as a client-side
cache-key gap (nothing in the Falcor path identified which section issued a request) and fixed by
folding a per-section discriminator into the UDA `options` before it's stringified into the path.
Live-verified on report 1071: both previously-blank sibling pairs (Speed/Travel Time AM Peak By
Day, and the PM Peak pair) now render real, distinct data. Verifying report 751 surfaced a second,
previously-masked, unrelated bug:
**New gap — report 751's truck CO₂ sections return real-but-NULL data, not the Falcor bug.** With
the Falcor collision fixed, "CO2 Trucks Actual" and "CO2 Trucks 50 MPH" now issue genuinely
separate requests and the server returns a distinct, complete response to each (confirmed via
network capture — 289 rows each) — but `avg_co2_emissions_avg` is NULL for all 289 rows in both
truck responses, while the sibling passenger CO₂ section (same report) correctly resolves 220/289
non-null values. Suspect: `coalesce(ds.travel_time_freight_trucks, ds.travel_time_all_vehicles)` in
`scripts/convert_old_reports.py`'s truck `CO2_EXPR_TRUCK` — either `travel_time_freight_trucks`
isn't the real column name on view 982, or it's null for a reason the passenger variant's parallel
`travel_time_passenger_vehicles` isn't. Previously indistinguishable from the Falcor collision since
both produce the same "silently blank, no error" symptom. Not investigated further this session —
logged as a follow-up, non-blocking (same precedent as report 751's other known issues: gap-log and
don't block further conversion work).

**Round 6 (2026-07-08) COMPLETE: iterating on already-converted reports to pick up two generic fixes — `color_range` false-positive gap fixed + real wiring built, `graph_layout` width now wired to section `size` (theme `transportnyv2`). All 6 reports `--replace`-re-run and live-verified with both fixes in place: 1070, 1071, 751 (done earlier this round), then 1061, 1045, 874 (completed after the ClickHouse unfiltered-probe-query hazard — see below — was fixed and the pause lifted). Color wiring now visually confirmed across every colorful graph type that has a template (Route Bar Graph day + weekday resolution, TMC Grid Graph) and correctly left untouched on Route Line Graph. Width wiring confirmed on `w` values of 4, 6, 8, and 12. Zero console errors on any of the 6 live pages. No new gaps found — 874 and 1045/1061's non-color/layout gaps are unchanged from their prior conversions (route-type/measure gaps, `overrides.aadt`, `relative_date`, mixed-resolution/mixed-dataColumn — all previously known, not regressions).**

**Round 7 — color rendering, root cause + fixes (2026-07-08).** The user looked at round 6's
"working" color wiring on real pages and flagged it as suspicious: bar graphs "appear to be solid
purple," and a grid graph showed "shades of purple but no green." Both turned out to be real,
independent defects — not a data-range coincidence — found by reading the actual rendering code in
`packages/dms/src/ui/components/graph_new/`, not by re-inspecting JSON:

1. **GridGraph bug**: the wrapper (`components/GridGraph.jsx`) built its value→color scale as
   `scaleLinear().domain([min, mid, max]).range(colors)` — a fixed 3-point domain zipped against
   whatever length the palette array happens to be. d3 truncates a mismatched domain/range pair to
   the shorter side, so any palette longer than 3 colors (5-color and 9-color diverging palettes,
   exactly what this converter wires in) silently only ever used its **first 3 entries** — the far
   end of the palette (orange in 1061's 9-color purple→orange scale, green in 1045's 5-color
   purple→white→green scale) was unreachable regardless of actual data spread. **Fixed**: extracted
   a shared `buildValueColorScale(min, max, colors)` helper (new file location:
   `components/utils.js`) that spreads one domain stop per color instead of hardcoding 3, so the
   whole palette is reachable. GridGraph now calls this helper instead of building the scale inline.
2. **BarGraph — missing capability, not a bug**: `avl-graph/utils/index.js`'s `getColorFunc`
   colors *by series index* (`colorRange[i % colorRange.length]`), never by value — confirmed the
   same holds for every other graph_new type except GridGraph (checked ScatterPlot, TreemapGraph,
   PieGraph, SunburstGraph, LineGraph — all categorical-only; GridGraph is the *only* existing
   value-scaled type, and it's a heatmap, not a bar chart, so it doesn't cover this case). Each of
   these converted reports has exactly one series (one route) per bar graph, so every bar got
   `colorRange[0]` — the palette's first color, constant. The old client's actual semantic ("purple
   = more delay, orange = less") colors each bar by its own magnitude, which no current avl_graph
   type supports. **User chose to build this as new capability** (not document as a limitation, not
   drop the wiring) after confirming no existing type/config already covers it.
   - Added `colors.byValue` (boolean, default off — off preserves today's categorical per-series
     behavior for every other BarGraph in the platform) to `components/BarGraph.jsx`: when set,
     builds a value scale via the same `buildValueColorScale` helper (min/max now tracked across
     all bars while building `dataFromProps`) and passes it as the `colors` prop — `getColorFunc`
     already special-cased `typeof colors === "function"` to pass a scale through unchanged, so no
     changes needed on the `avl-graph/BarGraph.jsx` render side. Legend switches from the
     categorical per-series swatches to a linear gradient (mirrors GridGraph's legend) when
     `byValue` is set.
   - New author-facing control: "Color by Value" toggle in the "Bar Graph Layout" SectionMenu group
     (`ComponentRegistry/graph_new/config.jsx`) — `colors.byValue`, alongside the existing
     Scheme/Reverse controls. Any future author can opt a single-series magnitude bar chart into
     this, not just converted reports.
   - Converter (`scripts/convert_old_reports.py`) now sets `colors.byValue: true` whenever it wires
     `color_range` into a `BarGraph`-shaped template (Route Bar Graph old type), matching the old
     semantic; GridGraph-shaped templates (TMC Grid Graph) get no such flag since GridGraph's
     value-scaling is unconditional.
3. **Two more bugs found and fixed while live-verifying the above** (both would have shipped
   silently without a real Playwright reload — standalone/JSON checks can't catch either):
   - First live pass crashed every page with a `byValue` bar graph: `TypeError: scale.domain is not
     a function` in `Legend.jsx`. Root cause: `buildValueColorScale`'s degenerate-input branches
     (a single-color palette; a perfectly constant series, `min === max`) returned bare arrow
     functions instead of real d3 scales — fine for `colorFunc(value)` calls, but the Legend's
     linear renderer calls `.domain()`/`.range()` on whatever it's given, unconditionally. **Fixed**:
     both branches now return a real `scaleLinear()` with identical range endpoints instead of a
     plain function, so `.domain()`/`.range()` always exist.
   - Second pass (after that fix) surfaced a *pre-existing, latent* bug in `avl-graph/components/
     Legend.jsx`, exposed for the first time by a real constant-value series (1071's several
     all-zero Hours-of-Delay bar graphs, gap-logged `overrides.aadt` — real, correct `0` output):
     `VerticalLinearLegend`/`HorizontalLinearLegend` keyed their 5 rendered tick elements by tick
     *value*, not position — with a degenerate (min===max) domain all 5 ticks share one value,
     producing React's "two children with the same key" console errors. **Fixed**: both legends now
     key by index (`i`) instead of value — ticks are a fixed-order, fixed-length list, so index is
     the correct key regardless. This is a shared-component fix (also used by GridGraph's legend)
     but only fires on a degenerate domain, which nothing had exercised before BarGraph's new mode.
   **Verified**: (a) `tests/graphColorScale.test.js` (new, 7 cases) — covers the full-palette-reach
   fix, the single-color/constant-series degenerate cases, and a direct regression test asserting
   the returned scale always has working `.domain()`/`.range()`; full package suite green (182/182,
   +7, no regressions). (b) Live, via headless Playwright against the local dev stack: re-ran 1061 →
   1045 → 1071 with `--replace` to pick up `byValue`, screenshotted each. 1061: Hours-of-Delay bars
   show orange (routine) with purple spikes on the actual high-delay days; Speed bars transition
   purple (slower, older years) → orange (faster, newer years) — both exactly match the old
   semantic. 1045: the TMC Grid Graph now shows real green columns alongside purple ones (previously
   zero green); the weekday bar graph shows genuinely distinct per-bar colors instead of solid
   purple. 1071 (13 sections, the most complex converted report, including several genuinely
   all-zero delay graphs from the known `aadt=0` gap): zero console errors, every bar graph
   correctly value-colored, all-zero graphs correctly render as one uniform neutral color (the
   palette's middle stop) rather than crashing or misleading. 751 (GridGraph-only, not reconverted —
   the domain fix is a pure frontend change) re-verified as a regression check: CO2 heatmap
   unchanged/still correct, zero console errors, the two known-blank sibling-cache-collision
   sections still blank (unrelated, already tracked).
   **Files changed**: `packages/dms/src/ui/components/graph_new/components/utils.js` (new
   `buildValueColorScale`), `GridGraph.jsx` (use the helper), `BarGraph.jsx` (`byValue` mode + min/
   max tracking + linear legend branch), `avl-graph/components/Legend.jsx` (tick key fix),
   `patterns/page/components/sections/components/ComponentRegistry/graph_new/config.jsx` ("Color by
   Value" toggle), `scripts/convert_old_reports.py` (sets `byValue` for BarGraph color wiring),
   `packages/dms/tests/graphColorScale.test.js` (new).

**RESOLVED (2026-07-08) — the ClickHouse unfiltered-probe-query hazard that paused this task is fixed.**
Client-side preventive gating (Option B, `buildUdaConfig.js`'s `skipFetch`) implemented and
live-verified in `planning/tasks/current/clickhouse-unfiltered-probe-hazard.md` — stray unscoped
queries no longer fire at all. Routine Playwright-driven page loads for round 6's 1061/1045/874
verification produced zero stray `system.processes` entries (not re-checked exhaustively, but no
hang/timeout symptoms observed across 3 report loads + 5 raw `dms raw get` calls each).

**Real BarGraph rendering bug found + fixed (2026-07-08, round 6, surfaced while live-verifying
1071).** Report 1071's "Hours of Delay Weekdays 2026-2024" section (and other standalone
Hours-of-Delay bars) rendered **completely blank — no legend, no axis, nothing** — despite the
server returning correct, real (if all-zero, due to the known `aadt=0` gap) data, confirmed via
raw network capture. Root cause: `packages/dms/src/ui/components/graph_new/components/
BarGraph.jsx`'s `dataFromProps` computation used `if (value)`/`if (v)` truthy checks when
aggregating bar values — since `0` is a legitimate real measurement but also falsy in JS, every
row got silently dropped whenever its true value was exactly `0`, leaving `data`/`keys` empty,
which cascades through to suppress the legend, axes, and bars all at once (not just an invisible
zero-height bar). **Fixed**: replaced the truthy checks with the file's existing `strictNaN()`
helper (already used elsewhere in the same file for sort comparisons) so a real `0` is kept and
only genuinely missing/NaN values are dropped. **Verified live**: re-loaded `/report_1071` after
the fix — the previously-blank standalone Hours-of-Delay sections now show a real legend and a
correct x-axis with real date labels (bars themselves are still invisible, which is *correct*
given the real value is genuinely `0` — not a rendering bug). The Speed/TravelTime "By Day"
sibling pairs remain blank, unaffected by this fix — that's the separate, already-tracked Falcor
sibling-cache-collision bug (see above), a different root cause. **Not fixed, left as a follow-up
(subjective/design call, not an obvious bug)**: `avl-graph/BarGraph.jsx` lines 243-249 still
clears the Y-axis domain entirely when min/max are both exactly `0` — after the primary fix,
delay graphs show legend + x-axis but no Y-axis. User was asked whether to also fix this; deferred
pending direction.

### Next steps — standing recommendations (2026-07-08, post-round-9 diagnostic)

**DONE, round 19 (2026-07-09) — see that block at the top of this file.** Per-report/per-year Info
Box template selection is now generalized (`graph_max_year`/`ensure_pm3_join_template`), closing
this recommendation. 70 distinct reports (51 via Route Info Box, 25 via TMC Info Box) now resolve
their pm3 join year automatically instead of needing a hand-built template per report/year.

**DONE, round 20 (2026-07-10) — see that block at the top of this file.** The Route Info Box
pagination-length bug (`simpleFilterLength`'s ungrouped-aggregate fan-out miscount, in both
`clickhouse.js` and `postgres.js`) is fixed, tested, and live-verified against report 796 — closes
round 19's #1 next-step priority. **Next candidates, in rough priority order**: (1) the
reliability bin is still hardcoded to `amp` (AM peak) in both templates — a per-report/per-comp
bin selection (matching the old tool's peak-button semantics) would unlock more of the 268/168-
instance bucket precisely rather than defaulting every converted report to AM peak regardless of
its own peak/off-peak/weekend settings; (2) the Hours-of-Delay-Graph stacked-vs-single-color
product question (round 18) — a decision, not engineering work; (3) a Route Compare Component
variant (round 13's third Info Box family member, still unbuilt).

**Below this point is pre-round-18 context** — still valid for capability areas Info Box work
hasn't touched (reliability-measure bulk conversion, mixed-resolution semantics, etc.), but no
longer the first thing to read for "what's next." State as of round 9: rounds 1–9 finished all 6
approved gap-coverage picks (1070/1071/751/1061/1045/874, all live-verified), plus
`overrides.aadt`, the truck-CO₂ 0-as-missing fix, the Falcor sibling collision (own task,
completed), and the CH unfiltered-probe hazard (own task, completed). The approved report list
is exhausted — remaining work is capability selection, not a queue. Recommended order:

0. **RESOLVED (round 12 → corrected round 13, 2026-07-09): pre-2017 data gap, ~31% of the
   corpus, independent of template completeness — NOT worth chasing a fix.** Round 12 originally
   checked this against a table called `avail.npmrds` and concluded a 2018-01-01 cutoff affecting
   437/868 reports (50%). **User confirmed 2026-07-09 that `avail.npmrds` is not the real fact
   table** ("IDK wtf it is... assume we should never query this table for anything in life") —
   the real, currently-queried-by-every-template fact table is `npmrds.s583_v982_NPMRDS_V6`
   (source 583/view 982), confirmed by the user to hold data from **2017 through present**; only
   **2016 is permanently unrecoverable** ("we can never get 2016 year data into the new
   system"). Corrected corpus quantification (recomputed directly against `admin2.reports`):
   **265 of 868 reports (31%)** have a route comp with `settings.endDate` before 2017-01-01 (down
   from the previously-reported 437/50%) — exact boundary pending confirmation of
   `npmrds.s583_v982_NPMRDS_V6`'s precise earliest date, may shift slightly. Scope of the mixup
   was checked and is narrow: `convert_old_reports.py`/`census_old_reports.py` never reference
   `avail.` literally (grep-confirmed) — every converted/live-verified report page and every
   round-10 census number already used the correct table via `source_id: 583`, unaffected. See
   the round-13 entry at the top of this file for the full trace. **User direction (2026-07-09):
   not worth chasing further** — a 2017 backfill "may be possible" but 2016 never will be, and
   "it isn't a huge deal." Treat any report whose entire date range predates 2017 as a standing
   "old data, not available" gap-log case; no further investigation planned.
1. **0-as-missing sweep on the shared speed/travel-time templates** (data-quality class; user
   2026-07-08: "definitely need to diagnose at SOME POINT" — deliberately deferred, NOT started).
   Round 9 proved the mechanism (CH fact-table travel-time columns are plain Float64, `0` where
   old Postgres had NULL → `3600/0 = inf` → one inf poisons the epoch's year-long avg → CH
   serializes JSON null → blank/missing epochs) but fixed only the two CO₂ expressions. The
   identical latent defect remains in `SPEED_EXPR` (`miles*3600/tt_all`, inf wherever
   `travel_time_all_vehicles = 0`) and in `tmc_travel_time_bar_graph_day` (avg over raw 0-rows
   silently drags the mean down vs. the old NULL-skipping behavior). Recipe already proven in
   round 9: offline CH query to find a TMC/year with `travel_time_all_vehicles = 0` rows
   (120P05153 had none — try low-traffic TMCs; if none exist anywhere relevant, downgrade
   urgency but still fix the exprs for future conversions) → `nullIf(col, 0)` the expressions →
   patch the live template rows → `--replace` affected reports → one Playwright load each.
   Isolated change per `[[feedback_isolate_shared_code_changes]]`.
2. ~~**Full-corpus gap census**~~ **DONE (round 10, 2026-07-08)** — see the round-10 block at
   the top of this file and `scratchpad/npmrds-sub/old-reports/census/census_summary.md`
   (regenerate any time with `python3 scripts/census_old_reports.py`, ~40s, read-only).
3. **Build what the census ranked top among buildable gaps — pending user's pick.** The
   pre-census prediction (reliability measures) was wrong: they total only ~365 instances.
   Census-informed candidate order (all numbers = unmapped instances / reports touched):
   a. ~~**Absent-resolution default**~~ **DONE but VACUOUS (round 10 cont., 2026-07-09)** —
      the one-line default (absent comp resolution → `'5-minutes'`) is implemented in
      `analyze_graph` and unit-verified, but only **13 comps in the entire corpus** lack a
      resolution setting (the old store always writes one at creation), so it mapped zero new
      instances. **The census's "None"-resolution keys were misread**: `None` is the
      converter's round-3 ambiguity sentinel for MIXED-resolution graphs, not absent data.
      The real unlock for those instances is (a-bis) below — a user decision, since it
      revisits round 3's deliberate ambiguous→skip rule.
   a-bis. **Old-client-faithful mixed-resolution semantics — QUANTIFIED, awaiting user
      decision (2026-07-09).** The old client resolved every graph's resolution as the FIRST
      active comp's setting (`GeneralGraphComp.getResolution()` reads
      `[0].settings.resolution`, fallback '5-minutes') — deterministic, never a consensus.
      Corpus simulation of that rule: **+193 mapped instances (1,626 → 1,819) across 132
      reports**, top keys all on already-existing templates (TMC Grid×speed×5-min +89,
      Route Line×speed×5-min +80, Route Line×travelTime×5-min +10); fully-convertible
      reports 16→17. Faithful implementation must ALSO mirror the old comp-assignment
      semantics, which are component-dependent: RouteLineGraph (no explicit
      `activeRouteComponents`) shows all comps *matching* the picked resolution;
      plain GeneralGraphComp-derived components default to **the first comp only** (NOT
      "every comp" as the converter's round-2 assumption says); TmcGridGraph renders only
      ONE route regardless (`generateGraphData([route], ...)`). **Checked all 6 converted
      reports: no already-converted graph is affected by the assignment-default discrepancy**
      (their keyless graphs are all unconverted types — e.g. 1071's is the Route Map — or on
      single-comp reports), so nothing live is wrong today; this only gates NEW conversions
      of mixed/keyless graphs. Before implementing: verify per-component
      `getActiveRouteComponents`/`getResolution` overrides for each convertible type
      (RouteLineGraph's mutual recursion with the base getResolution suggests an override
      grep missed — read the whole file, not grep excerpts).
   b. ~~**"Hours of Delay Graph" graph type**~~ **BUILT for every real resolution the corpus
      uses (5-minutes round 11, day/hour/15-minutes/month round 12, both 2026-07-09)** — see
      the round-11/round-12 blocks at the top of this file. Real semantics were NOT the
      weighted-delay infra as-is (per-TMC bars, not a route-wide sum) and surfaced a real
      ClickHouse output-column-aliasing bug, now fixed. `resolution: 'NONE'` (5 instances, 3
      reports) is a deliberate old-tool "no chart, data download only" sentinel, confirmed
      against source — correctly stays unmapped, not a gap to close. **Not done**: bulk-
      converting the ~130 remaining 5-minutes instances beyond report 11, and the day/hour/
      15-minutes/month stragglers beyond the 5 reports converted in round 12 — both still
      pending direction (this was always about proving the capability on one example per
      shape, not a bulk-conversion pass). Two of round 12's 5 target reports (54, 392) convert
      cleanly but render blank live for reasons unrelated to the new templates — see item 0
      above (54, pre-2018 date range) and the round-12 `route_missing_everywhere` note (392).
   c. **Missing-resolution variants of already-built measures** (the bulk: speed 1,105 +
      travelTime 502 inst): Route Bar Graph at 5-minutes (290/123, epoch-grouped bars — same
      query shape as the grid graph), hour (261/23), month (99/45), 15-minutes (115/11),
      weekday speed/travelTime (78+36); hour/month/15-min need calculated bucketing columns
      (`intDiv(ds.epoch, 12)`, month from date, etc.) — mechanical, the weekday template is
      the precedent.
   d. **Reliability measures** (planningTime 144/40 day-resolution bar graphs is the only
      sizable key; travelTimeIndex 51, avgTT 20, rest ≤6): **superseded by round 14's finding —
      NOT a plain `quantile()`-style calculated column.** These (and freeflow/InfoBox's
      percentile measures) need a two-stage aggregation (bin-average, then percentile-of-bin-
      averages) that the platform's single-flat-query UDA pipeline structurally can't express
      live; round 14 recommends precomputing into a small per-tmc-year ClickHouse lookup table
      joined like `aadt_distributions`, pending a user decision. See round 14's block at the top
      of this file before starting this.
   **User decisions on the census findings (2026-07-08):**
   - **Top-3 multi-measure types WILL be converted eventually** — Route Info Box, TMC Info
     Box, Route Compare Component are no longer indefinitely ruled out ("we 100% are going
     to want to convert those top 3 graph types eventually"). Not next, but the
     no_equivalent bucket's biggest chunk is now future work, not permanent gap-log.
   - **Dual-axis Route Line Graphs (52 instances): implement REAL dual-axis** when that work
     is tackled — do NOT use the two-stacked-sections workaround. User thinks a dual-axis
     capability may already exist somewhere in the platform ("i kinda thought that feature
     already existed") — **investigate whether AVL Graph/avl-graph already supports a right
     y-axis before building anything**.
   - **Absent-resolution default = 5-minutes, CONFIRMED against old source** (user believed
     5 minutes; verified two ways: comps are created with `resolution: '5-minutes'`,
     transportNY `analysis/reports/store/index.js:1887`, and the graph layer's
     `getResolution()` falls back to `'5-minutes'` when absent,
     `graphClasses/GeneralGraphComp.jsx:306`). Item 3a proceeding on this basis.
   Also noted while verifying (for the mixed_resolutions follow-up, NOT implemented): the
   old client resolved a graph's resolution as **the FIRST active comp's** setting
   (`getResolution()` reads `[0].settings.resolution`), and e.g. RouteLineGraph then
   filters the displayed comps to those *matching* that resolution — i.e. mixed-resolution
   graphs deterministically showed only the first comp's resolution cohort. A faithful,
   deterministic conversion of the 638 mixed_resolutions instances could copy that (pick
   comp[0]'s resolution + drop non-matching comps from the graph's assignment) instead of
   today's skip-and-gap-log; needs its own verification pass against more old components
   before trusting it generally.

Parked / pending user decisions (unchanged, do not silently resurrect):
- Y-axis on all-zero bar graphs (`avl-graph/BarGraph.jsx:243-249` clears the domain when
  min===max===0; legend + x-axis render, y-axis blank) — user direction still pending.
- Bar-graph width squeeze — parked per user ("don't get caught up on the width thing"); the
  real mechanism is still unpinned (two candidate fixes reverted — see round-9 notes).
- Difference/Compare graph shapes, synthetic `overrides.baseSpeed` data, stat-panel/map graph
  types — all ruled gap-log-only (2026-07-08 user decisions).
- Submodule sits on two `wip`-titled commits (`901d9d53`, `3e80a9b` outer) — reword + bump the
  outer pointer when the user wants a checkpoint; git push is user-only per
  `[[feedback_never_push_to_git]]`.
- **Route Info Box pagination length is wrong** (round 18): reports `"Rows 1 to 50 of 100493"`
  when only 1 real row exists. Root cause: `simpleFilterLength`'s `seriesVariants.length` branch
  computes `armCountExpr = "count(*)"` (raw filtered epoch-row count) whenever `countGroupBy`
  (groupBy minus the seriesKey) is empty — which it always is for `route_info_box_reliability_2021`
  (its only groupBy column IS the seriesKey, `__series`). Fix belongs in
  `dms-server/src/routes/uda/query_sets/clickhouse.js`'s `simpleFilterLength`, not in this script.
  Not yet fixed. TMC Info Box doesn't use the `seriesVariants` length path at all (plain `tmc`
  groupBy, no fan-out) so it likely doesn't share this bug — not directly checked.

**Reports 1061, 1045, 874 — round 6 re-run, live-verified (2026-07-08), resumed after the
ClickHouse hazard fix.** All three re-converted with `--replace` to pick up the color_range +
graph_layout fixes that had only been exercised on 1070/1071/751 so far:
- **1061** (new page `2188770`): 3 graphs convert (`graph-comp-57` Route Bar Graph/hoursOfDelay/day,
  `graph-comp-58` Route Bar Graph/speed/day, `graph-comp-62` TMC Grid Graph/speed/5-minutes). This
  is the **first live confirmation of color_range wiring on a Route Bar Graph *day*-resolution
  report**, and the first report where the wiring is visually confirmed on two different graph
  types (Route Bar Graph + TMC Grid Graph) at once — both render the report's real 9-color
  purple/orange diverging palette (`#542788`…`#b35806`), confirmed both in the raw section JSON
  (`display.colors.value`) and visually in a live screenshot. `graph_layout`: `size:"12"` (×2,
  full-width bars) and `size:"4"` (grid) written correctly from old `w`, gap now omits `w` (only
  `h`/`x`/`y` remain, as expected). The previously-nondeterministic `graph-comp-60` (mixed
  5-minutes/day/hour resolution TMC Grid Graph) now deterministically gaps every run (the round-3
  fix holding up under a fresh run, not just the original bugfix run). Zero console errors, all 3
  graphs show real non-zero data. `overrides.aadt` gap still present (`I-787 Exit 2 Southbound`,
  same known class as before). **No Falcor sibling-cache-collision observed** — the two Route Bar
  Graph sections share a route but have genuinely different calculated columns (delay formula vs.
  speed formula), so their options strings aren't identical and the collision precondition doesn't
  fire here; worth noting as a data point that the bug needs identical queries, not just a shared
  route, to trigger.
- **1045** (new page `2188782`): same 3 graphs convert as round 5 (`graph-comp-6` Route Line
  Graph/travelTime, `graph-comp-7` TMC Grid Graph/speed/5-minutes, `graph-comp-10` Route Bar
  Graph/hoursOfDelay/**weekday**). **First live confirmation of color_range wiring on the weekday
  bar graph** and **first live exercise of the width fix on non-12 `w` values** (`size:"6"`,
  `"8"`, `"6"` from old `w` values 6/8/6, previously only `w:12` had been exercised). Visually
  confirmed: the Route Line Graph correctly keeps the template's default 20-color palette
  (untouched, not a colorful type); the TMC Grid Graph and the weekday Bar Graph both render the
  report's real 5-color purple→white→green diverging palette (`#7b3294`…`#008837`). Zero console
  errors, all 3 graphs show real data (weekday bar graph shows 3 nonzero bars — a real data-range
  artifact, not a rendering bug). Gap count/content otherwise unchanged from round 5 (29 items:
  unmapped 5-minute-resolution Route Bar Graphs/TMC Info Box/Route Map/Bar Graph Summary/Route
  Compare Component, `relative_date` ×5, `extra_measures_dropped` ×5).
- **874** (new page `2188794`): unchanged from round 5 — 0 of 2 old graphs convert (both
  `Route Map`/`Route Info Box`, no template exists for either), so there's nothing for the
  color_range/graph_layout fixes to exercise on this report; re-run is a clean no-op regression
  check. `color_range` gap still correctly fires (skipped `Route Map` is a colorful type). Gap
  report unchanged (7 items). Live-verified: page loads, zero console errors, no chart data (as
  expected — matches round 5 exactly).

**Report 751 — round 6 re-run, live-verified (2026-07-08).** `--replace`-converted (new page id
`2188754`). `color_range` wiring confirmed **visually** for the first time (previously only
checked via raw JSON): "CO2 50 MPH" (comp-1, passenger) renders a real heatmap using the report's
exact diverging red→yellow→green palette (`#d7191c`…`#1a9641`), not the template's default. "CO2
Trucks Actual"/"CO2 Trucks 50 MPH" (comp-2/comp-3, truck) render empty axes only — this is the
already-known, already-logged Falcor sibling-cache-collision (Manifestation 2: identical query
since `overrides.baseSpeed` isn't implemented), exactly matching round 5's original finding, not a
new issue. `graph_layout` gap now correctly shows only `h`/`x`/`y` (no `w` gap, sections use
`size:"12"` — all 3 converted graphs are full-width in the old layout too, so no visible width
change here, but the code path is exercised). Zero console errors.

**Report 1071 — round 6 re-run, both fixes confirmed live (2026-07-08).** `--replace`-converted
(new page id `2188726`). Verified directly against real section rows + a live page load
(Playwright, headless Chromium, `http://npmrds.localhost:5173/report_1071`, zero console errors):
(a) **`size` width fix**: sections got `size: "4"`/`"6"`/`"12"` matching old `layout.w` — visually
confirmed in the screenshot (3 narrow bar graphs side-by-side under one full-width line graph,
matching a 4+4+4=12 row). (b) **`color_range` wiring**: the report's real 5-color diverging palette
(`#d7191c…#1a9641`) is on every converted Route-Bar-Graph section's `display.colors.value`; the two
Route-Line-Graph sections (not a colorful type) correctly kept the template's default 20-color
palette untouched — first live confirmation that the gating logic picks the right graphs, not just
a blanket rule. `overrides.aadt` still gap-logged (route uses TMC `120-11332`, the same
known-`aadt=0` TMC from round 4 — real, correct `0` delay output, not a defect).
**New finding**: several bar graphs render completely blank in the browser despite the server
returning correct non-empty data for each individually (confirmed via raw network capture, not
just console-log absence) — root-caused as the *same* Falcor sibling-cache-collision bug already
tracked in `falcor-sibling-query-cache-collision.md`, but a **more general instance** than
previously seen: this one hits plain single-series BarGraph pairs (no comparison-series fan-out/
UNION at all), disproving that file's "fixed for ClickHouse only" note — that fix only covered the
fan-out `ORDER BY` symptom, not this plain options-string-collision case. Full details + evidence
in that task file's new "Manifestation 1 re-confirmed" section. Per the existing user precedent on
751 (non-blocking, gap-log and move on), not fixed here — logged as a gap for 1071 and left for
that task.

1. **Optional/low-priority**: implement `overrides.aadt` on the weighted-delay/CO₂ calculated
   columns — real `ny_2025_tmc_meta.aadt` is `0`/unreliable for some TMCs (confirmed for
   `120-11332`, report 1071's route — the old report used `overrides.aadt: '20000'` for exactly this
   reason), so those specific routes will show a real (correct) `0` weighted delay until the
   override is wired in. Not a correctness bug in the join/formula itself — see round-4 notes.
3. **DONE (round 8)**: the Falcor sibling-query cache collision is fixed — see
   `planning/tasks/completed/falcor-sibling-query-cache-collision.md`. Report 751's two truck CO₂
   grid sections still render empty, but now for a different, unrelated reason (a genuine NULL in
   the truck CO₂ formula — see the new round-8 gap above), not the cache collision.
4. **`dataQuality` measure and "TMC Info Box"/"Route Info Box" graph types remain unmapped** — these
   are stat-panel component types with no chart equivalent in the current AVL Graph model (same
   treatment as `Route Map`/`Bar Graph Summary`), not attempted. Report 1045's `month`-resolution
   route comp (`comp-1`) also turned out to be orphaned — not assigned to any graph — so month
   resolution still has no exercised/converted example; not a blocker, just noting it's untested.

**Report 874 "Zizhao_119EB_Delay_AADT" — CONVERTED (round 5, last of the approved picks).** Page
`2188696` (`/report_874`), 0 of 2 old graphs convert — both are `Route Map`/`Route Info Box`, the
same never-built stat-panel/map types gap-logged consistently since round 1 (no new template gap
here; genuinely nothing to build). 9 routes preserved (RRL + Add-a-Route only, no AVL Graph
sections). Gap-logged: `color_range`, 2×`mixed_data_columns_on_graph` (both graphs assigned all 9
routes, cycling `travel_time_all`/`_truck`/`_passenger`), `aadt` measure dropped (only the first
displayData measure converts), and `route_missing_everywhere` for route_id `5445` (all 9 route
comps reference this one route id, which doesn't exist in old `admin2.routes` **or** the new
catalog — genuinely gone in the old system too, not a conversion defect; preserved as a broken
reference, matching "preserve old data as-is" over inventing a fix). Live-verified: page loads,
zero console errors (no chart data to render, so nothing to visually check beyond that).

**Report 1045 "Rochester Inner Loop" — CONVERTED (round 5, continued).** Page `2188684`
(`/report_1045`), 3 of 17 old graphs convert: `graph-comp-6` (Route Line Graph, travelTime,
5-minutes), `graph-comp-7` (TMC Grid Graph, speed, 5-minutes), and **`graph-comp-10`** (Route Bar
Graph, hoursOfDelay, **weekday resolution** — new capability, see below). 14 gap-logged
(`Route Map`×2, `TMC Info Box`×4, `Route Bar Graph`×6 at 5-minute resolution — the weighted-delay/
speed templates only exist at day/weekday resolution, not 5-minutes — `Route Compare Component`,
`Bar Graph Summary`×2), plus `color_range` and 5×`relative_date` (`startDate: '=>yearof'`, a new
old-settings shape not seen before, correctly gap-logged by the existing `relativeDate` check —
no new code needed). All 3 converted graphs verified live rendering real data (user-confirmed,
single page load).

- **New capability: "weekday" resolution bar graphs.** Old `getResolution()`'s `'weekday'` case
  (`trim(to_char(date, 'day'))` in Postgres) groups rows by day-of-week name instead of calendar
  date — e.g. "Total Hours of Delay by day of week" sums delay across every Monday in the range
  into one bar, every Tuesday into another, etc. (same `fn: "sum"`/`DELAY_EXPR`/join as the
  existing day-resolution template — only the grouping column differs). Added `WEEKDAY_EXPR =
  "toDayOfWeek(ds.date, 1) as weekday"` (ISO Monday=1..Sunday=7, a plain sortable integer rather
  than a name string — a future author-facing 1-7→day-name label lookup is a display refinement,
  not attempted). New template `tmc_delay_bar_graph_weekday` + `GRAPH_TEMPLATE_MAP` entry for
  `("Route Bar Graph", "hoursOfDelay", "weekday", "travel_time_all")`.
  `ensure_graph_templates` extended (small, backward-compatible change) to accept a full column
  dict for `TEMPLATE_SPECS[...]["xAxis"]` (not just a plain-column-name string to look up) — needed
  because this is the **first calculated x-axis/groupBy column** in the converter; the existing
  code only supported swapping in an existing externalSource column by name.
- **Real platform bug found + fixed: comparison-series fan-out ORDER BY breaks on calculated
  groupBy/orderBy columns.** Building the weekday bar graph surfaced two related bugs in
  `buildUdaConfig.js`'s `mappedOrderBy` construction (client-side, shared code — this is the
  **first** calculated column ever used with `sort` set, so the bug was latent until now):
  1. A comparison-series arm's table-alias-stripping heuristic (`reqNameWithoutAS.split('.').
     slice(1).join('.')`, meant to turn a bare ref like `"ds.tmc"` into `"tmc"`) naively split on
     *every* `.` in the string — for a calculated expression like `"toDayOfWeek(ds.date, 1)"` this
     produced the nonsense key `"date, 1)"` (splits on the one `.` inside `ds.date`, keeping
     everything after it), which ClickHouse then rejected with a syntax error
     (`Unmatched parentheses`).
  2. Fixed that by skipping the strip for calculated columns (`isCalculatedCol(col)`, the same
     detection already used by `refName`/`attributeAccessorStr`/`accessor()` for this exact class
     of problem) — but the *raw expression* itself (`"toDayOfWeek(ds.date, 1)"`) still isn't valid
     in the outer position: the fan-out wraps each arm as `SELECT * FROM (<arm SELECT ... FROM ds
     LEFT JOIN ...>) AS fanout ORDER BY ...`, and the **outer** `ORDER BY` can only address the
     arm's SELECT-level output alias (`weekday`) — `ds` (and any other inner table alias) is out of
     scope there. Using the raw expression failed with `Unknown expression or function identifier
     'ds.date'` (confirmed via the exact ClickHouse error, pasted from the server log by the user —
     **lesson: check the server log for the real error before reconstructing it from browser
     console captures**, see `[[feedback_check_server_logs_first]]`). **Final fix**: for a
     calculated column in a comparison-series context, use the alias (the part after `" as "`,
     e.g. `"weekday"`) instead of the raw expression.
  **Verified two ways**: (a) new unit test in `packages/dms/tests/buildUdaConfig.test.js`
  ("calculated column with sort: orderBy uses the alias, not the mangled raw expression"), full
  suite green (130/130, no regressions); (b) live — user confirmed all graphs on `/report_1045`
  render data after the fix, including the new weekday bar graph.
  **Separately noticed while debugging, NOT fixed**: the fan-out's `unprojectedGroupBys` logic
  (`dms-server/.../query_sets/clickhouse.js`, the round-2 fix) still double-projects a calculated
  groupBy column — the arm SELECT ended up with both `toDayOfWeek(ds.date, 1) AS weekday` (the
  real projected attribute) *and* a second bare, unaliased `toDayOfWeek(ds.date, 1)` (from
  `unprojectedGroupBys` failing to recognize the calculated groupBy expression as already
  projected, presumably because `getResponseColumnName` has the same naive-dot-split issue
  server-side that the client fix addressed). Harmless — just a redundant SELECT column, no error —
  so not fixed here; worth folding into `falcor-sibling-query-cache-collision.md` or its own
  follow-up if a future calculated-groupBy case actually breaks on it.

**Round 6 (2026-07-08) — iterating on already-converted reports (user direction: address gaps in
already-converted reports, starting with the first one, 1070; explicitly stopped after 1070 to
check in):**

- **`color_range` false-positive gap — fixed + verified.** Same bug class as round 3's
  `peak_flags`/`month_setting` false-alarm: `convert_report()` gap-logged `color_range`
  unconditionally whenever the old report had a non-empty `color_range` array, regardless of
  whether any of the report's graphs actually read it. Traced the old client
  (`transportNY/.../tmc_graphs/index.jsx`'s `GRAPH_TYPES` registry, `isColorfull: true` flag) and
  confirmed against each component's own source (`RouteBarGraph.jsx`, `RouteMap.jsx`,
  `TmcGridGraph.jsx`, `RouteDifferenceGraph.jsx`, `TmcDifferenceGrid.jsx` all build a d3
  `.range(colorRange)` color scale from it) that only **5 of the 23 old graph types** ever consume
  `colorRange`: Route Bar Graph, Route Map, TMC Grid Graph, Route Difference Graph, TMC Difference
  Grid. Report 1070's only graph is a **Route Line Graph** — not in that set — so its `color_range`
  gap was a false positive, identical in kind to round 3's finding. **Fixed**: added
  `COLOR_RANGE_GRAPH_TYPES` constant + gated the gap on `old_graph_types & COLOR_RANGE_GRAPH_TYPES`
  in `scripts/convert_old_reports.py`. **Verified**: (a) standalone check against real report JSON
  — 1070's graph types don't intersect the set (gap correctly suppressed), 751's do (has TMC Grid
  Graph/Route Difference Graph/TMC Difference Grid — gap correctly still fires, confirming the fix
  doesn't just blanket-disable the check); (b) live re-run — `--replace`-converted 1070 (new page id
  `2188702`), gap report shrank from 3 items to 1 (`graph_layout` only, see below).
  **Wiring DONE (same session, after the width fix below).** `color_range` → the new template's
  `display.colors` (`{type: "palette", value: <old color_range>}`, replacing the template's default
  palette wholesale — mirrors how the old report actually used it) for any **converted** graph whose
  old type is in `COLOR_RANGE_GRAPH_TYPES`, via a new `color_range` param on
  `build_graph_section_data()`. The top-level `color_range` gap now only fires when a *skipped*
  (unconverted) graph is a colorful type — i.e. only when the capability is actually lost, not
  whenever a converted colorful graph already carries the real color forward. **Verified
  standalone** (no live report actually exercises this yet — 1070's only graph isn't a colorful
  type): constructed a fake template + old_graph and confirmed (a) a "TMC Grid Graph" old_graph gets
  `colors.value` replaced with the real `color_range`, (b) a "Route Line Graph" old_graph is left on
  the template's default palette (untouched), (c) the gap fires when a skipped graph is colorful
  (e.g. "Route Map"), (d) it does not fire when skipped graphs are all non-colorful (e.g. "Route
  Info Box"). **Re-ran 1070 twice more after this change (ids `2188718`)** as a regression check —
  gap report unchanged (still just `{h, x, y}`), confirming the new code path is a true no-op for
  non-colorful reports. **Live-verified end-to-end (2026-07-08, round 6 complete)** on 751 (TMC
  Grid Graph heatmap), 1061 (Route Bar Graph + TMC Grid Graph together), and 1045 (TMC Grid Graph +
  weekday Route Bar Graph) — real diverging palettes rendering correctly on every colorful
  converted graph across all three reports, default palette correctly untouched on non-colorful
  types (Route Line Graph).
- **Stale generic fixes — 1070 re-run picked them up for free.** 1070 was converted in round 1,
  before round 2 added title-template translation (`{data}`/`{type}`/`{name}` → literal text). A
  plain `--replace` re-run (no code change needed) fixed it: the graph's title is now literally
  "Route Line Graph, Speed" (was `"{type}, {data}"`), confirmed by reading the new section row
  (`dms raw get 2188704`) directly — `"title":"Route Line Graph, Speed"`. **General takeaway for
  the rest of this round-6 pass**: every report converted before a later round's generic fix needs
  a `--replace` re-run to actually pick it up; the fix landing in the script doesn't retroactively
  touch already-created pages.
- **`graph_layout` width — DONE.** Investigated whether old `layout.{x,y,w,h}`
  (react-grid-layout, 12-col) has *any* current-side target, per the user's steer that section
  width is a real, UI-exposed author control today. Confirmed via
  `src/dms/skills/creating-pages-from-a-design-pattern.md` §4.2.5 and direct code
  (`patterns/page/components/sections/sectionArray.jsx`, `sectionMenu.jsx`): every section
  (including AVL Graph, no type-based opt-out) has a top-level `size` field (sibling to
  `element`/`rowspan`/`padding`/`height` on the section's `data`, set via `updateAttribute('size',
  ...)`), read by `sectionArray.jsx` to pick a `theme.sizes[size].className` (colspan) — a real,
  existing, unconditional primitive, not a new-capability build. `theme.sizes` is theme-specific
  though (codebase-default/catalyst/avail: 6-col fractional `"1/3"|"1/2"|"2/3"|"1"`; transportNY's
  `themev2.js`: 12-col numeric `"1".."12"`) — the CLI couldn't confirm which theme `npmrds_sub` runs
  (`dms site tree` hit a stale-auth-token `"no-access"` stub), so the user found it directly: the
  pattern row itself (`dms raw get 2100394`, `npmrds_sub`'s pattern) carries
  `data.theme.selectedTheme: "transportnyv2"` — confirmed against `transportNY/src/dms_themes/
  transportny/themev2.js`'s `sectionArray.styles[0].sizes`: exactly `"1".."12"` string keys,
  `defaultSize: "12"`, same numbering as the old react-grid-layout `w` — a direct `size: String(w)`
  copy, no bucketing needed. **Fixed**: `build_graph_section_data()` now sets `size` from
  `old_graph.layout.w` (guarded to ints 1-12) on the new section row; `graph_layout` gap-detail now
  omits `w` once handled, keeping `h`/`x`/`y` (still no target — sections stack linearly; the
  theme's `rowspan` is a compound-card span-behind-a-sibling concept, not a pixel/row height, so
  it's not a faithful target for old `h`). **Verified live**: re-ran 1070 with `--replace` (new page
  id `2188710`), confirmed `size:"12"` written to the graph section row (`dms raw get 2188712`) —
  a visual no-op for 1070 itself (w:12 = full width = the pre-existing default either way) but a
  real, exercised code path. **Relevant for reports already converted**: 1071/1045/1061 all have
  graphs with `w` values other than 12 (`{4, 6, 8}` seen in their old dumps) — re-running those with
  `--replace` will pick up an actual visible width change, not yet done (round 6 stopped at 1070).

**Round 5 (2026-07-08) — CO₂ emissions calculated column built + verified live; report 751
converted; a third platform bug found (query cache collision, not a defect in the CO₂ column):**

- **CO₂ emissions calculated column — DONE.** Ported `avail-falcor`'s `getCo2Emissions.js`
  (`calcEmissions`/`getCo2`/`forCars`/`forTrucks`) into ClickHouse SQL: `CO2_EXPR_PASSENGER` /
  `CO2_EXPR_TRUCK` in `scripts/convert_old_reports.py`, using the same `META_1946_JOIN` +
  `AADT_DIST_JOIN` mechanism as the weighted-delay column — AADT split car/truck
  (`aadt - (aadt_singl+aadt_combi)` vs `aadt_singl+aadt_combi`), weighted by the same per-epoch
  AADT-distribution share, converted to VMT, run through a 15-bucket piecewise-linear
  speed→emission-factor regression (`multiIf`, separate car/truck coefficient tables) and divided
  by 1e6. Only the `travel_time_truck`/`travel_time_passenger` variants were built (report 751's 4
  route comps are 2 passenger + 2 truck, no `travel_time_all` comps) — a summed all-vehicles
  variant isn't built since nothing needs it yet. Two new `TEMPLATE_SPECS` entries
  (`tmc_co2_grid_graph_passenger`/`_truck`, GridGraph shape mirroring `tmc_speed_grid_graph`:
  xAxis=epoch, color=calculated CO₂ column, fn=avg) and two `GRAPH_TEMPLATE_MAP` entries for
  `("TMC Grid Graph", "avgCo2Emissions", "5-minutes", <dataColumn>)`.
  **Verified two ways**: (a) offline — a direct ClickHouse query against real data (TMC
  `120+24685`, 2022-01-05, epoch 119: real passenger tt=27.02, truck tt=49.88) matched a
  by-hand recomputation of the exact JS formula to 5 significant figures for both the car and
  truck branches; (b) live — report 751's "CO2 50 MPH" section (comp-1, passenger) renders a real
  heatmap (221 cells, smooth color gradient, legend scale 0.006–0.185), zero console errors.
- **Design decisions RESOLVED (2026-07-08, user)**: both open questions from round 3/4 —
  `RouteDifferenceGraph`/`RouteCompareComponent` (compare/diff two series) and synthetic
  `overrides.baseSpeed` data — settled as **gap-log only, no new platform capability**. Already the
  default behavior (no `GRAPH_TEMPLATE_MAP` entry exists for those graph types; `overrides` are
  gap-logged, not applied) — no code change needed, just confirms round 3/4's provisional handling
  is the final answer for this task.
- **Report 751 "Van Wyck CO2 Test Single TMC" — CONVERTED.** Page `2188662` (`/report_751`), 3 of
  13 old graphs convert (all "TMC Grid Graph" + `avgCo2Emissions`): comp-1 (passenger, `overrides.
  baseSpeed` ignored — shows real data, not the hypothetical 50mph scenario), comp-2 (truck,
  real), comp-3 (truck, `overrides.baseSpeed` ignored). 10 gap-logged: `Route Map`, 2×`Route Line
  Graph` (one mixed-dataColumn, one plain), `Traffic Volume Graph`, 2×`Route Difference Graph`,
  `Route Compare Component`, `TMC Grid Graph` (mixed-dataColumn, all-4-comps variant), 2×`TMC
  Difference Grid` — all correctly unmapped (no template exists for these graph types, or
  dataColumn is ambiguous across assigned comps). Plus `color_range` and 2×`overrides.baseSpeed`
  gaps.
- **New platform bug found: unfiltered ClickHouse probe queries have no execution/memory cap —
  root-caused, NOT newly introduced by this work.** Repeated report-page reloads while verifying
  CO₂ piled up 40 concurrent stray queries on the shared dev ClickHouse server (elapsed 4–78 min,
  up to ~14B rows read each) — all traced to the already-diagnosed
  `dataWrapper-stale-fetch-race` (`planning/tasks/completed/dataWrapper-stale-fetch-race.md`,
  2026-07-01): a Graph/Spreadsheet section can briefly fire an unfiltered `simpleFilterLength`
  probe before `comparisonSeries`/page filters resolve. That fix only stops the stale response
  from *overwriting* a later correct one — it doesn't cancel or prevent the query, and the
  ClickHouse adapter's `max_execution_time: 0`/`max_memory_usage: 0` (no caps) means a stray probe
  can run for over an hour. Confirmed general (hit the *pre-existing* speed grid template too, not
  just the new CO₂ one). Killed all 40 with the user's explicit confirmation. Full mechanism +
  live-incident writeup + safe check/kill procedure now documented in
  `documentation/npmrds-data-sources.md` ("Known operational hazard") and
  `packages/dms-server/CLAUDE.md`. **Practical takeaway**: don't do repeated full-page browser
  reloads while debugging a report page — prefer a single load or a narrowly-filtered direct query.
- **New platform bug found: Falcor sibling-query cache collision — split into its own task,
  `planning/tasks/current/falcor-sibling-query-cache-collision.md`.** Report 751's two truck CO₂
  grid sections (comp-2 real, comp-3 `overrides.baseSpeed` ignored) have a byte-for-byte identical
  query (same join/filters/groupBy/calculated column, since the override isn't implemented) and
  both render completely empty — no error. The one sibling section with a genuinely different
  query (comp-1, passenger) rendered correctly. This is the same general bug class as round 2's
  "Falcor cache-dedup shrinks attributes when sections share an identical options string" (which
  had a partial ClickHouse-only fix, Postgres parity never tracked) — likely related, possibly the
  same root cause, not yet fully pinned down. **User confirmed (2026-07-08): non-blocking, log as
  a gap for this report, don't let it block further conversion work.**

**Open design questions RESOLVED (2026-07-08) — user decided gap-log only for both, do not build
new platform capability for report 751:**
- `RouteDifferenceGraph`/`RouteCompareComponent` (compare/diff two independently-resolved series):
  keep gap-logging as `unmapped_graph` (as round 3 already does). No new template/graph-shape work.
- `overrides.baseSpeed` synthetic per-epoch data (fabricated `length/baseSpeed*3600`, no real
  NPMRDS row): keep gap-logging as unconverted, same treatment as `overrides.aadt`. No synthetic-
  series primitive to build.

**Round 4 (2026-07-08) — weighted Hours-of-Delay built, verified, plus a real platform bug found
along the way:**

- **Weighted Hours-of-Delay calculated column — DONE.** `scripts/convert_old_reports.py`'s
  `DELAY_EXPR`/`TEMPLATE_SPECS["tmc_delay_bar_graph_day"]` now joins `aadt_distributions`
  (source 2056/view 3524) via the calculated-join-key mechanism (round-3), computing
  `raw_delay_hours * (aadt/facil) * epoch_dist_share` — matches `getHoursOfDelay.js`'s
  `calcDelay`/`getAADT` exactly for the `travel_time_all` dataColumn (no `overrides.aadt` support
  yet — logged as a gap, see item 4 above). `ensure_graph_templates` generalized from a
  single-hardcoded-`table1` join to an arbitrary `{table1: ..., table2: ...}` sources dict (spec's
  `"join"` key is now the sources dict directly, not one source). Applied directly to the
  **already-existing** live template row (id `2188429`) via a one-off `dms raw update` (template
  rows are cloned into each section's `element-data` at creation time — editing the template alone
  does NOT retroactively update sections created before the edit, so reports 1071 **and** 1061 both
  needed a `--replace` re-run to pick it up).
- **Second platform bug found + fixed: ClickHouse "ambiguous identifier" on 3-way joins.**
  Re-running 1071 surfaced every graph on the page hanging (not erroring) — a red herring caused by
  the user's VPN dropping mid-session; a dms-server restart cleared a ClickHouse connection pool
  left holding dead connections from the outage. Once connectivity was back, the delay graphs
  specifically still failed (silently — zero console/server errors) while restarting revealed the
  real cause during a length-query capture: `ClickHouseError ... ambiguous identifier 'tmc' ...
  AMBIGUOUS_IDENTIFIER`. Root cause: comparison-series route filters (`ReportRouteList.jsx`'s
  per-route `filters: {AND: [tmc IN ..., date IN ..., epoch IN ...]}`) emit **bare** column names
  (no table alias), and `handleFilterGroupsCH`
  (`dms-server/src/routes/uda/query_sets/helpers.js`) never qualified them — harmless with one
  join (`ds` + `table1`, both exposing `tmc`, apparently tolerated by CH's join-column resolution
  for 2-way joins) but CH's stricter resolver rejects the same bare reference once a **second**
  joined table is added (`table2` = `aadt_distributions`), even though `table2` itself has no
  `tmc` column at all — this is exactly the gap already flagged as "NOT fixed (pre-existing)" in
  the round-3 notes below, just triggered for real by adding a second join source for the first
  time. **Fixed**: `handleFilterGroupsCH` now takes a `joinPresent` flag and qualifies bare
  (no-dot, no-paren) filter columns with `ds.` when true; `clickhouse.js`'s `buildCombinedWhereCH`
  now threads `joinPresent` through to it (previously only reached the separate, still-dead-code
  `handleFiltersCH` param). Also fixed a second, adjacent omission: `simpleFilterLength`'s
  non-comparison-series `combinedWhere` call was missing `joinPresent` entirely. **NOT touched**
  (still open, pre-existing, unverified by this fix): the equivalent gap in `handleFiltersCH`'s own
  dead `joinPresent` param, and the parallel gap in the Postgres path's `handleFilterGroups`/
  `buildLeafSQL` (`dms-server/src/routes/uda/utils.js`) — scoped out per
  `[[isolate-shared-code-changes]]`, fix+verify those separately when/if a Postgres 3-way join
  actually needs it. **Verified**: new unit test
  `testFilterGroupsCHJoinQualification` in `dms-server/tests/test-uda.js` (joinPresent
  true/false, plus already-qualified/calculated columns not double-prefixed) — full `test:uda`
  suite green (70/70, no regressions). Live-verified via direct `/graph` calls (bypassing the
  browser to avoid re-triggering ClickHouse pool exhaustion from repeated full-page loads): the
  delay graph's length query, which previously 500'd with the ambiguous-identifier error, now
  returns real counts.
- **Report 1071's delay graphs still show `0` after the fix — confirmed NOT a bug.** Queried
  `ny_2025_tmc_meta` directly for TMC `120-11332` (report 1071's route): `aadt = "0"`. This matches
  the old report's own data — its `route_comps` settings carry `overrides.aadt: '20000'` for every
  route on this TMC, i.e. the *old* tool needed the same override because the real table value has
  always been unusable here. The formula multiplies by `aadt/facil`, so `aadt=0` correctly yields
  `0` — this is real, correct output, not a join/formula defect. Confirmed the join/formula
  mechanism itself is sound with a direct (non-browser) query against a TMC with a real AADT
  (`120+24685`, `aadt=6141`, from report 1061's unused "Albany Shaker Road" route): weighted-vs-
  unweighted daily sums came back at a consistent ~15–17× ratio across 5 different days (2022-01-03
  through 2022-01-07) — exactly the AADT/facil-driven scaling the formula should produce, not noise.
  `overrides.aadt` support remains a real, still-open gap (item 4 above) — it just isn't what's
  wrong with the join mechanism.
- **Operational note for future sessions**: repeated rapid full-page browser reloads against a
  report with many graph sections can exhaust/wedge the dms-server's ClickHouse connection pool
  (each reload fires ~10-13 concurrent queries; the user separately confirmed the UI itself can
  sometimes fire an unfiltered query against the multi-billion-row NPMRDS fact table that hangs for
  a long time before timing out) — symptom is EVERY graph on the page hanging with no response and
  no server-side error, including ones unrelated to whatever you just changed. Fix is a
  `touch src/dms/packages/dms-server/src/index.js` to force a nodemon restart (clears the pool).
  Prefer direct `/graph` calls with narrow, explicit filters (tmc + a handful of dates/epochs) over
  repeated full-page loads when debugging a single calculated column.
  **Root-caused (2026-07-08, round 5)**: this isn't just pool exhaustion — the actual mechanism is
  the already-diagnosed `dataWrapper-stale-fetch-race` (see
  `planning/tasks/completed/dataWrapper-stale-fetch-race.md`), which the ClickHouse adapter's
  `max_execution_time: 0`/`max_memory_usage: 0` turns from "wasteful" into "can run for over an
  hour." Full mechanism, live-incident evidence, and how to safely check/kill stray queries now
  documented in `documentation/npmrds-data-sources.md`'s "Known operational hazard" section and
  `packages/dms-server/CLAUDE.md`. **This is a known, pre-existing, general platform behavior — not
  something to re-diagnose as a new bug each time a graph hangs.** Don't do repeated full-page
  reloads while debugging; a single stray unfiltered probe surviving a closed browser tab and
  running for an hour+ on the shared dev server is a real, recurring risk, not a hypothetical one
  (40 such queries piled up during this round's verification, killed with the user's confirmation).

**Destructive-action scope, clarified by the user (2026-07-08):** the "no destructive actions"
rule is about the OLD `admin2.*`/`data_manager.*` source tables (mercury/neptune, read-only,
ACTIVE production data — see the data-source bank section below) and the ClickHouse `avail`
database — NOT the new converted report pages this script creates in the dev DB. Those are
disposable test data (per the 2026-07-07 direction already noted below) and `--replace` /
overwriting them freely is expected normal workflow, not something to hesitate over.

**Round 3 (2026-07-08), so far:**

- **Correctness bug found + fixed: non-deterministic resolution/dataColumn selection on
  multi-comp graphs.** `analyze_graph()` used to fall back to `next(iter(some_set), None)` when
  a graph's assigned comps disagreed on `resolution` or `dataColumn` and `state` had no explicit
  override — logging a `mixed_resolutions_on_graph`/`mixed_data_columns_on_graph` gap but then
  **still converting anyway** using whichever value happened to come out of Python's
  hash-seed-dependent set iteration. Caught live on report 1061's `graph-comp-60` (a "TMC Grid
  Graph" with all 10 comps assigned, spanning 5-minutes/day/hour resolutions): a dry run picked
  `'day'` (correctly unmapped, no template), the very next live run picked `'5-minutes'` (found a
  template, converted it) — same input, different output, and the "converted" version silently
  queried 5-min-epoch data for routes whose old settings said day/hour. **Fixed**: ambiguous
  resolution/dataColumn now resolves to `None` (guaranteed no template match, always skipped +
  gap-logged) instead of guessing. Verified deterministic across `PYTHONHASHSEED` 0/1/2/3/42.
  **The live report_1061 page (created before this fix) still has the bad graph-comp-60 section
  — needs a `--replace` re-run once the auth token below is refreshed.**
- **Report 1061 "Single Route Before and After" (pick #3) — CONVERTED, partially stale.** Page
  `2188594` (`/report_1061`), 6 sections (RRL + 3 graphs + Add-a-Route... — wait, only 3 of the
  originally-created graphs are actually valid; see bugfix above), 9 route entries (route group
  `comp-8` correctly flattened — it had 0 inner comps, logged). 3/11 old graphs convert with
  already-existing templates: `graph-comp-57` (Route Bar Graph, hoursOfDelay, day — unweighted,
  known gap), `graph-comp-58` (Route Bar Graph, speed via default, day), `graph-comp-62` (TMC
  Grid Graph, speed, 5-minutes). Browser-verified live (Playwright + real Chrome, headless,
  `--host-resolver-rules` to resolve `npmrds.localhost` without touching `/etc/hosts`): all
  render real numeric data (e.g. delay bar shows real per-day hours-of-delay values back to
  2016), zero console errors (only a benign `net::ERR_ABORTED` on the `/track/visit` analytics
  beacon, same as round 1/2). 8 graphs correctly gap-logged as unmapped: `Route Map`, `Route Info
  Box`, `Bar Graph Summary` (2×, a new graph type — shows a single aggregate value per comp, not
  a time series), `TMC Difference Grid`, plus `graph-comp-55`/`-56`/`-61` (mixed resolution or
  measures not yet template-mapped: `avgHoursOfDelay`, unmapped for any graph type). One
  `overrides.aadt: '0'` gap-logged (comp-7).
  **TODO next session**: mint a fresh `DMS_AUTH_TOKEN` (see `[[dms-dev-creds]]` /
  `reference_dms_dev_creds.md` — `POST /login`, NOT `/auth/login`, on local dms-server; the
  stored token in `scratchpad/npmrds-sub/.dms-auth-token` is stale, delete calls return
  `"Authentication required to delete items"`), write it to that file, then re-run
  `python3 scripts/convert_old_reports.py --report-id 1061 --replace` to drop the
  now-known-bad graph-comp-60 section and pick up any other diffs from the bugfix.

- **`peak_flags` / `month_setting` gap kinds REMOVED — proven not to be functional
  gaps.** Traced the actual old client (`transportNY/src/sites/npmrds/pages/analysis/`):
  `RouteComponent.jsx`'s `shouldReloadData()` — the gate for whether the real data
  query re-runs — reads only `startDate/endDate/startTime/endTime/resolution/
  dataColumn/weekdays/overrides`. It never reads `amPeak/pmPeak/offPeak` or
  `year/month`. Clicking a peak button (`togglePeaks()`) computes an envelope
  (MIN of enabled starts, MAX of enabled ends — a contiguous span, NOT disjoint
  subranges; all-three-true covers the whole day-span including the off-peak
  middle) and writes it directly into `settings.startTime/endTime` — the peak
  booleans and the `year`/`month` fields survive only as display/highlight state
  (`year`/`month` are read solely by title-label helpers,
  `store/index.js` ~2719-2746). Confirmed against report 1071's real data: the
  "AM Peak" route has `startTime:'07:00', endTime:'10:00'` (exactly
  `[7*12,10*12]` epochs per `general.utils.js`'s `amPeakStart/End`); the
  all-three-peaks route has `'07:00'/'19:00'`. Since `startTime/endTime` (via
  `startDate/endDate`) are already fully converted into the route entry today,
  these settings need **no additional conversion work** — the gap-report entries
  were false alarms, not missing capability. Fixed in
  `route_settings_gaps()` (`scripts/convert_old_reports.py`); the "AM/PM/off-peak
  flags" line in Known functionality gaps below is corrected accordingly.

- **Report 751 "Van Wyck CO2 Test Single TMC" (pick #2) — INVESTIGATED, NOT YET CONVERTED.**
  Old data pulled to `scratchpad/npmrds-sub/old-reports/report_751.json` (4 route comps, 2
  passenger/2 truck `dataColumn`, comp-1/comp-3 carry `overrides.baseSpeed:'50'` — a
  "what if this road ran at 50mph" scenario paired against comp-0/comp-2's real data; 13
  graph_comps). This report is a much bigger lift than 1070/1071 — almost every graph needs
  either the CO₂ measure, a "Difference"/"Compare" graph shape, or a graph type with no
  new-side equivalent at all. Findings, none yet implemented:
  - **CO₂ formula located**: `avail-falcor/services/routeDataRetrievers/getCo2Emissions.js`
    (`calcEmissions`/`getCo2`/`forCars`/`forTrucks`). Splits AADT into car
    (`aadt - aadt_singl - aadt_combi`) vs truck (`aadt_singl + aadt_combi`) — both available on
    the same `ny_2025_tmc_meta` join (source 1946/view 3298) already used for delay — multiplies
    each by the **same per-epoch AADT-distribution share** used for Hours-of-Delay weighting
    (`aadtDistributions.js`, keyed by weekday-vs-weekend × congestion_level × directionality ×
    freeway-vs-non), converts to VMT, then runs VMT through a **15-bucket piecewise-linear
    speed→emission-factor regression** (separate car/truck coefficient tables, `forCars`/
    `forTrucks`) and sums. Mechanically expressible as a big SQL CASE-based calculated column
    once the AADT-distribution table exists — **but gated on the exact same missing dependency**
    already flagged for weighted Hours-of-Delay: the `aadtDistributions.js` matrix (~20 dist keys
    × 288 epochs) is not in any queryable table yet.
  - **Checked whether the PM3/MAP21 pipeline already has a substitute (per the user's "we may
    already have weighted hours of delay" hint) — it does NOT, for this use case.**
    `avail-falcor/dama/routes/data_types/map21/calcPhed.js` computes FHWA PHED (Peak Hour
    Excessive Delay) using a *different* traffic-distribution source
    (`CATTLabTrafficDistributionProfiles`, a static table analogous to but distinct from
    `aadtDistributions.js`) plus average-vehicle-occupancy and directional AADT — but PHED is a
    **single aggregate annual number per TMC** (`all_xdelay_phrs` etc.), not a per-day/per-epoch
    time series. It cannot substitute for a "Hours of Delay by day" bar graph or a CO₂-by-day
    line graph, which both need per-period values. `calcTtrMeasure.js` (LOTTR/TTTR) is unrelated
    — travel-time-reliability ratios, no AADT weighting at all. **Conclusion: sources
    1722/2001/1410 don't shortcut this** for time-series delay/CO₂ conversion; the
    AADT-distribution table still needs to be loaded, or these graphs stay unweighted/unconverted.
  - **Cross-database joins are a hard constraint, confirmed both by the user directly and by
    code**: the UDA join-builder (`dms-server/src/routes/uda/query_sets/*.js`, `utils.js`'s
    `buildJoin()`/`getEssentials()`) picks ONE connection for the whole query from the *main*
    `externalSource`'s dbType, then splices every `join.sources` entry's `table_schema.table_name`
    into that same connection's SQL as plain text — there is no fan-out across engines (also
    documented as a known v1 limitation in
    `planning/tasks/completed/datawrapper-join-support.md:139-146`, "same-database joins only").
    Since NPMRDS travel-time data (source 583/982) lives in **ClickHouse** (`npmrds2` pgEnv's
    `clickhouse` sub-config, `neptune.availabs.org:8123`, db `avail`), any table it joins to —
    including a new AADT-distribution reference table — **must itself be a ClickHouse table in
    that same `avail` database**, registered as a DAMA source/view in the `npmrds2` pgEnv's
    Postgres metadata (`neptune.availabs.org:5758`, `data_manager.sources/views`) the same way
    `ny_2025_tmc_meta` is. A DMS-native dataset uploaded via the `dms` CLI into `dms3` would NOT
    work (wrong server entirely). dms-server has no ClickHouse write path (see its own CLAUDE.md).
  - **Open, user-flagged**: "There should be ClickHouse tables with the TMC info you need" —
    the user believes relevant reference data (possibly the distribution matrix, possibly
    something else) may already exist as a ClickHouse table in the `avail` database, which would
    remove the need to load `aadtDistributions.js` at all. **Not yet confirmed** — attempts to
    run a read-only `SHOW TABLES FROM avail` against ClickHouse were blocked twice by the
    auto-mode permission classifier (credential-exposure concern, since the query needs the
    `avail_admin` password from `npmrds2.config.json`'s `clickhouse` block embedded in the
    request). Per the "don't tunnel around a denial" instruction, this was not forced through —
    it needs either the user running the lookup themselves, or an explicit permission grant.
    **RESOLVED (2026-07-08)**: user ran `SHOW TABLES FROM avail` — table `aadt_distributions`
    already exists (alongside `npmrds`, `avg_monthly_tt`, `mpo_boundaries`, `tmc_avg_speedlimit`).
    **Correction (2026-07-09, round 13): the phrase "same database as the main NPMRDS fact
    table" above was wrong** — the main fact table (source 583/982) actually lives in a
    *different* ClickHouse database, `npmrds` (table `s583_v982_NPMRDS_V6`), not `avail`; the
    `avail` database's own `npmrds` table is a separate, unrelated, do-not-use table (user-
    confirmed 2026-07-09). This doesn't change the practical conclusion, though: ClickHouse
    supports cross-database joins on one connection (`db1.table1 JOIN db2.table2`), and the
    registered `aadt_distributions` source already hardcodes `table_schema: 'clickhouse.avail'`
    as literal SQL text regardless of which database the fact table sits in — so the same-engine
    join this section set out to confirm is still real; only the database attribution was wrong.
    Schema: `key String, distributions Array(Float64)`. Verified byte-for-byte
    match against `aadtDistributions.js`: same 20 keys, each a 288-length array. The CH array
    values are the raw JS literals **÷100** (CH sums to 1.0 per key; the raw JS literals alone sum
    to 100.0) — traced this to `aadtDistributions.js`'s own tail: `DISTS[dist] =
    distributions[dist].map(d => d * 0.01); module.exports = DISTS` — i.e. the CH table holds
    exactly the post-scaling `DISTS` values that `getCo2Emissions.js`/`getHoursOfDelay.js` actually
    `require()` and use, not a re-derivation. **No further scaling needed when joining — use the CH
    values as-is.** This is the single biggest lever available: it unblocks upgrading
    `tmc_delay_bar_graph_day` (currently unweighted, round-2 gap) to real AADT-weighted delay, and
    unblocks the CO₂ measure needed for most of report 751.
  - **Registration DONE (2026-07-08): source_id 2056 / view_id 3524.** Per the join-engine
    research above, a `join.sources` entry needs a real DAMA source+view row
    (`data_manager.sources`/`views`, Postgres, `npmrds2` pgEnv, `neptune.availabs.org:5758`)
    pointing at `table_schema: 'clickhouse.avail'` / `table_name: 'aadt_distributions'`. User
    confirmed: register it as a NEW source (1946/3298 is specific to `ny_2025_tmc_meta`, not a
    reusable generic entry), shaped to look exactly like a real Data Manager UI upload —
    `type: 'gis_dataset'` (no dedicated "static reference table" type/flow exists; this is the
    closest real convention), `user_id: 993`. Read the live schema + real example rows directly
    (`data_manager.sources`/`views` columns, plus sources 583/1946/three real `gis_dataset` rows)
    to build the exact shape rather than guess. User ran `scripts/register_aadt_distributions.sql`
    directly against `npmrds2`/`neptune:5758` (writes there are blocked when run through the
    agent's own tools — same pattern as the ClickHouse reads). Full inventory in
    **`src/dms/documentation/npmrds-data-sources.md`**.
  - **Also worth resolving the join key**: the epoch-distribution `key` (e.g.
    `WEEKDAY_NO2LOW_CONGESTION_AM_PEAK_FREEWAY`) isn't a plain column match — it's a computed
    string from `getDist()` in `getCo2Emissions.js`/`getHoursOfDelay.js`
    (`[weekdayType, congestionLevel, peakType, roadType].join('_')`, weekend collapses to
    `[weekdayType, roadType]`) built from `dow` (from `date`), plus `congestion_level`/
    `directionality`/`f_system` (already available via the existing `ny_2025_tmc_meta` join). The
    array is then indexed by raw epoch (`distributions[dist][row.epoch]`, 0-287) — in ClickHouse
    that's `arrayElement(distributions, epoch + 1)` (1-indexed).
  - **RESOLVED (2026-07-08) — calculated join keys, fixed and verified.** The join-key expression
    above needs `congestion_level`/`directionality`/`f_system`, which only exist on
    `ny_2025_tmc_meta` (`table1`, already joined) — NOT on the raw `ds` (npmrds fact) side. Traced
    the actual join builder
    (`packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`)
    and found two independent limitations: (1) no calculated-expression join keys — `accessor()`
    in `buildJoinOnClause()` always rendered `${alias}.${col}`, with no way to supply a raw SQL
    expression as either side of a join condition; (2) apparent no multi-hop joins — every join
    condition's left side was hardcoded to `accessor("ds", ...)`, seemingly meaning nothing could
    reference an already-joined alias like `table1`.
    **The user's fix**: define the dist-key as a *calculated column* (the same `"<expr> as
    <alias>"` convention already used for the existing `speed`/`hours_of_delay` calculated
    columns) and reference that calculated column as a join's `dsColumn`. Verified this resolves
    BOTH limitations at once: `accessor()` (buildUdaConfig.js line ~889) needed one small,
    precedented fix — check `isCalculatedCol({name: col})` (the same detection already used by
    `refName`/`attributeAccessorStr` for WHERE/GROUP BY) and if true, use the raw expression via
    `splitColNameOnAS` instead of prefixing `${alias}.` — and since a calculated column's
    expression is opaque SQL text with the full FROM/JOIN scope already visible to it (exactly
    like the existing `hours_of_delay` calc column already references `table1.miles`), it can
    freely reference `table1`'s columns inside its own body. So (2) was never a real join-engine
    limitation — only (1) was, and fixing it incidentally unlocks (2) as well, because the
    "multi-hop" reference happens *inside* the calculated expression, not through the join
    framework's own aliasing.
    **Verified two ways**: (a) unit test added to
    `packages/dms/tests/buildUdaConfig.test.js` (`buildJoinOnClause` — "uses a calculated
    dsColumn's raw expression as-is"), full package suite still green (168/168, no regressions);
    (b) live end-to-end query against real ClickHouse data (temporary test script, deleted after
    use) built the full 3-way join `ds LEFT JOIN table1 ON ds.tmc=table1.tmc LEFT JOIN table2 ON
    <dist-key expr referencing table1> = table2.key` and returned correct results — e.g.
    `matched_key: "WEEKDAY_MODERATE_CONGESTION_EVEN_DIST_FREEWAY"` (a real key from
    `aadtDistributions.js`) with sensible `epoch_weight` values varying smoothly across epochs.
    **Separately noticed, NOT fixed (pre-existing, unrelated to this fix)**: `filterGroups`-shaped
    filter columns (`handleFilterGroupsCH` in `dms-server/.../query_sets/helpers.js`) are used
    verbatim in generated SQL with no alias-qualification, join-aware or not — a bare `tmc` filter
    with a join present produces "ambiguous identifier" if the joined table also has a `tmc`
    column. Hasn't surfaced in production because report-page route filtering goes through the
    `comparisonSeries`/`resolveComparisonVariants` path, not top-level static `filters`. Worked
    around in the live-query test by pre-qualifying (`ds.tmc` instead of `tmc`) — logging here in
    case it bites a future top-level-filter + join combination.
    **`aadt_distributions` (source 2056/view 3524) is now fully wired and ready to use** — next
    step is building the actual weighted-delay and CO₂ calculated columns using this mechanism.
  - **`RouteDifferenceGraph`/`RouteCompareComponent` are a different graph SHAPE, not just a new
    measure.** Traced `transportNY/.../tmc_graphs/RouteDifferenceGraph.jsx`: it resolves TWO
    route comps (explicit `activeRouteComponents:[idA,idB]`, or auto-pairs a lone comp with
    "another comp of the same resolution+tmcArray" — exactly how report 751's comp-0/comp-1 and
    comp-2/comp-3 real-vs-baseSpeed pairs work) and renders their **difference** as its own
    series. `RouteCompareComponent` similarly needs multiple independently-resolved series shown
    together, not a single comparison-series list. Neither maps onto the current `avl_graph_template`
    model (one externalSource + one comparison-series list of routes) without new design — logged
    as `unmapped_graph`, not attempted.
  - **`overrides.baseSpeed` (comp-1/comp-3) needs synthetic per-epoch data, not a real-data
    join.** Old `getCo2Emissions.js`'s `getTravelTimes()` calls `generateSyntheticData()` instead
    of querying `npmrds` at all when `overrides.baseSpeed` is set — travel time is fabricated as
    `length/baseSpeed*3600` for every epoch in range, no real NPMRDS row involved. The current
    template model has no "fabricate a full epoch series with no fact-table backing" primitive.
    Logged as a gap, not attempted.
  - **`TrafficVolumeGraph`'s real default measure is `vmt`**, not `speed`
    (`TrafficVolumeGraph.jsx:50`: `get(this.props, 'state.displayData', ["vmt"])`) —
    `DEFAULT_DISPLAY_DATA` in the converter doesn't have a `"Traffic Volume Graph"` entry yet, so
    it would currently mislabel this graph's gap as `measure: speed`. **Fixed**: added
    `"Traffic Volume Graph": "vmt"` to `DEFAULT_DISPLAY_DATA`. Still unmapped (no template) — just
    correctly gap-logged now.
  - **Net for 751 (updated 2026-07-08, end of session)**: still nothing converted, but the
    hardest blocker (AADT-distribution weighting infra) is now fully cleared — `aadt_distributions`
    is registered (source 2056/view 3524) AND the join mechanism to use it is fixed+verified (see
    the calculated-join-key RESOLVED note above). What's left for 751 specifically: (1) build the
    actual weighted-delay calculated column (upgrade `tmc_delay_bar_graph_day`) and a new CO₂
    calculated-column template using this now-working join — mechanical SQL-writing, no more
    unknowns; (2) a genuine design decision on Difference/Compare graph shapes (no template
    equivalent exists at all); (3) a genuine design decision on synthetic `baseSpeed` data
    generation (no real-fact-table-backed primitive exists). (1) is unblocked and ready to start
    immediately; (2) and (3) need user input on approach before implementation.

**Round 2 (report 1071 "WB East-West Arterial Poughkeepsie" — pick #1):** page `2188486`
(`/report_1071`), 13 sections, 9 route entries. 11 of 13 old graphs convert (Route Map + Route
Info Box gapped); all 11 render live with real data, zero console errors. What round 2 added:

- **displayData-keyed template mapping** — `GRAPH_TEMPLATE_MAP` now keyed (graph type × measure ×
  resolution × dataColumn), with per-graph-type displayData defaults (old components default
  `['speed']`), `'none'` entries dropped, extra measures gap-logged.
- **Template auto-minting** (`ensure_graph_templates` + `TEMPLATE_SPECS`) — missing
  `avl_graph_template` rows are built from `tmc_travel_time_line_graph`'s stateJson with targeted
  mutations. Minted: `tmc_speed_bar_graph_day` 2188428, `tmc_travel_time_bar_graph_day` 2188427,
  `tmc_delay_bar_graph_day` 2188429 (BarGraph, `date` xAxis grouped+sorted).
- **Hours of Delay via join, not client calc** — `tmc_delay_bar_graph_day` joins the
  `ny_2025_tmc_meta` **ClickHouse** view (source 1946 / view 3298: miles, avg_speedlimit,
  congestion_level, directionality, aadt…) and computes
  `sum(greatest(0, tt - (miles/greatest(20, speedlimit*0.6))*3600)/3600)`. UNWEIGHTED vs the old
  tool: the per-epoch AADT share (`aadtDistributions.js`, ~20 dist keys × 288 epochs, static JS in
  avail-falcor) is not in any table yet — loading it as a joinable reference is the follow-up.
  Also: old reports can carry `overrides.aadt` (1071 does — 20000) — gap-logged.
- **Per-graph route assignment** — old `state.activeRouteComponents` inverted into per-entry
  `graphIds` (a graph without the key shows every comp).
- **Point-drawn routes resolved** — routes with null `tmc_array` (lat/lng `points` only) resolve
  per-year server-side via old prod falcor `routes2.id[id][year].tmc_array`; per-comp years from
  settings; union across years (gap if per-year sets differ). Route 268034 → `['120-11332']`.
- **Title templates fully translated** — `{data}`/`{type}`/`{name}` → literal section titles.
  Old `state.message.text` → graph `display.description`.
- **Graph sections always get `state.data = []`** — template stateJson lacks it; BarGraph crashes
  the whole page on undefined viewData (`d3groups(undefined)`).
- **dms-server FIX (shared code, verified in isolation)** —
  `routes/uda/query_sets/clickhouse.js` fan-out now projects arm GROUP BY columns even when the
  request's attribute list omits them. Falcor cache-dedup shrinks attributes when two sections
  share an identical options string (two graphs over the same routes differing only in measure —
  exactly what conversion produces: speed/travelTime bars of the same comp); the cross-union
  `ORDER BY date` then referenced an unprojected column → "Unknown expression identifier 'date'",
  blank graphs. **`postgres.js` has the same latent fan-out flaw — parity fix + verification is an
  open follow-up.** Note the deeper unsoundness: falcor merges rows by index across queries, so
  same-options/different-attrs fetches rely on total ordering; multi-variant fan-outs ordered only
  by date can tie across arms. Deferred.

**Round 1 (report 1070):**

`scripts/convert_old_reports.py` converted old report **1070** ("Route 44 Incident Analysis April
2026") end-to-end (re-run with `--replace` after the weekday fix): page `2188393` (`/report_1070`,
child of "Converted Reports" parent `2188366`), draft sections `2188394-96` + published copies
`2188397-99` (shared trackingIds), `reports_snap_2` row `2188400`, route `268042` upserted into
the catalog. Verified in headless Chromium against the live dev site: RRL panel shows the route,
the AVL Graph plots real weekday-only travel-time data over epochs 84–228, zero console errors,
and the captured UDA query's date filter contains exactly the 261 weekdays of 2025 (0 weekend
days). Remaining gaps for this report: color_range, graph layout, graph title template
(`scratchpad/npmrds-sub/old-reports/gaps/report_1070.json`).

The user's direction (2026-07-07): stay on this single report until it's fully faithful; the new
data shape may change freely as long as it stays forward-compatible; UI affordances for these
fields are explicitly out of scope for now. All existing test reports/routes in the dev DB are
disposable.

Next: widen `GRAPH_TEMPLATE_MAP` (create more `avl_graph_template` rows per (graph type ×
resolution × dataColumn)), design filters for weekday/peak masks, then batch conversion.

Auth: CLI creates work unauthenticated; a token (minted via `POST /login` on the local dms-server,
NOT `/auth/login` — auth routes mount at root) is stored at `scratchpad/npmrds-sub/.dms-auth-token`
and passed automatically by the converter for delete/update paths. Creds are in Claude's memory.

## Objective

Replace the old Reports/Routes tools (`npmrds.devtny.org/reports`) while **preserving as much old
report data as possible**. Write automated, repeatable script(s) that pull old reports from the old
DB, transform them, and create equivalent report pages in the new DMS system. Conversion first;
authoring UI ergonomics explicitly deferred (a large flat pile of graph templates is acceptable —
stability/robustness of the conversion wins).

## Data access (verified working)

- **Old DB**: Postgres `npmrds_production` @ `mercury.availabs.org:5533`, schema `admin2`.
  Credentials: `/home/ryan/code/avail-falcor/db_service/npmrds.config.json` (user `npmrds_admin`).
  Served in the old app by falcor routes `reports2`/`routes2`/`templates2` →
  `avail-falcor/routes/folders2.route.js` → `services/folders2Controller.js`.
- **New DB**: Postgres `dms3` @ `mercury.availabs.org:5435`, schema `dms_npmrdsv5` (per-app split
  mode). Credentials: `src/dms/packages/dms-server/src/db/configs/dms-mercury-3.config.json`.
  App `npmrdsv5`, site type `dev2`, local dms-server at `http://localhost:3001`.
- **DMS CLI**: `DMS_HOST=http://localhost:3001 DMS_APP=npmrdsv5 DMS_TYPE=dev2 dms ...`.
  Reads and **creates work unauthenticated**; `delete` (and possibly some updates) require an auth
  token (`DMS_AUTH_TOKEN`, mint via `POST /auth/login` on the local server with real creds).

## Old shape (`admin2.*`, source of truth — convert from here, NOT from `routes_snapshot`)

Counts: **868 reports, 49,212 routes, 216 templates**. Only 2 reports have `station_comps`; only 13
route-group comps exist — both are edge cases, not v1 blockers.

- `admin2.reports`: `id, name, description, route_comps jsonb, graph_comps jsonb, station_comps
  jsonb, color_range jsonb, created_by, created_at, updated_at, thumbnail, pic`
- `admin2.routes`: `id, name, description, tmc_array jsonb, points jsonb, conflation_array jsonb,
  conflation_version, created_by, created_at, updated_at, metadata jsonb`
- `admin2.templates`: like reports + `routes int, stations int, default_type`
- `route_comps[]` entry: `{name, type: 'route'|'group', color, compId: 'comp-N', isValid, routeId,
  settings, inRouteGroup}` where `settings` = `{year, month, startDate: 20250101, endDate,
  startTime: '07:00', endTime, weekdays: {monday…sunday bools}, amPeak, pmPeak, offPeak,
  dataColumn, resolution, overrides, relativeDate, compTitle, …}`
- `graph_comps[]` entry: `{id: 'graph-comp-N', type: '<display name>', state: {…graph-specific},
  layout: {x,y,w,h}}` (react-grid-layout 12-col grid)

Distribution surveys (define the conversion matrix):

- **Graph types** (23 distinct): Route Bar Graph 2245, Route Line Graph 1085, Route Map 849, TMC
  Grid Graph 746, Bar Graph Summary 649, Route Info Box 412, TMC Info Box 264, Route Compare 226,
  Route Difference 199, TMC Difference Grid 143, Hours of Delay 138, Traffic Volume 51, then a long
  tail ≤30 each.
- **Resolutions**: 5-minutes 3426, day 779, hour 330, weekday 238, month 185, 15-minutes 167,
  year 13, NONE 3.
- **dataColumn**: travel_time_all 5013, travel_time_truck 115, travel_time_passenger 13.
- **displayData** (CORRECTION 2026-07-07 — a dimension the first survey missed): `dataColumn` only
  picks which raw travel-time column feeds a route; the *measure a graph displays* is per-graph
  `state.displayData` (defaults to `['speed']`, registry in old
  `tmc_graphs/utils/dataTypes.js`): speed, travelTime, hoursOfDelay/avgHoursOfDelay,
  co2Emissions/avgCo2Emissions, dataQuality, reliability indices (avgTT, freeflow,
  percentile95/97, bufferTime, planningTime, miseryIndex, travelTimeIndex — each also in a
  `-byDateRange` variant), and TMC attributes (length, avg_speedlimit, aadt, vmt). Usage across
  reports: 4,140 graph instances carry explicit displayData (top: travelTime, speed,
  hoursOfDelay/avg, planningTime, freeflow-byDateRange, percentile95-byDateRange, length, aadt);
  2,957 rely on the per-type default. **The template matrix key is therefore
  (graph type × displayData measure × resolution × dataColumn)** — measures become calculated
  columns (like the existing `(miles*3600)/travel_time` speed calc); some need inputs from the
  joined TMC-identification table (aadt, avg_speedlimit, miles) or derived references
  (freeflow for delay, emission factors for CO₂ — formulas live in the old dataTypes.js).
  **User direction (2026-07-07): derived references like freeflow already exist in a table
  somewhere — JOIN them in, do not recompute them.** (Find the table; ask the user if it doesn't
  turn up.)
- **Approved gap-coverage picks (2026-07-07), in order**: 1071 "WB East-West Arterial
  Poughkeepsie" (Route Bar Graph ×3 flavors, Route Map, Route Info Box, day resolution, partial
  peaks) → 751 "Van Wyck CO2 Test Single TMC" (CO₂, truck/passenger columns, difference graphs) →
  1061 "Single Route Before and After" (before/after date windows, hour+day) → 1045 "Rochester
  Inner Loop" (month+weekday resolutions, dataQuality) → 874 "Zizhao_119EB_Delay_AADT" (AADT from
  the join table, mixed dataColumns).
  Note: bulk-converting all 868 reports is explicitly NOT the goal — the goal is building the
  conversion *capability*; reports are chosen by gap coverage.

## New shape (verified live on page_10 = page `2187523`)

A report is a page (`npmrds_sub|page`) created from the **Report Page** page template
(`npmrds_sub|page_template` row `2187021` — full dump in scratchpad). Its parts:

1. **Page row** with sections (each an `npmrds_sub|component` row): one `ReportRouteList`
   (sidebar group), N × `AVL Graph`, optional "Add a Route" Spreadsheet.
2. **`reports_snap_2` row** — app `npmrdsv5`, type `reports_snap_2|2177440:data` (split table
   `data_items__s2177438_v2177440_reports_snap_2`): `{report_id: '<page id>', routes: '<JSON
   string>'}`. Each route entry: `{name, route_id, tmc_array: '<JSON string>', description,
   points, metadata, conflation_*, created_*, updated_at, isValid, route_comp_id: 'comp-N',
   graphIds: [<graph section trackingIds>], startDate?, endDate?: 'YYYY-MM-DD[THH:mm]'}`.
   Extra keys survive (schema-free `:data` row) — stash unconvertible old settings here.
3. **AVL Graph sections** get state from an `npmrds_sub|avl_graph_template` row
   (`{name, slug, stateJson, layoutJson, elementType: 'AVL Graph', …}`;
   `stateJson` = `{externalSource, columns, filters, display, join, customBuckets,
   comparisonSeries}`). Existing 3 templates (all 5-min epoch, all-vehicles):
   `tmc_travel_time_line_graph` 2187310, `tmc_speed_line_graph` 2187296, `tmc_speed_grid_graph`
   2187311. All bind NPMRDS Production V6 (src 583 / view 982, env npmrds2) joined to TMC
   Identification (455/3464) on `tmc`, with a `comparison_series` subscriber
   (`paramKey: '$self'`) and `__series` categorize column.
4. Route→graph binding: `transformReportRoutes()` (`ReportRouteList.jsx:9`) turns each assigned
   route into `{label, filters: {AND: [tmc IN tmc_array, date IN <day range>, epoch IN <epoch
   range>]}}` published to each graph's self-resolved action param.

New route catalog: dataset `Routes Data` src `2107426` / view `2107427` (64,785 rows, keyed
`route_id`) — a point-in-time import of old `admin2.routes`; **routes created after ~June 2025 are
missing** (e.g. old route 268042 used by report 1070). Converter must upsert missing routes.

Dataset `routes_snapshot` (src 2175738 / view 2176561, 2,467 rows / only 728 distinct names) is an
earlier raw dump of old reports — duplicated and with old ids stripped. Do not convert from it;
convert from `admin2.reports` directly (dedupe/cleanup of that dataset is separate debt).

## Conversion algorithm (per old report id)

1. Read old report + its `admin2.routes` rows (follow `route_comps[].routeId`, flattening groups).
2. Upsert each route into `Routes Data` (`routes_data|2107427:data`) by `route_id`.
3. Create the page (clone Report Page template structure): page row + one component row per
   section with **fresh trackingIds**; slug `report_<old_id>` (default, TBC).
4. For each old `graph_comp`, pick an `avl_graph_template` by key
   `(graph type, resolution, dataColumn)` — creating the template row first if it doesn't exist
   (generated from a code-side matrix; "a ton of templates" is fine). Resolution via calculated
   epoch column (e.g. `(epoch/3) as epoch_15`); dataColumn via measure column
   (`travel_time_freight_trucks` etc.).
5. Create the `reports_snap_2` row: routes from old route_comps (+ inline route data), per-route
   `startDate`/`endDate` from old `settings.startDate/startTime/endDate/endTime`
   (`20250101`+`'07:00'` → `'2025-01-01T07:00'`), `graphIds` = every graph section's trackingId
   (old model: every route fed every graph unless per-graph state said otherwise).
6. Preserve everything unconvertible verbatim on the route entry (e.g. `_old_settings`) and emit a
   per-report **gap report** (graph types without templates, weekdays/peak filters, overrides,
   relativeDate, station_comps, groups) — surfacing gaps is an explicit goal.

## Known functionality gaps (to grow as conversion proceeds)

- ~~weekday masks~~ **DONE (2026-07-07)**: route entries carry a first-class `weekdays` field (old
  settings shape, `{monday: bool, …}`); `transformReportRoutes.generateDateRange` skips
  explicitly-`false` days when enumerating the `date IN` list — no new filter op needed. Verified
  by capturing report_1070's live graph query: 261 dates, all 2025 weekdays, 0 weekend days.
  Only applies when the route has a date range to enumerate (converter logs
  `weekday_mask_without_date_range` otherwise).
- ~~AM/PM/off-peak flags~~ **NOT A GAP (2026-07-08)** — proven query-inert in the old client;
  see Round 3 note above. `startTime`/`endTime` (already converted) fully capture their effect.
- Only 3 graph templates exist (2 line + 1 grid, 5-min, all-vehicles) vs 23 old graph types ×
  8 resolutions × 3 data columns actually used. Route Map, Route Info Box, Bar Graph Summary and
  other non-line/grid types have no new-side equivalent component/template at all yet.
- Old per-graph `layout` — **width (`w`) DONE as of round 6**: maps directly to the section's
  `size` field (colspan; `npmrds_sub` runs the `transportnyv2` theme, 12-col numeric scale, same
  numbering as old `w`). `h`/`x`/`y` still have no obvious new-side target (sections stack
  linearly; the theme's `rowspan` is a compound-card concept, not a pixel height, so not a fit).
- Old `color_range` — **DONE as of round 6, correctness fixed in round 7**: gap-logging only fires
  when a report has a colorful-type graph (Route Bar Graph/Route Map/TMC Grid Graph/Route
  Difference Graph/TMC Difference Grid, confirmed against old client source) that fails to convert;
  for ones that do convert, the real `color_range` is wired into the new template's
  `display.colors.value`. Round 6's wiring was live-verified but not actually rendering correctly —
  round 7 found and fixed two real rendering bugs (GridGraph's color scale silently truncated to a
  palette's first 3 colors; BarGraph had no per-value coloring mode at all, so single-series bars
  rendered as one solid color) — see round-7 notes above for the full root-cause + fix. **Now
  live-verified as actually correct** on 751/1061/1045/1071.
- Relative-date reports (`settings.relativeDate`) and route groups need design.
- ~~`overrides.aadt`~~ **DONE (round 9, 2026-07-08)** — baked into the cloned calculated column
  per graph when every assigned comp agrees on one truthy value (wholesale replace for delay,
  proportional car/truck redistribution for CO₂, matching the old source exactly); falsy `'0'`
  is query-inert (old `getAADT` truthiness) and no longer logged. Disagreeing comps →
  `aadt_override_mixed` gap; template-drift → `aadt_override_not_applied` gap. Live-verified on
  1071 (page `2188906`).

## NPMRDS data-source bank

**Moved to `src/dms/documentation/npmrds-data-sources.md` (2026-07-08)** — a living reference doc
(kept current independent of this task's lifecycle, per the user's request) covering: registered
DAMA sources joinable via `avl_graph_template`'s `join.sources` (583/1946/`aadt_distributions`),
the full bank of other active old-DAMA NPMRDS sources (582/1722/2001/1410 + the newly-discovered
ClickHouse tables `tmc_avg_speedlimit`/`avg_monthly_tt`/`mpo_boundaries`/`npmrds`), the
cross-database-vs-cross-engine join constraint, and the live DAMA schema reference. Update that
file (not this section) as more sources get investigated.

## Open questions (user)

- Where should converted pages live (flat vs under a parent "Converted Reports" page; replicate old
  `admin2.folders` hierarchy as page hierarchy?)
- Auth token for CLI deletes/updates (needed for idempotent re-runs / rollback) — user offered
  creds; mint token via `POST /auth/login`.
- Confirm slug scheme `report_<old_id>` and that converted pages start unpublished (draft).
- ~~Which theme does `npmrds_sub` actually run~~ **RESOLVED (round 6, user)**: `transportnyv2` —
  found via the pattern row's `data.theme.selectedTheme` (`dms raw get 2100394`), not discoverable
  through `dms site tree` (stale auth token). See `graph_layout` width note above.

## Artifacts (scratchpad/npmrds-sub/old-reports/)

`report_1070.json`, `report_1070_routes.json` (old side); `new_page_2187523.json`,
`new_page_2187523_sections.json`, `new_report_row_page2187523.json`,
`avl_graph_templates.json`, `page_template_2187021_current.json` (new side).
`report_1071.json`, `report_751.json`, `report_1061.json` (old-side dumps for those reports).
`gaps/report_1070.json`, `gaps/report_1071.json`, `gaps/report_1061.json`, `gaps/report_751.json`,
`gaps/report_1045.json`, `gaps/report_874.json` (per-report gap reports, regenerated on every
conversion run — `report_1071.json`'s `new_page_id`/`dry_run` fields were manually restored after a
dry-run overwrote them, see round-3 notes if this looks odd).

**Current live page ids as of round 7 completion (2026-07-08)** — 1061/1045/1071 superseded again
in round 7 to pick up `colors.byValue`; 1070/751/874 unchanged since round 6 (751/1070 needed no
DB change for the round-7 GridGraph fix — it's frontend-only; 874 has no converted graphs at all):
1070→`2188718`, 1071→`2188906` (round 9, aadt override), 751→`2188894` (round 9, truck-CO₂ fix),
1061→`2188800`, 1045→`2188812`, 874→`2188794`.

Other files this task has produced, outside that scratchpad folder:
- `scripts/convert_old_reports.py` — the converter itself.
- `scripts/register_aadt_distributions.sql` — one-time DAMA source/view registration for
  `aadt_distributions` (already run; keep for reference/idempotent re-registration elsewhere).
- `src/dms/documentation/npmrds-data-sources.md` — the living data-source reference (see below).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — round-3 calculated-join-key fix (`accessor()` inside `buildJoinOnClause`); round-5 fix
  (`mappedOrderBy`, comparison-series fan-out ORDER BY on a calculated groupBy column uses the
  alias, not the raw expression).
- `src/dms/packages/dms/tests/buildUdaConfig.test.js` — regression tests for both fixes above.
- `src/dms/packages/dms-server/src/routes/uda/query_sets/helpers.js` — round-4 fix:
  `handleFilterGroupsCH` join-aware `ds.` qualification for bare filter columns.
- `src/dms/packages/dms-server/src/routes/uda/query_sets/clickhouse.js` — round-4 fix: threads
  `joinPresent` into `handleFilterGroupsCH`; fixed a second missing-`joinPresent` spot in
  `simpleFilterLength`.
- `src/dms/packages/dms-server/tests/test-uda.js` — `testFilterGroupsCHJoinQualification`
  regression test for the round-4 ambiguous-identifier fix.
- `src/dms/packages/dms/src/ui/components/graph_new/components/utils.js` — round-7: new
  `buildValueColorScale` shared helper (fixes GridGraph's truncation bug, powers BarGraph's new
  `byValue` mode).
- `src/dms/packages/dms/src/ui/components/graph_new/components/GridGraph.jsx` — round-7: uses the
  new helper instead of a hardcoded 3-point domain.
- `src/dms/packages/dms/src/ui/components/graph_new/components/BarGraph.jsx` — round-7: new
  `colors.byValue` mode (min/max tracking + value-scaled colors + linear legend).
- `src/dms/packages/dms/src/ui/components/graph_new/components/avl-graph/components/Legend.jsx` —
  round-7: fixed a latent duplicate-React-key bug in both linear legend variants (tick elements
  keyed by value instead of index — only manifests on a degenerate/constant-value domain).
- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/
  graph_new/config.jsx` — round-7: new "Color by Value" author-facing toggle in the Bar Graph
  Layout SectionMenu group.
- `src/dms/packages/dms/tests/graphColorScale.test.js` — round-7: regression tests for
  `buildValueColorScale` (full-palette reach, degenerate-input scale shape).
- `scratchpad/npmrds-sub/dms-server.log` — dms-server's live stdout, piped via `tee` (user-run,
  2026-07-08) so errors can be read directly instead of reconstructed from browser console
  captures; per `[[feedback_check_server_logs_first]]`, check this file first when a graph/page
  shows a fetch error.
