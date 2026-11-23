# DMS plugin system: packaged themes, patterns and data-types, installed from a URL and enabled per tenant

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** doing (2026-11-23, not committed: P0 (hazards) investigated, P1 (the contract) built and checked, owner's review D9–D12 recorded, plugins moved to `src/plugins/`, P2 (runtime loading) steps 1–4 built and checked end to end, step 5 (admin view, activation write check, settings check, permissions rule, the Plugins page) built; signatures deferred by the owner; rolling restart suggested, awaiting the owner) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

**Project:** DMS library + dms-server + dms-template · **Topic:** platform architecture · **Started:** 2026-11-22

## Objective

Give DMS a plugin system. A **plugin** is one package that can carry any or all of:

- **themes**,
- **pattern types** (with the page-section components they register),
- **data-types** (dms-server routes, workers, schedulables, and their client pages).

A plugin has a **standard package format** covering both its client and its server code. dms-server can
**download a plugin from a URL** (e.g. a GitHub release) and **install it without a restart**, and each
**app / tenant activates** the plugins it wants. In the long run plugins come from an **npm-like registry**.

Installing third-party code into a running multi-tenant server has security and dev-ops consequences; the
research phase weighs them before any design is settled.

## Scope

- **In (this task, phase 1):** research and a design proposal. The architecture of dms (library), dms-server
  and dms-template as it bears on plugins; how other systems solve the same problem; options for isolation,
  signing, install, activation, hot load and the registry; a recommended design with phases; decisions for
  the owner.
- **Out until the owner decides:** any code. The build phases are written after the decisions.

## Current state

Research done and decisions D1–D8 taken (2026-11-22); the build starts with P0. Starting points:

- Pattern types are pluggable (`registerPatternTypes`; mapeditor and qa moved out of the library,
  `pluggable-patterns-mapeditor-extraction.md`, `pluggable-patterns-qa-extraction.md`); a pattern registration
  can ship page components, and owns a `defaultTheme` under its own name.
- Data-types are plugins on the server (`datatypes-plugin-infrastructure.md`: `data-types/`,
  `register-datatypes.js`, `DMS_EXTRA_DATATYPES`), built into the server image.
- Themes are JS objects registered by the app at build time.
- Everything is compiled into one client build and one server image today; nothing is loaded at run time.

## Research plan

- [x] R1 (client architecture): how themes, patterns, section components and data-type client pages register
      and load in the library and dms-template; build, code splitting, SSR and RSC entries; per-site selection
- [x] R2 (server architecture): dms-server's data-type loading, workers and task queue, routes, auth and
      tenancy, DB access, deploy and restart on mercury
- [x] R3 (prior art): how other platforms package, install, activate and distribute plugins with client and
      server code
- [x] R4 (security and dev-ops): isolating server code, isolating client code, supply chain (signing,
      provenance, review), hot load without restart, rollback, registry hosting
- [x] Synthesis: options, recommended design, phases, decisions for the owner (below)

## Findings

### R1 (client architecture), 2026-11-22

Full report: [`research/dms-plugin-system/R1-client.md`](../../research/dms-plugin-system/R1-client.md) (file:line references).

- **Bundler**: the installed Vite is **7.2.7 on Rollup** (`package.json` `~7.2.7`), not Vite 8 / Rolldown as
  dms-template's CLAUDE.md says. React 19.2.8, React Router 8.5.2.
- **15 client registration points**, all module-level objects with no subscription and no unregister. Section
  types, column types, format functions, widgets and map plugins are read at render time (a late registration
  reaches later renders); pattern types, themes and `damaDataTypes` are read only at route build, which reruns
  only when site data changes (nothing exported can trigger it).
- **Code themes already carry code** (at route build they register section/column types, format functions,
  menu/header extensions, widgets, map plugins, app-wide); DB themes (`:theme` rows in `theme_refs`) are JSON
  only. `SectionIslands.jsx` (RSC path) repeats that registration.
- **Sharing**: React, router and the library are shared only by being one Rollup graph (hashed chunks, mangled
  export names). No import map, Module Federation or `import(url)`. App patterns make ~45 imports into ~20
  internal library modules and rely on context identity (`ThemeContext` ×64). A separately built plugin needs
  React, the router, lexical and the host's **single** library instance as singletons.
- **Where loading fits**: `dmsSiteFactory` and SSR `buildRoutes` already await work between "site row loaded"
  and "routes built"; the client can load plugins before `hydrateRoot` (as `main.jsx` does for themes). SSR has
  `invalidateRoutes()`, but imports its bundle once at startup with the library inlined.
- **Deploys**: most sites are static per-site builds; mercury site builds promote without a restart; SSR runs
  only in the tenant hub's image. No-restart options: rebuild + promote, or versioned plugin bundles loaded by
  `import()` (also in Node, then `invalidateRoutes()`).
- **No per-site/tenant enablement exists**: every addable pattern type is offered to every site; tenant rows
  hold name, subdomain, app, domains; the only per-app selection is `dataTypesByApp` in app code (data-type
  pages never reach SSR). The hub's SSR process holds one set of global registries, so **activation must be
  checked where registries are read**, not only at registration.
- **CSS**: Tailwind 4 generates CSS from scanned source. Plugin classes would depend on the CDN runtime compiler
  (`index.html:27`), which means a flash of unstyled content after SSR, and the RSC work plans to remove it.
  Needs an early decision.
- **To build on**: registry capability flags, `lazyComponent`, `invalidateRoutes`, no-restart site promotion,
  `DMS_EXTRA_DATATYPES`, `.dmsrc` hooks, `emit-formats --extra`, data-type folders that already hold server code
  and client pages.

### R2 (server architecture), 2026-11-22

Full report: [`research/dms-plugin-system/R2-server.md`](../../research/dms-plugin-system/R2-server.md) (file:line references).

- **Data-types load only at boot**: `DMS_EXTRA_DATATYPES` → `data-types/register-datatypes.js`, a hand-written
  list of 22 plugins (in effect the allow-list). Each is `{workers, routes, openRoutes, schedulables, rules}`; no
  manifest, version, migrations or lifecycle hooks. Their client pages are compiled into the site build.
- **No real plugin API**: plugins reach ~a dozen dms-server internals through ~150 deep `require`s
  (`src/db`, `dama/upload/metadata`, …); 12 workers call `getPostgresCredentials`.
- **Workers run in the server process** (a 5 s poller per DAMA pgEnv, no concurrency cap; tasks pinned to a
  `host_id`, claimed with `SKIP LOCKED`; a restart marks running tasks as errors). The fork runner covers 4 core
  workers only, and the child inherits the whole environment.
- **What hot install collides with**: the 404 catch-all mounted after the datatype routes (`index.js:445`) and no
  route unmount in Express; append-only registries; ESM/CJS module caches; plugin-owned timers, `worker_threads`
  pools and in-memory graphs (`routing`, `transcom`); the Falcor router built once at module load; several
  containers (main, hub, previews) that would each need the install.
- **Precedents for change without restart**: `site.json` re-read every second with promote/rollback; formats
  cached 30 s; the hub's domain store refreshes and fires `onChange`.
- **Tenancy**: a schema per app, but one database and one Postgres user for all apps; isolation is app code
  only. Datatype routes are per pgEnv, not per tenant; `X-DMS-App` is client-set and unchecked. Nearest model for
  "enabled for tenant": the `:dmsenv` row (pgEnv attach/detach by hub staff).
- **Formats**: written only by `register-formats.js`, and `upsertFormats` replaces the whole set, so a plugin
  can't add its rows alone; a server-side merge writer is needed.
- **An in-process plugin has every privilege**: every DB credential, every tenant's data, and `JWT_SECRET` (it
  could mint a token for any user). Per-tenant enablement is visibility, not a security boundary.
- **Rails that exist**: sign-in gate on plugin writes, default-deny judge, server-only formats writes,
  `readOnly` DB configs, health-checked deploys, access log. **Missing**: signing, rate limits, per-plugin DB
  roles, resource limits. To verify: `DMS_AUTH_MODE` was recorded as unset (= `log`, refused writes still go
  through) on production in `planning/shared/tasks/current/auth-data-migration-dms-mercury-3.md:75-77`.

