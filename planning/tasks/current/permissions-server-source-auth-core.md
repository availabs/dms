# Datasets permissions core: a source check that fails closed, sees the pattern, and knows who is asking

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). **Every datasets server task
depends on this one.** Server only, plus the vocabulary constants on the client.

## Objective

One server helper that every dataset route calls to decide "may this user do X to this source / this
datasets pattern". Today's `isUserAuthedForSource` lets most requests through without checking anything, and
there's no permission for creating a source at all.

## Decisions (owner, 2026-10-20)

1. **Vocabulary:** new pattern-level `create-source`; new source-level `edit-source-data` (row
   create/edit/delete, separate from `update-source` = metadata); `create-view` enforced as is; pattern
   operations use `edit-pattern` (+ `create-pattern` for duplicate). Who *gets* `edit-source-data` is
   still [permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md)'s decision.
2. **External sources: trust the client-named pattern.** Nothing in the db links a pgEnv to a pattern
   (pgEnvs are the client build setting `VITE_DMS_PG_ENVS`; every datasets pattern of the app sees all
   of them). The request names its pattern (query `dms_pattern=<app>/<patternId>`, or the
   `X-DMS-Pattern` header; not the body, since sync-filters' body already has an unrelated `patternId`;
   changed 2026-10-20 in task 3); the server only checks it is an existing **datasets** pattern of that app.
   ⚠ Accepted risk: anyone holding a grant (or `${app} Admin`) on *any* datasets pattern — e.g. their
   own tenant site — can name it and inherit its grants on any external source. Alternatives that were
   offered: a per-pgEnv allowlist of apps in the server config; source grants only.
3. **Rollout:** `DMS_SOURCE_AUTH_MODE = legacy | log | enforce`, default **`log`**: today's rule decides,
   and every request the strict rule would deny is logged (`[source-auth] would-deny …`). Feeds
   [permissions-access-diff-audit.md](./permissions-access-diff-audit.md) and the grant migration;
   flip a server to `enforce` after the migration. (Replaces the `DMS_SOURCE_AUTH_LEGACY_OPEN` idea.)
4. **Strict on the server for writes** (no "unconfigured ⇒ logged-in may"). The client stays lenient
   until [permissions-ds-client-gates.md](./permissions-ds-client-gates.md) aligns it.

## Built (2026-10-20, committed 8bed976f; query-param pattern ref 42b79799)

