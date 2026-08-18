# DMS Server

Express.js server providing a Falcor JSON Graph API for the DMS content management system. Supports both PostgreSQL and SQLite databases.

## Commands

```bash
npm run start           # node src/index.js
npm run dev             # nodemon src/index.js (auto-restart)
npm run test            # Run all tests
npm run test:sqlite     # Test SQLite adapter only
npm run test:controller # Test controller logic only
npm run test:workflow   # Test full DMS workflow
```

## Architecture

```
src/
  index.js                    # Express server, single endpoint: POST /graph
  db/
    index.js                  # Connection management, table initialization
    config.js                 # Config loader (JSON files from db/configs/)
    query-utils.js            # Cross-database SQL translation functions
    adapters/
      postgres.js             # PostgreSQL adapter (pg library)
      sqlite.js               # SQLite adapter (better-sqlite3)
    configs/                  # Database config JSON files
    sql/                      # Schema init scripts (*.sql and *.sqlite.sql)
    data/                     # SQLite database files (gitignored)
  routes/
    index.js                  # Auto-discovers *route*.js files, builds Falcor router
    dms/
      dms.route.js            # Falcor route definitions (GET/CALL/SET)
      dms.controller.js       # All database queries and business logic
      utils.js                # Filter/groupBy/orderBy SQL builders
  utils/
    falcor-express/           # Express middleware for Falcor protocol
    falcor-router/            # Falcor router implementation
```

## Key Concepts

### Falcor Protocol
All data flows through `GET|POST /graph`. Falcor routes match path patterns like `dms.data[{keys}].byIndex[{integers}]` and return JSON Graph responses with `$ref()` and `$atom()` wrappers.

### Dual Database Support
The server runs against either PostgreSQL or SQLite. The controller is a factory function that accepts the database config name:

```js
const { createController } = require('./dms.controller');

// Create controller with specific database
const controller = createController('dms-postgres');  // or 'dms-sqlite'

// Default export uses 'dms-sqlite' for backward compatibility
const defaultController = require('./dms.controller');
```

Config files live in `src/db/configs/`. The SQLite adapter automatically converts `$N` parameters to `?` placeholders and handles JSON serialization/deserialization.

### Split Mode

The `splitMode` setting controls how DMS tables are organized:

- **`legacy`** — All apps share a single `data_items` table (default if unset)
- **`per-app`** — Each app gets its own table/schema (`data_items__${app}` for SQLite, `dms_${app}.data_items` for PostgreSQL)

Split mode is resolved per-database via the priority chain:

```
options.splitMode (test override) > config.splitMode > process.env.DMS_SPLIT_MODE > 'legacy'
```

Add `"splitMode": "per-app"` to database config JSON files. New databases should use per-app mode; legacy mode is for backward compatibility with existing databases that haven't been migrated. All test configs use `"splitMode": "per-app"` — tests use the app-namespaced route (`dms.data[app].byId[ids][attrs]`) and 3-arg edit format (`[app, id, data]`).

### Data Model
All content is stored in `data_items` with a flexible `data` JSON column. The `app` + `type` pair acts as a composite namespace key (concatenated as `app+type` in queries).

## Code Style Preferences

### SQL Readability
SQL queries should be as readable as possible. Inline the SQL expressions directly rather than hiding them behind trivial wrapper functions. For example:

**Avoid** creating a function that just returns a constant string:
```js
// Bad - obscures what the SQL does
function appTypeKey() { return "app || '+' || type"; }
// ... later in SQL ...
SELECT ${appTypeKey()} AS key
```

```js
// Good - the SQL reads clearly
SELECT app || '+' || type AS key
```

**Database-specific helper functions are acceptable** when they genuinely abstract a difference between PostgreSQL and SQLite syntax. Functions like `jsonExtract()`, `typeCast()`, `jsonMerge()`, and `currentTimestamp()` exist because the SQL is structurally different between the two databases. These are fine.

**Do not create wrapper functions** that simply forward to another function with `dbType` pre-filled, unless the function is called many times and the forwarding significantly reduces noise. Prefer fewer layers of indirection. If a helper adds no real value beyond saving a few characters, inline the expression instead.

### General Principles
- Keep SQL queries readable at the call site. Someone reading a query should understand what it does without jumping to helper definitions.
- Only create reusable abstractions when there is a genuine structural difference to abstract (like postgres vs sqlite syntax) or when the same non-trivial logic appears 3+ times.
- Use `$N` style parameters everywhere. The SQLite adapter converts them automatically, including handling parameter reuse (e.g., `$4, $4`).
- The SQLite adapter auto-stringifies objects on write and auto-parses JSON strings on read, so controller code doesn't need to handle JSON serialization differences.

