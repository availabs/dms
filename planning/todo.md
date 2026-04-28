# DMS Todo

## type system

- [x] Type system refactor — uniform `{parent}:{instance}|{rowKind}` scheme replacing inconsistent type encoding; remove UUIDs in favor of human-readable slugs; eliminate `data.doc_type`; sources scoped to dmsEnv; `:data` suffix replaces split type regex; migration script for existing data

## dama

- [x] DAMA server port — task queue with host isolation + idempotent locking, GIS/CSV upload pipeline (GDAL), multi-pgEnv routing, UDA task/event Falcor routes, datatype plugin system, legacy migration script. All 7 phases shipped + production-verified. One non-blocking follow-up split out: [Remove `/events/query` + `newContextId` REST compat shim](./tasks/current/remove-events-query-shim.md).
- [x] [Datatypes plugin infrastructure](./tasks/completed/datatypes-plugin-infrastructure.md) — `data-types/` + `server/register-datatypes.js` + `DMS_EXTRA_DATATYPES` env-var hook landed; submodule `dms-server/src/index.js` patched; smoke-test `_hello-world` plugin verifies the round-trip end-to-end (POST → events → done).
- [ ] [Port `enhance_nfip_claims_v2` to the plugin system](./tasks/current/dama-nfip-claims-migration.md) — first concrete plugin built on the infrastructure. Reference implementation for subsequent hazmit ports. Replaces the smoke-test plugin with `enhance-nfip-claims`.
- [ ] [Port `map21` to the plugin system + 2023 HPMS TTM spec output](./tasks/current/dama-map21-migration.md) — IMPLEMENTED on 2026-04-26: plugin registered, route mounts at `/dama-admin/:pgEnv/map21/publish`, fast-fail path verified against `dama-sqlite-test`, in-process HPMS 2023 validator agrees with the external `validate-hpms-ttm-2023.cjs` (synthesized 2023-shape row passes; 2025 submittal CSV produces identical errors in both). **Pending: controlled smoke test against `npmrds2` ClickHouse + a real prod NPMRDS source, plus client-side route update.**
- [ ] [Remove `/events/query` + `newContextId` REST compat shim](./tasks/current/remove-events-query-shim.md) — split out from DAMA server port; non-blocking. Migrate the GIS Create wizard to poll UDA tasks via Falcor, then drop the legacy REST endpoints from `dms-server/src/dama/upload/`.
- [ ] [now-playing dataType plugin](./tasks/current/dama-now-playing-datatype.md) — port the standalone ACRCloud webhook receiver in `research/now-playing/` into a real DMS plugin (`data-types/now-playing/`). Adds a generic `publicRoutes` capability to the dataType contract (mounted before JWT) so plugins can receive unauthenticated external callbacks. Each "stream" is a DMS source+view with a per-stream `webhook_secret`; detections land in the auto-created split table. Ships a `NowPlayingCard` page-section component for displaying the latest matched track.

## cli

- [x] DMS CLI tool (`packages/dms/cli/`) — terminal access to DMS data via shared API code and Falcor protocol (sites, patterns, pages, sections, datasets)
- [ ] DMS MCP Server — Claude tool for reading, creating, and editing DMS pages/sections via structured MCP tools (Lexical builder, .dmsrc-aware config)
- [ ] [CLI refresh for type-system refactor + per-app tables + dmsEnv ownership](./tasks/current/cli-refresh-type-refactor.md) — rewrite type resolution throughout `packages/dms/cli/` to use `{parent}:{instance}|{rowKind}`; drop `doc_type` reads (18 call sites); app-namespace every falcor path; walk `pattern.dmsEnvId → dmsEnv.sources` in `dataset list`; use `:data` split-table types in `dataset dump`/`query`. Fixes `dms site tree` / `dms raw list` / `dms dataset *` on modern databases. Do before the MCP server so both can share updated type helpers.

## local-first

