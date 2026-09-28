# CLI falcor client — retry once on a dead pooled keep-alive socket

**Initiatives:** [dms_cli_agent_tooling](../../../../../planning/initiatives/dms_cli_agent_tooling.md) · **Status:** done (was: "SHIPPED (BC-additive) · Started: 2026-09-21") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** DMS library (CLI) · **Topic:** cli · **Status:** SHIPPED (BC-additive) · **Started:** 2026-09-21

## Objective

`createFalcorClient` (`packages/dms/cli/src/client.js`) failed with a bare
`Connection failed to http://localhost:3001: fetch failed` whenever more than about five
seconds passed between two requests on the same client. The server was healthy and serving
throughout. Retry the request once when the connection fails before a response is received.

## Root cause

Node's `fetch` (undici) pools connections and reuses keep-alive sockets. A server closes an
idle keep-alive socket on its own timeout — Node's default is 5 seconds. A client only
discovers this by writing to the socket and having the write fail, so the rejection arrives as
a `TypeError: fetch failed` with **no `cause`** — indistinguishable, from the message alone,
from the server being down.

Any CLI tool that interleaves falcor reads with slow blocking work hits it. The reproducing
case was `src/themes/transportny/qa_skills/tools/cr_sync.mjs` in dms-template: it reads the
tracked-patterns rows over falcor, then fans out to a batch of `execFileSync` CLI subprocesses
(`dms page list` per pattern, `dms raw get`, `dms dataset list`), then reads `sitemgmt_pages`.
`execFileSync` blocks the event loop for the whole fan-out, so the socket from the first read
is idle the entire time and is dead by the second.

Measured on 2026-09-21 with a minimal harness — two reads on one client separated by
`execFileSync("sleep", [n])`:

| gap | result |
|---|---|
| 2s | succeeds |
| 8s | **fails every time** |
| 20s | **fails every time** |

`cr_sync` failed reproducibly at the same line (its `sitemgmt_pages` read) on every run, while
the same two reads back-to-back on one client always succeeded — which is what pointed at
elapsed time rather than at the query, the payload or the auth token.

## What changed

`packages/dms/cli/src/client.js`, `request()` — one retry when `fetch` rejects:

- `ECONNREFUSED` is **not** retried. That is a genuinely-down server; retrying only doubles
  the wait before the same message. It keeps its existing "Is the DMS server running?" text.
- Any other connection-level rejection is retried once. On a second failure the error message
  gains `(retried once)` so a real outage still reads as an outage.

**Retrying is safe for every caller, including writes.** `fetch` rejects like this only when
no response was received, which means the request never reached the server — there is nothing
to duplicate. A request the server did process returns a response, and a non-2xx response is
handled on the separate `!response.ok` path, which is untouched. So this cannot double-apply a
`dms.data.create`/`edit`.

BC: no signature, option or return-shape change; the only observable difference is that a
previously-failing call now succeeds, plus the `(retried once)` suffix on a genuine outage.

## Verification

- Minimal harness at 8s and 20s gaps: both failed before, both pass after.
- `cr_sync.mjs` dry run now completes end to end (`UPDATE 18 | CREATE 0`, ticket hygiene
  `0 to patch`, page counters `0 to patch`) where it previously died mid-run.

## Follow-ups (not done)

- Other CLI entry points share this client and get the fix for free, but none were
  individually re-tested.
- A cleaner structural fix would be to stop blocking the event loop in `cr_sync` (async
  subprocess calls) or to disable keep-alive for the CLI agent. The retry is the smaller,
  BC-safe change and fixes the class of bug rather than one tool; the structural change is
  worth doing only if this recurs elsewhere.
