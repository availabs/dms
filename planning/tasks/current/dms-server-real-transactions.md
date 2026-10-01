# dms-server — real database transactions: `withTransaction` on both adapters, every call site converted

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Release:** deploy — dms-server deploy (+ `data-types/osm/worker.js` rides the same deploy) · **Created by:** amuro@albany.edu · **Edited by:** —

**Project:** DMS library · **Topic:** dms-server / db adapters · **Started:** 2026-09-30

> The dedicated follow-up that [`concurrent-page-editing-data-loss.md`](./concurrent-page-editing-data-loss.md)
> asked for. It covers that task's **Bug 14** (Postgres transactions run on arbitrary pooled
> connections; code-level, not live-verified) and the **C2/C4 root cause** (the SQLite adapter's
> unguarded `BEGIN`/`COMMIT` on one shared connection, which let concurrent `allocateId()` calls hand
> out colliding ids). Re-found independently on 2026-09-30 while building
> [`datasets-authoritative-views.md`](./datasets-authoritative-views.md), which uses a
> compare-and-swap instead of a transaction for this reason.

## Objective

Make every "transaction" in dms-server an actual transaction on both databases, with one API, so a
multi-statement write either lands whole or not at all, and never runs inside, or rolls back,
another request's work.

## Current state (read 2026-09-30)

**Postgres (`db/adapters/postgres.js`).**
- `query()` is `this.pool.query()`, so every statement checks out an arbitrary idle connection and
  releases it.
- `beginTransaction()` / `commitTransaction()` / `rollbackTransaction()` go through the same
  `query()`. So `BEGIN`, the wrapped statements and `COMMIT` can each run on a different connection.
- `getConnection()` (`pool.connect()`) exists and is correct, but only the scripts use it.
- When idle, the pool tends to hand back the connection just released, which is why single-user
  testing looks fine. Under concurrent writes it fails:
  - **No atomicity.** Each statement autocommits, so a failed write leaves its earlier statements
    committed.
  - **A stray open transaction.** The connection that ran `BEGIN` goes back to the pool mid-
    transaction, and the next unrelated request that draws it runs its queries inside it.
  - **`ROLLBACK` can hit the wrong work.** A rollback in one request's error path can land on a
    connection holding another request's uncommitted statements and undo them.
  - **Pool erosion and random kills.** Connections left "idle in transaction" eat into the pool,
    and if `idle_in_transaction_session_timeout` is set, Postgres kills whichever unrelated request
    inherits one.

**SQLite (`db/adapters/sqlite.js`).**
- One shared `better-sqlite3` connection, with `beginTransaction()` = `this.db.exec("BEGIN;")`.
- While one request awaits between `BEGIN` and `COMMIT`, other requests' queries run inside its
  transaction.
- A second concurrent `BEGIN` throws "cannot start a transaction within a transaction".
- C4 in the concurrent-editing task is this, surfacing as `allocateId()` id collisions and
  silently overwritten rows.

**Call sites (21, by grep, excluding the adapters):**

| file | function | how |
|---|---|---|
| `routes/dms/dms.controller.js` | `setDataById` (835) · `setTypeById` (904) · `createData` (986) · `deleteData` (1035) | `dms_db.beginTransaction()`, the core content writes |
| `routes/sync/sync.js` | `POST /sync/push` (521) | `dms_db.beginTransaction()` |
| `auth/handlers/auth.js` | `signupRequestVerified` · `signupAccept` · `acceptInvite` · `createUser` · `initSetup` · `signupAssignGroup` | `db.beginTransaction()`, production auth on Postgres |
| `routes/uda/uda.tasks.controller.js` | `deleteInternalSource` · `softDeleteSource` · `hardDeleteSource` | raw `db.query('BEGIN')` |
| `db/index.js` | `initAuth` · `initDms` · `initSync` · `initDama` · `initDamaTasks` · `initDamaSchedules` · `initDmsTasks` | `dbConnection.beginTransaction()`, at schema init (low concurrency, still not atomic on PG) |
| *found 2026-09-30:* `dms/tasks/index.js` | `claimNextTask` (SQLite branch) | raw `getPool().exec('BEGIN IMMEDIATE')` with `await d.query()` inside |
| *found 2026-09-30:* `dama/tasks/index.js` | `claimNextTask` (SQLite branch) | same |
| *found 2026-09-30:* `dama/tasks/schedules.js` | `claimDueSchedules` (SQLite branch) | same |
| *found 2026-09-30, outside dms-server:* `data-types/osm/worker.js` | `initializeSourceMetadataUsingView` | raw `db.query('BEGIN')` on the PG pool |

**Already correct (leave alone, but confirm):**
- `scripts/copy-db.js` (`copyTable`) and `scripts/extract-images.js` hold a `getConnection()` client
  for their `BEGIN`/`COMMIT`.
- The job-queue claim in `dms/tasks/index.js` and `dama/tasks/index.js`: Postgres uses
  `FOR UPDATE SKIP LOCKED` (check it is a single statement); SQLite runs a synchronous
  `rawDb.exec('BEGIN IMMEDIATE')` block with no awaits inside (check that holds).

**Related planned work:** [`site-ref-list-atomic-ops.md`](./site-ref-list-atomic-ops.md) proposes `SELECT … FOR UPDATE` inside a transaction, so it needs this task, or its single-statement alternative.

**Adjacent:** `db/index.js` `getClient(pgEnv)` caches **one** shared `pg.Client` per env. A
transaction on it from concurrent callers would have the same problem. It stays for single-caller
maintenance use and must not become the transaction path.

## Baseline before any code change (2026-09-30)

