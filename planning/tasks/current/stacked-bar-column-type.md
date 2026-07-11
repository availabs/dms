# `stacked_bar` columnType — segmented distribution bar (+ count legend)

**Status: BUILT + LIVE-VERIFIED (2026-07-08) — pending transportNY core sync**
**Origin:** control-room overview liveness (see
`planning/transportny/tasks/current/cr-overview-live-cards.md` in the workspace root hub). The
overview's stage-distribution and tickets open/done bars are baked lexical spans (inline-block
width:% text runs) because no primitive could render a multi-segment proportional bar. This adds
the missing rung-3 columnType so those bars can be live data.

## Objective

A single-track, multi-segment proportional bar with an optional counts legend:

```
[██████████▓▓▓▓░░░░]
3 proposed · 0 design · 1 impl · 2 qa · 9 dev · 0 client
```

Live wherever the query is live. No new fetch machinery: **one row supplies every segment via
sibling columns** — the established `data_bar` convention (`barMaxColumn`/`barColorColumn` read
`row`), pointed at aggregate calculated columns (`count(*) filter (where …)`, `fn:"exempt"`,
`selectOnly:true`) like the tickets-page resolution card already does.

## Design

New file `src/ui/columnTypes/stacked_bar.jsx` (View + Edit=View), registered as `'stacked_bar'`
in `src/ui/columnTypes/index.jsx`. Modeled on `dataBar.jsx` (theme via
`getComponentTheme(theme,'stackedBar')` + inline default fallback; comma-stripping `num()`).

Column attributes:

| attr | meaning |
|---|---|
| `segments` | `[{ col, label?, color? }]` — `col` = sibling column (its `normalName`) holding the count; `label` = legend text (defaults to `col`); `color` = `#hex`/`rgb…`/`hsl…` rendered inline, else a theme `fills` key. Array order = bar left→right = legend order. |
| `showLegend` | default `true`; `false` → bar only |
| `emptyText` | when **all** segments are 0: bar renders as bare track and the legend line shows this text instead of all-zero counts (e.g. `"no tickets yet"`) |

Rendering: track div (flex, `h-2 rounded bg-slate-200 overflow-hidden`), one child per **non-zero**
segment at `width: pct%` with `title="label: n (pct%)"`; legend = one text line
`"n label · n label · …"` including zeros. Reads segment values ONLY from `row` — its own cell
value is unused (make the host column any of the seg calcs, or a `count(*)` total).

Theme key `stackedBar`: `{ wrapper, track, segment, legend, empty, fills }` — same shape family
as `dataBar`. Site override added to `transportnyv2` (legend matches the theme's metaXS voice).

## Why not grouped rows / a new fn

- Card forces `display:grid` inline on both the cards- and cells-wrappers, so composing one bar
  from N grouped records can't get proportional widths (grid tracks are config-static).
- `fn:'list'` is `array_agg(DISTINCT …)` — dedupes, can't tally. A `list_all` fn would work but
  adds query surface for no benefit over sibling `count(*) filter` calcs, which are already the
  proven control-room idiom.

## Files

- Create: `src/dms/packages/dms/src/ui/columnTypes/stacked_bar.jsx`
- Modify: `src/dms/packages/dms/src/ui/columnTypes/index.jsx` (import + register)
- Modify: `src/themes/transportny/themev2.js` (`stackedBar` theme override)
- Docs: `src/dms/skills/card-layout.md` (new columnType entry)

## BC / sync

Purely additive (new registry key; no existing component touched). Joins the pending
**transportNY core-sync batch** (Card.jsx fixes, flow_step, Input activeStyle, dataWrapper
re-sync, CLI section-create file-input) — sync `stacked_bar.jsx` + `index.jsx` + themev2 together.

## Testing (verified 2026-07-08 on /sitemgmt/edit/overview, qa_assess 0 findings)

- [x] Overview pattern cards: stage bar proportions match the pages table counts per surface
      (TSMO 1 QA / 9 Dev of 10; FA 3/2/2 of 7; NPMRDS 4/1 of 5 — legends sum to page counts)
- [x] Tickets bar: open/done split matches ticket rows (2/3, 1/3, 0/1 done/open — totals match
      the header's 7 open / 3 done). NOTE: no zero-ticket surface exists right now, so
      `emptyText` ("no tickets yet") is code-reviewed but not yet observed live.
- [x] Zero-count segments: omitted from the bar, present in the legend as `0 label`
      ("0 design · 0 impl" render in every legend)
- [x] Values arrive as `::text` counts → tally fine (num() strips commas)
- [x] Edit mode renders identically (screenshots ARE edit mode); no DOM-prop leaks (segments/
      showLegend/emptyText consumed as named props, never spread onto DOM)
- [x] Both viewports clean (desktop 1480 + mobile 390, no overflow findings)

## Row-key gotcha (documented in card-layout.md)

`segments[].col` must match the sibling's ROW key: with `normalName` set explicitly on the seg
calcs (do this), it's the alias; without it, rows key by the full SQL `name` (the existing
`barMaxColumn` warning). The overview build sets `normalName` on every calc.
