# Card layout model — simplify to a predictable box model

> Motivated by the landbank design-alignment work (2026-07-01/02, see
> `planning/landbank/tasks/current/landbank-seed-design-pages.md` in the root
> planning repo). Matching three list cards to a mockup required diagnosing
> **six** independent, undocumented spacing/typography contributors — each a
> default "tacked on" at a different layer. Owner: "I am very open to
> modifying / simplifying the component to make it easier for developers /
> agents to understand the layout model."

## Objective

Make the Card's rendered geometry derivable from its config by inspection:
an author (or agent) reading `display` + `columns` should be able to predict
every pixel of spacing without reading `Card.jsx`. Explicit values —
**including 0** — always win; nothing invisible adds or absorbs space.

## The evidence — what it took to match one design card

Every one of these was found by measuring the DOM, not by reading config:

| # | Hidden contributor | Where it lived | Status |
|---|---|---|---|
| 1 | Cards grid fills its box: `flex:1` + `gridAutoRows: minmax(max-content,1fr)` distributes section slack *between rows* — gaps grow with section height and differ per row count | `Card.jsx` mainWrapperStyle | Knob added: `cardsVerticalAlign: 'top'` (default still fill) |
| 2 | `undefined` style longhands (`paddingTop: undefined, …`) listed after the `padding` shorthand clobbered it in the committed CSSOM — an explicit `cellsPadding: 0` never reached the DOM; the theme's class `p-2` silently won | `Card.jsx` cell style object | FIXED: defined-keys-only style emission |
| 3 | `marginTop: "undefinedpx"` emitted on every non-image cell | same style object | FIXED (guarded) |
| 4 | Theme `dataCard.value` baked a full font spec (`font-display text-[17px]`) that raced every `valueFontStyle` token on Tailwind arbitrary-value order | landbank theme (pattern copied from default) | Fixed in landbank (`value: w-full`); default theme still ships fonts in `value`/`header` |
| 5 | `valueWrapper: min-h-[20px]` — a 20px floor under a 10px data_bar = phantom padding | theme default + landbank copy | Fixed in landbank; default still has it |
| 6 | Every cell renders `border border-transparent` (+2px per cell, always) | `Card.jsx` cell wrapper | Still there (documented in skill) |
| 7 | `pageSize` undefined → `NaN` fetch range → data request silently never fires | `getData.js` | Documented only |
| 8 | Hidden (`hideHeader`+`hideValue`) columns still occupy grid slots | addressed earlier via `selectOnly` | OK, but three overlapping visibility knobs now exist |
| 9 | `headerValueLayout: 'row'` default reserves `headerWidth: 50%` even when the header is hidden | `Card.jsx` | Still there |

## Proposed model (the "one sentence" version)

**A Card is two nested grids. Four knobs own ALL spacing; everything else is
content-sized.**

```
cards grid:  gap = cardsGridGap   padding = cardsGridPadding   rows = max-content (packed to top)
cells grid:  gap = cellsGap (/Row/Col)                          rows = max-content
cell:        padding = cellPadding (column) ?? cellsPadding (display) ?? theme gutter
```

(`cardsGridPadding` shipped 2026-07-02 — outer-grid padding, number or CSS
shorthand; the list-level counterpart to per-card `cardsPadding`. Note the
legacy naming wrinkle for the eventual rename pass: `cardsPadding` actually
pads the CELLS grid inside each card.)

### Concrete changes — status 2026-07-02

1. - [x] **Explicit-zero contract:** style emission includes only defined
   keys; `0` is a value, never "unset". Extracted the whole cell/grid style
   derivation into **`packages/dms/src/ui/components/Card.layout.js`** (pure
   resolvers — also the authoritative model docs) and added
   `packages/dms/tests/cardLayout.test.js` (29 tests, all pass) covering the
   zero contract, padding precedence, no-undefined-emission, both models'
   grid defaults, the width split, and the track walker.
