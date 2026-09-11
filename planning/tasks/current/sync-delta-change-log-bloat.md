# Sync delta / change_log bloat + non-convergence — full-app delta OOM'd the server, and `catchUp()` can never advance past it

**Status:** Items A, B, 1, 3, 4 + the `"no-access"` push loop all implemented 2026-09-10.
Code complete and unit-tested; the live convergence + reclaim checks in the Testing Checklist
still need a real browser and an operator-scheduled vacuum.
**Found:** 2026-09-10, diagnosing "the server on 5556 is responding slowly" on the
`dms-template-server` container (mercury / `dms-mercury-3` / app `mitigat-ny-prod`).

> **Revised 2026-09-10 after reading the client.** The first draft of this task treated
> "bound the delta payload" as the missing fix and claimed items 1 and 4 would shrink the
> payload. **Both were wrong.** The client already has a too-large-delta bootstrap fallback;
> the non-convergence is a scope-key bug in one of its three call sites (item A). And items 1
> and 4 do **not** reduce the delivered payload at all — see "What items 1 and 4 actually do".

## Objective

Two independent problems, found together:

1. **Non-convergence (item A).** Sync clients can never advance past a large backlog, because
   `catchUp()` re-bootstraps without clearing the watermark it re-reads. This is the live bug.
2. **Cost (items B, 1, 4).** The full-app delta reads and serializes an entire app's
   `change_log` backlog — including rows it is guaranteed to discard — and `change_log` stores
   multi-megabyte snapshots of split-table rows no client ever receives.

## Root cause of the non-convergence (item A) — one missing line

`packages/dms/src/sync/sync-manager.js` has **three** places that fetch a delta and fall back
to a re-bootstrap when it exceeds `STALE_DELTA_THRESHOLD` (1000, `sync-manager.js:29`). Two
clear the stale watermark first. One does not:

| site | line | clears watermark? |
|---|---|---|
| `bootstrapPattern` delta | `sync-manager.js:309` | `await setLastRevision(null, scope)` ✅ |
| `bootstrapFull` delta | `sync-manager.js:379` | `await setLastRevision(null)` ✅ |
| **`catchUp`** | `sync-manager.js:500` | **nothing** ❌ |

```js
// catchUp(), sync-manager.js:493-505
const lastRev = await getLastRevision();          // ← UNSCOPED key: 'last_revision'
...
if (changes.length > STALE_DELTA_THRESHOLD) {
  console.warn(`[sync] catchUp delta too large ...`);
  await bootstrapSkeleton();                       // ← writes only 'rev:skeleton:<siteType>'
  return;                                          // ← 'last_revision' never touched
}
```

`getLastRevision(scope)` keys on `rev:${scope}` when scoped and `last_revision` when not
(`sync-manager.js:120-128`). `bootstrapSkeleton()` sets its revision under
`scope = skeleton:${_siteType}` (`sync-manager.js:181, 230`) — **a different key**. So the
unscoped `last_revision` that `catchUp()` reads is never advanced and never cleared.

`catchUp()` runs on every WebSocket `onopen` (`sync-manager.js:435`). The loop:

1. WS connects → `catchUp()` → `GET /sync/delta?since=<stale last_revision>`
2. Server builds and sends the full backlog (436 MB, 40–120 s)
3. Client parses it, sees `changes.length` (40,511) > 1000, discards all of it
4. `bootstrapSkeleton()` advances a *different* key; `last_revision` unchanged
5. Next reconnect → identical request → back to step 1, forever

This is exactly the observed evidence: `since` values `890584`, `893395`, `905516`, `907608`
constant across dozens of attempts, never advancing, for hours. The OOM crash loop (every
~48 s) was reconnecting every client constantly and hammering step 1; fixing the heap stopped
the crashing but not the loop, because the loop is client-side.

