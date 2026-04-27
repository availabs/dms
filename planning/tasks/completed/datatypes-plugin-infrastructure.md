# Datatypes plugin infrastructure — register app-owned datatypes outside `@availabs/dms-server`

## Status: DONE — verified end-to-end on 2026-04-26 (smoke test posts a ping, events stream, task completes)

## Design note — CommonJS in an ESM root

`dms-template/package.json` declares `"type": "module"`, which makes Node treat every `.js` under it as ESM by default. The submodule's `dms-server` is CommonJS and loads the bootstrap via `require(extraDatatypes)`, so the bootstrap and every plugin under `data-types/` must be CJS. Two options were considered: (a) rename to `.cjs`, (b) drop a tiny `package.json` declaring `"type": "commonjs"` in each subtree. Picked (b) so plugin file paths in this task file and downstream task files stay `.js` and `require()` calls don't need explicit `index.cjs`.

## Objective

Set up the bootstrap path that lets `dms-template` (and any other consumer of `@availabs/dms-server`) register its own datatype plugins into the server's `registerDatatype` system **without modifying files inside the submodule**. Once this lands, every datatype port (NFIP claims, map21, NRI, SHELDUS, etc.) becomes a self-contained module added under `dms-template/data-types/` and a one-line entry in the registration glue.

This task is **only the plumbing** — no specific datatype is ported here. Two follow-up tasks depend on this:

- `dama-nfip-claims-migration.md` — first concrete plugin (`enhance-nfip-claims`)
- `dama-map21-migration.md` — second concrete plugin (`map21`), with HPMS TTM 2023 spec validation

## Why now

The dama-server-port task (completed 2026-04) brought `registerDatatype` / `mountDatatypeRoutes` into `@availabs/dms-server` and removed the legacy DAMA Falcor route auto-discovery. The submodule's own `index.js` already calls `registerDatatype('pmtiles', ...)` for library-level plugins. We need the same hook for app-level plugins so that vertical-specific datatypes (hazmit, transport, etc.) live in the consuming app rather than in the shared library.

## Scope

### In scope

- Directory layout for app-owned datatypes (`dms-template/data-types/`)
- Bootstrap module in the template (`dms-template/server/register-datatypes.js`)
- 3-line submodule patch (`src/dms/packages/dms-server/src/index.js`) to invite a `DMS_EXTRA_DATATYPES` env-pointed registration hook
- `.env.example` updates documenting the new env var
- A throwaway "hello-world" plugin registered via the new path purely to prove the round-trip works (server boots, route mounts, worker registers). Removed before merging the next migration task.

### Out of scope

- Porting any real datatype — that's the follow-up tasks
- Extracting shared worker boilerplate into `data-types/_shared/` — defer until at least two plugins are written and a real pattern emerges
- Client-side route changes — the legacy URL `/<pgEnv>/{datatype}/<action>` becomes `/dama-admin/<pgEnv>/{datatype}/<action>`; tracked per follow-up task as each plugin lands

---

## Where things go

### Directory layout

```
dms-template/
├── data-types/                              ← NEW — app-owned datatypes (one subdir per plugin)
│   └── _hello-world/                        ← throwaway smoke-test plugin (deleted before next PR)
│       └── index.js
│
├── server/                                  ← NEW — dms-template's server glue
│   └── register-datatypes.js                ← entry point loaded by dms-server at boot
│
├── .env.example                             ← document DMS_EXTRA_DATATYPES
│
└── src/dms/packages/dms-server/             ← @availabs/dms-server submodule
    └── src/
        ├── index.js                         ← 3-line patch to invite the bootstrapper
        └── dama/datatypes/
            ├── index.js                     ← registerDatatype / mountDatatypeRoutes (unchanged)
            └── pmtiles.js                   ← stays here; library-level plugin
```

**Rule of thumb** — datatypes used by every app (e.g. `pmtiles`) stay in the submodule. Datatypes specific to a vertical (hazmit, transport, etc.) live under `dms-template/data-types/` and are registered externally.

### Bootstrap wiring

`dms-server` reads an env var pointing at the consumer's registration module. If set, it `require()`s it and calls the exported function with the same `registerDatatype` it uses internally:

