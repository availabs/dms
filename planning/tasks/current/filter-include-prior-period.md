# Task: Filter leaf "include prior period" — vs-prior deltas from a single page filter

## Objective

Let a **single-select page filter** on a numeric/ordinal period column (e.g.
`year_record`) drive a card that has both the **selected period** and its
**prior period** in scope — so an author can compute "vs prior period" change
figures (year-over-year deltas) entirely with calc + formula columns, no code.

Today this is impossible: a single-select year control sets `year_record = [Y]`,
which `applyPageFilters` turns into `WHERE year_record IN (Y)`. The prior year's
rows are gone, so neither a calc column nor a `lag()` window has anything to
compare against, and calc SQL is a static string that can't read `Y` to derive
`Y-1`.

## Motivating consumer

The MAP-21 per-year page (`npmrdsv5`/`dev2`, page 2173049) has four KPI cards
(sections 2173878–2173881, bound to `Map 21 Extended` source 2001 / view 3394 in
the `npmrds2` pgEnv) that should show the selected year's value **and** a y/y
change figure, matching the single-year design mockup
(`src/themes/transportny/.../dms_design_system_v2/pages/map-21.html`: the
`↑ +4.2` / `↓ -2.2` / `↑ +10.6%` deltas). A single year filter control must
drive all four.

## Current state (confirmed in code)

- `applyPageFilters` (`…/dataWrapper/buildUdaConfig.js:355`) walks the filter
  tree; for any leaf with `usePageFilters: true` whose `searchParamKey`/`col`
  matches a page filter, it **replaces the leaf's `value` array** with the
  page value (`{ ...node, value: normalized }`). No arithmetic, no expansion.
- Calc-column `name` is raw SQL (`<expr> as <alias>`) spliced into the SELECT
  with `fn: 'exempt'`. **No `${param}` / `:param` substitution exists anywhere
  in the builder** — verified by grep. So a calc column cannot read the
  selected year.
- A `lag()` window over a `GROUP BY year_record` is computed *after* HAVING and
  *before* ORDER BY/LIMIT — so it works only if BOTH years' grouped rows are in
  the result set at window time. That requires the prior year in the WHERE.

Net: the only place to make the prior period reachable from a single selection
is the page-filter application step.

## Proposed change

A new boolean option on a filter **leaf**: `includePriorPeriod` (with optional
integer `priorPeriodStep`, default `1`; optionally `priorPeriodCount`, default
`1`, for "current + N prior").

When `applyPageFilters` applies page values to a leaf that has BOTH
`usePageFilters: true` and `includePriorPeriod: true`:

1. Normalize the incoming page value(s) to an array as today.
2. For each **numeric** value `v`, also emit `v - step`, `v - 2*step`, …,
   `v - count*step`.
3. Dedupe, keep the leaf `op` as `filter` (IN). Non-numeric values pass through
   untouched (no expansion).

Result: a single-select `year_record = [2025]` becomes
`WHERE year_record IN (2025, 2024)` — one control, two years in scope, fully
relative (no hardcoded year anywhere).

### Why the leaf, not the control

The expansion lives on the **consuming card's** filter leaf, not on the year
Filter control section. The control still emits a single `?year_record=2025`
to the URL; each KPI card's `year_record` leaf opts into `includePriorPeriod`
and expands locally. Cards that don't opt in (the spreadsheet 2173048, the
filter controls 2173045–47) are unaffected.

### The card recipe this unlocks (author-level, no code)

Per KPI card, once the leaf expands to `IN(Y, Y-1)`:

- `year_record` column: `group: true`, `hideHeader: true` (GROUP BY year),
  `sort: 'desc'`.
- **metric** calc column (per-year aggregate) — the displayed value
  (mirrors the existing card 2173044 expressions).
- **prior** calc column: `lag(<metric aggregate expr>) over (order by
  "year_record")` — `hideHeader` + `hideValue` (fetched, fed to the formula).
- **delta** formula column: `metric − prior` (absolute, LOTTR/TTTR) or
  `percent(metric − prior, prior)` (PHED %-change) — the displayed change
  figure. (`evaluateAST` already supports `-`, `/`, `*`, and a `percent`
  function node; the AddFormulaColumn UI only builds `+ − × ÷` + variables, so
  the `percent`/`round` function nodes are authored in the saved JSON.)
- `display`: `pageSize: 1`, order by `year_record desc` → the one shown row is
  the selected year, carrying its prior via the `lag` window.

Edge case: selecting the earliest year (e.g. 2016) expands to `IN(2016, 2015)`;
2015 has no rows, so only the 2016 grouped row exists, `lag` is null, delta is
null/NaN — correct "no prior data" behavior.

## Status

