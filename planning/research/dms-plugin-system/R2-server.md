# R2 (server architecture): what a runtime-installed server plugin would plug into

Research item R2 (server architecture) of `src/dms/planning/tasks/current/dms-plugin-system.md`. Read-only
investigation, 2026-11-22. Paths are relative to `dms-template/` unless they start with `src/` under the
server, written `S/` = `src/dms/packages/dms-server/src/`. **Verified** means I read it in the code or a
doc; **Inference** is marked as such.

---

## 1. The data-type plugin contract today

### What a data-type exports (verified)

A plugin is one CommonJS object passed to `registerDatatype(name, definition)` (`S/dama/datatypes/index.js:44-77`):

| Key | What it is | Where the core uses it |
|---|---|---|
| `workers` | `{ workerPath: async (ctx) => result }`; `ctx = { task, pgEnv, db, dispatchEvent, updateProgress }` | `registerHandler` into the task registry (`S/dama/tasks/index.js:36-38`), run by `startTaskWorker` (`:147-181`) |
| `routes` | `(router, helpers) => void` | mounted at `/dama-admin/:pgEnv/<name>` behind `writeGate(openRoutes)` (`S/dama/datatypes/index.js:85-100`) |
| `openRoutes` | `['POST /path/:param']`, writes exempt from the sign-in gate | `S/dama/datatypes/auth.js:21-34` |
| `schedulables` | `{ workerPath: { label, defaultCron, params, buildDescriptor, preflight? } }` | module map `schedulables` (`S/dama/datatypes/index.js:26,56-64`), read by the sweep (`S/dama/tasks/schedules.js:233-238`) |
| `rules` | source-table rule templates (`install`/`uninstall` return SQL) | `registerRule` into a global registry; same id overwrites with a warning (`S/dama/rules/registry.js:37-47`) |

There is **no** migrations key, no version, no lifecycle (`start`/`stop`), no Falcor routes, no format
declarations and no manifest. Client pages are a separate, build-time contract: each plugin's
`pages/index.jsx` is imported by `src/data-types.js` into the client bundle (`data-types/CLAUDE.md:350-362,453-459`).
The server and client halves are linked only by naming convention (plugin name = URL prefix; DAMA source `type` keys the client map, and the two can differ: `data-types/CLAUDE.md:456-459`).

The route `helpers` object is built once in `S/index.js:335-356`: `queueTask`, task status/events,
`createDamaSource`/`createDamaView`/`deleteDamaView`, lineage reads, `requireUser`, `requireCan`,
`authorizeViewAction`, `authorizePublish`/`authorizeSourceWrite`/`holdsSourcePermission`, `getDb`,
**`loadConfig`**, and `storage`.

**The helpers are not the real API surface.** Plugins deep-import server internals by path: across
`data-types/` there are ~87 `require('@availabs/dms-server/src/db…')` and ~61 `…/dama/upload/metadata`
imports, plus `dama/tasks`, `dama/lineage`, `routes/uda/sourceAuth`, `db/table-resolver`, `dama/storage`,
`dama/delete`, `routes/uda/uda.controller` (grep). Twelve worker files call `getPostgresCredentials`
(e.g. `data-types/mny/actions_location/worker.js:9`, `traffic_counts/TMAS/volume/worker.js:11`), which
returns the full config (`S/db/index.js:517-519`). So the effective contract is "anything in dms-server's
source tree", sharing its module singletons (pools, registries).

### How they load, and when (verified)

- Startup only. `setupAndListen()` (`S/index.js:276`) registers core workers, the built-in `pmtiles`
  datatype (`:285`), then `require(path.resolve(process.env.DMS_EXTRA_DATATYPES))` and calls it with
  `{ registerDatatype }` (`:290-299`), then `mountDatatypeRoutes(app, helpers)` (`:335`). A second env hook,
  `DMS_PAGE_DELETE_HOOK`, has the same shape (`:306-315`).
- `data-types/register-datatypes.js:15-38` is a hard-coded list of 22 plugins; each `require` is wrapped
  separately so one failing plugin logs `SKIPPED` and the rest still load (`:40-55`). In practice this
  list is the allow-list, compiled into the image.
