# DMS Task System (independent of DAMA)

## Status: NOT STARTED

## Objective

Give DMS its own task queue and events infrastructure, parallel to but independent of `data_manager.tasks` / `data_manager.task_events`. This lets internal_table publishes (and any future DMS-native workers) record task rows and progress events without requiring a DAMA pgEnv. The admin task list on internal_table sources then has something to show even for patterns that have no external pgEnv configured.

## Background

Current state (late April 2026):
- Internal dataset publishes (`internal_table`) post to the sync handler `POST /dama-admin/dms/:appType/publish` (in `packages/dms-server/src/dama/upload/routes.js`). The handler iterates rows and calls `controller.createData` inline. No task row is created.
- The existing task system in `packages/dms-server/src/dama/tasks/` writes exclusively to `data_manager.tasks` / `data_manager.task_events`, which live in DAMA pgEnvs (postgres only).
- UDA task routes (`uda[pgEnv].tasks.*`) read from DAMA. `UdaTaskList` in the client uses `getExternalEnv(datasources)` to pick pgEnv, so patterns without an external pgEnv show nothing.
- Internal tables store their row data in DMS split tables (`dms_{app}.data_items__s{sourceId}_v{viewId}_{slug}` in per-app PG, or equivalent in SQLite). They shouldn't depend on DAMA being present at all.

Design principle reaffirmed with the user: **DMS and DAMA are independent systems. DAMA is optional.** Internal-table tasks must work with DMS alone.

## Design principle: maximum structural parity with DAMA tasks

Per user direction: the DMS task system should **mirror DAMA's design as closely as possible**. Same module surface, same schema, same concurrency primitives, same UDA route shape. The only intentional deltas are:

1. **Target database** — DMS db (via `process.env.DMS_DB_ENV`) instead of a DAMA pgEnv.
2. **`app` column on the task row** — DAMA puts one task table per pgEnv, so it doesn't need to scope rows by app. DMS shares one db across many apps, so we add `app` to filter list queries. All other columns identical.

Everything else — polling, `claimNextTask` / `claimTaskById`, `FOR UPDATE SKIP LOCKED` / `BEGIN IMMEDIATE`, forked worker runner, host isolation, `registerHandler`, `dispatchEvent`, `completeTask` / `failTask`, stalled-task recovery — is ported verbatim with its DAMA semantics. Even if the first consumer (internal_table publish) runs inline, the infrastructure is ready for forked DMS workers later.

## Scope

**IN scope**
- New tables `dms.tasks` and `dms.task_events` in the DMS database (shared across apps, `app` column distinguishes)
- `dms_tasks.sql` + `dms_tasks.sqlite.sql` schema scripts, wired into `initDms` via a new `initDmsTasks`
- New module `packages/dms-server/src/dms/tasks/` that exposes the same surface as `packages/dms-server/src/dama/tasks/`: `hostId`, `registerHandler`, `queueTask`, `claimTaskById`, `claimNextTask`, `startTaskWorker`, `dispatchEvent`, `updateTaskProgress`, `completeTask`, `failTask`, `getTaskStatus`, `getTaskEvents`, `recoverStalledTasks`, `startPolling`, `stopPolling`. Signatures drop the `pgEnv` arg (DMS has a single target db resolved from `DMS_DB_ENV`) and gain an `app` on the write-side signatures
- Parallel `worker-runner.js` in `src/dms/tasks/`, pointing at the DMS db
- UDA tasks route dispatch: env containing `+` (DMS `app+instance`) routes to the DMS task module; env without `+` (DAMA pgEnv) keeps existing DAMA behavior. Same Falcor path `uda[env].tasks.*` end to end — clients don't see the split
- Wrap the existing sync internal_table publish handler so it creates a DMS task row at start, dispatches events during, and marks done/error at end
- Client `UdaTaskList` takes an `env` prop with fallback to `getExternalEnv(datasources)`. internal_table admin passes the DMS env, external admin passes the DAMA pgEnv
- On server boot, auto-start DMS task polling + recover stalled DMS tasks the same way DAMA does per-pgEnv