2. - [x] **Content-sized cards default — under v2 opt-in** (see gating
   decision above): `resolveCardsPackMode` — v2 defaults packed
   (`max-content` + `alignContent: start`), `cardsVerticalAlign: 'stretch'`
   opts back into fill; v1 behavior byte-identical. The Vertical Align
   control now exposes 'Fill height' explicitly.
3. - [x] partial **Layout-only structural keys + ONE gutter key:** v2 resolves
   ambient cell padding as `cellPadding ?? cellsPadding ?? theme.cellGutter`,
   emitted INLINE (theme classes can never silently win). Default theme ships
   a `v2` named style (`cellGutter: 8`, no `min-h-[20px]`, gutter-free
   `headerValueWrapper`); landbank styles[0] opted in (`layoutModel: 'v2'`,
   `cellGutter: 8`/`16` for kpi, `p-2`/`p-4` classes dropped).
   **Deferred:** transportny parity (needs the visual audit before dropping
   its `!`-importance tokens); landbank `kpi` style still bakes the figure
   typography in `value` (dropping it would shrink existing kpi cards with no
   token set — do it with a token sweep).
4. - [x] **Transparent border dropped — under v2:** no border fallback;
   edit-hover renders `theme.itemEditOutline` (outline = no layout space),
   layered ON author chrome so hovering never shifts geometry. v1 unchanged.
5. - [x] **One visibility axis:** `hideValue` deprecated in the picker — the
   toggle only appears when already set (authors can turn it off, not adopt
   it); renderer keeps honoring it for BC. Documented in the skill.
6. - [x] **Hidden width reservation:** verified the current tree already
   gates the split correctly; codified in `resolveHeaderValueWidths` (split
   applies only when BOTH header and value render) + regression tests.
7. - [x] **Introspection:** edit mode stamps `data-cell` + `data-pad`
   (resolved padding, `theme` = class gutter in effect) on each cell and
   `data-rhythm="<gap>/<top|stretch>"` on the cards grid.
8. - [x] **Docs:** `skills/card-layout.md` now opens with "The box model —
   two grids, four knobs" + a v1/v2 comparison table + the introspection
   attrs; "Vertical rhythm" reduced to a footnote; visibility table, defaults
   -that-bite, and quick-reference updated.

## Implementation plan (2026-07-02 session)

**Gating decision (design note):** (2), (4), and the theme-default parts of (3)
change rendered output of existing published cards, and no visual audit of the
live sites (transportny, wcdb, mny) can be run from this environment — so ALL
rendered-output changes land behind the task's own escape hatch:
`layoutModel: 'v2'` as a key **on a dataCard theme style**. Because
`display.cardStyle` → `activeStyle` → `getComponentTheme('dataCard', style)`
and named styles inherit missing keys from `styles[0]`, this gives two opt-in
paths with zero new plumbing:

- **Per-section:** default theme ships a `v2` named style; authors pick
  "Card style → v2" in the section toolbar.
- **Site-wide:** a brand theme sets `layoutModel: 'v2'` (+ layout-only
  structural keys + `cellGutter`) on its `styles[0]`. Landbank opts in now;
  transportny stays v1 until its visual audit (its `!`-importance tokens stay).

**Steps:**

1. Extract the whole box model into a pure module
   `packages/dms/src/ui/components/Card.layout.js` (convention: non-component
   logic in `.js`): `resolveCellStyle`, `resolveCardsGridStyle`,
   `resolveCellsGridStyle`, `resolveCellTracks` (the cellWidth walker),
   `resolveHeaderValueWidths`. Card.jsx calls these inside its useMemos.
   This makes item 1's unit test possible (no jsdom in the repo) and makes the
   model readable in one file.
2. v2 behaviour inside those resolvers:
   - cards grid default = `max-content` rows + `alignContent: start`
     (packed); `cardsVerticalAlign: 'stretch'` opts back into fill. v1
     unchanged (`'top'` knob still works).
   - cell padding = `cellPadding (col) ?? cellsPadding (display) ??
     theme.cellGutter` — ALWAYS emitted inline, so theme class padding
     (`p-2`) can never silently win.
   - no `border border-transparent` fallback; edit-hover uses an outline
     (no layout space).
