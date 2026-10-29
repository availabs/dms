# Row auth: `parent_id` is written, not inferred

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

Part of [server-side-auth-general.md](./server-side-auth-general.md) (hub). Depends on
[row-auth-schema.md](./row-auth-schema.md) and [row-auth-vocabulary.md](./row-auth-vocabulary.md).
Prerequisite for [row-auth-dms-writes.md](./row-auth-dms-writes.md) (task 5).

## Objective

Make `parent_id` complete and kept complete, so the resolver walks a column rather than falling
back to the type path — and so a row created today does not immediately decay the coverage the
migration achieved.

## Why it is not derivable on the server

The type-system refactor (`planning/tasks/completed/type-system-refactor.md`) is explicit: pages and
components are **both children of the pattern**, "identified by row ID". A page carries no instance
name, so nothing can name it as a parent in a type string — `{pattern}|component` resolves only as
far as the pattern.

Measured on the whole mercury estate: **only 27 of 396,766 rows** have a type with no parent segment
(11 themes, 12 junk rows). So the type answers for every kind **except the three whose parent is a
page** — and with pages attaching to their pattern rather than to a parent page, that reduces to two:

| kind | parent | from |
|---|---|---|
| `pattern`, `dmsenv`, `tenant` | site | type |
| `source` / `view` / `data` | dmsEnv / source / view | type (`:data` carries the view id) |
| `page` | **pattern** — never another page | type |
| `symbology`, `channel`, `avl_graph_template`, `page_template`, `spreadsheet_template` | pattern | type |
| **`component`**, **`page-edit`** | **the page** | **the client states it** |

**`parent_id` is containment, not navigation.** A sub-page's `data.parent` names another page; that
is the nav tree and it does NOT go in `parent_id` (owner, 2026-10-28). Confirmed against the code:
`dms.route.js`'s page gate resolves grants via `getParent(row.type)` → the pattern, and nothing in
any read or write gate walks page→page. The rule matches what is already enforced.

## Why not `data.parent`

It is wrong more often than right. Of 33,342 components on the migration clone, **17,673 (53%)**
have a `data.parent` that disagrees with the page actually listing them in `sections` /
`draft_sections`. It is a create-time snapshot that paste and move never maintain
([section-paste-carries-stale-parent.md](./section-paste-carries-stale-parent.md)).

The page's own section array is authoritative — it covered **33,342 of 33,342 (100%)**.

## Design: the client states it, the server validates it

Rejected alternatives, and why:

| | |
|---|---|
| server derives it | impossible for components — the page is not in the create args |
| server hook on the page write | would need to know `sections` means children; can be made data-driven, but spends work rediscovering an id the caller already had |
| page id in the type (`{page_id}\|component`) | contradicts "identified by row ID", breaks the documented `type = '{pattern}\|component'` query, and re-encodes a MUTABLE edge in an identifier — a component's page changes, which is exactly why `{source}\|{view_id}:data` is safe and this would not be |

The client is adding the child's ref to that page in the same save, so it already has the id.

### Built

- **`routes/dms/parentId.js`** — `takeParentId` lifts `parent_id` out of the create payload (column
  only, never a second copy in `data`); `isPlausibleParent` / `validateParentId` check it.
- **The check names no kind.** Same app, and the claimed parent is either the **named container**
  the child's type points at, or a **sibling kind** inside it. Both read off type strings, so a new
  pattern type is protected without any change here.
- **Nearest-parent enforcement needs a declaration.** Structurally, a component naming its
  *pattern* is valid — the pattern is in its type path — but it skips a level of inheritance, which
  is permissive in the wrong direction. Nothing in a type string says pages sit between patterns and
  components. So the pattern **declares** it: `childRefs` = `{ [ownerKind]: { [attribute]: childKind } }`,
  validated at `registerPatternTypes`, carried on the pattern row beside `auth.vocabulary`, read by
  `childRefsOf` / `ownerKindOf`. One declaration answers two questions — which attributes the
  migration should read, and which kind a row may name as its parent.
- **It never throws.** A parent that does not exist, is in another app, or fails the check is
  dropped with a warning and the row is still written. `parent_id` carries no foreign key for the
  same reason: a parentage inconsistency must not become a failed write, and the resolver already
  truncates a chain it cannot follow.
