# Falcor Loader: Parallel Length + Data Requests

## Status: COMPLETE

### Results
- Eliminated 1 HTTP round-trip (4 → 3 for page view)
- First Falcor load: ~530ms → ~516ms (~50ms improvement on localhost)
- Length request no longer appears as separate server hit — batched with searchOne + byIndex

## Objective

Eliminate one HTTP round-trip from the first page load by fetching the `length` and data requests in a single `falcor.get()` call instead of sequentially.

## Current State

`dmsDataLoader` in `api/index.js` makes two sequential Falcor calls:

1. `await falcor.get(lengthReq)` — fetches `dms.data.{app}+{type}.length` (or `options.length`)
2. Uses the returned `length` to compute `toIndex` in `createRequest()`, then `await falcor.get(...newRequests)`

This creates a **mandatory sequential dependency**: the data request can't fire until the length response arrives, because `createRequest()` needs `length` to set `{from: 0, to: length-1}` on `byIndex` ranges.

Each HTTP round-trip to localhost adds ~30-50ms of overhead. On the production Falcor waterfall for a page view, there are 4 sequential round-trips:

```
Round-trip 1:  length (options/filter)         ~2ms server, ~50ms wall
Round-trip 2:  searchOne + byIndex             ~17ms server, ~50ms wall
Round-trip 3:  byId (page refs)                ~3ms server, ~50ms wall
Round-trip 4:  byId (section refs)             ~3ms server, ~50ms wall
```

Total server processing: ~35ms. Total wall clock: ~400-530ms. The gap is pure HTTP overhead from sequential round-trips.

## Proposed Change

Use a **ceiling value** for `toIndex` instead of the actual length, allowing the length and data requests to be combined into a single `falcor.get()` call.

### Why this works

The Falcor `byIndex` route handler in `dms.route.js` already handles indices beyond the actual count — it returns `null` for missing indices (line 126: `value: id ? $ref(...) : null`). So requesting `{from: 0, to: 499}` when only 160 items exist returns 160 refs + 340 nulls. The nulls are ignored by the client's data processing.

### Implementation

**`api/createRequest.js`** — Accept `null` length and use a configurable ceiling:

```js
// Line 19-20: when length is null, use ceiling instead of length-1
let toIndex = typeof wrapperConfig?.filter?.toIndex === "function" ?
    wrapperConfig?.filter?.toIndex(path) : (typeof wrapperConfig?.filter?.toIndex === 'undefined' || wrapperConfig?.filter?.toIndex === null ?
    Math.max(0, (length ?? LIST_CEILING) - 1) : +wrapperConfig?.filter?.toIndex)
```

Where `LIST_CEILING` is a reasonable upper bound (e.g., 500 for page patterns). This is only used when `length` is not yet known.

**`api/index.js`** — Combine length + data into one `falcor.get()`:

```js
// Before (sequential):
length = get(await falcor.get(lengthReq), ['json',...lengthReq], 0)
const newRequests = activeConfigs.map(config => createRequest(config, format, path, length))
await falcor.get(...newRequests)

// After (parallel):
const newRequests = activeConfigs.map(config => createRequest(config, format, path, null))
await falcor.get(lengthReq, ...newRequests)
length = get(falcor.getCache(), ['json',...lengthReq], 0)
```

### What this saves

- Eliminates round-trip 1 entirely (~50ms)
- The length, searchOne, and byIndex all go in one HTTP request
- Server still processes them the same way
- No behavior change for `view`/`edit` actions (they use `getIdPath` which doesn't depend on length at all)

### Considerations

- **Over-fetching**: Requesting `{from: 0, to: 499}` when there are 160 pages means 340 extra null refs in the Falcor response. These are tiny (`$ref` or `null`) so the payload overhead is negligible.
- **Ceiling value**: 500 covers virtually all page patterns. Dataset patterns with thousands of rows typically use pagination with explicit `fromIndex`/`toIndex` from URL params, so they don't use the length-derived default.
- **Length-only actions**: If the only active config is `action: 'length'` or `'filteredLength'`, skip data requests entirely (already handled at line 252).
- **UDA length actions**: `udaLength` configs call `falcor.invalidate()` before the length fetch — this must remain sequential. Gate the parallel optimization on non-UDA configs only.
- **Falcor batching**: Falcor already batches multiple paths in a single `get()` call into one HTTP request. This change leverages that existing behavior.

### Round-trips after the fix

```
Round-trip 1:  length + searchOne + byIndex    ~17ms server, ~50ms wall  (was 2 round-trips)
Round-trip 2:  byId (page refs)                ~3ms server, ~50ms wall
Round-trip 3:  byId (section refs)             ~3ms server, ~50ms wall
```

The byId round-trips (2 and 3) can't be eliminated because they depend on discovering `$ref` IDs from the byIndex response. This is inherent to Falcor's reference resolution model.

**Expected improvement: ~50-100ms off first page load** (one fewer HTTP round-trip).

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms/src/api/index.js` | Combine `lengthReq` into the same `falcor.get()` as `newRequests` |
| `packages/dms/src/api/createRequest.js` | Handle `length === null` by using ceiling value for `toIndex` |

## Testing Checklist

- [ ] First page load on page pattern (cold cache) — verify no extra round-trip for length
- [ ] Navigation to subsequent pages — verify data loads correctly
- [ ] Page pattern with >100 pages — verify all pages appear in list
- [ ] Dataset pattern with pagination — verify `fromIndex`/`toIndex` from URL params still works
- [ ] `udaLength` action — verify invalidation still works (sequential path preserved)
- [ ] Page with `options` filter — verify filtered length still correct
- [ ] Edit mode — verify page editing still works
- [ ] Compare first-load timing before/after (should see ~50ms improvement)
