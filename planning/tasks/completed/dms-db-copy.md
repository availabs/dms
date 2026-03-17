# DMS Database Copy CLI

## Objective

Create a simple CLI script in `dms-server` that copies all DMS data from one database to another. Must work across database types — PostgreSQL to SQLite, SQLite to PostgreSQL, and same-type copies. The copy is a full, exact replica of all `data_items` and `formats` rows.

## Motivation

- **Local development**: Pull a production PostgreSQL database down to a local SQLite file for offline development
- **Deployment**: Push a locally-built SQLite database up to a PostgreSQL production server
- **Backup**: Snapshot a database to a different backend
- **Migration**: Move data between environments (staging → production, old server → new server)

## Design

### Usage

```bash
# Copy from PostgreSQL to SQLite
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite

# Copy from SQLite to PostgreSQL
node src/scripts/copy-db.js --source dms-sqlite --target dms-postgres

# Same-type copy
node src/scripts/copy-db.js --source dms-postgres-prod --target dms-postgres-staging

# With options
node src/scripts/copy-db.js --source dms-postgres --target dms-sqlite --clear-target
```

Arguments:
- `--source <config>` — Source database config name (from `src/db/configs/`)
- `--target <config>` — Target database config name (from `src/db/configs/`)
- `--clear-target` — Delete all existing data in target before copying (default: error if target has data)
- `--app <name>` — Optional: copy only data for a specific app (filter by `app` column)
- `--dry-run` — Show what would be copied without writing

### Data Scope

The DMS database has two tables to copy:

| Table | Purpose | Columns |
|-------|---------|---------|
| `data_items` | All DMS content (sites, patterns, pages, sections, sources, views, dataset rows) | id, app, type, data, created_at, created_by, updated_at, updated_by |
| `formats` | Format/schema definitions per app+type | id, app, type, attributes, created_at, updated_at |

Split tables (`data_items__*`) also need to be discovered and copied if they exist in the source.

### Cross-Database Considerations

| Concern | PostgreSQL | SQLite | Handling |
|---------|-----------|--------|----------|
| `data` column | `jsonb` (parsed object) | `TEXT` (JSON string) | Read as object, write as object — adapters handle serialization |
| `attributes` column | `jsonb` or `text` | `TEXT` | Same as data |
| Timestamps | `timestamp with time zone` | `TEXT` (datetime string) | Read as string (via `::TEXT` cast on PG), write as string |
| IDs | `bigint` from sequence | `INTEGER` autoincrement | Preserve exact IDs — insert with explicit ID values |
| Sequences | `dms.data_items_id_seq` | N/A (autoincrement) | After copy, reset PG sequence to `max(id) + 1`. For SQLite, autoincrement continues from max id. |
| Schema | `dms.*` | `main.*` (no prefix) | Use adapter's table naming conventions |

### Algorithm

1. **Connect** to source and target databases via `getDb(configName)`
2. **Validate** — target must be empty (or `--clear-target` flag set)
3. **Initialize** target schema — ensure `data_items` and `formats` tables exist
4. **Discover split tables** in source (query `sqlite_master` or `pg_tables` for `data_items__*` patterns)
5. **Copy `formats`** — read all rows from source, batch insert into target with explicit IDs
6. **Copy `data_items`** — read in batches (e.g., 1000 rows), insert into target with explicit IDs
7. **Copy split tables** — for each discovered `data_items__*` table, create it in target then copy rows
8. **Reset sequences** — for PostgreSQL targets, set sequence to `max(id) + 1`
9. **Verify** — compare row counts between source and target
10. **Report** — print summary (tables copied, row counts, elapsed time)

### Batch Processing

Large `data_items` tables (dataset row data can have millions of rows) need batched reads/writes:

```
SELECT * FROM data_items ORDER BY id LIMIT 1000 OFFSET 0
SELECT * FROM data_items ORDER BY id LIMIT 1000 OFFSET 1000
...
```

Write batches using individual INSERT statements (cross-DB compatible) or multi-row INSERT for same-type copies.

### ID Preservation

All IDs must be preserved exactly. This means:
- **PostgreSQL target**: `INSERT INTO dms.data_items (id, app, type, data, ...) VALUES ($1, $2, ...)` — explicit ID, no DEFAULT
- **SQLite target**: `INSERT INTO data_items (id, app, type, data, ...) VALUES ($1, $2, ...)` — explicit ID, no AUTOINCREMENT

