# Row auth task 8: production is a cutover, not a migration path

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

Last in the hub's sequence — [server-side-auth-general.md](./server-side-auth-general.md). It runs
after **task 7**, [row-auth-consolidate.md](./row-auth-consolidate.md) (one decision function for
every server auth call), and after [row-auth-parentage.md](./row-auth-parentage.md), which is task
5's prerequisite rather than a numbered stage.

## The decision (owner, 2026-10-29)

> "we want to get a fully completed task working only on auth rows db before we migrate any
> production data, it's fine to put this code behind a flag but migrating prod will not be an
> intermediary step but a cut over"

Three things, and the third is the one that changes plans already written down:

1. **Everything is finished and proven on the row-auth database first** — `dms_rowauth_test` on
   `dms-mercury-3`, app `rowauth-test`. No production data is migrated until then.
2. **Behind a flag is fine.** `DMS_ROW_AUTH_MODE` (`legacy|log|enforce`) and `DMS_CHILD_SWEEP_MODE`
   (`off|log|delete`) both default to the inert setting and ship dark. That is the intended shape,
   not a compromise.
3. **Prod is a cutover.** One planned operation that takes the app from unmigrated to fully
   migrated, verified and flipped. It is **not** a sequence of independently-shipped steps with
   production sitting half-migrated in between.

Point 3 retires the rollout sketched in task 7 — "add the columns, backfill, then flip the modes per
app as confidence grows". That plan has prod spending days or weeks in the half-migrated state, and
that state is the worst one available (see below).

## Why half-migrated is worse than either end

Measured, not assumed:

- **A component resolves through the TYPE PATH, which skips its page.** The type path routes a
  component to its *pattern*; a page's own restriction therefore does not reach its sections. That
  is open in the dangerous direction, and silent. Harmless while `DMS_ROW_AUTH_MODE=log` (which
  allows everything), wrong the moment anyone flips `enforce` — and the half-migrated window is
  exactly when someone would be tempted to flip it per-app.
- **`rowAuthCaps` memoises per process, and a failed probe latches.** A column added under a running
  server changes nothing until it restarts, and a probe that ran before the `ALTER` is cached as
  `{auth:false, parentId:false}` for the life of that process. This has bitten three times during
  this work. A cutover restarts the server; a phased rollout invites a fleet where some processes
  believe the table is migrated and some do not.
- **The sweep can only act on rows that carry `parent_id`.** Columns-without-backfill leaves every
  pre-existing row unsweepable: on a publish the patch carries only the new refs, so the generation
  being dropped is never stamped by the write that drops it, and it escapes once per page
  (`tests/test-child-sweep.js` §5). The backfill is not a tidying step that can follow later.
- **Two passes delete and duplicate rows, and must not race live editing** — the orphan sweep, and
  the multi-owner repair that duplicates a component two pages share. Both need writes quiesced,
  which is a cutover property, not a rollout property.

## Entry criteria — all on `rowauth-test`, none on prod

- [ ] **Tasks 3, 5, 6 and 7 complete** — vocabulary, dms writes, uda, and consolidation into one
      decision function. A cutover flips them together, so they finish together. Task 7 especially:
      cutting over while auth decisions still live in six places means six things to reason about
      under a quiesced-writes window, and it is the riskiest edit in the programme.
