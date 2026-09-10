# DMS Sync Module

Local-first sync system for DMS. Maintains a browser-side IndexedDB mirror of server data, enabling offline reads and optimistic writes. Opt-in via `VITE_DMS_SYNC=1` environment variable. When disabled, zero sync code is loaded (dynamic imports only).

**Storage**: as of `sync-replace-sqlite-with-indexeddb.md`, this module talks to IndexedDB directly — there is no SQL engine involved. It previously ran `wa-sqlite` (SQLite compiled to WASM) in a Web Worker, persisted via `IDBBatchAtomicVFS`; that was itself backed by IndexedDB, so this change removes a SQL-engine layer sitting on top of IndexedDB rather than switching storage substrates. The whole query surface this module needs (enumerated in the task file before the rewrite) is exact-key gets, exact/prefix `(app, type)` matches, and simple ordered/counted scans — no joins, no aggregates beyond `COUNT`, no arbitrary `WHERE`. See "Query-flexibility constraint" below before reaching for anything more than that.

## Files

### `index.js`
Public API entry point. Exports `initSync(app, apiHost, siteType)` which orchestrates startup: init IndexedDB, bootstrap skeleton, connect WebSocket. Also exports `isReady()`, `getSyncAPI()`, and re-exports key functions from other modules for direct import. In dev mode, wires `globalThis.__dmsSyncDump()` to `idb-store.js`'s `dumpAll()` debug helper.

### `sync-manager.js`
Core orchestrator. Handles:
- **Bootstrap**: `bootstrapSkeleton()` loads site + pattern rows (<20 items, always re-fetched). `bootstrapPattern(patternType)` loads a pattern's data on-demand (pages, sections, sources, views). Named `patternType` (not `patternInstance`) because the caller passes the full DB `type` of whatever item is being loaded (e.g. `my_docs|page`), not a bare instance name — the server derives the instance prefix itself.
- **Delta sync**: Warm starts fetch only changes since last revision via `/sync/delta`. If delta exceeds `STALE_DELTA_THRESHOLD` (1000 changes), discards it and does a full re-bootstrap.
- **WebSocket**: `connectWS()` subscribes per-app and per-pattern. Receives real-time `change` messages, applies via Yjs merge. Reconnects with exponential backoff (500ms to 30s).
- **Local writes**: `localCreate()`, `localUpdate()`, `localDelete()` write to local storage, queue in `pending_mutations`, and push to server via `/sync/push`. Creates push to server first to get real IDs; falls back to optimistic local write when offline.
- **Batch mode**: `beginBatch()`/`endBatch()` suppress invalidation during multi-step saves (e.g., parent + children). Single invalidation fires on `endBatch()`.
- **Collab room tracking**: `registerCollabRoom()`/`unregisterCollabRoom()`/`updateCollabPeers()` track active collaborative editing sessions and peer counts.
- **Error recovery**: `resetAndRebootstrap()` clears local IndexedDB object stores, clears in-memory state, re-bootstraps from server.
- **Status**: `onStatusChange(fn)` / `getStatus()` — values: `connected`, `syncing`, `disconnected`, `recovering`, `error`.

Key exports: `configure`, `bootstrapSkeleton`, `bootstrapPattern`, `isPatternLoaded`, `connectWS`, `localCreate`, `localUpdate`, `localDelete`, `beginBatch`, `endBatch`, `onInvalidate`, `onStatusChange`, `getStatus`, `getWS`, `onWSChange`, `getPendingCount`, `isCollabReady`, `registerCollabRoom`, `unregisterCollabRoom`, `updateCollabPeers`, `getCollabInfo`, `onCollabChange`, `resetAndRebootstrap`.

### `idb-store.js`
IndexedDB schema + purpose-built async storage API, run directly on the main thread (no Web Worker — IndexedDB is already async/non-blocking, so a worker would only add a `postMessage` round trip per call with no offsetting benefit). Replaces the old `worker.js` + `db-client.js` pair.