### R3 (prior art), 2026-11-22

Full report: [`research/dms-plugin-system/R3-prior-art.md`](../../research/dms-plugin-system/R3-prior-art.md) (17 systems, sources inline, a comparison table;
unverified claims marked).

- **Closest analogue: Directus** (read from source). Installs from its marketplace without a restart: download
  the npm tarball, extract to a folder per version, unload and reload every extension, broadcast
  `extensions.reload` to other nodes. Frontend extensions bundled on the server with Vue etc. external.
  Untrusted server code runs in isolated-vm with memory/time limits and declared permissions; by default the
  marketplace installs only sandboxed server extensions.
- **Install server-wide, activate per tenant, enforced by the host**: Grafana (operator installs, org admin
  enables), WordPress multisite, Mattermost, Atlassian Forge (per site; a version that adds permissions needs the
  site admin's re-approval), Shopify (per shop). Discourse is the warning: per-site enable is a flag the plugin
  checks, and it "doesn't have a clean way to undo the effects of a loaded plugin".
- **Everyone who installs at runtime ships prebuilt bundles and provides the shared libraries**: import map
  (Grafana), Module Federation (Red Hat Developer Hub via Scalprum; JupyterLab with singleton/strictVersion),
  bundler externals (Directus), globals (Mattermost). Systems that rebuild the host per plugin (Strapi, Payload,
  Kibana, Discourse plugins) need a restart.
- **Third-party server code goes in another process**: go-plugin over gRPC (Grafana, Mattermost, Terraform), VS
  Code's extension host, hosted functions / WASM (Shopify, Forge), containers (Nextcloud ExApps).
- **In-page sandboxes keep failing**: Figma's Realms shim was escaped (replaced by a JS interpreter in WASM);
  Grafana's frontend sandbox is deprecated (removal 13.4); Directus dropped vm2 after an escape. What holds:
  iframes, and workers rendering through remote-DOM (Shopify).
- **Trust**: hash pinning everywhere (RHDH sha512, OCI digests, Terraform sha + GPG); signatures checked at load in
  Grafana, Nextcloud, VS Code. 2024–26 incidents came through stolen publisher accounts and tokens (WordPress
  password reuse, Open VSX GlassWorm, npm Shai-Hulud); the answer is 2FA, short-lived tokens, CI publishing with
  OIDC and provenance.
- **Its lessons for DMS** match R1, R2 and R4: npm tarball with a `dms` key in `package.json`; prebuilt
  `dist/client`, `dist/ssr`, `dist/server` only; native ESM + import map (Module Federation 2.0 still lists SSR
  as future work); a folder per version; registries rebuilt atomically; class-string themes as a lower-trust tier.

### R4 (security and dev-ops), 2026-11-22

Full report: [`research/dms-plugin-system/R4-security-devops.md`](../../research/dms-plugin-system/R4-security-devops.md) (sources inline, 15-row threat model; three
points marked unverified at its end).

- **No in-process security boundary in Node.** Node's permission model "does not provide security guarantees in
  the presence of malicious code" (stable since v22.13 / v23.5; bypass CVEs in 2025–26, e.g. CVE-2025-55130
  symlink escape); `node:vm` "is not a security mechanism"; isolated-vm is in maintenance mode and can't run npm
  packages. Anything loaded into the host process is trusted code.
- **Real boundaries**: a process or container per plugin with **its own Postgres login role**, or WASM
  (Grafana subprocess + gRPC, Cloudflare isolates + seccomp, Atlassian Forge, Directus). `SET ROLE` on a shared
  pool is not a boundary (`RESET ROLE`). GDAL-calling workers need a real process, so isolated-vm / WASM / SES
  can't be their only runtime.
- **Browser**: plugin JS on the DMS origin can make authenticated requests as the user even with an HttpOnly
  cookie. Untrusted UI needs a sandboxed cross-origin iframe or a worker + remote-dom (Figma, Shopify, Forge) and
  gives up server rendering; only trusted plugins can supply SSR / server components.
- **Loading separately built client code**: Module Federation 2.0 (stable, Node support) or, simpler, plugins
  built as ESM with React etc. externalized and resolved through an **import map**. Plugins must target the host's
  React Compiler runtime (`react/compiler-runtime`). Each plugin ships **its own compiled Tailwind CSS**,
  optionally with the v4 `prefix(xx)` form.
- **Hot install**: the ESM cache can't drop modules (re-import leaks). Split **install** from **activation**:
  activation per tenant is a DB row checked per request (instant; doubles as a kill switch). New **server** code
  arrives by a **health-checked rolling restart** (two containers behind nginx, or `reusePort`, Node 22.12+);
  out-of-process plugins restart without the host.
- **Supply chain** (chalk/debug hijack 2025-09-08; Shai-Hulud Sept 2025 and 2.0 ~Nov 2025 via preinstall
  scripts): pin artifacts by digest; GitHub immutable releases; Sigstore signatures checked against the
  **expected signer identity**; SLSA build L2+; dependencies **bundled at build time**, never `npm install` on
  the host.
- **Registry**: start with a static signed index; TUF metadata before outside publishers; OCI + ORAS if
  container-packaged plugins appear. Tenants pin exact versions; plugins declare a semver range of the host SDK.
- **Tiers**: first-party in-process (GDAL workers still in their own processes); partner = a process per plugin,
  own DB role, outbound allow-list; untrusted = WASM or a container, no raw SQL, iframe / remote-dom UI. **One SDK
  API across tiers**, so a plugin can move tier without a rewrite.

## Proposed design

The four reports agree on the shape. Revised 2026-11-22 after the owner's decisions D1–D8 ("Decided" below).

### 1. The package

A plugin release is an **`index.json` that names every file to download**, plus those files (D3). The layout
stays as close to npm as possible: the release's files are an npm-style package (a `package.json` with a `dms`
key), and `index.json` is generated from it by `dms plugin pack`. A `.zip` of the same files may sit beside it as
a one-download alternative; the installer checks it against the same `index.json`.

```jsonc
// index.json (generated; signed: index.json.sigstore)
{
  "name": "now_playing", "version": "1.4.0",
  "api": "^1.0",                           // the DMS plugin API range it was built for (not the app version)
  "contributes": { "themes": ["now_playing_dark"], "patterns": ["now_playing"], "dataTypes": ["now_playing"] },
  "entries": {
    "client": "dist/client/index.js",     // browser ESM, peers external
    "ssr":    "dist/ssr/index.js",        // Node ESM for the server render, peers external
    "server": "dist/server/index.cjs",    // routes, workers, schedules
    "classes":"dist/classes.txt",         // the class strings it uses, for the per-site CSS build (D5)
    "formats":"dist/formats.json",        // pre-emitted format rows (auth rules, vocabulary)
    "migrations": "migrations/"
  },
  "permissions": { "schemas": ["now_playing"], "egress": ["identify-eu-west-1.acrcloud.com"],
                   "taskTypes": ["now_playing:*"], "requires": [] },   // requires: host capabilities, e.g. "gdal"
  "files": [ { "path": "package.json", "size": 812, "sha512": "…" },
             { "path": "dist/client/index.js", "size": 48213, "sha512": "…" } /* every file */ ]
}
```

The same fields live under `dms` in the release's `package.json` (with React, react-dom, react-router and
`@availabs/dms-plugin-api` as `peerDependencies`), so the package also works with npm tooling later.

- **Prebuilt only, dependencies bundled.** React, react-dom, react-router, lexical and the DMS plugin API are
  peers resolved to the host's single copy; everything else is inside `dist/`. The server never runs
  `npm install` or install scripts (how Shai-Hulud spread).