- [ ] Parentage complete (it gates both mode flips, and it is task 5's prerequisite).
- [ ] `--verify-parents` CLEAN, exit 0.
- [ ] **0 rows "named by 2+ owners"** — this is the gate for `DMS_CHILD_SWEEP_MODE=delete`. The
      stamp re-homes a shared child by design, so on that data the last page to save owns it and
      dropping the section deletes a row another page still shows.
- [ ] Parent-resolution coverage measured and accepted — the gate for `DMS_ROW_AUTH_MODE=enforce`.
      A row private only by inheritance opens up when its parent cannot be resolved.
- [ ] A full editing session with `DMS_CHILD_SWEEP_MODE=log`, and the would-delete set read by a
      human before anything is set to `delete`.
- [ ] A second editing session with `delete`, ending with **0 orphans** by the standing query
      (components named by no page) and `--verify-parents` still CLEAN.
- [ ] Full suite green on both dialects, including the postgres run against the clone.
- [ ] **`--audit-writes` run on the target app, and its number accepted by the owner.** See the
      grant work below — on prod this is not a formality.

## The grant work, which is the real prerequisite (owner, 2026-10-29)

`migrate-row-auth.js --audit-writes` measured prod read-only on 2026-10-29, cross-checked against
the real resolver at 300/300. **87,268 of 333,789 rows (26.1%)** would become writable by
`mitigat-ny-prod Admin` and nobody else the moment a write gate reaches `enforce`.

The total hides the part that matters:

| kind | would lose writes |
|---|---|
| component | 84,636 of 328,030 (25.8%) |
| **page** | **2,138 of 5,164 (41.4%)** |
| **source · view · symbology · data · dmsenv · theme** | **100% — every row** |
| pattern | 14 of 81 (17.3%) |

**The datasets side is not under-granted, it is ungranted.** 471 rows across six kinds state
nothing at all, so every source, view and symbology on prod goes read-only on a flip. This is
grant-writing work with no code in it, and it is a prerequisite rather than a tuning pass.

Two ways through it, and the owner picks:

- **Grant the datasets side before the flip.** Clean end state, and the audit re-run is the proof.
- **Flip the surfaces separately.** `DMS_DATA_AUTH_MODE` (dms writes) and `DMS_SOURCE_AUTH_MODE` /
  `DMS_READ_AUTH_MODE` (datasets) are deliberately separate flags, so dms writes can move while
  datasets stay on kind auth. That is the lower-risk order and costs nothing to choose later.

**⚠ One group holds almost everything.** `LHMP Template Editor` states **78,965 of the 79,681**
rows on prod that state anything. That is why 26% is as low as it is, and it is a single point of
failure independent of this programme: one bad edit to that group's grants moves write access
across a quarter of a million rows. Worth a look before the cutover, not because of the cutover.

Section C of the audit ranks the affected rows by `updated_at`, so the grant work can start with
what someone is actually editing — on the 2026-10-29 run that was `test_meta_forms_env` sources and
views created the day before, and `mitigateny_playground` pages.

## The cutover itself — one operation, writes quiesced

Order matters; each step reads what the previous one wrote.

1. Quiesce writes.
2. **Back up prod.** The task-7 "no backup needed" applies to the clone only.
3. `--add-columns` (and restart anything long-lived, for the memoised probe).
4. `--sync-vocabulary <manifest>` — prod needs this: **0 of its 81 pattern rows carry `childRefs`**
   today (measured 2026-10-29), so without it no row is an owner and neither the stamp nor the
   sweep does anything.
5. Backfill — passes 2, 3, 4. Expect the multi-owner repair and the orphan sweep to act here;
   prod's orphan count was **5,925** on 2026-10-29.
6. `--verify-parents` → must be CLEAN, exit 0. **Stop here if it is not.**
7. `--drop-data-parent`.
8. Re-run `--audit-writes`. The number must be one the owner has accepted; if the datasets grants
   were the plan, this is where they are proved.
9. Flip the flags.
10. Resume writes, then re-run `--verify-parents` after the first real editing session.

## Rollback, honestly

| step | reversible? |
|---|---|
| the flags | instantly |
| `--add-columns` | yes, drop the columns |
| the `parent_id` backfill | yes, `--reset-parents` |
| `--sync-vocabulary` | yes, the declaration is additive |
| **`--drop-data-parent`** | **no** — from the backup only. Last, after verify is clean. |
| **the orphan sweep's deletes** | **no** — from the backup only. |

Two irreversible steps, both late, both behind a clean verify. That is the whole reason step 2 is
not optional.

## Prod, as measured 2026-10-29 (read-only)

| | |
|---|---|
| rows | 321,296 components, 5,164 pages |
| `auth` / `parent_id` columns | **neither** |
| pattern rows carrying `childRefs` | **0 of 81** |
| components named by no page | **5,925**, all in `mitigateny_county_template_v3_copy_2` |
| …all twins of a live section, none `is_draft` | abandoned published generations, up to **244** of one section |

## 2026-10-31 — the view-type repair (rowauth-test)

The ambiguous-name blocker was misdiagnosed as a naming collision. It is a **mistyped row kind**.

A view's type should name its source. On data carried forward from the old standalone forms pattern
it names the PATTERN instance instead — `form1|version_1:view`, where `form1` was the datasets
pattern's instance name at the time. Cause: `updateAttributes` (`dms-manager/_utils.jsx:124-131`)
rewrites every `dms-format` attribute to `{app}+{patternInstance}|{kind}`, so the generic
child-create path (`updateDMSAttrs.js:9,48`) stamped the pattern instance into every view it made.
Live until the explicit path landed 2026-04-20 (`75ceabbf`); 77 rows, 2024-11-14 → 2026-01-23.

**This breaks two cascades in the running server**, both of which resolve a view by the type path:

| | |
|---|---|
| `dms.controller.js:637` `cascadeSourceDelete` | `WHERE type LIKE '{sourceInstance}\|%:view'` — matched 0 |
| `dms.controller.js:656` `cascadeViewDelete` | `getParent(row.type)` → `form1` → wrong `lookupSourceId` |

So deleting an affected source dropped neither its view rows nor their split tables. That is the
origin of the residue cleaned below — not an unrelated mess.

### Applied

`src/scripts/prune-unlisted-views.js` (new) — reconciles `source.data.views` with the view rows.
Owner decision 2026-10-31: *"if they aren't in the ui now they aren't being used and I want them
gone ... things a human deleted in the ui but isn't deleted in the db because of our code."*

- 20 unlisted view rows deleted, **15 split tables dropped, 21,893 data rows destroyed**
- 24 dangling refs cleared on 23 sources (0 had a surviving table)

`src/scripts/retype-views-to-source.js` (new) — retypes a view from its owning source, reading
`source.data.views` as the authority. Safe for split tables: a table is named from the `:data` row's
type plus the source id (`splitTableName`), never from the view row's type.

- **62 of 64 retyped.** Views now 74/76 correct; `form1|…` rows 77 → 2
- cascade simulation: 48 sources now resolve their views by the type path, 2 missed

`src/scripts/delete-source.js` (new) — the cascade the app cannot run. Resolves the views from
`source.data.views` rather than the type path, so a shared instance name cannot drag the other
source's rows along, and drops every split table NAMED for the source, listed view or not.

Applied to `capacities_v2` #2142187, the older of the two (owner, 2026-10-31: *"let's just delete
the older one"*). Deleted the source, view #2142188, and 2 split tables — **470 data rows**:
`s2142187_v2142188` (150) and `s2142187_v2142342` (320). The survivor #2142341 and its 323-row
table are untouched; `capacities_v2` is now a unique instance name.

Two things that dry run established, both worth keeping:

- **#2142187 was already unlisted.** The datasets UI enumerates sources from the dmsEnv's `sources`
  array (`uda/utils.js:277` `getSiteSources`, via `pattern.dmsEnvId`), and env #1676363 names only
  #2142341. So this was the source-level twin of an unlisted view — deleted in the UI, left in the
  database by the broken cascade — and falls under the same owner ruling.
- **`s2142187_v2142342` explains itself.** View #2142342 belongs to #2142341, yet a table for it was
  named for #2142187. `lookupSourceIdBySlug` (`dms.controller.js:341`) memoizes slug → id in
  `_sourceIdCache` and takes `ORDER BY id DESC LIMIT 1`; the entry cached when #2142187 was the only
  `capacities_v2` was never invalidated when #2142341 was created an hour later, so that first
  upload wrote into the older source's table and only a process restart moved it. **A duplicate
  source name therefore misroutes data, not just deletes.** One more reason the remaining duplicate
  is not cosmetic.

### The split-table sweep

With the rows reconciled, the TABLES were audited the same way. Reachability is computed exactly as
the server computes it: a row's type is `{sourceSlug}|{viewId}:data` where `sourceSlug` is the
INSTANCE segment of the owning source's row type (uda's `row_type` — `uda.controller.js:~255`
documents that the display-name slug drifts; `useDataSource.js:58` reads `row_type` with
`nameToSlug(name)` as the legacy fallback). The server resolves that slug back to an id with
`lookupSourceIdBySlug`, newest-wins, and names the table `data_items__s{id}_v{view}_{slug}`.

