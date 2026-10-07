# `qa` pattern type: ticketing / delivery QA as a library feature

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [tny_control_room_qa](../../../../../planning/initiatives/tny_control_room_qa.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Phases 1–3 DONE and live-verified on `qa_test` (2026-09-30). Committed by the owner: phase 1 (library `4919d419`,
dms-template `e2b3e2e`), phase 2 (`3392cb9b`), phase 3a (`3e27b5d2`), phase 3b (`2450f728`), and the default-theme
restyle (`3a80c516`, 2026-10-01; the test-data reset was DB-only), option (b) parts 1–3 (`0cdba46b`,
2026-10-01) and phase 4 (`8be023e9`, 2026-10-02). All pushed: on 2026-10-02 the submodule matched `origin/master`
(`a32d9ae1`), and dms-template pointed at it. **Phase 5 (the Configure tab) BUILT and live-verified 2026-10-02,
committed `d590c66f` 2026-10-05** (section "Phase 5").

**▶ Next session, start here.** Phases 1–4 and option (b) parts 1–3 are built, committed and pushed. The owner
confirmed track-on-publish live on 2026-10-02 (a new page under a covered sub-site got its row on its own). The
owner dropped the push-test reminders on 2026-10-02, so don't raise them. **Phase 5 is built and committed:** the
owner committed it (`d590c66f`, 2026-10-05). The Overview's stale draft after an in-app move between patterns is
FIXED 2026-10-05, committed `5e075368` (section "Phase 5", "Found building it"). The owner picks what's next:
- **Design pass — DONE 2026-10-05; implementing it is under way:** [`qa-design-implementation.md`](./qa-design-implementation.md)
  (status `doing`: core enrichments, QA tokens / styles and all four page conversions built 2026-10-05,
  uncommitted; Configure, step 4, next). Mockups for all six pages, decisions and findings are in section "Design pass" below. Card's
  `valueFontStyle` size clash (section "Default-theme restyle and test-data reset") is folded into the QA-only Card
  styles there.
- **Status-change work still deferred** (phase 3a, "The status-change writes"): part 4 (change history, commit on
  blur) and story-status tracking. `resolved_date` stamping and the stage refresh are done (option (b) parts 1–3).
- **Phase 4 — DONE, committed `8be023e9`** (section "Phase 4"): live open counts on the Overview, a ticket's
  page name and stage read live, track-on-publish from the editor and `dms page publish`.
- **Phase 5 — DONE, committed `d590c66f` (2026-10-05)** (section "Phase 5"; feature switches
  moved to later). A Configure tab on the install's `manage_pattern` page in `/list`, so covered sites and labels
  stop being hand-seeded. It also closes
  phase 4's backfill gap ("turning a pattern on adds its published pages", via `trackPublishedPage`). Where the
  covered-sites list lives is already decided (2026-09-30, decision (A) in phase 3b): it stays the install's
  `qa_patterns` dataset, and Configure edits it. Signed-out visitors get the install's settings (and so
  `install.qa.datasets`) stripped. They find the list through an intake summary the server's stub for `qa` rows
  will carry (`research/qa-ticketing-system/installs-and-overrides.md`, "Ways the widget could find its install",
  option 1). That is a phase 6 change in `dms-server/src/routes/dms/dms.route.js` (stub at ~118-123), not built
  yet. It doesn't change phase 5's storage.
- The Design page feature is wanted later as an install feature (phase 3b decisions).

**Test install (2026-10-01): `QA` (pattern row 126, `/qa`), on the library default theme.** Its data is `qa_test`'s
own sub-sites and pages, not TransportNY lookalikes: covered sites AlphaPage, BetaPage (Pages listed, disabled); the
6 real AlphaPage/BetaPage pages across all six stages (`alphapage:page_1`, `betapage:page_1/child_chart`, …); 3
stories on `alphapage:page_1`; tickets #101–106 (rows 149–154), people at `example.com`. Seed file:
`scratchpad/qa_test/seed_2026-10-01.json`. Datasets `qa_tickets` (127/128), `qa_pages` (129/130), `qa_stories`
(131/132), `qa_patterns` (133/134), `qa_history` (135/136), all in environment 42. The old installs (Phase2 with its
TSMO/NPMRDS/Freight Atlas seed, and spares QA/QA2/QA3/QA4/Phase3a/Phase3b/Phase5) were deleted that day; see
"Default-theme restyle and test-data reset" below.

**Design and decisions:** `research/qa-ticketing-system/README.md` (plan v4) and `feature-roadmap.md`, both in the
dms-template repo root. This file is the implementation plan and the source of truth for build status. The code
seam is traced in `research/qa-ticketing-system/pattern-type-feasibility.md`.

## Design pass — DONE 2026-10-05 (two rounds; implementation in [`qa-design-implementation.md`](./qa-design-implementation.md))

The owner picked the design pass as the next work (2026-10-05). Output is HTML mockups for review; the owner then
converts them to the code pages (`skills/transcribing-a-design-card-to-dms.md` is the matching skill, since the QA
pages are Card sections defined in code, not CLI-created pages).

**Owner decisions (2026-10-05):**
- **Style source: Tessera `design_system_v6` (latest revision v6.7)**, the direction the library default theme is
  being ported to (`dms_tessera_default_theme`). Not the AVAIL public site (`avail_site/v7`).
