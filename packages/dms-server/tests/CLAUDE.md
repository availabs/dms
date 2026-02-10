# DMS Server Tests

## Philosophy

Tests should catch real bugs, not just exercise code for coverage metrics. Focus on:

1. **Integration tests with real databases** — Use SQLite for fast local tests and PostgreSQL via Docker for cross-DB verification
2. **Test via Falcor routes** — Use the graph harness to call routes like a real client would
3. **Workflow tests** — Simulate real user journeys (create site → add patterns → create pages → add sections)
4. **Auth tests** — Full HTTP integration tests covering all 45 auth endpoints
5. **Regression tests** — Every bug fixed gets a test to prevent recurrence
6. **Boundary tests** — Where data crosses systems (client→server, PostgreSQL↔SQLite differences)

Avoid:
- Mocking everything (you end up testing the mocks, not the code)
- Writing raw SQL in tests when you should test the Falcor routes
- Testing trivial getters/setters
- Tests that pass even when features are broken

## Test Structure

```
tests/
  graph.js              # Test graph harness - call Falcor routes directly
  postgres-docker.js    # Docker PostgreSQL lifecycle (start/stop/run/reset)
  replay.js             # Replay recorded browser requests
  test-sqlite.js        # SQLite adapter compatibility tests
  test-controller.js    # Controller function tests with real SQLite (SQLite-only)
  test-graph.js         # Graph harness sanity tests (SQLite or PostgreSQL)
  test-workflow.js      # Full DMS workflow via Falcor routes (SQLite or PostgreSQL)
  test-auth.js          # Auth system integration tests - 103 tests via HTTP (SQLite or PostgreSQL)
```

## Running Tests

### SQLite (default)

```bash
npm test                  # Run core tests (sqlite, controller, graph, workflow)
npm run test:sqlite       # SQLite adapter only
npm run test:controller   # Controller tests only (SQLite-specific raw SQL)
npm run test:graph        # Graph harness tests
npm run test:workflow     # Full workflow test
npm run test:auth         # Auth integration tests (103 tests)
```

### PostgreSQL (via Docker)

Requires Docker. Spins up a `postgres:17-alpine` container on port 5499, runs tests, tears down.

```bash
npm run test:pg           # Start container, run graph + workflow + auth, stop container
npm run test:pg:auth      # Start container, run auth tests only, stop container
npm run test:pg:start     # Start container (manual control)
npm run test:pg:stop      # Stop and remove container (manual control)
npm run test:all          # Run all SQLite tests, then all PostgreSQL tests
```

The `test:pg` script handles cleanup even on test failure (try/finally). If Docker is not installed, it exits with a clear error message.

### Database selection via environment variables

Tests that support both databases read these env vars (defaulting to SQLite):

| Variable | Default | Used by |
|----------|---------|---------|
| `DMS_TEST_DB` | `dms-sqlite` | test-graph.js, test-workflow.js, test-auth.js |
| `DMS_AUTH_DB_ENV` | `auth-sqlite` | test-auth.js (auth database) |
| `DMS_DB_ENV` | `dms-sqlite` | test-auth.js (DMS database for Falcor /graph) |

Example: run graph tests against PostgreSQL manually (container must be running):

```bash
DMS_TEST_DB=dms-postgres-test node tests/test-graph.js
```

### Which tests run on which databases

| Test file | SQLite | PostgreSQL | Notes |
|-----------|--------|------------|-------|
| test-sqlite.js | Yes | No | Tests the SQLite adapter directly |
| test-controller.js | Yes | No | Raw SQLite SQL (json_patch, etc.) |
| test-graph.js | Yes | Yes | Via `DMS_TEST_DB` env var |
| test-workflow.js | Yes | Yes | Via `DMS_TEST_DB` env var |
| test-auth.js | Yes | Yes | Via `DMS_AUTH_DB_ENV` + `DMS_DB_ENV` env vars |

## Test Graph Harness

The `graph.js` module provides a harness to call Falcor routes directly without HTTP:

```js
const { createTestGraph } = require('./graph');

// Create a test graph — pass database config name
const graph = createTestGraph('dms-sqlite');       // SQLite (default)
const graph = createTestGraph('dms-postgres-test'); // PostgreSQL

// Database info
console.log(graph.dbType); // 'sqlite' or 'postgres'

// GET request - query data
const result = await graph.getAsync([
  ['dms', 'data', 'myapp+mytype', 'length']
]);
console.log(result.jsonGraph.dms.data['myapp+mytype'].length);

// CALL request - create item
const createResult = await graph.callAsync(
  ['dms', 'data', 'create'],
  ['myapp', 'mytype']
);

// CALL request - edit item
await graph.callAsync(
  ['dms', 'data', 'edit'],
  [itemId, { title: 'New Title', count: 42 }]
);

// CALL request - delete items
await graph.callAsync(
  ['dms', 'data', 'delete'],
  ['myapp', 'mytype', id1, id2, id3]
);

// Callback-style API also available
graph.get([paths], (error, result) => { ... });
graph.call(callPath, args, (error, result) => { ... });

// respond() for replaying recorded requests
graph.respond({ queryStringParameters: { method: 'get', paths: '...' } }, callback);
```

## Docker PostgreSQL Helper

The `postgres-docker.js` module manages a disposable PostgreSQL container for testing.