**73 tables, 68 reachable.** `src/scripts/prune-unreachable-tables.js` (new) drops the rest.
Three ways a table falls out of the reachable set, all present here:

| | |
|---|---|
| two sources share an instance name | the OLDER one's views route to the NEWER one's id, so the older one's tables strand and its views read empty |
| a migration bound rows to the wrong source | `migrate-split-tables.js` resolved the slug AT MIGRATION TIME; the giveaway is a table whose `_s{id}_` source is NEWER than the rows in it |
| the view id was `undefined` at write time | rows typed `{slug}|undefined:data`, table `..._vundefined_...` |

Dropped (3 tables, **3,090 rows**):

- `s1550996_v1539380_test_dataset_3` (1,529) and `s1550996_v1547901_test_dataset_3` (1,528) —
  migration artifact. The rows are dated Nov 5 and Nov 10 2025; source #1550996 was created Nov 12
  2025, *after* them. The views are #1505452's (instance `test_dataset`); both sources are named
  "test-dataset".
- `s1068273_vundefined_capabilities_catalogue` (33) — **not old regime: written 2026-08-17.** Two
  defects in one write: the view id reached the `:data` type as the string `undefined`, and one row
  carries `"[object Object]"` as a COLUMN KEY. Source #1068273's view #1068275 ("Capabilities
  Catalogue v1") has no table, so that is where they were meant to land. Worth tracing — the type
  is built client-side (`ValidateComp.jsx:222`, `internal/pages/upload.jsx:37`), so a missing
  `view_id` param stringifies straight into the type with nothing to stop it.

