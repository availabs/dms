# Schema drift: `create_*.sql` changes never reach existing databases

**Status:** COMPLETE — implementation and SQLite verification.
Two live-Postgres checks are deferred to the WCDB migration task (below).
**Completed:** 2026-08-13
**Created:** 2026-08-13
**Topic:** dama (also touches dms + auth migrations — the mechanism is shared)

## Objective

Close the gap where a column added to a `create_*.sql` script reaches new
databases but never existing ones, and add a guard so it cannot silently recur.

Found in the field: publishing a `csv_dataset` to the long-lived `wcdb-dama`
pgEnv fails with

```
500 {"error":"column \"auth_permissions\" of relation \"sources\" does not exist"}
```

after the upload and layer analysis have already succeeded.

## Scope

**In scope**
- The missing `auth_permissions` migration for `data_manager.sources`.
- An audit of every `create_*.sql` against its `migrate_*.sql` counterpart
  across `sql/dama`, `sql/dms`, `sql/auth`, both Postgres and SQLite variants.
- A regression guard that fails when the two drift apart again.
- Deciding what, if anything, to do about `migrate_auth_core.sql` and
  `migrate_dms_core.sql`, which are *called* but do not exist.

**Out of scope**
- A general versioned migration framework (`_migrations` table, up/down, ordering).
  The existing idempotent-file approach is adequate; this task makes it correct
  and enforced, not more elaborate.
- Repairing already-drifted deployments beyond documenting the check — operators
  run the fixed init.

## Current State

### The mechanism already exists and is wired

`packages/dms-server/src/db/index.js` has `runMigrationFile(dbConnection, sqlDir, baseName)`
(~line 34), whose own docstring states the rule exactly:

> The `create_*.sql` scripts only run on a fresh database (they sit behind a
> `tablesExist` guard), so schema changes that must reach EXISTING databases
> belong in a `migrate_*.sql` file instead. These run on every init, so every
> statement must be safe to re-run.

It is called for three subsystems, migrations last so the tables exist:

| Call site | File | Exists? |
|---|---|---|
| `index.js:491` | `sql/dama/migrate_dama_core` | yes (Postgres only) |
| `index.js:505` | `sql/auth/migrate_auth_core` | no |
| `index.js:533` | `sql/dms/migrate_dms_core` | no |

> **Corrected during implementation.** `migrate_dms_core.sql` and its `.sqlite`
> variant *do* exist — they were written the same day this task was scoped and
> were still uncommitted when the table above was drafted, so the check that
> produced it was simply too early. Both already carry the `change_log` audit
> columns and `page_visits`. `sql/auth` really has no migrate file, and the
> audit below shows it needs none.

A missing file is deliberately not an error (`ENOENT` returns quietly), so the
two absent ones are silent no-ops.

### The defect

`migrate_dama_core.sql` exists but contains exactly one statement — dropping a
stale `views_etl_ctx_id_fkey` constraint. **`auth_permissions` was never added
to it.**

Traced to a single commit:

```
a8a68808  2026-06-29  "changes"
  packages/dms-server/src/db/sql/dama/create_dama_core_tables.sql        | 1 +
  packages/dms-server/src/db/sql/dama/create_dama_core_tables.sqlite.sql | 1 +
```

Both **create** scripts, **neither migrate** file. So the pattern was in place
and simply not followed — this is a process gap with no guard behind it, not a
missing capability.

`git log -S` over `create_dama_core_tables.sql` shows `auth_permissions` is the
only column added after the table's original definition, so for `sql/dama` the
known drift is one column. The other two subsystems have never been audited
because they have no migrate file at all.

### Observed impact

`wcdb-dama`, diffed against the canonical DDL:

| Table | Live | Canonical | Drift |
|---|---|---|---|
| `data_manager.sources` | 14 cols | 15 | **`auth_permissions` missing** |
| `data_manager.views` | 23 cols | 23 | none |

The failure surfaces late and confusingly: the upload, `layerNames` and
`layerAnalysis` all succeed, and only `csv-dataset/publish` — the step that
INSERTs into `data_manager.sources` (`dama/upload/metadata.js:54` names
`auth_permissions` in its column list) — 500s. Anything reading
`auth_permissions` is affected the same way: `routes/uda/sourceAuth.js:65`
selects it directly, and `uda.route.js:127` gates edit-permission on it.

**No SQLite variant.** `migrate_dama_core.sqlite.sql` does not exist, so SQLite
dama environments receive no migrations whatsoever. `runMigrationFile` already
handles the SQLite quirk that there is no `ADD COLUMN IF NOT EXISTS` (it catches
duplicate-column errors per statement), so the variant is cheap to add.

## Proposed Changes

### 1. Fix the known drift
Add to `sql/dama/migrate_dama_core.sql`, matching `create_dama_core_tables.sql:31`
verbatim:

