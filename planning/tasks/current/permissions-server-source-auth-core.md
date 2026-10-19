# Datasets permissions core: a source check that fails closed, sees the pattern, and knows who is asking

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). **Every datasets server task
depends on this one.** Server only, plus the vocabulary constants on the client.

## Objective

One server helper that every dataset route calls to decide "may this user do X to this source / this
datasets pattern". Today's `isUserAuthedForSource` lets most requests through without checking anything, and
there's no permission for creating a source at all.

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

- [ ] **Decide the vocabulary (hub question 4).** Recommendation:
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
- [ ] **One resolver module, server side**, `routes/uda/sourceAuth.js` (or `auth/permissions.js`):
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
- [ ] **Express middleware** `requireUser`, `requireSourcePermission(perms, { sourceFrom })`,
  `requirePatternPermission(perms)` in one place, used by `dama/upload/*`, `dama/tasks/schedule-routes.js` and
  `dama/datatypes/index.js` (plugins). Respond 401 for no user, 403 for no permission, as JSON.
- [ ] **User identity from the token only:** helper `requestUserId(req)` = `req.availAuthContext.user?.id`. Body
  `user_id` is ignored (log a warning when it disagrees during the transition). Fix the two `req.user` reads.
- [ ] **New-source grants** use the token user. A request without a user can't create a source.
- [ ] Tests in `tests/` (new `test-source-auth.js`): missing row denies, query error denies, DMS env checks the
  internal row, pattern grant is inherited, source `[]` removes it, `${app} Admin` passes, body `user_id` is ignored.

## Files

- `dms-server/src/routes/uda/sourceAuth.js`, `dms-server/src/index.js:280-296`, `dama/upload/metadata.js`,
  `dama/upload/dms-duplicate.js:129`, `dms/tasks/pattern-filter-sync/pattern-filter-sync.js:308`
- `dms/src/utils/adminPermissions.js`, `dms/src/patterns/datasets/datasets.format.js`
- Mirror, don't import: dms-server keeps its own copy of the merge/check logic with a cross-reference comment.

## Testing checklist

- [ ] Unit tests above.
- [ ] Existing callers (`uda.route.js:190`, `:554`, `:596`, `:625`, `:661`; `dama/delete.js:230,245`;
  hazard_loss_pipeline) still pass for users who hold the grant, and are denied for users who don't, on a
  scratch sqlite server and a Postgres pgEnv.
