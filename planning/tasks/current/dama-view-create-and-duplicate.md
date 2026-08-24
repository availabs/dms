# Create / duplicate a DAMA source version (and the WCDB schedule version picker)

## Objective

Give an external (DAMA) dataset a way to gain a **new version** without an upload —
blank, or a row-for-row duplicate of an existing version — and consume it from the
WCDB admin schedule page so a programme director can draft next semester's week
without touching the one that is on the air.

## Why the capability did not exist

`createDamaView` (`dama/upload/metadata.js`) registers a `data_manager.views` row and
names its table, but **nothing creates the table**. Every caller is an ETL worker that
builds the table as a side effect of ingesting a file (`csv-publish`, `gis-publish`,
`file-upload-route`). So versions could only ever be born from an upload; there was no
"give me another version of what I already have".

`uda.route.js` had `viewsById.clearData` and the three `data.*` row verbs, but no
`views.create`. The client had no falcor path to reach one either.

## Design decision: versions are VIEWS, not a `version` column

The alternative was a `version` column on the one schedule table, with the picker as a
filter. Rejected:

- **Publishing.** The grid's Publish action repoints the public site at a version. With
  views that is one field on the public section (`externalSource.view_id`) and the public
  query is untouched. With a column, every public schedule query grows a version
  predicate and publishing means editing a filter.
- **Isolation.** A half-finished draft in its own table cannot leak onto the public site.
  In a shared table it is one missing predicate away.
- **It is the platform's own concept.** `getViews` already enumerates versions and the
  dataWrapper's source panel already lets an author pick one. This adds the missing
  verb, not a new concept.

The new table is always cloned from an existing view's table, never built from
`metadata.columns` — the physical table is the only place the real schema lives (types,
NOT NULLs, the PK and its indexes), and `metadata.columns` demonstrably drifts from it
(see `scripts/wcdb-admin/add-shows-image-column.mjs`).

## Changes

### Server — `packages/dms-server`
- [x] `dama/upload/metadata.js` — new `cloneViewTable(db, {fromSchema, fromTable, toSchema, toTable, withData})`.
      `LIKE … INCLUDING ALL` copies types/NOT NULLs/defaults/indexes/constraints and lets
      Postgres auto-rename the copied PK so it cannot collide. The one thing INCLUDING ALL
      gets wrong is SERIAL: it copies `nextval('…source_table_seq')` verbatim, so the clone
      would share the source's sequence and silently depend on it. Every sequence-backed
      default is rewired to a fresh `OWNED BY` sequence, and on a data copy each is
      `setval`'d past the copied rows (else the first insert collides on the PK).
- [x] `routes/uda/uda.controller.js` — `createSourceView(env, {source_id, version, copy_from_view_id, user_id})`.
      External+Postgres only. Template = the named view when copying, otherwise the source's
      newest view. Names the version (defaults to the new `view_id`). **Deletes the view row
      if table creation fails** — a view with no table shows up in every version list and
      fails on read, which is worse than no view at all.
- [x] `routes/uda/uda.route.js` — `uda.views.create` call route. Requires a user and
      `update-source` on the source (adding a version modifies the dataset). Invalidates
      `sources.byId[id].views` so the picker sees the new version.

### Client — `packages/dms`
- [x] `api/index.js` — `udaListViews(falcor, {env, source_id})` and
      `udaCreateView(falcor, {env, source_id, version, copy_from_view_id})`. Falcor stays in
      the api layer (CLAUDE.md); the two-step length-then-byIndex fetch mirrors
      `useDataSource#getViews`.
