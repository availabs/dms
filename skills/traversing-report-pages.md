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
- **Root view's layout, top to bottom: name-search box, then "Browse by tag"
  tiles, then the default/recent route list.** Moved the tag browser above
  the route list 2026-08-20 (`RouteTagBrowserModal.jsx`) — a novice author
  had no reason to think the tag browser existed below a route list that
  already looked complete, so it would never get scrolled to. If you're
  navigating this modal via DOM query, don't assume the first
  `t.routeList`-shaped block you find is the route list — the category pill
  row now comes first in `view === 'root'`.

#### 2026-08-25 redesign: prominence sort, "mine"/"curated"/"auto-generated" facets, fragment collapse

Built for the npmrds-picker-modals design work (mockup:
`src/themes/transportny/TransportNY Design System/dms_design_system_v2/pages/npmrds-picker-modals.html`).
Verified live via `report_probe.mjs --eval` scripts (claude-in-chrome was unavailable this
session) against both live call sites — RRL's "+ Add Route" and Dynamic Reports' blocking entry
gate — on a scratch page. Shared code now lives in
`src/themes/transportny/components/PickerModal/` (`pickerScoring.js`, `useCatalogFetch.js`,
`fetchCatalogRows.js` — moved from this folder, `PickerModalParts.jsx`), reused by the new report
picker (below) so the two pickers share styling/behavior rather than drifting.

- **Default sort is now prominence-weighted ("Best match"), not `created_at desc`.**
  `RouteTagBrowserModal/routeScore.js`'s `routeScore()` weighs road class (I-/US-/NY- name
  prefix) far above raw TMC count, plus a log-scaled size bonus, a has-tags bonus, an ownership
  boost, and a single-TMC fragment penalty — all computed CLIENT-SIDE (this modal fetches via
  `apiLoad` into a plain JS array, so there's no SQL-side scoring limitation the way there is for
  the report picker, below).
- **A "narrow by" facet-chip row (Mine / Curated / Auto-generated)** sits above the route list in
  root/value/other views (not shown in the pure-navigational `category` view). "Mine" compares
  the real `created_by` column against `CMSContext.user.id` — client-side only, no server-side
  check that it matches the real auth token (a deliberate, explicit v1 scope limit, not an
  oversight). "Curated"/"Auto-generated" filter on the `tags` column's `auto_generated` value.
- **Every row carries a mine/auto-generated/curated badge** (`UI.Pill`, `activeStyle`
  `blue`/`zinc`/`green`) instead of the merge living only in the tag-browse tree structure.
