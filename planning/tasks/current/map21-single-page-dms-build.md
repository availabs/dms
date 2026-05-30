# Task: Build the MAP-21 PM3 single-page report as a live DMS page

> **Phased build.** Each section of the mockup is its own phase. Phase 1 creates
> the page + a new **"creating interactive pages"** skill. Every later phase
> implements one section, names its components + datasets, plans the UDA config,
> and **identifies the DMS primitive gaps** (column types / formatFns / component
> features) that must be added or modified to render the mockup faithfully.
>
> **Living-skill mandate (applies to every phase):** as the build progresses,
> accumulate concrete suggestions for **updating existing skills or creating new
> ones** so that "design template → DMS page" becomes as close to **one-shot** as
> possible. Each phase has a *Skill notes* subsection; the final phase rolls these
> up into actual skill edits. Treat the skills as deliverables, not afterthoughts.

## Objective

Instantiate `src/themes/transportny/.../dms_design_system_v2/pages/map-21-system-performance.html`
— the consolidated single-page MAP-21 PM3 report — as **draft sections** in the
live DMS pattern we've been working in, driven by a single interactive page
variable (`year_record`).

- **App / pattern:** `npmrdsv5` + `dev2` site, pattern **`npmrds_sub`**
  (pages are `npmrdsv5+npmrds_sub|page`; sections `npmrds_sub|component`).
- **Host:** `https://dmsserver.availabs.org` (DAMA + DMS on the same host).
- **Reference page:** **2173049** (`by_year_dup`) — already carries the working
  KPI cards (2173878–2173881: `includePriorPeriod` + `lag()` prior + formula Δ +
  FHWA-target join + Meets/Below status) and the Filter sections (2173045
  `ua_name`, 2173046 `mpo_name`, 2173047 `county_name`). Crib section shapes from
  it. **Difference for this page: the only interactive page variable is
  `year_record`** — no county/UA/MPO page filters.
- **Draft-only discipline** (per `creating-pages-from-a-design-pattern.md`):
  this task never publishes. Humans run `dms page publish`.

## Datasets (DAMA, pgEnv `npmrds2`, `baseUrl /datasources`, `isDms:false`)

| Source / view | What | Used by |
|---|---|---|
| **2001 / 3394** — `Map 21 Extended` ("all_years 2016-2025") | per-TMC HPMS Travel Time Metrics rows; `year_record`, `state_code`, `county_name`, `ua_name`, `mpo_name`, `urban_code`, `f_system`, `nhs`, `facility_type`, `segment_length`, `dir_aadt`, `occ_fac`, `lottr_*`, `tttr_*`, `phed` | every data section (base `ds`) |
| **2027 / 3460** — `FHWA Map 21 Targets` (`csv_dataset`) | statewide LOTTR/TTTR `*_applicable_target` (DOUBLE), keyed `year_record` (+ `state_code` TEXT) | §01 KPI cards, §02 trend reference lines, §04 regional |
| **2028 / upload 6822** — UZA targets | PHED + Non-SOV per-UZA targets, keyed `year_record` + `urban_code` | §05 urban congestion |

**Reference of record:** `references/hpms/measure_targets/README.md` (target columns,
back/forward-filled `applicable_target`, join recipe) and `MAP21_REPORTING_PLAN.md`
(the section-by-section page spec this task implements).

## Already-shipped client enrichments (do not re-do; they're in `src/`)

- **`includePriorPeriod`** filter-leaf option + standalone `applyPriorPeriodExpansion`
  pass in `buildUdaConfig.js` (year `IN(Y, Y-1)` from one control) + the
  "Include Prior Period" Switch in `ComplexFilters.jsx`. *(See its own task:
  `filter-include-prior-period.md`.)*
- **`handleOrderBy`** DAMA-alias preservation in `dms-server/.../uda/utils.js`
  (so `ORDER BY ds.year_record` survives under a join).
- The KPI-card recipe (GROUP BY year + `lag()` + formula Δ + target join + status
  CASE) — proven live on 2173049.

---

## How interactivity works on this page (the model Phase 1 documents)

DMS "page variables" are **URL search params** held in `PageContext`. The flow:

1. A **Filter section** (`element-type: 'Filter'`, the `FilterComponent`) renders a
   control bound to a `searchParamKey` (e.g. `year_record`). Changing it writes the
   value into the page's search params (`usePageFilterSync.js`).
