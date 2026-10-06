# Card: a compact layout when the Card itself is narrow (container-query responsive cells)

**Initiatives:** [mny_county_sites](../../../../../planning/initiatives/mny_county_sites.md) (primary), [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** built · **Release:** deploy — frontend (the `@availabs/dms` Card change); commit is the owner's · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Let an author give a Card section a second cell layout that applies when **the Card's own width**
drops below a threshold: different column tracks, cells hidden, a different span or alignment for a
cell. All of it is configured in the toolbar, with no code. Today a Card's cell grid is an inline
style, so one layout governs every viewport (`skills/card-layout.md` §"Section-level —
`cellsTracksTemplate`" calls this "a hard ceiling" and names this enrichment as the fix).

**Why container width, not viewport width:** a section is a fraction of the page. On the MNY LHMP home
the hazard bar list (7/12) is 379px wide on a 768px tablet and 715px at 1440, and the hurricane card
(5/12) is 261px at 768 but 368px at 1024. A viewport breakpoint can't say "this card is too narrow",
and a container query says exactly that. It is CSS-only, so it's SSR-safe, and it reads no `window`.

First consumer: `dms-template/planning/mitigateny/tasks/completed/mny-lhmp-home-live-build.md`
Round 11, where the hazard bar list should drop its risk column on phones as the design does, and
the hurricane card's name and dollar figure should stack instead of overlapping.

## Design

All keys are opt-in. **With `display.compactBelow` unset, nothing renders differently:** no `<style>`,
no container, no data attributes. That keeps the change backward-compatible for every existing Card.

| Key | Where | Meaning |
|---|---|---|
| `compactBelow` | `display` | px. The compact rules apply while the Card is narrower than this. |
| `cellsTracksTemplateCompact` | `display` | `grid-template-columns` in compact mode. Optional. |
| `hideCompact` | column | Hide this cell in compact mode. Hidden cells leave the grid flow. |
| `cellSpanCompact` | column | This cell's span in compact mode. |
| `justifyCompact` | column | `left` / `center` / `right`: the value's alignment in compact mode. |

Mechanism: the cards wrapper gets `container-type: inline-size` and a per-instance
`container-name` (from `useId`). Each record's cell grid gets a matching scope class, and each cell
gets `data-cc-*` attributes for its compact keys. One scoped `<style>` holds a single
`@container <name> (max-width: …)` block, and its declarations are `!important` so they beat the
inline grid styles. The CSS is built by a pure `resolveCompactCss` in `Card.layout.js`.
**Author strings are sanitised before they reach the `<style>`:** the track template is held to
a CSS-value character whitelist (no `; { } < > " ' \ :`), and the threshold and spans must be
finite numbers. Anything else drops that rule.

⚠ `container-type: inline-size` stops the wrapper's width from depending on its content. The Card
wrapper is a full-width block, so that's harmless here, and it is only applied when `compactBelow` is set.

## Phases

- [x] **1. Library (2026-10-06):** `resolveCompactCss`, `resolveCompactCellAttrs`, `sanitizeCompactTracks`
      and `compactScopeName` are in `Card.layout.js`, wired into `Card.jsx` (wrapper, cell grid, cells).
      There are five toolbar controls in `Card.config.jsx`. The per-cell three only appear once
      `compactBelow` is set. Six new tests are in `tests/cardLayout.test.js`, and the file passes 61/61.
- [x] **2. Docs:** `skills/card-layout.md` §"Compact layout". The "NOT responsive" paragraph now points
      at it.
- [x] **3. Consumer:** the three MNY hazard-band drafts are configured by
      `src/themes/mny/scripts/build_home_hazard_header.mjs`. They're verified on a local Vite (:5299,
      this code) against the live server at 360 / 390 / 414 / 768 / 1024 / 1440. There's no horizontal
      overflow at any width and no page errors. The compact layout applies at ≤ 768, and 1024/1440
      render exactly as before compact existed.
- [ ] **Release:** frontend deploy (owner). Until then the new keys are inert on the deployed site, which
      ignores keys it doesn't know.

## Files

| File | Change |
|---|---|
| `packages/dms/src/ui/components/Card.layout.js` | `resolveCompactCss`, `resolveCompactCellAttrs`, sanitisers |
| `packages/dms/src/ui/components/Card.jsx` | container + `<style>` on the wrapper, scope class on cell grids, `data-cc-*` on cells |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` | toolbar controls |
| `packages/dms/tests/cardLayout.test.js` | tests |
| `skills/card-layout.md` | docs |

## Testing checklist

- [x] With `compactBelow` unset: `resolveCompactCss` returns `''`, and `resolveCompactCellAttrs` returns `{}`.
- [x] CSS contains one `@container` block with the threshold, tracks, hide/span/justify rules, all `!important`.
- [x] Hostile tracks (`1fr;}</style><script>`, `}`, `/*`) and non-numeric thresholds/spans are dropped.
- [x] Existing `cardLayout` tests still pass (61/61). Full library suite: 730 pass, and the 3 failures
      plus 1 error are in files that don't import the Card (the `avlGraphTheme` golden,
      `syncDeltaConvergence`, and `adminPatternRow` needing the uninstalled `happy-dom`).
- [x] Live (local Vite): no horizontal overflow from 360 to 1440. 1024/1440 keep their full layout.

## Gotcha found while consuming it

A section that shares a grid row with a taller **row-spanning** neighbour gets a share of that
neighbour's slack. The MNY hazard header sits in row 1 beside the rowspan-2 focus card, and on a 768
tablet it grew about 45px, which left its rule floating above the list. The fix is pure configuration:
the section gets `height: 'fill'` and `cellsVerticalAlign: 'stretch'`, so its one cell row fills the
section and the bottom-aligned cells carry the rule down. Recorded here because it's the first thing
the next "header Card over a list Card" will hit.