- [x] Toy sync engine — standalone notes app proving SQLite WASM (wa-sqlite + OPFS), Yjs conflict resolution, revision-based sync protocol, passthrough pattern, and multi-tab reactivity
- [x] Toy sync Lexical integration — replace textarea with DMS Lexical editor, Lexical JSON flowing through existing Yjs sync pipeline (LWW per field, not character-level collab)
- [x] Toy sync collaborative editing — character-level Yjs ↔ Lexical binding via `CollaborationPlugin`, custom Yjs provider over existing WebSocket, room-based routing, cursor awareness, server-side Yjs state persistence
- [x] DMS local-first sync integration — server change_log + sync endpoints + WebSocket, client SQLite WASM + sync manager + reactive queries, passthrough to Falcor, Lexical live sync, opt-in via `VITE_DMS_SYNC=1`. All 5 phases complete (server, client, DMS integration, Lexical collab, production hardening + docs). Multi-tab coordination deferred to Phase 5b.
- [x] Pattern-scoped sync + SQLite fix — fix SQLite event loop blocking (chunked bootstrap queries), change sync boundary from app to pattern (doc_type), skeleton bootstrap for site structure, on-demand pattern bootstrap on navigation

## api

- [x] DataWrapper API-layer loading — move dataWrapper data fetching into the DMS API/loader so section data loads at navigation time (React Router 7 loader) instead of after component mount; detect dataWrapper sections, extract URL-mapped filter params, pre-run getData(), leverage cache freshness to skip component-level re-fetch
- [x] DataWrapper skip fetch when cached — Graph + other non-paginated components honor the "Always Fetch Data" toggle; Pagination's auto-set of `readyToLoad` no longer leaks into persisted state.
- [x] Falcor loader parallel requests — combine sequential `length` + data `falcor.get()` calls into a single call using a ceiling value for `toIndex`, eliminating one HTTP round-trip (~50ms) from first page load

## ssr

- [x] SSR Phase 1: Basic SSR — platform-agnostic core in `render/ssr2/`, Express adapter in `render/ssr2/express/`, integration into dms-server via `mountSSR()` (`DMS_SSR` env var), fix `getSubdomain` window bug, client hydration via `DmsSite` `defaultData`/`hydrationData`, two-build system (Vite client + server)
- [ ] SSR Phase 2: Streaming SSR — upgrade `renderToString` to `renderToPipeableStream`, template splitting for immediate shell delivery, optional `Suspense` boundaries for per-section streaming, bot/crawler detection for complete HTML

## dms-manager

- [x] Centralize format initialization (`updateAttributes`/`updateRegisteredFormats`) — remove duplicated definitions from patterns, add `initializePatternFormat` helper

## dms-server

