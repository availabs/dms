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

**Correction, 2026-09-02: the URL scheme is now `reports/*`, not `converted_reports/*`.**
The homepage (page 2188366) and every report page under it were renamed
`converted_reports` → `reports` (`converted_reports/<slug>` → `reports/<slug>`), and the
curated-catalog page `converted_reports/reports` (2208581) was **destroyed**, not renamed —
Ryan confirmed it was a disposable v0.1 landing page. See
`planning/transportny/tasks/current/rename-converted-reports-url-to-reports.md` for the full
record (DB migration, code changes, why a parent-page UI rename does NOT cascade to children).
Every `converted_reports` reference below this point describes historical state at the time it
was written — read it as history, not current fact, and substitute `reports` when actually
navigating live.

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
zero scripts involved) already has a working `ReportRouteList` panel, ready to
receive a route the moment one is added via "+ Add Route" — useful as a clean,
un-scripted reproduction environment when you need to rule out "is this bug
specific to some other build path" (this is exactly how a genuine AVL Graph
rendering bug was isolated away from a suspected feature-specific cause — see
`planning/transportny/tasks/current/dynamic-reports-and-route-tags.md`, repo
root). **Correction, 2026-09-03**: the template no longer ships a starter
graph/stat section at all — it used to include a starter self-bound AVL Graph,
later replaced by an unconfigured hero-stat "Callout Stat" Card, which was
itself removed the same day it was found to just read as blank dead space
between the header and the (nonexistent) first graph. **Same day, second
pass**: the template's standalone header-prose `lexical` block (kicker/"What
question does this report answer?"/prose) was ALSO removed — it duplicated
`ReportPageHeader`'s own `purpose` field near-verbatim, and there were no
compelling lexical-block report examples to justify keeping the pattern
around. See `planning/transportny/tasks/current/report-page-template-
editorial-slots.md`'s "Removal" section for the full record. A fresh Report
Page now has exactly **2 sections** (`ReportPageHeader`, `ReportRouteList`)
and zero data/visual sections — the first graph always comes from RRL's own
"+ Add Graph", never a pre-existing slot. The template itself is now a
git-committed spec (`scripts/npmrds-reports/page_template_specs/
report_page.json`), built via `report_page_template_build.mjs` the same way
`report_build.mjs` builds pages from `dynamic_report_specs/*.json` — edit the
spec and `--apply` it rather than hand-editing the template row. Re-verify
this claim again if the template changes further.

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

**Correction, Ryan 2026-08-26: `/converted_reports` (page 2188366) is the site's real
homepage, not `/converted_reports/reports` (page 2208581).** Earlier session notes (including
just below) assumed 2208581 was "the homepage" — wrong, it's the curated Reports catalog page,
one level under the real homepage. Fixed throughout this section; if you find "homepage" still
referring to 2208581 anywhere else in this doc, it's stale, correct it in place.

