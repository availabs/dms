# Card cells grid: absorbing a fill-card's leftover height

**Status:** PHASE 1 + PHASE 2 SHIPPED (2026-08-14) · **Created:** 2026-08-14 · **Kind:** opt-in layout fix (BC)
**Found by:** the NPMRDS Home § 01/§ 02 vertical-rhythm work
(`planning/transportny/tasks/current/npmrds-home-page-build.md`, Escalations).

## Objective

Give a Card an author-side way to stop a `height: 'fill'` card's leftover height from
pooling as one blank strip below the last row — the defect Alex reported on NPMRDS Home § 02:
*"the second card has white space at the bottom, maybe we need to have a setting for stretch
cells to fit inside the card?"*

Two distributions were wanted. **Phase 1 (shipped)** spreads the leftover equally across the
rows — "stretch the cells to fit inside the card". **Phase 2 (open)** is the mockups' `mt-auto`:
*one* row absorbs everything, the rest keep their authored rhythm.

---

## Phase 1 — SHIPPED 2026-08-14: `cellsVerticalAlign: 'stretch'` now means `align-content: stretch`

### The bug it fixes

The § 02 ready-made cards are `height: 'fill'` siblings, so their section boxes are always
equal (measured Δh = 0 at every width) and the cells grid **does** fill the card (grid h 441 =
parent h 441 at 1480). The rows simply summed to less than the grid, and
`align-content: start` — emitted inline by `resolveCellsGridStyle` — pooled the difference
**below the last row**, so the tinted footer strip stopped short of the card's bottom border.
Whichever card had less content showed the gap, and which one that is flips with the width.

### The mechanism

CSS Grid §12.9 *Stretch auto Tracks*: when the tracks' combined size is less than the
container and `align-content` is `normal`/`stretch`, the remaining free space is distributed
**equally among tracks whose max sizing function is `auto`**. That is literally "stretch the
cells to fit inside the card". It needs the grid to have a definite height, which a
`height: 'fill'` section already gives it (the cells grid is a stretched item of the cards
grid, which is `flex: 1 1 auto` in a flex-column parent).

### The diff (`ui/components/Card.layout.js` → `resolveCellsGridStyle`)

```diff
-        ...(stretchCells ? {} : { alignContent: 'start' }),
-        ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
-            stretchCells ? { gridAutoRows: 'minmax(max-content, 1fr)' } :
-            hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
+        alignContent: stretchCells ? 'stretch' : 'start',
+        ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
+            hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
```

Unset is **byte-identical**: `alignContent: 'start'` plus exactly the same `gridAutoRows`
branches. `Card.jsx` needed no change (it already forwards `cellsVerticalAlign`);
`Card.config.jsx`'s existing *Cells Grid → Vertical Align* control keeps its two values and
gained an accurate comment.

**BC was provable, not argued:** `cellsVerticalAlign` had **zero authored usages** in the
repo — a grep found only explanatory comments in `build_npmrds_home.mjs`. Nothing could
regress.

### Why the old implementation was wrong (the reusable CSS lesson)

`gridAutoRows: minmax(max-content, 1fr)` does not distribute slack, because a **flexible**
track is not stretched, it is *equalized*: the flex fraction resolves against the largest
track's base size, so every row is sized to the **tallest** row's max-content. Measured on
the same § 02 card that motivated the work: **395.8 → 751.3px** (ten rows all forced to
75.1px), and § 01's 49px header strip fattened to 56px **at a width where there was no slack
at all**. Distribution is `align-content`'s job; the track sizing function only says how big
rows *want* to be.

### Interaction rules (decided + documented)

| Combination | Outcome |
|---|---|
| `cellsRowHeight` + `stretch` | `cellsRowHeight` wins the row size. No auto-max track remains, so §12.9 has nothing to grow and `stretch` behaves as `start` (leftover stays at the bottom). |
| `hasRowSpan` + `stretch` | Composes. `minmax(0, auto)` has an `auto` max, so those rows take their equal share. (This is the § 02 case.) |
| `stretch`, no slack | Inert — byte-identical rendering. Safe to set on both siblings. |
| `stretch`, `auto`-height section | No-op: no definite height ⇒ no free space. That is a section-height problem, not a Card one. |

### Measurements (`/edit/home`, page 2211341 DRAFT, footer-to-card-bottom gap in px)

