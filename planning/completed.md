# DMS Completed Tasks

## api

## dms-manager

- [centralize-format-initialization.md](./tasks/completed/centralize-format-initialization.md) - Centralized `updateRegisteredFormats`/`updateAttributes` in `_utils.jsx`, added `initializePatternFormat` helper; removed ~100 lines of duplicated code from admin/page/forms/datasets patterns (2026-02-05)

## dms-server

- [fix-createData-drops-data.md](./tasks/completed/fix-createData-drops-data.md) - Fixed createData ignoring data argument, causing sections to have empty data (2026-01-28)
- [fix-sqlite-pages-missing-index.md](./tasks/completed/fix-sqlite-pages-missing-index.md) - Fixed searchOne returning null for root page: `||` dropping falsy `0` + SQLite `->>` type mismatch (2026-01-28)

## ui

- [fix-theme-array-merge.md](./tasks/completed/fix-theme-array-merge.md) - Implemented `mergeTheme` with `_replace` convention so array fields in themes get replaced instead of deep-merged (2026-01-28)
- [move-widgets-to-top-level-theme.md](./tasks/completed/move-widgets-to-top-level-theme.md) - Moved widgets from layout.options to top-level theme property (2026-01-29)
- [redesign-widget-system.md](./tasks/completed/redesign-widget-system.md) - Redesigned widget system: key/value format, combined definitions + components in `ui/widgets/index.jsx`, additive merge, bridge for runtime registration (2026-01-29)
- [lexical-phase0-analysis-cleanup.md](./tasks/completed/lexical-phase0-analysis-cleanup.md) - Lexical Phase 0: dead code cleanup (~28 files), upstream comparison, table plugin updates (hover feedback, Mac scrollbar handling) (2026-02-03)

## patterns

### patterns/page

- [fix-nav2level-baseurl.md](./tasks/completed/fix-nav2level-baseurl.md) - Fixed nav2Level failing for non-root baseUrl patterns; moved to page pattern as resolveNav callback (2026-01-29)
- [combine-datasources-task.md](./tasks/completed/combine-datasources-task.md) - Combined `pgEnv`, `damaBaseUrl`, and `datasetPatterns` into unified `datasources` array (2026-01-22)
- [lexical-controls-to-config.md](./tasks/completed/lexical-controls-to-config.md) - Moved Rich Text inline controls (style, bgColor, showToolbar) to NavigableMenu config with nested submenu pattern; added ColorPickerFlat component (2026-02-03)
- [theme-component-registration.md](./tasks/completed/theme-component-registration.md) - Extracted component registry to standalone module (`componentRegistry.js`), added `theme.pageComponents` auto-registration in page siteConfig, fixed NavigableMenu `flattenConfig` key collision bug; updated component-overview.md (2026-02-05)

### patterns/datasets

- [datasets-datasources-migration.md](./tasks/completed/datasets-datasources-migration.md) - Migrated datasets pattern to use unified `datasources` array from context instead of `pgEnv`/`damaBaseUrl` (2026-01-23)

### patterns/forms

### patterns/admin

- [update-admin-theme-merges.md](./tasks/completed/update-admin-theme-merges.md) - Updated admin theme merges in siteConfig.jsx, editTheme.jsx, and themeEditor.jsx to use `mergeTheme` (2026-01-28)

### patterns/auth
