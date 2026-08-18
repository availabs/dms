# Card: place a cell's CONTENT inside a stretched cell

**Status:** ✅ DONE 2026-08-14 — signed off by Alex, implemented, measured, live on npmrds_sub/home (draft).
**Created:** 2026-08-14 · **Kind:** opt-in layout knob (BC, additive)
**Found by:** [`card-cell-row-slack-absorption.md`](../completed/card-cell-row-slack-absorption.md) Phase 2 and
[`card-link-cell-line-height.md`](../completed/card-link-cell-line-height.md), which each surfaced one half of it.

## Objective

Let an author say "this cell fills its row **and** its content sits centred in it". Before this, a
cell could do one or the other, never both, and the two live symptoms below were the same missing knob.

## The gap

A Card cell is a grid item whose vertical behaviour is `align-self` (`cellVAlign` per column,
`cellsVAlign` per section):

- **`stretch` (default)** — the cell fills its row, so `cellBorderBottom` draws on the row's real
  bottom edge and per-row rules form one continuous line. But the cell's own chrome is
  `flex flex-col` with `justify-content: normal`, so the CONTENT is pinned to the top.
- **`center`** — the content is centred, but `align-self: center` **shrink-wraps the cell**, so its
  `cellBorderBottom` floats at the cell's own bottom and the row's rules break into stubs at
  different heights. Already documented as a trap in `skills/card-layout.md`.

CSS has the answer and Card just didn't expose it: leave `align-self: stretch` and set the flex
property that means *vertical* on the cell wrapper. The cell still fills the row; only its content moves.

## Shape (signed off 2026-08-14)

A **separate key**, not a new value on `cellVAlign`:

| Key | Level | Values |
|---|---|---|
| `attr.cellContentVAlign` | one column | `top` \| `center` \| `bottom` |
| `display.cellsContentVAlign` | all cells in the section | same |

Rationale (Alex): "where the cell sits in its row" and "where the content sits in the cell" are
genuinely different axes; a separate key lets an author set **both**, where a fused `'center-fill'`
value would foreclose that. All three values ship together — they are the same two lines
(`flex-start` / `center` / `flex-end`).

## Mechanism — and the one deviation from the filed sketch

The resolver emits **no `align-self`** (so the grid default `stretch` stands) plus the flex property
that means *vertical* for the cell's own direction:

- cell is `flex-col` → `justifyContent`
- cell is `flex-row` → `alignItems`

**Design note — the direction is NOT `isRowLayout`.** The filed sketch said "Card.jsx already knows
which via `isRowLayout`, so the resolver needs it passed in". Measured on the live page, that is
wrong for the most common case. `isRowLayout` is `!headerValueLayout || headerValueLayout === 'row'`
— it treats **unset as row** for the header/value *width* split. But an unset `headerValueLayout`
renders in whatever direction the theme's `headerValueWrapper` bakes, and transportnyv2's is
`flex flex-col w-full` (tessera's too), while the dms default / avail / wcdb / mny wrappers are a bare
`flex` (⇒ row). § 01 — the acceptance case — is unset ⇒ `isRowLayout: true` ⇒ would have emitted
`align-items`, which on a flex-col cell is the **wrong axis**, and not inertly so
(`scratchpad/npmrdsv5-dev2/npmrds_home/valign/axis_1280.txt`, cell "LOTTR" @1280):

| case | above | below | content left | content width |
|---|---|---|---|---|
| col cell, no knob | 15 | 50.5 | 16 | 42 |
| col + `justify-content:center` | **32.2** | **33.3** | 16 | 42 |
| col + `align-items:center` | 15 | 50.5 | **22.5** | **29** ← wrong axis: no vertical move, and it shrink-wraps horizontally |
| row cell (forced) + `align-items:center` | **32.2** | **33.3** | 16 | 29 |
| row cell + `justify-content:center` | 15 | 16 | 22.5 | 29 ← wrong axis |

So the direction is resolved by a new pure resolver, `resolveCellFlexRow({ headerValueLayout,
headerValueWrapper })`: an explicit `headerValueLayout` names the direction; unset falls back to
whether the theme's own wrapper class declares `flex-col` (`flex-col-reverse` and `!` importance
count, a variant-prefixed `md:flex-col` deliberately does not). No theme file changes, works for
every existing theme.

## Result on the two symptoms (npmrds_sub/home 2211341, § 01, `/edit/home`)

**1 · Content top-anchored once a row grows.** At **1280** a measure row is 81.7px holding 16.3px of text:

| | above | below |
|---|---|---|
| before | 15 | 47.4 |
| after (`cellsContentVAlign:'center'`) | **30.7** | **31.7** |

At **1480** (row 57.4px): 15 / 23.0 → **18.5 / 19.5**. At **390** (row 50.4px, no slack to absorb) the
description does not move at all (15 / 16 → 15 / 16) — the knob only spends space that exists. The
header strip is untouched at 60.5 / 49 / 60.5px — it is its own `max-content` row, outside the
stretch, and its own content alignment is unchanged (12 above / 13 below at every width).

**2 · Parts of one row no longer share a baseline.** Line-box midline of each part, measured against
the description (the tallest token) at 1280, over all 8 rows:

| | name | desc | unit |
|---|---|---|---|
| the two hand-computed padding bumps (+1.5 / +3), no knob | −0.1 | 0 | 0.0 … −0.9 |
| **bumps removed**, no knob (the defect) | **−1.6** | 0 | **−3.0** |
| bumps removed **+ knob** | **0.0** | 0 | **0.0** |

