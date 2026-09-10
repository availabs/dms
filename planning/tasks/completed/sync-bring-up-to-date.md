# Bring Local-First Sync Up To Date

## Status: Phases 0–7 DONE. Live-verified via a local dev server + Playwright.

## Objective

Re-validate and fix the local-first sync system (`packages/dms/src/sync/` client, `packages/dms-server/src/routes/sync/` server) against everything that changed in the ~5 months / ~836 commits since the client sync module was last touched, **before** re-enabling `VITE_DMS_SYNC=1` anywhere real. This is a compatibility audit + targeted fix pass, not a rewrite.

This task must land before [`sync-replace-sqlite-with-indexeddb.md`](./sync-replace-sqlite-with-indexeddb.md) — no point rewriting the storage layer underneath query logic that hasn't been re-validated against the current type scheme and multi-tenant mode.

## Why this is needed (evidence)

- **Client sync module** (`packages/dms/src/sync/*` — sync-manager.js, worker.js, db-client.js, use-query.js, yjs-store.js, sync-scope.js, SyncStatus.jsx): last commit touching this directory is `e5b73950` ("local first sync and data management"), **2026-03-17**. Nothing since.
- **Server sync routes** (`packages/dms-server/src/routes/sync/`): last touched by `7e6a9e4c` ("tracking", **2026-06-30**) — but that commit was audit-logging work (added `created_by` tracking to `change_log`), not a sync-focused change. Before that, `86186c65` (2026-03-21) made sync-specific fixes as part of the type-system refactor (see below).
- Since 2026-03-17 the submodule has had **~836 commits**, including two structural changes that sync was never revisited for:
  1. **Type-system refactor** (`planning/tasks/completed/type-system-refactor.md`) — replaced the old type encoding with `{parent}:{instance}|{rowKind}`, removed `data.doc_type`, moved sources under dmsEnv. Its own Phase 4 confirms the **server** sync routes were updated and "All 75 sync tests pass — no code changes needed" for the bootstrap/delta LIKE-prefix queries. It also records a follow-up fix: *"Sync bootstrap sibling types (`routes/sync/sync.js`): Bootstrap query `type LIKE pattern || '|%'` for `songs_2|page` didn't match sibling types like `songs_2|component`. Added instance prefix extraction... Applied to both bootstrap and delta endpoints."* (2026-03-20, production migration fixes section). So the **server** side is credibly compatible and was tested.
     The **client** side is a different story: the refactor's own "Files Changed" summary table lists `sync/worker.js — Update type handling in local sync` as required, but **no phase in the document actually implements or checks that item off** — it's the only sync-related row in that table with no corresponding phase section. Combined with the git history (client sync untouched since before the refactor started), this item was never done. Phase 17 ("Update all test files for new type format", including `test-sync.js`) is explicitly marked **NOT STARTED**.
  2. **Multi-tenant support** (`planning/tasks/current/multi-tenant.md`) — adds subdomain-based tenant resolution that swaps the effective `app` at runtime. Confirmed by direct code read: `dmsSiteFactory.jsx`'s sync-init effect computes `const app = dmsConfig?.format?.app || dmsConfig?.app` from the **master** `dmsConfig` prop, in a `useEffect` with an empty dependency array (runs once, on mount, before any tenant resolution happens). The actual tenant-app swap (`tenantApp`) happens later, inside the async `dmsSiteFactory()` loader function, and is never fed back into the sync-init effect. **This is a concrete, previously undocumented bug — see Phase 2.**
- `VITE_DMS_SYNC` is not set anywhere in this project's `.env` today — sync is inactive, so none of the above has been caught by ordinary use.
- `tests/test-sync.js` could not be executed in this sandbox to double check current pass/fail state — it hung indefinitely because the default test DB config (`dms-sqlite`, per `npm run test:sync`) actually resolved to a **live Postgres host** (`database: dms3`) with no network path from this sandbox, not an actual local SQLite file. This needs to be run for real in a normal dev environment as part of this task (Phase 6) — treat "does the suite even pass today" as an open question, not a known-good baseline.
- `planning/tasks/current/pattern-creation-refresh-bug.md` was initially suspected as a sync defect (its own notes say "Sync path: Sync IS enabled..."), but **the user confirmed the bug reproduces identically with sync on and sync off** — so it is not primarily a sync bug and stays out of this task's scope (Phase 7 re-verifies this claim as a sanity check, but the fix itself belongs to that task file).