`dms-server/src/routes/uda/sourceAuth.js` rewritten:
- `decideSource({ db, env, sourceId, patternRef, subdomain, reqPermissions, user })` — strict, fails
  closed (missing row, missing column, query error → deny with a reason).
  - **Internal (`app+instance`) sources:** reads `data->>'auth_permissions'` on the source row in the
    DMS db; the pattern grants are the env's own pattern(s) (`getSitePatterns`, the same lookup the
    sources list uses), counted **only if the source is one of theirs** (`getSiteSources`; dmsEnv-linked
    and legacy sources-on-pattern both work). Several patterns on one env → union of their grants.
  - **External sources:** the source's own grants on the pgEnv db, plus the client-named datasets
    pattern's grants (read from the DMS db). An unusable pattern name loses only the pattern grants.
  - `${app} Admin` (the pattern's app) passes everything, matching `isAppAdmin`.
- `decidePattern({ patternRef, reqPermissions, user })` for `create-source` / `edit-pattern`.
- `isUserAuthedForSource` / `isUserAuthedForPattern` apply the mode. `legacyAllows` is today's rule
  exactly (DMS env, missing row or query error → allow; a found external source → its own grants),
  so `log` changes no outcome. Pattern checks never existed, so `legacy`/`log` allow them.
- `requestUserId(req)` (token only), `requestUserIdWarnBody(req)` (logs a disagreeing body
  `user_id`), `requestPatternRef(req)`.
- Express helpers `requireUser`, `requireSourcePermission(req, res, sourceId, perms, {env})`,
  `requirePatternPermission(req, res, perms)` live here now; `index.js` passes them (plus
  `requestUserId`) to plugins instead of its inline copies. `requireSourcePermission`'s old signature is
  unchanged, so hazard_loss_pipeline keeps working.
- **sqlite finding:** `data->'authPermissions'` returns JSON *text* on sqlite, so a flat grant stored as a
  JSON string came back double-encoded and granted nothing. The readers use `->>`, which returns the
  same text on both databases.

Callers: `uda.route.js` (sources.set, set/clearAuthoritativeView, views.create) and
`uda.tasks.route.js` `deleteAuthorizer` now pass `env`. DMS-env deletes go through the check too (still
sign-in only under `legacy`/`log`). `dms-duplicate.js` and `pattern-filter-sync.js` read
`requestUserId(req)` instead of the never-set `req.user`.

Vocabulary: `create-source` and `edit-source-data` added to `utils/adminPermissions.js` `DATASETS_OPTIONS`;
`edit-source-data` added to `datasets.format.js` `permissionDomain`.

Docs: `dms-server/src/dama/CLAUDE.md` helper table, `data-types/CLAUDE.md` "Auth on plugin routes".

Tests: `tests/test-source-auth.js` (`npm run test:source-auth`; local sqlite `cli-test` +
`dama-sqlite-test` by default, Postgres via `DMS_TEST_DB=dms-postgres-test DAMA_TEST_DB=dama-postgres-test`):
48 pass on both. Covers inheritance, source `[]` revoke, out-of-env source, missing row,
query error, non-source id, named pattern (valid, wrong type, wrong app), `${app} Admin`, all three
modes, token-only user id. `test-uda` (141) and `test-datatypes` (9) still pass.

## Left for other tasks (deliberately not done here)

- **Callers sending the pattern:** the library's REST calls send `?dms_pattern=` since
  [permissions-dama-admin-client-auth-headers.md](./permissions-dama-admin-client-auth-headers.md) (2026-10-20).
  Falcor `uda.*` calls still don't; they get it as an argument in
  [permissions-ds-uda-falcor-writes.md](./permissions-ds-uda-falcor-writes.md). Until then, those calls get no
  pattern grants on external sources under the strict rule, and `log` reports it.
- **New-source grants from the token user / no user → no create:** `createDamaSource` takes `user_id`
  from its callers, which read the body. Switching them to `requestUserId` is route work in
  [permissions-ds-upload-publish-routes.md](./permissions-ds-upload-publish-routes.md).
- Plugin routes adopting `requirePatternPermission('create-source')`:
  [datatype-plugin-route-permissions.md](../../../../../planning/shared/tasks/current/datatype-plugin-route-permissions.md).

## Current state (read 2026-10-19)

`dms-server/src/routes/uda/sourceAuth.js`:
- **Allows without checking:** `getSourceAuthPermissions` (`:61-79`) returns `undefined` when the row doesn't
  exist **or the query throws for any reason**, and `isUserAuthedForSource` (`:100-105`) returns `true` on
  `undefined`, even for a null user.
- **DMS (`app+type`) envs are never checked:** their db has no `data_manager.sources`/`sources` table, so the
  query throws and the check allows. Internal sources keep `auth_permissions` on the `data_items` source row
  (`datasets.format.js:42-58`), which this code never reads.
- **The pattern half never runs:** no caller passes `patternId` (`grep patternId` finds only the definition).
  When it is passed, it queries `dms.data_items` **on the pgEnv db**, not the DMS db.
- **Strict vs lenient drift:** the server source check is strict (no "nothing configured → logged-in may" rule,
  `:40-55`); the client `utils/auth.js:64-86` is lenient; `routes/dms/auth.js:43-79` is lenient. None has the
  `${app} Admin` bypass that `utils/adminPermissions.js:116` `isAppAdmin` gives the admin UI.
- **Who is asking:** `req.availAuthContext.user` is set by `auth/jwt.js:93-123` and never rejects. Routes read
  the user id from the **request body** (`user_id`) in most upload/publish/download routes, so it can be
  forged. `dama/upload/dms-duplicate.js:129` and `dms/tasks/pattern-filter-sync/pattern-filter-sync.js:308`
  read `req.user`, which is never set, so `userId` is always null.
- **Express helpers** `requireUser` / `requireSourcePermission` (`dms-server/src/index.js:280-296`) exist for
  plugins. They pass no `patternId`.
- **New-source grants** (`dama/upload/metadata.js:105-112`): `{users:{[user_id]:['*']}, groups:{public:[]}}`, with
  `user_id` from the body. With no `user_id`, nobody owns the source.

## Proposed changes

- [x] **Decide the vocabulary (hub question 4).** Decided 2026-10-20, see Decisions. Recommendation:
  - `create-source` (pattern level): create a new source in this datasets pattern (upload/publish without
    `source_id`, `CreatePage`, file_upload, plugin create).
  - `create-view` (source level, already in the catalog, enforced nowhere but hazard_loss_pipeline): add a
    version to an existing source.
  - `edit-source-data` (source level, new): row create/edit/delete on an editable source, from the datasets
    Table tab or a page section. Or reuse `update-source`. Decide with
    [permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md).
  - Pattern-level operations (`duplicate`, `sync-filters`, `uda[env].settings` set) use the existing
    `edit-pattern` (+ `create-pattern` for duplicate, as the admin UI already requires).
  - Add the new names to `utils/adminPermissions.js` `DATASETS_OPTIONS` (`:77-90`) and, for source-level ones,
    `datasets.format.js` `permissionDomain` (`:42-58`).
- [x] **One resolver module, server side** (built; the external pattern link is client-named, see Decisions 2), `routes/uda/sourceAuth.js` (or `auth/permissions.js`):
  - `isUserAuthedForSource({ env, sourceId, reqPermissions, user, subdomain })`:
    - resolves the source's datasets pattern itself (the pgEnv/dmsEnv → pattern link the client uses), and
      reads pattern grants from the **DMS db**, not the pgEnv db;
    - for DMS envs, reads `auth_permissions` from the internal source row in `data_items`;
    - **fails closed:** missing row → deny; query error → deny + log; un-migrated column → decide (keep open
      behind an explicit env flag `DMS_SOURCE_AUTH_LEGACY_OPEN=1` for the transition, default closed once
      [permissions-grant-migration.md](./permissions-grant-migration.md) has run).
  - `isUserAuthedForPattern({ app, patternId | pgEnv, reqPermissions, user, subdomain })` for pattern-level
    permissions (`create-source`, `edit-pattern`).
  - `${app} Admin` group and `*` pass everything, matching `isAppAdmin`.
  - Pick strict or lenient once and document it; the client mirror (`utils/auth.js`) and the server must agree.
    Recommendation: strict for writes (no "unconfigured → any logged-in user").
- [x] **Express middleware** (helpers, not `app.use` middleware; `dama/upload/*` and schedules adopt them in tasks 5 and 7) `requireUser`, `requireSourcePermission(perms, { sourceFrom })`,
  `requirePatternPermission(perms)` in one place, used by `dama/upload/*`, `dama/tasks/schedule-routes.js` and
  `dama/datatypes/index.js` (plugins). Respond 401 for no user, 403 for no permission, as JSON.
- [x] **User identity from the token only:** helper built and the two `req.user` reads fixed; body `user_id` callers move in task 5. helper `requestUserId(req)` = `req.availAuthContext.user?.id`. Body
  `user_id` is ignored (log a warning when it disagrees during the transition). Fix the two `req.user` reads.
- [ ] **New-source grants** use the token user (moved to task 5, see above). A request without a user can't create a source.
- [x] Tests in `tests/` (extended `test-source-auth.js`): missing row denies, query error denies, DMS env checks the
  internal row, pattern grant is inherited, source `[]` removes it, `${app} Admin` passes, body `user_id` is ignored.

## Files

- `dms-server/src/routes/uda/sourceAuth.js`, `dms-server/src/index.js:280-296`, `dama/upload/metadata.js`,
  `dama/upload/dms-duplicate.js:129`, `dms/tasks/pattern-filter-sync/pattern-filter-sync.js:308`
- `dms/src/utils/adminPermissions.js`, `dms/src/patterns/datasets/datasets.format.js`
- Mirror, don't import: dms-server keeps its own copy of the merge/check logic with a cross-reference comment.

## Testing checklist

- [x] Unit tests above (48 pass on local sqlite).
- [x] Postgres (2026-10-20, owner's `dms-test-postgres` container on :5499, configs `dms-postgres-test` +
  a local-only `dama-postgres-test` (gitignored on purpose: role dama configs are auto-polled at server start; create it for the run, delete after — same fields as `dms-postgres-test` with `"role": "dama"`)): `test-source-auth` 48/48 with no query errors (denials carry their real
  reasons, not a swallowed error), `test-uda` 142/142, `test-datatypes` 9/9 (that suite doesn't exit on
  Postgres after passing — an open pool, pre-existing).
- [ ] Deploy with the default `log` mode and read the `[source-auth] would-deny` lines for a few days
  before any `enforce`.
- [ ] Existing callers (`uda.route.js:190`, `:554`, `:596`, `:625`, `:661`; `dama/delete.js:230,245`;
  hazard_loss_pipeline) still pass for users who hold the grant, and are denied for users who don't, on a
  scratch sqlite server and a Postgres pgEnv.
