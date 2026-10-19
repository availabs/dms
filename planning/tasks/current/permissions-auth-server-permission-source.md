# Auth server: read the site's auth-pattern grants, and an anti-escalation rule without ranks

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:decision · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub; design questions 1–3). **Every
auth-handler task depends on this one.** Server only.

## Objective

The auth handlers (`dms-server/src/auth/handlers/*`) work on the auth DB and know only `groups_in_projects.auth_level`.
The permissions that should govern them (`auth-users`, `auth-groups`, `view-as`) live on the site's **auth pattern
row** in the DMS DB, and the server never reads them (the admin UI shows the Users link by `auth-users`, then the
server returns 0 users unless the caller's group is level 10).

## Current state

- Routes are registered at the server root before the JWT middleware (`dms-server/src/index.js:123`); each handler
  verifies the body `token` itself (`auth/handlers/auth.js:24`). All POST, errors as `{error}` with HTTP 200.
- Level = MAX over the caller's groups in the request's `project` (`auth/utils/queries.js:46-55`).
- The request names a `project` (the auth project name: tenant subdomain on multi-tenant sites, else `PROJECT_NAME`,
  else `dmsConfig.app`; `render/spa/dmsSiteFactory.jsx:54`). It does not name a site or an auth pattern.
- Client resolution for comparison: auth pattern = first `pattern_type==='auth'` row (`render/spa/utils/index.js:253`);
  admin grants fall back to the auth row's (`:284-298`); `${app} Admin` passes everything (`utils/adminPermissions.js:116`).

## Decisions needed

1. **Which row governs a request.** Proposal: the client sends `app` + auth pattern id (it already has both);
   the server checks that the pattern belongs to that app and that the app's auth project is the request's
   `project`, then resolves its `authPermissions` for the request's subdomain (`routes/dms/auth.js:21`).
   Multi-tenant: the tenant's own auth row.
2. **Vocabulary.** Proposal: `auth-users` (list, invite, add, remove, reset/force password for project users;
   signup requests), `auth-groups` (create, edit, delete groups; membership), `view-as`. Split `auth-requests` out
   only if someone needs it. Platform-wide operations: [permissions-auth-platform-admin.md](./permissions-auth-platform-admin.md).
3. **Anti-escalation without ranks.** Today "you can't manage a group ranked above you" (≥ the group's level)
   stops a level-5 manager adding themselves to Admin. Options:
   - (a) you may put a user in a group only if that group's grants ⊆ yours
   - (b) only `*` holders (or `${app} Admin` members) may touch a group that holds `*`, `auth-groups` or
     `edit-pattern-permissions`, or its members
   - (c) keep `auth_level` as a pure rank for this one rule
   Recommendation: (b). Grants are per pattern, so (a) means comparing across every pattern in the site; (b)
   needs one lookup and is easy to explain.
4. **Strict or lenient** for auth operations. Recommendation: strict (no "unconfigured → any logged-in user").
5. **avail-falcor** sites (library default `AUTH_HOST`) can't do any of this. They keep levels until they move.

## Proposed changes (after the decisions)

- [ ] `auth/utils/permissions.js`: `loadAuthGrants(dmsDb, { app, authPatternId, subdomain })` with a short cache,
  and `can(user, perm)` / `canManageGroup(user, groupName)` implementing the rule in 3. Mirror the client's merge
  and `${app} Admin` logic with a cross-reference comment.
- [ ] The auth handlers get the DMS db handle (today they get only the auth db).
- [ ] **Transition mode:** `canOrLevel(user, perm, minLevel)` passes on **either** the permission or today's level
  threshold, so nobody loses access before [permissions-grant-migration.md](./permissions-grant-migration.md) runs.
- [ ] Client `patterns/auth/api.js` sends `app` + auth pattern id on every call.
- [ ] Tests (`tests/test-auth-permissions.js`): grant resolution, tenant row, the escalation rule, transition mode.

## Testing checklist

- [ ] Tests above, on sqlite and Postgres auth DBs.
- [ ] A tampered `authPatternId` from another app is refused.