**Schema** (`initDB()`'s `onupgradeneeded`):
- `data_items` — `keyPath: 'id', autoIncrement: true`, indexes `by_app` (`app`) and `by_app_type` (`[app, type]`)
- `sync_state` — `keyPath: 'key'`
- `pending_mutations` — `keyPath: 'id', autoIncrement: true`, index `by_item_id` (`item_id`)

**Two upsert-conflict policies**, matching the original SQL's `ON CONFLICT DO UPDATE` semantics exactly (the SET list is narrower than the INSERT column list, so a blind overwrite would be wrong):
- `upsertItemNow(item)` — locally-originated / WS-pushed writes. On conflict, preserves existing `created_at`/`created_by`/`updated_by`, sets `updated_at` to now.
- `upsertItemsFromServer(items)` / `applyChangeBatch(ops)` — bootstrap/delta application. Same preserve-on-conflict shape, but `updated_at` comes from the payload, not "now".

**`reassignItemId(oldId, newId)`** — the one place the SQL port isn't mechanical. The original ran `UPDATE data_items SET id = ?` when an offline-created item's temp id gets reconciled to the server-assigned real id; IndexedDB can't change a record's key via `put()`, so this deletes the old record and adds a copy under the new key, plus rewrites any matching `pending_mutations.item_id` rows — all in one cross-store transaction (a small correctness improvement over the original's two independent, non-transactional `UPDATE`s).

**`dumpAll()`** — dev debug helper, dumps all three object stores via `console.table`. Wired to `globalThis.__dmsSyncDump()`.

### `sync-scope.js`
Registry of `(app, type)` pairs that are synced locally. Seeded at bootstrap from server response. `isLocal(app, type)` is the routing decision: if true, reads serve from local IndexedDB instead of Falcor. Key exports: `addToScope`, `isLocal`, `getSyncedTypes`, `clearScope`.

### `yjs-store.js`
Per-item Yjs document store for field-level merge. Each DMS item gets a `Y.Doc` with a `YMap('data')`. `applyLocal(id, newData)` merges local edits, `applyRemote(id, remoteData)` merges server/WS changes (adds new keys, updates changed keys, deletes removed keys). `initFromData(id, data)` seeds a doc from existing data (only if empty). `getData(id)` materializes current state. Pure in-memory — has no storage dependency of its own; `sync-manager.js` is what persists its merged output.

### Status UI
No dedicated component in this module — the connection status is surfaced through the page pattern's user menu instead: `patterns/page/components/userMenu.jsx` subscribes to `onStatusChange`/`getPendingCount`/`onCollabChange`/`getCollabInfo` (dynamic `import('../../../sync/sync-manager.js')`, gated on `VITE_DMS_SYNC`) and renders a status ring around the avatar plus a status row (dot, label, pending count, collab peer count) inside the user dropdown. Ring/dot colors per status live in `userMenu.theme.jsx` (`syncRing*`/`syncDot*` keys).

## Architecture

### Type-Based Routing (Sync Scope)
The sync scope registry (`sync-scope.js`) determines whether a given `(app, type)` pair should be served from local IndexedDB or fall through to Falcor. At bootstrap, all types present in the server response are registered. When `api/index.js` handles a read, it checks `sync.isLocal(app, type)` — if true, it queries local storage via `loadFromLocalDB()` instead of making Falcor requests. `loadFromLocalDB()` calls `sync.getItemsByAppType`/`sync.getItemsByIds`/`sync.getItem` — these are exposed on the sync API object returned by `getSyncAPI()` specifically for this consumer; it is the one real external caller of low-level storage reads outside this module (confirmed by grep — everything else goes through the higher-level bootstrap/local-write functions).

### Two-Phase Bootstrap
1. **Skeleton** (`bootstrapSkeleton`): Always runs at init. Fetches site row + pattern rows from `/sync/bootstrap?skeleton=...`. Small payload (<20 items), always re-fetched (no delta). Cleans up stale local items not in server response.
2. **Pattern** (`bootstrapPattern`): On-demand when user navigates to a pattern. Cold start fetches full snapshot from `/sync/bootstrap?pattern=...`. Warm start uses delta from `/sync/delta?pattern=...&since=...`. Subscribes the WebSocket to the pattern channel.

### Delta Sync
Revisions are tracked per scope in `sync_state` (keys like `rev:skeleton:site-type`, `rev:pattern:my_docs|page`). Delta responses exceeding `STALE_DELTA_THRESHOLD` (1000) trigger a full re-bootstrap to avoid slow incremental application.

### WebSocket
Connects to `/sync/subscribe` (WS). Subscribes per-app and per-loaded-pattern. Receives `change` messages with action (`I`/`U`/`D`), applies to local storage via Yjs merge, fires invalidation. On reconnect, does a `catchUp()` delta fetch. Exponential backoff on disconnect (500ms-30s).

## Key Design Decisions

### Echo Suppression (`myRevisions`)
When a local write is pushed to the server, the server broadcasts it back via WebSocket (and it can also reappear in a later `/sync/delta` response). That echo must be skipped — applying it again is at best redundant. The suppression key is the **exact revision number** returned by this tab's own `/sync/push` response (`change_log.revision` is a per-app monotonic serial, so that number can only ever appear once, on this exact write). `markMyRevision(revision)` records it in the `myRevisions` Set; `ws.onmessage` and `applyChanges()` (the delta-application path) both check `myRevisions.has(revision)` before applying.

This used to be keyed by item id (`pendingItemIds`) instead, which was wrong: a WS/delta message for an item this tab also has a mutation in flight for is not necessarily this tab's own echo — it can just as easily be a different client's genuinely concurrent edit to the same item, arriving mid-flight. Item-id keying suppressed that message unconditionally and still advanced the persisted revision watermark past it, which silently and **permanently** dropped the other client's write from this tab's local mirror (a hard reload did not recover it, since `revision > sinceRev` delta filtering never re-serves a revision this tab already claimed to be caught up through) — found live 2026-08-24, see `concurrent-page-editing-data-loss.md` Bug 9. Revision-keying can't have this failure mode: if the echo happens to arrive before this tab's own push response resolves (so `myRevisions` doesn't have it yet), the message is just applied as if remote — harmless, since it's this tab's own data (`yjs-store.js`'s `applyRemote` no-ops on unchanged keys) — which fails open (redundant apply) instead of failing closed (silently dropping someone else's write).

### `_dirty` Flag
In `api/index.js`, dms-format child items carry a `_dirty` flag. During sync writes, only children marked `_dirty: true` trigger `localUpdate()`; clean children are skipped. The flag is stripped before writing.

### Batch Mode
Multi-step saves (parent item + dms-format children) use `beginBatch()`/`endBatch()` to suppress per-write invalidation. A single invalidation fires at the end, preventing unnecessary re-renders during intermediate states.

### Stale Delta Threshold
If a delta response contains more than 1000 changes, it is discarded and a full re-bootstrap is performed instead. This avoids slow sequential application of large change sets.

### Error Recovery
`resetAndRebootstrap()` provides a nuclear recovery option: clears all local IndexedDB object stores, clears sync scope and loaded patterns, re-bootstraps from the server. Exposed in the public API for admin use.

### Query-flexibility constraint

The old SQLite-backed storage exposed a generic `useQuery(sql, params, deps, scope)` hook and a raw `exec(sql, params)` on the sync API — arbitrary SQL, in principle. Neither had any real consumer by the time of the IndexedDB rewrite (confirmed by grep: `useQuery` had zero call sites anywhere in `packages/dms/src`; the only real consumer of raw `exec` was `api/index.js`'s three narrow, well-shaped queries), so both were removed rather than ported. **Local storage no longer supports arbitrary querying.** If a future feature needs to filter locally-synced data by some field that isn't already covered by `idb-store.js`'s functions, it needs either a new dedicated index added to the schema (`data_items`/`pending_mutations` in `idb-store.js`'s `onupgradeneeded`) or a full re-fetch from the server — there is no "just write a WHERE clause" escape hatch anymore.

## Integration Points

### `api/index.js`
- **`_setSyncAPI(api)` / `_getSyncAPI()`**: Sync API reference stored on `globalThis.__dmsSyncAPI` to avoid Vite module instance duplication. Set by `dmsSiteFactory.jsx` after init.
- **`dmsDataLoader`**: Intercepts `list`/`view`/`edit` actions. If type not yet in scope, calls `sync.bootstrapPattern(type)` (fire-and-forget — falls through to Falcor for the current request, next navigation benefits once the background bootstrap completes). If `sync.isLocal(app, type)`, runs `loadFromLocalDB()` which reads via `sync.getItemsByAppType`/`sync.getItemsByIds`/`sync.getItem` and resolves dms-format child refs locally.
- **`dmsDataEditor`**: Intercepts creates/updates/deletes. Uses `sync.beginBatch()`, processes dms-format children via `sync.localCreate()`/`localUpdate()` (only if `_dirty`), handles parent item, then `sync.endBatch()`.

### `render/spa/dmsSiteFactory.jsx`
- Gates sync on `VITE_DMS_SYNC === '1'`.
- Dynamic-imports `sync/index.js` and calls `initSync(app, API_HOST, siteType)`.
- The `app` passed is resolved via an `onResolvedSyncApp` callback threaded through the async `dmsSiteFactory()` loader — on a multi-tenant subdomain this is the tenant's own app, not the master/platform app (fixed in `sync-bring-up-to-date.md`; single-tenant deployments resolve this synchronously on mount, so there's no added latency for the common case).
- Wires sync API into `api/index.js` via `_setSyncAPI()`.
- Subscribes to `onInvalidate` to revalidate React Router (debounced 150ms).

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
