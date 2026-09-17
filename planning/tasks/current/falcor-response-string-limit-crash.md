# Falcor response exceeds V8's max string length and kills the process

**Status:** Items 1-3 + the request-logger fix IMPLEMENTED and tested 2026-09-16, awaiting
deploy. Item 4's code fixes are in; item 4's one-time **data cleanup is still outstanding** and
now tracked separately as
[`mny-prod-dead-content-cleanup`](../../../../planning/mitigateny/tasks/current/mny-prod-dead-content-cleanup.md)
(MitigateNY project — it is site data, not library code). Diagnosed 2026-09-16 while the server
was crash-looping.
**Found:** 2026-09-16, diagnosing "the server is having performance issues again" on
`dms-template-server` (port 5556, `dms-mercury-3`, app `mitigat-ny-prod`).

> Not a recurrence of [sync-delta-change-log-bloat](./sync-delta-change-log-bloat.md). Those
> fixes are holding: no OOM, heap steady at 4–8 GB of the 16 GB ceiling, and deltas are fully
> converged (`since=1435218 → 0 changes, 0KB, 2–90ms`). This is a separate failure that the
> same data growth eventually triggered on a different code path.

## Objective

Stop a single oversized Falcor response from killing the server process, and stop the app's
data from growing into that limit through accidental pattern duplication.

## Current State

The container is in a hard crash loop — **9 crashes in ~9 minutes, ~50 s apart**, starting
2026-09-16 15:35 (13 by the time this task was filed). It had run fine for the previous ~20
hours.

```
RangeError: Invalid string length
    at JSON.stringify (<anonymous>)
    at stringify (/app/node_modules/express/lib/response.js:1160:12)
    at ServerResponse.json (/app/node_modules/express/lib/response.js:271:14)
    at res.json (.../dms-server/src/middleware/request-logger.js:171:14)
    at SafeSubscriber._next (.../dms-server/src/utils/falcor-express/src/index.js:70:29)
    at SafeSubscriber.__tryOrUnsub (/app/node_modules/rxjs/Subscriber.js:234:16)
    ...
/app/node_modules/rxjs/observable/PromiseObservable.js:76
                    root_1.root.setTimeout(function () { throw err; });
```

### Why it throws

`res.json()` serialises the whole jsonGraph envelope with `JSON.stringify`. Verified in the
running container:

```
> require('buffer').constants.MAX_STRING_LENGTH
536870888   // 512 MiB
```

The response for `dms.data.mitigat-ny-prod` exceeds that. The request takes 33–41 s, then
throws at the serialisation step.

The request itself is not new — 6,089 `GET dms.data.mitigat-ny-prod` since 2026-09-15 19:33,
almost all fine. **What changed is the response size, not the request.**

### Why it kills the process instead of returning 500

`utils/falcor-express/src/index.js:62-81`:

```js
var subscription = obs.subscribe(function(jsonGraphEnvelope) {
    ...
    res.status(200).json(jsonGraphEnvelope);      // ← line 70, throws here
}, function(err) {
    ...                                           // ← only catches OBSERVABLE errors
    if (!res.headersSent) res.status(500).json({ error: message });
});
```

