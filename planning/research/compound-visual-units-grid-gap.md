# Compound visual units — composing distinct sections into one flush card

**Question (from the user):** the MAP-21 §02 trend design is a single bordered card =
**header + hero stat** (one data shape) **+ a line graph** (a different data shape). Because
the two need different queries they must be **two DMS sections**; but the page grid's
`gap-6` keeps them from sitting flush as one card. What's the best way to let distinct
sections compose into one visual unit?

## Where this is actually needed (survey of the MAP-21 mockup)
The "combine distinct sections into one card" need is **narrower than it first looks**:

| § | Mockup structure | Compound? |
|---|---|---|
| §01 KPI strip | four **separate** bordered KPI cards in a row + a PHED card | No — gap between them is correct |
| §02 trends (×3) | **one bordered card** = header + hero stat + chart (chart bleeds to card edges) | **Yes — the real case** |
| §03 how-targets | left card + three right cards, **separate** | No — gap correct |
| §04 / §05 regional/urban | a header strip (kicker + h2 + legend/controls) **above** a table card, separated by `mb-4`/`mb-6` | No — header and table are *spaced*, not flush; already two normal sections |
| §06 download | header strip + controls **above** a table | No — spaced |

So on this page the only true compound unit is the **§02 trend card** (header+hero + graph),
×3. Everything else is either correctly-separate cards or a header *spaced above* a data
card (which the current two-section + gap layout already expresses fine). **A page-wide grid
change would be a large blast radius to serve three cards.**

## The CSS constraint
The band container is `grid grid-cols-12 gap-6`. CSS `gap` is **uniform** — it cannot be
removed between one specific pair of items. To make two stacked items sit flush you must
either (a) remove the global gap and re-create spacing another way, (b) nest the pair in a
container with its own `gap-0`, or (c) pull one item with a **negative margin equal to the
gap**. There's no "gap between just these two" knob.

## Options

### B1 — Global `gap-0` + per-section spacing, removable (the user's prior-systems approach)
Set the band grid to `gap-0`; give sections a default outer spacing that re-creates the gap;
a section that should compose drops it on the shared edge.
- **Pros:** maximally flexible; any two sections can compose anywhere.
- **Cons:** **largest blast radius** — every existing page re-tunes its spacing. And the
  spacing can't be *padding* for bordered cards (padding is inside the border, so two
  bordered cards at `gap-0` still touch) — it has to be **margin**, and margins between grid
  items don't collapse, so you're managing top+bottom margins to avoid doubling. High effort,
  high regression surface, not justified by three trend cards.

### B2 — Surgical per-section "attach" flag (the easy gap override)
Keep `gap-6`. Add a per-section field, e.g. `attach: 'above'`, that on the *lower* section
applies a **negative top margin equal to the row gap** (`-mt-6`, ideally a theme token so it
stays coupled to the gap) plus the shared-edge chrome (`rounded-t-none border-t-0`), and
makes the *upper* section drop its bottom radius (`rounded-b-none`). The two then read as one
card. (`sectionArray` already reads per-section `border`/`padding`/`size`/`rowspan`, so this
is the same shape of change.)
- **Pros:** **smallest change**, no global re-tune, opt-in, zero effect on existing pages.
  Directly answers "is there an easier way to override the gap" — yes, negative margin.
- **Cons:** the negative margin is **coupled to the gap value** (a token mitigates this);
  border/radius **coordination spans two sections** (the upper must know to drop its bottom
  radius), which is fiddly and error-prone for authors; only cleanly handles a **vertical**
  attach in the same column. Works, but feels like a special-case.

