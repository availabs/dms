# Traversing a DMS page (any pattern, any theme)

A map of what a rendered DMS page actually looks like in the DOM, plus the
core-library edit-mode state machine every page section shares — regardless
of pattern (`page`, `datasets`, `forms`, …) or theme. This is the generic
counterpart to [`traversing-report-pages.md`](./traversing-report-pages.md),
which covers NPMRDS's `ReportRouteList`/Dynamic Reports specifics on top of
this shell. If you're navigating a DMS page live via `claude-in-chrome` (or
writing a Playwright script) for ANY reason — not just reports — read this
first.

**This is a living document.** The section/menu shell described here is core
`@availabs/dms` code shared by every page pattern and theme, but it has
non-obvious gating behavior that is easy to re-discover the hard way. Every
time you verify something in a page's UI and learn a fact that isn't already
written down here — a new selector, a new gotcha, a tool trade-off that
surprised you — **add it before moving on**, in the same session. A stale
version of this doc is worse than no doc, because it reads as authoritative.
If you find a claim below that no longer matches the code, fix it in place
rather than leaving it to rot.

## 1. The page → section shell (DOM map)

A page's body (inside a `LayoutGroup`/`sectionGroup`) is one `sectionArray`
component per named section group. `sectionArray.jsx` renders a CSS grid:

```
div.<sectionArray container classes>              (grid, e.g. "grid grid-cols-6")
  div#<section.id>                                (theme sectionViewWrapper/sectionEditWrapper —
                                                     literally "relative group" in this theme; the
                                                     `group` class is what makes hover-reveal work.
                                                     THIS is the div.relative.group a DOM census
                                                     keys its per-section count on.)
    div.<sectionChrome classes>                    (inner "card" box: border/radius/bg/shadow —
                                                     content padding is the CHILD component's concern,
                                                     not this wrapper's)
      <SectionView> or <SectionEdit>               (see below)
```

Both `SectionView` and `SectionEdit` (`patterns/page/components/sections/section.jsx`)
render the same shape:

```
div                                                (theme.wrapper — EMPTY by default; don't confuse
                                                     this with sectionArray's "relative group" wrapper
                                                     one level up, which is the one that matters)
  div.<theme.topBar>
    div.<theme.menuPosition>                       (absolute top-[5px] right-[5px])
      <NavigableMenu title="Settings">             (the "⋮" trigger — see §2)
  div#<slugified-title>.font-display...            (title row — ONLY if a title/tags/help-text
                                                     exists; see the note on `.font-display` below)
  div.<theme.headerExtensionsRow>                  (site-registered inline extras — only if
                                                     registered for this component type; independent
                                                     of whether the title row rendered)
  div.<theme.contentWrapper>
    <Component.ViewComp/EditComp>                  (the actual Card / Graph / Map / Spreadsheet /
                                                     custom component — this is where each
                                                     component-specific skill picks up)
```