Run on the unchanged code, so later failures can be told apart from pre-existing ones:

| suite | result |
|---|---|
| `npm test` | exit 0 (all 8 scripts) |
| `node tests/test-uda.js` (SQLite) | 132 passed, 0 failed (one case is skipped on SQLite) |
| `node tests/test-uda.js` (`DMS_TEST_DB=dms-postgres-test DAMA_TEST_DB=dama-postgres-test`) | 133 passed, 0 failed |
| `node tests/test-source-auth.js` | exit 0 (pure logic, no DB) |
| `node tests/test-sync.js` (`npm run test:sync`) | exit 0 |
| `npm run test:pg` | graph ✓, workflow ✓, uda 133/0, uda-feature-id 7/0, **auth FAIL** (below) |
| `node tests/test-auth.js` (SQLite) | **never ran**: see below. After the two fixes, 104 passed / 0 failed |

**Two pre-existing test-harness defects, both fixed test-side only:**
- **`auth-sqlite.config.json` did not exist on this machine.** `test-auth.js` defaults
  `DMS_AUTH_DB_ENV=auth-sqlite`. The server threw "No configuration file found" at startup, the
  `uncaughtException` handler kept the process alive, and the script exited 0 without running a
  single test. Created a local, gitignored `src/db/configs/auth-sqlite.config.json`
  (`{"type":"sqlite","role":"auth","filename":"../data/auth.sqlite"}`), the file the test already
  deletes and recreates. It is gitignored (`*.config.json`), so other machines still need it.
- **`test-auth.js` §8 expected `/users/byProject` to return an array.** The handler returns
  `{ users: [...] }` (`auth/handlers/user.js:137`), and the client reads `uRes.users`
  (`patterns/auth/pages/authUsers.jsx:121`). The assertion failed and the next line threw
  `usersByProj.some is not a function`, which aborted the suite at §8 on **both** databases, so
  §9–14 never ran. Fixed the test to unwrap `.users` (`tests/test-auth.js:387`).

## Proposed changes

### Phase 0 — Reproduce first (Postgres, Docker harness) — DONE (reproduced)
Bug 14 was never live-verified. Its session had no Postgres; this one does
(`node tests/postgres-docker.js start`).
- [x] Concurrent `createData` / `setDataById` via `Promise.all` against the test container.
  Three throwaway scripts (session scratchpad, not committed) drove the real
  `createController('dms-postgres-test')` on the **unfixed** code, pool `max` = 10,
  `idle_in_transaction_session_timeout` = 0 in the container.
- [x] Assert on `pg_stat_activity`: a connection left `state = 'idle in transaction'` after its
      request finished confirms the bug. **Reproduced, and the mechanism traced.** A stand-in for
      pg-pool's `pool.query` (the same connect → `client.query` → `release(err)`) recorded which
      backend pid ran each statement of each request:
  - **138 of 144** concurrent `createData` / `setDataById` requests (6 rounds × 24) ran their
    `BEGIN`, work and `COMMIT` on **more than one backend**. For example, request `r0-0` ran
    `257:BEGIN · 257:UPDATE · 257:INSERT change_log · 262:COMMIT`, so its `COMMIT` landed on a
    connection that wasn't in its transaction.
  - **2 requests** had resolved while the backend that ran their `BEGIN` was still
    `idle in transaction` in `pg_stat_activity`.
  - In 60 success-only bursts (3–50 concurrent), no connection was left idle in transaction
    **after the whole burst**. Another request's stray `COMMIT` eventually closes each one, so
    leftovers are transient here. In production, anything that stalls the pool can keep one open,
    and so can a request that errors after `BEGIN`.
- [x] Also show a write that throws mid-block leaving earlier statements committed.
  **Reproduced, with a much worse companion.** A `CHECK (type <> 'txreject')` constraint on
  `dms.change_log`, added in the container only, made `createData` of that type fail at the
  change_log insert, after its data-row insert. Eight rounds of 30 concurrent `createData` calls
  (10 failing, 20 succeeding):
  - **2 rows from failed writes stayed committed** (no atomicity);
  - **156 of 160 writes that returned success, with an id, were gone afterwards.** Another
    request's `ROLLBACK`, or pg-pool destroying a connection on a query error
    (`client.release(err)`), rolled back the open transaction those statements had run in. This is
    Bug 14's "ROLLBACK can hit the wrong work", measured: silent loss of acknowledged writes.
- [x] Keep the repro as a regression test (Phase 3). The failing-write burst and the per-request
      backend check are carried into `tests/test-transactions-pg.js`.

### Implementation plan (written 2026-09-30, before Phase 1 code)

**The `tx` surface, enumerated from the call sites.** Inside the 21 blocks, the db object is used
for `query(sql, values)` (all), `promise(sql, values)` (dms.controller, sync, via `allocateId`
`query`), and `type` (the auth `q.*` helpers at `queries.js:342`, uda deletes). `tableExists` is
only called before a block (the `init*` guards, sync `hasChangeLog`), so it moves out of the blocks
instead of onto `tx`. The final surface is `type`, `query`, `promise`, `withTransaction` (nested,
inline) and `afterCommit(fn)` (below). A `tx` used after its transaction ended throws.

**Postgres `withTransaction(fn)`:**
1. `client = await pool.connect()`, then `BEGIN`. If `BEGIN` fails, there is nothing to roll back,
   and the client is released with the error.
2. `result = await fn(tx)`, then `COMMIT`.
3. **A `COMMIT` that comes back as `ROLLBACK` throws.** Postgres answers `COMMIT` on an aborted
   transaction with command tag `ROLLBACK` and no error. That happens when `fn` swallowed a failed
   statement, and without this check the caller believes it committed.
