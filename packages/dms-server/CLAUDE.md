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

Configs are JSON files in `src/db/configs/`:

```json
// SQLite
{ "type": "sqlite", "role": "dms", "filename": "../data/dms-test.sqlite" }

// PostgreSQL
{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5432, "database": "dms_db", "user": "postgres", "password": "..." }
```

The `role` field (`dms`, `auth`, `dama`) determines which schema init scripts run on first connection.

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