- **Borrow layout and interaction from TransportNY's control room** (`TransportNY Design System/dms_design_system_v2/
  pages/sitemgmt-*.html`), not its colours. Its chip filters replace the default dropdown filters.
- **Theme keys are QA-only**, unless an existing key can be reused with no change. So the rail's edit-in-place field
  look (today a thick black border, no padding) becomes a QA-only style, not a change to every live-edit Card.
- **Staged:** round 1 = Ticket page, Tickets list, Report an issue (button + form, signed in and signed out). After
  the owner's review, round 2 = Overview, Page QA, Configure tab, empty and not-set-up states.
- Priority is the working feature set plus the Report-an-issue form; planned features (change history, my tickets)
  show only as marked placeholders.
- Very themable: every colour, border and padding goes through a small named token set; inferring a fresh install's
  look from the host site's theme is an implementation detail for later.

**Files:** `src/themes/tessera/design_system_v6/pages/qa-*.html` (next to the admin pattern's `admin-*.html`
mockups, the precedent for a library pattern's mockups).

**Round 1 — BUILT 2026-10-05, awaiting the owner's review.** Review artifact (cover + the three mockups):
https://claude.ai/artifact/DJR2Cx44MEjVj35QtrLW74 (cover source `scratchpad/qa_test/design-pass/review.html`,
shots beside it). Repo files, all uncommitted:
- `pages/qa-ticket.html`, `pages/qa-tickets.html`, `pages/qa-report-issue.html`: plain HTML + Tailwind CDN on the
  install's real tickets (#101–#106 as they stood 10-05). Every element carries `data-map` / `data-map-kind`
  (reuse · qa · core · planned · host); the review bar's "DMS map" switch shows them.
- `pages/_qa.css`: the QA tokens (`--qa-sev-*`, `--qa-kind-*`, `--qa-prio-*`), each defined from a Tessera base
  token, plus a TransportNY skin demo that swaps only base tokens and fonts, and the review scaffolding.
- `pages/_qa-review.js`: review-bar toggles (skin, map, page states). Never ships.
- `ds-nav.js`: a "QA pages" group added.

**Found while designing (facts for the conversion):**
- **The rail's black border is `Card.jsx:376`:** `className={`${editMode ? 'border' : ''} ...`}` on every edit
  component. A bare `border` under Tailwind 4 takes `currentColor`, hence black, and no theme key reaches it. Proposed
  fix: a `dataCard` style key `editField` whose default is `'border'` (no change for any other Card); QA's styles set
  the borderless-until-hover look.
- **"please enter value…" is already overridable:** `Card.jsx:373` sets `placeholder` before spreading the column's
  own props, so a column's `placeholder` wins today. No code change needed.
- **Reusable as-is:** `stacked_bar` (built 2026-07-08) for found-by; `flow_step`, `data_bar`, `stat_value`;
  `formatFn: date / datetime` (gives `09/24/2026 2:00 pm`); Card link cells with `activeOnSearchParam` + `cellActive`
  for the All / Open / Closed shortcut; named-style pickers `cardStyle`, `filterStyle`, `tableStyle`, a column's
  "Column Type Style" (`activeStyle`) and `pillColors` for every QA-only style.
- **`stage_progress` exists** but hard-codes 20px dots and inline hex colours; the compact stage meter is a variant
  of it plus theme keys, not a new type.
- **Today's Tickets strip omits the waiting statuses** (Needs decision, Needs data); the mockup adds a Waiting count.
- **Today's Done-per-day chart prints every day label twice** (time-axis ticks), a bug, not a design choice.
- Small core additions the mockups assume, each listed on the cover with a fallback: `editField`, `kv_chips` (env
  JSON), `comment_thread` (comments JSON), the `stage_progress` compact variant, status option groups by kind
  (optional), the tick fix. The report widget itself is phase 6.

**Owner answers to round 1 (2026-10-05), taken as a go on the direction:**
1. **Status menu: flat list for now.** Grouping by kind ("would be cool") is wanted later; it needs option groups
   in the shared select (core). The mockup now shows the flat list.
2. **Report button placement: configurable**, theme or install, precedent decides. **Picked: the theme.**
   Precedent: TransportNY's button is its `QuickLinks` widget placed by `layout.options.sideNav.bottomMenu`
   (`src/themes/transportny/themev2.js` ~374), the same slots that place Logo / ThemeToggle / UserMenu
   (`ui/components/Layout.jsx` `getMenu`), editable in the admin theme editor. So phase 6 builds a `ReportIssue`
   widget registered in `ui/widgets/index.jsx`; a theme puts it in any nav slot, and "floating" is a widget option
   (`{ type: 'ReportIssue', options: { placement: 'floating' } }`, `getWidget` already passes `options`). The
   install only decides which pages show it (coverage), not where. Open for phase 6: a site that replaces
   `bottomMenu` wholesale drops a default entry, so the library default needs a fallback.
3. **Keep severity Feature** for ideas for now; the owner expects to drop it one day (a separate kind column).
4. **Comments and history stay placeholders** in round 2.

**Round 2 — BUILT 2026-10-05, awaiting the owner's review** (same artifact, version 2). New files, uncommitted:
`pages/qa-overview.html` (states: live / no sites / not set up), `pages/qa-page.html` (AlphaPage / Page 1, with the
New ticket modal), `pages/qa-configure.html` (admin v6 chrome; states: datasets missing, unsaved edits). Round 1
pages now show the flat status list, the theme-placed `ReportIssue` widget and a "no matches" Tickets state. All six
share one review nav; `ds-nav.js` lists them. Data checked live: the 7 tracked pages, routes and stages (incl.
`alphapage:new_page_2`, added by track-on-publish) read from `dms_qa_test.data_items__s129_v130_qa_pages`.

**Found in round 2:**
- **Configure is a React tab, not sections:** `QaConfigureTab` (`patternEditor/qa/configureTab.jsx`), registered in
  `patternEditor/index.jsx:54-57` + `admin/siteConfig.jsx:446` for `pattern_type === 'qa'` only, styled by
  `admin.qaConfigure` (QA-only) over `admin.settingsEditor`. Its conversion edits that JSX and those keys.
- **The `radio` column type isn't themable** (`ui/columnTypes/radio.jsx` hard-codes a local `theme` object; no
  ThemeContext, no named styles, no per-option markers). The clickable stage list and the New ticket severity chips
  need that core change; fallback is today's selects.
- **Stage colours become one accent ramp** (`--qa-stage-*`, `color-mix` toward the panel, ending in success), replacing
  `STAGE_HEX`'s six unrelated hexes; `stacked_bar` segments take `var(--qa-stage-*)`.
- The probe harness couldn't render `/list/manage_pattern/126/configure` (blank content, sidenav only "Auth ›
  Profile", no errors); the owner supplied a screenshot (`scratchpad/qa_test/design-pass/shots/before-qa-configure.png`).

**Owner answers to round 2 (2026-10-05): both yes.** The "How delivery works" captions (who / what per stage,
TransportNY's wording) ship as the library's default and become install-editable later, alongside the feature
switches. The `radio` column type gets made themable, so the stage picker and severity chips ship.

**Closed 2026-10-05:** the owner asked to move to implementation. The build plan (core enrichments → QA tokens and
named styles → page conversions → Configure; Report an issue stays phase 6) is
[`qa-design-implementation.md`](./qa-design-implementation.md).

## Default-theme restyle and test-data reset — DONE 2026-10-01 (committed `3a80c516`)

**Why (owner, 2026-10-01):** the TransportNY lookalike data and look on `qa_test` made the feature hard to work on.
Stop using data that mimics TransportNY, and give the QA pages a look of their own, using the defaults.

**Test data reset.** Backed up first to `scratchpad/qa_test/backup_2026-10-01/` (`rows.json`: site 1, environment
42, the 8 install rows, their 50 source/view rows; plus Phase2's 4 non-empty split tables). Then: site 1's `patterns`
cut to Auth, Pages, AlphaPage, BetaPage; environment 42's `sources` emptied; `dms raw delete` on install rows 38–41,
53, 64, 77, 88 and source/view rows 43–98. Not dropped: the 10 old split tables (`data_items__s43_v44_phase2_tickets`
… `__s84_v85_qa4_patterns`), now referenced by nothing (the CLI has no table drop; the Datasets admin's
`uda.sources.delete` would have, but there's no Datasets pattern on `qa_test`). Then a fresh install from Add
Pattern (`QA`, row 126) and the seed above. The same visit to the Sites page also created an Admin pattern (row 125,
`/list`): the admin pattern's recent backfill (`backfillAdminPattern`, `patterns/admin/pages/editSite.jsx:89`), kept.
- Each install that ran its dataset step made 10 rows (5 datasets × source + view); split tables appear only on a
  dataset's first row write.

**The look: the library default theme's vocabulary only** (`patterns/qa/pages/*`). Quick decisions, owner-delegated:
- Text: the default textSettings keys through one map, `T` in `helpers.js` (`text3XLBold` page titles, `textLGBold`
  card titles, `caption` secondary text, `body` prose, `textXS` labels). Lexical titles via `crumb` / `pageTitle` /
  `cardTitle`. Dropped: the `// kicker` lines, the gold period, TransportNY's `meta*`/`display*`/`prose*`/`btn*`/
  `stat*` tokens.
- Layout: every group is a `content` band (the default `header` layout group is a 200px unpadded band); 2–4 bands a
  page instead of 4–6; sizes are the default grid's fractions (`1/2`, `1/3`, `2/3`, `1`; `section()` defaults to
  `1`). The Overview's six stage tiles became one 6-cell "Pages by stage" Card. Facets sit 2×2.
- Pills: the default pill styles (`red`, `orange`, `blue`, `green`, `gray`) instead of `slate`/`amber`/`zinc`/`ink`.
- Charts: the graph theme's own fonts, axes and background; only the series colour and a 14px title. Titles
  "Opened / day", "Done / day" (longer ones wrap in the graph's title box).
- Dropped TransportNY-only style names that fall back to the default anyway: `cardStyle: 'rowaligned'`,
  `tableStyle: 'flush'`, `filterStyle: 'filter_panel_light'`, the rail's `offset: 13`, `barColorKey: 'success'`.
- Copy: the Overview's agency voice ("we build it / you review + approve") is gone; the modal caption is "Describe
  what you saw on this page."
- **Unchanged:** every data binding, SQL calc, filter, the modal's create-time defaults, and the ticket record
  (statuses, stages, `client`/`dev`/`ai` sources) — those are the data model the TransportNY port depends on.

**Finding: on the default theme a Card cell's `valueFontStyle` sets weight but not size.** Card puts its own `value`
class (`font-sans text-sm …`, `ui/components/card.theme.jsx:10`) and the textSettings token on the same element
(`Card.jsx:620`), and `text-sm` wins over every other size. TransportNY's tokens use `!` to win. Headers aren't
affected (the token sits on an inner span). Worked around in QA, not fixed: figures render through the `stat_value`
column type (`stat()` in `helpers.js`; it sizes an inner span), and data-bound titles (Page QA's page name, a
ticket's title, site card titles) stay body-size bold. A library fix (drop the size from the default `value` class,
or put the token on an inner span) changes every default-theme Card, so it needs its own blast-radius check first.

**Known look gaps left as-is:** the Ticket page's rail and body show every field as a plain input (the card-wide
`allowEditInView` from phase 3a; read-only fields like reporter/opened included); multi-line steps fold onto one line
(the default textarea view is `whitespace-normal`); every page's sidebar header reads "Admin" (site-wide, AlphaPage
too; not QA); the 7 React unknown-prop console errors on the Ticket page (phase 3a's `Card.jsx` note).

**Tests**
- [x] New `tests/qaDefaultTheme.test.js` (4): every text style, section size, group theme and pill colour the pages
  name exists in the library default theme. Fails 4/4 on the pre-restyle pages, passes on the new ones.
- [x] `qaOverviewPages` (stage card replaces the tile test), `qaTicketPages` (sizes `2/3`/`1`), fixtures `tsmo2`/
  `npmrds` → `alphapage`/`betapage`, `qaInstall` subdomain `tsmo` → `docs`. QA suites 72/72; full
  `packages/dms/tests` 613/616, the same 3 unrelated failures.
- [x] Live (probe, `qa_test` token): `/qa`, `/qa/tickets`, `/qa/ticket?id=149`, `/qa/page?key=alphapage:page_1`: no
  page, SQL or non-200 errors; counts match the seed (6 pages · 1 accepted, 4 open / 2 done, one page per stage,
  33% resolution, AlphaPage 1 done · 1 open, BetaPage 1 done · 3 open).
- [x] Owner's look check (2026-10-01): fine for now; a dedicated design pass comes later.

## Objective

A `qa` pattern type in `@availabs/dms` that rebuilds TransportNY's delivery control room (`sitemgmt` pattern
2184885 + its four `sitemgmt_*` datasets) as a feature any site adds from Add Pattern. The core comes first and
is settled before any view or add-on is built on it. TransportNY is then ported onto it (its live tickets move,
the old control room retires).

## Scope

**In (the core):** the type and its code-defined pages; the ticket record (fixed status kinds, closed outcomes,
change history); installs (settings on the pattern row, datasets no other install uses, one install per covered
sub-site); derived values without a sync; the Configure page; the "Report an issue" widget (signed out too); the
`dms qa` CLI; a rehearsal of the TransportNY data copy.

**Out:** new features (support-desk fields, renamable statuses, reopen/merge, screenshots from the button,
attachments, sign-off), MitigateNY, the later add-ons (board, clocks, staff intake, notifications, snapshots,
activity feed), server-side hooks, the throwaway DB, agents, server-side authorization. The TransportNY port itself
(phase 8) is TransportNY work and gets its own task under `planning/transportny/` when it starts.

## Current state

- **Test app: DONE (2026-09-29).** App `qa_test`, site `qa_test:site` (id 1, "QA Ticketing Test") in the
  production DB, made through `/list/create` with `VITE_DMS_APP=qa_test` / `VITE_DMS_TYPE=qa_test` in the root
  `.env` (the TransportNY block is commented out beside it).
  - Patterns: `Auth` (2), `Pages` (3, `/`), `AlphaPage` (5, `/alphapage`, public `view-page`), `BetaPage` (7,
    `/betapage`, admin-only), `Admin` (125, `/list`, the admin backfill, 2026-10-01) and the test install `QA` (126,
    `/qa`, 2026-10-01). The phase 1–3 installs (38–41, 53, 64, 77, 88) were deleted 2026-10-01. AlphaPage has 2 pages, BetaPage has 2 plus 2 children under `page_1`
    (`page_1/child_chart`, `page_1/dup_no_chart`). All 7 pages are published (`published: ''`).
  - AlphaPage/BetaPage store `authPermissions` in the per-subdomain format `{"*": "<json>"}`, Pages in the flat
    format. Both are read by `render/spa/utils/index.js:39, 56`; qa code must resolve permissions through that
    path, never parse the flat shape directly.
  - The app has its own id sequence (rows 1–37) and schema `dms_qa_test`.
  - CLI access: the dev account is in `qa_test Admin`; mint with the dev mint script, `project: "qa_test"`
    (`scratchpad/npmrds-sub/mint_token.sh qa_test` → `.dms-auth-token-qa_test`).
  - **Browser probes need that token too:** `report_probe.mjs <url> --host http://localhost:5173 --auth
    scratchpad/npmrds-sub/.dms-auth-token-qa_test`. Bare `--auth` loads the npmrdsv5 token: the page still shows the
    dev account signed in, but the server returns pattern rows without their settings, so every install renders
    the "datasets aren't set up yet" placeholder (2026-09-30). The unauthenticated CLI shows the same stripped row
    (`updated_at: no-access`); read `dms_qa_test.data_items` with `dbq.py new` to see the real one.
- **Known CLI quirk (not ours to fix here):** `dms site tree` labels `published: ''` pages `[draft]`;
  `dms page list` classifies them correctly (`cli/src/commands/page.js:61`). Any "is published" check in qa code
  must treat `''` as published.
- **Library seams, re-verified 2026-09-29:**
  - Pattern registry: `patterns/index.js:8-15`.
  - Page config: `pagesConfig(props)` returns a plain object; `children[0]` is the context shell, its children
    are `edit/*` (action `edit`) and `/*` (action `view`) (`patterns/page/siteConfig.jsx:149-268`).
  - Preload: `if (dmsConfig.preload) data = await dmsConfig.preload(falcor, data, request, params)` replaces the
    loader's rows (`render/dmsPageFactory.jsx:89-91`). The page pattern's own preload uses `findPageItem(data,
    slug)` + `preloadSectionComponents` (siteConfig.jsx:157-162).
  - Page match: `if (params['id'] == data['id']) return true` (`dms-manager/_utils.jsx:98`). For an item with no
    id this is `undefined == undefined` → true, so id-less rows fed through the wrapper would all match. **Phase 1
    no longer goes through the matcher** (design note 2026-09-30 in phase 1), so this line is untouched.
  - The wrapper renders `<Component {...props} item={item} dataItems={data} …/>` (`dms-manager/wrapper.jsx:157-179`)
    and caches that render on `[data, item]`. A route's `type` is our own component, so it can pass its own
    `item`/`dataItems` to `PageView`.
  - Visit tracking skips `!item?.id` (`patterns/page/pages/view.jsx:42`).
  - Add Pattern: `AddPatternPicker.jsx` (`NON_PAGE_OPTIONS`, `TAG_CLASS_KEY`, `getDefaultName`, `onAdd` sends
    `pattern_type: selected.kind`); two `addNewValue` copies create the row: `editSite.jsx:334-376` and
    `components/patternList.jsx:220` (lazy-loaded by `admin.format.js:9` for the Edit modal).
  - Pills: `editSite.jsx:133` (`TYPE_PILL_KEY`), `:142` (`TYPE_ORDER`).

## Owner decisions (2026-09-29 review)

- **No invented ids for code pages.** Nothing else in the library invents ids for non-rows.
  - *Superseded in part 2026-09-30:* the 09-29 answer was "fix the matcher instead". The owner then asked why QA
    pages don't work like the admin pattern's code pages; they now do (the route picks its page itself), so the
    matcher is not changed at all. The no-invented-ids rule still holds.
- **QA pages don't count toward page-visit analytics.** Code pages have no id, and visit tracking skips
  `!item?.id` (`patterns/page/pages/view.jsx:42`). No view.jsx change.
- **Match repo precedent (2026-09-30).** Always follow an existing pattern's approach where one exists (owner).
  For routes: each pattern declares its own route list; none trims another's (phase 1 design note).
- **Configure lives in `/list`, the admin's pattern editor (owner direction, 2026-09-30; confirm at phase 5
  start).** The README (step 6) planned a Configure page inside the install. The owner: that's where all the
  other pattern config lives. Precedent in `patterns/admin/pages/patternEditor/index.jsx`:
  - **Users and permissions:** the Access tab every pattern type already has (users, groups, row filters). Nothing
    new to build.
  - **Covered sub-sites, page families, labels, switches, who can report:** a qa-only tab, added the way page
    patterns add Pages/Sources/Activity (`item.pattern_type === 'page' ? [...] : []`, line 110). Confirmed by the
    owner 2026-10-02: a `Configure` sidebar tab on the install's own `manage_pattern` page. The sidebar's list is a
    second place to add it (`buildPatternMenuItems`, `patterns/admin/siteConfig.jsx:440`).
  - To check at phase 5: whether an install's own admins who aren't site admins can reach it. The pattern editor
    checks per-pattern manage access (`hasPatternManageAccess`), but the Sites list checks site-level access.
- **Phase 2 review (owner, 2026-09-30):**
  - **Name check: the server read route is approved** (phase 2 step 3).
  - **TransportNY's current control room must be unaffected, and isn't to be fixed here.** It works standalone. So
    no change to the shared view-mode save path (`dataWrapper` View `updateItem`) in phase 2; the planned step 0
    (debounce + `setDateOnValue` in view mode) is dropped.
  - **Shared data environment, not one per install** (reverses the 2026-09-29 "own environment" confirmation). An
    install registers its datasets in an existing environment of the site, the way page patterns read datasets from
    the site's Datasets patterns' environments (`render/spa/utils/index.js:265`, `buildDatasources` 321-360) and two
    Datasets patterns can share one (deduplicated by `dmsEnvId`). TransportNY's control-room datasets sit in its shared
    `datasets_env` today. One environment must exist; the install refuses otherwise.
  - **Change history: the writer moves to phase 3 (owner OK).** Phase 2 creates only the history dataset, as part of
    the ticket record. Phase 3 decides how rows get written, next to the ticket controls, preferably inside QA code
    rather than the shared save path.
  - **The half-second Card save bug is logged**, not fixed:
    [`card-liveedit-shared-debounce-drops-saves.md`](./card-liveedit-shared-debounce-drops-saves.md) (also records
    that `setDateOnValue` never runs in view mode).
  - **Open for phase 3: how QA stamps `resolved_date`.** Either phase 3's status control stamps it in QA's own write
    path (with the history writer), or the logged library fix makes `setDateOnValue` work in view mode, which also
    changes TransportNY's Card pages. Owner call then.
  - **A site with no data environment gets a `default` one (owner, 2026-09-30).** Background: No pattern type refuses for lack of a Datasets pattern:
    page patterns just have no internal datasets to pick (`buildDatasources`), a Datasets pattern with no environment
    keeps sources on its own row (legacy, `sourceCreate.jsx:72`), and only the "Dashboard" site template creates an
    environment (`default`, `ui/siteTemplates.js`, via `tenantProvisioning.js:171-180`). So the install creates a
    `default` environment and links it to the site, as that template does, and Add Pattern always works.
- **Resumable installs + no auto Datasets pattern (owner, 2026-09-30, after `qa4`'s install was cut off by a dropped
  connection).** (1) The install writes the pattern row's record first and after each dataset; (2) a re-run adopts
  existing `<install>_<key>` datasets instead of refusing; (3) a "Datasets: N of 5 · Create missing" row on a QA
  pattern's Overview in `/list` re-runs it (the first piece of the phase 5 Configure tab). For a site with no Datasets
  pattern, nothing extra is created (option a): an admin who wants to browse the tables adds one and picks the
  environment; the Overview row links to the Datasets pattern that uses the install's environment, when there is one.
- **Initiative (2026-09-30):** new `dms_qa_ticketing` (primary); `tny_control_room_qa` secondary, since
  TransportNY's control room is the hardcoded first pass this replaces and phases 7–8 port its data. The owner
  rejected `dms_page_editor_admin` (that one is the admin's page/site editing).
- **Dataset naming approved:** per-install dataset names (`<install>_tickets`, …); tables keep the standard
  `data_items__s<source>_v<view>_<name>` format. Unique names are needed because the server resolves a dataset
  by name (newest source in the app), not by source id.
- **Status kinds, default statuses and outcomes live in code**, not the DB (phase 2).
- **"Ticket record"** = the ticket's data: fields (dataset columns), status kinds, outcomes, change history.
  Stored as internal datasets like today's `sitemgmt_*`. No core change to create or read it; the change history
  probably needs one small generic addition to the section edit path (confirm at phase 2 start; precedent: the
  same-row `setDateOnValue` column option, `build_cr_tickets.mjs:382`).
- **Leave all changes uncommitted; the owner commits.** (Phase 1 committed by the owner 2026-09-30.)

## Build order (phases)

The README numbers the core as steps 2–7. The build order differs in one place: **the ticket record and the
install hook (README steps 3–4) come before the page conversions**, because the converted pages bind to datasets
that have to exist first.

| Phase | README step | What | Status |
|---|---|---|---|
| 1 | 2 (part) | Skeleton type: registration, admin-style code pages, no edit route | DONE 2026-09-30 |
| 2 | 3 + 4 | Ticket record + install hook: schemas in code, datasets created per install, refs on the pattern row | DONE 2026-09-30 |
| 3 | 2 (rest) | The four control-room pages as code, bound to the install's datasets; switches; theme-added pages | 3a + 3b DONE (Design page deferred) |
| 4 | 5 | Derived values without a sync, incl. track-on-publish | DONE 2026-10-01 (`8be023e9`) |
| 5 | 6 | Configure tab on the install's `manage_pattern` page (covered sites, labels) | DONE 2026-10-02 (`d590c66f`) |
| — | — | Design pass (mockups for all six pages) → its implementation, own task [`qa-design-implementation.md`](./qa-design-implementation.md) | design DONE 2026-10-05; implementation next |
| 6 | 7 | Widget (signed out too) + `dms qa` CLI; feature switches (moved from 5) | NOT STARTED |
| 7 | 8 | Rehearsal: copy TransportNY's QA data into an install on `qa_test` | NOT STARTED |
| 8 | 9 | TransportNY port (own task under `planning/transportny/`) | NOT STARTED |

Phases 2–7 are outlined below and get their detailed plan written here before each starts.

---

### Phase 1: Skeleton type — DONE (2026-09-30, live-verified on `qa_test`)

**Goal:** Add Pattern → "Ticketing / QA" creates a pattern row whose URL renders pages defined in code, with no
editor. Each `qa` row is its own install, so one app can hold several. It proves the seam end to end before any
real page is converted.

**Design note (2026-09-30): admin-style pages, not the `preload` swap.** The 09-29 plan fed code pages into the
loader through `preload` and fixed the matcher so id-less pages wouldn't all match. The owner asked why QA pages
don't work like the admin pattern's code pages. They now do:
- Admin's pages are route components: the router picks the page from the URL, and the wrapper's matcher only ever
  sees the site row, which has an id (`patterns/admin/siteConfig.jsx:127-200`).
- The page pattern picks its page by running the matcher over every row (`dms-manager/wrapper.jsx:34`), which is
  where id-less pages break (`dms-manager/_utils.jsx:98`).
- The QA view route's component picks its own page and renders
  `<PageView {...props} item={page} dataItems={pages} />`. The wrapper spreads its props first, so ours win.
- Result: no shared-code change, no `preload` row swap, code pages never reach `filterParams`. Visits are still
  skipped (no id).
- **Unknown URL → the install's first page (design note 2026-09-30, owner asked).** Not-found is per pattern: the
  site's bare "404" route (`render/spa/dmsSiteFactory.jsx:218-222`) is last in the route list and only catches
  URLs no pattern owns, since a pattern at `/qa` claims `/qa/*`. The page pattern shows its first row when no slug
  matches (`dms-manager/wrapper.jsx:33-44`), so QA does the same (`findQaPage` → the `index: 0` page). A first
  draft rendered an in-pattern "Page not found" page; dropped as an invention with no precedent.
- **The slug is read with `useParams()` inside our component**, not from props: the wrapper caches its render on
  `[data, item]` (`wrapper.jsx:157-179`), and a router hook re-renders on every URL change regardless.
- **Trade-off:** the pattern's `preload_data` option (section data pre-fetched into loader rows) doesn't reach code
  pages, because they aren't loader rows. It's off by default and QA pages don't need it.

**Design note (2026-09-30): match repo precedent for routes.** No pattern trims another pattern's routes. Admin,
datasets, auth and mapeditor each declare their own route list, and admin has no edit route because it never
declares one. So the QA config declares its own route list: the page pattern's context shell (`CMSContext`,
`ThemeContext`, `MountContext`, built in `pagesConfig`'s closure) with one view child. Borrowing page-pattern
pieces has precedent: `patterns/datasets/components/ValidateComp.jsx:6-28` imports page components.

**New files** (`patterns/qa/`)
- `siteConfig.jsx`
  ```js
  const qaConfig = (props) => {
    const page = pageConfig[0](props)        // theme, registrations, contexts, format, route auth: reused as-is
    const [shell] = page.children            // the context-provider route (action 'list', path '/*')
    const pages = buildQaPages(props.pattern)
    return {
      ...page,
      preload: (falcor, data, request, params) => { prefetch section chunks for the code page; return data },
      children: [{
        ...shell,
        children: [{ type: QaPageRoute(pages), path: '/*', action: 'view',
                     authPermissions: props.authPermissions, reqPermissions: ['view-page'] }],
      }],
    }
  }
  ```
  - `QaPageRoute` reads `useParams()['*']`, finds the page (`''` → the `index: 0` top-level page; otherwise
    `url_slug`; unknown → the `index: 0` page), and renders `PageView` with `item`/`dataItems`.
  - `format` stays the page format: `SectionGroup` reads `attributes.sections.ViewComp`
    (`pattern-type-feasibility.md` §1 step 5).
  - The loader still queries `<instance>|page` rows (one small empty request per navigation). Accepted; the
    datasets pattern's `stopFullDataLoad` filter (`patterns/datasets/siteConfig.jsx:111-115`) is the follow-up if
    it shows up in timings.
- `pages/index.js` — `buildQaPages(pattern) → page[]`, a fresh array per call.
  - Phase 1: a placeholder "Tickets" page (`url_slug: 'tickets'`, `index: 0`, one inline lexical section) and a
    detail page (`ticket`, `hide_in_nav: true`) to prove slug resolution.
  - **Design note (2026-09-30): every page gets a non-empty slug.** The first draft gave Tickets `url_slug: ''`;
    the unit test caught its nav link as `/qa/undefined`, because `navPath` uses `url_slug || path || id`
    (`utils/nav.js:40`) and code pages have no id. DB pages always carry a slug, and the bare pattern URL shows
    the `index: 0` page, so QA does the same.
  - Every page: **no `id`**; fixed `section_groups[].name` and a fixed `trackingId` per section, written inline in
    the page definition (no constants file); `published` absent (nav hides `'draft'`).
- `pages/view.jsx` — `QaPageView`, the route component (a component-only `.jsx` for Fast Refresh, like
  `patterns/page/pages/view.jsx`). Reads `useParams()['*']`, rebuilds the pages per URL, renders `PageView`.
- `qa.test.js` — unit tests (below).
- **Reused helpers:** `lexicalElementData` and `headingBodyLexicalState` in `ui/pageTemplates.js` gain `export`
  (the admin's page templates are the existing code-built pages; same group shape `{name: 'default', position:
  'content', index: 0, theme: 'content'}`). Additive; they had no other callers.

**Edits** (all additive)
- `patterns/index.js` — `qa: qaConfig`.
- `patterns/admin/components/AddPatternPicker.jsx` — `{kind: 'qa', label: 'Ticketing / QA', desc: …}` in
  `NON_PAGE_OPTIONS` (6-9), `TAG_CLASS_KEY.qa` (14-19), default name "QA" in `getDefaultName` (21-30).
  `AddPatternPicker.theme.js` — a `tagQa` class (15-21).
- `patterns/admin/pages/editSite.jsx` — `qa` in `TYPE_PILL_KEY` (133-139) and `TYPE_ORDER` (142);
  `editSite.theme.js` — a `typePillQa` class.
- `patterns/admin/admin.format.js` — `{value: 'qa', label: 'Ticketing / QA'}` in the `pattern_type` options (70-76).
- Duplicate hidden for `qa` in the three places that offer it (each copies a fixed field list and would drop qa
  settings):
  - `editSite.jsx:267-300` — Sites table row actions. Precedent: `isAuthType` already hides duplicate and delete
    for auth; qa hides only duplicate.
  - `components/patternList.jsx:416-446` — the Edit modal's duplicate button.
  - `pages/patternEditor/default/settings.jsx:360-385` — the danger zone's duplicate row.

**Not in phase 1:** datasets, settings/switches, Configure, any real page.

**Backward compatibility:** every edit is additive (a registry key, a picker card, a pill, a dropdown option, a
`qa` guard on duplicate). The page pattern's config is called, not changed. No shared behavior changes.

---

### Phase 2: Ticket record + install step — DONE (2026-09-30, live-verified on `qa_test`, committed `3392cb9b`), incl. the resumable-install follow-up

**Goal:** Adding a QA pattern creates five datasets in the site's existing data environment: TransportNY's exact
columns plus a few additive ones. It stores their references on the pattern row. Status kinds, default statuses and
outcomes live in code. A stand-in list on the Tickets page proves the binding live. No change to how other patterns
save data.

**Findings that shape it (2026-09-30, all VERIFIED unless marked)**
1. **Dataset names, not ids, route rows.** Source types are `<env>|<nameToSlug(name)>:source`
   (`sourceCreate.jsx:39-40`, `tenantProvisioning.js:183-184`); the UUID `doc_type` types are legacy (library
   `CLAUDE.md`). A row's type `<slug>|<viewId>:data` carries no source id. The server takes the newest source with
   that slug in the app (`lookupSourceId`, `dms-server/src/routes/dms/dms.controller.js:150-172`; cached, evicted on
   source create at 1019-1022) and names the table `data_items__s<sourceId>_v<viewId>_<slug>`
   (`db/table-resolver.js:108-118`). A second same-named source strands the first's rows in favor of a new, empty
   table. Nothing guards this today; the datasets UI creates without a check (`sourceCreate.jsx:34-79`).
2. **No client route answers "does slug X exist in the app".** `dms.data` routes take an exact type
   (`routes/dms/dms.route.js`); `uda[env].sourcesAll` is per environment (`routes/uda/uda.route.js:93-146`).
3. **`setDateOnValue` only works in the section's Edit component** (`dataWrapper/index.jsx:352-356`, inside `Edit`
   204-464). View mode's `updateItem` (609-633) never reads it, so a pill flip on a live page never stamps
   `resolved_date`. This contradicts `src/themes/transportny/qa_skills/qa-process.md` ("honoured by core liveEdit"),
   and fits the README's 29 closed tickets with no date.
4. **View-mode live edits share one debounce timer per section** (`liveEditTimerRef`, 628-631). A second live edit
   in the same section within 500 ms cancels the first one's save. Data loss, independent of QA.
5. **Every view-mode dataset write goes through View `updateItem` / `addItem` / `removeItem`** (609 / 656 / 684) →
   `apiUpdate` → `dmsDataEditor` (`api/index.js:422`): Card liveEdit, form save, add, delete; Spreadsheet cell, paste,
   add, delete. Only `updateItem` has both the stored row (`state.data`, before the optimistic update) and the user
   (`_cmsCtx.user`); `dmsDataEditor` has neither.
6. **The server can't diff.** `setDataById` does a blind `jsonMerge` (`dms.controller.js:821-857`), and `change_log`
   keeps no data for split types (`table-resolver.js:55-59`). Server hooks are out of scope, so the history is written
   by the client control and, later, the CLI, as README step 3 decided.
7. **The whole pattern row reaches `props.pattern`.** `disable_signup` and `dmsEnvId` aren't in the admin format's
   pattern attributes, yet both are read live (`auth/siteConfig.jsx:177-187`, `render/spa/utils/index.js`).
8. **New patterns are private by default elsewhere:** `createSite.jsx:73` and `tenantProvisioning.js:137` write
   `{groups: {'<X> Admin': ['*'], public: []}, users: {}}`. Add Pattern writes no permissions, and
   `render/spa/utils/index.js:400-408` then grants the public `view-page`.
9. **TransportNY's source rows** are `{name, type: 'internal_table', views: [{id, ref}], config: '{"attributes": [...]}'}`,
   each attribute `{name, display_name, type, options: [{label, value}], required}`, with no `auth_permissions`.
   Snapshots: `scratchpad/qa-ticketing/source_{2184923,2184889,2186440,2186148}.json` (tickets, pages, stories,
   patterns).

**Step 0 — dropped (owner, 2026-09-30).** Findings 3 and 4 are recorded, not fixed: TransportNY's control room stays
as it is, and phase 2 doesn't touch the shared view-mode save path.

**Step 1 — the ticket record in code — DONE 2026-09-30** (`patterns/qa/ticketRecord.js`, `patterns/qa/datasets.js`;
TransportNY's columns generated from the source snapshots, also saved as `tests/fixtures/sitemgmtAttributes.json`;
`tests/qaTicketRecord.test.js` 12/12)
- `patterns/qa/ticketRecord.js`:
  - `STATUS_KINDS = ['triage', 'active', 'waiting', 'done', 'canceled']`.
  - `DEFAULT_STATUSES`, TransportNY's seven with their kinds, from `qa-process.md:163-171`: Triage → triage;
    In progress, In review → active; Needs decision, Needs data → waiting; Resolved → done ("fixed and verified");
    Closed → canceled ("off the board without a fix").
  - `OUTCOMES`: Fixed, Workaround, Backlog, Feature request, Out of scope, Duplicate, Won't fix (value = label, as
    for statuses).
  - `statusKind(status, statuses = DEFAULT_STATUSES)`.
- `patterns/qa/datasets.js`: one entry per dataset, `{key, name, attributes}`, slug `<install>_<key>`:
  - `tickets`: TransportNY's 31 attributes verbatim; `status` options from `DEFAULT_STATUSES`; `severity` gains
    `Feature` (offered by the Report-an-issue modal since 2026-09-29, missing from the stored options); plus
    `outcome` (select, `OUTCOMES`), `reporter_name`, `reporter_email`, `legacy_id`.
  - `pages` (24), `stories` (5), `patterns` (9, the covered sub-sites): verbatim, plus `legacy_id`.
  - `history`: `row_id`, `field`, `old_value`, `new_value`, `user_id`, `user_email`, `at`, `via` (`ui` / `cli` /
    `agent`).

**Step 2 — the install step (`patterns/qa/install.js`, client-side `falcor.call`s like `tenantProvisioning.js`) — DONE
2026-09-30**
- Built as: `qaPreflight`, `pickQaEnvironment`, `planQaDatasets` (pure), `ensureQaDatasets`, `installQa`. Hooked
  into `editSite.jsx` `addNewValue` for `pattern_type === 'qa'`: the pre-check before the row create, then (after the
  row) `await` the site save, `installQa`, and `revalidate()`. `updateData` / the `onSubmit` prop now return the
  save's promise (was discarded; no other caller used the return).
- **Design note: the Sites page's save sends its whole copy of the site** (`api/index.js` `attributeKeys =
  Object.keys(row)`; `dms_envs` is a dms-format attribute, `admin.format.js:213-217`), so a `dms_envs` edit made
  while that save is in flight, or before the page reloads, would be overwritten by the stale list. Hence the
  ordering: the patterns save lands first, the install edits only `dms_envs` (partial edit, as the pattern editor's
  "create new environment" does), then the route data reloads.
- **Design note: the Sites page's copy of the site never refreshes in-session** (found live 2026-09-30). The
  wrapper's matcher finds no item for an empty URL, so a revalidation leaves `SiteEdit`'s `item` as loaded, which is
  also why a new row reads `undefined / ?` until a reload. And a Sites save rewrites dms-format refs to the format's
  type (`qa_test+pattern`), so a ref's type string isn't the row's type. So the install reads the site, its
  environments (real `type`) and each environment's current `sources` through `loadItemFresh` (`api/index.js`), by
  id, never from the admin context; the Sites page passes `siteId`. A first `revalidate()` call was removed (no-op).
  - Remaining edge: a site that stores an explicit empty `dms_envs: []` holds it in the page's copy, so a later save
    in the same session would write `[]` back over a `default` environment just created. A site with no key at all
    (e.g. `qa_test`) is safe: the loader only hydrates keys that exist (`api/proecessNewData.js:207-226`). Reload the
    Sites page after adding a QA install to be sure.
- **Design note: the unrouted `patternList.jsx` copy of `addNewValue` is not hooked.** Nothing renders it
  (`patternList.theme.js` header), so the hook couldn't be tested; the plan's "both copies" is dropped.
- `planQaInstall({app, siteInstance, instance, name})` is pure: it returns the ordered list of creates/edits. The
  executor runs them. Tests assert the list.
- **Before the pattern row is created**, `qaPreflight` refuses: a base URL + subdomain another pattern on the site
  uses; any `<install>_<key>` slug that already exists in the app (step 3).
- **Which environment:** the site's Datasets pattern's (`firstDatasetsPattern.dmsEnvId`, the same default
  `buildDatasources` uses), else the site's first `dms_envs` entry. None at all → create a `default` environment
  linked from the site's `dms_envs`, as the Dashboard template does (owner, 2026-09-30). Picking another
  environment belongs in Configure (phase 5).
- **After it's created** (`editSite.jsx` `addNewValue`, for `pattern_type === 'qa'`; the unrouted `patternList.jsx`
  copy calls the same helper):
  1. the QA pattern's `dmsEnvId` set to that environment (the precedent Datasets/Forms patterns follow; the server's
     env lookup reads it, feasibility §5).
  2. per dataset: source `${envInstance}|${slug}:source` `{name, type: 'internal_table', config: JSON.stringify({attributes})}`;
     view `${slug}|v1:view` `{name: 'version 1'}`; the source's `views` and the env's `sources` refs in the
     datasets-UI shape (`sourceCreate.jsx:67-77`). The datasets then show in the site's Datasets admin, as
     TransportNY's do today.
  3. the pattern row gets `qa: {version: 1, datasets: {tickets: {slug, source_id, view_id}, …}}` and
     `authPermissions` `{groups: {'<app> Admin': ['*'], public: []}, users: {}}` (finding 8).
- `ensureQaDatasets` is the same executor. It skips datasets already recorded whose slug still resolves to the
  recorded source, so a partial failure can be re-run, and phase 5's switches reuse it.
- No tables yet: a split table is created on its first row write (library `CLAUDE.md`).

**Step 3 — the slug check — DONE 2026-09-30 (owner approved the route)**
- Built: `controller.getSourceIdBySlug` (the new-format branch of `lookupSourceId`, pulled out as
  `lookupSourceIdBySlug`, same SQL and cache), route `dms.sourceIdBySlug[{keys:apps}][{keys:slugs}]` returning the id or
  `null` (null precedent: `searchOne`), client `api/sourceIdBySlug.js` (invalidates the cached answer first).
  Live: `npmrdsv5` `sitemgmt_tickets` → 2184923, an unused name → null.
- **Recommended (chosen):** one small read route in dms-server, `dms.sourceIdBySlug[{keys:apps}][{keys:slugs}]` → the newest
  source id or null. It uses the same query the server routes rows with (`lookupSourceId`), so it's exact and
  app-wide. Phase 3's load-time check ("each recorded slug still resolves to its recorded source") reuses it. It
  needs a dms-server deploy before the TransportNY port.
- **Alternative:** a client-only check across this site's environments and patterns. No server change, but it
  misses sources owned by another site in the same app (multi-tenant apps).

**Step 4 — change history: dataset only (owner OK, 2026-09-30).** Phase 2 creates the `history` dataset with the
ticket record and writes nothing to it. Phase 3 decides how rows get written, next to the ticket controls, preferably
inside QA code. The earlier plan (a generic `changeLog` column option in View `updateItem`) is set aside: it would
change the save path every page uses.

**Step 5 — a stand-in list on the Tickets page (phase 3 preview, replaced there) — DONE 2026-09-30**
- **Design note: `buildQaPages(pattern, app)`.** Loaded pattern rows don't carry `app` (the first build queried
  `uda["undefined+phase2_tickets"]`), so the app comes from the QA config's `props.app`.
- **Design note: two auth-timing workarounds, found live.** QA pages load so fast they render while sign-in is still
  resolving. (1) The route check judged the placeholder user and sent a groups-only admin to `/`; `qaConfig` now
  supplies a `checkAuth` that waits while `user.isAuthenticating` (a config hook `DmsManager` already reads).
  (2) The shell kept the placeholder user in `CMSContext` behind the wrapper's cached render, so `PageView` stayed
  blank; `pages/shell.jsx` renders the shell with the live `AuthContext` user. Both are library defects, logged in
  [`route-auth-check-judges-placeholder-user.md`](./route-auth-check-judges-placeholder-user.md), not fixed there.
- When `pattern.qa.datasets` is set, `buildQaPages` puts two Spreadsheets on Tickets:
  - one over the install's tickets (title, severity, status, assignee, opened), with the Spreadsheet's own add-row,
    so a ticket can be created from the page.
- Binding shape from `build_cr_tickets.mjs:23-57` (`isDms`, `app`, `type`, `source_id`, `view_id`, `env`, `srcEnv`),
  built from the pattern row, no hard-coded ids. An install without datasets keeps the placeholder text.

**Follow-up: resumable installs — DONE 2026-09-30** (owner-approved after `qa4`'s install was cut off by a dropped
connection: `falcor-express` logged "Client disconnected" after its 4th dataset, leaving no record on the row)
- The install runs in the browser, like the site templates and the Datasets admin's create. Leaving the page (tab
  close, reload, lost connection) stops it at the last finished step; in-app navigation doesn't.
- `installQa` now writes the row first (`dmsEnvId`, an empty `qa.datasets`, permissions only if the row has none),
  then after each dataset lists it in the environment (`addToEnvironment`, fresh read, de-duplicated) and updates
  `qa.datasets`. A re-run adopts any existing `<install>_<key>` source (`planQaDatasets`' `existing` →
  `adoptSourceId`; the pre-check makes those only this install's) and creates the rest. It reuses the recorded
  environment when it still exists.
- Overview block `QaPatternSettings` (`settings.jsx`, next to `AuthPatternSettings`): "datasets: N of 5 linked ·
  M left by an interrupted set-up · K missing", a **finish set-up** button, and a "browse them in Datasets" link when a
  Datasets pattern uses the install's environment. The draft (`tmpValue`) takes the install's writes, because the
  Overview's Save sends the whole draft. Theme keys `qaLink`, `qaError` in `settings.theme.js`.
- [x] Live: `qa4` (77) finished from its Overview: tickets 78, pages 80, stories 82, patterns 84 adopted, history 86
  created; each `qa4_*` source created once (server log); now private; environment 42 lists 20 distinct sources.
- [x] Live: "Phase5" (88) cut off 1.8 s after Add → the row recorded tickets (89), environment 42 and permissions;
  pages (91) existed unrecorded; the Overview read "1 of 5 linked · 1 left by an interrupted set-up · 3 missing";
  finish set-up adopted 91 and created 93/95/97; each `phase5_*` source exists once.
- [x] vitest `qaInstall.test.js` +1 (adopt vs create plan); 40/40 across the three QA files.
- Not checked: the Datasets link (no Datasets pattern in `qa_test` uses environment 42). The one console warning on
  the Overview (`customTheme` passed to a DOM element) comes from its identity fields (`settings.jsx:283-300`),
  unchanged code.

**Tests — DONE 2026-09-30**
- [x] vitest `tests/qaTicketRecord.test.js` (12): kinds, statuses, outcomes; TransportNY's columns verbatim (fixture
  `tests/fixtures/sitemgmtAttributes.json`); only status/severity options change; additions appended.
- [x] vitest `tests/qaInstall.test.js` (12): environment pick (Datasets pattern's → first → none); the create plan's
  names, types and payloads; re-run skips recorded datasets; URL clash incl. a `*` sub-domain; the Tickets binding.
- [x] vitest `tests/qaPattern.test.js` (17, phase 1) still pass. Full `packages/dms/tests`: 545/548, the same 3
  unrelated failures as before.
- [x] dms-server: `test-controller`, `test-workflow`, `test-graph` pass; `test-table-splitting` 152/152 with its
  `resolveTable` unit skipped. That unit fails independently (a no-source-id fallback name `_vv1` vs the test's `_v1`,
  in `db/table-resolver.js`, unchanged) and stops the script before the routing tests.

**Live check on `qa_test` — DONE 2026-09-30**
- [x] "Phase2" (row 41) on a site with no environment: `default` environment 42 created and linked from the site's
  `dms_envs`; sources 43/45/47/49/51 with views 44/46/48/50/52; tickets source has 35 columns (31 + 4); pattern row
  has `dmsEnvId: 42`, `qa.datasets`, `authPermissions` `{qa_test Admin: *, public: []}`. No alert, no console error.
- [x] "Phase3a" (53) and "Phase3b" (64) added in ONE page session: both reused environment 42 (no second
  `default`); environment 42 lists 15 sources; the site still links only 42 (its ref rewritten to `qa_test+dmsenv`
  by the Sites save, as expected).
- [x] Refusals: a stray source `collide_tickets` (row 75, deleted after) → "Collide" refused with "A dataset named
  collide_tickets already exists in this app."; URL `alphapage` → "…already used by the "AlphaPage" pattern."; no
  create call fired either time.
- [x] `/phase2` signed out → `/auth/login`; signed in → the stand-in list over `qa_test+phase2_tickets`.
- [x] A ticket added from the list's add row (`dms.data.create` `phase2_tickets|44:data`) shows after a reload.
- [x] `/qa3` (a phase-1 install, no datasets) keeps its placeholder; BetaPage, AlphaPage, the admin unaffected.
- Not checked: "listed in the Datasets admin". `qa_test` has no Datasets pattern, so nothing lists environment 42.
- Dev-mode React unknown-prop warnings (`customName`, `menuPosition`, …) on the list come from the Spreadsheet's
  edit/add-row inputs (INFERRED: BetaPage's Spreadsheet without them logs none), not QA code.

**Rough effort:** 3–4 days.

### Upstream changes pulled 2026-09-30 (checked before phase 3)

- **Admin pattern is now a saved row** (`bde2825f`, [admin-pattern-data-row.md](../completed/admin-pattern-data-row.md)):
  `{instance}|admin:pattern` sits in the site's `patterns`, backfilled on an admin's first load; saved admin rows are
  folded into the in-code admin pattern, never routed. QA routing is unchanged. Its notes confirm two things phase 2
  found independently: a pattern-list save rewrites refs to a generic string, and reads must use
  `dms.data[app].byId`.
- **Merge regression, fixed 2026-09-30:** the same commit rewrote `editSite.jsx` `updateData` (now re-reads and merges
  the site's refs first, `mergeSitePatternRefs`) and dropped phase 2's `return`, so the QA install's `await saved`
  waited only for the re-read. `return apiUpdate(...)` restored. Full `packages/dms/tests` 574/577, the same 3
  unrelated failures.
- **Planned, affects later phases:** [site-ref-list-atomic-ops.md](./site-ref-list-atomic-ops.md) adds a server call
  that adds one ref to a site list (`dms_envs` included); when it ships, `createDefaultEnvironment` should use it.
  [admin-granular-permissions.md](./admin-granular-permissions.md) adds a permission dropdown per pattern type in the
  Access tab; QA's Access tab (phase 5) will need a `qa` list.
- **Private installs and the site snapshot:** `persistSiteSnapshot` saves nothing when any pattern comes back as a
  no-access stub (`render/spa/utils/snapshot.js:13-27`), so a private QA install makes every anonymous boot of its
  site wait for the full fetch, as any private pattern already does. Check before the TransportNY port whether its
  site already has a private pattern.
- **UDA filter fix** (`ccf9f3e9`, [uda-filter-expr-alias-where.md](./uda-filter-expr-alias-where.md), built): filters on
  `expr as alias` columns. TransportNY's ticket facets are all plain columns, so the port isn't affected.

### Phase 3a: Ticket list + ticket page as code — DONE (2026-09-30, live-verified on `qa_test`, committed `3e27b5d2`)

**Goal:** Each install's Tickets page and Ticket page become the control room's two ticket pages, built in code
from `src/themes/transportny/qa_skills/tools/builds/build_cr_tickets.mjs` (425 lines, read in full 2026-09-30) and
bound to the install's own datasets. The phase 2 stand-in list goes away.

**What the builder makes (the reference)**
- **Tickets (`/tickets`)**, six groups (breadcrumb, header, summary, flow charts, filters, table):
  - breadcrumb and a `// site management` + "Tickets." header;
  - "+ Add ticket": a static link Card to the Datasets admin's table tab of the tickets source;
  - "Where tickets stand": `flow_step` boxes (Triage › In progress › In review › Resolved/closed), a severity-weighted
    resolution % with a `data_bar`, open-by-severity counts, found-by-source counts;
  - two `AVL Graph` BarGraphs on a time axis: tickets opened / day, resolved / day;
  - four `Filter` facets writing page variables: status, severity, source, site (`surface`, labels from `SITE_LABELS`);
  - the table (`Spreadsheet`, newest first): `#` link to the ticket page, severity/source/status/site pills, title, page,
    reporter, updated; the four page variables filter it; download on.
  - page `filters` registry: `status`, `severity`, `source`, `surface` (URL-bound).
- **Ticket (`/ticket?id=`)**, four groups; every section filtered by the `id` page variable (`requireResolved`):
  - breadcrumb (`… / #id`), header (pills, "All tickets" link, title, target page link, page stage);
  - body Card: `description`, `steps`, `expected`, `actual`, `suggested_solution`, `resolution` as editable textareas,
    `screenshot` as an image, `env` (live edit);
  - Details rail Card (live edit): **status** (editable pill + `setDateOnValue` → `resolved_date`), source, **assignee**,
    reporter, severity, priority, category, effort, duplicate-of link, verified, verified by, target page, opened,
    resolved, updated;
  - comments card.
  - page `filters` registry: `id`.

**Port rules**
- New `patterns/qa/pages/tickets.js` and `ticket.js`, each `(ctx) => page`, plus `pages/helpers.js` for the
  builder's section helpers (`dw`, `col`, `pcol`, `calc`, `lexical`, …). `ctx = {app, pattern, baseUrl, datasets,
  siteLabels, datasetsLink}` built once in `qaConfig`; `buildQaPages` assembles the list.
- Every binding comes from `pattern.qa.datasets.tickets` (`isDms`, `app`, `type: slug`, `source_id`, `view_id`,
  `env`/`srcEnv` = `<app>+<slug>`), keeping the builder's declared `columns` list (filter/group-by columns must be
  declared, per its note). No `npmrdsv5`, `sitemgmt_*` or `2184923` string survives (a unit test greps for them).
- Links: `/sitemgmt/…` → `${baseUrl}/…` (ticket, tickets, `page?key=`). The Page QA page arrives in 3b; until then
  its link lands on Tickets (the unknown-URL fallback).
- "+ Add ticket": links to `/<datasets pattern>/internal_source/<tickets source_id>/table` when a Datasets pattern
  uses the install's environment (`props.datasetPatterns`, matched on `dmsEnvId`); otherwise not shown.
- Status groups come from the ticket record, not string lists: OPEN = kinds triage/active/waiting, CLOSED =
  done/canceled (`DEFAULT_STATUSES`). The flow boxes keep TransportNY's four. Pill colour maps (`SEV_PILL`,
  `STATUS_PILL`, …) move to `pages/helpers.js` (presentation, not the record).
- Site labels: `pattern.qa.siteLabels` when set (the TransportNY port seeds its `SITE_LABELS`; phase 5's Configure
  edits it), else raw `surface` values with no `meta_lookup`.
- Fixed group names and `trackingId`s per section (e.g. `qa_tickets_flow`, `qa_ticket_rail`); no `randomUUID`.
- Look (superseded 2026-10-01, see "Default-theme restyle"): the builder's TransportNY theme keys (`kicker`,
  `btnPrimary`, `displayLG`, …, group themes `breadcrumb`/`header`) were kept at first; the pages now use only the
  library default theme's keys. TransportNY's own look at the port is an open question (a theme-level override).

**The status-change writes: DEFERRED (owner, 2026-09-30).** Build the pages first; decide the behaviour, and whether
it's (a) or (b), once they exist and DMS-side changes have settled. Until then the pages are ported as TransportNY has
them, minus config that does nothing: the status pill's `setDateOnValue` is dropped (only the section editor reads
it, and QA pages have no editor; owner, 2026-09-30), the rail keeps the Card's live edit, and the history dataset
stays empty. **Still wanted (owner):** `resolved_date` stamping on resolve/close, or something close to it, is part of
the deferred work, not dropped. The options, for when it's picked up:
When a ticket's status (or assignee) changes, three things should happen together: save the field; stamp
`resolved_date` when status moves to a done/canceled kind (clear it when reopened); write one history row
`{row_id, field, old_value, new_value, user_id, user_email, at, via: 'ui'}`. Today's rail only saves the field (the
stamp never runs in view mode, finding 3) and can drop it (the half-second bug, finding 4: all rail fields share one
section).
- **(a) QA-owned control — recommended while TransportNY must stay untouched.** A small `qa_tracked` column type,
  registered by the qa pattern (the page pattern registers `filter_control` the same way). It renders the base type
  (status pill or text input) and, on a change, saves `{id, field, resolved_date?}` in one `apiUpdate` and creates the
  history row, straight away (no shared timer, so it can't be dropped). It shows its own value until the next
  refetch, and doesn't call the Card's live-edit save for that cell. Used for status and assignee (and stage in 3b).
  - Cost: QA code with its own small save path; other rail fields (severity, priority, …) stay on the Card's live
    edit, bug and all, exactly as on TransportNY today.
  - It would also fix Page QA's stage refresh (phase 3b, "Owner's hand check"): the control publishes after its
    save, so the progress bar refetches.
  - To confirm at build: the edit control can reach `apiUpdate` (PageContext) and the signed-in user.
  - **Confirmed in code (2026-10-01, read-only; nothing built):**
    - A cell type gets `value`, `onChange`, the whole `row` (with `id`) and its column's props, in a Card cell
      (`ui/components/Card.jsx:371-382`) and a Spreadsheet cell (`ui/components/table/components/TableCell.jsx:575-586`).
      Both read the one `ui/columnTypes` registry; `registerColumnType` is the hook (`filter_control` precedent,
      `patterns/page/siteConfig.jsx:26`).
    - View's `ComponentContext` exposes `state`, `setState`, `apiLoad`, `apiUpdate` (`dataWrapper/index.jsx:737`).
      The cell saves through `apiUpdate` and patches `state.data` itself; Card re-copies its record on a data change
      (`Card.jsx:771-773`), the table cell too (`TableCell.jsx:343`). The user: `CMSContext.user` (QA's shell passes
      the live one, `patterns/qa/pages/shell.jsx`). `PageContext.setActionParam` publishes for `data_refresh`.
    - The two save paths it bypasses differ: Card live edit = one 500 ms timer per section, sends `{id, field}`;
      Spreadsheet cell = its own 500 ms timer, sends the whole row's editable columns from that cell's copy.
    - Where the tracked fields live: ticket status in the Ticket rail (Card) and Page QA's tickets table
      (Spreadsheet); assignee in the rail (text); page stage in Page QA's rail (Card, `pages` dataset); story status
      in Page QA's stories table (Spreadsheet, `stories` dataset).
  - **Owner answers (2026-10-01), whichever option is built:** Resolved → Closed keeps the first resolved date;
    text fields (assignee) commit on blur, one history row per commit. No `updated` stamp: every row, split tables
    included, has native `created_at/created_by/updated_at/updated_by` (`dms-server/src/db/table-resolver.js:255-262`),
    set on every edit by `setDataById` (`dms.controller.js:853-854`); show it with a custom column named `updated_at`
    (a bare name is the row column, a data field is `data->>'x'`; `buildUdaConfig.js:39-46`). Live: rows 149–154 carry
    them. The record's own `updated` field then only holds imported TransportNY dates (phase 7).
  - **Still open:** story status tracked too? The `history` `dataset` column (row ids come from the schema's one
    sequence, `table-resolver.js:255, 303`, so `row_id` alone is unique; the column only saves an app-wide feed a
    lookup). And whether (a) at all: no existing cell type saves its own data (19 built-in display types, 1
    pattern-registered `filter_control`, 16 theme-added on wcdb/landbank/tessera; the two that write anything write
    page filters), so (a) would be the first.
  - **Visible today:** "Done / day" (`tickets.js:100`) groups by `resolved_date`, so a ticket resolved in the UI never
    appears in it.
- **(b) Library fix.** Fix View `updateItem` (per-row pending saves; honour `setDateOnValue`) and add an opt-in
  `changeLog` column option; QA pages then just configure status/assignee.
  - Cleaner, and any author gets it. But it changes TransportNY's Card pages: quick edits stop being dropped and
    status flips start stamping `resolved_date` (both what its docs already claim). Logged in
    `card-liveedit-shared-debounce-drops-saves.md`.
  - **Leaning (b) (owner, 2026-10-01).** The TransportNY effects are fixes and OK. **Remind the owner to test
    TransportNY before pushing** (control-room ticket rail and Page QA pills; plus one MNY live-edit page and wcdb's
    `station_admin` form save). Nothing built yet; plan detail below, not yet approved.
  - **Blast radius (DB scan of all 116 `dms_*` schemas, component rows, 2026-10-01):**
    - `setDateOnValue`: only `dms_npmrdsv5`, 8 `sitemgmt|component` rows (the control room). In code, only
      `build_cr_tickets.mjs:390`; TransportNY's CLI restamps on every closing status (`cr.mjs` `buildTicketPatch`).
    - live edit on (`liveEdit` + `allowEditInView`): `mitigat_ny_prod` 5798 rows / 68 patterns (many likely orphan
      copies), `wcdb` 136 / 1, `shaun_test_app` 44 / 10, `npmrdsv5` 32 / 2, `asm` 10 / 2.
    - `save_publish`: only `dms_wcdb`, 3 `station_admin` rows (1965809, 1969577, 1969588), all form saves with live
      edit off, so a live-edit publish doesn't reach them. The Spreadsheet offers no `save_publish` today (its
      providers: `click_publish`, `load_publish`; `spreadsheet/config.jsx`).
  - **Plan detail (proposed):**
    1. Per-row pending saves in View's live-edit branch (merge fields per row, one timer per row) and flush on
       unmount. Today's unmount effect (`dataWrapper/index.jsx:490-491`) cancels the pending save despite its "Flush"
       comment, so leaving a page within 500 ms of an edit loses it. `updateItem` returns a promise that settles
       when that row's save lands.
    2. `setDateOnValue` in View, both branches: the live edit (Card) and the bulk one (Spreadsheet cells, form
       saves; `TableCell.jsx:351-353` always uses it, so Page QA's tickets table needs it). One shared helper, also
       used by Edit, with the keep-first rule: stamp on entering `values`, keep on moving within them, clear on
       leaving. The old value comes from a ref of the section's rows (the callback's deps omit `state.data`).
    3. `save_publish` after a live-edit save of a discrete control (select, pill, radio, checkbox, boolean, switch),
       never a text one (a refetch mid-typing resets the field: `Card.jsx:771-773`). `closeModalOnSave` stays
       form-only. Add `save_publish` to the Spreadsheet, firing only when the changed columns are discrete.
    4. (Separable; decide before phase 7) change history: `commitOn: 'blur'` for text inputs (`text.jsx`), and an
       opt-in `changeLog` column option writing `{row_id, field, old_value, new_value, user_id, user_email, at, via}`
       to a target dataset, through one helper the `dms qa` CLI reuses.
    - QA config after: `setDateOnValue` on both status pills (closed kinds), `save_publish` / `data_refresh` keys on
      Page QA, native `updated_at` via a custom column; drop the `qaTicketPages` "no setDateOnValue" assertion.
  - **Owner (2026-10-01):** part 4 (change history, commit on blur) deferred. Story status is to be tracked too, with
    part 4. No TransportNY edits (`src/themes/transportny/`, incl. `cr.mjs`'s restamp): that site is handled ad hoc.
  - **Core code estimate for parts 1–3 (outside `patterns/qa`; estimates, nothing written):**

    | File | Change | Lines |
    |---|---|---|
    | new `dataWrapper/utils/liveEditSaves.js` | keep-first stamp rule, changed-columns diff, per-row pending saves, discrete type list | +75 |
    | `dataWrapper/index.jsx` View | live edit → pending saves + stamp; bulk branch stamps; rows ref; flush on unmount | +25 / −12 |
    | `dataWrapper/index.jsx` Edit | inline stamp → the helper (same rule in both modes) | +3 / −7 |
    | `ComponentRegistry/Card.jsx` | `save_publish` after a discrete live edit | +4 |
    | `ComponentRegistry/Card.config.jsx` | `save_publish` description | 1 edited |
    | `spreadsheet/index.jsx` | `save_publish` wrapper (diff against `state.data`) | +14 |
    | `spreadsheet/config.jsx` | `save_publish` provider entry | +7 |
    | new `tests/liveEditSaves.test.js` | stamp rule, diff, pending saves (fake timers) | +90 |
    | `sections/component-actions.md` | `save_publish` docs | ~5 |

    Only caller that awaits `updateItem`: Card's wrapper (`ComponentRegistry/Card.jsx:230`), so the live-edit branch
    returning a promise is safe. Closes `card-liveedit-shared-debounce-drops-saves.md` when built.
  - **Building parts 1–3 (owner approved 2026-10-01, Edit-mode row included). Core code written, committed `0cdba46b`:**
    - [x] new `dataWrapper/utils/liveEditSaves.js`: `isDiscreteColumnType`, `rawValue`, `setDateOnValueStamp`
      (keep-first), `changedColumns`, `dateStampsForRow`, `createPendingSaves`.
    - [x] View `updateItem`: live edit → `pendingSavesRef.current.queue(rowId, patch)` (per-row timer, merged
      fields, undefined keys dropped so a merge can't blank an earlier field), stamp from the stored row
      (`rowsRef`); bulk branch adds `dateStampsForRow` stamps to the save and the optimistic update; unmount
      `flushAll()` replaces `clearTimeout`. Flush is safe after leaving: `apiUpdate` returns early for DMS dataset
      rows (`dms-manager/wrapper.jsx:89-92`); an editable external table gets one `revalidate()`.
    - [x] Edit `updateItem`: inline stamp → `setDateOnValueStamp` (old row from `state.data`).
    - [x] `ComponentRegistry/Card.jsx`: `save_publish` also after a discrete live edit; `Card.config.jsx` text.
    - [x] `spreadsheet/config.jsx` `save_publish` provider; `spreadsheet/index.jsx` wrapper (used only when the
      provider is on), publishing when a changed column is discrete.
    - [x] unit tests: new `tests/liveEditSaves.test.js` 20/20. Full `packages/dms/tests` 626/629, the same 3 unrelated
      failures (`avlGraphThemeDefaults` golden, `syncDeltaConvergence` ×2).
    - [x] **Live, core alone (no QA config change), test ticket #102 row 150 on install 126:** probe
      `scratchpad/qa_test/probes/rail_quick_edits.mjs` (picks in the Ticket rail; `PICKS`, `GAP_MS`, `NAV_AFTER`).
      - status → Resolved then priority → Later, 334 ms apart: ONE save `{id:150, status:"Resolved",
        priority:"Later"}`, both in the DB. Same picks on the committed `index.jsx` (swapped in, then restored):
        only `{priority:"Later"}` sent, status stayed Triage. Bug reproduced, fix confirmed.
      - pick then click "All tickets" within the window: the rail unmounts ~1.1 s later (the router waits for the
        next page's data). Committed file: no save at all; new file: the save goes out at unmount.
      - picks >500 ms apart: two saves, as before. Row 150 restored to Triage / Next after each run.
    - [x] QA config: Ticket rail status `setDateOnValue` (`resolved_date`, `CLOSED_STATUSES`) + `save_publish`
      `ticket_v`, header `data_refresh` `ticket_v`; Page QA tickets table status `setDateOnValue` + `save_publish`
      `tickets_v` (Work completed already subscribes) + a zero-width `resolved_date` column (so Resolved → Closed
      sees the stored date); stage select `save_publish` `page_v`, progress bar `data_refresh` `page_v`. Tests:
      `qaTicketPages` (the "no setDateOnValue" assertion became the wiring check), `qaOverviewPages` +1.
      QA + helper suites 93/93; full `packages/dms/tests` 627/630, the same 3 unrelated failures.
    - [x] **Live with the QA config (install 126):**
      - Ticket rail #102 (row 150): Triage → Resolved stamped `2026-10-01 16:24:59`; → Closed sent only the status,
        date kept; → Triage sent `resolved_date: ""`. The header badges followed each change without a reload.
      - Page QA `alphapage:page_1`, tickets table #101 (row 149): → Resolved stamped (whole-row save) and Work
        completed went 0% → 100% (Closed 0 → 1) without a reload; → Closed kept the date; → In progress cleared it.
      - Stage select (page row 141): QA → Dev Acceptance, the progress bar went STEP 4 → STEP 5 OF 6 without a
        reload (closes phase 3b's open hand-check item). All test rows restored (150 Triage/Next, 149 In progress,
        141 QA, no dates).
      - Error sweep `/qa`, `/qa/tickets`, `/qa/ticket?id=150`, `/qa/page?key=alphapage:page_1`, `/alphapage/page_1`:
        no page/SQL errors, no non-200 except AlphaPage's `/track/visit` 204. The Ticket page's 7 console warnings
        are the known unknown-prop set (`customName`, `show`, `allowEditInView`, `hideHeader`, `valueFontStyle`,
        `hideControls`, `showBorder`); none is new. The zero-width `resolved_date` header measures 0 px, like
        `idsort`. dms-server log clean.
    - [x] docs: `sections/component-actions.md` (write providers; `save_publish` after discrete live edits).
    - Actual size: core runtime +165 / −28 in 6 files (helpers 92 lines); tests +161 new, +21 / −2 QA.
    - Repo-wide grep: no `liveEditTimerRef` left; `save_publish` only in these library files and the QA pages;
      `setDateOnValue` only in the library, QA, and TransportNY's builder/CLI (untouched).
    - **Not done (follow-ups):** the native `updated_at` swap (the `updated` field shows in 5 places: Ticket rail,
      Tickets `updated_day`, Page QA tickets table, Page-status facts on `pages`, and the add-ticket modal writes it);
      a full page reload/tab close inside the 500 ms window still drops the pending save (no `pagehide` flush; only
      in-app navigation unmounts); the editor's bulk branch (Spreadsheet in edit mode) still doesn't stamp.
    - **Before the owner pushes: test TransportNY** (control-room ticket rail: status → Resolved stamps; status then
      priority quickly, both stick; Page QA pills), one MNY county page with live edit, wcdb `station_admin` form
      save.

**Tests (vitest)**
- Both pages: every data section's `externalSource` is the install's tickets dataset; no TransportNY identifiers;
  links start with `baseUrl`; page `filters` registries; unique fixed `trackingId`s; OPEN/CLOSED derived from kinds.
- "+ Add ticket" present only with a Datasets pattern on the install's environment.
- The chosen write path: (a) the control's save payload + history row from a row/old/new/user; or (b) the
  `updateItem` changes.

**Live check on `qa_test`**
- Seed ~8 tickets in Phase2 across statuses/severities/sources (CLI `dms raw create`).
- `/phase2/tickets`: summary counts and bar match the seeded rows; charts render; each facet filters the table and
  sets its URL parameter; a `#` link opens `/phase2/ticket?id=<row>`.
- `/phase2/ticket?id=`: header, body and rail show the ticket; editing a textarea persists after reload.
- Status → Resolved: persisted, `resolved_date` stamped, one history row; back to Triage clears the date. Assignee
  change writes a history row. Quick status-then-assignee both persist (with (a) for those two fields).
- `/qa4`, `/phase3a` (no tickets) render empty states without errors.

**Rough size:** 3–4 days for the two pages; (a) adds about a day, (b) about the same plus TransportNY regression checks.

**Built (2026-09-30)**
- `patterns/qa/pages/helpers.js` (the builder's section/column helpers, pill maps, `OPEN_STATUSES`/`CLOSED_STATUSES`
  from the kinds, `sqlText` for names inside SQL literals), `tickets.js`, `ticket.js`; `buildQaPages(pattern, {app,
  baseUrl, datasetPatterns})` returns them when `qa.datasets.tickets` is set, else the placeholder pages ("This
  install's datasets aren't set up yet."). `qaConfig` builds that context once (`props.app`, `props.baseUrl`,
  `props.datasetPatterns`). The phase 2 stand-in list is gone.
- Dropped as dead config (owner): the status pill's `setDateOnValue` (only the section editor reads it).
- **Design note: section sizes are theme vocabulary.** The builder's numeric sizes (`3`, `6`, `9`, `12`) are
  TransportNY's 12-column keys (`themev2.js` replaces the default map). The library default theme only knows `1/3`,
  `1/2`, `2/3`, `1` on a 6-column grid (`sectionArray.theme.jsx`), and `"1"` means opposite widths in the two. On a
  default-theme site the charts and facets fall back to full width and stack. Kept as TransportNY's (its first real
  install); nothing in the library maps sizes across themes today (the page templates use fractions, which have the
  opposite problem on TransportNY's theme).
- **Design note: every rail field is editable in place,** reporter/opened/updated included: the builder enables
  `allowEditInView` on the whole rail section, not just the workflow fields. Faithful to the builder; not compared
  with TransportNY's live page.

**Tests — DONE 2026-09-30**
- [x] vitest `tests/qaTicketPages.test.js` (13): pages and slugs; every data section on the install's tickets
  dataset; no `sitemgmt`/`npmrdsv5`/`2184923`/`2184924`/`/datasources`; links under `baseUrl`; URL-variable registries;
  Ticket-page `id` filter on every data section; fixed unique trackingIds and deterministic output; OPEN/CLOSED from
  kinds; no `setDateOnValue`; add-ticket link only with a matching Datasets pattern; site labels on/off; placeholder
  without datasets. The two phase 2 stand-in tests were removed from `qaInstall.test.js`.
- [x] Full `packages/dms/tests` 586/589, the same 3 unrelated failures.

**Live check on `qa_test` — DONE 2026-09-30**
- [x] 7 tickets seeded into Phase2 (rows 99–105; with #76, 8 in all).
- [x] `/phase2/tickets`: Triage 2 › In progress 1 › In review 1 › Resolved/closed 3; resolution 22% (4 of 18,
  severity-weighted); open Blocker 1 / Major 2 / Minor 1 / Polish 0 / Feature 0; found by AI 1 / Dev 2 / Client 2;
  "5 open · 3 done"; both charts; 8 rows newest first, each `#` linking to `/phase2/ticket?id=<row>`. No console,
  page or SQL errors.
- [x] Filters: `?status=Triage` → #100, #76; `?severity=Major&source=client` → #99.
- [x] `/phase2/ticket?id=99`: breadcrumb `Phase2 / Tickets / #99`, header pills, title, target page; body and rail
  show the row. A resolution typed in the body persisted (`dms dataset query 43 --pattern 41` → "Moved the legend
  below the map.").
- [x] Empty installs (`/qa4`, `/phase3a`), no datasets (`/qa`) and a missing ticket (`?id=999999`) render without
  errors.
- [x] Preview under TransportNY's theme: Phase2 (41) given `theme.selectedTheme: 'transportnyv2'`; the pages match the
  control room's layout (charts side by side, four facets in a row). That theme's sidenav carries TransportNY's
  hard-coded "Report an issue", which writes to TransportNY's tickets: not clicked.
- Not driven in automation: the rail's click-to-edit fields (Card inline editing; clicking the value didn't open an
  input under Playwright). Check by hand.
- Console warnings on the Ticket page (`customName`, `hideHeader`, `valueFontStyle`, `allowEditInView` passed to DOM
  elements) come from `Card.jsx` passing column props to the edit inputs (`Card.jsx:372-381`), library code.

### Phase 3b: Overview + Page QA as code — DONE (2026-09-30, live-verified on `qa_test`, committed `2450f728`)

**Goal:** Each install gets the control room's other two pages, built in code from `build_cr_overview.mjs`
(210 lines) and `build_cr_page.mjs` (329 lines), both read in full 2026-09-30, and bound to its own `pages`,
`stories`, `tickets` and `patterns` datasets. The Overview becomes the install's home page.

**What the builders make (the reference)**
- **Overview (`/overview`), TransportNY's "CONTROL ROOM" home:**
  - breadcrumb; header (`// site management · QA workflow`, "CONTROL ROOM.", a stat line
    `N patterns · N pages · N accepted · N open / N done tickets` whose numbers are **baked in at build time**);
  - "How delivery works": six live stage tiles (one-row aggregate Cards over `pages`: count per stage + label +
    who-line copy);
  - **one compound card per tracked sub-site**, built from the enabled `sitemgmt_patterns` rows **read at build
    time**: title + `surface · N pages`, a `stacked_bar` stage distribution, a `stacked_bar` tickets done/open, and
    that site's pages table (Page → Page QA link, stage pill, `open_bugs`, live-page link, design link), sorted by
    `stage_order`.
- **Page QA (`/page?key=<page_key>`):**
  - header Card over `pages` keyed by `?key=`: eyebrow, page name, a QA ⇄ Design toggle (Design links to
    `/sitemgmt/design?key=`), "View live page ↗", description;
  - main band (the rail host): "Features & user stories" (a `stories` Spreadsheet with an editable status pill) and
    "Tickets" (a header Card whose "+ Add ticket" publishes an action param, and the page's tickets with an editable
    status pill, refreshed after a create);
  - right rail (`position: 'sidebar'`, page `sidebar: 'right'`): "Page status" — an editable stage `select`
    (live edit), a `stage_progress` 6-node bar, facts (surface, route, owner, updated, build, data), and work
    completed (severity-weighted %, `data_bar`, closed/open);
  - an **add-ticket modal** group (`isModal`, `modalParamKey: 'addticket'`): an `allowAdddNew` Card with title /
    severity / description, create-time defaults (`autoNumber` ticket_id from 101, status Triage, source client,
    reporter = user, opened/updated = now, surface and page_route split from `page_key` on `:`), closing on add and
    refreshing the tickets (`add_publish` → `data_refresh`).
  - page `filters` registry: `key`.

**Decisions (owner, 2026-09-30): (A) and the Overview as home, both approved.** The **Design page feature** (a per-page
design mockup and the QA ⇄ Design toggle) is wanted as an install feature later, the roadmap's "Design mockups"
switch, not TransportNY's particular designs. It stays out of the base install for now. This supersedes the README's
"the Design page moves into TransportNY's theme, as a theme-added page".
1. **Where the Overview's per-site cards come from.** The builder read the tracked sites at build time; code pages
   have no build step.
   - **(A) recommended:** read the install's `patterns` dataset (enabled rows, by `sort_order`) when the Overview
     renders, then build one card per site. The dataset stays the one source for "which sub-sites this install
     covers": Configure (phase 5) edits it, the Report-an-issue button (phase 6) reads it signed out (pattern rows
     reach signed-out visitors stripped), and the TransportNY port copies its rows. Cost: the Overview's site cards
     appear after one small fetch.
   - **(C) simpler:** drop the per-site cards for one pages table with a site facet and a site column; fully live,
     no fetch, but it no longer looks like TransportNY's Overview.
2. **The Overview becomes the install's home** (index 0, the bare install URL), Tickets second, Ticket and Page QA
   hidden — TransportNY's order. (Default unless you say otherwise.)

**Port rules (beyond 3a's)**
- New `pages/overview.js` and `pages/pageQa.js`; the shared helpers gain the stage constants. `PAGE_STAGES`
  (Proposed → Client Acceptance) moves into `ticketRecord.js` beside the statuses, matching the `pages` schema's
  `stage` options; stage colours, pills and the tiles' who-line copy go in `helpers.js`.
- **Dropped, as it would do nothing yet:**
  - the Design link and the QA ⇄ Design toggle: they come back with the Design page feature (see decisions above).
    "View live page ↗" stays.
  - the pages table's `open_bugs` column and its `stage_order` sort: both are written only by TransportNY's sync.
    Live per-page ticket counts are phase 4 (derived values). The table sorts by stage through a `CASE` on `stage`
    instead, which needs no sync.
- **Counts are live.** Code pages have no build step, so there is nothing to bake: the header stat line is one-row
  aggregate Cards (pages: `N pages · N accepted`; tickets: `N open / N done`), and the site count comes from the
  fetched site list. This is the feature itself, not a design choice (owner, 2026-09-30).
- The add-ticket modal ports as-is (all native: `allowAdddNew`, `autoNumber`, `defaultFn`, `defaultFrom`,
  `click_publish` / `add_publish` / `data_refresh`, `isModal`). It keeps TransportNY's `surface:route` page-key
  convention; how page keys get made for new installs is phase 4's track-on-publish.
- The stage select, story status and ticket status stay native live edits (the status-change writes stay deferred;
  a stage change is the third field that will want a history row).
- Links: `/sitemgmt/…` → `${baseUrl}/…`; breadcrumbs name the install.

**Tests (vitest)**
- Overview with a given site list: one group per site (fixed names from the surface, e.g. `overview_site_tsmo2`),
  each card's sections filtered by that surface; no site list → no site cards; stage tiles for every `PAGE_STAGES`;
  header counts are aggregate calcs, not literals.
- Page QA: every data section keyed on `?key=` (`page_key`); modal group flags; create-time defaults; no Design
  link; no `open_bugs`/`stage_order`; rail group `position: 'sidebar'` and page `sidebar: 'right'`.
- Both: install datasets only, no TransportNY identifiers, links under `baseUrl`, fixed unique trackingIds.

**Live check on `qa_test` (Phase2, still on the TransportNY theme for the real look)**
- Seed: 3 covered sites in `phase2_patterns`, ~8 pages in `phase2_pages` across stages (page keys `surface:route`),
  a few stories, and re-point the seeded tickets' `page_key`/`surface` at them.
- `/phase2` opens the Overview: stage tiles match the seeded stages; one card per enabled site with the right page
  count and bars; a site's page links open Page QA.
- `/phase2/page?key=…`: header, stories, tickets, the rail; stage select and story status save on change;
  "+ Add ticket" opens the modal, a new ticket appears in the list without a reload and carries the defaults.
- Empty installs (no sites, no pages) render without errors.

**Rough size:** 3–4 days (Overview ~1 incl. the site fetch; Page QA ~1.5 incl. the modal; tests + live ~1).

**Built (2026-09-30)**
- `ticketRecord.js` `PAGE_STAGES`; `helpers.js` stage colours/short labels/who-lines, `STAGE_RANK`, build/data/story
  pills, `datasetSource` (+ `pagesSource`, `storiesSource`); new `pages/overview.js`, `pages/pageQa.js`.
- `buildQaPages(pattern, {app, baseUrl, datasetPatterns, sites})` → Overview (index 0, home), Tickets (1), Ticket (2,
  hidden), Page QA (3, hidden); the placeholder set (Overview/Tickets/Ticket) until tickets, pages and stories exist.
  `coveredSites(rows)` keeps enabled (`'yes'`) rows with a surface, in `sort_order`.
- Site list (decision A): `pages/view.jsx` reads the covered-sites rows once through new `api/datasetRows.js`
  (`loadDatasetRows`: the UDA `length` + `dataByIndex` reads TransportNY's Overview builder makes) and rebuilds the
  pages when they arrive; site cards are absent until then.
- Left out, as planned: the Design toggle and links, `open_bugs`, `stage_order`. The kicker copy's "AI flags
  issues" became "issues get flagged" (not every install has an agent).
- **Design note: Spreadsheet helper columns need fixed widths.** A zero-width sort/fetch helper (`stage_rank`,
  `page_key`) only stays hidden with `autoResize: false`; with auto-resize on, both showed as columns. The site
  pages tables set explicit widths.

**Tests — DONE 2026-09-30**
- [x] vitest `tests/qaOverviewPages.test.js` (17): `coveredSites`; Overview is home and reads only pages + tickets;
  one live tile per stage; counts in SQL; one 4-section card group per site, each filtered by surface; no site cards
  before load; stage-rank sort + Page QA links; no `stage_order`/`open_bugs`/design/TransportNY ids. Page QA: hidden,
  `sidebar: 'right'`, rail and modal group flags, `key` variable; reads pages/stories/tickets; every data section
  keyed on `?key=` (but the modal and its header); modal defaults; no Design toggle; ticket links in-install; stage
  options = `PAGE_STAGES` = the pages schema's.
- [x] Updated for the new order: `qaPattern.test.js` (home = Overview; nav Overview, Tickets) and
  `qaTicketPages.test.js` (pages found by slug; full dataset fixture). 85 QA tests across 6 files pass; full
  `packages/dms/tests` 602/605, the same 3 unrelated failures.

**Live check on `qa_test` — DONE 2026-09-30 (Phase2 on the TransportNY theme)**
- [x] Seeded: 4 covered sites (TSMO, NPMRDS, Freight Atlas enabled; Docs `no`), 8 pages across all stages
  (`surface:route` keys), 3 stories and 2 tickets on `tsmo2:corridor`.
- [x] `/phase2` opens the Overview: "3 sites", "8 pages · 2 accepted", "6 open / 4 done tickets"; tiles 1/1/1/2/1/2;
  cards TSMO (3 pages, 1 done · 3 open), NPMRDS (3, 1 · 2), Freight Atlas (2, 1 · 0), Docs absent; pages sorted by
  stage, linking to `/phase2/page?key=…`. No console, page or SQL errors.
- [x] `/phase2/page?key=tsmo2:corridor`: header + "View live page ↗"; 3 stories in order; tickets #122, #121; rail
  "QA", step 4 of 6, facts, work completed 60% (1 closed, 1 open).
- [x] "+ Add ticket" opens the modal; submitting created `phase2_tickets|44:data` with `ticket_id 101`, Triage,
  client, the user's email, now, `surface tsmo2`, `page_route /corridor`, `page_key tsmo2:corridor`; the modal
  closed and #101 appeared without a reload.
- [x] `/qa4`, `/phase3a` (no sites or pages), `/qa` (no datasets) and an unknown key render without errors.
- Not driven in automation (custom dropdowns): the modal's severity pick (the test ticket saved without one), the
  stage control, the story and ticket status pills.

**Owner's hand check — 2026-09-30**
- [x] "+ Add ticket" opens the form; a ticket filed with a severity picked saved and appeared. (An earlier "no form"
  report was a stale view; the automated re-check with the qa_test token also opens it.)
- [x] Story and ticket status pills look right.
- [x] A ticket status changed in the Ticket page's rail shows on the Tickets list after a refresh (phase 3a's rail).
- [x] **Fixed 2026-10-01 (option (b) part 3): the stage dropdown saves, but nothing else on the page reacts.** The progress bar ("STEP N OF 6") and
  anything else keyed on the stage keep the old value until a reload. Cause: the stage control and the progress bar
  are separate sections, and nothing announces the save. `save_publish` fires only on a form save and deliberately
  skips live-edit saves (`Card.jsx:223-237`: a live-edit keystroke must not close a modal mid-typing).
  TransportNY's page is built the same way (`build_cr_page.mjs:207-223`), so it has the same gap. Two ways to fix,
  for the owner to pick with the deferred status-change writes:
  - in QA's own status/stage control (option (a) there), which publishes after its save;
  - or a core change: let `save_publish` fire for a live-edit save of a discrete control (select, pill), not a
    text keystroke. That would also apply to TransportNY's Card pages.


**Phase 3 carry-overs (from the original outline):**
- Switches gate pages and sections; nav follows. Until Configure (phase 5) every switch is on.
- Theme-added pages: merge `theme.qa.pages` (code, never DB). The Design page is no longer planned there: it
  becomes an install feature (owner, 2026-09-30).

### Phase 4: Derived values and track-on-publish — DONE 2026-10-01 (live-verified on `qa_test`, committed `8be023e9`; owner re-verified track-on-publish 2026-10-02)

README step 5: the values TransportNY's `cr_sync.mjs` writes, read live or written at the right moment instead.
Owner note at the start: DMS has a lot of join capability, mostly hand-written queries and custom columns (the NPMRDS
Reports feature leans on them heavily); look there for examples if the joins give trouble.

**Scope (what each sync-written value becomes):**
- **Per-page ticket counts** (`open_bugs`, …): read live through a join. Only the open count is shown, as on
  TransportNY's Overview (its "Open" column); `blockers`/`majors`/`rag` are only read by TransportNY's CLI
  (`qa_state.mjs`), so they come with the `dms qa` CLI (phase 6), computed from the tickets the same way.
- **A ticket's copy of its page's name and stage** (`page_name`, `page_stage`): read live from the pages dataset
  through a join. Found at the start: the add-ticket modal never sets them (only the sync did), so a UI-filed
  ticket shows a blank target page today. The ticket's own `page_route` stays the ticket's (the exact route filed from).
- **Page rows for tracked patterns**: track-on-publish (below).
- Not needed yet: `stage_order` (already a live `CASE`), `next_step` (no QA page shows it), the schema-upgrade step
  (nothing adds a column yet; it comes with `dms qa upgrade`), design HTML (TransportNY-only).

**1. Live open counts on the Overview — DONE, live-verified 2026-10-01**
- Each covered site's pages table left-joins the install's tickets (`t`) on `page_key` and groups by page; new
  "Open" column = `count(*) filter (where t.status in <open statuses>)`, every severity, TransportNY's rule
  (`lib/cr.mjs` `boardCounts`). A page with no tickets has one all-null `t` row, which the filter leaves out.
  Helpers: `joinDataset` + `OPEN_COUNT` (`pages/helpers.js`); `dataWrapper` takes a `join`.
- **Join rules found building it** (the joined section is read-only):
  - Plain columns are written alias-prefixed (`ds.name`, `ds.page_key`): rows come back keyed by that name
    (`searchParamsCol: 'ds.page_key'`). A live-edit save would write those prefixed keys as fields, so no join on
    an editable section.
  - **A filter column must also be one of the section's columns, alias-prefixed.** A bare `surface` leaf compiles
    to an unaliased `data->>'surface'` (ambiguous: both tables have `data`); an unlisted `ds.surface` reaches the
    server as is ("column ds.surface does not exist"). Fixed with a hidden `{ name: 'ds.surface', show: false }`
    column, which `mapFilterGroupCols` resolves to `ds.data->>'surface'` (the now-airing card's precedent: it filters
    on its own columns). Library gap, not fixed: under a DMS join, `mapFilterGroupCols` could map an unlisted
    `alias.col` through `attributeAccessorStr` itself (`buildUdaConfig.js`, `if (!col) return node`).
  - Grouped, so the stage sort is an aggregate (`min(<stage CASE>)`, fn `exempt`).
- Live (probe, `qa_test` token, `/qa`): no SQL/console errors; Open = 1 on AlphaPage Page 1, BetaPage child chart,
  Page 1 (its Closed Major not counted) and dup no chart; empty on the two Blank pages (0 renders blank); the two
  helper columns measure 0px wide.

**2. A ticket's page name and stage, live — DONE, live-verified 2026-10-01**
- The Ticket page's header and the Tickets table left-join the install's pages (`p`, `pagesByKey`) on `page_key`:
  the target page shows `p.name` (else the raw page key, `PAGE_DISP`) and its stage pill `p.stage`. The ticket's own
  `page_route` still shows (the route it was filed from).
- Under the join a bare `id` is ambiguous, so the ticket number reads `ds.id` (`tnum('ds.id')`; `TNUM` = `tnum()`
  elsewhere), and so do the header's `?id=` filter (`id` is a real column, so the raw `ds.id` leaf is right as is)
  and the table's newest-first sort. The table's four URL filters keep their keys (`?status=` etc.; page filters
  match on `searchParamKey`) on `ds.<col>` leaves, with hidden `ds.source` / `ds.surface` columns so they resolve.
- The Details rail can't join (live-edit Card): its "target page" is the stored name, else the page key, so it's
  never blank. It can go stale on a page rename; the header above it is live.
- Aliases are free-form: the key under `join.sources` is the SQL alias as written (`as <alias>`, server
  `buildJoin`), any plain identifier but `ds`. The section editor's join UI picks its own; hand-written ones here use
  `t` (tickets) and `p` (pages).
- Live (probe, `qa_test` token): `/qa/ticket?id=149` header "target · Page 1 /page_1 · page is QA", rail "Page 1",
  no SQL errors (the 7 React unknown-prop console errors are the known ones above); `/qa/tickets` all 6 tickets,
  newest first, live page names; `/qa/tickets?status=In review` exactly #104 and #102.

**3. Track-on-publish — DONE, live-verified 2026-10-01**
- New `patterns/qa/tracking.js`, `trackPublishedPage`: for each of the site's QA installs, read its covered sites;
  if one covers the published page's pattern (enabled, and the slug passes a non-empty `include_slugs`) and the
  install's pages dataset has no row for `<surface>:<slug>` yet, create one: `page_key`, `surface`,
  `surface_label`, `name` (title), `route` (`/<slug>`), `url`, `build: Published`, `stage: Proposed`, `updated`.
  A re-publish leaves an existing row (and its stage) alone. No I/O of its own (reads and writes are passed in),
  so both publish paths share it, and the CLI can import it (no browser imports; `./ticketRecord.js` with the
  extension, as Node needs). `coveredSites` / `COVERED_SITE_COLUMNS` moved here (re-exported from `pages/index.js`).
- **A covered-sites row names its pattern by name, row id or instance.** TransportNY's rows use names
  (`npmrds_sub`, `tsmo2`, `platform_docs`) and one id (`2175436`), because its sync looks patterns up with
  `dms page list --pattern`; the test seed uses instances. All three match, so the port tracks the same pages.
- **Editor:** `render/spa/utils/index.js` passes the site's `qa` pattern rows to every pattern config as
  `qaPatterns` (beside `datasetPatterns`); the page config puts `qaTracking` = `{installs, patternKeys: [id, name,
  instance]}` on `CMSContext`, null when the site has none; `PublishButton` passes it with `app`/`baseUrl`/`falcor`
  to `publish()`, which calls `trackOnPublish` after its own save. Reads: `loadDatasetRows`; the write: `apiUpdate`
  with the pages dataset's format, as a section's add-row does. `url` = the browser's origin + mount + slug.
- **CLI:** `dms page publish` finds the site's `qa` patterns (`resolvePattern`), tracks the same way
  (`falcor.call dms.data.create` with `<slug>|<view>:data`), and adds `qa_tracked: [{install, page_key}]` to its
  output only when it tracked something (or failed). `url` = the mount path (`/alphapage/<slug>`); none for a
  pattern on its own subdomain, since the CLI can't tell the host.
- **Found building it:** a row created through `dmsDataEditor` invalidates only `dms.data`, not the dataset's
  `uda` view, so a check-then-create could read a stale list and create a duplicate on a quick re-publish.
  `loadDatasetRows` takes `fresh: true` (drops the view's cached reads first); tracking always uses it.
- **Failures never fail the publish:** the editor logs a warning; the CLI reports it under `qa_tracked`.
- Not done (later): rows for pages published before an install existed, or before a site was switched on (phase 5's
  Configure, "turning a pattern on adds its published pages", can call `trackPublishedPage` per page); unpublish or
  delete never removes a row (TransportNY's prune is opt-in too); `data`/`owner`/`qa` defaults left unset
  (TransportNY's sync wrote `Mock`/`—`/`Needs QA`), so Page QA shows them blank until someone sets them.
- **Blast radius (2026-10-01):** of 115 `dms_*` app schemas only `dms_qa_test` has a `qa` pattern (1 row, the QA
  install). Everywhere else the editor's `qaTracking` is null (Publish unchanged) and the CLI makes one extra
  pattern-list read and prints the same output. Every consumer grepped: `qaPatterns` (page config only),
  `qaTracking` (`PublishButton` only), `publish(` (one live caller, `pagesPane.jsx`), `loadDatasetRows` (`fresh`
  defaults off: QA's view unchanged); the five scripts that mention `dms page publish` don't parse its output.
- Live (scratch pages in AlphaPage, deleted after): `dms page publish` → `qa_tracked: [{install: QA, page_key:
  alphapage:qa_track_scratch_cli}]`, row created (url `/alphapage/qa_track_scratch_cli`); a second publish created
  nothing. Editor Publish on a draft page → row `alphapage:qa_track_scratch_ui`, url
  `http://localhost:5173/alphapage/qa_track_scratch_ui`; one row. Cleanup: rows 155–159 deleted, pages dataset
  back to its 6 seeded rows.
  - The probe can't hard-load an edit URL on AlphaPage: it lands on `/` (the placeholder-user route check,
    `route-auth-check-judges-placeholder-user.md`). Loading the view page and navigating client-side
    (`history.pushState` + `popstate`) reaches the editor (`traversing-dms-pages.md`).

**Tests (phase 4)**
- [x] New `tests/qaDerivedValues.test.js` (13): each joined section compiled through the real `buildUdaConfig`:
  the Overview's open count (left join on `page_key`, grouped, open statuses only, any severity), the site filter
  on `ds.data->>'surface'`; the ticket header and table read `p.name`/`p.stage`, keep `page_route`; the rail's
  fallback; every joined section is read-only, and every compiled read, sort and filter names its table (no bare
  `data->>` or `id`). Mutation check: putting back the bare `surface` filter fails 3 of them.
- [x] New `tests/qaTracking.test.js` (11): the row shape, matching by name/id/instance, re-publish, disabled site,
  another pattern's site, `include_slugs`, an install with stripped settings (no reads), several installs, no slug.
- [x] Updated for the alias-prefixed names: `qaOverviewPages` (2), `qaTicketPages` (3). QA suites 97/97; full
  `packages/dms/tests` 651/654, the same 3 unrelated failures (`avlGraphThemeDefaults` golden,
  `syncDeltaConvergence` ×2).

### Phase 5: Configure tab on the install's `manage_pattern` page — DONE 2026-10-02 (live-verified on `qa_test`, committed `d590c66f`)

README step 6. **Owner answers at the start (2026-10-02):** (1) Configure is a **new sidebar tab on the QA install's
own `manage_pattern` page** (`/list/manage_pattern/<id>/configure`), next to Overview, Access and Theme, the way page
patterns add Pages, Data, Activity, Page Templates and Format Manager there. (The owner first said "the Overview",
then, after seeing how many tabs page patterns add, said a tab is fine.) Users and permissions stay on the existing
Access tab. (2) **only what works today**: covered sub-sites and site labels. (3) **Feature switches: later**
(owner, 2026-10-02; see "Phases 6–7"). **Moved to phase 6**, because they do nothing until the widget
exists: who can report, where "Report an issue" appears, page families (TransportNY's "every `reports/*` page is one
QA row"; it also changes track-on-publish, so it goes in with the widget's `SLUG_BUCKETS` replacement).

**Where it goes.** A `Configure` tab (path `configure`) **on QA installs only**. No other pattern type changes,
the way only page patterns get Pages. The tab holds **all of the install's QA config** (owner, 2026-10-02): the
"datasets: N of 5 linked · finish set-up" card (`QaPatternSettings`, `default/settings.jsx:583`) shows on **both** the
Overview, where it is now (`:402`), and Configure, because it's the install's health at a glance (owner, 2026-10-02).
- In code, the admin lists a pattern's tabs in two places, and each gets one entry gated on `pattern_type === 'qa'`:
  the sidebar links (`buildPatternMenuItems`, `patterns/admin/siteConfig.jsx:440`) and the screen each tab URL shows
  (`allPages`, `patternEditor/index.jsx:113`). It needs `edit-pattern` like every tab but Access (`tabPermission`,
  `utils/adminPermissions.js:188`); both lists already filter by that.
- **Saving:** the tab has its own Save. It writes the changed covered-site rows (dataset rows), then the pattern row
  (`apiUpdate`, as the Overview's save bar does), then the backfill. "Finish set-up" adds `dmsEnvId`, `qa.datasets`
  and `authPermissions` to the open tab's draft (`settings.jsx:621`), so on each tab that tab's Save writes them.
- **Check first:** can an install's own admin (a grant on the install, not a site admin) reach the page? The pattern
  editor checks the pattern's own grants (`patternCan`), the Sites list checks site-level access.

**A. Covered sub-sites.** The tab's main table. It writes the install's covered-sites dataset (`qa_patterns`, columns
`COVERED_SITE_COLUMNS`), the list the Overview, track-on-publish and (phase 6) the widget already read.
- **What the admin sees:** one row per pattern on the site that the admin can view, every type but `admin` and
  `qa` (owner, 2026-10-02: all patterns; `qa` left off because an install covering an install means nothing) (`loadSitePatterns`; rows
  that reach the browser as `no-access` stubs are left off). Per row: on/off, label, short key, page limit, order.
- **On:** writes or updates the row (`enabled: 'yes'`), then adds the pattern's already-published pages: the Pages
  tab's load (`apiLoad` on `<instance>|page`, `pagesEditor.jsx:626`), keep `(published ?? 'draft') !== 'draft'` (the
  CLI's rule, `cli/src/commands/page.js:64`), and `trackPublishedPage` per page. That closes phase 4's backfill gap.
  Existing rows are left alone, as on a re-publish. The same backfill runs when a page limit is widened or cleared.
- **Off:** `enabled: 'no'`. The site's Overview card goes and publishing stops adding its pages. Its page rows and
  tickets are kept, so switching it back on brings everything back.
- **Overlap:** a pattern another install already covers (enabled) can't be switched on, and the row names that
  install. It checks the installs whose settings the admin can read. One that reaches the admin as a stub can't be
  checked until phase 6's intake summary carries its covered list.
- **Page limit:** a picker over the pattern's pages (the same load), saved as today's comma-separated
  `include_slugs`.
- Writes go through `apiUpdate` (the add-row path), reads through `loadDatasetRows` with `fresh: true` (phase 4's
  stale-read fix).

**B. Site labels: one source.** Today the Tickets page's Site pills and filter read `pattern.qa.siteLabels`, and the
Overview cards read each covered-site row's `surface_label`. After: only `surface_label`, edited in A.
`buildQaPages` builds the label map from the covered-site rows `QaPageView` already reads on every QA page,
including switched-off sites, since their tickets still exist. `qa.siteLabels` is dropped (the test install doesn't
set it; the TransportNY port seeds `surface_label` instead of `SITE_LABELS`). Visible change: the Site pills fill in
once that read returns, as the Overview cards already do.

Also on the tab, read-only: the status and stage lists from `ticketRecord.js` (README step 6; making them editable
is a new-features item).

**Decisions (owner, 2026-10-02):**
1. **Every pattern type but `admin`** (and `qa`). Quicker overall than adding the rest in phase 6: no type filter
   now, nothing to revisit. A type without pages (Datasets, Forms) adds no rows on switch-on, and tracking stays
   page-publish-only until the widget.
2. New covered-site rows name their pattern by its **instance** (`alphapage` in `qa_test|alphapage:pattern`). It's
   made from the name at creation and is unique in the site (`editSite.jsx:388`, collision check), and the type is
   read-only on the Overview (`settings.jsx:316`), so a rename doesn't change it. It's also readable and what the test
   seed uses. Row id is as stable but opaque. The matcher still accepts names and ids, so TransportNY's rows work.
3. The **short key locks** once a pages or tickets row uses it: page keys are `<key>:<slug>`, so a changed key
   orphans them.
4. **One Save** for the tab (no live per-row saves): switching a site on adds many page rows, so it shouldn't fire on
   a mis-click, and the Overview's save bar is the precedent on the same page. The tab is named **Configure**.

**Tests.** Unit, on the pure parts: the row a switch-on writes; the overlap check; the key lock; the backfill filter
(published rule, page limit, existing rows); the label map, including switched-off sites. Live on
`qa_test`'s `QA` install (row 126): BetaPage off → its card goes, rows kept; on → card back, nothing duplicated. Then
a scratch page pattern with published pages, switched on → one row per published page; Save again → no new rows. A
label change shows on the Tickets Site pills. A scratch second install refuses BetaPage and names `QA`. Scratch rows
and installs deleted after.

**Blast radius.** The new tab is `qa`-only in both lists. `buildQaPages` and `trackPublishedPage` are QA code. The publish paths
already return early when a site has no `qa` pattern (only `dms_qa_test` has one, phase 4's count). Grep every
consumer again before building.

**Progress (2026-10-02)**
- [x] Access, by code only (owner: exact access doesn't matter): the `manage_pattern` route has no check of its own,
  and the pattern editor checks the install's own grants (`patternCan`), so `edit-pattern` on the install is enough
  to open Configure by direct link. Without site-level `view-pattern-list` the sidebar has no Sites link. Not tried live.
- [x] Pure logic, `patterns/qa/configure.js`: `coverablePatterns` (all but `admin`/`qa`, no stubs), `configureEntries`
  (pattern ↔ row by id/name/instance; unmatched rows kept as `others`), `coveredSiteRow` / `configureWrites` (new
  rows by instance, after the last order; existing rows keep their `pattern` value and update only on a change),
  `usedKeys` / `keyLocked`, `coveredElsewhere`, `configureErrors` (empty / malformed / duplicate / taken key, covered
  by another install; only changed fields checked), `needsBackfill`, `backfillRows` (published = not `'draft'`,
  page limit, existing rows), `siteLabelsFrom`. Tests: new `tests/qaConfigure.test.js`, 19/19.
- [x] Site labels from covered-site rows only: `siteLabelsFrom` (in `tracking.js`, beside `coveredSites`) over every
  row, switched-off sites too; `QaPageView` keeps all rows and passes `sites` + `siteLabels`; `buildQaPages` takes
  `siteLabels` as an option; `pattern.qa.siteLabels` is no longer read (no other reader: CLI, server, themes
  grepped). Tests updated (`qaDefaultTheme`, `qaDerivedValues`, `qaTicketPages`). QA suites 116/116.
- [x] Save routine `saveConfigure` (injected I/O, like `trackPublishedPage`): covered-site writes, then each
  switched-on / re-limited site's published pages. 3 more tests (22 in `qaConfigure.test.js`).
- [x] The Configure tab, `patterns/admin/pages/patternEditor/qa/configureTab.jsx` (+ `.theme.js`, registered as
  `qaConfigure` in `patterns/admin/defaultTheme.js`): QA only, in the sidebar (`buildPatternMenuItems`) and the tab
  routes (`allPages`). Cards: the datasets card (`QaPatternSettings`, now exported, still on the Overview too),
  covered sites (switch, pattern, short key locked when in use, label, order, page-limit picker for page patterns,
  row errors, unmatched rows listed), the ticket record read-only. One Save: dataset rows through `dmsDataEditor`
  (the wrapper's `apiUpdate` revalidates the whole admin loader after every create, so a backfill would reload it
  once per page), then the pattern row through `apiUpdate` when "finish set-up" changed the draft.
  - Keyed by the install (`QaConfigureTab` → `QaConfigureBody key={value.id}`): found live, moving in-app from
    another pattern's tab kept the previous pattern's draft (see "Found" below).
- [x] **Live check on `qa_test` (2026-10-02, probe with the `qa_test` token, client-side navigation from `/qa`):**
  - Sidebar on the QA install: Overview, **Configure**, Access, Theme. AlphaPage's (row 5) is unchanged: no Configure.
  - Configure: datasets "5 of 5 linked"; covered sites Auth (off), Pages (off, the seed's row 139), AlphaPage and
    BetaPage (on, keys greyed: in use); Admin and QA not listed; ticket record lists shown. No console errors.
  - Pages key set to `alphapage` → Save disabled. Pages on + BetaPage relabelled "BetaPage (test)" → Save: "saved ·
    added 1 page from Pages". DB: row 139 `enabled: yes`, row 138 relabelled, new pages row 165 `pages:page_1`
    (`url` `http://localhost:5173/page_1`, Proposed, Published). `/qa/tickets`: every BetaPage pill and filter reads
    "BetaPage (test)"; `/qa`: "3 sites covered", 8 pages, a Pages card.
  - Reverted through the UI (Pages off, label back: "saved", nothing added), then row 165 deleted
    (`dms raw delete qa_test 'qa_pages|130:data' 165`). Backup first: `scratchpad/qa_test/backup_2026-10-02/`. The
    owner's own tracked page (row 164, `alphapage:new_page_2`) untouched.
  - Side effect: the first Save filled the blank `app` / `base_url` fields on all three covered-site rows (so it
    updated AlphaPage's too). Harmless; the rows now carry TransportNY's fields.
  - Not tried live: the overlap refusal (needs a second install; unit-tested), and a non-admin install admin.
  - Page-limit picker opens on BetaPage ("none picked = every page").
- [x] Full `packages/dms/tests`: 717/720, the same 3 unrelated failures (`avlGraphThemeDefaults` golden,
  `syncDeltaConvergence` ×2).

**Found building it**
- **The Overview tab kept the previous pattern's draft after an in-app move between two patterns** (back/forward,
  or a client-side navigation): `PatternSettingsEditor` sets `tmpValue` once (`useImmer(value)`, there since the
  file's first commit `d16f0a65`, 2025-12-05) and the editor reused the instance, so QA's Overview showed
  AlphaPage's row ("datasets: 0 of 5 linked · 5 missing"). **FIXED 2026-10-05 (owner asked), committed `5e075368`:**
  `key={item.id}` on `PageComp` (`patternEditor/index.jsx`), so each pattern mounts its tab fresh; a reload of the
  same pattern keeps its id, so a Save doesn't remount. Also covers Format Manager
  (`useState(value.additionalSectionAttributes)`). Live (probe, no reloads): AlphaPage → QA → BetaPage → back: name
  field AlphaPage / QA / BetaPage / QA, QA's datasets "5 of 5 linked" both times. `PatternEditor` mounts every tab
  and is imported only by the admin's `siteConfig.jsx`; no test imports it. Configure's own keyed body is now
  redundant, kept.
- A signed-in probe **hard load of `/list/...` renders blank** (sidebar Auth › Profile only); loading `/qa` and
  navigating client-side works (`traversing-dms-pages.md`).
- The console's React "unknown prop `customTheme`" warning comes from the Overview's `FieldSet` / `filterEditor`,
  not Configure.

**Blast radius.** Every change outside QA code is gated on `pattern_type === 'qa'` or additive: the tab entries
(`patternEditor/index.jsx`, admin `siteConfig.jsx`), the `qaConfigure` theme key (`patterns/admin/defaultTheme.js`),
`export` on `QaPatternSettings` (no behavior change). `tracking.js` only gains an export (still no browser imports,
so the CLI's import is unchanged). The publish paths and the CLI aren't touched.

### Phases 6–7 — Phase 6 (Report an issue) BUILT 2026-10-07: on MitigateNY's 4 source patterns, deploy pending (coworker); phase 7 NOT STARTED

**Phase 6 build, 2026-10-07 (uncommitted, verified live on `qa_test`):**
- **Library, new files in `patterns/qa/reportIssue/`:**
  - `report.js` (no browser imports): `findCoveringSite`, `intakeRefs`, `reportRow`, `REPORT_DEFAULTS`,
    `ticketsFormat`, `ticketsSource`.
  - `ReportIssue.jsx`: the nav widget, registered as `ReportIssue` in `patterns/qa/siteConfig.jsx`, like the page
    pattern's `UserMenu`. Slot options: `iconOnly`, `icon` (default `Alert`), `label`, `activeStyle`.
  - `ReportIssueForm.jsx`: the form, a `lazyComponent` chunk `qa/ReportIssueForm`.
  - `ReportIssue.theme.js`: the theme key `qaReportIssue`. A site overrides `buttonStyle`, `sendStyle` and
    `cancelStyle` (`UI.Button` style names) and the layout keys.
- **What it does:**
  - Shows only for a signed-in user, on a page whose pattern an install's covered-sites rows include (with their
    page limit). Covered sites are read once per page load.
  - The form is a `UI.Modal` with `FieldSet` (Input/Textarea) and two `UI.Select`s: kind, plus severity in plain
    words for problems (an idea files as Feature). Then summary, details, and the note about what's sent.
  - It writes one tickets row through `apiUpdate`, filled by `applyCreateDefaults` with Page QA's New ticket fills:
    `ticket_id` auto-numbered from 101, Triage, source client, reporter and reporter_email, opened/updated.
    `page_key` is `<surface>:<slug>`, plus surface, page_route, page_name, and an `env` JSON (url, browser, window).
  - The confirmation says "Report sent". It shows no ticket number (owner, 2026-10-07).
- **Users not granted on the install (option b):** dms-server's no-access stub for a `qa` row carries
  `qa: {intake: {tickets, patterns}}` (`dms.route.js` `qaIntake`); `report.js` `intakeRefs` reads it.
  `tests/test-pattern-stub.js` covers the stub for an ungranted user, an anonymous user, a granted user, a non-qa
  pattern, and an install with partial datasets.
  - Reads of a DMS internal dataset (`uda` length/dataByIndex) have no permission check, so an ungranted user can
    read the covered sites and the highest `ticket_id`.
  - The create goes through the unguarded `dms.data.create` (Defect E in `auth-permission-chain-and-unguarded-writes.md`).
    When that's guarded, the tickets source needs a create grant for these users.
- **MitigateNY look (revised 2026-10-07 after the owner's review: the labelled pill was "way too big"; in the
  narrow right slot it wrapped onto three lines, 87×73px):**
  - `qaReportIssue` = `iconOnly: true`, a 24px `Alert` icon (MNY's top-nav icons are `size-6`, `theme.js:397`),
    `iconButtonStyle: 'navIcon'`, amber `primarySmall` Send, default Cancel.
  - New MNY button style `navIcon`: a bare icon with `ml-3 -mr-2`. The slot packs items with no gap, so this gives
    12px from the search pill and 14px to the user icon (measured on `/home`; before: 0px and 22px).
  - The library gained theme-level `iconOnly` / `iconButtonStyle` defaults, and `label: whitespace-nowrap`, so a
    labelled button never wraps.
  - Admin's rail shows the icon above the user block.
  - **Follow-up (owner, 2026-10-07): put Report an issue inside the user menu** (the dropdown) instead of as a nav
    icon. Not hard, but deferred: it touches the shared `userMenu.jsx` and means removing the four nav entries
    (a prod write). The user menu already takes `{name, icon, onClick}` items and renders a modal outside the
    dropdown (`DeleteModal`, `userMenu.jsx:385-391`); the page pattern already imports `qa/tracking.js` (publish).
    The plan: move the coverage check into a shared hook, add an item when covered, render the lazy form outside
    the dropdown.
- **Two bugs found while testing, both fixed:**
  - The widget first read the user from CMSContext, which on a first load can stay the boot-time placeholder
    (`isAuthenticating`), so the button never showed until a reload. It now reads `AuthContext`, as UserMenu does
    (`userMenu.jsx:31`).
  - The library default `button` style 0 is a solid primary button, too heavy for nav chrome and for Cancel. The
    defaults are now `plain`.
- **Verified:**
  - `tests/qaReportIssue.test.js` (16) plus all QA client tests: 148/148.
  - `dms-server` `tests/test-pattern-stub.js`: 29/29.
  - Live on `qa_test` AlphaPage (row 5, given a test nav with the widget in the top nav and the side rail):
    - First load shows both buttons, three runs in a row.
    - The owner filed #107 by hand.
    - #108 was filed with install 126 temporarily un-granted for the test user, through the stub's intake. Access
      restored after. Rows 186/187 in `qa_tickets`.
- **Wrap-up (2026-10-07):** the owner pushes, and the MitigateNY coworker deploys and propagates. The coworker's
  how-to: [`planning/mitigateny/skills/report-an-issue-widget.md`](../../../../../planning/mitigateny/skills/report-an-issue-widget.md)
  (deploy prerequisite, nav entry plus coverage per county, moving it, where tickets land, gotchas). The committed
  placement tool is `src/themes/mny/scripts/report_issue_nav.mjs`: the dms CLI with the caller's token, dry run by
  default, backups, refuses no-access stubs and hidden navs. It replaces the scratchpad `place_report_issue_mny.py`.
- **The MitigateNY rollout, as run 2026-10-07 (steps 0–3 are the coworker's deploy):**
  0. **Root `npm install`.** `maplibre-gl` is in `package.json` but missing from the root `node_modules` again, so
     `vite build` fails (Rollup can't resolve it from `transportny/components/routecreation/comp.jsx`). Dev still
     works.
  1. **The owner commits** the library submodule and dms-template.
  2. **Deploy dms-server** (the `qa.intake` stub), so county staff not granted on the install can file.
  3. **Build and deploy the client** with the MitigateNY `.env`: `npm run build` then `npm run deploy-devmny`
     (that script ships `dist/` as-is), then `npm run deploy-mnyprod`.
  4. **Add the nav entries:** `DMS_HOST=http://localhost:3001 python3
     scratchpad/mitigat-ny-prod-prod/place_report_issue_mny.py --apply`. The dry run on 2026-10-07 showed exactly:
     - 985070 and 1300890: `topNav.rightMenu` → `[SearchButton, ReportIssue, UserMenu]`
     - 2265530 (actions): `topNav.rightMenu` → `[ReportIssue, UserMenu]`. Its stored sideNav doesn't render, per a
       read-only look at `/actions/dashboard`.
     - 566466 (admin): `sideNav.bottomMenu` → `[ReportIssue {iconOnly}, UserMenu]`
     It backs up each row and has `--restore <stamp>`.
  - **Step 4 APPLIED 2026-10-07 10:06 (local time), before the deploy, at the owner's choice (all four rows).**
    Re-read by SQL: every array matches, and every other key is identical to its backup
    (`scratchpad/mitigat-ny-prod-prod/backup_<id>_20261007T100659.json`; undo with `--restore 20261007T100659`).
    Until steps 2–3 ship (the coworker deploys), live sites render the `NoComp` placeholder: a 48px gap in admin's
    side rail, and about 48px of blank space in the phone menu on the three top-nav patterns.
  - **Order trade-off:** the rows are shared by devmny.org and mitigateny.org. Written before prod runs the new build,
    an old build renders `NoComp` for the entry. That's invisible in a top nav, but leaves a 48px gap in admin's side
    rail. Writing after the deploy avoids it.
  - Restore AlphaPage's test nav when no longer useful (`scratchpad/qa_test/place_report_issue_widget.py --restore`).
- **Follow-ups (owner, 2026-10-07), none started:**
  - A real serial `ticket_number` column (server-side, no max+1 race).
  - The install lockout fix.
  - MNY colours on the QA pages.
  - Search plus IDs on the Configure site list.
  - Collapsible Overview site cards.
  - Report an issue inside the user menu.
  - MNY's cramped search pill.
  - Signed-out filing.
  - Where county tickets show up after propagation is answered in the coworker skill.
  - Each item's details are in its own bullet in this section.


**Report an issue on MitigateNY: research 2026-10-06 (nothing built yet).**
- **Owner pivot (2026-10-06):** the next milestone is installing QA on MitigateNY, so that internal and external
  users file tickets through Report an issue. This replaces "Out: MitigateNY" in Scope for phase 6. TransportNY
  work drops in priority (no contract). The matching MitigateNY deliverable is the D5.2 ticket-system task
  (`planning/mitigateny/tasks/current/mny-sow-ticket-system.md`, internal pilot Oct–Nov 2026).
- **Widget versus floating button: one plan, not two.** A coworker suggested a widget. Round 1, answer 2 (above)
  already chose a `ReportIssue` widget, with floating as a widget option. The mockup's review bar toggles
  "floating / in the sidenav". A "widget" is DMS's name for a component placed in a nav slot. `Layout.jsx:27-33`
  is the only code that reads `theme.widgets`, and it renders them only in the four slots (`topNav.leftMenu`,
  `topNav.rightMenu`, `sideNav.topMenu`, `sideNav.bottomMenu`). The admin theme editor's slot pickers come from
  `Layout.theme.jsx`. The rejected alternative is a separate floating mount, rendered by Layout or the page shell
  whenever an install covers the page. It would put QA code into Layout, and it would skip theme placement.
- **MitigateNY placement:** the top nav's right slot, next to the user menu (`src/themes/mny/theme.js:221`). Most
  pattern rows never see that line. `getPatternTheme` (`ui/useTheme.js:160-185`) takes `layout.options` out of the
  base theme and copies them in only when the pattern row stores **no** `theme.layout.options` of its own. So a
  pattern with any stored nav settings ignores `theme.js`'s slots entirely. Whether it has `_replace` or not doesn't
  matter, and page rows don't change it: 2,308 of the 3,432 reachable pages store layout options, but none touch
  `topNav`.
  Only patterns listed in the site row's `patterns` count: site MitigateNY (566430) lists 81, and routes are built
  from that list only (`render/spa/utils/index.js:253`). The other 30 pattern rows in `dms_mitigat_ny_prod` can't be
  reached (old Nassau/Schenectady/Suffolk/Westchester versions, `plants*`, `shmpcopy`, `redesign-backup`, the
  replaced `MitigateNY_Delaware` clone 2564043).
  **With only the code change (widget + one `theme.js` line), 4 of the 75 reachable page patterns get the button:**
  - **Get it (4 patterns, 230 pages):** the `mnyv1` patterns with no stored nav settings: County_Template_Suffolk
    (2249247), Delaware_Draft (2323808), Schenectady_Draft_V2 (2304223) and Westchester (2448336).
  - **Don't (59 patterns, 2,741 pages):** `mnyv1` patterns that store their own nav settings. That's every
    bulk-cloned county (cloned from MitigateNY_County_Template_V3, 1300890), the main site MitigateNY_2025 (985070),
    planning-guide, MitigateNY_actions, Playground and buildings.
  - **Don't (10 patterns, 326 pages):** old plan versions on another theme: 6 with no theme set (`default`, e.g.
    `allegany-2024`, `fulton-2021`) and 4 whose legacy setting names `mny`, which isn't registered (`delaware-2021`,
    `putnamcsc`, `schoharie2024`, `schohariecounty`).
  - **Don't (2 patterns, 135 pages):** `mny_admin`: `admin` (566466) and `putnamcsc_admin`.
  So placement means writing the entry into each pattern row's stored `topNav.rightMenu` (scripted, backed up first,
  `--data` rather than `--set`), plus `theme.js` for the 4 without stored settings. Editing the county template too
  means future counties carry it. The script should only touch patterns the site row lists.
- **After the backfill, do new MitigateNY patterns carry the entry?**
  - **Admin "duplicate":** yes. The new pattern row gets the source's whole `theme` (`patternList.jsx:447`, then
    `addNewValue` at `:308`).
  - **County sites from the mass-deploy script** (`county-site-mass-deployment.md`; the script lives in a scratchpad
    and isn't on this machine): yes, provided the County Template (1300890) is backfilled. 54 pattern rows store nav
    settings identical to the template's.
  - **Editing an existing pattern's theme later:** keeps it. The theme editor loads the stored nav settings and saves
    them back.
  - **"Add pattern" (brand new): no.** The row is created with no theme (`patternList.jsx:352`), so it renders on the
    library default theme. When an admin then picks `mnyv1` in the pattern theme editor and saves, the editor stores
    the nav settings it opened with. Those come from the default theme, because changing the theme dropdown doesn't
    refresh them (the refresh is commented out, `themeEditor.jsx:160-164`). Picking `mnyv1`, clicking "full reset" and
    picking `mnyv1` again pulls `mnyv1`'s nav settings, button included. "Full reset" (`themeEditor.jsx:246`) replaces
    the whole pattern theme, so it also clears `selectedTheme`. MNY's Logo and Search would be missing too, so the gap is
    visible.
- **Split of work (owner + MitigateNY coworker, 2026-10-07):** this task makes Report an issue work on four
  patterns. The coworker does the propagation to the rest. The four patterns, with their stored nav settings:
  - `admin` (566466, `mny_admin`, every subdomain, `/admin`): no top nav (`size: none`). The button goes in the
    compact side rail's `bottomMenu`, above `UserMenu`, so the widget needs an icon-only look for a narrow rail.
  - `MitigateNY_actions` (2265530, every subdomain, `actions`): `UserMenu` is stored in both `topNav.rightMenu` and
    `sideNav.bottomMenu`. Check which one renders before placing.
  - `MitigateNY_2025` (985070, the main site; the owner calls it "shmp") and `MitigateNY_County_Template_V3`
    (1300890): `topNav.rightMenu` becomes `[SearchButton, ReportIssue, UserMenu]`.
  - Propagation is two jobs: the nav entry in each pattern row, and a covered-sites row per county in the QA install.
    Without the covered-sites row, the button stays hidden on that county. Who adds them is to be agreed.
  - devmny.org shows the same pattern ids as prod, so it looks like the same database. Pattern-row writes show up on
    mitigateny.org at once. Until prod runs a build that includes the widget, `getWidget` renders the `NoComp`
    placeholder (`<div className='h-12'/>`). That's invisible in a top-nav row but leaves a 48px gap in admin's side
    rail. Deploy the code to prod before or along with the row writes.
- **Owner decisions 2026-10-07:**
  - **Install QA on MitigateNY first, then build the button.**
  - **No prod DB writes** (the install, nav entries, coverage rows) until the owner explicitly starts that part and
    is present for it. Research, docs and dry runs are fine.
  - **Signed-out filing deferred.** v1 is for signed-in users only.
  - **The QA pages on MitigateNY should look like MitigateNY.** Best guess, no design dive.
  - **The form stays small**, matching MNY's existing look through theming where a precedent exists.
- **Findings 2026-10-07 (read-only):**
  - **Who can see where to file:** for a non-auth, non-admin pattern row, any user without `view-page`,
    `edit-pattern`, `edit-pattern-permissions` or `delete-pattern` on it gets a stub (`dms-server`
    `routes/dms/dms.route.js:15,58-65,117-127`). The stub keeps `base_url`, `pattern_type`, `subdomain`,
    `locations`, `retired_subdomains`, `authPermissions`, `name` and `theme`, and drops `qa`, `dmsEnvId` and `config`.
    So **signed-in county staff not granted on the install can't find the tickets dataset either**, not just
    signed-out visitors. There are two ways to let them file in v1:
    - **(a)** Grant their groups `view-page` on the install. This also opens every QA page (all tickets, the
      Overview) to them.
    - **(b)** Pull one deferred piece forward: the server's stub for `qa` rows carries a "where to file" summary
      (the tickets dataset ref). That's a dms-server change and deploy. Writes then go through `dms.data.create`,
      which is unguarded today (see below).
    Working guess: (b), so counties don't see each other's tickets. To be confirmed with the owner.
  - **New installs' access:** `installQa` grants `{groups: {"<app> Admin": ['*'], public: []}}` (`install.js:157-159`).
    No MNY pattern row uses `mitigat-ny-prod Admin`. Its 111 pattern rows grant `AVAIL` (82) and `DHSES` (78). So
    right after installing, set the install's Access tab to the staff groups.
  - **Creating rows is unguarded:** `dms.data.create` (`dms.route.js:513-532`) and `createData` check nothing. Logged
    as Defect E in `auth-permission-chain-and-unguarded-writes.md`. Signed-out filing (deferred) needs: the stub
    summary, a create guard with a new `create-row` grant on the tickets source (an "allow signed-out reports" switch
    on the install), a honeypot and a per-IP rate limit. None of that exists in the library today.
  - **The live site stays safe when the row is added:** the route builder skips a pattern type the build doesn't know
    (`render/spa/utils/index.js:416-417`), so an older mitigateny.org build ignores a QA row. A mount with no
    subdomain serves only the bare domain, and `*` serves every subdomain (`:424-428`). The planned ny.gov redirect
    keeps the path (`mitigateny-org-redirect-to-ny-gov.md`), so `/qa` works on both hosts.
  - **Where the datasets go:** `pickQaEnvironment` (`install.js:37-41`) picks dmsEnv 1676363 `test_meta_forms_env`.
    That's the environment the Datasets pattern (1499610, `/cenrep`, 58 sources) uses, despite the name.
  - **QA theming on MNY:** the QA pages draw colors, surfaces and type from the shared `--t-*` tokens (122 uses in
    `qa.theme.js`). `mnyv1` sets none, so QA would show the library default palette. The default theme injects its
    tokens as a `fonts` style entry (`ui/defaultTheme.js:64-77`, id `dms-default-tokens`), and `fonts` lists stack
    across merges. Best guess:
    - the install's `selectedTheme: 'mnyv1'`, which brings MNY's nav, layout and fonts;
    - an MNY token block mapping MNY's palette onto `--t-*`, scoped to the QA pages so nothing else on the live site
      shifts. The palette: ink `#2D3E4C`, slate `#37576B`, rules `#E0EBF0`/`#C5D7E0`, mid `#6D96AE`, panel
      `#F3F8F9`, accent `#EAAD43`; Proxima Nova body text, Oswald headings.
- **Owner decision 2026-10-07: county staff file through option (b).** The dms-server stub for `qa` rows carries
  only the tickets dataset ref. No real security concern (owner). The owner does the MitigateNY install himself in
  the admin UI. The steps, checked read-only on 2026-10-07:
  1. **Use a build that offers the QA type.** That means `VITE_DMS_QA_PATTERN=1`, for example local dev with the root
     `.env` switched to the MitigateNY block and the flag kept. Check that `/list` shows MNY's patterns (e.g.
     MitigateNY_2025) before going on.
  2. **Reload `/list` right before adding.** The add saves the page's copy of the whole site row (`editSite.jsx`
     `onSubmit`), so a stale page could undo someone else's pattern-list change.
  3. **Add the pattern:** Type QA, name `QA`, URL `/qa`, from the bare host, so there's no subdomain and it lives on
     the main site only. The safety check passes: no MNY row uses instance `qa`, the `qa_*` dataset names or the
     URL `/qa`. The add creates the pattern row, adds it to site 566430's list, then runs `installQa` (5 datasets in
     dmsEnv 1676363). If the datasets step fails, the Overview's "finish set-up" resumes it (`settings.jsx:636`).
  4. **Access tab:** grant the staff groups (`AVAIL`, `DHSES`). The install's own grant names `mitigat-ny-prod
     Admin`, which MNY doesn't use.
  5. **Theme tab:** pick `mnyv1`, click "full reset", pick `mnyv1` again, then save. Without the reset, the default
     theme's nav is kept. The colors stay the library default until the QA-scoped MNY token block lands.
  6. **Configure tab, covered sites:** the four patterns. Once a pattern is covered, publishing a page on it adds the
     page to the install's Pages dataset (track-on-publish, in builds that have it). The button isn't built yet.
- **MitigateNY install made by the owner, 2026-10-07: pattern 2824062 `QA`** (`prod|qa:pattern`, `/qa`, no
  subdomain, dmsEnv 1676363, all 5 datasets recorded; site 566430 now lists 82 patterns).
  - **Bug: the install locks out its creator on a site with no `<app> Admin` group.** `installQa` grants only
    `{"<app> Admin": ['*'], public: []}` (`install.js:157-159`), assuming every site has that group, as sites made by
    `createSite.jsx` do. MitigateNY predates that and grants `AVAIL` / `DHSES`. Nobody can read the row, so the server
    sends a stub, and the pattern editor refuses a stub (`patternEditor/index.jsx:110-112`), so the Access tab can't
    fix it from the UI.
  - **Library fix (to build):** also grant the installing user `*`, and/or start from the site Admin pattern's grants.
    Add a test for a site without the group.
  - **One-off repair:** `scratchpad/mitigat-ny-prod-prod/fix_qa_install_access.py`. It reads the full row by SQL,
    because `dms raw get` / `--set` would read the stub and write it back. It adds `AVAIL`, `DHSES` and user 1 `*`
    (mirroring Admin pattern 2724987), backs up the row, and writes with `dms raw update --data` only with `--apply`.
    **Applied 2026-10-07 with the owner's go**, through localhost:3001. Re-read by SQL: `authPermissions` =
    `{"groups":{"mitigat-ny-prod Admin":["*"],"public":[],"AVAIL":["*"],"DHSES":["*"]},"users":{"1":["*"]}}`; other
    keys intact. Backup: `scratchpad/mitigat-ny-prod-prod/backup_2824062_20261007T093633.json`.
- **Covered sites saved by the owner, 2026-10-07** (Configure tab; confirmed by SQL against
  `data_items__s2824069_v2824070_qa_patterns` and the owner's screenshot):
  - The four patterns and their page backfill:

    | Covered-sites row | Pattern | Pages recorded |
    |---|---|---|
    | 2824073 `admin` | 566466 | 71 of 72 |
    | 2824076 `mitigateny_actions` | 2265530 | 6 of 7 |
    | 2824074 `mitigateny_2025` | 985070, the owner's "shmp" | 160 of 164 |
    | 2824075 `mitigateny_county_template` | 1300890 | 44 of 44 |

    281 pages in `qa_pages`. The 6 pages skipped were all never published (`published` is `'draft'`, null or
    missing; `configure.js:147-153`).
  - The row stores the instance `admin`, which two pattern rows share: page pattern 566466 and the Admin control
    panel 2724987, both `prod|admin:pattern`. Only page patterns read coverage, so it covers 566466 as intended.
  - **Follow-up (owner, 2026-10-07): the Configure site list needs a search box and pattern IDs.** The list shows
    every pattern on the site, uncovered ones included (MNY has 80+), so it needs search like the `/list` landing
    page's (`editSite.jsx:216,499,543`). Show IDs in the row or on hover; the owner and coworkers name patterns by
    ID. Also seen: long short keys and labels truncate (`mitigateny_actio…`).
- **Deferred (owner, 2026-10-07): MNY's search pill is cramped in the top nav.** MNY doesn't style
  `pages.searchButton`, so it uses the library default (`w-[217px] justify-between`), which the flex row squeezes to
  about 115px; "SEARCH" runs into the magnifier. It was cramped before the Report an issue icon too. Likely fix: an
  MNY `pages.searchButton` override with `shrink-0` and a gap, checked against the centre menu's room.
- **Queued until Report an issue is completely finished (owner, 2026-10-07):**
  - Overview: make each site's card collapsible.
  - Question to answer: once the coworker propagates the button through the county template, where and how do
    county pages' tickets show up?
- **Report form design: best guess (2026-10-07; nothing built):**
  - **What MNY has:** no form or modal look of its own. Its `input`, `field`, `dialog`, `modal` and `multiselect`
    overrides are a frozen copy of the old library defaults (zinc, white, blue focus ring;
    `src/themes/mny/theme.js:1817-1822`, `:1754-1860`). Only `button` (`:729-776`) is branded: rounded-full,
    Proxima Nova 700, 12px uppercase. `primarySmall` is amber `#EAAD43` on ink `#2D3E4C`; the default is white with
    a `#E0EBF0` ring. MNY's existing modals are modal section groups, e.g. the create-action form on
    `mitigateny_actions` page 2418488 `jurisdiction_prioritization` (add-row Card 2469163, draft 2716823). They render
    with the library's unthemed `sectionGroup` chrome (white card on `bg-black/50`), not with `UI.Modal`.
    `mny_admin` overrides only `input`, `field` and `dialog`, in the same generic look.
  - **Plan:** a small centered `UI.Modal`, built only from themed library parts so it takes the host theme's look with
    no QA-specific styling:
    - `FieldSet` / `FieldComp` for labels and inputs. Use FieldSet's textarea (`Input.jsx:21`, reads
      `theme.input.textarea`), not `UI.Textarea`, which ignores the theme. `UI.Label` is a pill chip in MNY.
    - `UI.Select` for severity (there's no `UI.Radio`).
    - `UI.Button` styles: Send is MNY's amber `primarySmall`, Cancel is the default style.
  - **Fields (v1):**
    - Problem / Idea toggle
    - How bad, problems only: one select in plain words, mapped to Blocker / Major / Minor / Polish
    - Short summary
    - What happened
    - One quiet line saying the page address and browser details are sent with the report
    - Sent step: "Report sent: ticket #N", then close
  - **Cut from the mockup for v1:** the screenshot field (out of scope), name / email / honeypot (signed-out,
    deferred), the large "What is it?" cards and the radio list, and the expanded captured-context panel.
  - **Rejected: a side `UI.Drawer`** (non-modal, no scrim; what the mockup used so the reporter can see the page).
    MNY doesn't style `drawer`, so it would fall back to the library default tokens on MNY content pages. MNY's
    existing forms are centered modals.
  - **The nav button:** in the top nav, a small "Report an issue" button in MNY's default button style. In admin's
    compact side rail, icon only with a title. Check `mny_admin`'s z-index on its first render: its `dialog` lacks
    `z-50`. `UI.Modal` reads `theme.modal`, which `mny_admin` doesn't override.
- **Safe to list everywhere:** the widget renders nothing unless an install covers the page.
  `CMSContext.qaTracking = {installs, patternKeys}` is already set on page patterns (`page/siteConfig.jsx:155`), and
  `coveredSites` / `coversPattern` / `slugAllowed` (`qa/tracking.js`) answer the coverage question.
- **Mobile:** MitigateNY's `rightMenuContainer` is `hidden md:flex`. TopNav still passes `rightMenu` into
  `MobileMenu` (`TopNav.jsx:19,51`), so the button shows in the hamburger menu on phones.
- **Where the code lives:** `patterns/qa/siteConfig.jsx` registers the widget at module level. That file is imported
  on every site (`patterns/index.js:7`), the same way the page pattern registers `UserMenu` and `SearchButton`
  (`page/siteConfig.jsx:45-46`). The drawer is loaded with `lazyComponent` (`utils/lazyComponent.js`), so only the
  button is in the main bundle. The floating option renders through a portal, because an ancestor with a transform
  or filter traps `position: fixed`.
- **Side bug:** `theme.js:221` and 3 reachable pattern rows (1592725 Chemung2025, 1603896 planning-guide, 2043199
  sullivan; also unreachable 2027239 westchester2026) list `{type: "Search"}`. No widget has that name (the registered name is
  `SearchButton`), so the slot renders an empty `NoComp` spacer instead of search.
- **Open: signed-out filing for external users.** Signed-out visitors get stub pattern rows with settings stripped,
  so the widget can't see `qa.datasets`. It needs the server stub change noted below, an anonymous create on the
  tickets dataset, and a honeypot. Working guess: v1 is signed-in only, like TransportNY's demo (`QuickLinks` shows
  only when `user.authed`), and signed-out follows soon after.

See README steps 7–8. Notes to carry in:
- **Moved here from phase 5 (owner, 2026-10-02):** who can report, where "Report an issue" appears, page families.
- **Feature switches: moved out of phase 5 (owner, 2026-10-02); the plan is kept for when they're picked up.** New
  code, nothing reads a switch today. `pattern.qa.switches` on the install row, saved by Configure's Save; a missing
  switch means on, so every existing install keeps everything. From `feature-roadmap.md` §4, the ones that already
  have pages to hide:
  - **Tickets:** the Tickets and Ticket pages, the Overview's ticket figures and Open column, Page QA's tickets
    section.
  - **Page inventory:** the Page QA page, the Overview's per-site page tables, and track-on-publish (both publish
    paths skip an install with it off).
  - **Page stages** (needs Page inventory): stage pills and tiles.
  - **Stories** (needs Page inventory): Page QA's stories section.
  - **Overview** (needs Tickets or Page inventory): with it off, Tickets becomes the install's home (`index: 0`).
  - `buildQaPages` drops what's off; the nav follows the page list, and a hidden page's URL lands on the home page
    (`findQaPage`'s fallback). A switch whose prerequisite is off is disabled, with the reason. Off hides, never
    deletes. Tests: what each switch removes, the prerequisite rules, the home fallback, track-on-publish's check.
  - Not part of it: Report an issue and Design mockups (no feature yet). The roadmap's "create a dataset when its
    switch is first turned on" also stays out: the install creates all five up front (phase 2), and changing that has
    no visible effect while they all exist.
- **Signed-out filing (phase 6):** that covering list must be readable signed out (signed-out visitors get stub
  pattern rows with settings stripped). The design: the server's stub for `qa` rows carries an intake summary
  (`installs-and-overrides.md`, option 1; `dms-server/src/routes/dms/dms.route.js` ~118-123). A honeypot field
  ships with the form.
- **Rehearsal (phase 7):** copy through the CLI with new ids; keep old ids in `legacy_id`; rewrite the 19
  `duplicate_of` links from an old → new map; seed change history from existing dates.

## Files requiring changes (phase 1)

| File | Change | Done |
|---|---|---|
| `patterns/qa/siteConfig.jsx` | new: own route list, context shell + one view route | ✓ |
| `patterns/qa/pages/index.js` | new: `buildQaPages`, `findQaPage` | ✓ |
| `patterns/qa/pages/view.jsx` | new: `QaPageView` route component | ✓ |
| `ui/pageTemplates.js` | export two lexical helpers | ✓ |
| `patterns/qa/qa.test.js` | new | |
| `patterns/index.js` | register `qa` | ✓ |
| `patterns/admin/components/AddPatternPicker.jsx` + `.theme.js` | qa card + tag (`tagQa`: ink on `--t-marker-soft`) | ✓ |
| `patterns/admin/pages/editSite.jsx` + `.theme.js` | qa pill (`typePillQa`), sort order (after forms), duplicate hidden via `canDuplicate` | ✓ |
| `patterns/admin/admin.format.js` | `qa` pattern_type option | ✓ |
| `patterns/admin/components/patternList.jsx` | duplicate hidden for qa | ✓ |
| `patterns/admin/pages/patternEditor/default/settings.jsx` | duplicate row hidden for qa | ✓ |
| `patterns/page/siteConfig.jsx` + `components/userMenu.jsx` | `hasEditor` flag (default true) hides the edit toggle | ✓ |

## Testing checklist (phase 1)

- [x] vitest: `buildQaPages` returns a fresh array; group names and tracking ids stable; no page has an `id`
  (`packages/dms/tests/qaPattern.test.js`, 15/15 pass 2026-09-30)
- [x] vitest: `qaConfig` declares no `edit` route; `preload` returns the rows it's given; page pattern's own routes
  keep `edit`; format equals the page format
- [x] vitest: slug lookup (`''` → Tickets, detail slug → detail page, unknown → Tickets); nav lists only Tickets
  at `/qa/tickets`
- [x] full `packages/dms/tests`: 521/524 pass. The 3 failures (`avlGraphThemeDefaults` golden,
  `syncDeltaConvergence` ×2) import none of the changed files (esbuild metafile of `sync/sync-manager.js` and
  `graph_new/theme.js`: no touched inputs), so they're independent of this work.
- [ ] live: an unknown URL on AlphaPage shows its first page (confirms the precedent QA copies)
- [x] live: Add Pattern → Ticketing / QA creates `qa_test|qa:pattern` (row **38**, "QA", `/qa`): the card shows a
  yellow `QA` tag (ink on `--t-marker-soft`), name/URL default to `QA`/`qa`; after a reload the Sites row shows
  the `QA` pill and a `QA 1` chip. Right after Add the row reads `undefined / ?` until reload: existing behavior
  for every type (`addNewValue` appends a bare `{ref, id}`, `editSite.jsx:359-362`), not qa-specific.
- [x] live: `/qa` renders the Tickets placeholder in the site theme; nav lists only Tickets (`/qa/tickets`)
- [x] live: `/qa/ticket` resolves; clicking Tickets from it moves to `/qa/tickets` without a reload
- [x] live: `/qa/edit`, `/qa/edit/tickets`, `/qa/no_such_page` show Tickets, no editor controls, no errors
- [x] live: an unknown URL on AlphaPage (`/alphapage/no_such_page`) shows its first page (Blank): the precedent
- [x] live: no `/track/visit` on `/qa`, `/qa/tickets`, `/qa/ticket`, `/qa2`; positive control AlphaPage
  `/alphapage/page_1` and `/alphapage/blank` POST it (`pageId` 14 and 6, 204). Needed a new `--track` flag on
  `report_probe.mjs` (the dump lists non-graph calls only when they fail).
- [x] live: a second install "QA2" (row **39**, `/qa2`) renders on its own; its nav links to `/qa2/tickets`
- [x] live: duplicate hidden for qa — Sites row 38 has Edit + Delete only (page rows 3/5/7 keep Duplicate, auth 2
  Edit only); pattern editor `/list/manage_pattern/38` danger zone has only "delete this pattern" (5 has both)
- [x] live: AlphaPage, BetaPage (incl. `page_1/child_chart`), root Pages and the admin render; no console errors
- [n/a] `admin.format.js` `qa` option and the `patternList.jsx` duplicate guard: no live UI renders either.
  `patternList.jsx` is unrouted (its theme file says so), and `editSite.jsx`'s Edit modal is never opened (every
  `setEditingItem` call clears it). Kept for consistency with the other type lists.

**Follow-up (2026-09-30, owner picked option A): the edit pencil is hidden on QA pages.**
- The page pattern's `EditControl` (`patterns/page/components/userMenu.jsx:52-81`) showed for signed-in users with
  page-edit permissions; a new install has none beyond public, which `isUserAuthed` treats as "allow"
  (`utils/auth.js`). It linked to `/qa/edit/<slug>`, which just showed the page again.
- No existing flag to copy: the control only checks permissions. Added one generic flag to the page shell's
  context: `pagesConfig` takes `hasEditor` (default `true`) into `CMSContext` (`patterns/page/siteConfig.jsx`), and
  `EditControl` renders only when it's true. `qaConfig` passes `hasEditor: false`.
- Blast radius: `CMSContext.Provider` exists only in `patterns/page/siteConfig.jsx` (grep of the library, site
  themes, `data-types/`, `App.jsx`), and `EditControl` has one use (`userMenu.jsx:382`). The default is `true`, so
  every other consumer is unchanged.
- [x] vitest: the qa shell provides `hasEditor: false`, a page shell `true` (rendered with `renderToStaticMarkup`);
  17/17. Full `packages/dms/tests` 523/526, the same 3 unrelated failures as before.
- [x] live: the pencil still shows on `/page_1` (`/edit/page_1`) and `/betapage/page_1` (`/betapage/edit/page_1`);
  gone from `/qa/tickets` and `/qa2/ticket`; no console errors.

- **Tooling added this session:** `report_probe.mjs --track <substr>`; `scratchpad/npmrds-sub/mint_token.sh
  [project]` (writes `.dms-auth-token-<project>` for a non-default project).
