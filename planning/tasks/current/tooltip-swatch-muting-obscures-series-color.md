# Tooltip swatch muting makes a series unidentifiable

**Initiatives:** [tny_npmrds_reports_1_0](../../../../../planning/initiatives/tny_npmrds_reports_1_0.md) (primary), [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** next (was: "NOT STARTED — logged 2026-09-14, deferred by owner") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Status:** NOT STARTED — logged 2026-09-14, deferred by owner from
[`avlgraph-legend-and-padding-theming.md`](./avlgraph-legend-and-padding-theming.md) item 3 so that
pass could close with a tight change set. **Pre-existing defect, not a regression from that work.**

## Objective

A tooltip's colour swatch exists to say WHICH series a row is. In three of the four avl-graph
tooltips it is muted so hard that a dark series reads as light grey, so the swatch stops doing its
one job — and in LineGraph the same series changes appearance as the pointer moves along x.

Reported live 2026-09-14 on
`http://www.localhost:5173/npmrds/reports/snapshot?routes=2207390&asOf=2026-08-21`: a 2026-only
series with a dark brown line shows a dark brown swatch where that series is the higher line, and a
washed-out grey one where it is the lower line. Confirmed to affect the other series too — it is
just least visible on lighter colours.

## Root cause

Two independent problems that happen to produce the same symptom.

**1. The muted state is far too strong.** Grid is the only one that gets it right:

| graph | muted swatch | file |
|---|---|---|
| Line | `background: ${color}${isMax ? "ff" : "33"}` — `0x33` = **20% alpha** | `LineGraph.jsx` (primary rows ~:89, secondary rows ~:136) |
| Bar / Pie | `opacity: data.key === key ? 1 : 0.2` | `components/HoverComps.jsx`, `SeriesRowsHoverComp` |
| Grid | `opacity: data.index === i ? 1 : 0.75` | `GridGraph.jsx` |

**2. LineGraph keys it on VALUE RANK, not the pointer.** `isMax` is computed in
`LineGraph.jsx:505-513`:

```js
const { i } = col.reduce((a, c, i) => {
  c.isMax = false;
  return c.y > a.y ? { y: c.y, i } : a;   // the highest y in this x-slice
}, { y: 0, i: -1 });
if (i > -1) col[i].isMax = true;
```

So `isMax` means "this series has the highest value at this x". Bar/Pie/Grid key their muting on
what the pointer is over; Line keys it on which line happens to be on top. That is why one series
visibly changes colour as you sweep along the x-axis without ever leaving that series.

`isMax` also drives the row's highlight border (`LineGraph.jsx:74, 80, 122, 127`, now via the
`tooltipRowActive` token), so a line tooltip's "selected" marker actually means "highest value",
not "the row you are on". Arguably a line tooltip has no hovered ROW at all — the pointer picks an
x position, not a series — so the honest options are a subtler emphasis or none.

## Proposed fix

**The swatch identifies; the row border selects.** Drop the muting from the swatch in all four
types and let `tooltipRowActive` carry selection, which every graph type now draws since
`avlgraph-legend-and-padding-theming.md` item 3. This REMOVES a mechanism rather than adding a
token, and makes Bar/Pie/Line agree with Grid.

Considered and rejected at logging time: a 7th theme token for the muted state. It preserves the
"unset ⇒ byte-identical" contract, but it is a setting no brand would plausibly want turned on.

Open sub-question: whether LineGraph should keep an `isMax` row highlight at all once the swatch
is fixed.

## Files

- `packages/dms/src/ui/components/graph_new/components/avl-graph/components/HoverComps.jsx` (Bar/Pie)
- `packages/dms/src/ui/components/graph_new/components/avl-graph/LineGraph.jsx` (both row passes)
- `packages/dms/src/ui/components/graph_new/components/avl-graph/GridGraph.jsx`

## Testing checklist

- [ ] `packages/dms/tests/hoverCompLegacyMarkup.test.js` goldens re-captured **deliberately** —
      this changes tooltips on every site (~7,415 MitigateNY graphs render a legend). Use
      `fixtures/capture-hoverCompLegacy.mjs` and verify the per-case diff is ONLY the swatch, the
      way the GridGraph highlight change was verified.
- [ ] A forward test that a series' swatch colour does not depend on its rank — hover two x
      positions where the same series is higher and lower, assert the swatch is identical.
- [ ] `npx vitest run packages/dms/tests` green.
- [ ] `node scripts/npmrds-reports/probe_corpus.mjs`.
- [ ] Live: the URL above. **LineGraph hover automates fine; GridGraph does not** (sub-pixel cells
      — see `skills/traversing-report-pages.md`), so check Grid by eye.
