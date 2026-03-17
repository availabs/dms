# DMS Local-First Sync Integration

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Server — change_log + sync endpoints | ✅ COMPLETE | All sub-steps done: schema, controller, REST, WS, tests (16 passing) |
| Phase 2: Client — SQLite WASM + sync manager | ✅ COMPLETE | All modules ported to `packages/dms/src/sync/`. sync-scope.js also done (listed as 3a). |
| Phase 3: DMS integration | ✅ COMPLETE | All steps implemented (3a-3h). api/index.js sync intercepts, dmsSiteFactory sync init + revalidation, SyncStatus.jsx |
| Phase 3.5: Pattern-scoped sync | ✅ COMPLETE | See `tasks/completed/sync-pattern-scope.md`. SQLite chunked queries, pattern-scoped bootstrap/delta/WS, skeleton bootstrap, on-demand bootstrapPattern() in dmsDataLoader. Phase 4b: ref-driven skeleton (no hardcoded `\|pattern`), stale data cleanup, editSite URL safety |
| Phase 3.6: Reference resolution + delta propagation | ✅ COMPLETE | 3.6a: page-edit refs now included in sync (consolidation reduced to 1 row/page). 3.6b: delta→revalidate works. 3.6c (targeted invalidation) deferred. See research/dms-reference-resolution.md |
| Phase 4: Lexical live sync | ✅ COMPLETE | CollaborationPlugin with DmsCollabProvider. Auth email cursor labels, peer count, Yjs persistence, 7 integration tests (23 assertions). |
| Phase 5: Offline resilience + edge cases | ✅ COMPLETE | Stale delta threshold, compaction, auth enforcement, error recovery, documentation. Multi-tab coordination deferred to 5b. |

### Implemented files (server)

- `packages/dms-server/src/db/sql/dms/change_log.sql` — PG schema (change_log + yjs_states)
- `packages/dms-server/src/db/sql/dms/change_log.sqlite.sql` — SQLite schema
- `packages/dms-server/src/routes/sync/sync.js` — REST endpoints (bootstrap, delta, push)
- `packages/dms-server/src/routes/sync/ws.js` — WebSocket (per-app broadcast + per-item rooms + Yjs relay)
- `packages/dms-server/tests/test-sync.js` — 16 integration tests
- `packages/dms-server/src/routes/dms/dms.controller.js` — `appendChangeLog()` + `setNotifyChange()`
- `packages/dms-server/src/db/index.js` — change_log table init
- `packages/dms-server/src/index.js` — sync routes + WS mounted

### Implemented files (client)

- `packages/dms/src/sync/index.js` — public API (`initSync`, `isReady`, `getSyncAPI`)
- `packages/dms/src/sync/worker.js` — wa-sqlite Web Worker (IDBBatchAtomicVFS)
- `packages/dms/src/sync/db-client.js` — Promise-based SQL proxy
- `packages/dms/src/sync/sync-manager.js` — Bootstrap/delta/WS/push/pending queue (453 lines)
- `packages/dms/src/sync/yjs-store.js` — Per-item Yjs document management
- `packages/dms/src/sync/SyncStatus.jsx` — Connection status indicator (Phase 3)

### Implemented files (Phase 3 integration)

- `packages/dms/src/api/index.js` — `_setSyncAPI`/`_getSyncAPI` setter, `loadFromLocalDB` helper with dms-format child resolution, sync intercepts in `dmsDataLoader` and `dmsDataEditor` (with `_dirty` flag skip for unchanged sections)
- `packages/dms/src/api/updateDMSAttrs.js` — `_dirty` flag support: skip Falcor edit calls for sections without `_dirty`, strip `_dirty` before sending to server
- `packages/dms/src/render/spa/dmsSiteFactory.jsx` — `DMS_SYNC_ENABLED` flag, sync init + `_setSyncAPI` wiring, `router.revalidate()` on invalidation, lazy `SyncStatus` render
- `packages/dms/src/dms-manager/wrapper.jsx` — `skipNavigate` option on `apiUpdate` to prevent loader re-runs on section saves
- `packages/dms/src/patterns/page/components/sections/sectionGroup.jsx` — `updateSections` uses `skipNavigate: true`
- `packages/dms/src/patterns/page/components/sections/sectionArray.jsx` — `_dirty: true` flag on sections modified via `save()` and `saveIndex()`
- `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` — `isEdit` guard on onChange useEffect
- `packages/dms/src/sync/use-query.js` — Reactive query hook with scoped invalidation
- `packages/dms/src/sync/sync-scope.js` — Sync scope registry (`isLocal`, `addToScope`)

### Bug fixes

- **Create bypassing sync for new types** (2026-03-13): `dmsDataEditor` sync intercept checked `sync.isLocal(app, type)` which returns false for types not yet in scope (e.g., first page created for a pattern). Creates fell through to Falcor, where the XHR was aborted by the client before the server response arrived (Observable dispose race). Fix: broadened the sync eligibility check to include creates (`!id && attributeKeys.length > 0`) regardless of scope — `localCreate` uses `fetch('/sync/push')` (not Falcor) and adds the type to scope after success. File: `api/index.js`.

