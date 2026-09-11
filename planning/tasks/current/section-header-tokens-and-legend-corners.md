# Section header band tokens + legend corner positions

**Status:** **BUILT + live-verified 2026-09-11.** Both halves shipped and regression-tested; the
transportny side that consumes them is regenerated across 12 report templates.
**Started:** 2026-09-11

This is the `@availabs/dms` half of
[`planning/transportny/tasks/current/report-graph-card-header-and-titles.md`](../../../../planning/transportny/tasks/current/report-graph-card-header-and-titles.md)
in the parent repo — read that for the why, the design contract, and the site-side values. This file
is the library contract and, more importantly, the back-compat argument.

Sibling: [`avlgraph-legend-and-padding-theming.md`](./avlgraph-legend-and-padding-theming.md) owns
the legend's *chrome* (class tokens, caption, ramp geometry) and the card padding. This file owns
the *section header band* and legend *placement*. They meet inside the same card; neither's changes
touch the other's files.

## ▶ START HERE

Two independent changes, both additive, both with the same failure mode to guard against: a token
or value that previously did nothing, and therefore has unknown live values sitting in real themes
and real section rows.

| # | change | files | blast radius |
|---|---|---|---|
| 1 | Section header band becomes themeable, and `pages.section` becomes style-selectable per section | `section_components.jsx`, `section.theme.jsx`, `section.jsx` | **154,632** MitigateNY component rows carry a non-empty `title` and render through this band (vs 5,007 in npmrdsv5) |
| 2 | The four legend CORNER positions work on all six graph wrappers, not just GridGraph | `graph_new/components/utils.js` + the 5 wrappers, `graph_new/config.jsx` | every graph that renders a legend, ~7,415 of them in MitigateNY |

**Tests: 23 new, 85 green across the graph/section suites.**
`packages/dms/tests/viewSectionHeaderLegacy.test.js` (15), `sectionHeaderTokens.test.js` (9 — one
is a regression lock, see below), `legendPosition.test.js` (8).

## 1 · Section header band tokens

`ViewSectionHeader` (`section_components.jsx`) hardcoded its entire band: a 50px row,
`font-display font-medium uppercase`, and a title class of `w-full ${theme.heading[level]}`.
`pages.section`'s token list had `wrapper` / `topBar*` / `menuPosition` / `editIcon` /
`contentWrapper` / `headerExtensionsRow` / `editMinHeight` / `heights` — nothing for the header, the
title, or a subtitle. No theme could reach any of it.

**Added** (`section.theme.jsx`, each defaulting to the exact literal the component emitted before):

| token | default |
|---|---|
| `headerRow` | `flex w-full min-h-[50px] items-center pb-2` |
| `headerInner` | `flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center` |
| `headerTitleWrap` | `flex-1` |
| `headerActions` | `flex item-center h-full pointer-events-auto` |
| `headerTitle` | `''` — **appended** to the historical `w-full ${heading}` string, never replacing it |
| `headerKicker` | `''` — unset ⇒ the section's `description` is never rendered |
| `headerExtensionsInline` | `false` |
| `headerExtensionsInlineRow` | `shrink-0 flex items-center gap-1.5` |

Plus a "Section Header" group in the admin theme editor's generated control list.

**`description` gets a render path.** It has been a registered section attribute in
`page.format.js` for years with nothing drawing it. Measured 2026-09-11: **zero** sections carry a
value, site-wide — so giving it one cannot surface text an author never expected to see. Gated on
the TOKEN rather than the value, so a site that later fills a description still shows nothing until
it opts in.

### `pages.section` is now style-selectable per section

`section.jsx` called `getComponentTheme(fullTheme, 'pages.section')` with **no selector** — one
style for the whole site. It now passes `value.activeStyle`, the same field that already selects a
section's component style (graph_new / Card / spreadsheet all read it off the `activeStyle` prop).

One field, several component scopes. `getComponentTheme` falls back to `styles[0]` on any name it
doesn't recognise, so a section naming a style only one scope defines is a strict no-op in the
others — which is what makes this additive, and what lets the consuming site migrate section by
section with no backfill and no guard.

Site-wide would have been wrong: a brand wants a bordered card band on a report graph and nothing of
the sort on a documentation page, and both are `pages.section`.

### The back-compat argument