```sql
ALTER TABLE data_manager.sources
    ADD COLUMN IF NOT EXISTS auth_permissions JSONB DEFAULT '{}'::jsonb;
```

Add `sql/dama/migrate_dama_core.sqlite.sql` with the SQLite equivalent (no
`IF NOT EXISTS`; the runner already tolerates the duplicate-column error).

### 2. Audit the other two subsystems
`sql/dms/dms.sql`, `sql/dms/change_log.sql`, `sql/dms/dms_tasks.sql` and
`sql/auth/auth_tables.sql` have never had a migrate counterpart. Walk their git
history the same way (`git log -S` per column) and write whatever is missing
into new `migrate_dms_core.sql` / `migrate_auth_core.sql` (+ `.sqlite.sql`).
If a subsystem turns out to have no post-creation additions, say so in this file
rather than leaving the absence ambiguous.

### 3. A guard so this cannot recur
The real fix is that nothing catches it. Options, cheapest first:

- **A test that diffs create vs migrate.** Parse the `CREATE TABLE` column lists
  out of each `create_*.sql`, apply the `ALTER TABLE … ADD COLUMN` statements
  from the matching `migrate_*.sql` to a fresh database created from an *older*
  schema, and assert the result matches a database created fresh from
  `create_*`. `packages/dms-server/tests/` already has a stub-DB pattern to
  follow (`test-datatypes.js`, `test-schedules.js`).
- **Simpler**: boot two databases in the pg test path — one from `create_*`,
  one from `create_*` minus recent columns, then run init on both — and compare
  `information_schema.columns`. Catches drift without parsing SQL.
- **Weakest but still useful**: a documented checklist item in
  `planning-rules.md` — "adding a column to a `create_*.sql` requires the same
  statement in the matching `migrate_*.sql`". Do this *as well as*, not instead
  of, a test.

### 4. Make the failure legible
`initDama` logs `dama migrations failed: <msg>` and continues. That is right —
a broken migration should not take the server down — but nothing surfaces a
database that is *missing* migrations it should have had. Consider a startup
warning when a known-required column is absent, or at minimum have the publish
worker's error name the likely cause.

## Files Requiring Changes

| File | Change |
|---|---|
| `dms-server/src/db/sql/dama/migrate_dama_core.sql` | add the `auth_permissions` ALTER |
| `dms-server/src/db/sql/dama/migrate_dama_core.sqlite.sql` | **new** — SQLite variant |
| `dms-server/src/db/sql/dms/migrate_dms_core.sql` (+ `.sqlite.sql`) | **new**, if the audit finds drift |
| `dms-server/src/db/sql/auth/migrate_auth_core.sql` (+ `.sqlite.sql`) | **new**, if the audit finds drift |
| `dms-server/tests/test-schema-drift.js` | **new** — the guard |
| `src/dms/planning/planning-rules.md` | the create/migrate rule, if §3's checklist option is taken |

## What Was Done

### The audit (complete)

Method: for every create script, `git log --oneline -- <file>` to count commits,
then diff every commit except the one that created it. A create script with a
single commit has, by construction, no post-creation drift.

| Create script | Post-creation changes | Migrated? |
|---|---|---|
| `dama/create_dama_core_tables.sql` | `auth_permissions` (a8a68808) · postgis (ad07536c) | **now yes** — both added |
| `dama/create_dama_core_tables.sqlite.sql` | `auth_permissions` (a8a68808) | **now yes** — new `.sqlite` variant |
| `dama/create_dama_task_tables.{sql,sqlite.sql}` | `attempt`, `max_attempts`, `schedule_id` (7af54457) | yes — already retrofitted in JS, see below |
| `dama/create_dama_schedule_tables.*` | none | n/a |
| `dms/change_log.{sql,sqlite.sql}` | audit columns + `page_visits` (7e6a9e4c) | yes — already in `migrate_dms_core` |
| `dms/dms.sqlite.sql` | `dms_id_seq` (0b27c67b) · `idx_data_items_tags` (d62b4f36) | **now yes** — added to the `.sqlite` variant |
| `dms/dms.sql`, `dms/dms_tasks.*` | none | n/a |
| `auth/auth_tables.{sql,sqlite.sql}` | **none** | n/a — no migrate file needed |

**`sql/auth` needs no migrate file.** Both auth create scripts have exactly one
commit each: they have not changed since `df407e55`. That is the audited answer
the Scope asked for, not an unexamined absence.

### Two findings that changed the plan

**1. The tasks columns were already handled — in JS, deliberately.** The plan
called for adding `attempt` / `max_attempts` / `schedule_id` to
`migrate_dama_core.sql`. That would have been wrong. `initDamaSchedules`
already retrofits them inline, and it has to:
`create_dama_schedule_tables.sql` ends with
`CREATE INDEX … ON data_manager.tasks (schedule_id)`, so the columns are a
*prerequisite* of a create script and must exist **before** it runs, whereas
migrations run after everything. They were briefly added and then removed; both
migrate files now carry a comment explaining why they are absent, and the guard
records them in an explicit `retrofitted` exemption list so the reason survives.

