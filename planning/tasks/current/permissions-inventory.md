# Permissions move, step 0: inventory of who holds levels and grants today

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Read-only. Every other task
in the move uses its numbers; [permissions-access-diff-audit.md](./permissions-access-diff-audit.md) turns them into
the level × source loss check.

## Objective

Before any check moves from levels to permissions, or any dataset route starts enforcing, record who can do
what today, so each later task can show "nobody lost an operation".

## Steps

- [ ] **Auth DB (prod `dms3` auth DB and any `auth-sqlite` in use):** per project, every group with
  `groups_in_projects.auth_level ≥ 1`, its level, member count, and whether its name is `${project} Admin`.
  Also note groups that are in several projects at different levels, because the cross-project rank rules
  (`/users`, `/groups`, `checkGroupAuthority`, `/user/delete`) depend on them.
- [ ] **`avail_auth` / `AVAIL`:** who is in it. These are the platform superusers (projects, create user,
  force password, fake users, message all).
- [ ] **Auth server per site:** which deployed DMS sites pass `AUTH_HOST` (dms-server) and which use the library
  default `https://graph.availabs.org` (avail-falcor, `render/spa/dmsSiteFactory.jsx:41`). Sites on avail-falcor
  stay on levels until they move, because avail-falcor can't read DMS rows.
- [ ] **External `authLevel` consumers:** the TransportNY/NPMRDS app (`reqAuthLevel`, folder `editable`
  thresholds; see `planning/transportny/tasks/completed/auth-blank-pages-after-login.md`,
  `research/route-creation/findings.md:430`), anything reading `/login`/`/auth`'s `authLevel` and `meta[].authLevel`
  (`auth/handlers/auth.js:35-52`), and the CLI auth skill text. The JWT itself only holds
  `{email, password, project}`. `authLevel` is computed per request (`auth/jwt.js:58`).
- [ ] **Datasets grants, per pgEnv and DMS env** (external: `hazmit_dama` and `npmrds2`):
  - Sources with `auth_permissions` null/`{}`, and envs where the column is missing (these are open today
    because `isUserAuthedForSource` fails open, see
    [permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md)).
  - Every datasets pattern's `authPermissions`: who holds `update-source`, `create-view`, `delete-source`,
    `manage-downloads` at pattern level.
  - Who has actually uploaded, published, created downloads or scheduled in the last ~6 months
    (`data_manager.tasks`/`views` `user_id`, `schedules.created_by`). Those users must hold the matching
    permission before the dataset routes enforce. The 8 patterns / 5 apps listed in
    [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md) are the start.
- [ ] **Page sections that write source data:** count DataWrapper/Card sections with `allowEditInView`,
  `allowAdddNew` or `allowDelete` bound to DMS or `isEditable` sources, per site. Needed by
  [permissions-ds-section-data-writes.md](./permissions-ds-section-data-writes.md).
- [ ] Write the results to `scratchpad/permissions-inventory/` (data) and a summary in this doc.

## Done when

The summary below lists, per site: the auth server, the level-≥5 groups, the active dataset writers and the
grants they hold today. Each later task's blast-radius check can point at it.

## Summary

_(not started)_
