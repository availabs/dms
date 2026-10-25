# Auth server: users, signup requests and invites by permission (`auth-users`)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md). Coordinate with
[auth-invite-link-and-reset-hardening.md](./auth-invite-link-and-reset-hardening.md), which rewrites
`signupAssignGroup` and the invite flow: write its checks in this task's "permission or level" form.

## Objective

Move every user- and signup-related level check to `auth-users` (plus the escalation rule for anything that puts
someone in a group), first alongside the level, then alone.

## Decisions (owner, 2026-10-25)

1. **"Public" group = only `${project} Public`.** `/signup/request` `addToGroup` and `/signup/request/verify`
   accept that group alone; `isPublicGroup` (level 0 everywhere) goes. No caller in these repos sends `addToGroup`.
2. **Users page: members of groups the caller can't manage are shown read-only.** The server decides: `/users/byProject`
   marks each user `manageable` (the caller can manage every group the user is in); the client only renders it.
   Every write re-checks on the server. The ui Table gets a general per-cell edit predicate
   (`canEdit({ row, attribute })`), meant for reuse by row-level auth on internal tables and external sources later.
3. **`/user/group/assign` / `remove` take `auth-users` only** (plus `canManageGroup`); `auth-groups` stays group CRUD
   and project membership (task 15).
4. **`/signup/assign/group` is closed here**: anonymous calls need a password and land only in `${project} Public`;
   with a token, `auth-users` (or level ≥ 5) + the target group manageable. The invite-link redesign stays in the
   hardening task.

Built alongside (no owner call needed, conservative): the permission path also requires the caller to belong to the
project (a token from another project can't use an open auth row), and a group counts as manageable from a site's auth row
only if it is linked to that project. **Only the calling site's grants count** (owner 2026-10-25): a group shared with
other projects is judged by this site's grants and protected-group rule alone. `/user/delete` removes the whole account, so
from a site it needs every group the target is in to be linked to that site (a user who is also in a group of a project
this site isn't part of can't be deleted from here; that stays on the level path, then task 16; owner to confirm). `/users/preferences`: own always, others
need `auth-users` (target in the project) or the old rank rule.

5. **A site removes, it doesn't delete** (owner 2026-10-25). New `/user/project/remove` ("Remove from site" on the Users
   page): strips the user's own grants from every row of the site (patterns, pages, internal sources), then removes
   them from every group linked to the project, **shared groups included, with a warning** naming the other projects
   that lose that group's access. **External-source grants are listed, not stripped** (the server can't verify a
   site's pgEnvs: a client build setting; other sites may use the sources). The account stays; `/user/delete` stays
   for platform / level use (task 16).
6. **Group lists show only the project's groups.** Adding an external (another project's) group to a site is a
   future feature with its own button (tasks 15 / 17), not mixed into the same list.

## Checks to move (`dms-server/src/auth/handlers/`)

| file:line | route | today | becomes |
|---|---|---|---|
| `auth.js:117-120`, `:195` | `/signup/request` (+ `addToGroup`), `/signup/request/verify` | target group must be "public" = `isPublicGroup` (level 0 in every project, `queries.js:323-334`) | "public" needs a non-level definition: a group flag (`meta.selfSignup`), or "holds no grant beyond `public`'s". Decide |
| `auth.js:222-235` | `/signup/accept` | ≥5 and ≥ the target group's level | `auth-users` + `canManageGroup(target)` |
| `auth.js:266-271`, `:279-284` | `/signup/reject`, `/signup/delete` | ≥5 | `auth-users` |
| `auth.js:300-304` | `/invite` | ≥5; target group's rank **not checked** | `auth-users` + `canManageGroup(target)` (closes the gap) |
| `auth.js:503-515`, `:518-531` | `/requests`, `/requests/byProject` | SQL `auth_level >= 5` (`:510`, `:525`) | `auth-users`, filtered in code |
| `auth.js:534-566` | `/signup/assign/group` | **nothing**; can join any group incl. Admin | per the hardening task; at minimum `auth-users` + `canManageGroup` when not self-signup into a public group |
| `user.js:11-70`, `:73-108` | `/users`, `/users/bygroup` | visibility: caller ≥ every level the target has, across projects | `auth-users` sees the project's users; members of groups the caller can't manage are shown read-only (or hidden; decide) |
| `user.js:111-115` | `/users/byProject` | ≥10 | `auth-users` (the reason Users shows 0 rows today) |
| `user.js:141-148`, `:152-158` (`checkGroupAuthority` `:252-278`) | `/user/group/assign`, `/user/group/remove` | ≥ the group's level in every project it's in | `auth-groups` **or** `auth-users`? (decide) + `canManageGroup` |
| `user.js:162-192` | `/user/delete` | caller ≥ target's level in every project | `auth-users` + the caller can manage every group the target is in |
| `auth.js:363-367` | `/password/force` | ≥10 on `avail_auth` | stays platform-only unless sites want it: then `auth-users` + target only in manageable groups. In the platform task |
| `user.js:225+` | `/users/preferences` | no filtering (comment `:228`) | own preferences only, or `auth-users` |

The responses also return `projects[].auth_level` (`user.js:55-64`); stop once the client no longer needs it
([permissions-auth-client-pages.md](./permissions-auth-client-pages.md)).

## Proposed changes