## Database Configs

Configs are JSON files in `src/db/configs/`. **Both `type` and `role` are required** — there is no inference, no legacy fallback, no default. A missing or invalid field throws at config load time. This is intentional: an omitted `type` used to silently route a config into the wrong role (or no role), leaving the caller staring at "relation X does not exist" errors.

```json
// SQLite
{ "type": "sqlite", "role": "dms", "filename": "../data/dms-test.sqlite" }

// PostgreSQL
{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5432, "database": "dms_db", "user": "postgres", "password": "..." }
```

### Field reference

| Field | Required | Values | Notes |
|---|---|---|---|
| `type` | yes | `"postgres"` \| `"sqlite"` | Picks the adapter. |
| `role` | yes | `"dms"` \| `"auth"` \| `"dama"`, or an array of these | Determines which schema init scripts run on first connection (`initDms`, `initAuth`, `initDama` + `initDamaTasks`). A pgEnv with `role: "dama"` gets `data_manager.{sources,views,...}` created on first `getDb()` call. Multi-role configs (e.g. `["dms", "auth"]`) run the matching init sequences in order. |
| `database` | postgres only | string | Postgres database name. |
| `host`, `port`, `user`, `password` | postgres | | Standard `pg` client options. |
| `filename` | sqlite only | path | Resolved relative to `src/db/configs/` if not absolute. |
| `splitMode` | optional | `"legacy"` \| `"per-app"` | Per-config override of the global `DMS_SPLIT_MODE`. Only meaningful for `role: "dms"`. |
| `clickhouse` | optional, dama | `{ host, port, user, password, database }` | Auxiliary read storage for large views. See "ClickHouse auxiliary storage" below. |

If you see "relation `data_manager.sources` does not exist" against a brand-new pgEnv, check that the config has both `"type": "postgres"` and `"role": "dama"` set — `initDama` only runs when `role` resolves to (or contains) `"dama"`.

### Schema migrations: `migrate_*.sql`, one set per role

The `create_*` SQL scripts all sit behind a `tablesExist` guard, so they only
ever run on a **fresh** database. Anything that has to reach an **existing**
database goes in a migration file instead.

Migrations live in the same `sql/` tree as the create scripts and follow the
same conventions — organised by role, with the `.sqlite.sql` suffix selecting
the dialect:

```
src/db/sql/
  auth/  migrate_auth_core.sql   (+ .sqlite.sql)   ← neither exists: no drift to migrate
  dama/  migrate_dama_core.sql   + migrate_dama_core.sqlite.sql
  dms/   migrate_dms_core.sql    + migrate_dms_core.sqlite.sql
```

A missing file is not an error — it just means that role/dialect has no
migrations yet. `runMigrationFile()` in `src/db/index.js` resolves the variant,
skips on `ENOENT`, and executes it. `sql/auth` has no migrate file because
`auth_tables.sql` and `auth_tables.sqlite.sql` have not changed since they were
created; that is an audited fact, not an oversight (see the drift guard below).

Roles map to **physically separate databases**, so each role's migrations run
only for that role, from `initSequence()` in `getDb()`, **after** every
`init*` step for that role. That ordering matters: `sql/dms/migrate_dms_core.sql`
can `ALTER TABLE dms.change_log` because `initSync` has already created it.

### The drift guard: `npm run test:schema-drift`

Keeping the two in sync is not left to memory. `tests/test-schema-drift.js`
runs as part of `npm test` and fails the build when a create script gains a
table or column that no migration supplies. It reports the exact statement to
add:

```
✗ dama/postgres: 1 unmigrated change(s) in sql/dama (postgres).
  Existing databases will never get:
        ALTER TABLE data_manager.sources ADD COLUMN IF NOT EXISTS auth_permissions …;
```

It works against `tests/fixtures/schema-baseline.json`, which records what a
database predating every migration is assumed to have — deliberately defined as
**the create-script schema minus everything the migrations supply**. Because a
migrated column is subtracted out, it stays outside the baseline permanently and
its migration stays permanently required; deleting a migration is caught just
like forgetting to write one. Regenerate with

```bash
node tests/test-schema-drift.js --update
```

and only in the same commit as the migrations it accounts for — the fixture's
value is that defeating it shows up as a reviewable diff.

The test also boots real SQLite databases, rewinds them to their pre-migration
shape, and asserts they come back column-for-column identical to a fresh one
(twice, to prove idempotency). Columns handled by a JS-level retrofit rather
than a migrate file — see the known exception below — are declared in the
`retrofitted` list in that file, so every exemption is explicit.