- [x] Search tags query performance — `getTags()` takes 4+ minutes due to `json_each` cartesian product, `CAST(id AS TEXT)` join, no caching; fix with direct section query + server-side cache
- [x] Add SQLite compatibility
- [x] Fix createData dropping data argument (draft_sections bug)
- [x] Fix SQLite searchOne returning null for root page (falsy `||` + `->>` type mismatch)
- [x] Implement `uda` routes in dms-server — UDA Falcor routes (sources, views, filtered data queries) for DMS and DAMA databases, based on avail-falcor reference, PostgreSQL only (no ClickHouse)
- [x] Implement auth in dms-server — JWT middleware, auth/user/group/project/message/preferences endpoints, cross-DB queries, authority checks, compatible with avail-falcor auth API
- [x] PostgreSQL test support — Docker-managed PostgreSQL, parameterize all test suites, `npm run test:pg` / `test:all`
- [x] Fix auth DB init race condition — `getDb()` returns before async init completes, causing "no such table: users"; add `awaitReady()`, support multi-role configs
- [x] File upload routes — CSV/Excel upload, publish, and validate in dms-server as standalone synchronous endpoints (no pg-boss, no ETL events, no GDAL)
- [x] Table splitting — per-type split tables + per-app isolation. Tier 1: table-resolver.js, controller/UDA integration, 104 tests. Tier 2: app-namespaced routes, client API changes (~25 call sites), migration script, API docs. Total: 138 tests.
- [x] SQLite compatibility fixes — ID type normalization (string coercion for consistent `$ref` resolution) + UDA controller PG-only SQL translation (`array_agg`, `array_remove`, `to_jsonb`, `ARRAY[...]`)
- [x] Test suite per-app mode — migrate test code from legacy `byId` route to app-namespaced route, set all test configs to `splitMode: "per-app"`, verify on SQLite + PostgreSQL
- [x] Fix auth test PG socket hang up — `test-auth.js` test #14 (Falcor created_by/updated_by) fails on PostgreSQL with `ECONNRESET`; client disconnects before Falcor route response arrives
- [ ] Split table virtual columns — auto-generate SQLite virtual columns + indexes (and PG expression indexes) from source config attributes for B-tree query speed on dataset tables
- [ ] [UDA `getEssentials` source-id lookup is ambiguous](./tasks/current/uda-source-lookup-ambiguity.md) — `ORDER BY id DESC LIMIT 1` in `routes/uda/utils.js:162-184` silently routes to the wrong source when two rows share `(app, {instance}:source)`; fix by resolving source via `view_id` ∈ source.data.views. Triggered the 2026-04-24 "Songs" incident (practice_recordings rename + 409 guard in file-upload route are band-aids).
- [x] UDA array contains filter — server-side `array_contains` + `array_not_contains` operations for multiselect columns; removed ~235 lines of async multiselect resolution from client utils.jsx; unblocks synchronous `buildUdaConfig`
- [x] Database copy CLI — `src/scripts/copy-db.js` copies all DMS data between databases (PG↔SQLite, same-type), preserving IDs, handling cross-DB types, batch processing, split table discovery
- [x] Dead row cleanup CLI — `src/scripts/cleanup-db.js` analyzes DMS database for orphaned rows (sections without pages, patterns without sites, views without sources), grouped by app+type, with optional `--delete` mode
- [x] Cleanup: protect dmsEnv-linked sources — closed as unnecessary; the type-system refactor moved source ownership into the type column (`{dmsEnv}|{name}:source`), so cleanup-db.js needs a rethink around dmsEnvs rather than this incremental patch
- [x] Fix orphaned pages detection — `findOrphanedPages` produces false positives when pattern metadata is missing/misconfigured, causing mass page deletion; pages detector currently disabled from `--delete` mode; also added `page_edits` orphan detection and `skipData` memory optimization
- [x] Extract embedded Lexical images — script to scan data_items for base64 data URIs in InlineImageNode `src` fields, extract to files, replace with URL paths; deduplication via content hash
- [x] Clean dms-mercury2 database — delete obsolete apps, countytemplate patterns, templated pages, obsolete patterns, extract images, consolidate history, run orphan cleanup, VACUUM, prepare for split-app mode; target under 200 MB
- [x] Deprecate internal_dataset for internal_table — migration script to convert UUID doc_types to name-based, move data rows from data_items to split tables, update source records; remove internal_dataset from type selector
- [x] Per-app PostgreSQL schemas — in per-app split mode, use `dms_{appname}` schemas instead of table name prefixes (`dms.data_items__appname` → `dms_appname.data_items`); SQLite unchanged
- [x] Per-config split mode — move `DMS_SPLIT_MODE` from server-wide env var to per-database-config setting (`splitMode` field in config JSON), with env var fallback for backward compatibility
- [x] Migrated dataset fixes — case-insensitive split type regex, sanitize() in new table naming, case-insensitive source lookup, lowercase type for split queries, maxPaths 50K→500K, `--max-http-header-size=1MB`, rename-split-tables script (39 tables renamed)
- [x] Invalid-entry table consolidation — valid and invalid dataset rows share the same split table (removed `_invalid` suffix from table naming); fixes bugs where re-validation couldn't find invalid rows and `batchUpdateType` left rows in wrong table
- [x] DAMA CSV analyzer — ported legacy `analyzeSchema.js` (zero-padding + GEOID heuristics, 10K-row state machine, sample collection), kept ogrinfo as `DAMA_CSV_ANALYZER=ogrinfo` fallback, fixed `generateTableDescriptor` rename bug via index pairing. 22 csv-analyzer tests, production-verified, docs updated.
- [x] UDA ClickHouse support for DAMA pgEnv — auxiliary ClickHouse backend per pgEnv. `data_manager.views.table_schema` prefixed with `clickhouse.` routes reads to a CH query set; mirrors avail-falcor `db_service/clickhouse.js` + `routes/uda_query_sets/`. Live smoke test + cross-DB meta dispatch verified against npmrds2.
- [x] Fix UDA getSitePatterns / getSiteSources for new type scheme — `getSitePatterns` now matches by exact instance segment (`type LIKE '%|' || $instance || ':pattern'`); `getSiteSources` dropped the `data->>'doc_type'` filter and unused `pattern_doc_types` param; two UDA test fixtures rewritten to new-format types. All 51 UDA tests pass.
- [x] DMS task system independent of DAMA — `dms.tasks` + `dms.task_events` schema (PG + SQLite) wired into dms-role init with `recoverStalledTasks` on boot; `src/dms/tasks/` module mirrors DAMA surface (with `app` column delta) plus parallel `worker-runner.js`; UDA tasks controller dispatches by `env.includes('+')`; `runInlineTask` wraps internal_table publish handler with rich `publish:*` events; client `UdaTaskList`/`UdaTaskPage` accept DMS env so internal-table admin works without any DAMA pgEnv configured.

