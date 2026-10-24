# Auth server: read the site's auth-pattern grants, and an anti-escalation rule without ranks

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

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

## Owner decisions (2026-10-24)

1. **Row:** the client sends `app` + auth pattern id; the server checks the pattern is that app's and the app's auth
   project is the request's `project`, then resolves its grants for the subdomain (tenant → its own row). As proposed.
2. **Vocabulary:** `auth-users`, `auth-groups`, `view-as` as proposed (not asked separately; no objection).
3. **Anti-escalation: (b)** protected groups: only `*` holders or `${app} Admin` members may touch a group holding
   `*`, `auth-groups` or `edit-pattern-permissions`, or its members.
4. **Lenient, like everywhere else** (hub question 6). Owner: "auth is created with permissions. keep it lenient and
   warn app Admin and * permission holders if a page is open." New auth rows get `${app} Admin: ['*'], public: []`
   (`utils/tenantProvisioning.js` `createCorePatterns`), which already makes them restricted. Added: the
   Users / Groups pages (and the admin Auth menu) show `${app} Admin` members and `*` holders a warning when the auth row
   sets no grants, so any signed-in user can manage that project's users. The lenient rule is per **row**: any group
   other than `public`, or any user key, on the auth row closes every auth permission to non-holders.
   Before enforcing, list prod auth rows that set nothing (they'd be open to every signed-in user).

## Prod check: auth rows that set no grants (2026-10-24, read-only, DMS CLI on dmsserver.availabs.org)

Sites from `deploy/targets.json` + `.env` (the CLI can't list apps; other apps on dms3 not covered). No site row has
`tenants`. Under the lenient rule (`routes/dms/auth.js`, after `resolveAuthPermissions`):

| site (app / type) | auth row | authPermissions | result |
|---|---|---|---|
| npmrdsv5 / dev2 (TransportNY) | 1498261 | `*` → users 175 `*`; groups `AVAIL` `*`, `public` `view-page` | restricted |
| mitigat-ny-prod / prod | 1427078 | `*` → users 1 `*`; groups `AVAIL`, `DHSES` `*`, `public` []; plus a stray top-level `AVAIL` key inside the entry (ignored) | restricted |
| landbank / dev2 | 11 | groups `landbank Admin` `*`, `public` [] | restricted |
| **wcdb / prod** | 1471742 | `{"undefined Admin": ["*"]}`: no `groups` / `users` wrapper, so the rule sees nothing set; the group name is also `undefined` (`createSite.jsx` passes `PROJECT_NAME` as `adminGroupName`, which can be unset) | **open** |
| **avail / site** | 1449669 | none | **open** |

Lenient as decided, wcdb and avail would let any signed-in user of their projects use Users / Groups / view-as
(transition mode passes anyone anyway). Fix before enforcing: give those rows real grants (owner's call), and make
`createCorePatterns` never write `undefined Admin` (fall back to `app`).

## Prod change list for wcdb and avail

Moved to [permissions-grant-migration.md](./permissions-grant-migration.md), "Required: wcdb and avail auth rows"
(owner 2026-10-24: groups added once every task is done, so no level; before or at the release).

## Decisions as originally asked

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

**Built 2026-10-24, committed lib 5a192e40 / root b3716f8d (branch `permissions_move`, not pushed).** The foundation only: no handler uses it yet; tasks
14–16 move the handlers onto it.

- [x] `dms-server/src/auth/utils/permissions.js`: `createAuthGrants({ loadPatternRows, ttlMs = 30s })` →
  `loadAuthGrants({ app, authPatternId, project, subdomain })` (row must be a `pattern_type: 'auth'` row of `app`,
  `project` must be `app`; else `{ error }` and the level decides); `can(user, perm, scope)` (lenient rule from
  `routes/dms/auth.js` + `${app} Admin`); `canOrLevel(user, perm, minLevel, scope, authLevel)` (transition mode);
  `isProtectedGroup` / `canManageGroup` (decision (b): a group holding `*`, `auth-groups` or
  `edit-pattern-permissions` on the auth row **or the site's admin row**, and `${app} Admin` itself; only
  `${app} Admin` and **explicit** `*` holders may touch it, so an open row doesn't make everyone a `*` holder);
  `authScope(authDb, userData, body, ctx)` → `{ user, authLevel, scope }` for handlers.
- [x] Handlers get the DMS side: `auth/index.js` calls `handler(authDb, body, ctx)`, `ctx = { subdomain, authGrants }`
  (subdomain from Origin, `utils/subdomain.js`). The DMS controller is created lazily on first lookup.
- [x] Client: `patterns/auth/api.js` `setAuthRequestScope` + both `callAuthServer`s add `app` + `authPatternId`
  to every body (a body's own keys win). Set by both auth route configs (`auth/siteConfig.jsx`).
  `patterns/auth/utils.js` has its own unused `callAuthServer`: left alone.
- [x] Open-auth warning: `patterns/auth/components/OpenAuthWarning.jsx` (+ `.theme.js`, keys `openAuthWarning` /
  `openAuthWarningLink` in the auth `defaultTheme` manage section) above Users and Groups, for `${app} Admin` and
  explicit `*` holders, when the auth row grants nothing (judged as the gate judges it); links to the Auth
  pattern's Access tab (`<adminPath>/manage_pattern/<id>/permissions`).
- [x] `undefined Admin` fix: `utils/tenantProvisioning.js` `adminGroupKey` (falls back to `app`, throws with
  neither); `createSite.jsx` grants `${app} Admin`, the group `/init/setup` creates (it passed `PROJECT_NAME`,
  so a site whose PROJECT_NAME isn't its app granted a group nobody is in). wcdb's row came from create-site
  code before e429e5a9 (2026-05-21), which also lacked the `groups` wrapper; current code can't write it.
- [x] Tests: `tests/test-auth-permissions.js` 21/21 (row resolution incl. tampered id / non-auth pattern / project
  mismatch / subdomain format / old wcdb shape / cache; lenient `can`; transition; protected groups incl. open
  row; `authScope`). `test-auth.js` 104/104 (from a scratch copy with sqlite-only configs). `npm run build` ✓.
- [x] Live (rig 3458 log + Vite 5197, 2026-10-24, `srv3458/flows/flow-authscope.mjs`, `peek-openwarn.mjs`): every
  auth call (`/auth`, `/users/byProject`, `/groups/byproject`, `/requests/byProject`) sends `app=v6test
  authPatternId=2`. Restricted row: admin no warning, viewer redirected home. Auth row 2 emptied temporarily: admin
  sees the warning on both pages (link → `/list/manage_pattern/2/permissions`), viewer opens both pages with no
  warning. Server lookup on the rig DB (`grants-live.js`): open / restricted as set, datasets pattern 4 refused as
  "not an auth pattern", project mismatch refused. Row restored (verified).
- For tasks 14–16: some routes name the project differently (`/requests/byProject` sends `project_name`); pass
  it to `authScope` as `project`, or the project check can't match.

## Testing checklist

- [ ] Tests above, on sqlite and Postgres auth DBs.
- [ ] A tampered `authPatternId` from another app is refused.
