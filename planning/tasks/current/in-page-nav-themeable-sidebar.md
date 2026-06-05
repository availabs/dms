# Task: In-page nav — make the existing sidebar rail themeable, author-toggleable, and able to host custom content

**Topic:** patterns/page (section group / in-page nav) + ui (`SideNav`) + themes (transportny)
**Status:** scoped 2026-06-03 — not started.

## Decision / context

We evaluated several ways to build the MAP-21 mockup's sticky "on this page" rail and
**chose to extend the in-page-nav primitive that already exists** rather than build a new
one. The rail is genuinely a distinct layout region (the mockup models it as an `<aside>`
outside the content grid, not a flow section), so a dedicated-but-themeable region is the
right shape — not a wart. Rejected alternatives are recorded at the bottom with the why.

**What already exists (reuse it):**
- **`getInPageNav(item, theme)`** — `patterns/page/pages/_utils/index.js:269`. Walks the
  page's sections, builds `menuItems` (label + a `scrollIntoView` onClick); already handles
  section-level headings *and* H1s inside lexical content.
- **`item.sidebar`** page field — `patterns/page/page.format.js:187` (`'left'`/`'right'`).
  Toggles the rail and which side it's on. **Currently `hidden: true`** — exists but not
  author-exposed.
- **Rail wiring** — `sectionGroup.jsx:73`: when `item.sidebar` is set (and `group.name ===
  'default'`) it renders `<SideNav {...inPageNav}/>` as the `LayoutGroup`'s `outerChildren`,
  wrapped by `sectionGroup.theme.js` `sideNavContainer1/2/3` (already `sticky top-[120px]
  h-[calc(100vh-128px)] hidden xl:block w-[302px]` — matches the mockup's sticky rail).
- **`UI.SideNav`** — `ui/components/SideNav.{jsx,theme.jsx}` (`VerticalMenu` / `SideNavItem`,
  themeable `navitemSide` / `navitemSideActive`; per-item `active` flag exists but is
  route-based — no scroll-spy yet).
- **Anchor** — `section.jsx:241` renders `id={'#'+title.replace(/ /g,'_')}` + `scroll-mt-36`;
  `getInPageNav` scrolls to that same id. Works only when a section has a `title` and
  `level:'1'` — our §-headers have **empty titles + `h2`**, so nothing qualifies today.

## Objective

Bring the existing rail up to the mockup and make it first-class:
1. **Author-toggleable** on/off + side (the field exists; expose it).
2. **Fully themeable** — the brand can style the rail card, the "on this page" label, and
   the item / active states to match the design.
3. **Hosts custom content** — authored content (the mockup's "related" card) renders below
   the generated nav.
4. Works on a page like MAP-21 (empty-title `h2` headers, custom section groups, draft-only).

**Backwards-compatible:** existing pages using `item.sidebar` (docs sites) must render
unchanged unless they opt into the new knobs.

## Scope / phases

### Phase 1 — Expose the toggle as an author control
- `page.format.js` `sidebar` field: unhide and make it a real control — a select
  `Off / Left / Right` (off = unset/falsy). Page-settings group. (Mechanism already works;
  this just surfaces it.)

### Phase 2 — Fully themeable rail (through the **page pattern theme**)
The rail is a pattern-tied component, so its theme goes through the **page pattern theme
namespace `pages.sectionGroup`** — default in `patterns/page/components/sections/sectionGroup.theme.js`,
registered via `patterns/page/defaultTheme.js` (`pages: { sectionGroup: sectionGroupTheme, … }`).
**Not** a top-level UI `sidenav` style. A brand overrides it under its own `pages.sectionGroup`
block — transportny already has a `pages` object (`themev2.js:1330`, currently `sectionArray` +
`sectionGroupsPane` but **no `sectionGroup`**); add the `sectionGroup` key there.

- Audit hardcoded classes in `sectionGroup.theme.js` (`sideNavContainer1/2/3`) and confirm no
  inline Tailwind leaks in `sectionGroup.jsx` markup (package theming rule).
- Add a **"on this page" label slot** + a rail **card wrapper** as new `pages.sectionGroup`
  keys (mockup: mono uppercase `on this page` header inside a `rounded-[8px] border bg-white
  p-4` card). Today `sideNavContainer3` is just `shadow-md rounded-lg overflow-hidden`.
- Add the **`sectionGroup` block to transportny's `pages`** so the brand rail matches the mockup
  (card, mono label, slate items, active state).
- **Nav-item styling sub-decision:** the menu items render via `UI.SideNav` (the `sidenav` UI
  theme — `navitemSide`/`navitemSideActive`). Either keep `UI.SideNav` and drive its item
  classes from the rail theme, or render the menu directly from `pages.sectionGroup` classes so
  the *entire* rail look lives in the pattern theme. Prefer the latter unless reusing
  `UI.SideNav` is clearly cheaper — keeps the rail a single pattern-theme surface.

### Phase 3 — Anchor opt-in + robustness (needed for MAP-21 to work at all)
- Add optional per-section fields `navLabel` (string) + `anchorId` (slug, default from
  `navLabel`). A section with `navLabel` opts into the rail — **decoupled from `title`/`level`**,
  so our empty-title lexical `h2` headers participate.
- `section.jsx`: emit a **clean** `id={anchorId}` (+ `scroll-mt` for the sticky-header offset)
  on the section wrapper; keep the legacy `id="#Title"` as a back-compat alias so existing
  title/level-1 pages still anchor.
- `getInPageNav`: add a branch that collects `{name: navLabel, anchorId}` from any section
  regardless of group/level/type; keep the existing title/H1 branch for BC.

### Phase 4 — Scroll-spy active state
- Add a `useScrollSpy(anchorIds)` hook (IntersectionObserver, `rootMargin` tuned to the
  ~120px sticky-header offset) and feed the active id into `SideNav` so the current section
  highlights (mockup's `.active`). Reuses the themeable `navitemSideActive`.

### Phase 5 — Custom rail content (the "related" card)
- A system to render authored content **below** the generated nav. Recommended option:
  **(A) a designated rail region** — let the rail render authored sections (e.g. sections
  assigned to a `sidebar`/`rail` group, or a small `sidebarSections` list on the page) beneath
  `<SideNav>`, so the "related" card is an ordinary `lexical`/`Card` section.
  Alternatives considered: (B) a single `sidebarContent` lexical field on the page (simplest,
  least flexible); (C) hard-code nothing and accept nav-only. **Decide A vs B during build** —
  A is more author-flexible and keeps "rail content is sections"; B is a 1-field quick win.

### Phase 6 — Draft preview + group gating
- `getInPageNav`/`sectionGroup`: read `draft_sections` in **edit** mode (so the editor preview
  shows the rail) and published `sections` in view. Today it reads `item.sections` only.
- Decide rail attachment: today it only renders for `group.name === 'default'`. MAP-21 content
  lives in custom groups — confirm whether to (i) render the rail once at page scope alongside
  all groups, or (ii) require the page's primary content to be the `default` group. Pick the
  least-invasive that keeps existing pages BC.

### Phase 7 — Wire up MAP-21 + document
- Set `item.sidebar: 'right'`; add `navLabel`s to the six anchors (Compliance snapshot /
  Reliability trends / How targets work / Regional · MPO / Urban congestion / Annual download);
  add the "related" card in the rail region.
- Document in a skill (`creating-interactive-pages.md` or `creating-pages-from-a-design-pattern.md`):
  the rail = `item.sidebar` + `navLabel`/`anchorId` opt-in + rail content region + theme keys.

## Files (anticipated)

| File | Change |
|---|---|
| `patterns/page/page.format.js` | unhide `sidebar`, make it Off/Left/Right select; (phase 5B) optional `sidebarContent` |
| `patterns/page/components/sections/sectionGroup.jsx` | draft-vs-published source; group-gating decision; render rail content region (phase 5) |
| `patterns/page/components/sections/sectionGroup.theme.js` | **`pages.sectionGroup` default** — add rail card wrapper + "on this page" label + item/active keys |
| `patterns/page/defaultTheme.js` | already registers `pages.sectionGroup` — confirm new keys flow through |
| `patterns/page/pages/_utils/index.js` (`getInPageNav`) | `navLabel`/`anchorId` branch; draft sections in edit |
| `patterns/page/components/sections/section.jsx` | clean `id={anchorId}` + `scroll-mt`; legacy `#Title` alias; section fields `navLabel`/`anchorId` |
| `ui/components/useScrollSpy.js` (new) | IntersectionObserver active-section hook |
| `ui/components/SideNav.{jsx,theme.jsx}` | only if reusing `UI.SideNav` for items — accept active id; otherwise rail items render from `pages.sectionGroup` |
| `src/themes/transportny/themev2.js` | add a **`sectionGroup` key to the existing `pages` block** (1330) matching the mockup rail — pattern theme, not a UI `sidenav` style |
| `src/dms/skills/creating-interactive-pages.md` (or design-pattern skill) | document the rail |

## Testing checklist

- [ ] `sidebar` Off/Left/Right control appears in page settings; toggling renders/hides the rail and flips sides.
- [ ] Existing sidebar pages (docs) render unchanged with no new fields set (BC).
- [ ] A section with `navLabel` set shows in the rail and scrolls to it — works with empty title + `h2` heading.
- [ ] Legacy title/level-1 anchor still works (alias) on an old page.
- [ ] Scroll-spy highlights the current section as you scroll; offset matches the sticky header (no clipped headings).
- [ ] "Related" custom content renders below the nav in the rail.
- [ ] Editor preview (draft) shows the rail; published view matches.
- [ ] Rail is `hidden xl:block` (no rail sub-xl; content reflows full-width) per the mockup.
- [ ] transportny rail visually matches the mockup (card, mono label, item + active states).

## Out of scope / rejected alternatives (recorded)

- **Section-level `sticky` primitive** — still wanted later (sticky sub-headers / filter bars),
  but its own task. Note the known limitation: a sticky section only pins within its own
  `LayoutGroup`/band — fine most of the time, occasionally a problem. Not needed for this rail.
- **New `InPageNav` *component* placed on the content grid** (rail as a peer grid cell, via
  `row-span:99` pinned cell or an explicit-rows 2D grid engine): technically feasible on this
  theme (`gap-0` + no `grid-auto-rows` make the row-span-99 collapse-to-0 trick work), but it
  forces collapsing all content into one band (tints move onto sections), re-spanning content
  to 10 cols, and carries `gap-0`/auto-rows footguns + edit-mode/responsive complexity — for no
  gain over the existing rail. **Rejected: the rail is a distinct layout region; don't fight the grid.**
- **Rail-track (2-track outer layout)** — structurally identical to the existing sidebar; a new
  component for it would be net-negative. **Rejected** in favor of improving what's there.

## Author-empowerment note
Every new knob is author-facing (the toggle/side select, per-section `navLabel`/`anchorId`,
rail content as ordinary sections, brand styling via theme) — no code edit needed to add the
rail to a page. No custom one-off component.