- Images set `DMS_EXTRA_DATATYPES=/app/data-types/register-datatypes.js` (`Dockerfile:121`,
  `Dockerfile.ssr:125`). The subtree is CommonJS via `data-types/package.json` (`"type": "commonjs"`).
- Adding a plugin = edit the list, rebuild the image, redeploy (`data-types/CLAUDE.md:498-504`).

### How routes mount (verified)

One `express.Router({ mergeParams: true })` per plugin, `router.use(writeGate(def.openRoutes))`, then
`app.use('/dama-admin/:pgEnv/<name>', router)` (`S/dama/datatypes/index.js:88-93`). `:pgEnv` comes from the
URL and is any config name the server has. Routes are **per pgEnv, not per app/tenant**: nothing in the
mount knows which site is calling. The only "which app" signal is `requestApp(req)`, a client-supplied
`?dms_app=` or `X-DMS-App` header (`S/routes/auth/requestUser.js:33-36`): a claim, not an authenticated fact.

### How workers run (verified)

- **In-process, on the main event loop.** Each dama-role pgEnv gets a `setInterval` poller
  (`S/dama/tasks/index.js:328-351`, default 5 s) that claims one queued task per tick
  (`FOR UPDATE SKIP LOCKED`, `:98-117`) and calls `startTaskWorker` without awaiting it (`:343`). The handler
  runs in the server process (`:169`). No concurrency cap other than one claim per tick per pgEnv.
- **Host isolation:** every task row carries `host_id`, a UUID persisted in `var/dama_host_id`
  (`S/dama/tasks/host-id.js`); only the same host claims it (`:81,108`). `recoverStalledTasks` marks this
  host's `running` tasks as `error` at boot (`:302-322`), so a restart kills in-flight plugin work.
- **Schedules:** `startScheduleSweep(pgEnv)` (`S/dama/tasks/schedules.js:370`), multi-host safe via
  `FOR UPDATE SKIP LOCKED` on due rows (header `:15-17`); a fire for a worker with no registered schedulable
  records `schedule:BLOCKED` (`:233-238`). Scheduled tasks get `max_attempts: 3` with transient-error requeue
  (`S/dama/tasks/index.js:175-212`).
- **Child processes exist but not for plugins.** `runWorkerInBackground` forks `S/dama/tasks/worker-runner.js`
  (`S/dama/upload/gis-routes.js:285-327`), whose `handlerMap` is hard-coded to four core upload workers
  (`worker-runner.js:96-101`). The fork inherits the whole `process.env` (`gis-routes.js:301-307`). The DMS
  task system (`S/dms/tasks/index.js`) mirrors this with no forked workers wired.
- Plugins spawn their own: `routing` runs a `worker_threads` pool (`data-types/routing/densitySearchPool.js:14,152`)
  and keeps a large in-memory graph warmed 20 s after boot against a hard-coded pgEnv
  (`data-types/routing/index.js:348-365`); `transcom` keeps a `setInterval` token refresh
  (`data-types/transcom/transcom_api.js:137`); several shell out (`ogr2ogr`, puppeteer/Chromium).
- **Known overlap bug:** `deploy.sh`'s staging container shares the `var` volume, so it is the *same host*
  to the task queue and can recover/claim live tasks during the health-check window
  (`src/dms/planning/tasks/current/server-background-jobs-switch.md`, status next).

### DB access (verified)