**2. `migrate_dms_core.*` already existed.** See the correction above. The dms
subsystem needed only the two SQLite-only items.

### The guard — `tests/test-schema-drift.js`, 21 checks

Three layers, plus a coverage check:

- **Coverage** — the test's own list of create scripts must match what is on
  disk, so a newly added script cannot quietly fall outside the guard.
- **Completeness** (static) — any table/column not in
  `tests/fixtures/schema-baseline.json` must have a matching statement in the
  sibling migrate file. Failures print the exact `ALTER TABLE` to add.
- **Applicability** (real SQLite) — builds a database from the create scripts
  *in init order*, rewinds it to its pre-migration shape using the migrate file
  as the description of what is new, runs the migrations, and asserts it comes
  back column-for-column identical to a fresh one. Then runs them again and
  asserts nothing changed.
- **Self-check** — five synthetic cases proving the checker reports drift when
  it should, including that a commented-out migration does not count.

The baseline is defined as **the create-script schema minus everything the
migrations supply**, not simply "the current schema". This matters: with the
naive definition a column would leave the guard's scope the moment its migration
was written, so deleting that migration later would go unnoticed. Subtracting
keeps every migrated column permanently under guard.

### Deviations from the plan

- **`planning-rules.md` was not touched.** Proposed change 3 offered a
  documentation checklist as the weakest option. The rule now lives in
  `dms-server/CLAUDE.md` (with a worked example and the full contract) and in
  `tests/CLAUDE.md`, which is where someone editing a `.sql` file will meet it;
  `planning-rules.md` governs planning workflow, not code conventions.
- **Proposed change 4 (surface missing migrations at startup) was reframed.**
  Rather than add a startup warning for a hardcoded list of expected columns —
  which would need updating for every future column and would warn about a
  condition the migrations now fix automatically — the noise problem was fixed
  at its source: `runMigrationFile` now checks `pragma_table_info` before a
  SQLite `ADD COLUMN` instead of letting it throw. Every server start was
  logging red `Query error: duplicate column name` lines that were not errors,
  which is precisely how a genuine failure in this file would have been missed.
  The catch remains as a backstop.

### Verification performed

Both regressions were injected into the real files and the guard confirmed to
fail on each, then reverted:

```
# 1. a new unmigrated column in create_dama_core_tables.sql
✗ dama/postgres: 1 unmigrated change(s) in sql/dama (postgres).
      ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS retention_policy …;
exit code: 1

# 2. deleting the auth_permissions migration — i.e. reproducing a8a68808
✗ dama/postgres: 1 unmigrated change(s) in sql/dama (postgres).
      ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS auth_permissions …;
exit code: 1
```

`npm test` (now including this guard) passes: sqlite, controller, graph,
workflow, delete-cascade 11/11, schema-drift 21/21.

**What could not be verified here.** This machine has neither Docker nor a
running Postgres server (only the `psql` client), so `npm run test:pg` cannot
run and no Postgres dama env could be stood up. The Postgres migration is
therefore verified by inspection — each statement is copied verbatim from the
create script it mirrors, and the static half of the guard covers both dialects
— while the live rewind/re-apply/idempotency evidence is SQLite only. The
remaining two checklist items are the Postgres end-to-end confirmation and are
performed naturally by the WCDB migration, which publishes to a real
`wcdb-dama`. Applying this to that database is a live schema change and is
left as the operator's call, not done here.

## Testing Checklist

- [x] A database created from an older schema, then re-inited, gains
      `auth_permissions` — verified by `information_schema.columns`, not by the
      absence of an error.
- [x] Re-running init a second time is a no-op (the migration is idempotent).
- [x] The SQLite variant runs clean on a fresh SQLite dama env **and** on one
      that already has the column.
- [ ] `csv-dataset/publish` succeeds against a previously-drifted Postgres env —
      this is the reproducer that started this task (`wcdb-dama`). **Still open:
      needs a running Postgres dama env.** Verified equivalently on SQLite; the
      end-to-end confirmation happens when the WCDB migration is unblocked.
- [ ] `sourceAuth.js` permission checks and `uda.route.js:127`'s edit gate work
      on a migrated env. **Still open** — same dependency as above.
- [x] The drift guard **fails** when a column is added to a `create_*.sql` with
      no matching migrate statement — assert the guard catches a deliberate
      regression, don't just watch it pass.
- [x] The dms + auth audits are recorded in this file, including "no drift
      found" if that is the answer.

## Notes

Reported from `project-planning/wcdb/tasks/current/migrate-wcdb-datasets-to-pgenv.md`,
which is blocked on the `wcdb-dama` instance of this. That task can be unblocked
by hand (`ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS
auth_permissions JSONB DEFAULT '{}'::jsonb;`) without waiting for this one — but
every other long-lived pgEnv has the same latent problem.
