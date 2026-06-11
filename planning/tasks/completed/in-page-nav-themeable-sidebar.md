# Task: In-page nav — make the existing sidebar rail themeable, author-toggleable, and able to host custom content

**Topic:** patterns/page (section group / in-page nav) + ui (`SideNav`) + themes (transportny)
**Status:** ✅ **DONE 2026-06-09** — built + verified live on map_21 (2173915); skill written
([`adding-an-in-page-nav-rail.md`](../../skills/adding-an-in-page-nav-rail.md)). See Build plan below.

## Build plan & status (session 2026-06-08)

Working repo: **dms-template** (the running dev env — vite `npmrds.localhost:5173`,
dms-server `localhost:3001`; `transportNY/src/modules/dms` is an in-sync mirror checkout
of the same `availabs/dms` repo, synced via the remote later). Live target page:
**2173915** (`map_21_system_performance`, `npmrdsv5+npmrds_sub`).

**Decisions locked this session**
- **D1 (Phase 2 item rendering):** render the rail from a NEW dedicated, themeable
  `InPageNav` component driven by `pages.sectionGroup` theme keys — NOT `UI.SideNav`.
  Cleaner scroll-spy active state + single pattern-theme surface. `UI.SideNav` is a
  heavyweight route-based nav; overkill for an in-page TOC.
- **D2 (Phase 5 rail content):** **Option A — a `sidebar` section group.** A group named
  `sidebar` with `position: 'sidebar'` (so `getSectionGroups('content'/'top'/'bottom')`
  never renders it as a band). Its sections render in the rail below the nav via the
  existing `SectionArray` scoped to that group (full editability preserved — SectionArray
  filters the full sections array by `group` internally). (User-selected.)
- **D3 (Phase 6 gating):** rail attaches to the **primary content group** = first
  `position==='content'` group by index (was hardcoded `group.name === 'default'`). BC:
  docs sites' primary content group IS `default`, so the rail still attaches there.
- **D4 (Phase 1):** the author toggle **already exists** — `settingsPane.jsx:209-224`
  ("Show Content Sidebar" None/Left/Right → `togglePageSetting(item,'sidebar',…)`). No
  page.format select needed; just add `navLabel`/`anchorId` as recognized section fields.

**File changes (dms-template/src/dms/…)** — ✅ all done + verified live in edit mode
- [x] `patterns/page/components/sections/sectionGroup.theme.js` — rail container keys +
      nav card/label/list/item/active + **`contentRow`/`contentCol`** (the two-column row).
      Minimal default look (no card, plain links, empty label) so legacy rails ~unchanged.
- [x] `ui/components/useScrollSpy.js` (NEW, `.js` hook) — IntersectionObserver active id,
      `rootMargin` tuned to the ~128px sticky offset. **Verified: active item flips on scroll.**
- [x] `patterns/page/components/sections/InPageNav.jsx` (NEW, component-only) — renders
      menuItems from `pages.sectionGroup` theme + scroll-spy active state.
- [x] `patterns/page/pages/_utils/index.js` (`getInPageNav`) — `edit` arg (draft vs
      published); NEW `navLabel`/`anchorId` opt-in branch (decoupled from title/level/type);
      each menuItem carries `anchorId`. Exported `slugifyAnchor` (shared w/ section.jsx).
- [x] `patterns/page/components/sections/section.jsx` — clean `id={anchorId}` + `scroll-mt-36`
      on both SectionEdit & SectionView wrappers; legacy `#Title` alias kept.
- [x] `patterns/page/components/sections/sectionGroup.jsx` — see **DESIGN PIVOT** below.
- [x] `patterns/page/page.format.js` — `navLabel` + `anchorId` added to `cmsSection.attributes`.
- [x] `patterns/page/components/sections/sectionMenu.jsx` — "Page Nav Label" + "Anchor ID"
      inputs in the section Display submenu (anchorId only shows once navLabel is set).