`helpers.getDb(name)` returns the server's shared adapter for **any** config name
(`S/db/index.js:333`), including `DMS_DB_ENV` (all apps' `dms_<app>` schemas) and the auth DB. One pool per
config, one Postgres user per config (config keys: `type, role, host, port, database, user[, password,
clickhouse, readOnly]`; I listed keys only). `helpers.loadConfig(pgEnv)` and `getPostgresCredentials` hand
the plugin the raw credentials, ClickHouse included. A plugin can run arbitrary SQL in any schema that user
can reach; plugins create schemas and tables ad hoc (`helpers.ensureSchema`, `CREATE TABLE IF NOT EXISTS`
in ~61 files, e.g. `data-types/now_playing/schema.js:290,317`). Source-rule SQL runs "with the table
owner's rights" (`data-types/CLAUDE.md:189-192`).

### Dependencies (verified)

- One shared `node_modules`. The image writes a minimal `/app/package.json` depending on dms-server plus a
  hand-kept list of plugin deps (puppeteer, otplib, axios, extract-zip, node-fetch, lodash-es, d3-dsv,
  d3-format, osm-pbf-parser) and runs one hoisted `npm install` (`Dockerfile:45-90`). `data-types/node_modules`
  is dockerignored; a dep missing from the list makes that plugin `SKIPPED` at boot (`Dockerfile:55-58`).
  `data-types/package.json` lists only lodash-es and xlsx; one sub-folder has its own
  (`external-fetchers/nysdot_estip/package.json`).
- System deps live in the image: `gdal-bin`/`libgdal-dev`, `build-essential`, `python3`, `zip`, Chromium
  (`Dockerfile:29-43`). dms-server itself carries native addons (`gdal-async`, `sharp`, `better-sqlite3`;
  `S/../package.json`, several optional).
- `lodash-es` is ESM-only and loaded by `require()` (Node ≥ 22.12, `Dockerfile:62-66`).

---

## 2. Server process model

### Express app (verified)

`S/index.js`, in order: compression → primary-domain redirect (`:47`) → **site hosting by Host**
(`createSitesMiddleware`, `:51-55`; a site request never reaches the API) → body parsers (500 MB) → CORS
echoing any origin with credentials (`:65-84`) → request timeout 30 s / graph 120 s, with a hard-coded skip
for the routing plugin's `trsp-memory` path (`:115-126`) → opt-in request logger (`:129`) → `/files` static
→ auth routes (`:140`) → `/_session` → **JWT middleware** (`:148`) → access log, formats (read), grantees,
domains, tenants, app settings, owner-delete, storage, upload, schedule, PDF routes, `/track/visit` →
`/graph` Falcor (`:250-269`) → sync REST (`:274`). Then, inside `setupAndListen`: datatypes (`:284-356`),
task pollers (`:359-400`), SSR (`:403-442`), the **404 catch-all** (`:445-447`), `listen`, sync WebSocket
(`:469-472`). The startup log prints every `DMS*` env value (`:456-464`).

### Falcor (verified)

`S/routes/index.js:20-24` finds every `*route(s).js` under `routes/` **once at module load** and builds
`BaseRouter = Router.createClass(routeFiles)`; each request constructs a new instance with the user,
subdomain and request app (`:26-37`, `S/index.js:263`). Plugins contribute no Falcor routes today.

### SSR / RSC and sites (verified)

- Static sites: `<checkout>-sites/<site>/site.json` `{hosts, live}` plus immutable
  `builds/<id>/client/`; `site.json` is re-stat'ed at most once a second and a switch needs no restart
  (`S/sites/index.js:1-18,121-213`). Mounted read-only at `/app-sites` (`deploy.sh:118-124`).
  Site deploys support `--promote <id>` and `--rollback` by rewriting the pointer (`deploy/README.md:28-50`).
- SSR is one app per process: `DMS_SSR=1` imports `<DMS_DIST_DIR>/server/entry-ssr.js` once with ESM
  `import()` (`src/dms/packages/dms/src/render/ssr2/express/setup.mjs:139`) with `siteConfig` from
  `DMS_APP`/`DMS_TYPE` (`S/index.js:403-436`). On the hub, tenant/domain changes call
  `ssr.invalidateRoutes()` (`:439-441`). The RSC spike (`DMS_RSC=1`) imports another bundle the same way
  (`setup.mjs:146-172`).

### Containers on mercury (verified from deploy docs)

| Container | Role | How deployed |
|---|---|---|
| `dms-template-server` | API `dmsserver.availabs.org` + static site hosting for every `hostedOn: server` target | `deploy.sh` (root `Dockerfile`) |
| `dms-hub-server` | tenant hub at `availabs.com`, SSR + sync, own Postgres `dms-hub-db`, port 5700 | by hand from the runbook, `Dockerfile.ssr` (`deploy/targets.json` `ownServers.hub`; `planning/shared/tasks/completed/tenant-hub-server.md:157-172`) |
| `dms-previewN-server` (+ `-db`) | preview stacks, ports 560N | `deploy/stacks.mjs` (`deploy/README.md:125-131`) |

Each is a single Node process (`CMD node … src/index.js`, `Dockerfile:152`). Images are immutable; the
only writable persistent path is the `var` volume (`Dockerfile:117`), plus the hub's tenant-backups mount.

### Deploy and restart (verified)

`deploy.sh` builds an image from exact commits, starts a staging container (same env file, same `var`
volume, no port), waits for Docker health, then stops the old container, renames it `-prev-<ts>`, starts
the new one; keeps 3 previous containers and prints a rollback command (`deploy.sh:1-19,471-584`). There is
a ~1 s gap and every in-flight task dies (marked `error` on the next boot). Deploys are logged to
`dms-template-deploys.jsonl` (`deploy/README.md:277-289`).

### What "install without a restart" would collide with (verified mechanism; consequences are inference)

| Mechanism | Collision |
|---|---|
| Express mount order | Datatype routers are `app.use`d before the 404 catch-all (`S/index.js:445`). An `app.use` after boot lands **behind** the catch-all and is never reached; Express has no unmount. Needs one dispatcher mounted at boot that looks up a mutable `name → router` map. |
| Task registry | `handlers[workerPath] = handler` is a plain object (`S/dama/tasks/index.js:14,36-38`): adding/replacing is easy, removing has no API; in-flight tasks keep the old closure. `startPolling` skips when no handlers exist at the time (`:331-334`); pollers start only for configs found at boot (`S/index.js:359-389`). |
| Schedulables / rules | module-level maps, add-only, overwrite with a warning (`S/dama/datatypes/index.js:26,62`; `S/dama/rules/registry.js:47`). |
| CJS `require` cache | Evictable (`delete require.cache[…]`), but a plugin's deep imports of dms-server internals are shared singletons and must *not* be evicted. ESM loaded via `require(esm)` (lodash-es) or `import()` cannot be evicted at all; re-importing a new version needs a new path, and the old module stays in memory. |
| Plugin-owned resources | Timers, `worker_threads` pools, in-memory graphs, puppeteer browsers (`routing`, `transcom`) have no `stop()` hook, so an unload leaks them. |
| Falcor | Class built once (`S/routes/index.js:24`); since an instance is created per request, rebuilding `BaseRouter` would work, but no API exists. |
| SSR / client | Server bundle imported once per process (`setup.mjs:139`); a plugin's client code is in the site build (R1 (client architecture) covers this). |
| Multiple processes | Each container loads plugins separately; an install must reach every container (main, hub, previews) or be scoped to one. |

Precedents for change-without-restart already in the server: `site.json` polling (`S/sites/index.js:179-213`),
the formats table with a 30 s TTL (`S/routes/auth/formats.js:45`), and the hub's tenant/domain store that
refreshes every 30 s and fires `onChange` (`S/routes/domains/store.js:1-16`).

---

## 3. Tenancy and auth

### Words (verified)

- **app**: the namespace of a site's rows; under the default `per-app` split mode each app has its own
  schema `dms_<app>` with `data_items` and its own `formats` table (`dms-server/CLAUDE.md:63-76`). All apps
  share one DMS database and one connection (`DMS_DB_ENV`).
- **site**: the `…:site` row of an app (its patterns, `tenants`, `dms_envs` refs), and, for hosting, a built
  client folder chosen by Host.
- **tenant**: on a multi-tenant server, a row `{site_instance}|{slug}:tenant` in the root (hub) app,
  `data: { subdomain, app, name, aliases, primary }`, linked from the root site's `tenants` ref list; the
  tenant's own site lives in `dms_<tenantapp>` (`src/dms/planning/tasks/current/multi-tenant.md:24-40`;
  `S/routes/domains/store.js:36-46`). Admin: the Tenants tab (`tasks/completed/tenants-admin-tab.md`).
  Tenant delete and pgEnv attach are hub-staff routes (`manage-tenants` on the hub site row,
  `S/routes/tenants/index.js:1-24`).