- **Sync routes ignored per-app table splitting** (2026-03-13): All sync endpoints (bootstrap, delta, push) hardcoded `data_items` table references. When `DMS_SPLIT_MODE=per-app` is active, data lives in `data_items__{app}` tables, so sync returned empty results / wrote to the wrong table. Fix: added `mainTable(app)` helper to `sync.js` (mirrors the controller's version) that uses `resolveTable()` from `table-resolver.js`. All `data_items` queries in bootstrap, delta, and push now resolve through `mainTable(app)`. Push creates use `allocateId()` for correct per-app sequence allocation. The `change_log` table is unaffected (single shared table regardless of split mode). Files: `routes/sync/sync.js`.

- **Client byId requests used legacy path** (2026-03-13): `createRequest.js:getIdPath()` used `['dms', 'data', 'byId', id]` (legacy route without app namespace). In per-app mode, the legacy `dms.data.byId` route queries the `data_items` table which is empty — data lives in `data_items__{app}`. Fix: switched to `['dms', 'data', app, 'byId', id]` which hits the app-namespaced Falcor route and resolves the correct per-app table. A comment in the code already noted this switch was needed. File: `packages/dms/src/api/createRequest.js`.

- **Stale localStorage routes causing 404** (2026-03-13): `dmsSiteFactory.jsx` caches site/pattern data in `localStorage` and uses it to build initial routes before the Falcor/sync fetch completes. After switching to per-app mode or running migrations, the cached data can become stale, causing routes to point at nonexistent data or fail to render. Clearing localStorage resolved the 404. Root cause: no cache invalidation mechanism — localStorage data persists indefinitely regardless of server-side changes.

### What remains

- Phase 4: Lexical live sync — ✅ COMPLETE (CollaborationPlugin, Yjs persistence, 7 integration tests)
- Phase 5: Offline resilience + edge cases — ✅ COMPLETE (stale delta threshold, compaction, auth, error recovery, documentation). Multi-tab coordination deferred to Phase 5b.
- Phase 5b (deferred): Multi-tab BroadcastChannel leader election

### Follow-up tasks (create on completion)

- **localStorage cache invalidation**: Add a version/hash to the `localStorage` site data cache (`dmsSiteFactory.jsx`) that gets invalidated when the site structure changes on the server. Currently the cache persists indefinitely, and stale data can cause 404s or render the wrong routes after migrations, split-mode changes, or pattern edits from other clients. Options: hash the skeleton bootstrap response, use the sync revision number, or store a server-generated site config version.

## Objective

Bring the sync mechanics proven in `research/toy-sync/` into the DMS production stack. After this task, DMS sites will load from a client-side SQLite database (wa-sqlite + OPFS), sync incrementally via a revision-based protocol, and receive real-time updates over WebSocket. Offline editing works automatically — pending mutations queue locally and flush on reconnect.

The core of this task is making the existing DMS read/write flow work through a local database with background sync, so navigation is instant and the app works offline. Phase 4 (Lexical live sync) recommends upgrading to character-level collaborative editing via `@lexical/yjs` CollaborationPlugin — this approach was fully proven in `research/toy-sync/` and eliminates the UX problems of the LWW remount pattern.

## Background: What Toy-Sync Proved

The toy-sync app (`research/toy-sync/`) validated every core mechanic we need:

| Mechanic | Toy-sync status | Key files |
|----------|----------------|-----------|
| SQLite WASM in browser (wa-sqlite + IDBBatchAtomicVFS) | Working | `client/worker.js`, `client/db-client.js` |
| Revision-based sync (bootstrap → delta → WebSocket) | Working | `client/sync-manager.js`, `server/routes.js` |
| Yjs YMap for field-level merge | Working (module ready) | `client/yjs-store.js` |
| Optimistic local writes + pending mutation queue | Working | `client/sync-manager.js` |
| Echo suppression (per-item pending lifecycle) | Working | `client/sync-manager.js:removePending()` |
| Reactive queries (invalidation-based) | Working | `client/use-query.js` |
| WebSocket reconnect + exponential backoff + catch-up | Working | `client/sync-manager.js:connectWS()` |
| Lexical JSON through sync pipeline | Working | `client/components/NoteEditor.jsx` |
| Remote-update Lexical remount (remoteVersion key) | Working | `client/components/NoteEditor.jsx` |

### Key Lessons from Toy-Sync

*From LWW sync implementation:*

1. **Echo suppression must be per-item lifecycle**: `pendingItemIds` can only be cleared when ALL pending mutations for that item are resolved, not after each individual mutation. Otherwise a completed CREATE clears suppression while an UPDATE is in flight, causing the CREATE echo to overwrite local edits.

2. **Lexical ignores value prop changes after first render**: The only way to push remote content into an already-mounted Lexical editor is to change the component's `key` prop (via a `remoteVersion` counter), forcing unmount/remount. A `remountingRef` must suppress the post-remount onChange to avoid a save loop. (Note: This is the LWW approach. Character-level collab via CollaborationPlugin eliminates remounting entirely — see lesson 8.)

3. **Debounced saves need refs, not closures**: The save callback reads `titleRef.current` and `descriptionRef.current` at flush time to avoid stale closure captures. Pending debounce timers must be cancelled on item switch.

4. **Idempotent server writes**: POST routes should use `ON CONFLICT(id) DO UPDATE` so retried creates from the pending queue don't fail. UPDATE routes should fall back to POST create on 404 for orphaned local items.

5. **IDBBatchAtomicVFS over OPFS for now**: Broader compatibility (no COOP/COEP headers), works in all contexts. OPFS can be swapped in later for performance.

6. **Serialized SQLite access**: All SQL calls go through a promise queue — wa-sqlite can't handle concurrent async operations.

*From collaborative editing implementation (toy-sync-collaborative-editing):*

7. **Design the WebSocket for room-based extensibility from day one**: The toy-sync WS started as a simple broadcast-to-all pipe, then had to be rewritten for room-based routing when collab was added. The DMS sync WS should support per-app broadcast (for change_log) AND per-item rooms (for future Yjs collab) from the start. This means: track which items each client is editing, route `yjs-update`/`yjs-awareness` messages only to clients in the same room.

8. **CollaborationPlugin eliminates the remount pattern entirely**: With `@lexical/yjs`, remote edits flow through the Yjs binding directly into the editor — no `remoteVersion` key change, no unmount/remount, no onChange suppression. The editor stays mounted and remote keystrokes appear character-by-character. For Phase 4, consider offering CollaborationPlugin as the primary Lexical sync mode (not just remount).

9. **Expose WebSocket lifecycle to external consumers**: The ToyProvider needed `getWS()` (current reference) and `onWSChange(callback)` (fires on reconnect) from the sync manager. Design these exports into the DMS sync manager API from the start — any future provider or plugin that needs the WS connection should be able to subscribe to it without modifying the sync manager internals.

10. **Two Y.Doc systems coexist cleanly**: Field-level YMap (for title, metadata) and character-level XmlFragment (for Lexical content) use entirely separate Y.Doc instances. They don't interfere. The DMS sync layer can use its existing Yjs YMap for field-level merge while CollaborationPlugin manages its own Y.Doc for Lexical content.

11. **Server needs Yjs for collab (not just clients)**: Unlike field-level LWW (where the server stores plain JSON), character-level collab requires server-side Y.Doc management — the server maintains an in-memory Y.Doc per active room, applies incoming binary updates, sends sync-step1/step2 to joining clients, and persists compacted state to a `yjs_states` BLOB column. Plan the DMS server schema to include a `yjs_states` table alongside `change_log`.

12. **Guard against duplicate WS listeners on reconnect**: When the WebSocket reconnects, providers that attach message handlers must track which WS instance they're attached to (`_currentWS` pattern) and skip re-attachment if it's the same instance. Otherwise every reconnect doubles the message handlers, causing duplicate processing and duplicate room joins.

13. **Sync timeout fallback for empty docs**: When a Yjs document has no server state (new/empty), the server sends sync-step1 (state vector) but NOT sync-step2 (no content to send). The client needs a timeout (~1s) to mark sync as complete, otherwise CollaborationPlugin waits forever for the `sync` event. This is a design consideration for any Yjs sync protocol implementation.

14. **`LexicalCollaboration` context wrapper is required**: `CollaborationPlugin` requires a `LexicalCollaboration` provider from `@lexical/react/LexicalCollaborationContext` wrapping the `LexicalComposer`. Missing this causes a runtime crash with "useCollaborationContext: no context provider found". The DMS editor's commented-out CollaborationPlugin code doesn't include this wrapper — it will need to be added.

15. **Vite resolve aliases for Yjs packages**: When `@lexical/react/LexicalCollaborationPlugin` imports `yjs` and `y-protocols`, Vite must resolve them to the correct `node_modules/` location. Add explicit `resolve.alias` entries in vite.config for `yjs` and `y-protocols` pointing to the project's own copies. Without this, the build fails with "yjs not found".

16. **Stale `items.data` during collab editing**: When description is managed by Yjs/CollaborationPlugin, the `items.data.description` field in the REST/change_log pipeline becomes stale (frozen at bootstrap-time value). This doesn't affect the editor (content comes from Yjs) but does affect non-editor views (e.g., list previews). Options: (a) accept staleness for toy scope, (b) periodically materialize Yjs state back to the data column, (c) read preview text from Yjs state. For DMS production, option (b) — server flushes Yjs XmlFragment → Lexical JSON → `data.description` on room cleanup — is the right approach.

17. **"Invalid access: Add Yjs type to a document before reading data" is benign**: This Yjs warning fires when `@lexical/yjs` reads the Y.Doc's XmlFragment root before the first sync transaction completes. It's harmless and common — even the official Lexical playground produces it. Don't try to suppress it.

## Current DMS Architecture (What Exists)

### Server write path

All DMS writes go through the controller (`packages/dms-server/src/routes/dms/dms.controller.js`):
- `createData(args, user)` — line 687: INSERT with app/type/data, RETURNING full row
- `setDataById(id, data, user, app)` — line 581: UPDATE with JSON merge, RETURNING full row
- `deleteData(app, type, ids, user)` — line 717: DELETE by ID array

These are called by Falcor routes (`dms.route.js`):
- `dms.data.create` → `controller.createData()`
- `dms.data.edit` → `controller.setDataById()`
- `dms.data.delete` → `controller.deleteData()`

### Client data loading

Client uses Falcor (`api/index.js`):
- `dmsDataLoader(falcor, config, path)` — builds Falcor paths from route config, calls `falcor.get()`
- `dmsDataEditor(falcor, config, ...)` — calls `falcor.call()` for create/edit/delete
- All data flows through `POST /graph` (Falcor protocol)
- Falcor has its own cache (JSON Graph model cache) that provides some dedup

### What did NOT exist (before this task — now implemented in Phases 1-2)

- ~~No `change_log` table~~ → ✅ `change_log` + `yjs_states` tables
- ~~No revision/version tracking~~ → ✅ `appendChangeLog()` on all writes
- ~~No WebSocket or real-time push~~ → ✅ `routes/sync/ws.js` (per-app broadcast + per-item rooms)
- ~~No sync endpoints (bootstrap/delta)~~ → ✅ `routes/sync/sync.js` (bootstrap, delta, push)
- ~~No client-side SQLite~~ → ✅ `sync/worker.js` + `sync/db-client.js`
- ~~No offline support~~ → ✅ Pending mutation queue in sync-manager (not yet wired into DMS data path)

### Database schema

```sql
-- data_items (main table — also template for split tables)
CREATE TABLE data_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);
```

Split tables have identical schema but are named `data_items__{sanitized_type}` (legacy) or `data_items__{app}__{sanitized_type}` (per-app mode).

### Content hierarchy

```
Site:    app=myapp  type=my-site-type
  └─ Pattern:  app=myapp  type=my-site-type|pattern
       ├─ Page:     app=myapp  type={doc_type}
       │   └─ Section: app=myapp  type={doc_type}|cms-section
       └─ Source:   app=myapp  type={doc_type}|source
           ├─ View:    app=myapp  type={doc_type}|source|view
           └─ Data:    app=myapp  type={doc_type}-{view_id}  [split table]
```

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Tab                          │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │  React App   │◄──►│ Sync Manager │                    │
│  │  (DmsSite)   │    │  (main thread)                    │
│  └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                            │
│         │  read: SQL        │  write: mutation → queue    │
│         │  (via useQuery    │  sync: bootstrap/delta/ws   │
│         │   or passthrough) │                            │
│         ▼                   ▼                            │
│  ┌──────────────────────────────────┐                    │
│  │  SQLite WASM (Web Worker)        │                    │
│  │  ┌────────────┐ ┌─────────────┐  │                    │
│  │  │ data_items  │ │ sync_state  │  │                    │
│  │  │ (all DMS   │ │ (cursors,   │  │                    │
│  │  │  content)  │ │  pending)   │  │                    │
│  │  └────────────┘ └─────────────┘  │                    │
│  │         IDB / OPFS persistence   │                    │
│  └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
                          │
                    HTTP + WebSocket
                          │
┌─────────────────────────────────────────────────────────┐
│                     DMS Server                           │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │ Falcor/UDA   │    │ Sync Routes  │                    │
│  │ Routes       │    │ /sync/...    │                    │
│  │ (unchanged)  │    │ (new)        │                    │
│  └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                            │
│         ▼                   ▼                            │
│  ┌──────────────────────────────────┐                    │
│  │  PostgreSQL / SQLite             │                    │
│  │  data_items + change_log (new)   │                    │
│  └──────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Key design decisions

1. **Scoped sync by `app`**: Each DMS site has one `app` value. The client syncs all content for its app. This is ~20-500 rows (sites, patterns, pages, sections, sources, views). Dataset split-table rows are excluded by default but the architecture supports opting them in (see design decision #6 and "Future: Split-Table Sync" section).

2. **Type-based routing, not race-based**: Every data request is routed by checking a **sync scope registry** — a set of types that are synced locally. For types in the registry → query local SQLite. For types not in the registry → pass through to Falcor unchanged. This routing decision is deterministic and static (not a runtime race). The Notion-style "race local vs server" pattern is unnecessary here because: (a) once sync is established, local data is authoritative for synced types — there's nothing to race, (b) for non-synced types (split tables, UDA), there's no local data to race against, (c) the WebSocket push keeps local data current in real-time. The boundary is clean: structural content is always local, dataset rows are always server (by default).

3. **Passthrough on cache miss**: When the client SQLite has no data for a synced type (cold start before bootstrap completes), queries fall through to Falcor. The response populates local SQLite AND returns to the UI. After initial sync, all reads come from local.

4. **Server stores plain JSON for field-level sync**: The `change_log` stores full JSON snapshots. Clients do Yjs YMap merging locally. However, the server schema should also include a `yjs_states` table (BYTEA/BLOB) for future character-level collab state — adding it later requires a migration, so include it in the initial schema.

5. **Falcor stays as-is**: Existing Falcor routes and client API are unchanged. The sync layer sits alongside Falcor, not replacing it. Clients that don't opt in to sync continue to work exactly as before. Both synced and non-synced data pass through the same API interface — the routing layer is transparent to components.

6. **Sync scope registry, not hardcoded type checks**: The routing layer maintains a registry of which types are synced locally. Initially this is just main-table types (sites, patterns, pages, sections, sources, views). The registry is designed to be extensible — specific split-table types can be added in the future (see "Future: Split-Table Sync"). The `table-resolver.js` module (which already knows split vs main) seeds the initial registry, but the registry is the authoritative routing source, not the resolver.

7. **Yjs for content items only**: Yjs merge applies to pages and sections (frequently edited content). Structural items (sites, patterns, sources, views) use simple LWW — they're rarely edited concurrently.

8. **WebSocket designed for both broadcast and rooms**: The WS handles two message routing modes: (a) per-app broadcast for change_log notifications (all subscribers for an app), and (b) per-item room routing for future collaborative editing (only clients editing the same item). Designing both into the initial WS layer avoids a rewrite when collab is added. Clients join/leave item rooms on editor mount/unmount.

9. **Expose WS lifecycle for external consumers**: The sync manager exports `getWS()` and `onWSChange(callback)` so external modules (future Yjs providers, presence indicators, etc.) can access the WebSocket without modifying sync-manager internals.

## Implementation Plan

### Phase 1: Server — change_log + sync endpoints ✅ COMPLETE

Add revision tracking and sync API to dms-server. Zero impact on existing Falcor routes.

#### 1a. change_log table ✅

New schema file: `packages/dms-server/src/db/sql/dms/change_log.sql` (PG) and `change_log.sqlite.sql`

```sql
-- PostgreSQL
CREATE TABLE IF NOT EXISTS change_log (
  revision BIGSERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  action CHAR(1) NOT NULL,            -- 'I' insert, 'U' update, 'D' delete
  data JSONB,                          -- full snapshot for I/U; NULL for D
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_change_log_app_rev ON change_log (app, revision);

-- Yjs binary state for collaborative editing (future-proofing — include in initial schema)
CREATE TABLE IF NOT EXISTS yjs_states (
  item_id INTEGER PRIMARY KEY REFERENCES data_items(id) ON DELETE CASCADE,
  state BYTEA NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SQLite
CREATE TABLE IF NOT EXISTS change_log (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_change_log_app_rev ON change_log (app, revision);

CREATE TABLE IF NOT EXISTS yjs_states (
  item_id INTEGER PRIMARY KEY,
  state BLOB NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 1b. Controller change_log writes ✅

Modify the controller's write methods to append to change_log after each mutation. The controller already returns the full row via RETURNING, so we have all the data needed:

```js
// After every createData(), setDataById(), deleteData():
await dms_db.promise(
  `INSERT INTO change_log (item_id, app, type, action, data, created_by)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [item.id, item.app, item.type, action, item.data, userId]
);
```

Wrap the write + log in a transaction so they're atomic.

**Files to modify**:
- `packages/dms-server/src/routes/dms/dms.controller.js` — add `appendChangeLog()` helper, call after `createData`, `setDataById`, `deleteData`
- `packages/dms-server/src/db/sql/dms/` — new schema files for change_log
- `packages/dms-server/src/db/index.js` — ensure change_log table is created on init

#### 1c. Sync REST endpoints ✅

New route file: `packages/dms-server/src/routes/sync/sync.route.js`

```
GET /sync/bootstrap?app=X              → { items: [...], revision: N }
GET /sync/bootstrap?app=X&type=Y       → { items: [...], revision: N }  (table-scoped, for future split-table sync)
GET /sync/delta?app=X&since=N          → { changes: [...], revision: N }
GET /sync/delta?app=X&type=Y&since=N   → { changes: [...], revision: N }  (type-scoped)
```

- `bootstrap` (no type): SELECT all rows from data_items (main table only, not splits) WHERE app = X, plus MAX(revision) from change_log. The response types are added to the client's sync scope registry.
- `bootstrap` (with type): SELECT all rows from the specific table (including split tables) WHERE app = X AND type = Y. Used when opting a specific dataset into local sync (future).
- `delta` (no type): SELECT from change_log WHERE app = X AND revision > N ORDER BY revision ASC. Excludes split-table types by default.
- `delta` (with type): SELECT from change_log WHERE app = X AND type = Y AND revision > N. For type-scoped sync (future).

**Files to create**:
- `packages/dms-server/src/routes/sync/sync.route.js` — Express routes
- `packages/dms-server/src/routes/sync/sync.controller.js` — Query logic

**Files to modify**:
- `packages/dms-server/src/index.js` — mount sync routes alongside Falcor

#### 1d. WebSocket endpoint ✅

Add WebSocket upgrade handling to the DMS server (alongside the existing Express app).

```
WS /sync/subscribe?app=X
```

**Two routing modes** (learned from toy-sync collab):

1. **Per-app broadcast** — On change_log write: broadcast `{ type: 'change', ... }` to all subscribers for that app. This is the core sync notification.

2. **Per-item rooms** (future-proofing for collaborative editing) — Support `join-room`/`leave-room` messages scoped by item ID. Route `yjs-update`/`yjs-awareness` messages only to clients in the same room. Even if collab isn't implemented in this phase, the room tracking infrastructure (`Map<itemId, Set<WebSocket>>`) should be in place.

**WS lifecycle exports**: The WebSocket manager should export `getWSS()` for the server-side WSS instance, and the client sync manager should export `getWS()` + `onWSChange(callback)` for external consumers (lesson from toy-sync: ToyProvider needed these to share the WS connection).

**Reconnect handling**: Use exponential backoff (500ms → 30s cap). On reconnect, run catch-up delta before resuming normal operation. External consumers (via `onWSChange`) are notified on each new connection so they can re-join rooms.

**Files to create**:
- `packages/dms-server/src/routes/sync/ws.js` — WebSocket manager with per-app broadcast + per-item room routing

**Files to modify**:
- `packages/dms-server/src/index.js` — attach WebSocket upgrade handler

#### 1e. Tests ✅

Add integration tests for the sync endpoints:
- Bootstrap returns all items + correct revision
- Delta returns only changes since N
- WebSocket receives broadcasts
- change_log grows on create/edit/delete
- Concurrent writes get sequential revisions

**Files to create**:
- `packages/dms-server/tests/test-sync.js`

### Phase 2: Client — SQLite WASM + sync manager ✅ COMPLETE

Port the toy-sync client infrastructure into the DMS client library as an opt-in module.

#### 2a. Client SQLite (Web Worker) ✅

Port `research/toy-sync/client/worker.js` and `db-client.js` into the DMS library:

```
packages/dms/src/sync/
  worker.js            # wa-sqlite Web Worker (IDBBatchAtomicVFS)
  db-client.js         # Promise-based SQL proxy via postMessage
  schema.sql           # Client-side schema (data_items + sync_state + pending_mutations)
```

Client schema mirrors server `data_items` plus sync bookkeeping:

```sql
CREATE TABLE IF NOT EXISTS data_items (
  id INTEGER PRIMARY KEY,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  created_by INTEGER,
  updated_at TEXT,
  updated_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_data_items_app_type ON data_items (app, type);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS pending_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,
  action TEXT NOT NULL,
  app TEXT,
  type TEXT,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### 2b. Sync manager ✅

Port `research/toy-sync/client/sync-manager.js`, adapted for DMS:

```
packages/dms/src/sync/
  sync-manager.js      # Bootstrap, delta, WebSocket, push, pending queue
```

Key differences from toy-sync:
- Scoped by `app` (read from DMS site config)
- Populates the sync scope registry at bootstrap (every type in the bootstrap response is added to the registry — this determines which future requests route locally vs to Falcor)
- change_log entries include `app` and `type` for routing
- Pending mutations track `app` and `type`
- Multiple invalidation scopes: `'data_items'`, `'data_items:{app}+{type}'`
- Sync endpoints support optional `type` param for future table-scoped sync

#### 2c. Yjs store ✅

Port `research/toy-sync/client/yjs-store.js`:

```
packages/dms/src/sync/
  yjs-store.js         # Per-item Yjs document management
```

Same as toy-sync — `applyLocal()`, `applyRemote()`, `initFromData()`. No changes needed.

#### 2d. Reactive query layer ✅

Port `research/toy-sync/client/use-query.js`, enhanced for DMS:

```
packages/dms/src/sync/
  use-query.js         # React hook: run SQL against local SQLite, auto-invalidate
  query-cache.js       # Query registration, invalidation by scope
```

Enhanced invalidation scopes:
- `invalidate('data_items')` — all DMS data
- `invalidate('data_items:myapp+docs-page')` — specific app+type
- Queries declare which scopes they depend on

#### 2e. Initialization + opt-in ✅

The sync system is opt-in per site. Controlled by environment variable or site config:

```
DMS_SYNC=1    # Enable client-side sync
```

Entry point: `packages/dms/src/sync/index.js` exports `initSync(app)` which:
1. Spawns the Web Worker
2. Creates the client schema
3. Runs bootstrap/delta
4. Connects WebSocket
5. Returns the query/mutation API

**Files to create**:
- `packages/dms/src/sync/index.js` — public API
- `packages/dms/src/sync/worker.js`
- `packages/dms/src/sync/db-client.js`
- `packages/dms/src/sync/sync-manager.js`
- `packages/dms/src/sync/yjs-store.js`
- `packages/dms/src/sync/use-query.js`
- `packages/dms/src/sync/query-cache.js`

### Phase 3: DMS integration — wire sync into the data loading path — DONE

Connect the sync layer to the existing DMS data loading. The integration point is `api/index.js` — both `dmsDataLoader` and `dmsDataEditor` are called from exactly two places: route loaders/actions in `dmsPageFactory.jsx` and `apiLoad`/`apiUpdate` in `wrapper.jsx`. By adding sync-aware routing at the top of these two functions, every pattern (page, admin, datasets, forms, auth) gets local-first behavior without any changes to pattern code.

**Gating:** All sync code is behind `VITE_DMS_SYNC=1` env var. When unset, zero sync code is loaded (dynamic imports only).

#### 3a. Sync scope registry ✅

Already implemented in `packages/dms/src/sync/sync-scope.js`. Populated at bootstrap from types present in the `/sync/bootstrap` response. Provides `isLocal(app, type)` routing decision.

#### 3b. Initialize sync in `DmsSite` ✅

**File:** `packages/dms/src/render/spa/dmsSiteFactory.jsx`

Add sync initialization inside the `DmsSite` component via a separate `useEffect`, after routes are loaded. Non-blocking — sync failure doesn't break the app.

```jsx
// At top of file:
const DMS_SYNC_ENABLED = typeof import.meta !== 'undefined'
  && import.meta.env?.VITE_DMS_SYNC === '1';

// Inside DmsSite component, after existing route-loading useEffect:
useEffect(() => {
  if (!DMS_SYNC_ENABLED) return;
  const app = dmsConfig?.format?.app || dmsConfig?.app;
  if (!app) return;

  import('../../sync/index.js').then(async ({ initSync }) => {
    const syncAPI = await initSync(app, API_HOST);
    // Wire sync into the API layer (step 3e)
    const { _setSyncAPI } = await import('../../api/index.js');
    _setSyncAPI(syncAPI);
  }).catch(err =>
    console.warn('[dms] sync init failed:', err.message)
  );
}, []);
```

Key decisions:
- Dynamic `import()` so sync code is tree-shaken when `VITE_DMS_SYNC` is off
- Non-blocking — sync failure logs warning, app continues with Falcor-only
- `app` comes from `dmsConfig`, same source all patterns use

#### 3c. Sync-aware `dmsDataLoader` — route reads through local SQLite ✅ (bug fix applied)

**File:** `packages/dms/src/api/index.js`

Add a check at the top of `dmsDataLoader`, after config/format validation. For synced types with simple actions (`list`, `view`, `edit`), query local SQLite instead of Falcor. For non-synced types or complex actions (`uda`, `search`, `load`), pass through to Falcor unchanged.

```js
// --- Sync intercept: serve synced types from local SQLite ---
const sync = _getSyncAPI();
if (sync && sync.isLocal(app, type) && ['list', 'view', 'edit'].includes(mainAction)) {
  const localResult = await loadFromLocalDB(sync, app, type, format, activeConfigs, path);
  if (localResult !== null) return localResult;
  // null = empty result, fall through to Falcor (cold start before bootstrap)
}
// --- End sync intercept ---
```

**Bug fix — `_setSyncAPI` module instance mismatch:**

After Phase 3.5, sync bootstrapped correctly (logs showed `[sync] fully wired into DMS`) but `dmsDataLoader` always reported `FALCOR (sync not ready)` — `_syncAPI` was null even after `_setSyncAPI(api)` was called.

**Root cause:** Vite's dev server creates separate module instances for `api/index.js` — even when importing through the barrel (`src/index.js`) and using static imports, the module-level `let _syncAPI` variable exists in different instances. `_setSyncAPI` sets the value on one instance while `_getSyncAPI` (called from `dmsDataLoader`) reads from another.

**Fix:** Replace module-level `let _syncAPI` with `globalThis.__dmsSyncAPI`. `globalThis` is a single shared namespace across all module instances, so `_setSyncAPI` and `_getSyncAPI` are guaranteed to read/write the same value regardless of how Vite resolves the module graph.

```js
export function _setSyncAPI(api) { globalThis.__dmsSyncAPI = api; }
function _getSyncAPI() { return globalThis.__dmsSyncAPI || null; }
```

Additionally, `_setSyncAPI` is now exported from the barrel (`src/index.js`) and imported statically in `dmsSiteFactory.jsx` to avoid the unnecessary dynamic import of `api/index.js`.

The `loadFromLocalDB` helper:

```js
async function loadFromLocalDB(sync, app, type, format, activeConfigs, path) {
  const result = await sync.exec(
    'SELECT * FROM data_items WHERE app = ? AND type = ? ORDER BY id',
    [app, type]
  );

  if (result.rows.length === 0) return null; // fall through to Falcor

  // Transform to match the shape processNewData returns:
  // Local SQLite stores {id, app, type, data (JSON string), created_at, ...}
  // Components expect flattened: {id, app, type, title, sections, created_at, ...}
  const items = result.rows.map(row => {
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    return {
      ...parsed,
      id: row.id,
      app: row.app,
      type: row.type,
      created_at: row.created_at,
      created_by: row.created_by,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    };
  });

  return format.defaultSort ? format.defaultSort(items) : items;
}
```

**Data shape mapping:** The server stores item data as a JSON `data` column. Falcor's `processNewData()` flattens `d?.data?.value || {}` into top-level properties. The local loader does the equivalent: `JSON.parse(row.data)` spread into the row's metadata fields.

**Why not race local vs server (Notion-style)?** For synced types, local SQLite is the source of truth — WebSocket push keeps it current in real-time. For non-synced types, there's no local data. The only moment local might be stale is cold start before bootstrap completes, handled by the null fallthrough.

#### 3d. Sync-aware `dmsDataEditor` — write locally first ✅

**File:** `packages/dms/src/api/index.js`

Add a check at the top of `dmsDataEditor`'s `updateRow` inner function, before the existing delete/update/create branches. For synced types, write to local SQLite + pending queue instead of Falcor. The sync manager pushes to server asynchronously.

```js
// Inside updateRow(), before the existing delete/update/create branches:
const sync = _getSyncAPI();
if (sync && sync.isLocal(app, type)) {
  if (requestType === 'delete' && id) {
    await sync.localDelete(id);
    return { response: `Deleted item ${id}` };
  } else if (id && attributeKeys.length > 0) {
    await sync.localUpdate(id, row);
    return { message: `Update successful: id ${id}.` };
  } else if (attributeKeys.length > 0) {
    const newId = await sync.localCreate(app, type, row);
    return { response: 'Item created.', id: newId };
  }
}
```

**Return shapes match existing Falcor responses:** `{response, id}` for create, `{message}` for update, `{response}` for delete. Calling components (wrapper.jsx `apiUpdate`, dmsPageFactory action) see no difference.

**`updateType` flow:** Changes an item's `type` column (not data). Rare admin operation — passes through to Falcor even for synced types. The sync manager's `localUpdate` only handles data.

**DMS-format attribute handling:** The existing `updateDMSAttrs()` pre-processing (which splits dms-format child items into separate create/update calls) still works — each child create/update goes through `updateRow()` again and hits the sync intercept if the child type is synced.

#### 3e. Lazy sync module reference — `_setSyncAPI()` setter ✅

**File:** `packages/dms/src/api/index.js`

To avoid importing sync code when sync is disabled, use a setter pattern. The DmsSite component calls `_setSyncAPI()` after `initSync()` resolves (step 3b).

```js
// At top of api/index.js:
let _syncAPI = null;

export function _setSyncAPI(api) { _syncAPI = api; }
function _getSyncAPI() { return _syncAPI; }
```

This avoids:
- Circular imports (sync/ imports from api/, api/ would import from sync/)
- Top-level dynamic imports (messy async at module scope)
- Loading sync code when `VITE_DMS_SYNC` is not set

The setter is called from `dmsSiteFactory.jsx` after sync init completes. Before that point, `_getSyncAPI()` returns null and all requests go through Falcor normally.

#### 3f. Handle `dms-format` child items — load sections from local SQLite ✅

The `dms-format` attribute type causes `processNewData` → `loadDmsFormats()` to recursively fetch child items (e.g., a page's `sections` attribute references section items by ID). These child items are also synced types (e.g., `docs-page|cms-section`), so they're in local SQLite too.

In `loadFromLocalDB`, after loading the primary items, check for `dms-format` attributes and load their children from local SQLite:

```js
// For each item, resolve dms-format attributes (e.g., sections)
const dmsAttrsConfigs = Object.entries(format.attributes || {})
  .filter(([_, cfg]) => cfg.type === 'dms-format');

for (const item of items) {
  for (const [key, attrConfig] of dmsAttrsConfigs) {
    if (item[key] && Array.isArray(item[key])) {
      // item[key] is array of {id: N} refs — load each from local SQLite
      const childIds = item[key].map(ref => ref.id || ref).filter(Boolean);
      if (childIds.length > 0) {
        const placeholders = childIds.map(() => '?').join(',');
        const children = await sync.exec(
          `SELECT * FROM data_items WHERE id IN (${placeholders})`,
          childIds
        );
        const childMap = new Map(children.rows.map(r => [r.id, r]));
        item[key] = item[key].map(ref => {
          const refId = ref.id || ref;
          const child = childMap.get(refId);
          if (!child) return ref; // not in local DB, leave as-is
          const parsed = typeof child.data === 'string'
            ? JSON.parse(child.data) : (child.data || {});
          return {
            ...(typeof ref === 'object' ? ref : { id: ref }),
            ...parsed,
            id: child.id,
            created_at: child.created_at,
            updated_at: child.updated_at,
          };
        });
      }
    }
  }
}
```

If a child item isn't in local SQLite (not synced or not yet bootstrapped), the ref is left as-is — the component can handle the unresolved ref gracefully or a subsequent load will fill it in.

#### 3g. Trigger re-render on sync changes — `router.revalidate()` ✅

When the sync manager receives a WebSocket change notification, it invalidates scopes. But DMS route loaders only re-run when React Router triggers navigation. Solution: call `router.revalidate()` when sync receives remote changes.

**File:** `packages/dms/src/render/spa/dmsSiteFactory.jsx`

```jsx
// Inside DmsSite, after sync is initialized:
useEffect(() => {
  if (!_syncAPI) return;

  const unsub = _syncAPI.onInvalidate((scope) => {
    // Re-run all active route loaders — they now read from updated local SQLite
    if (router) {
      router.revalidate();
    }
  });

  return unsub;
}, [_syncAPI, router]);
```

`router.revalidate()` is the React Router 7 way to re-run all active loaders without changing the URL. Cleanest integration — no custom event bus, no forceUpdate, no manual state management.

#### 3h. Status UI — `SyncStatus.jsx` ✅

**New file:** `packages/dms/src/sync/SyncStatus.jsx`

A minimal fixed-position indicator showing connection state (connected/syncing/disconnected) and pending mutation count.

```jsx
import React, { useState, useEffect } from 'react';
import { onStatusChange, getPendingCount } from './sync-manager.js';

export default function SyncStatus() {
  const [status, setStatus] = useState('disconnected');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const unsub = onStatusChange(async (s) => {
      setStatus(s);
      setPending(await getPendingCount());
    });
    return unsub;
  }, []);

  const colors = {
    connected: 'bg-green-500',
    syncing: 'bg-yellow-500',
    disconnected: 'bg-red-500',
  };

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5
                    bg-white/90 rounded-full shadow-sm text-xs text-gray-600 z-50">
      <div className={`w-2 h-2 rounded-full ${colors[status] || colors.disconnected}`} />
      {status === 'syncing' && pending > 0 ? `Syncing (${pending})` : status}
    </div>
  );
}
```

Rendered conditionally in `DmsSite`:
```jsx
{syncActive && <SyncStatus />}
```

---

**Files to create:**

| File | Description |
|------|-------------|
| `packages/dms/src/sync/SyncStatus.jsx` | Connection status indicator component |

**Files to modify:**

| File | Change |
|------|--------|
| `packages/dms/src/api/index.js` | `_setSyncAPI`/`_getSyncAPI` setter, sync intercept in `dmsDataLoader`, sync intercept in `dmsDataEditor`'s `updateRow`, `loadFromLocalDB` helper with dms-format child resolution |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | `DMS_SYNC_ENABLED` flag, `useEffect` for `initSync` + `_setSyncAPI`, `useEffect` for `onInvalidate` → `router.revalidate()`, conditional `<SyncStatus />` render |

**Files unchanged:**

- All pattern code (page, admin, datasets, forms, auth siteConfigs)
- `wrapper.jsx` — calls `apiUpdate`/`apiLoad` which go through `api/index.js`
- `dmsPageFactory.jsx` — calls `dmsDataLoader`/`dmsDataEditor` from `api/index.js`
- All Falcor routes on server
- Sync modules (sync-manager, worker, db-client, sync-scope, yjs-store)

**Verification:**

1. **Without sync** (`VITE_DMS_SYNC` unset): App works identically. No sync code loaded, `_getSyncAPI()` returns null.
2. **With sync** (`VITE_DMS_SYNC=1`):
   - Start dms-server with sync enabled
   - Open site — sync bootstraps, status indicator shows "connected"
   - Navigate between pages — data loads from local SQLite (instant)
   - Edit a page — write goes to local SQLite, pushes to server async
   - Open second tab — edits appear via WebSocket → `router.revalidate()`
   - Kill server — edits still work locally, pending indicator shows count
   - Restart server — pending mutations flush, status returns to "connected"
3. **Non-synced types** (split-table dataset rows, UDA queries): Continue through Falcor unchanged.

### Phase 3.6: Reference resolution + delta propagation

The DMS data model uses `dms-format` attributes to store parent→child references as `{id, ref}` objects inside the parent's `data` JSON. The API resolves these at read time (replacing refs with full child data) and decomposes them at write time (saving children as separate rows, storing only refs on the parent).

See `research/dms-reference-resolution.md` for full technical details on how the Falcor and sync paths handle this.

#### Current state

- [x] **Read path** — `loadFromLocalDB()` in `api/index.js` resolves `dms-format` refs from local SQLite. When loading a page, its `sections`/`draft_sections` refs are replaced with the full section data from local SQLite.
- [x] **Write path** — `dmsDataEditor` sync intercept handles `dms-format` children: updates/creates each child item via `sync.localUpdate`/`sync.localCreate`, then stores only `{id, ref}` on the parent.
- [ ] **Delta propagation to parents** — When a delta arrives for a child item (e.g., section ID 1437255 is updated), the parent page that references it doesn't know about the change. The parent's `data.sections[].id` hasn't changed — only the child row's `data` column changed. `router.revalidate()` fires on any delta, which re-runs `loadFromLocalDB` and re-resolves refs, but this is a brute-force approach.
- [x] **`history` refs (page-edits)** — After history consolidation (1 page-edit row per page), `|page-edit` types are no longer excluded from sync. History refs resolve from local SQLite like any other dms-format attribute.

#### Problem: delta propagation for child items

DMS `dms-format` attributes create a parent→child reference graph:

```
Page (type: doc_type)
  ├── sections: [{id: 100, ref: 'app+doc_type|cms-section'}]
  └── draft_sections: [{id: 100, ref: 'app+doc_type|cms-section'}]