The second argument catches errors emitted by the observable. It does **not** catch a
synchronous throw inside the `next` handler. rxjs's `SafeSubscriber.__tryOrUnsub` catches that
throw and rethrows it via `PromiseObservable.js:76`'s `root.setTimeout(function () { throw
err; })` — a fresh macrotask with no handler above it.

And there is **no `uncaughtException` or `unhandledRejection` handler anywhere in the server**
(`grep -rn "uncaughtException\|unhandledRejection" packages/dms-server/src` → no matches). So
the process exits. `--restart unless-stopped` brings it back, a client retries the same query,
and it loops.

The same limit also breaks the request logger separately — 11 × `[RequestLogger] Failed to
write: Invalid string length` — which is why the fatal request never makes it into the
`.jsonl` and cannot be attributed to a client from the logs.

### Prior art in this codebase

`/sync/bootstrap` **already solved exactly this** (`routes/sync/sync.js:327-340`):

```js
// Stream JSON to avoid V8 string length limit on large payloads
res.setHeader('Content-Type', 'application/json');
res.write('{"items":[');
for (let i = 0; i < items.length; i++) { ... res.write(JSON.stringify(items[i])); }
res.write(`],"revision":${Number(revision)}}`);
```

That is why its **1.19 GB** `pattern=county_data_site|page` response (5,168 items, 18–24 s)
survives while the Falcor path dies. The Falcor path never got the same treatment.

### Why the data crossed the line now

`dms_mitigat_ny_prod.data_items` is **5.6 GB** (compressed on-disk; the JSON is substantially
larger). Revision went 946,771 → 1,435,218 in six days.

| type | items | `data` size | avg/row |
|---|---|---|---|
| `mitigateny_sullivan\|component` | 17,264 | 817 MB | 48 kB |
| `mitigateny_county_template_copy\|component` | 51,568 | 342 MB | 6.9 kB |
| `shmpcopy\|component` | 3,496 | 194 MB | 57 kB |
| `county_data_site\|component` | 4,863 | 193 MB | 41 kB |
| `sullivan_template\|component` | 4,791 | 192 MB | 41 kB |
| `county_template2_copy\|component` | 4,709 | 192 MB | 42 kB |
| `undefined_copy\|component` | 3,708 | 177 MB | 49 kB |
| `undefined_copy_copy\|component` | 3,701 | 177 MB | 49 kB |
| `undefined_copy_copy_copy\|component` | 3,701 | 177 MB | 49 kB |

### Root cause of the `undefined_copy` chain

`packages/dms/src/patterns/admin/components/patternList.jsx:413`, the duplicate-pattern button:

```js
const newName = `${editingItem.name}_copy`;
```

No guard for a missing `name` — an undefined name template-literals into the **string**
`"undefined_copy"`. Duplicating that gives `undefined_copy_copy`, then
`undefined_copy_copy_copy`, which is precisely the three generations in the table above, each
dragging ~3,700 components (~177 MB) along with it.

It also bypasses `nextAvailableCopyName` (`packages/dms/src/utils/type-utils.js:147`), the
helper written for this job — which handles sibling-slug collisions, though it has no
undefined guard either (`${baseName}${suffix}` at `type-utils.js:150`).

## Implementation status (2026-09-16)

| # | Item | Status |
|---|---|---|
| 1 | Serialisation failure no longer kills the process | **Done** |
| 2 | Process-level safety nets | **Done** |
| 3 | Stream the Falcor response | **Done** — streams rather than 413s |
| — | Request logger resilient to oversized payloads | **Done** |
| 4a | `patternList.jsx` / `type-utils.js` naming guards | **Done** |
| 4b | Audit `CardColumnPicker` / `ColumnManager` / `controls_utils` | **Done — no change needed** (see below) |
| 4c | One-time `undefined_copy*` data cleanup | **DONE 2026-09-16** → `dms-template/planning/mitigateny/tasks/completed/mny-prod-dead-content-cleanup.md` — 117,306 rows / 2,019 MB deleted |

Items 1 and 3 turned out to compose rather than compete. express's `res.json()` runs
`JSON.stringify` *before* it sets any header, so when it throws nothing has been written yet and
the same envelope can still be streamed out. The fallback therefore returns a **successful 200
with the full payload** instead of the 413/500 the task proposed; the 500 is kept only for when
streaming itself fails. The normal path is untouched — `res.json()` still handles every response
that fits.

New files:

- `packages/dms-server/src/utils/stream-json.js` — incremental JSON writer. Emits byte-identical
  output to `JSON.stringify` but flushes every 64 KiB, so no single string approaches the limit.
  Generalises the `/sync/bootstrap` trick from a flat `items` array to an arbitrary nested object.
- `packages/dms-server/src/utils/process-safety.js` — `installProcessSafetyNets()`. Extracted from
  `index.js` so it is testable in a child process rather than only by booting the whole server.

**Decision on item 2 (the task asked for this to be explicit): log loudly, do NOT exit.** The
standard objection is that an uncaught exception may leave corrupt state, so exiting is safer.
That does not hold here — this is a stateless request/response server, durable state is in
Postgres, and the request that threw is already abandoned. Against that, the default behaviour is
*guaranteed* harm: every in-flight request for every user dies and the fault repeats on the next
retry. `DMS_EXIT_ON_UNCAUGHT=1` restores fail-fast for local debugging. Repeated identical faults
are logged at occurrence 1, 10, 20, ... 100, 200, ... so a tight throw loop cannot fill the disk.

**Item 4b audit result — no change needed.** `CardColumnPicker.jsx:96`, `ColumnManager.jsx:45` and
`controls_utils.js:130` build `${base.name}_copy_${n}` as an in-memory `normalName` alias for a
column the user just picked out of an existing column list. Every column-creation path assigns a
name (source columns come from the data source; `AddStaticColumn` builds
`static_{slug}_{Date.now()}`; formula columns likewise), so there is no live path to an undefined
`name`. The blast radius also differs in kind: a bad `normalName` is a broken alias inside one
section's state, visible immediately — not a new pattern namespace that clones ~3,700 rows. Adding
a guard would be speculative, so these were left alone.

## Proposed Changes

### 1. Don't let a serialisation failure kill the process (`falcor-express/src/index.js:70`)

Wrap the `res.json()` call so a throw becomes a 500 instead of an uncaught async exception:

```js
try {
  res.status(200).json(jsonGraphEnvelope);
} catch (err) {
  console.error('[falcor-express] Failed to serialise response:', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Response too large to serialise' });
}
```

Smallest change that stops the crash loop. Note `res.headersSent` will still be false here
because the throw happens inside `JSON.stringify`, before anything is written.

### 2. Add process-level safety nets (`dms-server/src/index.js`, near the `app.listen` at :352)

`process.on('uncaughtException')` and `process.on('unhandledRejection')` that log loudly and —
deliberately — do **not** exit for this class of error. Nothing should be able to take this
server down via a bare `setTimeout` rethrow from inside a library.

Decide explicitly whether to keep the process alive on all uncaught exceptions or only log and
exit on genuinely unrecoverable ones; blanket-swallowing can mask real corruption. Recommend
logging + staying up, since the current behaviour (die on any async throw) is strictly worse.

### 3. Stream the Falcor response

Apply the `/sync/bootstrap` treatment to the Falcor path so a large jsonGraph never needs to
exist as one 512 MiB string. Harder than for bootstrap: bootstrap streams a flat `items` array,
while a jsonGraph envelope is a nested object, so this needs an incremental JSON writer over
the envelope's top-level keys rather than a simple per-item loop.

If streaming is too invasive for now, the fallback is to bound it: measure size during
serialisation and return a structured 413 telling the client to narrow its query. Item 1 must
land regardless — it is what converts "server dies" into "one request fails."

### 4. Fix the copy-naming bug and clean up the data

- `patternList.jsx:413` — guard the name, and route it through `nextAvailableCopyName` instead
  of hand-rolling the suffix.
- `type-utils.js:150` — make `nextAvailableCopyName` reject/fall back on an undefined
  `baseName` rather than producing `"undefined_copy"`.
- Audit the other hand-rolled `_copy` sites for the same hole:
  `CardColumnPicker.jsx:96`, `ColumnManager.jsx:45`, `controls_utils.js:130`.
- One-time cleanup of the `undefined_copy*` patterns and their ~11,000 orphaned components in
  `mitigat-ny-prod`. **This is site data, not library code** — coordinate with MitigateNY
  before deleting, and confirm nothing references them. See `planning/mitigateny/` for that
  project's conventions.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/utils/falcor-express/src/index.js:70` | **item 1** — try/catch around `res.json()`; 500 on serialisation failure |
| `packages/dms-server/src/index.js` (near `:352`) | **item 2** — `uncaughtException` / `unhandledRejection` handlers |
| `packages/dms-server/src/utils/falcor-express/src/index.js` | **item 3** — stream the envelope, or bound it and return 413 |
| `packages/dms-server/src/middleware/request-logger.js:171` | make the logger resilient to oversized payloads (currently 11 × "Failed to write") |
| `packages/dms/src/patterns/admin/components/patternList.jsx:413` | **item 4** — guard `name`; use `nextAvailableCopyName` |
| `packages/dms/src/utils/type-utils.js:150` | **item 4** — reject undefined `baseName` |
| `CardColumnPicker.jsx:96`, `ColumnManager.jsx:45`, `controls_utils.js:130` | **item 4** — audit for the same hole |
| MitigateNY data (`mitigat-ny-prod`) | **item 4** — one-time cleanup, coordinate first |

## Testing Checklist

Suites: `packages/dms-server/tests/test-stream-json.js` (29) and
`test-falcor-response-limit.js` (13), both wired into `npm test`; plus
`packages/dms/tests/nextAvailableCopyName.test.js` (9, vitest).

- [x] **Item 1: a >512 MiB Falcor response no longer kills the process** — the test that
      matters. Built a 629 MB envelope, asserted `JSON.stringify` throws `RangeError` on it
      (so express's real `res.json()` throws), then drove it through the actual middleware over
      HTTP: 200, 629,150,931 bytes delivered, process alive.
      Gated on heap: `FALCOR_LIMIT_BIG=1 node --max-old-space-size=4096 tests/test-falcor-response-limit.js`
- [x] Item 1: normal-sized Falcor responses unaffected (status, body and content-type identical,
      asserted against a control server)
- [x] Item 1: the server serves the next request normally after a serialisation failure
- [x] Item 1: if streaming *also* fails, the client gets a 500 rather than a dead socket
- [x] Item 2: a deliberate async throw is logged and does not exit the process — with a CONTROL
      case asserting the same throw *does* kill a process without the handlers
- [x] Item 2: an unhandled promise rejection likewise
- [x] Item 2: handlers don't swallow errors that should surface (ordinary try/catch unaffected;
      `DMS_EXIT_ON_UNCAUGHT=1` restores fail-fast; faults forwarded to the timeline logger)
- [x] Item 2: a repeating fault is rate-limited (25 throws → 3 log lines), not a disk filler
- [x] Item 3: a large jsonGraph round-trips byte-identically through the streaming writer —
      23 hand-written shapes plus 1,000 randomised structures compared against `JSON.stringify`,
      covering `toJSON`, non-finite numbers, omitted/`undefined` object values, array holes,
      lone surrogates, numeric-key ordering and null-prototype objects
- [x] Item 3: client parses a streamed envelope unchanged (`JSON.parse` round-trip)
- [x] Item 3: output is flushed in bounded chunks, never one string
- [x] Item 4: duplicating a pattern with no `name` produces a sane name, never `undefined_copy`
      (also covers `null`, `''`, whitespace, and the literal strings `"undefined"`/`"null"`)
- [x] Item 4: duplicating an existing copy still stacks correctly (`foo_copy` → `foo_copy_2`)
- [x] `RequestLogger` no longer drops the entry on an oversized payload — it retries with
      `response: { _omitted: true, reason }` so the timing and path record survives
- [x] **Item 4c: post-cleanup, `dms.data.mitigat-ny-prod` serialises under the limit** — the
      cleanup ran 2026-09-16 (117,306 rows / 2,019 MB). The crash request went from 65.5s +
      `RangeError` at 1.09 GB to **8.4s and 299 MB**, ~40% under the limit; heaviest remaining
      pattern 228 MB

Regression check: full `npm test` in `packages/dms-server` is green. The client vitest suite has
2 pre-existing failures in `syncDeltaConvergence.test.js` and 28 collection errors in the vendored
`falcor-router` mocha suite (missing `sinon`/`promise`); neither is reachable from these changes.

## Forensics: which actions actually did this (2026-09-16)

Read-only queries against `dms-mercury-3` / `dms_mitigat_ny_prod`.

**Method note.** `created_at`/`created_by` are *cloned verbatim* by the server-side duplicate
task, so a duplicated row carries the original's timestamp — useless for dating a duplicate.
The `id` sequence is not cloned, so id clusters date the events. (Ids 1, 2 and 3 are outliers
from a different insert path and must be excluded, or they poison the bracketing.)

### The trigger was the 49-county rollout, not the `undefined_copy` chain

| | rows | `data` size | share of app |
|---|---|---|---|
| Whole app | 513,428 | 4,931 MB | 100% |
| **Added 2026-09-15 16:54 → 09-16 13:55** | **187,584** | **956 MB** | **19.4%** |
| `undefined_copy*` chain (May–Jun 2025) | 11,594 | 531 MB | 10.8% |

50 county patterns were created between 2026-09-15 16:54 and 21:57 (49 of them, one every
~4 minutes, all `created_by = 1`) plus `MitigateNY_Schoharie` at 2026-09-16 13:55. Each cloned
the county template at a near-identical **3,597 rows / 19 MB**. That is ~956 MB — roughly a
quarter added on top of the pre-rollout ~3,975 MB, in one evening.

The crash loop began **2026-09-16 15:35**, ~1.6 h after the last of those patterns was created
and ~18 h after the bulk run finished — consistent with the task's note that the container had
run fine for the previous ~20 hours. This is the action that pushed the response over the line.

### The `undefined_copy` chain: three clicks in 2025, and it is fully orphaned

Dated by bracketing each id cluster against reliably-dated neighbours:

| type | id range | duplicate happened |
|---|---|---|
| `undefined_copy` | 1,266,143–1,280,468 | **2025-05-23 ~17:40 UTC** |
| `undefined_copy_copy` | 1,290,268–1,297,620 | **2025-05-27 ~20:12 UTC** |
| `undefined_copy_copy_copy` | 1,368,698–1,376,018 | **2025-06-16 ~16:02 UTC** |

Three separate duplicate clicks over ~3.5 weeks. **Attribution is not possible** — `created_by`
is null for every row of that era in this app (it only starts being populated around
2025-11-17), and the cloned rows inherit that null too.

Lineage, recovered from a shared `created_at` fingerprint (`2023-08-31T22:32:29.017Z`), in id
order: `county_data_site` (id 649,518, the 2023 original) → `undefined_copy` →
`undefined_copy_copy` → `undefined_copy_copy_copy` → `county_template2_copy` →
`sullivan_template`. So the chain began by duplicating **county_data_site** while its `name`
was missing, then duplicating the result twice more.

**All three have no pattern row.** The patterns were deleted at some point but the delete did
not cascade — delete-cascade only shipped 2026-08-05 (see
`reference_dms_delete_cascade_orphans`). So these 11,594 rows / 531 MB are pure dead weight
serving no page.

### The cleanup is bigger and safer than item 4c assumed

The same orphan check across the whole app: **27 instances, 45,044 rows, 1,002 MB — 20.3% of
the app** is component/page content whose pattern row no longer exists. The `undefined_copy*`
chain is only the largest three. Others: `design` (172 MB), `playground_archive` (91 MB),
`redesign2` (28 MB), `sullivantest2_recreate` (21 MB), several `admin_*`/`lhmp*` leftovers.

Reclaiming all of it is worth about a fifth of the app and takes the data back below where it
sat before the county rollout. It is still **site data** — the orphan check proves nothing
routes to it, but confirm with MitigateNY before deleting, and take a backup first.

## What the 500 MB request actually was (2026-09-16, reproduced)

The task's log line `GET dms.data.mitigat-ny-prod` is a **prefix**, not a full path — the
request logger prints `paths.slice(0,2).map(p => p.slice(0,3).join('.'))`, so
`dms.data.mitigat-ny-prod+mitigateny_sullivan|component` matches a grep for
`dms.data.mitigat-ny-prod`. The "6,089 requests, almost all fine" count is that prefix match
over every per-pattern component load. **It is never serving all patterns in the app.**

The real shape, confirmed from the local request logs during the 2026-09-15 rollout:

```
["dms","data","mitigat-ny-prod+<pattern>|component","byIndex",{from,to},["id","app","type","data"]]
```

`"data"` is the **whole jsonb blob** per row. Paged at 500 rows those responses are ~12 MB —
which is why thousands of them are fine. `createRequest`'s `LIST_CEILING = 500` caps the
standard loader (`api/index.js` always passes `length = null`), but `dataWrapper/getData.js`'s
`loadAllRows` branch sets `toIndex = length - 1` with no cap, and any caller may pass an
explicit range.

**One pattern is more than enough.** Reproduced read-only against `dms-mercury-3`:

```
dms.data['mitigat-ny-prod+mitigateny_sullivan|component'].byIndex[0..17263][id,app,type,data]
  query returned in 65.5s
  JSON.stringify THREW: RangeError: Invalid string length     ← the production crash
  streaming fallback OK: 1,085,714,495 chars in 6.6s          ← the fix, on the real payload
```

**1.09 GB for a single pattern** — more than double the 512 MiB limit.

### Why that one pattern is so heavy: abandoned sections

| | components | `data` size |
|---|---|---|
| `mitigateny_sullivan\|component` total | 17,264 | 817 MB |
| — referenced by some page's `sections`/`draft_sections` | 3,786 | 82 MB |
| — **unreferenced** | **13,478** | **735 MB (90%)** |

Editing a section leaves the superseded component row behind, so a heavily-edited pattern
accumulates them. App-wide: **145,323 of 505,055 components are unreferenced — 1,535 MB, 31%
of all component data**, rendered by nothing.

This is a *third* cleanup pool, largely disjoint from the orphaned-instance pool above (an
orphaned instance keeps its own pages, so its components still count as referenced). Reclaiming
it would take the heaviest pattern's full-range response from 817 MB to ~82 MB — under the
limit with room to spare. Same caveat: site data, confirm with MitigateNY, back up first.

### Which client action fired the unbounded one

Not determinable from the evidence that survives. The production entry for the fatal request was
**lost** — `RequestLogger` hit the same string limit and dropped it, which is exactly what the
logger fix in this task now prevents (`response: {_omitted:true}` keeps the path and timing).
After deploying, the next occurrence will name its own caller.

## Diagnosis notes

- Crash cadence and count: `docker logs dms-template-server | grep -c 'RangeError: Invalid
  string length'`; crash timestamps 15:35:25 through 15:44:22, ~50 s apart.
- The fatal request never reaches the `.jsonl` — the logger hits the same string limit — so
  attribute it from the container stdout log, not the request logs.
- Confirm the limit in-container: `node -e 'console.log(require("buffer").constants.MAX_STRING_LENGTH)'`.
- Size the app's types:
  ```sql
  SELECT type, count(*), pg_size_pretty(sum(pg_column_size(data))),
         pg_size_pretty((avg(pg_column_size(data)))::bigint)
  FROM dms_mitigat_ny_prod.data_items
  GROUP BY 1 ORDER BY sum(pg_column_size(data)) DESC LIMIT 12;
  ```
