# Table design-parity enrichments: themeable open-out expander + icon link columns

## Status: DONE 2026-08-27 (two additive enrichments, BC)

Companion to `tablestyle-pagination-parity.md` — same pass (matching the MitigateNY
Actions Dashboard "Action inventory" table to its mockup), same BC discipline.

## 1. Themeable open-out expander icon (`TableCell.jsx`)

The open-out caret was a hardcoded `InfoCircle` at 18px. Designs want an
expand affordance that reads as such (chevron-right closed / chevron-down open).

New **table-style theme keys**, all defaulting to the historical behavior:

| key | default | meaning |
|---|---|---|
| `openOutIcon` | `'InfoCircle'` | icon when the row is collapsed |
| `openOutIconOpen` | falls back to `openOutIcon` | icon when the row is expanded |
| `openOutIconSize` | `18` | width/height passed to `Icon` |

`TableCell` now also destructures the `showOpenOut` prop (TableRow always passed
it; it was ignored) to pick the open-state icon and title.

## 2. `linkIcon` on isLink columns (`TableCell.jsx` LinkComp + spreadsheet config)

An `isLink` column may set **`linkIcon: '<registered icon name>'`** — the link
body renders that icon instead of `linkText || value` (an icon-only action
column, e.g. a trailing 48px chevron opening the record). `linkText` then serves
as the icon's hover title, keeping the link accessible. Surfaced in the
Spreadsheet column controls as "Link Icon" (shown when Is Link is on).

Styling comes through the existing per-column `valueFontStyle` mechanism — e.g.
the mny `mny-inventory` style defines `cellActionIcon:
"justify-center text-[#6D96AE] hover:text-[#2D3E4C] [&_svg]:size-4"` (CSS wins
over svg width/height attributes, so `[&_svg]:size-4` sizes any registered icon).

## 3. Themeable base row class → whole-row hover (`TableRow.jsx` + `index.jsx`)

New table-style key **`row`**: an optional base class applied to every data row
(absent in existing themes → no change). Motivating pattern: `row: 'group/row'`
makes the row a named Tailwind group so the cell bg keys can tint the WHOLE row
on hover (`cellBg: "bg-white group-hover/row:bg-…"`) instead of per-cell
`hover:` — the mockup's `<tr>`-hover behavior.

⚠ Gotcha: TableRow receives a **curated `rowTheme` subset** built in
`table/index.jsx` (not the full theme) — a new row-level theme key must be added
to that pick-list or it silently never arrives (the `row` key is now in it).

## Motivating use
mny `table.styles[].name='mny-inventory'` (Actions Dashboard): dedicated 40px
expander gutter (an empty calculated first column — the caret renders in the
first visible column), ChevronRight/ChevronDown expander at 16px, and the
design's trailing icon action column (`action_id as action_link`, `linkIcon:
'ChevronRight'`). Registered in the mny design-system components page.

## Gotcha recorded
A named table style's fixed column `size`s can exceed the section width — the
grid then overflows (scrolls) and `stretch: true` columns sit at their minimum.
The Actions Dashboard band needed the section group's `full_width: 'show'`
(sectionArray 'fullwidth' layout) because the 'centered' layout caps content at
1020px, narrower than the design's ~1300 grid.