Section (type: doc_type|cms-section, id: 100)
  └── data: {element: {element-type: 'Lexical', element-data: '...'}}
```

When section 100 is updated (by another user, or from a sync delta), the page that holds `sections: [{id: 100}]` needs to re-render with the new section content. Currently:

1. Delta arrives via WebSocket → sync manager writes updated section to local SQLite
2. `router.revalidate()` fires → `dmsDataLoader` re-runs → `loadFromLocalDB` re-queries local SQLite
3. `loadFromLocalDB` re-resolves all `dms-format` refs → picks up the updated section data
4. React sees new data → component re-renders

**This already works** because `router.revalidate()` is a full revalidation that re-runs all active loaders. The concern is efficiency — every delta revalidates everything. For now this is acceptable.

#### Tasks

- [x] **3.6a. Page-edit refs now included in sync** — After consolidating page history (1 row per page instead of N), `|page-edit` types are no longer excluded from sync. Removed `isSyncExcluded` special-casing for `|page-edit` in server (`sync.js`) and client (`api/index.js` `syncExcludedSuffixes`). History refs are now resolved from local SQLite like sections.

- [x] **3.6b. Verify delta → parent re-render works end-to-end** — Test: open page with sections in browser, update a section from a second client (or directly in DB), confirm the first client sees the update appear. The path: delta → local SQLite write → `router.revalidate()` → `loadFromLocalDB` re-resolves refs → React re-renders.

- [ ] **3.6c. (Future optimization) Targeted invalidation** — Instead of revalidating all loaders on every delta, maintain a reverse index (`childId → parentType`) built during bootstrap. When a delta arrives for a child item, only revalidate routes whose type matches a parent that references that child. Low priority — brute-force revalidation is fast enough for typical page counts.

#### Reference resolution flow summary

**Reading (local sync path):**
```
loadFromLocalDB(sync, app, type, format, dmsAttrsConfigs)
  1. SELECT * FROM data_items WHERE app=? AND type=?  → raw rows
  2. For each row, flatten: {...JSON.parse(data), id, app, type, created_at, ...}
  3. For each dms-format attribute (sections, draft_sections):
     a. Collect child IDs from refs: [{id: 100}, {id: 101}] → [100, 101]
     b. SELECT * FROM data_items WHERE id IN (100, 101)
     c. Replace each {id, ref} with {id, ref, ...childData, created_at, ...}
  4. Return flattened, resolved items
