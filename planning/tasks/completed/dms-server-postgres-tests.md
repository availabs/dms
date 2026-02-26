# DMS Server PostgreSQL Test Support

## Objective

Make all dms-server tests runnable against PostgreSQL in addition to SQLite. Use Docker to manage a disposable PostgreSQL instance so tests are self-contained with no external dependencies.

## Current State

- All 5 test suites (`test-sqlite`, `test-controller`, `test-graph`, `test-workflow`, `test-auth`) are hardcoded to SQLite
- The database layer already fully supports PostgreSQL — adapters, query-utils, controller, schemas all handle both
- The test graph harness (`tests/graph.js`) already accepts a `dbName` parameter
- `test-auth.js` is the only test that starts an HTTP server; the others use the graph harness directly
- PostgreSQL schemas exist: `src/db/sql/dms/dms.sql`, `src/db/sql/auth/auth_tables.sql`
- `pg` is already an optional dependency in `package.json`

## Approach

### Docker for PostgreSQL

Use a simple shell script (or Node child_process) to spin up a `postgres:17-alpine` container before tests and tear it down after. No docker-compose — a single `docker run` command is sufficient.

Container config:
- Image: `postgres:17-alpine`
- Port: `5499` (avoid conflicts with any local PostgreSQL on 5432)
- Database: `dms_test`
- User/password: `dms_test` / `dms_test`
- Container name: `dms-test-postgres` (for easy cleanup)

### Test parameterization

Each test file reads `process.env.DMS_TEST_DB` (default: `dms-sqlite`) to select the database config. No other code changes — the adapters and controller already handle both.

For `test-auth.js`, also read `process.env.DMS_AUTH_DB_ENV` (already supported by the server).

### Config files

Create `dms-postgres-test.config.json` and `auth-postgres-test.config.json` pointing at the Docker container.

## Implementation

### Phase 0: Docker lifecycle script — DONE

- [x] Create `tests/postgres-docker.js` — Docker lifecycle helper:
  - `start()` — starts `postgres:17-alpine` container on port 5499
  - `waitReady()` — TCP poll until accepting connections (timeout 30s)
  - `stop()` — stops and removes container
  - `isRunning()` / `hasDocker()` — status checks
  - `resetDb()` — drops and recreates schemas via `docker exec psql`
  - CLI: `node postgres-docker.js start|stop|run|reset`
  - `run` command: start → waitReady → resetDb → run tests with PG env vars → stop (even on failure)

- [x] Create PostgreSQL test configs in `src/db/configs/`:
  - `dms-postgres-test.config.json` — `{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5499, "database": "dms_test", "user": "dms_test", "password": "dms_test" }`
  - `auth-postgres-test.config.json` — `{ "type": "postgres", "role": "auth", "host": "localhost", "port": 5499, "database": "dms_test", "user": "dms_test", "password": "dms_test" }`

### Phase 1: Parameterize existing tests — DONE

- [x] `test-graph.js` — reads `DMS_TEST_DB` env var, passes to `createTestGraph()`
- [x] `test-workflow.js` — reads `DMS_TEST_DB` env var, passes to `createTestGraph()`
- [x] `test-auth.js` — reads `DMS_AUTH_DB_ENV` and `DMS_TEST_DB`/`DMS_DB_ENV`, sets both before server startup; SQLite-only file cleanup guarded by `IS_SQLITE` check
- [x] `test-sqlite.js` — stays SQLite-only (no parameterization needed)
- **Design note**: `test-controller.js` NOT parameterized — it constructs a raw `SqliteAdapter` and runs SQLite-specific SQL (json_patch, datetime('now'), `?` params). This is fundamentally a SQLite adapter test, not a controller-through-abstraction test. The same operations are already covered through Falcor routes in `test-graph.js` and `test-workflow.js`, which ARE parameterized.
- [x] Cleanup logic: SQLite uses file deletion (existing); PostgreSQL gets fresh schemas via `resetDb()` in the Docker runner

### Phase 2: npm scripts + test runner — DONE

- [x] Added npm scripts to `package.json`:
  - `test:pg:start` — `node tests/postgres-docker.js start`
  - `test:pg:stop` — `node tests/postgres-docker.js stop`
  - `test:pg` — `node tests/postgres-docker.js run` (start, run all PG tests, stop even on failure)
  - `test:pg:auth` — `node tests/postgres-docker.js run tests/test-auth.js`
  - `test:all` — `npm test && npm run test:auth && npm run test:pg`
- [x] `postgres-docker.js` `run` command uses try/finally to ensure container is stopped

### Phase 3: Fix PostgreSQL-specific failures — DONE

Two bugs found and fixed:

1. **COUNT bigint as string** — PostgreSQL's `COUNT(1)` returns `bigint` which the `pg` driver serializes as a string (`"3"` !== `3`). Fixed in `dms.controller.js` by adding `.then(rows => rows.map(r => ({ ...r, length: Number(r.length) })))` to both `dataLength` and `filteredDataLength`.

2. **Boolean vs integer in messages** — Auth queries used `deleted = 0`, `viewed = 1`, `deleted = 1` which fails on PostgreSQL boolean columns. Fixed by using `FALSE`/`TRUE` keywords (work in both SQLite and PostgreSQL) in `auth/utils/queries.js` and `auth/handlers/message.js`.

## Verification

- [x] `npm test` — all tests pass against SQLite (regression verified)
- [x] `npm run test:auth` — 103/103 pass against SQLite (regression verified)
- [x] `npm run test:pg` — starts Docker PostgreSQL, runs tests, stops container
- [x] `npm run test:pg` passes all tests that pass on SQLite (graph 8/8, workflow 7/7, auth 103/103)
- [ ] `npm run test:all` — runs both SQLite and PostgreSQL suites (not tested — requires sequential run)
- [x] Container is cleaned up even when tests fail (try/finally in run command)
- [x] Works without Docker installed — SQLite tests work, pg tests error with clear "Docker is not installed" message

## Files

| File | Action |
|------|--------|
| `tests/postgres-docker.js` | Create — Docker lifecycle helper + CLI runner |
| `src/db/configs/dms-postgres-test.config.json` | Create — PostgreSQL DMS test config |
| `src/db/configs/auth-postgres-test.config.json` | Create — PostgreSQL auth test config |
| `tests/test-graph.js` | Modify — parameterize DB selection via `DMS_TEST_DB` |
| `tests/test-workflow.js` | Modify — parameterize DB selection via `DMS_TEST_DB` |
| `tests/test-auth.js` | Modify — parameterize both auth + DMS DB selection |
| `package.json` | Modify — add `test:pg:start`, `test:pg:stop`, `test:pg`, `test:pg:auth`, `test:all` scripts |
| `src/routes/dms/dms.controller.js` | Modify — normalize COUNT bigint to Number in dataLength/filteredDataLength |
| `src/auth/utils/queries.js` | Modify — boolean `0`/`1` → `FALSE`/`TRUE` for cross-DB compat |
| `src/auth/handlers/message.js` | Modify — boolean `0`/`1` → `FALSE`/`TRUE` for cross-DB compat |