**Container config:**
- Image: `postgres:17-alpine`
- Port: 5499 (host) → 5432 (container)
- Database/user/password: `dms_test`
- Container name: `dms-test-postgres`

**CLI usage:**
```bash
node tests/postgres-docker.js start   # Start container, wait for ready
node tests/postgres-docker.js stop    # Stop and remove container
node tests/postgres-docker.js run     # Start, run all PG tests, stop (even on failure)
node tests/postgres-docker.js run tests/test-auth.js  # Run specific test
node tests/postgres-docker.js reset   # Drop and reinitialize schemas
```

**Programmatic usage:**
```js
const { start, stop, waitReady, resetDb, hasDocker } = require('./postgres-docker');

start();           // docker run ...
await waitReady(); // pg_isready poll (30s timeout, survives PG restart cycle)
resetDb();         // DROP + re-run dms.sql and auth_tables.sql
stop();            // docker stop + rm
```

**Database configs** for the Docker container:
- `src/db/configs/dms-postgres-test.config.json` — DMS tables (role: dms)
- `src/db/configs/auth-postgres-test.config.json` — Auth tables (role: auth)

Both point at `localhost:5499` / `dms_test`.

## Recording & Replaying Browser Requests

To capture real browser interactions for debugging or test generation:

```bash
# Start the server with request logging
DMS_LOG_REQUESTS=1 npm run dev
```

This creates `logs/requests-<timestamp>.jsonl` with one JSON object per line containing:
- `seq` - Request sequence number
- `timestamp` - ISO timestamp
- `method` - HTTP method (GET/POST)
- `body` / `query` - Request parameters (Falcor params in body for POST, query for GET)
- `response` - The full JSON response from the API
- `status` - HTTP status code
- `duration` - Request duration in milliseconds

To replay recorded requests:

```bash
# Replay against test database
node tests/replay.js logs/requests-2026-01-28T12-00-00-000Z.jsonl

# Options via environment variables
DB_NAME=dms-sqlite STOP_ON_ERROR=1 node tests/replay.js <file>
```

## Writing New Tests

### Prefer Falcor Routes Over Raw SQL

**Good** - Test through the Falcor routes like a real client:
```js
const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const graph = createTestGraph(DB_NAME);

// Create via route
const result = await graph.callAsync(['dms', 'data', 'create'], ['myapp', 'mytype']);
const id = Object.keys(result.jsonGraph.dms.data.byId)[0];

// Query via route
const data = await graph.getAsync([['dms', 'data', 'byId', id, 'data']]);
```

**Avoid** - Writing raw SQL in tests (except for adapter/controller unit tests):
```js
// Only do this for low-level adapter tests
await db.query('INSERT INTO data_items...', [...]);
```

### For Bug Fixes (Regression Tests)

When you fix a bug:
1. Write a test that would have caught it
2. Verify the test fails before your fix (or reason about it)
3. Verify it passes after
4. Name it descriptively: `testJsonColumnParsing`, `testParameterReuse`

### For New Features (Workflow Tests)

Simulate how the client actually uses the feature:
1. Use the test graph harness
2. Call routes in the same sequence the client would
3. Verify intermediate and final states
4. Clean up via delete routes

### Test Patterns

**Setup:**
```js
const { createTestGraph } = require('./graph');
const DB_NAME = process.env.DMS_TEST_DB || 'dms-sqlite';
const TEST_APP = 'my-test-' + Date.now();
let graph = null;

async function setup() {
  graph = createTestGraph(DB_NAME);
}
```

**Assertions:**
```js
if (result.jsonGraph?.dms?.data?.byId?.[id]?.app !== TEST_APP) {
  throw new Error(`Expected app=${TEST_APP}, got ${actual}`);
}
```

**Cleanup via delete route:**
```js
await graph.callAsync(['dms', 'data', 'delete'], [TEST_APP, type, ...ids]);
```

## Cross-Database Gotchas

When writing tests that run on both SQLite and PostgreSQL, watch for:

- **COUNT returns string on PostgreSQL** — `pg` driver returns `bigint` as string; the controller normalizes this but raw queries won't
- **Boolean columns** — Use `TRUE`/`FALSE` keywords, not `1`/`0` (PostgreSQL has real booleans, SQLite treats booleans as integers)
- **JSON operators** — PostgreSQL uses `->>` natively; SQLite uses `json_extract()` with the adapter translating `->>` syntax
- **Timestamps** — PostgreSQL returns timezone-aware timestamps; SQLite returns plain strings
- **Type coercion** — PostgreSQL `->>` always returns text; SQLite `->>` can return integers (e.g., `0` instead of `"0"`)

## Databases

**SQLite:** Tests use files in `src/db/data/` (gitignored). Files persist between runs; tests should clean up or be tolerant of existing data. Auth tests delete and recreate `auth.sqlite` (plus `-shm` and `-wal` journal files) on each run.

**PostgreSQL:** The Docker container provides a fresh database. `resetDb()` drops and recreates all schemas from the SQL files before each test run.

## Adding New Test Files

1. Create `test-<name>.js` in this folder
2. Add to `package.json` scripts if needed
3. Read `DMS_TEST_DB` env var to support both databases (default to `'dms-sqlite'`)
4. Use the graph harness for route testing, or import adapters for low-level tests
5. Follow the pattern in existing test files
