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

## Testing — DONE (verified live on congestion_v2 2175690)
- [x] columnType renders a scaled, themed bar in the section.
- [x] two-tone (top-3 brand #1F3F8F / rest #37576B) + data-driven scale (col_max
      window) verified vs mockup — bars proportional, R11 full width.
- [x] reacts to the year filter (2025: R11 219.5 → 2024: R11 201.7, rescales).
- [x] selectOnly columns (col_max, bar_tone) fetched but not rendered — required
      adding `selectOnly` support to the table render filter + spreadsheet visible
      sets (Card already honored it). BC (additive).
- [x] BC: additive registry entry; no existing column type touched.

## Follow-up — inline value + corridor WZ column (2026-06-17)
Enhanced `data_bar` with `barShowValue` + `barUnit` (renders the value inline
after the bar) and switched the track to `flex-1` so a value fits alongside (BC —
bar-only cells still fill the cell). Used it for the **corridor "WZ share of
non-rec"** column (2175692): converted the text `%` column to a `data_bar`
(barMax 100, inline `%`, two-tone via a `wz_tone` CASE column → theme fills
`warn` #E8843F < 50% / `alert` #D6453B ≥ 50%). Matches the mockup; corridor seed
cleared so it fetches live. transportnyv2 `dataBar.fills` gained `warn`/`alert`.

## Outcome
`data_bar` columnType shipped (dms submodule). transportnyv2 brand override lives
in `src/themes/transportny/themev2.js` (dms-template repo — uncommitted there
pending that repo's in-progress merge, same as the other themev2 work). Section
2175690 converted avlGraph → Spreadsheet; backup of the old graph config at
`scratchpad/npmrdsv5-dev2/backups/section_2175690.region_rank_graph.json`.
