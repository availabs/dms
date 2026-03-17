# Local-First Sync — Architecture & Execution Flow

This document traces the complete execution flow of the DMS local-first sync engine: what happens when, what hits the server, and where DMS interacts with synced data.

## File Map

```
Client (browser)
  src/dms/packages/dms/src/
    sync/
      index.js          — Public API, initialization orchestrator
      sync-manager.js   — Bootstrap, WebSocket, mutations, push queue
      sync-scope.js     — Registry of which (app, type) pairs are synced locally
      db-client.js      — Postmessage proxy to SQLite WASM worker
      worker.js         — Web Worker running wa-sqlite (IndexedDB-backed)
      yjs-store.js      — Per-item Y.Doc instances for field-level CRDT merge
      use-query.js      — React hook for reactive local queries
      SyncStatus.jsx    — Connection indicator UI
    api/index.js        — dmsDataLoader / dmsDataEditor (sync-aware routing)
    render/spa/dmsSiteFactory.jsx — Wires sync into the app lifecycle

Server (Node/Express)
  src/dms/packages/dms-server/src/
    routes/sync/
      sync.js           — REST endpoints: bootstrap, delta, push
      ws.js             — WebSocket server: change broadcast, Yjs rooms
```

## Local SQLite Schema (browser, via wa-sqlite + IndexedDB)

```sql
data_items (
  id INTEGER PRIMARY KEY,
  app TEXT, type TEXT, data TEXT,  -- data is JSON
  created_at, created_by, updated_at, updated_by
)
-- Index: (app, type)

sync_state (key TEXT PRIMARY KEY, value TEXT)
-- Stores per-scope revisions:
--   'rev:skeleton:{siteType}' → integer (skeleton bootstrap revision)
--   'rev:pattern:{docType}'   → integer (per-pattern revision)
--   'last_revision'           → integer (legacy full-app revision, fallback)

pending_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id, action, app, type, data TEXT, created_at
)
-- Queue of mutations waiting to be pushed to server
```

---

## 1. Initialization

**Trigger:** `VITE_DMS_SYNC=1` env var. Without it, zero sync code is loaded.

### dmsSiteFactory.jsx — DmsSite component mount

```
useEffect →
  dynamic import('../../sync/index.js')  ← keeps sync out of main bundle
    → initSync(app, API_HOST, siteType)  ← siteType enables pattern-scoped sync
    → dynamic import('../../api/index.js')
    → _setSyncAPI(api)                   ← wires sync into data layer
    → setSyncActive(true)                ← enables SyncStatus UI
```

### sync/index.js — initSync(app, apiHost, siteType)

```
1. configure(app, apiHost, siteType)  — store app name, API host, siteType in module state
2. initDB()                           — spawn Web Worker, load wa-sqlite WASM,
                                        open 'dms-sync' IDB database, run schema DDL
3. bootstrapSkeleton()                — fetch site + pattern rows only (see below)
4. connectWS()                        — open WebSocket (see below)
5. return getSyncAPI()                — object with exec, localCreate, localUpdate,
                                        localDelete, isLocal, bootstrapPattern,
                                        isPatternLoaded, onInvalidate, etc.
```

All steps are sequential. A single `_initPromise` prevents double-init.

If no `siteType` is provided, falls back to legacy `bootstrapFull()` (entire app).

---

## 2. Bootstrap — Populating Local Data

### 2a. Skeleton Bootstrap (initial load)

**sync-manager.js — bootstrapSkeleton()**

The skeleton is just the site row + pattern rows (always <20 items). This gives dmsSiteFactory everything it needs to render the nav and route structure.

#### Cold Start

```
getLastRevision('skeleton:{siteType}') → null
  ↓
GET /sync/bootstrap?app={app}&skeleton={siteType}    ← SERVER HIT
  ↓
Server: SELECT * FROM data_items
        WHERE app = $1 AND (type = $2 OR type = $2 || '|pattern')
  ↓
Response: { items: [~10-20 items], revision: N }
  ↓
applyItems(items):
  for each item:
    INSERT OR REPLACE INTO data_items (local SQLite)
    addToScope(app, type)
    initFromData(id, data)
  ↓
setLastRevision(N, 'skeleton:{siteType}')
```