```js
// src/dms/packages/dms-server/src/index.js  (small patch — see step 2 below)
registerDatatype('pmtiles', require('./dama/datatypes/pmtiles'));

// >>> NEW <<<
const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;
if (extraDatatypes) {
  try {
    const registerExtra = require(extraDatatypes);
    registerExtra({ registerDatatype });
  } catch (e) {
    console.error(`[datatypes] Failed to load DMS_EXTRA_DATATYPES=${extraDatatypes}:`, e.message);
  }
}
// >>> END NEW <<<

mountDatatypeRoutes(/* ... */);
```

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  // One line per plugin:
  // registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
  // registerDatatype('map21',               require('../data-types/map21'));
  // ...etc.
};
```

```bash
# dms-template/.env (and .env.example)
DMS_EXTRA_DATATYPES=/home/alex/code/avail/dms-template/server/register-datatypes.js
```

**Why env var instead of a hardcoded `require()` in the submodule:** keeps the submodule agnostic of any single consumer. Multiple apps can each bundle their own `data-types/` and register separately. Also makes test/dev easier — point `DMS_EXTRA_DATATYPES` at a mock file to exercise registration in isolation.

**Acceptable alternative (Option A — quicker, higher coupling):** edit the submodule's `index.js` to `require('../../../../../server/register-datatypes.js')` directly. Works, but creates a submodule→app upward dependency. Use only as a temporary bridge while the env-var approach is being validated.

---

## The plugin shape — quick reference

A datatype module exports a single object with two optional keys:

```js
// data-types/<name>/index.js
module.exports = {
  workers: {
    '<name>/<action>': require('./worker'),         // map of workerPath → handler
    // ...
  },
  routes: (router, helpers) => {                    // mounted at /dama-admin/:pgEnv/<name>/
    router.post('/<action>', require('./route')(helpers));
    // ...
  },
};
```

### `workers` — map of workerPath → handler

- **workerPath** is any string but convention is `{datatypeName}/{action}` — it's what `tasks.worker_path` stores and how `registerHandler` keys it. Unrelated to URL.
- **Handler signature:** `async (ctx) => result` where `result` is whatever you want persisted on `tasks.result` (keep small — clients poll it via `getTaskStatus`).
- **`ctx` shape** (from `src/dama/tasks/index.js startTaskWorker`):

| key | type | what it is |
|-----|------|------------|
| `ctx.task` | object | `data_manager.tasks` row (`tasks` for sqlite). `task_id`, `descriptor` (the object you passed to `queueTask`), `source_id`, `worker_path`, etc. |
| `ctx.pgEnv` | string | database config name (e.g., `'npmrds2'`) |
| `ctx.db` | db adapter | `getDb(pgEnv)`. Use `ctx.db.query(sql, params)`. `db.type` is `'postgres'` or `'sqlite'`. |
| `ctx.dispatchEvent` | fn | `(type, message, payload?) => Promise` — writes to `task_events`. `type` is a short tag (e.g., `'enhance-nfip:INITIAL'`); clients poll events and render them. |
| `ctx.updateProgress` | fn | `(progress: 0..1) => Promise` — sets `tasks.progress` for UI progress bars. |

### `routes(router, helpers)` — Express routes mounted at `/dama-admin/:pgEnv/{name}/`

- **`router`** is `express.Router({ mergeParams: true })` so `req.params.pgEnv` is available.
- **URL prefix** is `/dama-admin/:pgEnv/{name}/` where `{name}` is the first arg to `registerDatatype`. `router.post('/publish', ...)` → `POST /dama-admin/:pgEnv/{name}/publish`.
- **`helpers`** — utilities passed in by `mountDatatypeRoutes`:

| helper | purpose |
|--------|---------|
| `helpers.queueTask(descriptor, pgEnv)` | enqueue a task. Returns `taskId`. `descriptor.workerPath` required; rest is plugin-defined and surfaces as `ctx.task.descriptor` in the worker. |
| `helpers.getTaskStatus(taskId, pgEnv)` | task row (status, progress, result, error). |
| `helpers.getTaskEvents(taskId, pgEnv, sinceEventId?)` | events since a given event id — long-poll friendly. |
| `helpers.dispatchEvent(taskId, type, message, payload?, pgEnv)` | out-of-band event write (rare in routes; used to mark route-level progress). |
| `helpers.createDamaSource({ name, type, user_id, ... }, pgEnv)` | insert `data_manager.sources`. Handles name collisions with `_N` suffixes. |
| `helpers.createDamaView({ source_id, user_id, etl_context_id, metadata, ... }, pgEnv)` | insert `data_manager.views`, auto-populates `table_schema`/`table_name`/`data_table` as `gis_datasets.s{source_id}_v{view_id}`. |
| `helpers.ensureSchema(db, schemaName)` | `CREATE SCHEMA IF NOT EXISTS` (no-op on sqlite). |
| `helpers.getDb(pgEnv)` | raw db adapter, same as `ctx.db` in workers. |
| `helpers.loadConfig(pgEnv)` | read database config JSON for the env. |
| `helpers.storage` | local/S3 storage service — `.write(path, stream)`, `.read(path)`, `.getUrl(path)`. |

### Task descriptor contract

```js
const taskId = await helpers.queueTask({
  workerPath: '<name>/<action>',                  // required — the key in `workers`
  sourceId: req.body.existing_source_id ?? null,  // optional — UI filtering by tasks.source_id
  // Everything else is plugin-free-form — surfaces as ctx.task.descriptor.* in the worker
  ...
}, req.params.pgEnv);

