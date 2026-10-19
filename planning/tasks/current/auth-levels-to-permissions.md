# Auth and datasets: replace auth levels with named permissions (hub)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

**Project:** DMS library (`src/dms` submodule), plus one shared task in `dms-template/planning/shared/` for
`data-types/` · **Topics:** patterns/auth, patterns/datasets, dms-server (auth, dama, uda)

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
  External: the TransportNY/NPMRDS app (`reqAuthLevel`) and sites on avail-falcor (library default `AUTH_HOST`).

## Tasks, in order

**0. Inventory (read-only)**
1. [permissions-inventory.md](./permissions-inventory.md): level-≥5 groups per project, active dataset writers and
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
4. **Datasets vocabulary.** Recommendation: new pattern-level `create-source`; enforce the existing `create-view`;
   pattern operations use `edit-pattern`. [2]
5. **Migration.** One-time grants matching today's access, dry-run first; levels stay readable until every
   consumer has moved. [18]
6. **Strict or lenient checks.** The client is lenient ("nothing configured → any logged-in user"), the server
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