4. On error, `ROLLBACK` and rethrow. If the `ROLLBACK` itself fails, `client.release(rbErr)` makes
   the pool discard the connection.
5. `finally` marks `tx` closed and releases the client. Then the `afterCommit` callbacks run.

**SQLite `withTransaction(fn)`:**
- An adapter-owned FIFO lock. `query()` runs synchronously, as today, when the lock is free, and
  waits its turn when a transaction holds it.
- `BEGIN IMMEDIATE` / `COMMIT`. On error, `ROLLBACK` only if `db.inTransaction`, because SQLite
  auto-rolls-back on some errors.
- Before `BEGIN`, it refuses to start if the connection is already in a transaction (a raw
  `getPool()` `BEGIN`), rather than failing half-way.

**Re-entrancy guard (AsyncLocalStorage, one store per adapter).** A plain `db.query()` issued from
inside that adapter's own open `withTransaction` is the missed-conversion bug:
- **SQLite throws** "inside withTransaction use tx, not the adapter". The alternative is a
  deadlock, since the transaction holds the lock the stray query waits for.
- **Postgres warns once per call site** and lets the query run on the pool, outside the
  transaction, as today. That makes a missed conversion loud in the SQLite suites without turning
  it into a production failure on PG.
- `db.withTransaction()` on the adapter from inside its own transaction throws on both, since it
  would deadlock SQLite or open a second connection on PG. Nested code uses `tx.withTransaction`.

**`tx.afterCommit(fn)`**, a deviation beyond the spec. Callbacks run after `COMMIT` and after the
lock/connection is released, never on rollback, and their errors are logged, not thrown. It carries:
- the dms.controller WebSocket `notifyChange` broadcast, which today fires inside the block, before
  commit, and so would announce writes that then roll back;
- the page-delete hook, which "must never block or roll back the page's own deletion". Inside a PG
  transaction, a failing hook statement would abort the whole transaction.

**DDL stays out of the blocks.** `ensureSequence` / `ensureTable` cache "exists" in process
memory. DDL run inside a transaction that then rolls back would leave the cache claiming a table
that doesn't exist, so `mainTable()` / `ensureForWrite()` / `hasChangeLog()` are called **before**
`withTransaction`. Inside a block, the calls to `allocateId` → `ensureSequence` and to
`mainTable(app, tx)` are cache hits.

**Old API.** `beginTransaction` / `commitTransaction` / `rollbackTransaction` throw
"use withTransaction(fn)" on both adapters. The workspace grep found no callers outside dms-server
(Open question 1).

**Task-queue claims (SQLite).** The claims at `dms/tasks/index.js` `claimNextTask`,
`dama/tasks/index.js` `claimNextTask` and `dama/tasks/schedules.js` `claimDueSchedules` are not the
"synchronous block with no awaits" the task doc assumed. Each one `await`s `d.query()` between a
raw `rawDb.exec('BEGIN IMMEDIATE')` and `COMMIT`, so other requests' queries can interleave into
them. Under the new lock it gets worse: a claim that fires while a `withTransaction` is open hits
"cannot start a transaction within a transaction" on the shared connection. They move to
`db.withTransaction`. The PG branches are single `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
LOCKED)` statements, which are already atomic, and stay as they are.

### Phase 1 — The adapter API — DONE
- [x] **`PostgresAdapter.withTransaction(fn)`** (`db/adapters/postgres.js:198`):
  - `const client = await this.pool.connect()`, `BEGIN`, `result = await fn(tx)`, `COMMIT`, return
    `result`;
  - on error `ROLLBACK` and rethrow;
  - `finally client.release(err)`, passing the error when `ROLLBACK` itself failed so the pool
    discards a connection it can't trust. A failed `BEGIN` also discards.
  - **Added:** while the client is checked out, `withTransaction` keeps an `'error'` listener on
    it, and the error discards the client on release. pg-pool removes its own idle listener at
    checkout (`pg-pool/index.js:344`), so a connection lost between statements (server restart,
    `pg_terminate_backend`, an `idle_in_transaction_session_timeout` kill) would otherwise be an
    unhandled `'error'` event. Nothing in the server held a checked-out client before this task,
    so the hazard is new with it.
  - **Added:** a `COMMIT` answered with command tag `ROLLBACK` throws (`postgres.js`, in `withTransaction`).
    Postgres does that, with no error, when a statement inside `fn` failed and `fn` caught the
    error. Verified on the harness: the insert was gone, and the caller got
    "Transaction rolled back at COMMIT…" instead of a silent success.