`viewSectionHeaderLegacy.test.js` asserts the **exact rendered HTML** of 9 header shapes (title
only, each `level`, tags, one and two help texts, an empty help doc, a site with no `theme.heading`
at all) against goldens captured from the code as it stood *before* the tokens existed — down to the
trailing space in `class="w-full "` and the literal `class="w-full undefined"` a missing heading map
produces. Regenerate them only via
`packages/dms/tests/fixtures/capture-viewSectionHeaderLegacy.mjs`, which is a deliberate act: doing
so means you intend to change what 154,632 MitigateNY sections look like.

### Gotcha worth keeping: `headerExtensions.length` is not a render signal

The first build hid the kicker whenever `headerExtensions` was non-empty, on the theory that
inline extensions and the kicker compete for the same slot. An extension builder returns a React
node whose *component* may then render `null` — npmrds' Quick Controls do exactly that outside
page-edit mode — so array length says nothing about whether anything is drawn. The meta line
vanished on every report card in view mode, the one mode it exists for. Both share the slot now;
a theme that wants the kicker to yield on a narrow card does it with a breakpoint in the token.
Locked by a named regression test.

## 2 · Legend corner positions on every wrapper

A legend's `position` is one of four bare edges (`left`/`right`/`top`/`bottom`) or four corners
(`top-left`/`top-right`/`bottom-left`/`bottom-right`).

**Five of the six wrappers only ever understood the bare four.** `BarGraph`, `LineGraph`,
`PieGraph`, `TreemapGraph` and `SunburstGraph` each matched with strict equality
(`legend.position !== "top" ? null : …`), so a corner value matched **no branch at all** and the
legend silently did not render — no fallback, no warning, just a chart with no key. Only
`GridGraph` handled corners (`legend.position.includes("top")`).

The author-facing option lists offered corners *only* for GridGraph
(`config.jsx`'s `legend` vs `legendForGridGraph`, and transportny's `LEGEND_POSITION_OPTIONS` vs
`…_GRID`), which meant the gap was unreachable through the UI — hidden rather than closed.

**Fixed** with three shared helpers in `graph_new/components/utils.js`, used by all five:

```js
isTopLegend(pos)            // startsWith("top")
isBottomLegend(pos)         // startsWith("bottom")
isColumnLegendPosition(pos) // either of the above
legendRowJustify(pos)       // "-right" → justify-end, "-left" → justify-start, else justify-center
```

Shared rather than re-inlined per wrapper so the six can't drift again. **BC by construction:** a
bare `top`/`bottom` resolves to `justify-center`, the literal every wrapper hardcoded, so no
existing legend anywhere moves. `legendPosition.test.js` pins that explicitly, including the
"unset position must not become a top row" case, and asserts that *every* position the author-facing
control offers actually matches a branch — so a ninth option can't be added without teaching the
helpers about it.

**The two split option lists are now one** list of all eight positions for every graph type, in both
`config.jsx` and transportny's `composeMeasureConfig.js`. `LEGEND_POSITION_OPTIONS_GRID` is kept as
an alias so nothing that imported it breaks.

### ⚠ Deployment coupling

transportny's `DEFAULT_LEGEND_POSITION_BY_GRAPH_TYPE` is now `top-right` for Bar, Line and Grid, and
all 12 NPMRDS report templates have been regenerated with it. **Those pages lose their legends
entirely on any build that lacks these helpers** — the corner value hits no branch, exactly as
before. Ship the library change with (or before) the content. Ryan is aware: *"i know, if u need to
make dms graph changes for legend positioning, itll break the live deploy once we regenerate the
dynamic reports. not a huge deal just need to be aware."*

## Verification

- 85 tests green across the section + graph suites.
- Live on `www.localhost:5173`: 12 regenerated report templates, 116 graph sections, 92 chart
  legends all measured at **17px from the card's right edge** (the graph's own `p-4` plus the card
  border), 0 at any other position, 0 legends lost. 0 console / page / SQL errors.
- Non-report pages unchanged: MAP-21 and `tsmo/congestion_v2` render 0 `reportCard` bands; a report
  built before the change still renders `flex w-full min-h-[50px] items-center pb-2` verbatim.
- Golden-corpus blockers were confirmed identical with the work `git stash`ed — pre-existing drift
  ("was blank → has content"), checked rather than assumed.

## Not done

- `SectionEdit` has its own separate header markup (the true per-section edit state, distinct from
  page-edit mode) and is **not** themed by these tokens. Deliberate — it is a transient editing
  surface — but it now looks different from the view band on a themed site.
- The old-report converter (`convert_old_reports_lib/`, parent repo) doesn't stamp `activeStyle` or
  the legend position yet, so a newly converted report still gets the pre-2026-09-11 look.
