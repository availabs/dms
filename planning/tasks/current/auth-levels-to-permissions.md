# Auth and datasets: replace auth levels with named permissions (hub)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** doing · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

**Project:** DMS library (`src/dms` submodule), plus one shared task in `dms-template/planning/shared/` for
`data-types/` · **Topics:** patterns/auth, patterns/datasets, dms-server (auth, dama, uda)

## ▶ Resume here (updated 2026-10-21, after task 5)

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
| 1 | — | — | — | not started | — |

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
   Proposal: the client sends `app` + auth pattern id. [13]
2. **Auth vocabulary.** Proposal: `auth-users`, `auth-groups`, `view-as`; platform operations by `AVAIL`
   membership. [13, 16]
3. **Anti-escalation without ranks.** Recommendation: only `*` / `${app} Admin` may touch groups that hold `*`,
   `auth-groups` or `edit-pattern-permissions`. [13]
4. **Datasets vocabulary.** ✅ Decided 2026-10-20: `create-source` (pattern), `edit-source-data` (source rows),
   enforce `create-view`, pattern operations use `edit-pattern`. External sources inherit the grants of the
   client-named datasets pattern; rollout by `DMS_SOURCE_AUTH_MODE` (default `log`). [2]
5. **Migration.** One-time grants matching today's access, dry-run first; levels stay readable until every
   consumer has moved. [18]
6. **Strict or lenient checks.** Datasets server: strict (decided 2026-10-20, [2]); the client aligns in [10]. The client is lenient ("nothing configured → any logged-in user"), the server
   source check is strict. Pick one per area and make both sides match. [2, 13]
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
