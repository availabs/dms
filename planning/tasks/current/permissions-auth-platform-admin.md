# Auth server: platform-admin operations (`avail_auth` / `AVAIL`) without levels

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:decision · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md).

## Objective

Some operations aren't about one site: they act on the auth DB as a whole and are gated by level 10 in the
global `avail_auth` project (seeded with group `AVAIL` at 10: `db/sql/auth/auth_tables.sql:630`,
`auth_tables.sqlite.sql:136`). Decide what replaces that, then move them.

## Operations

| file:line | route | today |
|---|---|---|
| `auth/handlers/project.js:10-21` | `/projects` | `avail_auth` ≥10 sees all, ≥1 sees own |
| `project.js:35-44` | `/project/create` | ≥10 on `avail_auth`; auto-assigns `AVAIL` at 10 (`:43`) |
| `project.js:48-52` | `/project/delete` | ≥10 on `avail_auth` |
| `auth/handlers/auth.js:363-367` | `/password/force` | ≥10 on `avail_auth` |
| `auth.js:433-437` | `/create/user` | ≥10 on `avail_auth`; assigns any `group`, no rank check |
| `user.js:199-203` | `/user/create/fake` | ≥10 on `avail_auth` |
| `group.js:107-111`, `:228-232` | `/group/create`, `/group/meta/update` (global) | ≥5 on `avail_auth` |
| `auth/handlers/message.js:93-103` | `/messages/post` type=group | caller ≥ the group's level in the project |
| `message.js:115-126` | type=project | caller ≥ the max level in the project |
| `message.js:140-146` | type=all | member of `AVAIL` (not a level) |

## Decision needed

- (a) **Membership in a platform group** (`AVAIL`), checked by name, no levels. Simplest; matches the `type=all`
  message check today.
- (b) `*` on the auth row of a designated platform root site.
Recommendation: (a). Then: projects, fake users, create-user, global groups, message-all → `AVAIL` member;
`/password/force` → `AVAIL` member (or `auth-users` per site, if the users task decides so); message to a group →
`auth-users` or `auth-groups` on that project's auth row + `canManageGroup`; message to a project → `auth-users`.

## Proposed changes

- [ ] `isPlatformAdmin(user)` in `auth/utils/permissions.js`.
- [ ] Each row through transition mode, then levels removed.
- [ ] `/create/user`: the escalation rule applies to the group it assigns.
- [ ] Tests (`tests/test-auth.js:437-447` cover project CRUD by level): add platform-member and non-member cases.

## Testing checklist

- [ ] Tests above.
- [ ] Admin create-site flow (`admin/pages/createSite.jsx:49`, `/init/setup`) and tenant creation
  (`editSite.jsx:827`) still work for a platform admin and for a site owner.