- **One `register(host)` entry per side**, no import-time side effects. Client/SSR: registers pattern types,
  section types, column types, format functions, widgets, map plugins, themes, data-type pages through `host`.
  Server: returns `{ routes, workers, schedulables, rules, start(ctx), stop() }`. The host calls it at a known
  time, which is what makes per-tenant activation and reload possible.
- **A versioned plugin API** (`@availabs/dms-plugin-api`, semver) replaces today's ~150 deep `require`s and the
  ~45 deep client imports: scoped DB access (the plugin's own schema + the caller's pgEnv), task queue, metadata,
  storage, auth checks, the UI set. No `getPostgresCredentials`, no `loadConfig`. Written so its transport can
  later become RPC without changing plugins (needed for an isolated tier).
- **A `dms plugin` CLI**: `init`, `build` (Vite library build with the peers external and the host's React
  Compiler target; writes `classes.txt`), `pack` (writes `index.json`), `publish` (a GitHub release from CI),
  `install <url|name>`.

### 2. Loading the code

- **Browser:** the host build publishes its shared modules as stable, unhashed ESM entries
  (`/_dms/shared/react.js`, …, and the plugin API) and writes an **import map** into every page. The active
  plugins' `client` entries load with `import()` in `dmsSiteFactory`, after the site row and before
  `pattern2routes`; `main.jsx` loads them before `hydrateRoot`. Their styles come from the site's server-compiled stylesheet (D5). Changes
  take effect on the next page load; ES modules can't be unloaded.
- **SSR:** Node `import()` of the `ssr` entry from the plugin's version folder, with a module resolve hook
  (`module.register`) mapping the peers to the host's copies; then `invalidateRoutes()`.
- **RSC:** plugin sections are client islands in v1 (they already work that way); server components from
  plugins wait for the RSC path to settle.
- **The hard part on the client:** the library is inlined and minified inside the app's Rollup graph today.
  Exposing it as a shared module with a frozen public surface is the largest client change.

### 3. Installing

A user holding the **`install-plugins` verb** on the root site row (D7: grantable to anyone, mostly hub staff)
asks the server to install a release URL. The server does the rest:

1. Fetch `index.json` and its Sigstore bundle; verify the signature against the **allow-listed signer identity**
   (our GitHub Actions publishing workflow). In v1 that is the only identity (D1), which is what makes the verb
   safe to grant: a holder can install only our signed plugins, never arbitrary code.
2. Download each listed file (or the zip) and check its size and sha512 against `index.json`; refuse on any
   mismatch or any file not listed.
3. Write the files to `var/plugins/<name>/<version>/` (the shared writable volume: main, hub and preview
   containers all see it). Check `api` against the host's plugin API version and `requires` against the host's
   capabilities.
4. Record the result on the plugin's install row (section 4). Only the installer writes that row.
5. **Client, SSR and theme parts go live at once** (new page loads pick them up). **Server code goes live by a
   health-checked rolling restart** (D2; two containers behind nginx, or `reusePort`), not by loading new modules
   into the running process: Node can't evict modules, and every reviewed platform that hot-loads server code
   either leaks or restarts. Rollback = point back at the previous version folder (the site-build model:
   `site.json`, promote/rollback).
6. Uninstall keeps the plugin's data unless a separate, planned removal (with a backup) is run.

### 4. Activating per tenant: row kinds and a verb

Both records are **DMS rows** (D6), so they get a format, a `permissionDomain`, the grants editor, the change
log and sync like any other row. Names to settle in P1; the shape:

| Row kind | Where | Type (example) | Holds | Written by |
|---|---|---|---|---|
| plugin install | the root site's app | `hub\|now_playing:plugin` | source URL, installed versions + digests, signer, status, error | the installer only (the general write path refuses it, as it refuses `formats`) |
| plugin activation | each tenant's app | `mny\|now_playing:plugin_activation` | plugin, pinned version, config (checked against the manifest's settings schema), enabled | the normal write path, gated by the **`activate-plugins` verb** on that tenant's site row |

- **Verbs (D7)**: `install-plugins` on the root site row and `activate-plugins` on each tenant's site row; both
  grantable to any user or group, held mostly by hub staff. Site-level verbs live on the site row (rule 3 of the
  auth rules).
