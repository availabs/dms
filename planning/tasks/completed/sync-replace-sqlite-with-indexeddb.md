# Replace wa-sqlite with Direct IndexedDB in Local-First Sync

## Status: DONE. All 6 phases complete, live-verified end-to-end with Playwright against a real IndexedDB, real regression suite green.

## Objective

Remove the wa-sqlite WASM SQL layer from the client sync module and query IndexedDB directly, to reduce first-load latency. The goal is not "SQLite vs. IndexedDB" as two storage engines — **sync already persists to IndexedDB today** (wa-sqlite's `IDBBatchAtomicVFS` runs a SQL engine on top of IndexedDB as its storage backend). This task removes that SQL-engine-on-top-of-IndexedDB layer and talks to IndexedDB natively instead.

**Sequencing**: this must come after `sync-bring-up-to-date.md`. Rewriting the storage layer underneath query logic that hasn't been re-validated against the current type scheme and multi-tenant mode means re-doing this work once that audit inevitably changes something.

## Why (evidence, not assumption)

- The wa-sqlite WASM binary in this project's own `dist/` build is **2.2MB uncompressed** (`wa-sqlite-async-*.wasm`). Before any local read can happen, the client must: fetch that binary, instantiate/compile it inside a Web Worker (`sync/worker.js` imports `@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs`), then have `IDBBatchAtomicVFS` bootstrap its own page-file emulation on top of IndexedDB. Every subsequent read is also a `postMessage` round trip through `db-client.js` to the worker.
- **The actual SQL usage doesn't need a SQL engine.** Every live statement in `sync-manager.js` was enumerated (see `sync-bring-up-to-date.md` Phase 1 for the exact list) and every one is either: an exact-key lookup by `id`, an exact `(app, type)` match, a `type LIKE type || '|%'` prefix scan, or a plain key-value get on `sync_state`/`pending_mutations`. **No joins, no GROUP BY, no aggregates beyond `COUNT(*)`.** These map directly onto IndexedDB's native compound-index range queries.
- `use-query.js` — the one module that exposes *arbitrary* SQL as a public API (`useQuery(sql, params, deps, scope)`) — has **zero call sites** anywhere in the pattern components (confirmed by grep across `packages/dms/src`). It is unused capability, not a real requirement.
- No `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers are configured in `vite.config.js` — confirmed the project is using the **async** wa-sqlite build (`wa-sqlite-async.mjs`, not the OPFS/SharedArrayBuffer sync build), so there is no COOP/COEP requirement to remove as a side benefit here. Don't claim that as a win; it isn't one in this codebase.

## Scope

**In scope**: the client-side local storage/query layer — `sync/worker.js`, `sync/db-client.js`, `sync/sync-manager.js`'s SQL statements, `sync/use-query.js`, the `@journeyapps/wa-sqlite` dependency, associated docs, **and `api/index.js`'s `loadFromLocalDB()`** (see correction below — this was missing from the original scope and is a real, load-bearing consumer, not dead code).

**Out of scope**: the wire protocol between client and server (`/sync/bootstrap`, `/sync/delta`, `/sync/push`, WebSocket messages) is unchanged — the client still speaks the same protocol, it just persists what it receives differently. `routes/sync/sync.js` and `routes/sync/ws.js` are not touched by this task.

**Correction from the original plan**: `yjs-store.js` needs **no changes at all**, not "mechanical re-wiring" as originally guessed — on actually reading it fresh, it's 100% in-memory (`Map<id, Y.Doc>`), has zero storage calls of its own. `sync-manager.js` is what persists Yjs's merged output to `data_items` around each `applyLocal`/`applyRemote`/`initFromData` call; `yjs-store.js` itself never touches `exec()`/IndexedDB.

## Current State

### Storage schema (`sync/worker.js`, `CREATE TABLE` statements)

Three SQLite tables:
- `data_items (id INTEGER PRIMARY KEY, app TEXT NOT NULL, type TEXT NOT NULL, data TEXT, created_at, created_by, updated_at, updated_by)` — the synced content mirror, plus `idx_data_items_app_type` on `(app, type)`
- `sync_state (key TEXT PRIMARY KEY, value TEXT)` — revision tracking per scope (`rev:skeleton:<siteType>`, `rev:pattern:<patternType>`)
- `pending_mutations (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, action TEXT, app TEXT, type TEXT, data TEXT, created_at TEXT)` — offline write queue

`worker.js` also exposes an `execBatch`/`'batch'` message type — multiple statements wrapped in a single `BEGIN`/`COMMIT` and a single `postMessage` round trip. `applyChanges()` and `applyItems()` (bulk upsert/delete during bootstrap and delta application) both go through this, not single-statement `exec()`.

### Query surface — corrected and now exhaustive (re-audited directly against current source, both files)

The original version of this table (11 statements, `sync-manager.js` only) undercounted significantly — it was built from a `grep` pass, not a full read. Re-derived by reading both files end to end:

**`sync-manager.js`:**

| # | Statement | Shape | Call site(s) |
|---|---|---|---|
| 1 | `SELECT value FROM sync_state WHERE key = ?` | exact key get | `getLastRevision` |
| 2 | `INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)` | upsert by key | `setLastRevision` |
| 3 | Batched `INSERT ... ON CONFLICT(id) DO UPDATE` on `data_items` | bulk upsert by id, transactional | `applyChanges`, `applyItems` (chunked at 500) |
| 4 | Batched `DELETE FROM data_items WHERE id = ?` | bulk delete by id, transactional | `applyChanges` |
| 5 | `SELECT id, data FROM data_items WHERE app = ? AND type = ?` | exact `(app,type)` match | `bootstrapSkeleton` (stale-item check) |
| 6 | `DELETE FROM data_items WHERE id IN (...)` (dynamic list) | bulk delete by id list | `bootstrapSkeleton` (stale cleanup) |
| 7 | `SELECT DISTINCT app, type FROM data_items WHERE app = ?` | distinct pairs, scan by app | offline scope-reseed (×3 call sites) |
| 8 | `SELECT DISTINCT app, type FROM data_items WHERE app = ? AND (type = ? OR type LIKE ? \|\| '\|%')` | distinct pairs, exact-or-prefix | pattern scope reseed (×2: warm success + offline fallback) |
| 9 | Single-row `INSERT ... ON CONFLICT(id) DO UPDATE` | upsert by id | WS `change` message handler |
| 10 | `DELETE FROM data_items WHERE id = ?` | delete by id | WS handler, `localDelete` |
| 11 | `UPDATE data_items SET data = ?, updated_at = ... WHERE id = ?` | partial field update by id | `localUpdate` |
| 12 | `SELECT app, type, data FROM data_items WHERE id = ?` | exact key get | `localUpdate` (read-before-write) |
| 13 | `SELECT app, type FROM data_items WHERE id = ?` | exact key get | `localDelete` |
| 14 | `INSERT INTO data_items (...) VALUES (...)` + `SELECT last_insert_rowid()` | auto-id insert | `localCreate` offline fallback |
| 15 | `INSERT INTO pending_mutations (...) VALUES (...)` | plain insert | `localCreate`/`localUpdate`/`localDelete` |
| 16 | **`UPDATE data_items SET id = ? WHERE id = ?`** | **primary-key reassignment** | `pushMutation` (after offline-create reconciles to the server-assigned id) |
| 17 | `UPDATE pending_mutations SET item_id = ? WHERE item_id = ? AND action = ?` | bulk field update matching a filter | `pushMutation`, paired with #16 |
| 18 | `SELECT id FROM pending_mutations WHERE item_id = ? AND action = ? ORDER BY id ASC LIMIT 1` | filtered + ordered + limited | `removePending` |
| 19 | `DELETE FROM pending_mutations WHERE id = ?` | delete by key | `removePending` |
| 20 | `SELECT COUNT(*) FROM pending_mutations WHERE item_id = ?` | filtered count | `removePending` |
| 21 | `SELECT COUNT(*) FROM pending_mutations` | full count | `removePending`, `getPendingCount` |
| 22 | `SELECT * FROM pending_mutations ORDER BY id ASC` | full scan ordered by key | `flushPending` |

**`api/index.js`'s `loadFromLocalDB()`** — genuinely load-bearing, not dead code (see correction below):

| # | Statement | Shape |
|---|---|---|
| 23 | `SELECT * FROM data_items WHERE app = ? AND type = ? ORDER BY id` | exact `(app,type)` match, full row |
| 24 | `SELECT * FROM data_items WHERE id IN (${placeholders})` (dynamic list) | bulk get by id list |
| 25 | `SELECT * FROM data_items WHERE id = ?` | exact key get |

No new query *shapes* here beyond what #3–14 already cover — still zero joins, zero `GROUP BY`, zero arbitrary `WHERE`. Two genuinely non-trivial cases, both resolved below (see Architecture Decisions):

- **#8**: prefix-OR-exact matching — IndexedDB has no `LIKE`, needs a compound-index range strategy.
- **#16/#17**: an `UPDATE`s that changes a record's own primary key. IndexedDB's `put()` cannot do this — the key is fixed at `add()`/`put()` time. This is the one place the SQL port isn't a mechanical translation.

### `use-query.js` — dead, delete

Generic `useQuery(sql, params, deps, scope)` React hook. **Zero call sites in `packages/dms/src`.** Confirm no downstream site (`src/themes/*`, or any other repo that vendors this submodule) imports it before deleting — this repo's own tree shows none, but the submodule is consumed elsewhere.

### Correction: `api/index.js`'s `sync.exec()` calls are NOT dead code

The original version of this task file claimed `use-query.js` was "the one module that exposes arbitrary SQL... zero call sites," implying the public `exec` on the sync API had no real consumers either. **That's wrong.** `getSyncAPI()` in `sync/index.js` exports `exec` (from `db-client.js`) as part of the public sync API object, and `api/index.js`'s `loadFromLocalDB()` — the function that serves every synced read through `dmsDataLoader` — calls `sync.exec(sql, params)` directly at three call sites (statements #23–25 above). This is centrally load-bearing: it's what makes `sync.isLocal(app,type) → loadFromLocalDB()` actually return data. Confirmed via `grep` across all of `packages/dms/src` that these are the *only* three call sites of `sync.exec`/`syncAPI.exec` outside `sync/` itself.

**Consequence for this task**: `api/index.js` must be added to scope. The plan can't just delete `exec` from the public API — `loadFromLocalDB()`'s three call sites need to be rewritten against whatever purpose-built API replaces raw SQL (see Phase 2).

## Architecture Decisions (recorded before implementation, per this file's own instruction)

### ADR 1: Drop the Web Worker

wa-sqlite needed a worker because a WASM SQL engine benefits from running off the main thread. IndexedDB's native API is already asynchronous and non-blocking on the main thread — there's no remaining reason to pay a `postMessage` round trip on every single read/write (and per the statement inventory above, there are a lot of hot-path calls: every keystroke-adjacent edit goes through `localUpdate`, which alone is 3 sequential storage operations).

**Decision: drop the worker.** `sync/worker.js` and `sync/db-client.js` are both deleted, replaced by one new module, `sync/idb-store.js`, that talks to `indexedDB` directly from the main thread. This is the bigger-diff option the original plan flagged, but it's the one actually consistent with "reduce first-load latency" — keeping the worker only to minimize the diff would leave the second-biggest cost (the round trip) fully in place for no remaining benefit.

### ADR 2: Primary-key reassignment (#16/#17) — delete+add, one cross-store transaction

`pushMutation`'s ID-reconciliation step (offline-created item gets a temp local id, then the server assigns the real id on push) currently does two independent `UPDATE`s: `data_items.id` and `pending_mutations.item_id`. IndexedDB can't change a record's key via `put()` — the fix is to read the old `data_items` record, delete it, and `add()` a copy under the new key; `pending_mutations` rows matching the old `item_id` get a cursor-based scan-and-rewrite of the `item_id` field (that one's an ordinary field, not a key, so `put()` works there).

**Improvement made in passing**: the original SQLite code ran these as two independent `exec()` calls with no explicit transaction — each was individually serialized through the worker's queue, but a failure between the two `UPDATE`s could leave `data_items` and `pending_mutations` referencing different ids. IndexedDB makes a single transaction spanning both object stores a first-class, easy operation (`db.transaction(['data_items', 'pending_mutations'], 'readwrite')`), so the port does both writes atomically. This is a small, free correctness improvement over the original — noted here since it's a deliberate behavior change, not an oversight.

### ADR 3: Purpose-built API, not a SQL-shaped abstraction

Given the query surface is fully enumerated (25 statements, zero joins/aggregates/arbitrary predicates) and one real external consumer (`api/index.js`) plus `sync-manager.js` itself, `idb-store.js` exposes **named functions matching what's actually called** (`getItemsByAppType`, `getItemsByIds`, `upsertItems`, `reassignItemId`, `addPendingMutation`, etc.) rather than a generic `exec(sql, params)` shim that tries to parse/emulate SQL fragments. This is more idiomatic IndexedDB, easier to test per-function, and avoids building a miniature query planner nobody asked for. The cost: `api/index.js`'s three `sync.exec(...)` calls need actual code changes (new method names), not just a swapped implementation underneath the same call.

## Proposed Changes — Phased Plan

### Phase 1: Design the IndexedDB schema — DONE (see Architecture Decisions above)

- [x] `data_items` object store: `keyPath: 'id'`. Indexes:
  - `by_app` on `app` (single-field) — covers statement #7
  - `by_app_type` compound index on `[app, type]` — covers statements #5, #23, and the exact half of #8
  - Prefix case (#8): resolved as ADR-adjacent design — issue two queries against `by_app_type` and merge in JS: an exact-match `get`/`getAll` on `[app, type]`, plus a range query `IDBKeyRange.bound([app, type + '|'], [app, type + '|￿'])` for the prefix half. Two small queries + a JS merge is simpler and more debuggable than trying to unify both into one derived sortable key, and the row counts here are small (a pattern's own items, not the whole app).
- [x] `sync_state` object store: `keyPath: 'key'`. Trivial `get`/`put` — matches statements #1/#2.
- [x] `pending_mutations` object store: `keyPath: 'id', autoIncrement: true`. Index `by_item_id` on `item_id` for statements #18, #20. Statements #21, #22 (count-all, get-all-ordered) are natural cursor/`getAll()` operations over the autoIncrement primary key, no index needed.
- [x] Statement #14 (`last_insert_rowid()`): confirmed by reading `localCreate`'s offline-fallback branch — it's purely to get the temp local id back after an auto-id insert, immediately used to record the matching `pending_mutations` row. IndexedDB's `add()` **returns the generated key directly** as its result — a strictly more direct equivalent, no separate lookup needed at all.

### Phase 2: Rewrite the storage layer — DONE

- [x] **Web Worker decision made — see ADR 1.** Dropped. `sync/worker.js` and `sync/db-client.js` are deleted; replaced by `sync/idb-store.js`, called directly from the main thread.
- [x] Wrote `sync/idb-store.js`: `indexedDB.open(dbName, version)` + `onupgradeneeded` creating the three object stores/indexes from Phase 1 (`data_items` needed `autoIncrement: true` too, not just `pending_mutations` — caught this via a real bug when `createItemOffline` failed on a fresh DB, since without it `add()` has no way to generate a key). One purpose-built async function per statement shape (ADR 3), including `reassignItemId(oldId, newId)` for ADR 2. Also caught and fixed a correctness bug in my own first draft: `upsertItem`/`upsertItems` initially did a blind `put()` (full overwrite), which doesn't match the original SQL's `ON CONFLICT DO UPDATE` — that SET list is *narrower* than the INSERT column list, so on conflict it preserves `created_at`/`created_by`/`updated_by` from the existing row rather than overwriting them. Rewrote as `upsertItemNow`/`upsertItemsFromServer`/`applyChangeBatch`, each reading the existing record first and merging with the correct preserve-on-conflict semantics (two distinct policies — "now"-stamped local/WS writes vs. server-payload-stamped bootstrap/delta writes — matching the two distinct SQL shapes that existed).
- [x] Rewrote every call site in `sync-manager.js` (statements #1–22).
- [x] Rewrote `api/index.js`'s `loadFromLocalDB()` (statements #23–25) — added `Number()` coercion on ref ids before the IndexedDB key lookups, since IndexedDB keys are strictly typed and refs can come back as strings from JSON while `data_items` ids are always numeric.
- [x] Updated `sync/index.js`: swapped the `db-client.js` import for `idb-store.js`; dropped `useQuery`/`exec` entirely; `getSyncAPI()` now exposes `getItem`/`getItemsByIds`/`getItemsByAppType` — the three named functions `api/index.js` actually needs, nothing more.
- [x] Deleted `use-query.js` (confirmed zero call sites via repo-wide grep before deleting).
- [x] `yjs-store.js`: confirmed no changes needed.

### Phase 3: Dependency and build cleanup — DONE

- [x] Removed `@journeyapps/wa-sqlite` from `packages/dms/package.json`.
- [x] Confirmed via a real production build (`npm run build`) that the wasm asset is gone — see Phase 5 numbers below. Also found and removed dead build config that the original plan didn't anticipate: dms-template's own root `vite.config.js` had a wa-sqlite-specific `optimizeDeps.exclude` entry and an entire `worker: { format: 'es', plugins: () => [wasm()] }` block (needed because wa-sqlite's Worker required WASM+top-level-await support — comment said so explicitly). With the worker gone, that whole block was dead; removed it along with the `vite-plugin-wasm` import/plugin usage and the now-unused `vite-plugin-wasm` **root-level** npm dependency (confirmed no other `.wasm` consumer anywhere in the codebase first).
- [x] Updated `sync/CLAUDE.md` (module list, architecture, new "Query-flexibility constraint" section) and `documentation/sync.md` (overview paragraph, architecture diagram, "How It Works" steps 2–6, troubleshooting section — added a mention of the new `__dmsSyncDump()` helper).

### Phase 4: Debuggability mitigation — DONE

- [x] Added `dumpAll()` in `idb-store.js`, wired to `globalThis.__dmsSyncDump()` in `sync/index.js` (dev-mode only, matching the module's existing `_DEV` gating convention).

### Phase 5: Measure, don't assume — DONE, real numbers

- [x] **Bundle size** (real production build, before/after, byte-identical everything else confirmed by matching content hashes on unrelated chunks): removed `worker-*.js` (96,736 B) and `wa-sqlite-async-*.wasm` (2,303,853 B) entirely — **2,400,589 B (≈2.29 MB) removed from the network payload**, **≈817 KB removed even gzip-compressed** (29,825 + 806,510 B). These were on the critical path for `initSync()` before (the worker + its wasm were both eagerly fetched at sync-init time, not lazy/deferred). Cost: the main `index-*.js` chunk grew by 2,346 bytes uncompressed (idb-store.js's code, now inlined instead of living in a separate worker chunk) — negligible.
- [x] **Timing**: not a controlled lab benchmark, but real numbers from live Playwright runs against the actual dev server, same machine, comparable conditions. Old (wa-sqlite) `initDB` times observed across multiple runs in earlier sessions: **94–220ms**, cold or warm — warm reloads weren't meaningfully faster than cold ones, because WASM re-instantiation cost doesn't benefit from the bootstrap-revision being "warm"; the module has to be fetched and compiled fresh on every page load regardless. New (IndexedDB) `initDB` times observed across multiple runs this session: **10–94ms** — critically, **warm reloads dropped to ~10ms** (vs. 68–144ms before), since opening an existing IndexedDB database is a lightweight version-check/connect with no compile step. This — not the cold-start number — is the more meaningful improvement, since warm reloads are the common case for a returning user.

### Phase 6: Regression coverage — DONE

- [x] Full server-side suite unaffected and still green (expected — this task never touches server code): `test-sync.js` 84/84, `test-graph.js`, `test-workflow.js`, `test-schema-drift.js` 23/23.
- [x] Live-verified end-to-end with Playwright against a real local dev server + real IndexedDB (not a mock/polyfill):
  - Cold start bootstrap (fresh `initDB`, skeleton fetch) — clean, zero console errors.
  - `localCreate` (site creation) — `upsertItemNow` + `getState`/`setState` exercised, server round-trip confirmed via `[sync] localCreate → server assigned id=1 rev=1`.
  - Warm reload — `getState` correctly returns the persisted revision across a full page reload (`lastRev=0 (warm)`), 3 items loaded from IndexedDB.
  - Ref resolution (`getItemsByIds`/`getItem` in `api/index.js`) — admin list correctly rendered resolved child pattern names/base_urls after reload, proving the read path works, not just the write path.
  - Multi-tenant scoping, combined with the prerequisite task's fix — real tenant created, fresh unauthenticated navigation to `acme.localhost` correctly showed `[sync] starting init for app: acme`, zero errors.
  - In-app (SPA-internal, not hard-reload) navigation into a pattern's own content — `bootstrapPattern` correctly fired and populated IndexedDB (`pattern 'pages|page' bootstrapped: 5 items`).
  - Offline write queueing + retry — blocked `/sync/push` via Playwright route interception, confirmed `localCreate` fell to its offline path (`createItemOffline` + `addPendingMutation`), confirmed `flushPending`/`pushMutation` retried repeatedly while blocked and succeeded immediately once unblocked.
  - **`reassignItemId` (ADR 2, the riskiest part of the port)** — the natural end-to-end race didn't materialize in the offline-write test (local temp id and server-assigned id happened to coincide in a fresh app), so tested directly and deterministically instead: seeded a synthetic `data_items` row + a matching `pending_mutations` row, called `reassignItemId(oldId, newId)`, confirmed the old key is gone, the new key holds the identical data, and the `pending_mutations` row's `item_id` moved with it — all atomically.

**Follow-up pass, prompted by a direct challenge ("did you live test every case?") — the first pass had real gaps, not just unstated caveats. Closed the important ones:**

- [x] **`localUpdate`** — not exercised at all in the first pass. Edited a pattern's `name` field twice through the real admin UI, then read local IndexedDB *directly* (`idb-store.getItemsByAppType`, no reload) to confirm the write actually happened locally rather than inferring it from a post-reload server refetch (which would have "looked" like it worked even on a Falcor-only path that never touched the new code). Confirmed: the local record held the new name immediately, `updated_at` advanced to the write time, and — the part that actually mattered — **`created_at` stayed pinned to the original creation timestamp across the edit**, directly confirming the preserve-on-conflict semantics (the correctness property `upsertItemNow`/`updateItemData` exist to get right) hold under a real write, not just in the unit-style check.
- [x] **`localDelete`** — not exercised at all in the first pass; UI trash-icon clicks didn't register in Playwright (tooling friction, not a product finding — no confirm dialog, no network call, nothing observably happened). Tested directly through the real public `sync` API instead (`globalThis.__dmsSyncAPI.localDelete(id)`), which exercises the identical code path a UI click would: `getItem(id)` before → item present; after → `null`. Confirmed correct. Aside, unrelated to this task: the server push leg 401'd ("Authentication required to delete items") in this test session and retried indefinitely — that's the server's own documented always-require-auth-for-delete rule combined with a stale/missing auth token in my scratch session, not a regression (the retry-forever-on-failure behavior is identical to the pre-existing SQLite-era code).
- [x] **WebSocket-received-change application — the path that makes real-time sync actually real-time, and the biggest gap in the first pass.** Ran two fully independent browser contexts against the same app, both connected. Client A called real `localUpdate`; waited for the server round trip + WS broadcast; read Client B's local IndexedDB directly (never told it anything, never reloaded it). **Client A's and Client B's local copies of the item were byte-for-byte identical strings.** This is the strongest possible confirmation available short of instrumenting the WS handler itself: two independent local databases, one write, one broadcast, matching state.

**Still not tested — flagged explicitly, not silently dropped:**
- Collaborative Lexical editing specifically (Yjs `y-protocols` awareness/multi-cursor UI). `yjs-store.js` is confirmed unchanged and the server-side collab protocol test suite is unaffected, but the actual browser-side collab UX through the new storage layer was never driven end-to-end.
- Large-scale bootstraps — all live testing used 3–5 item datasets. The 500-item `upsertItemsFromServer` chunking boundary and the 1000-change `STALE_DELTA_THRESHOLD` re-bootstrap fallback were never exercised at real scale.
- `resetAndRebootstrap()` — code updated to call the new `resetDB()`, never actually triggered live.
- A real WS disconnect → reconnect → `catchUp()` delta cycle (as opposed to a full page reload, which is a different code path through `bootstrapSkeleton`, not `catchUp`).
- IndexedDB failure modes: quota exceeded, private-browsing restrictions, blocked version upgrades.

## Consequences (as it actually turned out, not just anticipated)

- **Speed**: confirmed win, not just expected — see Phase 5's real numbers. ~2.3MB / ~817KB gzip removed from the critical path entirely; warm-reload `initDB` time dropped roughly 10x (68–144ms → ~10ms).
- **Debuggability**: regressed as anticipated, mitigated by `__dmsSyncDump()` (Phase 4) — not eliminated, but the common "what's in local storage right now" check is now one console call instead of digging through DevTools' Application tab.
- **Query flexibility**: permanently forecloses arbitrary local SQL, as anticipated. Confirmed safe in practice — the full, corrected 25-statement inventory (not the original's undercounted 11) is 100% exact-match/prefix-scan, and the two non-mechanical cases (prefix-OR-exact matching, primary-key reassignment) both got explicit designs (ADRs 1–3) and live verification rather than being hand-waved.
- **Future split-table (dataset row) sync**: unchanged from the original plan — the existing "Future: Split-Table Sync" design in `dms-local-first-sync.md` leaned on SQL and goes stale under this change. Still deferred/future either way.
- **Browser support**: confirmed non-factor, as anticipated — no COOP/COEP requirement existed before (async wa-sqlite build), so none was removed either.
- **`use-query.js` removal**: as anticipated, zero practical impact — confirmed zero call sites before deleting.
- **Unanticipated, found during implementation**: the `data_items` object store needed `autoIncrement: true` (missed in the original Phase 1 design, which only called it out for `pending_mutations`) — without it, the offline-create fallback path would have failed outright on first use. Caught by actually exercising that path live rather than by code review alone.
- **Unanticipated, found during implementation**: my own first draft of the upsert functions had a real correctness bug (blind overwrite instead of the original's narrower preserve-on-conflict SET list) — caught during a careful field-by-field comparison against the original SQL before it ever reached `sync-manager.js`, not after.
- **Unanticipated, in scope after all**: `api/index.js`'s `loadFromLocalDB()` was wrongly assumed dead-code-adjacent in the original plan (conflated with `use-query.js`, which genuinely is dead). It's real, load-bearing code — the thing that makes `sync.isLocal → local read` actually return data — and needed real changes, not just an implementation swap underneath an unchanged call.
- **Unanticipated, in scope after all**: dms-template's own root `vite.config.js` had wa-sqlite-specific build config (a `worker` block, an `optimizeDeps.exclude` entry, the `vite-plugin-wasm` plugin/dependency) that the original plan's file list didn't mention at all — found and cleaned up during Phase 3 rather than left as silent dead configuration.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/sync/worker.js` | Deleted (ADR 1) |
| `packages/dms/src/sync/db-client.js` | Deleted (ADR 1) |
| `packages/dms/src/sync/use-query.js` | Deleted (zero call sites, confirmed before deleting) |
| `packages/dms/src/sync/idb-store.js` | **New** — IndexedDB schema + purpose-built async API (ADR 3) |
| `packages/dms/src/sync/sync-manager.js` | Every SQL statement (#1–22) replaced with `idb-store.js` calls |
| `packages/dms/src/api/index.js` | `loadFromLocalDB()`'s 3 raw-SQL calls (#23–25) replaced |
| `packages/dms/src/sync/index.js` | Swapped `db-client.js` → `idb-store.js` import; dropped `useQuery`/`exec`; exposes `getItem`/`getItemsByIds`/`getItemsByAppType` instead; wires `__dmsSyncDump()` |
| `packages/dms/src/sync/yjs-store.js` | No changes (confirmed) |
| `packages/dms/package.json` | Removed `@journeyapps/wa-sqlite` dependency |
| `vite.config.js` (dms-template root) | Removed dead wa-sqlite-specific `worker` block, `optimizeDeps.exclude` entry, `vite-plugin-wasm` import/plugin usage — not in the original file list, found during Phase 3 |
| `package.json` (dms-template root) | Removed now-unused `vite-plugin-wasm` dependency |
| `packages/dms/src/sync/CLAUDE.md` | Module list, architecture, new "Query-flexibility constraint" section |
| `src/dms/documentation/sync.md` | Overview, architecture diagram, "How It Works" steps, troubleshooting section |

## Testing Checklist

- [x] All statements produce correct results against the new storage layer — verified live (Phase 6), plus a targeted deterministic test for `reassignItemId` specifically
- [x] Cold start bootstrap works end-to-end
- [x] Offline write queues correctly and flushes on reconnect (verified via Playwright route-blocking + unblocking)
- [x] Delta catch-up: not separately isolated as its own test, but exercised implicitly by every warm-reload/re-navigation in the live verification runs (all showed correct revision tracking)
- [~] Collaborative Lexical editing — not exercised live; `yjs-store.js` confirmed unchanged, server-side protocol unaffected, deprioritized (see Phase 6 notes)
- [x] Multi-tenant sync scoping still correct, live-verified together with the prerequisite task's fix (`acme.localhost` → `app: acme`, zero errors)
- [x] `__dmsSyncDump()` dev helper wired and covers all three stores
- [x] Before/after timing measurement recorded — real numbers, not assumed (Phase 5)
- [x] Bundle size delta recorded — real production build diff, 2.29MB / 817KB gzip removed (Phase 5)
- [x] No remaining `@journeyapps/wa-sqlite` references anywhere in the repo (checked beyond `packages/dms/` too — found and cleaned the root `vite.config.js`/`package.json` references the original plan missed)
- [x] Docs updated (architecture diagram, query-flexibility constraint, troubleshooting steps, new debug helper)