Held back for one step, then deleted with their source — see "The duplicates, resolved" below.

**Eight views currently read empty** — their route names a table that was never created. Four are
genuinely empty datasets; the other four are the duplicate-name casualties (#1413317's two, which
the rename would reconnect) and #1057026's copy of view #1033368.

**One view is listed by two sources**: #1033368, by #1033367 (`test_blog`) and #1057026
(`test_blog_copy_0203`) — a copy that duplicated the ref instead of creating a view. Its 5 live
rows are reachable through #1033367 only. Note that `retype-views-to-source.js` typed it for the
COPY (last writer wins in the owner map), which means `cascadeSourceDelete` on #1057026 would now
match and delete a view #1033367 still owns. Before the retype it matched neither. Retyping it to
`test_blog|version_1:view` — the source whose route actually serves the rows — removes that.

### The duplicates, resolved

Owner ruling 2026-10-31: *"anything that is causing a problem and isn't authoritative should just
be deleted."* Authority is the test because it is the one declaration that says a view is load-
bearing (`uda/authority.js`; stored on the source as `metadata.authority`). Only 2 of 73 sources
declare one — `dhses_county_database` → view 1108098 and `jurisdictions` → view 1346450 — and both
resolve to tables with rows, before and after everything below.

- **`content_resources` #1413317 deleted** (Jul-14, the older of the pair). Not authoritative; both
  its views already read empty, because the slug resolved to the newer #1480595 and the tables
  `s1480595_v…` were never created. Took views #1413318 and #1414337 and **1,652 rows**. #1480595
  (1 view, 551 rows) and `content_resources_2` #1415559 are untouched.
- **`test_blog_copy_0203` #1057026 deleted.** It claimed view #1033368 — a copy that duplicated the
  ref instead of creating a view — while the 5 live rows are served through #1033367. The duplicate
  ref was stripped first so the delete could not take a view the original still owns (the script
  refuses that outright). The copy owned no table, so 0 rows were lost.
- **The last two mistypes cleared.** With both duplicates gone the owner resolves uniquely:
  #1480720 → `content_resources|version_1:view`, #1033368 → `test_blog|version_1:view`. **No row in
  the app is typed `form1|…` any more.**

### State of rowauth-test after the repair

| | |
|---|---|
| sources / views / split tables | 71 / 73 / 68 (135,391 data rows) |
| duplicate source instance names | 0 |
| views listed by 2+ sources | 0 |
| dangling refs / unlisted view rows | 0 / 0 |
| view type vs owning source | 0 mismatches |
| rows typed `form1\|…` | 0 |
| unreachable split tables | 0 |
| views reading empty | 5 — all genuinely empty datasets, no table ever written |
| sources declaring authority | 2, both resolving |

### Still open

**The view the `undefined` write stranded is gone** (owner, 2026-10-31). Dropping
`s1068273_vundefined_capabilities_catalogue` removed the rows but left view #1068275 "Capabilities
Catalogue v1" listed by source #1068273 with no table at all — a version that would open empty
forever. Nothing bound to it (no row outside the source mentioned the id) and the source declares
no authority, so the ref was stripped and `prune-unlisted-views.js` deleted the row.
`capabilities_catalogue` keeps its other four versions (v2 358 rows, v3 369, v4 8,027, Test 269).
App now: 71 sources, 72 views, 68 tables, 0 unreachable, 4 views reading empty — all four genuinely
never uploaded.

