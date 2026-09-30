# `qa` pattern type: ticketing / delivery QA as a library feature

**Initiatives:** [dms_qa_ticketing](../../../../../planning/initiatives/dms_qa_ticketing.md) (primary), [tny_control_room_qa](../../../../../planning/initiatives/tny_control_room_qa.md) · **Status:** doing · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Phase 1 DONE and live-verified on `qa_test` (2026-09-30); phase 2 not started. Changes stay **uncommitted** (owner).

**Design and decisions:** `research/qa-ticketing-system/README.md` (plan v4) and `feature-roadmap.md`, both in the
dms-template repo root. This file is the implementation plan and the source of truth for build status. The code
seam is traced in `research/qa-ticketing-system/pattern-type-feasibility.md`.

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
    `/betapage`, admin-only). Added by the phase 1 live check (2026-09-30): `QA` (38, `/qa`) and `QA2` (39,
    `/qa2`), both `pattern_type: 'qa'`; delete them from the Sites table to reset. AlphaPage has 2 pages, BetaPage has 2 plus 2 children under `page_1`
    (`page_1/child_chart`, `page_1/dup_no_chart`). All 7 pages are published (`published: ''`).
  - AlphaPage/BetaPage store `authPermissions` in the per-subdomain format `{"*": "<json>"}`, Pages in the flat
    format. Both are read by `render/spa/utils/index.js:39, 56`; qa code must resolve permissions through that
    path, never parse the flat shape directly.
  - The app has its own id sequence (rows 1–37) and schema `dms_qa_test`.
  - CLI access: the dev account is in `qa_test Admin`; mint with the dev mint script, `project: "qa_test"`.
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
- **Leave all changes uncommitted.**

## Build order (phases)

The README numbers the core as steps 2–7. The build order differs in one place: **the ticket record and the
install hook (README steps 3–4) come before the page conversions**, because the converted pages bind to datasets
that have to exist first.

| Phase | README step | What | Status |
|---|---|---|---|
| 1 | 2 (part) | Skeleton type: registration, admin-style code pages, no edit route | DONE 2026-09-30 |
| 2 | 3 + 4 | Ticket record + install hook: schemas in code, datasets created per install, refs on the pattern row | NOT STARTED |
| 3 | 2 (rest) | The four control-room pages as code, bound to the install's datasets; switches; theme-added pages | NOT STARTED |
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

### Phase 2: Ticket record + install hook — NOT STARTED (outline)

- **Schemas in code** (`patterns/qa/schema/`): tickets, pages, stories, tracked patterns, change history. Column
  names, types and value lists copied exactly from TransportNY's `sitemgmt_*` sources' `config.attributes`
  (read them before writing), plus additive columns: `outcome`, `reporter_name`, `reporter_email`, `legacy_id`.
- **Status kinds, default statuses and outcomes are constants in `patterns/qa/`** (owner, 2026-09-29), the same
  for every install. The DB holds only each ticket's value. The install/upgrade step writes the column options on
  the source row from these constants, so the datasets admin and CLI see the same lists; code stays the source of
  truth. Per-install renamed statuses (a new-features item) would live in the install's settings, still mapped to
  the fixed kinds in code.
- **Status kinds:** triage, active, waiting, done, canceled. TransportNY's seven statuses are the default list,
  each mapped to a kind.
- **Outcomes:** fixed, workaround, backlog, feature request, out of scope, duplicate, won't fix.
- **Change history dataset:** ticket, field, old value, new value, who, when. Written by the controls, the CLI
  and the runbook through one module.
- **Install hook** (`patterns/qa/install.js`), called after the pattern row is created, from one shared helper
  used by both `addNewValue` copies:
  - refuse a URL another pattern already uses;
  - create a dmsEnv owned by the install and the datasets for the ticked switches, under `<instance>_<name>`
    slugs; refuse any slug that already exists in the app (`type LIKE '%|<slug>:source'`);
  - store `qa.datasets = {tickets: {slug, source_id, view_id}, …}` and `qa.switches` on the pattern row;
  - reuse `tenantProvisioning.js:171-233` / `sourceCreate.jsx:34-79`.
- **Integrity check at load:** the newest source for each stored slug is still the stored `source_id`.

### Phase 3: The control-room pages as code — NOT STARTED (outline)

- Port `src/themes/transportny/qa_skills/tools/builds/build_cr_{overview,tickets,page,design}.mjs` into
  `patterns/qa/pages/*.js` as `(install) => page`. Same native Card / Spreadsheet / Filter / Graph / lexical
  configs; `externalSource` built from `qa.datasets`; `SITE_LABELS`, pill colours and labels from install
  settings; `randomUUID()` group names → constants.
- Switches gate pages and sections; nav follows.
- Theme-added pages: merge `theme.qa.pages` (code, never DB). TransportNY's Design page moves there in phase 8.

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
