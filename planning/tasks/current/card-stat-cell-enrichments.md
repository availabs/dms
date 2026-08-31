# Card stat-cell enrichments: `subValueCol` subline + per-cell `cellOutline`/`cellRadius`

## Status: DONE 2026-08-27 (three additive per-column knobs, BC)

## Objective
The MitigateNY Actions Dashboard status strip (design: label · 30px count ·
"N% of actions" subline inside a rounded, individually-bordered card per status —
one dashed) could not be expressed with Card primitives: cells had no subline,
no perimeter border (only the 4px `cellBorderColor` left accent + the global
`itemBorder` toggle), and no per-cell radius. Per the themes/CLAUDE.md principle
these are Card enrichments, not a custom component.

## Changes (all additive — absent keys → byte-identical render)

1. **`subValueCol` + `subValueFontStyle`** (`Card.jsx`): renders a SIBLING
   column's value as a subline inside the cell, after the value div. Lookup is
   `source[subValueCol]` — the sibling's ROW KEY (`normalName || name`), so an
   aliased calc column must set `normalName`. Styled solely by
   `theme[subValueFontStyle]` (+ justify class); null/empty → renders nothing.
2. **`cellOutline`** (`Card.layout.js`): full CSS border shorthand
   (`1px solid #E0EBF0`, `1px dashed #EAAD43`) — author-typed value, same
   affordance as `cellBgColor`'s gradient. Placed before `cellBorderColor` so
   the left accent still wins the left edge.
3. **`cellRadius`** (`Card.layout.js`): per-cell border radius (number → px).

Surfaced in `Card.config.jsx` column controls (Cell Outline, Cell Radius,
Sub Value Column, Sub Value Style). Documented in `skills/card-layout.md`
(per-cell overrides table + a full stat-card recipe with the gotchas:
`normalName` on aliased pct columns, comma-free expressions, `cellBorder:false`,
`cardsVerticalAlign:'top'`, dataCard `headerValueWrapper` p-2 counting toward
the design's padding).

## Motivating use
mny Actions Dashboard status strip (`statusStripED` in the page builder) +
mny dataCard role keys `statCardLabel`/`statCardLabelStrong`/`statCardSub`.
Measured 103px cards vs the mockup's 104px.
