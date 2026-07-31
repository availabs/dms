# Traversing and verifying a DMS report page

A map of what a rendered report page actually looks like in the DOM, plus a
decision guide for which tool to reach for when you need to look at one live
(the Playwright probe harness, the `dms`/`dbq.py` CLIs, or `claude-in-chrome`).

**This is a living document.** The section/menu shell described here is core
`@availabs/dms` code shared by every page pattern, but it has non-obvious
gating behavior that is easy to re-discover the hard way. Every time you
verify something in a report page's UI and learn a fact that isn't already
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
                                                     THIS is the div.relative.group report_probe.mjs
                                                     keys its per-section census on.)
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
  div.<theme.headerExtensionsRow>                  (site-registered inline extras — Quick Controls
                                                     pills, CalloutStatPicker — only if registered
                                                     for this component type; independent of whether
                                                     the title row rendered)
  div.<theme.contentWrapper>
    <Component.ViewComp/EditComp>                  (the actual Card / AVL Graph / Map / Spreadsheet /
                                                     ReportRouteList / etc. — this is where each
                                                     component-specific skill picks up)
```

**`.font-display` is not a themed heading style** — it's a literal, hardcoded
Tailwind class on the title row's wrapper `div`, written directly in both
`section.jsx` (SectionEdit's inline header) and `section_components.jsx`
(`ViewSectionHeader`, used by SectionView). It is NOT part of
`theme.heading[level]` (that only styles the text inside). Because it's
hardcoded rather than theme-driven, `div.font-display` is a reliable
title-row selector across every site/theme built on this library — that's
why `report_probe.mjs` uses it for its per-section census.

Sections with no title/tags/help-text skip the header row entirely
(`showHeader` is false) but still render `headerExtensionsRow` if one is
registered — many AVL Graph sections have no title of their own (a separate
Card stacks a title above them instead), so don't assume "no `.font-display`"
means "no header extension."

## 2. The Settings menu (`NavigableMenu`) — one universal tree

Every section's "⋮" popup, regardless of component type, is the same
`ui/components/navigableMenu` component fed a config tree built fresh per
render by `getSectionMenuItems()` (`sectionMenu.jsx`). Assembly order:

top action pills (copy link / copy / paste / move / refresh / save / cancel /
**edit pencil**) → **Type** (component-type switcher) → `<Component> Settings`
(the registry's `controls`) → Component Interactions → Templates → **Dataset**
(Source/Version, with **Join**, **Comparison Series**, **Pivot** nested inside
it) → **Columns** → any site-registered extension menus (e.g. NPMRDS's
Measure Picker, keyed off the component name) → **Filters** → **Display**
(title/level/tags/nav label/anchor id/help text/hide) → **Layout** (size,
rowspan, border, radius, background, shadow, permissions) → **Delete**.

A node with a dynamic `name` (a count, a variant label) needs an explicit
stable `id` — `flattenConfig` keys the whole flattened tree by `id || name`
**globally**, so a name that changes mid-session (or collides with a sibling)
gets re-keyed to a random id on the next flatten, which silently blanks or
back-navigates-wrong on that submenu. This has broken real menus twice
(comparisonSeries variants, a dynamic-count nav item) — if you're building a
menu item whose `name` isn't a fixed string, give it an `id`.

### The single most-tripped-over gotcha: two different "edit" states

Visiting `/edit/<slug>` puts **every** section into `<SectionView>` with
`editPageMode=true` — a page-level "rearrange sections" mode. Internally,
that section's own `isEdit` is still `false`. In this state the Settings menu
shows only the reduced set (**Type, Dataset, Layout, Delete** — no Measure,
no Columns, no Filters), and no `headerExtensionsRow` content that's gated on
`isEdit` will render (Quick Controls, Measure Picker, etc. — anything
requiring true edit state).

To reach **true** edit mode for one specific section: open that section's
Settings popup, then click the **pencil "Edit"** pill in the top action row.
That calls `onEdit` → `sectionArray.jsx`'s `update(i)` → sets `edit.index = i`,
which swaps **only that one section** to `<SectionEdit>` (`isEdit: true`).
Only now does the Settings menu expand to the full list, and any
`isEdit`-gated `headerExtensionsRow` content appears. Only one section can be
in true edit mode at a time. A pick made here (Measure Picker, filters, etc.)
lives in local draft state until you click the floppy-disk **Save** pill —
navigating away without it silently discards the change.

**Known live bug, not yet fixed**: in View mode, the Settings trigger button
uses `btnVisibleOnGroupHover={true}`, which composes theme classes as
`hidden group-hover:flex` + a `buttonHidden` override of `sm:hidden`. Tailwind's
responsive-variant ordering makes `sm:hidden` win at ≥640px — so on any normal
desktop viewport the gear is `display:none` regardless of hover, confirmed via
`getComputedStyle`. Workarounds:
- Playwright / `javascript_tool`: bypass Playwright's visibility-gated
  `.click()` with a native DOM click —
  `document.querySelectorAll('button')` filtered to `display:none`, click the
  one inside the section you want (first-in-DOM-order if there's only one
  section on the page).
- `claude-in-chrome`: try `find` with a description ("Settings button for the
  X section") first — it may locate the element even though it's visually
  hidden; if `computer` click fails silently, fall back to the same
  `javascript_tool` native-click approach.

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
  `report_<old_id>`-style slugs are a deprecated/unstable scheme (title-derived,
  recomputed on every title save) — get a real, currently-valid slug from
  `scripts/npmrds-reports/pick_test_report.py` instead of guessing one.
- **A stale injected auth token silently degrades to anonymous** rather than
  erroring — a `0/N` sections result on an authenticated probe is as likely
  to mean "expired token" as "real bug." Check the JWT's own `exp` claim
  (base64-decode the middle segment) before concluding anything from an
  `--auth` probe.
- **Map/MapLibre sections (Route Map, macroview, the route-creation tool)
  render as a blank dark rectangle in automation** until the tab gets a
  resize event — the WebGL canvas never becomes visible otherwise, so
  MapLibre's `load` never fires and the plugin never mounts. Two
  `resize_window` calls (different sizes, ~6s then ~16s apart) — the first
  brings the panel/basemap, the second brings the vector-tile data layers.
  Do not conclude anything about a map tool's UI from an un-resized
  screenshot.

## 5. Which tool to reach for

Both paths can inspect the exact same DOM described above — the difference
is cost shape, not capability. Reach for the disposable script by default;
reach for `claude-in-chrome` when the task is genuinely interactive or
exploratory.

| Situation | Use |
|---|---|
| Checking a hypothesis across many sections/reports at once (SVG census, non-200s, pending requests) | `report_probe.mjs` |
| Need the exact `/graph` Falcor request+response — decoded UDA `options` (filterGroups, comparisonSeries, seriesVariants), numeric leaf values | `report_probe.mjs` (decodes this for you) or `dbq.py graph` for a single ad-hoc path |
| Need edit-mode (authenticated) rendering, without touching the user's real session | `report_probe.mjs --auth` (injects a minted token into a disposable headless browser) |
| The check will be re-run across a dev cycle, or you want a durable jq-able artifact | `report_probe.mjs` (writes a JSON dump) |
| A multi-step click-path where each next click depends on what the last one revealed (open Settings → click pencil Edit → open a submenu → pick a value → Save) | `claude-in-chrome` — writing a novel Playwright `--eval` for a one-shot exploratory click-path costs more than just doing it live |
| Judging how something actually looks/behaves — hover states, tooltip formatting, animation, "does this look right" | `claude-in-chrome` (screenshots from the probe are static, full-page/section only) |
| The user wants to watch or validate side-by-side, or you want to hand them a recorded repro | `claude-in-chrome` (+ `gif_creator` for a walkthrough) |
| Working in the user's already-authenticated real session and minting/refreshing a dev token would be overhead | `claude-in-chrome` |
| Any MapLibre section | Either works, but the `resize_window` fix (§4) is the proven path — expect the same issue in headless Playwright and consider `headless:false` there if it recurs |
| A one-off "let me just go look at this" glance | `claude-in-chrome` — extending a committed script for a single glance isn't worth it |
| Reading/writing DMS content itself (pages, sections, sources) rather than rendered output | `dms` CLI, per repo `CLAUDE.md` — not either browser tool |
| A read-only DB check (old/new/dama Postgres, ClickHouse) | `dbq.py <old|new|dama|ch>` — never hand-roll a psql/urllib one-off |
| "Is the stack even up" | `preflight.py` first, always — before any of the above |

`claude-in-chrome`'s `javascript_tool` closes the gap when you need
programmatic DOM inspection but want it against the live, authenticated tab
instead of a disposable one — the same `querySelector('div.relative.group')` /
`svg.avl-graph` census logic from `report_probe.mjs` works verbatim there.
Don't treat the two tools as mutually exclusive; use whichever failure mode
you'd rather have (a throwaway headless browser vs. touching a real session).

**Never live-test a multi-step click-path (anything that clicks Save,
Delete, Publish, or drags sections) against a page the user might have open**
— create or reuse a dedicated scratch report for that. Read-only page loads
(via `pick_test_report.py`'s output, or `report_probe.mjs` against any real
`converted_reports/<slug>`) are fine on real pages since they only navigate
and capture, never click.

## 6. Extending this doc

When you learn something new while verifying a report page live:
- A new general truth about the section/menu/graph shell (applies to every
  page, not just the one you were looking at) → fold it into §1–§4 above,
  replacing anything it makes stale.
- A narrow one-off ("this specific component's Settings menu also does X")
  → belongs in that component's own skill (`card-layout.md`,
  `authoring-graphs.md`, etc.), not here.
- A tool trade-off you discovered the hard way → add a row to the §5 table
  rather than a paragraph; keep the table scannable.
