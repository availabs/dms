# Auth server: platform-admin operations (`avail_auth` / `AVAIL`) without levels

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built + verified (2026-10-26), uncommitted · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

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

## Decision

**Owner 2026-10-24: (a), membership in `AVAIL`** (checked by name, no levels). Mapping as in the recommendation below.


- (a) **Membership in a platform group** (`AVAIL`), checked by name, no levels. Simplest; matches the `type=all`
  message check today.
- (b) `*` on the auth row of a designated platform root site.
Recommendation: (a). Then: projects, fake users, create-user, global groups, message-all → `AVAIL` member;
`/password/force` → `AVAIL` member (or `auth-users` per site, if the users task decides so); message to a group →
`auth-users` or `auth-groups` on that project's auth row + `canManageGroup`; message to a project → `auth-users`.

## Proposed changes

- [x] `isPlatformAdmin(authDb, email)` in `auth/utils/permissions.js`: membership in `AVAIL`
  (`PLATFORM_GROUP`), by name, with no project link or level. `platformAuthority(authDb, email, minLevel)`
  covers transition mode: membership, or today's `avail_auth` level.
- [x] Each row through transition mode (levels are removed in task 19):

  | route | now |
  |---|---|
  | `/projects` | all: AVAIL member or `avail_auth` 10; own: `avail_auth` ≥ 1 (level rule, unchanged) |
  | `/project/create`, `/project/delete` | `platformAuthority(10)`. Create still links `AVAIL` at 10 |
  | `/password/force` | `platformAuthority(10)`. Platform-only, as task 14 left it |
  | `/create/user` | `platformAuthority(10)` |
  | `/user/create/fake` | `platformAuthority(10)` |
  | `/group/create`, orphan `/group/delete` | `platformAuthority(5)` |
  | `/group/meta/update` | `auth-groups` for a site's group (task 15), else `platformAuthority(5)` |
  | `/messages/post` group | `auth-users` or `auth-groups` on the project's auth row + `canManageGroup` (no protected group), or the level rule |
  | `/messages/post` project | `auth-users` on the project's auth row, or the level rule (≥ highest in the project) |
  | `/messages/post` all | `isPlatformAdmin` (AVAIL membership, as before) |

- [x] `/create/user`, the escalation rule: there are no levels to compare for a platform admin, so the
  check is on the group itself. It must exist, and must belong to `project` when one is named. Before,
  it took any name, existing or not.
- [x] Found and fixed: a project message to a project whose groups are all level 0 failed with "not
  found" (`MAX(auth_level) || -1` read 0 as missing). Now `?? -1`.
- [x] Tests: `tests/test-auth-platform.js` (new, 14). The setup unlinks the seeded `AVAIL` from
  `avail_auth`, so membership is tested with no level; a group linked to `avail_auth` at 10 keeps the
  level path covered.

## Results (2026-10-26)

- `test-auth-platform` 14/14. Unchanged suites green: `test-auth` 104, `test-auth-groups` 19,
  `test-auth-users` 26, `test-auth-permissions` 21, `test-site-grants` 8, `test-data-auth` 49 (sqlite copy).
- Live, on the rig (:3458, enforce), over HTTP:
  - admin@ (an AVAIL member) lists projects.
  - mgr@ (`auth-users`, level 0) is refused `/projects` and `/project/create`, and can message project
    `v6test`; viewer@ received it.
  - viewer@ is refused messaging the project.
  - mgr@ is refused messaging `v6test Admin` (protected).
  - One test message (`t16`) was left in the rig's inboxes.
- No client calls these routes (checked the dms package, `src/` and `data-types/`), so nothing changes on
  the client. Admin create-site and tenant creation go through `/init/setup`, which this task doesn't
  touch.

## Testing checklist

- [x] Tests above.
- [x] (unchanged path: `/init/setup` isn't touched) Admin create-site flow (`admin/pages/createSite.jsx:49`, `/init/setup`) and tenant creation
  (`editSite.jsx:827`) still work for a platform admin and for a site owner.