- **`createData`** lifts, validates and inserts it; the column is appended to the INSERT only when a
  claim survives, so an unmigrated table takes the identical statement as before.
- **Client: `api/index.js`**, both `dms-format` child loops (the Falcor path and the sync branch).
  Generic — driven by `config.format.attributes` filtered on `type === 'dms-format'`, so no pattern
  or kind appears. Every type that declares a `dms-format` attribute gets correct parentage.

### Verified end to end

Through the real Falcor create route on a disposable sqlite app:

| write | result |
|---|---|
| page claiming its pattern | `parent_id` set |
| component claiming its page | `parent_id` set |
| **component claiming its PATTERN** | **dropped** — declared owner is `page` |
| component claiming a nonexistent id | dropped, no error |
| component with no claim | `parent_id` null, row written |

`tests/test-parent-id.js` — **23 cases**, in `npm test` and `test:row-auth`.

### Built: the migration (`migrate-row-auth.js`)

The script now runs four ORDERED passes — each reads what the one before it wrote — and
`data.parent` is no longer one of its sources:

| | |
|---|---|
| 1 | the DECLARATIONS: `auth.vocabulary` + `auth.childRefs` ← the manifest (`--sync-vocabulary`) |
| 2 | `auth` ← `data.authPermissions` |
| 3 | `parent_id` ← the **declared reference arrays** |
| 4 | `parent_id` ← the **type path**, for every kind no declaration covers |

Pass 1 moved ahead of the rest because pass 3 reads what it writes; pass 2 had to learn to carry
`childRefs` across the `auth` overwrite, the same bug `vocabulary` hit before it.

Three decisions worth keeping:

- **Declarations are merged by KIND, app-wide** — not read per pattern instance. A `childRefs`
  entry is a statement about a kind ("a `page` owns components through `sections`"), and reading it
  per instance would have left the clone's 22,790 components under a deleted pattern unparented.
  Where two patterns disagree about one attribute there is no app-wide answer, so it is dropped and
  reported — the same rule pass 4 applies to ambiguous instance names.
- **Pass 4 is held OFF the declared child kinds.** A component named by no page is not handed its
  *pattern* as a consolation parent: that skips a level of inheritance, which is permissive in the
  wrong direction. It stays NULL, the resolver truncates (safe), and it is listed.
- **Every type-shaped question goes to the functions the write path uses** — `childRefsOf`,
  `refIdsOf`, `isPlausibleParent`. A row the backfill attaches is a row `createData` would have
  accepted the claim for, by construction rather than by review.

`--reset-parents` clears the column first, for an app an earlier revision migrated from
`data.parent`.

### Pass 3 repairs two things the column cannot express

The owner decided (2026-10-29) that neither state should exist in DMS, that copy/paste/duplicate
gets a sweep of its own once this lands, and that until then the migration must **repair** rather
than report — a column that cannot describe the data is not a migration.

- **Two owners → duplicate.** A component listed by two pages has two sets of grants above it and
  one `parent_id`. The **lowest-id owner keeps the original**; every other owner gets its own copy
  and has its arrays repointed at it. Lowest id because the rule must be stable — any
  order-dependent choice duplicates again on the next run. The copy is a faithful one (every column
  but `id`, read off the row, so no schema knowledge and either dialect); `created_at` is kept,
  because the section's real age is the original's. The pages render what they rendered before, and
  the copies can now diverge — which is what whoever duplicated the page believed was already true.
- **No owner → delete.** A component no page lists cannot be rendered, reached or edited, and has
  no parent to inherit from: a leak from a delete that did not cascade. "No owner" means *named by
  no reference array at all* — a row named by an owner whose claim fails validation is a different
  defect, keeps its row, and goes to `--verify-parents`.

Two guards: the sweep is skipped entirely if no owner rows were scanned (no declaration must never
read as "delete them all"), and a kind that is itself an owner kind is never swept. **The delete is
why this must not race live editing** — a child is written before its parent's array is, so a
component saved seconds ago is legitimately unnamed. Quiesce writes first.