- **The server validates an activation write**: the version must be installed, the config must match the schema,
  and a version that adds permissions needs a fresh activation rather than a silent upgrade (Forge's rule).
- **The host enforces activation everywhere a registry is read**: pattern types offered in the admin, section
  types in the editor, theme lists, data-type routes, task types a tenant may enqueue, Falcor routes. The tenant
  comes from the authenticated Host, never from `X-DMS-App` (client-set). The server keeps the active set per
  app in memory and refreshes it from the change log (as the formats cache does). Disabling is instant and
  doubles as a kill switch.
- **Formats**: on activation the plugin's pre-emitted rows are merged into the app's `formats` by a new
  server-side writer (core set + active plugins); only the server writes formats.
- **Migrations**: per-plugin, re-runnable, recorded in a version ledger, DDL confined to the plugin's schema(s).
- **CSS**: activation triggers a rebuild of the site's stylesheet (D5).

### 5. Trust: our plugins only in v1, isolation later (D1)

v1 installs only plugins signed by our own publishing workflow. Their server code runs in the dms-server
process and has every privilege the server has (all tenants' data, every credential, `JWT_SECRET`); its safety is
our own review plus the signature check. Workers still move into their own processes when convenient (crash
isolation, a scrubbed environment), but that is not a security boundary.

Later tiers, recorded so the plugin API is designed to allow them (its transport can become RPC without changing
plugins):

| Tier | Who | Server code | DB | UI |
|---|---|---|---|---|
| v1, trusted | us (signed by our CI) | in-process; workers in their own processes | shared, through the plugin API | same origin, SSR |
| isolated (later) | vetted partners | a process per plugin behind RPC, **own Postgres login role**, egress allow-list | own role, schema grants, statement timeout | same origin after review, else iframe |
| untrusted (only if needed) | an open registry | WASM or a container, no raw SQL | host-mediated queries only | cross-origin iframe or worker + remote-dom; no SSR |

### 6. Distribution: GitHub first (D8)

1. Each plugin is published as a **GitHub release** by our CI: `index.json`, `index.json.sigstore`, the files
   (and optionally the zip), with GitHub's immutable releases on. Install by release URL.
2. A **plugin list** in a GitHub repo (`plugins.json`: name, description, release URLs, API range, yanked flag),
   read by the admin's install view and `dms plugin search`.
3. Before any outside publisher: TUF metadata for the list, verified namespaces, mandatory provenance, scanning,
   and npm-compatible hosting if needed (the release layout already matches npm).

## Phases

- **P0 (hazards first):** check `DMS_AUTH_MODE` on production (recorded as `log`: refused writes go through);
  the staging container sharing `host_id`; the core's special case for the routing plugin (`trsp-memory`,
  `index.js:117`); forked workers inheriting the whole environment; fix CLAUDE.md's Vite version.
- **P1 (the contract, still built in):** the plugin API package; the manifest / `index.json` schema;
  `register(host)` on both sides; a server route dispatcher mounted at boot, `start`/`stop` lifecycle, unregister;
  the install and activation row kinds with their formats and the two verbs; activation checks at every registry
  read; the formats merge writer; the migrations ledger. Convert `mapeditor`, `qa`, one data-type (`now_playing`)
  and one theme into plugin-shaped packages, still compiled in. Proves the contract with no runtime loading.
- **Server-compiled per-site CSS ([server-compiled-site-css.md](./server-compiled-site-css.md), needed before P2):** the server builds each site's stylesheet
  from the core, its themes (code and `:theme` rows) and its active plugins' `classes.txt`, rebuilt on theme save
  and on activation, served hashed and linked in the head; retires the in-browser Tailwind compiler. Wanted beyond
  plugins (rsc-view-pages future direction 6; DB themes; FOUC).
- **P2 (runtime loading):** the shared-module build and import map; the `dms plugin` CLI (`build`, `pack`,
  `publish`); client + SSR loading from `var/plugins`; the installer (signature, digests, version folder);
  rolling restart for server parts; the admin view (hub Tenants tab) for installs and per-tenant activation.
- **P3 (GitHub list):** `plugins.json` and `dms plugin search`.
- **Later:** workers in a process per plugin; the isolated and untrusted tiers; TUF and hosted registry when
  outside publishers come.

## P0 (hazards) findings (2026-11-23, read-only investigation; nothing changed on any server)

1. **`DMS_AUTH_MODE`** (high). Read per call in `dms-server/src/routes/auth/settings.js:13-15`; unset or a typo
   means `log`, which refuses nothing (would-denies go to the console and the access log), for every guard,
   data-type routes included. A few paths enforce regardless (reach-limited rows, the `update-source` index
   build, tenant delete). **Nothing in the repo sets it**: not `deploy.sh` (it passes `--env-file` = the server's
   own `.env`), the Dockerfiles, `deploy/targets.json` (the `server` target has no `env`), the preview stacks'
   `server.env`, or either `.env.example`; `auth-data-migration-dms-mercury-3.md:74-77` says it stays unset. So a
   plugin write route behind `writeGate` is judged, then allowed. **To verify on mercury** (not done: no server
   access overnight): `DMS_AUTH_MODE` in `/home/avail/prod/dms-template/.env` and in the hand-started hub
   container (`docker inspect dms-hub-server`). **Fix:** policy: `enforce` in each server's `.env` once its access
   log is clean. For plugins specifically: their routes could always run `enforce` (a
   `writeGate(def.openRoutes, { mode: 'enforce' })` option in `dama/datatypes/index.js`), as the `update-source`
   index build already does, so new plugin code never ships under `log`.
2. **Two servers sharing `host_id`** (medium-high). `dama/tasks/host-id.js:12-26` keeps a UUID in
   `var/dama_host_id`, no env override; the DMS task system shares it. `deploy.sh:532-539` starts the staging
   container with the same `--env-file` and the same var volume, so for up to 180 s it marks the live container's
   running tasks `error` (`recoverStalledTasks`), claims queued tasks and is then killed, and fires due schedules.
   Preview stacks are safe (own var dir, read-only DAMA configs). A second local dms-server from the same checkout
   does the same. **Fix:** `server-background-jobs-switch.md`: `DMS_BACKGROUND_JOBS=off` checked inside
   `startPolling`, `recoverStalledTasks` and `startScheduleSweep` (both task modules; `queueTask` calls
   `startPolling` itself, so a boot-only switch reopens) and in change-log compaction; `-e DMS_BACKGROUND_JOBS=off`
   on the staging `docker run`; optionally `DMS_HOST_ID`.
3. **The core's special case for routing** (low for security; breaks "the core names no data type"). A global
   timeout middleware (`dms-server/src/index.js:136-151`; 30 s, 120 s for `/graph`) skips any path containing
   `trsp-memory` (`:142`, a substring match) because routing searches take 60 s+. **Fix:** data in the
   registration: `definition.longRoutes` (or `requestTimeoutMs`) read by `mountDatatypeRoutes`, which resets the
   socket timeout for those routes; remove `:141-142`; declare it in `data-types/routing/index.js`. Related: the
   routing warm-load (`routing/index.js:348-365`) hard-codes pgEnv `npmrds2` 20 s after boot: a declared
   `start()` hook later.
4. **Forked workers inherit the whole environment** (medium now, high once plugin workers run out of process).
   The only `fork` is `dama/upload/gis-routes.js:301-308` (`env: { ...process.env, … }`) for the four core
   publish workers; `ogr2ogr`, `zip`, `tippecanoe` spawns pass no `env`; routing's `worker_threads` get a copy;
   most plugin workers run in-process anyway. What the forked chain reads: the DB config dirs and split mode,
   storage (`DMS_STORAGE_TYPE`, `DAMA_SERVER_FILESTORAGE_PATH`, `AWS_*`), `DMS_PUBLIC_URL`, `DAMA_SERVER_URL`,
   `DAMA_CSV_ANALYZER`, `DAMA_TASK_POLL_INTERVAL`, process basics, `GDAL_*`/`PROJ_*`/`CPL_*`/`PG*`. Not needed:
   `JWT_SECRET`, `DMS_DOMAIN_TOKEN_SECRET`, `TRANSCOM_*`, mail. Note: DB passwords are in the config files, so an
   env allow-list doesn't narrow DB access (per-plugin roles would). **Fix:** `dama/tasks/worker-env.js`
   `workerEnv(extra, declared)` (an allow-list plus prefixes) used by the fork and the spawns; later a
   registration field `env: [...]` for a plugin's own variables.
5. **CLAUDE.md's Vite version:** `dms-template/CLAUDE.md:206` says "Vite 8 (Rolldown bundler)"; installed is
   7.2.7 (`package.json` `~7.2.7`; a `vite.config.js.bakv8` shows a reverted attempt). Not edited: the owner's
   file; one-line fix when the owner agrees.

None of these block P1 (compiled-in plugins run exactly as the code does today). 1, 2 and 4 must be settled
before P2 installs server code at run time.

## Decided (owner, 2026-11-22)

- **D1 (who may publish, v1):** our own trusted plugins only; isolation comes later.
- **D2 (server code without a restart):** no preference; we use the recommended **rolling restart** for server
  code, with client, SSR, themes and activation live at once. Revisit if a hot load is ever needed.
- **D3 (package format):** an **`index.json` naming every file to download**; a zip is fine as well; stay as
  close to npm as possible (an npm-style `package.json` with a `dms` key, from which `index.json` is generated).
- **D4 (sharing React etc.):** no preference; we use the recommended **import map + ESM with peers external**.
- **D5 (plugin CSS):** **server-compiled per-site CSS**, chosen for reasons beyond plugins; a task of its own.
- **D6 (where activation lives):** **a row kind** (and the install record likewise).
- **D7 (who activates):** **a verb**, grantable to any user, held mostly by hub staff (`activate-plugins`;
  installing is `install-plugins`).
- **D8 (first registry):** **GitHub** (releases, then a plugin list in a repo).

## Decided (owner, 2026-11-23, reviewing the overnight P1)

- **D9 (names):** the row kinds `plugin` and `plugin_activation` and the verbs `install-plugins` and
  `activate-plugins` stand as built.
- **D10 (repos):** a plugin does not need a repo of its own; **one repo holds many plugins**. No `plugins.json`
  repo now (P3 (GitHub list) waits). Releases from a shared repo are told apart by name and version.
- **D11 (where they live):** a **plugins folder in dms-template, `src/plugins/`**, one folder per plugin, starting
  with the five converted in P1 (mapeditor, qa, chat, the weather_analytics theme, the now_playing data type).
- **D12 (server-side activation):** **not checked on the server for now**; later, probably through source grants.
  The client-side checks (route builder, pickers) stay.
- **P0 (hazards):** the owner agreed with the findings and fixes. Production `DMS_AUTH_MODE` and the
  background-jobs switch (`server-background-jobs-switch.md`) are server settings and another task; the code
  fixes (plugin routes judged under `enforce`, the worker environment allow-list) are done here.

## P1 build plan (2026-11-23, overnight; choices marked *provisional* await the owner's review)

The owner asked for as much progress as possible overnight. The three open points get provisional choices so the
build can proceed; each is cheap to change before anything is committed.

(The three provisional choices below were settled on 2026-11-23: D9 kept the names; D10 dropped the separate
`plugins.json` repo; D11 kept the first theme and moved all five plugins into `src/plugins/`.)

- *Provisional:* **row kinds** `plugin` (install record, in the root site's app: `<site>|<name>:plugin`) and
  `plugin_activation` (in each tenant's app: `<site>|<name>:plugin_activation`); **two verbs**, `install-plugins`
  and `activate-plugins`, as D7 names them (one verb would let anyone who can switch a tenant's plugins install
  new code server-wide).
- *Provisional:* **`plugins.json`** in its own repo (`availabs/dms-plugins`), so the list can change without a
  dms-template release. Nothing is created yet: P3.
- *Provisional:* **first theme converted:** `weather_analytics` (one site; it carries a Tailwind `@theme` block,
  so the CSS path is exercised too).
- **Compiled-in plugins stay on by default.** A converted plugin that is compiled in (mapeditor, qa, chat,
  now_playing, the theme) is *default-on*: active for every tenant unless an activation row turns it off. This
  keeps every site exactly as it is. Plugins installed at run time (P2) are *opt-in*.

Steps, in order:

1. **The contract (library):** `packages/dms/src/plugins/`: the plugin shape (`{ name, version, api, register }`),
   the plugin API version, a `createPluginHost()` whose methods wrap today's registries (pattern types, section
   types, column types, format functions, widgets, themes, data-type pages) and record each plugin's
   contributions, `registerPlugins()`, and lookups (`pluginOf(kind, name)`). Themes and data-type pages have no
   core registry today (an app-level `loaders` map and a `<DmsSite>` prop); the host adds one each, merged where
   those are read.
2. **The contract (server):** dms-server `src/plugins/`: the manifest (`package.json` `dms` key / `index.json`)
   validator, and `register(host)` on the server returning today's data-type shape (`workers`, `routes`,
   `openRoutes`, `schedulables`, `rules`), loaded through the existing `registerDatatype`.
3. **Convert, still compiled in:** `src/patterns/{mapeditor,qa,chat}` and `data-types/now_playing` and the
   `weather_analytics` theme get a `package.json` with a `dms` key and a `register(host)` entry; the app registers
   them through the host instead of the direct calls. Builds and pages must not change (checked by the CSS task's
   parity harness).
4. **Row kinds and verbs:** formats for `plugin` / `plugin_activation`, the two verbs on the site row's
   permission domain, the server refusing general writes to `plugin` rows, validating activation writes.
5. **Activation checks where registries are read**, server first (the authenticated tenant, never `X-DMS-App`),
   then the client lists (pattern types offered in the admin, section types in the editor, themes, data types).
6. Tests for each step; the task doc updated after each.

### P1 progress (2026-11-23, overnight; not committed, not yet built and checked in pages)

- [x] **Step 1, the contract (library):** `packages/dms/src/plugins/index.js` (the plugin shape, `PLUGIN_API_VERSION`
      1.0.0, `satisfies`, `registerPlugin(s)`, a host per plugin wrapping today's registries: pattern types,
      section types, column types, format functions, widgets, themes, data-type pages; contributions recorded,
      collisions between plugins refused and rolled back; `pluginOf`, `isPluginActive`, `listPlugins`) and
      `plugins/registries.js` (no imports, so the route builder and the RSC client config can read it without the
      registration code: theme loaders, data-type pages, pattern-type owners, `withPluginThemes`, `activationsOf`,
      `isPatternTypeActive`, `pluginDataTypes(activations)`). Exported from the library entry. Wired where themes
      and data types are read: `resolveThemes`, the admin theme picker's loader, `configureRscClient`, the route
      builder's `damaDataTypes`. Test `tests/pluginHost.test.js` (10).
- [x] **Step 2, the contract (server):** dms-server `src/plugins/index.js`: the same API version and range rules,
      `validateManifest` (a `package.json` `dms` key or a release `index.json`: name, version, API, activation,
      contributions, entries and file paths inside the package, every file's size and sha512, entries among the
      files, known permissions), `definitionOf` (a `register(host)` module gives the data-type definition; the
      old shape passes through; another API is refused), used by `registerDatatype`. Test `tests/test-plugins.js`
      (26), in `npm test`.
- [x] **Step 3, converted, still compiled in:**
  - `src/patterns/{mapeditor,qa,chat}`: `plugin.js` + `package.json` (`dms` key, default-on); `src/patterns/index.js`
    registers them with `registerPlugins` (the pattern definitions are unchanged);
  - the `weather_analytics` theme: `src/themes/weather_analytics/plugin.js` + `package.json`; its loader left
    `src/themes/index.js`'s map; theme plugins register in `src/themes/plugins.js`, imported by the theme registry
    itself (so the RSC browser entry, which loads pattern types late, has them), and the app's default loader is
    `withPluginThemes(loadThemes)`, so every caller (App, the hydration preload, SSR, RSC) finds it. The CSS build
    plugin evaluates plugin themes too (2,619 candidates, its `@theme` block);
  - `data-types/now_playing`: `index.js` is plugin-shaped (`register()` returns the definition); `plugin.client.js`
    registers its pages, opt-in; `package.json` with the manifest (egress `api-v2.acrcloud.com`, task types
    `now_playing/*`). `src/data-types.js` registers the client part; the per-app lists still decide where the
    pages appear until activation rows exist.
- [x] **Step 3 checked** (build `plug2` on test server 5557 against 5556, 2026-11-23): look parity on the 16 probe
      pages unchanged from the CSS task's (weatheranalytics renders its theme through the plugin); all 60 measured
      pages: same page errors (none), map canvases (the mapeditor plugin's Map section) and content; the app's 22
      data types all register through the real registry (now_playing through `register()`); signed-in editor as
      before.
- [x] **P0 hazard 3 fixed (routing special case):** the request-timeout middleware asks the data-type registry
      (`isLongRoute`) instead of matching `trsp-memory`; routing declares its five search routes as `longRoutes`.
      Data types also get `start(helpers)` / `stop()` (`mountDatatypeRoutes` calls `start` once every route is
      mounted; `stopDatatypes()` for P2 reloads); routing's warm-load moved from inside `routes()` to `start`.
      Tests in `test-plugins.js` (32). `documentation/extension-points.md` and `dama/CLAUDE.md` updated.
- [~] **Step 4, row kinds and verbs:** `pluginFormat` (`plugin`) and `pluginActivationFormat` (`plugin_activation`)
      in `admin.format.js`, registered under the site; site verbs `install-plugins` and `activate-plugins` (the
      latter governs the site's `plugin_activations` list); the server's built-in rule copy
      (`routes/auth/rules.js`). **Install records are server-only:** a rule flag `serverOnly` (data on the rule,
      in the format and the built-in copy) makes the judge refuse every caller of the general write path, the app
      admin included, and the refusal is enforced under every `DMS_AUTH_MODE` (like reach-limited rows;
      `routes/auth/index.js`, `report.js applyMode`). Test `test-plugin-rows.js` (11; checked to fail without the
      flag): install records refused under `log` and `enforce`; activations and the site's `plugin_activations`
      list gated by `activate-plugins`; activation reads open. `emit-formats.mjs` carries the rules and verbs.
      **Not yet:** validating activation writes (version installed, config against the settings schema): needs
      the installer's records (P2). *Done in P2 step 5 (2026-11-23).*
      Suites run: dms-server `npm test` (all but `test-config-dirs.js`, which fails before and after), `test-data-auth`
      (67), `test-auth-permissions` (17). `test-auth.js` has 32 failures **with and without** this change (compared
      by removing the change and rerunning): already failing on this machine.
- [~] **Step 5, activation where registries are read:** the site row's `plugin_activations` refs (projection
      `plugin`, `enabled`, in the site load's single request; master and tenant loads); the route builder skips
      patterns of an inactive plugin's type and offers only active plugins' data-type pages; the admin's Add Pattern
      picker offers a plugin's type only while it is active for the site (`editSite.jsx` passes the site row's
      activations); the page editor's section-type picker offers a plugin's section types (its own, and its pattern
      types' `pageComponents`) only while it is active (activations reach it through the page pattern's
      `CMSContext`). Test `tests/pluginRoutes.test.js` (4): the route builder with a site's activations: a
      default-on plugin turned off gets no routes, an opt-in one turned on does, data-type pages follow.
      **Server side: not now (D12, owner 2026-11-23; later through source grants).** The question it answered: data-type routes are per pgEnv and called
      from Netlify-served sites through the API host, so "the tenant from the authenticated Host" does not name the
      tenant there; the site the request names (`dms_app`, as the auth layer already uses for pgEnv sources) is the
      candidate, checked against the caller's grants.
- [x] **Formats merge writer:** `upsertFormats(app, rows, { merge: true })` adds and updates a plugin's rows and
      removes nothing (the whole-set registration of a deploy still removes what it leaves out);
      `register-formats.js --merge`. Test in `test-formats.js` (13).
- [x] **Migrations ledger:** dms-server `src/plugins/migrations.js` `runPluginMigrations({ plugin, dir, db, dryRun })`:
      numbered SQL files (`001_x.sql`, a `001_x.sqlite.sql` variant for SQLite), each applied once per database in
      its own transaction with its ledger row (`dms_plugin_migrations`: plugin, name, sha256); append-only (a
      changed or renumbered applied migration stops the run). DDL is not confined to the plugin's schemas (v1:
      our reviewed plugins, D1). Nothing calls it yet: the installer / activation will (P2). Test
      `test-plugin-migrations.js` (8, SQLite and Postgres 17 in Docker).
- [x] **Checked on build `plug3`** (5557 vs 5556): all 60 measured pages the same (errors, maps, content); the
      editor as before; signed in, the admin's Add Pattern picker offers Map Editor, Tickets and Chat (the
      converted default-on plugins), no page errors.