A superset of the curated Reports page's AVAIL-curated Card grid (`converted_reports/reports`,
page 2208581) — that page itself is unchanged (still exactly the curated 12-card catalog), this
is an ADDITIONAL surface for searching everything the current user is authorized for, drawn from
the same `reports_snap_2` catalog (source 2177438 / view 2177440).

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
- **"Mine" was broken end-to-end until 2026-09-01, despite reading as shipped above** — two
  compounding bugs, both fixed (`routes-reports-users-mesh.md`'s 2026-09-01 progress-log entry has
  full detail): (1) `reportCatalogSource.js`'s `created_by` column was declared as a plain
  `data->>'created_by'` JSON field, a DIFFERENT thing from DMS's own always-populated system audit
  column of the same name — nothing ever wrote the JSON field (converted reports stash the old
  tool's creator under an inert `_old_created_by` instead; live authoring never wrote it at all),
  so "Mine" could never match ANY report. Fixed by declaring it `systemCol: true`. (2) A report
  published with zero routes never got a `reports_snap_2` catalog row at all — `CreateReportButton`
  only creates the page, and the row was only ever created lazily on the first route add
  (`useReportRow.js`'s `persistRoutes`) — making it invisible under every facet, not just "Mine".
  Fixed: the row is now created the moment the report's edit page opens if none exists yet, and
  `name`/`page_path` are (re-)written on every route/tag edit as self-healing. Verify current
  behavior by testing "Mine" live, not by trusting this doc's earlier "live-verified" claims below —
  they exercised the facet's UI/count-bar rendering, not whether it could ever actually match a row.
- **Trigger placement**: originally added draft-only to the curated Reports page (page 2208581,
  section 2214721, same section group as the existing `CreateReportButton` trigger), landed at
  the BOTTOM of the page. **Stale as of 2026-08-26**: since this was written, the page was
  edited and published (by a human, through the normal edit-mode UI, between sessions) — the
  PUBLISHED `sections` array now has both triggers reordered to the top, right after the intro
  heading: `CreateReportButton` (id 2214746) then `ChooseReportButton` (id 2214747), both in
  section group `b77dbc82-4485-4e9a-8046-cc3a7eedf5b4`. Confirmed live 2026-08-26. As always,
  publish clones draft component rows into fresh published-side ids rather than reusing them —
  see `draft_vs_published_sections_different_ids` if that's news.

### The real homepage (`/converted_reports`, page 2188366) — "New Report" fix + "Open Report" added, 2026-08-26

Ryan's ask: the real homepage's **"New Report"** button (top of page, next to "New Route") was a
dead-end — it just navigated to `/converted_reports/reports` instead of actually creating a
report — and he wanted a second button there to open the existing-report picker, matching the
curated Reports page's pair one level down.

- **Root cause**: unlike `CreateReportButton`/`ChooseReportButton` (real registered React
  components), the old "New Report" was a plain `Card` cell — `origin: "static", isLink: true,
  location: "/converted_reports/reports"` (section 2214127, the same Card row as the still-fine
  "New Route" cell, which links to `#routes` and was left untouched). A static Card link can only
  ever render an RRL `<Link>` (`Card.jsx` line ~637) — it has no way to invoke real component
  logic, so it could never actually create a page the way `CreateReportButton` does.
- **Fix**: removed the `new_report` column from section 2214127 (`cellsGridSize` 3→2,
  `cellsTracksTemplate` dropped one track — "New Route" alone remains in that Card), and added
  two brand-new PUBLISHED component rows cloned byte-for-byte from the curated Reports page's own
  proven-live `CreateReportButton`/`ChooseReportButton` rows (2214746/2214747 above) — new ids
  **2214758** (`CreateReportButton`) and **2214759** (`ChooseReportButton`) — into page 2188366's
  `Header` section group (`68a9bc92-7c50-4893-a1e7-575120b4f3b6`), inserted into the array right
  after 2214127. `CreateReportButton`'s own code comment already anticipated exactly this
  placement: `newPage()` derives the new report's parent from `item?.parent || item?.id`, and
  2188366 has `parent: ''`, so mounting it there correctly files new reports under "Converted
  Reports" (2188366) itself — same folder semantics as mounting it on 2208581 (whose `parent` is
  already 2188366).
- **Live-verified** via claude-in-chrome: both buttons render as real `<button>`s (not `<a>`
  links) in their own row right where "New Report" used to be; "Choose a report" pops the real
  `ReportPickerModal` (60 real results, Mine/Hide-incomplete-looking facets); zero console errors
  on a clean reload; `dms page show 2188366` confirms `title`/`url_slug`/`published` untouched,
  `sections_count` 28→30.
- **Write path — edited the PUBLISHED `sections` array directly, did NOT touch draft or publish
  the page.** This page's `draft_sections` (30 ids, `has_changes: true`) already diverges
  significantly from `sections` (unrelated pending edits, including the inert find-a-report modal
  precedent at 2214393-95 mentioned above) — publishing would have pushed all of that live
  unreviewed, way out of scope for this ask. Instead: `dms raw create` for the two new component
  rows (bypasses `section create`'s draft-only attach), `dms section update 2214127 --data
  {...}` (full replace of one row, the already-documented-safe pattern), then `dms page update
  2188366 --data '{"sections": [...]}'` — **a payload containing ONLY the `sections` key**.
- **New finding, refines the `--set`-on-array-fields caution above**: `dms page update --data`
  (as opposed to `--set`) is safe for a page-level array field, confirmed by reading the actual
  server path (`dms-server/.../dms.controller.js`'s `setDataById` → `jsonMerge()` in
  `db/query-utils.js`): the SQL is `data = COALESCE(data,'{}') || $1::jsonb` on Postgres (or
  `json_patch` on SQLite) — a shallow TOP-LEVEL merge, not a JS deep-merge and not a full-column
  replace. A `--data` payload with only `{"sections": [...]}` overwrites just that one top-level
  key; sibling keys (`title`, `url_slug`, `draft_sections`, `section_groups`, etc.) are absent
  from the payload and thus left completely alone. No page-specific special-casing exists in that
  code path — editing a page's array field this way is exactly as safe as the already-trusted
  single-component-row `--data` pattern. The earlier `--set` warning above is unaffected — that
  footgun is specific to `--set`'s client-side lodash `merge()` read-modify-write, which handles
  arrays by index-merging instead of replacing them; `--data` alone never goes through that code
  path.
- **Follow-up fix, same day**: the first pass reused `CreateReportButton`/`ChooseReportButton`'s
  exact section `data` verbatim (`size: "6"`, no `size` on `ChooseReportButton`, `title: "Choose a
  report"` on `ChooseReportButton`) — this looked fine on the Reports page's own big roomy hero,
  but on the denser homepage header it rendered as two giant stacked full-width blocks with a
  redundant "CHOOSE A REPORT" header band, not inline with each other. Root cause (confirmed by
  reading `sectionArray.jsx` + transportny's `sectionArray` theme, `themev2.js:2192-2347`): each
  section is one native CSS Grid item (`grid grid-cols-12 gap-0`), column span comes from
  `theme.sizes[data.size].className` (`col-span-12 md:col-span-N`), and **a missing `size` field
  falls back to `theme.defaultSize` — `"12"` on this theme, i.e. FULL WIDTH** — not
  "auto"/content-width; there is no fit-content/flex-based sizing option anywhere in this stack
  today, every grid item stretches to its full column span (`justify-items: stretch`, the CSS
  Grid default, never overridden). A non-empty `title` also always renders a hardcoded
  `ViewSectionHeader` band regardless of context (see `dms-section-create-cli-gaps` memory item 1
  — `title` must be `""`). Auto-wrap is plain native CSS Grid row-flow (no manual row-breaking
  logic exists) — two consecutive siblings whose spans sum to ≤12 land on the same row together.
  **Fix, on BOTH pages** (2214746/2214747 on the Reports page, 2214758/2214759 on the homepage):
  `size` on both buttons → `"3"` (was `"6"`/absent) so they share one row instead of each forcing
  its own; `title` on `ChooseReportButton` → `""` (kills the header band); and — a second-order
  effect, easy to miss — `ChooseReportButton` needed the same `padding: {"top": "8"}` as
  `CreateReportButton` added explicitly (it had none, `CreateReportButton` did), or the two
  buttons sit visibly misaligned vertically once they're actually side-by-side (`resolvePadding()`,
  `sectionArray.jsx:68-87`, back-fills any unspecified side with the theme's default gutter step,
  so "no padding field" and "explicit `pt-8`" are NOT the same baseline — worth checking any time
  two sibling sections need to align on one row). All four changes were single-field `dms section
  update <id> --set size=3 [--set title= ] [--set padding.top=8]` calls — no code changes, no
  layout restructuring. Live-verified via a zoomed screenshot that button tops align pixel-for-
  pixel after the padding fix. **Superseded on the homepage by the next round below same day —
  Ryan then asked for these truly inline with "New Route" too, not just with each other.** The
  Reports page (2214746/2214747) was left at this `size:"3"` state and is no longer being
  actively tuned — Ryan: "IDC about `/converted_reports/reports` anymore, that page is
  effectively dead."
- **Final homepage layout, same day**: Ryan wanted "Create Report"/"Choose a Report" truly
  inline with "New Route" in row 1, not on their own row below it. Root cause row 1 was
  full BEFORE the buttons ever got a chance: `heading(2) + search-Card(6) + freshness/NewRoute-
  Card(4) = 12` — zero room left regardless of button size. Found a stale, unrelated **draft**
  (`draft_sections`, created 2026-08-20, predates today's `ChooseReportButton` work entirely —
  see the still-live `has_changes:true` divergence noted above) that had already solved exactly
  this for `CreateReportButton` alone: it split the row into 5 narrower cells (`heading:2,
  search-Card:4, freshness-Card:2, CreateReportButton:2, NewRoute-Card:2` = 12) — confirmed via
  `dms raw get` on each draft id (2214366-2214395), not by publishing/trusting the draft. Useful
  independent confirmation: the draft's `find_label`/`freshness`/`new_route` Card content was
  **byte-identical** to the live published Cards (2214126/2214127) — same columns, same
  `_functions.click_publish` search wiring — so the published Cards could be resized in place with
  zero behavior risk, no need to clone the draft's copies. Applied to the PUBLISHED row only
  (`sections`, not draft — same reasoning as above): `search-Card (2214126)` 6→3, the combined
  `freshness+NewRoute Card (2214127)` 4→3, `CreateReportButton (2214758)` 3→2, `ChooseReportButton
  (2214759)` 3→2 — sums to 12, all six pieces (heading, search, freshness+route, New Route,
  Create Report, Choose a Report) now share one row. **Second alignment bug found here**: `dms
  section update <id> --data {...}` (payload WITHOUT a `padding` key) does NOT clear a
  previously-set `padding` field — the server's `data || $1::jsonb` merge only ever ADDS/
  overwrites keys present in the payload, it never unsets a key just because the payload omits
  it (this is the same shallow-merge behavior documented above as "safe," but it cuts the other
  way when you actually want to delete something). The earlier round's `padding:{"top":"8"}` on
  both buttons survived several `--data` pushes that didn't mention `padding` at all, keeping
  them visibly lower than "New Route" (which has no padding override). Fix: explicitly send
  `--data '{"padding": null}'` — `resolvePadding()` treats a non-object `padding` value as `{}`
  and falls back to the theme's default gutter on every side, matching "New Route"'s own
  (padding-field-absent) baseline exactly. **To unset/delete a field via this CLI, you must
  explicitly null it — omitting it from `--data` is a no-op, not a delete.** Live-verified via a
  zoomed screenshot: all three buttons' tops align pixel-for-pixel with "New Route" and with each
  other. Final row-1 sizes: heading `2214125`=2, search `2214126`=3, freshness+route `2214127`=3,
  Create Report `2214758`=2, Choose a Report `2214759`=2 — no `padding` key on either button row.

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

**Route names in the Routes pill/picker are TEMPLATE-RESOLVED (2026-09-16).**
Both the pill label (when exactly 1 route is assigned) and every row in its
popover run through `routeDisplayLabel` (`ReportRouteList/relativeDateResolution.js`),
the same rule RRL's own collapsed rows use — so on a Dynamic Report previewed
with `?routes=` in the URL you should read the **real** route name
("35E QUEENS MIDTOWN EXPY WESTBOUND (2025)"), not the stored `%n (%y)`
template. Two live-verification consequences:

- Asserting on a Quick Controls route name means asserting on the *resolved*
  string. It won't match the route's `name` in the DB, and it won't match what
  the same page shows with the `?routes=` param stripped.
- With **no** `?routes=` supplied, the raw `%n (%y)` template is the CORRECT,
  expected rendering — the slot genuinely hasn't resolved, and showing a
  half-substituted `" (2026)"` (`%y` resolves off dates alone; `%n` needs a real
  route) would be the bug. Don't file that as one.

A useful `--eval` selector pair: the pill is `[title="Routes on this card"]`;
inside the popover, the rows are the `<button>`s under the `routes · pick any`
label, with the name in the 3rd `<span>` and the date range in the 4th (each
row also carries the resolved name as its own `title` as of 2026-09-16).

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
- **STALE, corrected 2026-09-09: `?routes=` DOES resolve on a `/edit/...` URL.** The note
  originally here (2026-08-11) said it was silently inert in edit mode, citing
  `useDynamicReportRoutes`'s `enabled` check as `isDynamicReport && !isEdit &&
  routeIds.length > 0`. That was true THEN but was changed 2026-08-19
  (report-authoring-ux-overhaul.md item 7): the check is now `isDynamicReport &&
  routeIds.length > 0`, no `!isEdit` — an author previewing `/edit/<slug>?routes=...`
  sees the same resolved preview a real viewer would (route names/dates/TMCs all
  resolve; mutation controls stay edit-mode-gated as normal). Re-confirmed live
  2026-09-09 across many round-trips (dynamic-reports-authoring-gaps.md sub-item 4):
  editing a Dynamic Report with a `?routes=` param present shows fully resolved
  data, not raw slot placeholders. A plain `/edit/<slug>` with no `?routes=` still
  falls through to raw, unresolved slots (nothing to resolve against). If
  `report_probe.mjs "edit/<slug>?routes=<id> --auth"` ever shows an EMPTY graph
  again, treat it as a real signal, not this old expected-gating note.

### "Save as…" — duplicating a report, and converting its kind on the way (2026-09-15)

`ReportPageHeader`'s action row carries a copy button in BOTH view and edit mode (between Print
and Edit/Done), shown only to a signed-in user. **Its label is mode-dependent**: `Save as` in edit
mode, `Save a copy` in view mode — "Save as" is contrastive and only reads correctly next to a
save (edit mode's Done), which a viewer doesn't have. Match on the `Copy` icon or the dialog, not
on one literal label, when driving this headlessly. It opens `SaveAsReportModal`: a name field, a
two-option report-type choice, and a live preview of the tags the copy will carry. It creates a NEW
sibling report page and **never mutates the source**.

The type choice is symmetric, and the source's own kind is always preselected and labelled
`SAME AS THIS REPORT`:

| On a… | Options offered |
|---|---|
| static report | **Static** (keeps the exact routes) · **Dynamic** (routes become `%n (%y)` slots) |
| dynamic report | **Dynamic** (keeps the slots) · **Static** (freezes the routes showing right now) |

The Static option is **disabled with a tooltip** on a dynamic report whose slots haven't resolved
(RRL's own `groupsFullyResolved` test). A viewer can't reach that state — the entry gate blocks the
page first — but an author in `/edit/` can.

**Driving it headlessly.** The dialog's controls are plain buttons, so `find`/`read_page` refs work:
the name field is a `textbox "Name"`, the two type options are the next two buttons, then
`Cancel` / `Save copy` (the dialog's own wording is "Save a copy" / "Save copy" in both modes —
only the ACTION-ROW button label varies). After Save the page navigates to the copy in the **same mode you started
in** (`/reports/<slug>` from view, `/edit/reports/<slug>` from edit), so assert on the URL to know
it landed. A static result has **no `?routes=`** in the URL; a freshly-made dynamic copy opens
straight onto the route-selection gate.

**The slug is derived from the name**, via the repo's `"<title> Copy <n>"` idiom deduped against
sibling titles — so "Menands Test" copies to `reports/menands_test_copy`, then `..._copy_2`. Type a
distinctive name in the dialog if you want a predictable URL to probe afterwards.

**Two verification traps worth knowing:**

1. A copy made from **view mode** would be blank if only `draft_sections` were written, because view
   renders `item.sections` only (`pages/_utils/index.js:258`). The copy writes BOTH arrays, so
   always check the copy renders *in view mode*, not just in `/edit/`.
2. RRL's route line ("N TMCs · N.N mi") reads **0 TMCs** for a beat mid-load before the catalog row
   lands. Don't read it off a screenshot — query the DOM
   (`document.querySelectorAll` for the text) once the page settles. Same rule as everywhere else
   here: screenshots are for layout, the DOM is for values.

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
  to `defaultAnchorDate()` (see the publish-lag finding right below — **not** literal today).
  **2026-09-03: no longer the only way to set it.** `ReportPageHeader.jsx` now also carries a
  persistent "Viewing as of" date input (same gating condition, same `?asOf=` param, just written
  via a plain `navigate()` off `location.search` instead of the entry-gate's `onConfirm`) — visible
  in both view and edit mode, on every page load, not just the one-time gate. The gate's own field
  is untouched and still does its one-time job (e.g. re-triggering by mismatching the slot/URL
  route count still shows it); the header control is for changing the date at any other time. When
  no override is set, the header's reset control reads "Use latest available (<date>)", not "today"
  — see the publish-lag point right below for why that distinction matters.
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

### RRL row mutation (pencil/reorder/trash/name/date-edit) — page-level `/edit/` is enough, no separate `SectionEdit` needed

**Superseded 2026-08-19, re-confirmed live 2026-09-04** — this section used to say a row's pencil/
trash/reorder/date-edit controls needed RRL's own `SectionEdit` (hover the panel → Settings kebab →
click the pencil-square) on top of page-level `/edit/<slug>`, per a 2026-08-07 finding. That extra
gate was a deliberate design decision reversed by `report-authoring-ux-overhaul.md` item 3
(2026-08-19): `ReportRouteList`'s `canMutate` is now keyed on page-level `editPageMode` **alone** —
`const isEdit = Boolean(editPageMode); const canMutate = isEdit;` — with no requirement that this
section also be put into its own `SectionEdit` pencil-click mode first. Confirmed live 2026-09-04 on
a scratch report (`report_build.mjs`-built, 2 routes + 1 graph): loading a plain `/edit/<slug>` URL
immediately showed every row's mutation affordances (reorder arrows, color-picker dot, the combined
edit toggle, trash icon) and `ADD ROUTE`/`ADD GRAPH`/the Report Settings disclosure — no extra click
needed. **Author-empowerment break from DMS's normal per-section view/edit gating, not a bug** —
see the file's own top-of-hook comment in `ReportRouteList.jsx` for the full reasoning.

**Row-level UI, current shape (2026-09-04 restructure, edit-commit model replaced 2026-09-05)**:
collapsed, each row shows a **bold date-range line** (the prominent one) with a muted
`"N TMCs · X.X mi"` line underneath (swapped + reweighted 2026-09-05 — dates were originally the
muted line, TMC/mileage prominent; that read backwards per Ryan's feedback). A `PencilSquare`
button (`title="Edit route"`) enters edit mode, **replacing** that two-line summary with an
editable title `<input>` + the Fixed/Derived date editor in the same visual slot (not appended
below it) — no separate "Edit name" pencil, that's still true.

**Committing an edit is explicit Save/Discard, NOT autosave** (reversed 2026-09-05 — the
2026-09-04 restructure had shipped with autosave-on-blur/debounce for both fields, extending the
2026-08-19 item-4A "always live" decision for dates; Ryan's live feedback called the resulting
single ambiguous toggle misleading and asked for a real commit gate instead). While a row is in
edit mode, the header shows **two icon buttons side by side**: an `XMark` (`title="Discard
changes"`) and a green-tinted floppy-disk (`title="Save changes"`, disabled — greyed, not
clickable — while the name collides with a sibling or the derive-mode pick is incomplete/invalid).
Nothing persists until Save is clicked; Discard reverts the row's buffer to the last-persisted
values. Both live in the header row itself — an earlier same-day iteration put Save/Discard in a
bottom action row instead, found redundant with the header's own X, and was removed within the
same session (don't expect to find a bottom action row here). See `ReportRouteList/RouteRow.jsx`'s
own top comment and `planning/transportny/tasks/current/npmrds-reports-routes-feedback-triage.md`'s
"Phase 2 follow-up" section for the full design and live-verification record. A real viewer (not
an author) never sees any of this — see the section above, RRL is author-only, full stop.

**A caution still true**: once a row is in edit mode, click targets shift as soon as anything else
changes the layout above them (another row toggling open, the Report Settings disclosure). A
coordinate-based click that was correct a moment ago can land on a different row's reorder button
instead of the one it was aimed at — on a real, published page, this silently reorders
`reports_snap_2.routes[]` (no confirm dialog, though as of 2026-09-05 a reorder itself still
persists immediately regardless of Save/Discard — only name/dates are buffered). Prefer a DOM
query (`element.click()` on the button found by its exact `title`, e.g. `"Edit route"`/`"Discard
changes"`/`"Save changes"`/`"Move up"`) over coordinates inside this UI, and always re-read the DB
after any live-testing session here to confirm nothing unintended stuck.

## 5. Report-specific gotchas (check `traversing-dms-pages.md` §4 too)

The general state-machine/URL gotchas (subdomain routing, edit URL shape,
silent slug-fallback-to-home, stale auth tokens, template materialization,
CLI-cloned test pages, map/WebGL blank-canvas) now live in
[`traversing-dms-pages.md`](./traversing-dms-pages.md)'s §4 — they apply to
any DMS page, not just reports. What's specific to reports:

- **A report graph card has ONE title, and it lives in the card's header band (2026-09-11).**
  A regenerated report section carries `activeStyle: "reportCard"`, which selects transportny's
  named `pages.section` style — so the section header renders as a 40px bordered band at the top
  of the card instead of the generic 50px title row:
  - the band is `div.h-10.pl-4.pr-10` with `border-b border-zinc-950/10`;
  - the **title** is the `div` inside `div.flex-1.min-w-0 > div.flex-1.min-w-0` carrying
    `font-display … text-[15px] … text-[#0F1722] truncate`. ⚠ `div.h-10 div.flex-1.min-w-0`
    matches the header's INNER ROW first and its own wrapper second — both have those two classes.
    Select on `[class*="text-[15px]"]`, not on structure, or you measure the wrapper and conclude
    the theme token never applied (cost a round-trip 2026-09-11). Expect
    `15px / 500 / Oswald / rgb(15, 23, 34)`, `text-transform: none`, 12px above and 13px below in
    the 40px band.
  - **A title whose descenders look shaved is `overflow: hidden` on too short a line box, not a
    font problem.** `truncate` sets `overflow: hidden`, so a line-height equal to the font size
    clips Oswald's g/p/y (measured 2026-09-11: `clientHeight 15` vs `scrollHeight 18`). Test it with
    `el.scrollHeight > el.clientHeight` — a screenshot barely shows 3px. The token is
    `pages.section` `headerTitle`; it needs ~1.4 leading, and the band being `items-center` means a
    taller line box costs nothing.
  - the **kicker** (unit + time window, e.g. `mph · Weekdays only`) is the `div` carrying
    `tracking-[0.18em]`, right-aligned in the same band, fed by the section's `description`
    attribute. It is `hidden xl:block`, so a viewport narrower than 1280px has no kicker and that
    is not a bug.
  - there is **no graph-native title any more** on a report card — `display.title` is cleared at
    build time. `div.font-display.uppercase.text-[12.5px]` (the old in-card title) finding nothing
    is the correct state.
  - **A report built before 2026-09-11 looks completely different and that is also correct.** Its
    sections carry `activeStyle: "reportInlineTitle"`, which matches no `pages.section` style and
    falls back to `styles[0]` — the historical `flex w-full min-h-[50px] items-center pb-2` band
    with a 16px black Oswald title, plus the old in-card title. Both states are live on the dev
    site simultaneously (`reports/snapshot` regenerated, `reports/annual_average_study` not), which
    makes that pair the standing control for any change to the band.
- **Every NPMRDS report legend sits TOP-RIGHT (2026-09-11), and a corner position used to mean
  "no legend at all".** Until this date only `GridGraph`'s wrapper understood
  `top-right`/`top-left`/`bottom-right`/`bottom-left`; the other five (Bar, Line, Pie, Treemap,
  Sunburst) matched `legend.position` with strict equality against the four bare edges, so a corner
  value hit no branch and the legend **silently did not render**. If you are ever debugging a
  missing legend on an older build, check `display.legend.position` before anything else — it looks
  exactly like `legend.show: false`.
  - Fixed via shared helpers in `graph_new/components/utils.js` (`isTopLegend`/`isBottomLegend`/
    `isColumnLegendPosition`/`legendRowJustify`); a bare `top`/`bottom` still centres, so nothing
    that predates the change moved.
  - **How to verify placement: measure the legend CONTENT, never the row it sits in.** The row is
    full-width and therefore always "centred" on the plot no matter where `justify-end` puts its
    contents — a probe that measures the row concludes nothing changed. Walk up from the ramp (or
    the last swatch) only while the parent is still narrower than the card, then compare that box's
    right edge to the card's: expect **17px** (the graph's own `p-4` plus the card's 1px border).
  - The default for a newly minted report graph is `DEFAULT_LEGEND_POSITION_BY_GRAPH_TYPE` in
    transportny's `composeMeasureConfig.js` — reached ONLY by the three NPMRDS-report mint paths,
    so no other site's graphs are affected.
- **Graph legends: how to find one, and the caption above it (2026-09-11).** Two shapes, and they
  are structurally different:
  - **Categorical** (series identity — which line is which route): a container of items, each
    `div.flex.items-center.px-1.min-w-0` holding a swatch `div` with an inline
    `style="background-color: …"` and a label `div.min-w-0.truncate[title]`. Query the labels, walk
    up one level for the item, two for the container.
  - **Linear / gradient** (a colour ramp): the ramp is the only `div` whose inline `style` contains
    `linear-gradient`. Tick labels are absolutely positioned siblings inside the same box.
  - **Caption** — when a legend has one, it is a `div.truncate` that is the FIRST child of a wrapper
    one level above the legend's own box. There is no wrapper at all when uncaptioned, so test
    `firstElementChild !== theLegendBox` before reading it. A caption comes from an author-set
    `legend.title` (any legend type) or an automatic `legend.unit` (**linear only** — a unit over an
    identity key is meaningless, and shipping it to both was a real bug).
  - Measuring **label-vs-ramp overlap** is the way to catch the recurring "text on the gradient"
    defect: intersect each tick label's rect with the ramp's. Do NOT judge it from a screenshot —
    a few px of overlap is invisible to a compressed image.
- **A probe slug is NOT a browser URL — the `/npmrds` prefix.** `report_probe.mjs` takes a BARE
  slug (`reports/annual_average_study?routes=…`) because its default `--host` is already
  `http://www.localhost:5173/npmrds`. Paste that same slug into a browser and you get
  `http://www.localhost:5173/reports/…`, which is missing the prefix and does not resolve. When
  quoting a verify URL to a human, write the full
  `http://www.localhost:5173/npmrds/reports/<slug>` — the probe argument and the browser URL are
  different strings. (Cost a round-trip on 2026-09-10; Ryan: "your verification link was missing
  `/npmrds` at the start".)
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
- **MacroView's own chrome is gated behind that same resize** (2026-09-22).
  The bottom-left `Download N rows` pill lives in `mapChrome.jsx`, so on
  `/npmrds/macro` it is simply ABSENT from the DOM until the map has drawn —
  a `querySelector` for it right after load finds nothing and that is not a
  failure, just the un-resized state. Wait, `resize_window`, wait, then look.
- **The macro download builder carries `data-mv` hooks** (the same convention
  as `data-mv="geo-results"` in `controlsPanel.jsx`): `column-menu`,
  `column-search`, `column-results`, `column-count`, and for the grouped
  measure menu `column-group` (+ a `data-group` family key),
  `column-group-toggle`, `column-subgroup`, `column-add-all`. The MEASURE menu
  is grouped and collapsed by default (so a fresh open renders zero rows —
  that is correct, not a failure); the METADATA menu is a flat list. Use those instead of
  matching Tailwind class strings. Driving it from `javascript_tool`:
  `Download N rows` → `Add measure column`, and **the click and the DOM read
  must be two separate tool calls** — React has not re-rendered when a single
  call clicks and then reads, so the menu reads as absent and a second click
  in the next call toggles it shut again. Both mistakes look identical to
  "the feature is broken". A third, learned the hard way 2026-09-22: **if the
  human is clicking in the same tab you are reading, the state flaps between
  calls** and looks like a state bug — and **editing a source file after the
  tab has loaded triggers an HMR remount that resets component state**
  mid-run. Reload after an edit before drawing conclusions, and use your own
  tab (`feedback_use_own_scratch_page_for_ui_testing`).
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
  **Superseded 2026-09-14.** That per-entry `"wait"` override is gone, and so is the fixed-dwell
  model it patched. `report_probe.mjs` no longer settles on `networkidle` + a fixed wait —
  it waits for real quiescence: zero api requests in flight, no api activity, AND an
  unchanged render signature, all held together for `--settle-quiet` (default 1500ms) under
  a `--settle-cap` (default 90s). `--wait` survives only as a minimum floor, default 0.
  The dump carries `settle: { ok, reason, ms, pending, polls }`, and `probe_corpus.mjs`
  refuses to diff or baseline a dump that did not settle (retrying up to 3x first).
  A single run is now the answer — if findings vary between runs, that variance is itself
  the bug to fix, not something to average over. Background: the old model
  made two identical runs disagree on 14 of 17 blocker-instances — see
  `planning/transportny/tasks/current/report-probe-expect-and-golden-corpus.md` §2026-09-14.

### Reading a graph's Y domain back off the axis — the Unicode-minus trap (2026-09-16)

To check what value range a graph actually rendered (e.g. verifying a difference graph spans
below zero), read the left axis ticks:

```js
const left = svg.querySelector("g.axis-left, g.axis.axis-left");
const ticks = [...left.querySelectorAll("text")].map(t => t.textContent.trim());
// ["−15", "−10", "−5", "0", "5", "10", "15", "20"]
```

**`AxisLeft` renders a Unicode minus sign (U+2212 `−`), not an ASCII hyphen.** `Number("−15")`
is `NaN`. A probe that does `ticks.map(Number).filter(n => !isNaN(n))` silently drops every
negative tick and reports a floor of `0` — which looks exactly like a graph that is still
clamping its axis at zero. Normalize first:

```js
const nums = ticks.map(t => Number(t.replace(/\u2212/g, "-").replace(/,/g, "")))
                  .filter(n => !Number.isNaN(n));
```

This cost a real debugging detour on the difference-mode axis fix: the fix was already live
and correct, but the probe kept reporting `tickMin: 0`.

**Checking the line stays inside the plot**, separately from the ticks — use SVG user units
via `getBBox()`, not `getBoundingClientRect()` (memory of screenshot-based checks: they lie):

```js
const plotH = svg.clientHeight - 50;   // DefaultMargin top 20 + bottom 30
const b = path.getBBox();              // line path: d.length > 40 filters out axis/tick paths
const escapes = (b.y + b.height) > plotH + 1 || b.y < -1;
```

### Graph tooltips: hovering one, and where GridGraph defeats automation (2026-09-14)

The tooltip container is `.hover-comp` — a single element per graph, rendered whenever tooltips
are enabled and toggled with `display: none`, NOT mounted on hover. So `querySelector('.hover-comp')`
finding something proves nothing; check `getComputedStyle(el).display !== 'none'`.

Hovering has to be a REAL pointer move — avl-graph listens for `mousemove` on the marks.

**Use the element handle's own `hover()`, not `page.mouse.move()` with computed coordinates.**

```js
const marks = await svg.$$('rect.avl-grid, rect.avl-rect, rect.avl-stack, circle, path.avl-slice');
const m = marks[Math.floor(marks.length / 2)];
await m.hover({ force: true, timeout: 5000 });
await page.waitForTimeout(600);
```

**Why the coordinate version fails, and why it fails SILENTLY.** `boundingBox()` returns *viewport*
coordinates, and a report page is long — everything below the first card is off-screen at load. So
`page.mouse.move(box.x + w/2, box.y + h/2)` for graph 5 moves the pointer to a y-coordinate that is
nowhere near graph 5, lands on whatever is actually there (usually nothing), fires no `mousemove`
on any mark, and reports `tooltip: null`. There is no error. `elementHandle.hover()` scrolls the
element into view *first* and then moves to its live centre, which is the whole difference.

Marks by graph type: `rect.avl-stack` (Bar), `rect.avl-rect`, `path.avl-slice` (Pie),
`rect.avl-grid` (Grid), `circle`/`path.graph-line` (Line).

**GridGraph automates fine — corrected 2026-09-15.** This section previously said it did not, on
the theory that heatmap cells are sub-pixel and a synthetic move lands between them. That was
mis-diagnosed: the failing probe was using computed coordinates on a below-the-fold graph, i.e. the
bug above, and the cells are not sub-pixel (the snapshot report's "Average speed by TMC and 5-minute
epoch" renders 288 `rect.avl-grid` marks per row, comfortably clickable). With `m.hover()` the same
graph returns its tooltip first try — captured live at 199×366 with 11 TMC rows. Do not skip
automating a GridGraph tooltip.

Reading the tooltip's own chrome, once visible:

```js
const el = document.querySelector('.hover-comp');
const cs = getComputedStyle(el);          // container: the `tooltip` theme token
const body = el.firstElementChild;        // the content comp's own wrapper (keeps its OWN padding)
const rows = [...body.children].slice(1); // row 0 is the title
```

**Measure, do not eyeball.** Two tooltip screenshots taken before and after adding row padding
looked different only because the capture margins differed; the tooltips were identically sized
(304×63 both) because the token was never wired. Comparing the DOM rect caught it immediately.
Crop with `page.screenshot({ clip })` only to SHOW a human, never to judge a few px.

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
`reports/<slug>` — renamed 2026-09-02 from `converted_reports/<slug>`) are fine
on real pages since they only navigate and capture, never click.

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
