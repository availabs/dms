# Card context menus — consolidate, organize, align vocabulary

> Owner request (2026-07-02, follow-up to
> [card-layout-model-simplification.md](./card-layout-model-simplification.md)):
> "consolidate the context menus for both card itself as well as the cell
> context menu inside of card — these have both ended up being designed
> ad-hoc, and organizing them and choosing intentional interfaces in them
> could greatly improve the author experience and ease of use of cards. It
> would also be helpful if their labels matched better with what is in code,
> so when a user asks an agent about using a card the vocabulary lines up."

## Objective

Two intentional, organized authoring surfaces for the Card section:

1. **The section menu** (`controls.columns` / `.more` / `.data` in
   `Card.config.jsx`) — the card-level knobs.
2. **The per-cell context menu** (`controls.inHeader`, built by
   `buildInHeader()`) — the column-level knobs.

Both grew entry-by-entry as features landed; neither was ever designed as a
whole. And the display labels drifted from the config keys, so the vocabulary
an author uses with an agent ("Card Padding") doesn't match the key the agent
must set (`cardsPadding`) — or worse, matches a *different* key.

## Current state — how the menus got ad-hoc

- **The per-cell menu is one flat ~40-entry list** separated by anonymous
  `type: 'separator'` rows, mixing column type, typography, layout, link
  config, image config, sort, edit, and blank-row defaults. Entries are gated
  with per-entry `displayCdn` functions rather than grouped by concern.
- **The section menu ("more") mixes grouped and ungrouped entries** — `Cards
  Grid` / `Cells Grid` / `Default Column Settings` submenus sit alongside
  loose toggles (Attribution, Hide if No Data, Pagination).
- **Same label, different keys:** "Gap" appears in both Cards Grid
  (`cardsGridGap`) and Cells Grid (`cellsGridGap`); per-column "Padding" is
  `cellPadding` while section "Cell Padding" is `cellsPadding` (the
  singular/plural convention exists in code but the labels hide it).
- **Labels that point at the wrong thing:** "Card Padding" sets
  `cardsPadding`, which actually pads the CELLS grid inside each card (the
  legacy naming wrinkle flagged in the layout-model task); "Value Placement"
  sets `headerValueLayout` with values `row`/`col` shown as
  "Inline"/"Stacked"; "Border Below" sets `cellBorderBelow`.
- **Typo'd key baked into saved configs:** `allowAdddNew` (triple-d) — a
  rename needs a migration or a read-both shim.
- **Overlapping visibility controls** were reduced to one axis in the
  layout-model task (`show` / `selectOnly` / `hideHeader`; `hideValue`
  deprecated, its toggle now only visible when already set) — the menu
  organization should make that axis read as ONE group.

## Proposed direction

1. **Inventory first.** Table of every entry in both menus: label, key,
   type, gating, where the key is consumed (Card.jsx / getData / theme).
   That table becomes the contract for the redesign.
2. **Group by author intent, not by accretion order.** Candidate cell-menu
   groups: Type & Format, Text (header/value tokens, justify, case),
   Layout (span, width, padding, alignment), Link, Data (sort, fn,
   page-params, blank default), Advanced. Candidate section-menu groups:
   Layout (cards grid / cells grid), Style (card style, colors, borders),
   Data (pagination, fetch mode, edit), Extras (attribution, hide-if-null).
3. **One vocabulary.** Rename labels to match keys (or, where a key is the
   legacy wart — `cardsPadding`, `allowAdddNew` — decide the canonical
   author-facing term, alias the key, and migrate). The rule: the label an
   author reads, the key an agent sets, and the skill doc all use the same
   word. Update `skills/card-layout.md`'s quick-reference to list label ↔ key
   side by side.
4. **Shared menu-building primitives.** `buildInHeader` returns bespoke
   shapes consumed by `NavigableMenu`; consider a small declarative schema
   (group → entries → control type) so Spreadsheet/Graph menus can adopt the
   same organization later.
5. **BC:** keys stored in saved section state must keep working — this task
   reorganizes presentation and labels; any key rename ships with a
   read-both shim or a `Card.migrate.js` pass.

## Files

- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/Card.config.jsx` — both menus
- `packages/dms/src/ui/components/Card.jsx` — key consumption (verify nothing rendered depends on labels)
- `packages/dms/src/ui/components/navigableMenu/*` — menu primitive (grouping support)
- `packages/dms/src/ui/components/Card.migrate.js` — if any key renames ship
- `src/dms/skills/card-layout.md`, `using-a-datawrapper-card.md` — vocabulary parity

## Testing checklist

- [ ] Every existing saved card renders identically before/after (labels only)
- [ ] Every menu entry still writes the same key it wrote before
- [ ] Agent vocabulary check: skill quick-reference lists label ↔ key pairs
- [ ] If keys renamed: migration covers live sites' saved sections