```

**Writing (local sync path):**
```
dmsDataEditor sync intercept:
  1. Separate dms-format attributes from parent row
  2. For each child in dms-format data:
     a. Strip metadata (id, ref, created_at, ...)
     b. If has id: sync.localUpdate(childId, childData)
     c. If no id: sync.localCreate(childApp, childType, childData) → newId
     d. Build ref: {ref: 'app+type', id: childId}
  3. Parent row now has refs only: {sections: [{ref: '...', id: 100}]}
  4. sync.localUpdate(parentId, parentRow) or sync.localCreate(...)
  5. Sync manager pushes to server → server saves → broadcasts delta
```

**Delta propagation:**
```
WebSocket delta arrives (child section updated):
  1. sync-manager writes updated child to local SQLite
  2. sync-manager fires onInvalidate callback
  3. dmsSiteFactory's useEffect calls router.revalidate()
  4. React Router re-runs all active loaders
  5. dmsDataLoader → loadFromLocalDB re-queries and re-resolves refs
  6. React sees new data in loader result → re-renders
```

### Bugs fixed during sync + history consolidation testing

1. **Yjs doc not seeded on `localUpdate` — wiped page data (title, etc.)** — `localUpdate` called `applyLocal(id, data)` which creates a new empty Yjs doc if none exists. After page refresh (in-memory Yjs docs lost) or for rows added after bootstrap, partial updates like `{ draft_sections, has_changes }` would become the entire `data` column, destroying `title` and all other fields. **Fix:** `localUpdate` now reads existing SQLite row data and calls `initFromData()` before `applyLocal()` when the Yjs doc is uninitialized. (`sync-manager.js`)

2. **`history.push is not a function` in sectionGroup.jsx** — Old code treated `item.history` as an array (pre-consolidation format). After consolidation, history is a single dms-format ref with `entries[]` inside. **Fix:** Imported `appendHistoryEntry` from `editFunctions.jsx` and replaced old pattern. (`sectionGroup.jsx`)

3. **Same issue in componentsIndexTable.jsx** — Old `history.push()` pattern. **Fix:** Same — imported `appendHistoryEntry`, replaced array push with iterative `appendHistoryEntry` calls. (`componentsIndexTable.jsx`)

4. **Same issue in template/edit.jsx** — Old pattern in `saveHeader`/`saveSection`. **Fix:** Updated to use `appendHistoryEntry`. (Note: these template manager pages are deprecated and don't render, but fixed for correctness.)

5. **Page-edit sync exclusion preventing history from loading** — `|page-edit` types were excluded from sync bootstrap/delta (server SQL `NOT LIKE '%|page-edit'` + client `syncExcludedSuffixes`). After consolidation (1 row per page), these should be included. **Fix:** Removed all page-edit exclusions from `sync.js` (4 SQL queries) and `api/index.js` (client-side skip logic).

6. **`appendHistoryEntry` crash: `existingHistory.entries is not iterable`** — Used truthy check instead of `Array.isArray`. **Fix:** Changed to `Array.isArray(existingHistory?.entries)`. Also refactored to return only `{ id?, entries }` without spreading resolved ref metadata, preventing Immer merge errors in wrapper.jsx.

7. **New pages not showing until refresh** — `dmsDataEditor` create path only invalidated `['dms', 'data', 'app+type', 'length']`. **Fix:** Changed to invalidate full `['dms', 'data', 'app+type']` (matches update path). (`api/index.js`)

8. **HTML nesting violation in historyPane.jsx** — `<div>` inside `<p>` for comment display. **Fix:** Changed to `<span className="block">`. (`historyPane.jsx`)

9. **Map component calling onChange in view mode — infinite save loop** — Map's `ComponentRegistry/map/index.jsx` has a `useEffect` that calls `onChange(state)` when `!isEqual(value, state)`. In view mode, `state` is constructed by cherry-picking keys from `value`, so it always differs (missing `height`, `isEdit`, `zoomPan`). This triggered `saveIndex` → debounced auto-save → `updateSections` → save all 30 sections on every render. **Fix:** Added `isEdit` guard: `if (isEdit && onChange && !isEqual(value, state))`. (`map/index.jsx`)

10. **`apiUpdate` navigate triggering loader re-runs after section save** — `updateSections` called `apiUpdate` which called `navigate(samePath)`, re-running the React Router loader after every section save. With sync, this amplified the loop (save → navigate → loader → re-render → save). **Fix:** Added `skipNavigate` option to `apiUpdate` (defaults to `false`), used by `updateSections` to skip the navigate call. (`wrapper.jsx`, `sectionGroup.jsx`)

11. **All sections saved when only one changed** — `updateSections` sends the entire `draft_sections` array to `dmsDataEditor`, which iterates and saves each section individually (via `updateDMSAttrs` for Falcor, or the sync intercept for local-first). With 30 sections, this means 30 Falcor calls or 30 `localUpdate` + `pushMutation` pairs. **Fix:** Added `_dirty` flag pattern — `sectionArray.jsx` marks sections with `_dirty: true` when explicitly modified (via `save()` or `saveIndex()`). Both `updateDMSAttrs.js` (Falcor path) and the sync intercept in `api/index.js` skip sections without `_dirty`, just preserving their refs. Reduces a 30-section save to 1 section write + 1 page metadata write. (`sectionArray.jsx`, `updateDMSAttrs.js`, `api/index.js`)

### Phase 4: Lexical live sync — IN PROGRESS

Two approaches are available, proven in toy-sync:

#### Option A: Remount pattern (LWW, simpler)

Apply the Lexical remount pattern from the initial toy-sync Lexical integration:

1. Remote update arrives for a section that's currently being edited
2. Increment `remoteVersion` for that section
3. Lexical remounts with the new content via `key={remoteVersion}`
4. `remountingRef` suppresses the post-remount onChange

**Tradeoff**: Simple, no server Yjs infrastructure needed. But destructive — loses cursor position, undo history, and causes visible flicker on every remote edit. Concurrent edits to the same section cause last-write-wins data loss.

#### Option B: CollaborationPlugin (character-level, proven in toy-sync)

Use `@lexical/yjs` CollaborationPlugin with a custom provider (same as toy-sync's `ToyProvider` pattern):

1. Section editor mounts → provider joins item room via WS
2. Yjs sync protocol bootstraps (server sends state vector + full state)
3. Local keystrokes → Yjs binary updates → WS relay → other clients
4. Remote keystrokes arrive through Yjs binding — no remount, no flicker

**Requires**: Server-side Y.Doc management + `yjs_states` persistence (included in Phase 1 schema), `LexicalCollaboration` context wrapper, Vite aliases for `yjs`/`y-protocols`, custom provider class exposing `awareness`/`connect()`/`disconnect()`/`on()`/`off()`.

**Key implementation details** (from toy-sync collab):
- `initialEditorState` must be `null` on `LexicalComposer` (Yjs manages state)
- `shouldBootstrap={true}` seeds empty docs with a default paragraph
- `LexicalCollaboration` context wrapper (from `@lexical/react/LexicalCollaborationContext`) must wrap `LexicalComposer` — missing it causes a runtime crash
- Provider must guard against duplicate WS listeners on reconnect (`_currentWS` tracking)
- Sync timeout fallback (~1s) needed for new/empty docs where server sends no sync-step2
- `items.data.description` becomes stale during collab — server should materialize Yjs state back to data column on room cleanup for non-editor views (list previews, SSR)
- The DMS editor's existing `CollaborationPlugin` code (`editor.tsx` lines 14, 151-159) is commented out and missing the `LexicalCollaboration` wrapper — both must be addressed

**Recommended**: Option B. It's proven working in toy-sync, eliminates the remount pattern's UX problems, and the server infrastructure (WS rooms, yjs_states) is being built into Phase 1 anyway.

**Phase 3 prerequisites that benefit Phase 4:**
- `skipNavigate` in `updateSections` prevents loader re-runs on every section save — without this, CollaborationPlugin's frequent onChange calls would trigger a navigate→reload loop
- `_dirty` flag ensures that when one section's Lexical content changes via collab, only that section gets saved through sync (not all 30). Critical for collab performance where edits arrive frequently.
- Map component `isEdit` guard prevents view-mode components from triggering spurious saves that would interact badly with collab's real-time updates

**Files to modify**:
- `packages/dms/src/ui/components/lexical/editor/editor.tsx` — uncomment CollaborationPlugin, add LexicalCollaboration wrapper, add `initialEditorState: null` path
- `packages/dms/src/ui/components/lexical/editor/collaboration.js` — implement real provider (replace stub)
- Section editor component — pass collab props when sync is active
- `vite.config.js` — add `yjs`/`y-protocols` resolve aliases

#### Implementation Plan (Option B — CollaborationPlugin)

- [x] **Step 1: Install `y-protocols`** — `npm install y-protocols` (awareness encoding for provider)

- [x] **Step 2: `collaboration.js`** — Replaced commented-out stub with real `DmsCollabProvider` (ported from `research/toy-sync/client/collab/toy-provider.js`):
  - `DmsCollabProvider` class with `connect()`, `disconnect()`, `on()`, `off()`, `destroy()`, `awareness`
  - Imports `getWS()` and `onWSChange()` from `sync/sync-manager.js`
  - Room lifecycle: `join-room` on connect, `leave-room` on disconnect
  - Yjs relay: `yjs-sync-step1`, `yjs-sync-step2`, `yjs-update`, `yjs-awareness`
  - Binary↔base64 encoding, `_currentWS` tracking, 1s sync timeout fallback
  - `createCollabProvider(id, yjsDocMap)` factory for CollaborationPlugin

- [x] **Step 3: `editor/index.tsx`** — Collab mode support:
  - Accepts `isCollab` and `collabId` props
  - `initialEditorState = null` when collab (Yjs manages state)
  - Skips `UpdateEditor`/`OnChangePlugin` in collab mode (renders `Editor` directly)
  - Wraps with `LexicalCollaboration` from `@lexical/react/LexicalCollaborationContext`

- [x] **Step 4: `editor/editor.tsx`** — CollaborationPlugin:
  - Uncommented `CollaborationPlugin` import
  - Imported `createCollabProvider` from `./collaboration`
  - Accepts `isCollab` and `collabId` props
  - Conditional: `isCollab ? <CollaborationPlugin ...> : <HistoryPlugin ...>`

- [x] **Step 5: `lexical/index.jsx`** — `Edit` passes `isCollab` and `collabId` through to `Editor`

- [x] **Step 6: Section richtext component** — Collab wiring:
  - Reads `sectionId` from `ComponentContext` (added in section.jsx)
  - Detects sync via `globalThis.__dmsSyncAPI?.isCollabReady?.()` (set by api/index.js)
  - Passes `isCollab` and `collabId={String(sectionId)}` to `Lexical.EditComp`

- [x] **Step 7: sync-manager.js** — Added `isCollabReady()` export, re-exported in `sync/index.js`

- [x] **Step 8: section.jsx** — Added `sectionId: value?.id` to `ComponentContext.Provider` value

- [x] **Step 9: Vite config** — No aliases needed; `yjs` and `y-protocols` are standard ESM

- [x] **Build verification** — `vite build` succeeds with all changes

#### Bug Fixes (Phase 4)

- **Content blank on re-edit, reverts on save** (2026-03-14): Root cause: `initialEditorState: null` in collab mode meant editor started empty, and no `OnChangePlugin` meant `setText` never fired so saves wrote stale content. Fix: Added `OnChangePlugin` in collab mode branch (index.tsx), pass existing value to `CollaborationPlugin`'s `initialEditorState` prop for first-time Yjs bootstrap (seeds Yjs when server doc is empty).

- **Collaborative editing not syncing between tabs** (2026-03-14): Root cause: `collaboration.js` sent `noteId` in WS messages (copy-paste from toy-sync), but the DMS server `ws.js` routes rooms by `itemId`. Rooms never matched. Fix: Global replace `noteId` → `itemId` in `collaboration.js`.

- **Text duplication on remote edits** (2026-03-14): Root cause: `LexicalComposer`'s `initialEditorState` loaded existing content AND Yjs state merged on top from the server, doubling text. Fix: Set `initialEditorState: null` on `LexicalComposer` in collab mode (Yjs is sole source of truth). Existing content is passed only to `CollaborationPlugin`'s own `initialEditorState` prop, which seeds Yjs only when the Y.Doc root is empty (first-time bootstrap).

- **Peer count showing 1 on both screens** (2026-03-14): Root cause: Client only tracked local room registrations, not actual peer count from server. Fix: Server `ws.js` broadcasts `{type: 'room-peers', itemId, count: room.size}` on `join-room` and `leave-room`. Client provider handles `room-peers` messages and calls `updateCollabPeers(itemId, count)` in sync-manager.

- **Cursor labels showing animal names instead of email** (2026-03-14): Root cause: `CollaborationPlugin` uses its own default name list (`['Cat', 'Dog', 'Rabbit', ...]`) from `LexicalCollaborationContext` — labels are controlled by `username`/`cursorColor` props on `CollaborationPlugin`, NOT by the provider's awareness state. Fix: Thread `collabUsername` (from `user.email` via `CMSContext`) and `collabCursorColor` (deterministic hash of email) from richtext component → `lexical/index.jsx` → `editor/index.tsx` → `editor.tsx` → `CollaborationPlugin`'s `username`/`cursorColor` props.

#### Additional Implementation (Phase 4)

- [x] **Collab room tracking in sync-manager** — `_activeCollabRooms` Map (itemId → peerCount), `registerCollabRoom()`, `unregisterCollabRoom()`, `updateCollabPeers()`, `getCollabInfo()`, `onCollabChange()` exports

- [x] **SyncStatus collab indicator** — `SyncStatus.jsx` shows people icon + peer count when collab rooms are active, uses `onCollabChange` listener

- [x] **Server room-peers broadcast** — `ws.js` broadcasts `room-peers` with actual room occupancy count on `join-room` and `leave-room` events

- [x] **Auth email for cursor labels** — richtext component reads `user.email` from `CMSContext`, passes as `collabUsername` prop; `emailToColor()` helper generates deterministic cursor color from email hash. Falls back to CollaborationPlugin's default animal names when no auth.

- [x] **OnChangePlugin in collab mode** — Required so Yjs-driven changes flow back to parent component via `setText` for saving. Without it, saves write stale/empty content.

#### What remains (Phase 4)

- [x] **Yjs state persistence** — Already implemented in ws.js: `getOrCreateYDoc()` loads from `yjs_states` on room join, `scheduleFlush()` debounces writes (2s), `cleanupRoom()` flushes + destroys Y.Doc on last client leave. Verified working with integration tests.
- [x] **Integration testing** — 7 new tests added to `test-sync.js` (23 assertions): join-room sync protocol, two-client Yjs sync, peer count updates, Yjs persistence to DB, state restoration on rejoin, echo suppression, awareness relay. All 75 tests pass (16 existing + 7 new).
- ~~**Yjs state materialization**~~ — Not needed: DMS uses explicit save/cancel, so content flows back to `data_items` through the normal save pipeline on save, and is discarded on cancel. Auto-materialization was a toy-sync concern (auto-save UX).

### Phase 5: Offline resilience + edge cases — ✅ COMPLETE

Harden the sync system for production use:

- [x] **Stale delta threshold**: If delta since last sync is too large (>1000 changes), do a full re-bootstrap instead. `STALE_DELTA_THRESHOLD = 1000` in sync-manager.js, checked in `bootstrapPattern()`, `bootstrapFull()`, and `catchUp()`.
- [x] **Compaction**: Server periodically compacts old change_log entries. `startCompaction(db, dbType)` in sync.js, configurable via `DMS_SYNC_COMPACT_DAYS` (default 30) and `DMS_SYNC_COMPACT_INTERVAL` (default 6h). Wired in index.js.
- [x] **Auth on sync endpoints**: `DMS_SYNC_AUTH=1` env var gates 401 responses on unauthenticated REST sync requests. WS auth deferred.
- [ ] **Multi-tab coordination** — Deferred to Phase 5b. BroadcastChannel leader election is complex; current behavior (multiple WS connections per tab) works correctly.
- [x] **Yjs document lifecycle**: Already implemented in ws.js (`cleanupRoom` flushes + destroys Y.Doc on last client leave, `getOrCreateYDoc` lazy-creates on room join).
- [x] **Error recovery**: Worker `type: 'reset'` handler drops all tables and re-creates schema. `db-client.js` exports `resetDB()`. `sync-manager.js` exports `resetAndRebootstrap()` which clears scope, resets DB, and re-runs bootstrap.
- ~~**Per-app table mode (`DMS_SPLIT_MODE=per-app`)**~~ — Already fixed in Phase 3 (see bug fix "Sync routes ignored per-app table splitting"). `sync.js` now uses `mainTable(app)` via `resolveTable()` from `table-resolver.js`.

#### Documentation — ✅ COMPLETE

- [x] **CLAUDE.md for client sync** — Created `packages/dms/src/sync/CLAUDE.md`
- [x] **CLAUDE.md for server sync** — Created `packages/dms-server/src/routes/sync/CLAUDE.md`
- [x] **Sync documentation** — Created `dms/documentation/sync.md`

## Files Summary

### New files

| File | Description |
|------|-------------|
| `packages/dms-server/src/db/sql/dms/change_log.sql` | PG change_log + yjs_states schema |
| `packages/dms-server/src/db/sql/dms/change_log.sqlite.sql` | SQLite change_log + yjs_states schema |
| `packages/dms-server/src/routes/sync/sync.route.js` | Sync REST endpoints |
| `packages/dms-server/src/routes/sync/sync.controller.js` | Sync query logic |
| `packages/dms-server/src/routes/sync/ws.js` | WebSocket manager |
| `packages/dms-server/tests/test-sync.js` | Sync integration tests |
| `packages/dms/src/sync/index.js` | Client sync public API |
| `packages/dms/src/sync/worker.js` | wa-sqlite Web Worker |
| `packages/dms/src/sync/db-client.js` | SQL proxy via postMessage |
| `packages/dms/src/sync/sync-manager.js` | Sync orchestration |
| `packages/dms/src/sync/yjs-store.js` | Per-item Yjs documents |
| `packages/dms/src/sync/use-query.js` | Reactive query hook |
| `packages/dms/src/sync/query-cache.js` | Query invalidation |
| `packages/dms/src/sync/sync-scope.js` | Sync scope registry (type-based routing decisions) |
| `packages/dms/src/sync/dms-sync-loader.js` | Local-first data loader with type-based routing |
| `packages/dms/src/sync/CLAUDE.md` | Client sync module documentation |
| `packages/dms-server/src/routes/sync/CLAUDE.md` | Server sync module documentation |
| `dms/documentation/sync.md` | User/developer sync documentation |

### Modified files

| File | Change |
|------|--------|
| `packages/dms-server/src/routes/dms/dms.controller.js` | Add `appendChangeLog()`, call from create/edit/delete |
| `packages/dms-server/src/db/index.js` | Init change_log table on startup |
| `packages/dms-server/src/index.js` | Mount sync routes + WebSocket |
| `packages/dms/src/api/index.js` | Sync intercepts in loader/editor, `_dirty` flag skip in sync intercept |
| `packages/dms/src/api/updateDMSAttrs.js` | `_dirty` flag skip for Falcor path |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Init sync on startup (opt-in) |
| `packages/dms/src/dms-manager/wrapper.jsx` | `skipNavigate` option on `apiUpdate` |
| `packages/dms/src/patterns/page/components/sections/sectionGroup.jsx` | `skipNavigate: true` in `updateSections` |
| `packages/dms/src/patterns/page/components/sections/sectionArray.jsx` | `_dirty` flag on modified sections |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx` | `isEdit` guard on onChange |