2. Every **data section** (Card / Spreadsheet / Graph — all `dataWrapper`-backed)
   that should react has a filter leaf with `usePageFilters: true` +
   `searchParamKey: 'year_record'`. At query time `applyPageFilters` (in
   `buildUdaConfig.js`) swaps the leaf's value with the page-variable value; then
   `applyPriorPeriodExpansion` optionally expands it to `IN(Y, Y-1)`.
3. Sections that should **ignore** the variable simply omit the `year_record` leaf
   (the trends in §02 do this — they GROUP BY year and show all years).

So **one Year selector drives §01, §04, §05, §06; §02 is intentionally inert.**
This is the single mechanism the new skill must teach, using 2173049 as the live
worked example.

---

## Phase 1 — Page creation + "creating interactive pages" skill — ✅ DONE

**Shipped:** page **2173915** (`map_21_system_performance`, `npmrdsv5+npmrds_sub`,
draft) with 3 bands (`Page header` / `Report` / `Footer`). Sections: a page-header
`lexical` (2173916) and the **Year selector `Filter`** (2173917, `year_record` →
`searchParamKey: 'year_record'`). New skill **`creating-interactive-pages.md`**
written + indexed in `skills/README.md` (page-variable model, `includePriorPeriod`,
ignore-the-variable, gotchas; worked refs 2173049 + 2173915).

**Fix (page-variable registry was missing — the interactivity "part 0"):** the
page itself must declare each variable in its top-level `data.filters` array
(`{searchKey, values, useSearchParams:true}`) — this whitelist seeds
`pageState.filters` via `mergeFilters` in `view.jsx`. Page 2173915 had
`filters: undefined`, so even though the Year selector (2173917) and the §01 cards
(2173919–21) all had correct `usePageFilters:true` + `searchParamKey:'year_record'`
leaves, nothing reacted: `updatePageStateFilters` drops unregistered keys from the
URL, `updatePageStateFiltersOnSearchParamChange` ignores unregistered URL params,
and `usePageFilterSync` bails when `pageState.filters` is empty. Registered
`year_record` (default `2025`) on 2173915; verified all four section leaves were
already correct. The `creating-interactive-pages.md` skill now leads with this as
**Step 0** + a "why nothing happens" box + the section-tree-vs-column-filter
duality gotcha (the column-attached `columns[].filters` are empty on these cards;
the live leaf is in `element-data.filters.groups`, which is what the query builder
reads).