- [x] **`dms plugin validate <dir>` / `dms plugin pack <dir>`** (P2 tooling, offline, built now because the contract
      supports it): `pack` writes the release `index.json` (the manifest + every file's size and sha512; npm's `files`
      list when present; no hidden files or a previous index), validated with the server's own rules. CLI test
      `cli/test/plugin.js` (12, `npm run test:plugin`); docs in `cli/docs/README.md` "Plugin". `now_playing` packs to
      15 files, 103 KB.
- **Library suite** (`npx vitest run src/dms/packages/dms/tests`, 2026-11-23 02:50): 844 passed, 15 failed in 7 files,
  all failing before this work: checked by putting back the prior text of the files this work changed that two of
  them import (`section.jsx`, `sectionMenu.jsx`, `admin.format.js`; `sectionGroupCollapsible`, `adminPermissions`
  still fail), the others import nothing changed here (`avlGraphThemeDefaults`, `syncDeltaConvergence` known red
  since 2026-10-06; `radioTheme`, `userMenus`, `deriveAuthVocabulary`).
- Found on the way: `deriveAuthVocabulary.test.js` "auth — the new user/group formats…" fails before and after
  this change (the auth verbs moved to the site row on 2026-11-05; the test still reads them off the auth format).

### After the owner's review (2026-11-23, D9–D12)

