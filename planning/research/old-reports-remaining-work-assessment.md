# Old-reports conversion — remaining-work assessment (2026-07-15, post-round-51)

> **Status**: decision-informing snapshot, written at the user's request after the Route Map
> arc closed (rounds 41–51). The live task file
> ([../tasks/current/old-reports-conversion.md](../tasks/current/old-reports-conversion.md))
> stays the source of truth for implementation state; this doc captures the strategic
> decomposition of what remains and the recommended ordering. It will go stale as rounds
> land — check the task file's round ledger for anything newer than R51.

## Where the task stands

51 rounds in, the converter (`scripts/convert_old_reports.py`), the corpus census
(`scripts/census_old_reports.py`), and the template catalog are mature, and the Route Map
program (rounds 41–51, ~11 rounds) is fully closed through M3: none/speed/travelTime/
avgHoursOfDelay/hoursOfDelay choropleths built and live-verified, plus the R50/R51 hardening
tail (tile-host auto-detect, legend dedup, same-route exclusivity, the `build_ch_join_wire`
tile-join fix).

Headline numbers (round-49-lineage census, rerun clean 2026-07-15, 869/869 analyzed, 0 errors):

| metric | value |
|---|---|
| graph instances mapped | **4,995 / 7,103 (70.3%)** |
| reports fully mapped (raw) | 217 |
| full **and** page-producible | **188** |
| partial / none / no_graphs | 602 / 36 / 14 |
| converted pages live | 32 |
| unmapped instances remaining | 2,108 (buildable 1,057 / no_equivalent 904 / tail 147) |

Of the ~12 high-volume old graph types, 9 have real template coverage: Route Bar Graph,
Route Line Graph, TMC Grid Graph, Bar Graph Summary, Route Info Box, TMC Info Box, Route
Compare, Hours of Delay Graph, Route Map. Not built: **Route Difference Graph, TMC
Difference Grid** (both in-scope since the round-24 reversal), and the tail types.

## The key correction: the census's #1 lever is mostly data-gated

The census greedy table ranks Route Info Box × speed × 5-min (268 instances, 57 flips) and
TMC Info Box × speed × 5-min (166, 15 flips) as the top two levers (+81 cumulative flips).
**Template work cannot deliver most of that.** Decomposed 2026-07-15 by re-running the
converter's own year/bin gating over all 514 unmapped Info Box × speed instances (every
resolution/dataColumn — script:
`scratchpad/npmrds-sub/old-reports/infobox_speed_breakdown.py`, read-only):

| blocking reason | instances | share | nature |
|---|---|---|---|
| year-gated on pm3, **2017–2020** | 293 | 57% | data — exactly the 1410 backfill window already decided on (backfill 2017–2020; see task-file durable facts). Out of scope by the standing "no data work" directive. |
| `bin_undetermined` (peak flags don't land on exactly one of 1410's amp/midd/pmp/we bins) | 140 | 27% | mapping-policy decision, addressable by converter work |
| pre-2017 | 80 | 16% | permanently excluded (standing directive) |
| other (a 2026 report) | 1 | — | — |

The flip-candidate subset (reports where Info Box speed keys are the *only* unmapped keys)
splits the same way: 79 / 35 / 27 / 1. Practical consequence: **whenever the 1410 backfill
eventually happens, ~80–100 reports flip to fully-producible automatically, zero converter
work** — and until then, buckets #1/#2 should be read as parked, not pending.

## The four piles of remaining work

The 2,108 unmapped instances are not one pile:

