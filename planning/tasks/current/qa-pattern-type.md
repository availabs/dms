# `qa` pattern type: ticketing / delivery QA as a library feature

**Status:** PLANNED. Phase 1 plan revised after owner review (2026-09-29); not started. Nothing built. Changes
stay **uncommitted** (owner). Next session: start phase 1 on an explicit go-ahead.

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
    `/betapage`, admin-only). AlphaPage has 2 pages, BetaPage has 2 plus 2 children under `page_1`
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
    id this is `undefined == undefined` → true, so id-less pages would all match. Phase 1 fixes the matcher
    instead of giving code pages ids (owner decision 2026-09-29).
  - Visit tracking skips `!item?.id` (`patterns/page/pages/view.jsx:42`).
  - Add Pattern: `AddPatternPicker.jsx` (`NON_PAGE_OPTIONS`, `TAG_CLASS_KEY`, `getDefaultName`, `onAdd` sends
    `pattern_type: selected.kind`); two `addNewValue` copies create the row: `editSite.jsx:334-376` and
    `components/patternList.jsx:220` (lazy-loaded by `admin.format.js:9` for the Edit modal).
  - Pills: `editSite.jsx:133` (`TYPE_PILL_KEY`), `:142` (`TYPE_ORDER`).

## Owner decisions (2026-09-29 review)

- **No invented ids for code pages.** Fix the matcher instead (phase 1). Nothing else in the library invents ids
  for non-rows.
- **QA pages don't count toward page-visit analytics.** Falls out of the matcher fix; no view.jsx change.
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
| 1 | 2 (part) | Skeleton type: registration, code pages through `preload`, no edit route | NOT STARTED |
| 2 | 3 + 4 | Ticket record + install hook: schemas in code, datasets created per install, refs on the pattern row | NOT STARTED |
| 3 | 2 (rest) | The four control-room pages as code, bound to the install's datasets; switches; theme-added pages | NOT STARTED |
| 4 | 5 | Derived values without a sync, incl. track-on-publish | NOT STARTED |
| 5 | 6 | Configure page | NOT STARTED |
| 6 | 7 | Widget (signed out too) + `dms qa` CLI | NOT STARTED |
| 7 | 8 | Rehearsal: copy TransportNY's QA data into an install on `qa_test` | NOT STARTED |
| 8 | 9 | TransportNY port (own task under `planning/transportny/`) | NOT STARTED |

Phases 2–7 are outlined below and get their detailed plan written here before each starts.

---

### Phase 1: Skeleton type — NOT STARTED

**Goal:** Add Pattern → "Ticketing / QA" creates a pattern row whose URL renders pages defined in code, with no
editor. It proves the seam end to end before any real page is converted.

**New files**
- `patterns/qa/siteConfig.jsx`
  ```js
  import pageConfig from '../page/siteConfig'
  import { buildQaPages } from './pages'
  const qaConfig = (props) => {
    const cfg = pageConfig[0](props)          // theme, contexts, route auth, format: reused as-is
    const [shell] = cfg.children
    return {
      ...cfg,
      // Code pages replace the DB rows. Fresh array per call: format.defaultSort and nav sort in place.
      preload: (falcor, _rows, request, params) =>
        cfg.preload(falcor, buildQaPages(props.pattern), request, params),
      children: [{ ...shell, children: shell.children.filter(c => c.action === 'view') }],
    }
  }
  export default [qaConfig]
  ```
  - The loader still queries `<instance>|page` rows before `preload` discards them: one small empty request per
    navigation on a new instance. Accepted for now; the datasets pattern's `stopFullDataLoad` filter
    (`patterns/datasets/siteConfig.jsx:111-115`) is the follow-up if it shows up in timings.
- `patterns/qa/pages/index.js` — `buildQaPages(pattern) → page[]`.
  - Phase 1 returns one placeholder page ("Tickets", `url_slug: ''`, `index: 0`) with one inline lexical section,
    plus one hidden detail page to prove slug matching.
  - Every page: **no `id`** (code pages are never DB rows; see the matcher edit below); fixed
    `section_groups[].name`; fixed `trackingId` per section; `published` absent (nav treats `'draft'` as hidden).
  - **Design note (2026-09-29):** the first draft gave code pages fixed negative ids. Dropped at the owner's
    review: nothing else in the library invents ids for non-rows, and the only reason for them was the matcher.
- `patterns/qa/constants.js` — group names and tracking ids (one place, so they never drift).