- **pgEnv attachment** is the closest existing analogue to "enable X for tenant Y": a site uses a pgEnv only
  if it has a `{site}|{name}:dmsenv` row with `data.pgEnv`; attach/detach are hub-staff routes with a
  `…/plan` preview (`S/routes/tenants/pgEnvs.js:1-30`, `S/dama/pgEnv.js:1-50`). Without the row the auth
  layer refuses that pgEnv's sources for the site.

The `plat_tenant_hub` initiative (`planning/initiatives/plat_tenant_hub.md`) says the hub "is the base for a
hub where plugins can be enabled per tenant (a later initiative)"; the 2026-11-17 TPS note asks "a tenant
manager, or management site by site?".

### How auth is judged (verified)

- `S/routes/auth/judge.js` is a pure interpreter over a row kind's rule (`:1-33,102-147`): reads open unless
  the kind has a `read` op; **writes need a named verb or `*` explicitly, "nothing is open by absence"**
  (`:31`); a row with no grants is read-only (`:137-143`).
- Rules and vocabulary come from the site's `formats` table, written **only** by
  `S/scripts/register-formats.js` (a deploy-time step: dry run, `--apply`), from rows the client package's
  `emit-formats.mjs` derives by running the format modules (`S/scripts/register-formats.js:1-20`). "No
  client can write this table — not a browser, not the dms CLI"; the only HTTP route is a read
  (`S/routes/auth/formats.js:1-12`). Running servers pick changes up within 30 s.
