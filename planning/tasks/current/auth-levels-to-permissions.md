# Auth and datasets: replace auth levels with named permissions (hub)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** doing · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

**Project:** DMS library (`src/dms` submodule), plus one shared task in `dms-template/planning/shared/` for
`data-types/` · **Topics:** patterns/auth, patterns/datasets, dms-server (auth, dama, uda)

## ▶ Resume here (updated 2026-10-25, task 14 built)

**Where it stands.** Stage 1 of the e2e plan ran 2026-10-21: rows A–L under enforce, log and legacy, plus the
Postgres pass (results: the **Results** table at the end of the test plan). Every server permission decision matched
the plan, anon was refused everywhere, every would-deny line was explained. The client fixes it needed are in the
library, **uncommitted** (`npm run build` ✓; ask the owner before committing):
`SourceAccessEditor.jsx` (source vocabulary + array default), `version.jsx` (rename + Clear Data gated),
`DeleteSource.jsx` / `default/admin.jsx` (Delete Source gated), `SettingsPage.jsx` (gated on `edit-pattern`, a refused
save reverts), `upload.jsx` (new columns written only after a successful publish).

**Progress 2026-10-22 (session 3d06f4d0; committed: lib 6ec2837f token cache, a943738b guards, root 6b7176e8; not pushed):**
- Stage-1 client fixes committed (lib 50ade155, planning 354e5381, root 8f832731).
- Steps 1–2 **built**: `routes/dms/dataAuth.js` guards `dms.data.edit/create/delete`, `dms.type.edit`,
  `dms.data.massedit` (token user, not the argument) and `/sync/push`, under `DMS_DATA_AUTH_MODE` (default
  `log`). Design + owner answers: the defect task's "B/E design". `getSubdomain` moved to `utils/subdomain.js`.
  First-run Create Site now signs in before its writes (`createSite.jsx`). Tests: `tests/test-data-auth.js` (28).
  Regression green: graph, workflow, uda-auth 28, source-auth 48, upload-auth 24, delete-cascade, change-history,
  pattern-stub, publish-config, transactions, sync 90, auth 104. `test-table-splitting` fails the same way
  without these changes (pre-existing). Open: tenant-subdomain first-run (logs in under the subdomain's
  project, so `${app} Admin` may not match): check the would-deny log on a tenant create.
- Step 3 **built**: TTL no longer slides (`jwt.js`); `auth/index.js` empties the token cache after a successful
  identity-changing route (`IDENTITY_ROUTES`). Tests in `test-jwt-failures.js` (8). Single-process cache only.