- [x] **`SqliteAdapter.withTransaction(fn)`** (`db/adapters/sqlite.js:372`):
  - an async lock owned by the adapter (`_acquireLock`, `sqlite.js:227`), FIFO;
  - while a transaction holds it, every other caller's `query()` waits, and only the `tx` handle
    runs. `query()` stays synchronous when the lock is free and nobody is waiting;
  - `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. `ROLLBACK` runs only if `db.inTransaction`, and
    the transaction refuses to start inside a transaction it didn't open (a raw `getPool()`
    `BEGIN`).
- [x] **The `tx` handle** (`_makeTx`, `postgres.js:249` / `sqlite.js:416`) has `type`, `database`,
      `query`, `promise`, `withTransaction`, `afterCommit`. That is the whole surface the blocks
      use once `tableExists` is hoisted out of them (see the plan). Using a handle after its
      transaction ended throws.
- [x] **Nesting:** `tx.withTransaction(f)` runs `f(tx)` inline. No savepoints; no call site needs
      partial rollback. `db.withTransaction` called from inside its own open transaction throws.
- [x] **Re-entrancy guard** (AsyncLocalStorage per adapter): a plain adapter query from inside
      its own transaction throws on SQLite (it would deadlock) and warns once per call site on PG
      (`_checkNotInOwnTx`, `postgres.js:107`).
- [x] **`tx.afterCommit(cb)`**: runs after `COMMIT` and after the lock/connection is released,
      never on rollback, and a failing callback is logged, not thrown (`runAfterCommit`).
- [x] **Remove the old API.** `beginTransaction` / `commitTransaction` / `rollbackTransaction` throw
      "use withTransaction(fn)" once every call site is converted, so the bug can't come back.
      Done after the last Phase 2 conversion. Both adapters throw `OLD_TX_API_ERROR`, which
      names the fix. A final workspace grep found no callers outside the adapters and `scripts/`.
- **Smoke-verified on both adapters** (scratch script, SQLite temp file + Docker PG):
  - commit;
  - rollback leaves no row;
  - nested inline;
  - stray adapter query (throws on SQLite, runs and warns on PG);
  - adapter-level nesting throws;
  - a handle used after the transaction ended throws;
  - `afterCommit` runs on commit only;
  - another caller's insert during an open transaction survives that transaction's rollback, and
    the other caller never sees the uncommitted row.

### Phase 2 — Convert every call site — DONE
- [x] **All 21 call sites in the table** move to `await db.withTransaction(async (tx) => { … })`,
      plus 4 found along the way (3 SQLite claims, the osm worker). One file at a time, with the
      relevant suites run after each:
  - [x] **`routes/dms/dms.controller.js`**: `setDataById`, `setTypeById`, `createData`,
        `deleteData`. Helpers now take the executor as their first argument and use it for every
        statement: `appendChangeLog(tx, …)`, `removeIdFromRefArrays(tx, …)`,
        `dropViewDataTable(tx, …)`, `cascadeSourceDelete(tx, …)`, `cascadeViewDelete(tx, …)`,
        `lookupSourceId(app, type, q = dms_db)`, `mainTable(app, q = dms_db)`.
        `allocateId(tx, …)` runs inside the transaction. `deleteData` pre-calls `mainTable(app)`
        before the transaction, so the cascades' DDL is a cache hit.
        **Design note:** the WebSocket `notifyChange` broadcast moved into
        `tx.afterCommit`; it used to fire inside the block, before commit. The page-delete hook
        also moved into `tx.afterCommit`, with the plain `dms_db`. The live hook
        (`hooks/npmrds_report_page_delete_hook.js:35`) calls `ctx.dms_db.promise(DELETE …)`.
        Inside the transaction that would deadlock SQLite (the guard throws, and the hook's
        try/catch would have swallowed it), and on PG a failing hook statement would abort the
        page delete's own transaction.
        Tests after conversion: `npm test` exit 0 (101 ✓ lines, same as the baseline);
        `test-sync.js` exit 0; on PG, `test-graph` ✓, `test-workflow` ✓, `test-delete-cascade`
        16/0, with no stray-query warnings. The Phase 0 repro now shows 0 leaked, 0 lost and
        0 idle-in-transaction over 160 successful and 80 failing concurrent writes.
  - [x] **`routes/sync/sync.js` `/sync/push`**: every statement on `tx`, including
        `allocateId(tx, …)`. `mainTable(item.app)` and `hasChangeLog()` (DDL + `tableExists`)
        moved ahead of the transaction. The unknown-action 400 is decided before it opens. The
        U-not-found 404 returns `{ notFound: true }` from the block; the UPDATE matched nothing,
        so the commit is a no-op, same as the old rollback. The broadcast was already after
        commit. `test-sync.js` 84/0 on SQLite and on PG (baseline 84/0). The 404 / 400 paths
        weren't covered, so the new tests add them.
  - [x] **`auth/handlers/auth.js`**: `signupRequestVerified`, `signupAccept`, `acceptInvite`,
        `createUser`, `initSetup`, `signupAssignGroup`. Every `db.query` and every `q.*(db, …)`
        inside a block now takes `tx`. The helpers they call (`createUser`, `assignUserToGroup`,
        `updateSignupRequest`, `getUserByEmail`, `ensureGroup`, `ensureProject`,
        `ensureGroupInProject`, `ensureUserInGroup`, `createGroup`, `assignGroupToProject`) are all
        single `db.query` calls, so no change was needed in `auth/utils/queries.js`.
        Changes outside the blocks:
        - The post-commit reads (`getUserByEmail` + `buildUserObject` in `signupRequestVerified`
          and `acceptInvite`) and the `signupAssignGroup` email sends now run after the block.
        - The unconditional `hashPassword` calls moved before it.
        - **Fixed as a side effect:** the old code ran those post-commit steps inside the `try`,
          so a failure there fired `rollbackTransaction()` after `COMMIT`. On SQLite that throws
          "no transaction is active" and replaces the real error.

        `test-auth.js`: 104/0 on SQLite and 104/0 on PG. On PG this is the first run past §8.
  - [x] **`routes/uda/uda.tasks.controller.js`**: `deleteInternalSource`, `softDeleteSource`,
        `hardDeleteSource`. The raw `db.query('BEGIN'|'COMMIT'|'ROLLBACK')` became
        `db.withTransaction`, with every statement on `tx` and the result objects built after
        commit. The DDL (`DROP TABLE` of the split / view tables) and the storage-file removal
        already ran before the block and still do. No existing test calls `uda.sources.delete` or
        `hardDelete`, so the new tests cover them.
        After the change: `test-uda` 132/0 on SQLite and 133/0 on PG (DMS + DAMA both on PG),
        identical to the baseline.
        **Pre-existing and unrelated, not fixed:** `tests/test-deprecate-internal-dataset.js`
        (not part of `npm test`) fails at "Uppercase name type is not split-eligible". The
        test's pure-logic pre-check asserts `!isSplitType('MyDataset-200')`, but `NAME_SPLIT_REGEX`
        (`db/table-resolver.js:21`) carries the `/i` flag, and `isSplitType` returns `true` in
        isolation. That runs before any DB work, in a file this task doesn't touch.
  - [x] **`db/index.js`**: all 7 `init*` blocks (`initAuth`, `initDms`, `initSync`,
        `initDama`, `initDamaTasks`, `initDamaSchedules`, `initDmsTasks`). They were
        byte-identical apart from the file name, so they now call one helper,
        `runSchemaScript(dbConnection, sqlDir, baseName)` (`db/index.js:96`). It reads the file
        *before* the transaction, then runs it on `tx` inside `withTransaction`, split per
        statement on SQLite. The create scripts contain only PL/pgSQL `DO` blocks (fine in a
        transaction) and no `CONCURRENTLY`, `PRAGMA` or `VACUUM`. **Design note:** this is a
        helper where the doc said "convert 7 blocks". It follows the dms-server "3+ repeats"
        rule and leaves one conversion to audit instead of seven.
        Verified on fresh databases:
        - SQLite: `npm test` exit 0, 93 ✓, same as the baseline; `test-schema-drift` boots fresh
          SQLite DBs.
        - PG: a fresh container with **no** psql reset, so the server created every schema.
          All 7 ran (`auth/dms/sync/dama/dama tasks/dama schedules/dms tasks db init dms_test`
          timings logged), with 0 "init failed". Then `test-graph` ✓, `test-auth` 104/0 and
          `test-uda` (DMS + DAMA on PG) 133/0.
  - [x] **SQLite task-queue claims** (added; see the plan): `dms/tasks/index.js`
        `claimNextTask`, `dama/tasks/index.js` `claimNextTask`, `dama/tasks/schedules.js`
        `claimDueSchedules`. They ran a raw `getPool()` `BEGIN IMMEDIATE`, then `await`ed
        `d.query()` for the SELECT and UPDATE, then `COMMIT`. That was not the synchronous,
        await-free block the doc assumed, and it was not safe:
        - other callers' queries could interleave between the `BEGIN` and the `COMMIT`;
        - under the new lock, a claim that fires during an open `withTransaction` would hit
          "cannot start a transaction within a transaction".

        All three now use `db.withTransaction` with `tx.query`. **The PG branches are safe as
        they are:** each is a single `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`
        (`schedules.js` `IN (SELECT … FOR UPDATE SKIP LOCKED)`), one atomic statement on the
        pool. `test-tasks` 22/0 and `test-schedules` 29/0 on SQLite. No test drove the DMS claim,
        so the new SQLite test covers it.
  - [x] **Outside dms-server** (added): `data-types/osm/worker.js`
        `initializeSourceMetadataUsingView` ran a raw `db.query('BEGIN')` / `CALL` / `COMMIT` on
        the PG pool (the same Bug 14 shape). It is now `db.withTransaction(tx => tx.query('CALL …'))`.
        The workspace grep also found:
        - `src/themes/mny/scripts/actions_alignment/location_invalidation.mjs:75`. It runs a raw
          `BEGIN` on a dedicated `new pg.Client` (line 39), which is correct, and it is a project
          script, so it was left alone.
        - `tests/test-db-copy.js:406`, a fixture with a raw `BEGIN` on its own `SqliteAdapter`.
          Converted to `withTransaction`, so the guard can cover `tests/` as well.
- [x] **Every statement and helper inside the block uses `tx`, not `db`.** This is the step that
      silently re-breaks things if missed. Each block was audited line by line (awk scan for
      `db.` / `dms_db.` inside every `withTransaction` body: clean). The SQLite guard, which
      throws on a stray adapter query inside a transaction, stayed silent across every suite.
  - `auth.js` passes `db` into `q.createUser`, `q.assignUserToGroup`, …;
  - `dms.controller.js` calls `allocateId()` and `dms_db.promise` inside its blocks.
  Both are done, audited line by line.
- [x] **`allocateId()` (SQLite):** runs **inside** the caller's transaction (`createData`), as
      preferred. The SQLite lock makes concurrent allocations distinct, and a failed write doesn't
      burn an id.
- [x] **The authoritative-views compare-and-swap** (`uda.controller.js` `mutateSourceMetadata`)
      stays as it is. It is the right tool for a read-modify-write that spans a web request and
      takes no locks. Note that in its comment. Done: the section comment
      (`uda.controller.js` ~line 283) now says `withTransaction` exists and that CAS is kept on
      purpose.
- [x] **Scripts left alone, as instructed:** `scripts/copy-db.js` and `scripts/extract-images.js`
      still use `getConnection()` + raw `BEGIN`. `tests/test-db-copy.js` gives 41/1 both with the
      new adapters and with the **original** adapters, run from a scratch copy of the package with
      the edits inverted. The one failure ("Split table copy: data_items: 1 row") and the two
      `--skip-orphans` command failures (`SELECT … FROM null`) are pre-existing `copy-db.js`
      defects, unrelated to this task.

### Phase 3 — Guards and tests — DONE
- [x] **Postgres (Docker harness)**, `tests/test-transactions-pg.js` (new; wired into
      `tests/postgres-docker.js run` and `npm run test:pg:transactions`), 11/0:
  - a transaction that throws leaves no rows (also in `test-transactions.js` §A, which the PG
    runner runs on PG);
  - two concurrent transactions don't see each other's uncommitted rows;
  - a plain `db.query` during an open transaction isn't part of it: a different
    `pg_backend_pid()`, and it survives the transaction's rollback;
  - a swallowed failed statement makes `COMMIT` throw instead of silently rolling back;
  - after a concurrent burst, `pg_stat_activity` shows no `idle in transaction` connections from
    the test, and all 90 requests ran BEGIN…COMMIT on **one** backend each (a `pg.Client#query`
    trace);
  - the Phase 0 repro now passes: 8 × 30 concurrent writes, 80 of them failing, with 0 leaked,
    0 lost and 0 idle in transaction;
  - DAMA `softDeleteSource` / `hardDeleteSource`: happy path, plus a trigger-forced failure on the
    source delete rolls back the view and task deletes;
  - **(added)** a backend killed mid-transaction (`pg_terminate_backend` between statements) fails
    that transaction, with no unhandled `'error'` event, and the pool serves a fresh connection.
    Mutation-checked: with the client `'error'` listener removed, the test process dies with
    `Unhandled 'error' event: terminating connection due to administrator command`. The file is
    now 11 tests.