- `upsertFormats(app, rows)` treats the payload as **the whole set**: keys left out are removed
  (`S/routes/auth/formats.js:32,137`). A plugin cannot add its rows alone with today's writer.
- `DMS_AUTH_MODE` defaults to `log` (allow and record would-denies) for every guard, datatype routes included
  (`src/dms/documentation/dms-server-env.md:39-50`); production was recorded as unset (= `log`) in
  `planning/shared/tasks/current/auth-data-migration-dms-mercury-3.md:75-77`.

### Where "plugin X enabled for tenant Y" would naturally live (inference)

Two different facts, two places:
1. **Installed on this server** (code present, version, checksum, who installed it): server-global, so a
   server table in the DMS database beside `dms.change_log` / `dms.access_log`, written only by hub staff.
   Not a DMS row, because no site owns it.
2. **Enabled for a tenant**: a row in the tenant's own schema, following `:dmsenv`: `{site}|{plugin}:plugin`
   (or a `plugins` ref list on the site row), attached and detached by hub staff with a `…/plan` route,
   judged by the normal rule walk. The site row already carries `patterns`, `tenants` and `dms_envs`.

Formats at install time (inference): the plugin package would ship its **emitted** format rows (the server
cannot import client code), and activation would need a server-side writer that merges a plugin's keys
into the site's set, since `upsertFormats` replaces the set. Keeping "only the server writes formats" holds
if activation is a hub-staff server route, not a client write.

---

## 4. DB and data isolation (verified unless marked)

- Configs are JSON files found by name in `DMS_DB_CONFIG_DIRS` then `S/db/configs/`; `type` and `role`
  required (`dms-server/CLAUDE.md:160-197`). The main server holds configs for the content DB, the auth DB
  and several dama pgEnvs (`npmrds2` with ClickHouse, `hazmit_dama`, `wcdb-dama`, `nysdos`, …). Every dama
  pgEnv found gets pollers and schedule sweeps (`S/index.js:359-389`).
- `readOnly: true` (dama-only) makes every connection `default_transaction_read_only=on` and turns off
  init, migrations and task work (`dms-server/CLAUDE.md:195`). Used by preview stacks and the hub.
- **One tenant's code can read another tenant's schema today.** All `dms_<app>` schemas sit in one database
  behind one pool and user; isolation between apps is enforced in application code (table resolution by
  `app`, the auth walk), not by Postgres roles. DAMA sources are shared by every app attached to the pgEnv.