**Primitive enrichment shipped — author-selectable whole-filter "Filter style":**
The Year selector's appearance is now driven by a **named-styles `filters` theme
block** (in `themes/transportny/themev2.js`: `panel` / `chip` / `labeled` /
`tone_bar`), not by ad-hoc per-control styling. Each style bundles the wrapper,
label, condition-row, `placement`, **and** the multiselect `controlStyle` it passes
down to its value control. A site author picks the whole design from the Filter
section toolbar via the new **"Filter style"** select (key `display.filterStyle`,
options sourced from `theme.filters.styles`). Wiring:
- `FilterComponent.config.js` — "Filter style" select (was a per-control "Control
  style"); options from `theme.filters.styles`. Added a separate "Placement
  (override)" select (`display.placement` wins over the style's `placement`).
- `ExternalFilters.jsx` (the viewer-visible control) + `RenderFilters.jsx`
  (edit/legacy + internal) — both resolve the design with
  `getComponentTheme(theme,'filters', display.filterStyle)` and thread
  `theme.filters.controlStyle` down to the value control.
- `ConditionValueInput.jsx` / `RenderFilterValueSelector.jsx` — accept + forward
  `activeStyle` to the `multiselect` `EditComp`; `controlStyleProp ??
  display.filterControlStyle` keeps the legacy per-control key as a fallback.
- Live: section **2173917** set to `filterStyle: 'chip'`, `hideExternalToggle: true`,
  `placement: 'inline'`; legacy `filterControlStyle` removed. No className
  passthroughs added (per `themes/CLAUDE.md` author-empowerment rule).

**Deferred (primitive gap):** the sticky "on this page" TOC chrome — no first-class
DMS support for in-page anchored section nav yet; left out of the live page pending
the Phase-1 decision (theme/layout feature vs section). Logged in the ledger.

**Original plan ↓**

**Goal:** create the draft page, lay down the page-variable scaffold (Year
selector + page chrome), and write the new skill.

- **Create the page:** `dms page create` → `npmrdsv5+npmrds_sub|page`, slug e.g.
  `map_21_system_performance`, title "MAP-21 PM3 · System performance". Set
  `draft_section_groups` for the bands (header / content / footer LayoutGroups per
  the mockup). Draft-only.
- **Year selector:** a `Filter` section bound to `year_record`
  (`usePageFilters: true`, `searchParamKey: 'year_record'`, single-select,
  `includePriorPeriod: true` so downstream Δs work). This is the page's one
  interactive variable. Crib the Filter shape from 2173045/46/47 on 2173049
  (swap the column to `year_record`).
- **Page chrome:** breadcrumb + the sticky "on this page" TOC. The TOC in the
  mockup is a `sticky top-4 self-start` aside inside the `max-w-[1480px]` content
  grid (getting-started pattern). **Primitive gap (flag, decide):** the page
  pattern's `sectionArray`/LayoutGroup has no first-class "sticky TOC rail" — is
  this a theme/layout feature, a new chrome section type, or a lexical section
  with anchor links? Decide here; it affects how every later section's anchor id
  is set.
- **NEW SKILL — `creating-interactive-pages.md`:** document the interactivity
  model above end-to-end:
  - what a page variable *is* (URL search param via `PageContext`), where it's set
    (`Filter` section → `searchParamKey`) and read (`usePageFilters` leaves →
    `applyPageFilters`);
  - the `includePriorPeriod` enrichment and the GROUP BY + `lag()` + formula Δ
    pattern for "vs prior period";
  - how to make a section **ignore** the variable (omit the leaf);
  - a worked example using **2173049** (year + the KPI cards) and a "here's how the
    same wiring drives a whole page" walkthrough toward this page;
  - cross-link `using-a-datawrapper-card.md`, `card-layout.md`,
    `creating-pages-from-a-design-pattern.md`, and add it to `skills/README.md`.
- **Components:** `Filter`, `lexical` (chrome/TOC), page row.
- **UDA config:** none for the Filter beyond the `year_record` source binding
  (source 2001/view 3394). Confirm the Filter's distinct-values query returns the
  year list.
- **Skill notes:** capture anything that made page+variable setup non-obvious.

## Phase 2 — §01 Compliance snapshot (statewide KPI cards) — ✅ DONE

**Shipped (on page 2173915, `Report` band):** §01 header `lexical` (2173918);
3 KPI cards **cloned from 2173878/79/80** — Interstate (2173919), Non-Interstate
(2173920), Truck (2173921) — each retaining the target join (view 3460 on
`ds.year_record`) + `includePriorPeriod` year leaf (`usePageFilters`, default
`['2025','2024']`) + `lag()` prior + formula Δ + status CASE; and a **PHED context
card** as a `lexical` dashed card (2173922). The 3 cards react to the Year
selector; verify live and confirm values for the selected year.

**✅ Phase 2 fully complete — all four §01 cards match the mockup.** The primitive
gaps are now built and the cards transcribed via the Playwright loop:
- **status_pill / target_bar / delta** shipped as **built-in column types**
  (`ui/columnTypes/`), + a **`percent`** formatFn. See
  [`map21-kpi-column-types.md`](./map21-kpi-column-types.md).
- **UI.Pill made themeable** (design-system contract) → the brand bordered/dotted/
  uppercase status pill flows design-system → theme → UI.Pill → status_pill → card.
  See [`theme-ui-pill.md`](./theme-ui-pill.md).
- **Card header** alignment + casing controls (`headerJustify`/`headerCase`) so the
  title is left-aligned sentence-case. See [`card-header-alignment-and-casing.md`](./card-header-alignment-and-casing.md).
- **PHED card converted from `lexical` → data-bound Card** (2173922): UZA-measure
  pill, `sum(phed)` hr/yr value, note.
- Cards: Interstate 2173919 (79.8% / ≥75% / +1.3 / 4.8 pts above), Non-Int 2173920
  (83.2% / ≥70% / −3.6 red / 13.2 pts above), Truck 2173921 (1.46 / ≤2 / +0.02 red /
  0.5 pts below), PHED 2173922 (374,711,700 hr/yr).
- **Deferred polish:** the `%`/`hr/yr` smaller-unit superscript; the PHED card's
  dashed "context" chrome + "Urban congestion below →" link; the §01 "3/3 measures
  met" roll-up header.

**Original plan ↓**

- **Mockup:** 4 cards — Interstate, Non-Interstate, Truck (each: status pill,
  big value, 4-yr target line, target bar with marker, Δ vs prior yr, hint) +
  a PHED context card (links to §05 via `#urban-congestion`).
- **Components:** 3 × `Card` (reuse the 2173878–2173881 recipe verbatim:
  metric calc + hidden `lag()` prior + `round`-wrapped formula Δ + `max(t.<target>)`
  + status CASE), 1 × `lexical`/`Card` context card.
- **Datasets:** 2001/3394 ⋈ 2027/3460 on `ds.year_record`. Year leaf
  `usePageFilters + includePriorPeriod`.
- **UDA config:** GROUP BY `ds.year_record`, `pageSize 1`, ORDER BY
  `ds.year_record DESC`; per-card single value column + lag + formula; LEFT JOIN
  targets `t` on `year_record`. (All proven on 2173049.)
- **Primitive gaps to add/modify:**
  - **Status pill** — the mockup's coloured "meets/below target" pill. Today the
    status is a text calc column. Add a **status-pill column type** (or a
    `formatFn` mapping a status string → coloured badge) so authors get the pill
    without bespoke markup. *(Author-empowerment: prefer a formatFn/column-type
    over a custom section — see `themes/CLAUDE.md`.)*
  - **Target bar** — the mini progress bar with a target marker. Add a
    **target-bar column type** (reads value + target + direction).
  - **Δ arrow/colour** — `↑ +1.3` green / `↓ −1.7` red. Add a **signed/delta
    formatFn** (or delta column type) that renders sign + arrow + conditional
    colour; today it's a bare signed number.
- **Skill notes:** the three column-type/formatFn enrichments are reusable across
  brands → candidate `card-layout.md` additions + possibly a "status & delta
  column types" recipe.

## Build status (session 2026-05-30)
- **§01 (Phase 2): DONE & verified** (4 cards + column types + themed pill + header controls).
- **§06 download (Phase 7): BUILT, visually UNVERIFIED.** Section **2173959** created as a
  near-verbatim clone of the working Spreadsheet 2173042 (source 2001/3394, `year_record`
  + `ua_name` `usePageFilters`, `allowDownload`, pageSize 50). High confidence; needs a
  loop pass to confirm.
- **§03 explainer (Phase 4): BUILT, visually UNVERIFIED.** Section **2173960** (lexical) —
  significant-progress two-prong test + UZA applicability + state legend. Low risk (static).
- **§02 trends (Phase 3): DEFERRED.** No `Graph` template exists in npmrdsv5 to clone, and
  the stepped FHWA target reference-line + annotation overlay are confirmed Graph gaps.
  Building a Graph blind (no template, no visual loop) is too risky — needs the loop + a
  Graph reference-series capability assessment first.
- **§04 regional (Phase 5) / §05 urban (Phase 6): NOT BUILT — blocked on the loop.** The
  grouped-aggregate SQL (GROUP BY `mpo_name` / `ua_name`) reuses the proven card metric SQL
  and is ready to build, but these are exactly the data-bound sections that have repeatedly
  shown *silent* query-breaks only the Playwright loop catches. **The auth token expired
  mid-session** (loop down) — building these blind would risk shipping blank sections. Build
  + verify in a fresh-token pass. §05 PHED /cap remains a hard data blocker (no UZA
  population source).
- **Process note:** new sections are created with `dms section create <page> --pattern
  npmrds_sub --element-type <T> --data <data>` (without `--pattern` the CLI defaulted to the
  wrong pattern `freightatlas2`). `section delete` leaves a **dangling `draft_sections` ref**
  — prune it from the page after deleting.

## Phase 3 — §02 Reliability over time (trends)

- **Mockup:** 3 line charts (Interstate, Non-Int, TTTR) with a **stepped FHWA
  target reference line** (P1→P2 step), a 2020-COVID marker, a "P2 begins" period
  boundary, and meets/below point colouring. **Ignores the year variable.**
- **Components:** 3 × `Graph` (line). No `year_record` leaf.
- **Datasets:** 2001/3394 ⋈ 2027/3460 on `year_record`. GROUP BY `year_record`;
  series1 = metric, series2 = `max(t.<measure>_applicable_target)` (the step line).
- **UDA config:** grouped multi-year; no page-filter leaf; ORDER BY year asc.
- **Primitive gaps to add/modify:**
  - Confirm the **`Graph` component supports a second "reference/target" series**
    rendered as a stepped line distinct from the data series; if not, add a
    reference-line series mode.
  - **Annotations** — vertical markers (COVID, period boundary) and the
    last-point label. Likely a Graph enhancement (annotation layer) — assess
    `graph` vs `graph_new`.
  - Point-level conditional colouring (meets/below) — assess whether the Graph
    supports per-point colour from a companion column.
- **Skill notes:** "trend + target reference line" is a recurring need →
  candidate Graph recipe skill once the Graph gaps are scoped.

## Phase 4 — §03 How MAP-21 targets work (explainer)

- **Mockup:** a tinted `content_tint` panel: two-prong significant-progress test
  (Met / Significant progress / Not meeting), 4-yr periods + 2-yr/4-yr checks,
  MPO 180-day adoption, UZA applicability + 3-chip legend.
- **Components:** 1 × `lexical` (the seed's `styled`/`para`/`head`/`list` helpers).
- **Datasets:** none (static).
- **UDA config:** none.
- **Primitive gaps:** none expected. Confirm the brand's `content_tint`
  LayoutGroup renders the tint; confirm lexical supports the icon/chip layout
  (or accept a simpler rendering).
- **Skill notes:** if the chip-legend / callout shape recurs, note a lexical
  pattern for `creating-pages-from-a-design-pattern.md`.

## Phase 5 — §04 Regional (MPO · County compliance matrix)

- **Mockup:** one row per MPO × {Interstate, Non-Int, TTTR (verdict dots vs state
  target), PHED total, PHED /cap (diagnostic, no verdict)} + `Met X/3`; MPO/County
  toggle; sortable. (County mode: no verdict — no federal county target.)
- **Components:** `Card` or `Spreadsheet`, GROUP BY `mpo_name` (and a County
  variant GROUP BY `county_name`).
- **Datasets:** 2001/3394 ⋈ 2027/3460 on `ds.year_record` (target stays
  statewide); year leaf `usePageFilters` (no prior-period needed here).
- **UDA config:** GROUP BY the geography column; per-measure calc columns scored
  vs `max(t.<target>)`; PHED total = `sum(phed)`, PHED /cap = `sum(phed)/pop`
  (needs population — see Phase 6 gap); `Met X/3` = formula/calc counting verdicts.
- **Primitive gaps to add/modify:**
  - **Per-cell "value + meets/below dot vs target"** — reuse the Phase 2
    status-pill/target enrichment as a compact cell variant.
  - **`Met X/N` roll-up** — a formula counting how many measure columns pass; may
    need a formula that references multiple sibling calc columns (verify
    `evaluateAST` can express the count, or add a small helper).
  - **Sortable columns** on `Card`/`Spreadsheet` matrix — verify Spreadsheet sort
    works on calc columns; enhance if needed.
  - **MPO/County toggle as a page variable** — it's a *grouping* switch, not a
    value filter. Today there's no "group-by selector" page variable. Options:
    (a) two stacked sections (MPO + County) toggled by a page variable controlling
    visibility; (b) a new "group-by" page-variable mechanism. **Decide and note —
    likely a primitive gap.** (Per the user, only `year_record` is an interactive
    value variable for v1; the MPO/County toggle may ship as the MPO matrix only,
    with County deferred.)
- **Skill notes:** the compliance-matrix pattern (grouped, per-cell vs-target,
  roll-up) is a strong standalone recipe candidate.

## Phase 6 — §05 Urban congestion (UZA)

- **Mockup:** Reporting UZAs table (NY-Newark, Poughkeepsie-Newburgh × PHED /cap
  ≤target · Non-SOV ≥target + `Met X/2` + MPO) + a compact non-reporting note
  (the other 11 NY UZAs + why).
- **Components:** `Card`/`Spreadsheet` (reporting, GROUP BY `ua_name` filtered to
  the two UZAs) + `lexical` (non-reporting note) or a small reference table.
- **Datasets:** 2001/3394 ⋈ **2028 / upload 6822** on `ds.year_record` +
  `ds.urban_code`. Non-reporting populations/AQ status come from a **UZA reference
  table** (not in 2001) — decide source.
- **UDA config:** GROUP BY `ua_name`; join on two keys (`year_record` +
  `urban_code`) — verify the join builder handles a 2-column `joinColumns` for a
  DAMA source; filter `urban_code IN (63217, 71803)`.
- **Primitive gaps to add/modify:**
  - **PHED per-capita needs UZA population** — source 2001 carries *total* PHED
    hours only. Decide: (a) join a UZA population table (HPMS/ACS) as a second
    join source, or (b) carry actual per-capita in the 2028 file. **Blocker for a
    faithful PHED /cap.**
  - **Two-key DAMA join** — confirm `buildJoinOnClause` emits
    `ds.year_record = t.year_record AND ds.urban_code = t.urban_code` cleanly
    (we've only exercised single-key joins so far).
  - Multi-source section (base ⋈ targets ⋈ population) — verify 3-source joins.
- **Skill notes:** extend `using-a-datawrapper-card.md` with the multi-key /
  multi-source join recipe (it currently documents single-key).

## Phase 7 — §06 Annual data download

- **Mockup:** Year dropdown (the page variable) + Download CSV + a statewide
  rollup table; "this is the HPMS Travel Time Metrics submission" note.
- **Components:** `Spreadsheet` bound to 2001/3394, `year_record` leaf
  `usePageFilters`, `display.allowDownload: true`.
- **Datasets:** 2001/3394 only.
- **UDA config:** filtered to the selected year; the published measure columns.
- **Primitive gaps:** confirm `Spreadsheet` download exports the *filtered*
  query (not just the visible page); confirm the year variable drives it.
- **Skill notes:** "year-filtered downloadable table" is a small reusable recipe.

## Phase 8 — Polish + skill roll-up

- Wire the sticky TOC anchors to every section id; (optional) scroll-spy active
  state if a JS hook exists.
- Verify the whole page: `dms page dump <slug> --sections`, open in admin, change
  the Year and confirm §01/§04/§05/§06 recompute while §02 stays multi-year.
- **Roll up all *Skill notes*** into concrete edits: finalize
  `creating-interactive-pages.md`; land the Phase-2 column-type/formatFn additions
  in `card-layout.md`; add the compliance-matrix and trend-with-target recipes if
  warranted; update `creating-pages-from-a-design-pattern.md` with anything that
  closed the design→DMS gap. **Goal: a future page like this is one-shot.**

---

## Cross-cutting: primitive-gap ledger (keep updated as phases run)

Single place to track DMS primitive work surfaced by this build (move each to its
own `patterns/page` task when it's ready to implement).

> **Procedure for closing these:** use
> [`transcribing-a-design-card-to-dms.md`](../../skills/transcribing-a-design-card-to-dms.md)
> — inventory the mockup atoms, map each via the decision ladder (the status-pill /
> target-bar / delta items below are all rung-3 "look depends on the value" →
> column types), build authorable atoms first, then verify with the Playwright
> helper `scripts/card-shot.mjs` (mockup `[data-dms-section="kpi-interstate"]` vs
> live section 2173919). Playwright is a one-time `npm i -D playwright && npx
> playwright install chromium`.

- [x] Status-pill column type (Phase 2) — built-in `status_pill` + themeable `UI.Pill`.
- [x] Target-bar column type (Phase 2) — built-in `target_bar` (range-scaled + marker).
- [x] Signed/arrow delta column type (Phase 2) — built-in `delta` + `percent` formatFn.
- [ ] Graph: stepped target reference series + annotations + per-point colour (Phase 3)
- [ ] `Met X/N` verdict roll-up (formula or helper) (Phase 5)
- [ ] Sortable matrix columns on Card/Spreadsheet (Phase 5)
- [ ] Group-by page variable (MPO/County toggle) (Phase 5)
- [ ] UZA population join for PHED per-capita (Phase 6)
- [ ] Multi-key (2-col) DAMA join verification (Phase 6)
- [ ] Sticky-TOC page chrome — theme/layout feature vs section (Phase 1)
- [x] **Author-selectable whole-filter "Filter style"** (named `filters` theme styles
      + `display.filterStyle` toolbar control + `controlStyle` passthrough to the
      value multiselect) — shipped in Phase 1; see Phase 1 note. (Phase 1)

## Testing checklist

- [ ] Page created (draft); `draft_section_groups` set for the bands.
- [ ] Year `Filter` drives §01/§04/§05/§06; §02 ignores it (live).
- [ ] Each data section's UDA query returns sane values for CY 2025.
- [ ] Joins resolve (state targets on `year_record`; UZA targets on
      `year_record`+`urban_code`).
- [ ] `dms page dump --sections` matches the mockup section inventory.
- [ ] Nothing published by the task (humans publish).
- [ ] `creating-interactive-pages.md` written + indexed; per-phase skill notes
      rolled into edits.
