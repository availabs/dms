# DMS Todo

## type system

- [x] Type system refactor — uniform `{parent}:{instance}|{rowKind}` scheme replacing inconsistent type encoding; remove UUIDs in favor of human-readable slugs; eliminate `data.doc_type`; sources scoped to dmsEnv; `:data` suffix replaces split type regex; migration script for existing data

## dama

- [ ] DAMA server port — task queue with host isolation + idempotent locking, GIS/CSV upload pipeline (GDAL), multi-pgEnv routing, UDA task/event Falcor routes, datatype plugin system, legacy migration script
- [ ] [DAMA datatypes migration to plugin system](./tasks/current/dama-datatypes-migration.md) — port legacy hazmit datatypes (references/avail-falcor/…) into the new `registerDatatype` plugin shape. Files live in `dms-template/data-types/`, bootstrap via `DMS_EXTRA_DATATYPES` env var pointing at `dms-template/server/register-datatypes.js`. Guide + worked example for `enhance_nfip_claims_v2`; subsequent datatypes follow the same pattern

## cli

- [x] DMS CLI tool (`packages/dms/cli/`) — terminal access to DMS data via shared API code and Falcor protocol (sites, patterns, pages, sections, datasets)
- [ ] DMS MCP Server — Claude tool for reading, creating, and editing DMS pages/sections via structured MCP tools (Lexical builder, .dmsrc-aware config)

## local-first

- [x] Toy sync engine — standalone notes app proving SQLite WASM (wa-sqlite + OPFS), Yjs conflict resolution, revision-based sync protocol, passthrough pattern, and multi-tab reactivity
- [x] Toy sync Lexical integration — replace textarea with DMS Lexical editor, Lexical JSON flowing through existing Yjs sync pipeline (LWW per field, not character-level collab)
- [x] Toy sync collaborative editing — character-level Yjs ↔ Lexical binding via `CollaborationPlugin`, custom Yjs provider over existing WebSocket, room-based routing, cursor awareness, server-side Yjs state persistence
- [x] DMS local-first sync integration — server change_log + sync endpoints + WebSocket, client SQLite WASM + sync manager + reactive queries, passthrough to Falcor, Lexical live sync, opt-in via `VITE_DMS_SYNC=1`. All 5 phases complete (server, client, DMS integration, Lexical collab, production hardening + docs). Multi-tab coordination deferred to Phase 5b.
- [x] Pattern-scoped sync + SQLite fix — fix SQLite event loop blocking (chunked bootstrap queries), change sync boundary from app to pattern (doc_type), skeleton bootstrap for site structure, on-demand pattern bootstrap on navigation

## api

- [x] DataWrapper API-layer loading — move dataWrapper data fetching into the DMS API/loader so section data loads at navigation time (React Router 7 loader) instead of after component mount; detect dataWrapper sections, extract URL-mapped filter params, pre-run getData(), leverage cache freshness to skip component-level re-fetch
- [ ] DataWrapper skip fetch when cached — when "Always Fetch Data" is OFF, skip API call entirely and use cached `element-data`; currently Pagination.jsx auto-sets `readyToLoad=true` for non-paginated views, bypassing the user's toggle
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
- [ ] DataWrapper & data sources re-architecture — Phases 1-5B done (buildUdaConfig, useDataLoader, useDataWrapperAPI, outputSourceInfo, page-level dataSources, section↔dataWrapper separation, v2 schema). Remaining: Phase 6 (developer docs), page filter runtime resolution (5.18)
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
- [ ] [Source delete with soft + hard options](./tasks/current/datasets-source-delete.md) — admin page Delete button is currently broken (wrong Falcor route); replace with 3-option modal (Cancel / Delete / Hard Delete). Soft = remove source+view rows from `data_manager`. Hard = also drop per-view data tables, remove download files from storage, purge tasks. New `uda[pgEnv].sources.delete` / `sources.hardDelete` Falcor routes
- [x] Datasets settings page — category visibility settings, filtered/all toggle on list page, settings link for authed users
- [x] `internal_table` dataset type — new type combining creation + upload in one step, auto-creates first version, uses split tables for per-version data storage
- [x] Custom admin page for internal dataset types — version creation follows forms pattern (uses DMS `item` with `.id`), SourcePage allows datatype admin overrides
- [x] Fix `updateMetaData` in upload component — fixed apiUpdate call to use correct source type format and UDA update path
- [ ] Internal pgEnv (dmsEnv) — decouple source ownership from datasets patterns into shared `dmsEnv` rows; per-pattern pgEnv/dmsEnv config in pattern editor; auto-create on fresh projects

### patterns/forms

### patterns/admin

- [x] Update admin theme merges to use `mergeTheme` (siteConfig.jsx, editTheme.jsx, themeEditor.jsx)
- [x] Add delete & duplicate buttons to admin pattern overview — port actions from old `PatternEdit` modal to pattern editor Overview tab + list table
- [ ] Pattern creation refresh bug — new pattern row appears with blank data, requires page refresh; `dmsDataEditor` mutates input data (replaces dms-format attrs with refs), revalidation doesn't restore correct data

### patterns/auth

- [x] Fix `/groups/byproject` response shape — dms-server returns plain array, client expects `{ groups: [...] }` wrapper with synthetic "public" group

## config

- [x] Unified project configuration — consolidate hardcoded `App.jsx` arrays, dms-server `.env`, and SSR CLI env vars into a single root `.env` file read by both Vite (`VITE_*`) and dms-server (`--env-file-if-exists`)

## project maintenance

- [x] Upgrade to Vite 8 — Rolldown replaces esbuild+Rollup, rename rollupOptions→rolldownOptions, update React Compiler to use @rolldown/plugin-babel + reactCompilerPreset, verify CJS interop and WASM plugins
- [x] Vite HMR / Fast Refresh fixes — fix ~127 files with patterns that break hot module reload (mixed exports, anonymous components, object-wrapped exports, wrong file extensions)
- [x] package.json cleanup — consolidate deps across `dms-template` root, `@availabs/dms`, `@availabs/dms-server`; npm workspaces migration; React 19 / `@types/react` 19 alignment; delete `forms_bak/` + drop `react-table`/`react-popper`; pin `@carbon/icons-react@11.76.0` (11.78 broke Rolldown tree-shaking); vendor chunk ~1.4 MB smaller minified; prep for 2.0 publish
