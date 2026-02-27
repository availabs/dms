# DMS Server Scripts

## copy-db.js

Copy all DMS data from one database to another. Works across database types — PostgreSQL to SQLite, SQLite to PostgreSQL, and same-type copies. Produces a full, exact replica of all `data_items`, `formats`, and split table rows with preserved IDs.

### Usage

```bash
node src/scripts/copy-db.js --source <config> --target <config> [options]

# or via npm
npm run db:copy -- --source <config> --target <config> [options]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--source <config>` | Yes | Source database config name (from `src/db/configs/`) |
| `--target <config>` | Yes | Target database config name (from `src/db/configs/`) |
| `--clear-target` | No | Delete all existing data in target before copying. Without this flag, the script errors if the target already has data. |
| `--app <name>` | No | Copy only data for a specific app (filters by `app` column) |
| `--skip-orphans` | No | Detect and exclude orphaned rows (sections without pages, patterns without sites, etc.) from the copy. Runs the same analysis as `cleanup-db.js` on the source before copying. |
| `--dry-run` | No | Show what would be copied without writing anything |

### Examples

```bash
# Pull production PostgreSQL down to local SQLite
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite

# Push local SQLite up to PostgreSQL
node src/scripts/copy-db.js --source dms-sqlite --target dms-postgres

# Overwrite an existing target
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite --clear-target

# Copy only one app's data
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite --app my-site

# Preview without writing
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite --dry-run

# Copy without orphaned rows (dead sections, patterns, etc.)
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite --skip-orphans
```

### Features

- **Cross-database copies** — PostgreSQL to SQLite, SQLite to PostgreSQL, or same-type. Handles `jsonb` vs `TEXT` JSON columns, timestamp type differences, and PostgreSQL identity columns automatically.
- **ID preservation** — All row IDs are copied exactly. Sequences are reset after copy so new inserts continue from the correct value.
- **Split table support** — Discovers `data_items__*` split tables in the source, resolves the correct target table name (accounting for PostgreSQL's 63-char identifier limit), creates the table if needed, and copies all rows.
- **Batch processing** — Reads in batches of 1000 rows using cursor-based pagination (`WHERE id > $lastId`). Each batch is written in a transaction. Progress is printed for large tables.
- **Verification** — After copy, compares row counts between source and target for every table and reports any mismatches.
- **Schema initialization** — If the target database is empty (no DMS tables), the script automatically creates the schema before copying.
- **Orphan exclusion** — `--skip-orphans` runs orphan detection (same as `cleanup-db.js`) on the source and excludes dead rows from the copy. Useful for getting a clean copy without inherited orphans.

### What gets copied

| Table | Contents |
|-------|----------|
| `formats` | Format/schema definitions (app, type, attributes) |
| `data_items` | All DMS content — sites, patterns, pages, sections, sources, views |
| `data_items__*` | Split tables containing dataset row data |

### Database configs

Config files live in `src/db/configs/<name>.config.json`. Examples:

```json
// SQLite
{ "type": "sqlite", "role": "dms", "filename": "../data/my-db.sqlite" }

// PostgreSQL
{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5432,
  "database": "dms", "user": "postgres", "password": "secret" }
```

### Testing

```bash
npm run test:db-copy    # 61 integration tests (SQLite to SQLite)
```

## cleanup-db.js

Analyze a DMS database for orphaned rows — content items whose parent no longer exists — and optionally delete them. The DMS schema has no foreign key constraints, so deleting a parent (site, pattern, page, source) silently orphans all its children.

### Usage

```bash
node src/scripts/cleanup-db.js --source <config> [options]

# or via npm
npm run db:cleanup -- --source <config> [options]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--source <config>` | Yes | Database config name (from `src/db/configs/`) |
| `--app <name>` | No | Analyze only a specific app |
| `--type <type>` | No | Only check one orphan type: `patterns`, `pages`, `sections`, `views`, `sources` |
| `--delete` | No | Actually delete orphaned rows (default: analyze only) |
| `--dry-run` | No | Synonym for default analyze-only mode (explicit) |

### Examples

```bash
# Analyze all apps
node src/scripts/cleanup-db.js --source dms-sqlite

# Analyze a specific app
node src/scripts/cleanup-db.js --source dms-sqlite --app my-site

# Only check for orphaned sections
node src/scripts/cleanup-db.js --source dms-sqlite --type sections

# Delete orphaned rows
node src/scripts/cleanup-db.js --source dms-sqlite --delete

# Delete orphaned sections for one app
node src/scripts/cleanup-db.js --source dms-sqlite --app my-site --type sections --delete
```

### Orphan types detected

| Type | Condition |
|------|-----------|
| **Patterns** | Type ends in `\|pattern`, but no site references this pattern's ID in `data.patterns[]` |
| **Pages** | Type matches a `doc_type` from a page pattern, but no such pattern exists |
| **Sections** | Type ends in `\|cms-section`, but no page references this section's ID in `data.sections[]` or `data.draft_sections[]` |
| **Sources** | Type ends in `\|source` (not `\|source\|view`), but no datasets/forms pattern exists with matching `doc_type` |
| **Views** | Type ends in `\|source\|view`, but no source references this view's ID in `data.views[]` |

Dataset data rows (UUID-viewId types) are never flagged.

### Testing

```bash
npm run test:db-cleanup    # 40 integration tests
```
