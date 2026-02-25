# Local-First Sync Engine — Toy Implementation

## Objective

Build a standalone proof-of-concept app that validates the core mechanics of the local-first sync architecture proposed in `planning/research/local-first-sync-engine.md`. The toy is intentionally separate from DMS to isolate and understand each moving part before integration.

## What We're Proving

1. SQLite WASM (wa-sqlite + OPFS) works reliably as a client-side database
2. Yjs `YMap` correctly merges concurrent JSON edits across clients
3. Revision-based sync protocol (bootstrap → delta → WebSocket push) keeps clients in sync
4. Passthrough pattern works — empty local DB falls through to server, populates locally, then serves future reads from local
5. Reactivity — local write → UI update → sync → other tab/client updates
6. Multi-tab coordination — two tabs don't corrupt the database

## App Concept

A simple collaborative notes app. Multiple browser tabs (or windows) can create, edit, and delete notes. Each note is a single row with a JSON `data` column, mirroring DMS's `data_items` structure.

## Data Model

### Server (SQLite via better-sqlite3)

```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL DEFAULT 'toy',
  type TEXT NOT NULL DEFAULT 'note',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE change_log (
  revision INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  action TEXT NOT NULL,          -- 'I', 'U', 'D'
  data TEXT,                     -- full JSON snapshot for I/U; NULL for D
  yjs_state BLOB,               -- compacted Yjs state vector for U
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Client (SQLite WASM via wa-sqlite)

```sql
-- Same items schema as server
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  app TEXT NOT NULL DEFAULT 'toy',
  type TEXT NOT NULL DEFAULT 'note',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

-- Sync bookkeeping
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- key='last_revision' → last synced revision number

CREATE TABLE pending_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,              -- NULL for creates (server assigns ID)
  action TEXT NOT NULL,         -- 'create', 'update', 'delete'
  data TEXT,                    -- JSON for create; Yjs update base64 for update
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Implementation

### Phase 1: Server Foundation — DONE

Express server with SQLite (better-sqlite3). No auth, minimal API.

**Endpoints**:
- `GET /api/items` — list all items
- `POST /api/items` — create item, append to change_log
- `PUT /api/items/:id` — update item data, append to change_log
- `DELETE /api/items/:id` — delete item, append to change_log
- `GET /sync/bootstrap` — return all items + current max revision
- `GET /sync/delta?since=N` — return change_log entries where revision > N
- `WebSocket /sync/subscribe` — push new change_log entries in real-time

**Design note**: Changed sync endpoints from POST to GET since they're read-only queries.

Every mutating endpoint appends to `change_log` with a revision number and broadcasts to WebSocket subscribers.

**Files**:
```
toy-sync/server/
  index.js            # Express on port 3456 + WebSocket setup
  db.js               # better-sqlite3 with WAL mode, TEXT PKs (UUID)
  routes.js           # REST CRUD + sync endpoints
  ws.js               # WebSocket broadcast manager
```

- [x] Express server with better-sqlite3
- [x] Items CRUD endpoints
- [x] change_log table + append on every mutation
- [x] `/sync/bootstrap` endpoint
- [x] `/sync/delta` endpoint
- [x] WebSocket broadcast on mutations
- [x] Verify: create/edit/delete items via curl, see change_log grow

### Phase 2: Client SQLite WASM — DONE

Get wa-sqlite running in a Web Worker with IndexedDB persistence (IDBBatchAtomicVFS).

**Design note**: Used IDBBatchAtomicVFS (async build) instead of OPFSCoopSyncVFS. Broader compatibility — works in any context, no COOP/COEP headers required for basic operation. Data persists in IndexedDB. OPFSCoopSyncVFS can be swapped in later for better multi-tab perf.

**Files**:
```
toy-sync/client/
  index.html          # Entry point
  main.jsx            # React root
  App.jsx             # Main app with init flow
  worker.js           # Web Worker hosting wa-sqlite (IDBBatchAtomicVFS)
  db-client.js        # Promise-based SQL proxy via postMessage
```