**Fix:** add `await setLastRevision(null)` before the `bootstrapSkeleton()` call, matching its
two sibling branches. Then confirm the subsequent cold path actually repopulates the unscoped
watermark — `bootstrapSkeleton()` alone does not set `last_revision`, so verify whether
`catchUp` should instead reset *and* fall through to `bootstrapFull()`, or whether a null
`last_revision` is correctly handled on the next pass. **Do not ship the one-liner without
checking that**, or the loop becomes "re-bootstrap skeleton every reconnect" instead.

## Assessment 2026-09-10 (session 2) — item A is deeper than "one missing line"

Reading the client end-to-end before implementing turned up three bugs in the same
watermark-reset path. The missing `setLastRevision(null)` in `catchUp()` is real, but adding it
alone would have fixed nothing, because **`setLastRevision(null)` does not clear anything.**

### A1 — `setLastRevision(null)` writes the string `"null"`

`setLastRevision` (`sync-manager.js:126-128`) does `setState(key, String(rev))`, and `setState`
(`idb-store.js:109`) `put`s that value verbatim. So a "clear" stores the four-character string
`"null"`. On the way back out, `getLastRevision` (`sync-manager.js:120-123`) does:

```js
const value = await getState(key);       // "null" — a real row, so not the null default
return value !== null ? parseInt(value, 10) : null;   // parseInt("null", 10) === NaN
```

`lastRev` comes back as **`NaN`, not `null`**, and every cold-start test in the file is
`lastRev === null`. So both branches this task doc marked ✅ ("clears watermark") are broken
too — they clear nothing and then re-enter the *warm* delta branch.

### A2 — a "cleared" watermark asks the server for the entire change_log

With `lastRev = NaN` the warm branch builds `…&since=NaN`, and the server does
`parseInt(since, 10) || 0` (`sync.js:264`) → **`sinceRev = 0`**. `bootstrapFull`'s stale
fallback therefore recurses on a delta covering *every revision the app has ever had* —
strictly worse than the payload it was trying to avoid. `bootstrapFull` is unreachable in the
live path today (`initSync` → `bootstrapSkeleton` → `connectWS` → `catchUp`, plus
`bootstrapPattern` on navigation; `bootstrapFull` is called only from its own recursion and one
commented-out line at `sync-manager.js:178`), which is the only reason this is not the headline
symptom. It is the worst-case shape of the same bug and should not be left armed.

### A3 — `bootstrapPattern`'s stale fallback resolves a promise with itself

`_bootstrapPatternImpl`'s too-large branch does `_loadedPatterns.delete(t); return
bootstrapPattern(t)` (`sync-manager.js:310-311`). At that moment `_inflightBootstraps` still
holds *this* impl's own promise, so the public wrapper hands it straight back
(`sync-manager.js:267`) and the async function resolves its own promise with itself →
`TypeError: Chaining cycle detected for promise #<Promise>`, delivered as a rejection the
surrounding `try/catch` cannot see (the cycle is detected at the resolve boundary, outside the
function body). The pattern is never re-bootstrapped.

### Consequence for the fix

Item A is not a one-liner. The minimum coherent fix is:

1. Make a null watermark actually clear (delete the `sync_state` key), and make
   `getLastRevision` treat any non-finite stored value as cold — browser profiles already
   carrying a `"null"` string from A1 have to recover on their own.
2. Recurse into `_bootstrapPatternImpl`, not the memoizing wrapper.
3. In `catchUp`, **advance** the watermark to the tail the server reports and cold-re-bootstrap
   the scopes this client actually holds (skeleton + loaded patterns) — not merely clear it.
   Clearing alone makes `catchUp` a silent no-op until some later WS message happens to seed
   `last_revision`, which is precisely the "re-bootstrap skeleton on every reconnect" outcome
   this doc warned against.

### Also found — the WS broadcast does not honour the split-type exclusion