- [x] Each row through the transition form (permission path first, then today's level rule), level half removed later in
  [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md).
- [x] `isPublicGroup` replaced by "only `${project} Public`" (query removed from `queries.js`).
- [x] Tests: `tests/test-auth-users.js` (21, real SQLite auth DB, injected pattern rows).

## Progress 2026-10-25 (built, uncommitted)

Server (`dms-server/src/auth/`):
- `utils/permissions.js`: `authority()` (transition authority: `byPermission` = `auth-users` on the named row **and**
  a member of its project; `byLevel` = today's threshold; a route with no project uses the named app's), `groupProjects`,
  `canManageGroupIn` (group must be linked to the row's project; that site's grants alone decide).
- `handlers/auth.js`: `mayAddToGroup` (auth-users + group manageable, or level ≥ 5 and ≥ the group's level) for
  `/signup/accept`, `/invite` (target group now checked on both paths: closes the level-5-into-Admin gap) and
  `/signup/assign/group` with a token; anonymous `/signup/assign/group` needs a password and lands only in
  `${project} Public`, and only that group is auto-created. `/signup/reject`, `/signup/delete`, `/requests`,
  `/requests/byProject` by `auth-users` or level 5. `/signup/request` (+ verify): only `${project} Public`.
- `handlers/user.js`: `/users/byProject` by `auth-users` or level 10, each user `manageable`; `/users`, `/users/bygroup`
  add the project's users on the permission path; assign/remove by `auth-users` + `canManageGroupIn`, or the level rule
  (`levelCoversGroup`); `/user/delete` by `auth-users` (target in the project, every group manageable) or the level
  rule, which now refuses a target in no project (it let any signed-in user delete them); `/users/preferences`: own,
  or `auth-users` (target in project), or rank (`levelOutranks`).

Client (`dms/src/`):
- ui Table: new optional prop `canEdit({ row, attribute, op })` (`ui/components/table/utils/canEdit.js`
  `cellEditable`), `op` = `'edit'` | `'delete'`. Honoured by cell editing, paste, selection clear and the row delete
  actions. Absent → unchanged. Meant for row-level auth on internal tables / external sources later.
- `authUsers.jsx`: `canEdit={({ row }) => row?.manageable !== false}`, reset password hidden on locked rows, and the
  table re-reads users after a group change (a refused change reverts; a saved one was never written to state, so
  the next diff compared against stale groups).

Remove from site (decision 5, built 2026-10-25):
- `auth/utils/siteGrants.js`: `listSiteGrants` / `stripSiteGrants` (through the DMS controller's `setDataById`, so each
  write is in `change_log` and broadcast; stale-row check with re-read, 3 tries; SQLite gets a null-deleting merge
  patch, since `json_patch` keeps keys a nested patch leaves out, Postgres the whole value) and `listExternalGrants`
  (read-only, dama-role configs only). Handles `authPermissions` / `auth_permissions`, string or object, plain or
  per-subdomain.
- Controller `getRowsWithGrants(app)`. `auth/index.js`: its controller now gets `setNotifyChange` (ws), as sync.js
  does for its own: before, writes through it would not have reached sync clients. ctx gains `siteGrants`.
- `handlers/user.js` `removeFromProject` (`dryRun` = the plan): every group here must be manageable, then grants,
  then memberships (two databases: this order makes a retry finish a partial run).
- Users page: "remove from site" per manageable row, confirm dialog from the dry run; the site's pgEnvs come from
  the pattern's `datasources`. Theme keys `removeBody` / `removeList` / `removeWarning` (manage block + fallbacks).

## Results (2026-10-25)

- `test-auth-users` 26/26, `test-site-grants` 6/6 (cli-test SQLite; not run on Postgres: no Docker here),
  `test-auth-permissions` 21/21, `test-auth` 104/104 (sqlite-only server copy), `test-data-auth` 49, `test-jwt-failures` 8,
  `npm run build` ✓.
- **Live, rig 3458 `enforce` + Vite 5197** (seed: group `Managers` level 0 granted `auth-users` on auth pattern 2,
  users `mgr@` / `victim@test.local`, test123). Flow `scratchpad/srv3458/flows/flow-users14.mjs` (AUTHCHECK_USER):
  - mgr: `v6test Admin` row manageable=false, no reset, groups cell doesn't open an editor; other 4 rows editable. ✓
  - admin: all rows editable. ✓
  - HTTP (mgr token): assign/remove `v6test Admin`, delete admin, invite into Admin → refused; assign/remove Viewers,
    add user (Public), delete that user → ok. Anon assign/group into Admin or without password → refused. viewer
    `/users/byProject` → refused. 0 would-deny lines. ✓
  - Remove from site (`flows/flow-remove14.mjs`, mgr, victim with a grant on datasets pattern 4, per-subdomain string
    format, and on external source 1): 4 buttons (none on the admin row); dialog lists groups, the external source;
    after Remove: pattern 4's grant gone (format kept), external source untouched, account kept, no groups,
    `change_log` rev by mgr. ✓ Fixture grant on source 1 reverted.
  - ⚠ Level path, unchanged from today: `viewer@` (level 1) **can** add a user to `Viewers` (level 1) over the API:
    the old `checkGroupAuthority` has no floor. Owner to decide whether the level path gets a ≥ 5 floor now or it waits
    for level removal (task 19). Once levels are gone the permission path refuses it (viewer holds no `auth-users`),
    so no floor is needed then; the question only covers the transition window.

## Testing checklist

- [x] Tests above.
- [x] Live: a level-0 group granted `auth-users` sees the Users page populated, can add users, can't add anyone to
  `${app} Admin`.
