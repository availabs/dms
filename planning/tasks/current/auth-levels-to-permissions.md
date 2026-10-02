# Auth and datasets: replace auth levels with named permissions

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topics:** patterns/auth, patterns/datasets, dms-server (auth, dama)

## Objective

DMS is moving from numeric **auth levels** (a group's `auth_level` 0–10 per project, and the user's max
across their groups) to **named permissions** granted on pattern rows (`authPermissions`). The site
admin panel ([admin-granular-permissions.md](../completed/admin-granular-permissions.md)) and datasets sources
(pattern ⊕ source) already use permissions. The **auth server** still decides almost everything by
level, and the **dama admin endpoints** decide nothing at all.

This task plans the move for the auth and datasets areas, one slice at a time, without locking out
anyone who has access today. It's a planning doc first: the design questions below need answers
before any phase starts.

## Current state (surveyed 2026-09-30)

### Where levels are computed
- `dms-server/src/auth/jwt.js:58`: the token's `authLevel` = max `auth_level` over the user's groups in
  the login project. `meta` carries each group's level.
- `auth/utils/queries.js` `getUserAuthLevel(db, email, project)`: the same, computed per request by the
  handlers. `assignGroupToProject`, `ensureGroupInProject` and `adjustAuthLevel` write
  `groups_in_projects.auth_level`.
- Created by `initSetup`: `${project} Admin` at **10**, `${project} Public` at **0**. Groups created
  from the DMS Auth → Groups page are always **0** (`authGroups.jsx:105`).
- Some checks use the global project **`avail_auth`** instead of the current project (a platform
  superuser): `createUser`, `passwordForce`.

### Level thresholds in the auth server (every one)

| Handler | Operation | Needs |
|---|---|---|
| `auth.js` `signupAccept` | accept a signup request | ≥ 5, and ≥ the target group's level |
| `auth.js` `signupReject` / `deleteSignup` | reject / delete a request | ≥ 5 |
| `auth.js` `sendInvite` | invite a user | ≥ 5 |
| `auth.js` `passwordForce` | set another user's password | ≥ 10 on `avail_auth` |
| `auth.js` `createUser` | create a user | ≥ 10 on `avail_auth` |
| `auth.js` `signupAssignGroup` | self-signup / admin add-user | **nothing** (see [auth-invite-link-and-reset-hardening.md](./auth-invite-link-and-reset-hardening.md)) |
| `group.js` | create group; create+assign; assign to project; remove from project; adjust level; edit meta | ≥ 5, and ≥ the group's level (anti-escalation) |
| `user.js:115` | list users of a project | ≥ 10 |
| `user.js:203` | create fake users | ≥ 10 |
| `user.js` `assignToGroup`/`removeFromGroup` | membership | `checkGroupAuthority`: ≥ the group's level in every project it belongs to |
| `project.js` | list projects (10 → all, ≥ 1 → own); create/delete project | ≥ 10 |
| `message.js` | post to a group / to all | ≥ the group's level / ≥ the max level |

**The rank rule is load-bearing.** "You can't manage a group ranked above you" is what stops a level-5
manager from adding themselves to a level-10 Admin group. Any permission design has to keep an
equivalent rule.

### Client (DMS library)
- `mapeditor/SourceLayout.jsx:63`: `user?.authLevel >= 5` gates a UI block.
- `auth/context.js:6`: default `authLevel: -1`.
- `auth/pages/authGroups.jsx:105`: new groups at `auth_level: 0`.
- The `auth_level` **pattern** field is copied on duplicate (`editSite.jsx`, `settings.jsx`,
  `patternList.jsx`), but nothing reads it: a dead field.
- The Auth → Users / Groups pages call the level-gated endpoints above. So a user granted `auth-users`
  on the auth pattern (the permission that shows them the Users link) still gets **0 users** unless
  their group is level 10. Seen live 2026-09-30.
- Route `reqPermissions: ['auth-users'|'auth-groups']` don't block. That's defect A in
  [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md).