## ui

- [x] Table & Card React Router links — replace `<a href>` with React Router `<Link to>` for internal navigation in TableCell.jsx and Card.jsx (eliminates full page reloads)
- [x] Lexical plaintext normalization — move plaintext-to-Lexical-JSON conversion to shared `parseValue()` so HTML view path handles plaintext
- [x] Lexical sync HTML render — eliminate View jitter by using synchronous `editorState.read()` + `useMemo` instead of async `useEffect`
- [x] Fix theme merge for array fields (replace instead of deep merge)
- [x] Move widgets to top-level theme (out of layout.options)
- [x] Redesign widget system (key/value format, combine definitions + components, additive merge)
- [x] Theme merging issues — styles arrays merge by index causing cross-contamination (e.g., Dark style bleeds into Inline Guidance in mnyv1 lexical) *(see also: standardize component theme default fill-in)*
- [x] Map component refactor — extract core map from avl-map-2 into `ui/components/map/`, remove dead UI (sidebars/modals/panels), remove npm deps (react-color/fuse.js/colorbrewer), dynamically import maplibre-gl for code splitting, preserve external API

### ui/lexical-textsettings

- [x] Phase 0: Lexical analysis and cleanup (dead code removal, upstream comparison, table plugin updates)
- [ ] Phase 1: Lexical + textSettings foundation (convert theme to options/styles, create useLexicalTheme hook, replace custom UI components)
- [ ] Phase 2: Propagate textSettings to core components (Table, Card, Input, Select, Button, NavigableMenu, etc.)
- [ ] Phase 3: Documentation and migration (update docs, create migration guide, add textSettings to theme editor)

## patterns

### patterns/page

- [x] Fix nav2Level baseUrl bug and move to page pattern
- [x] Move lexical component inline controls (style, bgColor, showToolbar) to control config
- [x] Theme-based component registration (allow themes to declare `pageComponents` that auto-register to page pattern)
- [x] Consolidate page-edit history — replace per-edit `data_items` rows with single row per page holding `entries[]` array; update format, editFunctions, historyPane; migration script for existing databases
- [x] DataWrapper & data sources re-architecture — Phases 0/1/2/4/6 shipped: `buildUdaConfig` extracted, `useDataLoader` extracted, output `sourceInfo` for chainability, developer docs. Phases 3 (clean section↔dataWrapper interface), 5 (page-level data sources + state ownership restructure), and 5B (clean data schema) deferred — system works in production; if revisited they should each be their own task rather than reviving the monolith.
- [ ] DataWrapper join support — multi-source UDA configs with WITH/JOIN, join DSL, server-side SQL generation, join UI in data sources pane

### patterns/mapeditor

- [x] Convert MapEditor from datamanagerclient into standalone DMS pattern (symbology CRUD via DMS instead of DAMA)
- [x] Migrate MapEditor from DAMA to UDA routes — MapEditor + page-pattern `map/` and `map_dama/` components ported off DAMA; server-side `colorDomain` UDA route added; DAMA symbology data migrated to DMS in mitigat-ny-prod (247 rows + 2,217 component rewrites); filter translator wired; numerous follow-on bugs fixed during Phase 5 (substring metadata, category paint, layer panel overflow, FilterableSearch→ComboBox, dataById PK lookup, list fetch payload size)
- [ ] [Unify `map/` and `map_dama/` components](./tasks/current/map-component-unification.md) — two parallel implementations with distinct features: map_dama has multi-symbology + in-map filter controls; map has DataWrapper page-state filter binding + basemap selector + PMTiles infrastructure. Merge after UDA migration settles.

### patterns/datasets