- [x] `src/themes/transportny/themev2.js` — `pages.sectionGroup` block (card, mono "ON THIS
      PAGE" label, slate items, amber active) **+ `contentRow`/`contentCol`**. NOTE: the
      earlier flex hack on `layoutGroup.styles[content]` was **reverted** (see pivot).
- [x] Live wiring on 2173915 (Phase 7): `sidebar:'right'`; 6 `navLabel`s on draft header rows
      **2173918** (Compliance snapshot) / **2174073** (Reliability trends) / **2173960** (How
      targets work) / **2174150** (Regional · MPO) / **2174152** (Urban congestion) /
      **2174103** (Annual download); `sidebar` group (`position:'sidebar'`) + "related" lexical
      card **2174693** (group `sidebar`). Verified via Playwright on the live edit page.

### DESIGN PIVOT (2026-06-08) — rail column layout lives in the **pages theme**, not layoutGroup
Initial build rendered the rail as the `LayoutGroup`'s `outerChildren` and made the band a
flex row by adding `flex` to `layoutGroup.styles[content].wrapper1`. That stacked the rail
above content on transportny (the band's `theme:'default'` resolves to the `content`
layoutGroup style, whose `wrapper1` is a plain block), and editing the shared `content`
style is too broad. **Per user guidance** ("the page pattern has settings for the layout of
these columns and it is also controlled in the pages theme"), the rail is now rendered
**inside the band content** as a flex row `pages.sectionGroup.contentRow` →
`[contentCol (flex-1) | rail (w-302, sticky)]`, with the `layoutGroup` change reverted. Net:
the entire content↔rail two-column layout is owned by `pages.sectionGroup` theme keys; no
shared `layoutGroup` style is touched. Rail side flips via flex `order`. Rail card sits
inside the band's `max-w-[1480px]` container (matches the mockup), content reflows narrower.

### Data-model notes (for the next session)
- Stored `draft_sections` are `{id, ref}` refs; the full section (incl. `group` = band UUID
  and `navLabel`) lives on the **component row** and is hydrated at render. So `navLabel` is
  set on the component row (`dms section update <id> --set navLabel=…`).
- Gating: rail attaches to the band of the **first section carrying a `navLabel`**
  (`railGroupName = sections.find(s=>s.navLabel)?.group || 'default'`). Robust to this page's
  three same-`position:'content'` bands; `'default'` fallback keeps legacy docs BC.
- The page has separate published `sections` (2174519+) vs `draft_sections` (2173918+). Our
  navLabels are on the **draft** rows → rail shows in **edit** mode (task is draft-only).

### BC notes
- Non-rail bands: `showRail` gates everything; band renders `mainSections` directly (no
  `contentRow` wrapper) → byte-identical. Verified by code path.
- Legacy `item.sidebar` docs pages: rail moved from `outerChildren` to in-content flex row;
  default `sectionGroupTheme` now supplies `contentRow`/`contentCol`, so they still get a
  working rail beside content (look may shift slightly — acceptable per Phase-2 decision).

### Sticky fix (2026-06-09)
`contentRow` must be `items-stretch`, NOT `items-start`. With `items-start` the rail flex
column collapses to its content height, so the inner `sideNavContainer2` (`sticky`) has no
room to pin and scrolls away. `items-stretch` makes the rail column full band height → the
sticky inner pins while you scroll the band. Pin offset set to `top-[60px]` /
`h-[calc(100vh-68px)]` (per user request, was 120/128). Verified: rail nav top goes 309 → 60
(pinned) → 60 across scrollY 0 / 1600 / 3200.

### Verification (Playwright, live edit page `npmrds.localhost:5173/edit/map_21`)
- Rail renders on the right with the transportNYv2 card; "ON THIS PAGE" label + all 6 nav
  items; "// RELATED" card below from the `sidebar` group. Content reflows to the left col.
- Scroll-spy: active item flips with scroll (e.g. "Regional · MPO" active at scrollY 2600).
- Console: only the pre-existing Card-cell `key`-spread warnings (DisplayCalculatedCell /
  VerdictDotView) — none from InPageNav / useScrollSpy / sectionGroup.
- Auth helper: `scratchpad/npmrdsv5-dev2/{login,verify_rail3}.mjs`; auth.json refreshed.

### Follow-ups (not done this session)
- Sync the dms-lib + theme changes to the `transportNY/src/modules/dms` mirror checkout
  (same `availabs/dms` remote) when convenient.
- `transportny` `pages.sectionGroup` additions (the `contentRow`/`contentCol`/card keys) and
  the reverted `layoutGroup` edit take effect on a `themev2.js` reload; the bundled default
  `sectionGroupTheme` already covers the layout so the live page works now.

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
