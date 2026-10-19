# Auth server: users, signup requests and invites by permission (`auth-users`)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md). Coordinate with
[auth-invite-link-and-reset-hardening.md](./auth-invite-link-and-reset-hardening.md), which rewrites
`signupAssignGroup` and the invite flow: write its checks in this task's "permission or level" form.

## Objective

Move every user- and signup-related level check to `auth-users` (plus the escalation rule for anything that puts
someone in a group), first alongside the level, then alone.

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

- [ ] Each row through `canOrLevel` (transition), then the level half removed in
  [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md).
- [ ] `isPublicGroup` replacement per the decision.
- [ ] Tests in `tests/test-auth.js`: each route passes by permission alone, by level alone (transition), fails with
  neither; a holder of `auth-users` can't invite or accept into a group holding `*`.

## Testing checklist

- [ ] Tests above.
- [ ] Live: a level-0 group granted `auth-users` sees the Users page populated, can invite and reset passwords,
  and can't add anyone to `${app} Admin`.