res.json({ etl_context_id: taskId, source_id: req.body.existing_source_id ?? null });
```

The response shape `{ etl_context_id, source_id }` matches the legacy client contract — the new `task_id` *is* the legacy `etl_context_id`. The client's event polling loop (`GET /dama-admin/:pgEnv/events/query?etl_context_id=X`) works unchanged because the task runner writes events in the legacy-compatible format.

---

## Legacy → new API mapping (general)

This mapping applies to every port that follows. Plugin-specific details (event types, table naming, etc.) live in each port's own task file.

| Legacy (avail-falcor/dama) | New (dms-server) |
|---------------------------|------------------|
| `const { queueTask } = require('#dama/admin/index.js')` | `helpers.queueTask` inside a route |
| `dama_task_descr = { parent_context_id, worker_path, initial_event: { payload, type }, meta }` | `descriptor = { workerPath, sourceId, ...anyFields }` — no event envelope |
| `initial_task.initial_event.payload.X` (in worker) | `ctx.task.descriptor.X` |
| `const { createSource, createView, dispatchEvent, logger } = require('#dama/admin/index.js')` | `helpers.createDamaSource` + `helpers.createDamaView` + `ctx.dispatchEvent` + `console` |
| `await query(sql, pgEnv)` / `await query({ text, values }, pgEnv)` | `await ctx.db.query(sql, params)` |
| `await query("BEGIN"/"COMMIT", pgEnv)` interspersed with event dispatches | Explicit `await ctx.db.query('BEGIN'/'COMMIT'/'ROLLBACK')`; wrap with try/finally. **Task runner does not auto-commit between event dispatches.** |
| `init({...})` macro → `(source_id, view_id)` | Direct `helpers.createDamaSource` + `helpers.createDamaView` calls + explicit `SRC_CREATE` / `VIEW_CREATE` events via `ctx.dispatchEvent`. |
| `handleEvent({ type, event, user_id, email, payload, etl_context_id, pgEnv })` | `ctx.dispatchEvent('{datatype}:{EVENT}', humanMessage, payload)` — task_id implicit, pgEnv implicit, user/email in `ctx.task.descriptor` |
| `update_view({...})` macro | Direct `UPDATE data_manager.views SET ...` via `ctx.db.query`. If keeping `s{source_id}_v{view_id}` naming, no work — `createDamaView` already set it. |
| `fin({...})` | Return `result` from worker + `ctx.dispatchEvent('{datatype}:FINAL', msg, payload)`. Task runner completes the task on return. |
| `err({...})` | `throw`. Task runner catches and calls `failTask` which writes the error event. For custom ERROR shape, `await ctx.dispatchEvent(...)` before `throw`. |
| `logger.info`, `logger.error` | `console.log`/`console.error` — stdout captured per-task with `[task:X]` prefix by `dama/tasks/worker-runner.js`. |
| `CALL _data_manager_admin.initialize_dama_src_metadata_using_view_2(view_id)` | Same SQL, still works against DAMA-role PG. Run with `ctx.db.query` when target is `postgres`. Skip on sqlite. |
| `prodURL` / `dama/config/index.js` | `process.env.DAMA_SERVER_URL` (or derive from `req.protocol + req.get('host')` in the route). |
| route file exports `[{ route, method, handler }, ...]` | `routes(router, helpers)` callback — standard Express router methods |

### Common gotchas (apply to every port)

#### `pgEnv` semantics changed

- **Legacy:** `pgEnv` was a key in the `env_json` env-array used by `#db/pgEnvs.js`. Some legacy workers opened raw `pg.Client` pools per pgEnv.
- **New:** `pgEnv` is a `db/configs/*.config.json` filename (without extension). `ctx.db` / `helpers.getDb(pgEnv)` uses the shared adapter — handles pooling + postgres/sqlite abstraction. **Don't open your own `pg.Client`.**