| `packages/dms/src/ui/components/lexical/editor/collaboration.js` | Real `DmsCollabProvider` (replaces commented-out stub). Handles room join/leave, Yjs sync protocol, awareness, `room-peers` messages |
| `packages/dms/src/ui/components/lexical/editor/editor.tsx` | CollaborationPlugin import + conditional rendering, `collabUsername`/`collabCursorColor` props threaded to CollaborationPlugin |
| `packages/dms/src/ui/components/lexical/editor/index.tsx` | Collab mode: `initialEditorState: null`, `LexicalCollaboration` wrapper, `collabInitialState` for bootstrap, `OnChangePlugin` in collab branch, skip UpdateEditor |
| `packages/dms/src/ui/components/lexical/index.jsx` | Pass `isCollab`/`collabId`/`collabUsername`/`collabCursorColor` props through Edit component (via `...rest`) |
| `packages/dms/src/patterns/page/components/sections/section.jsx` | Add `sectionId` to `ComponentContext.Provider` |
| `packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/richtext/index.jsx` | Wire collab: check sync status, pass `isCollab`/`collabId`/`collabUsername`/`collabCursorColor` to Lexical. `emailToColor()` helper for deterministic cursor colors from `user.email` (via `CMSContext`) |
| `packages/dms/src/sync/sync-manager.js` | Add `isCollabReady()`, collab room tracking (`_activeCollabRooms`, `registerCollabRoom`, `unregisterCollabRoom`, `updateCollabPeers`, `getCollabInfo`, `onCollabChange`) |
| `packages/dms/src/sync/index.js` | Re-export `isCollabReady`, `registerCollabRoom`, `unregisterCollabRoom`, `updateCollabPeers`, `getCollabInfo`, `onCollabChange` |
| `packages/dms/src/sync/SyncStatus.jsx` | Shows collab peer count (people icon) when collab rooms are active |
| `packages/dms-server/src/routes/sync/ws.js` | Broadcasts `room-peers` with room occupancy count on `join-room` and `leave-room` |