`appendChangeLog` (`dms.controller.js:243`) and `/sync/push` (`sync.js:462`) broadcast
`{ item: { …, data } }` with the **full** `data` blob for `:data` types, and the client's
`ws.onmessage` (`sync-manager.js:440`) has no `isSyncExcluded` equivalent — it upserts whatever
arrives into IndexedDB. So one 7.7 MB `jurisdictions|…:data` write ships 7.7 MB to every
subscribed client and lands in a local mirror that `bootstrap`/`delta` deliberately keep those
rows out of. Same family as items 1 and 4, opposite direction (push, not pull), and
inconsistent with the pull path either way. Recorded as a follow-up, not fixed here — whether
the client *should* mirror dataset rows at all is a design question, not a bloat fix.

## Implementation Plan — DONE 2026-09-10

Ordered so each step is independently verifiable. Items A and B touch both sides of the
protocol; items 1 and 4 are server-only.

### Step 1 — client: make a null watermark actually clear (A1)

- `idb-store.js`: add `removeState(key)` — a `delete` on `sync_state`, alongside
  `getState`/`setState`.
- `sync-manager.js` `setLastRevision(rev, scope)`: when `rev == null`, `removeState(key)`
  instead of writing `String(null)`.
- `sync-manager.js` `getLastRevision(scope)`: return `null` unless the parsed value is a finite
  number, so an already-persisted `"null"` (or any junk) reads as cold instead of `NaN`.

### Step 2 — client: fix the pattern re-bootstrap recursion (A3)

- `_bootstrapPatternImpl`'s too-large branch returns `_bootstrapPatternImpl(patternType)`
  directly, bypassing the `_inflightBootstraps` memo that would otherwise hand back its own
  promise.

### Step 3 — protocol: `tooLarge` instead of a payload nobody wants (item B)

Server, `/sync/delta`:

- Threshold `maxChanges = min(client-supplied ?maxChanges, DMS_SYNC_MAX_DELTA ?? 1000)`. Taking
  the **min** is what makes the two thresholds agree in the safe direction: the server only
  ever ships a row count the client has already said it will accept, so a served delta can
  never be discarded client-side. A client asking for less than the server default is honoured;
  one asking for more is capped.
- Run `SELECT count(*)` on the same predicate as the row query first. Past the threshold,
  return without ever touching the rows:
  `{ tooLarge: true, count, revision: sinceRev, latestRevision, changes: [] }`.
- `revision: sinceRev` (not the tail) and `changes: []` are deliberate: a **pre-`tooLarge`
  client** parsing this response applies nothing and rewrites the watermark it already had, so
  it keeps looping as it does today but at the cost of one `count(*)` instead of 436 MB. Had the
  tail gone in `revision`, such a client would jump its watermark past thousands of changes it
  never received — the silent permanent gap this file's own bootstrap/delta ordering comments
  exist to prevent. New clients read the tail from `latestRevision`.

Client, all three delta call sites:

- Send `&maxChanges=${STALE_DELTA_THRESHOLD}`.
- Treat `payload.tooLarge` exactly like `changes.length > STALE_DELTA_THRESHOLD`, behind one
  shared predicate so the two cannot drift apart.

### Step 4 — client: make `catchUp` converge (item A)

Replace the bare `bootstrapSkeleton()` in the too-large branch with:

- `setLastRevision(latestRevision ?? revision)` — advance to the tail the server just reported,
  so the next reconnect asks for a small window instead of re-requesting the same one.
- `reBootstrapLoadedScopes()` — new helper: clear `rev:skeleton:<siteType>` and the
  `rev:pattern:<t>` of every entry in `_loadedPatterns`, drop them from `_loadedPatterns`, then
  `bootstrapSkeleton()` and `bootstrapPattern(t)` for each. Those snapshots are read *after*
  the tail revision, so the client lands at or ahead of the watermark it just wrote; the next
  delta may redundantly re-deliver a change already in the snapshot, which `applyChanges` is
  idempotent about. Same safe direction `/sync/bootstrap`'s revision-before-items comment
  already argues for.

