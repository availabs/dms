# Auth Database Init Race Condition

## Objective

Fix "no such table: users" error that occurs when the server receives requests before auth database initialization completes.

## Root Cause

`getDb()` in `src/db/index.js` is **synchronous** — it returns the adapter immediately and kicks off initialization via fire-and-forget `.then()`:

```js
// Line 196-201 — init is NOT awaited
if (config.role === "auth") {
  initAuth(databases[pgEnv]).then(() => {
    console.log("auth init", pgEnv);
  }).catch(err => { ... });
}

return databases[pgEnv]; // returns before init completes
```

The server startup in `src/index.js` calls `getDb()` synchronously, registers routes, and starts listening — all before the async init finishes. The first incoming request hits auth routes that query the `users` table, which doesn't exist yet.

This affects **all** database roles (auth, dms, dama), not just auth. Auth is most visible because it's queried on virtually every request via JWT middleware.

### Secondary Issue: Single File, Multiple Configs

When using one SQLite file for both auth and DMS, the user needs two config files with different `role` values pointing to the same filename. `getDb()` caches by env name (not filename), creating two separate `better-sqlite3` instances for the same file. This works but is wasteful and unintuitive — there's no way to say "this database serves both roles."

## Proposed Fix

### Phase 1: Await init before listening — DONE

Make `getDb()` track its init promise. Add a mechanism for the server to await all pending inits before accepting requests.

**`src/db/index.js` changes:**

1. Store init promises in a registry:
```js
const initPromises = [];

function getDb(pgEnv) {
  // ... existing cache + adapter creation ...

  // Track init promise instead of fire-and-forget
  const initPromise = runInit(databases[pgEnv], config, pgEnv);
  initPromises.push(initPromise);

  return databases[pgEnv];
}

// New export: wait for all pending inits
async function awaitReady() {
  await Promise.all(initPromises);
}
```

2. Export `awaitReady` from `db/index.js`

**`src/index.js` changes:**

Wrap `app.listen()` in an async IIFE that awaits database readiness:

```js
const { getDb, awaitReady } = require('./db');

// ... route registration (unchanged) ...

(async () => {
  await awaitReady();
  app.listen(PORT, () => {
    console.log(`DMS Server running on port ${PORT}`);
  });
})();
```

### Phase 2: Multi-role config support — DONE

Allow a single config to serve multiple roles:

```json
{ "type": "sqlite", "role": ["dms", "auth"], "filename": "../data/app.sqlite" }
```

**`src/db/index.js` changes:**

In `getDb()`, normalize `config.role` to an array and run all applicable inits:

```js
const roles = Array.isArray(config.role) ? config.role : [config.role];
if (roles.includes("auth")) initPromises.push(initAuth(...));
if (roles.includes("dms"))  initPromises.push(initDms(...));
if (roles.includes("dama")) initPromises.push(initDama(...));
```

This lets users point `DMS_DB_ENV` and `DMS_AUTH_DB_ENV` at the same config name, or use a single config with both roles.

## Files

| File | Action |
|------|--------|
| `src/db/index.js` | Modify — track init promises, add `awaitReady()`, multi-role support |
| `src/index.js` | Modify — await `awaitReady()` before `app.listen()` |

## Testing

- [ ] Server with separate auth + DMS SQLite files → both init before first request
- [ ] Server with single SQLite file, multi-role config → tables for both roles created
- [x] `npm test` — existing tests still pass (they use `getDb()` directly, not `awaitReady`)
- [x] `npm run test:auth` — 103 auth tests pass
- [x] `npm run test:uda` — 21 UDA tests pass