### Unchanged

- All Falcor routes (`dms.route.js`)
- All pattern code (admin, page, datasets, forms, auth) — except section save pipeline + richtext collab above
- All UI components — except Map component fix + Lexical collab + SyncStatus above
- Table resolver / split tables
- Auth system
- UDA routes

## Dependencies

### Server (already installed)
- `ws` — WebSocket (already used by toy-sync server, needs to be added to dms-server)

### Client (new)
- `@aspect-build/rules_js` — none needed, wa-sqlite is vendored
- `wa-sqlite` / `@journeyapps/wa-sqlite` — SQLite WASM (already in parent project from toy-sync)
- `yjs` — CRDT library (already in parent project from toy-sync)
- `y-protocols` — Yjs awareness encoding (installed in Phase 4 for CollaborationPlugin)

## Testing Checklist

### Server (16 tests in test-sync.js)
- [x] change_log grows on create/edit/delete
- [x] Bootstrap returns all items for an app + correct revision
- [ ] Bootstrap with type param returns only that type's rows (including split tables)
- [x] Delta returns only changes since revision N
- [ ] Delta with type param filters to that type only
- [x] WebSocket broadcasts to subscribers on mutation
- [ ] Auth required on sync endpoints (JWT)
- [x] Split-table rows excluded from default bootstrap (no type param)