**Edits**
- `patterns/index.js` — `qa: qaConfig`.
- `dms-manager/_utils.jsx:98` — only match on id when the URL has one:
  `if (params['id'] != null && params['id'] == data['id']) return true`.
  - Safe for existing patterns: every DB item has an id, so `params.id == data.id` with a defined `data.id`
    behaves exactly as before; only id-less items change, and only code pages are id-less.
  - At build time: grep every caller of `filterParams` / the matcher and cite it here, and check that nothing
    else keys on page `id` (nav list keys, `findPageItem`, `defaultSort`).
  - **Visits:** no view.jsx change. Visit tracking already skips `!item?.id` (`patterns/page/pages/view.jsx:42`),
    so code pages don't count toward page-visit analytics automatically.
- `patterns/admin/components/AddPatternPicker.jsx` — a `{kind: 'qa', label: 'Ticketing / QA', desc: …}` option,
  `TAG_CLASS_KEY.qa`, default name "QA". `AddPatternPicker.theme.js` — a `tagQa` class.
- `patterns/admin/pages/editSite.jsx:133, 142` + `editSite.theme.js` — `qa` pill and sort order.
- `patterns/admin/admin.format.js:70-80` — `qa` option in the Edit modal's `pattern_type` select.
- Duplicate: hide/disable for `pattern_type === 'qa'` in the three duplicate paths (`editSite.jsx` duplicate
  buttons, `patternList.jsx`, `patternEditor/default/settings.jsx`), since each copies a fixed field list and would
  drop the `qa` settings. Exact lines to re-locate at build time (research cited `editSite.jsx:283-293, 579-589`;
  `patternList.jsx:431-441`; `settings.jsx:203-215`).

**Not in phase 1:** datasets, settings/switches, Configure, any real page.

**Tests (vitest, `import { describe, it, expect } from 'vitest'`)**
- `buildQaPages` returns a fresh array each call; group names and tracking ids stable across calls; no page
  carries an `id`.
- Matcher: an id-less item doesn't match when `params.id` is absent; a DB item still matches on `params.id`.
- `qaConfig(props)` has no child route with `action: 'edit'`; its `preload` returns the code pages whatever rows
  it's given.

**Live check on `qa_test`** (Vite on `qa_test`, owner's dms-server)
- Add Pattern → Ticketing / QA, name "QA", URL `qa` → row `qa_test|qa:pattern` created, pill shows `qa`.
- `/qa` renders the placeholder page with the site theme; the detail page resolves by slug; nav lists only the
  visible page.
- `/qa/edit` shows no editor.
- No `/track/visit` request for code pages.
- AlphaPage/BetaPage and the admin render exactly as before.

**Backward compatibility:** every edit is additive (a new registry key, a new picker card, a new pill) except the
matcher line, which changes behavior only for items with no id. The page pattern's own config is called, not
changed.

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
- **Track-on-publish (phase 4):** one helper called from both publish paths, `patterns/page/pages/edit/editFunctions.jsx:158`
  and `cli/src/commands/page.js:289`, using the same "which install covers this sub-site" list as the widget.
- **Signed-out filing (phase 6):** that covering list must be readable signed out (signed-out visitors get stub
  pattern rows with settings stripped). A honeypot field ships with the form.
- **Rehearsal (phase 7):** copy through the CLI with new ids; keep old ids in `legacy_id`; rewrite the 19
  `duplicate_of` links from an old → new map; seed change history from existing dates.

## Files requiring changes (phase 1)

| File | Change |
|---|---|
| `patterns/qa/siteConfig.jsx` | new |
| `patterns/qa/pages/index.js` | new |
| `patterns/qa/constants.js` | new |
| `patterns/qa/*.test.js` | new |
| `patterns/index.js` | register `qa` |
| `dms-manager/_utils.jsx` | matcher: compare ids only when the URL has one |
| `patterns/admin/components/AddPatternPicker.jsx` + `.theme.js` | qa card + tag |
| `patterns/admin/pages/editSite.jsx` + `.theme.js` | qa pill, sort order, duplicate disabled |
| `patterns/admin/components/patternList.jsx` | duplicate disabled |
| `patterns/admin/pages/patternEditor/default/settings.jsx` | duplicate disabled |
| `patterns/admin/admin.format.js` | `qa` pattern_type option |

## Testing checklist (phase 1)

- [ ] vitest: `buildQaPages` stability + freshness, no ids
- [ ] vitest: matcher ignores id-less items when the URL has no id; DB items unchanged
- [ ] grep: every matcher caller listed, none relies on `undefined == undefined`
- [ ] vitest: `qaConfig` drops the edit route, preload returns code pages
- [ ] live: Add Pattern creates a `qa` row on `qa_test`
- [ ] live: `/qa` renders, detail page resolves by slug, nav correct
- [ ] live: no editor at `/qa/edit`
- [ ] live: no visit tracking for code pages
- [ ] live: AlphaPage/BetaPage/admin unchanged
