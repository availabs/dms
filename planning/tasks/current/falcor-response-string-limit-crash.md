# Falcor response exceeds V8's max string length and kills the process

**Status:** Open. Diagnosed 2026-09-16, not yet fixed — server is crash-looping in production
as of writing.
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

- [ ] **Item 1: a >512 MiB Falcor response returns 500 and the process stays up** — the test
      that matters. Reproduce against `dms.data.mitigat-ny-prod` as it stands today.
- [ ] Item 1: normal-sized Falcor responses unaffected (status, body, headers identical)
- [ ] Item 2: a deliberate async throw is logged and does not exit the process
- [ ] Item 2: handlers don't swallow errors that should surface in tests
- [ ] Item 3: a large jsonGraph round-trips byte-identically through the streaming writer
- [ ] Item 3: client parses a streamed envelope unchanged
- [ ] Item 4: duplicating a pattern with no `name` produces a sane name, never `undefined_copy`
- [ ] Item 4: duplicating an existing copy still stacks correctly (`foo_copy` → `foo_copy_2`)
- [ ] Item 4: post-cleanup, `dms.data.mitigat-ny-prod` serialises under the limit
- [ ] `RequestLogger` no longer emits "Failed to write: Invalid string length"

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