3. Item 6 (headerWidth reservation when hideHeader) — verified ALREADY fixed
   in the current tree (value `maxWidth` is gated on `!attr.hideHeader`,
   header on `!attr.hideValue`); codify in `resolveHeaderValueWidths` +
   guard tests so it can't regress.
4. Introspection (item 7): edit mode only — cell wrapper gets
   `data-cell` / `data-pad` (resolved padding); cards grid gets
   `data-rhythm="<gap>/<top|stretch>"`.
5. Themes: default `card.theme.jsx` styles[0] unchanged (BC) + new `v2`
   named style (layoutModel, `cellGutter: 8`, no `min-h-[20px]`, gutter-free
   `headerValueWrapper`); landbank styles[0] → v2 (its keys are already
   layout-only; drop `p-2` from `headerValueWrapper`, add `cellGutter: 8`).
6. Card.config.jsx: deprecate Hide Value in the picker (visible only when
   already set); add explicit 'Fill height (stretch)' option to Vertical
   Align so v2 sections can opt back into fill.
7. Tests: `packages/dms/tests/cardLayout.test.js` (vitest, pure functions) —
   explicit-zero contract, padding precedence, no-undefined-emission, v1/v2
   grid defaults, width reservation, track walker.
8. Docs: rewrite top of `skills/card-layout.md` around the four-knob model +
   v2 opt-in; shrink "Vertical rhythm" to a footnote.

**Deferred (unchanged from scope):** getData `pageSize` default (separate
task); transportny theme v2 parity (needs visual audit); Playwright
computed-style check (needs a running site).

## Scope / BC

- (1), (3) partial, (7) are safe now. (2), (4), (6) change rendered output of
  existing published cards → need a visual audit pass over live sites
  (transportny, wcdb, mny) before landing; do them behind a
  `theme.dataCard.layoutModel: 'v2'` opt-in if the audit finds regressions.
- The dataWrapper fetch traps (`pageSize` NaN, calc-column markers,
  `fn:'exempt'` in GROUP BY) are a separate task-sized cleanup: getData should
  default `pageSize` (e.g. 10) and warn on unmarked SQL-looking names.

## Files

- `packages/dms/src/ui/components/Card.jsx` — items 1, 2, 4, 6, 7
- `packages/dms/src/ui/components/Card.theme.jsx` (default dataCard theme) — 3, 5
- `src/themes/transportny*, landbank` — 3 parity
- `packages/dms/src/patterns/.../dataWrapper/getData.js` — pageSize default (follow-up)
- `src/dms/skills/card-layout.md` — 8

## Testing checklist

- [x] `cellsPadding: 0` renders 0 computed padding on every cell — **unit**
      (`cardLayout.test.js`, 29/29 pass; full dms client suite 178/178).
      **Playwright computed-style check on a live site still open.**
- [ ] List card beside a rowspan-2 sibling: uniform gaps == cardsGridGap —
      needs a live v2 section (landbank dev on :3001)
- [ ] `valueFontStyle` token sizes render exactly (no specificity race) on
      default + brand themes — landbank verified during the design-alignment
      sessions; re-check the default theme's `v2` style live
- [ ] Visual audit of existing published cards on transportny/wcdb/mny —
      NOT needed for what shipped (all rendered-output changes are behind the
      `layoutModel: 'v2'` opt-in; v1 output is unchanged and unit-guarded),
      but still required before opting transportny in / flipping any default
- [x] Lint: no new issues in touched files (remaining Card.jsx errors pre-date
      this task)

## Follow-ups spun out (2026-07-02)

- [card-context-menu-consolidation.md](./card-context-menu-consolidation.md) —
  owner-requested: consolidate/organize the section + per-cell context menus
  and align label ↔ key ↔ skill vocabulary.
- getData fetch-trap cleanup (todo.md entry): default `pageSize`, warn on
  unmarked SQL-looking names.
- Landbank kpi style: move figure typography out of `value` into a token.