### Client
- [ ] Cold start: empty SQLite, first load fetches from server, populates locally
- [ ] Warm start: refresh page, data loads from local SQLite instantly
- [ ] Real-time sync: edit in tab A → appears in tab B within ~100ms
- [ ] Offline: kill server, make edits, restart, edits sync
- [ ] Pending mutations persist across page refresh (IDB-backed SQLite)
- [ ] Echo suppression: own writes don't cause duplicate UI updates
- [ ] Passthrough: Falcor serves data when local SQLite is empty
- [ ] Routing: synced types (pages, sections) load from local SQLite
- [ ] Routing: non-synced types (split tables, UDA) pass through to Falcor
- [ ] Sync scope registry populated at bootstrap with correct types

### Integration
- [ ] DMS site loads normally with sync enabled
- [ ] Page navigation is instant (from local SQLite)
- [ ] Section editing syncs across tabs
- [ ] Lexical content round-trips through sync without corruption
- [ ] Admin edits (pattern, page, section CRUD) sync correctly
- [ ] Existing sites work unchanged with sync disabled

## Future: Split-Table Sync

This task explicitly excludes dataset rows (split tables) from the sync scope. However, the architecture is designed so that split-table sync can be added later without rearchitecting the core. This section describes how.

### Why split tables are excluded initially

