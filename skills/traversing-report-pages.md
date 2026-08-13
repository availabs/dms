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
- **`?routes=` is silently INERT on any `/edit/...` URL — probe the published
  view, never edit mode, to check whether a slot actually resolved.** Found
  live 2026-08-11: `useDynamicReportRoutes`'s own `enabled` check is
  `isDynamicReport && !isEdit && routeIds.length > 0` — by design, an author
  editing a Dynamic Report always sees the raw unresolved slots (so editing
  the template itself isn't at the mercy of whichever route happens to be in
  the URL). A `report_probe.mjs "edit/<slug>?routes=<id> --auth"` run against
  a slot-fed graph will show real chart chrome with **zero data** (an "EMPTY
  SVG"/no `/graph` query at all for that section) even when everything is
  wired correctly — this is expected, not a bug, and reads as a false failure
  if you don't already know the mode gates it off. Publish the page (or at
  least confirm it's published) and probe the plain slug instead.

### Relative dates: the "Today (view time)" virtual base, and its entry-gate date field

Built 2026-08-10. A route's date can derive from a synthetic **"Today (view time)"** base — it
appears in `RouteRow`'s existing Fixed/Derived date editor's "Derive From" dropdown alongside real
routes, works identically (same formula grammar, same live preview), but resolves against the real
wall-clock date instead of another route's stored date. Full design/build record:
`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md` item 3's "Relative dates
relative to today" section.

- **On a Dynamic Report only**, a viewer can override "today" — the blocking entry-gate modal (the
  same one that asks for route picks) grows an extra **"Viewing as of"** date input, but *only* when
  this specific report actually has a route deriving from the Today anchor (checked before the gate
  ever renders); a Dynamic Report that doesn't use it shows the gate exactly as before. Confirming
  adds a second URL param (`?routes=...&asOf=YYYY-MM-DD`) alongside the routes param. Absent that
  param (or on a normal, non-Dynamic report, which has no entry gate at all), the anchor falls back
  to `defaultAnchorDate()` (see the publish-lag finding right below — **not** literal today) —
  there's no other way to set it once past the gate; re-triggering the gate (e.g. a slot/URL-count
  mismatch) is the only way to change it later.
- **NPMRDS's own data has a real publish lag — a literal-"today" anchor queries a date range with
  zero rows, and the usual "does it render" checks won't catch this.** Confirmed live 2026-08-10:
  `SELECT max(date) FROM npmrds.s583_v982_NPMRDS_V6` (the live 5-minute speed table) returned
  `2026-07-26` — a hard cliff, not a gradual falloff — while real wall-clock today was `2026-08-10`,
  a 15-day gap. `relativeDateResolution.js`'s `defaultAnchorDate()` (real `new Date()` minus
  `NPMRDS_DATA_LAG_DAYS`, currently `21` — a deliberately conservative buffer, tune that one
  constant if the real lag changes) is what the Today anchor actually uses by default; a viewer's
  explicit `?asOf=` override is never lag-adjusted (their own deliberate pick). **The
  `report_probe.mjs` SVG census is not proof the underlying query returned real data** — a chart
  library can render axis/chrome `<path>` elements with a genuinely empty series behind them, so
  "sections with content: N/M" passing is not sufficient evidence a Today-anchored (or any
  wall-clock-relative) query actually has rows. When verifying anything date-relative, cross-check
  the actual row count directly (`dbq.py ch "SELECT count() FROM <table> WHERE date >= '...'"`) —
  don't trust rendered-content alone. This was caught only because a human (not an automated check)
  asked the right question after the fact.
- **Two live-debugged gotchas in this codebase's URL-param plumbing, worth knowing before wiring up
  any new page-filter/URL param, not just this one:**
  1. A `useSearchParams: true` page filter's `values` field arrives **array-wrapped even for a
     single scalar value** (e.g. `['']` before anything is picked) — a bare `filter.values`
     truthiness check is always true (a non-empty array is truthy regardless of contents), silently
     defeating an `x || fallback` pattern. Normalize with
     `(Array.isArray(v) ? v : [v]).filter(Boolean)[0]` before treating it as a scalar.
  2. `convertToUrlParams` (`_utils/index.js:8`) **silently drops any key whose value isn't itself an
     array** (`if(!values || !Array.isArray(values) || !values?.length) return;`) — passing a bare
     string for a URL param silently vanishes from the resulting URL with zero error/warning
     anywhere. Always wrap the value (`[myValue]`) even for a single-value param.
  Both were only caught by injecting a `window.__DEBUG__` value and reading it back via
  `javascript_tool` after the picked value silently failed to appear in the URL — a live console.log
  alone wasn't enough (this tool's console reader doesn't expand object contents; `JSON.stringify`
  the payload or use a `window.*` global + `javascript_tool` instead).
