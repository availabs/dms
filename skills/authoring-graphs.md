# Authoring graphs (avlGraph / graph2)

How to build and style chart sections in DMS, and how a brand themes every graph at
once. Covers the **`avlGraph`** ("AVL Graph") section — the forward component — its
data model, the **theme-vs-settings** split, and the recurring patterns (reference
lines via a joined series, header + hero-stat).

> **Audience:** an engineer/AI building a graph section or improving the avlGraph
> primitive. Read [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md) (data
> binding + joins) and [`creating-interactive-pages.md`](./creating-interactive-pages.md)
> (page variables) first.
>
> **Two graph components exist:** the legacy **`graph`** (element-type `Graph`) and the
> newer **`avlGraph`** (element-type `AVL Graph`, in `ui/components/graph_new/`). New
> work targets `avlGraph`. The registry is keyed by element-type name, so a section's
> `element-type` must be the exact string `"AVL Graph"` (set it in both
> `data.element["element-type"]` and `data["element-type"]`). The MAP-21 §02 trends now
> run on `avlGraph`.

## Data model (avlGraph)
A graph is a `dataWrapper` section like a Card/Spreadsheet. Columns declare their role
via **`target`** (not the Card's `xAxis:true` flags):
- `target: "xAxis"` — the index/category axis (e.g. `year_record`), usually `group:true`.
- `target: "yAxis"` — a data **series**; **multiple yAxis columns = multiple series.**
- `target: "categorize"` — split one value column into series by a category column.

`display.graphType` picks the chart (`LineGraph` | `BarGraph` | `PieGraph` | …).

> **✅ Calc-column series now bind correctly (was the trend-rebuild blocker).** Two fixes,
> both in `graph_new/components/`:
> 1. The wrapper reads each series/axis value by **`normalName || name`** (matching how the
>    dataWrapper keys rows — getData.js:413, and Card.jsx). A calc column's `name` is the
>    full SQL; if you set a `normalName` (the alias) the chart and getData still agree.
> 2. A calc column usually carries **`fn:"exempt"`** ("already aggregated server-side"). The
>    agg-func map (`components/utils.js`) now handles `exempt` (and unknown fns) by pulling
>    the first non-empty accessed value per x. Previously it returned the *group array* and
>    the line came back as `NaN`/empty — **this was the actual cause of the blank avlGraph
>    line**, not the key. Keep `name` = full SQL so the UDA query is unchanged.

## Theme vs settings (brand defaults vs per-section overrides)
Chart visuals come from two places — keep them split:
- **`theme.avlGraph.chartDefaults`** = **brand defaults** (colors, margins, axes, …),
  so every graph looks on-brand without per-section config. (Added this session; see
  `graph_new/theme.js` `ChartDefaults` and the transportny `chartDefaults` in
  `themev2.js`.)
- **section `display`** = **per-section overrides** (an author tweaks one chart).

`graph_new/index.jsx` merges them with `mergeChartDefaults(theme.chartDefaults, display)`
— **display wins**; a section with a *sparse* `display` inherits the brand look. BC: a
section whose `display` already carries those keys is unchanged. **Author-accessibility:**
both layers are author-editable (theme via the theme editor / `avlGraphSettings`;
display via the section controls).

**Now theme/section-tokenized (LineGraph):** `strokeWidth`, `area` + `areaOpacity` (filled
band under the line), `interpolation` (chart default), and axis `gridLineOpacity` /
`axisColor` — all flow theme `chartDefaults` → section `display` → the d3 renderer.
**Per-series (a yAxis column):** `interpolation`, `area`, `color`, `dashArray` (see the
per-column controls in `ComponentRegistry/graph_new/config.jsx`).

### Axis typography (per axis, theme- or section-set)
Both `xAxis` and `yAxis` take **CSS-valued** font keys, applied inline by the axis
renderers (`AxisLeft/Bottom/Right.jsx`) via `.style(...)`:

- **Ticks:** `tickFontSize` (e.g. `"11px"`), `tickFontFamily` (a real CSS stack, *not* a
  Tailwind class — e.g. `"ui-monospace, SFMono-Regular, Menlo, monospace"`),
  `tickFontWeight` (e.g. `"400"`), `tickColor` (e.g. `"#64748b"` or `"currentColor"`).
- **Axis label** (the rotated title): `labelFontSize`, `labelFontFamily`, `labelFontWeight`,
  `labelColor`.

They flow the same path (`chartDefaults` → `display` → renderer; **display wins**). The
generic `graph_new/theme.js` `ChartDefaults` sets explicit defaults that reproduce the
historical look (tick `0.75rem` / inherited family / normal weight / `currentColor`; label
`1rem` bold); the transportny `chartDefaults` overrides ticks to the **mono numeric ladder**
(11px slate-500 monospace) so every report graph's axis is on-brand without per-section
config. A section author overrides any key in the **X/Y-Axis** control group.
**Two gotchas:** (1) `tickFontFamily` is a CSS font string, not `font-mono`; (2) the
*number format* (`yAxis.format`, e.g. `fnum` vs `fnum2`) is a separate concern from the
font — decimals/abbreviation live in `utils.js ValueFormats`.

## Pattern: a target/reference line is just a styled second series ✅
**Don't build a bespoke "reference line" feature** — it's a second `yAxis` series, styled.
Add a target column (a constant `75.0 as lottr_interstate_target`, or a stepped
`CASE WHEN year_record >= <P2> THEN <p2> ELSE <p1> END as target` to ride period changes),
set `target: "yAxis"`, then on that column set:
- **`interpolation: "step"`** — draws the held/stepped target line (the data series stays
  `catmullrom`/smooth),
- **`color: "#EAAD43"`** — amber (overrides the palette),
- **`dashArray: "6 4"`** — dashed,
- **`area: false`** — no fill under the target.

All four are per-column author controls (`ComponentRegistry/graph_new/config.jsx`). Worked
example: Interstate chart 2173963 carries the dashed amber 75% target this way. If the
target lives in a real table, **join** it (`using-a-datawrapper-card.md`) and point the
second series at the joined column instead of a constant. **Confirm target values/source
with the user before binding — don't fabricate regulatory targets.**

## Pattern: BarGraph — rotation, grouped bars, hidden axes, bar spacing ✅

All of these are **section `display` keys** (author-editable in the graph controls; theme
`chartDefaults` can set brand defaults the same way). Worked example: the Freight Atlas
Home mode-share (2175321) + growth (2175322) charts, matched to design panels that use
horizontal bars with no axes.

- **`groupMode: "grouped" | "stacked"`** — ⚠ default is **`stacked`**: two `yAxis` series
  silently stack (sums on one bar) unless you set `"grouped"` for side-by-side bars.
- **`orientation: "vertical" | "horizontal"`** — rotates the chart (config control
  "Orientation", BarGraph settings). **Axis configs swap with it**: in `horizontal`, the
  section's `xAxis` config (the category axis) renders as the **left** axis and `yAxis`
  (values) renders as the **bottom**. Two gotchas:
  1. the first data row lands at the **bottom** — to put the biggest category on top,
     `sort: "asc"` on the measure column (not desc);
  2. long category labels clip — give them room with `margin: { left: 64 }`.
- **Hiding axes/ticks/gridlines** (design panels often want none):
  `xAxis: { show: false }` / `yAxis: { show: false }` kill the whole axis;
  `yAxis.showGridLines: false` (⚠ y default is **true**; x default false) kills the grid.
  To keep **category labels but no axis line**, leave `show: true` and set
  `axisColor: "transparent"` (+ `tickColor` for the label color).
- **Bar spacing** — `paddingInner: 0..1` (d3 band-scale inner padding; ~`0.3` reads like
  the design-system bars; default 0 = bars touch). `paddingOuter` exists too (edge gap;
  no config control yet, but the display key works).
- **Series colors** — `colors: { type: "palette", value: ["#1F3F8F", "#E5A646"] }` maps
  palette entries to series in column order (per-column `color` is honored by LineGraph
  series, not BarGraph bars — use the palette for bars).
- **Legend** — `legend: { show: true, position: "right" }`. ⚠ BarGraph only renders the
  legend at `position: "left" | "right"` — `{ show: true }` with no position renders
  **nothing**. Series-mode legend labels show the column's `customName`/`display_name`
  (the wrapper translates the alias keys — raw `tons_share`-style aliases used to leak
  through; fixed in `components/BarGraph.jsx`). Categorize-mode keys are data values and
  pass through as-is.
- **Height** — `height` (px) is a **graph display setting, not a layout concern**: the
  section/card stretches with the band, the plot does not. Two graphs side by side must
  set the **same `height`** or their baselines misalign.
- **Built-in padding** — the chart's outer div takes a `padding` class token from the
  **avlGraph theme** (`theme.js` styles + brand overrides, e.g. transportny's `p-4`), so
  plots don't sit flush against the section edge. Brand-level, not per-section.

## Pattern: chart header + hero stat
The design's trend cards carry a header (kicker + title) and a right-aligned **hero
stat** (the current-year value + a meets/below pill). Build it as a small **`Card`**
placed above the graph in the same band — reuse the **`status_pill`** column type for
the pill and a big value cell for the number. (Not a chart feature — it's a sibling
section, so it stays author-editable.)

## Worked example
MAP-21 §02 — three trend charts (Interstate / Non-Interstate / Truck TTTR) over
2016–2025, ignoring the Year selector (no `year_record` leaf), GROUP BY `year_record`
(`year_record` is the `xAxis` column with `group:true`; the metric is a `fn:"exempt"`
calc `yAxis` column with `area:true`). Sections 2173963/64/65 now run on **`avlGraph`** with
the brand emerald area+line; 2173963 also carries the dashed amber 75% target series.

## Source-of-truth files
- `ui/components/graph_new/index.jsx` — section entry; `mergeChartDefaults`; theme read.
- `ui/components/graph_new/GraphComponent.jsx` — passes `graphFormat` to the chart.
- `ui/components/graph_new/theme.js` — `avlGraphTheme` + `ChartDefaults` (brand tokens).
- `ui/components/graph_new/components/avl-graph/LineGraph.jsx` — the d3 line renderer
  (hardcoded `curveCatmullRom` → the interpolation hook point).
- `.../ComponentRegistry/graph_new/config.jsx` — section controls (author settings).
- `planning/tasks/current/avlgraph-theme-integration.md` — the full A→D plan.