After copy, PostgreSQL sequences need resetting:
```sql
SELECT setval('dms.data_items_id_seq', (SELECT COALESCE(MAX(id), 0) FROM dms.data_items));
```

## Implementation Phases

### Phase 1: Core Copy Script — DONE

Create `src/scripts/copy-db.js`:

- [x] Parse CLI arguments (`--source`, `--target`, `--clear-target`, `--app`, `--dry-run`)
- [x] Connect to source and target databases via direct adapter creation from `loadConfig()`
- [x] Validate: target is empty or `--clear-target` set
- [x] If `--clear-target`: delete all rows from target `data_items`, `formats`, and split tables
- [x] Copy `formats` table: read all, insert with explicit IDs (`OVERRIDING SYSTEM VALUE` for PG)
- [x] Copy `data_items` table: batched read (1000 rows), cursor-based pagination, insert with explicit IDs
- [x] Handle cross-DB `data` column: adapters handle JSON serialization/deserialization automatically
- [x] Handle cross-DB timestamps: `::TEXT` cast in SELECT (stripped by SQLite adapter, converts PG Date→string)
- [x] `--app` filter: add `WHERE app = $1` to all reads when specified
- [x] `--dry-run`: print counts and table names without writing
- [x] Progress output: print batch progress (e.g., "data_items: 3000/15000 rows")

### Phase 2: Split Tables + Sequences — DONE

- [x] Discover split tables in source: query `sqlite_master` (SQLite) or `pg_tables` (PostgreSQL) for tables matching `data_items__%`
- [x] For each split table: resolve target table name via `resolveTable()` (handles PG 63-char truncation), create in target using `buildCreateTableSQL`, then batch copy rows
- [x] PostgreSQL target: reset `dms.data_items_id_seq` to max(id) via `setval()`, reset formats identity sequence via `pg_get_serial_sequence`
- [x] SQLite target: advance `dms_id_seq` autoincrement counter by inserting row with max(id)

### Phase 3: Verification + Testing — DONE

- [x] After copy: compare row counts for each table between source and target
- [x] Print summary: tables copied, row counts, any mismatches, elapsed time
- [x] Integration test: 48 tests — basic copy, data integrity, dry-run, app filter, clear-target, non-empty error, split tables, batch processing (1500 rows), sequence reset
- [ ] Integration test: copy SQLite → PostgreSQL (via Docker) — deferred to PG test run
- [ ] Integration test: copy PostgreSQL → SQLite — deferred to PG test run
- [x] Add `npm run db:copy` and `npm run test:db-copy` scripts to package.json

### Phase 4: Performance Optimization — DONE

- [x] Cast `data::TEXT` and `attributes::TEXT` when reading from PostgreSQL — eliminates pg driver JSON parse + JS stringify cycle, major memory reduction
- [x] PostgreSQL bulk inserts via `unnest()` — one `INSERT ... SELECT FROM unnest(...)` per batch instead of N individual INSERTs, major speed improvement
- [x] `toJsonStr()` helper — ensures JSON column values are strings (or null) for the `text[] → ::jsonb` cast in unnest inserts
- [x] `--batch-size <n>` CLI flag (default 5000) — configurable batch size for memory-constrained environments
- [x] All 61 SQLite integration tests pass, no regressions

**Design note**: The `::TEXT` cast is added unconditionally to `selectColumns()`. The SQLite adapter strips `::TYPE` casts automatically, so the SQLite read path is unaffected. For PG reads, the driver returns plain strings instead of parsed JS objects — these pass straight through to either target without JSON round-tripping.

## Files

| File | Change |
|------|--------|
| `src/scripts/copy-db.js` | NEW — main copy script |
| `package.json` | Add `db:copy` script |
| `tests/test-db-copy.js` | NEW — integration tests |

## Testing Checklist

- [x] SQLite → SQLite: all rows copied with correct IDs, data, timestamps (48 tests)
- [ ] SQLite → PostgreSQL: data column stored as jsonb, timestamps correct, sequence reset
- [ ] PostgreSQL → SQLite: jsonb → TEXT JSON string, IDs preserved
- [ ] PostgreSQL → PostgreSQL: direct copy, sequence reset
- [x] `--app` filter: only specified app's data copied
- [x] `--clear-target`: existing data deleted before copy
- [x] `--dry-run`: no data written, counts printed
- [x] Split tables: discovered and copied
- [x] Large dataset: batch processing works (tested with 1500 rows, 2 batches)
- [x] Error handling: meaningful errors for non-empty target without --clear-target