| viewport | `// behavioral` before → after | `// change over time` before → after | card h before/after |
|---|---|---|---|
| 1280 | 1 → 1 | 4 → 1 | 507 / 507 |
| 1366 | **24 → 1** | 1 → 1 | 465 / 465 |
| 1440 | **43 → 1** | 1 → 1 | 465 / 465 |
| 1480 | **21 → 1** | 1 → 1 | 443 / 443 |
| 1560 | **29 → 1** | 1 → 1 | 443 / 443 |
| 1600 | 1 → 1 | **20 → 1** | 415 / 415 |
| 1680 | 1 → 1 | **20 → 1** | 398 / 398 |
| 1760 · 1800 · 1920 · 2048 | 1 → 1 | 1 → 1 | 378 / 378 |

No card grew at any width. Other cards on the page are untouched (`align-content: start`,
identical row tracks): § 01 header strip 49px before and after, § 04 header strip 36px before
and after. Band heights unchanged at 1480: § 01 272.7 (mockup 264.5), § 02 443.0
(mockup 408.4), § 04 260.6 (mockup 258).

Raw data + screenshots: `scratchpad/npmrdsv5-dev2/npmrds_home/stretch/`
(`sweep_BEFORE.txt` / `sweep_AFTER.txt`, `sweep_cards_BEFORE.txt` / `sweep_cards_AFTER.txt`,
`exp_aligncontent.mjs` — the runtime A/B that measured `start` vs `stretch` vs the old
`1fr` on every card without touching core — and `s02_{BEFORE,AFTER}_{1440,1600,1680}.png`).

### Applied to

`build_npmrds_home.mjs` → `readyMadeCard()`, i.e. **both** § 02 ready-made Cards. Nothing
else on the page: measured, not guessed.

- **§ 01 measures panel — deliberately NOT set.** It has no slack from 1480 up (0.7px at
  1480/1560, 0 at ≥1600), and where it does (35px at 1440, 42.9 at 1366, 98 at 1280) the
  equal share would come out of the header strip too: 49 → 56px at 1440, 60.5 → 80.1px at
  1280. This card wants Phase 2, not Phase 1.
- **§ 04 PM3 panel — nothing to fix.** Slack is 0 at all ten widths; `stretch` measured as a
  no-op there.
- **§ 00 hero cards — nothing to fix.** Their apparent 12/12.8px is the cells grid's own
  padding, not free space: the runtime A/B absorbed only 0.8px. Both siblings are equal
  anyway, so there is no visible misalignment.

### Testing checklist

- [x] Unset ⇒ byte-identical rendering (resolver test + zero authored usages + every other
      card on the live page unchanged at ten widths).
- [x] Interaction with `cellsRowHeight`, `cellRowSpan` and no-slack defined + documented.
- [x] Does NOT reintroduce the indefinite-height blowup (§ 02 stays 443px at 1480, not 751).
- [x] § 01 / § 04 header strips do not inflate.
- [x] Unit tests: 3 new cases in `packages/dms/tests/cardLayout.test.js` (32 pass).
- [x] Re-measured NPMRDS Home § 01/§ 02/§ 04 band heights against the mockup — unchanged.
- [x] No package build needed: `dms-template` imports `./dms/packages/dms/src` directly
      (`src/App.jsx:1`) and the package has no `dist/`, so Vite picks the edit up as-is.

---

## Phase 2 — SHIPPED 2026-08-14: `display.cellsRowsTemplate`

### What the real cases actually needed

