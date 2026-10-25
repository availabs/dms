# Auth server: groups and project membership by permission (`auth-groups`)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** —

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md) (`can`,
`canManageGroup`, transition mode).


## Owner decision carried from task 14 (2026-10-25)

Group lists show only the project's own groups. Adding an **external group** (one of another project) to a site is a
separate feature with its own button ("Add external group"), never mixed into the same list. Only the calling site's
grants count for a shared group ([permissions-auth-users-and-signup.md](./permissions-auth-users-and-signup.md),
decisions 5–6).
## Objective

Move every group-handler level check to `auth-groups` plus the escalation rule, and fix the two holes the
survey found on the way.

## Checks to move (`dms-server/src/auth/handlers/group.js`)

| line | route | today | becomes |
|---|---|---|---|
| `:10-63` | `/groups` | a group shows if caller's level ≥ its level in every project (`:43-46`) | the project's groups for `auth-groups` holders; groups the caller can't manage flagged read-only |
| `:66-104` | `/groups/byproject` | hides groups above the caller (`:82`); returns `projects[].auth_level` | same as above; stop returning levels at removal |
| `:107-111` | `/group/create` | ≥5 on `avail_auth` | platform task (it's a global group); sites use `/group/create/project/assign` |
| `:118-130` | `/group/create/project/assign` | ≥5 and ≥ requested `auth_level` (0–10) | `auth-groups`; new groups start with no grants (the Access editor grants them). `auth_level` ignored |
| `:138-156` | `/group/delete` | per project where caller ≥5, removes if group level ≤ caller's; **fails silently** | `auth-groups` + `canManageGroup`; return an error when nothing was removed |
| `:175-184` | `/group/project/assign` | 0–10; ≥5 and ≥ requested level | `auth-groups` + `canManageGroup`; the grants come from the auth row, so assigning a group to a project grants nothing by itself |
| `:191-205` | `/group/project/remove` | ≥5 and ≥ group's current level | `auth-groups` + `canManageGroup` |
| `:212-221` | `/group/project/adjust` | ≥5 and ≥ the **new** level only, so a level-5 user can demote a level-10 group | **hole**: fix now (check the current level too) in transition; route removed with levels |
| `:228-232` | `/group/meta/update` | ≥5 on `avail_auth` | `auth-groups` + `canManageGroup` for project groups |

Also: `auth.js:455-497` `/init/setup` creates `${project} Admin` at 10 and `${project} Public` at 0. With
permissions, `${project} Admin` is already `*` by name in the client (`isAppAdmin`) and tenant provisioning seeds
`Admin: ['*']` (`utils/tenantProvisioning.js:144,319`). Keep writing the level until removal, so transition-mode
checks still see it.

## Interaction with the Access editor

Granting a group a permission on the auth row (or any pattern) is done through `dms.data.edit` on the pattern row,
which has **no server check** (defect B of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md)). The escalation rule
here is moot until that write path checks `edit-pattern-permissions`. Ship together, or defect B first.

## Proposed changes

- [ ] Fix `/group/project/adjust` current-level check now (small, standalone).
- [ ] Each row through `canOrLevel`, then levels removed in [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md).
- [ ] Tests in `tests/test-auth.js` (`:326-398`, `:452-500` are written in levels): add permission-only and
  neither cases; an `auth-groups` holder can't delete, edit or join `${app} Admin`.

## Testing checklist

- [ ] Tests above.
- [ ] Live: Groups page as an `auth-groups` holder: create, rename/meta, delete a group; Admin shown read-only.