- **Phase 1 — core expansion: DONE.** `applyPageFilters` in
  `buildUdaConfig.js` now expands `includePriorPeriod` leaves (numeric values
  → `[v, v-step, …]`, deduped, non-numeric pass through). Verified in isolation
  against 7 cases (flag off, string/numeric year, step 2, count 2, non-numeric
  passthrough, dedupe overlap) — all pass.
- **Phase 2 — author UI: DONE.** `ComplexFilters.jsx` leaf menu gained an
  "Include Prior Period" Switch (gated on `usePageFilters`) + a step Input.
- **Phase 1b — expansion must run on the saved leaf, not just page filters:
  FIXED.** First cut put the expansion inside `applyPageFilters`, which only
  fires when a live page-filter value exists for the key. The MAP-21 year
  control writes the year onto the section's *saved* leaf (`value:['2020']`),
  so the expansion never ran → only one year in scope → `lag()` returned null →
  delta == value (confirmed live). Extracted a standalone
  `applyPriorPeriodExpansion(filterTree)` pass that runs unconditionally on the
  resolved tree (right after `applyPageFilters`), so it expands regardless of
  how the value arrived.

- **Phase 3 — card recipe + live test: DONE & VERIFIED LIVE.** Diagnostic
  render confirmed end-to-end on 2173878: year 2020 → value 86.9, `lag()` prior
  78.8, delta 8.1 — so `includePriorPeriod` expansion fires, `lag(<aggregate>)
  over (order by "year_record")` **executes server-side** (first window
  function used in this codebase; passes through the calc-column SELECT
  verbatim, not blocked by the keyword denylist), and the formula computes.
  Delta wrapped in a `round` formula node to kill float noise. All four KPI
  cards reconfigured (2173878 interstate, 2173879 non-interstate — absolute Δ
  r1; 2173880 truck — absolute Δ r2; 2173881 PHED — `percent` Δ r1, metric
  promoted to per-year `sum("phed")`). Each: `year_record` grouped+hidden,
  metric (displayHero), `lag` prior (hidden), formula delta (metaMD),
  `pageSize 1`, order year desc. **Remaining: move task → completed/, update
  completed.md, extract the skill recipe.** **Open risk to validate live:** (a) the UDA/DAMA server query
  layer must accept `lag(<aggregate>) over (order by "year_record")` inside an
  `fn: 'exempt'` calc column alongside GROUP BY; (b) formula-variable keys must
  match the calc columns' stored row keys (`column.name` = full SQL string per
  `getData.js:413`); (c) hidden grouping/prior cells occupy grid slots
  (`card-layout.md`) — tune `cellsGridSize`/`hideValue` so the KPI shows just
  value + delta. The library change also only takes effect after the dev
  server rebuilds.

## Files requiring changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
  — `applyPageFilters`: add the numeric expansion branch for
  `includePriorPeriod` leaves (~10–15 lines). Keep the time-filter branch and
  the non-`usePageFilters` early return intact.
- `src/dms/packages/dms/src/patterns/page/components/sections/ComplexFilters.jsx`
  — leaf ellipsis menu (~line 264, beside the "Use Page Filters" Switch +
  searchParamKey input): add an **"Include prior period"** `Switch` (gated on
  `node.usePageFilters`) and a small numeric `Input` for the step (default 1).
- (Optional) `src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/schema.js`
  — document `includePriorPeriod` / `priorPeriodStep` in the persisted-filter
  shape comment.

## Testing checklist

- [ ] Unit: `applyPageFilters` with `includePriorPeriod` + page value `['2025']`
      → leaf value `['2025','2024']` (or numeric `[2025,2024]`); without the
      flag → `['2025']` (unchanged).
- [ ] Unit: non-numeric value (e.g. a county name) with the flag set → passes
      through unexpanded.
- [ ] Unit: `priorPeriodStep: 2`, value `['2025']` → `['2025','2023']`.
- [ ] Backwards-compat: existing rows with no `includePriorPeriod` produce
      byte-identical WHERE clauses to today.
- [ ] Live: page 2173049 KPI cards — set the year control to 2025, confirm each
      card shows the 2025 value + y/y delta; change to 2023, confirm value +
      delta recompute against 2022; set to 2016, confirm delta is empty.
- [ ] Live: the spreadsheet (2173048) and filter controls (2173045–47), which
      don't opt in, are visually unchanged.

## Skill follow-up

On completion, extend
[`src/dms/skills/using-a-datawrapper-card.md`](../../skills/using-a-datawrapper-card.md)
with the "vs prior period" recipe (filter-leaf `includePriorPeriod` +
GROUP BY/lag/formula card config), and cross-link from
[`card-layout.md`](../../skills/card-layout.md). This is a strong skill
candidate — "show a metric and its change vs the prior period" is a recurring
dashboard need across brands.
