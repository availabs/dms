# Read-only DAMA configs: a server that reads a shared DAMA database and never changes it

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** built · **Release:** deploy — `f8979f3f` is on GitHub (dms master); preview stacks and the tenant hub (dms `966457da`, live 2026-11-09) run it. Waits only on a production server deploy (not checked whether one has run since 2026-11-05), and nothing changes there until a config sets `readOnly` · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Topic:** dms-server · **Started:** 2026-11-05 · Site half (why it exists):
[preview-stacks.md](../../../../../planning/shared/tasks/current/preview-stacks.md), step 2

## Objective

A preview stack is a second dms-server with its own copy of the content and auth databases. It still has to read
production's DAMA databases (external datasets such as `npmrds2` plus ClickHouse, `hazmit_dama`, `landbank_dama`),
because those are terabytes and aren't copied. The owner's rule is that a stack can never change anything outside
itself, so the server needs a way to open a DAMA database read-only.

## Current state (read 2026-11-05)

At boot the server opens every `role: "dama"` config it finds (`src/index.js:325-347`, `findConfigsByRole`):
- **Schema work:** `getDb` runs `initDama`, `initDamaTasks`, `initDamaSchedules` and `migrate_dama_core.sql` on each
  (`src/db/index.js:347-371`).
- **Jobs:** then it runs `recoverStalledTasks`, `startPolling` and `startScheduleSweep` on each.
- **Failures:** each one is caught and logged. A server with a read-only database user would start, but every boot
  would log a run of DDL and permission errors, and its safety would be an accident.
- **Other connections:** workers open their own connections with `new pg.Client(getPostgresCredentials(env))`, which
  is `loadConfig`, outside the adapter's pool. Two of them name production's DMS config outright
  (`getPostgresCredentials("dms-mercury-3")` in `data-types/mny/actions_location/worker.js:51` and
  `actions_cleaned/worker.js:143`).

## Changes (built 2026-11-05)

**A config field, `"readOnly": true`:**
- **`src/db/config.js` `loadConfig`:**
  - `readOnly` must be a boolean. Only a postgres config whose role is just `"dama"` may set it; a DMS or auth
    database has to be writable.
  - A read-only config gets `-c default_transaction_read_only=on` added to its connection `options`, keeping any it
    already has. Every connection made from the config is then read-only: the adapter's pool, `getClient`, and a
    worker's own `pg.Client` from `getPostgresCredentials`.
  - New `isReadOnly(env)`: true for a read-only config, false for a writable one or one that can't be loaded (so its
    caller keeps its usual handling).
- **`src/db/index.js` `getDb`:** a read-only config skips the dama init and migrations, and logs one line saying so.
- **`src/index.js` boot:** no task recovery, polling or schedule sweep for a read-only config, and one log line naming
  them. `queueTask` on a read-only database fails at its INSERT, before it would start polling
  (`src/dama/tasks/index.js:53-64`).

**Not covered by the flag:**
- **ClickHouse:** dms-server has no ClickHouse write path, and the loads that write it run as DAMA tasks, which a
  read-only config doesn't start. A stack's ClickHouse settings should still use a `readonly = 1` user (site task,
  step 5).
- **Hardening:** `default_transaction_read_only` guards against mistakes, not intent, since a session can `SET` it off.
  A read-only database user is the real enforcement (site task, step 5).
- **Hard-coded config names:** a stack must not have `dms-mercury-3` or any other production config that isn't
  `readOnly` (site task: its image is built without the checkout's configs).
- **Reads that also write:** if any DAMA read path also writes, it fails on a read-only config. None is known; the
  site task's step 3 watches the server log for "read-only transaction" while browsing.

**Not needed for preview stacks:** the background-jobs switch
([server-background-jobs-switch.md](./server-background-jobs-switch.md)). A stack's DMS tasks and change-log compaction
run on its own databases, which is wanted. That task stays the fix for `deploy.sh`'s staging container.

## Files

- `packages/dms-server/src/db/config.js`: `readOnly` validation and connection options; `isReadOnly`; doc comment.
- `packages/dms-server/src/db/index.js`: `getDb` skips init for a read-only config.
- `packages/dms-server/src/index.js`: no jobs for read-only configs.
- `packages/dms-server/tests/test-dama-readonly.js`: new. `npm run test:pg:dama-readonly`.
- `packages/dms-server/package.json`: that script.
- `packages/dms-server/CLAUDE.md`, `tests/CLAUDE.md`: the field and the test.
- `packages/dms-server/tests/postgres-docker.js` (2026-11-05, after the commit): `stop()` removes the container with
  `-v`, so a `test:pg` run doesn't leave the image's anonymous data volume behind.

## Testing

- [x] `npm run test:pg:dama-readonly` (Docker Postgres 17): **21 passed, 0 failed**, 2026-11-05. It covers:
  - the config rules;
  - `isReadOnly`;
  - no init on an empty database (`data_manager` isn't created);
  - CREATE TABLE, DDL inside `withTransaction`, INSERT, UPDATE and DELETE are refused with "read-only transaction";
  - reads work, including a row a writable config on the same database wrote;
  - a worker's `pg.Client` from `getPostgresCredentials` is read-only;
  - control: the writable config does run the init.
- [x] `npm test` (SQLite suite): every suite passed, 2026-11-05.
- [ ] The boot path (`src/index.js`) runs in the site task's step 3. Its server log should show "dama init skipped" and
      "No task recovery, polling or schedules for read-only" for the stack's DAMA configs, and no "read-only
      transaction" errors at boot.
