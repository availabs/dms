# Migrate to a gap-0 section grid + per-section spacing/border/radius (B1-refined) — transportNY theme, design-system docs, mockups, and skills

**Topic:** patterns/page (`sectionArray`) + themes (transportny) + design-system docs + skills.
**Status:** core SHIPPED & verified (2026-06-01); docs/mockup/skills in progress.
**Depends on / informed by:**
[`research/compound-visual-units-grid-gap.md`](../../research/compound-visual-units-grid-gap.md)
(the B1-refined vs B3 analysis; read it first).

## ✅ Implemented & verified (2026-06-01)
The model shipped with two refinements decided during build:
- **Padding-only, no margins** (margins fight grid/flex). The gap-0 grid's gutter is the
  section wrapper's **per-side padding** (`defaultPaddingStep` fills unset sides; zero a side
  to compose flush).
- **Section chrome (border/radius/bg) renders on an INNER box** inside the gutter padding, so
  padding truly separates bordered cards. **Components own their own internal content padding**
  (e.g. the lexical component now hard-defaults `p-4` in both view + edit) — the section never
  pads inside the card. Principle: *component developers own sensible internal display*.

**Code (all BC; legacy `border:'full'` strings + string paddings still resolve):**
- `sectionArray.jsx` — `resolveBorder` (per-side `{top,right,bottom,left}` or legacy string),
  `resolveRadius` (per-corner `{tl,tr,bl,br}`), `resolveBg` (themed `backgrounds`), `resolvePadding`
  (per-side gutter, default-fills unset sides); `sectionChrome` on an inner box, gutter on outer.
- `sectionArray.theme.jsx` (default theme) + transportNY `themev2.js` `pages.sectionArray`:
  `container` → `gap-0`; `defaultPaddingStep`; `paddings` (curated steps); `borderSides`;
  `radiusCorners`; `backgrounds`. transportNY menu widened (`navigableMenu.menuWrapper` w-80).
- `richtext/index.jsx` — `RichtextView` + `RichtextEdit` default `p-4` content padding.
- `sectionMenu.jsx` — Layout pickers, all theme-driven via `getComponentTheme(theme,'pages.sectionArray')`
  (fixed a stale `theme.sectionArray.*` path the old border/padding pickers used):
  **Padding** = "All" row + per-side rows, curated steps, fills width, parses legacy strings;
  **Border** = clickable box edges; **Radius** = clickable corners; **Background** = swatched options.

**Verified live (Playwright):** BC holds (§01 KPI cards, §02 graphs, §03 cards render unchanged,
no page errors). **§02 flush proof** — a header/hero lexical card + the interstate avlGraph
compose into ONE bordered card by zeroing the shared-edge padding + coordinating edges/corners
(`scratchpad/npmrdsv5-dev2/transcribe/s02_flush.png`). Header 2174073, graph 2173963.

**Remaining:** design-system docs (`grid.html`/`layouts.html`), the map-21 mockup re-express,
and the 4 skills (Part 5). Minor polish: right-align the §02 hero (lexical 2-col), tint the
chart footer.

## Why
The page-content grid is `grid grid-cols-12 gap-6`. A uniform `gap` can't be removed between
one pair of sections, so distinct sections can't compose into one flush visual card (e.g. the
§02 trend = a **header+hero card** + a **separate graph**, two queries → two sections, that
must read as one bordered card). The chosen model (**B1-refined**): make the section grid
**`gap-0`** and move spacing onto **per-section margins** (removable per edge), with **detailed
per-section border-side + per-corner radius controls**. Then compound cards are just adjacent
sections tiling the existing 12-col grid with the shared-edge margin removed and coordinated
chrome — **no new nesting level, no recursive grid, no edge-bleed concept** (each section owns
its full box). This is both simpler and as capable as a nested "card group" for the realistic
2D cases (shapes come from `size`/`rowspan`).