#### Warm Start

Re-seeds sync scope from existing local skeleton data (no server hit needed for skeleton on warm start — pattern deltas handle updates).

### 2b. Pattern Bootstrap (on-demand, per-navigation)

**sync-manager.js — bootstrapPattern(docType)**

Called when the user navigates to a pattern. Each pattern is bootstrapped independently and tracked in `_loadedPatterns` Set.

#### Cold Start (first visit to this pattern)

```
isPatternLoaded(docType) → false
getLastRevision('pattern:{docType}') → null
  ↓
GET /sync/bootstrap?app={app}&pattern={docType}&siteType={siteType}    ← SERVER HIT
  ↓
Server:
  Pattern items: SELECT * FROM data_items
    WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%')
  Skeleton items: SELECT * FROM data_items
    WHERE app = $1 AND (type = $3 OR type = $3 || '|pattern')
  → merge, deduplicate by id, filter out split types
  ↓
Response: { items: [pattern items + skeleton], revision: N }
  ↓
applyItems(items)
setLastRevision(N, 'pattern:{docType}')
_loadedPatterns.add(docType)
  ↓
ws.send({ type: 'subscribe', app, pattern: docType })    ← WS pattern subscription
```

#### Warm Start (returning visit to this pattern)

```
getLastRevision('pattern:{docType}') → N
  ↓
GET /sync/delta?app={app}&pattern={docType}&siteType={siteType}&since={N}    ← SERVER HIT
  ↓
Server: change_log filtered by pattern type conditions + skeleton types
  ↓
applyChanges(changes)
setLastRevision(M, 'pattern:{docType}')
_loadedPatterns.add(docType)
Re-seed scope from local data for this pattern
```

### 2c. On-Demand Bootstrap in dmsDataLoader

The sync intercept in `api/index.js` automatically triggers `bootstrapPattern()` when a type isn't yet in local scope:

```
dmsDataLoader(falcor, config, path) called by React Router loader
  ↓
sync = _getSyncAPI()
  ↓
if sync && action in [list, view, edit]:
  if !isLocal(app, type) && type exists:
    await sync.bootstrapPattern(type)    ← triggers pattern bootstrap transparently
  if isLocal(app, type):
    return loadFromLocalDB(...)          ← LOCAL PATH
  ↓
(fall through to Falcor)                 ← REMOTE PATH
```

This means patterns are bootstrapped lazily — no explicit navigation hook needed.

### 2d. Legacy Full-App Bootstrap (fallback)

If no `siteType` is provided to `initSync`, the system falls back to `bootstrapFull()` which downloads the entire app. This is the pre-pattern-scoped behavior.

### Offline Fallback

If the server is unreachable, bootstrap catches the error and seeds scope from existing local data (if any). The app works offline with whatever was cached.

---

## 3. SQLite Event Loop Protection (server-side)

**sync.js — queryChunked(db, sql, params, chunkSize)**

`better-sqlite3` is synchronous — a single large SELECT blocks the Node.js event loop. The `queryChunked` helper prevents this:

- **PostgreSQL**: query runs normally (async driver, no blocking)
- **SQLite**: query is paginated with `LIMIT/OFFSET` (default 500 rows per chunk), yielding to the event loop via `setImmediate()` between chunks

Applied to all bootstrap and delta queries.

---

## 4. WebSocket Connection

**sync-manager.js — connectWS()**

```
new WebSocket(`${wsHost}/sync/subscribe`)
  ↓
onopen:
  ws.send({ type: 'subscribe', app })               ← app-level subscription
  for each docType in _loadedPatterns:
    ws.send({ type: 'subscribe', app, pattern })     ← pattern subscriptions
  catchUp()
  status → 'connected'
  ↓
onclose:
  status → 'disconnected'
  setTimeout(connectWS, wsRetryDelay)                ← exponential backoff: 500ms → 30s
  wsRetryDelay *= 2
```

### Pattern-scoped WebSocket filtering (server-side)

When a client subscribes with `{ type: 'subscribe', app, pattern }`, the server tracks which patterns each client cares about. On broadcast:

- Clients **with** pattern subscriptions only receive changes for types matching their subscribed patterns (plus skeleton types ending in `|pattern`)
- Clients **without** pattern subscriptions receive all changes (backward compat)