- **A formula anchored on Today can silently point into the future — verify against real data, not
  just that a date resolved.** A chain of comps meant to represent "N most recent days" is easy to
  get backwards: anchoring day 1 on Today and stepping `+1`/`+2`/... forward computes days that
  haven't happened yet (no NPMRDS data can exist for them) the moment more than one day in the chain
  is in play — caught only because the golden-corpus regression check (`probe_corpus.mjs`, see §6's
  table) flagged one section going from real content to a blank SVG shell. Anchor the *last* day of
  such a chain on Today and step `-1`/`-2`/... backward instead. A "current week/month/year to date"
  framing (`weekof`/`monthof`/`yearof`) doesn't have this problem the same way — it's a common,
  accepted "period to date" pattern, not a future-dated gap.

### Calendar-position formulas (`calendar:{m1}-{d1}..{m2}-{d2}`) — a fixed month/season tied to whatever year the anchor falls in

Built 2026-08-10, alongside the Today anchor above. A second, independent formula shape in the same
`dateFormula`/`derivedFromRoute` mechanism — `relativeDateResolution.js`'s `CALENDAR_POSITION_REGEX`
— for things the offset grammar above genuinely cannot express: "January" or "Winter" is not an
offset from the base's own current position, it's a literal month/day range anchored on the
CALENDAR YEAR the base falls in. `RouteRow.jsx`'s Derive-From UI exposes it as two curated patterns
(`Fixed calendar month`, `Fixed calendar range`) alongside the existing offset/snap ones.

- `day2` may be a literal day-of-month or `L` for "last day of month2" — a whole-month range stays
  correct across Feb 28/29 without the author needing to know which.
- Year-wrap (a season like Winter that starts in December of "last year") is decided by comparing
  `month1`/`month2` only: `month1 > month2` means `month1`'s side falls in the year BEFORE the
  anchor's own year, `month2`'s side falls in the anchor's year itself.
- Migrated `Monthly Congestion`'s 12 individual months and `Seasonality`'s 5 seasonal windows onto
  this (previously frozen static literals, computed once at retrofit time with zero lag adjustment)
  — see `scratchpad/npmrds-sub/apply_calendar_position_formulas.py`.
- **The remaining blank months/seasons past the real ClickHouse data cliff are NOT a bug** — same
  publish-lag reality as the Today anchor above, just on rows this enrichment makes permanently
  self-correcting across years rather than eliminating the current year's in-progress tail. Before
  treating an "EMPTY SVG" on `monthly_congestion`/`seasonality` as a regression, check
  `SELECT max(date) FROM npmrds.s583_v982_NPMRDS_V6` first — it moves daily.
- Golden-corpus coverage: `dynamic_report_monthly_congestion` (plain month case) and
  `dynamic_report_seasonality` (the year-wrap case, via Winter) — added 2026-08-10, see §6 below.

### A derive-from base can never itself be derived — repoint every comp at `__TODAY__` directly, never chain