- [x] `patterns/page/components/sections/section.theme.jsx` — `topBarButtonsEdit` /
      `topBarButtonsView` raised from `z-10` to `z-40` (and `menuPosition` given `z-40`).
      **Real bug, all section types:** any section content that raises itself (a sticky
      toolbar, a pinned header) painted over the Settings menu and made the section
      uneditable.
      **First fix was wrong** — I raised only `menuPosition`, the child, and the menu was
      still buried. `topBarButtonsEdit` is a flex item of `topBar: 'flex'`, and z-index
      applies to a flex item even at `position: static`, so it was creating a STACKING
      CONTEXT at layer 10 that the menu could not escape however high its own z-index.
      The context has to move, not its contents. Below `sectionGroup`'s `modalOverlay`
      (z-50) so a modal still wins.

### Theme — `src/themes/wcdb`
- [x] `ScheduleGrid.jsx` — version `<select>` in the bar, `New` / `Duplicate` buttons, and a
      `NameVersionDialog` (in-component, matching `PublishDialog`'s shell) that collects the
      name before creating.
- [x] `ScheduleGrid.theme.js` — selector + action + name-dialog keys; `versionBar` dropped
      from `z-30` to `z-10` (it only has to out-stack the grid rows it slides over).

### Switching versions is LOCAL state — deliberately
`switchVersion` writes `state.externalSource.view_id`. In view mode `setState` is a
`useImmer` setter that is never persisted, so picking a version is a per-session choice
that does not dirty the page and does not need page-edit rights. `view_id` is part of
dataWrapper's fetch key (`useDataLoader#computeFetchKey`), so setting it is all that is
needed to refetch. The version the section OPENS on stays its saved data binding.

## Verification

- [x] **Server, against the real `wcdb-dama` source 10** (`scratchpad/test-view-create.mjs`):
      blank version → 0 rows; duplicate → 69 rows; PK auto-renamed
      (`s10_v16_wcdb_schedule_pkey`, no collision); `ogc_fid` default points at a
      clone-owned sequence; `nextval` = 70 after copying 69 rows; editing the copy leaves
      the original untouched; the blank version accepts an insert. Both test views dropped.
- [x] **Falcor round-trip, the exact path the component takes** (`scratchpad/test-falcor-create.mjs`):
      real login → `createFalcorClient` with the bearer token → `udaCreateView` twice →
      `udaListViews`. Duplicate returned view 17 (69 rows), blank returned view 18 (0 rows),
      the list picked up both newest-first with the right `version` labels, and the
      `update-source` gate passed for an authLevel-10 user. Both views dropped after.
- [x] **UI renders** — selector with the bound version, `New`/`Duplicate` enabled, `v10`
      meta, no console errors.
- [x] **Against the DEPLOYED server** (2026-08-23, `scratchpad/test-deploy-create.mjs`):
      same round-trip on `https://dmsserver.availabs.org` — duplicate → view 19 (69 rows),
      blank → view 20 (0 rows), list correct. `wcdb-dama` is a shared remote DB
      (`auto.wcdb.fm`), so both views were dropped afterwards and source 10 verified back
      to its original single view / 69 rows.
- [ ] **Create clicked through the browser** (everything under the click is proven above).
      Blocked on ACCOUNT, not code: the `station_admin` pattern's `authPermissions` grant
      `*` to user 175 (`amuro@albany.edu`) and to the group `wcdb Admin` (id 394). The dev
      account `availabs@gmail.com` is user 1 / groups `["AVAIL"]`, so `no-access` is the
      correct answer for it — not a permission bug, not a deploy regression.
      Unblock by clicking it as `amuro@albany.edu`, or by adding user 1 to `wcdb Admin`
      (`users_in_groups` is keyed on `user_email` + `group_name`).

## Follow-on: the Show picker on the airing modals (2026-08-23)

The airing already stored the right thing — `show_id INTEGER` on
`s10_v10_wcdb_schedule`, joined by convention to `s9_v9_wcdb_shows.show_id`, no
denormalized show fields, 69/69 airings populated, 0 nulls, 0 orphans. What was wrong
was only the INPUT: the add modal asked for the integer as free text and the edit modal
showed it read-only.

- [x] **`useColumnOptions.js` — composite lookup labels.** `mapped_options` accepted a
      single `labelColumn`; now also `labelColumns: [...]` + `labelSeparator`
      (default ` · `), with blank parts dropped so there are no dangling separators.
      Backwards compatible — `labelColumn` still works.
- [x] **`add-schedule-airing-id-default.mjs` — `airing_id` gets a sequence.** It was
      `INTEGER NOT NULL` PRIMARY KEY with no default, so "Add to the schedule" could
      never insert. NOT `autoNumber`: `applyCreateDefaults` implements that as
      `max(…(data->>'<col>')…)`, a DMS split-table JSON probe, and `data` is not a
      column on an external Postgres table — it would silently never land. A DB default
      is also right for every other writer. `cloneViewTable` already rewires
      sequence-backed defaults per clone, so every schedule version gets its own.
      Verified: `createExternalRow` with no `airing_id` → 70; a clone of that table got
      its own sequence and inserted 71.
- [x] **Seed — `SHOW_PICKER` on both modals** (`type: 'select'` + `mapped_options`).
      Labels are `name · department · show_id`. Department alone was NOT enough: the
      legacy import left **102 shows literally named "Show Name"** and 10 named
      "Alternative Rock Music", so name-only leaves 166 of 651 shows ambiguous and
      name+department only gets that to 157. `show_id` takes it to 0. The placeholder
      shows are deliberately NOT filtered out — 2 live airings reference them, and a
      picker that hides the value its own row holds is worse than an ugly label.
      `notempty` on `name` drops the 54 genuinely nameless shows.
- [x] **Seed — pattern-readability guard.** See the incident below.

### Incident: the seed created 8 duplicate admin pages
Running the seed unauthenticated created a SECOND copy of every admin page (93 rows,
ids 1969152–1969244). Cause: the reuse check is "did `page list` return this slug?", and
`station_admin` is permissioned — an unauthorized caller gets the pattern as
`id: 'no-access'` with ZERO pages, which is indistinguishable from a first run. All 93
rows were backed up to `scratchpad/undo-dupes-backup.json` and deleted; no pre-existing
row had been modified (verified via `updated_at`), so the prior state was restored
exactly. The seed now aborts when the pattern comes back `no-access`, naming
`DMS_AUTH_TOKEN` as the fix.

Because of that guard the seed can no longer run from an unauthorized account, so the
two column definitions were applied in place to sections **1965763** (add) and
**1965765** (edit) — `scratchpad/patch-show-picker.mjs`, backup in
`scratchpad/show-picker-backup.json`. A later authorized seed run converges on the same
state.

- [ ] **Not yet browser-verified** — same account blocker as the version picker.
- [ ] **Data cleanup, not UI:** 102 shows named "Show Name", 10 "Alternative Rock
      Music", 54 with no name at all, out of 705. Worth a pass; two of them are on air.

## Follow-on: the Fall 2026 version, loaded from the season spreadsheet (2026-08-23)

`references/wcdb/WCDB SCHEDULE.xlsx` carries 30 season sheets back to 2019. The Fall 2026
sheet is a **DJ grid**: columns are days starting Sunday, rows are hours (row 2 = 12AM),
cells hold DJ on-air names (occasionally a show name), and a vertically merged cell is one
multi-hour airing whose duration lives ONLY in the merge list. 53 airings, 78 of 168 hours.

- [x] `scripts/wcdb-admin/parse-schedule-xlsx.py` — season sheet → airings JSON. stdlib
      zipfile + ElementTree; openpyxl is not installed here.
- [x] `scripts/wcdb-admin/load-fall-2026-schedule.mjs` — resolves labels to `show_id`,
      then creates a blank version through the same `createSourceView` the grid's "New"
      button calls and inserts the airings.
- [x] **Loaded as view 22, version "Fall 2026"** — 42 airings, 40 distinct shows, 0
      orphaned show_ids, no overlapping airings on any day. View 10 untouched.

### Rule ORDER is load-bearing
The sheet gives DJ names; the schedule stores show_ids; both reference datasets are full
of legacy duplicates. Firing the rules in the wrong order produces confident nonsense:

1. exact show-name match
2. DJ match — **strict `on_air_name` first**. The "DJ " prefix is the only thing that
   separates dj 508 ("Alex" / Alex Muro → B3nson Radio) from dj 1238 ("DJ Alex" / Alex
   Collis → The Pity Party); both are `current` and both own a show.
3. show-name **prefix**, last, and only for labels of 8+ chars.

Running the prefix rule before the DJ lookup (my first attempt) silently resolved "Alex"
to the show *"Alex G's Show"* — someone else's show entirely. Caught by the user.
Duplicate DJ records are ranked current-with-a-show first; a DJ's several shows are taken
primary-before-Encore/Replay, earliest slot first, which lands Bill McCann's Saturday
original and Sunday encore correctly without special-casing him.

### 11 slots left open, on purpose
Nine reference DJs with **no show record** (Twink Death, Marita, Shoebill, Nikolo, Blaze,
H-Bomb, goldeedust, plus Radio Rebel whose three duplicate records all lack one) and two
labels absent from both datasets ("urfavoritestepuncle", "Skewpular", "DJ Nora"). The grid
renders an unfilled hour as "open — click to add", so these are visible gaps a human fills
with the Show picker. Inventing show records to close them would push guesses into the
shared shows dataset that every other version reads.

### Closing the 11 open hours (`create-missing-shows-and-djs.mjs`)
Three causes, three different fixes — lumping them together would have added duplicates
to datasets that already suffer from them:

1. **Renamed, not created.** `DJ Twink Death` (show 694) and `Marita` (show 700) DID own
   a show — one of the 102 named with the legacy placeholder "Show Name". That record IS
   the show; it was never named. My earlier ledger reported them as having none because
   the resolver skips placeholder-named shows. Creating a second show would have left
   each DJ with two, one of them junk.
2. **Show created, DJ existed** — Shoebill (706), Nikolo (707), Blaze (708), H-Bomb (709),
   goldeedust (710), Radio Rebel (711). For Radio Rebel, the three duplicate DJ records
   (1261/1262/1263) are all `current` and all showless; 1263 is the only one whose
   first/last name is a real person's (Kylie Lagerwall) rather than an echo of the on-air
   name, so it was treated as the live record.
3. **DJ and show created** — `urfavoritestepuncle` (dj 1271 / show 712), `Skewpular`
   (1272 / 713), `DJ Nora` (1273 / 714).

Shows are named `<on_air_name>'s Show` using the DJs dataset's spelling, not the sheet's,
so the record matches the rest of the dataset (hence "Marita's Show", not "DJ Marita's").
`department` + icon are inherited from the DJ — the department→icon map is 1:1 across all
705 pre-existing shows. The three brand-new DJs have no department to inherit, so
department and icon are **NULL rather than guessed**.

`show_id` and `dj_id` are `INTEGER NOT NULL` PKs with no default, the same gap `airing_id`
had; assigned as max+1 here.

**View 22 is now complete: 53 airings — every slot in the sheet — 51 distinct shows, 0
orphans, 0 placeholder-named shows, no overlaps.**

- [ ] 15 of the 53 placed airings are judged, not certain; `--dry-run` marks them.
      Worth review: DJ Less Than Three (Silent Hill vs The Third Impact), Sir Walford
      (Other Side vs Many Moods), Project Psychosis (Voices of the Campfire vs Hymns
      from the Void).
- [ ] Three shows carry no department, so they render without a genre chip on the public
      site: 712 urfavoritestepuncle, 713 Skewpular, 714 DJ Nora.
- [ ] `shows.show_id` and `djs.dj_id` still have no sequence default, so the admin Shows
      page's Add cannot insert — same fix as `add-schedule-airing-id-default.mjs`.
- [ ] 100 shows are still named "Show Name" (was 102).

## Follow-on: Publish actually repoints the public page (2026-08-23)

The Publish button was inert — the dialog described a repoint and its confirm button had
**no `onClick` at all** (`ScheduleGrid.jsx:118`). Worse than disabled: whenever
`liveTargetSectionId` was set, the dialog implied an action that never happened.

### Targets are DISCOVERED, not configured — and it is the whole SITE, not one page
Three rounds of getting the scope wrong, each corrected by looking at the live data:

1. `liveTargetSectionId` (one section) — the schedule page has **four**, and a published
   page keeps a separate copy of every section from its draft while the seed mints fresh
   ids each run, so the recorded `1964968` was already stale.
2. `liveTargetPageId` (one page) — the schedule feeds far more than the schedule page.
   **26 sections across 8 pages** read source 10: schedule 8, show 6, home 4, station_info
   2, events 2, playlist 2, djs 1, blog 1. Publishing only the schedule page left the home
   on-air rail on the old version, contradicting the page next to it.
3. `liveTargetPattern` — walk every page in the pattern. Nothing names the pages, so a
   ninth needs no config change. `liveTargetPageIds` remains as an optional restriction.

**Why walk pages rather than list the pattern's sections and filter:** `wcdb_main` has
**4005** section rows of which **884** mention source 10, because a section row outlives
the page that referenced it — most are orphans no page renders, and repointing them would
be hundreds of pointless writes. A page's `sections`/`draft_sections` arrays are the only
statement of what is actually live. `action: 'list'` also caps at 500 rows
(`LIST_CEILING`), so a blanket scan could not see them all anyway.

- [x] `readTargets()` — walks the target page's `sections` AND `draft_sections`, dedupes,
      loads each component row, keeps those whose `externalSource.source_id` matches.
- [x] `doPublish()` — rewrites `externalSource.view_id`/`view_name` on every match via
      `apiUpdate`, skipping ones already pointing at the version. Both lists are written:
      they are separate rows, so leaving one behind would either strand the live site on
      the old version or make the next page-publish silently revert this one.
- [x] **The "Live now" chip is now derived, not authored.** `display.liveVersion` was a
      hand-typed string ("Version 1 · v10") that nothing kept true; the chip now reads
      the view_id off the sections themselves, and reports `mixed — v10, v22` when they
      disagree. The authored string survives only as a fallback when no target page is set.
- [x] `liveTargetPageId: '1471836'` in the seed; live section 1965761 patched to match
      (`scratchpad/patch-publish-target.mjs`, backup alongside).

### Verified
Discovery + write + idempotency exercised against the real page
(`scratchpad/test-publish.mjs`): 8 sections found (4 published, 4 draft), all 8 repointed
to view 22, a second pass repointed 0, and **the original view-10 bindings were restored
afterwards — Fall 2026 was NOT published.** Confirmed the swap would change what the
public page reads (53 airings vs 69).

### The by-id load: `action: 'view'` + `params.id` does NOT filter
First implementation returned "The configured public page has no section bound to this
schedule source". Cause: `apiLoad` with `action: 'view'`, `params: { id }` and `path: '/'`
returns **every row of the type** — all 8 pages, all 500 sections — unfiltered, so `[0]`
was an arbitrary row. It failed as a *wrong answer*, not an error, which is why it read as
"nothing is bound".

The working shape (copied from `ExportPdf.jsx`, the only place in the tree that gets it
right) needs three things together: `path: 'view/:id'` on the child, the id in the path
passed as apiLoad's **second argument** (`getActiveConfig` selects the child by path), and
a `filter.options` of `{ filter: { id: [id] } }` to actually narrow the query. Factored
into a `loadById(type, id)` helper that also asserts the returned row's id matches.

- [x] **Both halves verified through the real plumbing** (`dmsDataLoader` /
      `dmsDataEditor`, real token): the site walk discovers all 8 pages, inspects their 155
      section refs and matches the 26 bound to source 10, in 6.8s — which is why the
      dialog reports progress. `dmsDataEditor` repoints a section and a fresh read confirms
      `view_id`/`view_name` changed while `group`, `title`, `size` and all 9 columns
      survived. The cross-pattern write (an admin section updating `wcdb_main|component`)
      is authorized — no 403.
- [x] Confirmed working in the browser: the user's own Publish click moved all 8 schedule
      sections to view 22.
- [ ] No undo. Publishing overwrites the previous view_id with no record of it; the
      version it came from is only recoverable by looking at the other versions.

### Draft/published copies drift — patch BOTH lists
Publishing the admin page copies each draft section into a NEW published row, so an
in-place patch reaches only the copy that existed when it ran. This bit twice: the
Show-picker patch landed before a publish and made it into both copies, the
`liveTargetPageId` patch landed seven minutes after and reached only the draft — so
`/admin/schedule` (published copy 1969246) still said "No public page is configured"
while `/admin/edit/schedule` (draft 1965761) was fine. `patch-publish-target.mjs` now
walks `sections` AND `draft_sections`.

## Follow-on: publish moves the tagging pointer, and the grid opens on what's published (2026-08-24)

- [x] **Publish repoints playlist tagging.** The now_playing stream resolves each
      detection's show from `source.metadata.schedule.view_id`; a publish that moved the
      public sections but not that pointer left new tracks attributed to the previous
      semester's shows. `display.taggingSourceIds` (comma-separated DAMA source ids —
      stable for the life of a source, unlike the section ids this used to track) is
      updated after the sections, reported separately, and **never fatal**: the sections
      are already live by then, and failing the publish over the tag pointer would leave
      the site correct while telling the operator it was not.