**OUT of scope**
- Per-app schema sharding for DMS task tables — one shared `dms.tasks` with an `app` filter is enough; matches DAMA's one-table-per-pgEnv shape
- Forking a real worker process for the first consumer (internal_table publish). The inline wrap is enough for observability, and the forked-worker primitives are in the module ready to use when we add a heavier DMS worker
- Removing or migrating `data_manager.tasks` — DAMA tasks stay where they are
- Changing any DAMA-side behavior

## Design

### Schema (new)

Add two tables to the DMS schema, matching the DAMA shape so the UDA routes can share query logic:

```sql
-- dms_tasks.sql (or folded into dms.sql and change_log.sql equivalents)
CREATE TABLE IF NOT EXISTS dms.tasks (
  task_id      bigserial PRIMARY KEY,
  host_id      text NOT NULL,
  source_id    integer,                     -- optional: the DMS row id this task is about
  app          text,                        -- optional: partition by app for list queries
  worker_path  text NOT NULL,               -- e.g. 'internal-table/publish'
  status       text NOT NULL DEFAULT 'queued',   -- queued | running | done | error
  progress     real DEFAULT 0,
  result       jsonb,
  error        text,
  descriptor   jsonb,
  queued_at    timestamptz DEFAULT now(),
  started_at   timestamptz,
  completed_at timestamptz,
  worker_pid   integer
);
CREATE INDEX IF NOT EXISTS ix_dms_tasks_source ON dms.tasks (source_id);
CREATE INDEX IF NOT EXISTS ix_dms_tasks_app    ON dms.tasks (app);
CREATE INDEX IF NOT EXISTS ix_dms_tasks_status ON dms.tasks (status);

CREATE TABLE IF NOT EXISTS dms.task_events (
  event_id   bigserial PRIMARY KEY,
  task_id    bigint NOT NULL REFERENCES dms.tasks(task_id) ON DELETE CASCADE,
  type       text NOT NULL,
  message    text,
  payload    jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dms_task_events_task ON dms.task_events (task_id);
```

Add a `.sqlite.sql` sibling for the SQLite variant (BIGINT → INTEGER PK, JSONB → TEXT, timestamptz → TEXT DEFAULT (datetime('now')), etc.) — follow the existing `change_log.sql` / `change_log.sqlite.sql` pairing.

**Split mode note**: tables stay in the shared `dms` schema (PG) / `main` (SQLite) regardless of split mode. The `app` column on `dms.tasks` lets us filter per-app without needing per-app task tables.

### DMS task module

New file `packages/dms-server/src/dms-tasks/index.js` that mirrors `dama/tasks/index.js`'s signature but targets the DMS db:

```js
const { getDb } = require('#db/index.js');

function dmsDbEnv() {
  return process.env.DMS_DB_ENV || 'dms-sqlite';
}

async function queueTask({ workerPath, sourceId = null, app = null, descriptor = {} }) {
  const db = getDb(dmsDbEnv());
  // INSERT INTO dms.tasks (...) VALUES ('queued', ...) RETURNING task_id
}

async function dispatchEvent(taskId, type, message, payload) { ... }
async function completeTask(taskId, result) { ... }
async function failTask(taskId, error) { ... }
async function getTaskStatus(taskId) { ... }
async function getTaskEvents(taskId, sinceEventId = 0) { ... }
async function listTasksForSource(sourceId, { limit, offset }) { ... }
async function listTasks({ app, limit, offset }) { ... }
```

No polling, no worker-runner, no host isolation — those only matter for forked workers, which we're deliberately leaving out of the MVP. The task rows are created and completed inline by the handler that owns the work.

