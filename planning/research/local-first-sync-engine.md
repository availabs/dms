# Local-First Real-Time Sync Engine for DMS

## Research Summary

This document surveys current local-first sync engine architectures, evaluates their fitness for the DMS data model, and proposes a specific implementation architecture.

---

## 1. Landscape Survey

### 1.1 Production Implementations

#### Linear (IndexedDB + SyncActions)

Linear treats the browser's IndexedDB as a real database. Every change happens locally first, then syncs via GraphQL mutations and WebSockets.

**Sync protocol**: Immutable `SyncAction` objects with a globally-ordered `syncId`:
```
{ id: 42, action: "U", modelName: "Issue", modelId: "abc-123", data: { ...full snapshot } }
```

**Bootstrap**: Two-stage — `full` bootstrap delivers 40+ model types as newline-delimited JSON, then `partial` defers Comments and IssueHistory. Clients track their position via `lastSyncId` and catch up through a `/sync/delta` endpoint.

**Key insight**: No CRDTs. Linear uses a last-write-wins (LWW) model with full snapshots per SyncAction. Conflict resolution is simple because the server assigns the canonical ordering via monotonic sync IDs. The client is essentially an eventually-consistent replica.

**Tradeoffs**: Simple protocol, but sends full model snapshots on every change (bandwidth). IndexedDB is universally supported but slower than SQLite for complex queries.