#### Transactions are explicit

Legacy `#db/pgEnvs.js` autoran queries and used `BEGIN`/`COMMIT` interspersed with event dispatches. The new `ctx.db.query` is a straight query call — no implicit transactions. Wrap bulk work in an explicit transaction **inside** the worker. Event dispatches (`ctx.dispatchEvent`) write to `data_manager.task_events`, a separate table — they commit independently, which is what we want (progress visible mid-transaction).

#### `initial_event` envelope is gone

Legacy workers destructured `initial_task.initial_event.payload`. New `ctx.task.descriptor` is flat — what the route put in `queueTask` surfaces here at the top level. Flatten the legacy payload into the descriptor.

#### Event type naming

Legacy used `${table_name}:${EVENT}` or `${datatype}:${EVENT}`. The client's event polling keys on the legacy `type` field, so **keep the same format** when porting. `ctx.dispatchEvent(type, message, payload)` stores `type` verbatim — no namespacing is enforced.

#### Logging

- `console.log` from a worker is captured by `dama/tasks/worker-runner.js` and prefixed `[task:XXXX]` in the parent's stdout.
- `logger.info`/`logger.error` no longer exist — use `console`.
- If the line is useful post-mortem (i.e., should appear in `task_events`, not just server logs), use `ctx.dispatchEvent` instead of `console.log`.

---

## Implementation steps — DONE

### 1. Create the directory layout — DONE

```bash
mkdir -p dms-template/data-types/_hello-world
mkdir -p dms-template/server
```

### 2. Write the throwaway smoke-test plugin — DONE

```js
// dms-template/data-types/_hello-world/index.js
module.exports = {
  workers: {
    'hello-world/ping': async (ctx) => {
      await ctx.dispatchEvent('hello-world:INITIAL', 'ping received', null);
      await ctx.updateProgress(1);
      const result = { ok: true, descriptor: ctx.task.descriptor };
      await ctx.dispatchEvent('hello-world:FINAL', 'pong', result);
      return result;
    },
  },
  routes: (router, helpers) => {
    router.post('/ping', async (req, res) => {
      try {
        const taskId = await helpers.queueTask({
          workerPath: 'hello-world/ping',
          ...(req.body || {}),
        }, req.params.pgEnv);
        res.json({ etl_context_id: taskId, source_id: null });
      } catch (err) {
        console.error('[hello-world] route failed:', err);
        res.status(500).json({ error: err.message });
      }
    });
  },
};
```

This plugin is purely for verifying the bootstrap path works. **Delete it before merging the next migration task** — leave nothing in `data-types/` named `_hello-world` once a real plugin lands.

### 3. Write the bootstrap module — DONE

```js
// dms-template/server/register-datatypes.js
module.exports = function registerExtra({ registerDatatype }) {
  registerDatatype('hello-world', require('../data-types/_hello-world'));
  // Real plugins added in follow-up tasks:
  // registerDatatype('enhance-nfip-claims', require('../data-types/enhance-nfip-claims'));
  // registerDatatype('map21',               require('../data-types/map21'));
};
```

### 4. Patch the submodule (3 lines) — DONE (committed in submodule branch alongside this task)

Add after the `registerDatatype('pmtiles', ...)` line in `src/dms/packages/dms-server/src/index.js`:

```js
const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;
if (extraDatatypes) {
  try {
    const registerExtra = require(extraDatatypes);
    registerExtra({ registerDatatype });
  } catch (e) {
    console.error(`[datatypes] Failed to load DMS_EXTRA_DATATYPES=${extraDatatypes}:`, e.message);
  }
}
```

This is a submodule change. Commit it on a branch in the submodule and push upstream. The env-var approach is back-compat (zero impact when unset), so other consumers are not affected.

### 5. Wire the env var — DONE (set in `.env`, documented in `.env.example`)

```bash
# dms-template/.env
DMS_EXTRA_DATATYPES=/home/alex/code/avail/dms-template/server/register-datatypes.js

# dms-template/.env.example  (commit)
# Path to the app-owned datatype registration module. The dms-server will require()
# this file at boot and call its default export with { registerDatatype }.
# DMS_EXTRA_DATATYPES=/abs/path/to/dms-template/server/register-datatypes.js
```

For Docker: set the env var in the server container's environment; mount `data-types/` and `server/` into the image (or install them as a package).