- Step 4 **built + live-checked**: internal Delete Version (`version.jsx` `DeleteViewBtn`) deletes the view row
  (`apiUpdate` delete), hidden without `delete-source`. With sync on it goes through `/sync/push` D, which had **no
  cascade** (left the view's ref on the source; found live): `/sync/push` D now runs `controller.cascadeDeletedRow`,
  the same cascade as `dms.data.delete`. Live on 3458 (enforce): viewer → button hidden, server refuses ("missing
  delete-source"); admin → view row + ref gone.
- Step 5 **built**: duplicate (`edit-pattern` on the pattern + site `create-pattern` on the target app) and
  sync-filters (`edit-pattern-permissions` on the named pattern, id and instance must match) gated by
  `requirePatternAction` (`dama/upload/auth.js`, login always; permission under `DMS_DATA_AUTH_MODE`).
- Recorded editor requests (`dms-server/logs/*.jsonl`, 2,888 writes) showed whole-row saves, `theme_refs` /
  `tenants` / `dms_envs` site keys, `published: 'draft'` on new pages and `|page-edit` history rows: the rule
  now judges only changed keys (defect task, "B/E design"). `tests/test-data-auth.js`: 38.
- Live (3458 log mode, admin): smoke (all pages), internal Add Version, Delete Version → **0 would-deny lines**.
  `restart3458.sh` takes `DATA_MODE=` (defaults to the source mode).
- **Live page-editor pass (2026-10-22, 3458 + 5197):** grants on page pattern 27 (`/p`): PatEditors edit-page;
  SrcEditors edit/publish/create-page; versioner (user 6) edit-page-permissions; viewer none. Test page `/p/probe`
  (63). Scripts `authcheck/flow-pageedit.mjs <slug>` (opens the editor as `AUTHCHECK_USER`: panes shown, Show in
  footer toggle, Publish, + page from Blank; records every /graph + /sync/push write), `neg-pageedit.mjs` (the
  writes the UI hides, sent as each actor), `rearm63.sh` (gives page 63 an unpublished draft again).
  - UI per actor matches the grants: pat_editor → Settings/Section Groups/History, no Publish; src_editor → + Pages,
    Publish; versioner → History/Permissions only; viewer → redirected to `/`; anon → `/auth/login`.
  - Every write the UI offered passed under `enforce`; editor writes all go through `/sync/push` (data as a JSON
    string): footer `[id, show_in_footer]`; Publish = `page-edit` history I + component I + page U
    (`sections`, `section_groups`, `published`, …); + page = page I + `page-edit` I.
  - `neg-pageedit.mjs` under `enforce`: 12/12 as expected (anon 401; viewer settings / new section / history row /
    delete → 403; pat_editor publish / new page / page permissions → 403; versioner settings → 403, permissions → 200;
    src_editor publish → 200). `log` mode: UI flows 0 would-deny lines; each hidden write logged once.
  - Fixed from this pass: an unchanged save needs any of the row's edit permissions (it needed edit-page, so a
    permissions-only user re-saving was refused); `dms.type.edit` judged as delete + create (a move);
    page `filters` accept `edit-page-params` (the Filters pane's gate). `test-data-auth.js`: 40.
  - ⚠ In `log` mode refused writes still happen: `neg-pageedit.mjs`'s delete case deleted page 63 once (restored
    with its id from `change_log`); the script now deletes a throwaway page it makes itself.
- **Write = what was judged** (2026-10-22, after owner review of the equality check): edits write only their
  changed keys (`planEdit`), and a sync I onto an existing id judges the keys it removes. Closes: values that only
  compare equal in JS (big numbers), JSON-string coercion, and a whole-row wipe through sync I. Tests: 45 (the 4
  new refusal tests fail on the old code). Live editor rerun under enforce: publish + footer toggle land correctly.
  Check-to-write gap closed the same day: optimistic re-check inside the write's transaction, retry 3×
  (defect task, "No gap between check and write"). Race tests (3) fail with the check off. `test-data-auth.js`
  49/49 on SQLite **and Postgres** (:5499); related suites green on both; live editor rerun clean.
- **Postgres pass 2 (10-22) ✓**: everything built today, plus the regression sample, on a Postgres-backed DMS
  (Results rows "Postgres pass 2"). Found: the editor sends whole-row sync saves on PG (handled).
- **Task 6 (2026-10-23, committed lib 48d297c3 / root 90052539):** download / PM tiles routes gated on `manage-downloads` (view's own
  source); `/files` decided (b): signed download route + Versions menu uses it; delete-download now deletes
  the files. Prod check: downloads and images share `availabs-bucket` (by prefix). Ops step open
  (see that task's Progress). `test-upload-auth.js` 37. **Live ✓ (enforce + log)**: Results rows "K downloads". The
  10-22 rig was gone; the new one is persistent at repo `scratchpad/srv3458/` (verify README, "Persistent rig").
- **Task 7 (2026-10-23, committed lib fc74b404):** schedule create / patch / delete / fire and task rerun need `update-source`
  on the stored row's source (both sources on a move), or `edit-pattern` on the named pattern with no source;
  schedule / run / task / event reads need a signed-in user (owner: `view-source` waits for task 12). Schedule and
  Runs pages gated on `update-source`. `tests/test-schedule-auth.js` 13. **Live ✓ (enforce + log)**: Results rows
  "M schedules". Rig additions: `rig-datatypes.cjs` (schedulable `rig_sched/run`), source **2** `sched fixture`
  (type `transcom`), Vite 5197 with `RIG_DATATYPES=1` (verify README).
- **Task 8 closed (2026-10-23):** gates built as step 5 (a943738b), live ✓ 10-22; task file now `built`.
- **Task 9 (2026-10-23, committed lib dc7b1e93 / root 1417a991):** plugin routes (`planning/shared/`
  datatype-plugin-route-permissions). The mount puts `writeGate` on every plugin router (writes need a signed-in
  user, `openRoutes` opt-out: now_playing webhook, routing's POST searches); each write route checks first via
  new helpers `authorizePublish` / `authorizeSourceWrite` (owner = token user). Client pages use `authedFetch`
  with the pattern and gate their buttons. Tests: `test-datatype-auth.js` 9, `data-types/tests/plugin-auth.
  integration.js` (34 routes, anon 401 + stranger 403). **Live ✓ (enforce + log)**: Results rows "N plugin routes".
- **Task 10 (2026-10-23, committed lib b34ca5e1):** client gates + the server's rule made lenient (owner: no permission set → open; hub
  open question 6). Live ✓: Results rows "O client gates", "O lenient rule".
- **2026-10-24: tasks 13 + 16 decided** (owner): client sends app + auth id; escalation (b) protected groups; auth
  **lenient** too, plus an open-auth warning to `${app} Admin` / `*` holders; platform ops = `AVAIL` membership.
  Prod check (CLI): wcdb (1471742, malformed `undefined Admin`) and avail (1449669, none) auth rows are **open**;
  change list for both now in task 18 (owner: `wcdb Admin` / `avail Admin`, added after every task is done, no
  level, **before or at the release**; not applied).
- **Task 13 built (2026-10-24, committed lib 5a192e40 / root b3716f8d):** `auth/utils/permissions.js` (lookup, `can`, `canOrLevel`,
  `canManageGroup`, `authScope`), handlers get `ctx`, client sends app + authPatternId, open-auth warning,
  `undefined Admin` fix. Tests 21 + test-auth 104; live ✓ on the rig (task file).
- **Task 14 built (2026-10-25, committed lib 84777ccc):** owner decisions: public = only `${project} Public`; Users page shows
  unmanageable users read-only (server `manageable` flag + new ui Table `canEdit({ row, attribute, op })`, reusable for
  row-level auth); membership = `auth-users` only; `/signup/assign/group` closed (anon: password + Public only).
  Later the same day: only the calling site's grants count (shared groups included); a site **removes** a user
  instead of deleting the account (new `/user/project/remove`: strips their own grants on the site's rows, then
  memberships; external-source grants listed only); external groups get their own button later (15 / 17).
  Tests: `test-auth-users` 26, `test-site-grants` 6, test-auth 104; live ✓ on the rig (task file Results). Open: the
  level path lets a level-1 user add people to level-1 groups (today's rule; disappears with level removal).
- **Merge of `origin/master` (2026-10-25; lib f3d335f6, root b77374a7):** conflicts: source Admin buttons (master:
  navigate on click; kept our gates). Write-path check: master's server changes are reads (`superseded_by`); new
  plugin route `volume_data_report/publish` had **no check** (a signed-in stranger got 200): now `authorizePublish`,
  client on `authedFetch` + gated (root a13f2ec1), sweep 36/36 (35 write routes). New **chat** pattern (root):
  its source is in no dmsEnv / datasets pattern, so under `enforce` every non-admin channel / message write is
  refused ("source … is in no datasets pattern"); `log` lets them through with would-deny lines. Owner (10-25): recorded on the chat task for its author
  (root `planning/tessera/tasks/current/chat-pattern-implementation.md`, "Permissions and privacy"); chat has
  other privacy concerns to think through first. Must be settled before any site runs data-auth `enforce`.
  test-uda's "no update-source grant" fixture set no grants (open under the lenient rule): re-fixtured (d16043b3).
  Sample green: uda 144, uda-auth 28, source-auth 50, upload-auth 37, data-auth 49, auth suites; lifecycle vitest 21.
- Next: tasks 15–16 (16 decided), then 17; task 11 (blocked on a decision) and 12.

**Next session, in order (owner decisions 2026-10-22):** items 1–5 were built 2026-10-22; the live page-editor pass and
the Postgres pass ran (Progress above); next is item 6.
1. **Defect B/E into this branch**: guard `dms.data.edit` / `dms.data.create` (anon and any viewer can write any row
   today, so internal sources' gates are bypassable; the internal Add Version goes through them). Design and history in
   [auth-permission-chain-and-unguarded-writes](./auth-permission-chain-and-unguarded-writes.md) (defects B/E, status
   next). Move that work here or under that task, but it ships with `permissions_move`.
2. **Guard `/sync/push`** the same way (it accepted viewer's update of a source row; unguarded unless
   `DMS_SYNC_AUTH=1`, `routes/sync/sync.js:175`). Related: [sync-per-user-permission-filtering](./sync-per-user-permission-filtering.md).
3. **Token cache: clear it on changes.** `auth/jwt.js` caches the resolved user per token (`TOKEN_TTL` 5 min, and the
   TTL **slides**: `getCachedUser` resets `entry.time` on each hit, so a revoked token in use never expires). Clear
   a user's entries on password set / force / update / reset, user delete, and group membership or group-project
   level changes (auth handlers in `src/auth/handlers/`). It exists to avoid re-verifying the JWT + 2 auth-db queries
   (user, groups) on every request. Retest with `authcheck/stale.mjs warm` (must refuse after the change).
4. **Fix internal Delete Version** (`pages/dataTypes/default/version.jsx` `DeleteViewBtn`): today it deletes nothing,
   even for admin, and doesn't even drop the version from the source's `views` list (`s.id !== view_id` compares a
   number to the route string; the page still navigates as if it worked). A real fix deletes the view row and its
   split table and removes the ref, under `delete-source` (like the external `uda.views.delete`), and gates the button
   the same way. Test on I2 (101 / view 102) with `authcheck/flow-delversion.mjs i101 102`.
5. **Task 8 gets sync-filters / duplicate**: owner rule "whoever can reach them may use them", so the server mirrors
   the UI gate. Today both REST routes check nothing, not even a login (anon queued a sync-filters task).
   Sync-filters is on the pattern's Access tab → `edit-pattern-permissions` on that pattern. Duplicate is on its
   Overview tab (`edit-pattern`) and in the sites list (site-level pattern editing). Mounts:
   `dama/upload/index.js:45,50`.
6. Then tasks 6–10 as below, each with its stage-2 rows.

**Accepted / parked:**
- Refusal messages from falcor writes show `[object Object]` (avl-falcor transport, memory
  falcor-call-error-message-bug): **accepted for now, fix later** (needs its own task; not written yet).
- PDF export: separate task [pdf-export-route-missing-on-dms-server](./pdf-export-route-missing-on-dms-server.md),
  for the PDF export redesign sweep.

**Test rig** (rebuild if the session scratchpad is gone): `dms-template/scratchpad/verify/README.md` →
"Request-capture checks" (fixtures, users, `authcheck/matrix.mjs <mode>`, `flow-*.mjs`, `AUTHCHECK_USER`,
`restart3458.sh <mode>`, `DMS_DB=dms-postgres-test` for the Postgres pass). Last session's 3458 dir:
`/tmp/claude-1000/-home-shaun-IdeaProjects-dms-template/65864780-30cc-4cbd-91eb-0a0c3fe29dea/scratchpad/srv3458/`
(its sqlite holds the test users and grants; the :5499 PostGIS container holds E1–E3 and the per-app Postgres copy).

**Branch (owner, 2026-10-21): work on `permissions_move` in both repos, not `master`.** Each merged `origin/master`
(lib d85ddc4e, root f292ea59). **No push until every step is done and every feature touched is tested end to end.**
The lib merge moved master's new `sources.setRule` / `sources.backfillRule` onto `assertSourcePermission` (pattern as
last arg; `rules.jsx` sends `datasetsPattern`; refusals keep the Rules page wording "You don't have permission to change
this source…"). Post-merge, all green: `test-uda-auth` 28, `test-source-auth` 48, `test-upload-auth` 24,
`test-dms-publish-config` 3 (SQLite + Postgres); `test-upload-pipeline`, `test-sites` 30 (SQLite); `test-source-rules`
29 (PostGIS: the owner runs `npm run test:pg:source-rules` from `packages/dms-server`, Docker isn't usable from this
account; it needs the temporary `dama-postgres-test` config and removes the :5499 container when done); `npm run build` ✓.
Still to do before any push: the **End-to-end test plan** section below, **stage 1 next** (start with its Setup; `test_dama` on :5499 was
wiped 2026-10-21 and must be re-seeded).

**Done so far** (all on `master`, **not pushed**; library commits, root bumps in brackets):
- **0. Inventory** — closed, in `tasks/completed/permissions-inventory.md` (a9b7c1c3). Tessera / `tessera_auth`
  is out of scope (owner, 2026-10-20).
- **2. Datasets permissions core** — `doing`: code done + tested (8bed976f [f94566f9]). Strict, fail-closed
  resolver in `dms-server/src/routes/uda/sourceAuth.js`; `DMS_SOURCE_AUTH_MODE = legacy | log | enforce`,
  **default `log`** (today's rule OR the strict rule decides, since 10-21; strict would-denies are logged as `[source-auth] would-deny …`).
  New vocabulary `create-source` (pattern) and `edit-source-data` (source rows). Only open item: deploy and read the
  would-deny log before any `enforce`.
- **3. Client auth headers** — `built` (42b79799 [e09d25ef]; live check 25bea9d4 [64ef3f1c]). `utils/authedFetch.js`
  (exported from `@availabs/dms`) sends the token (falls back to `localStorage.userToken`) and
  `?dms_pattern=<app>/<id>`, and turns a 401/403 into a `PermissionError`. Every library REST call uses it. Network-checked
  live; see that task's checklist.
- **4. `uda` Falcor writes** — `built` (2026-10-21, committed; see that task). Every `uda.*` set/call write needs a user + a
  source (or pattern) permission; calls take the datasets pattern as their last argument (`DatasetsContext.datasetsPattern`),
  client sets moved to `sources.update` / `views.update` / `settings.update` calls; DaMa column whitelists;
  `wasOpen` option (routes that checked nothing allow in legacy/log). Also fixed: core `readInternalSource` (clients
  name internal envs by type/slug, not pattern — owners now found from the source), DMS-env deletes skipping
  `authorize`, and a **per-app SQLite Clear Data that emptied the app's main table**. Tests: `test-uda-auth.js` (24).
  `legacy`/`log` now allow whatever `enforce` would (owner, 10-21).
- **5. Upload / publish routes** — `built` (2026-10-21, committed; see that task). New `dama/upload/auth.js`: login on
  every upload/publish/file-upload route; staged uploads are their uploader's only; new source → `create-source` on
  the named pattern (image/Lexical `file_upload` with no pattern: login only, owner decision); new version →
  `create-view`/`update-source`; DMS publish/validate → `edit-source-data`/`update-source` on every source touched
  (owner decision); DMS file upload's `owner_id` must be the named pattern or its dmsEnv; owner = token user
  everywhere. Tests: `test-upload-auth.js` (24, SQLite + Postgres). Live under `enforce` as admin: all flows pass.

**Decisions to keep in mind** (details in task 2's "Decisions"):
- External sources inherit the grants of the **client-named** datasets pattern (`?dms_pattern=`); the server only checks
  it's an existing datasets pattern of that app. Owner accepted the forgery risk (alternatives: per-pgEnv app
  allowlist in server config, or source grants only).
- The pattern travels as a **query param**, not a header (CORS: client and server deploy separately). The server also
  accepts `X-DMS-Pattern` now; switch the client to the header once every server has the new CORS list. Never read
  from the body.
- Internal (`app+instance`) sources get pattern grants from their env's own pattern(s), only if the source is theirs.
- `${app} Admin` passes everything. Server strict for writes; client lenient until task 10 aligns it.

**Next, in order:**
1. Then 6–8 (downloads + PM tiles + `/files`; schedules + task status reads incl. `events/query`; pattern ops) and 9
   (plugins: client pages listed in the shared task). 10 (client gates) can land any time.
3. Auth track (13–17) is independent; the first quick win is the NYSDOT `avail_auth` level-5 hole (task 16).

**Open bugs found along the way (not fixed, not ours):**
- SQLite and Postgres merge an edit differently: `json_patch` merges nested objects (and `null` deletes a key),
  Postgres `||` replaces each top-level key. So `{authPermissions: {groups: {}}}` keeps a pattern's grants on
  SQLite and wipes them on Postgres (found by test-data-auth on Postgres, 2026-10-22). Clients send whole values,
  so it mostly doesn't show; a partial nested write (CLI, scripts) behaves per database.
- sqlite only: in-process DMS tasks get `ctx.task.descriptor` as a string (`dms/tasks/index.js` `startTaskWorker`;
  the forked `worker-runner.js:77` already parses). Sync-filters fails and duplicate copies zero pages on sqlite
  servers; prod (Postgres) is fine. About a one-line fix.
- `ExternalVersionControls.jsx` deleteDownload calls an undefined `getData`, which reopens the modal after a successful delete.
- Auth pages' `/users/byProject` and `/groups/byproject` send no `Authorization` (tasks 14/15).

**How to test** (don't rediscover):
- Server unit tests: `cd src/dms/packages/dms-server && DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node
  tests/test-source-auth.js` (48). Postgres: needs the owner's `dms-test-postgres` container on :5499 plus a temporary
  `src/db/configs/dama-postgres-test.config.json` (gitignored on purpose; delete after), then
  `DMS_TEST_DB=dms-postgres-test DMS_DB_ENV=dms-postgres-test DAMA_TEST_DB=dama-postgres-test`.
- **Never** `require('src/index.js')` or start dms-server without an explicit local `DMS_DB_ENV`: the default config is
  prod `dms3`. Use `node --check` for syntax.
- Server: `DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-uda-auth.js` (23). **Every** server test needs
  `DMS_TEST_DB`/`DMS_DB_ENV` set: their default `dms-sqlite` config is a remote Postgres.
- Live: `dms-template/scratchpad/verify/README.md` → "Request-capture checks (`authcheck/`)". Scratch server :3458
  (current code + sqlite copy, built in the session scratchpad, so rebuild it) + Vite :5197 (`vite.5197.config.mjs`).

## ▶ End-to-end test plan (gate before any push; written 2026-10-21)

**Owner rule:** nothing on `permissions_move` (both repos) is pushed until every step is done and every feature
touched passes end to end. Server unit suites and the build are green (see the branch note above). Those run as
fixtures. Every live check so far ran as the `v6test Admin` only, and that's the gap this plan closes. Record
results in the **Results** table at the end of this section as you go, with the date, the mode and the evidence.

Ground rules: never prod (memory: local configs point at prod `dms3`), never the owner's :5173. Read
`dms-template/scratchpad/verify/README.md` first: servers, login, the `authcheck/` request-capture scripts.

### 0. Setup

1. **Test Postgres on :5499, with PostGIS.** The GIS create flow and the Rules page need it. Owner runs (Docker
   isn't usable from Claude's account), from `src/dms/packages/dms-server`:
   `npm run test:pg:stop; DMS_TEST_PG_IMAGE=postgis/postgis:16-3.4 npm run test:pg:start`.
   **`test_dama` (= `dms_test` on :5499) was wiped on 2026-10-21** when the container was replaced for the
   source-rules suite. Source 2 / version 3, which the `authcheck` flows use, no longer exist. Only stray `srcauth_*`
   rows 3–4 are left; delete them.
2. **Server 3458 on branch code + Vite 5197** (README "Request-capture checks" recipe; rebuild in the session
   scratchpad). Start 3458 with `DMS_SOURCE_AUTH_MODE=log`, and restart it to switch modes.
3. **Re-seed external fixtures through the UI as admin.** That's test G1 below, so it doubles as a test. Create
   CSV source **E1** (own grants `{}`) with version **E1v1**, and CSV source **E2** with its own grants (via the
   Access editor, test B). Use a sheet with a lat/lon pair and an integer id for the Rules tests. A GIS source
   **E3** comes from a small GeoJSON (test G3). Write the new ids into the verify README (replacing source 2 / v3)
   and update `flow-*.mjs` constants.
4. **Internal fixtures** (DMS env of pattern 17 `/data`): **I1** = the existing internal source 4. Add **I2**
   (blank internal table) for destructive tests (Clear data, delete).
5. **Users** in the `v6test` project (`/auth/manage/users`, `/auth/manage/groups` on 5197, on the 3458 sqlite
   copy). Each gets its own token for the `authcheck` scripts.

   | User | Grants | Expected |
   |---|---|---|
   | `admin` | `v6test Admin` | everything |
   | `src_editor` | group `SrcEditors`: `update-source`, `edit-source-data` on E2 and I1 (source Access editor) | edits those two, nothing else |
   | `pat_editor` | group `PatEditors` in pattern 17's authPermissions: `create-source`, `update-source`, `edit-source-data`, `create-view`, `edit-pattern` | everything in pattern 17 via the pattern; E1 (no own grants) only through calls that name the pattern |
   | `versioner` | `create-view` only on E2 | add a version to E2; no metadata edit |
   | `viewer` | logged in, no grants | read only; every write refused |
   | anon | — | read only; writes say "Sign in" |

### 1. Mode matrix

Every row in section 2 runs under **`enforce`** (the target) and **`log`** (what deploys first). `log` must allow
everything `enforce` allows. For an actor `enforce` refuses, `log` allows only if today's rule did, and then writes
one `[source-auth] would-deny …` line. Spot-check **`legacy`** on A, G1 and D for admin and `viewer`. At the end
of the `log` pass, grep the 3458 log: every would-deny line must be explained by a row here. None may appear for
`admin`, or for a user on a source they're granted.

### 2. Features (each: actors × expected; evidence = `authcheck` capture + DB state + what the UI shows)

**A. Source metadata (Overview / Metadata pages):** description, categories, column display names, on E1, E2, I1.
`sources.update` call (no more `set`), args end with the datasets pattern. `src_editor` ✓ on E2/I1, ✗ on E1.
`pat_editor` ✓ on all three (E1 via the pattern). `viewer` ✗, anon "Sign in". A refusal shows a message and
the UI doesn't pretend it saved (check the value after reload).

**B. Access editor (`SourceAccessEditor`)** writing `auth_permissions`: needs `edit-source-permissions`.
`src_editor` (update-source only) ✗ even on E2. Admin ✓. The stored grants are unchanged after a refusal (DB).

**C. Version page:** rename (`views.update`), authoritative view (`AuthorityControl` → `setAuthoritativeView`),
lineage (`LineageControls`), delete version (`ExternalVersionControls`; known bug: it reopens the modal after a
delete). `src_editor` ✓ on E2, ✗ on E1. `versioner` ✗ on rename. `viewer` ✗.

**D. Admin page:** `setIndex`, `setPrimaryKey`, Clear data, delete source (cascade), duplicate.
- Clear data on **I2** as `pat_editor`: rows gone **and the app's main table row count unchanged** (the per-app
  SQLite bug fixed in task 4).
- Delete I2 as `viewer` ✗ (`delete-source`); as admin ✓, and the dmsEnv `sources` list loses it.
- `setIndex` / `setPrimaryKey` on E1/E2 per actor (owner question 3 in `datasets-source-rules.md` still open:
  record what happens, don't change it).

**E. Settings page** (`SettingsPage.jsx`, hidden source types): `settings.update` needs `edit-pattern` on the
named pattern. `pat_editor` ✓, `src_editor` ✗, anon "Sign in". Restore the settings afterwards.

**F. Rules page (merged from master; `rules.jsx`):** attach Auto-number and Point from lat/lon on E1 (needs
PostGIS), Apply to existing rows, Edit, Remove.
- The request args end with `datasetsPattern`.
- `pat_editor` ✓ on E1 (via pattern). `src_editor` on E1: the page shows "You don't have permission to change this
  source (update-source on source N)." `viewer` same. Anon "Sign in to change source rules".
- After a refusal, `rulesInfo` shows nothing attached (no DDL).

**G. Uploads / publish (task 5 + internal-publish fix):**
1. CSV create → publish (`flow-csv.mjs`): `create-source` on pattern 17. `pat_editor` ✓, `src_editor` ✗ (403
   shown in the wizard), anon 401. The new source's owner/grants name the token user, not a body `user_id`.
2. Add a version to E2: `versioner` ✓ (`create-view`), `viewer` ✗.
3. GIS create flow (upload file → select layer → schema editor → publish) as `pat_editor` ✓ and `viewer` ✗.
4. `file_upload` source (`CreatePage.jsx`, `flow-create.mjs`): ✓/✗ per actor; post-create redirect works.
5. **Internal source upload page on I1** (`flow-internal.mjs`) with a sheet that adds 2 columns, as `src_editor`
   and `pat_editor`:
   - publish carries `sourceId` = I1's row id;
   - the source's `config.attributes` gains the 2 columns, and `updated_at` moves;
   - **no new `…|source` row** (no `sync/push I …|source`);
   - a repeat upload adds nothing.

   `viewer` ✗ (`edit-source-data`).
6. Staged uploads are their uploader's: a staged upload id from `pat_editor` used by `src_editor` (validate /
   publish) is refused.
7. Validate (`ValidateComp`) on I1: `edit-source-data` ✓/✗.
8. DMS file upload owner check: an `owner_id` that isn't pattern 17 or its dmsEnv is refused.

**H. Client auth headers (task 3), per call:** the capture shows the token and `?dms_pattern=` on every
dama-admin/dms-admin REST call. Covers uploads, publish, validate, downloads (`flow-downloads.mjs`), PM tiles
(`Map/Layer2.jsx`), file_upload, the GIS flow, schedules, admin duplicate / sync-filters, PDF, image uploads.
**Expired / removed token:** each shows a permission or sign-in message (`PermissionError`), not a silent failure
or `{}`.

**I. Schedules + Runs pages** (`SchedulePage.jsx`, `RunsPage.jsx`; plugin types only:
`scratchpad/authcheck-harness/`, `flow-sched.mjs`): create/edit/run a schedule as admin ✓. Task 7 will gate these;
until then, record each actor's result.

**J. Pattern admin:** duplicate pattern (`dms-duplicate.js`, `flow-dup.mjs`), sync filters
(`pattern-filter-sync.js`, `flow-sync.mjs`, needs a saved filter on pattern 27), `editSite`, `patternList`,
`filterEditor`.
- Admin ✓; `viewer` ✗.
- **Run on a Postgres-backed DMS server**: on sqlite the in-process task descriptor bug makes sync-filters fail and
  duplicate copy nothing, which isn't this branch.

**K. Images and PDF:** Lexical inline image upload (`InlineImageComponent.tsx`), image column (`columnTypes/image.jsx`),
Export PDF (`ExportPdf.jsx` / `selectablePDF.js`). Each works for an author, sends the token, and refuses anon.
(`file_upload` with no pattern: login only, owner decision.)

**L. Regression smoke, outside datasets:** page pattern view/edit/publish on test pages 37 / 49 / 61 / 80, admin
sites list `/list`, auth manage pages. Site hosting middleware (master): with no `<checkout>-sites` folder, the API
on 3458 still answers. Check the browser console for new errors on each.

### 3. Postgres pass

prod is Postgres per-app, so repeat **A, D (Clear data), F, G1, G5, J** with 3458's DMS db on
`dms-postgres-test` (:5499) instead of the sqlite copy. That needs a seeded site there: seed it the way 3457 was,
or via the CLI against 3458.

### 4. Stages and exit criteria (owner, 2026-10-21: test in layers, not only at the end)

The plan runs three times, at different scopes:

1. **Stage 1, now: tasks 2–5 as built.** Setup, then sections 1–3 for features A–L. Fix what it finds before
   building task 6. Until this passes, the resolver has only been seen live as the admin.
2. **Stage 2, per task, as each lands:** 6 (downloads / PM tiles / `/files`), 7 (schedules / task status),
   8 (pattern ops), 9 (plugins), 10 (client gates: "the UI never shows a control that would 403"), and the auth
   tasks 13–17. Each task:
   - adds its rows to section 2 (a new letter per task);
   - runs them under `enforce` and `log`;
   - reruns a **regression sample** of earlier rows: A, D (Clear data), F, G1, G5, H, plus any row whose code the
     task touched.

   Also after **every merge from `origin/master`**, check each new write path in the merge against the permission
   gates (today's example: `sources.setRule` / `backfillRule`), then rerun the sample.
3. **Stage 3, final: after the grant migration and level removal.**
   - The access-diff audit ([1b](./permissions-access-diff-audit.md)) passes on real data: zero unintended losses,
     and every intended loss signed off.
   - Then the **full plan** reruns once on the final branch, with the migrated grants instead of the hand-set
     ones. The users from Setup are re-checked as level-holders migrated to grants.
   - The auth server / client pages that level removal touches get their own rows.

**Exit criteria for the push** (owner pushes, after stage 3):
- Every row passes under `enforce` and `log`; the would-deny log is fully explained.
- Unit suites green (SQLite + Postgres, `test-source-rules` on PostGIS); `npm run build` green.
- Results recorded below with their stage; owner signs off.

Open (owner): whether to push at a milestone instead of only after stage 3. For example, the datasets enforcement in
`log` mode once stage 1 passes, since `log` was designed to ship without changing anyone's access. Today's rule:
no push until stage 3.

### Results

| Stage | Row | Mode | Date | Result | Evidence / notes |
|---|---|---|---|---|---|
| 1 | Setup 2 | log | 10-21 | done | 3458 rebuilt in session scratchpad `65864780…/scratchpad/srv3458/` (sqlite `.backup()` of 3457's DB from `ef63fb11…/scratchpad/srv/`), started `DMS_SOURCE_AUTH_MODE=log`, log at `…/scratchpad/srv3458.log`; Vite 5197 up. |
| 1 | Setup 5 | — | 10-21 | done | On the 3458 sqlite copy: groups `SrcEditors`, `PatEditors`, `Viewers` (all v6test, level 1); users `src_editor@` / `pat_editor@` / `versioner@` / `viewer@test.local`, password `test123`; versioner + viewer in `Viewers` (versioner's `create-view` on E2 goes in as a **user** grant). Grants on E2 / I1 / pattern 17 not set yet. |
| 1 | Setup 1 | — | 10-21 | done | Owner swapped :5499 to `postgis/postgis:16-3.4` (PostGIS 3.4.3); 3458 restarted, `data_manager` recreated. No stray `srcauth_*` rows (fresh db). |
| 1 | Setup 3–4 | log | 10-21 | done | Fixture ids in the verify README. E1 = src 1 / view 1, E2 = src 2 / view 2 (`fixture.csv`, lat/lon + int id), I1 = internal 4, I2 = internal **96**. Grants set through the UI (`flow-access.mjs`): E2 + I1 `SrcEditors` [update-source, edit-source-data]; E2 user 6 (versioner) [create-view]; pattern 17 `PatEditors` [create-source, update-source, edit-source-data, create-view, edit-pattern]. E3 (GIS) comes from G3. |
| 1 | G1 (admin) | log | 10-21 | ✓ | `flow-csv.mjs E1/E2 fixture.csv`: every REST call carries the admin JWT + `dms_pattern=v6test/17`; `csv-dataset/publish` 200; 3 rows in `s1_v1_e1`; view `user_id` 1 = token user; new source gets a creator grant `{"users":{"1":["*"]},"groups":{"public":[]}}`. |
| 1 | B | log | 10-21 | ✓ (after fix) | **Bug found + fixed (lib, uncommitted):** the Access editor offered the generic `*`/create/update instead of the source vocabulary, so no one could grant `update-source` etc. from the UI. `SourcePage.jsx:74` looks for registered format `<inst>|form-manager|source`, but the source format registers as `<inst>|source`, so it falls back to the pattern format (no `auth_permissions` attr). Pre-existing on master (lookup from 2026-02). Fix in `SourceAccessEditor.jsx`: fall back to `datasets.format.js`'s `source` attributes. That exposed a second bug: `defaultPermission={authAttr.default}` is the column default `{}`, so new grant rows saved `[{}, "create-view"]`; now only an array default is used. `sourceFormat` itself left alone (internal env names on lines 82–134 are built from its type). Then: admin writes via `uda.sources.update` (args end `{app:v6test,id:17}`) → 200. `call.mjs` escalation (`SrcEditors:["*"]`) as src_editor / viewer → "Not authorized: needs edit-source-permissions on source 2", anon → "Sign in to do this"; grants unchanged in the DB; no would-deny line (old rule refuses too). Client: the editor is hidden for non-holders (not yet checked per actor). **Server accepts non-string perms** (`[{}, …]` was stored): no shape validation, noted. |
| 1 | A, B, C (rename, authoritative set/clear), D (setIndex/setPK), E, F (gate) — server | enforce | 10-21 | ✓ 120/120 | `authcheck/matrix.mjs enforce`: 20 rows × 6 actors, every non-destructive `uda` write with the client's args (pattern last); restores what it changed. Refusal wording checked ("needs update-source on source 1", anon "Sign in to do this", Rules page "You don't have permission to change this source (update-source on source 1)."). The one first-run miss was my expectation: `settings.update` with **no pattern** refuses even admin (no app ⇒ no `${app} Admin`); the client always names it. |
| 1 | same | log | 10-21 | ✓ 120/120 | `matrix.mjs log`: log ⊇ enforce, anon refused everywhere; 25 extra allows, **exactly 25 would-deny lines**, each explained: I1 is a DMS env (today's rule allows any signed-in user); `views.update` / `setIndex` / `setPrimaryKey` were open routes (`wasOpen`); settings is pattern-level. `src_editor` only appears on E1 (not granted); admin only on the synthetic no-pattern settings call. Cosmetic: that line reads `pattern undefined/undefined` (could say "none named"). |
| 1 | A + C rename (UI) | enforce | 10-21 | ✓ (after fix) / **message: open** | `authcheck/flow-ui-a.mjs <src\|i<id>> [view]` per actor. Interval pencil: shown only to grantees (pat_editor on E1/E2/I1, src_editor on E2/I1), hidden for viewer / anon / src_editor on E1; grantee saves persist. **Bug fixed (lib, uncommitted):** the version-name input (`version.jsx`, saves as you type) had no gate; viewer could type, every keystroke got "needs update-source on source 1", the page threw an uncaught `[object Object]` and showed nothing (value did revert on reload). Now `disabled` unless `update-source`, like `AuthorityControl`. **Open (owner):** any refused `uda` falcor write that reaches the server can't show its message: avl-falcor's transport turns the 500 body into `Error("[object Object]")` (memory: falcor-call-error-message-bug, deferred 2026-07). Only routes that answer refusals as values (Rules `rulesCall`, deletes) can show the wording. The gates hide most controls, so it mostly bites on stale grants / races. |
| 1 | D Clear data (I2) | enforce | 10-21 | ✓ (after fix) | I2 seeded via Add Version (`flow-addview.mjs`) + upload (`ISRC=96 flow-internal.mjs fixture.csv`): 3 rows. `flow-clear.mjs`: server refuses viewer / src_editor ("needs edit-source-data or delete-source on source 96"), rows kept. **Bug fixed (lib, uncommitted):** `ClearDataBtn` had no gate and on refusal the modal stuck open with an uncaught `[object Object]`; now rendered only with `edit-source-data` or `delete-source` (the server's rule; client `isUserAuthed` is any-of). pat_editor: rows 3 → 0, **main table unchanged (92)**. |
| 1 | D delete source (I2) | enforce | 10-21 | ✓ (after fix) | `flow-delete.mjs`: viewer and pat_editor (no `delete-source`) refused with the readable "Not authorized to delete source 96 (needs delete-source)" (delete answers refusals as values). **Gated (lib, uncommitted):** `DeleteDmsSourceBtn` and `DeleteDamaSourceBtn` now render only with `delete-source`. Admin: cascade (source 96 + view 97 rows, split table dropped, main 92 → 90), dmsEnv 16 `sources` loses it, lands on `/data`. I2 recreated as **101** (view 102). |
| 1 | C/D internal Add Version | enforce | 10-21 | **✗ known hole** | viewer (no grants) adds a version to I2: the client uses generic `dms.data.create` (view row) + `dms.data.edit` (source row), which check nothing. Probe: `dms.data.edit ["v6test",4,{update_interval}]` succeeds as viewer **and anon** (restored). This is Defect B/E of [auth-permission-chain-and-unguarded-writes](./auth-permission-chain-and-unguarded-writes.md) (status next), not new. Consequence for this move: **gates on internal sources aren't a boundary** until B/E land. Owner: pull B/E into `permissions_move` before the push? Still ungated in the admin sidebar (task 10): Add Version, Rules link, Editable toggle. |
| 1 | E Settings (UI) | enforce | 10-21 | ✓ (after fix) | `flow-udawrites.mjs settings`: pat_editor saves (`settings.update` + pattern → 200); anon sees no toggles. **Bug fixed (lib, uncommitted):** src_editor got all 9 switches and every click was refused ("needs edit-pattern on pattern v6test/17") while the page kept showing the change (optimistic state, never reverted). `SettingsPage.jsx`: `canEdit = isUserAuthed(['edit-pattern'])` disables every control and guards `saveSettings`, and a refused save restores the previous state. Settings restored to `{}`. |
| 1 | F Rules (UI, E1) | enforce | 10-21 | ✓ (Auto-number) | `flow-rules.mjs`: viewer / src_editor get "You can view this source's rules but not change them." and no Add / Edit / Remove (page already gated on `update-source`); anon → sign-in. pat_editor (via pattern): Auto-number on `ogc_fid` attached ("Added by pat_editor@test.local"), edited (`replaceKey`), removed (`metadata.rules` → `[]`); every `setRule` ends with the pattern. On `site_id` it refuses for data ("allows empty values. Make it the primary key first"), and `setPrimaryKey site_id` as pat_editor passes the gate but fails on data (table already has `ogc_fid` PK). Point-from-lat/lon isn't offered on a CSV source (no geometry): run on E3. Server refusals for src_editor/viewer are in the matrix rows. |
| 1 | G1 + G3 create | enforce | 10-21 | ✓ | `flow-csv.mjs` (`DSTYPE="GIS dataset"` for G3, `fixture.geojson`). pat_editor creates **E3 = source 3** (view 3, `gis_datasets.s3_v3_e3`, 3 rows with `wkb_geometry`), owner / creator grant = user 5 (token user). src_editor (CSV) and viewer (GIS): `…/publish` → **403**, wizard shows "You don't have permission to do this (requires create-source on pattern v6test/17)."; no source created. Anon: `/data/create` → `/auth/login`. UX (task 10): non-grantees go through the whole wizard before the refusal. Minor, not perms: the layer-analysis panel says "No features — This layer has no geometries" for the point GeoJSON that then loads fine. |
| 1 | F Point from lat/lon (E3) | enforce | 10-21 | ✓ | pat_editor: attach (`lat`/`lon`/`wkb_geometry`) installs trigger `dms_rule_point_from_lat_lon_wkb_geometry`; "Apply to existing rows" (`backfillRule` → `ok:true`) rebuilt a nulled geometry; a raw insert got `MULTIPOINT((-74 42))`; remove drops the trigger, `metadata.rules` → `[]`. src_editor (not granted on E3): read-only banner. |
| 1 | G2 add version (E2) | enforce | 10-21 | ✓ | `flow-version.mjs 2` (Admin → Add Version modal = upload wizard): viewer → `csv-dataset/publish` 403, visible "requires create-view or update-source on source 2"; versioner → 200, **view 4** owner 6; src_editor (update-source) → 200, view 5 owner 4. |
| 1 | C delete version | enforce | 10-21 | ✓ external / **✗ internal (not perms)** | External (`flow-delversion.mjs 2 5`): hidden for viewer (`DeleteVersionButton` gated on `delete-source`); `call.mjs` versioner / src_editor / viewer → "Not authorized to delete source 2 (needs delete-source)" (wording says *source* for a version), anon "Sign in to delete"; admin deletes view 5, table dropped. Internal (`DeleteViewBtn`, I2 v102): **no gate, and it never deletes, even for admin**: `data.views.filter(s => s.id !== view_id)` compares number to the route string, so nothing changes, yet the page navigates as if it worked; fixed it would only unlink (row + split table orphaned), via ungated `dms.data.edit`. Pre-existing; not fixed here. |
| 1 | G5 internal upload (I1, +2 columns) + G7 validate | enforce | 10-21 | ✓ (after fix) | `ISRC=4 flow-internal.mjs g5.csv` (`fld_zone,zone_subty` + new `e2e_a,e2e_b`), state from `i1state.cjs`. **Bug fixed (lib, uncommitted):** on the first run viewer's validate **and** publish were refused (403, "requires edit-source-data or update-source on source 4"), yet I1's `config.attributes` gained both columns and `updated_at` moved: `components/upload.jsx` wrote the new columns into the source config (`updateMetaData` → `/sync/push U …:source id=4`) **before** the publish request and regardless of its result. The server's publish already adds them under its own check (internal-publish fix), so the client write now runs only after a successful publish (local state). After restoring I1's config: viewer → 403, nothing changes; src_editor → publish 200, server log `sourceId=4`, attributes + `e_2_e_a, e_2_e_b`, `updated_at` moves; pat_editor repeat → nothing added, `updated_at` unchanged; source rows stay 12 (no new `…|source`). Validate: viewer 403, src_editor / pat_editor 200. **Server side still open:** `/sync/push` accepted viewer's update of a source row (sync writes are unguarded unless `DMS_SYNC_AUTH=1`; same family as Defect B/E and [sync-per-user-permission-filtering](./sync-per-user-permission-filtering.md)). Cosmetic: `e2e_a` became `e_2_e_a` (slug splits digits). |
| 1 | G6 staged uploads | enforce | 10-21 | ✓ | curl: pat_editor stages `g5.csv` (`dms_7ace…`); src_editor with that id: `gis-dataset/<id>/layers` 403, DMS `…:data/publish` 403 "this upload belongs to another user", external `csv-dataset/publish` 403 same; pat_editor `layers` 200. |
| 1 | G8 DMS file upload owner | enforce | 10-21 | ✓ | pat_editor `POST /dms-admin/v6test/file_upload?dms_pattern=v6test/17` with `owner_id=4` → 403 "owner 4 is not the datasets pattern v6test/17 or its dmsEnv"; nothing created. |
| 1 | G4 file source (UI) | enforce | 10-21 | ✓ | `flow-create.mjs`: pat_editor → `file_upload` 200, redirect to `/data/internal_source/111`; src_editor / viewer → 403, visible "requires create-source on pattern v6test/17", stay on `/data/create`. |
| 1 | H headers | enforce | 10-21 | ✓ except internal upload | Captures: CSV / GIS create, Add Version, file source, downloads (`create-download`, `pmtiles/cache-pmtiles`), schedules harness (`schedules`, `schedulables`, `tasks/<id>/rerun`): all carry the token + `dms_pattern=v6test/17`. Image upload (`file_upload`, `flow-image.mjs`): token, no pattern (owner decision: login only). Internal upload page: no pattern (row below). PDF and PM-tile reads not yet captured (K / map). |
| 1 | H dead token | enforce | 10-21 | ✓ at load / **open: 5-min cache** | Garbage token (`AUTHCHECK_USER=badtoken`): `/data/create` → `/auth/login`. Mid-session revoke (`flow-expire.mjs`, `stale.mjs`: admin force-changes src_editor's password, which invalidates the token): `/auth` says "Token could not be verified" and the next page load goes to sign-in, **but a token already used once keeps working on `/graph` writes and REST routes for up to 5 minutes**: `auth/jwt.js` caches the resolved user per token (`TOKEN_TTL` 5 min). A token not yet cached is refused at once ("Sign in to do this" / 401). The cached user carries its groups, so a revoked group grant can also lag 5 minutes. Owner: acceptable revocation latency, or invalidate on password / group change? |
| 1 | I schedules / runs | enforce | 10-21 | recorded (task 7) | curl per actor: `GET schedules` and `GET events/query` answer anon 200; `POST schedules` and `POST tasks/<id>/rerun` need only a login (viewer passes auth: 400 "worker_path is required" / 404 "Task not found"; anon 401). Task 7 gates them. Harness (`flow-sched.mjs`): headers + pattern present (its placeholder token makes `rerun` 401, expected). |
| 1 | K images / PDF | enforce | 10-21 | images ✓ / **PDF untestable here** | Image upload (`flow-image.mjs`): token sent, stored + served (`/files/img/authcheck/px.avif`); anon `file_upload` → 401. PDF (`selectablePDF.js`): posts to a **hard-coded** `${API_HOST}/dama-admin/hazmit_dama/downloadpdf`, a route dms-server doesn't have (404 for anon and admin). Pre-existing, not this branch: PDF export only works where API_HOST is the old DaMa server. Owner: track separately? |
| 1 | L regression smoke | enforce | 10-21 | ✓ (view / edit load; no publish) | `flow-smoke.mjs` admin + anon: test pages `/p`, `/p-mny`, `/p-tny`, `/p-lb` `/flooding` render for both; `/p/edit/flooding`, `/list`, `/auth/manage/users`, `/auth/manage/groups`, `/data`, a source, an internal source, `/data/settings` load for admin with 0 page errors and 0 failing requests; anon → `/auth/login` on each of those. Only console error: existing React warning `placeHolder` → `placeholder` on the auth manage pages. The API on 3458 answers with no `<checkout>-sites` folder (site-hosting middleware). Page publish not exercised. |
| 1 | UI flows G1 / G2 / G5 | log | 10-21 | ✓ | viewer: CSV create → 200 (source 5), version on E1 → 200, internal upload + validate on I1 → 200; would-deny lines exactly: `pattern v6test/17 create-source`, `source test_dama/1 create-view,update-source`, 2× `…|26:data/4 edit-source-data,update-source` (upload routes were open before; DMS env). Admin CSV create: no would-deny line. |
| 1 | A, D (matrix) + G1 | legacy | 10-21 | ✓ | `matrix.mjs legacy A-` / `D-`: 48/48, same extra allows as log (I1, `setIndex` / `setPrimaryKey`), **0 would-deny lines**; viewer CSV create → 200. Cleanup: log/legacy sources 5–7 and viewer's E1 version deleted as admin. Noted: the image upload flow creates DaMa source 4 `v6test+authcheck|test_dama` (owner admin): odd name, pre-existing. |
| 1 | Postgres pass: setup | — | 10-21 | done | 3458's DMS db moved to the :5499 container, per-app: `copy-db.js --source cli-test --target dms-postgres-test --app v6test` (writes the **legacy** layout, `dms.data_items`; reports a harmless verification "MISMATCH" for the empty source tables), then `migrate-to-per-app.js --source dms-postgres-test --app v6test --apply` → `dms_v6test.data_items` (94 rows; old split-table data not carried, re-seeded by upload). Start: `DMS_DB=dms-postgres-test ./restart3458.sh enforce` (auth stays sqlite). |
| 3 | A–F matrix | enforce (PG) | 10-21 | ✓ 120/120 | `matrix.mjs enforce` with DMS on Postgres. |
| 3 | D Clear data | enforce (PG) | 10-21 | ✓ | I2 (101/102) re-seeded (3 rows in `dms_v6test.data_items__s101_v102_i2`); viewer / src_editor: button hidden; pat_editor: 3 → 0, **main table unchanged (94)**. |
| 3 | F, G1, G5 | enforce (PG) | 10-21 | ✓ | Same outcomes as on SQLite: pat_editor attach / remove Auto-number, src_editor read-only; G1 pat_editor 200 / src_editor 403 + message; G5 viewer 403 (I1 untouched) / src_editor adds `pg_x, pg_y`, `updated_at` moves. |
| 3 | J pattern admin | enforce (PG) | 10-21 | ✓ admin / **open (task 8)** | Admin duplicate of pattern 27 → task done, new pattern 132 `pages_pg_copy` with 4 pages + 11 components (matches the source; the sqlite task-descriptor bug doesn't apply on PG). Saved filter `county=36001` on 27 through the Filters panel, then sync-filters → task done, 4 pages scanned. pat_editor / viewer: `/list/manage_pattern/*` redirects to `/` (a 404 page), even pat_editor on pattern 17 where they hold `edit-pattern` (UX, task 8/10). **Server: `POST /dama-admin/dms/:appType/sync-filters` and `/duplicate` check no user at all** (no `requireLogin` on the mount, handlers only read `requestUserId`): anon queued sync-filters task 5. Task 8's scope. sync-filters / duplicate requests carry the token but no `?dms_pattern=`. |
| 1 | H (internal upload) | enforce | 10-21 | partial | Internal upload page REST calls (`gis-dataset/upload`, `dms/<env>|<view>:data/publish`) carry the JWT but **no `?dms_pattern=`**. Works (internal sources' patterns resolve server-side), but H expects the param on every call. |
| 3 | Postgres pass 2: setup | — | 10-22 | done | Same 10-21 copy (`dms_v6test.data_items`, 110 rows) on :5499; 3458 on current branch code: `DMS_DB=dms-postgres-test DATA_MODE=enforce ./restart3458.sh enforce` (auth stays sqlite). Pattern 27 given the page-pass grants. Left as found afterwards (110 rows, site list, test_dama sources 1–4, 8). |
| 3 | L smoke | enforce (PG) | 10-22 | ✓ | `flow-smoke.mjs` admin + anon: same landings as SQLite, 0 page errors / failing requests (only the known `placeHolder` warning). |
| 3 | A–F matrix | enforce / log (PG) | 10-22 | ✓ 120/120 both | log: 25 allowed only by today's rule = exactly 25 `[source-auth] would-deny` lines, all non-admins without the perm, plus the deliberate `E-settings-ext-nopattern` row (admin, no pattern ⇒ no app). |
| 3 | B/E page editor | enforce / log (PG) | 10-22 | ✓ | `flow-pageedit.mjs` per actor: same panes / landings as SQLite; every offered write 200. **On PG the editor sends whole-row sync saves** (every page key, also on open), all passed through the changed-keys rule (pat_editor's carries unchanged `sections`). `neg-pageedit.mjs` 12/12 (fixed: PG ids come back as strings; `rearm63.sh` now resets the footer too). log: UI flows 0 data-auth would-deny lines; refusals logged one each (8: anon's refused toggle lands in log, so viewer / versioner then send the stored value). |
| 3 | C internal version | enforce (PG) | 10-22 | ✓ | Add Version (admin) → view 143 + ref; src_editor rename refused (no grant on I2); Delete Version hidden for viewer / pat_editor; admin → `/sync/push` D with cascade: row and ref gone. |
| 3 | J pattern ops (task 8 gates) | enforce (PG) | 10-22 | ✓ | Admin UI duplicate → task done (7 pages, 13 components); sync-filters → done (7 scanned). `neg-patternops.mjs` 8/8: anon 401; viewer / pat_editor / src_editor / versioner 403 ("missing edit-pattern on pattern 27" / "…-permissions"); id 17 named for `pg` → 403 "not found". Granted (temporarily PatEditors edit-pattern + edit-pattern-permissions on 27, site create-pattern on admin row 3): pat_editor duplicate + sync-filters → 200, tasks done, `userId` 5 (token user). Grants reverted. Note: the server task copies pages only; the UI creates the pattern row. |
| 3 | H token cache | enforce | 10-22 | ✓ | `stale.mjs warm`: after a forced password change the warmed token is refused at once (`/graph` "Sign in", REST 401; was up to 5 min). `stale-group.mjs`: src_editor removed from SrcEditors → next E2 write refused; re-added → allowed. |
| 3 | G1 / G5 / D | enforce (PG) | 10-22 | ✓ | G1: pat_editor creates source 9 (owner 5), src_editor 403 + message. G5 on I1: viewer validate / publish 403, I1 unchanged; src_editor 200 (columns already there: unchanged). D on I2 (seeded 1 row): hidden for viewer / src_editor; pat_editor 1 → 0, main table unchanged. |
| 2 | Setup (rig rebuilt) | — | 10-23 | done | The 10-22 rig was gone, so it was rebuilt in the **repo** `scratchpad/srv3458/` (persists): `start.sh <mode>` copies the working-tree dms-server, configs `rig` (sqlite dms+auth) + `test_dama` (:5499 PostGIS, fresh), local files in `dms-server/files`. First-run Create Site (Dashboard) → site `main`, datasets pattern **4** at `/datasets`. Groups `Downloaders`, `Viewers`; users `downloader@` (id 2), `viewer@` (id 3), password `test123`. E1' = external GIS source **1** / view **1** (`fixture.geojson`, through the UI). Grant on source 1: `Downloaders` [manage-downloads, download-source] (Access UI). |
| 2 | K downloads: gates | enforce | 10-23 | ✓ | Version page (`flows/flow-downloads.mjs`): viewer sees no Create Download; downloader create-download → 200, task done, 4 zips under `test_dama/s_1/`, task user 2 (token); cache-pmtiles → 200 (worker then fails: no `tippecanoe` here; not the gate). Viewer over HTTP, skipping the UI: create / delete / cache-pmtiles → 403 ×3. |
| 2 | K downloads: signed link | enforce | 10-23 | ✓ | Source page Versions menu (`flows/flow-signed.mjs`): downloader → sign 200, file 200 with no auth, browser saves `…_CSV.zip` (288 bytes = on disk); viewer → sign 403, the card shows "You don't have permission to do this (requires download-source on source 1)."; anon → this pattern redirects to login. With `public: [download-source]` (set by `call.mjs`; the Access UI can't edit the `public` row): anon sign → 200, file is a valid zip (GPKG inside), `attachment`, `no-store`. Grant reverted. ⚠ `/files/test_dama/s_1/…` still serves the zip anonymously (local storage, open item). |
| 2 | K downloads: delete | enforce | 10-23 | ✓ | `flows/flow-deldl.mjs` as downloader → 200; all 4 files removed from storage; sign afterwards → 404 "no CSV download". Console `getData is not defined` = the known ExternalVersionControls bug (open bugs list). |
| 2 | M schedules: setup | — | 10-23 | done | Rig: `rig-datatypes.cjs` registers schedulable `rig_sched/run` (`start.sh` sets `DMS_EXTRA_DATATYPES`); source **2** `sched fixture` (type `transcom`, inserted on `test_dama`, grants copied from source 1); Vite 5197 restarted with `RIG_DATATYPES=1` (the 5197 config gives an app with no `src/data-types.js` entry a `transcom` type with Schedule / Runs). Temporary: `Downloaders` + update-source on source 1 (Access UI), reverted. |
| 2 | M schedules | enforce | 10-23 | ✓ | UI (`flows/flow-sched-live.mjs`, `sched-peek.mjs`): downloader (update-source) sees New schedule → create 200 (`created_by` 2 = token user), Run now 200 (task 10 done), Runs → Re-run 200 (task 11, `rerun_of` 10, `rerun_by` 2); every call carries the token + `dms_pattern=v6test/4`. viewer: no New schedule, no Re-run button. HTTP (`flows/neg-sched.mjs 1 10 2`): viewer create / patch / fire / rerun / delete → 403 "requires update-source on source 2", reads 200; anon → 401 on all 8 (writes and reads). |
| 2 | M schedules | log | 10-23 | ✓ | viewer's 5 writes → 200 with exactly 5 `would-deny source test_dama/2 … missing update-source` lines; anon writes still 401, anon reads 200 with 3 `would-deny read … not signed in` lines; downloader's whole UI flow → 0 lines. ⚠ as before, `log` lets the refused writes happen: viewer's DELETE removed schedule 1. Rig schedules deleted afterwards; rig back on `enforce`. |
| 2 | N plugin routes: setup | — | 10-23 | done | Rig: `rig-datatypes.cjs` also registers the real `hazard_loss_pipeline` plugin; Vite 5197's `rig-data-types` adds its pages for apps without an entry. Temporary: `Downloaders` + Create Source on datasets pattern 4 (Access tab), removed afterwards (`flows/flow-access-remove.mjs`). |
| 2 | N plugin routes | enforce | 10-23 | ✓ | UI (`flows/flow-plugin-create.mjs`): downloader → Create pipeline enabled, `POST …/hazard_loss_pipeline/create` with token + `dms_pattern=v6test/4` → 200, source 3 + 19 children owned by user 2 (token user), children copy the grants; viewer → button disabled, note "needs Create source on this datasets pattern". HTTP (`flows/neg-plugin.mjs 3`): viewer create → 403 "requires create-source on pattern v6test/4", run on 3 → 403 "requires create-view on source 3"; anon → 401 on create, run and an unknown write path (the mount gate); GET `/products` open for both. |
| 2 | N plugin routes | log | 10-23 | ✓ | viewer create → 200 with one `would-deny pattern … missing create-source` line (and the source was created, owner user 3: `log` lets refusals happen); anon create → one `would-deny route … not signed in` line from the gate, then 401 (hazard create needed a login before); anon unknown path → one gate line, 404. downloader's whole UI flow → 0 lines. The 60 test sources deleted; rig back on `enforce`. |
| 2 | O client gates: setup | — | 10-23 | done | Fixtures: DAMA source 2 (Downloaders: update-source, download-source, manage-downloads), internal source 6 (Downloaders + Update source through the Access UI, temporary; reset to no grants afterwards). Users viewer (no grants) / downloader / admin. Flows `flows/flow-gates.mjs`, `peek-access.mjs`, `neg-open.mjs`. |
| 2 | O client gates | enforce | 10-23 | ✓ | viewer: list shows no Add / Settings / Uploads; Create → no-access line; tabs DAMA `overview · table · schedule · runs`, internal `overview · table` (no Admin / Upload / Validate); `/admin` and `/upload` by URL → "No access" panel. downloader (update-source): Admin tab; DAMA Admin = Advanced Metadata, Rules, Add Version, Tasks (no Delete, no Access editor); internal = Advanced Metadata, Tasks (no Add Version: create-view), Upload + Validate tabs. admin: everything incl. Delete Source, Access editor, internal Add Version. |
| 2 | O lenient rule | enforce | 10-23 | ✓ | `neg-open.mjs 63 1` (schedule create = update-source): viewer on a no-grants source with no pattern named → 200; on the creator-only source 1 → 403; anon → 401 on both (the route requires a sign-in). Naming pattern 4 (which grants `v6test Admin`) makes the merged grants "set", so viewer → 403 there, as designed. Fixture source 63 deleted. |
| 2 | K downloads | log | 10-23 | ✓ | Viewer create-download / sign and anon sign → allowed, one would-deny line each (`missing manage-downloads` / `missing download-source`). Downloader + admin flows (sign, file, create, cache-pmtiles) → **0** would-deny lines. |

## Objective

DMS is moving from numeric **auth levels** (a group's `auth_level` 0–10 per project; the user's max across
their groups) to **named permissions** granted on pattern rows (`authPermissions`). The admin panel
([admin-granular-permissions.md](../completed/admin-granular-permissions.md)) and the datasets client already use
permissions. The auth server still decides by level, and almost no dataset route checks anything.

This doc is the hub. The work is split into the tasks below; each holds its own file:line inventory, changes
and tests. Re-surveyed 2026-10-19 (three read-only passes: dataset server routes, dataset client gates, auth
levels); the first survey was 2026-09-30.

## Headline findings (2026-10-19)

- Only 7 server dataset routes check a source permission. Everything else (uploads, publishes, downloads,
  schedules, plugin routes, `uda.sources.update`, view edits, index/PK DDL, clearData, settings) is open or
  login-only, and most take the owner's `user_id` from the request body.
- `isUserAuthedForSource` allows when the source row is missing, on any query error, and on every DMS internal
  env. No caller passes `patternId`, so pattern grants are never consulted server-side.
- `uda.sources.update` has no check and can rewrite `auth_permissions`; it and the other raw-SET writers take
  column names from the client.
- The datasets Admin/Version tabs gate most writes on `user.token`; DataWrapper row edits are ungated by user.
- The auth server has ~30 level checks (about 10 more than the first survey listed), two holes
  (`/group/project/adjust` checks only the new level; `/invite` and `/create/user` don't rank-check the target
  group) and one unguarded join (`/signup/assign/group`).
- `authLevel` has almost no client consumers: one dead mapeditor component and a default in `auth/context.js`.
  TransportNY (including the `npmrds.`/`tsmo.` subdomains) runs on dms-template and dms-server, so it isn't an
  external consumer. The only one left is a site that doesn't pass `AUTH_HOST` and falls back to avail-falcor.

## Tasks, in order

**0. Inventory (read-only)**
1. [permissions-inventory.md](../completed/permissions-inventory.md): level-≥5 groups per project, active dataset writers and
   their grants, which sites use avail-falcor, external `authLevel` consumers, editable page sections.
1b. [permissions-access-diff-audit.md](./permissions-access-diff-audit.md): auth level × source × operation, old
   rule vs new; losses expanded to the groups and users behind them, with a remediation plan. Reruns before each
   switch-over and before level removal.

**1. Datasets foundations**
2. [permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md): vocabulary
   (`create-source`, `create-view`, maybe `edit-source-data`); a source/pattern check that fails closed, reads
   pattern grants and DMS envs; Express middleware; user id from the token only.
3. [permissions-dama-admin-client-auth-headers.md](./permissions-dama-admin-client-auth-headers.md): every REST call
   sends `Authorization`. **Ship before any REST route enforces.**

**2. Datasets server enforcement** (each depends on 2; the REST ones also on 3)
4. [permissions-ds-uda-falcor-writes.md](./permissions-ds-uda-falcor-writes.md): `sources.update`, source/view sets,
   setIndex, setPrimaryKey, clearData, settings, DMS-env deletes; column whitelists.
5. [permissions-ds-upload-publish-routes.md](./permissions-ds-upload-publish-routes.md): gis/csv upload and publish,
   file_upload (dama and dms-admin), DMS publish/validate.
6. [permissions-ds-downloads-and-files.md](./permissions-ds-downloads-and-files.md): create/delete download,
   PM tiles, the public `/files` mount (decision).
7. [permissions-ds-schedules-and-tasks.md](./permissions-ds-schedules-and-tasks.md): schedules, fire, rerun, task
   status reads.
8. [permissions-ds-pattern-ops.md](./permissions-ds-pattern-ops.md): `duplicate`, `sync-filters`; the `req.user` bug.
9. [datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md)
   (dms-template `planning/shared/`): ~30 plugin routes in `data-types/`, default-deny mount.

**3. Datasets client and data writes**
10. [permissions-ds-client-gates.md](./permissions-ds-client-gates.md): ~35 `user.token` / `user.authed` / missing
    gates → the permission each action needs. Can land early (UI only) once the vocabulary is decided.
11. [permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md): who may edit source rows from
    a page section or the Table tab, client and `uda.data.*` (decision).
12. [permissions-ds-read-visibility.md](./permissions-ds-read-visibility.md): `view-source` on catalog, source, view,
    data and tile reads. **Last of the datasets tasks**; needs the page-section read decision.

**4. Auth server and client**
13. [permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md): which auth row
    governs a request, vocabulary, anti-escalation without ranks, transition mode ("permission **or** level").
14. [permissions-auth-users-and-signup.md](./permissions-auth-users-and-signup.md): users, requests, invites,
    membership, user delete, `isPublicGroup` replacement.
15. [permissions-auth-groups.md](./permissions-auth-groups.md): group CRUD and project membership; fix the
    `/group/project/adjust` hole.
16. [permissions-auth-platform-admin.md](./permissions-auth-platform-admin.md): `avail_auth` / `AVAIL` operations
    (projects, create user, force password, fake users, messages).
17. [permissions-auth-client-pages.md](./permissions-auth-client-pages.md): Users / Groups / Profile pages.

**5. Migration and removal**
18. [permissions-grant-migration.md](./permissions-grant-migration.md): dry-run/apply script granting today's
    access as permissions. Runs before anything flips to permission-only.
19. [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md): Phase 1 dead code (any time);
    Phase 2 level checks out; Phase 3 `authLevel` off the user object and schema once external consumers are gone.

Tracks 1–3 (datasets) and track 4 (auth) are independent and can run in parallel. Within datasets, 4–9 can run in
any order once 2 and 3 land.

## Design questions

Each is owned by the task in brackets; answer there.

1. **Where auth-server permissions live** and which auth row governs a request (multi-site apps, tenants).
   ✅ Decided 2026-10-24: the client sends `app` + auth pattern id. [13]
2. **Auth vocabulary.** ✅ 2026-10-24: `auth-users`, `auth-groups`, `view-as`; platform operations by `AVAIL`
   membership (owner chose `AVAIL` membership for task 16). [13, 16]
3. **Anti-escalation without ranks.** ✅ Decided 2026-10-24 (b): only `*` / `${app} Admin` may touch groups that hold `*`,
   `auth-groups` or `edit-pattern-permissions`. [13]
4. **Datasets vocabulary.** ✅ Decided 2026-10-20: `create-source` (pattern), `edit-source-data` (source rows),
   enforce `create-view`, pattern operations use `edit-pattern`. External sources inherit the grants of the
   client-named datasets pattern; rollout by `DMS_SOURCE_AUTH_MODE` (default `log`). [2]
5. **Migration.** One-time grants matching today's access, dry-run first; levels stay readable until every
   consumer has moved. [18]
6. **Strict or lenient checks.** ✅ **Decided 2026-10-23 (owner): lenient everywhere.** "Unless there is a permission
   set, it's open to anyone. It's great that the server now actually checks for permissions, but we don't want to
   reject a request because there are no permissions set." The server's strict datasets checks (sourceAuth, and the
   dms.data guard's source / site / dmsenv checks) move to the repo's lenient rule (`routes/dms/auth.js`
   `isUserAuthed`, the client's mirror): signed-in users pass when nothing beyond `public` is set; anon passes only
   when nothing at all is set, else needs an explicit `public` grant (owner: "as the lenient rule"). `${app} Admin`
   still passes. The dms.data guard keeps its 10-22 anon rule (explicit `public` grant). Routes that require a
   sign-in keep requiring it. A source with any grant set (new sources: creator `*`, `public: []`) stays private.
   Supersedes the 10-20 "strict" call. **Auth too** (owner 10-24): lenient, plus a warning to `${app} Admin` /
   `*` holders when an auth row sets no grants (task 13). [2, 10, 13]
7. **Public files.** `/files` is public and can't carry a header. [6]
8. **Row edits from page sections.** A source grant, the section's own `edit`, or a public-create split. [11]
9. **Sources read by public pages.** Does `view-page` imply reading the sources its sections bind? [12]

## Relation to other tasks

- [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md): defect A (route
  `reqPermissions` don't block) underlies the client `view-sources` gate; defects B/E (`dms.data.edit` / `create`
  unchecked) are the write path for DMS internal sources and for granting permissions at all. Task 15's escalation
  rule is moot until defect B is fixed.
- [auth-invite-link-and-reset-hardening.md](./auth-invite-link-and-reset-hardening.md): rewrites
  `signupAssignGroup` and invites; write its checks in task 14's transition form.
- [sync-per-user-permission-filtering.md](./sync-per-user-permission-filtering.md): sync returns internal sources
  and patterns to anyone; the read side of task 12.
- [auth-login-token-carries-password-hash.md](./auth-login-token-carries-password-hash.md): JWT contents; touches
  the same `jwt.js`.
- [route-auth-check-judges-placeholder-user.md](./route-auth-check-judges-placeholder-user.md): client gates run on
  the placeholder user while sign-in loads; affects task 10's gates.
- [external-source-editable-crud.md](./external-source-editable-crud.md): built `uda.data.*` (login-only); task 11.
- [admin-granular-permissions.md](../completed/admin-granular-permissions.md): the site/pattern vocabulary
  (`view-pattern-list`, `create-pattern`, `edit-pattern`, `auth-users`, `auth-groups`, `view-as`).

## Testing checklist (whole move)

- [ ] Transition: a level-10 user with no grants can still do everything they could before.
- [ ] A level-0 group granted `auth-users` can list and invite users; granted `auth-groups`, can manage non-`*`
  groups but can't add anyone to a `*` group.
- [ ] Datasets: a user without the matching permission gets 401/403 from every `/dama-admin/*`, plugin and `uda.*`
  write; with it, the operation succeeds, and the UI never shows a control that would 403.
- [ ] After the migration script: the access diff ([1b](./permissions-access-diff-audit.md)) shows zero unintended
  losses, and every intended loss is signed off.
- [ ] After removal: no code reads `authLevel` / `auth_level` except kept-for-compat paths.
