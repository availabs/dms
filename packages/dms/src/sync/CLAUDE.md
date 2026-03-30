# DMS Sync Module

Local-first sync system for DMS. Maintains a browser-side SQLite database (via wa-sqlite WASM in a Web Worker) that mirrors server data, enabling offline reads and optimistic writes. Opt-in via `VITE_DMS_SYNC=1` environment variable. When disabled, zero sync code is loaded (dynamic imports only).

## Files

### `index.js`
Public API entry point. Exports `initSync(app, apiHost, siteType)` which orchestrates startup: init SQLite worker, bootstrap skeleton, connect WebSocket. Also exports `isReady()`, `getSyncAPI()`, and re-exports key functions from other modules for direct import.

### `sync-manager.js`
Core orchestrator. Handles:
- **Bootstrap**: `bootstrapSkeleton()` loads site + pattern rows (<20 items, always re-fetched). `bootstrapPattern(docType)` loads a pattern's data on-demand (pages, sections, sources, views).
- **Delta sync**: Warm starts fetch only changes since last revision via `/sync/delta`. If delta exceeds `STALE_DELTA_THRESHOLD` (1000 changes), discards it and does a full re-bootstrap.
- **WebSocket**: `connectWS()` subscribes per-app and per-pattern. Receives real-time `change` messages, applies via Yjs merge. Reconnects with exponential backoff (500ms to 30s).
- **Local writes**: `localCreate()`, `localUpdate()`, `localDelete()` write to local SQLite, queue in `pending_mutations`, and push to server via `/sync/push`. Creates push to server first to get real IDs; falls back to optimistic local write when offline.
- **Batch mode**: `beginBatch()`/`endBatch()` suppress invalidation during multi-step saves (e.g., parent + children). Single invalidation fires on `endBatch()`.
- **Collab room tracking**: `registerCollabRoom()`/`unregisterCollabRoom()`/`updateCollabPeers()` track active collaborative editing sessions and peer counts.
- **Error recovery**: `resetAndRebootstrap()` drops and recreates local SQLite tables, clears in-memory state, re-bootstraps from server.
- **Status**: `onStatusChange(fn)` / `getStatus()` — values: `connected`, `syncing`, `disconnected`, `recovering`, `error`.

Key exports: `configure`, `bootstrapSkeleton`, `bootstrapPattern`, `isPatternLoaded`, `connectWS`, `localCreate`, `localUpdate`, `localDelete`, `beginBatch`, `endBatch`, `onInvalidate`, `onStatusChange`, `getStatus`, `getWS`, `onWSChange`, `getPendingCount`, `isCollabReady`, `registerCollabRoom`, `unregisterCollabRoom`, `updateCollabPeers`, `getCollabInfo`, `onCollabChange`, `resetAndRebootstrap`.

### `db-client.js`
Proxy to the SQLite Web Worker via `postMessage`. Exports `initDB()`, `exec(sql, params)`, `resetDB()`, `execMany(statements)`. All calls go through promise-based message passing with auto-incrementing message IDs.

### `worker.js`
Web Worker running wa-sqlite with `IDBBatchAtomicVFS` (IndexedDB-backed persistence). Creates three tables: `data_items` (synced content), `sync_state` (revision tracking per scope), `pending_mutations` (offline write queue). All operations serialized through a promise queue. Supports `init`, `exec`, and `reset` message types.

### `sync-scope.js`
Registry of `(app, type)` pairs that are synced locally. Seeded at bootstrap from server response. `isLocal(app, type)` is the routing decision: if true, reads serve from client SQLite instead of Falcor. Key exports: `addToScope`, `isLocal`, `getSyncedTypes`, `clearScope`.

### `use-query.js`
React hook `useQuery(sql, params, deps, scope)` that runs SQL against local SQLite and auto-reruns when sync invalidation fires. Supports scoped invalidation: if `scope` is provided (e.g., `data_items:myapp+docs-page`), only reruns when the invalidated scope matches or is a parent.

### `yjs-store.js`
Per-item Yjs document store for field-level merge. Each DMS item gets a `Y.Doc` with a `YMap('data')`. `applyLocal(id, newData)` merges local edits, `applyRemote(id, remoteData)` merges server/WS changes (adds new keys, updates changed keys, deletes removed keys). `initFromData(id, data)` seeds a doc from existing data (only if empty). `getData(id)` materializes current state.

### `SyncStatus.jsx`
Floating UI indicator (bottom-right corner) showing connection status (green/yellow/red dot), pending mutation count, and active collab peer count.

## Architecture

### Type-Based Routing (Sync Scope)
The sync scope registry (`sync-scope.js`) determines whether a given `(app, type)` pair should be served from local SQLite or fall through to Falcor. At bootstrap, all types present in the server response are registered. When `api/index.js` handles a read, it checks `sync.isLocal(app, type)` — if true, it queries local SQLite via `loadFromLocalDB()` instead of making Falcor requests.

