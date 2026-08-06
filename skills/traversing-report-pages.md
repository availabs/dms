# Traversing and verifying a DMS report page

A decision guide for which tool to reach for when you need to look at a
report page live (the Playwright probe harness, the `dms`/`dbq.py` CLIs, or
`claude-in-chrome`), plus everything specific to NPMRDS's report machinery —
the `ReportRouteList` panel, its route-picker modal, and Dynamic Reports.

**Read [`traversing-dms-pages.md`](./traversing-dms-pages.md) first.** The
page → section DOM shell, the universal Settings (`NavigableMenu`) tree, the
two-different-"edit"-states gotcha (page-level `/edit/<slug>` vs. one
section's true `SectionEdit`), the chart DOM shape, and the general
state-machine/URL gotchas are all core `@availabs/dms` facts that apply to
every page in every pattern/theme — they live there now, not duplicated here.
Everything below is specific to NPMRDS's report pages.

**This is a living document.** Every time you verify something in a report
page's UI and learn a report-specific fact that isn't already written down
here, add it before moving on, in the same session. A stale version of this
doc is worse than no doc, because it reads as authoritative. If you find a
claim below that no longer matches the code, fix it in place rather than
leaving it to rot.

## 4. Creating a report page, and the Route List panel (tags, Dynamic Reports)

### Creating a page via "+ Add Page → Your Templates"

1. Get to **any** page in edit mode (`/edit/<slug>`).
2. In the **bottom edit toolbar**, click the **"Pages"** icon (a document glyph,
   fourth of the six — Settings/Data Sources/Section Groups/**Pages**/History/
   Permissions). This is the site's full page tree + management pane. **Not**
   the same as the site's own top-nav "Reports"/"Routes"/etc. links — those are
   end-user content navigation for whatever pattern you're in, and clicking one
   does not open this panel (confirmed live: it silently kept showing whatever
   page was already loaded).
3. Click **"+ Add Page"** at the bottom of that panel → a "Choose a template"
   modal opens with two tabs: **Theme Templates** (Blank, Article, Two Column,
   Card Grid, Stats + Chart, Narrative, Overview, Profile, Dashboard — shipped,
   available to every site) and **Your Templates** (DB-backed,
   pattern-specific — this is where a pattern's own saved templates live, e.g.
   NPMRDS's **"Report Page"**, see `page-templates.md`).
4. Switch to **Your Templates**, pick the template, **Create Page**.
5. The new page is created as a **top-level page** (`parent: ''`), regardless
   of which page you had open when you clicked "+ Add Page" — it does **not**
   nest under it. Slug is auto-assigned (`page_N`); rename/move via that page's
   own Settings pane afterward if it needs a real slug/parent.

Verified 2026-08-03: a freshly-created "Report Page" page (zero custom code,
zero scripts involved) already has a working `ReportRouteList` panel + one
starter self-bound AVL Graph section, ready to receive a route the moment one
is added via "+ Add Route" — useful as a clean, un-scripted reproduction
environment when you need to rule out "is this bug specific to some other
build path" (this is exactly how a genuine AVL Graph rendering bug was
isolated away from a suspected feature-specific cause — see
`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md`, repo root).

### The route-picker modal ("+ Add Route" / "+ Add Route Slot")

NPMRDS's `ReportRouteList` panel's add-route action opens
`RouteTagBrowserModal` — a single-pane drill-down (root → category → value),
not a flat catalog list:

- **Root view**: a name-search box + "Browse by tag" category tiles —
  **County** (62 values), **Region** (NYSDOT's 11 regions), **Agency**
  (~18 division/MPO codes), **Auto-generated** (system-generated routes), and
  **Other tags** (free-text substring match, for custom/`project:`-style tags
  with no fixed vocabulary).
- Category drill-downs are a **hardcoded fixed value list**, not a live "distinct
  tag values" DB query (no such primitive exists yet in the UDA engine).
- A route **already on the report** shows an "Already on report" badge instead
  of being hidden in any deliberate lookup (name search, a tag-browsed folder,
  Other-tags text) — only the default/root "recent" list excludes them, to
  keep that specific suggestion view uncluttered. Re-adding one for a different
  date/time window is a supported, legitimate action.
- The same modal component serves two selection modes: `selectionMode="any"`
  (normal "+ Add Route" — 1 or more) and `selectionMode="exact"` +
  `requiredCount=N` (Dynamic Reports' entry gate, below — exactly N required
  before the confirm button enables).

### Dynamic Reports: the toggle, and the no-param entry gate

Any report page can be flipped into a **Dynamic Report** — one shared page,
reused by many viewers, whose routes are filled from a URL param at view time
rather than stored on the page. Full design record:
`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md` (repo root — an
NPMRDS-theme feature, not core DMS). The essentials for navigating one live:

- The toggle lives **inside the `ReportRouteList` panel itself**, in edit
  mode, right above "+ Add Route"/"+ Add Graph" — a small switch labeled
  "Dynamic Report" with a one-line explanation. It is **not** in the page's
  generic Settings pane; core DMS has no field for this.
- Flipping it on swaps "+ Add Route" for **"+ Add Route Slot"** (adds a bare
  placeholder route with no concrete data yet — assign it to a graph exactly
  like a normal route, via the same per-graph chip UI) and registers a
  `type: 'routeSlots'`-tagged entry in the page's own `data.filters` (a
  `searchKey`, e.g. `routes`, `useSearchParams: true` — the URL param name).
- **Viewing** a Dynamic Report with no `?routes=` param pops the same
  `RouteTagBrowserModal`, `selectionMode="exact"`, `requiredCount` = however
  many slots are configured — but with **no dismiss path** (a no-op
  `setOpen`) until exactly that many routes are picked. Confirming navigates
  to `?routes=<id1>|||<id2>...` — multi-value URL params use `|||` as the
  delimiter throughout this app (`convertToUrlParams`/`_utils/index.js`), not
  commas.
- Reloading the same `?routes=...` URL directly re-resolves with no gate (the
  URL is the durable/shareable state); a different `?routes=` value on the
  same page renders a different route's real data — the core mechanism.

### `ReportRouteList` is invisible on any real (non-`/edit/`) view, by design

Built 2026-08-05. `ReportRouteList` renders nothing at all to a real viewer — no sidebar, no card, no
empty box — except the blocking entry-gate modal above when a Dynamic Report still needs a route
picked. If you're live-verifying a report's **view** route and the RRL sidebar/route list seems to be
missing entirely, that's expected, not a bug: it only ever renders on the page's own `/edit/...`
route. This is NOT gated by the generic `hideInView` section flag (deliberately — that flag would also
hide the entry-gate modal above, breaking Dynamic Reports specifically); it's unconditional, baked
into the component itself. See `ReportRouteList/README.md`'s "View-mode visibility" section and
`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md` item 3's "View-mode visibility"
section for the full history.

## 5. Report-specific gotchas (check `traversing-dms-pages.md` §4 too)

The general state-machine/URL gotchas (subdomain routing, edit URL shape,
silent slug-fallback-to-home, stale auth tokens, template materialization,
CLI-cloned test pages, map/WebGL blank-canvas) now live in
[`traversing-dms-pages.md`](./traversing-dms-pages.md)'s §4 — they apply to
any DMS page, not just reports. What's specific to reports:

- **`report_<old_id>`-style slugs are a deprecated/unstable scheme**
  (title-derived, recomputed on every title save) — get a real,
  currently-valid slug from `scripts/npmrds-reports/pick_test_report.py`
  instead of guessing one. (The general "unresolvable slug silently falls
  back to home" fact this interacts with is in the generic doc.)
- **`ReportRouteList`'s `findSelfBoundGraphs` (and its other section
  discovery code) filters out any section with `section.id == null`.** A
  page whose sections were materialized via a CLI/raw-DB clone rather than a
  real "+ Add Page from Template" click (see the generic doc's
  materialization gotcha) will show ZERO self-bound graphs/stats on such a
  page regardless of whether the underlying config is correct — a property
  of the shortcut, not a real bug, and easy to misdiagnose as one.
- **Map/MapLibre sections specific to this arc** (Route Map, macroview, the
  route-creation tool) hit the generic blank-dark-rectangle/`resize_window`
  issue described in the generic doc — nothing report-specific about the fix
  itself, just naming the sections in this codebase that hit it.

## 6. Which tool to reach for

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
| Any MapLibre section | Either works, but the `resize_window` fix (`traversing-dms-pages.md` §4) is the proven path — expect the same issue in headless Playwright and consider `headless:false` there if it recurs |
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

## 7. Extending this doc

When you learn something new while verifying a report page live:
- A new general truth about the section/menu/graph shell (applies to every
  page in every pattern/theme, not just reports) → belongs in
  [`traversing-dms-pages.md`](./traversing-dms-pages.md), not here.
- A report-specific fact (RRL, Dynamic Reports, the route-picker modal, tags)
  → fold it into §4–§5 above, replacing anything it makes stale.
- A narrow one-off ("this specific component's Settings menu also does X")
  → belongs in that component's own skill (`card-layout.md`,
  `authoring-graphs.md`, etc.), not here.
- A tool trade-off you discovered the hard way → add a row to the §6 table
  rather than a paragraph; keep the table scannable.
