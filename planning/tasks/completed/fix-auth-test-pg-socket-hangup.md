# Fix Auth Test PG Socket Hang Up

## Status: DONE

## Objective

Fix `test-auth.js` test #14 (Falcor created_by/updated_by) which fails on PostgreSQL with `ECONNRESET` — the client disconnects before the Falcor route response arrives.

## Root Cause

In Node.js v15+, `IncomingMessage` (req) emits the `close` event after the request body has been fully consumed, not only on premature client disconnection. Since Express body parsers read the full body before routing, `req.on('close')` fires almost immediately inside the route handler.

The Falcor Express middleware (`src/utils/falcor-express/src/index.js`) used `req.on('close')` to detect client disconnects and dispose the Observable subscription. This created a race condition:

- **SQLite (synchronous):** better-sqlite3 queries complete synchronously, so the Observable emits and `res.json()` is called before the event loop processes the `close` event. Response succeeds.
- **PostgreSQL (async):** pg queries take ~10ms, so the `close` event fires first (at ~1ms), the subscription is disposed, and when the DB returns, the response callback never fires. The client gets `ECONNRESET`.

Server logs showed the timing clearly:
```
[dms.data.create] START ... t=1773762846804
[falcor-express] Client disconnected, disposing subscription t=1773762846804  ← 0ms later!
[dms.data.create] OK rows=1 id=1 elapsed=11ms  ← too late, subscription disposed
```

## Fix — DONE (2026-03-17)

Changed `falcor-express/src/index.js` to use `res.on('close')` instead of `req.on('close')`, with a `!res.writableFinished` guard:

```javascript
// Before (broken on Node.js v15+ with async routes)
req.on('close', function() {
    if (subscription && !subscription.isDisposed) {
        subscription.dispose();
    }
});

// After (correct — only disposes on actual client disconnect)
res.on('close', function() {
    if (subscription && !subscription.isDisposed && !res.writableFinished) {
        subscription.dispose();
    }
});
```

- `res.on('close')` fires when the TCP connection actually closes (not when the request body is consumed)
- `!res.writableFinished` ensures we only dispose if the response wasn't successfully sent

## Files Changed

- `src/utils/falcor-express/src/index.js` — Changed `req.on('close')` to `res.on('close')` with `!res.writableFinished` guard

## Testing Checklist

- [x] Auth tests pass on SQLite (104/104)
- [x] Auth tests pass on PostgreSQL (104/104)
- [x] Test #14 specifically passes on PostgreSQL (no ECONNRESET)
- [x] `npm run test:all` passes (SQLite + PostgreSQL)
- [x] Core tests unaffected (test-sqlite, test-controller, test-graph, test-workflow)