### Datasets
- **Reads and source edits are already permission-based.** `uda.route.js` checks `update-source` or
  `edit-source-permissions` on source edits (`:190`) and `update-source` on version create (`:554`),
  through `uda/sourceAuth.js` `isUserAuthedForSource` (pattern ⊕ source; a source with no grants
  inherits the pattern's). Decision 2026-09-30: this is also how read visibility works; see
  auth-permission-chain's "Decision".
- **The dama admin endpoints check nothing.** `dama/upload/index.js`: upload, gis and csv publish,
  validate, `dms/:appType/duplicate`, `sync-filters`, create- and delete-download, file upload, and
  task status. Their "guards" (`gisGuard`, `downloadGuard`) only check that GDAL is installed.
  `dama/tasks/schedule-routes.js` requires *some* logged-in user. Neither levels nor permissions.
- **The datasets client uses "logged in" in place of permissions:** `DatasetsList/index.jsx:394-419`
  shows Add/Settings/hidden buckets on `user?.authed`.
- **No permission exists for creating a source.** Source permissions apply to an existing source; a
  new one has no ACL yet.

### Other consumers of levels (outside this repo; inventory before removing anything)
- The legacy **avail-falcor** auth server has the same level model, and sites on the default
  `AUTH_HOST` (`graph.availabs.org`) use it.
- TransportNY's older app gates routes on `reqAuthLevel`
  (`planning/transportny/tasks/current/auth-blank-pages-after-login.md`).
- Anything reading the JWT's `authLevel`/`meta`. Keep both fields in the token until no consumer is
  left.

## Design questions (answer before Phase 1)

1. **Where do auth-server permissions live?** The auth server works per *project* (the app name) in the
   auth DB. Permissions live on the site's **auth pattern row** in the DMS DB. dms-server can read both,
   but:
   - An app can hold several sites or instances, and tenants each have their own auth row.
     Which row governs a project-level operation?
   - Proposal: the request names the site (`app` + auth pattern id, or the site type), and the server
     loads that auth row's `authPermissions`, resolved for the request's subdomain.
   - avail-falcor can't read DMS rows, so it either keeps levels or is retired for DMS sites.
2. **Vocabulary.** Proposal, reusing what the auth pattern already offers:
   - `auth-users`: list users, invite, add, reset or force a password for project users
   - `auth-groups`: create, edit and delete groups, and manage membership
   - `view-as`: impersonate
   - maybe `auth-requests` for signup requests, or fold it into `auth-users`
   - Platform-wide operations (projects, fake users, `avail_auth` superuser) → a platform admin group,
     or `*` on the platform root site's auth row.
3. **The anti-escalation rule without ranks.** Options:
   - (a) you may only put a user in a group whose grants are a subset of your own
   - (b) only `*` holders may manage groups that hold `*` or `auth-groups`
   - (c) keep `auth_level` purely as a rank for this one rule, and drop it everywhere else
   (b) is the simplest to reason about.
4. **Datasets: creating sources.** Add a pattern-level `create-source`, or reuse `update-source` at
   pattern level? Also which permission guards `duplicate` and `sync-filters`: these are
   *pattern* operations, so `edit-pattern`?
5. **Migration.** Existing level-5 and level-10 groups keep working how? Proposal: a one-time
   CLI/SQL pass that grants each level-≥5 group the equivalent permissions on its project's auth
   row (level 10 → `*`, 5 → `auth-users` + `auth-groups`). Dry-run first. Levels stay in the DB and
   the token (read-only) until every consumer has moved.

## Proposed phases

### Phase 0 — Inventory
- [ ] List level-≥1 groups per project from the auth DB (prod), with member counts.
- [ ] Inventory external consumers of `authLevel`/`reqAuthLevel`: TransportNY app, avail-falcor clients,
  anything decoding the JWT.
- [ ] Confirm which deployed DMS sites use avail-falcor vs dms-server for auth.

### Phase 1 — Datasets: close the unguarded dama endpoints (independent of the auth questions)
- [ ] Resolve the user in every `/dama-admin/*` mutating route (`req.availAuthContext.user`). Then
  require the relevant source permission through `isUserAuthedForSource`:
  - publish into an existing source → `update-source`
  - create/delete download → `manage-downloads`
  - delete → `delete-source`
  - new source → per question 4
  - `duplicate`, `sync-filters` → a pattern-level permission, per question 4
  - task status reads → the task's source visibility
- [ ] Replace `user?.authed` gates in `DatasetsList` with the matching permission checks
  (`DatasetsContext.isUserAuthed`).
- [ ] Blast radius: check the 8 datasets patterns listed in auth-permission-chain before shipping, so
  that current uploaders hold the permissions they'll now need. Where they don't, grant them with a
  script first.

### Phase 2 — Auth server: permissions alongside levels
- [ ] Load the auth row's permissions for the request (question 1). Accept **either** the level
  threshold **or** the new permission during the transition, so nobody loses access.
- [ ] Apply to every row of the threshold table, with the anti-escalation rule from question 3.
- [ ] Tests in `test-auth.js`: each operation passes by permission alone, passes by level alone
  (transition), and fails with neither.

### Phase 3 — Migrate grants
- [ ] The dry-run / apply script from question 5, in `src/themes/<project>/scripts/` or the dms CLI.
- [ ] Run it per site, and verify with the admin panel's Access tab on each auth row.

### Phase 4 — Remove level checks
- [ ] Drop the level branch from the handlers once Phase 3 has run everywhere and Phase 0 found no
  remaining consumers.
- [ ] Client: `SourceLayout.jsx` → a permission; remove the dead `auth_level` pattern-field copies;
  stop sending `auth_level: 0` from `authGroups.jsx` (or keep it as a rank if 3(c) is chosen).
- [ ] Keep `authLevel` in the JWT until external consumers are gone. Then remove it.

## Relation to other tasks

- [auth-invite-link-and-reset-hardening.md](./auth-invite-link-and-reset-hardening.md): its
  `signupAssignGroup` and `sendInvite` checks are written in levels (≥ 5). If they land first, write
  them in the Phase 2 "level or permission" form so they don't need redoing.
- [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md):
  defect A (route checks) and defect B (`dms.data.edit`) are the DMS-data half of the same move.
- [admin-granular-permissions.md](../completed/admin-granular-permissions.md): defines `auth-users`,
  `auth-groups`, `view-as` in the Access editor, and hides the Users/Groups links by them.

## Testing checklist

- [ ] Transition: a level-10 user with no permission grants can still do everything they could before.
- [ ] A level-0 group granted `auth-users` can list and invite users; granted `auth-groups`, it can
  manage non-`*` groups but can't add anyone to a `*` group (the anti-escalation rule).
- [ ] Datasets: a user without `update-source` gets 403 from gis/csv publish into that source; with it,
  the upload succeeds. The same for downloads (`manage-downloads`) and delete.
- [ ] Anonymous callers get 401 from every `/dama-admin/*` mutating route.
- [ ] After the migration script: the admin panel's Access tab on each auth row shows the granted
  permissions, and nobody lost an operation they had (compare against the Phase 0 inventory).
