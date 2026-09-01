# Old NPMRDS reports → new DMS report pages (automated conversion)

> **File structure (since 2026-07-13)**: this file holds (1) the current-state summary, (2) a
> one-line-per-round ledger, (3) the CURRENT round's full detail, and (4) the durable reference
> sections at the bottom. Full round-by-round history for rounds 1–40 lives verbatim in
> [old-reports-conversion-archive.md](./old-reports-conversion-archive.md) — grep it for
> `**Round N` when you need a specific round's detail. **Keep this file lean**: when a new round
> starts, move the previous round's full text to the top of the archive, leave a ledger line here,
> and fold anything durable into the summary or reference sections.

## Current state (2026-08-31, ROUND 85 DONE — user asked for a breakdown of "non-clean"
conversions; census-based decomposition ranked `Route/TMC Info Box × speed` as the single highest-
leverage unmapped bucket (90 single-blocker reports, 29% of the whole needs_attention bucket).
Scoping it surfaced a real, undocumented conflict: rounds 19/38/40/49/58 dispatched this bucket to a
pm3/source-1410 LOTTR/TTTR reliability join (gated on resolving a per-report year+bin), but the old
tool's `speed` measure is genuinely just plain average speed in mph — confirmed directly against
transportNY's real `dataTypes.js`/`RouteInfoBox.jsx` source, independent of a 2026-08-12 comment in
a sibling task that said the same thing but was never connected back to this converter's dispatch.
The reliability substitution was rounds 19/38's own deliberate (if ultimately not-fidelity-correct)
call, made because the old tool's *literal* `LOTTR`/`TTTR` measure keys have 0 real reports
overlapping 1410's coverage.**

