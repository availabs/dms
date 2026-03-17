# Sync Module

Real-time sync system providing REST endpoints for data bootstrapping/deltas, a WebSocket layer for live change notifications, and Yjs-based collaborative editing.

## Files

- **`sync.js`** — REST endpoints (`createSyncRoutes` factory) and change_log compaction (`startCompaction`)
- **`ws.js`** — WebSocket server (`initWebSocket`), per-app broadcast (`notifyChange`), per-item Yjs collab rooms

## REST API

All endpoints are Express routes (not Falcor). Auth is enforced when `DMS_SYNC_AUTH=1`.

### `GET /sync/bootstrap?app=X`

Returns a full snapshot of items plus the current max revision. Streams JSON to avoid V8 string limits on large payloads.

Query params control scope:
- `skeleton=<siteType>` — Site row + its ref children (discovered from data, not hardcoded types)
- `pattern=<doc_type>&siteType=<siteType>` — All items matching `type = doc_type` or `type LIKE doc_type|%`, optionally merged with skeleton
- `type=<type>` — Exact type match
- _(none)_ — Full app bootstrap (main table only, split-table types excluded)

Response: `{ items: [...], revision: N }`

### `GET /sync/delta?app=X&since=N`

Returns change_log entries since revision N. Same scoping options as bootstrap (`pattern`, `type`). Split-table types are excluded from unscoped queries.

Response: `{ changes: [...], revision: N }`

### `POST /sync/push`

Client mutation endpoint. Body: `{ action, item }` where action is `I` (insert), `U` (update), or `D` (delete).

- Insert: supports client-provided ID (idempotent via `ON CONFLICT`) or server-allocated ID
- Update: uses `jsonMerge` for partial data merge
- Delete: removes row, logs with null data
- Writes a change_log entry and broadcasts via WebSocket

Response: `{ item: {...}, revision: N }`

## WebSocket

Endpoint: `ws://.../sync/subscribe` (via `WebSocketServer` on the HTTP server)

### Message Types

**App-level (change notifications):**
- `subscribe` (client -> server) — `{ type: "subscribe", app, pattern? }` — Join app broadcast. Optional `pattern` filters to only receive changes matching that doc_type.
- `change` (server -> client) — `{ type: "change", revision, action, item }` — Broadcast on every mutation. Pattern-subscribed clients only receive matching types.

**Per-item rooms (collaborative editing):**
- `join-room` / `leave-room` — `{ type: "join-room", itemId }` — Enter/exit a collab room
- `room-peers` (server -> client) — `{ type: "room-peers", itemId, count }` — Sent to all room members on join/leave
- `yjs-sync-step1` (server -> client) — Server's state vector, sent on join
- `yjs-sync-step2` (server -> client) — Server's full state update, sent on join
- `yjs-sync-response` (client -> server) — Client's diff after receiving sync-step1
- `yjs-update` (bidirectional) — Incremental Yjs update, relayed to all other room members
- `yjs-awareness` (bidirectional) — Cursor/selection state, relayed to all other room members

## Schema

### `change_log`

| Column | PG Type | SQLite Type | Description |
|--------|---------|-------------|-------------|
| revision | BIGSERIAL PK | INTEGER AUTOINCREMENT PK | Monotonic revision counter |
| item_id | BIGINT | INTEGER | The data_items row ID |
| app | TEXT | TEXT | Application name |
| type | TEXT | TEXT | Item type string |
| action | CHAR(1) | TEXT | `I`, `U`, or `D` |
| data | JSONB | TEXT | Item data snapshot (null for deletes) |
| created_at | TIMESTAMPTZ | TEXT | Timestamp |
| created_by | INTEGER | INTEGER | User ID (nullable) |

Index: `idx_change_log_app_rev` on `(app, revision)`.

### `yjs_states`

| Column | PG Type | SQLite Type | Description |
|--------|---------|-------------|-------------|
| item_id | BIGINT PK | INTEGER PK | The data_items row ID being collaboratively edited |
| state | BYTEA | BLOB | Full Yjs document state (binary) |
| updated_at | TIMESTAMPTZ | TEXT | Last flush timestamp |

## Yjs Server-Side Lifecycle

1. **`getOrCreateYDoc(itemId)`** — Lazily creates a `Y.Doc`. On first access, loads persisted state from `yjs_states` if available. Yjs is loaded via `require('yjs')` on first use (optional dependency).
2. **`scheduleFlush(itemId)`** — Debounces persistence (2s `FLUSH_DELAY`). Each incoming `yjs-update` or `yjs-sync-response` triggers a flush schedule.
3. **`flushYjsState(itemId)`** — Encodes full Y.Doc state and upserts into `yjs_states` (`ON CONFLICT` update).
4. **`cleanupRoom(itemId)`** — When the last client leaves a room: flush state, then destroy the Y.Doc and Awareness objects and free memory.

## Wiring

- **Controller -> WS broadcast:** The controller calls `createSyncRoutes._notifyChange(app, msg)` after writing to change_log. This static property is set by the server's init code to point at `ws.notifyChange`.
- **WS init:** `initWebSocket(server, db)` receives the HTTP server and DB adapter. The DB is used for yjs_states persistence.
- **Push endpoint also broadcasts:** `POST /sync/push` calls `_notifyChange` directly after its own change_log write.

## Heartbeat and OOM Protection

- **PING_INTERVAL (30s):** Server pings all clients every 30 seconds. Clients that don't respond with a pong within one interval are terminated via `cleanupConnection` + `ws.terminate()`. This prevents zombie connections from accumulating in `appSubscribers`.
- **MAX_BUFFERED (1MB):** `safeSend` skips sending to any client whose `bufferedAmount` exceeds 1MB, preventing memory growth from slow/stuck clients.
- **Stats reporting (30s):** Logs heap/RSS memory, connection counts, broadcast stats, and buffer totals to the request logger JSONL file. Helps diagnose OOM patterns.

## Auth

Set `DMS_SYNC_AUTH=1` to require JWT authentication on all sync endpoints. Checks `req.availAuthContext.user` (populated by upstream auth middleware). Returns 401 if missing.

## Compaction

`startCompaction(db, dbType)` runs periodic cleanup of old change_log entries:

- **`DMS_SYNC_COMPACT_DAYS`** — Retention period (default: 30 days)
- **`DMS_SYNC_COMPACT_INTERVAL_HOURS`** — How often to run (default: 24 hours)

Runs once on startup, then on the configured interval. Returns a cleanup function to stop the timer.

## Testing

`tests/test-sync.js` — 23 test functions covering:

- Change_log growth on create/edit/delete/type-edit
- Bootstrap (full, skeleton, pattern, type scoping, split-type exclusion)
- Delta (since revision, zero-returns-all)
- Push endpoint (create, update, delete, validation)
- WebSocket broadcast (from push and from Falcor routes)
- Sequential revision ordering
- Yjs collaborative editing (7 collab tests): join-room sync, two-client sync, peer count updates, state persistence, state restored on rejoin, echo suppression, awareness relay