Same at 1480 and 390 (−1.6 / −3.0 reverted vs 0.0 / 0.0 shipped, every row).

Both bumps are deleted from `measureCells()`. The knob is exact and token-agnostic where the bumps
were hand-tuned per token (and one row already read −0.9 against its neighbours).

**Rules stay continuous** — the whole point of not using `align-self`. Distinct bottom-edge `y` among
cells painting a rule, § 01 at 1280:

| | rule groups |
|---|---|
| before | 5 (n = 2, 6, 6, 6, 5) |
| after | **5 (n = 2, 6, 6, 6, 5)** — identical |
| `align-self: center` (the trap, measured for the record) | **13** groups of 2; cells collapse 81.7 → 47.3 / 50.4 / 44.5 |

`ruleSpread` (max−min cell bottom within a row) is **0 on all 8 rows** before and after; it is 2.9–3.9
with `align-self: center`.

## BC

- **Unit:** `cardLayout.test.js` **43 → 55 passing**. Unset emits neither `justifyContent` nor
  `alignItems` for five argument shapes, and `resolveCellStyle({attr, cellFlexRow})` deep-equals
  `resolveCellStyle({attr})` — the new parameter cannot change an existing card.
- **Live:** the core change was measured in and out on the real page with the page data untouched
  (pre-change copies of both files kept at `scratchpad/…/valign/Card.{layout.js,jsx}.BEFORE`):
  **all 11 cells grids on /edit/home are byte-identical** at 1480 and 1280
  (`cards_BEFORECORE_*.json` vs `cards_AFTERCORE_*.json`, `diff` clean).
- **After the rebuild**, `cards_AFTERCORE_*` vs `cards_AFTERBUILD_*` is also byte-identical at both
  widths — the content moved *inside* the rows and no box changed size, which is the § 8.1 claim
  (see below) proven at the grid level.

## Parity gates (§ 8.1 / § 8.2 / § 8.3 of `creating-pages-from-a-design-pattern.md`), § 01 after

| | 1480 | 1280 | 390 |
|---|---|---|---|
| band siblings (card box) | 281.7 / **281.7** (equal) | 390.5 / **390.5** (equal) | 289.3 / 265 |
| § 01 cells grid | 279.7 | 388.5 | 263 |
| row template | `49 · 57.4 ×3 · 58.4` | `60.5 · 81.7 ×3 · 82.8` | `60.5 · 50.4 ×3 · 51.4` |
| slack below last row | 0 | 0 | 0 |
| tracks | `66 · 126.1 · 66.3 · 66 · 126.1 · 58.2` | `66 · 59.4 · 66.3 · …` | `66 · 13.7 · 66.3 · …` |
| horizontal overflow | 0 | 0 | 0 |
| cells | 26 | 26 | 26 |

Every one of those numbers is **identical to the pre-change page** (the row template strings match
`A_base_1280.json` character-for-character, and the cards probe diffs are empty): **the band height
did not move**, which is what a content-inside-the-cell knob must guarantee. § 8.3: still ONE Card,
23 sections, same cells grid — no structural change.

## Files changed

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/Card.layout.js` | `vAlignContent` map + `resolveCellFlexRow` (new pure resolver) + `resolveCellStyle` emits `justifyContent`/`alignItems` |
| `src/dms/packages/dms/src/ui/components/Card.jsx` | resolves `cellFlexRow` from `headerValueLayout` + `theme.headerValueWrapper`, passes it to `resolveCellStyle` |
| `…/ComponentRegistry/Card.config.jsx` | per-column **Content V-Align** select + section-level **Content V-Align** under Cells Grid |
| `src/dms/packages/dms/tests/cardLayout.test.js` | 12 new tests (BC/unset, both directions, all three values, precedence, composition with `cellVAlign`, direction resolver, + a source-scan guard that `resolveCellStyle` still receives `display` **whole**) |
| `src/dms/skills/card-layout.md` | the "fill OR centre, not both" trap replaced by the recipe |
| `build_npmrds_home.mjs` | § 01 gains `cellsContentVAlign: 'center'`; the two padding bumps deleted from `measureCells()` |

## Testing checklist

- [x] Unit: 55/55 `cardLayout.test.js` (was 43).
- [x] Runtime A/B in the live DOM **before** editing core (`probe_s01.mjs` modes `base` / `nobump` /
      `fix` / `alignself`, `probe_axis.mjs`) — the live result after the rebuild reproduces the `fix`
      prediction number-for-number.
- [x] Live at **1480**, **1280** and a **390** sanity pass; screenshots
      `valign/s01_{revert,after}_{1280,1480}.png`, `s01_after_390.png`.
- [x] BC live pass — 11/11 cells grids byte-identical with the knob unset.
- [x] Parity gates re-run on § 01; band height unmoved.
- [x] Builder re-run printed `wiped 23 draft sections (23 deleted, 0 orphaned)`; page has **23**
      draft sections.
- [x] **Nothing published** — page 2211341's 28 published ids (2211448–2211475) identical before and
      after (`valign/ids_BEFORE.json` vs `ids_AFTER.json`).

## Notes / follow-ups

- The knob is inert on `fullBleed` cells (their wrapper is not a flex box) — by design; those column
  types own their own surface.
- If a theme sets `headerValueLayout: 'row'` but ships no `itemFlexRow`, the DOM stays column while
  this resolver says row. That mismatch is pre-existing (it already breaks the header/value width
  split) and is a theme bug — documented in `card-layout.md`.