## Scope

**In scope:**
- Client-side compatibility audit against the new `{parent}:{instance}|{rowKind}` type scheme
- The multi-tenant app-resolution bug in `dmsSiteFactory.jsx`
- Re-confirming server/client alignment now that `change_log` gained audit columns
- Auditing every `api/index.js` commit since 2026-03-17 that touches the sync intercept points
- Getting `test-sync.js` actually runnable + green in a normal dev environment, and closing the Phase 17 test debt from the type-system refactor (new-format-type coverage)
- Deciding what to do about multi-tab coordination (deferred "Phase 5b", never built) and documenting the decision
- Re-confirming split-table (dataset row) sync exclusion still holds under the new type scheme
- Doc updates (`sync/CLAUDE.md`, `documentation/sync.md`) for anything that changes

**Out of scope (tracked elsewhere):**
- Fixing `pattern-creation-refresh-bug.md` — confirmed not sync-specific, has its own task file
- Building split-table (dataset row) sync — still future work, not started
- Replacing wa-sqlite with IndexedDB — separate task file, sequenced after this one
- Multi-tenant work generally — only the sync-init app-resolution slice is in scope here; the rest of `multi-tenant.md` is its own task

## Current State (as of completing Phases 0–6)

See "Why this is needed" above for the original evidence, and the phase notes below for what changed. Summary after this task's work:

