# DMS Sync

## Overview

DMS sync provides a local-first data layer for DMS sites. Data is stored in an in-browser SQLite database (wa-sqlite backed by IndexedDB), so reads are instant and the app works offline. Writes are applied locally first, then pushed to the server. A WebSocket connection delivers real-time change notifications from other clients.

For rich text content, sync includes collaborative editing via Yjs and Lexical's CollaborationPlugin. Multiple users editing the same section see each other's cursors and edits in real time.

## Enabling Sync

### Client

Set `VITE_DMS_SYNC=1` in your `.env` file (or pass it to the Vite dev server). When this variable is absent or falsy, the sync system is not loaded and the app uses the standard Falcor data path.

### Server

No manual database setup is required. The `change_log` and `yjs_states` tables are auto-created on first startup. WebSocket and sync REST endpoints are mounted automatically.

### Environment Variables

| Variable | Side | Default | Description |
|----------|------|---------|-------------|
| `VITE_DMS_SYNC` | Client | (unset) | Set to `1` to enable the sync system |
| `DMS_SYNC_AUTH` | Server | (unset) | When set, require JWT authentication on sync endpoints |
| `DMS_SYNC_COMPACT_DAYS` | Server | `30` | Number of days to retain entries in `change_log` |
| `DMS_SYNC_COMPACT_INTERVAL_HOURS` | Server | `24` | How often the server runs compaction (hours) |

## How It Works

1. **Bootstrap** -- On first load (or after a local DB reset), the client fetches a skeleton of the site (site row + pattern rows) from `/sync/bootstrap`. This is enough to render navigation.

2. **On-demand pattern loading** -- When the user navigates to a pattern for the first time, `bootstrapPattern()` fetches that pattern's pages, sections, and dataset rows. Subsequent visits read from local SQLite.

3. **Local reads** -- All component data reads (`useQuery`, `exec`) query the local SQLite database. There is no network round-trip for reads.

4. **Local writes + push** -- Writes (`localCreate`, `localUpdate`, `localDelete`) are applied to local SQLite immediately, then pushed to the server via `/sync/push`. The server applies the change to its database, records it in `change_log`, and broadcasts a WebSocket notification to other connected clients.

5. **Delta sync** -- On WebSocket reconnect (or periodically), the client calls `/sync/delta` with its last-known revision to fetch any changes it missed. This keeps clients in sync after network interruptions.

6. **WebSocket notifications** -- The server broadcasts change events per-app. When a client receives a notification for a row it has locally, it fetches the updated data and applies it to its local SQLite.

## Collaborative Editing

When two or more users edit the same rich text section simultaneously:

- Each user sees the other users' cursors, labeled with their email address.
- Edits appear character-by-character in real time (Yjs CRDT merge, no conflicts).
- The SyncStatus indicator (bottom-right corner) shows a peer count icon when a collaborative session is active.
- Collaborative state (the Yjs document) is persisted on the server in the `yjs_states` table, so edits survive page reloads and reconnects.
- Content is saved to the DMS database only when the user clicks **Save**. Clicking **Cancel** discards all local edits. The Yjs state is the live working copy; the database record is the published copy.

## Architecture

```
Browser Tab
+-- React App (DmsSite)
+-- Sync Manager (bootstrap / delta / WS / push)
+-- SQLite WASM (Web Worker, IDB persistence)
+-- WebSocket -----> DMS Server
                     +-- /sync/bootstrap   (full snapshot for app or pattern)
                     +-- /sync/delta       (changes since revision N)
                     +-- /sync/push        (client writes)
                     +-- WebSocket         (per-app broadcast + per-item collab rooms)
                     +-- change_log table  (revision tracking, auto-compacted)
                     +-- yjs_states table  (Yjs document persistence)
```

### Key client modules

| Module | Role |
|--------|------|
| `sync/index.js` | Public API entry point (`initSync`, `getSyncAPI`) |
| `sync/sync-manager.js` | Core logic: bootstrap, delta, push, WS, collab room management |
| `sync/db-client.js` | SQLite WASM wrapper (runs in a Web Worker) |
| `sync/use-query.js` | React hook for querying local SQLite |
| `sync/SyncStatus.jsx` | Status indicator component (connection state, pending count, peer count) |
| `sync/sync-scope.js` | Tracks which types are synced locally |

### Key server modules

| Module | Role |
|--------|------|
| `routes/sync/sync.js` | REST endpoints (`/sync/bootstrap`, `/sync/delta`, `/sync/push`), compaction |
| `routes/sync/ws.js` | WebSocket server (`initWebSocket`, `notifyChange`) |

### Server wiring (in `src/index.js`)

The sync system is wired up in two phases:

1. **Before listen** -- `createSyncRoutes(dbEnv)` registers the REST endpoints on the Express app.
2. **After listen** -- `initWebSocket(server, db)` attaches the WebSocket server to the HTTP server, and `startCompaction(db)` begins the periodic `change_log` cleanup. The controller's `notifyChange` callback is set so that Falcor writes (not just sync pushes) also broadcast to WebSocket clients.

## Troubleshooting

**Sync not connecting**
- Verify `VITE_DMS_SYNC=1` is set in your `.env` (must be a build-time Vite variable, not a runtime one).
- Confirm the DMS server is running and reachable.
- Check the browser console for WebSocket connection errors (`ws://` or `wss://` URLs).
- Look at the SyncStatus indicator in the bottom-right corner: red = disconnected, yellow = syncing, green = connected.

**Stale data after server restart**
- The client catches up automatically via a delta request on the next WebSocket reconnect. If data still looks stale, trigger a page reload -- the client will run a delta against its last revision.

**Corrupted local database**
- Call `resetAndRebootstrap()` from the browser console:
  ```js
  globalThis.__dmsSyncAPI.resetAndRebootstrap()
  ```
- Alternatively, clear IndexedDB for the site's origin in your browser's dev tools (Application > Storage > IndexedDB).

**Collaborative cursors not showing**
- Both users must be editing the same section (same item ID).
- Check that the WebSocket connection is active (green dot in SyncStatus).
- Verify the SyncStatus indicator shows a peer count (people icon with a number). If it shows nothing, the collab room may not have been joined.
- Ensure both users have `VITE_DMS_SYNC=1` enabled -- collaborative editing only works through the sync system.
