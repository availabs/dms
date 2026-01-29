# DMS Completed Tasks

## api

## dms-manager

## dms-server

- [fix-createData-drops-data.md](./tasks/completed/fix-createData-drops-data.md) - Fixed createData ignoring data argument, causing sections to have empty data (2026-01-28)
- [fix-sqlite-pages-missing-index.md](./tasks/completed/fix-sqlite-pages-missing-index.md) - Fixed searchOne returning null for root page: `||` dropping falsy `0` + SQLite `->>` type mismatch (2026-01-28)

## ui

- [fix-theme-array-merge.md](./tasks/completed/fix-theme-array-merge.md) - Implemented `mergeTheme` with `_replace` convention so array fields in themes get replaced instead of deep-merged (2026-01-28)

## patterns

### patterns/page

- [combine-datasources-task.md](./tasks/completed/combine-datasources-task.md) - Combined `pgEnv`, `damaBaseUrl`, and `datasetPatterns` into unified `datasources` array (2026-01-22)

### patterns/datasets

- [datasets-datasources-migration.md](./tasks/completed/datasets-datasources-migration.md) - Migrated datasets pattern to use unified `datasources` array from context instead of `pgEnv`/`damaBaseUrl` (2026-01-23)

### patterns/forms

### patterns/admin

- [update-admin-theme-merges.md](./tasks/completed/update-admin-theme-merges.md) - Updated admin theme merges in siteConfig.jsx, editTheme.jsx, and themeEditor.jsx to use `mergeTheme` (2026-01-28)

### patterns/auth
