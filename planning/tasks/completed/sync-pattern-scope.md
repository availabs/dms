# Pattern-Scoped Sync + SQLite Event Loop Fix

## Objective

Fix two critical sync issues:

1. **SQLite event loop blocking** — The `/sync/bootstrap` endpoint runs `SELECT * FROM data_items WHERE app = $1` synchronously via `better-sqlite3`, blocking the Node.js event loop for the entire duration. For large apps (e.g., `mitigat-ny-prod` with ~90 patterns and tens of thousands of items), this freezes the server — no other HTTP requests, timers, or WebSocket pings can execute. PostgreSQL doesn't have this problem because its driver is async.

2. **App-level sync is too coarse** — The current sync boundary is the entire `app`, which can contain close to 1 million rows across all patterns. The client only ever renders one pattern at a time, so syncing the whole app is wasteful and causes the SQLite blocking problem. The sync boundary should be the **pattern** (identified by `doc_type`), which typically contains 20–500 items.

## Current Architecture

### Server (`src/routes/sync/sync.js`)
- `GET /sync/bootstrap?app=X` — fetches ALL `data_items` for an app, filters out split types
- `GET /sync/delta?app=X&since=N` — fetches ALL `change_log` entries for an app since revision N
- `POST /sync/push` — writes a single mutation + change_log entry
- WebSocket broadcasts scoped by `app`

### Client (`src/sync/sync-manager.js`)
- `configure(app, apiHost)` — sets app scope
- `bootstrap()` — fetches full app snapshot OR delta, writes to client SQLite
- `connectWS()` — subscribes to app-level WebSocket channel
- All operations scoped by `app` only

### Data Model: How patterns relate to types
```
Site:     app=myapp  type=my-site-type
  └─ Pattern:  app=myapp  type=my-site-type|pattern
       ├─ Page:     app=myapp  type={doc_type}
       │   └─ Section: app=myapp  type={doc_type}|cms-section
       └─ Source:   app=myapp  type={doc_type}|source
           └─ View:    app=myapp  type={doc_type}|source|view
```

A pattern's `doc_type` is stored in its data JSON. All child items (pages, sections, sources, views) have types that start with `{doc_type}` or `{doc_type}|...`. So to sync a pattern's items, the query is:

```sql
SELECT * FROM data_items WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%')
```

Where `$2` is the pattern's `doc_type`.

### What the client knows
- `dmsConfig.format.app` — the app name
- `dmsConfig.format.type` — the site type
- The current pattern's `doc_type` — available from the pattern data loaded at navigation time
- The site row itself (type = `siteType`) and pattern rows (type = `siteType|pattern`) are needed by all patterns — these are the "site skeleton"

## Proposed Changes

### Phase 1: Fix SQLite event loop blocking (server-side) — DONE

**Goal**: Prevent the bootstrap query from freezing the server when using SQLite.

**Approach**: Use chunked/paginated queries with event loop yielding between chunks.

**File**: `packages/dms-server/src/routes/sync/sync.js`

Changes:
- [x] Added `queryChunked(db, sql, params, chunkSize)` helper function that:
  - For PostgreSQL: runs the query normally (async driver, no blocking)
  - For SQLite: uses `LIMIT/OFFSET` pagination, yielding control via `setImmediate()` between chunks
- [x] Applied `queryChunked` to bootstrap endpoint (both type-scoped and full-app paths)
- [x] Applied `queryChunked` to delta endpoint (both type-scoped and full-app paths)
- [x] Default chunk size: 500 rows

### Phase 2: Pattern-scoped bootstrap (server-side) — DONE

**Goal**: Support bootstrapping by pattern instead of entire app.

**File**: `packages/dms-server/src/routes/sync/sync.js`

Changes to bootstrap endpoint:
- [x] Added `pattern` query parameter: `GET /sync/bootstrap?app=X&pattern=DOC_TYPE&siteType=Y`
- [x] When `pattern` is provided: fetches pattern-specific items (`type = doc_type OR type LIKE doc_type || '|%'`), plus site skeleton if `siteType` is also provided
- [x] When `pattern` is absent: existing behavior (full app bootstrap) — backward compatible
- [x] Same chunking from Phase 1 applies

Changes to delta endpoint:
- [x] Added `pattern` query parameter: `GET /sync/delta?app=X&pattern=DOC_TYPE&siteType=Y&since=N`
- [x] When `pattern` is provided, filter change_log by the same type conditions, plus skeleton if siteType given
- [x] When absent: existing behavior

Changes to WebSocket (`packages/dms-server/src/routes/sync/ws.js`):
- [x] Support pattern-scoped subscriptions: `{ type: 'subscribe', app, pattern }`
- [x] `notifyChange` filters by pattern — only sends changes matching a client's subscribed patterns
- [x] Types ending in `|pattern` (skeleton rows) always pass through
- [x] Clients without pattern subscriptions get all changes (backward compat)
- [x] Pattern subscriptions cleaned up on connection close

### Phase 3: Pattern-scoped sync (client-side) — DONE

**Goal**: Client bootstraps per-pattern and tracks which patterns are loaded.