The CODE defect behind it is still open. The dropped
`s1068273_vundefined_capabilities_catalogue` rows were written 2026-08-17. The `:data` type is
composed client-side (`ValidateComp.jsx:222`, `internal/pages/upload.jsx:37`) and nothing validates
`view_id`, so a missing param stringifies into the type and the server creates a table for it. The
same write also produced `"[object Object]"` as a column key. Needs its own task.

`lookupSourceIdBySlug`'s `_sourceIdCache` (`dms.controller.js:341`) has no invalidation on source
create. Harmless now that no slug is duplicated, but it is what sent an upload into the wrong
source's table in the `capacities_v2` case.

`childRefs` for datasets is **deferred** (owner, 2026-10-31): the dependency chain is unsettled —
`dmsEnvs` are not in any format, and `dmsEnvFormat.sources` (`admin.format.js:57`) is a plain `json`
attribute although the env is what actually owns sources (74/74 `parent_id` → dmsenv).

### What the datasets repair does NOT cover (2026-10-31)

Everything above is the datasets tree: 71 sources, 73 views, 68 split tables — **144 of 34,115 rows
in the app.** A sweep of the other kinds says the dataset work is done and the page tree is not.

Clean across all kinds: `parent_id` never points at a missing row (0); no page or component whose
parent IS a pattern names a different instance in its type path (0).

**But 338 pages and 22,844 components — 68% of the app — sit under the container
`mitigateny_county_template_copy`, and no pattern has that instance.** The five patterns whose
instance begins `mitigateny_county_template` are `…_template`, `…_template_v1_copy`,
`…_template_v2_copy`, `…_template_v3_copy_2` and `…_template_suffolk_copy`; none matches. All 338
pages have `parent_id` NULL; all 22,844 components parent correctly to one of those pages. No
pattern row mentions the string in its `data`.

Pages load as `{app}+{patternInstance}|page` (the route format from `initializePatternFormat`), so
nothing in the app can reach them.

**Correction to the first reading of this.** The "updated 2026-10-28" signal was ONE page
("Avalanche" #2231670) with `updated_by = null` — a script, not an author. 337 of 338 were last
touched Jun–Sep 2026. The healthy `mitigateny_wyoming` pattern is the contrast: all 45 of its pages
were updated in Oct 2026 by real users (656, 1106). These are abandoned, not in progress.

### Diagnosis (owner: the `_copy` suffix came from an earlier pattern-duplicate implementation,
since fixed; the rows it made were never cleaned up)

**The child types are misaligned, and `parent_id` is only half the problem.** Measured:

| | |
|---|---|
| pages typed `mitigateny_county_template_copy\|page` | 338, **all with `parent_id` NULL** |
| components typed `…_copy\|component` | 22,844, **all correctly parented to one of those pages** |
| patterns with that instance | 0 |

The component→page link is sound. What is broken is the page→pattern link, in both places it is
recorded. A repair is therefore three writes, not one:

1. `parent_id` on each page → the owning pattern's row id (how row-auth inherits).
2. the page's type container → that pattern's instance. **Required**: pages load as
   `{app}+{patternInstance}|page` (the route format from `initializePatternFormat`), so `parent_id`
   alone would fix authorization and still leave every page invisible.
3. the components' type container likewise. Their `parent_id` needs nothing.

**The blocker is that ownership is recorded nowhere.** Every page title appears exactly 6 times —
six copies of one ~56-page template — made in 5 creation bursts. Five patterns are candidates
(`mitigateny_county_template` #1300890 and the four `…_copy` variants), and ALL FIVE have zero
pages. Only one burst matches a pattern in time: 58 pages at 2026-07-22 19:16 UTC, 1.4 min after
#2304223 "MitigateNY_Schenectady_Draft_V2". The 174-page burst PRECEDES that pattern by 11–15 min;
the Jun-16 and Jul-21 bursts have no pattern within a day. Content cannot disambiguate either —
page filters carry no geoid values, and every burst's components mention every county (template
boilerplate).

**Evidence that the copies were abandoned at birth:** only **48 of 22,844** components were edited
more than an hour after they were created (2 in the Jun-16 copy, 46 in the Jul-21 copy). Nothing is
published. 121 MB.

### Applied