Optional small helper: `runAsTask({ workerPath, sourceId, app, descriptor }, fn)` that creates the task row, runs `fn({ dispatchEvent, updateProgress })`, and marks done/error based on whether `fn` throws. Keeps the publish handler clean.

### UDA route dispatch

The current tasks route is in `packages/dms-server/src/routes/uda/uda.tasks.route.js` and its controller `uda.tasks.controller.js`. It matches `uda[{keys:envs}].tasks.*` and queries DAMA.

Extend the controller so that when env contains `+` (= DMS), it delegates to the new `src/dms-tasks/` module instead of reading `data_manager.tasks`. Pattern:

```js
function isDmsEnv(env) { return typeof env === 'string' && env.includes('+'); }

async function getTasksLength(env) {
  if (isDmsEnv(env)) {
    const [app] = env.split('+');
    return dmsTasks.listTasksCount({ app });
  }
  return damaTasks.listTasksCount(env); // existing behavior
}
```

Same split for `tasks.byIndex`, `tasks.byId`, `tasks.forSource[id].*`, `tasks.byId[id].events.*`. The Falcor shape stays identical — consumers don't know whether they're talking to DMS or DAMA.

### Client

`packages/dms/src/patterns/datasets/pages/Tasks/UdaTaskList.jsx` currently does:

```js
const pgEnv = getExternalEnv(datasources);
```

Change to: accept a prop `env` (the UDA env to query) with a fallback to the external pgEnv for DAMA call sites. Then:
- `internal/pages/admin.jsx` (isDms=true): passes `env={`${app}+${patternInstance}`}`
- `default/admin.jsx` (isDms=false): passes `env={getExternalEnv(datasources)}` (or just keeps the default)

With this, the admin page shows DMS tasks for internal_tables and DAMA tasks for external sources, with no DAMA dependency on the internal side.

### Sync publish integration

In `packages/dms-server/src/dama/upload/routes.js`, wrap the existing publish body with `runAsTask`:

```js
const dmsTasks = require('../../dms-tasks');

async function publish(req, res) {
  const { appType } = req.params;
  const [app, type] = appType.split('+');
  const { sourceId } = req.body;

  // ...existing validation...

  try {
    const { taskId, result } = await dmsTasks.runAsTask(
      {
        workerPath: 'internal-table/publish',
        app,
        sourceId: sourceId ? Number(sourceId) : null,
        descriptor: { gisUploadId, layerName, columnCount: columns.length, type },
      },
      async ({ dispatchEvent, updateProgress }) => {
        await dispatchEvent('publish:start', `Publishing ${rows.length - 1} rows`, null);
        // ...existing per-row insert loop, occasional updateProgress + dispatchEvent on errors...
        await dispatchEvent('publish:done', `${created} created, ${updated} updated, ${errors} errors`, counts);
        return counts;
      }
    );
    res.json({ task_id: taskId, data: result.results });
  } catch (e) {
    res.json({ err: e.message });
  }
}
```

