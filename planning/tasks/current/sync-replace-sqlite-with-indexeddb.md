# Replace wa-sqlite with Direct IndexedDB in Local-First Sync

## Status: NOT STARTED — blocked on [`sync-bring-up-to-date.md`](./sync-bring-up-to-date.md)

## Objective

Remove the wa-sqlite WASM SQL layer from the client sync module and query IndexedDB directly, to reduce first-load latency. The goal is not "SQLite vs. IndexedDB" as two storage engines — **sync already persists to IndexedDB today** (wa-sqlite's `IDBBatchAtomicVFS` runs a SQL engine on top of IndexedDB as its storage backend). This task removes that SQL-engine-on-top-of-IndexedDB layer and talks to IndexedDB natively instead.

**Sequencing**: this must come after `sync-bring-up-to-date.md`. Rewriting the storage layer underneath query logic that hasn't been re-validated against the current type scheme and multi-tenant mode means re-doing this work once that audit inevitably changes something.

## Why (evidence, not assumption)

- The wa-sqlite WASM binary in this project's own `dist/` build is **2.2MB uncompressed** (`wa-sqlite-async-*.wasm`). Before any local read can happen, the client must: fetch that binary, instantiate/compile it inside a Web Worker (`sync/worker.js` imports `@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs`), then have `IDBBatchAtomicVFS` bootstrap its own page-file emulation on top of IndexedDB. Every subsequent read is also a `postMessage` round trip through `db-client.js` to the worker.
- **The actual SQL usage doesn't need a SQL engine.** Every live statement in `sync-manager.js` was enumerated (see `sync-bring-up-to-date.md` Phase 1 for the exact list) and every one is either: an exact-key lookup by `id`, an exact `(app, type)` match, a `type LIKE type || '|%'` prefix scan, or a plain key-value get on `sync_state`/`pending_mutations`. **No joins, no GROUP BY, no aggregates beyond `COUNT(*)`.** These map directly onto IndexedDB's native compound-index range queries.
- `use-query.js` — the one module that exposes *arbitrary* SQL as a public API (`useQuery(sql, params, deps, scope)`) — has **zero call sites** anywhere in the pattern components (confirmed by grep across `packages/dms/src`). It is unused capability, not a real requirement.
- No `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers are configured in `vite.config.js` — confirmed the project is using the **async** wa-sqlite build (`wa-sqlite-async.mjs`, not the OPFS/SharedArrayBuffer sync build), so there is no COOP/COEP requirement to remove as a side benefit here. Don't claim that as a win; it isn't one in this codebase.

## Scope

**In scope**: the client-side local storage/query layer only — `sync/worker.js`, `sync/db-client.js`, `sync/sync-manager.js`'s SQL statements, `sync/use-query.js`, the `@journeyapps/wa-sqlite` dependency, and associated docs.

**Out of scope**: the wire protocol between client and server (`/sync/bootstrap`, `/sync/delta`, `/sync/push`, WebSocket messages) is unchanged — the client still speaks the same protocol, it just persists what it receives differently. `routes/sync/sync.js` and `routes/sync/ws.js` are not touched by this task. Yjs (`yjs-store.js`) is unaffected in design (already a simple in-memory + persisted-blob structure) but its integration points with the new storage layer need to be re-wired mechanically.

## Current State

### Storage schema (`sync/worker.js`, `CREATE TABLE` statements)

Three SQLite tables:
- `data_items (id INTEGER PRIMARY KEY, app TEXT NOT NULL, type TEXT NOT NULL, data TEXT, ...)` — the synced content mirror
- `sync_state (key TEXT PRIMARY KEY, value TEXT)` — revision tracking per scope (`rev:skeleton:<siteType>`, `rev:pattern:<patternInstance>`)
- `pending_mutations (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, action TEXT, ...)` — offline write queue

### Query surface (`sync-manager.js`) — exhaustive as of this audit

| # | Statement | Shape |
|---|---|---|
| 1 | `SELECT value FROM sync_state WHERE key = ?` | exact key get |
| 2 | `SELECT id, data FROM data_items WHERE app = ? AND type = ?` | exact `(app,type)` match |
| 3 | `SELECT DISTINCT app, type FROM data_items WHERE app = ?` | scan by `app` |
| 4 | `SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type LIKE ? \|\| '\|%')` (×2: bootstrap + delta) | exact-or-prefix match on `(app,type)` |
| 5 | `SELECT last_insert_rowid() AS id` | last-inserted-id after an insert |
| 6 | `SELECT app, type, data FROM data_items WHERE id = ?` | exact key get |
| 7 | `SELECT app, type FROM data_items WHERE id = ?` | exact key get |
| 8 | `SELECT id FROM pending_mutations WHERE item_id = ? AND action = ? ORDER BY id ASC LIMIT 1` | filtered scan + order + limit |
| 9 | `SELECT COUNT(*) as count FROM pending_mutations WHERE item_id = ?` | filtered count |
| 10 | `SELECT COUNT(*) as count FROM pending_mutations` | full count |
| 11 | `SELECT * FROM pending_mutations ORDER BY id ASC` | full scan ordered by key |

Every one of these is expressible with `get`/`getAll`/`count`/`openCursor` against a well-chosen `keyPath` + compound index, with **no** query the app actually issues requiring anything IndexedDB can't do natively.

### `use-query.js`

Generic `useQuery(sql, params, deps, scope)` React hook. **Zero call sites in `packages/dms/src`.** Confirm no downstream site (`src/themes/*`, or any other repo that vendors this submodule) imports it before deleting — this repo's own tree shows none, but the submodule is consumed elsewhere.

## Proposed Changes — Phased Plan

### Phase 1: Design the IndexedDB schema

- [ ] `data_items` object store: `keyPath: 'id'`. Indexes:
  - `by_app` on `app` (single-field) — covers statement #3
  - `by_app_type` compound index on `[app, type]` — covers statements #2, #6 (well, #6 is a primary-key get, no index needed), and the prefix case in #4
  - For the `type = ? OR type LIKE ? || '|%'` case (#4): IndexedDB has no `LIKE`, but a compound index range query (`IDBKeyRange.bound([app, prefix], [app, prefix + '￿'])`) covers the prefix half; the exact-match half is a second, separate lookup on the same index. Decide whether to issue two range queries and merge in JS, or store a derived sortable field that unifies both cases into one range — write the decision down before implementing, this is the one genuinely non-trivial part of the port.
- [ ] `sync_state` object store: `keyPath: 'key'`. Trivial `get`/`put` — matches statement #1 exactly.
- [ ] `pending_mutations` object store: `keyPath: 'id', autoIncrement: true`. Index `by_item_id` on `item_id` for statements #8, #9. Statements #10, #11 (count-all, get-all-ordered) are natural cursor operations over the autoIncrement primary key, no index needed.
- [ ] Work out statement #5 (`last_insert_rowid()`): read the actual call site in `sync-manager.js` (around line 565) to see whether the app needs this because the server hasn't yet allocated a real ID (offline-first optimistic create) or some other reason — IndexedDB's `add()` returns the generated key directly in its result, which likely covers this more directly than SQLite's `last_insert_rowid()` did, but confirm against the actual offline-create flow before assuming it's a 1:1 swap.

### Phase 2: Rewrite the storage layer

- [ ] Rewrite `sync/worker.js`: drop the `@journeyapps/wa-sqlite` import and `IDBBatchAtomicVFS`; replace with `indexedDB.open(dbName, version)` + an `onupgradeneeded` handler that creates the three object stores and indexes from Phase 1.
- [ ] **Decide whether the Web Worker survives.** wa-sqlite needed a worker because the WASM SQL engine's execution model benefited from being off the main thread; IndexedDB's native API is already asynchronous and non-blocking on the main thread. Two paths:
  - Keep the worker (smaller diff, preserves the existing `db-client.js` message-passing contract, `sync-manager.js` barely changes its call shape) — but this keeps paying a `postMessage` round trip per read for no remaining reason.
  - Drop the worker, have `sync-manager.js` talk to IndexedDB directly from the main thread — bigger latency win (no round trip), bigger diff (touches every call site in `sync-manager.js`, removes `db-client.js` entirely).
  Pick one and record the reasoning here before implementing. Given the stated goal is first-load speed, dropping the worker is the more consistent choice with the objective, but it's a real tradeoff (worker isolation, main-thread contention during heavy sync) worth writing down deliberately rather than defaulting to it.
- [ ] Rewrite (or delete, per the Phase 2 decision above) `sync/db-client.js`.
- [ ] Rewrite every statement in `sync-manager.js`'s table (Phase 1 of "Current State" above) as IndexedDB calls using the new schema.
- [ ] `use-query.js`: delete it (dead code, and arbitrary SQL has no direct IndexedDB equivalent) — **after** confirming no downstream consumer imports it (check beyond this repo; it's a submodule).
- [ ] `yjs-store.js`: re-wire its persistence calls to the new storage API surface — its own logic (per-item `Y.Doc`/`YMap` merge) is unaffected, only how it reads/writes the backing store changes.

### Phase 3: Dependency and build cleanup

- [ ] Remove `@journeyapps/wa-sqlite` from `packages/dms/package.json` — confirm via search that nothing outside `sync/` imports it first (a check during this earlier audit found only `sync/` references, re-verify at implementation time since the codebase moves fast).
- [ ] Confirm the wa-sqlite `.wasm` asset drops out of the production build (`dist/assets/wa-sqlite-async-*.wasm` should no longer be emitted).
- [ ] Update `sync/CLAUDE.md`'s architecture description and the ASCII diagram in `documentation/sync.md` (currently: `SQLite WASM (Web Worker, IDB persistence)`) to reflect the new storage layer.

### Phase 4: Debuggability mitigation

- [ ] Add a dev-only console helper (e.g. `globalThis.__dmsSyncDump()`) that dumps the three object stores to `console.table` or similar. Raw IndexedDB browsing in DevTools' Application tab is materially worse than `SELECT * FROM data_items` was — this closes most of that gap for the common "what's actually in local storage right now" debugging need.

### Phase 5: Measure, don't assume

- [ ] Before/after timing: instrument `initSync()` (or wrap it in `performance.mark`/`performance.measure` calls) to record actual first-load timing — WASM fetch+compile+VFS-bootstrap time (before) vs. plain IndexedDB open time (after) — on a cold cache. The whole premise of this task is a speed win; confirm it's real and quantify it rather than shipping on faith.
- [ ] Record bundle-size delta (removing 2.2MB wasm + the wa-sqlite JS wrapper) as a secondary, easier-to-verify number.

### Phase 6: Regression coverage

- [ ] Every existing sync test (server-side tests are unaffected since the protocol didn't change; client-side behavior needs equivalent coverage) should pass against the new storage layer. If `sync-bring-up-to-date.md` added new client-side test coverage (Phase 1/6 there), re-run all of it against the IndexedDB implementation.
- [ ] Manually re-verify: cold start bootstrap, offline write + reconnect delta catch-up, collaborative Lexical editing (touches `yjs-store.js` persistence), multi-tenant sync scoping (if fixed by the prerequisite task).

## Consequences (documented up front, not discovered after the fact)

- **Speed**: expected win — no WASM fetch/compile/VFS-emulation cost, and possibly no worker round-trip per read (pending the Phase 2 decision). Must be measured (Phase 5), not assumed.
- **Debuggability**: regresses — raw IndexedDB is harder to inspect ad hoc than SQL. Mitigated by the Phase 4 dev helper, not eliminated.
- **Query flexibility**: permanently forecloses arbitrary local SQL. Current usage is 100% exact-match/prefix-scan and is safe under this constraint (verified, not assumed — see the exhaustive statement table above). Any *future* feature that wants to filter local synced data by an arbitrary field will need either a new dedicated index added to the schema, or a full re-fetch from the server — "just write a WHERE clause" stops being an option. Document this constraint where a future author would look for it (`sync/CLAUDE.md`).
- **Future split-table (dataset row) sync**: the existing "Future: Split-Table Sync" design section in `planning/tasks/completed/dms-local-first-sync.md` leans on SQL joins/filters for querying large local datasets. That design goes stale under this change and would need a rewrite if that work is ever picked up. Still deferred/future either way — flagged, not blocking.
- **Browser support**: not a meaningful factor either direction here — confirmed no COOP/COEP requirement exists today to remove as a side benefit (async wa-sqlite build, not the SharedArrayBuffer/OPFS build).
- **`use-query.js` removal**: removes the only place in the codebase offering ad hoc local SQL to component authors — since it has zero current consumers this is a real capability loss only in the abstract, not in practice, but note it in case a downstream site vendoring this submodule was relying on it directly.

## Files Requiring Changes

| File | Expected change |
|---|---|
| `packages/dms/src/sync/worker.js` | Full rewrite: IndexedDB open/schema instead of wa-sqlite/VFS |
| `packages/dms/src/sync/db-client.js` | Rewrite or delete, per the Phase 2 worker decision |
| `packages/dms/src/sync/sync-manager.js` | Every SQL statement replaced with IndexedDB calls |
| `packages/dms/src/sync/use-query.js` | Delete (after downstream-consumer check) |
| `packages/dms/src/sync/yjs-store.js` | Re-wire persistence calls to new storage API |
| `packages/dms/package.json` | Remove `@journeyapps/wa-sqlite` dependency |
| `packages/dms/src/sync/CLAUDE.md` | Architecture description, module list, query-flexibility constraint note |
| `src/dms/documentation/sync.md` | Architecture diagram, troubleshooting section (IndexedDB devtools instead of wa-sqlite-specific reset steps) |

## Testing Checklist

- [ ] All statements from the Phase 1 schema design produce identical results to the current SQL versions (unit-level parity check, ideally run both implementations side by side during development)
- [ ] Cold start bootstrap works end-to-end
- [ ] Offline write queues correctly and flushes on reconnect
- [ ] Delta catch-up after reconnect works
- [ ] Collaborative Lexical editing (Yjs persistence) works
- [ ] Multi-tenant sync scoping still correct (if the prerequisite task's fix has landed)
- [ ] `__dmsSyncDump()` (or equivalent) dev helper works and covers all three stores
- [ ] Before/after timing measurement recorded and shows a real improvement
- [ ] Bundle size delta recorded (wasm asset gone from `dist/`)
- [ ] No remaining `@journeyapps/wa-sqlite` references anywhere in `packages/dms/`
- [ ] Docs updated (architecture diagram, query-flexibility constraint, troubleshooting steps)