Owner ruling 2026-10-31: *"we are still working on row auth test? if so delete them."*

`src/scripts/delete-orphan-pages.js` (new, dry-run default) — deletes pages whose type container
names no pattern, together with their components. Two guards, both of which passed before the
write: no component in the set is parented outside it, and no page outside the set names one of
them as `data.parent`.

**Deleted 338 pages and 22,844 components — 23,182 rows, 121 MB.**

### rowauth-test, whole app, after everything

| | |
|---|---|
| rows | 34,115 → **10,933** |
| census | component 10,570 · pattern 81 · view 73 · source 71 · dmsenv 4 · site 1 · page 133 |
| `parent_id` → missing row | 0 |
| type container naming no live instance | 0 |
| pages with no `parent_id` | 0 |
| components with no live parent | 0 |

Plus the datasets-tree table above (0 duplicate names, 0 mistypes, 0 unreachable tables, 0 dangling
refs). The app's parentage is now internally consistent in both places it is recorded — the type
path and `parent_id` — which is the precondition `migrate-row-auth.js` pass 4 needs to resolve a
parent for every row.

## Where the entry criteria stand (measured 2026-10-31, after the cleanup)

`migrate-row-auth.js --db dms-mercury-3 --app rowauth-test --verify-parents` → **exit 1, 62
findings**. Every one of them is in the `view` kind; every other kind is clean.

| entry criterion | status |
|---|---|
| Tasks 3, 5, 6, 7 complete | **no** — task 7 phase 2 (one decision function) outstanding |
| Parentage complete | **99.5%** — 10,876 of 10,932 rows reach a root |
| `--verify-parents` CLEAN, exit 0 | **no** — 62 findings |
| **0 rows named by 2+ owners** | **✅ 0** — the `CHILD_SWEEP_MODE=delete` gate is MET |
| Parent-resolution coverage accepted | measured, not accepted |
| Editing session with sweep `log`, read by a human | not started |
| Second session with `delete`, 0 orphans | not started |
| Full suite green on both dialects | not run since the cleanup |
| `--audit-writes` accepted by owner | not run on rowauth-test |

Chain census — what an enforce flip rests on:

```
component  10570  100.0%     page  133  100.0%     pattern  81  100.0%
source        71  100.0%     dmsenv  4  100.0%     site      1  100.0%
view          72   22.2%   ← the entire gap
```

The remaining 62, all views:

- **54** — `parent_id` missing, the type path has one. These are a `--apply` away, and **today's
  retype is what makes that safe**: before it, 62 of these views' type paths named `form1`, a
  PATTERN instance, so pass 4 would have attached them to the wrong parent or skipped them.
- **6** — `parent_id` points outside the child's container, i.e. at a stale source. All are views
  the retype moved: `1166225 (plants_3|version_1:view) → plant_data_env|plants_2:source`,
  `1197995 (my_plants|t:view) → plants_2`, and `1539380 / 1547901 / 1551058 (test_dataset…) →
  test_dataset_2`. The type path and the column disagree; `source.data.views` says the type path is
  right, so the column is what needs rewriting.
- **2** — blocked by an ambiguous instance name, of **8** such names in all. They are all view
  instances that many sources reuse — `version_1` (20 views), `v1` (10), `version_2` (4),
  `version_3` (2), `test`, `test3`, `view_1`. Pass 3 refuses to guess, correctly.

Note what is NOT in that list any more: "named by 2+ owners 0", "named by nobody 0", "parent_id
points at no row 0", "parent_id DISAGREES with the array 0". The ambiguity that remains is in view
NAMES, not in ownership.

**The grant work (section above) is untouched and is still the larger prerequisite** — 87,268 prod
rows (26.1%) would lose writes on a flip, including 100% of every datasets-side kind.

## 2026-10-31 — `migrate-row-auth.js --apply` run on `rowauth-test`

The migration proper, after the day's data repair. Owner authorised the run. Dry run first: pass 3
reported `claimed by 2+ owners 0`, `would duplicate 0`, `orphaned — named by no owner 0`, so neither
the duplicate-for-extra-owner repair nor the no-owner DELETE had anything to do — the apply was two
column writes and nothing else.

```
2. auth      ← data.authPermissions    3266 row(s)
3. parent_id ← declared reference arrays   10570 already correct, 0 set, 0 corrected,
                                            119 refs dropped (no such row)
4. parent_id ← the type path             54 row(s)
```