`planDuplication` and `repointRefs` live in `routes/dms/parentId.js` beside the write-path rules,
not in the script, and are unit-tested.

### Run on `rowauth-test`, 2026-10-29

A fresh cut of the clone (33,895 rows) plus two planted probes — one component listed by a page, one
listed by nobody:

```
3. parent_id ← declared reference arrays
     owner rows scanned 471   refs read 33,415
     parent_id set 33,343     dropped: no such row / wrong kind / outside container   0 / 0 / 0
     claimed by 2+ owners 72  …duplicated for the extra owner 72
     orphaned — named by no owner  1  DELETED
4. parent_id ← the type path   214   unresolvable 339   withheld 0
coverage  33,629/33,968 (99.0%), all of it resolving to a real row
```

Verified after the run:

| | |
|---|---|
| components named by exactly one page | **33,415 / 33,415** |
| components named by 2+ pages | **0** (was 72) |
| dangling refs (a named id with no row) | **0** |
| Wind / Lightning | 132 and 138 components **of their own**, where 6 were shared |
| orphan probe | deleted |
| listed probe | kept, `parent_id` = its page |

A second `--apply` writes nothing: 33,415 already correct, 0 duplicated, 0 orphans, 0 type-path
rows. Chains are `component → page → pattern → site`, max depth 3. The 339 unresolvable are the
338 pages of the deliberately pattern-less tree, plus the site.

**98.8% → 99.0%, and both are below the old script's 99.8% on purpose.** That number counted 17,529
components attached to the wrong page. Verified against the migrated column:

| `data.parent` vs. the page that actually lists the component | |
|---|---|
| agree | 15,730 |
| **disagree** | **17,529 (52.6%)** |
| names a row that no longer exists | 231 |
| of the disagreements, pointing into a *different pattern* | **0** |

Every disagreement is within one pattern — a duplicated page keeping the original's ids.

Confirmed end to end with the real resolver and the production projection (`id, type, parent_id,
auth` — no `data`, so the runtime `data.parent` fallback is structurally unreachable on a migrated
app): a group granted on one page can edit **that page's** section and not a sibling page's, and a
non-member can edit neither.

`tests/test-parent-id.js` — **49 cases** (was 23). Full server suite green.

**Not run against `mitigat-ny-prod`.** The clone is the only migrated app.

### Built: `--verify-parents`, the reconciler

The backfill is a one-time event; the client is what has to keep `parent_id` true, across three
write paths and a sync. This asks the question the backfill cannot — not *what would I write*, but
*does what is stored still agree with the data, and does every chain still reach a root*. It
**refuses `--apply`** (verification must never be the thing that changed what it is verifying) and
**exits 1 on any drift**, so it gates a `DMS_ROW_AUTH_MODE` flip from CI rather than from someone
remembering to look.

Three sections:

- **A — drift from the declared arrays.** Missing, disagreeing, named-but-invalid, contested,
  orphaned, type-path-fillable, ambiguity-blocked. A **disagreement is a move the write path did not
  follow**, and the report says so: that is Remaining #2, now visible rather than theoretical.
- **B — integrity of the column itself,** with no declaration involved, so it holds for every kind:
  `parent_id` pointing at no row, at the row itself, or outside the child's container. This uses the
  structural rule *alone* — the declaration-aware check is A.
- **C — the chain census.** Per kind: rows, how many reach a `:site` root, max depth (flagging the
  `MAX_DEPTH` cap as a possible cycle). **"Reaches a root" is the number an enforce flip rests on**,
  not "`parent_id` is set": a row private only by inheritance opens up the moment its chain stops
  short of the row holding the grant.

A finding count, not a row count — one row can fail two checks, and both are worth printing.

### Verified: damage → detect → repair → clean

Four defects planted in the migrated clone, one per mechanism:

| planted | reported |
|---|---|
| a component re-pointed at a sibling page (a drag the write path missed) | A: *disagrees* |
| `parent_id` = 999999999 | B: *points at no row* |
| `parent_id` = a page in another pattern | B: *outside the container*, with the row printed |
| a component's ref removed from the page that named it | A: *named by nobody* |

