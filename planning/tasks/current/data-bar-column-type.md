# `data_bar` column type — in-cell horizontal bar

## Objective

A reusable client column type that renders a horizontal **data bar** in a
Spreadsheet/Card cell (bar width ∝ the cell value), so a numeric column reads as
a mini bar chart with real table labels + values. Motivating consumer: the tsmo
`congestion_v2` "Delay by NYSDOT region" section (2175690) — convert it from an
avlGraph BarGraph to a Spreadsheet table that matches the design mockup more
closely (nicer region labels + totals than a cramped bar-graph axis).

Author-empowerment: this is the "smallest enrichment to the primitives" — a new
column type, not a custom section — so every future page can use it.

## Design (decided with Alex: match the mockup fully, but themeable)

Mockup row = **label** (`R11 · NYC`) · **bar** (width ∝ value, scaled to the
column max; two-tone: top-N brand `#1F3F8F`, rest `#37576B`) · **value** (`219.5`).

`data_bar` `ViewComp` (mirrors `targetBar`): props are `{ value, row,
...columnConfig }`. Cell value = the bar metric. Config:
- `barMin` (default 0)
- `barMax` (static) **or** `barMaxColumn` (sibling row field for the scale max —
  e.g. a `max(sum(x)) over ()` window column → auto-scales, no hardcoding)
- `barColorKey` (static theme.fills key, default `primary`) **or**
  `barColorColumn` (sibling field carrying the key per row — e.g. a CASE column
  emitting `primary`/`muted` for a top-N highlight)

**Themeable**: all styling via `getComponentTheme(themeFromContext, 'dataBar')`
+ an inline default. `theme.dataBar.fills` is a `{ key → bg-class }` map, so the
two-tone colours live in the site theme (transportnyv2 sets the brand hexes),
NOT hardcoded in the component. The colour KEY is data-driven (sibling column);
what each key looks like is theme-driven.

## Files
- `packages/dms/src/ui/columnTypes/dataBar.jsx` (new — component only, per HMR rules)
- `packages/dms/src/ui/columnTypes/index.jsx` (register `data_bar`)
- `src/themes/transportny/themev2.js` (add `dataBar` brand override — in the
  dms-template repo, not the submodule)

## Section reconfig (2175690, congestion_v2)
avlGraph → Spreadsheet. Columns: region_name (group, selectOnly) · region_label
(calc display `R{n} · {name}`) · delay_val (sum, the number) · delay_bar (same
sum, type `data_bar`) · col_max (`max(sum(total)) over ()`, selectOnly) · bar_tone
(`CASE WHEN row_number() over (order by sum(total) desc) <= 3 THEN 'primary' ELSE
'muted' END`, selectOnly). GROUP BY region_name, order delay desc. Keeps the same
year+region page filters.

## Testing
- [ ] columnType renders a scaled, themed bar in the section.
- [ ] two-tone (top-3 brand) + data-driven scale (col_max) verified vs mockup.
- [ ] BC: additive registry entry; no existing column type touched.
