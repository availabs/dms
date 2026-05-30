# avlGraph (graph2) theme integration + trend-chart design

**Topic:** ui (`avlGraph` / `graph_new` primitive) + themes (transportny) + MAP-21 §02 trends.
**Status:** core complete & verified (2026-05-30) — binding fix + theme-driven line/area/axis
tokens + per-series interpolation/color/dash + reference-line-as-a-styled-series. All three §02
trends rebuilt on `avlGraph` (emerald area+line, Interstate carries a dashed amber 75% target).
Remaining: optional per-chart hero-stat card + confirm the other two charts' target values.

## Objective
Move the immature **`avlGraph`** ("AVL Graph") component forward and use it to upgrade
the MAP-21 §02 trend charts to the design. Two problems: (1) its **theme integration is
thin** — `theme.avlGraph` only carried `bgColor`/`textColor`; the chart internals (axes,
gridlines, line, markers, area, fonts, colours) came from per-section `display`, so no
brand could style all graphs at once; (2) the trends were built on the legacy `graph`
and lack the design's richer look (area+line, themed axes, stepped target, header + hero
stat). **Everything must stay author-accessible** (theme tokens + per-section settings),
and BC by default.

## ✅ Finished (session 2026-05-30)
- [x] **Theme-driven chart defaults (the integration foundation).**
  - `graph_new/theme.js` — added `ChartDefaults` (colours, margins, axes) onto
    `avlGraphTheme.styles[]`.
  - `graph_new/index.jsx` — `mergeChartDefaults(theme.chartDefaults, display)` merges
    brand defaults **under** the section's `display` (per-section overrides win; a sparse
    section inherits the brand look). One-level deep-merge for margin/xAxis/yAxis/legend/
    colors. **BC** — sections whose `display` already carries the keys are unchanged.
  - `themev2.js` — added brand `chartDefaults` (emerald/navy/amber palette + margins/axes)
    to the transportny graph style.
- [x] **New skill `authoring-graphs.md`** (indexed in `skills/README.md`) — avlGraph data
  model (`target: xAxis|yAxis|categorize`, multi-series), the **theme-vs-settings** split
  (brand defaults in theme, overrides in `display`), and the two patterns below
  (reference-line-as-joined-series, header+hero-stat) + the open binding gotcha.

## ✅ Finished — session 2 (2026-05-30, verified via Playwright)
- [x] **Fixed the avlGraph calc-series binding.** Two bugs, both in the data→series path:
  1. The wrapper read `row[yc.name]`; the dataWrapper keys rows by `normalName || name`
     (getData.js:413). Now `components/LineGraph.jsx` resolves x/y/id by `normalName || name`
     (matches Card.jsx), so getData and the chart agree on the key.
  2. **The real blank-line cause:** a calc column carries `fn:"exempt"`, and
     `components/utils.js getAggFunc` returned `id = x => x` for any unknown fn — which
     **returned the group array, ignoring the accessor** → `+y` = `NaN` → empty line.
     Added `exempt` (and changed the fallback) to pull the first non-empty accessed value
     (the pre-aggregated number per x). **This was the actual blocker.**
  - **Rebuilt §02 trends 2173963/64/65 on `avlGraph`** (build script
    `scratchpad/npmrdsv5-dev2/build_avlgraph_trends.mjs`); all three render emerald area+line.
- [x] **Threaded chart-visual tokens** through `GraphComponent.jsx` → wrapper → d3 renderer:
  `strokeWidth`, `area` + `areaOpacity` (new filled `<path>` in the `Line` component),
  gridline `gridLineOpacity` + `axisColor` (the axis components already accepted them).
- [x] **Per-series `interpolation` control** — `avl-graph/LineGraph.jsx` builds the line/area
  generator per series via a `getCurve()` map (`linear|step|monotone|basis|catmullrom`,
  default `catmullrom`); chart default in theme + author controls (per-column + Line Graph
  Layout panel) in `config.jsx`.
- [x] **Reference line = a styled second series (D).** Added per-series **`color`** + **`dashArray`**
  (Line component `stroke-dasharray`, palette override). The Interstate chart (2173963) now
  carries a `75.0 as lottr_interstate_target` second yAxis series → **dashed amber `step`
  reference line** matching the design's "target ≥75%". Fully author-accessible (a column +
  3 controls); no bespoke feature. Patch: `scratchpad/npmrdsv5-dev2/add_target_line.mjs`.
- [x] **Reconciled settings ↔ theme** for the new tokens: brand defaults in
  `theme.avlGraph.chartDefaults` (+ transportny `chartDefaults`), per-section/-series overrides
  in `display`/columns; `mergeChartDefaults` keeps display winning.

## ⏳ Remaining (optional / needs input)
- [ ] **Per-chart header + hero-stat card (C).** The §01 KPI strip already shows the hero
  stats with `status_pill`s, and each chart has its title; a dedicated per-chart hero card
  above each trend is a nice-to-have. Build as a sibling `Card` (reuse `status_pill`).
- [ ] **Target values for the other two trends.** Interstate uses the design's stated 75%.
  Non-Interstate NHS LOTTR and Truck TTTR targets aren't stated in the mockup — **confirm the
  values/source with the user** before adding their reference lines (don't fabricate). The
  capability is ready: add a `<target> as <name>` second yAxis column, step interp, amber dash.
- [ ] **Stepped P1→P2 target** (vs a flat line): once real period targets are known, encode
  them as a `CASE WHEN year_record >= <P2start> THEN <p2> ELSE <p1> END as target` calc column
  with `step` interpolation — the `step` curve already draws the riser correctly.

## Design target (mockup §02, per chart)
A **card**: header (kicker `// 01 · LOTTR · Interstate · target ≥75%` + h3 title) + a
right hero stat (`CY 2025` · big `79.8%` · `● meets target`), above a chart with themed
gridlines + mono y/x ticks, an **area+line** (emerald line, gradient fill), point markers
+ a highlighted last point with a label badge, a **stepped FHWA target reference line**
(dashed amber, P1→P2 step) with a label, and vertical annotations (`2020 · COVID`,
`P2 begins · 2022`).

## Author-accessibility (non-negotiable)
Every feature is author-settable: theme tokens (theme editor / `avlGraphSettings`),
per-section visuals (`graph_new/config.jsx` controls), per-series interpolation (column
control), and the reference line (a join + a series, configured in the UI).

## Files
- `ui/components/graph_new/theme.js` — `avlGraphTheme` + `ChartDefaults` (✅ added; extend with the visual tokens).
- `ui/components/graph_new/index.jsx` — `mergeChartDefaults` (✅); read the new tokens.
- `ui/components/graph_new/GraphComponent.jsx` — passes `graphFormat` to the chart.
- `ui/components/graph_new/components/avl-graph/LineGraph.jsx` — d3 line renderer; hardcoded `curveCatmullRom` (interpolation hook) + hardcoded axis/line styles (token hooks) + the calc-series binding.
- `.../ComponentRegistry/graph_new/config.jsx` — author controls (interpolation, visual overrides).
- `themes/transportny/themev2.js` — brand `chartDefaults` (✅); brand visual tokens as they land.
- §02 sections 2173963/64/65 — rebuild on `avlGraph`; + header/hero-stat cards.
- `src/dms/skills/authoring-graphs.md` — keep in sync.

## BC / policy
Per the primitive-change policy: BC by default (the theme merge + new tokens default to
today's look; interpolation defaults to `catmullrom`; reference series + headers are
opt-in). Nothing renders differently unless an author opts in or a section is rebuilt.