`DRIFT: 6 finding(s)`, **exit 1**. One `--apply` repaired all four — 3 corrected, 1 deleted, each
printed `old → new` — and the re-verify came back `CLEAN`, **exit 0**. `--verify-parents --apply`
exits 1 without touching the database.

On the clean clone the census reads 10,785 of 33,967 rows reaching a root (31.8%). That is not a
defect: 23,182 of them are the deliberately pattern-less tree — 338 pages whose pattern row the
production sweep deleted, plus the 22,844 components beneath them. It is the ceiling on enforce for
this app, and the reason the clone carries that tree at all.

### Bugs found by running it, not by reading it

Both were caught only against the real database, which is worth remembering: the script is
Postgres-only, so no suite covers its SQL path.

1. The orphan sweep **deleted all 72 copies it had just created** — `claims` was built from the
   arrays as they were *before* the repointing, so a new row was named by nobody it could see.
2. `--add-columns` probed capabilities before the `ALTER`, so a first run wrote the declarations
   into `data` and the next moved them to `auth`, leaving a stale copy.

### Built: the parent stamps its own children (`stampChildren`)

Approved 2026-10-29. The child-side claim only fires when the parent already exists, which neither
remaining case satisfies: a page created with its sections in one call writes the children FIRST so
their ids can go into its array (no page id to claim), and a section that only MOVED is not
`_dirty`, so it is never re-sent and never renews its claim. Both are answered from the one place
that always knows — the parent's own write, which carries the arrays.

`routes/dms/parentId.js` `stampChildren` is the inverse of `validateParentId`: same declaration,
read the other direction, so the two cannot disagree. Per named attribute, one statement:

```sql
UPDATE <table> SET parent_id = $1
 WHERE app = $2 AND id IN (…) AND type = '{container}|{childKind}'
   AND (parent_id IS NULL OR parent_id <> $1)
```

- **The predicate is an exact type string, and that is the security bound.** A child's type is
  determined by the owner's — `getParent(ownerType)` plus the declared child kind — so this *is*
  `isPlausibleParent`'s rule computed rather than checked, and it is portable (no `ANY`, no
  `substring … from`). Without it, putting an arbitrary id in your page's `sections` would capture
  that row's parentage and hand it your page's grants; with it, that is bounded to a pattern you can
  already edit a page in. **Do not relax it to a kind match.**
- **`data` is the incoming patch, not the merged row.** `setDataById` merges with `jsonMerge`, so
  stamping from the result would rewrite every section on a title-only edit.
- **It never clears.** A child dropped from an array keeps its parent — clearing needs the previous
  array to diff against, and a save that momentarily omits a section would orphan it. Removal stays
  with `--verify-parents` ("named by nobody") and the orphan sweep.
- **It never throws**, and is skipped entirely when the table has no `parent_id`.
- Chunked at 500 ids per statement.

Wired into all three writers, inside each one's existing transaction: `createData`, `setDataById`
and `/sync/push` (`I` and `U`). `childRefsForType` was split out of `ownerKindForType` so the one
cached lookup serves both directions.

**The bug this shook out, worth keeping.** The first wiring called `rowAuthCaps` and the declaration
lookup from *inside* the transaction. Per this package's `CLAUDE.md` that is forbidden — sqlite
throws on the lock, postgres silently uses another pooled connection — and worse, `rowAuthCaps`
**caches a failed probe as `{auth:false, parentId:false}` for the life of the process**, so one such
call disables parentage for that table permanently. Both lookups now resolve in `childStampPlan`,
before the transaction opens; both are memoised, so hoisting costs nothing. This is the third time
that cache has silently latched to "unmigrated" — it is worth treating as a trap, not an incident.

### Verified

`tests/test-parent-stamp.js` — **9 cases** through the real Falcor routes on a disposable per-app
sqlite table (the bug being guarded is in the wiring, not the rule):

| | |
|---|---|
| children written before the page | no parent — the gap |
| the page's create | stamps all three |
| a component in another pattern, named in the array | **not captured** |
| an id with no row | ignored, the page still writes |
| a section moved to another page, not `_dirty` | follows, on the receiving page's save |
| the sections left behind | untouched |
| a title-only edit | does not re-stamp |
| a section dropped from the array | keeps its parent |
| a pattern declaring nothing | stamps nothing |