- [x] Fix dataset creation → listing bug — getSitePatterns LIKE query, dmsSiteFactory siteType, DatasetsList category filter, UDA cache invalidation
- [x] Modernize datasets pattern — own defaultTheme, context-only siteConfig wrapper, per-page Layout, UI components throughout
- [x] DatasetsList style cleanup — transparent container, card/sidebar backgrounds, spacing, full-height, design pass, performance
- [x] Fix internal_source blank page — `getSourceData` doesn't include source's own ID in result, causes blank page when UDA `source_id` attribute is unset
- [x] Source overview cleanup — theme-driven styling, width constraint, show both display_name + column name, remove table height cap, tighten metadata layout
- [x] Datasets create page — extract create flow from DatasetsList modal into dedicated `/create` route with full-page layout
- [x] Source delete with soft + hard options (DAMA) — `uda.sources.delete` + `uda.sources.hardDelete` routes shipped; `DeleteDamaSourceBtn` 3-option modal with name-typed confirmation in `default/admin.jsx` working. Internal-table counterpart split out (see below).
- [x] Internal-table source delete + dmsEnv ownership fixes — `deleteInternalSource` server-side primitive (drops split tables, strips dmsEnv refs, deletes views + source row + dms.tasks rows), DMS branch in `softDeleteSource`/`hardDeleteSource`, client wiring in internal admin page, `cleanup-stale-dmsenv-refs.js` belt-and-suspenders script (registered as `db:cleanup-stale-dmsenv-refs`), fix to `buildDatasources` deduping internal envs by `dmsEnvId` (root cause of the picker showing each source twice when patterns share a dmsEnv).
- [x] Datasets settings page — category visibility settings, filtered/all toggle on list page, settings link for authed users
- [x] `internal_table` dataset type — new type combining creation + upload in one step, auto-creates first version, uses split tables for per-version data storage
- [x] Custom admin page for internal dataset types — version creation follows forms pattern (uses DMS `item` with `.id`), SourcePage allows datatype admin overrides
- [x] Fix `updateMetaData` in upload component — fixed apiUpdate call to use correct source type format and UDA update path
- [x] Internal pgEnv (dmsEnv) — decouple source ownership from datasets patterns into shared `dmsEnv` rows; per-pattern pgEnv/dmsEnv config in pattern editor; auto-create on fresh projects. Phases 1-7 shipped: format + admin UI, per-pattern `buildDatasources()`, source create/delete moved to dmsEnv, `migrate-to-dmsenv.js` + `rename-split-tables.js` migration scripts, migrated-dataset compat fixes (case-insensitive split regex/lookups, `sanitize()` in new naming, maxPaths 500K, 1MB header), invalid-entry table consolidation
- [x] `file_upload` → DMS-backed source metadata — source/view metadata moved into `data_items` rows owned by a `dmsEnv` (with `parent` fallback); new `POST /dms-admin/:app/file_upload` route; storage path keyed on `app`/`dmsEnv`; client `CreatePage`/`ViewPage` retargeted with legacy fallback for old pgEnv-backed views. Production-verified uploading 10 MP3s into `asm+nhomb`. See [tasks/completed/file-upload-dms-backed.md](./tasks/completed/file-upload-dms-backed.md)

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)
- [x] Add delete & duplicate buttons to admin pattern overview — port actions from old `PatternEdit` modal to pattern editor Overview tab + list table
- [ ] Pattern creation refresh bug — new pattern row appears with blank data, requires page refresh; `dmsDataEditor` mutates input data (replaces dms-format attrs with refs), revalidation doesn't restore correct data
- [ ] [Pattern-configurable HTML page title](./tasks/current/pattern-html-title.md) — add `html_title` attribute to pattern format, edit field in Overview pane of pattern editor, set `document.title` while pattern's routes are active; fall back to pattern `name` when unset

### patterns/auth

- [x] Fix `/groups/byproject` response shape — dms-server returns plain array, client expects `{ groups: [...] }` wrapper with synthetic "public" group

## config

- [x] Unified project configuration — consolidate hardcoded `App.jsx` arrays, dms-server `.env`, and SSR CLI env vars into a single root `.env` file read by both Vite (`VITE_*`) and dms-server (`--env-file-if-exists`)

## project maintenance

- [x] Upgrade to Vite 8 — Rolldown replaces esbuild+Rollup, rename rollupOptions→rolldownOptions, update React Compiler to use @rolldown/plugin-babel + reactCompilerPreset, verify CJS interop and WASM plugins
- [x] Vite HMR / Fast Refresh fixes — fix ~127 files with patterns that break hot module reload (mixed exports, anonymous components, object-wrapped exports, wrong file extensions)
- [x] package.json cleanup — consolidate deps across `dms-template` root, `@availabs/dms`, `@availabs/dms-server`; npm workspaces migration; React 19 / `@types/react` 19 alignment; delete `forms_bak/` + drop `react-table`/`react-popper`; pin `@carbon/icons-react@11.76.0` (11.78 broke Rolldown tree-shaking); vendor chunk ~1.4 MB smaller minified; prep for 2.0 publish