### 6. Smoke test — DONE on 2026-04-26 against `dama-sqlite-test` pgEnv

Verified output:

```
[datatypes] Registered: pmtiles
[datatypes] Registered: hello-world
[datatypes] Mounted routes for 2 datatype(s)
DMS Server running on port 3001
```

`POST /dama-admin/dama-sqlite-test/hello-world/ping` → `{"etl_context_id":1,"source_id":null}`

Polled events (`event_id=-1`) returned `queued` → `started` → `hello-world:INITIAL` → `hello-world:FINAL` → `done`. Descriptor was echoed back in the FINAL payload, confirming descriptor flow round-trip.

```bash
cd dms-template
npm run server:dev    # or however dms-server starts in this repo

# Expect startup log:
#   [datatypes] Registered: pmtiles
#   [datatypes] Registered: hello-world
#   [datatypes] Mounted routes for 2 datatype(s)

# POST a payload — task queues, worker runs, events flow.
curl -X POST http://localhost:3001/dama-admin/<some-pgEnv>/hello-world/ping \
  -H 'Content-Type: application/json' \
  -d '{ "message": "from smoke test" }'

# Expected:
#   { "etl_context_id": <taskId>, "source_id": null }

# Poll events:
curl "http://localhost:3001/dama-admin/<some-pgEnv>/events/query?etl_context_id=<taskId>&event_id=-1"

# Expected event stream:
#   hello-world:INITIAL — "ping received"
#   hello-world:FINAL   — "pong" (payload.descriptor echoes the request body)
```

### 7. Clean up — DEFERRED to first follow-up plugin

After Part 2 (`dama-nfip-claims-migration.md`) lands — or even just before it merges — delete `_hello-world` and the corresponding line in `register-datatypes.js`. The hello-world plugin exists only to prove the path. Leaving it in place until then because it's the only working artifact that exercises this code on the running dev server.

---

## Files requiring changes

- **NEW** `dms-template/data-types/_hello-world/index.js` — throwaway smoke plugin ✓
- **NEW** `dms-template/data-types/package.json` — `{"type":"commonjs"}` to override the ESM root ✓
- **NEW** `dms-template/server/register-datatypes.js` — bootstrap entry point ✓
- **NEW** `dms-template/server/package.json` — `{"type":"commonjs"}` to override the ESM root ✓
- **EDIT** `dms-template/.env.example` — document `DMS_EXTRA_DATATYPES` ✓
- **EDIT** `dms-template/.env` — set `DMS_EXTRA_DATATYPES` to the absolute path ✓
- **PATCH** `src/dms/packages/dms-server/src/index.js` — 9-line addition (try/catch wrapper around `require(extraDatatypes)`) after `registerDatatype('pmtiles', ...)` (submodule change, must be committed in submodule) ✓

## Testing checklist

- [x] `dms-template/data-types/` and `dms-template/server/` directories exist
- [x] Submodule patch applied (commit pending in submodule branch)
- [x] `DMS_EXTRA_DATATYPES` set in `.env`; `.env.example` updated
- [x] Server boots with no errors
- [x] Startup log includes `Registered: hello-world`
- [x] `POST /dama-admin/<pgEnv>/hello-world/ping` returns `{ etl_context_id, source_id: null }`
- [x] Polling events for the returned task id streams `hello-world:INITIAL` then `hello-world:FINAL` (verified — full sequence: queued → started → INITIAL → FINAL → done)
- [x] `tasks` row for the smoke task is completed (verified via `done` event in the stream)
- [x] When `DMS_EXTRA_DATATYPES` is unset, the bootstrap branch is skipped (verified by code review — `if (extraDatatypes)` guards the entire block)
- [x] When `DMS_EXTRA_DATATYPES` points at an unloadable file, server logs the error and continues to boot — verified during initial run (file was ESM-treated, the catch block produced `[datatypes] Failed to load DMS_EXTRA_DATATYPES=…: module is not defined in ES module scope` and the server kept going through `mountDatatypeRoutes` and `DMS Server running on port 3001`)

## Open questions

1. **Env var name** — settled: `DMS_EXTRA_DATATYPES`. Submodule patch shipped with this name.
2. **Single hook vs. array** — kept single-path for now. Revisit when a second consumer of `@availabs/dms-server` needs its own bundle.
3. **Plugin packaging** — long-term, `data-types/<name>/` could be published as `@availabs/datatype-<name>` and `require()`d directly from the bootstrap module. Defer until we have a concrete reuse case.