`tests/test-parent-id.js` — **60 cases** (was 49), 11 new over the statement `stampChildren` builds,
against a recording executor: the exact-type predicate, the never-clear clause, one statement per
*named* attribute, chunking at 500, junk/duplicate ids.

Dialect confirmed on **Postgres** against the `rowauth-test` clone: a real page's three sections
cleared and re-stamped, a `mitigateny_fulton` component named in the same array left pointing at its
own page, and a second run stamping 0.

Full server suite green (exit 0), plus `test-sync` 95/95, `test-data-auth` 49/49,
`test-row-auth-reads` 10/10.

### Built: the parent deletes the children it dropped (`sweepRemovedChildren`)

The third hook, and the last one. `validateParentId` checks a claim, `stampChildren` asserts
containment, and this is what makes `parent_id` mean containment rather than "the last page that
mentioned this row": when an owner stops naming a child, the child goes.

**Measured first, on `mitigat-ny-prod`, 2026-10-29 — read-only.** 321,296 component rows, **5,925 of
them named by no page at all**:

| | |
|---|---|
| orphans sharing a `trackingId` with a LIVE section | **5,925 of 5,925** |
| orphans carrying `is_draft` | **0** |
| patterns involved | **1** — `mitigateny_county_template_v3_copy_2` |
| created | 2026-10-21 → 2026-10-29, i.e. the last eight days |
| abandoned generations of one section | 6, 30, **61 (×78 sections)**, 67, 122, 183, **244** |

That distribution is a signature, and it is not the defect this task predicted. It is **`publish()`**:
it copies `draft_sections` into `sections` with `delete draft.id`, so every publish mints a fresh set
of component rows and drops the previous set from the array. Nothing deleted them. One page published
61 times left 61 generations of each of its 78 sections. Removing a section (`sectionArray.jsx`'s
`remove()`) and deleting a page leak the same way, but they are the small mechanisms — publish is the
one producing thousands.

**The rule is a set DIFFERENCE, never "rows nothing names".** A child row is created BEFORE its
parent's array is written — that is the whole reason `stampChildren` exists — so for a moment every
new section is a row no array names. Sweeping unreferenced rows would race that window and delete
sections as they are typed. Sweeping the *removed* set cannot: a row that was never in the old array
is never a candidate, whatever else is true of it. The difference is taken **per child KIND, not per
attribute**, so a section moving `draft_sections` → `sections` is not a removal.

`before` is read inside the write's transaction; `after` is the **merged** row the UPDATE returned,
not the patch — a patch that names no child attribute leaves those arrays alone and removes nothing.

Two bounds, the same shape as the stamp's exact-type predicate:

```sql
DELETE FROM <table> WHERE app = $1 AND parent_id = $2 AND id IN (…) AND type = '{container}|{childKind}'
```

`parent_id = <owner>` is the safety bound. A row another page owns, or an unmigrated row
(`parent_id IS NULL`), is never matched. A deleted OWNER uses `sweepAllChildren`, which needs no
arrays at all — everything it parents goes, including rows its arrays had already lost.