### Two-Phase Bootstrap
1. **Skeleton** (`bootstrapSkeleton`): Always runs at init. Fetches site row + pattern rows from `/sync/bootstrap?skeleton=...`. Small payload (<20 items), always re-fetched (no delta). Cleans up stale local items not in server response.
2. **Pattern** (`bootstrapPattern`): On-demand when user navigates to a pattern. Cold start fetches full snapshot from `/sync/bootstrap?pattern=...`. Warm start uses delta from `/sync/delta?pattern=...&since=...`. Subscribes the WebSocket to the pattern channel.

### Delta Sync
Revisions are tracked per scope in `sync_state` table (keys like `rev:skeleton:site-type`, `rev:pattern:docs-page`). Delta responses exceeding `STALE_DELTA_THRESHOLD` (1000) trigger a full re-bootstrap to avoid slow incremental application.

### WebSocket
Connects to `/sync/subscribe` (WS). Subscribes per-app and per-loaded-pattern. Receives `change` messages with action (`I`/`U`/`D`), applies to local SQLite via Yjs merge, fires invalidation. On reconnect, does a `catchUp()` delta fetch. Exponential backoff on disconnect (500ms-30s).

## Key Design Decisions

### Echo Suppression (`pendingItemIds`)
When a local write is pushed to the server, the server broadcasts it back via WebSocket. The `pendingItemIds` Set tracks IDs with in-flight mutations. WS messages for these IDs are skipped to prevent double-application. Cleared when all pending mutations for an item are flushed, or after a 2-second timeout for server-first creates.

### `_dirty` Flag
In `api/index.js`, dms-format child items carry a `_dirty` flag. During sync writes, only children marked `_dirty: true` trigger `localUpdate()`; clean children are skipped. The flag is stripped before writing.

### Batch Mode
Multi-step saves (parent item + dms-format children) use `beginBatch()`/`endBatch()` to suppress per-write invalidation. A single invalidation fires at the end, preventing unnecessary re-renders during intermediate states.

### Stale Delta Threshold
If a delta response contains more than 1000 changes, it is discarded and a full re-bootstrap is performed instead. This avoids slow sequential application of large change sets.

### Error Recovery
`resetAndRebootstrap()` provides a nuclear recovery option: drops all local SQLite tables, clears sync scope and loaded patterns, re-creates schema, and re-bootstraps from the server. Exposed in the public API for admin use.

## Integration Points

### `api/index.js`
- **`_setSyncAPI(api)` / `_getSyncAPI()`**: Sync API reference stored on `globalThis.__dmsSyncAPI` to avoid Vite module instance duplication. Set by `dmsSiteFactory.jsx` after init.
- **`dmsDataLoader`**: Intercepts `list`/`view`/`edit` actions. If type not yet in scope, calls `sync.bootstrapPattern(type)`. If `sync.isLocal(app, type)`, runs `loadFromLocalDB()` which queries local SQLite and resolves dms-format child refs locally.
- **`dmsDataEditor`**: Intercepts creates/updates/deletes. Uses `sync.beginBatch()`, processes dms-format children via `sync.localCreate()`/`localUpdate()` (only if `_dirty`), handles parent item, then `sync.endBatch()`.

### `render/spa/dmsSiteFactory.jsx`
- Gates sync on `VITE_DMS_SYNC === '1'`.
- Dynamic-imports `sync/index.js` and calls `initSync(app, API_HOST, siteType)`.
- Wires sync API into `api/index.js` via `_setSyncAPI()`.
- Subscribes to `onInvalidate` to revalidate React Router (debounced 150ms).
- Lazy-loads `SyncStatus.jsx` when sync is active.

### Collaborative Editing (`ui/components/lexical/editor/collaboration.js`)
- `DmsCollabProvider` class bridges Lexical's `CollaborationPlugin` to the DMS sync WebSocket.
- Per-section rooms: `join-room`/`leave-room` messages, Yjs binary updates sent as base64 JSON.
- Awareness protocol for cursor/presence updates.
- Uses `registerCollabRoom()`/`unregisterCollabRoom()`/`updateCollabPeers()` from sync-manager for peer tracking.
- `createCollabProvider(id, yjsDocMap)` is the factory passed to Lexical's `providerFactory` prop.
- Sync protocol: handles `yjs-sync-step1`/`yjs-sync-step2` for initial document bootstrapping, with a 1-second timeout fallback for new/empty docs.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_DMS_SYNC` | Set to `1` to enable sync. Without it, no sync code is loaded. |

## Commands

None — this is a client-side module. No CLI commands.
