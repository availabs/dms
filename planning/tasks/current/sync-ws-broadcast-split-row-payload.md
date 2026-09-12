# Sync WebSocket broadcast ships full dataset-row payloads the pull path deliberately excludes

**Status:** Implemented 2026-09-10. Server + client + local-mirror purge done, 15 new unit tests
(6 confirmed red against the pre-change handler); one live-browser confirmation still open.
**Split out of:** [`sync-delta-change-log-bloat.md`](./sync-delta-change-log-bloat.md), where this
was recorded as a follow-up ("Also found — the WS broadcast does not honour the split-type
exclusion"). That task stopped storing `data` for split types in `change_log`; this one stops
*broadcasting* it.

## Objective

Make the sync **push** path agree with the sync **pull** path about dataset rows.

The pull path (`/sync/bootstrap`, `/sync/delta`) deliberately never delivers split-table
(`:data`) rows: they live in their own `data_items__<source>` tables, they can be arbitrarily
large, and they are fetched on demand through the normal Falcor/UDA path instead. The push path
(the WebSocket `change` broadcast) delivers them **in full** — a 7.7 MB blob per write for
`jurisdictions|1346450:data` — to whichever clients happen to be connected without a pattern
subscription at that moment.

Option A of the two directions considered: **broadcast a notification, not a payload.**

## Current State

### The write path, after the change_log fix

A dataset-row write reaches `appendChangeLog` (`dms.controller.js:232`). The DB insert now
stores `changeLogData(type, action, data)` → NULL for split types. But two lines later the
broadcast message is built from the **in-memory `data` argument**, not from what was stored:

```js
// dms.controller.js:243
const msg = { type: 'change', revision, action,
  item: action === 'D' ? { id: itemId, app, type }
                       : { id: itemId, app, type, data } };   // ← full 7.7 MB
_notifyChange(app, msg);
```

`/sync/push` (`sync.js:462`) does the same with `resultItem`. The stored copy and the broadcast
copy were always two independent uses of the same variable; item 4 fixed one of them.

### The broadcast serializes before it filters

```js
// ws.js:539
function notifyChange(app, msg) {
  const subs = appSubscribers.get(app);
  if (!subs) return;
  const payload = JSON.stringify(msg);   // ← unconditional, once, before any per-client filter
```

So one subscriber anywhere on the app is enough to pay a ~7.7 MB string allocation per write —
in the process whose heap ceiling was raised to 16 GB because of this class of problem — even
if the per-client filter then drops every recipient.

### Who receives it

| client state | receives a `:data` broadcast? |
|---|---|
| pattern subscriptions, prefix collides (`typeMatchesPattern`, `ws.js:529`) | **yes** |
| pattern subscriptions, no collision | no |
| **empty `_patterns`** — connected but not yet subscribed to any pattern | **yes, everything** |
| `bufferedAmount > 1 MB` (`safeSend`, `ws.js:82`) | no, and never re-delivered |

`typeMatchesPattern` has the same instance-prefix collision as the delta query
(`itemType.startsWith(instancePrefix + '|')`), and those collisions are real in production:
`mitigateny_chemung2025|page|:data`, `freight_plan_mode_share|2214701:data`,
`pfs_labels|54428:data`, `pfs_test|54420:data` all share a prefix with a live pattern type.

The empty-`_patterns` case is every freshly-loaded tab before it navigates into a pattern, and
every reconnect in the window before its re-subscribe messages land.

### What the client does with it

`ws.onmessage` (`sync-manager.js`) has no `isSyncExcluded` equivalent. On the main thread it
`JSON.parse`s the 7.7 MB, runs it through the Yjs `applyRemote` merge, re-stringifies, writes it
to IndexedDB, and **adds the type to the sync scope registry**.

### Consequences

1. **Nondeterministic local state.** Whether a client's IndexedDB holds a given dataset row
   depends on what it was subscribed to at the instant of the write. A row that does arrive is
   never removed (bootstrap/delta never mention it) and never refreshed — it lingers stale until
   `resetDB`.
2. **A silent, unrecoverable gap.** A broadcast dropped by `safeSend`'s 1 MB buffer check can
   never be recovered by a later delta, because the delta filters that type out. Same class as
   the gaps the revision-ordering comments in `sync.js` and `myRevisions`' docstring exist to
   prevent.
3. **Scope-registry pollution (latent).** `addToScope(app, '<src>|<view>:data')` makes
   `isLocal()` true for that type. `dmsDataLoader`'s local intercept (`api/index.js:227`) fires
   only for `list`/`view`/`edit` actions, and dataset rows are read through Falcor/UDA rather
   than that intercept — so this is a hazard rather than a confirmed live bug, but it means a
   read that ever *did* route through the intercept would be served from a local mirror holding
   only whatever rows arrived by broadcast.
4. **Cost.** Server: one ~7.7 MB `JSON.stringify` per dataset-row write (3,306 such writes in
   the last 30 days). Network: 7.7 MB per recipient. Client: parse + Yjs merge + re-stringify +
   IndexedDB write of data nothing will ever read.

### Why removing the payload is behaviour-preserving — checked, not assumed

The obvious worry is that some live-update feature rides on this: a client viewing that dataset
gets fresh data pushed to it today. Tracing the consumers says the payload is not what drives
that.

`invalidate()` has exactly **one** consumer, `dmsSiteFactory.jsx:234`, and it **ignores the
scope argument** entirely:

```js
const unsub = syncAPI.onInvalidate(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (router) router.revalidate(); }, 150);
});
```

Any invalidation debounces into a `router.revalidate()`, which re-runs the route loaders and
refetches through Falcor/UDA. So the live update on a dataset write already comes from the
`invalidate()` call, **not** from the 7.7 MB landing in IndexedDB — which nothing reads. Keeping
`invalidate()` and dropping the payload therefore preserves today's observable behaviour.

## Proposed Changes

### 1. Server — strip split-row `data` centrally in `notifyChange`

Do it in `ws.js`'s `notifyChange`, not at the two call sites:

- one choke point covers both writers (`appendChangeLog` and `/sync/push`) and any future one;
- it sits exactly where the cost is, before `JSON.stringify`.

Add `stripSplitRowData(msg)`: when `msg.item.type` is a split type and `item.data` is present,
return a shallow copy with `data` removed and `dataOmitted: true` set. Use table-resolver's
broad `isSplitType` so the legacy `NAME_SPLIT_REGEX` forms are covered too.

The `dataOmitted` marker makes the wire format self-describing and shows up in the
`sync-broadcast` log entry; it is **not** what the client branches on (see below).

Nothing about subscriptions, revisions or ordering changes: the notification still carries
`revision`, `action`, and `item.{id, app, type}`.

### 2. Client — treat a split-row broadcast as an invalidation hint

In `ws.onmessage`, before the insert/update/delete handling:

- if the item's type is a split type: advance the watermark, fire both the general and
  type-scoped `invalidate()`, and return;
- **do not** `upsertItemNow` / `deleteItem`, and **do not** `addToScope`.

Branch on the **type**, not on the server's `dataOmitted` marker — that way a client running
against an older server still refuses to mirror the blob instead of depending on the server to
have been upgraded first.

### 3. Client — purge split rows an earlier build already wrote locally

Existing profiles carry `:data` rows in IndexedDB from before this change. They are dead weight
that nothing will ever refresh or remove. Add a once-per-session `purgeLocalSplitRows()` run
from `bootstrapSkeleton`: enumerate the app's distinct types, and for any split type delete its
rows. In the steady state that is one extra index scan per session and finds nothing.

## Files Requiring Changes — DONE 2026-09-10

| File | Change | Status |
|---|---|---|
| `packages/dms-server/src/routes/sync/ws.js` | `stripSplitRowData(msg)` + called in `notifyChange` **before** `JSON.stringify`; `dataOmitted` added to the `sync-broadcast` log entry; helper exported for testing | ✅ |
| `packages/dms/src/sync/sync-manager.js` | `ws.onmessage` split-type guard — advance the watermark, fire both invalidations, return; no `upsertItemNow`/`deleteItem`, no `addToScope` | ✅ |
| `packages/dms/src/sync/sync-manager.js` | `purgeLocalSplitRows()`, once per session from `bootstrapSkeleton`, clears `:data` rows an earlier build mirrored | ✅ |

**Design note — where the strip lives.** In `notifyChange` rather than at the two call sites
(`appendChangeLog`, `/sync/push`): one choke point covers both writers plus any future one, and
it sits exactly where the cost was, immediately before the unconditional `JSON.stringify`.
An ordinary-type message is returned by **identity** (`return msg`), so the non-split path adds
no copy and no allocation.

**Design note — the client branches on the type, not on `dataOmitted`.** The server flag exists
for wire-format clarity and logging. Branching on it would make the client's refusal depend on
the server having been upgraded first; branching on the type means a new client refuses to
mirror a blob even from an old server, and an old client receiving a stripped message just fires
the same invalidation it always did.

### New tests

| File | Covers |
|---|---|
| `packages/dms-server/tests/syncBroadcast.test.js` | 7 tests: payload dropped and marked for `:data`; the notification keeps revision/action/id/app/type; an ordinary type is returned by identity and is byte-identical; the legacy `NAME_SPLIT_REGEX` form is stripped; a delete and an item-less message are untouched; a 200 KB payload serializes to <200 bytes. |
| `packages/dms/tests/syncBroadcastSplitRows.test.js` | 8 tests driving real broadcasts through `ws.onmessage`: watermark advances and both invalidations fire with nothing written locally; the split type is not added to scope; the payload is refused even when an old server still attaches it; a split-row delete does not touch the mirror; an ordinary type still upserts and scopes as before; `purgeLocalSplitRows` deletes only `:data` rows, runs once per session, and no-ops when there is nothing to purge. **6 of the 8 confirmed red against the pre-change handler.** |

## Testing Checklist

- [x] Server: a `:data` change broadcasts `{revision, action, item:{id,app,type,dataOmitted}}`
      with no `data`
- [x] Server: an ordinary type's broadcast is byte-identical to before (asserted by identity
      *and* by `JSON.stringify` equality)