Rules:

- **Every statement must be safe to re-run** — these execute on every init.
  Use `IF EXISTS` / `IF NOT EXISTS`.
- SQLite has no `ADD COLUMN IF NOT EXISTS`, so a plain
  `ALTER TABLE … ADD COLUMN` is what you write. `runMigrationFile` makes that
  idempotent by checking `pragma_table_info` before issuing it, with a
  `duplicate column name` catch behind that as a backstop; every other error
  still surfaces. (The pre-check is not just tidiness — relying on the catch
  alone meant every server start logged red `Query error: duplicate column
  name` lines that were not errors, which is how a real failure in this file
  would have gone unnoticed.)
- **Don't put a `;` inside a comment** in a `.sqlite.sql` file. Statements are
  split on `;`; whole-line `--` comments are stripped first, but an inline
  trailing comment with a semicolon will still split mid-statement.
- **Postgres runs the whole file as one implicit transaction.** A statement that
  can legitimately fail — `CREATE EXTENSION` without the privileges to do it,
  say — must carry its own `EXCEPTION` handler, or it takes every other
  migration in the file down with it.

**Known exception.** The tasks-column retrofit in `initDamaSchedules`
(`attempt` / `max_attempts` / `schedule_id`) stays inline in JS. It cannot move
to `migrate_dama_core.sql` because `create_dama_schedule_tables.sql` ends with
`CREATE INDEX … ON data_manager.tasks (schedule_id)` — the retrofit is a
*prerequisite* of a create script, so it must run before it, whereas migrations
run after. Moving it would break schedule-table creation on any database
predating the scheduler.

Worked example — `views_etl_ctx_id_fkey`:

`data_manager.views.etl_context_id` historically carried a foreign key into the
legacy `data_manager.etl_contexts` table. That table is no longer written by
anything (only `scripts/migrate-dama-tasks.js` reads it, to backfill
`data_manager.tasks` from it). Task ids now come from `data_manager.tasks`,
whose id space diverged from `etl_contexts` at the migration boundary — so any
worker doing the documented thing and passing its `task_id` as
`etl_context_id` got:

```
insert or update on table "views" violates foreign key constraint "views_etl_ctx_id_fkey"
```

`create_dama_core_tables.sql` already declares the column as a plain `INTEGER`
with no FK, so only pre-migration databases were affected. The fix is one
idempotent statement in `sql/dama/migrate_dama_core.sql`:

```sql
ALTER TABLE data_manager.views DROP CONSTRAINT IF EXISTS views_etl_ctx_id_fkey;
```

**Do not work around a stale schema with defensive code at the call site.** A
try/catch-and-degrade in `dama/upload/metadata.js` would have hidden the
mismatch behind per-caller special-case handling and left every other datatype
plugin to rediscover it. Fix the schema once in init.

Dropping the constraint is a cleanup, not a licence to use the column:
**`data_manager.views.etl_context_id` is deprecated and nothing should write
it.** Record the producing task as `metadata.task_id`. Every worker in
`data-types/` and `dama/upload/workers/` follows this.

Careful — `etl_context_id` names two different things and only the column is
deprecated:

| Usage | Status |
|---|---|
| `data_manager.views.etl_context_id` column | **Deprecated.** Use `metadata.task_id`. |
| `{ etl_context_id, source_id }` route response, and `GET /events/query?etl_context_id=…` | **Live.** Here `etl_context_id` *is* the new `task_id` — it's the legacy client's polling contract. See `src/dama/CLAUDE.md#Response contract`. |

### File handling

`*.config.json` files in `src/db/configs/` are gitignored (see `configs/.gitignore`) since they often contain real credentials; only `*.example.config.json` and `*-test*.config.json` are tracked. Copy an example and rename when setting up a new environment.

### ClickHouse auxiliary storage (DAMA only)

A DAMA pgEnv can route individual views to ClickHouse for large static datasets while keeping the `data_manager` metadata (sources, views) in PostgreSQL. Add an optional `clickhouse` sub-object to the pgEnv config:

```json
{
  "type": "postgres",
  "role": "dama",
  "host": "...",
  "port": 5432,
  "user": "...",
  "password": "...",
  "database": "...",
  "clickhouse": {
    "host": "...",
    "port": 8123,
    "user": "...",
    "password": "...",
    "database": "..."
  }
}
```

**Dispatch**: a view is routed to ClickHouse when its `data_manager.views.table_schema` starts with `clickhouse.` (e.g., `clickhouse.npmrds_raw`). In that case, `getEssentials()` strips the prefix and swaps the adapter to the ClickHouse client via `getChDb(pgEnv)`. The UDA controller then dispatches `simpleFilterLength`, `simpleFilter`, and `dataById` to the CH query set in `src/routes/uda/query_sets/clickhouse.js` instead of the Postgres one.