- [x] **The plugins folder (D11):** `src/plugins/` in dms-template, one folder per plugin: `mapeditor`, `qa`, `chat`
      (from `src/patterns/`), `weather_analytics` (from `src/themes/`), `now_playing` (from `data-types/`).
      `src/plugins/index.js` registers every plugin but the themes (imported by `App.jsx`, `entry-ssr.jsx`, the RSC
      browser entry); `src/plugins/themes.js` registers the theme plugins (imported by `src/themes/index.js`).
      `src/patterns/` and `src/themes/plugins.js` are gone. Paths updated in code (the transportny theme's map-editor
      imports, the RSC report-issue widget, `.dmsrc`, `package.json` scripts, `data-types/register-datatypes.js`
      → `../src/plugins/now_playing`, the library's and the server's tests) and in the live docs (CLAUDE.md, skills,
      `documentation/`, `data-types/CLAUDE.md`); planning history left as written. The server images copy
      `src/plugins` (both Dockerfiles, `deploy.sh`'s local-files copy), since now_playing's server side lives there.
      The CSS build treats a theme plugin's folder as theme files, not core (`dmsCssCandidates.js`
      `pluginThemeDirs`): the manifest is identical to the one before the move (2,775 core candidates, 33 themes,
      weather_analytics 1,384). Build `plug5`.
- [x] **P0 (hazards) 1, the code part:** `registerDatatype(name, def, { authMode: 'enforce' })` runs that data
      type's whole router under `enforce` whatever `DMS_AUTH_MODE` says: an `AsyncLocalStorage` scope that
      `authMode()` reads (`routes/auth/settings.js withEnforcedAuth`; it can only tighten), so the route helpers'
      own checks bite too. Plugins installed at run time will be registered with it; compiled-in data types
      (now_playing included) keep following the server's mode, so nothing in production changes. Tests in
      `test-plugins.js` (37). Production's own `DMS_AUTH_MODE` stays the operators' call.
- [x] **P0 (hazards) 4:** `dama/tasks/worker-env.js workerEnv(extra, { declared })`: the forked task runner and the
      spawned `ogr2ogr`, `zip`, `tippecanoe` get an allow-list (process basics; `DMS_`, `DAMA_`, `AWS_`, `PG`,
      `GDAL_`/`PROJ_`/`CPL_`/`OGR_`, `LC_` prefixes) minus the server's signing secrets (`DMS_DOMAIN_TOKEN_SECRET`,
      `DMS_AUTH_TOKEN`); `JWT_SECRET`, `TRANSCOM_*` and mail settings no longer reach them. Test
      `test-worker-env.js` (5, a real fork included), in `npm test`.
- **P0 (hazards) 2** (two servers sharing `host_id`) stays with `server-background-jobs-switch.md`.

### P2 design change: plugins reach the host's React through a global, not an import map (2026-11-23, accepted by the owner the same day)

**Owner, 2026-11-23:** accepted, along with keeping the `src/plugins` lines in `Dockerfile`, `Dockerfile.ssr` and `deploy.sh`. Production `DMS_AUTH_MODE` and the background-jobs switch stay the owner's to set at deploy time.

D4 chose an import map with the peers external (no owner preference; it was the recommendation). Building it
showed a cost the recommendation didn't weigh: the app's own build would have to externalize React, react-dom and
the router to unhashed shared files for **every** site, changing every page's loading for a feature no site uses
yet. The spike also showed the library itself can't be shared (1.9 MB gzipped), so the plugin API comes through
`host` anyway. So, instead:

- **A plugin's build maps its peer imports to tiny shim modules** (`react`, `react-dom`, `react/jsx-runtime`,
  `react-router`): each re-exports the matching entry of `globalThis.__DMS_PLUGIN_PEERS__`, with the named
  exports taken from the real package at build time (the spike's lesson for CommonJS packages).
- **The host sets that global** to its own module instances just before it loads a plugin (the library's
  `plugins/peers.js`, loaded only when a site has a plugin to load, so sites without plugins download nothing
  more). The same in Node for SSR: no resolve hook needed, the one ESM file serves both.
- What's lost: the browser can't share one cached React file across apps on different origins (they each ship
  their own today anyway). What's kept: one React per page, the host's contexts, no change to the app's build.

The owner may still prefer the import map; the plugin format doesn't change either way (a plugin built for one
can be rebuilt for the other).

### P2 plan (2026-11-23)

1. Library: `plugins/peers.js` (the global) and `loadPlugins(list)` (import each active installed plugin's entry,
   register it through the host).
2. CLI: `dms plugin build <dir>` (Vite library build, peers shimmed, `dist/client.js` + `classes.txt`), then `pack`.
3. Server: serve installed files at `/_dms/plugins/<name>/<version>/…` (immutable, CORS for Netlify-served sites);
   the install route (`install-plugins` on the root site row: the installer, then the `plugin` row through the
   server-only path); installed plugins' server entries registered at boot under `enforce` (D2's restart).
4. Loading: an activation row carries the version; the route builder loads active installed plugins before
   building routes, on the server (SSR, from the version folder) and in the browser (from the API host) before
   hydration.
5. The hub's admin view; validating activation writes (the version installed).

### P2 progress (2026-11-23)