**Scope guard:** ONLY the **section/band grid** (`sectionArray.container`) goes `gap-0`.
Component-internal flex/grid gaps (`gap-2/3/4` inside a Card cell, a KPI row, a legend, etc.)
are unaffected — they're layout inside a single section.

## The model (what "B1-refined" means concretely)
1. **Grid:** `sectionArray.container` → `w-full grid grid-cols-12 gap-0`.
2. **Spacing = half-gap margins, removable.** Each section defaults to a **half-gap margin on
   all sides** (e.g. `m-3` = 12px → 24px where two meet) so adjacent half-gaps sum to one
   gutter and **nothing doubles**; the band/LayoutGroup wrapper padding is reduced by the
   half-gap so outer edges still align. A section drops the margin on a shared edge (per-edge
   control) to sit flush with a neighbor.
3. **Border = per-side toggles against one themed line style.** The author toggles top/right/
   bottom/left; the theme owns the line (color + width). Avoid double-borders by toggling a
   shared edge on one neighbor only. (Legacy `border` string keys still accepted → mapped to
   side sets for BC. See Part 0.)
4. **Radius = per-corner toggles against one themed radius size.** Author toggles tl/tr/bl/br;
   the theme owns the corner size — so only a compound card's outer corners round.
5. **Compound card = emergent.** No new object — it's adjacent sections with the shared-edge
   margin zeroed, the right side-borders toggled, and the outer corners rounded. The §02 graph
   section simply *is* the tinted card footer (its own `bg-slate-50/40` + bottom corners + side/
   bottom border).

## Part 0 — the per-section selectors must be theme-driven (the author's primary tool)
The section menu already exposes **padding** and **border** pickers; these (plus new
**margin/spacing** and **radius** pickers) are the **load-bearing author tools** for building
these layouts, so their **option sets must be curated by the theme**, not hardcoded. Current
state (`patterns/page/components/sections/sectionMenu.jsx`):
- **Border picker → per-side toggles (preferred over a preset list).** Today it's a list of
  named presets (`Object.keys(theme.sectionArray.border)` → `full / openLeft / …`). Replace
  with **four independent side toggles** (top / right / bottom / left). The **theme owns the
  border *style*** (one curated line — color + width, e.g. `border-zinc-950/10`); the author
  just picks which sides draw it. This is more intuitive *and* makes double-borders trivial to
  avoid in a compound card — toggle the shared edge on **one** of the two neighbors only
  (instead of reasoning about which preset is "openTop" vs "openBottom"). Store as a per-side
  shape (e.g. `border: { top, right, bottom, left }`); render composes `border-t/r/b/l` +
  the theme's border-style class.
  - **BC:** keep accepting the legacy string keys (`'full'`, `'openLeft'`, `'borderX'`, …) by
    mapping each to its side set, so existing sections (e.g. the §03 cards on `border:'full'`)
    render unchanged; new edits write the per-side object.
- **Radius picker** — ❌ none today. Add **four corner toggles** (tl / tr / bl / br) with the
  **theme owning the radius size** (one brand corner, e.g. `rounded-[8px]`); the author toggles
  which corners round. (Compound card: top member rounds tl+tr, bottom member rounds bl+br.)
