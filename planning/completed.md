# DMS Completed Tasks

## cli

- [dms-cli.md](./tasks/completed/dms-cli.md) - DMS CLI tool: Falcor HTTP client, raw CRUD, site/pattern/page/section/dataset commands, tree formatter, stdin support, 21 integration tests, docs (2026-02-09)

## api

## dms-manager

- [centralize-format-initialization.md](./tasks/completed/centralize-format-initialization.md) - Centralized `updateRegisteredFormats`/`updateAttributes` in `_utils.jsx`, added `initializePatternFormat` helper; removed ~100 lines of duplicated code from admin/page/forms/datasets patterns (2026-02-05)

## dms-server

- [fix-createData-drops-data.md](./tasks/completed/fix-createData-drops-data.md) - Fixed createData ignoring data argument, causing sections to have empty data (2026-01-28)
- [fix-sqlite-pages-missing-index.md](./tasks/completed/fix-sqlite-pages-missing-index.md) - Fixed searchOne returning null for root page: `||` dropping falsy `0` + SQLite `->>` type mismatch (2026-01-28)
- [dms-server-auth.md](./tasks/completed/dms-server-auth.md) - Implemented full auth system: JWT middleware, 45 endpoints (auth/user/group/project/message/preferences), cross-DB queries, authority checks, created_by/updated_by pipeline, 103 integration tests (2026-02-09)
- [dms-server-postgres-tests.md](./tasks/completed/dms-server-postgres-tests.md) - PostgreSQL test support: Docker lifecycle helper, parameterized test-graph/test-workflow/test-auth for dual DB, npm scripts (test:pg, test:all), fixed COUNT bigint + boolean cross-DB bugs (2026-02-09)
- [uda-routes.md](./tasks/completed/uda-routes.md) - UDA Falcor routes: unified query interface for DMS (JSON data_items) and DAMA (sources/views/tables) databases, PostgreSQL only (2026-02-08)
- [auth-db-init-race.md](./tasks/completed/auth-db-init-race.md) - Fixed auth DB init race condition: `getDb()` returns before async init completes causing "no such table: users"; added `awaitReady()`, multi-role config support (2026-02-08)
- [dms-dead-row-cleanup.md](./tasks/completed/dms-dead-row-cleanup.md) - Dead row cleanup CLI: analyzes DMS database for 5 orphan types (patterns, pages, sections, sources, views), PostgreSQL-optimized SQL path, optional --delete mode, 40 integration tests (2026-02-13)
- [dms-db-copy.md](./tasks/completed/dms-db-copy.md) - Database copy CLI: cross-DB copy (PG↔SQLite), ::TEXT cast optimization, unnest() bulk PG inserts, split table discovery, sequence sync, --batch-size flag, 61 integration tests (2026-02-13)

## ui

- [fix-theme-array-merge.md](./tasks/completed/fix-theme-array-merge.md) - Implemented `mergeTheme` with `_replace` convention so array fields in themes get replaced instead of deep-merged (2026-01-28)
- [move-widgets-to-top-level-theme.md](./tasks/completed/move-widgets-to-top-level-theme.md) - Moved widgets from layout.options to top-level theme property (2026-01-29)
- [redesign-widget-system.md](./tasks/completed/redesign-widget-system.md) - Redesigned widget system: key/value format, combined definitions + components in `ui/widgets/index.jsx`, additive merge, bridge for runtime registration (2026-01-29)
- [lexical-phase0-analysis-cleanup.md](./tasks/completed/lexical-phase0-analysis-cleanup.md) - Lexical Phase 0: dead code cleanup (~28 files), upstream comparison, table plugin updates (hover feedback, Mac scrollbar handling) (2026-02-03)
- [lexical-plaintext-normalize.md](./tasks/completed/lexical-plaintext-normalize.md) - Moved plaintext-to-Lexical-JSON conversion into shared `parseValue()` so both editor and HTML view paths handle plaintext input (2026-02-08)
- [lexical-sync-html-render.md](./tasks/completed/lexical-sync-html-render.md) - Eliminated Lexical View jitter: added sync `getHtmlSync()` using `editorState.read()`, switched View from `useEffect+useState` to `useMemo`, restored collapsible handlers (2026-02-08)
- [theme-merging-issues.md](./tasks/completed/theme-merging-issues.md) - Fixed styles array cross-contamination, standardized component theme default fill-in via `getComponentTheme()` (2026-02-09)

## patterns

### patterns/page