- [x] **Plan step 1, library loading:** `plugins/peers.js` (`sharePeers()`: the host's React, react-dom, JSX runtime
      and router on `globalThis.__DMS_PLUGIN_PEERS__`, a dynamic import so sites with no plugin download nothing)
      and `plugins/load.js` (`installedActivations(siteRow)`: enabled activation rows naming a version, compiled-in
      plugins left out; `loadPlugins(list)`: import, check the module is that plugin at that version, register it
      **opt-in** whatever it declares; a broken plugin is logged and left out; one version per realm;
      `clientPluginUrl(apiHost, …)`). The site load now reads `version` with `plugin` and `enabled`
      (`dmsSiteFactory.jsx`); plugins load before `pattern2routes` on every path (single site, hub root, tenant,
      the snapshot fast path); the SSR handler takes `resolvePluginUrl` (dms-server passes `store.ssrEntryUrl`); the
      app's `main.jsx` loads the same list before `hydrateRoot` (API host moved to `src/apiHost.js`, shared with
      `App.jsx`). The host also gives `getPatternType` and `defaultCheckAuth`, which a pattern built on the page
      pattern's shell needs (qa and chat import them; an installed plugin can't). Test `tests/pluginLoad.test.js` (7).
- [x] **Plan step 2, `dms plugin build <dir> [--host <app>]`:** a Vite library build of `dms.source` into
      `dms.entries.client`, the four peers turned into shims with the host React's real export names (one `const`
      each, so unused names tree-shake: the test plugin is 1.8 KB), any other React or router module refused, and
      `dms.entries.classes` written from the source's Tailwind candidates. Vite and React come from `--host`: the
      test showed why: from the CLI's own folder `react` resolves to the CLI's private copy, and the plugin
      crashed on a second React. CLI test `test/plugin.js` (19): the built file renders on the host's React with
      the host's context and router. `cli/docs/README.md` "Plugin".
- [x] **Plan step 3, server:** `src/plugins/store.js` (installed releases, `current.json` per plugin, listed files
      only, `ssrEntryUrl`, `registerInstalledServerPlugins` at start under `enforce`, never over a compiled-in data
      type) and `src/plugins/routes.js`: `GET /_dms/plugins/:name/:version/client.js` (a two-line module
      re-exporting the client entry) and the listed files (CORS, immutable), `GET /_dms/plugins` (signed in),
      `POST /_dms/plugins/install { url }` (`install-plugins` on the hub's site row, judged whatever the mode;
      installer, `current.json`, the `plugin` row written by the server). Wired in `src/index.js`. Test
      `test-plugin-routes.js` (9), in `npm test`.
- [x] **Plan step 4, end-to-end check (2026-11-23): 10 of 10 pass.** `scratchpad/plugin-e2e/e2e.mjs` (gitignored;
      a throwaway dms-server on :5561 with a fresh SQLite database, production SSR from a client built for that
      site with `VITE_API_HOST=http://api.localhost:5561`, plus a local release server on :5562). Covered:
      `/init/setup` and sign-in; site, auth and `hello` patterns and a `plugin_activation` row written through
      `/graph`; install refused signed out (401), installed as the app admin through `POST /_dms/plugins/install`;
      `client.js` served; the server render of `/hello` contains the plugin's page; in Chromium the page loads
      `client.js` and `dist/plugin.js` from the API host, hydrates on the host's React (the button's state
      updates), gets the theme through `host.contexts`, and logs no hydration, hook or request errors. Notes: a
      production build turns a plain `localhost` API host into the default one, so the test build uses
      `api.localhost`; Playwright's `networkidle` never settles on this page (a long-lived connection), so the
      check waits for `load`. Rerun after step 5's write check (install before activating): **12 of 12**, adding
      "an activation naming a version not installed is refused" and "no version gets the installed one".
- [x] **5557 on `plug7` (2026-11-23):** the five hosts 200 (`wcdb` 2,331 bytes, as before); the smoke run
      (`parity/smoke.mjs`, 57 visits signed out and in, against 5556): 55 the same, and the other 2
      (`localhost/home`, `mny.localhost/` signed in) lose a React #418 hydration error 5556 still shows. No
      regression. (`analysis/plug7/` in the perf scratchpad.)
