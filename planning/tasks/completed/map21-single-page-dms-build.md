# Task: Build the MAP-21 PM3 single-page report as a live DMS page

> **✅ CLOSED 2026-06-03.** All eight phases shipped: the full MAP-21 PM3 page
> (§01–§06) is built and verified live in `npmrdsv5+npmrds_sub` (see *Build status
> (session 2026-05-30)* and the later session logs), and the `creating-interactive-pages`
> skill is written + indexed. Closed at higher-priority request with a handful of
> **cross-cutting polish items intentionally left open** (see *Cross-cutting polish
> (deferred)* and the unchecked primitive-gap ledger entries — e.g. §01 roll-up
> header, KPI superscript units, per-section band tints, sticky-TOC chrome, MPO/County
> group-by toggle, §05 per-capita/Non-SOV blocked on UZA population data). These are
> deferred, not forgotten — revisit if the client raises them.

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

## Build status (session 2026-05-30) — ALL SIX SECTIONS BUILT & VERIFIED ✅

Page **2173915** now has 15 draft sections rendering top-to-bottom in reading order
(full-page shot verified via the Playwright loop):
- **§01 Compliance snapshot (Phase 2)** — 4 KPI cards (2173919–22): status_pill,
  value+%, target_bar, delta, margin. ✅
- **§02 Reliability over time (Phase 3)** — 3 `Graph` line charts (2173963/64/65):
  Interstate / Non-Interstate / Truck TTTR over 2016–2025 (the 2020 COVID spike is
  visible). ✅ Built from the graph `defaultState` (no template existed) — `graphType:
  'LineGraph'`, `year_record` as `xAxis`+`group`, the metric as `yAxis` (`fn:exempt`),
  no `year_record` leaf (ignores the Year selector). **Deferred (Graph gaps):** the
  stepped FHWA target reference series, the COVID/period-boundary annotations, and
  per-point meets/below colouring.
- **§03 How targets work (Phase 4)** — `lexical` explainer (2173960). ✅
- **§04 Regional · by MPO (Phase 5)** — `Spreadsheet` (2173961), GROUP BY `mpo_name`,
  per-measure reliability + PHED total, year-filtered. ✅ **Deferred:** per-cell
  verdict dots, `Met X/3` roll-up, MPO/County group-by toggle (no group-by page
  variable yet).
- **§05 Urban congestion (Phase 6)** — `Spreadsheet` (2173962), GROUP BY `ua_name`,
  filtered to the two reporting UZAs (`urban_code IN (63217,71803)`). ✅ **Deferred /
  blocked:** PHED **per-capita** and **Non-SOV** are not computable from source 2001
  (no UZA population, no non-SOV column) — shows PHED **total** + reliability instead.
- **§06 Annual download (Phase 7)** — `Spreadsheet` (2173959) cloned from the working
  2173042: source 2001/3394, `year_record` `usePageFilters`, `allowDownload`,
  paginated (20,682 rows for CY 2025). ✅

**Cross-cutting polish still deferred:** band/tint separation per § (all new sections
appended into the §01 report group — functional, not visually banded); the §01 "3/3
measures met" header roll-up; the dashed/slate PHED "context" chrome; smaller-unit
`%`/`hr/yr` superscript; sticky-TOC chrome.

**Process notes learned this phase:**
- Create sections with `dms section create <page> --pattern npmrds_sub --element-type
  <T> --data <data>` — **without `--pattern` the CLI defaults to the wrong pattern**
  (`freightatlas2`), producing a mis-typed section.
- `dms section delete` leaves a **dangling `draft_sections` ref** on the page — prune
  it (page raw update) or the page render breaks.
- **Build data-bound sections by cloning a working section** of the same element-type
  (Spreadsheet ← 2173042; calc-column shapes ← a KPI card) — hand-built column objects
  miss fields `createRequest` needs.
