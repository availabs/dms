# Falcor writes never reach the sync WebSocket (two controller instances)

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Release:** commit — `src/dms` submodule (uncommitted in the working tree) · **Created by:** amuro@albany.edu · **Edited by:** —

**Found:** 2026-09-25, while testing Bug 20 — see
[`concurrent-page-editing-data-loss.md`](./concurrent-page-editing-data-loss.md) §"Found while testing:
Falcor/CLI writes are never live-broadcast (FOUND, ROOT-CAUSED, NOT FIXED)". Independently
re-confirmed 2026-10-21 by the chat pattern's Phase 0 spike
([`planning/tessera/tasks/current/chat-pattern-implementation.md`](../../../../../planning/tessera/tasks/current/chat-pattern-implementation.md)),
which is what makes it blocking rather than cosmetic.

**This doc exists to carry the fix**, because the original record is a sub-finding inside a
2,500-line multi-bug doc and was never actioned. The diagnosis below is the 2026-09-25 one; the
evidence table and the chat implications are new.

## The bug

A write through the Falcor route (`dms.data.create` / `edit` / `delete`) appends its `change_log`
revision — `/sync/delta` returns it — but **no `change` message is broadcast to WebSocket
subscribers**. The same write through `POST /sync/push` broadcasts correctly.

Cause, read from the source and confirmed by running both paths against one subscriber:

- `packages/dms-server/src/routes/dms/dms.route.js:13` builds its **own** controller:
  `const controller = createController(process.env.DMS_DB_ENV || 'dms-sqlite')`.
- `packages/dms-server/src/index.js:407–415` then calls `setNotifyChange(notifyChange)` on the
  **module's default instance** — `require('./routes/dms/dms.controller')`, which is
  `createController(...)` run at import time. Its comment says *"The default controller is already
  instantiated by dms.route.js"*. It isn't: `dms.route.js` never touches the default export's
  instance, only `createController`.
- `_notifyChange` is a per-closure private in `createController`, so the instance that serves every
  Falcor write keeps `_notifyChange = null` and `appendChangeLog` silently skips the broadcast
  (`dms.controller.js:265`).