- [~] **Plan step 5, the hub's admin view and validating activation writes (2026-11-23):**
  - [x] **A row kind's write check**, a new extension point: dms-server `routes/dms/write-checks.js`
        (`registerWriteCheck(kind, {keys, check})`), run by `dms.data.create` / `dms.data.edit` after the auth
        guard (an edit only when it touches `keys`) and refusing `dms.data.massedit` of a checked key. The core
        looks the kind up and names none. `documentation/extension-points.md` (Server).
  - [x] **The activation check** (`plugins/store.js` `activationWriteCheck`, registered in `src/index.js`):
        `plugin` required; a `version` must be installed on this server (400 otherwise, the app admin included);
        written empty, the current version is stored (so the format's "empty: the newest" now holds, and the
        loader, which needs a version, finds one); a plugin not installed (compiled into the app) keeps no
        version. Tests: `test-plugin-routes.js` (13, through the registry) and `test-plugin-rows.js` (19, through
        the real create / edit / massedit routes and the writer below).
  - [x] **The hub's admin view:** a **Plugins** card on a tenant's settings page (`patterns/admin/components/
        pluginsCard.jsx` + `.theme.js`, in `pages/tenantOverview.jsx`): one row per installed plugin, per plugin
        compiled into the app, and per activation the site has; a switch turns it on or off for the site, a
        select picks an installed version. It writes through new dms-server routes, `GET /tenants/:tenant/plugins`
        and `POST …/plugins/set { plugin, enabled?, version? }` (and `/hub/plugins` for the hub's own site;
        `routes/tenants/index.js`), allowed to hub staff (`manage-tenants`) or `activate-plugins` on the site's
        row, judged whatever the mode. The work is `src/plugins/activations.js`: create or update the site's one
        activation row under its site row, list it in the site's `plugin_activations`, through the same check.
        **Seen on 5557, build `plug8` (read-only, nothing switched):** the MitigateNY tenant's page shows the card
        under the app-and-icon card, 5 plugins built into the app, 4 on (`now_playing` off: opt-in), both route
        calls 200, no page errors (`parity/plugins_card.mjs`, screenshot `analysis/plug8/`). The five hosts 200.
        dms-server's test chain run test by test: all pass but `test-config-dirs.js` (fails before this work too).
  - [x] **The config's settings check and the permissions rule (2026-11-23, after the owner's go-ahead):**
        - A manifest may declare `dms.settings`, a small subset of JSON Schema checked with no dependency
          (`plugins/index.js` `validateSettingsSchema` / `checkConfig`: string, number, integer, boolean, array of
          scalars, object; enum, default, ranges, lengths; `required`; unknown keys refused unless
          `additionalProperties: true`; no `pattern`, so no regex from a manifest). `validateManifest` checks it,
          `dms plugin pack` carries it into `index.json`. No schema: only an empty config.
        - The activation check now also reads `config` and `permissions`: the row's config (stored, with the write
          over it) must fit its version's settings, so a version change the config no longer fits is refused too.
          `permissions` on the row is what the site accepted, written by the server as the version's own list
          (`permissionList`: `"kind:value"` strings). A create accepts them; an edit to a version asking for more
          is refused (409, `newPermissions`) unless the same write sends `permissions` covering them, a fresh
          activation. A row from before this is taken to have accepted its stored version's permissions. A mass
          edit of `config` or `permissions` is refused.
        - The hub writer and route take `acceptPermissions`; the route's 409 carries `newPermissions`. The Plugins
          card lists what each installed version uses ("uses …") and, on a 409, shows the new permissions with
          **Accept and switch** / **Cancel**. Not seen in a browser: 5557 has no installed plugin and runs on the
          hub's database, so the confirm path is covered by `test-plugin-rows.js` only.
        - Tests: `test-plugins.js` 46, `test-plugin-rows.js` 27, `test-plugin-routes.js` 13, the CLI's
          `test/plugin.js` 21, `-installer` 10, `-migrations` 8; the end-to-end check 12 of 12 again.
        - Gaps: the card has no editor for `config` (so a plugin with a required setting and no default can't be
          switched on from it yet); server code runs each plugin's *current* version for every site, so the
          per-site consent covers what a site's pages load, not the server side, which the installer (hub staff
          with `install-plugins`) accepts by installing.
  - [x] **The admin's Plugins page, `/list/plugins` (owner asked, 2026-11-23):** a root page of the admin pattern
        (`pages/plugins.jsx` + `.theme.js`, `pluginsPage` in the admin's default theme, a **Plugins** nav item with a
        new `Puzzle` icon), on the server's root site only (never a tenant host), for `install-plugins`
        (`INSTALL_PLUGINS` in `utils/adminPermissions.js`). An install card (the release's `index.json` URL; off,
        with a note, when the server accepts no unsigned installs), a restart notice, and the installed plugins:
        source and install date, the current version (a select when there are several), whether its server code
        runs or waits for a restart, and what it contributes and asks for. New dms-server routes
        (`plugins/routes.js`): `GET /_dms/plugins/manage` (the view: current, running, `restartNeeded`, per version
        contributes / permissions / server code) and `POST /_dms/plugins/:name/current { version }` (recorded on the
        `plugin` row), both `install-plugins` on the hub; `store.js` remembers which version's server code it
        registered at start (`runningServerVersion`). Test `test-plugin-routes.js` 17.
        Turning a plugin on for a site stays on that site's Plugins card.
        **Checked:** the end-to-end check, now 16 of 16 (its site gained an admin pattern), installs hello 1.1.0
        (server code, one egress permission) through the page: listed with its source and date, "Installed hello
        1.1.0 · its server code runs after a restart", the restart notice, "restart needed", what it uses; switching
        the current version back to 1.0.0 clears the notice; no page errors (screenshot
        `scratchpad/plugin-e2e/plugins-page.png`). On 5557, build `plug9`, read-only: the page from the nav, the view
        route 200, no plugins installed, the Install button off with its note (no unsigned installs there), no
        errors (`parity/plugins_page.mjs`, `analysis/plug9/`). The five hosts 200.
  - [ ] **The server restarting itself (owner: wanted if possible, an admin restarting is fine for now).** A
        process can't swap its own server code (Node can't evict modules), and exiting so Docker restarts it means
        downtime (the routing data type alone warms ~80 s). Plan: the page's **Restart** asks the host for the
        blue-green restart. The server writes `var/restart-requested.json` (who, when, why) in the shared volume;
        a systemd path unit on mercury watching that file runs `deploy.sh restart` (D2 below) and removes it. The
        container never gets the Docker socket. Server and page half: ours; `deploy.sh restart` and the unit: the
        owner's to install on mercury.
  - [ ] ~~Signature verification (Sigstore)~~ **deferred by the owner (2026-11-23):** installs keep needing
        `DMS_PLUGIN_ALLOW_UNSIGNED=1` until it is built.
  - [ ] The rolling restart for server code (D2). **Suggestion to the owner (2026-11-23), from mercury's
        `deploy.sh` (copy in `dms-template/references/plugins/`), awaiting a decision:**
        - What's already there: the hub is blue-green behind `dms-hub-proxy`, with a health check, smoke test,
          drain and rollback. Plugins live in `dms-server/var/plugins`, which is the `dms-hub-var` volume, so an
          install survives a deploy and old and new containers see the same folder. Only server entries need a
          restart (`restartNeeded` from the install route); client and SSR parts load per version without one.
        - Gap: a plain `./deploy.sh` re-resolves `master`, so as a "restart" it can roll new code.
        - Add `./deploy.sh restart`: no fetch or build; a fresh container from the image the proxy's container
          runs, then the same `wait_ready`, `smoke_in` and `cutover`. Fail it (and stay on the old container) if
          the new container logs `its server entry did not register`, since a broken plugin otherwise only logs.
        - Trigger, manually at first: the install answers `restartNeeded`, the card says so, and whoever installed
          runs `npm run deploy -- server --restart` (ssh, as the deploy does). Later, if installs get frequent: a
          systemd path unit on mercury watching a `restart-requested` file the server writes in the var volume.
          Never give the container the Docker socket.
        - Also needed: a route to make an installed version current (`POST /_dms/plugins/:name/current`), so a
          plugin's server code can be rolled back by the same restart (rolling back the container doesn't move
          `current.json`).

### P2 started (2026-11-23): the installer's fetch-and-store step (loads no code)

- [x] dms-server `src/plugins/installer.js` `installRelease({ url, dir, verifySignature })`: fetches the release's
      `index.json` (capped at 1 MB), validates it as a release, requires the signature hook to pass, downloads exactly
      the listed files from beside the index (same origin), checks each size and sha512, and renames a temp folder
      into `var/plugins/<name>/<version>/` (`DMS_PLUGINS_DIR`) with the index and a release marker. The same release
      again is a no-op; another release under the same name and version is refused (versions are immutable).
      **The signature verifier is not built** (Sigstore against our CI's workflow identity, D1): without one every
      install is refused; `DMS_PLUGIN_ALLOW_UNSIGNED=1` lets development proceed and is logged on every use.
      Test `test-plugin-installer.js` (10) over a local HTTP server: tampered, oversized, off-origin files and invalid
      indexes refused with nothing left behind. The manifest validator now also refuses a path with a URL scheme.
- [x] **Spike S1, the shared-module build and import map**
      ([`research/dms-plugin-system/S1-import-map-spike.md`](../../research/dms-plugin-system/S1-import-map-spike.md)):
      a plugin built on its own (728 bytes, React external) loaded at run time through an import map, registered with
      the library's real `registerPlugin`, rendered on the host's React with the host's theme and `UI` set, hooks
      working; and in Node, a `module.register` resolve hook server-rendered the same plugin from a folder outside the
      app on the server's React. The whole library as a shared module is 1.9 MB gzipped, so **the plugin API comes through `host`**:
      `host.contexts` (ThemeContext, CMSContext, PageContext, ComponentContext, DataSourceContext) added to the client
      host; only React, react-dom, the JSX runtime and the router go through the import map.
- [x] ~~Not started, and better after the owner's review: …~~ Superseded by "P2 progress" above (2026-11-23): all
      built except the Sigstore verifier (deferred by the owner) and the rolling restart (suggested, awaiting the
      owner); React reaches plugins through a global, not the import map.

## Open points for P1

All settled 2026-11-23 (D9–D11).

## Progress log

- 2026-11-22 — task created; linked to `plat_tenant_hub` (owner's choice: the hub is the base for per-tenant
  plugins). Research R1–R4 started as four parallel workers; reports land in the session scratchpad
  `plugins/R1-client.md`, `R2-server.md`, `R3-prior-art.md`, `R4-security-devops.md`, and their findings are
  copied into "Findings" here.
- 2026-11-22 — R2 (server architecture) landed; summary under Findings.
- 2026-11-22 — R1 (client architecture) landed; summary under Findings. Found dms-template CLAUDE.md's "Vite 8 (Rolldown)" stale (installed 7.2.7).
- 2026-11-22 — R4 (security and dev-ops) landed; summary under Findings.
- 2026-11-22 — R3 (prior art) landed. Synthesis written: proposed design, phases P0–P5, decisions D1–D8. Status → blocked:decision.
- 2026-11-22 — the four reports copied from the session scratchpad into `research/dms-plugin-system/`.
- 2026-11-22 — owner's decisions D1–D8 recorded; design revised (index.json release format, row kinds + verbs, server-compiled CSS as its own task, GitHub releases). Status → next.
- 2026-11-22 — the per-site CSS task created: `server-compiled-site-css.md`.
- 2026-11-23 — overnight (owner: "make as much progress as you can"): P0 hazards investigated (findings above; the
  routing special case turned into data); P1 built and checked on test server 5557 (contract on both sides, five
  plugins converted and compiled in, row kinds and verbs with server-only install records, activation in the route
  builder and both pickers, formats merge, migrations ledger, `dms plugin validate/pack`); P2 started (installer
  fetch-and-verify; spike S1: import map + `host.contexts`, SSR resolve hook). All suites run; failures listed above
  predate this work. Nothing committed.

