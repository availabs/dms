# Sync delta / change_log bloat + non-convergence — full-app delta OOM'd the server, and `catchUp()` can never advance past it

**Status:** Item 3 (heap stopgap) DONE 2026-09-10. Items A, B, 1, 4 open.
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

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/sync/sync-manager.js:500` | **item A** — clear the unscoped watermark before re-bootstrapping; verify the cold path then repopulates it |
| `packages/dms-server/src/routes/sync/sync.js:325-336` | **item B** — count first; return `{tooLarge, count, revision}` past a threshold instead of the rows |
| `packages/dms/src/sync/sync-manager.js:493-512` | **item B** — handle a `tooLarge` response like the existing `STALE_DELTA_THRESHOLD` branch |
| `packages/dms-server/src/routes/sync/sync.js:332` | **item 1** — `AND type NOT LIKE '%:data'`; keep the JS filter as a backstop for the legacy `NAME_SPLIT_REGEX` forms (`table-resolver.js:34`), which the SQL predicate does not catch |
| `packages/dms-server/src/routes/sync/sync.js:294-299` | **item 1** — same predicate on the pattern-scoped query |
| wherever `change_log` rows are written | **item 4** — `data = NULL` (or skip the row) for `isSplitType(type)` |
| one-time migration / ops | **item 4** — null out existing `:data` snapshots, then `VACUUM FULL` / `pg_repack` (exclusive lock — schedule it) |
| `packages/dms-server/src/routes/sync/sync.js:391` | validate client-supplied `item.id` is an integer; return 4xx |
| `packages/dms/src/sync/sync-manager.js` (`retryFlush`) | stop retrying permanently-rejected mutations; add a backoff ceiling |
| `dms-template/Dockerfile` | **done** — heap flag in CMD |

## Testing Checklist

- [x] Heap ceiling active (4144 → 16432 MB; `RestartCount` 0, healthy, 0 OOMs)
- [x] CLI flag confirmed to override `NODE_OPTIONS` (tested against `node:22-alpine`)
- [ ] **Item A: a client stuck at a stale `since` actually converges** — the one test that
      matters. Reproduce with a >1000-change backlog, confirm `last_revision` advances across
      a reconnect instead of repeating the same `since`.
- [ ] Item A does not turn into "re-bootstrap skeleton on every reconnect"
- [ ] Item B: server returns `tooLarge` without serializing the rows; client re-bootstraps on it
- [ ] Item B: server threshold and `STALE_DELTA_THRESHOLD` agree
- [ ] Item 1: full-app delta returns byte-identical `changes` before/after the SQL filter (if
      it differs, the SQL and JS predicates disagree and the legacy forms matter)
- [ ] Item 1: legacy `NAME_SPLIT_REGEX` split types still excluded
- [ ] Item 1: pattern-scoped delta unaffected
- [ ] Item 4: `:data` insert/update/delete still produces a revision, with no `data` blob
- [ ] Item 4: reclaimed table size confirmed after vacuum
- [ ] `"no-access"` push rejected with 4xx; client stops retrying without manual intervention

## Follow-ups (not scoped here)

- Coalesce superseded revisions per `item_id` within a delta window — would collapse
  insert-then-delete churn that currently ships in full.
- Detect a `since` older than the compaction horizon and force a bootstrap.
- The `mitigateny_hamilton` churn itself: a county load generating ~10,700 `change_log` rows
  (mostly self-cancelling) is worth looking at from the script side.

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
