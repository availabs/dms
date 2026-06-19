# `data_color_cell` column type — heat cell + seasonality grid as a Spreadsheet

## Objective

A reusable client column type that colours a cell's **background** by its value on
a palette scale — the heat-grid companion to `data_bar`. Use it to re-build the
tsmo `congestion_v2` seasonality grid (2175689) as a **Spreadsheet** (month ×
region heat) so it matches the design mockup (real row labels, month-letter
headers, a `delay` total column, within-row shading) better than the GridGraph.

## Design (from the mockup §03)

Grid = `label · [J F M A M J J A S O N D] · delay`. 5-stop amber palette
`#FEF3C7 · #FDE68A · #FBBF24 · #D97706 · #7C2D12`, **shaded within each region
row** (per-row domain), ordered by region total delay desc.

`data_color_cell` `ViewComp` (mirrors data_bar): `{ value, row, ...columnConfig }`.
- **Per-row domain** via `domainColumns` (array of sibling column names — the cell
  reads those row values, takes min/max, scales its own value within them). This
  is the "shade within each row" behaviour with NO extra SQL min/max columns.
- Fallbacks: `colorMin`/`colorMax` (static) or `colorMinColumn`/`colorMaxColumn`.
- `colors` palette override; default `theme.dataColorCell.palette` (themeable).
- `showValue` (default false — mockup cells are colour-only).
- Colour via d3 `scaleLinear` polylinear domain→palette (same as GridGraph).

## Section reconfig (2175689) — GridGraph → Spreadsheet

GROUP BY region_name. Columns: region_name (group, selectOnly) · region_label
(`R{n} · {name}`) · jan…dec (12 `data_color_cell`, each value = `sum(total)
FILTER (WHERE month=N)`, `domainColumns:[jan…dec]`, headers `J…D`) · delay_total
(`round(sum(total)/1e6,1)`, right, sort desc). Year filter kept.

## Files
- `packages/dms/src/ui/columnTypes/dataColorCell.jsx` (new)
- `packages/dms/src/ui/columnTypes/index.jsx` (register `data_color_cell`)
- `src/themes/transportny/themev2.js` (add `dataColorCell` amber palette)

## Testing — DONE (verified live on congestion_v2 2175689)
- [x] heat grid renders month × region (132 cells) with per-row amber shading vs
      mockup — the May–Jun + Sep–Oct peaks and Jan–Feb trough are visible.
- [x] reacts to year filter (smart fetch, seed cleared).
- [x] BC: additive registry entry; uses d3 scaleLinear (already a dep).

## Follow-up — tile spacing (2026-06-18)
The swatch was a single `w-full` div, so adjacent tiles touched horizontally
(the table cell's `cellInner` className is passed to the ViewComp but the
component ignores it). Split into an **outer transparent wrapper** (provides the
horizontal breathing room via `px`) + an **inner colour swatch** (`cell`, carries
the bg). Component default `wrapper: "... px-[3px]"`, `cell: "w-full h-full
rounded-[2px] ..."`; transportnyv2 override `wrapper: "... px-[2px]"` → a 4px gap
between adjacent month tiles (verified: 132 swatches, adjacentGapPx 4). Vertical
breathing room was already there (swatch `h-5` inside the `min-h-[26px]` heat
cell). BC — existing consumers get the same look plus the small inset.

## Follow-up — chrome-less heat table (2026-06-18)
Per design, the heat grid lost its own table chrome (the section compound card is
the only frame). themev2 `table.styles[].heat`:
- `headerCellContainerBg`: `bg-slate-50/60 … border-b border-zinc-950/10` →
  `bg-white text-slate-400` (white column-header row, no divider).
- added `tableContainer`: dropped the default's `rounded-[8px] border
  border-zinc-950/10 … shadow-sm` (kept `bg-white` + the overflow/scroll + max-h).
Scoped to the `heat` style only (seasonality 2175689); `report`-style tables keep
their bordered container + tinted headers.

## Outcome
`data_color_cell` shipped (dms submodule). transportnyv2 amber palette in
themev2.js (dms-template repo). Section 2175689 converted GridGraph → Spreadsheet;
backup at `scratchpad/npmrdsv5-dev2/backups/section_2175689.seasonality_gridgraph.json`.
Optional follow-up: the mockup's low→high legend strip below the grid (a static
swatch row) isn't added yet.