Wired into `setDataById`, `dms.data.delete` (plans resolved before the transaction, from the doomed
rows' REAL types) and `/sync/push` `U` and `D`.

**`DMS_CHILD_SWEEP_MODE`: `off` | `log` | `delete`, default `log`.** This is the only irreversible
thing parentage does, so it ships reporting first, the way row auth itself did: `log` runs the same
SELECT the DELETE would have run and prints what it would have removed.

**The gate for `delete` is `--verify-parents` reporting zero rows "named by 2+ owners".** Found by a
test that asserted the opposite of what the code does: `stampChildren` **re-homes** a child whose
`parent_id` points elsewhere — deliberately, because re-asserting from the owner's own array is what
repairs drift. On healthy data nothing exercises that branch (there is no cross-page section move,
and paste / duplicate / template all mint new rows). On a component listed by TWO pages it means the
last page to save owns it, and that page dropping the section deletes a row the other page still
shows. The migration repairs those rows by duplicating them, and the reconciler counts them, so the
gate is a number that already exists — the same shape as gating `DMS_ROW_AUTH_MODE=enforce` on
coverage.

**What has to be true before the hook does anything**, measured against `mitigat-ny-prod`
2026-10-29 — none of the three hold there today:

| precondition | why | prod |
|---|---|---|
| the `parent_id` column | `childStampPlan` returns null without it, so neither stamp nor sweep runs | **absent** (nor `auth`) |
| the pattern row carries `childRefs` | read from `auth.childRefs` or `data.childRefs`; no declaration, no owner | **0 of 81 pattern rows** |
| `DMS_CHILD_SWEEP_MODE=delete` | `log` is the default and deletes nothing | not set |

Only the third actually deletes. The first two are preconditions, and the backfill is a fourth
thing again: **a row with `parent_id NULL` can never match `parent_id = <owner>`**, so adding the
column without running passes 3/4 leaves every pre-existing row unsweepable until some later write
stamps it. On a publish the patch carries only the NEW refs, so the generation being dropped is not
stamped by the write that drops it — it escapes, once, per page. Pinned in `test-child-sweep.js`
§5.

The 5,925 rows that already exist are the migration's orphan sweep's job, not this hook's.

### Verified: the sweep

`tests/test-child-sweep.js` — **21 cases** through the real Falcor routes on disposable per-app
sqlite, since the rule itself is unit-tested and what is at risk is the wiring:

| | |
|---|---|
| publish again | deletes the previous published generation |
| …the draft set | untouched |
| a child created but not yet listed | **never swept** — the race |
| a title-only edit | sweeps nothing |
| a section moved draft → published | not a removal |
| …once no array names it | deleted |
| a page listing another page's row | **takes it** — drift repair, by design |
| …then dropping it | deletes it — why `delete` needs a clean verify |
| a row in another PATTERN | never swept |
| deleting a page | deletes the sections it parented, both arrays |
| …the page next to it | untouched |
| a dropped row whose `parent_id` is NULL | **not swept** — why the backfill is part of the rollout |
| …the row that replaced it | stamped, so the next drop does sweep it |
| `log` / `off` | delete nothing |
| no `parent_id` column | no sweep |

`tests/test-parent-id.js` grew 60 → **83**: ten over `planRemovedChildren` (the move case, the
publish case, per-kind separation, an unparseable `after` meaning "cannot tell" rather than
"everything went") and thirteen over the statements, including that `log` issues a SELECT and never
a DELETE, and that `off` issues nothing.

**Postgres dialect confirmed against the clone**: page 2231625's six draft sections — `log` reported
all six and left all six in place; `delete` inside a transaction removed all six; the rollback
restored them. `sweepAllChildren` reported the page's other six (its published set) as it should.

## Remaining

1. ~~**New-parent ordering.**~~ **Done** — `stampChildren` on the parent's own create, above.
2. ~~**Moves.**~~ **Closed 2026-10-29 two ways.** First, there is no cross-page section move. The client was
   swept: `moveItem(i, ±1)` (`sectionMenu.jsx:416-421`) only reorders **within** a page;
   `handlePaste` (`section_utils.js`) strips `id` and `ref`, so a paste creates a new row; and
   `duplicatePage`, `publish` and `discardChanges` all `delete s.id`. Nothing moves a component row
   between pages, so no `_dirty` gap exists on that path.

   What the 53% actually comes from is **`newPage(…, template)`**, which clones
   `template.draft_sections` without deleting `s.id` — so the new page names the template's own
   component rows. Raised as
   [page-from-template-shares-section-rows.md](./page-from-template-shares-section-rows.md). The
   reconciler reports it as *named by 2+ owners*; the migration repairs it.

3. **`data.parent` — two different fields sharing a name** (owner, 2026-10-29). Swept across
   `packages/dms/src`, the host themes and the server:

   | | |
   |---|---|
   | **on a PAGE row** | the nav / URL tree, and **load-bearing** |
   | **on a COMPONENT row** | **write-only** — written, never read |

   A page's `parent` is a declared, author-editable attribute (`page.format.js:9-24,181-187`,
   `joinKey: 'parent'`) and is read by: the nav tree (`utils/nav.js:52,85`), root-page detection and
   URL-slug/breadcrumb resolution (`pages/_utils/index.js:75,81,118-121`,
   `settingsPane.jsx:568-571,593`), page sort order (`page.format.js:132`), child-page creation and
   sibling indexing (`editFunctions.jsx:13,20,31,70-79,117`), "the root page"
   (`api/index.js:88`, `preloadSectionData.js:221`, `dms-manager/_utils.jsx:92`), tree walks for
   export and the footer (`ExportPdf.jsx:88,110`, `footer.jsx:36`), four TransportNY theme
   components — **and the server**, in `page.format.js:128`'s `defaultSearch`
   (`data ->> 'parent'`) and `dms.controller.js:1055` (`data->>'parent' AS page_parent`). It stays.

   A component's `parent` is written in exactly two places — `sectionArray.jsx:369` and `:405`, the
   sync and plain branches of section create — and **read by no client code**. Method, since the
   claim is only worth as much as the search: `['parent']`, `["parent"]`, `?.['parent']` and
   `{… parent …} =` destructuring return **zero** hits across `packages/dms/src`,
   `packages/dms/cli`, `src/patterns` and `src/themes`, so dot access is the whole surface — 117
   hits, every one a page/nav read, a d3 hierarchy node (`TreemapGraph`, `SunburstGraph`,
   `HoverComps`), or commander's `this.parent` in the CLI's `node_modules`.

   **One thing that is not a read but looks like one.** The component format itself declares two
   attributes that would resolve it — `cmsSection.parent` and `cmsSection.url_slug`
   (`page.format.js:9-30`), both `joinKey: 'parent'`, `valueKey: 'title'` / `'url_slug'`,
   `serverFn: 'recurse_extract_data'`. They are inert three times over: `recurse_extract_data` has
   no implementation anywhere; `joinKey`/`serverFn` are honoured only by the UDA dataset pipeline
   (`buildUdaConfig`, `uda.colorDomain.controller.js`), never for `data_items`; and `dms.formats`
   holds 0 rows, so the server never sees the declaration. **Delete these two with the writes** —
   left in place, they are a wired-up reader waiting for someone to implement the `serverFn`, and
   what it would read is the field measured 52.6% wrong.

   On the server, `data.parent` is only `parentIdOf`'s unmigrated fallback, which a migrated app
   never reaches because the projection selects no `data`. (`dms.controller.js:1055`'s
   `data->>'parent' AS page_parent` is the search query reading a PAGE's parent; it joins sections
   through the page's `sections` array, not through any component's `parent`.)

   **Done 2026-10-29.** The field is gone from every write and every read:

   | | |
   |---|---|
   | `sectionArray.jsx:369, :405` | the two writes, sync and plain branches of section create |
   | `page.format.js:7-29` | `cmsSection.parent` and `cmsSection.url_slug`, the inert declarations |
   | `rowAuth.js` `parentIdOf` | the three-encoding fallback; it is now the column and nothing else |
   | `dms-duplicate.js` | `remapParentRef` and the rebuild that called it (see below) |
   | `useAddGraphSection.js:115` | a **fourth** writer, in the TransportNY theme — Add Graph Section mirrored `sectionArray`'s stamp |
   | `editFunctions.jsx:42` | the dead `// delete s.parent; // todo` |
   | `section_utils.js` | `parent` added to paste's identity-key list, so an old clipboard payload cannot put one back |

   Three things the first sweep missed, found by re-running it before deleting:

   - **`dms-duplicate.js` was a third writer**, and the careful one — it rebuilt `parent` from the
     page that actually listed each component, because copying the stored pointer had corrupted
     1,081 of 2,248 clones. It is simply unnecessary now: step 3 of the duplicate patches each
     cloned page's section list through `setDataById`, which fires `stampChildren`, so the clones
     get `parent_id` for free. `test-duplicate-refs.js` lost its seven `remapParentRef` cases and
     keeps its four `remapSectionRefs` ones.
   - **`useAddGraphSection.js` was a fourth writer**, in `src/themes/transportny`. The original
     sweep searched `packages/dms/src`, the themes and the server for *readers*, and for writers
     only inside `packages/dms/src` — so a theme that copied `sectionArray`'s idiom was outside
     it. Caught by grepping `parent: JSON.stringify` across both trees at the end.
   - **`rowAuth.js:161` was the only live reader anywhere** — the unmigrated fallback, which is why
     this was gated on migrating. The gate turned out to be soft: `DMS_ROW_AUTH_MODE` defaults to
     `log`, which allows everything, so on an unmigrated app the removal changes would-deny log
     lines and no access decision. What it does change is that such an app now resolves a component
     through the **type path**, which reaches its pattern but skips its page. That is quieter than
     it should be, so `rowAuthCaps` now logs once per table when `parent_id` is absent, naming the
     consequence and the command. `authColumns` stopped selecting `data` for parentage at the same
     time — `data` is now the **grants** fallback only, so a table with `auth` but no `parent_id`
     no longer drags ~10KB of jsonb per row into the resolver.

   **Existing rows:** `migrate-row-auth.js --drop-data-parent`. It touches only a kind that is a
   declared child and is **not itself an owner** — the same `deletable` set the orphan sweep uses.
   That is the whole safety of it: a page owns components, so a page is never in the set, so the
   nav tree cannot be reached from there however a pattern declares itself. It also requires
   `parent_id IS NOT NULL`, so a row the migration could not resolve keeps the old field rather
   than losing the only record of what it claimed.

   Run on `rowauth-test` 2026-10-29: **33,402 components dropped, 0 kept, 469 pages untouched**
   (`component 33402→0`, `page 469→469`). `--verify-parents` after: **CLEAN, exit 0**, and the
   chain census is byte-identical to the pre-drop run — 10,785/33,967 reach a root (31.8%), max
   depth 3. Nothing resolved differently once the field was gone, which is the point.

   `tests/test-row-auth.js` was re-fixtured onto the column (25 → 30 cases): the three encodings
   now assert that each is **ignored**, plus a resolve case proving a row with a leftover
   `data.parent` and no column goes up the type path rather than to the page the dead pointer names.