Phase 2 was framed as the mockups' `mt-auto` — "**one** row eats the slack". Measuring the only
live Card case (§ 01's measures panel) said something slightly different: what it needs is
"spread the slack, but **not** into row 1". `align-content: stretch` cannot express that — §12.9
grows *every* track whose max sizing function is `auto`, and there is no per-item opt-out. The row
has to stop being `auto`, which means naming it in a template.

So the knob is the **row-axis peer of the existing `cellsTracksTemplate`**, and it turns out to
express both shapes with one key:

| author writes | meaning |
|---|---|
| `cellsRowsTemplate: 'max-content'` + `cellsVerticalAlign:'stretch'` | row 1 (a header strip) is content-sized, so §12.9 skips it; every row below splits the leftover |
| `cellsRowsTemplate: 'max-content max-content … 1fr'` | the mockups' `mt-auto`: authored rhythm kept, ONE row absorbs everything |

`cellPushBottom` (option 1) was rejected on mechanism: a grid item's `margin-top:auto` can only
absorb free space *inside its own grid area*, and a content-sized row has none — it would have had
to ship together with a row-flex knob anyway. `cellRowGrow` (option 2) was rejected on cost: it
needs Card to re-derive which ROW each column lands in (an auto-flow cursor walk that has to handle
`cellRowSpan`), and it still cannot say "protect row 1" without the same template underneath.

### The diff (`ui/components/Card.layout.js` → `resolveCellsGridStyle`)

```diff
     const {
         cellsGridGap, cellsRowGap, cellsColumnGap, cellsRowHeight,
-        cardsBgColor, cardsPadding, cellsVerticalAlign,
+        cardsBgColor, cardsPadding, cellsVerticalAlign, cellsRowsTemplate,
     } = display;
@@
         ...(cellsRowHeight ? { gridAutoRows: `${cellsRowHeight}px` } :
             hasRowSpan ? { gridAutoRows: 'minmax(0, auto)' } : {}),
+        ...(typeof cellsRowsTemplate === 'string' && cellsRowsTemplate.trim()
+            ? { gridTemplateRows: cellsRowsTemplate } : {}),
```

Plus the wiring in `Card.jsx` (see the trap below) and a *Cells Grid → Rows Template* text input in
`Card.config.jsx`, next to the existing *Track Template*.

**Unset ⇒ byte-identical**: the key emits nothing unless it is a non-empty string (tested against
`undefined`, `null`, `''`, `'   '`, `0`, `12`, `{}`).

### ⚠ The trap that made it ship inert the first time

`Card.jsx` does **not** hand `display` to `resolveCellsGridStyle` wholesale — it re-assembles a
curated object literal:

```js
resolveCellsGridStyle({ display: { cellsGridGap, cellsRowGap, …, cellsVerticalAlign }, … })
```

So the resolver read `cellsRowsTemplate: undefined` forever. The data was written correctly, the
section stored the key, and the DOM simply ignored it — the first build measured *exactly* the
Phase-1-only numbers (header 52.8 at 1480, 83.8 at 1280) with no error anywhere. Fixed by adding the
key to the destructure, the literal and the `useMemo` deps.

Because no value-level unit test can see this, `cardLayout.test.js` now carries a **source-scan
guard**: it extracts the resolver's `const { … } = display;` keys and the keys of the literal
`Card.jsx` passes, and asserts the second contains the first. Verified to fail when the key is
removed from the literal, and to pass when it is restored.

### Measurements — § 01 measures panel, `/edit/home` DRAFT (header row px · measure rows px · slack)

| width | base (Phase 1 off) | `stretch` ALONE | **`stretch` + `cellsRowsTemplate:'max-content'`** |
|---|---|---|---|
| 1280 | 60.5 · 50.4 · **116.4** | 60.5 → **83.8** ✗ · 73.7 · 0 | **60.5** ✓ · 79.5 · **0** |
| 1366 | 60.5 · 50.4 · **72.7** | — | **60.5** ✓ · 65.7 · **0** |
| 1440 | 49 · 50.4 · **53.4** | 49 → **59.7** ✗ · 61.1 · 0 | **49** ✓ · 63.8 · **0** |
| 1480 | 49 · 50.4 · **19.1** | 49 → **52.8** ✗ · 54.2 · 0 | **49** ✓ · 55.2 · **0** |

The header strip does not move by a single pixel at any width, the panel's last row now lands on the
card's bottom edge (`slackBelowLastRow: 0` at 1280/1440/1480/1680), and at 1480 the measure rows come
out at **55.2px** against the mockup's **55.9**. The `mt-auto` shape was measured on the same card
for completeness (1280: rows `50.4, 50.4, 50.4, 167.9`).

Note the slack this had to absorb is much larger than when Phase 2 was filed — `card-link-cell-line-height`
landed first and removed the artificial 24px line boxes, taking § 01's slack at 1480 from 0.7 to 19.1
and at 1280 from 98 to 116.4.

Nothing else on the page changed: § 02's two ready-made cards keep Phase 1's zero gap (441/441 at
1480, 505.2 at 1280), § 04's panel is untouched (258.6), and the hero cards are untouched.

### Applied to

`build_npmrds_home.mjs` → the § 01 measures card, which is the case Phase 1 was deliberately NOT set
on. It now carries **both** `cellsVerticalAlign: 'stretch'` and `cellsRowsTemplate: 'max-content'`.

### § 04's lexical doorway — NOT reachable, and that is now measured, not assumed

`probe_s04.mjs` walks every doorway CTA on the page to its section box and asks whether that section
contains a Card cells grid. **All six answer `false`** — `open macro view →`, `Open Macro View`,
`open reports →`, `open route comparison →`, `open map-21 →`, `Open PM3 report`. The strip under
§ 04's CTA measures 55.7px at 1480 and lives inside a **lexical** section, so no Card display key —
`cellsRowsTemplate` included — can ever reach it. It stays a documented gap: the fix belongs to the
lexical layout-container (an `mt-auto`/`flex-1` on the CTA row), not to Card.

### Residual (filed, not invented here)

A stretched cell **top-anchors its content**, so once a row grows the text sits high in it —
measured on § 01 at 1280: content 16.3px with 15px above and 48.2px below. Previewing
`justify-content:center` on the cell at runtime fixes it cleanly (screenshots `TPL_1280_top.png` vs
`TPL_1280_center.png`) and would not shrink-wrap the cell, so the per-row rules stay continuous —
but it is a NEW primitive knob, so it is filed as
[`card-cell-content-valign.md`](./card-cell-content-valign.md) for sign-off rather than slipped in
here. `feedback_primitive_change_tasks_bc`.

### Phase 2 testing checklist

- [x] Unset ⇒ byte-identical (7 falsy/non-string shapes emit no `gridTemplateRows`).
- [x] Composes with `cellsVerticalAlign:'stretch'` — that pairing IS the recipe.
- [x] Governs EXPLICIT rows only; `cellsRowHeight` / the row-span `gridAutoRows` still size the rest.
- [x] § 01's header strip does not inflate at 1280 / 1366 / 1440 (nor 1480), panel reaches the bottom.
- [x] Every other card on the page unchanged at 1280 / 1440 / 1480 / 1680.
- [x] Source-scan guard so a future display key cannot ship inert.
- [x] Unit tests: 4 new resolver cases + 1 forwarding guard (43 pass).

---

## Phase 2 — original notes: "THIS row absorbs the slack" (`mt-auto`)

`align-content: stretch` spreads the leftover **equally**. Design mockups usually want one
row to eat all of it — `flex flex-col` + `mt-auto` on the CTA rail — so the authored rhythm of
the other rows survives. Two live cases still unsolved:

1. **§ 01's measures panel** (above): equal spreading inflates the header strip, so the panel
   keeps its narrow-width gap.
2. **§ 04's 43.7px strip under the *lexical* doorway CTA** — a different shape again: the
   slack is inside a lexical section, not a cells grid, so no Card key reaches it.

Candidates, roughly in increasing power:

1. **`cellPushBottom: true`** on one column → `margin-top: auto` on that cell. Mirrors the
   mockups' `mt-auto`; tiny surface. (A grid item's `margin-top: auto` does absorb the row's
   free space, but the *row* must have some — pairs with `cellRowGrow` below.)