`createSyncRoutes._notifyChange` is set on the right object, which is why the push path works — and
why this has gone unnoticed: sync-enabled clients write through push for everything **except**
dataset rows, which are deliberately not intercepted (`sync/CLAUDE.md` → "Integration points ·
dmsDataEditor").

## Evidence

Against a local server on `dms-mercury-3`, one WebSocket subscribed to the app:

| Write path | `change_log` row | WS `change` message |
|---|---|---|
| `dms.data.create` (main-table type) | yes | **none** |
| `dms.data.create` (`:data` split type) | yes | **none** |
| `POST /sync/push` (main-table type) | yes | delivered |

Scripts: `scratchpad/chat-spike/wstest2.mjs`, `wspush.mjs` (throwaway).

## Why it matters

- **Live updates for dataset rows are dead.** A Card bound to a dataset never hears about a row
  someone else edited; the live refresh the sync module's own comment promises
  (`sync-manager.js:686–707`: "a dataset view still updates live") does not happen on the Falcor
  path, which is the only path dataset rows take.
- **It blocks the chat pattern's live tail.** Chat messages are `:data` rows, so they must be written
  through Falcor; `/sync/push` is not a workaround — it writes the app's main table and skips split
  routing (`sync-split-row-writes-misrouted.md`).
- Any other consumer of `notifyChange` that assumed Falcor writes broadcast is in the same position.

## Carried over from the 2026-09-25 finding

Three things that record already worked out, and that any fix has to handle:

- **Echo suppression.** Falcor writes get no `myRevisions` entry, so a sync-on client whose write
  falls back to Falcor will receive its own write back over the socket. Likely harmless —
  `applyRemote` no-ops on unchanged keys — but it should be confirmed rather than assumed.
- **Broadcast volume rises.** Bulk writes (CLI imports, the chat Slack import) start generating one
  broadcast per row. Split rows are already stripped of their payload by `stripSplitRowData`, which
  caps the size but not the count.
- **The route's instance predates sync** (`3e5debbd`, 2026-02-06); the wiring has been wrong since
  sync's first commit (`d62b4f36`, 2026-03-09). `dms.controller.js:45` already notes the two
  instances exist, which is why the page-delete hook is module-level.

A fourth caveat from that note — that `_notifyChange` fired *before* `commitTransaction`, so a
rolled-back write would broadcast — **no longer applies**: `appendChangeLog` now defers the
broadcast with `tx.afterCommit(...)` (`dms.controller.js:266`). Verified 2026-10-21.

## The fix

Make the route's controller and the notified controller the same object. Either:

1. have `dms.route.js` use the module default (`require('./dms.controller')`) instead of calling
   `createController` itself — smallest change, but check whether any caller passes a controller in
   (`createRoutes(controller = createController(...))` suggests tests do); or
2. keep the instance but wire it: have `createRoutes` expose the controller it built, and set the
   notify callback on that instance in `index.js`; or
3. hoist `_notifyChange` to module scope so every instance shares it — simplest, but it makes the
   callback global across instances, which is wrong if a process ever serves two DB envs.

Option 2 is the honest one. Whichever lands, the comment in `index.js` must be corrected: it
currently states the thing that isn't true.

## What was done (2026-10-21)

Option 2, the shape the 2026-09-25 note recommended:

- `routes/dms/dms.route.js` — exports the instance it serves routes from:
  `module.exports.controller = controller`, with a comment saying why it exists.
- `src/index.js` — `dmsRoutes.controller.setNotifyChange(notifyChange)` replaces the call on the
  module default, and the comment that asserted the two were the same instance is replaced with one
  that says they are not.

Nothing else changed: `createController` is untouched, the tests and `dama/upload` keep building
their own instances, and no state became global.

**Why the existing test didn't catch it, and what now does.** `tests/test-sync.js` has
`testWebSocketBroadcastFromFalcor`, and it passed throughout — because the suite builds its own
controller and wires it correctly (`graph.controller.setNotifyChange(notifyChange)` at
`tests/test-sync.js:74`). It proved the mechanism while the server's own wiring was wrong, which is
precisely how this survived from sync's first commit. Added
`testServerNotifyWiringReachesTheRouteController`, which asserts the invariant instead of the
mechanism: `dms.route.js` exports a controller, it is **not** `dms.controller.js`'s module default,
and `src/index.js` sets the callback on the exported one and not on the default.

## Testing Checklist

Verified against a local server on `dms-mercury-3` (app `chat_spike`), one subscribed WebSocket:

- [x] `dms.data.create` on a main-table type → `change` delivered, with full `data`
- [x] `dms.data.create` on a `:data` type → delivered, `dataOmitted: true` and no `data`
      (`stripSplitRowData` doing its job — correct, and it must stay)
- [x] `dms.data.edit` on a main-table row → `U` delivered
- [x] `dms.data.edit` on a split row (4-arg form with the row type) → `U` delivered
- [x] `/sync/push` still broadcasts exactly once — no double-broadcast
- [x] A client that never sent `subscribe` receives nothing
- [x] A pattern-filtered subscriber receives both rows (instance-prefix matching, as designed)
- [x] `tests/test-sync.js` — **95 passed, 0 failed**, including the new wiring test
- [x] `npm test` (the full chain, through test-change-history) — passes
- [ ] `dms.data.delete` — not verified: this server requires auth to delete and the spike runs
      unauthenticated. Same `appendChangeLog` path as create/edit, so it follows, but it is untested.
- [ ] **Echo**: a sync-on client whose write falls back to Falcor now receives its own write back
      (no `myRevisions` entry for that path). The 2026-09-25 note reasons it is harmless —
      `applyRemote` no-ops on unchanged keys — and nothing here contradicts that, but it has not
      been exercised in a browser. Worth one two-tab check before this is relied on.
- [ ] **Volume**: bulk writes now emit one broadcast per row. The chat Slack import (47,160 rows)
      is the first thing that will do this at scale.

## Still unwired (same cause, smaller blast radius)

`dama/upload/index.js:34` builds its own per-dbEnv controller for the file-upload publish handlers;
its writes still do not broadcast. Flagged in the comment in `index.js`. Not fixed here because it
needs the notify callback threaded through a different registration path, and nothing currently
depends on it being live.

## Log

- **2026-10-21** — **Fixed and tested** (see above). Status `built`: the change is in the `src/dms`
  submodule working tree, uncommitted.
- **2026-10-21** — Filed as its own task so the fix has somewhere to live. Re-confirmed by the chat
  Phase 0 spike (two-path test, local server on `dms-mercury-3`). Found that the pre-commit-broadcast
  caveat is already resolved by `tx.afterCommit`. **Not a new discovery:** the diagnosis is
  2026-09-25's, in `concurrent-page-editing-data-loss.md`; I missed it when filing and corrected the
  attribution the same day.
- **2026-09-25** — Found, root-caused and left unfixed while testing Bug 20 (owner observed an open
  `/edit/page_3` tab needing a refresh to show sections the CLI had just added).