### catchUp() — runs on every reconnect

```
getLastRevision() → N
  ↓
GET /sync/delta?app={app}&since={N}    ← SERVER HIT
  ↓
if changes.length > 0:
  applyChanges(changes)
  invalidate('data_items')             ← triggers re-render
  ↓
setLastRevision(revision)
```

This ensures no changes are missed between disconnect and reconnect.

---

## 5. Receiving Remote Changes (WebSocket)

When another client (or Falcor) modifies data, the server broadcasts:

```
Server: notifyChange(app, { type: 'change', revision, action, item })
  ↓
ws.onmessage receives JSON
  ↓
Echo check: is item.id in pendingItemIds?
  yes → skip applying (we sent this), just update revision
  no  → continue
  ↓
action = 'I' or 'U':
  applyRemote(id, remoteData)          ← Yjs CRDT merge (field-level)
  INSERT OR REPLACE INTO data_items    ← local SQLite write
  ↓
action = 'D':
  DELETE FROM data_items WHERE id = ?
  ↓
setLastRevision(revision)
  ↓
invalidate('data_items')
invalidate('data_items:{app}+{type}')  ← scoped invalidation
  ↓
All listeners fire:
  - useQuery hooks re-run their SQL
  - router.revalidate() triggers React Router loaders
  - dmsDataLoader re-queries local SQLite
  - Components re-render with merged data
```

---

## 6. DMS Data Loading — Where Sync Intercepts

**api/index.js — dmsDataLoader**

The loader runs on every route navigation. When sync is active, it checks local data first:

```
dmsDataLoader(falcor, config, path) called by React Router loader
  ↓
sync = _getSyncAPI()                   ← set during init
action = config action (list/view/edit)
  ↓
if sync && action in [list, view, edit]:
  if !isLocal(app, type) && type:
    await sync.bootstrapPattern(type)  ← on-demand pattern bootstrap
  if isLocal(app, type):
    localResult = loadFromLocalDB(sync, app, type, format, dmsAttrsConfigs)
      ↓
      exec('SELECT * FROM data_items WHERE app = ? AND type = ?')
        ↓
      if rows.length === 0 → return null (fall through to Falcor)
        ↓
      For dms-format attributes (child items like sections):
        parse refs from parent data
        exec('SELECT * FROM data_items WHERE id IN (...)') ← batch child fetch
        attach children to parent item
        ↓
      Flatten data JSON to top-level keys (match processNewData shape)
      return formatted items
    ↓
    if localResult !== null → return localResult    ← LOCAL PATH: no server hit
  ↓
(fall through to Falcor network fetch)              ← REMOTE PATH: hits server
```

**Key insight:** Only types registered in sync scope are intercepted. Admin patterns, datasets, and any unsynced types go through Falcor as usual.

---

## 7. DMS Data Editing — Where Sync Intercepts

**api/index.js — dmsDataEditor**

When a user creates/updates/deletes content:

```
dmsDataEditor(falcor, config, data, requestType) called by save/delete action
  ↓
sync = _getSyncAPI()
  ↓
if sync && isLocal(app, type) && requestType !== 'updateType':

  --- Handle dms-format children first (e.g., sections) ---
  for each dms-format attribute:
    for each child to update:
      if has existing id → sync.localUpdate(childId, childData)
      else              → sync.localCreate(childApp, childType, childData)
    collect refs [{ref, id}, ...]
    merge refs back into parent data

  --- Handle parent item ---
  if requestType = 'delete':
    sync.localDelete(id)                    ← local SQLite delete + queue push
  else if id exists:
    sync.localUpdate(id, parentData)        ← Yjs merge + local write + queue
  else:
    sync.localCreate(app, type, parentData) ← local insert + queue

  invalidate scoped + global
  return                                    ← LOCAL PATH: optimistic, no wait

(fall through to Falcor calls if not synced)  ← REMOTE PATH
```

---

## 8. Local Mutations — The Push Queue

When `localCreate`, `localUpdate`, or `localDelete` is called:

### Step 1: Write locally (instant, optimistic)