If task insertion itself fails (e.g., `dms.tasks` table doesn't exist yet on an un-migrated DMS db), fall through to the legacy sync-only behavior — don't make publish a hard dependency on the task tables until init is guaranteed.

## Implementation phases

1. **Schema + init.** New SQL scripts, `initDmsTasks` wired into the dms-role init chain in `db/index.js`. Verify tables exist after server boot on both PG and SQLite.
2. **Task module.** Port `packages/dms-server/src/dama/tasks/index.js` → `packages/dms-server/src/dms/tasks/index.js` with the db-target swap and `app` column on inserts. Port `worker-runner.js` alongside. Drop `pgEnv` from signatures (single target db). On server boot, `recoverStalledTasks()` + `startPolling()` once for DMS.
3. **UDA route dispatch.** Update `uda.tasks.controller.js` functions (each one takes `env`) to branch on `env.includes('+')` — DMS path calls the new module, DAMA path keeps the existing code.
4. **Client.** `UdaTaskList` accepts an `env` prop. `internal/pages/admin.jsx` passes `${app}+${instance}` from `DatasetsContext`. `default/admin.jsx` stays on external pgEnv.
5. **Internal publish wrapping.** In `dama/upload/routes.js` createPublishHandler, create a DMS task row at start, dispatch `publish:start`/progress/`publish:done` events, complete or fail based on outcome. Return `{task_id, data}` so the client can follow the task if it wants.
6. **Smoke test + docs.** Upload a CSV to an internal_table on a pattern with NO external pgEnv configured; verify the task row + events appear in `dms.tasks` / `dms.task_events` and `UdaTaskList` shows the run.

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms-server/src/db/sql/dms/dms_tasks.sql` | NEW — PG schema for `dms.tasks` + `dms.task_events` (mirrors `data_manager` shape + `app` column) |
| `packages/dms-server/src/db/sql/dms/dms_tasks.sqlite.sql` | NEW — SQLite schema variant |
| `packages/dms-server/src/db/index.js` | Add `initDmsTasks`; invoke after `initDms`; also call `recoverStalledTasks` + `startPolling` for DMS on boot |
| `packages/dms-server/src/dms/tasks/index.js` | NEW — full port of DAMA task module targeting DMS db |
| `packages/dms-server/src/dms/tasks/worker-runner.js` | NEW — parallel to `dama/tasks/worker-runner.js` |
| `packages/dms-server/src/routes/uda/uda.tasks.controller.js` | Dispatch each query by `env.includes('+')` — DMS module or DAMA module |
| `packages/dms-server/src/dama/upload/routes.js` | Wrap `createPublishHandler`'s body in a DMS task row |
| `packages/dms/src/patterns/datasets/pages/Tasks/UdaTaskList.jsx` | Accept an `env` prop; fall back to `getExternalEnv(datasources)` |
| `packages/dms/src/patterns/datasets/pages/dataTypes/internal/pages/admin.jsx` | Pass `env={`${app}+${patternInstance}`}` to `<UdaTaskList>` |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/admin.jsx` | Pass `env={getExternalEnv(datasources)}` explicitly |

## Testing Checklist

- [ ] `dms.tasks` + `dms.task_events` created on fresh DMS db (both PG and SQLite)
- [ ] `initDmsTasks` is idempotent — doesn't fail when tables already exist
- [ ] `dmsTasks.queueTask` / `runAsTask` creates + completes rows correctly
- [ ] Task events appear in `dms.task_events` with correct `task_id` FK
- [ ] UDA `uda[app+instance].tasks.length` and `tasks.byIndex` return DMS rows
- [ ] UDA `uda[pgEnv].tasks.*` still returns DAMA rows (regression guard)
- [ ] `UdaTaskList` on an internal_table admin page shows the publish task after an upload
- [ ] `UdaTaskList` on an external (DAMA) source still shows DAMA tasks
- [ ] Internal-table publish with a bad row still reports `{task_id, data: [...]}` to the client; the task row ends `status='done'` with the error count in `result`
- [ ] Internal-table publish with a thrown exception ends `status='error'` with the error message in `task.error`
- [ ] Pattern with NO external pgEnv (no DAMA at all) can run an internal-table publish and see its task in the admin — this is the real win of Option B

## Open Questions

- **Task row cleanup**: DAMA's `data_manager.tasks` grows unbounded. We should add a simple cleanup script (or a retention policy) for `dms.tasks` eventually — not blocking for this task.
- **Worker fork for DMS**: deferred. If/when a DMS task needs to run longer than an HTTP request can reasonably hold open, reuse the existing `worker-runner.js` pattern but point its db at DMS instead of DAMA.
- **Multiple workers**: the current DAMA queue polls and claims the next queued row. The DMS version in this MVP doesn't need polling because tasks are always run inline by the handler that creates them. Worth noting so a later reader doesn't mistake the asymmetry for an oversight.
