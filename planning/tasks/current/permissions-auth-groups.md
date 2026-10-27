# Auth server: groups and project membership by permission (`auth-groups`)

**Initiatives:** [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md) (`can`,
`canManageGroup`, transition mode).


## Owner decision carried from task 14 (2026-10-25)

Group lists show only the project's own groups. Adding an **external group** (one of another project) to a site is a
separate feature with its own button ("Add external group"), never mixed into the same list. Only the calling site's
grants count for a shared group ([permissions-auth-users-and-signup.md](./permissions-auth-users-and-signup.md),
decisions 5–6).

## Decisions (owner, 2026-10-25)

1. **Delete from a site = unlink, delete if last.** `/group/delete` unlinks the group from the calling project; when
   no project uses it any more, the group and its memberships are deleted. A site never deletes what another site
   still uses (task 14's principle).
2. **A group leaving a site loses its grants there.** Its entry is stripped from every row of the site (patterns,
   pages, internal sources), through the DMS controller, as Remove from site does for a user; external-source
   grants are listed only. Otherwise a later group with the same name inherits them.
3. **Format (applies to every strip, users too):** each row is written back in the shape and representation it
   already uses (string stays string, per-subdomain stays per-subdomain, `authPermissions` on patterns / pages,
   `auth_permissions` on internal sources, ids as string keys). The result is validated as well-formed
   `{ groups, users }` of arrays before writing; a row whose stored grants are malformed is not touched, and is
   reported instead of guessed at. Nothing else on the row changes.
4. **`/group/project/assign` (link an existing group, e.g. another project's) opens to `auth-groups` now**, at
   level 0, so it grants nothing until the site's Access editor does. The "Add external group" button is task 17.

Built alongside (safety, no owner call): while the level fallback exists a group's level still grants access, so
the permission path never sets one: groups it creates or links get level 0, and `/group/project/adjust` stays
level-only (its current-level hole fixed). `/groups/byproject` is readable with `auth-groups` **or** `auth-users`
(the Users page needs the group list for its membership picker).

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

(Resolved 2026-10-22: the `dms.data` / `/sync/push` guard, `routes/dms/dataAuth.js`, now checks
`edit-pattern-permissions` on pattern rows.) Granting a group a permission on the auth row (or any pattern) is done
through `dms.data.edit` on the pattern row, which had **no server check** (defect B of
[auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md)). The escalation rule
here is moot until that write path checks `edit-pattern-permissions`. Ship together, or defect B first.

## Proposed changes

- [x] `/group/project/adjust`: also needs the caller ≥ the group's **current** level; level-only (no permission path).
- [x] Each row in transition form (permission path first, today's level rule after); level half removed in
  [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md).
- [x] Tests: `tests/test-auth-groups.js` (19); `test-site-grants.js` extended (8); `test-auth.js` 104.

## Progress 2026-10-25 (built, uncommitted)

Server (`dms-server/src/auth/`):
- `handlers/group.js`: `groupLeavesSite` (strip the group's grants on the site, then unlink, then with
  `deleteIfLast` delete the group + memberships once no project uses it; `dryRun` = the plan, with
  `otherProjects`, `members`, `siteGrants`, `skippedGrants`, `externalSources`). `/group/delete` (auth-groups +
  manageable from this site → unlink / delete-if-last; level rule: every project where the caller is ≥ 5 and ≥ the
  group's level, each stripped; a group in **no** project: platform only, avail_auth ≥ 5, it used to be deletable
  by anyone signed in; an error when nothing is removed). `/group/project/remove` (same, never deletes).
  `/group/project/assign` (auth-groups links an existing group at level 0; protected rule on what this site grants
  the name). `/group/create/project/assign` (auth-groups creates at level 0). `/groups/byproject` (auth-groups or
  auth-users sees every group of the project; each carries `manageable`). `/groups` (adds the project's groups).
  `/group/meta/update` (auth-groups for a manageable group of the site, or avail_auth ≥ 5). `/group/create`
  unchanged (platform, task 16).
- `utils/siteGrants.js`: strips a user **or a group** (`{ users: id }` / `{ groups: name }`), decision 3's format
  rules (`readGrants`, `isWellFormedGrant`, `planRow`; malformed or wrong-key rows in `skipped`). Task 14's
  Remove from site uses the same code and now reports skipped rows in its dialog.
- `utils/permissions.js`: `authority()` takes a list of permissions; the level-rule helpers (`levelCoversGroup`,
  `levelOutranks`) moved here from `handlers/user.js` (shared by both handlers).
- `tests/test-auth.js`: "delete a group in no project" now expects the platform-only refusal.

Client: no Groups page changes (it lists and adds only; delete / edit / link UI is task 17, with the server's
`manageable` flags and dry-run plans ready). Users page: Remove from site lists skipped rows.

## Results (2026-10-25)

- `test-auth-groups` 19/19, `test-site-grants` 8/8, `test-auth-users` 26/26, `test-auth-permissions` 21/21,
  `test-data-auth` 49/49, `test-auth` 104/104 (sqlite-only copy), `npm run build` ✓.
- **Live, rig 3458 `enforce`** (seed: group `GroupMgrs` level 0 granted `auth-groups` on auth pattern 2, user
  `gmgr@test.local`; global group `ExtGroup`). Script: session `live15.mjs` (copied into the verify README):
  - gmgr `/groups/byproject`: `v6test Admin` and `GroupMgrs` manageable=false (protected), others true. ✓
  - create `LiveTemp` asking level 10 → linked at 0; link `ExtGroup` asking 10 → linked at 0; unlink → still
    exists. ✓ Delete Admin, adjust (level-only), viewer delete → refused. Meta edit → ok. ✓
  - `LiveTemp` granted on datasets pattern 4 (per-subdomain, string value): delete → grant gone, `'*'` still a
    string, group deleted, `change_log` rev by gmgr. ✓
  - Users page as mgr (task 14 flow): unchanged, plus gmgr now read-only (GroupMgrs is protected). ✓
- Note for task 17: the Users page's group picker now lists every group of the project for an `auth-users`
  holder (it listed only level-visible ones); protected ones are refused by the server and the row reverts.

## Testing checklist

- [x] Tests above.
- [x] Live (server): create, meta, unlink, delete as an `auth-groups` holder; Admin refused. The Groups page UI for
  these is task 17.