**Scope**:
- ClickHouse is auxiliary **read** storage for dataset rows only. Source/view metadata always lives in the pgEnv's PostgreSQL — `getSourcesLength`, `getSourceById`, `getViewById`, etc. never hit ClickHouse.
- DMS content (`dms.data_items`, split tables, sync tables) never lives on ClickHouse.
- Write paths (insert/update/delete) are not implemented — data is populated by out-of-band ingestion.
- Meta lookups dispatch per-env, so a CH main query can pair with a PG meta lookup (or vice versa) and each recursion lands in the correct query set.

**Dependency**: `@clickhouse/client` is in `optionalDependencies`. Installs that don't need CH are not blocked if the module fails to install.

**Known hazard: no query caps + a client race can fire unfiltered probes.** The `ClickHouseAdapter`
(`src/db/adapters/clickhouse.js`) sets `max_execution_time: 0` and `max_memory_usage: 0` — no
server-side limit. A known client-side race (see
`planning/tasks/completed/dataWrapper-stale-fetch-race.md`) means a Graph/Spreadsheet section can
briefly fire a `simpleFilterLength` request with completely empty filters before its real scoping
resolves; against a small CH table this is harmless, but against a large fact table it becomes an
unfiltered full-table-scan query that can run for over an hour with no error. That race's fix only
stops the stale response from overwriting a later correct one — it does not cancel or prevent the
query. If a report page hangs or renders empty with no console error, check
`SELECT query_id, elapsed, read_rows, query FROM system.processes ORDER BY elapsed DESC` on the CH
server for stray long-running queries before assuming a defect in whatever you just changed. See
`documentation/npmrds-data-sources.md`'s "Known operational hazard" section for the full mechanism
and a live incident writeup.

## Testing

See `tests/CLAUDE.md` for detailed testing guidelines.

```bash
npm test                # Run all tests
npm run test:sqlite     # SQLite adapter tests
npm run test:controller # Controller function tests
npm run test:graph      # Graph harness tests (Falcor routes)
npm run test:workflow   # Full workflow integration test
```

### Test Philosophy

- Use real SQLite databases, not mocks — catches actual integration bugs
- **Tests call Falcor routes, not raw SQL** — use the graph harness to simulate client behavior
- Workflow tests simulate client journeys (create site → add patterns → create pages → add sections)
- Regression tests for every bug fixed
- Skip pointless unit tests for trivial code

### Test Graph Harness

The `tests/graph.js` module provides a test harness that calls Falcor routes directly without HTTP:

```js
const { createTestGraph } = require('./graph');

// Create a test graph with a specific database
const graph = createTestGraph('dms-sqlite');

// GET request
const result = await graph.getAsync([
  ['dms', 'data', 'myapp+mytype', 'length']
]);
console.log(result.jsonGraph.dms.data['myapp+mytype'].length);

// CALL request (create, edit, delete)
const createResult = await graph.callAsync(
  ['dms', 'data', 'create'],
  ['myapp', 'mytype']
);
```

This matches how the real client interacts with the API and catches actual route/controller integration bugs.

### Configurable Controller & Routes

Both the controller and routes use factory functions for testability:

```js
// Controller with custom database
const { createController } = require('./dms.controller');
const controller = createController('dms-sqlite');

// Routes with custom controller
const { createRoutes } = require('./dms.route');
const routes = createRoutes(controller);
```

The default exports use `dms-sqlite` for backward compatibility.

### Key Test Files

- `test-sqlite.js` — SQLite adapter compatibility
- `test-controller.js` — Controller functions + JSON parsing regression test
- `test-graph.js` — Graph harness (Falcor route tests)
- `test-workflow.js` — Full DMS workflow simulation via Falcor routes

### Request Logging & Replay

To capture browser requests for debugging or test generation:

```bash
# Start server with request logging enabled
DMS_LOG_REQUESTS=1 npm run dev
```

This creates a `logs/requests-<timestamp>.jsonl` file with all Falcor requests.

To replay recorded requests against the test database:

```bash
node tests/replay.js logs/requests-2026-01-28T12-00-00-000Z.jsonl
```

### Notes

- SQLite database files in `data/` are gitignored
- Log files in `logs/` are gitignored
- The `_parseJsonFields` method only parses known JSON columns (`data`, `attributes`) to match PostgreSQL's jsonb behavior while leaving `->>` extracted text as strings
