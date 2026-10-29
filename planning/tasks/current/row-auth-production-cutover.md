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