**`.font-display` is not a themed heading style** — it's a literal, hardcoded
Tailwind class on the title row's wrapper `div`, written directly in both
`section.jsx` (SectionEdit's inline header) and `section_components.jsx`
(`ViewSectionHeader`, used by SectionView). It is NOT part of
`theme.heading[level]` (that only styles the text inside). Because it's
hardcoded rather than theme-driven, `div.font-display` is a reliable
title-row selector across every site/theme built on this library.

Sections with no title/tags/help-text skip the header row entirely
(`showHeader` is false) but still render `headerExtensionsRow` if one is
registered — don't assume "no `.font-display`" means "no header extension."

## 2. The Settings menu (`NavigableMenu`) — one universal tree

Every section's "⋮" popup, regardless of component type, is the same
`ui/components/navigableMenu` component fed a config tree built fresh per
render by `getSectionMenuItems()` (`sectionMenu.jsx`). Assembly order:

top action pills (copy link / copy / paste / move / refresh / save / cancel /
**edit pencil**) → **Type** (component-type switcher) → `<Component> Settings`
(the registry's `controls`) → Component Interactions → Templates → **Dataset**
(Source/Version, with **Join**, **Comparison Series**, **Pivot** nested inside
it) → **Columns** → any site-registered extension menus (keyed off the
component name) → **Filters** → **Display** (title/level/tags/nav label/anchor
id/help text/hide) → **Layout** (size, rowspan, border, radius, background,
shadow, permissions) → **Delete**.

A node with a dynamic `name` (a count, a variant label) needs an explicit
stable `id` — `flattenConfig` keys the whole flattened tree by `id || name`
**globally**, so a name that changes mid-session (or collides with a sibling)
gets re-keyed to a random id on the next flatten, which silently blanks or
back-navigates-wrong on that submenu. This has broken real menus (comparison-
series variants, a dynamic-count nav item) — if you're building a menu item
whose `name` isn't a fixed string, give it an `id`.

### The single most-tripped-over gotcha: two different "edit" states

Visiting `/edit/<slug>` puts **every** section into `<SectionView>` with
`editPageMode=true` — a page-level "rearrange sections" mode. Internally,
that section's own `isEdit` is still `false`. In this state the Settings menu
shows only the reduced set (**Type, Dataset, Layout, Delete** — no Measure,
no Columns, no Filters), and no `headerExtensionsRow` content that's gated on
`isEdit` will render. **This is also true of any custom section component
that reads `props.isEdit`** (dataWrapper's per-section flag) to gate its own
mutation UI — e.g. a section with add/remove/reorder controls of its own will
render those controls only once the section is in this true edit state, not
merely because the page is open at `/edit/...`. A component that instead
reads `PageContext`'s page-level `editPageMode` for that same purpose is
diverging from the platform convention (confirmed a real instance of exactly
this in NPMRDS's `ReportRouteList`, fixed 2026-08 — see
`planning/transportny/tasks/current/reportroutelist.md`).

To reach **true** edit mode for one specific section: open that section's
Settings popup, then click the **pencil "Edit"** pill in the top action row.
That calls `onEdit` → `sectionArray.jsx`'s `update(i)` → sets `edit.index = i`,
which swaps **only that one section** to `<SectionEdit>` (`isEdit: true`).
Only now does the Settings menu expand to the full list, and any
`isEdit`-gated content (a custom component's own mutation controls, Measure
Picker, etc.) appears. Only one section can be in true edit mode at a time. A
pick made here (Measure Picker, filters, a custom component's own edits, etc.)
lives in local draft state until you click the floppy-disk **Save** pill —
navigating away, or clicking the orange **Cancel** pill, discards it without
persisting anything.

**Distinguish this from Publish/Discard at the bottom of the page.** Even
after clicking "Save" on one section, that section's config change is only
written to `draft_sections` — it isn't visible to a viewer of the published
page until the page-level **Publish** button is clicked (or reverted via
**Discard**, which resets `draft_sections` back to a clone of the live
`sections`). This draft/publish cycle governs page STRUCTURE only (`sections`/
`draft_sections`, `section_groups`, `dataSources` — see `editFunctions.jsx`'s
`publish()`/`discardChanges()`, which touch nothing else). It has **no
bearing on dataset content** — a Card/Spreadsheet row add/edit/remove (or any
custom component's own dataset-row mutation) calls `apiUpdate` immediately,
straight to the bound dataset's own row/table, with zero staging and no
undo, regardless of whether the page is ever published. Don't conflate "this
section needs its own edit-pencil click before mutating" (true, and the thing
most custom components get wrong) with "content edits go through Publish/
Discard" (false — no dataset-content edit anywhere in DMS does).

**Known live bug, not yet fixed**: in View mode, the Settings trigger button
uses `btnVisibleOnGroupHover={true}`, which composes theme classes as
`hidden group-hover:flex` + a `buttonHidden` override of `sm:hidden`. Tailwind's
responsive-variant ordering makes `sm:hidden` win at ≥640px — so on any normal
desktop viewport the gear is `display:none` regardless of hover, confirmed via
`getComputedStyle`. Practical consequence for browser automation: a plain
`hover` action at approximately the right coordinate often reveals nothing,
and a `find`/`computer` click can land on the WRONG nearby element (an
adjacent section's own "insert new section here" `+` button looks identical
— an icon-only `button` with no accessible name — and both can sit within a
few pixels of each other). Workarounds:
- Prefer `find` with a specific description ("Settings/triple-dot menu button
  for the `<Component Type>` section, not the add-section '+' button") over
  guessing coordinates from a screenshot — it locates the element even though
  it's visually hidden, and re-run it fresh after each click since element
  refs are not stable across DOM changes.
- After clicking, always verify you got the RIGHT popup before proceeding —
  check the "Type" row in the resulting Settings popup matches the component
  you meant to edit (e.g. `ReportRouteList`, not `Rich Text`/`lexical`) before
  trusting anything else in it.
- Playwright / `javascript_tool`: bypass Playwright's visibility-gated
  `.click()` with a native DOM click —
  `document.querySelectorAll('button')` filtered to `display:none`, click the
  one inside the section you want (first-in-DOM-order if there's only one
  section on the page).
- `claude-in-chrome`: if `computer` click fails silently or lands on the
  wrong element, fall back to the same `javascript_tool` native-click
  approach.

**Related but distinct bug, found 2026-08-05: a component placed in the `sidebar` section group
renders its Settings trigger at the wrong screen position entirely**, not just hidden. The trigger's
`menuPosition` div (`absolute top-2 right-2`) escapes to a containing block far wider than the
sidebar rail — confirmed live on `ReportRouteList`'s own trigger, which rendered ~150-300px to the
*right* of its actual card, overlapping unrelated main-content sections. The popup itself still opens
in the right place once clicked (it doesn't inherit the trigger's mispositioning), so this is a
click-target bug, not a rendering bug in the popup. Two ways to actually land the click:
- Give the card a real `hover` action first (`computer`'s `hover`, at a point inside the section's own
  card) to force `group-hover:flex`, THEN query for the now-`display:flex` button (filter
  `getComputedStyle(b).display !== 'none'`) and click its real coordinates — confirmed this makes the
  trigger briefly render at its *intended* position relative to the hovered card.
- Or skip coordinates entirely: walk up from a known text node inside the component (e.g. its title)
  to the section's outer wrapper, `querySelector('[class*="absolute"][class*="top-2"][class*="right-2"] button')`
  inside it, and call `.click()` directly — works regardless of `display:none` or mispositioning,
  since a programmatic `.click()` doesn't care about either.
Not yet root-caused (the whole main-content grid's sections don't hit this — only sidebar-placed
ones so far observed) and not fixed; flagged for whoever touches `sectionGroup.jsx`'s rail rendering
next. See `planning/transportny/tasks/current/dynamic-reports-and-route-tags.md`, item 1's "Route Row
visual redesign" section, for where this was found.

## 3. Charts (`avl-graph`)

Every chart type (`BarGraph`, `LineGraph`, `PieGraph`, `TreemapGraph`,
`SunburstGraph`, `GridGraph`) renders the identical shape:

```
div.avl-graph-container
  svg.avl-graph        (class list is literally "w-full h-full block avl-graph <extra>")
```

A blank/broken chart still has this element — an empty `<svg class="avl-graph">`
with zero `path`/`rect`/`circle` children. Distinguishing "no svg at all
(section never rendered / component crashed)" from "svg present but empty
(rendered, but the query returned nothing or a display setting hid it)" is
the actual diagnostic signal — check both, don't stop at "svg exists."

Chart-type-specific authoring details (measure picks, comparison-series
fan-out, the axis/categorize binding model) belong in
[`authoring-graphs.md`](./authoring-graphs.md) and
[`difference-graphs.md`](./difference-graphs.md), not here — this doc only
covers the DOM shape you'd query for.

## 4. Known state-machine / URL gotchas (check this list before concluding a bug)

- **Subdomain routing, not path routing.** A pattern's page lives at
  `http://<subdomain>.localhost:5173/<slug>` — bare `localhost:5173/<slug>`
  resolves to the default/landing pattern instead (zero data-loading traffic
  fires; easy to misread as "the page never loads its sections"). Find the
  subdomain via `dms pattern show <pattern-name>`.
- **Edit URL puts `edit` first**: `/edit/<slug>`, not `<slug>/edit`. The wrong
  shape silently falls back to the site's default/index page.
- **Any unresolvable slug silently falls back to the home/index page** —
  rather than erroring. A typo'd slug and an actual permission denial render
  identically (full rich content, no error text). Don't over-interpret a
  fallback render as a permission problem before double-checking the URL.
- **A stale injected auth token silently degrades to anonymous** rather than
  erroring — a rendered-but-view-only page (settings/edit affordances all
  missing) is as likely to mean "expired token" as "real permissions issue."
  Check the JWT's own `exp` claim (base64-decode the middle segment) before
  concluding anything from an authenticated probe.
- **A newly-created page's `draft_sections` are not a verbatim copy of its template's, even though
  `editFunctions.jsx`'s `newPage()` looks like it deep-clones them.** Inspecting `draft_sections` on
  a template row (`<pattern>|page_template`) shows plain inline objects (`element`/`trackingId`
  embedded directly, no top-level `id`). Inspecting the SAME field on a real page created from that
  template afterward shows light refs instead (`{id, ref: '...|component'}`, or just `{id}`) — each
  `id` pointing at its own separate `<pattern>|component` row, materialized fresh at some point
  after `newPage()` runs (not yet root-caused which step does this). For most component types this
  materialization faithfully copies the template's stored `element-data`, but has been observed to
  reset at least one component type's copy to its registry's generic, empty `defaultState` instead of
  the template's custom content — inconsistent across repeated attempts, not resolved. **Practical
  implication**: don't trust a template-row edit to survive into newly-created pages without directly
  checking a REAL page created via **+ Add Page → Your Templates**, by id, after creation — checking
  only the template row itself proves nothing about what new pages will actually get.
- **Cloning a template's `draft_sections` via direct CLI/raw DB writes (to build a disposable
  verification page without touching the user's real pages) is NOT equivalent to a real "+ Add Page
  from Template" click**, precisely because of the materialization step above — a CLI-cloned page's
  sections stay inline (no `id`). Any code that discovers sibling sections by filtering on
  `section.id != null` (a common pattern — see `traversing-report-pages.md`'s `findSelfBoundGraphs`
  example) will find NOTHING on a CLI-cloned test page regardless of whether the underlying config is
  correct — this is a property of the shortcut, not a real bug, and it's easy to misdiagnose as one.
  If you need to verify template-derived behavior, go through the real UI flow (or at minimum confirm
  the test page's sections have real `id`s before trusting a "nothing shows up" result).
- **Map/MapLibre sections render as a blank dark rectangle in automation**
  until the tab gets a resize event — the WebGL canvas never becomes visible
  otherwise, so MapLibre's `load` never fires and the plugin never mounts.
  Two `resize_window` calls (different sizes, ~6s then ~16s apart) — the
  first brings the panel/basemap, the second brings the vector-tile data
  layers. Do not conclude anything about a map section's UI from an
  un-resized screenshot.

- **A draft page is invisible in the nav in VIEW mode, and marked `*` in edit
  mode.** `dataItemsNav` filters `published !== 'draft'` unless `edit` is set,
  and appends `*` to a draft's label. So a freshly seeded pattern's sidenav/
  topnav looks empty at `/<base>/<slug>` and correct at `/<base>/edit/<slug>` —
  that is the draft lifecycle, not a broken nav. Verify seeded pages in edit
  mode until a human publishes them.
- **A modal section group (`isModal`) renders INLINE in edit mode and reads
  `item.sections` in view mode.** Both together mean a draft-only page can never
  show its modal behaving: `/edit` shows the modal's sections as an ordinary
  band (which is how you author them), and view mode has no published
  `sections` to render. Check a modal's *content* in edit mode; check its
  *behaviour* only after publishing (a throwaway page works).

## 5. Extending this doc

When you learn something new while verifying a DMS page live:
- A new general truth about the section/menu/graph shell (applies to every
  page/pattern/theme, not just one you were looking at) → fold it into
  §1–§4 above, replacing anything it makes stale.
- A narrow one-off ("this specific component's Settings menu also does X",
  or anything specific to one pattern/theme's own custom components) →
  belongs in that component's own skill (`card-layout.md`,
  `authoring-graphs.md`, `traversing-report-pages.md`, etc.), not here.