Ordering matters: write the watermark **before** re-bootstrapping, so a failure mid-bootstrap
leaves the loop broken rather than re-armed.

### Step 5 — server: stop reading rows the response will discard (item 1)

- Add `AND type NOT LIKE '%:data'` to the full-app delta row query and its new `count(*)`, to
  the pattern-scoped row query and count, and to the `item_id IN (…)` skeleton query.
- **Keep** the JS `isSyncExcluded` filter. The SQL predicate catches the current
  `{source}|{view}:data` form only; the legacy `NAME_SPLIT_REGEX` form
  (`table-resolver.js:21`, e.g. `traffic_counts-1`) has no `:data` suffix and is caught only in
  JS. The count and the row query must carry the *same* SQL predicate, or `count` and
  `changes.length` disagree.

### Step 6 — server: stop snapshotting split-row data into change_log (item 4)

- Both writers — `/sync/push` (`sync.js:447`) and `appendChangeLog`
  (`dms.controller.js:232`) — write `data = NULL` when `isSplitType(type)`. The revision row is
  still written, so ordering, compaction and `MAX(revision)` are unchanged; only the blob goes
  away. Nothing reads it: `/sync/delta` excludes these types before serializing, and the WS
  broadcast uses the in-memory row rather than the change_log copy.
- Ship the one-time cleanup as a checked-in script, not an automatic migration — nulling 24 GB
  of TOAST and actually reclaiming it needs `VACUUM FULL`/`pg_repack` under an exclusive lock,
  which is an operator's call, not a boot-time side effect.

### Step 7 — server + client: the `"no-access"` poison mutation

- Server `/sync/push`: reject a non-integer `item.id` with **400** before it reaches a `bigint`
  cast, instead of letting Postgres raise and returning 500.
- Client `pushMutation`: on a **permanent** rejection (400/404/409/422 — a mutation no retry can
  fix) drop the pending row and carry on, instead of calling `retryFlush()`. 401/403/408/429 and
  every 5xx stay retryable, since a login or a restart genuinely can fix those.
- Client `retryFlush`: exponential backoff 500 ms → 30 s ceiling, reset on any successful push.
  Today it is a fixed 500 ms with no ceiling, which is what turned one bad mutation into 404
  server-side errors.

## What items 1 and 4 actually do (correction)

Neither shrinks the delivered payload. `isSyncExcluded` filters `:data` rows out of `changes`
at `sync.js:335` **before** the response is built, so the payload already contains zero of
them. Measured in the window `revision > 907608`:

| | rows | `data` bytes (compressed) |
|---|---|---|
| kept → sent to client | 37,167 | 93 MB |
| discarded `:data` | 1,998 | 24 MB |

The 436 MB response is 100% "kept" rows — component/page churn, not `:data`. So:

- **Item 1** (filter in SQL) removes ~24 MB of pointless DB read, de-TOAST and parse per
  request. It reduces server heap and CPU. **Payload: unchanged.**
- **Item 4** (stop snapshotting `:data`) reclaims ~24 GB of disk and speeds up table scans.
  **Payload: unchanged.**

Both are worth doing. Neither fixes convergence, and neither should be described as bounding
the payload.

## Item B — the server serializes a payload the client never wanted

The client decides to throw the delta away based on `changes.length`, but only *after*
`await res.json()` has transferred and parsed all 436 MB. The server spends 40–120 s and
~1 GB of heap producing a response whose only use is to have its array length measured.

Since the client already knows what to do with "too large", the cheap fix is to let the server
say so before serializing:

- `SELECT count(*)` on the same predicate first (cheap — `idx_change_log_app_rev` covers it),
  and if it exceeds a server-side threshold, return `{ tooLarge: true, count, revision }`
  instead of the rows;