- [x] Server: a delete broadcast (which never carried `data`) is unchanged
- [x] Server: the legacy `NAME_SPLIT_REGEX` split form is stripped too
- [x] Server: `ws.js` loads under plain node with the new `#db/table-resolver.js` require, and
      a 100,115-byte message strips to **124 bytes** (checked at runtime, not just in vitest)
- [x] Client: a `:data` broadcast advances `last_revision`, fires `invalidate`, and writes
      nothing to IndexedDB
- [x] Client: a `:data` broadcast does **not** add the type to the sync scope
- [x] Client: a `:data` broadcast from an **older** server (payload still attached) is also
      refused locally
- [x] Client: an ordinary broadcast still upserts and adds to scope
- [x] Client: `purgeLocalSplitRows` deletes pre-existing local `:data` rows and leaves others
- [ ] Live browser: edit a dataset row with a table view open; confirm the view still refreshes
      (via revalidate → Falcor) and that no `:data` row appears in IndexedDB. **This is the one
      that still needs doing** — the reasoning that it will (the sole `onInvalidate` consumer
      ignores the scope argument and revalidates the router regardless) is traced from the code
      but not observed in a browser.

## Explicitly out of scope

- **The empty-`_patterns` fan-out.** A client with no pattern subscriptions still receives every
  change in the app. Option A removes the expensive case (dataset blobs), leaving ~5 KB
  component rows, so this drops in priority — but it is still a real over-broadcast.
- **`safeSend`'s 1 MB drop.** With payloads bounded this is far less likely to fire, but a
  dropped broadcast is still never recovered. Closing it properly means the same
  "detect-and-force-a-bootstrap" treatment as the compaction-horizon gap.
- **Coalescing / the copy-path churn** — see `sync-delta-change-log-bloat.md`'s follow-ups.