**File**: `packages/dms/src/sync/sync-manager.js`
- [x] Added `_siteType` and `_loadedPatterns` state
- [x] `configure()` now accepts `siteType` parameter
- [x] Added `bootstrapSkeleton()` — loads only site + pattern rows, very fast (<20 items)
- [x] Added `bootstrapPattern(docType)` — loads a specific pattern's data on demand
  - Sends `GET /sync/bootstrap?app=X&pattern=DOC_TYPE&siteType=Y`
  - Tracks per-pattern last_revision in `sync_state` table (key = `rev:pattern:DOC_TYPE`)
  - On warm start, does delta for that pattern only
  - Subscribes WebSocket to the pattern
- [x] Added `isPatternLoaded(docType)` check
- [x] `getLastRevision`/`setLastRevision` now accept optional `scope` parameter for per-pattern revision tracking
- [x] `connectWS` re-subscribes to all loaded patterns on reconnect
- [x] Kept `bootstrapFull()` as legacy fallback (used when no siteType provided)
- [x] Moved `_DEV` to module-level constant (was duplicated in bootstrap)

**File**: `packages/dms/src/sync/sync-scope.js`
- No changes needed — `addToScope(app, type)` / `isLocal(app, type)` work at the type level

**File**: `packages/dms/src/sync/index.js`
- [x] `initSync(app, apiHost, siteType)` now accepts `siteType` parameter
- [x] Uses `bootstrapSkeleton()` instead of full app `bootstrap()`
- [x] Exports `bootstrapPattern` and `isPatternLoaded` in `getSyncAPI()` and re-exports

**File**: `packages/dms/src/render/spa/dmsSiteFactory.jsx`
- [x] Passes `siteType` (from `dmsConfig.format.type || dmsConfig.type`) to `initSync`

**File**: `packages/dms/src/api/index.js`
- [x] Sync intercept now triggers `bootstrapPattern(type)` on-demand when a type isn't yet in local scope
- [x] Pattern bootstrap is transparent to the loader — first load triggers bootstrap, subsequent loads use delta

### Phase 4: Site skeleton bootstrap — DONE (merged into Phase 3)

**Goal**: The initial sync loads only the site structure (site + patterns), which is always small (~10-20 items).

- [x] Server: `GET /sync/bootstrap?app=X&skeleton=SITE_TYPE` returns only site + pattern rows
- [x] Client: `bootstrapSkeleton()` uses skeleton endpoint initially
- [x] Pattern content loads on demand via `bootstrapPattern()` when user navigates

## Files Changed

### Server
- `packages/dms-server/src/routes/sync/sync.js` — `queryChunked` helper, `pattern`/`skeleton`/`siteType` query params on bootstrap and delta endpoints
- `packages/dms-server/src/routes/sync/ws.js` — pattern-scoped subscriptions, filtered `notifyChange` broadcasting

### Client
- `packages/dms/src/sync/sync-manager.js` — `bootstrapSkeleton()`, `bootstrapPattern()`, `isPatternLoaded()`, per-pattern revision tracking, pattern WS subscriptions
- `packages/dms/src/sync/index.js` — `initSync` accepts `siteType`, exports `bootstrapPattern`/`isPatternLoaded`
- `packages/dms/src/render/spa/dmsSiteFactory.jsx` — passes `siteType` to `initSync`
- `packages/dms/src/api/index.js` — on-demand `bootstrapPattern` in sync intercept

## Testing Checklist

### Phase 1: SQLite event loop fix
- [ ] Server remains responsive during bootstrap with SQLite backend
- [ ] Large app bootstrap completes without freezing other requests
- [ ] Sync stats entries appear in logs during SQLite bootstrap
- [ ] PostgreSQL behavior unchanged (still uses single async query)

### Phase 2: Pattern-scoped server
- [ ] `GET /sync/bootstrap?app=X&pattern=DOC_TYPE` returns only pattern-related items
- [ ] `GET /sync/bootstrap?app=X&skeleton=SITE_TYPE` returns only site + pattern rows
- [ ] `GET /sync/delta?app=X&pattern=DOC_TYPE&since=N` returns only pattern-related changes
- [ ] Full app bootstrap still works when `pattern` param omitted
- [ ] WebSocket pattern subscription only receives relevant changes

### Phase 3: Pattern-scoped client
- [ ] Initial page load bootstraps only site skeleton
- [ ] Navigating to a pattern triggers pattern bootstrap
- [ ] Second visit to same pattern uses delta sync (not re-bootstrap)
- [ ] Navigating between patterns accumulates synced types
- [ ] WebSocket receives changes only for loaded patterns
- [ ] Offline mode works with previously loaded patterns

### Phase 4: Integration
- [ ] Full workflow: load site → navigate to pages pattern → edit page → see sync
- [ ] Works with both SQLite and PostgreSQL backends
- [ ] Without `VITE_DMS_SYNC=1`: app unchanged, no sync code loaded

## Implementation Order

1. **Phase 1** (SQLite fix) — highest priority, unblocks SQLite usage with sync
2. **Phase 4** (skeleton bootstrap) — enables fast initial load
3. **Phase 2** (pattern-scoped server) — server support for pattern queries
4. **Phase 3** (pattern-scoped client) — client integration

Phases 2–4 can be implemented together since they're interdependent, but Phase 1 is standalone and should be done first.