- **Padding picker → per-side + theme-curated scale.** Today it's hardcoded all-sides
  `['p-0','p-1','p-2', theme.sectionArray.sectionPadding]` (line ~965). Make it **per-side**
  (top / right / bottom / left), each side choosing from a **theme-curated step scale**
  (e.g. `theme.sectionArray.paddings` = the brand's spacing steps). Per-side padding is
  essential for compound layouts — e.g. a card's top member needs `pb-0` so the divider/footer
  sits flush, or a member pads only the side that meets content. Keep an "all sides" convenience
  on top of the per-side controls.
- **Margin/spacing picker → per-side + theme-curated scale.** ❌ none today. Add **per-side**
  margin (theme scale `theme.sectionArray.margins`), default = the half-gap; removing a side's
  margin makes that edge flush with its neighbor.

**Principle:** the theme **curates the *style/scale*** (border line, radius size, padding &
margin step scales); the author **composes per-edge / per-corner** — which sides have a border,
which corners round, how much padding each side, how much margin each side. Four parallel
per-side(/-corner) controls (margin, padding, border, radius) give full layout flexibility with
zero open-ended className input (per `themes/CLAUDE.md` — no passthrough).

## Part 1 — Codebase default theme (`sectionArray.theme.jsx`) — must move in lockstep
The new selectors (Part 0) live in **shared** components (`sectionMenu.jsx` / `sectionArray.jsx`),
which read their options from the theme. So the **codebase default theme is the contract** —
if a picker reads `theme.sectionArray.paddings`/`margins`/the border line/radius and the default
theme doesn't define it, the picker breaks for *every* site, not just transportNY. Update
`src/dms/packages/dms/src/patterns/page/components/sections/sectionArray.theme.jsx` in the same
change:
- **Already gap-0** — `container: 'w-full grid grid-cols-6 '` has no gap (the gap is commented
  out). Good: the default is already the reference model; keep it gap-0. (Only the *spacing
  defaults* move onto sections.)
- **Add the new keys the updated components read**, with sensible BC defaults:
  - `paddings` — per-side step scale (offered padding steps); default keeps today's `p-4` look.
  - `margins` — per-side step scale; default = the half-gap gutter.
  - a single **border line style** (color/width — today each `border.*` preset bakes
    `border-[#E0EBF0]` + `rounded-lg`; **split** the line from the radius) and a single
    **radius size**.
- **Adapt the existing `border` map for BC:** the legacy keys (`full / openLeft / openRight /
  openTop / openBottom / borderX`) currently combine border+radius — keep them resolving (map
  to side-sets + the radius) so existing sections render unchanged, while new edits use the
  per-side toggles + per-corner radius.
- **Expose the new maps in the theme settings** (the `sectionArray` settings array at the
  bottom of the file) so they're editable in the theme manager.
- Same lockstep applies to any other shipped theme that overrides `sectionArray` (e.g. avail /
  tessera) — at minimum they inherit the default; audit that none hard-set a conflicting gap.

## Part 2 — transportNY theme + sectionArray
- `src/themes/transportny/themev2.js` `pages.sectionArray.styles[0]`:
  - `container`: `gap-6` → `gap-0`.
  - Add the **margin/spacing tokens** (default half-gap; the removable per-edge classes).
  - Keep a single themed **border line style** (color/width) + a single **radius size**; the
    pickers toggle sides/corners against them (Part 0). Add **`paddings`** + **`margins`** maps.
  - Reconcile `sectionPadding` (`p-2`) — content padding stays; the inter-section *gutter* now
    comes from margin, not gap.
  - Reduce the LayoutGroup wrapper padding (`layoutGroup`/`wrapper2`) by the half-gap so outer
    alignment is preserved.
- `src/dms/packages/dms/src/patterns/page/components/sections/sectionArray.jsx`:
  - Already reads `size`/`rowspan`/`border`/`padding`. Add reads for **`margin`** (per-edge,
    default half-gap) and **`radius`** (per-corner / preset). Keep all BC-defaulted.
- **Validate on two bands with the same model:**
  - §02 interstate trend (2173960 header/hero card + 2174xxx? graph) → **flush compound card**.
  - §01 KPI strip → **separate, evenly-spaced cards** (the default half-gap margins reproduce
    today's gutters).

## Part 3 — design-system docs (the mockup that documents the system)
- `…/dms_design_system_v2/design-system/grid.html` — update **The grid spec** table:
  `container` → `grid grid-cols-12 gap-0`; add the **spacing (half-gap margin)**, **border
  position presets**, and **radius** rows; add a worked **compound-card** example (two adjacent
  sections forming one bordered card) and a **separate-cards** example (default margins).
- `…/design-system/layouts.html` — note that LayoutGroup wrapper padding is trimmed by the
  half-gap and that bands no longer rely on grid `gap`.

## Part 4 — the MAP-21 mockup page (represent the new system)
- `…/dms_design_system_v2/pages/map-21-system-performance.html` — re-express the **section grid**
  as `gap-0` + per-section spacing so the mockup maps 1:1 to the system (the §03 internal
  `grid grid-cols-12 gap-6` and the §02 `mt-*` spacing become the section-margin model). The
  §02 trend stays one bordered card but is now documented as **two composable sections** (header
  card + graph) rather than one hand-built container. Component-internal gaps stay as-is.

## Part 5 — skills
- **`translating-design-system-to-dms-theme.md`** (priority): new rule — **section grids are
  always `gap-0`; inter-section spacing is a per-section margin concern; border/radius are
  per-section.** Add to the top "gotchas" list + a section documenting the spacing tokens,
  border position presets, radius, and the wrapper-padding trim. Note component-internal gaps
  are unaffected.
- **`creating-pages-from-a-design-pattern.md`**: add a **compound components** subsection (after
  §5.6.10) — how to express a flush compound card as adjacent sections (zero shared-edge margin
  + position preset + per-corner radius), with the §02 trend as the worked example; when to use
  it vs. separate cards (§01) vs. header-spaced-above-table (§04–06).
- **`designing-a-dms-design-system.md`**: instruct that **mockups must be authored with gap-0
  section grids + section-margin spacing** (and component-internal flex gaps are fine), so a new
  design system maps cleanly onto the DMS layout model.
- **`transcribing-a-design-card-to-dms.md`**: note that a mockup "card" may be a **compound
  component** = several DMS sections, and how to recognize/handle it.

## Part 6 — FUTURE (on top of B1-refined, NOT this task)
A later layer makes the compound card a **first-class object**: select/group adjacent sections
into a named compound unit that can be **copy-pasted**, saved as a **template**, and shown as
**nesting in the sectionGroup pane** (the pane lists members under the compound). This sits on
top of B1-refined (B1-refined is the rendering/spacing foundation; this adds an explicit
grouping/identity + editor affordances). Track separately once B1-refined ships.

## BC / migration strategy
- **Existing pages keep their look:** the default half-gap margin reproduces today's `gap-6`
  gutter, so sections render ~identically after the `gap-0` switch. The change is additive
  (new margin/radius/border-position controls); compound is opt-in.
- Site-wide reach (per the primitive/theme-change policy) → BC by default, validated on §01 +
  §02 before rolling further. Re-tune cost is low (one page into the redesign).

## Get-it-right checklist (the load-bearing decisions)
- [ ] **Codebase default theme (`sectionArray.theme.jsx`) updated in lockstep** — defines
      `paddings`/`margins` scales + border line + radius so the shared pickers work for every
      site; legacy `border.*` keys still resolve (BC). (Already gap-0.)
- [ ] Spacing model: half-gap-all-sides margin (no doubling) + wrapper-padding trim; removable per edge.
- [ ] Border = per-side toggles (top/right/bottom/left) against one themed line; shared edge
      toggled on one neighbor only (no doubling). Legacy string keys still map to side sets (BC).
- [ ] Radius = per-corner toggles (tl/tr/bl/br) against one themed size; only outer corners round.
- [ ] Padding + margin are **per-side** (top/right/bottom/left) against theme-curated step
      scales (not hardcoded, not all-sides-only); "all sides" kept as a convenience.
- [ ] Responsive: `size` collapses to `col-span-12` on mobile → horizontal compounds re-stack;
      presets degrade (a "left" member becomes a full-width "middle"); decide compound is a
      desktop concern, mobile stacks with top/bottom rounding.
- [ ] §02 trend renders as one flush bordered card (header/hero + graph) — verified live.
- [ ] §01 KPI strip still renders as separate, evenly-spaced cards — verified live.
- [ ] grid.html / layouts.html / map-21 mockup updated to the new model.
- [ ] Four skills updated; component-internal gaps explicitly out of scope.