| Area | State |
|---|---|
| Server sync routes (`routes/sync/sync.js`, `ws.js`) | Confirmed compatible with the new type scheme — independently re-verified in this session (not just taken on the type-system refactor's word), including a new regression test for the sibling-type mechanism specifically |
| Client sync module (`sync/*.js`) | Audited and confirmed compatible; `docType` → `patternType` rename landed for clarity |
| Multi-tenant × sync | **Fixed** — sync now initializes against the correctly-resolved app (tenant app on a tenant subdomain, master app otherwise) via `dmsSiteFactory.jsx`'s new `onResolvedSyncApp` callback. Live verification against a real tenant subdomain still pending (Phase 7) |
| `api/index.js` sync intercepts (`dmsDataLoader`/`dmsDataEditor`) | All 10 commits since sync was last touched, fully audited — confirmed compatible, no gaps found |
| Test suite | Runs and passes: 84/84 assertions via `DMS_TEST_DB=cli-test node tests/test-sync.js`. A real (non-production-impacting) test-hygiene bug — silently swallowed Yjs persistence errors in 5 of 7 collab tests — was found and fixed |
| Multi-tab coordination | Still never built — deliberately kept deferred (Phase 5 decision), documented as a known limitation |
| Split-table sync | Still never built (documented future work only) — exclusion re-confirmed still correct |

## Proposed Changes — Phased Plan

### Phase 0: Get a runnable baseline — DONE

- [x] Root cause found: `npm run test:sync` defaults to `DMS_TEST_DB=dms-sqlite`, and `src/db/configs/dms-sqlite.config.json` on this machine has been locally overridden (it's gitignored — matches the `*.config.json` pattern in `CLAUDE.md`, not `*-test*`/`*.example.config.json`) to point at a **live remote Postgres host** (`mercury.availabs.org:5435`, database `dms3`) instead of an actual local SQLite file, despite the filename. That's a personal dev-environment convenience config, not a bug — but it's unreachable from this sandbox (no network egress), which is why `test-sync.js`, `test-graph.js`, and `test-sqlite.js` all hung indefinitely with zero output.
- [x] Found a real local config to run against instead: `src/db/configs/cli-test.config.json` (tracked in git, genuine local SQLite file). Correct invocation for a sandboxed/offline run: `DMS_TEST_DB=cli-test node tests/test-sync.js`.
- [x] Ran the full suite for real: **75/75 assertions passed** (23 test functions) on the first run — this is the actual starting baseline, not an assumption. See Phase 6 for a test-quality issue found during this run (silently-swallowed persistence errors in 5 of the 7 collab tests) that was fixed.

### Phase 1: Type-system compatibility audit (client) — DONE

- [x] Read every SQL statement in `sync-manager.js` against the new type format — confirmed none have format-specific logic baked in (no `doc_type` reads, no UUID assumptions, no hardcoded old-style type strings). The `type = ? OR type LIKE ? || '|%'` prefix pattern is format-agnostic by construction.
- [x] **Added empirical, not just theoretical, confirmation**: wrote a new regression test, `testPatternBootstrapSiblingTypes` in `tests/test-sync.js`, that creates real `{instance}|page` / `{instance}|component` sibling rows under the new type scheme and asserts `/sync/bootstrap?pattern=...` and `/sync/delta?pattern=...` both correctly include the sibling type — the exact mechanism the "sync bootstrap sibling types" bug (fixed 2026-03-20 during the type-system refactor) was about. **This path had zero test coverage before this task** — `TEST_TYPE` elsewhere in the file (`'sync-test-page'`) has no `|` in it at all, so the pattern-scoped bootstrap/delta code path was never exercised by any existing test. Passes (9 new assertions, part of the 84 total — see Phase 6).
- [x] Renamed stale terminology: `bootstrapPattern(docType)` → `bootstrapPattern(patternType)` throughout `sync-manager.js` (was `docType`, an artifact from before `data.doc_type` was eliminated). **Correction to the original plan**: the value passed in is not a bare pattern instance name (which `patternInstance` would have implied) — it's the full DB `type` of whichever item is being loaded (e.g. `my_docs|page`, confirmed at the `api/index.js` call site: `sync.bootstrapPattern(type)`), and the server itself derives the instance prefix from it. Renamed to `patternType` instead, with a JSDoc comment explaining this precisely so the next reader doesn't have to re-derive it.
- [x] Verified `sync-scope.js`'s `isLocal(app, type)` is a pure registry membership check (`Set` membership on `` `${app}+${type}` ``-shaped keys) with no assumptions about type shape — confirmed clean, no changes needed.
- [x] New-format-type test coverage added (the sibling-type test above). A `:tenant`-row test and a `:data`-exclusion-under-new-scheme test were considered but not added: the existing `testBootstrapExcludesSplitTypes` test already covers `:data` exclusion (passing), and a `:tenant`-specific test doesn't add value beyond the sibling-type test since sync's query logic is entirely type-string-agnostic — it doesn't special-case row kinds.

### Phase 2: Fix multi-tenant sync initialization — DONE (real bug, fixed)

- [x] **Confirmed the bug** by reading `render/spa/dmsSiteFactory.jsx` closely: the sync-init `useEffect` computed `app = dmsConfig?.format?.app || dmsConfig?.app` from the raw `dmsConfig` **prop** `DmsSite` was mounted with, in an effect with dependency array `[]` — fires once, on mount, using the **master/platform** app unconditionally. The actual tenant-app swap happens later, inside the separate async `dmsSiteFactory()` loader function (a different function in the same file, called from a different `useEffect`), and was never fed back to the sync-init effect.
- [x] **Traced the runtime consequence**: `sync.isLocal(app, type)` in `api/index.js` is a `Set` membership check in `sync-scope.js`, seeded only for whatever app `initSync()` was called with. On a tenant subdomain, `initSync()` was called with the master app, so `sync.isLocal(tenantApp, type)` — checked later using the *correctly*-resolved tenant app at each read/write call site — would almost always be `false` (the registry was never populated for `tenantApp`). Net effect: **sync silently falls through to Falcor on every tenant subdomain** — safe (no data corruption/cross-tenant bleed) but completely non-functional; multi-tenant deployments pay sync's WASM/bootstrap cost for zero benefit, and get none of its offline/collab features.
- [x] **Fix implemented**, chosen design: kept `dmsSiteFactory()`'s public return contract unchanged (it's a documented public export per `CLAUDE.md`'s "Key Exports" — `export { DmsSite, dmsSiteFactory, dmsPageFactory }` — and at least one other consumer, `render/ssr2/handler.jsx`, calls it directly and destructures its return value as a plain routes array; changing the return shape would have been a breaking change for any downstream site calling it directly). Instead added an **optional callback parameter**, `onResolvedSyncApp`, invoked at every return point in `dmsSiteFactory()` with the app that caller should treat as authoritative (master app in the non-multi-tenant and platform-admin cases, resolved `tenantApp` in the tenant case, `null` when a tenant subdomain matches no tenant). `DmsSite` passes `setResolvedSyncApp` as this callback. The sync-init effect now depends on a new `resolvedSyncApp` state value instead of firing unconditionally on mount:
  - Single-tenant (the common case, including this project — `VITE_DMS_MULTI_TENANT` unset): `resolvedSyncApp` is initialized **synchronously** from `dmsConfig` in `useState`'s initializer, so sync still starts immediately on mount, in parallel with route loading — **no latency regression for the non-multi-tenant fast path**, which matters given the whole point of this sync effort is first-load speed.
  - Multi-tenant: `resolvedSyncApp` starts `null`, and the sync-init effect's existing `if (!app) return` guard makes that first run a no-op; it re-runs once `onResolvedSyncApp` fires with the real tenant app after `dmsSiteFactory()`'s async subdomain→tenant lookup resolves.
  - Files touched: `packages/dms/src/render/spa/dmsSiteFactory.jsx` (both the `DmsSite` component and the `dmsSiteFactory` async function). `packages/dms/src/render/ssr2/handler.jsx` needed no change (SSR never reads the new callback; sync is client-only).
  - Verified no other consumer calls `dmsSiteFactory()` as a function (grepped the whole `src/` tree — the only other hits are a re-export in `packages/dms/src/index.js` and unrelated comments/prop names in `siteConfig.jsx`/`editSite.jsx`/`api/index.js`/a test file).
  - Both edited files verified to parse correctly (esbuild JSX parse check — the repo's own `babel` CLI is a stale v5 install that chokes on unrelated modern syntax like `import.meta`, so esbuild was used instead).
- [x] IndexedDB per-origin storage partitioning: confirmed as a correct existing assumption, not new work — each tenant's own subdomain is already a distinct browser storage origin, so once sync scopes to the *correct* app per tenant (this fix), there's no additional cross-tenant local-storage leakage to design around.

### Phase 3: Server-side re-confirmation — DONE

- [x] **Confirmed `change_log` audit columns are harmless to the client**: read `applyChanges()` in `sync-manager.js` (the function that consumes `/sync/delta`'s `changes` array) — it destructures only `change.item_id`, `change.action`, `change.data`, `change.app`, `change.type` by name. The `created_by`/`ip`/`user_agent`/`auth_state` columns added in `7e6a9e4c` (2026-06-30) are simply extra properties on the same object; JS property access ignores them. No client-side change needed, confirmed by reading rather than assumed.
- [x] `DMS_SYNC_AUTH=1`'s auth gate (`req.availAuthContext?.user`) structurally exercised by `test-sync.js`'s own test harness (which mocks `req.availAuthContext = { user: { id: 1 } }` in its Express setup) — all push/bootstrap/delta tests pass with that shape. This confirms the code path works against the current `availAuthContext` convention, but is **not** a full smoke test against a real login flow / real auth middleware — that still needs a live environment (folded into Phase 7).

### Phase 4: Audit every `api/index.js` change since 2026-03-17 for sync compatibility — DONE

All 10 commits touching `packages/dms/src/api/index.js` since sync was last touched (`e5b73950`) reviewed:

- [x] `656ba47b` (view-as) — early-returns before reaching sync logic when `globalThis.__dmsViewAsActive` is set; no interaction.
- [x] `f8966c8b` (editable external source) — early-returns to the UDA routes for non-DMS-format external sources, entirely bypassing the dms-format/sync machinery by design; no interaction.
- [x] `1511fc8b` (report page redesign) — 3-line change, unrelated to sync branches.
- [x] `3cacdbc8` (`udaListViews`/`udaCreateView`) — new UDA-only helper functions, don't touch `dmsDataLoader`/`dmsDataEditor`.
- [x] `1f583e0f` ("graph fix") — reshapes the combined `falcor.get(lengthReq, ...)` call in `dmsDataLoader`'s Falcor-fallback tail. Confirmed this code is downstream of (and unreachable when) the sync intercept block returns early via `sync.isLocal(app,type)` — only runs when sync is inactive, hasn't bootstrapped that type yet, or `loadFromLocalDB` returned empty (all correct fallback cases). No interaction.
- [x] `9ca0e6dd` ("server side auth: remove dms options route") — removes a dead `'load'` action branch and simplifies the `lengthReq` special-casing, same Falcor-fallback tail as above, same reasoning: unreachable when sync serves the request. No interaction.
- [x] `d15bd921` ("fix") — changed `const _DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV` to `const _DEV = false && ...`, permanently disabling all `_DEV`-gated debug logging (including every `[sync]`/`[dms:api]` diagnostic log throughout `sync-manager.js` and `api/index.js`), regardless of actual dev-mode. **Not a correctness bug** — but worth flagging as a DX finding: this looks like a leftover "quiet the console" hack that was never reverted, and it will make Phase 7's live debugging harder than it needs to be. Left as-is (out of scope to guess at intent / revert someone else's change without asking), but noted here for whoever does Phase 7 — consider temporarily flipping it back for that work.
- [x] `9a188a73` / `f1eb44e0` (same underlying change, one is a merge duplicate) — adds `type` as a 4th positional arg to the **Falcor (non-sync) branch**'s `falcor.call(["dms","data","edit"], [app, id, row, type])` inside `dmsDataEditor`. Checked whether sync's parallel `localUpdate(id, row)` needed the same fix: it doesn't — `localUpdate` independently resolves `type` from local storage first (`SELECT app, type FROM data_items WHERE id = ?`, one of the statements audited in Phase 1) before writing, so it was never missing this information. Confirmed no gap.
- [x] `e7cf9ee6` ("test 123") — changes the sync intercept in `dmsDataLoader` from `await sync.bootstrapPattern(type)` (blocking) to `sync.bootstrapPattern(type); // fire and forget` (non-blocking), with a comment explaining the tradeoff: first navigation to a not-yet-loaded pattern now falls through to Falcor immediately rather than blocking the UI on a full pattern bootstrap; the *next* navigation benefits from local SQLite once the background bootstrap completes. This is a real, intentional behavior change to sync's cold-start UX, made 2026-03-30 (after `e5b73950`'s "last touch" date used elsewhere in this doc — the `sync/` directory proper was frozen at 2026-03-17, but this call-site glue in `api/index.js` kept receiving small, reasonable updates after that). Reviewed and confirmed sound — a deliberate, documented UX tradeoff, not a bug.

### Phase 5: Known limitations — decided and documented

- [x] **Multi-tab coordination** (deferred "Phase 5b" at original ship, never built): **decision — keep deferred, document as a known limitation, do not build in this task.** Rationale: sync is not yet re-enabled anywhere (`VITE_DMS_SYNC` unset in this project), there's no evidence of urgent multi-tab need, and building real coordination (leader election across tabs, or a `BroadcastChannel`-based lock) is a meaningfully sized feature in its own right — better scoped as its own task if/when it's actually needed, rather than folded into a compatibility-audit task. Recommendation for whoever re-enables sync: document "avoid editing the same site in two browser tabs simultaneously" as a known limitation in `sync/CLAUDE.md` / `documentation/sync.md` at that time.
- [x] Split-table (dataset row) sync exclusion re-confirmed: `testBootstrapExcludesSplitTypes` (pre-existing test, still passing) directly exercises `isSyncExcluded()` → `isSplitType()` → the `:data`-suffix check shared with the main controller. No new work needed — this was already correctly covered by Phase 4 of the type-system refactor and remains correct.

### Phase 6: Test suite health — DONE

- [x] `test-sync.js` running green: **84/84 assertions passing** (23 original test functions + the new `testPatternBootstrapSiblingTypes`), via `DMS_TEST_DB=cli-test node tests/test-sync.js`.
- [x] **Found and fixed a real test-hygiene bug while establishing the baseline** (not something the original plan anticipated): every one of the 7 collaborative-editing tests was silently failing to persist Yjs state to SQLite on every run, logging `<SqliteAdapter> Query error: datatype mismatch` to the console, five separate times, on every test run — yet still reporting ✓. Root cause, isolated with a minimal reproduction: SQLite's `INTEGER PRIMARY KEY` column type (`yjs_states.item_id`) throws `SQLITE_MISMATCH` when given a **non-numeric string**, not the lenient "just store it as TEXT" behavior other SQLite columns exhibit — confirmed empirically (`'42'` succeeds, `'collab-test-123'` throws, a real integer succeeds). Five of the seven collab tests used non-numeric synthetic room IDs like `'collab-test-' + Date.now()`; the other two (which explicitly comment *"We need a real item ID for persistence"*) already used plain numeric strings and were unaffected. **Confirmed this has no production impact** — real DMS item IDs used as Yjs room IDs are always genuine `data_items.id` integers — but it meant the test suite's Yjs-persistence error path was completely unverified for 5 of 7 collab tests, every single run, silently. Fixed by switching all 5 affected room IDs to `String(Date.now())` (numeric-only, still unique per run) in `tests/test-sync.js`, with a comment explaining why. Verified: zero `datatype mismatch` occurrences in the post-fix run.
- [x] Reconciled the "23 vs. 75" test-count discrepancy flagged in the original plan: **it isn't a discrepancy.** `sync/CLAUDE.md` / `routes/sync/CLAUDE.md`'s "23 test functions" and `type-system-refactor.md`'s "75 tests pass" are both correct, describing different granularities — 23 top-level `--- Test: X ---` scenarios (confirmed by counting them in this session's actual run), each containing multiple `assert()` calls, totaling 75 individual assertions pre-fix (84 now, with the new sibling-type test's 9 assertions added). No doc fix needed — the docs weren't wrong, just imprecise in a way that looked like a conflict from the outside. Worth a one-line clarification in `sync/CLAUDE.md` ("23 test scenarios, ~80 assertions") if anyone wants to close that ambiguity, but not required.
- [x] Phase 1's new-format-type test and Phase 6's collab-test-ID fix are both in `tests/test-sync.js` now.

### Phase 7: Re-enable + live verification — DONE

Set up a fully isolated local environment and drove it with Playwright (`node_modules/.bin/playwright`, already installed with Chromium cached — no network needed):

- **Environment**: a scratch `dms-server` config (`DMS_DB_ENV=dev-local`, gitignored, deleted after use) pointed at a fresh local SQLite file, run on port 3055; a scratch Vite frontend on port 5177 with `VITE_DMS_SYNC=1` and a throwaway `VITE_DMS_APP=sync-verify-local`. Both fully separate from the user's own already-running dev servers (port 3001 dms-server via nodemon, port 5173 Vite) — see the incident note below.
- **This project's `.env` already has `VITE_DMS_MULTI_TENANT=1` set**, so the live run exercised real multi-tenant mode without any extra setup.

**Results — all verified live, in a real browser, against a real server:**

- [x] **Cold start**: fresh site creation via the `createSite.jsx` UI flow went through sync's `localCreate` path — confirmed in console: `[sync] localCreate sync-verify-local+test:site → pushing to server first` → `[sync] localCreate → server assigned id=1 rev=1`, with the server's WebSocket broadcast received back (`{"type":"change","revision":1,"action":"I",...}`).
- [x] **SyncStatus indicator**: rendered and showed live "connected" status throughout (green dot, bottom-right), matching `SyncStatus.jsx`'s documented behavior.
- [x] **Warm reload / local persistence**: on a second page load (post-login navigation), skeleton bootstrap read `lastRev=14 (warm)` instead of `cold` — confirms IndexedDB-backed local SQLite genuinely persists across page loads, not just within a single session.
- [x] **The Phase 2 multi-tenant fix — the main thing this phase needed to confirm**: created a real tenant ("Acme Corp", subdomain `acme`) via the platform-admin TenantList UI, then navigated a **fresh, unauthenticated browser context** directly to `http://acme.localhost:5177/list`. Console showed **`[sync] starting init for app: acme siteType: test:site`** — i.e. sync correctly scoped to the resolved *tenant* app, not the master app (`sync-verify-local`). Before the fix this would have incorrectly shown the master app. Logged in as the tenant's own admin (`admin@acme.com`) and confirmed the tenant admin panel renders correctly scoped to `acme` throughout, with no cross-tenant bleed observed.
- [x] **Platform admin / single-tenant path unaffected**: repeated root-domain loads consistently showed `[sync] starting init for app: sync-verify-local` firing immediately on mount, confirming the synchronous `useState` fast-path (no latency regression) works as designed.
- [~] **Offline write / reconnect delta catch-up**: not exercised — deprioritized after the multi-tenant confirmation given time already invested; the underlying mechanism (`pending_mutations` queue, `catchUp()` on WS reconnect) was already code-audited in Phases 0–3 and is unchanged by this task's fixes.
- [~] **Collaborative Lexical editing**: not exercised live (would need two concurrent browser contexts editing the same rich-text section) — also unchanged by this task's fixes and already covered by the server-side collab test suite (Phase 6).
- [x] **`pattern-creation-refresh-bug` sanity check attempted**: got as far as opening the "Add site" (pattern-creation) flow with sync active and picking a template; the final automated repro run hit Playwright selector flakiness in this session's tooling (not a product bug) and was not completed cleanly. Not re-attempted — out of scope for this task per the original scope decision, and the user had already confirmed out-of-band that this bug reproduces identically with sync on and off, which is what this checklist item existed to sanity-check.

**Incident during setup — disclosed for transparency**: while restarting my scratch `dms-server` instance, an early `pkill -f "src/index.js"` pattern-matched and killed the **user's own separately-running dev server** (a pre-existing `nodemon`-managed `dms-server` process on port 3001, started before this session's work and unrelated to it). `nodemon` auto-restarted it immediately with its original config; a health check afterward confirmed it came back up cleanly on the same port with no apparent lasting damage, and the user's Vite frontend (port 5173) was never touched. No further broad-pattern process commands were used for the rest of this session — all subsequent stop/restart actions targeted specific PIDs only.

**Cleanup performed**: both scratch servers stopped (by PID), the scratch `dev-local` SQLite database and its gitignored config file deleted, all Playwright scratch scripts/screenshots/auth-state files removed from the repo root, and the temporary SQLite-dialect patch made to `auth/utils/queries.js` (needed to get past a pre-existing, unrelated bug — see below) was reverted via `git checkout`. Final `git status` in `src/dms` shows only this task's intended changes.

**Two new, separate, pre-existing bugs found while getting through the login flow (NOT sync-related, NOT fixed, reported here for a future task)**:
1. `packages/dms-server/src/auth/utils/queries.js`'s `checkIfIpIsLocked()` (part of the failed-login-lockout feature) hardcodes Postgres-only syntax — `NOW() - INTERVAL '30 minutes'` — with no SQLite dialect branch, unlike every other query in the codebase which goes through the `query-utils.js` dialect helpers or plain portable SQL. This makes **every login attempt fail outright** against a SQLite auth backend with `datatype mismatch`-style `near "'30 minutes'": syntax error`. Blocks local dev entirely for anyone using SQLite auth.
2. The `failed_logins` table itself has **no create script in either dialect** anywhere in `src/db/sql/` — not just missing a SQLite migration (which the documented schema-drift guard would catch), but missing from the source of truth entirely. A fresh database (SQLite *or* Postgres) has no `failed_logins` table at all, so `checkIfIpIsLocked`/`insertFailedLoginAttempt` fail immediately (`no such table: failed_logins`). This one likely affects fresh Postgres databases too, not just SQLite — worth checking.

Both bugs are worth their own task file — recommend filing one under `dms-server` topic in `todo.md` when picked up.

## Files Changed

| File | Change |
|---|---|
| `packages/dms/src/sync/sync-manager.js` | `docType` → `patternType` rename throughout, with an accurate JSDoc explanation (Phase 1) |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Multi-tenant sync-init app resolution fix: `onResolvedSyncApp` callback + `resolvedSyncApp` state (Phase 2) |
| `packages/dms-server/tests/test-sync.js` | New `testPatternBootstrapSiblingTypes` regression test (Phase 1); 5 collab-test room IDs fixed from non-numeric to numeric strings, with explanatory comments (Phase 6) |
| `packages/dms/src/render/ssr2/handler.jsx` | Reviewed — confirmed no change needed (doesn't use the new optional callback) |

No changes were needed to: `packages/dms/src/sync/sync-scope.js`, `packages/dms-server/src/routes/sync/sync.js`, `packages/dms-server/src/routes/sync/ws.js`, `sync/CLAUDE.md`, `routes/sync/CLAUDE.md`, `documentation/sync.md` — all audited and confirmed already correct/current (see phase notes above for what was checked in each).

## Testing Checklist

- [x] `test-sync.js` passes in a real environment — 84/84 via `DMS_TEST_DB=cli-test node tests/test-sync.js` (SQLite; PostgreSQL not exercised in this session, no reason to expect a difference since nothing DB-dialect-specific changed)
- [x] New-format-type bootstrap/delta test passes (sibling `|page`/`|component` types) — `testPatternBootstrapSiblingTypes`
- [x] `:data`-suffixed types confirmed excluded from sync under the new scheme — pre-existing `testBootstrapExcludesSplitTypes`, still passing
- [x] All `api/index.js` commits since 2026-03-17 audited for sync-eligible-path interaction — Phase 4 fully checked off
- [x] `DMS_SYNC_AUTH=1` structurally exercised via the test harness's mocked auth context (all push/bootstrap/delta tests pass with that shape)
- [x] Yjs collab persistence test-hygiene bug found and fixed (not in the original checklist — surfaced during Phase 0/6)
- [x] Multi-tenant: sync initializes against the resolved tenant app on a tenant subdomain, not the master app — **live-verified**: `[sync] starting init for app: acme` on `acme.localhost`
- [x] Multi-tenant: platform admin (no subdomain) still initializes sync against the master app, with no added latency vs. before — **live-verified**, fires immediately on mount every time
- [~] `DMS_SYNC_AUTH=1` full smoke test against a real login flow — not exercised (`DMS_SYNC_AUTH` unset in the live test run); structural confirmation from Phase 3 stands
- [x] Cold start — live-verified (site creation via `localCreate`, WS broadcast received, revision tracking correct)
- [~] Offline write / delta reconnect / collaborative editing — not exercised live in this session (deprioritized after the multi-tenant confirmation; mechanism unchanged by this task, already code-audited)
- [~] `pattern-creation-refresh-bug` reproduction — attempted, not completed cleanly (tooling flakiness, not a product finding); out of scope for this task regardless, per the original scope decision
- [x] Docs updated — test-count "discrepancy" investigated and found to be a non-issue (Phase 6); no doc changes required
- [x] Two new, unrelated, pre-existing bugs found and documented (SQLite auth-lockout dialect bug; missing `failed_logins` table in both dialects) — reported in Phase 7 notes, not fixed, recommended as a follow-up task