- **What in-process plugin code effectively holds:** every DB the server can open (via `getDb`, `loadConfig`,
  or by requiring `S/db` directly), with raw passwords; all of `process.env`, including `JWT_SECRET`
  (`S/auth/utils/crypto.js:5`), so it can **mint a token for any user**; AWS/S3, TRANSCOM, mail settings;
  the RITIS file mount; every request passing through its routes (headers, the caller's JWT); the shared
  `var` volume and `/app-sites` (read-only); outbound network. It can also monkey-patch shared modules
  (express, pg, global `fetch`). In short: **full server, all tenants**.

---

## 5. Existing safety rails (verified)

| Rail | Where |
|---|---|
| Write gate on plugin routes: non-GET needs a signed-in user unless listed in `openRoutes` | `S/dama/datatypes/auth.js:27-34` |
| Per-route permission helpers (`requireCan`, `authorizePublish`, …), but each plugin must call them; GETs are open | `data-types/CLAUDE.md:200-226` |
| Judge default-deny for writes, blank-row rule | `S/routes/auth/judge.js:31,137-143` |
| `formats` written only by the server-side script; no HTTP write | `S/routes/auth/formats.js:1-12` |
| Per-plugin `require` isolation at boot | `data-types/register-datatypes.js:40-55` |
| The hard-coded plugin list (de facto allow-list) and image build from pinned commits | `register-datatypes.js:15-38`; `deploy/README.md:277-289` |
| `readOnly` DB configs | `dms-server/CLAUDE.md:195` |
| Rule SQL hygiene (`quoteIdent`, no string params in SQL) | `data-types/CLAUDE.md:189-192` |
| Process stays up on uncaught exceptions (`DMS_EXIT_ON_UNCAUGHT=1` to exit) | `S/utils/process-safety.js:1-30` |
| Request timeouts 30 s / 120 s | `S/index.js:113-126` |
| Access log of refusals (`dms.access_log`), opt-in request log (`DMS_LOG_REQUESTS`), `[graph]` console log | `S/access-log/index.js:13,53`; `S/index.js:129,215-245` |
| Destructive routes have separate `…/plan` routes; tenant delete backs up first | `dms-server/CLAUDE.md:109-119`; `S/routes/tenants/index.js:4-6` |
| Site folder/build names can't escape the sites folder; security headers | `S/sites/index.js:24-35` |
| Health-checked container swap, kept previous containers, deploy log | `deploy.sh:471-584` |

Missing: no plugin signing, checksums or provenance; no core rate limiting (the `analytics` plugin has its
own limiter, `data-types/analytics/routes.js:34-37`, and `external_map_layer` its own SSRF guard,
`data-types/external_map_layer/index.js:15-26`); no per-plugin resource limits; no per-plugin DB roles; no
audit of plugin installs (nothing to audit yet).

---

## 6. What is hard, and what exists to build on

| Concern | Hard | Exists to build on |
|---|---|---|
| **Per-plugin dependencies** | One hoisted `node_modules` assembled in the Dockerfile; plugins resolve deps by walking up to `/app/node_modules` and import dms-server by package name; native addons need a compiler (present) and system libs (GDAL, Chromium) baked into the image. Install-time `npm install` runs third-party install scripts. | Node resolves a plugin's own `node_modules` first, so `var/plugins/<name>/<ver>/node_modules` works if `@availabs/dms-server` is a peer resolved to the host's copy. Packages could ship vendored/bundled deps to avoid install scripts. |
| **Migrations** | Plugins create DDL ad hoc at request/worker time; no ledger, no versions, no down path. | Core's `migrate_*.sql` per role, re-runnable, run after init (`dms-server/CLAUDE.md:199-225`); the schema-drift test pattern; `ensureSchema`. A per-plugin `migrations/` folder plus a version table would follow the same rules. |
| **Upgrades and rollback** | In-flight tasks bound to old code; schema changes may not be reversible; a source's column list is fixed for life (`data-types/CLAUDE.md:262-276`). | The site-build model: immutable versioned folders + one pointer file re-read without restart, with `--promote`/`--rollback` (`S/sites/index.js`; `deploy/README.md:28-50`). |
| **Uninstall** | No unregister for routes, handlers, schedulables or rules; data stays (tables, sources whose `type` names the plugin, schedules, task rows). | Missing schedulable already degrades to `schedule:BLOCKED` (`S/dama/tasks/schedules.js:233-238`); missing handler fails the task cleanly (`S/dama/tasks/index.js:152-155`); `deleteDamaView` cascades safely; `…/plan` route convention. |
| **Isolation (separate process/container)** | Routes are in-process Express handlers using shared helpers; a remote plugin needs an RPC/proxy for routes and a capability API instead of deep imports; credentials would have to be scoped (per-plugin DB users), not copied; forked children inherit all env today. | `worker-runner.js` fork path with DB-mediated status/events (no IPC protocol needed); task rows + events already decouple queue from executor (`host_id`); preview stacks prove per-container isolation with `readOnly` DAMA; nginx already proxies per-host to separate containers (`ownServers`). |
| **Hot (un)load** | 404 catch-all ordering; no unmount in Express; ESM cache; plugin-owned timers/threads; several processes. | Mutable registries (`handlers`, `schedulables`); per-request Falcor instance; polling-pointer and TTL-cache precedents; `ssr.invalidateRoutes()`. |

---

## Implications for the plugin design

1. **In-process means full trust.** Any server plugin loaded into today's process can read every tenant's
   schema, every database password, and `JWT_SECRET`, so it can act as any user on every tenant. Per-tenant
   activation is then an access-control *convenience*, not a security boundary. Either restrict in-process
   loading to first-party, signed plugins installed by hub staff, or run third-party server code out of
   process with scoped credentials. Both may be needed (a trust tier).
2. **Define a real server API before packaging.** Today plugins reach into about a dozen internal modules through ~150 `require` statements. A runtime plugin
   format needs a versioned capability object (the `helpers` object, grown: db access scoped to the plugin's
   schema and the caller's pgEnv, task queue, metadata, storage, auth checks) with `@availabs/dms-server` as a
   peer, and no `loadConfig`/`getPostgresCredentials`.
3. **Hot load is feasible for routes and workers with modest core changes:** one dispatcher mounted at boot
   (`/dama-admin/:pgEnv/:plugin/*` → mutable map), `unregisterHandler`/`unregisterDatatype`, a lifecycle
   `{ start(ctx), stop() }` so plugins own and release timers/threads, CJS-only server entry (or a new path per
   version for ESM). Expect old code to stay in memory until the next restart; treat "no restart" as "no
   restart *needed*", with a periodic restart still clearing leaks.
4. **Copy the site-build model for install/upgrade/rollback:** download to `var/plugins/<name>/<version>/`
   (verify checksum/signature), point an `active` pointer at it, have every server poll the pointer/table
   like `site.json`. This also reaches the hub and preview containers without image rebuilds. The `var`
   volume is the only writable persistent place today.
5. **Two records:** a server-level `installed plugins` table (hub staff only) and a per-tenant activation
   row modelled on `:dmsenv` (attach/detach + `…/plan`). Plugin routes must then check activation against the
   *authenticated* tenant (Host on the hub), not `X-DMS-App`, which is client-asserted; data-type routes are
   per pgEnv today, so a pgEnv shared by tenants needs that check.
6. **Formats at activation:** ship pre-emitted format rows in the package, and add a server-side merge writer
   (core set + active plugins' keys) since `upsertFormats` replaces the whole set. Keep the rule that only the
   server writes formats.
7. **Migrations need a contract:** per-plugin re-runnable migration files, a version ledger, DDL confined to
   the plugin's own schema(s), and an explicit uninstall policy (keep data by default, a `…/plan` + backup
   for removal), reusing the core migration rules.
8. **Dependencies:** prefer bundled plugins (single file, no install scripts) or install with
   `--ignore-scripts` into the plugin's own folder; native/system deps (GDAL, Chromium) stay a property of the
   host image, declared by the plugin as required capabilities and checked at install.
9. **Fix adjacent hazards first or alongside:** the staging container sharing `host_id`
   (`server-background-jobs-switch.md`), core code that knows a plugin (`trsp-memory` timeout skip,
   `S/index.js:117`), forked workers inheriting all env, and `DMS_AUTH_MODE=log` on production: under `log`, a
   plugin route's refused write still goes through.
