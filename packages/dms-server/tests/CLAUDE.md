# DMS Server Tests

## Philosophy

Tests should catch real bugs, not just exercise code for coverage metrics. Focus on:

1. **Integration tests with real databases** — Use SQLite for fast, isolated tests that verify actual SQL behavior
2. **Test via Falcor routes** — Use the graph harness to call routes like a real client would
3. **Workflow tests** — Simulate real user journeys (create site → add patterns → create pages → add sections)
4. **Regression tests** — Every bug fixed gets a test to prevent recurrence
5. **Boundary tests** — Where data crosses systems (client→server, PostgreSQL↔SQLite differences)

Avoid:
- Mocking everything (you end up testing the mocks, not the code)
- Writing raw SQL in tests when you should test the Falcor routes
- Testing trivial getters/setters
- Tests that pass even when features are broken

## Test Structure

```
tests/
  graph.js              # Test graph harness - call Falcor routes directly
  replay.js             # Replay recorded browser requests
  test-sqlite.js        # SQLite adapter compatibility tests
  test-controller.js    # Controller function tests with real SQLite
  test-graph.js         # Graph harness sanity tests
  test-workflow.js      # Full DMS workflow via Falcor routes
```

## Running Tests

```bash
npm test                  # Run all tests
npm run test:sqlite       # SQLite adapter only
npm run test:controller   # Controller tests only
npm run test:graph        # Graph harness tests
npm run test:workflow     # Full workflow test
```

## Test Graph Harness

The `graph.js` module provides a harness to call Falcor routes directly without HTTP:

```js
const { createTestGraph } = require('./graph');

// Create a test graph (uses SQLite by default)
const graph = createTestGraph('dms-sqlite');

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
const graph = createTestGraph('dms-sqlite');

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
const TEST_APP = 'my-test-' + Date.now();
let graph = null;

async function setup() {
  graph = createTestGraph('dms-sqlite');
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

## Database

Tests use `src/db/data/dms-test.sqlite`. This file is gitignored. Each test run may leave data behind; tests should clean up after themselves or be tolerant of existing data.

## Adding New Test Files

1. Create `test-<name>.js` in this folder
2. Add to `package.json` scripts if needed
3. Use the graph harness for route testing, or import adapters for low-level tests
4. Follow the pattern in existing test files