Sources: [Linear Rabbit Hole](https://bytemash.net/posts/i-went-down-the-linear-rabbit-hole/), [Reverse Engineering Linear's Sync](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/)

#### Figma (OT-like Server Authority)

Figma uses a server-authoritative model where the server is the single source of truth for ordering. Clients send operations, the server rebases them against its canonical state, and broadcasts the result. This is conceptually similar to Operational Transformation but applied to a tree structure rather than text.

**Key insight**: They explicitly chose NOT to use CRDTs because they wanted server authority for conflict resolution and simpler reasoning about state. The server can reject or transform operations.

Source: [Figma Multiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

#### Notion (SQLite WASM + OPFS)

Notion moved their client-side cache from IndexedDB to SQLite WASM, achieving 20% faster page navigation (up to 33% for users with slow connections).

**Architecture**: SharedWorker manages which tab owns the SQLite database. Only one tab writes at a time. Uses OPFS SyncAccessHandle Pool VFS for cross-browser compatibility. SQLite loads asynchronously and "races" against API requests — whichever returns first wins.

**Key insight**: SQLite WASM is production-ready at scale. Notion proved it works with their tens of millions of users. The SharedWorker pattern solves the multi-tab problem.

Source: [Notion WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)

#### Colanode (SQLite + Yjs CRDTs)

Colanode is an open-source collaboration platform using SQLite locally with Yjs for conflict resolution.

**Data model**: Unified "node" concept — every entity (channel, page, record) shares the same base structure with an `attributes` object. Very similar to DMS `data_items`.

**Sync protocol**: Revision-based cursor per root node. Clients poll for updates after their last known revision. Server uses PostgreSQL sequences for global ordering and Redis pub/sub for real-time push.

**Yjs integration**: Each node maps to one Yjs document. Attributes stored in a `YMap`. Binary Yjs updates are order-independent and idempotent — safe to apply multiple times or out of order.

**Client SQLite tables**:
- `nodes` — current resolved state for UI rendering
- `node_updates` — unconfirmed local mutations
- `node_states` — compacted server-confirmed state
- `mutations` — pending operations queued for sync

**Key insight**: Yjs provides automatic conflict resolution for the `data` column (which is a JSON object with nested fields), while SQLite handles efficient local querying. The revision-cursor model is simple and robust.

Sources: [Colanode Sync Engine](https://hakanshehu.com/posts/building-the-colanode-sync-engine/), [Colanode GitHub](https://github.com/colanode/colanode)

### 1.2 Sync Engine Libraries/Frameworks

#### CR-SQLite (vlcn.io)

A SQLite extension that adds CRDT support directly at the database level. Tables become "conflict-free replicated relations" (CRRs) with per-column CRDT tracking.

**How it works**: Metadata tables and triggers around existing schema. A `crsql_changes` virtual table exposes column-level changes with database version numbers. Merging is done by inserting into `crsql_changes` — cr-sqlite automatically resolves conflicts.

**Sync**: Only needs a single 64-bit integer (logical clock per peer) to determine what updates a database is missing.

**WASM**: Compiles to WASM for browser use.

**Tradeoffs**: Elegant but the project has had periods of reduced maintenance. Operates at the SQL level rather than the application level, which can make it harder to integrate custom merge logic (e.g., Yjs for rich text).

Source: [cr-sqlite](https://vlcn.io/docs/cr-sqlite/intro), [GitHub](https://github.com/vlcn-io/cr-sqlite)

#### LiveStore

Event-sourced state management with embedded SQLite. Changes are committed as events, persisted locally, and synced. "Materializers" apply events to the local database for instant reactivity.

**Key insight**: Event sourcing gives you a complete history log and the ability to replay/recompute state. But it requires defining events as a separate concept from the data model.

Source: [LiveStore GitHub](https://github.com/livestorejs/livestore)

#### PowerSync

Production-grade sync between PostgreSQL (server) and SQLite (client). Uses Postgres logical replication to stream changes. You define "Sync Rules" (SQL queries) to filter which data each client receives.

**Key insight**: Most mature production option. But it's a hosted service (or self-hosted server) that sits between your app and Postgres. It's designed for Postgres specifically, not for arbitrary backends.

Source: [PowerSync](https://www.powersync.com)

#### ElectricSQL

Postgres sync engine using CRDTs. Deep integration with PostgreSQL via extension. Currently in "open alpha" — not recommended for production. Undergoing significant rewrite as of 2024-2025.

Source: [ElectricSQL](https://electric-sql.com)

### 1.3 SQLite WASM in the Browser

#### Persistence Options

| VFS | Storage | Concurrency | Browser Support | Performance |
|-----|---------|-------------|-----------------|-------------|
| OPFSCoopSyncVFS | OPFS | Multiple connections | Chrome 108+, Safari 16.4+, Firefox 111+ | Excellent, >1GB OK |
| IDBBatchAtomicVFS | IndexedDB | Concurrent reads | Chrome 69+, Safari 15.4+, Firefox 96+ | Degrades >100MB |
| AccessHandlePoolVFS | OPFS | Single connection | Chrome 108+, Safari 16.4+, Firefox 111+ | Very fast |
| opfs-sahpool | OPFS | Single connection | Chrome 108+, Safari 16.4+, Firefox 111+ | Very fast |

**Recommendation**: OPFSCoopSyncVFS is the best general-purpose choice — excellent performance, supports multiple connections, works across modern browsers. IDBBatchAtomicVFS as fallback for older browsers.

**Key challenge**: OPFS requires a Worker context. SQLite WASM runs in a Web Worker, and a SharedWorker (or service worker) coordinates access across tabs. This is a solved problem (Notion, PowerSync both do it).

Source: [PowerSync SQLite Persistence](https://www.powersync.com/blog/sqlite-persistence-on-the-web)

#### wa-sqlite

The most commonly used SQLite WASM library. Stable, well-maintained, good VFS ecosystem. Used by Antoine's sync engine article and many local-first projects.

Source: [Antoine's SQLite Sync Engine](https://antoine.fi/sqlite-sync-engine-with-reactivity)

### 1.4 Reactive SQLite Pattern

Since SQLite has no built-in change notifications, reactivity requires a custom layer:

**Antoine's approach**: Triggers log changes to a separate table (just table name + row ID). Broadcast Channel API notifies the reactivity system, which re-queries affected data.

**LiveStore's approach**: "Materializers" — event handlers that apply changes to SQLite and track which queries are affected.

**Common pattern**: Track which UI queries depend on which tables/rows. When a write occurs, invalidate and re-run affected queries. This is conceptually identical to how React Query or SWR work, but against a local database instead of a remote API.

---

## 2. DMS-Specific Analysis

### 2.1 Why DMS is Uniquely Well-Suited

DMS has properties that dramatically simplify the local-first problem compared to general-purpose implementations:

**1. Single table schema**: Everything is `data_items` (or split tables with identical schema). One table with `id, app, type, data, created_at, created_by, updated_at, updated_by`. This means:
- No complex object graph to define or sync
- No schema migrations on the client
- Every row is independently addressable by `id`

**2. Content is hierarchical and route-addressable**: Site → Patterns → Pages/Sources → Sections/Views. The routing system already knows which `app+type` combinations a given page needs. This naturally defines sync scopes.

**3. The `data` column is the only mutable content**: The structural columns (`id`, `app`, `type`) are immutable after creation. Only `data` (a JSON object) changes. This makes it a perfect fit for a JSON-level CRDT like Yjs `YMap`.

**4. Server already has the query engine**: The DMS server has Falcor routes, UDA controllers, and SQLite/PostgreSQL adapters. The client SQLite can reuse the same query patterns.

**5. Dataset rows are already split**: Large datasets already live in their own tables. Sync can treat them as separate sync scopes — you don't need to sync a million-row dataset to view a page.

### 2.2 What Needs to Sync

| Content Type | Volume | Sync Priority | Mutability |
|---|---|---|---|
| Site record | 1 per app | Bootstrap (first) | Rare |
| Pattern records | ~5-20 per site | Bootstrap (first) | Rare |
| Page records | ~10-200 per site | Route-driven | Moderate (editing) |
| Section records | ~50-500 per site | Page-driven | Frequent (content editing) |
| Source/View records | ~5-50 per site | Datasets page | Moderate |
| Dataset rows | 0 to millions | View-driven (paginated) | Bulk publish only |

### 2.3 Sync Scope Strategy

Not all data syncs at once. The client should progressively hydrate:

1. **Route match** → determine which `app+type` pairs this page needs (site + relevant patterns)
2. **Pattern inspection** → determine which pages/sections/sources this pattern references
3. **Lazy load** → fetch remaining data as the user navigates

For a cold start (empty client database), the first page load should:
1. Fetch site + all patterns (small, ~20 rows)
2. Fetch pages matching the current route
3. Fetch sections for those pages
4. Render — then background-sync remaining pages

This matches Linear's two-stage bootstrap concept but adapted to DMS's hierarchical structure.

---

## 3. Proposed Architecture

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Tab                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │  React App   │◄──►│ Sync Manager │                   │
│  │  (UI layer)  │    │  (main thread│                   │
│  │              │    │   or worker) │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                           │
│         │  SQL queries      │  sync protocol            │
│         ▼                   ▼                           │
│  ┌──────────────────────────────────┐                   │
│  │  SQLite WASM (Web Worker)        │                   │
│  │  ┌────────────┐ ┌─────────────┐  │                   │
│  │  │ data_items  │ │ sync_state  │  │                   │
│  │  │ (+ splits) │ │ (cursors,   │  │                   │
│  │  │            │ │  pending)   │  │                   │
│  │  └────────────┘ └─────────────┘  │                   │
│  │         OPFS persistence         │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
                          │
                    WebSocket + HTTP
                          │
┌─────────────────────────────────────────────────────────┐
│                     DMS Server                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Falcor/UDA   │    │ Sync Endpoint│                   │
│  │ Routes       │    │ /sync/...    │                   │
│  │ (existing)   │    │              │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                           │
│         ▼                   ▼                           │
│  ┌──────────────────────────────────┐                   │
│  │  PostgreSQL / SQLite (server)    │                   │
│  │  data_items + change_log table   │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Core Components

#### Client-Side SQLite (wa-sqlite + OPFS)

The client runs a full SQLite database in a Web Worker using wa-sqlite with OPFSCoopSyncVFS for persistence. The database has the exact same `data_items` schema as the server:

```sql
CREATE TABLE data_items (
  id INTEGER PRIMARY KEY,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  created_by INTEGER,
  updated_at TEXT,
  updated_by INTEGER
);

-- Sync metadata
CREATE TABLE sync_cursors (
  scope TEXT PRIMARY KEY,    -- e.g., 'myapp' or 'myapp:page-type'
  last_revision INTEGER,
  last_synced_at TEXT
);

CREATE TABLE pending_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,           -- NULL for creates
  action TEXT NOT NULL,       -- 'create', 'update', 'delete'
  app TEXT,
  type TEXT,
  data TEXT,                  -- Yjs update (binary, base64) for updates; full data for creates
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Why SQLite over IndexedDB**: (1) Reuse server-side SQL queries and patterns directly. The DMS controller's `dataLength`, `dataByIndex`, `simpleFilter` etc. can run against the same schema. (2) Better performance for complex queries with joins, aggregations, filtering. (3) Virtual columns and indexes (from the split table task) work identically. (4) SQL is a universal query language — no need to learn IndexedDB's API.

#### Sync Protocol

Inspired by Linear's SyncAction model but adapted to DMS's simpler data model:

**Server-side change log** (new table):
```sql
CREATE TABLE change_log (
  revision BIGSERIAL PRIMARY KEY,   -- monotonic, globally ordered
  item_id INTEGER NOT NULL,
  app TEXT NOT NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,             -- 'I' (insert), 'U' (update), 'D' (delete)
  data JSONB,                       -- full snapshot for I/U; NULL for D
  yjs_update BYTEA,                 -- Yjs binary update for the data column (U only)
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by INTEGER
);
CREATE INDEX idx_change_log_app ON change_log (app, revision);
```

Every DMS write (create/edit/delete) appends to this log. The revision is assigned by a PostgreSQL sequence (or SQLite autoincrement), giving a total ordering.

**Sync endpoints**:
- `POST /sync/bootstrap` — Returns all rows for a given app (or scoped subset), plus the current max revision
- `POST /sync/delta?app=X&since=N` — Returns change_log entries where `app = X AND revision > N`
- `WebSocket /sync/subscribe?app=X` — Push new changes in real-time

**Client sync flow**:
1. On load, check `sync_cursors` for the app's `last_revision`
2. If NULL (cold start): call `/sync/bootstrap` with scope filter, insert all rows, set cursor
3. If stale: call `/sync/delta?since=N`, apply changes, update cursor
4. Subscribe to WebSocket for real-time push
5. On local write: apply to local SQLite immediately, queue in `pending_mutations`, send to server
6. On server confirmation: remove from `pending_mutations`, apply any server-side side effects

#### Conflict Resolution with Yjs

The `data` column is the only field that can conflict (two users editing the same row's data simultaneously). Yjs handles this perfectly:

```
Client A: edits data.title = "Hello"     → produces Yjs update [binary A]
Client B: edits data.description = "..."  → produces Yjs update [binary B]

Both updates apply to the same Yjs YMap. Result:
  { title: "Hello", description: "..." }   — both edits preserved
```

**Implementation**:
- Each `data_items` row has an associated Yjs document (created lazily on first edit)
- The Yjs document is a `YMap` mirroring the `data` JSON structure
- On local edit: apply change to Yjs doc, extract binary update, store in `pending_mutations`
- On remote change: apply Yjs update to local doc, extract resolved JSON, update `data` column
- The `data` column always reflects the current Yjs document state (materialized view)

**When NOT to use Yjs**: For bulk dataset rows (split table data), Yjs is overkill. These are published in batch and rarely edited individually. Use simple LWW (last-write-wins via `updated_at` comparison) for dataset rows.

#### Graceful Passthrough (Empty Database)

For a blank client hitting a page for the first time, the system needs to work before sync completes:

1. React component requests data via the local query layer
2. Query layer checks SQLite — table exists but no matching rows
3. **Passthrough**: Falls back to a server fetch (existing Falcor `GET` or a new REST endpoint)
4. Response is both (a) returned to the UI immediately and (b) inserted into local SQLite
5. Background sync continues to fill in the rest

This is exactly Notion's "race" pattern — the UI gets data from whichever source responds first (local SQLite or server API). Once the local database is populated, subsequent navigations are instant.

```js
async function query(sql, params) {
  // Try local first
  const local = await localDb.query(sql, params);
  if (local.rows.length > 0) return local;

  // Passthrough to server, populate local
  const remote = await fetchFromServer(app, type, params);
  await localDb.insertRows(remote);
  return remote;
}
```

#### Reactivity Layer

When SQLite changes, the UI needs to update. Two approaches, both viable:

**Option A: Trigger-based (Antoine's pattern)**
- SQLite triggers log changes to a `_changes` table (table + row ID)
- After each write, broadcast via `BroadcastChannel` / custom event
- React hooks subscribe to relevant tables and re-query

**Option B: Query invalidation (TanStack Query pattern)**
- Wrap all queries in a reactive query manager
- Track which queries depend on which `app+type` scopes
- After a write, invalidate and re-run queries matching the affected scope
- This integrates naturally with React's rendering model

**Recommendation**: Option B — it matches the existing DMS pattern where components declare what data they need (via route config `action`/`filter`) and the manager provides it. The invalidation keys are just `app+type` strings, which are already the DMS namespace.

### 3.3 Architecture Arguments — Why This Approach

**Why SQLite WASM, not IndexedDB**:
- DMS already has extensive SQLite code on the server (adapters, queries, virtual columns). Reuse is massive.
- SQLite handles complex queries (JOIN, GROUP BY, aggregate, LIKE) that IndexedDB cannot.
- UDA query patterns (`simpleFilter`, `simpleFilterLength`) can run directly against local SQLite.
- Performance is better for large datasets (OPFS-backed SQLite handles >1GB; IndexedDB degrades >100MB).
- Notion proved this works at scale.

**Why Yjs for the `data` column, not cr-sqlite or full-table CRDTs**:
- DMS rows have a single mutable JSON column (`data`). Yjs `YMap` is purpose-built for this.
- DMS already uses Lexical for rich text editing, and Lexical has first-class Yjs bindings (`yjs` + `@lexical/yjs`). This means real-time collaborative editing of section content comes almost for free.
- cr-sqlite operates at the column level, but DMS's `data` is a single JSON column — cr-sqlite would treat it as an opaque blob and use LWW, losing the ability to merge nested field edits.
- Yjs is battle-tested (Notion, Colanode, many others), well-maintained, and has excellent documentation.
- Yjs updates are binary, compact, order-independent, and idempotent — perfect for unreliable network delivery.

**Why revision-based sync (Linear/Colanode style), not event sourcing (LiveStore)**:
- DMS's data model is simple enough that we don't need event replay. The current state IS the state — there's no complex derived state.
- Revision cursors are trivial to implement and reason about. One integer per sync scope.
- Event sourcing adds complexity (event definitions, materializers, replay logic) without clear benefit for a CMS.
- The change_log table is append-only and can be compacted (delete entries older than N days once all clients have caught up).

**Why custom sync protocol, not PowerSync/ElectricSQL**:
- DMS uses both PostgreSQL and SQLite on the server. PowerSync is Postgres-only.
- DMS has a unique routing/scoping model (app+type hierarchy) that doesn't map cleanly to PowerSync's "sync rules."
- The sync logic is simple enough to build custom — it's essentially: "give me all changes after revision N for app X."
- No vendor dependency or hosted service requirement.
- DMS's single-table model eliminates the hard parts of sync (foreign keys, cascades, schema migrations).

**Why scoped/progressive sync, not full replication**:
- A site might have thousands of pages and millions of dataset rows. Full replication is impractical.
- Route-driven sync means you only fetch what's needed for the current view.
- Background sync fills in the rest for instant subsequent navigation.
- Dataset rows are explicitly excluded from full sync — they're fetched on demand (paginated) just like DAMA mode.

### 3.4 Implementation Phases (Toy → Production)

#### Toy Version (standalone, outside DMS)

A minimal proof-of-concept to validate the core mechanics:

**Scope**: A simple todo/notes app with:
- SQLite WASM in browser (wa-sqlite + OPFS)
- Express server with SQLite backend
- Single `items` table: `id, data (JSON), updated_at`
- Yjs for `data` column conflict resolution
- WebSocket for real-time sync
- Revision-based change log
- Two browser tabs editing the same item simultaneously

**Goals**:
1. Prove SQLite WASM + OPFS works reliably
2. Prove Yjs `YMap` merges JSON edits correctly
3. Prove the revision-cursor sync protocol works
4. Prove the passthrough pattern works (empty DB → server fetch → local insert)
5. Prove reactivity (local write → UI update → sync → other tab updates)
6. Measure performance: query latency, sync latency, storage size

**Key files**:
```
toy-sync/
  server/
    index.js          # Express + WebSocket server
    db.js             # SQLite database + change_log
    sync.js           # Bootstrap/delta/subscribe endpoints
  client/
    worker.js         # SQLite WASM in Web Worker
    sync-manager.js   # Sync protocol (bootstrap, delta, subscribe)
    yjs-store.js      # Yjs document management per row
    query.js          # Reactive query layer
    app.jsx           # Simple React UI
```

#### DMS Integration (after toy is proven)

1. Add `change_log` table to DMS server schema
2. Add change_log writes to DMS controller (create/edit/delete already go through a single path)
3. Add `/sync/bootstrap`, `/sync/delta` endpoints
4. Add WebSocket `/sync/subscribe` alongside existing Falcor
5. Build client-side SQLite layer (wa-sqlite Web Worker)
6. Build sync manager (reuse Falcor for passthrough, new endpoints for sync)
7. Wire reactive query layer into existing DMS component data loading
8. Add Yjs integration for section content editing (connects to Lexical)

---

## 4. Open Questions

- **Multi-tab coordination**: Should we use Notion's SharedWorker pattern, or can we use BroadcastChannel to elect a "leader" tab? SharedWorker is simpler but has Safari quirks.
- **Yjs document lifecycle**: Do we keep a Yjs doc in memory for every synced row, or only for rows currently being edited? Memory pressure matters for large sites.
- **Authentication**: Sync endpoints need the same auth as Falcor routes. JWT tokens are already available — pass them via WebSocket handshake headers.
- **Compaction**: How aggressively should the server compact the change_log? Keep N days? Keep until all known clients have acknowledged? Colanode compacts Yjs updates into single state snapshots — we should do the same.
- **Offline duration**: How long can a client be offline before a full re-bootstrap is cheaper than a delta sync? Linear uses `lastSyncId` comparison — if the delta is too large, bootstrap instead.

---

## 5. References

### Articles
- [I Went Down the Linear Rabbit Hole](https://bytemash.net/posts/i-went-down-the-linear-rabbit-hole/) — Linear's local-first architecture overview
- [Reverse Engineering Linear's Sync Magic](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) — SyncAction protocol, bootstrap, delta sync
- [How Figma's Multiplayer Technology Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — Server-authoritative OT approach
- [SQLite Sync Engine with Reactivity](https://antoine.fi/sqlite-sync-engine-with-reactivity) — wa-sqlite, triggers, BroadcastChannel
- [Building the Colanode Sync Engine](https://hakanshehu.com/posts/building-the-colanode-sync-engine/) — Yjs + SQLite + revision cursors
- [How Notion Sped Up with WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite) — Production SQLite WASM at scale
- [SQLite Persistence on the Web (2025)](https://www.powersync.com/blog/sqlite-persistence-on-the-web) — VFS comparison, OPFS details
- [Architecture Shift: Local-First in 2026](https://dev.to/the_nortern_dev/the-architecture-shift-why-im-betting-on-local-first-in-2026-1nh6) — Industry trends
- [Creating the Local First Stack](https://www.ersin.nz/articles/creating-the-local-first-stack) — CR-SQLite + Connect RPC proof of concept

### Libraries & Tools
- [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) — SQLite WASM with multiple VFS options
- [Yjs](https://github.com/yjs/yjs) — CRDT library for collaborative editing
- [cr-sqlite](https://github.com/vlcn-io/cr-sqlite) — CRDT extension for SQLite
- [LiveStore](https://github.com/livestorejs/livestore) — Event-sourced reactive SQLite
- [Colanode](https://github.com/colanode/colanode) — Open-source local-first collaboration platform
- [Linear Sync Engine (reverse-engineered)](https://github.com/backupManager/reverse-linear-sync-engine-dev) — TypeScript implementation of Linear's protocol
- [PowerSync](https://www.powersync.com) — Production Postgres ↔ SQLite sync
- [ElectricSQL](https://electric-sql.com) — Postgres sync with CRDTs (alpha)
- [sqlite-sync](https://github.com/sqliteai/sqlite-sync) — CRDT-based SQLite sync extension