```
localCreate(app, type, data):
  INSERT INTO data_items → get temp rowid
  INSERT INTO pending_mutations (item_id, action='I', app, type, data)
  invalidate('data_items:{app}+{type}')
  → pushMutation('I', item)

localUpdate(id, data):
  applyLocal(id, data)     ← Yjs merge: current doc + new fields
  UPDATE data_items SET data = merged WHERE id = ?
  INSERT INTO pending_mutations (item_id, action='U', ...)
  invalidate(...)
  → pushMutation('U', item)

localDelete(id):
  DELETE FROM data_items WHERE id = ?
  INSERT INTO pending_mutations (item_id, action='D', ...)
  invalidate(...)
  → pushMutation('D', item)
```

### Step 2: Push to server (async, retried)

```
pushMutation(action, item):
  status → 'syncing'
  pendingItemIds.add(item.id)          ← echo suppression
  ↓
  POST /sync/push                       ← SERVER HIT
    body: { action, item }
  ↓
  Server (inside transaction):
    action = I → INSERT INTO data_items (ON CONFLICT UPDATE for idempotent retry)
    action = U → UPDATE data_items SET data = jsonMerge(data, $1)
    action = D → DELETE FROM data_items
    → INSERT INTO change_log → gets new revision
    → COMMIT
    → notifyChange(app, { type:'change', revision, action, item })  ← WS broadcast
  ↓
  Response: { item: serverItem, revision: N }
  ↓
  If create & server assigned new ID (tempId → realId):
    UPDATE data_items SET id = realId WHERE id = tempId  (local SQLite)
    UPDATE pending_mutations SET item_id = realId WHERE item_id = tempId
  ↓
  removePending(itemId, action)
    DELETE FROM pending_mutations WHERE item_id = ? AND action = ?
    if no more pending for this item → pendingItemIds.delete(id)
  ↓
  setLastRevision(N)
  if pending_mutations empty → status → 'connected'
```

### Step 3: Retry on failure

```
pushMutation fails (network error, server down):
  console.warn('[sync] push failed (will retry)')
  retryFlush() → setTimeout(flushPending, 500)
    ↓
  flushPending():
    SELECT * FROM pending_mutations ORDER BY id ASC
    for each → pushMutation(action, item)   ← retry in order
```

Mutations survive page reloads because `pending_mutations` is in SQLite (IndexedDB-backed). On warm start, `flushPending()` retries anything left over.

---

## 9. Yjs CRDT Merge — Conflict Resolution

**yjs-store.js**

Each item gets a Y.Doc with a Y.Map for its `data` fields. This enables field-level merge without last-write-wins at the document level.

```
applyLocal(id, newData):
  doc = getDoc(id)           ← singleton per item
  ymap = doc.getMap('data')
  doc.transact(() => {
    for each key in newData:
      ymap.set(key, value)
  })
  return materialized object

applyRemote(id, remoteData):
  doc = getDoc(id)
  ymap = doc.getMap('data')
  doc.transact(() => {
    for each key in remoteData:
      if ymap.get(key) !== value → ymap.set(key, value)
    for each key in ymap NOT in remoteData:
      ymap.delete(key)          ← tombstone handling
  })
  return materialized object
```

Example conflict resolution:
```
Client A: updates { title: "Hello" }
Client B: updates { body: "World" }
Both push to server → both apply via Yjs
Result on both: { title: "Hello", body: "World" }  ← no data lost
```

---

## 10. Invalidation & Re-rendering

The invalidation system is how sync changes propagate to React components.

**Two scopes:**
- `'data_items'` — global, everything re-queries
- `'data_items:{app}+{type}'` — type-scoped, only matching queries re-run

**Producers (fire invalidation):**
- `bootstrapSkeleton()` after applying items → `invalidate('data_items')`
- `bootstrapPattern()` after applying items → `invalidate('data_items')`
- WebSocket `change` message → `invalidate('data_items')` + `invalidate('data_items:{app}+{type}')`
- `localCreate/Update/Delete` → `invalidate('data_items')` + scoped

**Consumers (react to invalidation):**
- `useQuery(sql, params, deps, scope)` hook — re-runs SQL when scope matches
- `router.revalidate()` — wired in dmsSiteFactory, triggers React Router to re-run all loaders
- dmsDataLoader re-queries local SQLite → components get fresh data