- **The auth token expires (~6h)** and the loop silently fails (login redirect); refresh
  `scratchpad/<env>/auth.json` with a new `userToken`. The Spreadsheet/Graph `fn`
  ("exempt") labels seen in shots are **edit-mode chrome**, not real columns.
- Fixed a real bug surfaced by the new column types: the Card spread the column's data
  `key` field into the cell `Comp`, which React read as its own `key` → warning. Now
  stripped before the spread (`Card.jsx` CompWrapper).

## Session 2026-05-31 — §02 trends moved to `avlGraph` + Graph primitive built up ✅

Focused session on the **§02 trend charts** and the underlying **`avlGraph` (`graph_new`)**
primitive (its own task: [`avlgraph-theme-integration.md`](./avlgraph-theme-integration.md)).
All three §02 trends (2173963/64/65) were **converted from the legacy `graph` to `avlGraph`**
and now render the design's **emerald area+line**; the Interstate chart (2173963) carries a
**dashed amber 75% target reference line**. Verified via the Playwright loop; both repos
committed + pushed to `master` (`availabs/dms` `5d246c5e`, `availabs/dms-template` `3733274`).

**What shipped (all BC, all author-accessible):**
- **Calc-series binding fixed** — the blank-line blocker was *two* bugs: (1) the wrapper read
  `row[yc.name]` but rows are keyed `normalName || name` (now resolved that way, matching
  `getData.js` / `Card.jsx`); (2) **the actual cause** — a calc column's `fn:"exempt"` hit a
  `getAggFunc` fallback (`id = x => x`) that returned the *group array* instead of applying the
  accessor → `NaN` line. `graph_new/components/utils.js` now handles `exempt`/unknown fns by
  pulling the first non-empty accessed value. Keep the calc column `name` = full SQL.
- **Theme/section line+axis tokens** threaded through `GraphComponent` → wrapper → d3 renderer:
  `strokeWidth`, `area`+`areaOpacity` (new filled `<path>`), gridline `gridLineOpacity` +
  `axisColor`. Brand defaults in `theme.avlGraph.chartDefaults` + transportny `chartDefaults`.
- **Per-series controls** on a yAxis column: `interpolation` (linear/step/monotone/basis/
  catmullrom), `area`, `color`, `dashArray` — in `ComponentRegistry/graph_new/config.jsx`.
- **Reference line = a styled second series** (not a bespoke feature): a second yAxis column
  (`75.0 as lottr_interstate_target`) with `interpolation:"step"` + amber `color` + `dashArray`.

**Open items carried forward (⚠️ note for next session):**
- **Target values for the other two trends.** Only the Interstate target (75%, stated in the
  mockup) is wired. **Non-Interstate NHS LOTTR and Truck TTTR targets aren't in the mockup —
  confirm the values + source with the user before adding their reference lines; do NOT
  fabricate regulatory targets.** Capability is ready (add a `<target> as <name>` 2nd yAxis
  column, step interp, amber dash); for a stepped P1→P2 line use a `CASE WHEN year_record >= …`
  calc column with `step` interpolation.
- **Per-chart hero-stat card** (the design's small "CY 2025 · 79.8% · ● meets" header above
  each trend) — still deferred. The §01 KPI strip already shows the hero stats with
  `status_pill`s; a per-chart card is a nice-to-have (build as a sibling `Card`, reuse
  `status_pill`).
- **Still on the Graph gap list:** point markers + the last-point label badge; the
  COVID/period-boundary vertical annotations; per-point meets/below colouring; tick font-size
  token. (Interpolation/area/color/dash + the stepped-target capability are now DONE.)

## Session 2026-05-31 (continuation) — Table theme + graph tick padding + hover label

Three small but high-impact fixes; all changes BC and author-accessible.