- **Single-TMC "fragment" routes collapse behind a "Show short segments too" reveal** in any
  unscoped (non-search) view — root default, a plain tag-folder browse. A real, load-bearing
  finding drove this being a SERVER-side exclusion (`routeScore.js`'s
  `EXCLUDE_FRAGMENTS_FILTER`, a raw-SQL `col` filter leaf, Step 2b's "option A" pattern), not just
  a client-side re-sort/hide: confirmed live 2026-08-25, 52,633 of ~73,464 real routes (72%) are
  single-TMC fragments, AND the 80 most-recently-created rows in the WHOLE catalog were 100%
  fragments (a bulk batch) — a client-side re-sort of a `created_at`-ordered `LIMIT 60` fetch
  never even saw a non-fragment row in that case. Any active search (name search, or "Other
  tags"' free-text search) shows fragments inline instead, badge and all — never collapsed.
- **A name search ALSO needs SQL-side ranking to avoid a second, separate junk population.**
  Confirmed live: searching "87" against the real catalog can return thousands of
  raw-TMC-code-named rows (`T2870095500573W_...`, single-TMC — caught by the fragment exclusion)
  AND thousands of raw-numeric-id-named MULTI-TMC legacy rows (`1004262_3787_LATHAM CIRCLE`,
  NOT caught by fragment exclusion) that also substring-match arbitrary digit queries — either
  population alone can fill an entire search `LIMIT` before a real match like I-87 is ever
  fetched, and no client-side re-sort can recover a candidate that was never fetched. Fixed via
  two more `extraColumns` (a new `fetchCatalogRows.js`/`useCatalogFetch.js` param — a
  `selectOnly` calculated sort-only column, same "option A" mechanism, needs both `show:true`
  AND `normalName` set or the platform's `orderBy`-column-resolution step silently drops it):
  `FRAGMENT_RANK_SORT_COLUMN` (non-fragments first) and `ROAD_CLASS_RANK_SORT_COLUMN`
  (I-/US-/NY--prefixed names first). Multiple `.sort`-bearing columns DO compose into one
  multi-column `ORDER BY` (`buildUdaConfig.js`'s `orderBy` is a dict built by `reduce` over every
  column carrying `.sort`, in column-array order) — but a plain real-column sort (e.g. `name`)
  placed EARLIER in the columns array than these `extraColumns` would dominate the `ORDER BY` and
  reduce them to a rarely-reached tiebreak; the fix deliberately does NOT sort by `name` during a
  plain search for exactly this reason. The SQL ordering's only job is getting the right
  candidates PAST the `LIMIT` — `routeScore()`'s client-side re-sort still owns final display
  order once real matches are actually in the fetched set.
- **CLI footgun found while testing this**: `dms section create <page> --pattern <name>` is safe
  and additive (appends to `draft_sections`, doesn't touch `sections`/other page fields). But
  `dms page update <id> --pattern <name> --set draft_sections='[...]'` (documented in the repo's
  own `CLAUDE.md` as a "partial update, read-modify-write") is NOT safe on this CLI version for
  an array-shaped top-level field — confirmed live: it replaced the page row's ENTIRE `data`
  object with just `{entries, has_changes, draft_sections}`, dropping `title`/`url_slug`/`parent`/
  everything else (only caught because the page's `dms page show` output afterward read
  `"title":"(untitled)"`, `"url_slug":""`). Only hit on a disposable scratch page (deleted after);
  never used against a real/production page. Until this is root-caused in the CLI itself, prefer
  `dms section create` (additive) and `dms raw update <section_id> --data {...}` (a single
  component row — proven safe, e.g. setting a new section's `group`/`element`) over
  `dms page update --set` for any page-level ARRAY field.

### The report picker ("Choose a report") — net new, 2026-08-25

A superset of the `/reports` homepage's AVAIL-curated Card grid
(`converted_reports/reports`, page 2208581) — the homepage itself is unchanged (still exactly
the curated 12-card catalog), this is an ADDITIONAL surface for searching everything the current
user is authorized for, drawn from the same `reports_snap_2` catalog (source 2177438 / view
2177440).

- **Architecture mirrors `RouteTagBrowserModal` on purpose** (Ryan's explicit ask: share code,
  don't let the two pickers drift) — a self-contained React component
  (`ReportPickerModal/ReportPickerModal.jsx`) using `UI.Modal` directly, mounted by a small
  registered trigger section (`ChooseReportButton`, same shape as the pre-existing
  `CreateReportButton`) that owns its own `open`/`setOpen` state. This is NOT built on the
  declarative `isModal`/`modalParamKey` section-group mechanism (`modal-section-group.md`) even
  though that mechanism has a real, live precedent for a find-a-report dialog on page 2188366
  (`converted_reports`, section 2214393-95, `modalParamKey:'find'`) — that precedent predates
  this session's code-sharing ask and was left as-is, not migrated.
- **No multi-select** — unlike the route picker, choosing a report NAVIGATES to it
  (`navigate(row.page_path)`) and closes the modal; there's nothing to "confirm." A row with no
  `page_path` (a legacy `admin2.reports` row never rebuilt into a real DMS page) renders
  disabled/muted with a "Legacy — not yet rebuilt" badge instead of being clickable.
  "Rebuilt" (green) vs "Legacy — not yet rebuilt" (zinc) is the report-picker's equivalent of the
  route picker's mine/auto-generated/curated badge — same `UI.Pill` mechanism, different
  vocabulary because reports and routes have genuinely different real distinctions.
- **Facets: "Mine" and "Hide incomplete-looking"** — the latter is the real, shipped version of
  the design mockup's "hide likely test/junk" chip, renamed per explicit user feedback that the
  original copy read as judgmental developer jargon, not plain user-facing language. Backs a
  shared `LOOKS_INCOMPLETE_RE` (`PickerModal/pickerScoring.js`) also used for a "Possible draft"
  (amber) row badge — same heuristic, two surfaces.
- **Prominence sort DOES include an ownership boost here** (unlike the route picker's fragment/
  road-class SQL-ranking constraints — this picker fetches client-side the same way
  `RouteTagBrowserModal` does, so there's no SQL-limit truncation problem to design around):
  `ReportPickerModal/reportScore.js`'s `reportScore()` weighs yours → rebuilt → described →
  recency, penalizing incomplete-looking names.
- **Trigger placement**: added draft-only to the real `/reports` homepage (page 2208581, section
  2214721, same section group as the existing `CreateReportButton` trigger) — landed at the
  BOTTOM of the page (appended after all 12 catalog cards) since section order follows array
  order and this was appended last; a human should drag-reorder it up near "Create Report" via
  the normal edit-mode section UI before publishing. `sections` (the published array) was not
  touched — the homepage's live/public view is unchanged until someone explicitly publishes.

### QuickControls (the header pill row): layout controls, Table's multi-measure Measure pill, Difference-mode gating

Built/extended 2026-08-20 — full design record in
`planning/transportny/tasks/current/report-authoring-ux-overhaul.md` Tier
5A/5D/5E. The pill row above a self-bound AVL Graph/Spreadsheet/Map section
now splits into two independently-aligned groups sharing one row (a
`rowWrapper` with two flex-sibling children, not one `justify-end` list):

- **Left-aligned "layout" group** (`reorderGroup` in the theme, pinned to the
  row's left edge, outside the responsive fit/overflow system entirely): two
  Move Up/Down icon buttons (`actions.moveItem` — the identical array-splice
  `sectionArray.jsx`'s own Settings-drawer toolbar already uses, gated on the
  page-layout permission in addition to section-edit) plus a **Width** pill
  (a popover listing all 12 col-span options, writing via
  `actions.updateAttribute('size', ...)` — the exact same field/mechanism as
  that section's own Settings-drawer Width control; either surface you change
  it from, the other reflects it immediately on next open).
- **Right-aligned "data" pill cluster** (Routes/Measure/When/Aggregate/Mode +
  "⋯" overflow) is where the row's own width-based fit/collapse logic still
  lives, unchanged in spirit from Design Push #2, except:
  - **On a Table section, the Measure pill is a multi-select checklist**
    (toggles membership in `_measurePick.measures`, one column per entry)
    instead of the single-pick list every chart type still gets — a table has
    no one-measure ceiling. Pill label reads "N measures", not a measure
    name. `AddGraphModal`'s own Measures field mirrors this (a checklist
    instead of a `<select>`) only when the Table shape card is selected.
  - **The Mode pill's "Difference" option is genuinely `disabled` (not just a
    warning) whenever the card doesn't have exactly 2 routes** — EXCEPT when
    Difference is already the active selection, so an author whose route
    count drifted away from 2 after the fact can still switch back to Plain
    rather than being trapped. The Routes popover's pre-existing warning note
    about this mismatch is now mirrored onto the Mode popover too.

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
  - **The other direction bites `probe_corpus.mjs` specifically: a section that was blank at
    baseline-capture time can legitimately have real content later**, purely because the cliff
    advanced past it in the meantime — no code or spec change involved. Hit live 2026-08-14: the
    `dynamic_report_seasonality`/`dynamic_report_one_week_study` baselines both flagged
    "blank → has content" findings after an unrelated `useGraphPublish.js` change; confirmed via
    `SELECT max(date)...` that the cliff had moved from ~2026-07-26 (last capture) to 2026-08-02,
    and via a clean 0-error re-probe that the newly-visible content was real, not broken. The
    correct response is `probe_corpus.mjs --capture --only <key>` (a routine re-baseline), never a
    code fix — there's nothing to fix.
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
  `probe_corpus.mjs` now has a permanent fix for this on the one entry that hits it
  reliably (`dynamic_report_one_week_study`, 9 sections + a Route Map): a manifest entry
  can carry `"wait": <ms>` to override `report_probe.mjs`'s default 6000ms settle wait for
  just that entry — set to 20000 there 2026-08-17, confirmed stable across repeated
  `--capture`/diff runs where the default wait had flagged 4 false "was blank → has
  content" Blockers. Add the same field to any other entry that turns out to need it
  rather than re-deriving this fix by hand again.
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
- **A Spreadsheet section's title tells you which of now 4 things it is, but the DOM/table
  shape tells you more precisely.** Route Compare and Info Box (and the page's own Add-a-Route
  section) all share element-type `Spreadsheet`. A single-measure Info Box is one value
  column; a multi-measure Info Box (added 2026-08-12 — `measure` can be an array) is N value
  columns, one per measure, no delta columns. Route Compare (single- or multi-measure) always
  has a `% vs Main` delta column after every value column — that's the one reliable visual
  tell if the title alone doesn't say "Compare." The 4th, added 2026-08-20: a genuine
  multi-measure **Table** (see the dedicated bullet below) — N value columns like a
  multi-measure Info Box, but a real paginated data grid, not a Card, and its own QuickControls
  Measure pill is a checklist instead of a single pick.
  **2026-08-21: Route Compare and Info Box's reliability measures both now have a real live
  authoring path** (gap #16, `report-authoring-ux-overhaul.md` Tier 8) — a Table's Measure pill
  (QuickControls or AddGraphModal) has "Route Compare — add a '% vs Main' column per measure" and
  "Reliability — add LOTTR/TTTR/Freeflow columns" toggles, both Table+Summary-only (see that
  file's own gating rationale). The Python converter is no longer the only way to build either
  shape — a live-authored Table with these toggles on is now structurally identical to what the
  converter used to build by hand.
- **The report's own attribution line (bottom of each AVL Graph/Info Box/Route Compare panel)
  names which join it's actually using — a real, live way to confirm the 2026-08-12
  metadata-join fix landed on a given page.** Before the fix: `... | (Join) NPMRDS TMC
  IDENTIFICATION V5 / V6 (3464)`. After: `... | (Join) NPMRDS_V6_TMC_META (983)`. If a page's
  `speed`/`length`/`aadt`/Route-Compare-`speed` panel still shows `(3464)`, it hasn't been
  rebuilt since the fix (`report_build.mjs --update`, or a re-pick through the live Measure
  Picker, will pick up the corrected join — the fix doesn't retroactively change
  already-built sections).
- **FIXED 2026-08-14 (was a real, current limitation before this): routes assigned to one graph
  can now genuinely disagree on weekdays/startTime/endTime.** The bullet this replaces described
  `report_build.mjs` silently leaving the whole graph's weekday mask unset when its assigned
  routes disagreed (e.g. an all-days "Current Year" mixed with Mon-Fri "N Years Ago" routes on
  one Line Graph/Map/Route Compare) — that's gone. `weekdays`/`startTime`/`endTime` moved OFF
  `routes[]` entirely, onto `graphs[]` (a route now carrying either fails the build), and a new
  `graphs[].routeWindows: { [routes[].id]: [{weekdays, startTime, endTime, color}, ...] }` lets
  routes on one graph carry genuinely different windows. **Live-verification tell**: a route
  shown 2+ times on one graph under different filters (an AM bar + a PM bar of the SAME
  underlying route, instead of two separate route instances) gets an auto-derived label —
  `"Current Year (6a–10a)"` style, built from the exact wording `RouteRow.jsx`'s weekday-summary
  line already uses — not a name an author typed. If you see that parenthetical pattern in a
  legend/table row, it's one route expanded into multiple series, not two different routes. Full
  field docs in `report-spec.md`; full build record in `dynamic-reports-and-route-tags.md`'s
  "Per-route window overrides" section. First real application: `snapshot`'s consolidated 4-row
  Info Box and 2 AM/PM/Off-Peak Bar Graph Summary panels, same session.
  - **`RouteRow.jsx` has no weekday/peak-hour UI to distrust — checked directly, it was already
    removed by Design Push #2 itself (2026-08-06), well before `routeWindows` existed.** An
    initial claim in this doc that it still existed and needed removing was wrong; corrected here
    rather than left standing. The actual live UI for this (Design Push #2's own replacement) is
    QuickControls' graph-level "When" pill, which briefly went stale the same day `routeWindows`
    shipped (it read/wrote `_measurePick`'s bare `weekdays`/`start`/`end` scalar, which
    `report_build.mjs`/`useGraphPublish.js` had just stopped writing/reading) and was **fixed the
    same session** — it now reads/writes `routeWindows` directly (one uniform window applied to
    every route on the graph, matching its original behavior; a genuine per-route control is a
    separate, unbuilt gap — #18). Live-verified: `_measurePick.routeWindows` correctly held the
    identical window for 2 routes after one pill click, chart re-rendered with the new window live.
    Trust the pill again. Full record in `report-route-ui-parity-gaps.md` gap #17.
  - **No live UI exists yet for setting a PER-ROUTE override within a multi-route graph** — even
    a fixed QuickControls pill would only ever control one shared default per graph.
    `report_build.mjs`'s spec format is the only way to author this today, same "missing surface"
    category as Info Box/Route Compare creation (gap #16). Tracked as gap #18.
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
  **Same code-only-vs-baked-in split recurred 2026-08-17**: `getTooltipFormatFunc`'s no-explicit-
  format default (`graph_new/utils.js`) went from a flat 1-decimal round to magnitude-adaptive (2
  decimals under 10, 1 under 1000, whole above) — this is the SAME live default the "(Line Total)"
  fix above patches, so it's retroactive on every already-built page with no rebuild, confirmed live
  on `bi_directional`'s Travel Time BarGraph (two series that both showed "0.3" now show "0.32"/
  "0.35"). Separately, `travelTime`'s tooltip now defaults to `duration_mmss` ("M:SS" instead of
  decimal minutes) via `composeMeasureConfig.js`'s `displayPatch.tooltip.valueFormat`/`yFormat` —
  this ONE is baked into `display.tooltip` at measure-pick time, same as `showTotal` above, so it
  needs a rebuild or a live re-pick of the same measure to show up on an existing travelTime graph;
  don't expect it on an unrebuilt page. `hoursOfDelay` deliberately stayed on the adaptive default
  rather than also getting `duration_mmss` — its raw value is aggregate vehicle-hours (AADT-
  weighted), not one vehicle's trip duration, so "clock time" doesn't obviously fit; ask before
  adding it if a report seems to want it.
- **The same code-only-vs-baked-in split recurred again 2026-08-20, sharply enough to cost real
  debugging time twice in one session — generalize it: a fix to `composeMeasureConfig.js` or
  `vocabulary.json` changes what a FUTURE compose produces; it does nothing to a section whose
  `state.columns`/`state.join` were already composed and persisted before the fix landed.** Those
  are frozen literal strings sitting in `draft_sections` — nothing re-reads the vocabulary for them
  until something re-triggers `applyMeasurePickToState` (a live re-pick through QuickControls or the
  Settings-drawer Measure Picker; `report_build.mjs --update`/`--replace` for a built page). Reloading
  the page, or even ADDING A ROUTE to the section (route assignment never touches `state.columns` at
  all), does NOT re-trigger it. Two concrete bugs hit this exact trap in the Tier 5D/5G work
  (`report-authoring-ux-overhaul.md`): a `travelTime` join-qualification fix and a
  `speed`/`speedTruck`/CO2-variant alias-collision fix each looked "not fixed" on an already-existing
  section that predated the fix, purely because reloading it re-ran the SAME already-broken query —
  toggling ANY measure off/on via QuickControls (which forces a real recompose) is what actually
  "fixed" it, not the reload. **Before concluding a vocabulary/compose fix "didn't work," check
  whether the specific failing section predates the fix** — if so, force a recompose (any QuickControls
  measure toggle) rather than re-diagnosing a working fix as broken. If a GENUINELY FRESH section
  (built via Add Graph or a live pick, after the fix) still fails, that's the real signal.
- **One real exception to "force a recompose to fix a stale section," found 2026-08-21 building
  Route Compare's delta column**: forcing a recompose only cleans up a column that ALREADY carries
  a `target` in `MeasurePicker/index.js`'s `MANAGED_TARGETS` list (`xAxis`/`yAxis`/`color`/`delta`).
  A picker-owned column shipped WITHOUT a `target` (the delta column's first cut had none) is
  invisible to that replace-on-re-pick filter forever — no amount of re-picking removes it, since
  the filter only ever matches on `target`, never on `origin` or column type. If a section has an
  extra/duplicate column that a toggle-off should have removed and didn't, check whether that
  column type is actually in `MANAGED_TARGETS` before assuming the toggle logic itself is broken —
  confirmed live via a genuine `ClickHouseError: Unknown expression or function identifier
  'ds.tmc'` (an orphaned, join-qualified delta column survived a re-pick that dropped the join).
  Any NEW picker-owned column type added to `composeMeasureConfig.js` going forward needs a
  `target` tag added to `MANAGED_TARGETS` at the same time, or it will hit this exact trap.
- **`pgFederated` (a live Postgres table joined into a ClickHouse query via ClickHouse's own
  `postgresql()` table function) is already a fully generic, tested dms-server join type** —
  `dms-server/src/routes/uda/utils.js`'s `buildJoin` and the client-side `buildUdaConfig.js` both
  already handle it, with its own dedicated test coverage (`tests/test-uda.js`'s "buildJoin
  pgFederated branch"). Don't assume a measure that needs a Postgres-hosted join (like source
  1410's LOTTR/TTTR/Freeflow reliability data) needs new dms-core/server work — it almost certainly
  just needs a new `vocabulary.json` join entry + measure definitions, the same class of change as
  adding `META_JOIN` originally was. Confirmed 2026-08-21 building Reliability
  (`report-authoring-ux-overhaul.md` Tier 8B): zero dms-core changes, all the work was in
  `src/themes/transportny/`.
- **`scratchpad/npmrds-sub/dms-server.log` (a `tee`'d nodemon log, already running) is the fastest way
  to get the ACTUAL ClickHouse error text for a blank/broken report section** — the browser console
  only ever shows a generic "Error fetching data Array(N)" with no SQL detail. `grep -n
  "ClickHouseError" scratchpad/npmrds-sub/dms-server.log | tail` (or grep a specific error `type`,
  e.g. `AMBIGUOUS_IDENTIFIER`/`UNKNOWN_IDENTIFIER`/`MULTIPLE_EXPRESSIONS_FOR_ALIAS`) finds the exact
  failing SQL, including which table alias exists in scope and which columns collided — root-caused
  three separate composeMeasureConfig bugs this way in one session (2026-08-20) that would have taken
  far longer to diagnose from the frontend alone. Check the log's own timestamp against wall-clock
  time before trusting a `tail` — a `grep`/`tail -c` on this file can just as easily surface an OLD
  error from a stale, never-recomposed section (see the bullet above) as a fresh one; when in doubt,
  reload with `read_console_messages` tracking freshly attached, note the exact wall-clock moment, then
  `tail` the log for entries at or after that moment.
- **The Table shape's own compose function is `MeasurePicker/composeMeasureConfig.js`'s
  `composeTableMeasuresConfig`** (built 2026-08-20) — N measures -> N yAxis-target columns +
  one xAxis (resolution) column + one unioned `join` across whatever the selected measures each
  need. See the "4 things" bullet above for how it reads on-page.
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
- **The always-built title-block section (a bare Rich Text section repeating `item.title` as its
  own heading, with nothing else — see the freestanding "WEEKLY AVERAGE" line that used to sit
  right under the real page header on every report) was retired 2026-08-17** — `ReportPageHeader`
  already renders the page's `title` as its `<h1>`, so it was pure duplication; none of the 12
  catalog templates had ever populated the `intro` body text it also carried. Every report built
  going forward has one fewer section than before. **This makes a probe-corpus diff run right
  after reconverting a page LOOK broken when it isn't**: `probe_corpus.mjs` compares
  `baseline.sections[i]` against `current.sections[i]` by raw array position, not by title — remove
  one section and EVERY later index now points at a different physical section than it used to, so
  the diff prints a cascade of "section[N] rendering state changed" lines that are really just
  "position N used to hold section X, now holds section X+1." Confirmed live 2026-08-17
  reconverting all 12 templates: every one of these looked like several sections changed, but
  comparing baseline-vs-current **by title instead of index** on `annual_average_study`/
  `monthly_congestion`/`seasonality`/`one_week_study` showed the exact same set of sections had
  content before and after, none dropped. Don't trust a probe-corpus index-diff at face value
  right after any change that adds/removes a section — re-check by title first, THEN decide
  whether to `--capture` a new baseline.
- **`report_build.mjs` gained a `--replace` flag 2026-08-17** — deletes any existing page at the
  spec's target slug, then builds fresh, same page slug but a NEW id. Use it instead of `--update
  <id>` whenever a structural change (the title-block retirement above, a renamed framework
  section) means `--update`'s reconcile path wouldn't clean up what's already on the page and
  hand-authoring the cleanup isn't worth it. The new id means anything that linked to the OLD
  numeric id (not the slug) breaks — a manifest's `rebuild` command pinned to `--update <old-id>`
  goes stale the moment a page is `--replace`d; prefer `--replace --publish` (no id needed at all)
  in any `rebuild` field that might see this again.
- **`--replace`'s first implementation only deleted the page row — not its `reports_snap_2` row —
  and that row is exactly what `/reports`'s catalog cards query, by tag, not by page reference.**
  `dms page delete` never cascades to a page's own dataset rows (same non-cascade as its sections,
  already noted elsewhere in this doc as harmless-because-invisible — this one ISN'T invisible).
  Every `--replace` left the OLD `reports_snap_2` row behind with the OLD `report_id`, still
  carrying the same `tags`, so it kept matching the catalog's tag filter and rendering as a second
  card for the same report. Found live 2026-08-17 by Ryan spotting duplicate cards on `/reports`
  right after all 12 templates were `--replace`d in one session — some templates (`Weekly
  Average`) had FOUR stale rows once you counted back through every rebuild since before
  `--replace` existed, not just the one from that session. Fixed in `report_build.mjs`: `--replace`
  now looks up the target page's snap row (`findSnapRow`, the same helper `--update`'s preflight
  uses) and deletes it before deleting the page. **If you ever see duplicate cards on `/reports`
  for a report you know only has one live page, this is almost certainly it** — cross-reference
  `dms dataset query 2177438 --view 2177440 --limit 2000` (the routes-data source id may differ by
  env; check `REPORTS_SNAP_SOURCE_ID`/`REPORTS_SNAP_VIEW_ID` in `report_build.mjs`) filtered by
  `data.name` against the currently-live page id (`dms page list --pattern npmrds_sub`) for that
  slug — any row whose `report_id` ISN'T the live page's id is an orphan, safe to delete via `dms
  raw delete npmrdsv5 "reports_snap_2|2177440:data" <row-id>` (needs a fresh auth token; `dms raw
  get <row-id>` can't address it — split `:data` row, use `dataset query --filter id=<row-id>` to
  confirm deletion instead).

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
| A section is blank and the browser console only shows a generic "Error fetching data" with no SQL detail | `grep -n "ClickHouseError" scratchpad/npmrds-sub/dms-server.log \| tail` — the dev server's own log has the exact failing query and ClickHouse error `type` (`AMBIGUOUS_IDENTIFIER`, `MULTIPLE_EXPRESSIONS_FOR_ALIAS`, etc.); check the log's own timestamp against wall-clock time — it can just as easily surface an old, never-recomposed section's error as a fresh one |

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