2. **`cellRowGrow: 1`** on one column → that row gets the `1fr`, the rest stay content-sized.
   Expresses "this row eats the slack" directly. Note this is the *good* use of `1fr`: one
   flexible track among content-sized ones is a genuine free-space share, unlike the
   all-rows-flexible case that Phase 1 removed.
3. **`display.cellsRowsTemplate`** — a raw `grid-template-rows` string, exact peer of
   `cellsTracksTemplate`. Most expressive, most rope; and `cellsTracksTemplate` is an
   **inline style**, so a rows template would inherit that same non-responsive ceiling
   (already logged as its own escalation on the home-page task).

Related trap found in the same pass and still true: a cell can **fill its row** or **center
its content**, not both — `cellsVAlign:'center'` shrink-wraps the cell inside its grid area,
so `cellBorderBottom` floats at the cell's own bottom and per-row rules stop forming one
continuous line.

## Files

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/Card.layout.js` | ✅ Phase 1: `align-content` distribution + drop the `1fr` row equalization |
| `src/dms/packages/dms/src/patterns/page/…/ComponentRegistry/Card.config.jsx` | ✅ control comment/semantics (values unchanged) |
| `src/dms/packages/dms/tests/cardLayout.test.js` | ✅ 3 cases: unset BC, stretch = align-content, interaction with rowHeight/rowSpan |
| `src/dms/skills/card-layout.md` | ✅ "Cells-grid vertical rhythm" rewritten: recipe + the `1fr` lesson + the remaining gap |
| `src/dms/packages/dms/src/ui/components/Card.jsx` | ✅ Phase 2: forward `cellsRowsTemplate` (destructure + curated literal + memo deps) |
| `src/dms/packages/dms/src/ui/components/Card.layout.js` | ✅ Phase 2: `gridTemplateRows` from `cellsRowsTemplate` |
| `Card.config.jsx` | ✅ Phase 2: *Cells Grid → Rows Template* input |
| `src/themes/transportny/qa_skills/tools/builds/build_npmrds_home.mjs` | ✅ Phase 2: applied to the § 01 measures card |

## Notes

- Ask Alex before anything non-BC (`feedback_primitive_change_tasks_bc`); Card changes reach
  site-wide (`feedback_card_edits_bc`).
- Phase 2 is worth doing **after** [`card-link-cell-line-height.md`](./card-link-cell-line-height.md):
  that fix removes artificial height inflation, which changes how much slack there is to
  absorb in the first place.
