# Graph title can share a row with a top-positioned legend

**Status: DONE, live-verified** (2026-09-04)

## Objective

TransportNY's NPMRDS report pages flipped their `avlGraph` legend default from `bottom`/`bottom-right`
to `top`/`top-right` (see dms-template's `planning/transportny/tasks/current/
npmrds-reports-routes-feedback-triage.md`, Item 4). With the legend now sitting at the top, Ryan
wanted the graph-native title to sit inline with it (title left, legend right) instead of stacking
above it, to save vertical space — but this is shared `graph_new` code used by every DMS site, and
other NPMRDS graphs (Macro View, MAP-21 PM3) may still want the old stacked look. Mid-implementation,
Ryan explicitly asked for this to be backward-compatible, themeable, and opt-in — not a blanket
change to shared code or even to the whole TransportNY site.

## Design

Three-part mechanism, each part answering "why here, why not somewhere broader":

1. **A new avlGraph theme *style*, not a site-wide default.** `theme.titleInlineWithLegend: true`
   lives on a named entry in `avlGraph.styles[]` (a site can have many named styles; only one is the
   *default*, `options.activeStyle`). TransportNY added `styles[1]`, name `"reportInlineTitle"`
   (`src/themes/transportny/themev2.js`), which inherits every key from `styles[0]` ("default")
   except this one new key — `getComponentTheme`'s existing "non-default styles inherit missing keys
   from styles[0]" behavior does the rest. The site-wide default (`styles[0]`, `activeStyle: 0`) is
   completely untouched, so every graph that doesn't opt in (any other TransportNY graph, and every
   other site's graphs) renders byte-identically to before this change.

2. **Selected per-section, via the section row's own `activeStyle` field** — not a page-level or
   pattern-level setting. Traced the existing plumbing: `section.jsx`'s `value?.activeStyle` (a
   top-level field on the section row, sibling to `border`/`title`/`group`) → `ComponentContext` →
   `graph_new/index.jsx`'s `getComponentTheme(contextTheme, 'avlGraph', activeStyle)` — this
   mechanism already existed (built for exactly this kind of per-instance style variant) and needed
   zero changes. TransportNY's two "mint a brand-new Report-page graph section" call sites
   (`scripts/npmrds-reports/report_build.mjs`'s `graphSectionData()` and dms-template's
   `src/themes/transportny/components/ReportRouteList/useAddGraphSection.js`) set
   `activeStyle: 'reportInlineTitle'` on the section row they create, gated on the section actually
   being an `'AVL Graph'` (Map/Spreadsheet-backed InfoBox/RouteCompare sections have no avlGraph
   theme to select). Every other NPMRDS graph — Macro View, MAP-21 PM3, anything hand-authored via
   the generic "+ Add Graph" flow outside a Report page context, or any pre-existing report — never
   sets this field, so it stays on `"default"`.

3. **Rendering logic in `graph_new`** (this repo, the actual code change):
   - `packages/dms/src/ui/components/graph_new/GraphComponent.jsx` — derives
     `titleInline = Boolean(theme.titleInlineWithLegend) && Boolean(graphFormat.legend?.show) &&
     String(graphFormat.legend?.position || '').startsWith('top')`. When true, the already-built
     `<GraphTitle>` element is passed down as a new `titleNode` prop to the underlying chart
     component instead of being rendered standalone above it. **Safety net:** any other combination
     (legend hidden, or positioned left/right/bottom/bottom-*) leaves `titleInline` false, so the
     title renders in its normal standalone spot — the title can never be silently dropped just
     because a theme opted in but the section's own legend config doesn't support sharing a row.
   - `components/LineGraph.jsx`, `components/BarGraph.jsx` (identical shape in both) — their
     existing `legend.position === "top"` block (a `flex justify-center shrink-0` div) now renders
     `{props.titleNode}` before `{InstantiatedLegend}`, switching to `justify-between gap-3` only
     when `titleNode` is actually passed; `justify-center`-only, byte-identical to before, otherwise.
   - `components/GridGraph.jsx` — same idea, but its top-legend block uses corner-specific classes
     (`justify-end` for `top-right`, unset for `top-left`) instead of `justify-center`. When
     `titleNode` is present, `justify-between` wins over the corner-specific class regardless of
     which corner — with exactly 2 flex children (title, legend) the corner distinction has nothing
     left to express (title always reads left, legend always reads right); this is a deliberate
     simplification, not an oversight, and is called out in the code's own comment.

## Files changed (this repo)

- `packages/dms/src/ui/components/graph_new/GraphComponent.jsx`
- `packages/dms/src/ui/components/graph_new/components/LineGraph.jsx`
- `packages/dms/src/ui/components/graph_new/components/BarGraph.jsx`
- `packages/dms/src/ui/components/graph_new/components/GridGraph.jsx`
- `skills/authoring-graphs.md` — documented the new theme flag + opt-in mechanism
- `skills/traversing-dms-pages.md` — unrelated small addition from the same session (see below)

TransportNY-side wiring (dms-template, not this submodule): `src/themes/transportny/themev2.js`
(new `reportInlineTitle` style), `src/themes/transportny/components/ReportRouteList/
useAddGraphSection.js`, `scripts/npmrds-reports/report_build.mjs` — see dms-template's
`npmrds-reports-routes-feedback-triage.md` for that half.

## Live verification

Both TransportNY mint points, both with real ClickHouse data:

- **UI "+ Add Graph"** (`useAddGraphSection.js`): built a scratch report via the real
  "+ Create Report" → "+ Add Route" → "+ Add Graph" click flow (page since deleted), with a real
  route and a real date range. Confirmed visually: "TRAVEL TIME (MIN)" title and a "■ Route 5 Part"
  legend swatch render side by side in one row, title left / legend right, on a rounded card.
- **CLI builder** (`report_build.mjs`): built a scratch report from a spec (since deleted). Confirmed
  via raw DB read that the section row carries `activeStyle: "reportInlineTitle"` alongside
  `legend.position: "top"`, and via DOM inspection (`document.querySelectorAll`, matched on the new
  `flex items-center shrink-0 justify-between gap-3` class combination) that the wrapper renders
  with exactly 2 children — the title node and the legend node. This particular scratch report's own
  chart had no visible data (a separate, pre-existing, unrelated gotcha: sections materialized via a
  CLI/raw-DB clone rather than a real page-creation click don't self-bind to `ReportRouteList`'s
  routes — see `traversing-report-pages.md`), but the structural proof holds regardless of whether
  the chart itself has data to show.
- **Backward compatibility**: re-checked an existing, unrelated, already-published TransportNY report
  (`reports/beacon_9_d_jan_25_vs_26`, real content, not touched by this change) — renders exactly as
  before: square/borderless cards, no legend row, standalone title. Confirms the opt-in scoping
  actually holds in practice, not just in the code path.

No regression suite run against other sites' graphs (Pie/Treemap/Sunburst were not touched at all;
Bar/Line/Grid's changed blocks are unconditional on `props.titleNode` being falsy, which it is for
every caller that doesn't explicitly pass it — i.e. every site/graph other than TransportNY's own
Report-page sections).
