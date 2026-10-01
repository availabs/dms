# `qa` pattern type: ticketing / delivery QA as a library feature

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [tny_control_room_qa](../../../../../planning/initiatives/tny_control_room_qa.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Phases 1–3 DONE and live-verified on `qa_test` (2026-09-30). Committed by the owner: phase 1 (library `4919d419`,
dms-template `e2b3e2e`), phase 2 (`3392cb9b`), phase 3a (`3e27b5d2`), phase 3b (`2450f728`). **The default-theme
restyle and test-data reset (2026-10-01) are uncommitted.**

**▶ Next session, start here.** Nothing is in progress. The owner picks what's next; don't start without asking:
- **The owner's look check of the default-theme restyle** (`/qa` and its pages; section "Default-theme restyle and
  test-data reset"), incl. whether to fix Card's `valueFontStyle` size clash in the library.
- **The deferred status-change work** (phase 3a, "The status-change writes"): history rows, `resolved_date` stamping,
  and now the stage control's refresh (phase 3b, "Owner's hand check").
- **Phase 4:** derived values (live per-page ticket counts) and track-on-publish.
- **Phase 5:** the Configure tab in `/list`, so covered sites and labels stop being hand-seeded.
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

## Default-theme restyle and test-data reset — DONE 2026-10-01 (uncommitted)

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
- [ ] Owner's look check.

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
    patterns add Pages/Sources/Activity (`item.pattern_type === 'page' ? [...] : []`, line 110). Auth's Overview
    block (`AuthPatternSettings`, `settings.jsx`) is the other precedent, for a few fields.
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
| 4 | 5 | Derived values without a sync, incl. track-on-publish | NOT STARTED |
| 5 | 6 | Configure page | NOT STARTED |
| 6 | 7 | Widget (signed out too) + `dms qa` CLI | NOT STARTED |
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
- **(b) Library fix.** Fix View `updateItem` (per-row pending saves; honour `setDateOnValue`) and add an opt-in
  `changeLog` column option; QA pages then just configure status/assignee.
  - Cleaner, and any author gets it. But it changes TransportNY's Card pages: quick edits stop being dropped and
    status flips start stamping `resolved_date` (both what its docs already claim). Logged in
    `card-liveedit-shared-debounce-drops-saves.md`.

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
- [ ] **Open: the stage dropdown saves, but nothing else on the page reacts.** The progress bar ("STEP N OF 6") and
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

### Phases 4–7 — NOT STARTED

See README steps 5–8. Notes to carry in:
- **Configure (phase 5) is a qa tab in `/list`'s pattern editor, not a page in the install** (owner decisions
  above). Permissions use the existing Access tab.
- **Track-on-publish (phase 4):** one helper called from both publish paths, `patterns/page/pages/edit/editFunctions.jsx:158`
  and `cli/src/commands/page.js:289`, using the same "which install covers this sub-site" list as the widget.
- **Signed-out filing (phase 6):** that covering list must be readable signed out (signed-out visitors get stub
  pattern rows with settings stripped). A honeypot field ships with the form.
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