### B3 — Compound "card group" (nest a run of sections in one bordered, gap-0 container)
Introduce a grouping (a sub-group inside a band, or a `display:'card'` marker on a contiguous
run of sections) that renders its children inside **one** `border + rounded + shadow + gap-0`
container; children carry **no individual card chrome**, and a child can opt to **bleed** to
the container edges (the chart's tinted footer = `-mx -mb`).
- **Pros:** **maps 1:1 to how the mockup is actually built** (one container div with children);
  the card chrome lives in *one* place (no cross-section border coordination); naturally
  supports >2 children and the chart's edge-bleed footer; opt-in, no global change; this is
  the genuine "**sections compose into compound units**" capability the user described, and
  it generalizes cleanly (any future "header + data + footer as one card").
- **Cons:** adds a **nesting level** to the section model (today `section_groups` are flat
  bands). More component/renderer work than B2 — needs a nested array + render path + an
  editor affordance for "add to this card". Medium effort.

## Recommendation
1. **Don't do B1.** A page-wide grid-gap change to serve three trend cards is the wrong
   cost/benefit, and the gap-via-padding model has the bordered-card-separation problem.
2. **If you want it shipped now with minimal risk → B2** (the negative-margin attach flag).
   It's the literal "easier way to override the gap" and touches nothing else. Accept that
   it's a special-case knob with two-section border coordination.
3. **If compound visual units are a long-term goal (the user's stated intuition) → B3**
   (compound card-group). It's the principled version: chrome in one place, matches the
   mockup's own structure, generalizes, opt-in, and doesn't disturb existing pages — at the
   cost of a nesting concept. **This is my recommended target** if we're investing in the
   capability rather than patching the one case.
4. **Interim, zero-code:** the §02 graph already renders its title; we can keep a separate
   header/hero **card above the graph with the normal gap** (not flush) — it reads as
   "header, then chart," which is acceptable until B2/B3 lands. (This is what's live now,
   minus the hero stat, which can be added as a small KPI-style card section regardless.)

## Re-assessment (after the "B3 needs its own grid" insight)

The decisive observation: **a compound card wants to be a bunch of shapes, not just a
stack** — so a B3 group would need *its own internal grid*. But the band **already has a
grid** (`grid-cols-12` + per-section `size`/`rowspan`). B3 therefore *duplicates* the grid
mechanism one level down (a recursive `sectionArray`), which is the "get it right" hazard.
B1-refined instead **reuses the one grid**: a compound card is just a set of adjacent
sections tiling the band's 12-col grid, made flush by removing the gap and coordinated via
per-section border/radius. That reframes the trade-off.

**B1-refined = `gap-0` band + per-section spacing + detailed border/radius controls.**
Concretely:
- **Spacing:** band grid `gap-0`; each section defaults to a **half-gap margin on all sides**
  (e.g. `m-3` = 12px → 24px gutters where two meet), with the band's own padding reduced by
  the half-gap so outer edges align. Half-gap-all-sides is the classic gutter-via-margin
  trick: adjacent half-gaps sum to one gap, **nothing doubles**, and removing the margin on a
  shared edge makes two sections flush. (Removable per-edge.)
- **Borders/radius:** per-side border + per-corner radius, ideally surfaced as **"card
  position" presets** (standalone / top / bottom / left / right / middle / tl-tr-bl-br…) that
  set the right sides + rounded corners. transportny's `sectionArray.border` map already has
  `full / openLeft / openRight / openTop / openBottom / borderX` — **a real head-start**;
  this extends it + adds radius.

### Why B1-refined is plausibly *simpler AND equally capable*
- **One grid, no nesting.** The "bunch of shapes" comes from the band's existing
  `size`/`rowspan`, not a new recursive grid. No nested section model, no new editor level.
- **No "bleed" concept.** In B3 the chart footer must bleed past the group's padding to the
  card edge (`-mx -mb`). In B1-refined **each section owns its whole box**, so the graph
  section simply *is* the tinted footer (its own `bg-slate-50/40` + `rounded-b` + border) —
  the bleed problem evaporates. (This is a genuine reduction in concepts.)
- **The compound card is emergent**, expressed entirely through per-section controls authors
  already understand (size, border, radius, margin) rather than a new container object.

### What B1-refined gives up vs B3 (and why it's acceptable)
- The compound card has **no independent coordinate system** — its members live in the band's
  12-col grid, so you can't give one card an internal grid unlike the band. For the rare case
  that needs that, a **`Card` section** (which has its own cells-grid) covers it. Narrow gap.
- The compound is **not a first-class object** to grab/move/duplicate as a unit; you move its
  member sections. Worse editor ergonomics, but the simpler model is the trade you're choosing.

### Getting it right (the load-bearing decisions for B1-refined)
1. **Spacing model** — commit to half-gap-all-sides margins (removable per edge) + band-padding
   trim. Avoids the doubling/edge problems that sink naive gap-0+padding.
2. **Border doubling** — adopt the position-preset set so adjacent sections never both draw a
   shared edge; reuse/extend the existing `border` map; add per-corner radius.
3. **Responsive degradation** — `size` already collapses to `col-span-12` on mobile, so a
   horizontal compound (left/right members) **re-stacks vertically**; the position presets
   must degrade (a "left half" becomes a full-width middle). Decide: compound coordination is
   primarily a desktop concern and mobile stacks cleanly with top/bottom rounding only.
4. **Migration** — cheap now (one page in). Re-tune the band gap → margins once; existing
   sections get the default half-gap margin so they look the same.

### Recommendation (updated)
**B1-refined is the better long-term target.** Your instinct is right: reusing the single
grid + detailed per-section border/radius/spacing controls is *more* capable than it first
appears (2D shapes via `size`/`rowspan`), *simpler* than B3 (no nesting, no recursive grid,
no bleed), and the existing `border` map is a head-start. The price — a one-time spacing
re-tune and a richer (but flat) section style surface — is low while we're one page in.
**Reserve B3** only if independent per-card coordinate systems become a real, recurring need
(they haven't yet). Before building, write the spacing/border/radius/responsive rules down as
a design task and prove them on the §02 trend card + one separate-cards band (§01) so both
the flush and the spaced cases are validated by the same model.

## Notes for whichever path
- The chart's **edge-bleed footer** (tinted `bg-slate-50/40`, `-mx -mb`, `rounded-b`) is part
  of the compound look; B3 supports it natively (child bleed), B2 would need the graph
  section to self-bleed within the shared border.
- The hero stat (CY value + `status_pill` verdict) is a **single-row query** → a `Card`
  section (reuse `status_pill` + a big-value cell). It is *not* derivable inside the graph
  section because the graph's query is the multi-year series (the user's point).
- Keep everything **author-accessible**: B2 = a section field + theme token; B3 = a group
  type + the existing per-section `border`/bleed controls.