- [x] **SQLite**, `tests/test-transactions.js` (new; DB-agnostic, in `npm test`, and also run on
      PG by the runner), 21/0:
  - concurrent `createData` calls get distinct ids (C4: 50 concurrent, distinct ids, payloads
    and change_log rows);
  - a query from another caller during a transaction waits and is not rolled back with it; it
    also never sees the uncommitted row;
  - the adapter contract (nesting, a handle used after end, `afterCommit`, the old API throwing,
    the stray-query guard);
  - the Phase 0 repro;
  - 20 concurrent `setDataById` merges keep every key;
  - a `deleteData` whose cascade fails rolls back the source, the view, the split-table
    `DROP` and the dmsEnv ref together;
  - `/sync/push`: 400, 404, and 20 concurrent creates;
  - `deleteInternalSource`: happy path, plus a trigger-forced failure that rolls back the dmsEnv
    ref and the view delete;
  - a DMS task claim during another open transaction.
- [x] **A lint-style test**, `tests/test-transaction-guard.js` (new; in `npm test`, no DB),
      fails if `beginTransaction(`, `commitTransaction(`, `rollbackTransaction(` or
      `query('BEGIN` / `query("BEGIN` / ``query(`BEGIN`` appear outside the adapters and
      `scripts/`. It scans `src/` and `tests/` (260 files). **Added:** `exec('BEGIN`, a raw
      SQLite `BEGIN` that bypasses the lock. Verified in a scratch copy: it flags all 4 planted
      forms and ignores a commented one.
- [x] **Mutation check: the new tests catch the bug.** In a scratch copy of the package, both
      adapters' `withTransaction` were swapped back to the old mechanism (PG: BEGIN, work and
      COMMIT through `pool.query`; SQLite: unlocked `BEGIN` on the shared connection).
  - `test-transactions.js` failed **8/21**: C4 ("cannot start a transaction within a
    transaction"), the Phase 0 repro, the merges, the task claim, "other caller saw the
    uncommitted row", and more.
  - `test-transactions-pg.js` failed **5/10**: "A saw B: 1, B saw A: 1", 67/90 requests spread
    across backends, 23 leaked rows, and the swallowed-error COMMIT.
  - The DAMA delete tests pass under the mutant. They are single-request flows, which is why Bug
    14 always looked fine in single-user testing.
- [x] `npm test`, `npm run test:pg`, `tests/test-auth.js` and `tests/test-source-auth.js` all green.
      Final run on the final code, 2026-09-30:

| suite | result |
|---|---|
| `npm test` (SQLite; now includes the guard and `test-transactions.js`) | exit 0, 115 ✓ / 0 ✗; the guard scanned 260 files; transactions 21/0 |
| `node tests/test-uda.js` (SQLite) | 132/0 (= baseline) |
| `test-uda.js` with `DMS_TEST_DB=dms-postgres-test DAMA_TEST_DB=dama-postgres-test` | 133/0 (= baseline) |
| `node tests/test-auth.js` (SQLite) | 104/0 (the baseline never ran; see the Baseline section) |
| `node tests/test-source-auth.js` | 16/0 |
| `npm run test:sync` (SQLite) · `test-sync.js` on PG | 84/0 · 84/0 |
| `npm run test:pg` | graph ✓, workflow ✓, uda 133/0, uda-feature-id 7/0, auth 104/0 (baseline aborted at §8), transactions 21/0, transactions-pg 11/0 |
| `test-delete-cascade.js` on PG | 16/0 |
| `test-tasks.js` · `test-schedules.js` (SQLite) | 22/0 · 29/0 |
| `test-db-copy.js` | 41/1, **pre-existing**: identical with the original adapters |
| `test-deprecate-internal-dataset.js` | fails at the uppercase pre-check, **pre-existing** and unrelated (see Phase 2) |

      The only PG stray-query warning in any log is the deliberate one from
      `test-transactions.js`'s stray-query test. The Docker container is stopped.

### Still needs a live check (after deploy; not done here, production is off-limits)
- [ ] mercury: `pg_stat_activity` shows no long-lived `idle in transaction` connections from
      dms-server under normal editing load.
- [ ] mercury logs: no `<PostgresAdapter> query() on the adapter inside its own withTransaction`
      warnings. Any that appear name a missed conversion. Watch too for new
      `Transaction rolled back at COMMIT` errors: each one was a silent partial write before.
- [ ] Concurrent editing on a real page (two tabs) no longer loses saves. See
      `concurrent-page-editing-data-loss.md`.

## Files requiring changes

| file | change |
|---|---|
| `db/adapters/postgres.js` | `withTransaction` + `tx` handle + `afterCommit`; client `'error'` listener; COMMIT-as-ROLLBACK check; stray-query warn (AsyncLocalStorage); old methods throw |
| `db/adapters/sqlite.js` | `withTransaction` + FIFO adapter lock that `query()` respects (`_execute` split out); `BEGIN IMMEDIATE`; stray-query throw; old methods throw |
| `routes/dms/dms.controller.js` | 4 blocks → `withTransaction`; `tx` threaded through `appendChangeLog`, cascades, `lookupSourceId`, `mainTable`, `allocateId`; broadcast and page-delete hook → `afterCommit` |
| `routes/sync/sync.js` | `/sync/push` block; `mainTable` / `hasChangeLog` hoisted; 400 / 404 decided outside the transaction |
| `auth/handlers/auth.js` | 6 flows; `q.*(tx, …)`; post-commit reads, emails and hashing moved out (`auth/utils/queries.js` unchanged; its helpers are single `db.query` calls) |
| `routes/uda/uda.tasks.controller.js` | 3 source-delete flows |
| `routes/uda/uda.controller.js` | CAS comment: `withTransaction` exists; CAS is deliberate |
| `db/index.js` | 7 `init*` → one `runSchemaScript` helper → `withTransaction` |
| `dms/tasks/index.js`, `dama/tasks/index.js`, `dama/tasks/schedules.js` | SQLite claim branches → `withTransaction` |
| `data-types/osm/worker.js` (dms-template, outside the submodule) | raw `BEGIN` / `CALL` / `COMMIT` → `withTransaction` |
| `tests/test-transactions.js` (new) | DB-agnostic suite, 21 tests; in `npm test` and the PG runner |
| `tests/test-transactions-pg.js` (new) | PG-only suite, 11 tests; in the PG runner, plus `npm run test:pg:transactions` |
| `tests/test-transaction-guard.js` (new) | lint-style guard, no DB; in `npm test` |
| `tests/postgres-docker.js`, `package.json` | wiring (`test`, `test:transactions`, `test:transaction-guard`, `test:pg:transactions`) |
| `tests/test-auth.js` | pre-existing §8 fix (`/users/byProject` returns `{ users }`) |
| `tests/test-db-copy.js` | fixture's raw `BEGIN` → `withTransaction` |
| `packages/dms-server/CLAUDE.md`, `tests/CLAUDE.md` | "Transactions" contract section; test table rows |
| `src/db/configs/auth-sqlite.config.json` (new, **gitignored**, local only) | lets `test-auth.js` run on SQLite at all |

## Risks

- **This touches every DMS content write, sync push, and signup/invite flow.** Convert and test one
  file at a time, and run the auth and sync suites after each.
- **A Postgres transaction now holds a pooled connection for its whole duration.** Keep blocks
  short. Nothing slow (network calls, email sends) belongs inside `fn`, and `auth.js` should send
  emails after commit.
- **The SQLite lock serializes writers.** That is correct for one shared connection; reads wait
  while a transaction is open. Fine for dev/test databases, which is where SQLite runs.
- **(2026-09-30) Pool pressure on Postgres.** Every write now holds one of the pool's connections
  (pg default `max` 10) for the life of its block. The blocks are short, contain no network I/O,
  and do their DDL beforehand. A transaction that awaited a plain pool query would deadlock the
  pool once every connection is held that way. The PG stray-query warning makes any such call
  visible; watch for it in the mercury logs after deploy.
- **(2026-09-30) Newly loud errors.** "Transaction rolled back at COMMIT" means a statement failed
  inside a block and the code swallowed it. That used to be a silent partial write, and now it
  fails the request. `lookupSourceId` is the only swallowing helper inside a block.
- **(2026-09-30) Behaviour changes a client could notice:**
  - WebSocket `change` broadcasts from Falcor writes now go out after commit, not before. A
    rolled-back write is never announced.
  - The page-delete hook runs after the delete commits.
  - A U-not-found `/sync/push` commits a no-op instead of rolling one back.

## Open questions

- [x] Is anything outside dms-server calling `beginTransaction` on these adapters (the CLI,
      data-types)? Grep the workspace before removing the old API. **No.** The grep covered all of
      `dms-template` (the dms CLI, `data-types/`, `hooks/`, themes; `node_modules` excluded). Raw
      `BEGIN` turned up in `data-types/osm/worker.js` (converted), in
      `src/themes/mny/scripts/actions_alignment/location_invalidation.mjs` (a dedicated
      `pg.Client`, which is correct, so left alone) and in the `tests/test-db-copy.js` fixture
      (converted).
- [ ] Is `idle_in_transaction_session_timeout` set on mercury? Worth knowing when reading any past
      "random failed save" reports. **Not checked:** production is off-limits to this session. The
      Docker container has 0 (disabled). The owner can run
      `SHOW idle_in_transaction_session_timeout;` on mercury.
- [ ] **(owner) C4 is only partly closed.** The lock fixes the part of C4 where concurrent
      requests' ROLLBACKs undid `allocateId()`'s sequence rows. The other half remains, in
      **legacy split mode on SQLite** only:
      - Falcor `createData` on `data_items` takes that table's AUTOINCREMENT id, while
        `/sync/push` creates take `allocateId()` → a separate `dms_id_seq` table.
      - The two counters are independent. On the local dev DB, `data_items`' AUTOINCREMENT is at
        274 while `dms_id_seq` has never been used (read-only check).
      - Per-app mode (every current config) and Postgres share one sequence and are unaffected.
      - Fix options: drop sync-push-without-id support in legacy SQLite, or have `allocateId`
        use `max(id)` / the table's AUTOINCREMENT there. That is a separate task.
- [ ] **(owner) PG stray-query policy.** A plain adapter query inside a block warns once per call
      site on PG (and throws on SQLite). Switch PG to throwing once a deploy has shown no
      warnings?
- [ ] **(owner) `auth-sqlite.config.json` is gitignored.** `test-auth.js` defaults to it, so on a
      fresh checkout the SQLite auth suite silently runs zero tests and exits 0. Commit a tracked
      `*-test*` config and change the test's default, or make the test fail when its config is
      missing?
- [ ] **(owner) Two pre-existing test failures, unrelated to this task:**
      - `tests/test-deprecate-internal-dataset.js` "Uppercase name type is not split-eligible"
        (`NAME_SPLIT_REGEX` has `/i`). Which is intended, the test or the regex?
      - `tests/test-db-copy.js` 41/1 plus two `--skip-orphans` crashes (`copy-db.js` builds
        `SELECT … FROM null`).

## Progress log

- 2026-09-30 — Task created (owner request) as the dedicated follow-up to Bug 14 / C4 in
  `concurrent-page-editing-data-loss.md`. Call sites re-enumerated: 21, up from the 9 first
  counted; the core `dms.controller.js` writes and `/sync/push` were missed by the first grep.
- 2026-09-30 — Implementation started (status → doing). Read the task doc, both planning-rules
  files and dms-server `CLAUDE.md`; read both adapters, `db/index.js`, the `dms.controller.js`
  transaction blocks and helpers, `table-resolver.js` `allocateId`/`ensure*`. Next: Phase 0 repro on
  the Docker PG harness.
- 2026-09-30 — Baseline recorded (see "Baseline before any code change"): all suites green except
  `test-auth.js`, which had two pre-existing harness defects, both fixed test-side (a local
  `auth-sqlite.config.json`, and §8's stale `/users/byProject` shape); it is now 104/0 on SQLite.
  **Phase 0 DONE: Bug 14 reproduced** on the Docker harness. 138/144 concurrent requests split
  across backends; 2 left their `BEGIN` backend idle in transaction after resolving; 2 failed
  writes' rows committed; 156/160 acknowledged writes lost. Next: Phase 1 adapter API.
- 2026-09-30 — Implementation plan written into the doc. **Phase 1 DONE:** `withTransaction` +
  `tx` handle + `afterCommit` + re-entrancy guard on both adapters, and the SQLite FIFO lock;
  smoke-verified on SQLite and Docker PG. The old methods keep their bodies (INTERIM) until
  Phase 2 finishes. Next: Phase 2, starting with `dms.controller.js`.
- 2026-09-30 — Phase 2: `dms.controller.js` converted (4 blocks, helpers take `tx`, broadcast and
  page-delete hook moved to `afterCommit`). SQLite `npm test` + sync green; PG graph/workflow/
  delete-cascade green; Phase 0 repro clean. Next: `sync.js`.
- 2026-09-30 — Phase 2: `sync.js` `/sync/push` converted; `test-sync.js` 84/0 on SQLite + PG.
  Next: `auth.js`.
- 2026-09-30 — Phase 2: `auth.js` 6 flows converted; `test-auth.js` 104/0 on SQLite + PG.
  Next: `uda.tasks.controller.js`.
- 2026-09-30 — Phase 2: `uda.tasks.controller.js` 3 flows converted; `test-uda` 132/0 SQLite, 133/0
  PG (= baseline). Found `test-deprecate-internal-dataset.js` failing for an unrelated
  pre-existing reason (regex `/i`); logged, not fixed. Next: `db/index.js` `init*`.
- 2026-09-30 — Phase 2: `db/index.js` 7 `init*` → `runSchemaScript` + `withTransaction`; fresh-DB
  init verified on SQLite and on a fresh PG container. Next: SQLite task-queue claims, osm worker.
- 2026-09-30 — **Phase 2 DONE.** SQLite claims (3) → `withTransaction` (`test-tasks` 22/0,
  `test-schedules` 29/0); `data-types/osm/worker.js` converted; CAS comment added;
  `test-db-copy.js` fixture converted; its 41/1 result was shown to be pre-existing (identical
  with the original adapters). The old methods now throw. Next: Phase 3 tests + guard.
- 2026-09-30 — Phase 3: `test-transactions.js` (21/0 SQLite), `test-transactions-pg.js` (10/0),
  `test-transaction-guard.js` written and wired in (`npm test` + PG runner). A mutation check
  shows they fail against the old mechanism (8/21 and 5/10). Docs: dms-server `CLAUDE.md`
  "Transactions" section, `tests/CLAUDE.md` table. Next: final full-suite run.
- 2026-09-30 — Review pass: added a client `'error'` listener to the PG `withTransaction`
  (pg-pool drops its own at checkout, so a backend killed between statements was an unhandled
  `'error'`), plus a killed-backend test, mutation-checked. Final full run green (table in
  Phase 3); the pre-existing `test-db-copy` / `test-deprecate` failures are unchanged. **Status →
  built, Release: deploy — dms-server deploy.** No git, no deploy done. Owner decisions are listed
  under Open questions.