- [x] **`api/index.js` — `udaUpdateSourceMetadata`.** Read-modify-write, because
      `metadata` is one blob carrying `columns` (which every column picker reads),
      `isEditable` and per-dataType keys — writing a fresh object drops all of it. The
      value is `JSON.stringify`d: the `sources.byId[id][attr]` set route descends into a
      plain object as a BRANCH, so nothing reaches the leaf and the column is written
      `{}` while reporting success (the uda-source-attribute-set-blanks bug, which has
      already destroyed one source's `metadata.columns`).
- [x] **The grid opens on the PUBLISHED version.** The section's stored
      `externalSource.view_id` is whichever version it was authored against and drifts the
      first time anyone publishes, so opening there showed a week the public site was not
      serving. It now follows `liveInfo`, once per mount behind a ref so it cannot fight a
      manual pick or bounce after a publish, skipped when the sections disagree
      (`mixed` — no single published version to open on). `openOnPublishedVersion: false`
      pins it to the binding.

### Per-source permissions differ, and that is the likely failure
Verified the metadata write round-trips without losing `columns` (proved against source
10, restored after). It could NOT be verified against source **7**: its
`auth_permissions` grant user 175 and group `wcdb Admin`, while sources 9/10 grant user 1
— so the dev account can write the schedule but not the playlist. Publishing as an
authorized account (175 / `wcdb Admin`) covers all three. If the tag pointer ever fails
while the sections succeed, this is why, and the note in the version bar names the source.

Test-harness note: the CLI falcor client implements `get`/`call` but not `set`, so the set
route had to be exercised over raw HTTP. `falcor-express` calls
`dataSource.set(context.jsonGraph)` and the router reads `paths` off **that** argument, so
the form field must carry the whole envelope `{jsonGraph, paths}` — the bare graph makes
`normalizePathSets` iterate undefined and 500 before the DB is touched.

## Follow-ups

- [ ] `display.liveTargetSectionId` is set but Publish still only *describes* the repoint —
      it does not write `externalSource.view_id` onto the public section. That is the other
      half of the version story.
- [ ] Deleting / renaming a version has no UI. Renaming is a plain `views.byId` attribute
      set; deleting needs a guard against deleting the live version.
- [ ] `airing_id` is `INTEGER NOT NULL` with no default, so the add-airing modal has to
      supply one. A blank version starts empty, which makes this reachable sooner.