- [x] wa-sqlite WASM loading in Web Worker (async build)
- [x] IDBBatchAtomicVFS initialization
- [x] Schema creation on first load (items + sync_state + pending_mutations)
- [x] `db-client.js` proxy with Promise-based API (`exec(sql, params)`)
- [x] Vite config: react plugin, wasm plugin, top-level-await, proxy /api + /sync
- [x] Verify: Vite build succeeds (36 modules, ~300KB JS + 1.1MB WASM)

### Phase 3: Sync Manager — DONE

The core sync logic. Handles bootstrap, delta, push, and passthrough.

**Files**:
```
toy-sync/client/
  sync-manager.js     # Sync orchestration
```

**Bootstrap flow** (cold start):
1. Check `sync_state` for `last_revision`
2. If NULL → call `/sync/bootstrap` → insert all items → set `last_revision`
3. If set → call `/sync/delta?since=N` → apply changes → update `last_revision`

**Real-time flow**:
1. Connect WebSocket to `/sync/subscribe`
2. On message: apply change to local SQLite, update `last_revision`
3. On disconnect: reconnect with exponential backoff, delta-sync on reconnect

**Local write flow**:
1. Apply change to local SQLite immediately (optimistic)
2. Queue in `pending_mutations`
3. Send to server via REST
4. On success: remove from `pending_mutations`, apply any server-assigned fields (ID for creates, updated_at)
5. On failure: retry with backoff

**Passthrough** (for queries that miss locally):
1. Query local SQLite
2. If empty result and we haven't bootstrapped yet → fetch from server → insert locally → return
3. After bootstrap, trust local data

- [x] Bootstrap: full sync from server to empty client
- [x] Delta: catch-up sync from last_revision
- [x] WebSocket subscription for real-time push
- [x] Local write → pending_mutations → server push
- [x] Server confirmation → pending cleanup
- [x] Echo dedup: skip WebSocket echoes of own writes via pendingItemIds Set
- [x] Reconnection with exponential backoff + delta catch-up
- [ ] Verify: open tab, see data populate; create item, see it on server (needs browser test)

### Phase 4: Yjs Conflict Resolution — DONE (module ready, integration pending)

Add Yjs to handle concurrent edits to the `data` column.

**Files**:
```
toy-sync/client/
  yjs-store.js        # Yjs document management per item
```

**Design**:
- Each item gets a Yjs `Y.Doc` with a root `YMap` representing `data`
- Documents are created lazily on first edit
- On local edit: apply to YMap → extract binary update → store as pending mutation → materialize JSON to `data` column
- On remote update: apply binary update to local YDoc → materialize JSON to `data` column
- Yjs state (compacted) is persisted alongside the item so documents can be reconstructed after page reload

**Merge test scenario**:
- Tab A: edit note title to "Hello"
- Tab B: edit note description to "World"
- Both tabs should converge to `{ title: "Hello", description: "World" }`

- [x] `yjs-store.js`: create/get/destroy Yjs docs per item ID
- [x] Local edit → Yjs update → JSON materialization (applyLocal)
- [x] Remote update → Yjs merge → JSON materialization (applyRemote)
- [x] initFromData: initialize YDoc from existing JSON (bootstrap)
- [ ] Merge test: two tabs editing different fields (needs browser test)
- [ ] Merge test: two tabs editing the same field (LWW within Yjs) (needs browser test)
- [ ] Verify: concurrent edits merge correctly across tabs (needs browser test)

**Design note**: Server stores plain JSON snapshots — no Yjs binary on server. Yjs is client-only for merging concurrent edits. yjs-store.js is implemented but not yet wired into the sync-manager/editor flow — the current flow uses plain JSON overwrites. Yjs integration into the data flow is a follow-up task.

### Phase 5: Reactivity — DONE

Make the UI update automatically when the local database changes.

**Files**:
```
toy-sync/client/
  use-query.js        # React hook for reactive queries
```

**Approach**: Query invalidation pattern.
- `useQuery(sql, params, deps)` — runs SQL against local SQLite, returns rows
- Internally tracks which queries are active
- After any local write or sync-received change, invalidate queries matching the affected scope
- Re-run invalidated queries and trigger React re-render

