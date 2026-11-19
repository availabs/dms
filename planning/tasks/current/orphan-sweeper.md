# Orphan sweeper: remove rows nothing can reach, with a dry run and an apply

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** —

Follows [safe-delete-removes-rows.md](../completed/safe-delete-removes-rows.md), which stopped new orphans and
left the backlog ("Backlog cleanup of existing orphans: not doing", 2026-11-16). The owner reversed that on
2026-11-17: the backlog goes.

## Objective

One script, `dms-server/src/scripts/sweep-orphans.js`, that finds every row nothing in the database can reach,
prints a dry run with numbers, and deletes them only with `--apply`. Its logic lives in a module the server can
also call, so a later admin tab can show the same numbers and run the same sweep (Phase 2).

## Why a new script (analysis of 2026-11-17, local prod copy `prod_check_1117`, read-only)

`cleanup-db.js` flags 225,539 rows on prod. Two of its bugs would delete live data:

- **Page history.** It reads `data.history` as an array. Pages now store one ref (`{id, ref}`; 4,138 of
  mitigat-ny-prod's pages), so 1,871 of the 1,873 history rows it flags on mitigat-ny-prod are live.
- **Cross-app delete.** Without `--app` it deletes each kind's ids from the first app's table
  (`orphans[0].app`). Per-app tables have their own id sequences and ids repeat (2060620 is a mitigat-ny-prod
  page and an asm component), so it can delete a live row of the first app and misses every other app's.

It also only knows the legacy source/view types, deletes a pattern row without its pages, never takes the
sections of a page it would remove, and writes no backup. `delete-orphan-pages.js` needs the `parent_id`
column from `migrate-row-auth.js` (not on prod) and crashes. The datasets side is covered by
`prune-unlisted-views.js` and `prune-unreachable-tables.js` (both work; out of scope here).

Measured on mitigat-ny-prod:

| Category | Rows | Size |
|---|---|---|
| Sections no page lists | 190,639 | 933 MB |
| Pages under no pattern (25 instances) | 1,829 | — |
| Sections those pages hold | 90,704 | 1.1 GB |
| Unlisted patterns (whole prod copy, 10 apps, mostly test apps) | 46 | — |
| Junk `dms_*` schemas (empty, mangled app+type names, test runs) | ~90 | — |

## Owner decisions (2026-11-17)

- **No change_log entries** for the sweep, none at all (2026-11-18; the 11-17 draft logged one `D` per duplicate
  pattern row, removed). Open clients keep stale copies until they reload.
- **Pattern-less pages go** when no pattern, site or app uses them.
- **Unlisted patterns go** (with what they own) when nothing anywhere in the database uses them.
- **Junk schemas are listed, and the owner is asked**, before any is dropped.
- Dry run with numbers by default; `--apply` deletes.
- **Symbologies are not swept by default** (2026-11-18): "symbologies are like sources. even if nothing
  references them they may be useful." Deleting them is a deliberate choice, offered as its own option on the
  UI page. Implemented generically: only page-content kinds (what the formats' childRefs name) are swept by
  default; any other kind is held, and the opt-in category `other_kinds` takes them.

## Rules (what counts as unreachable)

Per app, against the app's table (`resolveTable`), on Postgres and SQLite. Ids are compared as strings.
A row is a **referrer** of an id when any JSON value in its `data`, at any depth and under any key, equals that
id (number or numeric string). Rows that are themselves being deleted don't count.

1. **Unlisted sections**: `%|component` and `%|cms-section` rows that no row of the app lists in
   `sections` / `draft_sections` (plain ids, `{id}`, `{$type:'ref', value}`).
2. **Unreferenced history**: `%|page-edit` rows no page names in `history` (single ref or array).
3. **Pattern-less pages**: `{inst}|page` rows where no pattern row of the app has instance `inst` (new
   `{site}|{inst}:pattern`, or a legacy `|pattern` row's `doc_type`). Every row under the dead container goes
   with them (`{inst}|component`, `{inst}|page-edit`, `{inst}|template`; never a container kind), plus the
   sections they list that no surviving page lists. **Blocked** (kept, and named in the dry run) when any row
   anywhere in the database, outside the set, refers to one of the pages, or a surviving page names one as
   `data.parent`.
4. **Unlisted patterns**: `:pattern` rows no row of the app lists in `patterns`. Two cases:
   - *duplicate*: another pattern row with the same instance is listed. Only the row goes (with its `D`); the
     pages belong to the listed twin.
   - *alone*: no listed twin. The row goes with everything under its container, as `ownerDelete.js` does
     (never container kinds; a dmsEnv is kept and reported).
   **Blocked** when any row anywhere in the database, outside the set, refers to the pattern or to one of its
   pages.
5. **Junk schemas** (Postgres per-app only): `dms_*` schemas other than `dms` whose name is not the sanitized
   app of any row inside, or that hold no rows, or that a test run made (`_test_<13 digits>`). Listed with
   tables, rows, size and the apps inside. Dropped only when named: `--drop-schemas a,b`.

Guards: rows created or updated within `--min-age` (default 24h) are kept (a section saved just before its
page). The whole-database reference scan covers every `data_items*` table in every schema (split tables
included: a Tickets dataset stores page ids).

## Apply

- Recomputes the plan, refuses when `--expect` counts are given and differ (the route uses this).
- Writes a gzipped NDJSON backup of every row it will delete first, streamed in batches (a 1 GB JSON string
  doesn't fit in one Node string), to `DMS_DELETE_BACKUP_DIR` (`var/delete-backups`, as the safe delete).
  No backup, no delete.
- One transaction per app; deletes in batches.
- No change_log entries.
- Opens the adapters directly (no `getDb`): the server's init runs DDL migrations, so a dry run through it
  writes to the database.
- Not touched: `yjs_states` (F14, waits for
  [sync-rooms-cross-app-item-id-collision.md](./sync-rooms-cross-app-item-id-collision.md)), uploaded files,
  split tables and source/view rows (the two prune scripts).

## Phase 2: in the admin UI (mockup first)

Proposed, to confirm with a mockup before code:

- **Pattern editor → "Storage" tab** (page patterns): a usage bar like a phone's storage screen. Pages,
  sections, history, templates, with counts and sizes, and the flagged groups for this pattern (unlisted
  sections, unreferenced history) under it, each with what it is and a **Clean up** button. The button calls
  a read-only plan route, shows the plan's numbers, then calls the apply route with `expect`.
- **Site admin → "Storage" page**: the whole app. Pattern-less pages and unlisted patterns can't show on a
  pattern's tab (they have no pattern), so they live here, with blocked items and what blocks them.
- **Junk schemas stay CLI-only**: they are server-wide, not a site's.
- Routes, as `ownerDeleteHttp.js`: `POST /dms/:app/sweep/plan` (read-only, `{ pattern? }`) and
  `POST /dms/:app/sweep` (`{ pattern?, expect }`), gated by a site-level verb.

## Files

- `packages/dms-server/src/db/orphanSweep.js`: plan + apply (new)
- `packages/dms-server/src/scripts/sweep-orphans.js`: CLI (new)
- `packages/dms-server/tests/test-orphan-sweep.js`: SQLite fixture test (new); `package.json` script
- `packages/dms-server/src/scripts/README.md`: entry; mark `cleanup-db.js --delete` unsafe
- Phase 2: routes in `routes/dms/`, `patternEditor/pages/storageTab.jsx`, a site Storage page, mockups

## Checklist

**Phase 1: script**
- [x] Module + CLI: dry run, `--apply`, `--app`, `--only`, `--min-age`, `--expect`, `--drop-schemas`, `--json`
      (2026-11-17: `routes/dms/orphanSweep.js`, `scripts/sweep-orphans.js`; README entry; `cleanup-db.js`
      marked unsafe there, and `copy-db.js --skip-orphans`, which uses its detectors, drops live history too)
- [x] Test on SQLite (`tests/test-orphan-sweep.js`, 8/8, in `npm test`): each category found; live rows kept
      (single-ref history, shared sections, recent rows, referenced dead page, listed twin, another app's bare
      id); apply deletes exactly the plan; backup written; change_log only the duplicate `D`; a row listed again
      after the plan is kept; `--expect` mismatch refuses; no childRefs / no `patterns` list → not judged
- [x] Dry run on `prod_check_1117` (read-only connection), all apps, 5.5 min (the database-wide scan is most of
      it; mitigat-ny-prod's main table ~160 s):

      | App | unlisted children | dead containers | unlisted patterns | rows | size |
      |---|---|---|---|---|---|
      | mitigat-ny-prod | 281,345 | 1,829 | 1 (duplicate) | 283,175 | 2.17 GB |
      | npmrdsv5 | 20,531 | 491 | 19 (5 duplicates) | 21,041 | 166 MB |
      | wcdb | 5,431 | 0 | 2 (1 duplicate) | 5,433 | 7.7 MB |
      | shaun-test-app | 1,057 | 968 | 16 | 2,041 | 1.6 MB |
      | 13 others | | | | 3,025 | |
      | **total** | 311,381 | 3,289 | 45 | 314,715 | 2.35 GB |

      Kept, still referenced: npmrdsv5 57 map symbologies (pattern `map_editor_test` gone, live sections use
      them); shaun-test-app 3 (a dataset names them). Junk schemas listed: 107 (90+ empty, 6 test runs with rows).
      Found while building: a database-wide search must not count a bare number (`index: 5`) or another app's
      same-numbered row (ids are per app); both are handled and tested.
      Pre-existing, not the sweep's: 2,226 of mitigat-ny-prod's 4,224 page `history` refs name no row.
- [x] Apply on a scratch copy of `prod_check_1117` (`sweep_scratch_1117`, `CREATE DATABASE … TEMPLATE`):
      10.5 min, 314,710 rows deleted, 11 change_log `D`s (the duplicate pattern rows; since removed), backup
      1.25 GB gzipped. Fresh dry run plans 0. Dangling refs (ids in `sections` / `draft_sections` / `history` /
      `patterns` naming no row) per app: **none added** anywhere; mitigat-ny-prod's history ones fell
      2,226 → 1,237 (the pages holding them went).
      - The first scratch apply added 5 dangling `draft_sections` on npmrdsv5: legacy page 2184453 (type = a
        bare UUID) lists `sandbox2|component` rows, and the list rule only read rows whose kind is `page`. Fixed:
        any live row's declared list attribute keeps what it names, whatever the row's kind (regression case in
        the test). Second apply from a fresh copy: clean.
- [x] Site loads against the swept copy (2026-11-18, mitigat-ny-prod only). Scratch dms-servers on
      `sweep_scratch_1117` (swept) and `sweep_base_1117` (fresh unswept copy of the same snapshot), scratch admin,
      non-local requests blocked. API: every page of all 75 readable page patterns dumped with `dms page dump
      --sections` from both: 3,397 pages, 229,409 sections, all byte-identical, same page lists, no errors.
      Browser: 14 pages (main site, guide, playground, Chenango, Westchester) render the same text and titles.
      Not covered: DAMA-backed sections (no dama config on either side); the editor.
      npmrdsv5 (16 patterns, 424 pages, 6,466 sections) and wcdb (2 patterns, 16 pages, 358 sections): also
      byte-identical, same page lists, no errors.
- [x] **Bug found by a deep re-check, fixed (2026-11-18).** Every surviving row of the three apps, parsed
      deeply (JSON inside strings too), for ids of deleted rows under reference-shaped keys: wcdb none;
      npmrdsv5 65 live map sections still named 46 deleted `map_editor_test|symbology` rows, all inside
      `element.element-data`, which sections store as JSON *text*: `valuesIn` saw a string and never looked
      inside. (Harmless to viewers: a map section embeds a full copy of each symbology; the rows only feed the
      editor's picker / Refresh, and their pattern is gone. Still a break of the rule.) Fix: `valuesIn` parses a
      string that starts with `{` / `[` and walks it. Regression rows 400 (kept, named only inside
      element-data) / 401 (deleted) in the test; the test fails without the fix, 8/8 with it.
      Fixed dry run on a fresh unswept copy (`sweep_base_1117`, read-only): mitigat-ny-prod 282,574 (was
      283,175), npmrdsv5 20,992 (was 21,036; kept symbologies 57 → 101), wcdb 5,433; total for the three
      308,999 rows, 2.31 GB. The 35 newly kept mitigat-ny-prod pages (shmpcopy, county_data_site, plus what they
      list) are false matches: a `bild` section's cached rows have `building_id: "1003315"`, a shmpcopy
      section's have `event_id: 981862`. Left conservative on purpose (keeps ~600 junk rows, deletes nothing
      live); the dry run names each kept row and its referrer.
      Also seen, not acted on: 22 live mitigat-ny-prod components carry another (deleted) component's id in
      their own `data.id` (copies made by an old clone), and cached rows inside sections name numbers that
      equal deleted component ids. Children are judged by lists, not the scan, and nothing loads by these.
- [x] **Other kinds opt-in (2026-11-18, owner).** `computeCandidates` takes `takeOtherKinds`. Default: a
      non-page-content row under a dead container is `held` (reported, with the type and reason), and an
      `alone` unlisted pattern that still holds such rows is kept with them (so they stay reachable in its
      editor). `--only …,other_kinds` takes both; they then face the database-wide reference scan like pages.
      CLI prints "held, not page content". Test 9/9 (new case: held by default; opted in, 401 / 410 / pattern
      13 go and 400, named inside element-data, is kept). Phase 2 UI: a separate, deliberate option.
- [x] Owner: which junk schemas to drop. 2026-11-18: drop those with no tables or only an empty `data_items`
      (97 of 107 on the 11-17 copy). SQL script re-checks each schema when it runs, drops `data_items` +
      its standalone `data_items_id_seq` + the schema, no CASCADE; tested on `sweep_scratch_1117` (97 dropped,
      re-run drops 0, real apps untouched). **Run on prod `dms3` 2026-11-18**: the prod list matched the copy's
      exactly; `dropped 97, skipped 0`; 133 → 36 `dms_` schemas. Script + log in
      `~/dms-backups/prod-sweep-20261118/` (`drop-empty-schemas.sql`, `drop-schemas.log`). Left: 6 test-run schemas with rows, 3 empty test-run schemas with an extra `formats`
      table, `dms_npmrdsv5sitemgmt_tickets` (empty + empty split table), `dms_tny` (empty + empty `formats`).
      Test runs wrote them because `dms-sqlite` (the tests' default `DMS_TEST_DB`) points at prod `dms3`.
- [x] Run on prod (owner: "run prod sweep", 2026-11-18). Read-only dry run on `dms3` (72 min): 314,363 rows,
      2.32 GB (unlisted_children 311,445, dead_containers 2,880, unlisted_patterns 38), 19 apps; the 11-17 copy
      planned 313,768. Held: npmrdsv5 3 map_editor_test patterns (257 symbologies) + 5 cms-section rows;
      shaun-test-app 5 patterns (page_template). **Applied 2026-11-18** with `--expect` from those counts
      (103 min): deleted 314,363 rows, matching the dry run exactly (mitigat-ny-prod 282,655, npmrdsv5 20,855,
      wcdb 5,433, 16 smaller apps). Backup `~/dms-backups/prod-sweep-20261118/sweep-orphans-2026-11-19T00-32-39-714Z.ndjson.gz`
      (1.2 GB, 314,363 rows + header); log `apply.txt`. Checked: fresh read-only dry run plans 0 rows (`verify-dry-run.txt`, 344s vs 72 min before).

**Phase 2: UI**
- [x] Mockups made 2026-11-18, **confirmed by the owner 2026-11-18** ("mockups look good, build them"): `design_system_v6/pages/admin-pattern-storage.html`
      (MitigateNY_2025: usage bar, kinds with counts and sizes, Clean up list, two-step dialog with a "counts
      changed" state) and `admin-site-storage.html` (mitigat-ny-prod: usage bar, pages with no pattern with the
      former-pattern list, unused sections, extra pattern copies, Clean up all, by-pattern table). Real numbers
      from the 11-17 prod copy except the 24 h counts. Registered in `ds-nav.js`. Checked 1280 light, dialog in
      dark, 390 (no horizontal scroll). SideNav storage items added to the other admin mockups 2026-11-18 (17
      pages + the user-menu page; `HardDrive` registered in `theme/icons.js`). Wording mirrored from the build.
      2026-11-18 (owner: symbologies a deliberate choice): site page gains **"Kept until you choose"**, below
      Clean up and outside Clean up all: "Map styles in unused patterns" (257 · 3 patterns) and "Other rows with
      no pattern" (5 old sections), each with its own Delete button and a Delete → Confirm delete dialog
      (sends `only: ['other_kinds']`). npmrdsv5's numbers (mitigat-ny-prod has none); shown only when any.
      Checked 1280 light / dark, 390, dialog.
- [x] Plan/apply routes, tab, page (2026-11-18)
  - Server: `routes/dms/storageHttp.js` — `POST /dms/:app/storage/plan` (read-only) and `/storage/clean`
    (`expect` required, 409 when the counts moved; no preview flag), each a job polled at
    `GET /dms/:app/storage/jobs/:job` (a plan on a big site outlasts a proxy's wait). Gate: site-level
    `manage-storage` (new verb in the admin site vocabulary; `*` / `<app> Admin` pass). Controller
    `planStorage` / `cleanStorage` (strip ids, add `expect`, `childRefs`; clear caches + auth snapshots after).
  - `orphanSweep.js`: `parents` / `kinds` scope, per-group `bytes`, `recentKept`, `usage` by type; a held
    pattern now goes WITH its rows under `other_kinds` (was `unlisted_patterns`, which `only: [other_kinds]`
    would have left behind). Fix: the scan reads only `data_items*` tables that have `app`, `type` and
    `data` (a SQLite history table broke it).
  - Client: `api` `dmsStoragePlan` / `dmsStorageClean` (poll 3 s); `components/storage.{jsx,theme.js}`,
    `storageUtils.js`; `pages/siteStorage.jsx` (route `storage`, SideNav "Storage") and
    `patternEditor/pages/storageTab.jsx` (every pattern; SideNav and tab gated on site `manage-storage`).
    Live icon `HardDrive` added (ui/icons).
  - Site page groups by container, not category: a gone pattern's sections are planned as unlisted children
    once its page is, so "Pages with no pattern" = everything under a container no pattern row is (its clean
    sends `parents` + both categories); "Unused sections" = live patterns' only.
  - Deviation from the mockup: held rows are named by kind ("Rows in unused patterns · 2 symbology rows"), not
    "Map styles", since the core has no type names; the pattern nav has no size badge (a plan per nav render
    costs too much).
  - Tests: `test-orphan-sweep.js` 10/10 (new: parents/kinds scope, held pattern in other_kinds),
    `test-storage-routes.js` 6/6 (auth, scope, 400/409, clean one pattern, clean all), owner-delete 14/14,
    formats 12/12. Postgres: plan on the local 11-17 copy (`sweep-base-1117`, wcdb, read-only) 49 s.
  - Live (rig :3458/:5197, seeded orphans): site page + pattern tab light/dark/390; pattern Clean up deleted
    3 then 1 (backups written); "Delete them" took the held pattern + 2 symbologies; Clean up all took 5; a row
    added between plan and confirm → "Counts changed since you opened this" (409, nothing deleted); a viewer
    gets no nav item, is sent home, and no plan request is made.
- [ ] Register the site vocabulary on prod (`register-formats.js`) so `manage-storage` can be granted; until
      then only `*` / `<app> Admin` see the pages
- [ ] Deploy (server + sites), then a plan on mitigat-ny-prod from the page