### Result: 62 findings → 8

`--verify-parents` still exits 1, but the chain census moved where it mattered:

| kind | rows | reach a root — before | after |
|---|---|---|---|
| view | 72 | 16 (22.2%) | **70 (97.2%)** |
| component | 10570 | 100% | 100% |
| page | 133 | 100% | 100% |
| pattern | 81 | 100% | 100% |
| source | 71 | 100% | 100% |
| dmsenv | 4 | 100% | 100% |
| site | 1 | 100% | 100% |
| **TOTAL** | **10932** | 10876 | **10930** |

Section A is now clean apart from the ambiguity guard: `parent_id missing with an array naming it`,
`DISAGREES with the array`, `claim did not validate`, `named by 2+ owners`, `named by nobody` and
`parent_id missing, the type path has one` are all **0**. The 54 the type path could name were
stamped.

### The 8 that remain are all views, and all eight are unambiguously resolvable

Checked each against `source.data.views` — the array the app navigates by:

| view | parent_id now | listed by | verdict |
|---|---|---|---|
| 1166225 `plants_3\|version_1:view` | #1165590 `plants_2:source` | #1166223 `plants_3:source` | stale |
| 1197995 `my_plants\|t:view` | #1165590 `plants_2:source` | #1197977 `my_plants:source` | stale |
| 1539380 `test_dataset\|version_11:view` | #1505451 `test_dataset_2:source` | #1505452 `test_dataset:source` | stale |
| 1547901 `test_dataset\|test_upload:view` | #1505451 `test_dataset_2:source` | #1505452 `test_dataset:source` | stale |
| 1551058 `test_dataset_3\|version_1:view` | #1505451 `test_dataset_2:source` | #1550996 `test_dataset_3:source` | stale |
| 1626201 `test_dataset_kaggle_nba\|test:view` | #1505451 `test_dataset_2:source` | #1626200 `test_dataset_kaggle_nba:source` | stale |
| 1412073 `test3\|test3:view` | NULL | #1412069 `test3:source` | blocked by ambiguous name |
| 1412636 `test4\|test4:view` | NULL | #1412635 `test4:source` | blocked by ambiguous name |

In all eight the **type path and the listing source agree**; only the column is wrong or absent. The
two NULLs are blocked because the instance name `test3` is held by both the view and its own source,
so the name lookup sees two candidates and refuses to guess — correctly, by this script's rules.

`prod:site` also has a NULL `parent_id`. That is the root and is the pass's one
`unresolvable (no parent above)`, not a finding.

### Root cause of all 8: datasets declares no `childRefs`

Pass 3 printed exactly one declaration — `page → history:page-edit sections:component
draft_sections:component`. A `grep` confirms `packages/dms/src/patterns/page/page.childRefs.js` is
the only such file in the library; `registry.js` accepts `childRefs` on any pattern type and nothing
else supplies one.

So every one of the 72 views has to be resolved by pass 4's **name lookup** instead of pass 3's
**declaration**, even though `source.data.views` is a perfectly good ownership array and is already
the authority three other scripts read. That is why views alone needed the type path, why a stale
column was never corrected (pass 3 corrects, pass 4 only fills NULLs), and why two of them are
blocked by a name collision that a declared array would never have consulted.

**Fix: declare `source.views → view` as a datasets `childRefs` entry.** Pass 3 would then set all
six stale columns (it CORRECTS, unlike pass 4), resolve the two NULLs without ever looking at a
name, and carry the same declaration into `createData`'s claim validation, so backfill and write
path agree by construction. This is the deferred item already recorded under "Still open" —
childRefs for datasets, held pending the dmsEnv dependency-chain discussion. It is now the only
thing standing between `rowauth-test` and a clean `--verify-parents`.

### `auth` coverage after pass 2, by kind

| kind | rows | `auth` set |
|---|---|---|
| component | 10570 | 3192 |
| pattern | 81 | 81 |
| page | 133 | 6 |
| view | 72 | **0** |
| source | 71 | **0** |
| dmsenv | 4 | **0** |
| site | 1 | **0** |

The datasets side is **100% ungranted on the clone**, exactly as the 2026-10-29 prod audit found for
prod (source · view · symbology · data · dmsenv · theme all 100% losing writes on a flip). The
migration cannot invent grants that were never authored; this is the grant work, not a migration
defect.