- **Size**: A single dataset can have millions of rows. Syncing all of them to every client is impractical — it would take minutes to bootstrap and consume hundreds of MB of client storage.
- **Query complexity**: UDA queries involve aggregations, GROUP BY, spatial operations (PostGIS), and multi-table joins that wa-sqlite can't handle. These queries must remain server-side.
- **Frequency**: Dataset rows are bulk-imported (CSV/Excel upload), not edited one-at-a-time. The sync protocol (optimistic write → pending queue → push) doesn't match the bulk-import workflow.

### How split-table sync could work

The sync scope registry (Phase 3a) is the extension point. Adding a split table to the sync scope would follow this pattern:

#### Opt-in per source/view

A dataset admin or the application config opts specific sources into local sync:

```js
// "Sync this dataset locally" toggle on the dataset settings page
syncManager.enableTableSync(app, type); // e.g., app='myapp', type='traffic_counts-1'
```

This would:
1. Add the type to the sync scope registry
2. Create the corresponding table in client SQLite (dynamically, matching the split table schema)
3. Bootstrap that table's data: `GET /sync/bootstrap?app=X&type=Y` (new type-scoped endpoint)
4. Subscribe to change_log entries for that type via WebSocket
5. Future reads for that type route locally instead of to Falcor

#### Size-gated sync

Not all datasets should be syncable. A reasonable gate: only allow local sync for datasets under a threshold (e.g., <10,000 rows, <10MB). The server's bootstrap endpoint would return a row count + size estimate before the client commits to syncing.

#### Query routing: local for simple, server for complex

Once a split table's data is local, some queries can be answered from client SQLite:
- **Locally answerable**: `SELECT * WHERE column = ? ORDER BY column LIMIT N` — basic filter, sort, paginate on indexed columns. These are the common table browsing queries.
- **Server-only**: `SELECT column, SUM(value) GROUP BY column` — aggregations, spatial queries, cross-table joins. These still pass through to Falcor/UDA.

The routing decision becomes query-aware, not just type-aware. The sync loader would need a query capability check: "can this specific query shape be handled by client SQLite?" A simple heuristic: if the query uses only `WHERE`/`ORDER BY`/`LIMIT` on known columns, route locally. Anything else → server.

#### Change_log integration

The change_log already includes `type` — no schema changes needed. The delta endpoint already supports type-scoped queries: `GET /sync/delta?app=X&type=Y&since=N`. WebSocket notifications already include `type` for routing. The infrastructure is ready.

#### Bulk import handling

Dataset rows are typically created via bulk upload (hundreds/thousands of rows at once), not individual edits. The sync protocol would need a bulk variant:
- Server completes upload → writes N rows to change_log (or a single "bulk" change_log entry with the full dataset snapshot)
- Server broadcasts a "table-updated" notification to subscribers for that type
- Clients re-bootstrap the table (full re-fetch) rather than applying N individual deltas
- This is simpler than streaming N individual changes and handles the "upload replaces entire version" pattern

#### Client-side schema

Client SQLite would create split tables dynamically:

```js
// When a split table is opted into sync
await exec(`CREATE TABLE IF NOT EXISTS "data_items__${sanitizedType}" (
  id INTEGER PRIMARY KEY,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
)`);
```

The table name mirrors the server's naming convention. The `table-resolver.js` logic would need a client-side counterpart to route SQL queries to the correct local table.

### What the current architecture provides for this future

| Concern | Current design | Future extension point |
|---------|---------------|----------------------|
| Routing decision | Sync scope registry (`isLocal(app, type)`) | Add split-table types to registry |
| Bootstrap | `GET /sync/bootstrap?app=X` (main table only) | Add `&type=Y` param for table-scoped bootstrap |
| Delta | `GET /sync/delta?app=X&since=N` | Add `&type=Y` filter (change_log already has `type` column) |
| WebSocket | Per-app broadcast | Type-scoped notifications (type already in change_log payload) |
| Client schema | Single `data_items` table | Dynamic table creation for split tables |
| Query routing | Type-based (local vs server) | Query-shape-aware (simple local, complex server) |

The point: nothing in the current design prevents split-table sync. The registry pattern, the type-scoped change_log, and the type-aware sync endpoints are all designed to extend naturally.

## Notes

- This task depends on the toy-sync implementation being complete (it is — see `planning/tasks/completed/toy-sync-lexical.md` and `planning/tasks/completed/toy-sync-collaborative-editing.md`)
- The research document at `planning/research/local-first-sync-engine.md` provides the theoretical foundation
- Dataset rows (split tables) are excluded from the initial sync scope but the architecture (sync scope registry, type-scoped endpoints, type column in change_log) is designed so they can be opted in later — see "Future: Split-Table Sync" section
- Character-level collaborative editing is proven in toy-sync (`research/toy-sync/client/collab/toy-provider.js`, `CollabEditor.jsx`, `server/ws.js`). Phase 4 recommends adopting CollaborationPlugin directly rather than the remount pattern — the server infrastructure (WS rooms, yjs_states) is designed to support it from Phase 1
- The DMS Lexical editor already has commented-out CollaborationPlugin scaffolding (`editor.tsx` lines 14, 151-159) and a `collaboration.js` stub — these need the `LexicalCollaboration` context wrapper and a real provider implementation
- The sync system is opt-in (`DMS_SYNC=1`), so there's zero risk to existing sites