**Shipped:**
- **Spreadsheet/Table theme actually applied.** transportny's `theme.table.styles[0]` was
  keyed to HTML-element names (`wrapper`/`thead`/`th`/`tr`/`td`) — the Table component
  renders a CSS-grid of `<div>`s and reads `tableContainer` / `headerCellContainer` /
  `headerCellContainerBg` / `cell` / `cellInner` / `cellBg…` / `gutterCellWrapper` / etc.,
  so the brand block was dead. Re-keyed and **restructured into three named styles** to
  match the design system's source of truth (`dms_design_system_v2/design-system/
  components.html`):
  - **`default`** = the components page's "default · dashboard · amber-hover" example:
    `font-display uppercase text-[11px] tracking-wide text-slate-600` header on
    `bg-slate-50/80`, `px-3 py-2 text-[13px] text-slate-700` cells, bottom-only
    `border-b border-zinc-950/05` rows, `hover:bg-[#FFFBEB]`. Rounded white shell.
  - **`editorial`** = the components page's "editorial · deep-navy header · printable":
    `bg-[#0F2D4D]` header on a `#F5F1E8` body with all-sides slate-200 hairlines.
  - **`report`** (new) = the MAP-21 page's tighter treatment: `font-mono text-[10px]
    uppercase tracking-[0.16em] text-slate-500` header on `bg-slate-50/60`,
    `px-4 py-2.5 text-[13px] text-slate-700` Proxima body. Inherits the rest from
    `default`. **This is the brand's current global default** (`options.activeStyle:
    "report"`) because §04/§05/§06 are the only Spreadsheets on the site today.
  All three styles share the same admin chrome (popup menu, open-out drawer) via two
  shared spread-fragments (`tableHeaderChrome` / `tableOpenOutChrome`) so the styles
  declare only what visually differs.
- **LineGraph first tick flush to the y-axis.** `avl-graph/LineGraph.jsx` default
  `padding = 0.5` → `0` on the `scalePoint()` x-axis. The 2016 (or first-year) data point
  now lands at x=0 with no gap; right edge is symmetric. (Authors who want padding can
  pass `display.padding` through `chartDefaults` if/when threaded.)
- **Graph hover shows the column's display name, not the SQL.** A `yAxis` calc column's
  `name` is the raw SQL expression and the series `id` had to stay the SQL alias for d3
  binding, so the hover tooltip surfaced the SQL. Now `components/LineGraph.jsx` attaches
  `displayName: yc.customName || yc.display_name || ycn` to each series and the
  `DefaultHoverComp` in `avl-graph/LineGraph.jsx` uses `idFormat(rest.displayName || id,
  rest)` instead of `idFormat(id, rest)`. BC: series `id` (the join key) is unchanged.

**Process notes:**
- **Theme edits don't hot-reload reliably** (per `transcribing-a-design-card-to-dms.md`).
  Restart `npm run dev` after editing `themev2.js` or the table will still look like the
  old library default. Component edits (LineGraph wrapper / DefaultHoverComp) do hot-
  reload, so the graph fixes show up immediately.
- The transportny `table` block was structurally broken (wrong keys for ~2 years' worth
  of work) but never crashed because the Table component reads each key via `theme.foo`
  and a missing key just falls into the className as the literal string `undefined` —
  visually broken but functionally inert. **Lesson:** theme keys should be type-checked
  somewhere (or at least dev-warned) so that an authored block that nothing reads
  doesn't silently ship.

## Session 2026-06-03 — split headers, PHED graph, §06, fill behaviour, real graph targets

All BC, author-accessible. Shipped:
- **§02 measure headers rebuilt as compound bands** — left lexical (kicker + heading) +
  right Card (value + pill) composing flush above each graph via section `height:'fill'`;
  graph titles removed; graph chrome set to compose (rounded-b, tint footer).
- **PHED trend graph added** (`2174100` lex + `2174101` card + `2174102` graph) — 4th
  trend; y-series `round(sum("phed"))`, abbreviated axis/tooltip.
- **AVL Graph author options** (BC, theme-driven) — custom y-domain (`yAxis.domainMin/Max`,
  set 0–100 on the % graphs), per-series **point marks** (`showMarks`, data-only here),
  **tooltip format fn** (`tooltip.yFormat`, decimals), **tooltip totals toggle**
  (`tooltip.showTotal`). See `card-layout.md` / the avlGraph options task.
- **§06 Annual-data section** — kicker+heading header + **Download CSV** button (new
  `download_button` column type, `UI.Button` + `activeStyle`, interpolates page `year_record`
  into a placeholder URL — swap real URL in the button card's column `urlTemplate`) +
  3-measure **summary Card** (all measures' columns in one Card) + tinted title bar + footnote.
- **`height:'fill'` end-to-end** — `sectionArray`/`section.jsx`/`dataWrapper`/`Card.jsx`
  now propagate fill so a component fills its section, content top-aligned (`auto`=content,
  BC). Card interior padding standardized via the `cardsPadding` setting (not the style).
  Fixed PHED §01 pill cell `valueFontStyle` (`displayXL`→`textSMBold`) that inflated its line box.
- **Theme-editor crash fixed** (`tableSettings` → `getComponentTheme`).
- **[x] §02 graph target reference lines now use the REAL targets** — joined 2027
  `*_applicable_target` (Interstate/Non-Interstate/Truck) instead of hardcoded literals;
  the line steps per year (e.g. Truck target 2.00→2.10 in 2020–21→2.00). Gotcha: a target
  column needs `show:true` or it's dropped from the SELECT and the GROUP BY validation
  errors ("Non grouped columns must have a function applied"). PHED has no statewide target.

- **§04 / §05 contextual content added; spreadsheet titles removed.** The two data
  tables (`2173961` §04 MPO matrix, `2173962` §05 reporting-UZA table) had their bare
  section `title` cleared and were wrapped in mockup framing lexicals:
  - §04: header `2174150` (kicker `// 04 · Regional · MPO · CY 2025` + h2 "Who meets
    which target, region by region?" + proseSM) above the table; footnote `2174151`
    (proseXS scoring note) below. **MPO-only** per request — no County/MPO switch built;
    the eyebrow/footnote drop the County references the mockup carries.
  - §05: header `2174152` (kicker `// 05 · Urban congestion · CMAQ · per UZA` + h2 +
    proseSM about >200k pop / CMAQ nonattainment / per-capita) above the table;
    non-reporting note `2174153` (kicker + proseXS, the 11-other-UZAs paragraph) below.
  - `draft_sections` reordered to interleave: `…2174051, 2174150, 2173961, 2174151,
    2174152, 2173962, 2174153, 2174103…`. All new sections are bare full-width
    (size 12, no card chrome) modeled on the §03 header `2173960`.
- **PHED graph y-axis decimals cleaned.** `display.yAxis.format` on graph `2174102`
  `fnum2`→`fnum` (`338.71m`→`339m`) — config-only, the format options already exist and
  are author-selectable. (Editing format requires patching the stringified `element-data`,
  NOT `--set display.yAxis.format` — that dot-path lands at the wrong level and adds a
  no-op top-level `data.display` key.) Themeable **axis fonts** are a separate gap →
  new task `graph-axis-font-theming.md`.

**Skill rollup (living mandate):** the session's reusable CLI mechanics landed in
`creating-pages-from-a-design-pattern.md` §5.2.1 — the `--set`-can't-reach-`element-data`
trap + parse/modify/re-stringify recipe, section ordering/insertion via a `draft_sections`
full-replace reorder (`create` appends), and the "clear `title` + frame with sibling lexical
header/footnote" pattern. Graph axis-font theming + the `fnum2`→`fnum` format note are in
`authoring-graphs.md`. The editorial patterns (eyebrow/prose styleKeys, CTAs, rowspan, card
chrome) were already documented from earlier phases.

**Data note:** UZA population + Non-SOV actuals are NOT in DAMA — must be sourced
externally and loaded before §05 per-capita / Non-SOV can be built. Performance-measure
*targets* (2027 statewide LOTTR/TTTR, 2028 per-UZA PHED/Non-SOV) ARE loaded.

## Cross-cutting polish (deferred — tracked here)

These are visual deltas the live build doesn't yet match. None block usability; each is
a polish pass. Listed roughly in order of design impact.

- [ ] **§01 "3/3 measures met" roll-up header.** The mockup shows a small status pill
      above the four KPI cards summarizing "n/3 measures met this year". Calc:
      `sum(case when status='Meets' then 1 else 0 end) || '/3 measures met'`. Build as a
      single `Card` above the §01 row, or as a header cell with a new `status_pill` calc.
- [x] **PHED "context" card style** — shipped as a new `dataCard` named style.
      `theme.dataCard.styles[7] = {name: 'context', ...}` with the mockup's `border-
      dashed border-zinc-950/15 bg-slate-50/60 p-5 flex-col gap-3 h-full` wrapper,
      `font-display font-medium text-[15px]` header, `font-display font-semibold
      text-[28px] tabular-nums` value, and `font-proxima text-[12.5px] text-slate-600`
      description. Also added to `dms_design_system_v2/design-system/components.html`
      as the 8th dataCard example with the PHED sample data ("UZA measure" slate pill,
      "Peak-hour excessive delay", "366,000,000 hr/yr", note). To apply on live
      section 2173922: in edit mode open the PHED card's "More" menu → Card style →
      `context`. (Still **deferred**: the "Urban congestion below →" link, which is a
      separate column-level concern — `isLink + location: '#urban-congestion'` on a
      column rendered with `metaSM` font-style would do it.)
- [ ] **Smaller-unit superscript on KPI values.** Mockup renders `79.8%` and
      `374,711,700 hr/yr` with the unit at smaller weight. Likely a new formatFn
      (`percent_with_unit` / `value_with_unit`) that wraps the unit in `<sup>`-style
      Tailwind classes, or a column-type cardHint that splits unit from value.
- [ ] **Band/tint separation per section.** The mockup alternates white surface (§01/§02)
      and slate-tinted (`bg-[#ECEEF2]`) bands (§03/§04/§05/§06) — the live page renders
      every section into a single `Report` LayoutGroup with no per-band background. The
      page pattern currently doesn't expose a "per-section band background" token; the
      cleanest fix is to introduce a `band` LayoutGroup attribute (theme-driven) and
      assign each §-row to its band.
- [ ] **Sticky in-page TOC chrome.** Right-rail `<aside class="sticky top-4 self-start
      …" data-dms-section="toc">` in the mockup; the page pattern has no first-class
      anchored section nav yet. Options: (a) theme/layout feature with `pageLayout:
      'with-toc'`, (b) a new `toc` chrome section type that auto-collects sibling
      `<section id>`s, (c) a `lexical` section with hand-wired anchor links (cheap, not
      author-resilient). Decision deferred from Phase 1.
- [x] **§04 per-cell verdict dots + `Met X/3` roll-up.** Shipped — the live MPO matrix
      (`2173961`) renders `<dot> <value>` per measure (emerald/red by meets/below) and a
      `Met X/3` column. Framing header/footnote added 2026-06-03 (see session log).
- [ ] **§04 MPO/County group-by toggle.** Today the matrix is MPO-only **by request**
      (2026-06-03: "keep it just MPO"). A page variable that swaps the GROUP BY column is
      the right shape when revisited — primitive gap on the ledger.
- [ ] **§05 PHED per-capita + Non-SOV.** Blocked on data: per-capita needs a UZA
      population join (HPMS/ACS); Non-SOV isn't in source 2001 at all. Coordinate with
      data team for a populations table, or carry per-capita in upload 6822 directly.
- [x] **Per-section "Table style" picker on Spreadsheet** — shipped. `spreadsheet/
      config.jsx`'s `controls` is now a function `(theme) => ({...})` (matches the
      Card / FilterComponent contract; `sectionMenu.jsx:31-33` already invokes
      `controls(theme)` if it's a function). New `Table style` select in `more` with
      options from `buildTableStyleOptions(theme)` — reads `theme.table.styles[].name`
      and prepends a `(theme default)` empty-value option. `display.tableStyle` is
      resolved as `display.tableStyle || activeStyle` in `RenderTable` (spreadsheet/
      index.jsx). Authors now pick `default` / `editorial` / `report` per Spreadsheet.
- [x] **Per-section "Card style" picker on Card** — shipped. `Card.config.jsx`
      adds `buildCardStyleOptions(theme)` reading `theme.dataCard.styles[].name`,
      and a `Card style` select at the top of `more`. The section wrapper
      `ComponentRegistry/Card.jsx` now destructures `activeStyle` from
      `ComponentContext` and passes `activeStyle={state.display?.cardStyle ||
      activeStyle}` down to the UI primitive `Card.jsx` (which reads it at line 836
      `getComponentTheme(theme,'dataCard',activeStyle)`). Authors pick from the 6
      transportny dataCard styles (default / kpi / compliance / editorial /
      title_bar / compact / dashboard) per Card section.
- [ ] **Audit other multi-style components.** Only Card + Spreadsheet currently have
      multi-style themes that need pickers. Graph / avlGraph / Lexical / Map each
      have one style today. If a brand adds a second style to any of those, the
      same pattern (function-form `controls` + style-select + `display.<x>Style ||
      activeStyle` thread) is the standard.

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
- [~] Graph (Phase 3, §02 on `avlGraph` — session 2026-05-31): **DONE** — stepped target
      reference line (as a styled 2nd yAxis series: step interp + color + dash), per-series
      interpolation/area/color/dash, theme line+axis tokens, calc-series binding +
      `fn:"exempt"` agg fix. **REMAINING** — point markers + last-point label, COVID/period
      vertical annotations, per-point meets/below colour; confirm Non-Int/TTTR target values.
      (See [`avlgraph-theme-integration.md`](./avlgraph-theme-integration.md).)
- [ ] `Met X/N` verdict roll-up (formula or helper) (Phase 5)
- [ ] Sortable matrix columns on Card/Spreadsheet (Phase 5)
- [ ] Group-by page variable (MPO/County toggle) (Phase 5)
- [ ] UZA population join for PHED per-capita (Phase 6)
- [ ] Multi-key (2-col) DAMA join verification (Phase 6)
- [ ] Sticky-TOC page chrome — theme/layout feature vs section (Phase 1)
- [x] **Author-selectable whole-filter "Filter style"** (named `filters` theme styles
      + `display.filterStyle` toolbar control + `controlStyle` passthrough to the
      value multiselect) — shipped in Phase 1; see Phase 1 note. (Phase 1)
- [x] **transportny `theme.table` re-keyed to the Table component's actual tokens**
      (`tableContainer` / `headerCellContainer` / `cell` / `cellInner` / `cellBg*` / …)
      so the brand's MAP-21 mockup design (rounded shell, font-mono uppercase header,
      bottom-only hairlines, amber hover) actually applies to §04/§05/§06. Was dead
      code (HTML-element keys nothing reads). (continuation session)
- [x] **LineGraph x-axis padding default** flipped from `0.5` → `0` so the first tick
      lands at x=0 (flush against the y-axis). (continuation session)
- [x] **Graph hover label** prefers `customName || display_name || alias` over the raw
      column `name`, so a calc column's SQL expression doesn't appear in the popover.
      (continuation session)

## Testing checklist

- [x] Page created (draft); `draft_section_groups` set for the bands.
- [x] Year `Filter` drives §01/§04/§05/§06; §02 ignores it (live).
- [x] Each data section's UDA query returns sane values for CY 2025.
- [x] Joins resolve (state targets on `year_record`; UZA targets on
      `year_record`+`urban_code`). _(UZA two-key join verified for §05; multi-key
      DAMA join generalization still ledgered as a primitive gap.)_
- [x] `dms page dump --sections` matches the mockup section inventory.
- [x] Nothing published by the task (humans publish).
- [x] `creating-interactive-pages.md` written + indexed; per-phase skill notes
      rolled into edits.