1. **Unbuilt shapes** (~343 instances, ~33 flips) — Route Difference Graph (200 instances,
   ~30 flips; the speed×5-min bucket alone is 106/84/**29 flips — the top genuinely-buildable
   flip lever in the corpus** after the Info Box correction above) and TMC Difference Grid
   (143 instances, 3+ flips), its mechanical sibling. The cross-arm primitive they need
   (`__ANCHOR__`, round 25) exists; the open design question is whether it supports
   per-x-bucket / per-TMC anchor *alignment* or only the scalar-anchor-row case Route Compare
   uses. If not, that's a "grow a dimension" platform enrichment, exactly what the strategic
   frame favors.
2. **Ambiguity-policy gaps** (~530+ instances, few flips) — mixed-resolution graphs
   (`resolution: None` in the census = the graph's assigned comps genuinely disagree; the
   missing-setting → 5-minutes default already exists, `analyze_graph` ~line 3384): ~392
   buildable instances refused today, plus the 140 bin-ambiguous Info Boxes. Cheapest
   instance-breadth per unit of work anywhere in the census: pin the old tool's actual
   precedence rule by reading `GeneralGraphComp` (graph `state.resolution` → ? → default),
   get user sign-off on the policy, then it's converter logic over EXISTING templates — no
   new vocabulary. Low on flips because these reports usually have other gaps too.
3. **pm3-within-coverage measures** — Route Bar Graph planningTime day (138 instances,
   0 flips), travelTimeIndex variants, Route Map M4 (travelTimeIndex-byDateRange day alone
   has 7 flips). Buildable via the existing pm3 join mechanism but data-coverage-shadowed
   for much of the (older) corpus — same 1410 window caveat as pile-zero above.
4. **Tail types** (147 instances) — Traffic Volume/vmt (51; vmt is plausibly computable as
   aadt × miles via existing joins), Transcom Events Chart (30) and its stacked/pie siblings
   (likely need an events source that may not exist new-side at all — vet before scoping),
   Monthly Hours Graph (22), Experiential Travel Time (16), then singletons.

## Non-coverage debt (bugs/UX, all logged in the task file)

- **Choropleth legend/paint off-by-one** (R51, held back by user scope pick): root cause
  already pinned — `choroplethPaint()`'s legend-row builder pairs each range with the color
  one step behind the paint, in both the live JS `map/utils.js` and the Python port. Smallest
  real correctness fix on the books.
- Map hover tooltips (real new feature, nothing to extend — logged R50/R51).
- Axis labels not visible anywhere (logged 07-13, uninvestigated).
- Route Compare anchor-row ordering recurrence (logged 07-13; suspect `graphData.slice(0,1)`).
- Width-squeeze legend/flex platform fix (PARKED, mechanism pinned round 34).
- Un-cloned Map `series-template` layer never excluded from rendering (harmless — its
  unfiltered join is scan-hazard-refused; logged R51).
- Per-route bar colors, categorical Route Map legend utility (cosmetic, deprioritized).

## Recommendation (as of 2026-07-15 — awaiting user pick)

> **UPDATE 2026-07-16 (round 52): recommendation #1 EXECUTED.** Route Difference Graph +
> TMC Difference Grid scoped, endorsed, built, live-verified in one day — the `__ANCHOR__`
> alignment question resolved as a new comparisonSeries "difference" combine mode (pile 1
> is now ~absorbed: `full_producible` 188→231, only 44 deferred instances remain). Pile
> numbers and the pile-1 description below are STALE; the task file's R52 entries are
> current. Item #2 (legend/paint off-by-one) still open.

1. **Scope Route Difference Graph next** (read-and-scope round per the show-plan-first rule:
   read old `RouteDifferenceGraph.jsx` for real, size the `__ANCHOR__` alignment question,
   scope TMC Difference Grid alongside since they almost certainly share the design). It's
   the biggest lever template work can actually move, the last major unbuilt graph type, and
   true vocabulary breadth — a whole graph-type dimension. Demo-report picks should honor
   data coverage (pick inside the new source's real window, not the most literal old match).
2. **Warm-up/companion**: the legend off-by-one fix (root cause pinned, one sitting, ship
   isolated per the shared-code rule).
3. **Alternative if banking cheap breadth is preferred**: the mixed-resolution precedence
   policy (~400 instances, converter-only, needs user policy sign-off, barely moves flips).
4. Keep parked: everything 1410-coverage-gated (piles 0 and 3's shadowed portion) until data
   work is in scope; when it is, the backfill is the single highest-leverage data action for
   this task.

## Refreshing this analysis

- Full census: `python3 scripts/census_old_reports.py` (~40s, read-only) →
  `scratchpad/npmrds-sub/old-reports/census/census_summary.md` + `census.json`.
- Info Box × speed decomposition:
  `python3 scratchpad/npmrds-sub/old-reports/infobox_speed_breakdown.py` (read-only; imports
  the converter's own `graph_max_year`/`graph_reliability_bin`, so it stays correct as the
  gating logic evolves).