**Scope keys**: For the toy app, scope is just `'items'`. In DMS this would be `app+type`.

- [x] `useQuery` hook: run SQL, return reactive result
- [x] `useMutation` hook: createNote, updateNote, deleteNote
- [x] Invalidation on local write (sync-manager fires invalidate('items'))
- [x] Invalidation on sync-received change (WebSocket handler fires invalidate)
- [ ] Verify: edit in one tab → other tab's UI updates automatically (needs browser test)

### Phase 6: UI & Integration — DONE

Wire everything together into a usable notes app.

**Features**:
- List of notes (title + preview)
- Click to edit (textarea for title + description)
- Create new note button
- Delete note button
- Connection status indicator (synced / syncing / offline)
- "Last synced" timestamp

**Files**:
```
toy-sync/client/
  components/
    NoteList.jsx
    NoteEditor.jsx
    StatusBar.jsx
```

- [x] Note list with reactive query (NoteList.jsx — sorted by updated_at DESC)
- [x] Note editor with local-first writes (NoteEditor.jsx — debounced 300ms saves)
- [x] Create / delete operations
- [x] Connection status indicator (SyncStatus.jsx — dot + label + pending count)
- [x] Dark theme CSS (style.css — no Tailwind)
- [ ] Open two tabs side by side — edits sync in real-time (needs browser test)
- [ ] Kill server — edits still work locally — restart server — edits sync up (needs browser test)
- [ ] Refresh tab — data persists from IndexedDB (needs browser test)

## Testing Checklist

- [ ] Cold start: empty browser, first load fetches from server, populates SQLite
- [ ] Warm start: refresh page, data loads from local SQLite (no server call needed)
- [ ] Real-time sync: edit in tab A → appears in tab B within ~100ms
- [ ] Concurrent edit (different fields): both edits preserved via Yjs merge
- [ ] Concurrent edit (same field): Yjs resolves deterministically (no data loss)
- [ ] Offline: kill server, make edits, restart server, edits sync to server
- [ ] Offline peer: tab A offline, tab B edits, tab A comes back, gets tab B's changes
- [ ] Create while offline: item gets temporary local ID, replaced with server ID on sync
- [ ] Delete while offline: delete queued, applied on reconnect
- [ ] Large dataset: insert 1000 items, verify query performance stays <50ms
- [ ] Multi-tab: open 3+ tabs, all stay in sync without database corruption
- [ ] OPFS persistence: close all tabs, reopen, data still there

## Tech Stack

| Component | Library | Why |
|---|---|---|
| Server | Express + better-sqlite3 | Matches DMS server stack |
| Client DB | wa-sqlite + OPFSCoopSyncVFS | Best perf, multi-connection, same SQL as server |
| CRDT | Yjs | Battle-tested, YMap for JSON, future Lexical integration |
| WebSocket | ws (server) / native WebSocket (client) | Simple, no Socket.IO overhead |
| UI | React (Vite) | Matches DMS client stack |
| Bundler | Vite | Matches DMS, good WASM/Worker support |

## Directory Structure

```
toy-sync/
  package.json
  vite.config.js
  server/
    index.js
    db.js
    routes.js
    ws.js
  client/
    index.html
    app.jsx
    worker.js           # wa-sqlite Web Worker
    db-client.js         # Promise-based SQL proxy
    sync-manager.js      # Bootstrap/delta/subscribe
    yjs-store.js         # Per-item Yjs document management
    use-query.js         # Reactive query hook
    components/
      NoteList.jsx
      NoteEditor.jsx
      StatusBar.jsx
```

## Success Criteria

The toy is "done" when you can:
1. Open two browser windows side by side
2. Create a note in window A — it appears in window B instantly
3. Edit the note title in A and description in B simultaneously — both edits merge
4. Kill the server — keep editing in both windows
5. Restart the server — both windows sync their offline edits
6. Refresh either window — all data persists from OPFS
7. All of the above feels instant (<100ms perceived latency)