- client treats that response the same way it treats `changes.length > STALE_DELTA_THRESHOLD`
  today.

This is not paging. Paging would be wasted work here — nobody wants the pages. (If a
genuinely incremental catch-up is wanted later, that is a separate design question.)

Note the server threshold and `STALE_DELTA_THRESHOLD` must agree, or a delta the server
happily returns can still be discarded client-side.

## Current State — how it presented

Container was in a hard OOM restart loop: **26 fatal heap OOMs across 27 boots in ~25
minutes**, dying every ~48 s.

```
[sync/delta] app=mitigat-ny-prod full-app since=907608 → 37146 changes, 292632.7KB, rev=946768, 19926ms
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

Not environmental: 72 cores / 1 TB RAM at load 5.85, no container memory limit, and the
"remote" DB `mercury.availabs.org:5435` resolves to `169.226.252.84` — the same host, via the
local `postgis-container`. The ceiling was Node's own default old-space cap (**4144 MB**); the
image set only `--max-http-header-size`.

The healthcheck POSTs `{}` to `/graph`, which answers fine mid-delta, so the container
reported `healthy` between OOMs. That is why this presented as slowness, not an outage.

### Why one request costs ~1 GB

`sync.js:328-336` — `SELECT *`, no `LIMIT`, then `sync.js:339` holds a `JSON.stringify` copy
of the whole result alongside the parsed rows. `idx_change_log_app_rev (app, revision)`
already exists; the cost is de-TOASTing and parsing, not the lookup.

### `change_log` is 37 GB and 65% of it is one row

310,979 rows, 212 MB heap + ~37 GB TOAST, revisions 635678–946771, oldest 2026-08-11 — the
30-day retention is working.

| app / type | revisions | total `data` | avg/row |
|---|---|---|---|
| `mitigat-ny-prod` / `jurisdictions\|1346450:data` | 3,306 | **24 GB** | 7.7 MB |
| `mitigat-ny-prod` / `mitigateny_county_template_v3_copy_2\|component` | 41,082 | 213 MB | 5.4 KB |
| `mitigat-ny-prod` / `mitigateny_sullivan\|component` | 3,127 | 185 MB | 61 KB |

One dataset row rewritten 3,306 times, each write snapshotting the whole ~7.7 MB blob.

### What created the backlog

A write storm, not steady traffic — **7,263 rows in the single minute 15:04**, 3,597 at 15:01.
Writers: `created_by=1` / `ip=::ffff:127.0.0.1` / `ua=node` (3,616 rows — a local script), and
`created_by` NULL with no request context (7,297 rows — server-internal cascade). Concentrated
in `mitigateny_hamilton|component`: 3,615 inserts + 3,555 updates + 3,535 deletes in 30 min,
alongside a `prod|mitigateny_hamilton:pattern` delete. Consistent with a MitigateNY
county-load script plus a pattern delete cascading through the page-delete hook.

Worth noting the churn largely cancels — thousands of inserts followed by thousands of deletes
of the same items. A client catching up across it receives 10,700 changes describing items
that mostly no longer exist. Coalescing superseded revisions per `item_id` within a delta
window would collapse most of it. Not in scope here; recorded as a follow-up.

## Also found — not in the original scope

### `[sync/push]` poison-mutation loop

404 occurrences of `[sync/push] error: invalid input syntax for type bigint: "no-access"`,
plus 418 matching `<PostgresAdapter>` UPDATE failures. `sync.js:391` passes client-supplied
`item.id` straight into a `bigint` column with no validation.

This is **already partly known**: `clearPendingMutations()`
(`packages/dms/src/sync/sync-manager.js:801`) exists specifically for "a mutation queued
against the server's `no-access` placeholder id — found live 2026-09-09", and its own docstring
records that **`retryFlush()` has no backoff ceiling** and will "hit `/sync/push` forever". But
it must be called manually, so the loop is still running in production a day later.

Needs: server-side rejection with a 4xx (not a 500 from a Postgres cast error), **and** a
client-side rule that stops retrying a mutation the server has permanently rejected, rather
than relying on someone invoking `clearPendingMutations()` by hand.

### No compaction-horizon detection (latent)

`startCompaction` (`sync.js:500+`) hard-`DELETE`s rows older than `DMS_SYNC_COMPACT_DAYS`
(default 30). Nothing anywhere compares a client's `since` against `MIN(revision)` — the delta
query is `revision > sinceRev`, purely backward-looking. A client whose `since` was compacted
away silently receives a partial delta and believes it is current. Distinct from today's
issue, but the same class of silent gap as bug (7) in
`concurrent-page-editing-data-loss.md`, and it should be closed the same way: detect and force
a bootstrap.

## Item 3 — heap ceiling — DONE

- [x] `dms-template/Dockerfile` CMD carries `--max-old-space-size=16384` (verified against
      `node:22-alpine` that a command-line flag beats `NODE_OPTIONS`, so it holds regardless
      of `.env`).
- [x] `.env` carries a matching `NODE_OPTIONS` so a no-rebuild recreation of the
      already-built image also gets 16 GB.
- [x] `.env.example` documents it and warns that setting `NODE_OPTIONS` there will not change
      the heap size.

Heap limit 4144 → 16432 MB. Crash loop stopped: `RestartCount` 0, healthy, heap peaked 7.9 GB
and GC'd back to 1.9 GB.

**Stopgap only, and it does not fix convergence** — post-fix, deltas complete instead of
crashing but grow (436 MB, 40→117 s) and every `since` stays put, because of item A.

## Files Requiring Changes — DONE 2026-09-10

| File | Change | Status |
|---|---|---|
| `packages/dms/src/sync/idb-store.js` | new `removeState(key)` so a watermark can actually be deleted | ✅ |
| `packages/dms/src/sync/sync-manager.js` | **A1** — `setLastRevision(null)` deletes the key; `getLastRevision` treats any non-finite stored value as cold, so profiles carrying the old `"null"` string self-heal | ✅ |
| `packages/dms/src/sync/sync-manager.js` | **A3** — pattern re-bootstrap re-enters `_bootstrapPatternImpl`, not the memoizing wrapper (was a promise chaining cycle) | ✅ |
| `packages/dms/src/sync/sync-manager.js` | **item A** — `catchUp` advances `last_revision` to the server's tail, then `reBootstrapLoadedScopes()` cold-refreshes skeleton + loaded patterns | ✅ |
| `packages/dms/src/sync/sync-manager.js` | **item B** — `deltaQuery`/`isDeltaTooLarge`/`deltaSize`/`deltaTailRevision` shared by all three delta call sites; every request now sends `maxChanges` | ✅ |
| `packages/dms-server/src/routes/sync/sync.js` | **item B** — `resolveMaxChanges` (min of client's and server's), `buildDeltaQuery` (row + count over one shared predicate), `count(*)` before the rows, `{tooLarge, count, maxChanges, changes: [], revision: sinceRev, latestRevision}` past the threshold | ✅ |
| `packages/dms-server/src/routes/sync/sync.js` | **item 1** — `SQL_NOT_SPLIT_TYPE` on the full-app and pattern-scoped row + count queries and on the skeleton `item_id IN (…)` query; JS `isSyncExcluded` kept as the legacy backstop, skipped only for an explicit `?type=` | ✅ |
| `packages/dms-server/src/db/table-resolver.js` | **item 4** — new exported `changeLogData(type, action, data)`: null for deletes (as before) and null for split types | ✅ |
| `packages/dms-server/src/routes/sync/sync.js` | **item 4** — push writer uses `changeLogData` | ✅ |
| `packages/dms-server/src/routes/dms/dms.controller.js` | **item 4** — `appendChangeLog` uses `changeLogData` (the second, higher-traffic writer) | ✅ |
| `packages/dms-server/src/db/sql/maintenance/reclaim_change_log_split_data.sql` | **item 4** — new operator-run cleanup: batched null-out + the `VACUUM FULL`/`pg_repack` step left explicitly to a maintenance window. Nothing auto-loads it | ✅ |
| `packages/dms-server/src/routes/sync/sync.js` | `isValidItemId` — a non-integer `item.id` is a **400** before it reaches a bigint cast, not a 500 from Postgres | ✅ |
| `packages/dms/src/sync/sync-manager.js` (`pushMutation`) | `PERMANENT_PUSH_STATUSES` (400/404/409/410/422) → drop the queued mutation instead of retrying; 401/403/408/429 and all 5xx stay retryable | ✅ |
| `packages/dms/src/sync/sync-manager.js` (`retryFlush`) | exponential backoff 500 ms → 30 s ceiling, reset on a successful push or an emptied queue | ✅ |
| `dms-template/.env.example` | documents `DMS_SYNC_MAX_DELTA` and that the effective threshold is min(server, client) | ✅ |
| `dms-template/Dockerfile` | **item 3** — heap flag in CMD | ✅ (earlier) |

### New tests

| File | Covers |
|---|---|
| `packages/dms/tests/syncDeltaConvergence.test.js` | 7 tests driving the real `ws.onopen` → `catchUp` path against faked IndexedDB/fetch/WebSocket: the watermark advances and the next reconnect asks from the new one; `maxChanges` is sent; convergence still happens against a server with no `tooLarge`; an under-threshold delta still applies normally; a cold client no-ops; the pattern re-bootstrap resolves and goes cold; a `"null"` watermark reads as cold rather than `since=NaN`. **Verified to fail against the pre-fix `catchUp`** (2 of 7 red, the two convergence assertions). |
| `packages/dms-server/tests/syncDelta.test.js` | 23 tests: `resolveMaxChanges` min/fallback semantics and the "never exceeds the client threshold" invariant; `buildDeltaQuery` count-and-rows-share-one-predicate invariant across all four scopes, placeholder/param arity, split exclusion present for pattern + full-app and absent for explicit `?type=`; `changeLogData` for deletes / ordinary types / `:data` / legacy split form; `isValidItemId` including the literal `"no-access"`. |

## Testing Checklist

- [x] Heap ceiling active (4144 → 16432 MB; `RestartCount` 0, healthy, 0 OOMs)
- [x] CLI flag confirmed to override `NODE_OPTIONS` (tested against `node:22-alpine`)
- [x] **Item A: a client stuck at a stale `since` actually converges** — the one test that
      matters. `syncDeltaConvergence.test.js` drives `ws.onopen` → `catchUp` with a stale
      `last_revision` of 907608 against a `tooLarge` response, asserts the watermark becomes
      946768, and asserts the **second** reconnect requests `since=946768`. Confirmed red
      against the pre-fix `catchUp` (which left it at 907608), green after.
- [x] Item A does not turn into "re-bootstrap skeleton on every reconnect" — same test: the
      second reconnect issues a normal small-window delta, not another bootstrap.
- [x] Item B: server returns `tooLarge` without serializing the rows; client re-bootstraps on
      it. Verified live against the local server on the real mercury backlog: `since=0` →
      `{"tooLarge":true,"count":228237,"maxChanges":1000,"changes":[],"revision":0,
      "latestRevision":949545}` in **81 ms / 100 bytes**, against 436 MB and 40-120 s before.
- [x] Item B: server threshold and `STALE_DELTA_THRESHOLD` agree — structurally, not by
      convention: the client sends its own threshold and the server takes the min, so a served
      delta is always under the client's limit. Unit-tested as an invariant
      (`resolveMaxChanges` "never exceeds the client threshold"), and confirmed live that
      `maxChanges=5` is honoured over the server's 1000.
- [x] Item 1: full-app delta returns byte-identical `changes` before/after the SQL filter.
      Checked on live data instead of by diff: for the window `since=949000` the SQL-filtered
      `count` is 622 and `changes.length` after the JS backstop is also **622**, so the JS pass
      removes nothing and the two predicates agree on this app's data.
- [x] Item 1: legacy `NAME_SPLIT_REGEX` split types still excluded — the JS `isSyncExcluded`
      pass is retained for exactly this and asserted by `buildDeltaQuery`'s `excludeSplit`
      flag; `changeLogData('traffic_counts-1', …)` is unit-tested too.
- [x] Item 1: pattern-scoped delta unaffected — `buildDeltaQuery` tests cover the pattern
      scope's params, placeholder arity and instance-prefix sibling matching.
- [x] Item 1: `:data` rows really are being excluded (i.e. the filter does work) — a
      `?type=jurisdictions|1346450:data` delta reports 3,306 rows, matching the figure in this
      doc, while the full-app scope's 228,237 excludes them.
- [x] Item 4: `:data` insert/update/delete still produces a revision, with no `data` blob —
      `changeLogData` unit-tested for all three actions; `change_log.data` is nullable
      (`change_log.sql`) and the `RETURNING revision` insert is otherwise untouched.
- [ ] Item 4: reclaimed table size confirmed after vacuum — **needs an operator**. Run
      `src/db/sql/maintenance/reclaim_change_log_split_data.sql` (step 0 reports the savings
      read-only first), then schedule step 2's `VACUUM FULL`/`pg_repack` in a maintenance
      window; it takes an ACCESS EXCLUSIVE lock on a 37 GB table.
- [x] `"no-access"` push rejected with 4xx; client stops retrying without manual intervention —
      `isValidItemId` returns 400 before the bigint cast, and `PERMANENT_PUSH_STATUSES` drops
      the queued mutation on a 400 rather than calling `retryFlush()`. Both unit-tested.
- [ ] Live browser pass on a real stale profile — the tests fake IndexedDB, so one run in a
      browser that actually carries a stale `last_revision` (or a `"null"` pattern watermark)
      is still worth doing before this is closed out.

## Follow-ups (not scoped here)

- Coalesce superseded revisions per `item_id` within a delta window — would collapse
  insert-then-delete churn that currently ships in full.
- Detect a `since` older than the compaction horizon and force a bootstrap.
- The `mitigateny_hamilton` churn itself: a county load generating ~10,700 `change_log` rows
  (mostly self-cancelling) is worth looking at from the script side.
- ~~The WebSocket broadcast still ships full `data` for `:data` types and the client's
  `ws.onmessage` still applies them~~ — **split out and implemented** 2026-09-10 as
  [`sync-ws-broadcast-split-row-payload.md`](./sync-ws-broadcast-split-row-payload.md)
  (Option A: broadcast a notification, not a payload).
- `bootstrapFull` is dead code (reachable only from its own recursion) and has been flagged
  `no-unused-vars` by eslint since before this task. It was fixed in place here rather than
  deleted, to keep this change reviewable; deleting it is a separate call.

## Diagnosis notes

- `type` contains a `|` (`{parent}:{instance}|{rowKind}`), so `psql -F'|'` output is
  misleading — use another separator.
- Useful queries:
  ```sql
  -- where the bytes are
  SELECT app, type, count(*), pg_size_pretty(sum(pg_column_size(data)))
  FROM dms.change_log GROUP BY 1,2 ORDER BY sum(pg_column_size(data)) DESC LIMIT 20;

  -- fetched-then-discarded share of a delta window
  SELECT type LIKE '%:data' AS discarded, count(*),
         pg_size_pretty(sum(pg_column_size(data)))
  FROM dms.change_log WHERE app='mitigat-ny-prod' AND revision > 907608 GROUP BY 1;
  ```