- [fix-nav2level-baseurl.md](./tasks/completed/fix-nav2level-baseurl.md) - Fixed nav2Level failing for non-root baseUrl patterns; moved to page pattern as resolveNav callback (2026-01-29)
- [combine-datasources-task.md](./tasks/completed/combine-datasources-task.md) - Combined `pgEnv`, `damaBaseUrl`, and `datasetPatterns` into unified `datasources` array (2026-01-22)
- [lexical-controls-to-config.md](./tasks/completed/lexical-controls-to-config.md) - Moved Rich Text inline controls (style, bgColor, showToolbar) to NavigableMenu config with nested submenu pattern; added ColorPickerFlat component (2026-02-03)
- [theme-component-registration.md](./tasks/completed/theme-component-registration.md) - Extracted component registry to standalone module (`componentRegistry.js`), added `theme.pageComponents` auto-registration in page siteConfig, fixed NavigableMenu `flattenConfig` key collision bug; updated component-overview.md (2026-02-05)

### patterns/datasets

- [datasets-datasources-migration.md](./tasks/completed/datasets-datasources-migration.md) - Migrated datasets pattern to use unified `datasources` array from context instead of `pgEnv`/`damaBaseUrl` (2026-01-23)
- [datasets-pattern-modernize.md](./tasks/completed/datasets-pattern-modernize.md) - Modernized datasets pattern: combined 3 configs, defaultTheme, context-only wrapper, per-page Layout, LayoutGroup + Breadcrumbs, UI components in DatasetsList, dead code cleanup, MetadataComp/ValidateComp theming (2026-02-07)
- [datasets-list-style-cleanup.md](./tasks/completed/datasets-list-style-cleanup.md) - DatasetsList style cleanup: transparent container, theme-driven card/sidebar styling, sticky header+sidebar, full-height layout, design pass, module-level sources cache, React.memo + useMemo performance (2026-02-08)
- [fix-internal-source-blank-page.md](./tasks/completed/fix-internal-source-blank-page.md) - Fixed blank page on internal_source pages where UDA `source_id` attribute was unset; `getSourceData` now falls back to URL param ID (2026-02-09)
- [source-overview-cleanup.md](./tasks/completed/source-overview-cleanup.md) - Source overview cleanup: theme-driven styling (sourceOverview + sourcePage themes), tab jitter/active state fix, loading flash fix, width constraint, column display_name + name, versions table with downloads, SourcePage rename + theme split (2026-02-09)
- [datasets-create-page.md](./tasks/completed/datasets-create-page.md) - Datasets create page: extracted modal create flow into dedicated `/create` route with Layout/Breadcrumbs, type selector, external create component support, clone flow; replaced Add button with Link on DatasetsList (2026-02-09)
- [datasets-settings-page.md](./tasks/completed/datasets-settings-page.md) - Datasets settings page: category visibility settings with two-column toggle, filtered/all toggle on list page, settings gear link for authed users, category breadcrumbs + sub-category nesting in sidebar, no-category sources filtered (2026-02-09)
- [fix-dataset-listing-bug.md](./tasks/completed/fix-dataset-listing-bug.md) - Fixed dataset listing bug: getSitePatterns LIKE query, dmsSiteFactory siteType, DatasetsList category filter for uncategorized sources, UDA cache invalidation (2026-02-13)
- [internal-dataset-admin-page.md](./tasks/completed/internal-dataset-admin-page.md) - Custom admin page for internal datasets: version creation via DMS item.id, SourcePage datatype admin overrides, auto-navigate to latest view, overview shows versions (2026-02-13)

### patterns/forms

### patterns/admin

- [update-admin-theme-merges.md](./tasks/completed/update-admin-theme-merges.md) - Updated admin theme merges in siteConfig.jsx, editTheme.jsx, and themeEditor.jsx to use `mergeTheme` (2026-01-28)
- [admin-pattern-delete-duplicate.md](./tasks/completed/admin-pattern-delete-duplicate.md) - Added delete and duplicate buttons to admin pattern overview: ported actions from old PatternEdit modal to pattern editor Overview tab and list table (2026-02-08)

<<<<<<< HEAD
### patterns/auth

- [auth-groups-byproject-shape.md](./tasks/completed/auth-groups-byproject-shape.md) - Fixed /groups/byproject response shape: wrapped plain array in { groups: [...] } with synthetic "public" group, 104 auth tests pass (2026-02-13)
=======
### patterns/auth
>>>>>>> b21e39b443a00cdd4f03ea9c52b1e26f1b466724