---

## 11. Complete Server Hit Summary

| When | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| Init (skeleton) | `/sync/bootstrap?app=X&skeleton=SITE_TYPE` | GET | Download site + pattern rows (~10-20 items) |
| Navigate to pattern | `/sync/bootstrap?app=X&pattern=DOC_TYPE&siteType=Y` | GET | Download pattern items + skeleton |
| Warm pattern revisit | `/sync/delta?app=X&pattern=DOC_TYPE&siteType=Y&since=N` | GET | Incremental changes for this pattern |
| WS connect | `/sync/subscribe` | WS | Subscribe to real-time changes |
| WS reconnect | `/sync/delta?app=X&since=N` | GET | Catch up on missed changes |
| Local create | `/sync/push` | POST | `{ action: 'I', item }` |
| Local update | `/sync/push` | POST | `{ action: 'U', item }` |
| Local delete | `/sync/push` | POST | `{ action: 'D', item }` |
| Legacy cold start | `/sync/bootstrap?app=X` | GET | Download ALL items (fallback, no siteType) |
| Legacy warm start | `/sync/delta?app=X&since=N` | GET | Incremental changes for entire app |

**Not hit when sync is active:**
- Falcor `GET /graph` for synced types (reads come from local SQLite)
- Falcor `POST /graph` for synced mutations (writes go through /sync/push)

**Still hit (not synced):**
- Falcor for admin pattern operations
- Falcor for dataset/UDA queries
- Falcor for any type not in sync scope

---

## 12. Offline Behavior

```
Network drops
  ↓
WebSocket closes → status: 'disconnected'
  ↓
Reads: continue from local SQLite (no change)
  ↓
Writes: localCreate/Update/Delete still work
  → data written to local SQLite immediately (UI updates)
  → mutation queued in pending_mutations
  → pushMutation fails → retryFlush (500ms loop, gives up after first failure per flush)
  ↓
Network returns
  ↓
WebSocket reconnects (exponential backoff)
  → re-subscribes to all loaded patterns
  → catchUp() fetches missed changes
  → flushPending() retries all queued mutations in order
  ↓
Everything converges
```

---

## 13. What Gets Synced vs What Doesn't

**Synced (served from local SQLite):**
- Site configuration items (via skeleton bootstrap)
- Pattern definitions (via skeleton bootstrap)
- Page content (e.g., `docs-page` type) — loaded on-demand per pattern
- Section content (e.g., `docs-page|cms-section` type) — loaded with pattern
- Source/view metadata — loaded with pattern
- Any type returned by bootstrap that's in `data_items`

**Not synced (still goes through Falcor):**
- Split-table types (dataset row data like `traffic_counts-1`) — filtered out by server bootstrap
- Admin operations that use `updateType` request type
- UDA queries (uda.* routes)
- External data sources (pgEnv-based)

The boundary is controlled by `sync-scope.js`: only types explicitly added via `addToScope()` during bootstrap are intercepted. Everything else passes through transparently.

---

## 14. Sync Boundary: Pattern-Scoped Architecture

The sync boundary is the **pattern** (identified by `doc_type`), not the entire app.

### Why pattern-scoped

- A large app (e.g., `mitigat-ny-prod`) can have ~90 patterns and close to 1M rows
- The client only renders one pattern at a time
- Pattern-scoped sync loads 20-500 items instead of the entire app
- Prevents SQLite event loop blocking on the server (smaller queries)

### How it works

```
1. initSync() → bootstrapSkeleton()     ← site + pattern rows only (~10-20 items)
2. User navigates to Pattern A          ← dmsDataLoader calls bootstrapPattern('doc-type-a')
3. User navigates to Pattern B          ← bootstrapPattern('doc-type-b')
4. User returns to Pattern A            ← isPatternLoaded() → true, delta sync only
5. Each pattern tracks its own revision in sync_state
6. WebSocket filters changes by subscribed patterns
```

### Type matching

A pattern's items all share a type prefix:
```
doc_type                  → pages
doc_type|cms-section      → sections
doc_type|source           → dataset sources
doc_type|source|view      → dataset views
```

The query `type = $1 OR type LIKE $1 || '|%'` captures all items for a pattern.