4. ~~**The sweep the owner has called for**~~ — **copy/paste/duplicate swept 2026-10-29.** See
   [copy-paste-duplicate-section-identity.md](./copy-paste-duplicate-section-identity.md) for the
   full table of paths. Two produced shared rows and both are fixed (`newPage(…, template)` and
   the TransportNY `buildNewReportPage`); paste was leaking `trackingId` and is fixed. 13 vitest
   cases in `packages/dms/tests/sectionCopyIdentity.test.js`, 3 of which fail without the fixes.

   **The other half — "must stop leaving components no page lists" — is done too**, by
   `sweepRemovedChildren` above, and it turned out not to be the client's problem at all. The fix
   belongs on the server because the reference check it needs (is this row still named by any of
   its owner's arrays? is this owner still its recorded parent?) is exactly what `parent_id` plus
   the declaration already answer, in the transaction that is writing the array anyway. Doing it in
   `sectionArray.jsx`'s `remove()` would have handled one of the three mechanisms, and not the one
   producing thousands of rows.

   `updateDMSAttrs`'s `// to do, handle delete` can go when the sweep is in `delete` mode
   everywhere; leaving it is harmless, since the server now does the deleting.

## Production is task 8, and it is a cutover (owner, 2026-10-29)

All four items above are done, and **none of this reaches a production app yet.** The owner's call:
finish and prove the whole programme on the row-auth database (`dms_rowauth_test`, app
`rowauth-test`) first; shipping behind flags is the intended shape; and prod then moves in **one**
operation rather than as a sequence of independently-shipped steps.

That retires the three-step sequence this file previously implied — "add the columns, backfill,
then flip the modes per app as confidence grows". Half-migrated is the worst of the three states:
a component resolves through the type path, which reaches its pattern and **skips its page**, so a
page's own restriction does not reach its sections. Silent, and open in the dangerous direction.

The runbook, the entry criteria, what is reversible and what is not, and prod's measured starting
numbers are in **[row-auth-production-cutover.md](./row-auth-production-cutover.md)**. Work on this
file stays on `rowauth-test`.