Found 2026-08-11 while converting `Single Day (Advanced)`'s 6-comp derive chain (previously all
deriving from a literal "incident date" comp) onto the Today anchor. `relativeDateResolution.js`'s
`resolveRouteDates()` has a real, load-bearing guard: `if (!base?.startDate || !base?.endDate ||
base.dateFormula) return route` — if the BASE a comp derives from itself has a `dateFormula` (i.e.
the base is itself a derived comp), resolution silently no-ops and the dependent comp freezes at
whatever date it last resolved to. There is no 2-hop chaining support, by design (mirrors
`applyDerivedPageVariables`'s own cycle guard).

Practical effect: if you're converting a report where several comps all derive from ONE "base" comp
(e.g. an incident date, a "current period" comp), and you want that base itself to become
Today-relative, **do not just repoint the base** — every comp that used to derive from it must be
repointed to derive from `__TODAY__` **directly**, using the base's own old formula translated onto
Today (the base's old value effectively equaled Today/the prompted override anyway, so the math is
identical, just no longer 2 hops). Verified working this way across 7 templates in one pass — see
`dynamic-reports-and-route-tags.md` item 3's "no fixed dates in Dynamic Reports" round.

### Scope boundary: this whole "no fixed dates" push applies ONLY to `admin2.templates`-sourced Dynamic Report conversions

Confirmed by Ryan, 2026-08-11 — a real category distinction, not a per-page judgment call.
`convert_template.py --template-id` conversions (the reusable "Dynamic Report" catalog, one shared
page per template, route slots filled at view time) are the ONLY candidates for Today-relative
dates. `convert_report.py --report-id` conversions (one-off old `admin2.reports` rows — a specific
historical incident/analysis, e.g. "Bridge Hits Impact — BIN2075837") are frozen BY DESIGN and
should never have their dates touched — they were authored for one specific point in time on
purpose. Check which conversion path produced a page (`_converted_from_old_template_id` vs.
`_converted_from_old_report_id` marker on its `reports_snap_2` row) before assuming a frozen date on
any given page is a bug.

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

### RRL row mutation (pencil/reorder/trash/date-edit) needs RRL's OWN `SectionEdit`, not just page-level `/edit/`

Found live 2026-08-07. Being on `/edit/<slug>` is not enough to unlock a route row's pencil/trash/
reorder/date-edit controls — `RouteRow`'s `canMutateRow` comes from `ReportRouteList`'s own
`canMutate = isEdit && Boolean(sectionEditorOpen)`, where `sectionEditorOpen` is `props.isEdit` (the
same per-section `SectionEdit`-vs-`SectionView` signal every custom component has to gate on — see
`traversing-dms-pages.md`'s "two different edit states" gotcha). Confirmed live via the React fiber
tree: on a freshly-loaded `/edit/<slug>` page, `ReportRouteList`'s own `isEdit` prop reads `false`
and its ancestor is `SectionView`, not `SectionEdit` — every row renders with zero mutation
affordances (no color picker, no name pencil, no reorder arrows, no date-edit pencil) until you
explicitly enter RRL's *own* edit mode: hover the RRL panel to reveal its Settings kebab (same
generic per-section trigger every section has, positioned `absolute top-2 right-2` inside the
section's own padded cell), open Settings, click the pencil-square icon at the top of that dropdown
— only then does `ADD ROUTE SLOT`/`ADD GRAPH`/the Dynamic Report toggle and every row's mutation
UI appear. Easy to miss because RRL doesn't look like an ordinary configurable section (no visible
Dataset/Columns chrome until you're actually in this mode) and its Settings entry only has
`Type`/`Dataset`/`Layout`/`Delete` before you click the pencil — the mutation UI is genuinely absent
until then, not just visually subtle.

**A caution learned the hard way in the same session**: once inside this mutation UI, click targets
shift as soon as anything else changes the layout above them (an open Settings dropdown, a row
expanding). A coordinate-based click that was correct a moment ago can land on a different row's
"Move up" reorder button instead of the pencil it was aimed at — on a real, published page, this
silently reorders `reports_snap_2.routes[]` (no confirm dialog). Prefer a DOM query
(`element.click()` on the button found by its exact `title`, e.g. `"Edit derived-date relationship"`
or `"Expand"`) over coordinates once inside this UI, and always re-read the DB after any live-testing
session here to confirm nothing unintended stuck.

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
- **A page built before `_measurePick` existed has NO recoverable
  measure/resolution/comparisonMode on any of its AVL Graph sections** — not
  just some of them. `report_build.mjs --from-page` flags every such section
  `_needsReview`; `display.graphType` is the only field that survives. The
  only way to recover which routes feed which graph on such a page is to read
  the report's `reports_snap_2` snap row directly (`dms dataset query
  reports_snap_2 --filter "report_id=<id>"`), parse its `routes[].graphIds`
  (a dead field on any page built AFTER Design Push #2, but the only routing
  signal that exists on a page built BEFORE it), and cross-reference each
  UUID against the `trackingId` on each section (`dms raw get <section_id>` →
  `data.trackingId`). Found live on `Bi-directional`/`Snapshot`
  (2026-08-11) — both predate `_measurePick` entirely.
- **A GridGraph section needs a per-row breakdown column, and `composeMeasureConfig.js`
  didn't build one at all until 2026-08-12.** `GridGraph.jsx` builds grid rows from a
  column targeted `"yAxis"` (never `"categorize"` — that's BarGraph's convention); without
  one it silently collapses to a single aggregate row, which for a multi-TMC route means
  every TMC gets averaged together even though `SPEED_EXPR`/etc. already degrade correctly
  to a true per-TMC value once grouped by `(epoch, tmc)`. Fixed: `composeMeasureConfig.js`
  now always emits a `tmc`-named column targeted `yAxis` for `graphType: 'GridGraph'`
  (`buildGridBreakdownColumn`), so every GridGraph built through the Measure Picker or
  `report_build.mjs` (7 of the 12 catalog templates use one) is per-TMC by default —
  matches the old Python converter's own round-42 fix for the same bug on report 914,
  just ported to the new picker. **Gotcha found in the same fix**: a fresh AVL Graph
  section's inherited default `display.yAxis.format` is a numeric format (`"integer"`) left
  over from whatever generic starter state it cloned from — harmless while GridGraph had no
  yAxis column to format, but once one exists it renders every TMC row label as the literal
  text `"NaN"` (a string run through `d3-format`). Fixed alongside: `composeMeasureConfig.js`
  force-clears `display.yAxis.format` to `null` for every GridGraph pick, same
  "re-picking must fully determine every display field it touches" rule the xAxis
  format-clearing code next to it already follows.
- **Right after a build/publish, the two Route Line Graph panels can render blank on the
  probe's default `--wait`, then pass cleanly on the very next run** — not a regression,
  a cold-load timing gotcha (already documented on `one_week_study` back in the relative-
  dates work): the freshly-written page has nothing warm in cache, so its `/graph` queries
  can still be in flight when the probe's default wait elapses (`pending-at-close` goes
  above 0). Confirmed live 2026-08-12 rebuilding the GridGraph fix above: `probe_corpus.mjs`
  flagged both LineGraph sections blank immediately after a fresh `--publish`, a
  `--wait 15000` re-probe showed both fully rendered, and a normal re-run moments later
  passed clean against the baseline with no changes. Don't treat a lone blank-LineGraph
  finding right after a publish as real without a re-probe at a longer wait first.
  The SAME probabilistic timing shows up on Route Map's own tile requests too (found
  2026-08-12 re-baselining `one_week_study`: 4 map tiles still pending at close, cleared on
  one re-probe, then reappeared on a later probe of the identical page/moment) — map tiles
  are just slow sometimes, independent of anything the page's own build changed; don't
  chase a lone pending-tiles finding as a regression without ruling this out first.
- **A Route Compare or Info Box section built by `convert_old_reports.py` (as opposed to
  `report_build.mjs`) is invisible to `--from-page`, silently — not flagged, not
  `_needsReview`, just absent from the reconstructed spec.** `isGraphSectionElement()`
  used to gate on a `_routeComparePick`/`_infoBoxPick` marker only `report_build.mjs`'s own
  compose functions stamp; the Python converter never does (confirmed via grep: zero hits
  anywhere in `convert_old_reports_lib`). Fixed 2026-08-12 to also recognize the same
  self-bound `comparison_series`/`$self` subscriber the live runtime's own
  `findSelfBoundGraphs` checks, plus a `type:'delta'` column as the Route-Compare-vs-Info-Box
  tell — a section recovered this way gets `_needsReview` for the measure (can't recover it
  without the marker) instead of a guess. **If you're auditing a page for a "missing" panel
  and its own gap log / original conversion notes show a Route Compare or Info Box section
  was actually built, don't trust a from-page-reconstructed spec's absence of it as proof it
  isn't real** — check the live page's own sections directly (`dms page dump <id> --sections`)
  before concluding the panel never existed.
- **A Spreadsheet section's title tells you which of 3 things it is, but the DOM/table shape
  tells you more precisely.** Route Compare and Info Box (and the page's own Add-a-Route
  section) all share element-type `Spreadsheet`. A single-measure Info Box is one value
  column; a multi-measure Info Box (added 2026-08-12 — `measure` can be an array) is N value
  columns, one per measure, no delta columns. Route Compare (single- or multi-measure) always
  has a `% vs Main` delta column after every value column — that's the one reliable visual
  tell if the title alone doesn't say "Compare."
- **The report's own attribution line (bottom of each AVL Graph/Info Box/Route Compare panel)
  names which join it's actually using — a real, live way to confirm the 2026-08-12
  metadata-join fix landed on a given page.** Before the fix: `... | (Join) NPMRDS TMC
  IDENTIFICATION V5 / V6 (3464)`. After: `... | (Join) NPMRDS_V6_TMC_META (983)`. If a page's
  `speed`/`length`/`aadt`/Route-Compare-`speed` panel still shows `(3464)`, it hasn't been
  rebuilt since the fix (`report_build.mjs --update`, or a re-pick through the live Measure
  Picker, will pick up the corrected join — the fix doesn't retroactively change
  already-built sections).
- **Every route assigned to one graph gets the SAME weekday mask, even if the spec gave them
  different ones — a real, current limitation, not a display bug.** Design Push #2 moved
  `weekdays`/`start`/`end` to be graph-level fields; when a graph's assigned routes disagree
  (e.g. a year-over-year comparison mixing an all-days "Current Year" route with Mon-Fri
  "N Years Ago" routes), `report_build.mjs` detects the mismatch and leaves weekdays unset for
  the whole graph (console note: `"...assigned routes have DIFFERENT weekday masks..."`)
  rather than guessing — so every route in that graph silently gets "every day," regardless of
  what its own spec entry said. Confirmed live 2026-08-12 on `annual_average_study`'s Line
  Graph/Map/Route Compare panels. A real architecture fix (per-route-usage overrides living on
  the graph, keyed by route) is scoped but not built — see
  `dynamic-reports-and-route-tags.md`'s item 3.
- **A GridGraph with "confetti" coloring (many unrelated hues, no readable gradient) or a BarGraph
  with one flat static color instead of a value scale means that page hasn't been rebuilt since the
  2026-08-12 color-scale fix** (`composeMeasureConfig.js`'s plain-mode colors, `dynamic-reports-
  and-route-tags.md`'s dedicated section) — not a new bug to re-investigate. The fix makes GridGraph
  (always) and a single-route BarGraph (day/weekday/month breakdown, no real second series) use a
  real `rdylgn` value scale instead of inheriting the LineGraph-style ~20-swatch route palette; it's
  a code fix, not retroactive, so a page needs its own `--update <id> --publish` to pick it up. Only
  `annual_average_study`/`one_week_study` had this run as of 2026-08-13 — every other catalog page
  still shows the old confetti/flat coloring until rebuilt. Same session also fixed a LineGraph tooltip showing
  15-digit floats (now rounds to 1 decimal, code-only, no rebuild needed) and an always-shown,
  often-nonsensical "(Line Total)" (now hidden unless the measure's vocabulary `fn` is `"sum"`,
  i.e. genuinely additive across time buckets — also needs a rebuild to take effect, since it's the
  same `display.tooltip` field a rebuild writes).
- **A multi-measure Info Box's `join` is a plain dict `update()` union of each measure's own
  `join.sources`, last-measure-in-the-list wins on a shared key — a stale join on ANY listed measure
  silently overrides a correct one from another.** Found live 2026-08-13 building `one_week_study`'s
  first-ever multi-measure Info Box (`measure: ["speed","travelTime"]`): `speed`'s own template row
  correctly used `META_JOIN`, but `travelTime`'s pre-existing row was still on the stale
  `TMC_IDENTIFICATION_JOIN` (missed by the 2026-08-12 join-drift-detection round — only 2 of the 3
  sibling `ensure_*` functions got it), so the combined row's final `join` silently reverted to the
  stale one. If a multi-measure Info Box's attribution line shows the old join, don't assume the whole
  page needs a rebuild — check whether ONE of its measures has a stale template row first (`dms raw
  list npmrdsv5+npmrds_sub|avl_graph_template` → find `{grain}_info_box_{measure}` → read its
  `data.stateJson.join`).
- **A plain-decimal Info Box measure (speed/length/aadt) with no `formatFn` renders full float
  precision in the cell** (e.g. `20.56702084355448`) — `comma`/`abbreviate` both floor to an integer
  below their K/M-abbreviation threshold, which is wrong for a sub-1000 rate-like value. Fixed for
  `speed` 2026-08-13 via a new shared registry entry, `decimal_2`
  (`dataWrapper/utils/utils.jsx`'s `formatFunctions`) — same file/pattern as `travelTime`'s
  `minutes_clock`. `length`/`aadt` have the identical gap, not yet fixed (no live consumer had hit it
  as of this writing).
- **A "panel looks missing" report is worth verifying by loading BOTH the old and new page in full
  (scroll to the bottom) before touching any code** — confirmed 2026-08-13 that a suspected 2nd missing
  Bar Graph Summary on `one_week_study` was actually already present and correct on both pages; the old
  template's gap log (which DOES reliably tell you what's genuinely dropped, see the entry above) would
  have shown this too, but a direct side-by-side screenshot comparison is the fastest way to confirm or
  rule out a suspected gap without first reasoning about it from docs.

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
| Confirming a report/graph code change didn't break already-working pages (before/after any change to `report_build.mjs`, `convert_old_reports_lib/*`, RRL/`useGraphPublish.js`, the Report Page template, or graph rendering) | `node scripts/npmrds-reports/probe_corpus.mjs` — see `regression-testing-npmrds-reports.md` |

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