**Fixed**: `speed` now maps unconditionally to the real plain-speed template
(`ensure_info_box_speed_template`, already built + proven 2026-08-12 for the spec-driven
`report_build.mjs` path) — no year/bin gate at all, since the date window comes from the graph's own
`routeWindows` at render time, the same live mechanism every other measure already uses (source
583/982 is one continuous table, unlike 1410's per-year-per-bin provisioning). Live-verified on 2
real conversions (317 route-grain, 182 TMC-grain — first-ever real use of a freshly-minted
`tmc_info_box_speed` row), 0 console/page/SQL errors, real sane mph values confirmed in the actual
fired SQL. **Corpus impact: clean (page-producible + full) conversions 184→290 (+106, +58%)** in
one change — `full` 309→483, `no_equivalent`-bucket instances 534→49. `probe_corpus.mjs`'s
golden-corpus/Dynamic-Report regression check showed failures on every entry: the 4
`golden_corpus_*` failures were a 3rd recurrence of a known manifest-drift bug, root-caused and
**fixed same session** (`report_build.mjs`'s `computeTargetSlug()` now always derives a page's slug
from its title, matching the admin UI — see this round's addendum below); the 4 `dynamic_report_*`
failures are pre-existing, unrelated to this change (`report_build.mjs`'s own separate Info Box
code path, untouched) and left open, out of scope.

**Deliberately NOT built this round** (per user: keep LOTTR/TTTR for real, "somewhat soon... idk if
mandatory," but scope it as a follow-on): real support for the old tool's literal `LOTTR`/`TTTR`
measure keys (10 reports, currently invisible — buried in the generic `extra_measures_dropped` gap
kind, never surfaced as their own bucket), entangled with a separate, larger pre-existing gap this
round also surfaced: `convert_report.py`/`convert_template.py` only ever build ONE measure per Info
Box graph at all (869 "extra measures dropped" instances / 524 reports corpus-wide) — the
multi-measure composition already exists (`build_route_info_box_section_state_multi`) but is only
wired into the spec-driven `report_build.mjs` path, never the automatic old-report converter. Both
logged together in "Known functionality gaps" below.

Full detail: this round's own section immediately below; round 84's full text (Map hover tooltips)
moved to [the archive](./old-reports-conversion-archive.md).

---

## Round 85 (2026-08-31) — Info Box `speed` bucket: rounds 19-58's pm3-reliability substitution replaced with the old tool's REAL plain-speed measure, unconditionally mapped (no year/bin gate); +106 clean conversions in one change

**Context**: continuing this session's "breakdown of non-clean conversions" request — a census-based
clean/needs_attention/junk decomposition (`conversion_outcome_classification.json`, built round 71)
ranked unmapped (graph type/measure/resolution/dataColumn) keys by how many `needs_attention`
reports they alone block from going clean. `Route Info Box`/`TMC Info Box` × `speed` × `5-minutes`
was #1 and #3 (169+92 instances, 90 single-blocker reports — 29% of the entire 328-report
needs_attention bucket), by a wide margin the highest-leverage single fix available.

**The conflict found while scoping it**: `INFO_BOX_BUCKET = ("speed", "travel_time_all")` has been
dispatched to a pm3/source-1410 LOTTR/TTTR/Freeflow **reliability** join since rounds 19/38/40/49/58
— gated on resolving a per-report (year, bin) pair against 1410's 2021-2025(now 2018-2025) coverage
and 4 precomputed time-of-day bins, which is exactly what left 261 instances permanently unmapped.
But `info_box_templates.py`/`vocab.py` already carried a 2026-08-12 comment (from a completely
separate task, `dynamic-reports-and-route-tags.md`) stating this was wrong: `speed` is really the
old tool's plain average-speed-in-mph measure, never reliability. **Independently re-verified this
round, directly against `transportNY`'s real source** (not just trusting the comment): `dataTypes.js`
`BASE_DATA_TYPES` has `{key:'speed', alias:'travelTime', ...}` — no `group`, falls through
`RouteInfoBox.jsx`/`TmcInfoBox.jsx`'s plain default `allReducer` branch, same code path as
`travelTime`; `lottr`/`tttr`/`reliability` appear **nowhere** in `dataTypes.js` — that vocabulary
only exists in unrelated old pages (`pm3Map21`, `MacroView`, `TmcPage`), never in the report-builder
(`pages/analysis`) that `admin2.reports` actually feeds. Cross-checked against round 18's own
archived notes: the reliability substitution was a **deliberate pragmatic call**, not a
misunderstanding of what `speed` meant — the old tool's *literal* `LOTTR`/`TTTR` measure keys (a
real, separate, rare bucket) have 0 real reports overlapping 1410's coverage (all pre-2018), so
round 18/19 piggybacked the newly-proven pm3-join mechanism onto the `speed` bucket to get a working
demo instead of 0 corpus flips. That substitution never actually reproduced what a `speed` Info Box
showed in the old tool, and blocked 261 real instances (~90-95 reports) for no correctness reason.

**User's ruling** (after a clarifying back-and-forth on why `speed` needs no year/bin, unlike
`travelTime`'s own real date-dependency): plain speed always, replacing the reliability substitution
for this bucket entirely — confirmed there's no defensible reason to prefer reliability once plain
speed has zero coverage gating; Option 2 ("reliability first, plain-speed fallback") was explicitly
rejected as strictly worse on every axis once that's true. The reliability machinery itself
(`ensure_pm3_join_template`/`graph_reliability_bin`/`PM3_VIEW_BY_YEAR`/`RELIABILITY_BIN_LABELS`) is
kept, unused by this bucket now — the user wants LOTTR/TTTR support built for real (other
components may need it despite sparse old-tool usage), scoped as a follow-on, not this round (see
"Known functionality gaps").

**Why `speed` needs no year/bin, unlike reliability (the clarifying point)**: `SPEED_EXPR`
(`miles*3600/travelTime`) is exactly as date-dependent as `travelTime` — both read the same
continuous raw ClickHouse fact table (source 583/view 982, `NPMRDS_V6`, 2017-2026 in one table).
The date window is a **live, per-request parameter** (`_measurePick.routeWindows`, resolved via the
`comparisonSeries` `$self` subscriber at render time, round 72's fix), identical to how Route
Bar/Line Graph's own `speed` measure already works — so ONE static template per grain suffices.
Reliability is different in *kind*: source 1410 is provisioned as a **separate Postgres table per
year** (`s1410_v2587_pm_3` for 2021, etc.) with each time-of-day bin as a **separate column**
(`lottr_amp_lottr` vs `lottr_pmp_lottr`) — the join target itself has to be chosen at
template-mint time, which is why reliability (and only reliability) needs a `{year}_{bin}` baked
into its template name.

**Built**: `convert_report.py`/`convert_template.py`'s Info Box dispatch (the `measure_col ==
INFO_BOX_BUCKET` branch) now calls `ensure_info_box_speed_template(grain, ...)` — already built
2026-08-12 for the spec-driven `report_build.mjs` path (`SPEED_EXPR`, `decimal_2` formatFn,
live-proven on the Dynamic Report catalog's `one_week_study` page) — unconditionally, no year/bin
resolution at all. `census_old_reports.py`'s mirror updated identically. Removed the now-dead
`graph_max_year`/`graph_reliability_bin` reliability-resolution code + the
`info_box_year_undetermined`/`info_box_year_outside_pm3_coverage`/`info_box_bin_undetermined` gap
kinds for this bucket (they never fire for `speed` anymore); `graph_reliability_bin` import dropped
from all 3 files (now unused — `graph_max_year`/`PM3_VIEW_BY_YEAR` stay, still used by Route
Map/Bar-Graph-Summary-freeflow). Left pointer comments in all 3 files (plus `vocab.py`'s
`INFO_BOX_BUCKET`/`INFO_BOX_SPEC_MEASURES` definitions) explaining the history and that the
reliability functions are intentionally kept, unused here, for the LOTTR/TTTR follow-on.

**Live-verified**: dry-ran 10 candidate reports first (317/816/182/1039/1026/191/321/435/443/942) —
confirms both grains dispatch correctly (`route_info_box_speed` drift-recomposed where it already
existed from the Dynamic Report catalog work, `tmc_info_box_speed` freshly minted where it didn't).
Converted 2 for real: **317** "Madison Ave Road Diet Westbound" (`--replace` → page `2216102`, route
grain, point-drawn routes resolved via falcor) and **182** "I-87 Exit 4 NB Ramp" (fresh convert →
page `2216129`, TMC grain, first-ever real use of a freshly-minted `tmc_info_box_speed` row).
`report_probe.mjs --auth` on both: **0 console/page/SQL errors** (only the known-benign
`/track/visit` 204); "Route Info Box, Speed"/"TMC Info Box, Speed" sections render real, sane mph
values (48-60 mph range on 182's TMCs — plausible highway speeds) computed live via the genuine
two-level `SPEED_EXPR` query (confirmed by inspecting the actual fired ClickHouse SQL in the probe's
network capture, not just "no error").

**Corpus impact** (full census re-run): `full` 309→**483** (+174), mapped instances 5675→**6160**/7107,
`no_equivalent` bucket instances 534→**49** (nearly this whole bucket WAS this one substitution).
Reclassified clean/needs_attention/junk: **clean (page-producible + full) 184→290 (+106, +58%)**,
needs_attention 328→223, junk ~unchanged (357, page-producibility is untouched by this fix).
`conversion_outcome_classification.json` regenerated to match.

**Regression check — ran `probe_corpus.mjs`, all findings traced to pre-existing causes, none to
this change**: every golden-corpus/Dynamic-Report entry showed failures, but the 4
`golden_corpus_*` entries were rendering the site's **marketing homepage**, not the report page at
all — their live pages had been resaved earlier that day (`dms_npmrdsv5.data_items` `updated_at`
14:18 UTC, slugs now `golden_corpus_line_graph` etc., underscored vs. the manifest's
`golden_corpus_linegraph`), the 3rd recurrence of a bug the manifest's own notes already documented
from 2026-08-24/25. Root-caused and **fixed as a same-session addendum, not left open**: the real
bug was in `report_build.mjs`'s `computeTargetSlug()`, which trusted an explicit `spec.slug` field
verbatim (via a fallback algorithm that didn't even match the admin UI's own `toSnakeCase()`/
`getUrlSlug()` either) instead of always deriving the slug from `spec.title` the way the admin UI
does — these 4 specs' hand-picked slugs never matched what their own two-word titles would
produce, so every resave silently drifted the slug back out from under the hardcoded one. Fixed:
`computeTargetSlug()` now always computes via an exact `toSnakeCase()` port from `spec.title`
(dropping `spec.slug` entirely); verified every one of the 12 real production `dynamic_report_
specs/*` already had a slug matching `toSnakeCase(title)` exactly (so this changes nothing for
them), removed the now-dead `slug` field from all 16 spec files, rebuilt the 4 golden-corpus pages
for real (`--replace --publish`) onto their now-stable title-derived slugs, updated the manifest's
`url`s to match, and re-captured (`--capture --only`) — all 4 read back as real working pages (0
errors, correct section titles) and now PASS `probe_corpus.mjs` cleanly. The `dynamic_report_*`
entries' separate failures (query-shape drift, one pending-request increase) are built via
`report_build.mjs`'s OWN Info Box function (`section_builders.py`'s
`build_route_info_box_section_state`), a completely different code path neither this fix nor the
Info Box `speed` fix above touched — confirmed by inspecting that function, untouched; left open,
out of scope for this round. New gotcha (with the fix) logged in `regression-testing-npmrds-
reports.md`.

**Known functionality gaps opened, not built this round** (per user: "somewhat soon... idk if
mandatory" — logged as a real follow-on): see "Known functionality gaps" below,
"Info Box multi-measure support + literal LOTTR/TTTR recognition, needed for real report fidelity".

**Files changed**: `scripts/npmrds-reports/convert_old_reports_lib/convert_report.py`,
`convert_template.py`, `scripts/npmrds-reports/census_old_reports.py`,
`convert_old_reports_lib/vocab.py` (comment corrections only). No new DB rows beyond the 2 live
test conversions (317→`2216102`, 182→`2216129`) and the drift-recomposed `route_info_box_speed`
row; `tmc_info_box_speed` newly created (`id=2216128`). No backfill of already-converted pages —
lazy-reconvert policy, same as every other template-level fix this task has shipped.

**Addendum, same session (slug-computation root-cause fix)**: `scripts/npmrds-reports/report_build.mjs`
(`computeTargetSlug()`/new `toSnakeCase()`), all 12 `dynamic_report_specs/*.json` + 4
`report_probe_fixtures/specs/golden-corpus-*.json` (dead `slug` field removed),
`report_probe_fixtures/golden-corpus.json` (4 `url`s updated + notes, baselines re-captured).
4 pages rebuilt for real: `golden_corpus_line_graph`/`_bar_graph`/`_grid_graph`/`_route_map`
(new `reports_snap_2` rows 2216148/2216156/2216164/2216172). No production `dynamic_report_specs`
page was renamed (verified their existing slugs already matched `toSnakeCase(title)`).

---

## Round 84 (archived, 2026-08-31) — Map hover tooltips (round 82 finding 6 / Round C): mechanism confirmed, fixed across all 3 Route-Map-building code paths, live-verified. Full detail: [archive, "Round 84"](./old-reports-conversion-archive.md).

## Round 83 (archived, 2026-08-31) — user-reported report-browser bug: converted reports invisible/unclickable in "Choose a report" + Tag Browser; root-caused to two independent bugs, both fixed + backfilled + live-verified. Full detail: [archive, "Round 83"](./old-reports-conversion-archive.md).

## Round 82 (archived, 2026-08-31) — user's cosmetic-gap triage from round 81's side-by-side samples: 4 real bugs found + fixed (Round A), report-tags scoped for review (Round B), Map-hover finding corrected (Round C — fixed round 84). Full detail: [archive, "Round 82"](./old-reports-conversion-archive.md).

## Round ledger (rounds 1–84 archived — full detail in [the archive](./old-reports-conversion-archive.md); round 62 is ledger-only below (full detail lives in "Known functionality gaps"), round 85 is current, full detail above)

- **R85** (08-31): Info Box `speed` bucket fixed — rounds 19/38/40/49/58's pm3-reliability
  substitution (year/bin-gated, based on the old tool's literal `LOTTR`/`TTTR` measure keys having 0
  real corpus overlap with 1410's coverage) replaced with the REAL plain-speed measure (confirmed
  directly against transportNY's `dataTypes.js`/`RouteInfoBox.jsx` source: `speed` is plain mph, no
  reliability connection at all), now mapped unconditionally via `ensure_info_box_speed_template`
  (already built 2026-08-12 for the spec-driven `report_build.mjs` path) — no year/bin gate needed,
  since the date window comes from `routeWindows` at render time like every other measure. Live-
  verified on 2 real conversions (317 route-grain, 182 TMC-grain), 0 console/page/SQL errors, real
  sane mph values in the fired SQL. **Clean conversions 184→290 (+106, +58%)** in one change (`full`
  309→483, `no_equivalent`-bucket instances 534→49). `probe_corpus.mjs` regression check showed
  failures on every entry but all traced to pre-existing, unrelated causes (stale manifest URLs
  after an unrelated same-day page rename; `report_build.mjs`'s own separate, untouched Info Box
  code path) — not fixed, logged. Deliberately NOT built: real literal `LOTTR`/`TTTR` measure-key
  support (10 reports, currently invisible inside the generic `extra_measures_dropped` gap kind) and
  the entangled, larger gap that the automatic converter only ever builds ONE measure per Info Box
  graph at all (869 "extra measures dropped" instances/524 reports corpus-wide) — both logged as a
  single follow-on in "Known functionality gaps", per the user ("somewhat soon... idk if
  mandatory").
- **R84** (08-31): round 82 finding 6 ("Map hover tooltips")/Round C fixed — mechanism confirmed
  (hover popups are an existing, symbology-level DMS map capability, gated by
  `layer['hover']`/`layer['hover-columns']`, read by the map runtime's `HoverComp` and normally
  authored via the Map Editor's Popover tab). The gap was in 3 independent Route-Map-layer-building
  code paths, not 1: the Python converter (`route_map.py`, fixed — new
  `route_map_hover_columns()` wired into all 5 template-builders), `report_build.mjs` (confirmed to
  delegate straight to the Python converter's `--route-map-section` CLI, no separate fix needed),
  and the live "Add Graph"/QuickControls authoring UI (`composeMapConfig.js`, a genuinely separate
  JS port — fixed with a mirrored `routeMapHoverColumns()`, surfaced by the user's own question
  about whether all 3 paths were covered). Live-verified twice: Python path on reconverted report
  971 (`nittec_150` → page `2216069`, user-confirmed TMC+Speed popup); JS authoring path on a
  scratch report (created + deleted, user-confirmed TMC+Travel Time popup). New doc gotcha found
  (`+ Add Graph` no-ops with 0 routes) logged in `traversing-report-pages.md`. New deferred finding,
  explicitly NOT fixed this round per the user: Travel Time's Route Map color scale is both static
  (should arguably be dynamic) and polarity-backwards (low/fast = red, should be green) — logged in
  "Known functionality gaps", `hoursOfDelay`/`avgHoursOfDelay`/CO2 measures suspected to share the
  same backwards-polarity bug (unconfirmed). Also caught+resolved a live cross-session write
  collision with a sibling session working round 83 concurrently on the same corpus — no data lost,
  confirmed via `SendMessage` both ways. Full detail above.
- **R83** (08-31): user-reported report-browser bug — a real converted report was invisible (search
  found only greyed-out "Legacy — not yet rebuilt" duplicates) and unfindable by tag despite a
  visible tag chip. Two independent root causes: (1) round 82's converter never wrote `page_path`
  on the `reports_snap_2` row, so `isRebuilt()` could never tell a real conversion apart from a
  never-rebuilt legacy row — fixed in `convert_report.py`/`convert_template.py`, backfilled onto
  all 10 pre-existing conversions via a one-off script; (2) `ReportTagsEditor.jsx`'s free-text tag
  input committed raw typed text instead of the canonical prefixed vocabulary value ("AVAIL" instead
  of "agency:AVAIL"), permanently unfindable by the Tag Browser — fixed via a new
  `canonicalizeTag()` helper, one live bad tag corrected in the backfill. Also, per explicit user
  direction, legacy (never-rebuilt) rows now excluded from the picker entirely, not just
  down-ranked — `useReportSearch.js` filters `page_path notempty` unconditionally. A live
  cross-session write collision during the backfill (a sibling session concurrently reconverting
  the same report) resolved cleanly with no data loss. Live-verified end-to-end via claude-in-chrome
  reproducing the user's exact repro. Full detail above.
- **R82** (08-31): user's cosmetic-gap triage from round 81's 3 samples, 6 findings. 4 REAL bugs
  found + fixed (Round A): (1) RRL/chart series colors never copied from the old report
  (`build_route_entry` missing the `color` field `build_slot_entry` already had) — systemic, every
  multi-route converted report was affected; (2) graph section order didn't match the old tool
  (converter walked raw `graph_comps[]` array order, not the old tool's own `(layout.y,x)` visual
  order — now sorted before anything reads the list); (3) speed Route Map had no green in its
  color ramp (round 80's `colorBreaks.json` placeholder was pure yellow→red — replaced with a
  real ColorBrewer RdYlGn ramp, platform-wide for every speed map); (4) grid/line graph titles
  never showed which route/year (title was already author-editable, converter just never
  defaulted it — generalized an existing narrow merge-only title-suffix into the default path).
  All 3 round-81 samples reconverted + live-verified (colors/order/titles all confirmed correct in
  browser), full census 870/870 0 errors, `full_producible`/`converted_pages_total` unchanged.
  Report-folders→tags (Round B) scoped, corrected per user feedback (storage moved to the
  `reports_snap_2` dataset row, not a page field; vocabulary shared with routes), then BUILT +
  live-verified same day — new `fetch_agency_tag()` (Python) writes `agency:<code>` tags at
  conversion time; a chip-input editor and a full category→value tag-browser drill-down (mirroring
  RouteTagBrowserModal) shipped on the JS side; `AGENCY_CODES` extended 18→22 entries, shared by
  both pickers. Nesting checked against real data and found not worth replicating (only 4/870
  reports sit in any nested folder, all in personal test folders) — flat tags shipped instead, with
  a design note that flat multiselect tags already support future nesting-by-co-occurring-tags with
  no further storage change. Map-hover-tooltip finding from round 45/round-53's gap list
  corrected by the user — hover popups ARE an existing, proven DMS map capability
  (symbology-level), not a from-scratch feature as previously logged; not yet re-scoped (Round C).
  Full detail: [archive, "Round 82"](./old-reports-conversion-archive.md) once archived.
- **R81** (08-31): user requested 2-3 clean, RECENT sample conversions for side-by-side validation
  against the old tool. Found only 7 of 29 live `converted_reports/*` pages are real old-report
  conversions (the other 22 are the unrelated Dynamic Report Template catalog demo pages) — all 7
  predate 2025-04. Census re-run + cross-referenced against old-DB `updated_at` to rank zero-gap
  full/producible reports by real recency; converted 3 new ones: 1066 "787 NB 5-12-2026"
  (2026-05-12), 1064 "NYC Test" (2025-11-07), 971 "NITTEC 150" (2023-01-04) — all live-verified 0
  errors on the published view. Stale-auth-token probe gotcha hit + fixed (re-mint, not a new
  product bug). **Then a real bug**, user-caught in EDIT mode on those same pages: converted pages'
  `draft_sections` (what `/edit/` reads) silently dropped every section but the last — root cause
  was `dms section create`'s racy per-call read-push-write attach, called once per section in a
  loop; `sections` (published) never had this since it's built as one bulk write. Also found
  pre-existing on 1 of the 7 old real conversions (787). Fixed in `convert_report.py`/
  `convert_template.py`: draft rows now created via `raw create` + attached in one bulk update,
  mirroring the published path. All 4 broken pages reconverted (971→`2215835`, 1066→`2215853`,
  1064→`2215867`, 787→`2215885`), draft/published parity + live edit-mode rendering confirmed,
  published views re-verified unaffected. Full census 870/870 0 errors, `converted_pages_total`
  7→10. **Then a third bug**: report pages missing the compact sidenav rail (per-page
  `theme.layout.options.sideNav.activeStyle:1`) — the Report Page template already carries the
  right value but no page-creation path (`convert_report.py`/`convert_template.py`/
  `report_build.mjs`) ever copied it, so every created/recreated page silently lost it; fixed all
  3 to copy `theme` off the template, then backfilled all 22 currently-missing `converted_reports/*`
  pages via `dms raw update --set`. 32/32 report pages now carry the override, live-verified.
  Full detail: [archive, "Round 81"](./old-reports-conversion-archive.md).
- **R80** (08-27): platform-wide switch from dynamic to static color scales — new shared
  `colorBreaks.json` (same cross-language pattern as `vocabulary.json`), Route Map's live
  `colorDomain` refetch bypassed via the Map runtime's own existing `bin-method:'custom'` escape
  hatch, Python's entire per-report quantile-bake machinery retired outright, a genuinely new
  `colors.domainMin`/`domainMax` capability added to core GridGraph/BarGraph with a real
  SectionMenu UI control. Live-verified on report 168 (`--replace` → page `2215071`): confirmed
  **zero `colorDomain` requests fired**. Full census 870/870, 0 errors, `full_producible` unchanged
  at 184. Full detail: [archive, "Round 80"](./old-reports-conversion-archive.md).
- **R79** (08-27): Info Box migrated onto the bridge — a genuinely new `grain` (`route`/`tmc`)
  capability in `composeTableMeasuresConfig`, not just reuse, plus a `length`/`aadt` TMC-grain
  expression override. Found+fixed a real cross-platform bug: the generic `reconcileComparisonSeriesColumnOnState`
  was adding a spurious second categorize column at TMC grain. Reliability/multi-measure composition
  simplified via a new `ensure_dynamic_bridge_template` helper. `info_box_templates.py` 822→~200
  lines. Live-verified on report 1045 (after cleaning up a partial page from an unrelated transient
  DB timeout), full census 870/870 0 errors, `full_producible` unchanged at 184. Full detail:
  [archive, "Round 79"](./old-reports-conversion-archive.md).
- **R78** (08-27): Route Compare Component migrated onto the bridge — near-zero-new-code, since
  `composeTableMeasuresConfig` already produced byte-identical delta-column math; real work was 2
  small general-purpose Table-bridge infra additions (Spreadsheet config loading, `elementType`
  branching) round 79 also reused. One accepted behavior change: travelTime-only tables now compose
  with no join (unneeded — functionally equivalent, matches every other travelTime consumer's own
  contract). Live-verified on report 168, full census 870/870 0 errors, `full_producible` unchanged
  at 184. Also raised (not resolved this round) a platform-wide static-vs-dynamic color-scale
  question. Full detail: [archive, "Round 78"](./old-reports-conversion-archive.md).
- **R77** (08-27): extended round 76's bridge-composition pattern from GridGraph-only to
  LineGraph/BarGraph/Bar Graph Summary/Route Difference — 37 mechanical dict moves + 3 unlocked by a
  new `summaryDelayGrainKey` JS capability (avgHoursOfDelay's Bar Graph Summary value, ported
  byte-identical from Python's `_avg_delay_summary_expr`). 6 entries deliberately held back (the base
  template; 5 "Hours of Delay Graph" per-TMC BarGraph entries — a newly-found `categorize:"tmc"`
  BarGraph gap). Fixed a round-76 census side-effect gap (`AADT_CONSUMING_TEMPLATES` missing
  GridGraph's bridge-composed entries) along the way. Live-verified on reports 787/584, full census
  870/870 0 errors, `full_producible` unchanged at 184. Full detail: [archive, "Round
  77"](./old-reports-conversion-archive.md).
- **R76** (08-26): architectural fix — GridGraph's 18 templates now COMPOSED via the real
  `applyMeasurePick`/`composeMeasureConfig.js` (`compose_bridge.mjs`/`compose_bridge.py`), not
  hand-built Python; the two-independent-reimplementations problem rounds 74/75 kept finding is now
  structurally impossible for this graph family. Found+fixed a real, independent join-staleness bug
  for `speed`/`travelTime` along the way (round 59 never reached them). Live-verified on 4 reports
  (435/751/1037/584), full census 870/870 0 errors, `full_producible` unchanged at 184. Full detail:
  [archive, "Round 76"](./old-reports-conversion-archive.md).
- **R75** (08-26): fixed GridGraph's "confetti" rainbow color scale — a direct port of
  `composeMeasureConfig.js`'s 2026-08-12 fix (`{type:"scheme",scheme:"rdylgn",reverse}`), same
  shape as R74's yAxis fix. Live-verified on all 18 GridGraph templates + report 435 (page
  `2214893`). Full detail: [archive, "Round 75"](./old-reports-conversion-archive.md).
- **R74** (08-26): fixed a user-reported live bug — every GridGraph's y-axis showed "NaN" instead
  of the TMC id (`display.yAxis` inherited a numeric `tickFormat` from the LineGraph base template,
  applied to a categorical TMC-id axis). This is the SAME symptom round 69 mis-diagnosed as a
  data-shape oddity. Fixed in `graph_templates.py`'s `ensure_graph_templates` (mint + drift);
  live-verified on report 435 (page `2214862`), all 18 GridGraph templates swept directly. Full
  detail: [archive, "Round 74"](./old-reports-conversion-archive.md).
- **R73** (08-26): fixed round 71 finding (2) — the `{recent-NaN}` relativeDate-placeholder crash
  (13/870 reports), gap-logged instead of hard-crashing (`convert_report.py`). Live-verified: all
  3 corrupted-value shapes dry-run clean; report 435 converted for real → page `2214814`
  (superseded by R74's `2214862`), 0 errors, full census 870/870 0 errors, `full_producible`
  unchanged at 184. Full detail: [archive, "Round 73"](./old-reports-conversion-archive.md).
- **R72** (08-25): fixed round 71 finding (1) — `_measurePick.routeWindows` now written per-comp
  (`section_builders.py`), matching the shape `useGraphPublish.js`/`report_build.mjs` have read
  since the 2026-08-14 `routeWindows` migration. Live-verified on report 1045 (`--replace` → page
  `2214660`), `report_probe.mjs --auth` 11/15 sections with content, 0 errors. Full detail:
  [archive, "Round 72"](./old-reports-conversion-archive.md).
- **R71** (08-25): pre-reconversion audit — census-based clean/needs-attention/junk classification
  of the full 870-report corpus (184/328/358), plus 4 tooling-verification findings (finding 1
  fixed in R72; finding 2 fixed in R73; findings 3-4 resolved/descoped — see Current state).
- **R70** (08-07): converter's `_measurePick` write was unconditionally hardcoding a converted
  graph's `weekdays`/`start`/`end` to the empty "all day" default, silently dropping every
  converted report's weekday mask/peak-hour window — new `resolve_measure_pick_window`
  (`section_builders.py`) backfills it from the assigned route_comp(s)' own settings when they
  agree, gap-logs `measure_pick_window_mixed` when they don't. Live-verified on report 1045
  (`--replace` → page `2209156`, since gone — see round 71's dev-DB-reset finding). RouteComp-dedup
  question (the original ask) investigated, judged low-severity/cosmetic, deliberately deferred —
  see round 71 finding 1: an unrelated 2026-08-14 migration (`routeWindows`) silently broke this
  same fix again 2 days later, not yet re-fixed. Full detail: [archive, "Round
  70"](./old-reports-conversion-archive.md).
- **R69** (08-04): live user-reported bug sweep on `converted_reports/floating_car_average_day` —
  day-of-week x-axis raw-integer labels, GridGraph tooltip NaN (indexFormat/keyFormat swap),
  Bar Graph Summary flat coloring (colorsByKey-by-index fallback), comparison-series anchor-row
  sort order (stable partition in `dataWrapper/getData.js`). Surfaced the draft_sections/sections
  disjoint-row-id platform fact. Full detail: [archive, "Round 69"](./old-reports-conversion-archive.md).
- **R68** (07-20): wired `ensure_bar_graph_summary_pm3_template` (Bar Graph Summary
  `freeflow-byDateRange`, source 1410) into `convert_report`/`census_old_reports.py` — dead code
  since round 38, made actionable by round 66's pm3 backfill. `full`/`full_producible` unchanged at
  229/181; mapped instances (excl. pre-2017) 5,162→5,194 (+32); `converted_pages_total` 35→36.
  Live-verified via a real (non-dry-run) conversion of report 316. Full detail: [archive, "Round
  68"](./old-reports-conversion-archive.md).
- **R67** (07-20): read `RouteLineGraph.jsx`/`RouteCompareComponent.jsx`/`GeneralGraphComp.jsx`
  (transportNY) directly to resolve round 63's 159-instance `mixed_resolutions_on_graph` residual —
  confirmed the user's hunch that no policy decision was needed. Route Compare Component's 21 were
  a pure false positive (resolution never read by the real component); Route Line Graph's 121 had
  one fully deterministic old-tool default (first comp's resolution wins). `full` 218→229 (+11),
  `full_producible` 174→181 (+7), mapped instances 5,056→5,162 (+106), `mixed_resolutions_on_graph`
  159→20. Full detail: [archive, "Round 67"](./old-reports-conversion-archive.md).
- **R66** (07-20): pm3 (source 1410) 2018-2020 backfill wired into `PM3_VIEW_BY_YEAR` (user
  backfilled the underlying data outside this session) — `full` 194→218 (+24), `full_producible`
  164→174 (+10), mapped instances (excl. pre-2017) 5,027→5,056 (+29). 2017 deliberately NOT added
  (view is missing all 8 `speed_pctl_*` columns, can't back `freeflow`). Bonus finding:
  `ensure_bar_graph_summary_pm3_template` (Bar Graph Summary × freeflow-byDateRange) is dead code,
  never wired into the convert/analyze pass — the backfill makes 22+1 instances newly
  data-feasible, scoped as a follow-up, not built this round. `converted_pages_total` unchanged
  (35) — pure data-coverage gain, no pages built/reconverted. Full detail: [archive, "Round
  66"](./old-reports-conversion-archive.md).
- **R65** (07-20): fixed a user-reported epoch-tick regression on old report 33 (a pre-round-61
  page) by reconverting it, then found and fixed a second, self-inflicted URL-stability regression
  that very reconversion caused — `convert_report()` was still minting every new/reconverted page
  at the throwaway `report_<old_id>` slug scheme instead of the stable `converted_reports/<title>`
  scheme 34/37 live pages already converge to; new `compute_report_slug()`/`to_snake_case()` (exact
  ports of the admin UI's own `getUrlSlug()`/`toSnakeCase()`) fix it for good — a page's slug is now
  BORN on the stable scheme. Closes the write-side half of round 63's `url_slug` gap. Full detail:
  [archive, "Round 65"](./old-reports-conversion-archive.md).
- **R63** (07-17): corrected the stale "392 mixed-resolution" figure (real remaining count: 159,
  concentrated in Route Line Graph) and fixed the `url_slug`-based idempotency/census bug that let
  2 duplicate converted pages accumulate — `find_page_by_old_report_id()`/`fetch_converted_pages()`
  now key off the durable `_converted_from_old_report_id` field instead of `url_slug`. Only fixed
  the *read side*; round 65 found and fixed the *write side* (`convert_report()` still minted new
  pages at `report_<old_id>`). Full detail: [archive, "Round 63"](./old-reports-conversion-archive.md).
- **R64** (07-20): follow-up cleanup — minted a fresh token and ran `cleanup_duplicate_pages.py`;
  found both stale pages had already been deleted by an untracked session, which crashed
  `delete_converted_page()` with an `AttributeError` (fixed: now prints "not found, skipping").
  Census confirmed `converted_pages_total: 35`, no duplicates remain. See item (m) above.
- **R62** (07-17): axis-label (title/caption) fix — user-reported 2026-07-13 gap, root-caused as
  a converter omission (the render path already worked) rather than the round-34/60 squeeze bug.
  `display.yAxis.label` now set from the yAxis column's own `customName`; `display.xAxis.label =
  "Time of Day"` for every epoch-axis spec; 6 `AVG_DELAY_EXPR` specs that had no `customName` at
  all got one. Live-verified on report 787 (page `2194270`); full census rerun (869/869, 0
  errors) byte-identical mapping stats. See "Known functionality gaps" above for full detail.
- **R61** (07-17): epoch→HH:MM x-axis tick format shipped (the last round-53 priority-list item) —
  new `epoch_time` `ValueFormats` entry + xAxis named-formatFn wiring in `GraphComponent.jsx`
  (generic, author-facing, mirrors the existing yAxis Tick Format select) + converter default-set
  across every `"xAxis": "epoch"` TEMPLATE_SPECS entry via drift detection. Live-verified on
  reports 179 (page `2194183`) and 787 (page `2194197`), exact tick-value math confirmed on both.
  Full census rerun (869/869, 0 errors) byte-identical mapping stats. All 9 round-53 triage items
  closed as of this round. Full detail: [archive, "Round 61"](./old-reports-conversion-archive.md).
- **R60** (07-17): legend/flex width-squeeze (parked since round 34) un-parked and fixed
  platform-wide via a dynamically-measured guard (`useLegendSqueezeGuard`, `getBoundingClientRect`
  at render time), not a static CSS cap — a page whose legend already fits renders a
  byte-identical className to before, confirmed live (report_1033); previously-squeezed sections
  (report_787) improved from ~181-195px to 243px chart width. Applied uniformly to all 5
  content-driven-legend wrapper types (Bar/Line/Pie/Sunburst/Treemap Graph); GridGraph excluded
  (already safe, fixed-width linear legend only). Full detail: [archive, "Round
  60"](./old-reports-conversion-archive.md).
- **R59** (07-17): TMC meta join source swapped off the frozen 2025-only snapshot (1946/3298)
  onto the year-matched `NPMRDS_V6_tmc_meta` (582/983, compound `tmc + toYear(ds.date)=year` key)
  — fixes hoursOfDelay/avgHoursOfDelay/co2Emissions/avgCo2Emissions for every non-2025-dated
  report (a 2019 spot-check found 46.5% of TMCs had a different `aadt` under the old frozen
  join). 2017 rows (missing from 582/983) now null out cleanly via `nullIf` guards instead of
  reading as a wrong zero. Two pre-existing drift-detection gaps found & fixed along the way
  (`ensure_graph_templates` never refreshed `join` on drift; `ensure_info_box_delay_template` had
  no drift detection at all). Live-verified on 775/787/751/1033/179; census unchanged (869/869, 0
  errors) as expected for a correctness-only fix. Full detail: [archive, "Round
  59"](./old-reports-conversion-archive.md).
- **R58** (07-17): Info Box travel-time mm:ss formatter shipped (item 7, priority-list #7) — new
  generic `minutes_clock` formatFn entry (shared registry, every Card/Table cell app-wide);
  `ensure_info_box_traveltime_template` gained real column-drift detection (was static); live-
  verified on report 181 (page `2194036`), M:SS hand-checked exact against raw CH values. Full
  detail: [archive, "Round 58"](./old-reports-conversion-archive.md).
- **R57** (07-17): GridGraph missing-data color fix shipped (item 3, priority-list #5) — missing
  cells now render black (author-overridable via a new "Missing Data Color" config field) instead
  of transparent; live-verified on report 584 (page `2193032`) via a before/after stash comparison.
  Same-round follow-up: no-data TMCs also filtered out of the GridGraph hover tooltip list, user-
  confirmed live. Full detail: [archive, "Round 57"](./old-reports-conversion-archive.md).
- **R56** (07-17): graph title default fix shipped (item 8's title half, priority-list #4) — empty/
  missing `state.title` in `analyze_graph()` now defaults to the old client's own template
  `"{type}, {data}"` instead of a blank section header; live-verified on report 520 (reconverted
  `--replace` → page `2194026`, both sections now show real titles); full census rerun (869/869, 0
  errors) unchanged as expected for a pure title-string fix. Full detail: [archive, "Round
  56"](./old-reports-conversion-archive.md).
- **R55** (07-17): report 7's pre-2017-only converted page (`2191132`, surfaced by round 54's
  restored census) deleted per user go-ahead; BarGraph tooltip customName fix shipped
  (`graph_new/components/BarGraph.jsx` — hoisted `labelForKey` into a new `hoverComp`, mirroring
  `LineGraph`'s existing customName-aware tooltip), live-verified on reports 520 and 787. Full
  detail: [archive, "Round 55"](./old-reports-conversion-archive.md).
- **R54** (07-16): rebuilt the pre-2017-only report-level refusal that R53 found had regressed
  (`PRE_2017_CUTOFF`/`report_is_pre_2017_only`/`pre_2017_only`), live-verified against the 4
  reports it used to block + false-positive-checked against report 191 and 3 known-good pages;
  full census rerun (869/869, 0 errors) surfaced one more live pre-2017-only page (report 7,
  `2191132`) — deleted round 55. Full detail: [archive, "Round 54"](./old-reports-conversion-archive.md).
- **R53** (07-16): user's 9-item triage punch list, all 9 items + 2 bonus findings root-caused
  (stray duplicate `reports_snap_2` rows on 6 pages — deleted same-day follow-up; the pre-2017-only
  report-level refusal found to have silently regressed; BarGraph tooltip/graph-title/GridGraph
  color/Info-Box formatter/epoch-axis/TMC-meta-join fixes all root-caused but not yet built).
  Full detail: [archive, "Round 53 triage"](./old-reports-conversion-archive.md).
- **R52** (07-16): Route Difference Graph + TMC Difference Grid scoped (user endorsed all 4 open
  questions same day) and BUILT same-day — a new `comparisonSeries` "difference" combine mode
  (server-side INNER JOIN of each non-anchor arm to the anchor on group-by columns, dms-server +
  client forwarding, library-isolated) + diverging BarGraph/GridGraph rendering (zero-centered
  y-domain and `byValueSymmetric` colors) + converter templates for every buildable
  measure×resolution bucket (speed/travelTime/hoursOfDelay/avgHoursOfDelay/CO2, 5-min/15-min/day,
  truck+passenger). Live-verified on reports 584/354/1037/1039, ground-truthed bit-exact against
  hand-built two-arm ClickHouse subtractions. Census: `full` 217→261, `full_producible` 188→231
  (+43), `converted_pages_total` 36. Deliberately NOT built (44 instances, gap-logged):
  hoursOfDelay×truck (volume term), combined-fleet CO2, a `SPEED` typo instance, 3
  mixed-pair-dataColumn degenerates. Bonus platform fix: a colorDomain join-key double-projection
  bug (ambiguous `tmc` column) found & fixed. Full detail: [archive, "Round
  52"](./old-reports-conversion-archive.md).
- **R51** (07-15): 4 user-reported display bugs fixed & live-verified (backwards color scales
  outside Map — `REVERSE_COLORS_MEASURES` generalization of the round-50 constant, applied in
  the generic `COLOR_RANGE_GRAPH_TYPES` wiring, 14 reports reconverted; duplicate identical
  RouteMap legend blocks — 2 compounding causes in `useComparisonSeriesLayers.js` + the 4
  choropleth TEMPLATE_SPECS' `legend-orientation`; minutes-vs-seconds legend readability —
  `formatMinutesAuto` + `display.tooltip.minutesAutoSeconds`; bonus latent shared-palette
  `.reverse()` mutation fix in 5 graph types). **Same-day follow-up**: `TILE_HOST` auto-detect
  (TCP probe of localhost:3001, `DMS_TILE_HOST` env still wins — forgetting the override on
  CONVERT commands had silently baked 10 reconverted pages to production that round); and the
  multi-comp RouteMap design question resolved+built — same-route comps are now exclusive like
  the old tool (`dedupeVariantsByGeometry` in `useComparisonSeriesLayers.js`, mirrors old
  RouteMap's tmcArray-identity guard, runtime-only, verified via tile-request capture on
  report_775). Legend/paint off-by-one root-caused but HELD BACK per user scope pick. Census
  clean (869/869, 0 errors), 32 pages. Full detail in the archive.
- **R50** (07-15): **Route Map M3 CLOSED** — travelTime + avgHoursOfDelay (day & 5-min keyed) +
  hoursOfDelay choropleths all BUILT & LIVE-VERIFIED (`full_producible` 184→188); choropleth
  legend bug fixed (missing `layer-type: "choropleth"` → bare title rows instead of a
  StepLegend ramp); travelTime color-direction correction (old `getColorRange()` applies
  `reverseColors` BEFORE RouteMap sees the ramp — the first "faithful port, no reversal" call
  was wrong; `ROUTE_MAP_REVERSE_COLORS_MEASURES` added); `build_ch_join_wire()`
  calculated-dsColumn bug fixed on the live TILE endpoint (was silently degrading two-source
  delay joins to geometry-only tiles → invisible TMCs on reports 1033/1056, user-confirmed
  fixed live); 2 same-round self-inflicted regressions caught before shipping (speed-template
  tail truncation, `slug` loop-variable clobber). Full detail in the archive.
- **R49** (07-15): Route Map M2 built & live-verified — converter speed choropleth (previously
  #1-ranked unmapped bucket, 256/214/45, now fully absorbed). Two real platform gaps found &
  fixed (nested-join forwarding silently dropped on tile/colorDomain requests; live re-break only
  updated the legend text, never the paint itself) + a converter join-shape bug that crashed the
  entire dms-server process outright (fixed via new `build_ch_join_wire()`). `DMS_TILE_HOST` env
  override added for local tile verification. Census: `full_producible` 122→184, instances mapped
  61.9%→69.2%. Full detail: [archive, "Round 49"](./old-reports-conversion-archive.md).
- **R48** (07-15): Route Map M1 built & live-verified — dms-server ClickHouse join sources for
  tiles + colorDomain (library task `tile-join-clickhouse-source.md`), unfiltered-CH-join
  scan-hazard refusal, >20k-key geometry-only fallback with a loud log. Full detail: [archive,
  "Round 48"](./old-reports-conversion-archive.md).
- **R47** (07-14): Route Map M0a+M0b built & live-verified — `comparison_series` subscriber
  runtime for the Map section (library) + per-year none-map converter templates. Census: full
  101→126 (+25 flips from none-maps alone). Full detail: [archive, "Round
  47"](./old-reports-conversion-archive.md).
- **R46** (07-14): map-component-unification update landed upstream; Route Map plan re-verified
  against it (v2.2) — no material change, M0a shrinks to ~1 round since the Map now ships
  `display._functions` pub/sub natively. No code this round. Full detail: [archive, "Round
  46"](./old-reports-conversion-archive.md).
- **R45** (07-14): Route Map work plan v2.1 amendment — user rejected static interactivity; traced
  the real mechanism (`comparison_series` subscriber via RRL, not the page-filter sync the Map
  excludes) and redesigned the bridge as series-driven symbology layers. No code. Full detail:
  [archive, "Round 45"](./old-reports-conversion-archive.md).
- **R44** (07-14): Route Map work plan v2 scoped (no code) — phases M0 none-maps / M1 dms-server
  CH-join source / M2 speed (78 flips) / M3 remaining measures (+4); per-year TMC geometry tile
  views already exist so year-pinning dissolves. Full detail: [archive, "Round
  44"](./old-reports-conversion-archive.md).
- **R43** (07-14): Route Map recommendation revised (user-prompted second look) — round 41's
  vetting had checked the wrong tile server; the dev stack's real tile server (dms-server itself)
  already implements the symbology `join=` param. Real remaining gap: CH join sources aren't
  supported server-side yet (became M1). No code. Full detail: [archive, "Round
  43"](./old-reports-conversion-archive.md).
- **R42** (07-14): TMC Grid Graph per-TMC breakdown bug fixed (user-caught on report 914's
  "Winter Average Day" — was rendering one aggregate strip instead of per-TMC rows) + corpus
  sweep (320/751/315/1045 reconverted, all clean); ground-truthed exactly against ClickHouse.
- **R41** (07-14): Route Map scoped (no code) — read `RouteMap.jsx` for real + corpus survey (849
  instances/636 reports; speed 655/none 97/travelTime 44/delay 35/pm3-gated 17); found per-TMC
  geometry already reachable via the default 455/3464 join, no new tile/fetch layer needed.
  Initial plan (later revised in R43): new `MapGraph` AVL Graph type. Full detail: [archive,
  "Round 41"](./old-reports-conversion-archive.md).
- **R40** (07-14): cleanup (g)+(h) closed (report 745/191/pre-2017 pages); Info Box
  `length`/`travelTime`/`aadt`/`hoursOfDelay` measures built (4 new buckets); a real
  `graph_comps[].id` gid-collision bug found + fixed (synthetic `graph-idx-{i}` fallback) — see
  archive for full detail.
- **R39** (07-14): pre-2017-only report-level skip built (`PRE_2017_CUTOFF`,
  `report_is_pre_2017_only`) + census mirror; 133/868 reports (15.3%) are pre-2017-only —
  excluding them, only 59 full (not 101) / 3,801/6,520 mapped (58.3%); shell page
  874→`2188794` deleted (`converted_pages_total` 26→25); 4 already-converted pages found to be
  pre-2017-only (16/54/58/142), surfaced not deleted.
- **R38** (07-14): Phase B — avgTT-byDateRange alias (B1) + Route Info Box avgTT-byDateRange
  static template (B3, 38 flips materialized) + Bar Graph Summary freeflow-byDateRange pm3
  template (B2, mechanism proven, 0 real corpus flips — pre-2019 corpus dates outside 1410's
  coverage). 63→101 full, 58.1% mapped.
- **R37** (07-13): census refresh + round-33 report-level mirror; 63/669/122/14, 56.8% mapped;
  213 `no_valid_routes` shells enumerated corpus-wide; only converted shell is 874→`2188794`
  (deletion pending, user to run).
- **R36** (07-13): Bar Graph Summary Phase A completed (travelTime / hoursOfDelay /
  avgHoursOfDelay incl. per-resolution composite-map-key expression — first lambda-bearing
  calculated column); 787→`2190210`, 320→`2190225`, 1061 reconverted →`2190527`; 15/15 live
  values ground-truthed exactly; weekday variant spec-only (lone instance = report 1028);
  width-squeeze diagnosed page-wide (stays PARKED); report 678 found route_missing_everywhere.
- **R35** (07-13): SPEED_EXPR/TRAVEL_TIME_EXPR two-level backport to all 16 live speed/TT
  templates (fn "exempt" + customName; grid templates were invisible to drift detection —
  fixed); 15 reports reconverted + Playwright-verified, 184/184 live values match two-step
  ground truth exactly; travel time now route-traversal MINUTES; 471 deleted
  (`no_valid_routes`); page ids in Artifacts section.
- **R34** (07-13): Bar Graph Summary scoped (649 instances; Phase A/B mapping, 96% coverage path);
  old two-level speed/TT semantics LIVE-CONFIRMED against the old UI (23.03 vs the platform's
  26.02, +13% — flat map-combinator expressions proven equal to ground truth; backport spec
  user-endorsed → round 35). Speed summary variant BUILT + live-verified on report 520 (page
  `2189837`, values <0.2% off CH ground truth): comp display-name substitution ported
  (`getRouteCompName`), `AGGREGATE_FNS` "exempt" platform fix (buildUdaConfig.js + test), legend
  flex-squeeze mechanism pinned (template-side `legend.show=False` + customName; platform fix
  parked). Known cosmetic deltas: single-color bars, bar order, padding.
- **R33** (07-10): `route_missing_everywhere` × `categorize:"tmc"` = live unfiltered-TMC-scan crash
  (`MaxPathsExceededError`, 13.2M paths) — fixed (`graphIds: []` for tmc-less routes +
  report-level `no_valid_routes` skip); reports 1032/392 deleted as permanently-empty shells; also
  fixed `load_graph_templates()` default `--limit 20` silently dropping the 2 base templates.
- **R32** (07-10): `avgHoursOfDelay` built + live-verified (per-resolution bucket-grain derivation).
- **R31** (07-10): Info Box resolution-ambiguity false positive fixed — resolution-irrelevant
  measures bypass the mixed-resolution guard.
- **R30** (07-10): `byValue` color-scale gap root-caused, NOT fixed (investigation only, per user).
- **R29** (07-10): Route Bar Graph speed/travelTime at every missing resolution — built,
  live-verified (Phase 1 of the census "buildable" lever).
- **R28** (07-10): `DELAY_EXPR` 0-as-missing fix — built, live-verified.
- **R27** (07-10): fresh corpus census (fixed the stale census script first). Headline: 46 full /
  559 partial / 249 none; 27.3% instances mapped; buildable bucket 2,450 unchanged; no_equivalent
  ranking = Route Map 849 / Bar Graph Summary 649 / Route Difference 199 / TMC Difference Grid 143.
- **R26** (07-10): Route Compare anchor row fixed (user-caught; round 25's Playwright pass missed it).
- **R25** (07-10): Route Compare Component built + live-verified; new generic `__ANCHOR__(...)`
  cross-arm mechanism; fixed missing-`fn` silently blocking a section's fetch.
- **R24** (07-10): user reprioritization — reopened Route Map / Bar Graph Summary / Route
  Difference / TMC Difference Grid / `overrides.baseSpeed`; set the show-plan-first process rule.
- **R23** (07-10): 0-as-missing sweep on `SPEED_EXPR` + `tmc_travel_time_bar_graph_day` — built,
  live-verified.
- **R22** (07-10): freeflow (`speed_pctl_85`) wired into the Info Box templates.
- **R21** (07-10): two stale next-candidates closed; per-report/per-comp reliability BIN selection
  built (was hardcoded `amp`).
- **R20** (07-10): Route Info Box pagination-length bug fixed (raw-count length fan-out).
- **R19** (07-09): generalized per-report/per-year Info Box template selection (`graph_max_year`);
  no more hand-built-per-report templates.
- **R18** (07-09): first real `pgFederated` use — LOTTR/TTTR live on report 1045; `Attribution.jsx`
  platform fix; continued: build relabeled Route Info Box (not TMC — grain is one row per ROUTE).
- **R17** (07-09): 1410's TMC-id column confirmed; product decision — reliability shows
  current/correct pm3 values, not faithful old-math replicas.
- **R16** (07-09): `pgFederated` join source built — `buildJoin` recognizes an inline
  `postgresql()` join source, creds resolved server-side from the pgEnv config.
- **R15** (07-09): investigated reusing existing PM3/MAP21 sources (1722/2001/1410) vs recomputing —
  led to the join approach.
- **R14** (07-09): freeflow `quantile()` prototype — surfaced the two-stage-aggregation platform
  gap (percentile-of-percentile not expressible; still the blocker for percentile indices).
- **R13** (07-09): Info Box family scoped (read all old components first); continued:
  `authoritative_freeflow` blocker dissolved via the DAMA pm3/map21 pipeline.
- **R12** (07-09): Hours of Delay stragglers (day/hour/15-min/month) built; corpus data-coverage
  finding; (report 392's conversion here was later found empty and deleted in R33).
- **R11** (07-09): Hours of Delay Graph 5-minutes built + live-verified; first `categorize:"tmc"`
  template minted.
- **R10** (07-08): first full-corpus gap census (`census_old_reports.py`, all 868 reports).
- **R9** (07-08): truck CO₂ NULL root-caused — CH stores 0 not NULL for missing; fixed with
  `coalesce(nullIf(col,0), nullIf(fallback,0))`; continued: `overrides.aadt` done + live-verified.
- **R8** (07-08): Falcor sibling-cache-collision fixed (own task file, completed); exposed the
  truck-CO₂ NULL as a separate real bug.
- **R7** (07-08): color rendering root causes — GridGraph palette truncation fixed via new shared
  `buildValueColorScale`; BarGraph gained `colors.byValue` mode + SectionMenu toggle.
- **R6** (07-08): `color_range` wiring + `graph_layout` width → section `size` (theme
  `transportnyv2`); all 6 pilot reports re-run; ClickHouse unfiltered-probe hazard found/fixed
  mid-round (own task file).
- **R5** (07-08): CO₂ emissions calculated column built; report 751 converted; query-cache
  collision found (became R8's task).
- **R4** (07-08): weighted Hours-of-Delay built; CH ambiguous-identifier fix on 3-way joins
  (`handleFilterGroupsCH` join-aware qualification).
- **R3** (07-08): reports 1061/1045/874 converted; non-deterministic resolution/dataColumn
  selection bug fixed; AM/PM/off-peak flags proven query-inert (not a gap); calculated-join-key
  fix in `buildUdaConfig.js`.
- **R2** (07-08): report 1071 converted — 11/13 graphs live.
- **R1** (07-08): report 1070 converted end-to-end — first proof of the whole pipeline.


## Objective

Replace the old Reports/Routes tools (`npmrds.devtny.org/reports`) while **preserving as much old
report data as possible**. Write automated, repeatable script(s) that pull old reports from the old
DB, transform them, and create equivalent report pages in the new DMS system. Conversion first;
authoring UI ergonomics explicitly deferred — a large flat pile of graph templates is acceptable,
**provided every template stays describable by `TEMPLATE_SPECS` parameters** (see the 2026-07-13
strategic frame in the standing directives: the catalog + its selection vocabulary IS the end
product; the future authoring UI coalesces author selections into templates and rides native DMS
page edit/publish/layout).

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
  For inspecting/patching pages don't hand-roll scripts: `dms page dump <id> --sections` resolves
  section states in one call; `dms raw update <id> --set nested.key=value` does dot-notation deep
  patches. (Deep edits inside *stringified* element-data still need a read-modify-write, but
  prefer reconverting the page via the converter over hand-patching.)
- **Stack preflight**: `python3 scripts/npmrds-reports/preflight.py` — one command checks vite, dms-server
  (/graph roundtrip), all three Postgres targets, ClickHouse, stray CH queries >60s (the
  unfiltered-scan hazard), and recent dms-server log errors. ~1s when healthy; fails fast with a
  VPN diagnosis instead of hanging. Run at session start or whenever anything hangs.
  `python3 scripts/npmrds-reports/dbq.py chprocs` runs just the stray-CH-query check (use before/after live
  report-page loads).
- **Ad-hoc queries / data validation**: `python3 scripts/npmrds-reports/dbq.py <old|new|dama|ch|graph|oldgraph> "<sql-or-paths>"`
  — one read-only runner for all backends (old/new/dama Postgres, ClickHouse HTTP, local +
  prod falcor). Creds read at runtime from the config files above; pg forced
  `default_transaction_read_only=on`, CH `readonly=2`, no write flag exists; 5s connect
  timeout with VPN hint instead of hanging. Bespoke validation scripts should `import dbq`
  (from `scripts/`) instead of re-implementing psql/CH/falcor boilerplate. Writes still go
  only through `convert_old_reports.py`, the dms CLI, or the user.
- **Live page verification**: `node scripts/npmrds-reports/report_probe.mjs <slug>` (repo root of dms-template) —
  single parameterized Playwright harness replacing the old one-off scratchpad scripts. One load
  collects console/page errors, non-200s, pending-at-close requests (hung/unbounded-query
  tripwire), decoded `/graph` traffic (`--grep` to filter), per-section SVG census, full-page +
  `--section` screenshots, JSON dump to `scratchpad/npmrds-sub/tmp/probe_<slug>.{png,json}`.
  Custom probes via `--eval file.mjs` (`export default async (page) => ...`); if the same eval
  probe is needed twice, promote it to a flag in the harness instead of forking. `--auth`
  injects the minted token (`scratchpad/npmrds-sub/.dms-auth-token`, refresh via user-run
  `mint_token.sh`) into `localStorage.userToken` for logged-in/edit-mode probes.

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

- **Info Box multi-measure support + literal LOTTR/TTTR recognition, needed for real report
  fidelity (round 85, 2026-08-31, NOT built — user: "somewhat soon... idk if mandatory")**: two
  entangled gaps surfaced while fixing the `speed` bucket (round 85 above).
  1. **`convert_report.py`/`convert_template.py` only ever build ONE measure per Info Box graph,
     full stop.** The old tool's real Route/TMC Info Box shows N measures as N columns in one box
     (e.g. "Speed, Travel Time") — `analyze_graph` only classifies/builds a graph's PRIMARY measure;
     every other configured display column is silently dropped into the generic
     `extra_measures_dropped` gap kind. Corpus-wide: **869 instances / 524 reports** carry at least
     one dropped secondary measure — the single largest gap-kind in the whole census, though it
     doesn't block a report from being classified "full"/clean (only the primary measure's mapping
     does). The multi-measure composition already exists
     (`build_route_info_box_section_state_multi`/`INFO_BOX_SPEC_MEASURES`, `check_info_box_measure_
     combo`) but is wired ONLY into the spec-driven `report_build.mjs` path (first real usage:
     `one_week_study`'s weekday Info Box, 2026-08-13), never into the automatic old-report converter.
  2. **The old tool's literal `LOTTR`/`TTTR` measure keys have no real classification at all** —
     confirmed by grepping `census.json`'s `extra_measures_dropped` gap detail directly: exactly 10
     reports (137, 156, 181, 185, 210, 231, 232, 244, 245, 298 — matches round 18's original count)
     request `LOTTR`/`TTTR` by name, always as a secondary/dropped column (gap 1 above), so they
     never surface as their own bucket in the ranked unmapped-key table the way `speed` did — a
     future session grepping the census for "what's still unmapped" would miss this entirely.
     Building real support means recognizing `LOTTR`/`TTTR` as their own primary-eligible measure
     keys in `analyze_graph`'s dispatch (today only `speed`/`travelTime`/`length`/`aadt`/
     `hoursOfDelay` are recognized at all) and reusing the reliability machinery round 85
     deliberately preserved for this (`ensure_pm3_join_template`/`graph_reliability_bin`/
     `PM3_VIEW_BY_YEAR`/`RELIABILITY_BIN_LABELS` — still defined, just unused by the `speed` bucket
     now). **Payoff today is zero**: all 10 reports predate 2018, outside 1410's coverage even after
     the 2018-2020 backfill — pure future-proofing until either more reports use it or another
     component (per the user: "we may need it for stuff") needs the same reliability data.
  Not scoped into a concrete plan yet — logged here as a real, user-endorsed follow-on, not a
  hypothetical.
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
- ~~Axis labels not visible on any report~~ **FIXED (round 62, 2026-07-17, user-reported
  2026-07-13)**: NOT the round-34 legend/flex squeeze (round 60 already fixed that; user
  screenshot confirmed tick values render fine, chart loaded in ~2s, no pending requests) — this
  is the axis TITLE/caption (e.g. "Avg. Hours of Delay", "Time of Day"), a distinct feature from
  tick labels. Root cause: the rendering path was never broken — `GraphComponent.jsx` already
  reads `display.xAxis.label`/`display.yAxis.label` and `AxisLeft.jsx`/`AxisBottom.jsx` already
  render a `text.axis-label` element whenever `label` is truthy (confirmed by reading the code,
  not assuming) — the converter simply never populated those fields, on any template, ever. Old
  client precedent found (`transportNY` src, `RouteLineGraph.jsx`): old tool set `axisLeft.label`/
  `axisRight.label` from each measure's own `label` field (a unit string, e.g. "Hours"); old tool
  did NOT label its time-of-day x-axis at all. Fix (converter-only, no library changes needed):
  `ensure_graph_templates` now sets `display.yAxis.label` from the yAxis column's own `customName`
  (already a human-readable measure description on ~40 TEMPLATE_SPECS entries, e.g. "Speed
  (mph)") whenever the column actually targets a real y-axis (`target: "yAxis"` — GridGraph's
  color-targeted value column is excluded, it has no literal y-axis), and sets
  `display.xAxis.label = "Time of Day"` for every `"xAxis": "epoch"` spec (a strict readability
  improvement over old-tool parity, since post-round-61 the ticks already read as real clock
  times). Both wired into the same lazy mint/drift-detection idiom as round 61's `epoch_time`
  format (`epoch_label_drift`/`yaxis_label_drift`) — every already-minted template picks up the
  fix the next time any report using it is reconverted, no proactive resweep. Also found and
  fixed a real pre-existing gap while at it: 6 `AVG_DELAY_EXPR`-based TEMPLATE_SPECS entries
  (`tmc_avg_delay_{line_graph,bar_graph_day,bar_graph_weekday,bar_graph_5min,bar_graph_hour,
  bar_graph_month}`) had no `customName` at all (unlike their "Difference" siblings and every
  other measure), so they'd have silently kept rendering an unlabeled y-axis even after this fix
  — added `"customName": "Avg. Hours of Delay"` to all 6. **Live-verified**: report 787
  reconverted `--replace` (new page `2194270`); drift fired on all 3 templates it uses
  (`tmc_avg_delay_line_graph`: yAxis expr + xAxis label + yAxis label; `tmc_travel_time_summary_
  bar_graph` and `tmc_avg_delay_summary_bar_graph_5min`: yAxis label). `report_probe.mjs`
  screenshot confirms both the "R5 I-290 Y2Y Delay Analysis" LineGraph (rotated "Avg. Hours of
  Delay" y-label, "Time of Day" x-label) and the "R5 HELP Routes Y2Y Delay Analysis" Bar Graph
  Summary (same y-label) now render real axis captions — exactly the two sections in the user's
  screenshot that had none. 0 console/page errors. Full census rerun: 869/869 reports, 0 errors;
  graph-instance mapping byte-identical to the pre-fix baseline (5,288/7,103), as expected for a
  pure display-label addition with no effect on coverage/mapping logic. **Not done**: no
  proactive resweep of other epoch-axis/yAxis-customName templates beyond report 787 (lazy-
  reconvert policy, same as round 61); non-"epoch" xAxis groupings (date/day/weekday/month/hour)
  get no x-axis label (matches old-tool parity — it never labeled those either); GridGraph's
  color-targeted value axis and its `categorize` dimension are untouched (different axis
  semantics, out of scope).
- **Epoch x-axis hover tooltip still shows the raw epoch integer, not a clock time
  (user-reported 2026-07-17, ROOT-CAUSED 2026-07-24, still NOT fixed)**: round 61 fixed the
  x-axis TICK labels (`epoch_time` format via `xAxis.format`/`getFormatFunc`) but did not reach
  the hover-tooltip value display, which still reads e.g. `186`/`142` instead of `15:30`.
  Re-confirmed live 2026-07-24 on the NY-9D Beacon report (`converted_reports/page_13_13`,
  travelTime LineGraph) — tooltip header read `142` while the axis directly below it correctly
  read `12:20`. Root cause found:
  `packages/dms/src/ui/components/graph_new/GraphComponent.jsx`'s `hoverComp` useMemo
  (lines 89-103) computes `valueFormat`/`yFormat`/`showTotals`/`minutesAutoSeconds` from
  `graphFormat.tooltip`, but never computes an `xFormat`/`idFormat`/`indexFormat` from
  `graphFormat.xAxis.format` the way the sibling `xAxis` prop does (same file, lines 168-178,
  `namedFormat = get(graphFormat, ["xAxis","format"]); if (namedFormat) return
  getFormatFunc(namedFormat)`). With no `xFormat` supplied, every avl-graph chart type's
  `DefaultHoverComp` falls back to its own bare default — `Identity` (pass-through, no
  formatting) for LineGraph (`components/avl-graph/LineGraph.jsx:53,58,167`:
  `xFormat(get(data,"x",null), data)` renders the raw value). BarGraph/GridGraph/PieGraph/
  TreemapGraph/SunburstGraph's `DefaultHoverComp`s take the equivalent prop under a different
  name (`indexFormat`) and are likely affected the same way, since the same `hoverComp` useMemo
  feeds all of them — not verified per-chart-type, but the fix is the same single spot either
  way. **FIXED and live-verified 2026-07-24**: added the `xFormat`/`indexFormat` computation to
  the `hoverComp` useMemo (reusing the same `namedFormat`/`getFormatFunc` lookup the `xAxis.format`
  prop already does), in both dms-template's `src/dms` submodule and transportNY's
  `src/modules/dms` submodule copy. Re-tested the same live repro (`page_13_13`'s overview
  LineGraph): tooltip now reads `11:50`, matching the axis, instead of the raw epoch integer. See
  `research/report-page-redesign/findings.md` ("RRL/tooltip triage, 2026-07-24") for the
  user-facing repro this was found from.
- **Route Compare anchor row ordering still inconsistent (user-reported 2026-07-13, NOT
  investigated — logged only, per user)**: recurrence/incomplete fix of the round-26 user-caught
  anchor-row bug. User saw the anchor row render in the MIDDLE of the table once (anchor was
  2021 and the table sorted by year, so the ordering had a cause) — but the anchor row must
  always be first. Likely suspect from the round-26 archive notes:
  `RouteCompareComponent.jsx`'s `renderGraph` does `graphData.slice(0,1)` — i.e. assumes the
  anchor is row 0 rather than identifying it, so any data-driven sort order breaks it. Unverified.
- ~~Route Map choropleth has no color-scale legend~~ **FIXED (round 50, 2026-07-15,
  user-reported)**: user saw the Map's "legend" panel render as a bare list of layer names with
  no color swatches/scale telling them what's displayed or what the values mean. Root-caused
  (not just observed): `ensure_route_map_speed_template`'s `template_layer` dict never set
  `"layer-type": "choropleth"` — `LegendPanel`'s `LegendRow` component
  (`ComponentRegistry/map/LegendPanel/LegendPanel.jsx`) branches on exactly that key to choose
  `StepLegend` (the color-ramp/step-swatch renderer) vs. a bare title row; with the key absent
  it silently fell through to the title-only path every time, for every converted Route Map
  speed choropleth since M2 (round 49) — never caught then because that round's verification
  checked tile/join network traffic, not the legend panel itself. One-line fix (added the
  missing key to `template_layer`); `bake_route_map_speed_paint` clones/mutates that same dict
  per-report so no other function needed touching. Live-verified: reconverted report 168
  (`DMS_TILE_HOST=http://localhost:3001 python3 scripts/npmrds-reports/convert_old_reports.py --report-id 168
  --replace`, new page `2191242`), probed clean (0 console/page errors, 1 benign 204 on
  `/track/visit`), screenshot confirms a real step-legend with color swatches + numeric ranges
  ("Speed (2017 network)" / per-route entries, e.g. `18.47 - 20.33`, `36.66 - 43.2`). Minor
  follow-up NOT fixed: the legend shows the SAME step-ramp three times (once for the shared
  template layer, once per materialized per-comp layer, all sharing the one pooled-quantile
  break set) — visually redundant but not wrong; a dedup/collapse pass is cosmetic polish, not
  a correctness bug. Report 1071's page (`2191192`) still carries the pre-fix template and was
  NOT reconverted (lazy-reconvert policy — it'll pick up the fix whenever next reconverted for
  a real reason). `ensure_route_map_none_template`'s per-route line layers are unaffected by
  this bug (they render via the `type undefined → 'simple'` fallback, which already shows a
  color swatch + name per route on the title row — that IS a legend, just categorical not a
  scale, so "just a list of layers" for `route_map_none` maps is closer to a UX opinion than a
  bug; see the next item).
- **~~Map sections have no hover interactivity on converted Route Map choropleths~~ — FIXED round
  84 (2026-08-31)**: was gated by `layer['hover']`/`layer['hover-columns']` (an existing, proven
  DMS map capability, normally set via the Map Editor's Popover tab), which none of the 3 places
  that build a Route Map layer (`route_map.py`, `report_build.mjs` — delegates to the Python
  converter, `composeMapConfig.js`) ever populated. All 3 now set it (round 84's own section has
  full detail); live-verified on both the Python-converter path (speed) and the live "Add
  Graph"/QuickControls JS path (travel time). Explicitly still OUT of scope: letting a Report
  Author edit the tooltip via quick controls or similar — real future work, not built this round.
- **Travel Time's (and likely hoursOfDelay/avgHoursOfDelay/CO2's) Route Map color scale is static
  and polarity-backwards (user-reported 2026-08-31, round 84 — explicitly NOT fixed this round,
  "dont do this now")**: verifying round 84's hover fix on a Travel Time choropleth, the user flagged
  the color scale itself as bad in two ways: (1) low/fast travel time renders **red** and high/slow
  travel time renders **pale yellow** — backwards from the intuitive "green=good, red=bad"
  convention `speed`'s round-82-fixed ramp already gets right (round 82 deliberately scoped that fix
  to speed only, per the user's own "not for ALL maps" direction at the time); (2) beyond just wrong
  colors, the user's view is that Travel Time specifically needs a DYNAMIC/data-driven scale, not
  just better static breaks — a materially different ask than round 82's "ship the existing
  placeholder numbers, real-distribution analysis is a tracked follow-up" framing for the other
  measures. `hoursOfDelay`/`avgHoursOfDelay`/the CO2 measures share the exact same placeholder color
  array (`colorBreaks.json`) and the same "higher=worse" polarity as travelTime, so they likely have
  the identical backwards-polarity bug — unconfirmed, not user-observed, flagged as a probable but
  unverified extension. Not scoped or built — parked exactly where the user left it.
- **Route Map's per-route category legend may be more noise than signal (user opinion,
  2026-07-15, logged only)**: for `route_map_none`-style maps (plain colored lines, no
  choropleth), the current legend lists every route by name+color — technically correct
  (categorical legend) but the user doesn't think it's needed. Distinct from the choropleth
  legend bug above (which was a real rendering defect); this one is a design/utility judgment
  call, not fixed, not scoped.

## NPMRDS data-source bank

**Moved to `src/dms/documentation/npmrds-data-sources.md` (2026-07-08)** — a living reference doc
(kept current independent of this task's lifecycle, per the user's request) covering: registered
DAMA sources joinable via `avl_graph_template`'s `join.sources` (583/1946/`aadt_distributions`),
the full bank of other active old-DAMA NPMRDS sources (582/1722/2001/1410 + the newly-discovered
ClickHouse tables `tmc_avg_speedlimit`/`avg_monthly_tt`/`mpo_boundaries`/`npmrds`), the
cross-database-vs-cross-engine join constraint, and the live DAMA schema reference. Update that
file (not this section) as more sources get investigated.

## Open questions (user)

- **Round B — report folders → tags. BUILT + live-verified 2026-08-31 — see Round 82's "Round B"
  section above for the verification record and full files-changed list.** Scoping history kept
  below for the reasoning trail (the plan didn't change once finalized). Original write-up below
  had one wrong premise (page-level field); corrected + all open design questions resolved by the
  user in one round. Final plan:
  - **Storage — dataset row, not a page field (user correction).** Reports are double-represented
    in DMS: a `page` row (content) AND a `reports_snap_2` catalog row (`reports_snap_2|2177440:data`,
    one per converted report, same split-table shape as `routes_data|2107427:data`) — confirmed by
    reading `config.py`'s `REPORTS_SNAP_TYPE`/`REPORTS_SNAP_TABLE`. My original plan proposed a new
    page-level `tags` field; the user corrected this — reports already have their own dataset row,
    exactly like routes, so `tags` belongs there, not on the page (avoids any DMS-core/page-schema
    change entirely, not just avoids a *formal* one). Confirmed the mechanism is even simpler than
    routes' own precedent suggested: the routes_data VIEW row (2107427) carries no column schema at
    all (`data:"schema-free"`) — the real "column" only exists as a `config.attributes` entry
    (`type:"multiselect"`) on the SOURCE row (2107426), which is what the UDA engine actually reads
    to know the column's type for filtering. Round B mirrors this exactly: add the identical
    `{name:"tags", type:"multiselect"}` attribute to the `reports_snap_2` SOURCE row (id `2177438`),
    then `convert_report.py`/`convert_template.py` write `data.tags = json.dumps([...])` on each
    `reports_snap_2` row at conversion time — same `js()`-style JSON-string convention every other
    field on that schema-free row already uses.
  - **Vocabulary — ONE shared list with routes, not a separate one (user decision).** Reports' 8
    real agency folders (NYSDOT 186, AVAIL 75, MHV 42, NYSDOT CONSULTANT 15, OCTC 12, CDTC 8,
    NPMRDS New Users 5, GBNRTC 4) only partially overlap routes' existing 18-value `AGENCY_CODES`
    (`RouteTagBrowserModal/tagCategories.js`) — NYSDOT/CDTC/GBNRTC/OCTC already present, but
    AVAIL/MHV/`NYSDOT CONSULTANT`/`NPMRDS New Users` are NOT. Per the user's call ("can't think of
    a reason why we'd want distinct lists"), `AGENCY_CODES` gets those 4 new entries added
    (→ 22 values total) and BOTH routes and reports read the same list — no report-specific
    vocabulary file.
  - **Nesting — stays flat now, but the flat design is ALREADY nesting-forward-compatible by
    construction, so no schema hedge is needed (user decision + a design insight worth recording).**
    Checked against real data (see original finding, kept below): only 4/870 reports sit in any
    nested folder, all noise — not worth building hierarchy FOR NOW. But the user wants it easy to
    add nesting later, and floated the mechanism themselves: nesting-via-co-occurring-tags (a
    report tagged BOTH `agency:NYSDOT` and a future `batch:batch_1` tag displays to the user as
    "NYSDOT → batch_1"), not a single baked hierarchical string like `NYSDOT/batch_1`. This means
    the flat `multiselect` array chosen for Round B **already fully supports this** with zero
    future storage/schema change — a report can always carry >1 tag today, and "nesting" later is
    purely a BROWSE-UI enhancement (group visually by a second tag dimension when both are
    present), not a data-model migration. Worth stating plainly: flat-now was never a trade-off
    against easy-nesting-later — they're the same design.
  - **Editor UI**: a chip-input control (mirrors `SaveRouteModal.jsx`'s `TagsInputField` exactly)
    added to `ReportRouteList.jsx`'s already-existing "Report settings" disclosure panel (currently
    holds only the "Dynamic Report" toggle). This is architecturally consistent with the storage
    decision above, not just convenient placement: RRL already reads/writes the SAME
    `reports_snap_2` row (its `routes` array) on every route edit, so adding a sibling `tags` field
    to that same save payload needs no new read/write path — just a new field in an existing one.
  - **Discovery — a real tag-browser IS in scope, not deferred (user decision, reversing my
    original hedge).** `ReportPickerModal.jsx` ("Choose a report") already exists, already reads
    from the `reports_snap_2` catalog, and already shares `PickerSearchInput`/`PickerFacetChips`/
    `PickerCountBar` chrome + `rankByScore` scoring with `RouteTagBrowserModal` — confirmed by
    reading both files directly. What it doesn't have yet is the category→value drill-down state
    machine (`view: root/category/value/other`) `RouteTagBrowserModal` uses. Mirrors that pattern
    directly: a `TAG_CATEGORIES`-equivalent (using the now-shared agency list above), a
    `useReportTagBrowser` hook mirroring `useTagBrowser` (same `array_contains` UDA filter
    mechanism already proven for routes), and the same category/value/list view states. Given how
    much chrome is already shared, this really is the moderate lift the user expects, not a
    from-scratch build — confirms their own read. This does functionally overlap with the
    2026-07-27 "no report discovery page" ruling, but the user's direction here — "we will want
    discovery via tag browser, eventually" — reads as a deliberate, informed choice to build this
    specific piece (a picker MODAL searching what a user is already authorized for, same shape as
    the existing "Choose a report" modal) rather than a standalone browse/index PAGE, which is the
    thing that ruling was actually about. Treating this as in-scope for Round B, not re-blocked by
    that older ruling — flag if that reading is wrong.
  - **Original finding, unchanged**: real folder nesting exists in `admin2.folders`/
    `stuff_in_folders` generally, but only 4/870 reports sit in ANY nested folder (all in personal
    test folders — `AVAIL → BatchReportsTest` and `NYSDOT`'s 3 subfolders have ZERO reports
    directly; nested `user` folders have reports in only 2 of many, "two deep"/"Test 123", 2 each).
  - **Not yet built** — this is the finalized plan, ready for a go-ahead.
- Where should converted pages live (flat vs under a parent "Converted Reports" page; replicate old
  `admin2.folders` hierarchy as page hierarchy?)
- Auth token for CLI deletes/updates (needed for idempotent re-runs / rollback) — user offered
  creds; mint token via `POST /auth/login`.
- Confirm slug scheme `report_<old_id>` and that converted pages start unpublished (draft).
- ~~Which theme does `npmrds_sub` actually run~~ **RESOLVED (round 6, user)**: `transportnyv2` —
  found via the pattern row's `data.theme.selectedTheme` (`dms raw get 2100394`), not discoverable
  through `dms site tree` (stale auth token). See `graph_layout` width note above.

## Artifacts (scratchpad/npmrds-sub/old-reports/)

**Round 81 side-by-side validation set (2026-08-31)** — old-tool URL is `https://npmrds.transportny.org/report/view/<old_id>` (user-corrected 2026-08-31 twice: (1) the live/prod old tool is on the `transportny.org` domain, not `devtny.org` — the earlier `npmrds.devtny.org` form used elsewhere in this file's history is a dev/staging host, not the one to hand a user for validation; (2) use the read-only `/report/view/<id>` route, not `/report/edit/<id>` — confirmed as a real, separate route by reading transportNY's own source, `pages/analysis/reports/view/index.js` sibling to `reports/edit/index.js`, both linked from `pages/Folders/components/Stuff.jsx`), new-tool URL is `http://npmrds.localhost:5173/converted_reports/<slug>` (dev) — both require sign-in (`mint_token.sh` creds for the new side; the new page also needs the RRL sidebar to publish routes to its graphs to render, same as any converted page):
(page ids below are post-fix, current as of the round-81 `draft_sections` bug fix — the original conversion ids, 2215783/2215799/2215817, were superseded by `--replace` reconversions and no longer exist):
- 1066 "787 NB 5-12-2026" (old-tool updated 2026-05-12) ↔ page `2215853`, `converted_reports/787_nb_5_12_2026`
- 1064 "NYC Test" (updated 2025-11-07) ↔ page `2215867`, `converted_reports/nyc_test`
- 971 "NITTEC 150" (updated 2023-01-04) ↔ page `2215835`, `converted_reports/nittec_150`

`report_1070.json`, `report_1070_routes.json` (old side); `new_page_2187523.json`,
`new_page_2187523_sections.json`, `new_report_row_page2187523.json`,
`avl_graph_templates.json`, `page_template_2187021_current.json` (new side).
`report_1071.json`, `report_751.json`, `report_1061.json` (old-side dumps for those reports).
`gaps/report_1070.json`, `gaps/report_1071.json`, `gaps/report_1061.json`, `gaps/report_751.json`,
`gaps/report_1045.json`, `gaps/report_874.json` (per-report gap reports, regenerated on every
conversion run — `report_1071.json`'s `new_page_id`/`dry_run` fields were manually restored after a
dry-run overwrote them, see round-3 notes if this looks odd).

**Current live page ids as of round 35 (2026-07-13)** — the 15 speed/TT-bearing reports were all
superseded by the round-35 backport reconversion: 1045→`2189915`, 1061→`2189943`, 1070→`2189957`,
1071→`2189965`, 142→`2189993`, 16→`2190009`, 228→`2190017`, 229→`2190031`, 520→`2190043`,
630→`2190053`, 740→`2190079`, 914→`2190097`, 960→`2190125`, 987→`2190137`, 994→`2190169`.
471 deleted in round 35 (`no_valid_routes`); 1032/392 deleted in round 33. Reports not carrying
speed/TT templates keep their earlier pages (e.g. 751→`2188894`, 874→`2188794`, both round 9).
Round 36 additions: 787→`2190210`, 320→`2190225`, and 1061 reconverted `2189943`→`2190527`
(gap reports regenerated under `gaps/report_787.json`/`gaps/report_320.json`/
`gaps/report_1061.json`).
Round 37 (census cross-reference, 2026-07-13): 23 numeric `report_<id>` pages live in total —
the earlier-round pages also include 11→`2189401`, 54→`2189409`, 315→`2189417`, 796→`2189435`.
874's page `2188794` is a permanently-empty shell (route 5445 missing everywhere since before
its round-9 conversion) — **deletion pending, user to run** (see the archive's Round 37).
Round 38 (Phase B, 2026-07-14): 745→`2190543` (B1; carried one leftover BROKEN test section,
draft `2190567`/published `2190568`, since deleted — see round 40 below), 58→`2190556` (B3, since
deleted — see round 40), 191→`2190569` (B2 — converted with `graph_max_year` forced to 2023, a
deliberate mechanism proof, since replaced — see round 40). New templates:
`route_info_box_traveltime` (`2190555`), `tmc_freeflow_summary_bar_graph_2023` (`2190566`).

**Round 39 (2026-07-14)**: shell page 874→`2188794` deleted (`no_valid_routes`, deletion pending
since round 37, executed this round).

**Round 40 (2026-07-14)**: closed both remaining cleanup items. Report 745's page (`2190543`)
kept, its broken test section removed (component rows `2190567`/`2190568` deleted). Report 191
reconverted for real: old mechanism-proof page `2190569` deleted, new page `2190581` created
(2/3 mapped — the pm3-coverage-limited measure correctly gap-logs against its real 2016/2017
dates). 4 pre-2017-only pages deleted outright (no replacement — the converter now refuses to
page them): 16→`2190009` gone, 54→`2189409` gone, 58→`2190556` gone, 142→`2189993` gone.
`converted_pages_total`: 21.

Round 40 Part 2 (Info Box `length`/`travelTime`/`aadt`/`hoursOfDelay` + the gid-collision fix) —
5 live-verification test conversions, each reconverted a second time with `--replace` after both
bugs were fixed to reach a clean final state: 181→`2190688` (`travelTime` both grains), 965→
`2190700` (`length`+`travelTime` tmc grain), 33→`2190736` (`aadt` tmc grain; also the page that
caught the gid-collision bug — its 4 Info Box graphs now correctly show 3 distinct sections
instead of 4 identical ones), 179→`2190755` (`hoursOfDelay` route grain), 775→`2190767`
(`hoursOfDelay` tmc grain). New templates: `tmc_info_box_traveltime` (`2190591`),
`tmc_info_box_length` (`2190604`), `tmc_info_box_aadt` (`2190645`), `route_info_box_delay`
(`2190664`), `tmc_info_box_delay` (`2190677`).

Round 59 (TMC meta join swap, 2026-07-17) — reconverted (`--replace`) as the round's live
verification, all superseding earlier-round page ids for the same reports: 775 → `2194062`
(hoursOfDelay tmc/route grain + Route Map hoursOfDelay, exact-value ground-truthed), 787 →
`2194074` (Bar Graph Summary avgHoursOfDelay/hoursOfDelay), 751 → `2194094` (CO2 passenger/truck),
179 → `2194116` (entirely 2017-dated — the known meta-gap path, delay correctly renders `null`),
1033 → `2194141` (Route Map avgHoursOfDelay/hoursOfDelay choropleth). All 0 console/page errors.

Round 52 (Route Difference Graph / TMC Difference Grid, 2026-07-16) — live-verified pages:
584 "I-190 NB COVID Comparison" → `2193032` (4/4 graphs; diverging speed diff bar with
invert + speed diff grid + route_map_speed_2020), 354 "Bridge Hit I-90 WB at RT 33 Buffalo"
→ `2193798` (reconverted with `--replace` after increment B; 6/6 incl. travelTime diff),
1037 "Inc 3/1/2023 NY33 EB @ Dodge St" → `2193818` (avg-delay diff grid; its
avgCo2Emissions×all graph is a deliberate deferred gap), 1039 "Inc 8/28/2021 HRP @
Westchester Ave" → `2193832`. 18 diff templates minted from TEMPLATE_SPECS
(`route_diff_*` / `tmc_diff_grid_*` — ids change on drift-reconversion, `dms raw list` for
current). Ground-truth harness pattern: extract the page's own captured difference query
from `probe_<slug>.json`, replay via `dbq.graph`, hand-build the two arm queries in raw CH
and subtract — all sampled values bit-exact (584 bar epochs 100/150/282 + 3 grid cells;
354 travelTime epochs 72/73/150).

Round 49 (Route Map M2, speed choropleth, 2026-07-15) — test conversions, several superseded
by reconversion mid-round while fixing the join-shape crash and the maplibre strictly-
ascending-breaks bug, final live-verified pages: 1071→`2191192` (single-TMC degenerate-breaks
case, converted with `DMS_TILE_HOST=http://localhost:3001` for local verification — NOT the
production `TILE_HOST` default), 168→`2191222` (5-TMC real-variance case, same local-host
override). Both superseded several earlier same-report page ids from mid-round debugging
(2191035/2191065/2191132/2191142 among others) — those are stale, ignore them if seen in
scratchpad JSON dumps from this round. New template: `route_map_speed_2026` (id created fresh
each reconversion since drift-checking picks up code changes — check `dms raw get` for the
current id rather than trusting a hardcoded one here). Report 7 (`Tapanzee Analysis Month By
Month`) exercised the graceful pre-2017-data-gap path (`route_map_speed_no_values` gap-kind,
no crash, template placeholder renders) — not reconverted with the local tile-host override
since its point was the gap-log path, not visual verification.

Other files this task has produced, outside that scratchpad folder:
- `scripts/npmrds-reports/convert_old_reports.py` — the converter itself.
- `scripts/npmrds-reports/register_aadt_distributions.sql` — one-time DAMA source/view registration for
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
- `scratchpad/npmrds-sub/cleanup_round40.py` — round-40 one-off cleanup script (report 745's
  broken test section, report 191's `--replace` reconversion, the 4 pre-2017-only page deletes);
  user-run via `!` since it needs `DMS_AUTH_TOKEN`. Kept for reference, not meant to be re-run.
- **Note (round 49): `scratchpad/npmrds-sub/dms-server.log` is no longer being piped** (user
  restarted dms-server after a round-49 crash without re-establishing the `tee`) — it now only
  holds pre-round-49 history. `preflight.py`'s log-error check will keep reporting the stale
  crash trace until the pipe is re-established; that's expected, not a live issue. Ask the user
  to re-run their `tee` setup if live log access is needed again.
- Round 49 (Route Map M2, speed choropleth) new/changed files:
  - `scripts/npmrds-reports/convert_old_reports.py` — `SPEED_VALUE_EXPR`, `CH_FACT_TABLE`/
    `CH_TMC_IDENT_TABLE`, `DEFAULT_SPEED_COLOR_RANGE`, `choropleth_paint()` (Python port of the
    dms Map section's `choroplethPaint()`), `quantile_breaks()`, `build_ch_join_wire()` (the
    AVL-Graph-authoring-shape → server-wire-shape join transform), `ensure_route_map_speed_
    template()`, `bake_route_map_speed_paint()`; `TILE_HOST` now reads `DMS_TILE_HOST` env
    override; `build_graph_section_data()` gained a `route_map_value_ctx` param and Map-vs-
    AVL-Graph coloring branch; Route Map pre-pass in `convert_report()` extended for measure
    `"speed"`; `import dbq` added (sibling-module CH query runner).
  - `scripts/npmrds-reports/census_old_reports.py` — `route_map_none`/`route_map_speed` mirror generalized to
    a single measure-keyed branch; removed a genuinely pre-existing, unrelated dead-code
    `NameError` (`BAR_SUMMARY_PM3_BUCKET`, never defined anywhere, silently dropping 274/869
    reports from every census run since some round after 47 — found only because a full fresh
    census was needed to validate this round's own corpus impact).
  - `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/
    map/SymbologyViewLayer.jsx`, `.../map/index.jsx`,
    `src/dms/packages/dms/src/patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx`,
    `.../MapEditor/index.jsx` — the two platform fixes (nested-join forwarding, live-repaint
    paint write-back); library task `map-join-nested-join-forward-and-live-repaint.md`.
  - `scratchpad/npmrds-sub/old-reports/verify_map_tile_network_capture.mjs` — reusable
    Playwright network-capture probe for a converted Map's tile/join traffic (the
    listeners-before-reload technique — see the durable-facts note above).
