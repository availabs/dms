# Auth client: Users, Groups and Profile pages on permissions

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** built + verified (2026-10-26), uncommitted · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-auth-server-permission-source.md](./permissions-auth-server-permission-source.md) (the client sends
`app` + auth pattern id) and the server tasks it calls.


## Owner decision carried from task 14 (2026-10-25)

Group lists show only the project's own groups. Adding an **external group** (one of another project) to a site is a
separate feature with its own button ("Add external group"), never mixed into the same list. Only the calling site's
grants count for a shared group ([permissions-auth-users-and-signup.md](./permissions-auth-users-and-signup.md),
decisions 5–6).
## Objective

The auth pattern pages already gate on `auth-users` / `auth-groups`, but call endpoints gated by level, so a granted
user sees empty lists. Once the server moves, the pages need small changes and some level remnants go.

## Current state (`dms/src/patterns/auth/`)

- `api.js:56-106` (+ duplicate `getGroups`/`getUsers` in `utils.js`): every call sends `token` + `PROJECT_NAME`.
- `authUsers.jsx`: gate `auth-users` (`:113`); loads `/users/byProject` (`:119`, ≥10), `/groups/byproject` (`:152`),
  `/requests/byProject` (`:160`, ≥5); add user `/signup/assign/group` (`:129`); membership `:370`, `:377`; reset `:410`;
  accept/reject commented out (`:191`, `:208`); view-as by `${app} Admin` or `view-as` (`:107-108`).
- `authGroups.jsx`: gate `auth-groups` (`:18`); create via `/group/create/project/assign` with `auth_level: 0` (`:102-107`).
- `profile.jsx`: calls `/groups/byproject` (`:28`), `/users/byProject` (`:40`), `/requests/byProject` (`:52`):
  level-gated admin endpoints from a profile page.
- `useManagePageGate.js:20` uses the lenient `isUserAuthed`.
- `context.js:6` default user `authLevel: -1` (read nowhere).
- No UI shows or edits a group's level; `projects[].auth_level` is never rendered.

## Proposed changes

- [x] `api.js`: send `app` + auth pattern id; drop the duplicates in `utils.js`.
- [x] `authUsers.jsx`: re-enable accept/reject of signup requests (now `auth-users`); show groups the caller can't
  manage as read-only; show the server's 403 messages.
- [x] `authGroups.jsx`: stop sending `auth_level`; link each group to the Access editor for its grants; add delete
  and meta edit if wanted (server routes exist, nothing calls them).
- [x] `profile.jsx`: use self-scoped data (the user's own groups from `/auth`), not the admin listing endpoints.
- [x] `useManagePageGate.js`: strict check, same rule as the server (decided in the source-permission task).
- [ ] `context.js:6`: drop `authLevel` (in [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md)).

## Owner decisions (2026-10-26)

- **Groups page:** a "remove from site" row action, with the server's dry-run plan in a dialog. No
  description editing.
- **Add external group:** a searchable list of every group not on the site (a new server route).
- **Signup requests on Users:** stay off.
- **Profile:** the user's own groups on this site; the admin listing calls are dropped.

## Already done in earlier tasks

- `app` + `authPatternId` on every call (task 13, `api.js` `withAuthScope`).
- Users rows read-only where the caller can't manage the user, plus Remove from site (task 14).
- 403 messages shown in the Users dialogs (task 14).

## Built (2026-10-26)

- **Server, `/groups/linkable`** (`group.js` `linkableGroups`):
  - Lists every group not linked to the project, with names and member counts only (not which
    projects use them).
  - Requires `auth-groups` on the project's auth row, or level 5 there (the level rule of
    `/group/project/assign`).
- **Server, `/groups/byproject`** now returns **`assignable`** per group, besides `manageable`:
  - It mirrors `checkGroupAuthority`, the rule of `/user/group/assign` and `/remove`: `auth-users` +
    `canManageGroupIn`, or `levelCoversGroup`.
  - `manageable` means "may manage the group itself" (`auth-groups`), so an `auth-users` holder gets
    `false` on every group. Filtering the Users picker by `manageable` emptied it. Found live.
- **`authGroups.jsx`:**
  - Loads through `AuthAPI.getGroups`. "Add new" no longer sends `auth_level`; it reloads and closes on
    success, and shows the server's error on failure.
  - "remove from site" shows only on `manageable` rows (never on `public`).
    - The dialog shows the dry-run plan from `/group/delete`: members, site grants stripped, other
      projects it stays in, deleted when last, malformed grants skipped, external sources to fix by
      hand.
    - For a level-path caller, the dialog also shows the list of projects it is removed from.
  - "Add external group" (`action` style) opens a searchable list from `/groups/linkable`; "add" calls
    `/group/project/assign`.
  - `siteConfig.jsx` passes `pgEnvs` to the page.
- **`authUsers.jsx`:** the group picker offers only `assignable` groups. The others stay in the column
  as `selectable: false` options, so read-only rows don't show their groups as invalid (red).
- **Table primitive** (`TableCell.jsx`): an option with `selectable: false` is a valid value the editor
  doesn't offer. `isValid` checks the full list, and the editor gets the rest.
- **`profile.jsx`:** the three admin calls are dropped. It shows a "groups" line: `rankUserGroups` over
  the user's own groups from sign-in, with `PatternAuthContext`.
- **`useManagePageGate.js`:** same rule as the server's permission path. The user must belong to this
  project (a group besides `public`), and be `${app} Admin` or hold the permission (lenient). A
  signed-in user of another project no longer gets in on an open auth row.
- `utils.js` deleted: nothing imported it.
- **Theme keys** (`defaultTheme.js` manage): `headerActions`, `linkList`, `linkRow`, `linkName`,
  `profileField`, `profileFieldLabel`, `profileFieldValue`.
- **Mockups synced:**
  - `admin-groups.html`: header action, row action column, the external-group and remove dialogs, note.
  - `admin-profile.html`: groups line.
  - `admin-users.html`: "remove from site" (task 14 had not synced it), and a read-only row with no
    actions.
- Not done: `context.js:6` `authLevel` (task 19, as planned).

## Results (2026-10-26)

- **Tests:**
  - `test-auth-groups` 21: linkable, plus `assignable` for `auth-users` / `auth-groups`.
  - Other suites green: `test-auth` 105, `test-auth-users` 26, `test-auth-permissions` 21,
    `test-site-grants` 8, `test-data-auth` 49, `test-auth-platform` 14.
  - Build ✓.
  - dms vitest: the same 12 failures with and without these changes (avlGraphThemeDefaults,
    radioTheme, sectionGroupCollapsible, syncDeltaConvergence, …): already failing on the branch, not
    this task's.
- **Live, on the rig** (:3458 enforce, Vite :5197), as gmgr@ (`GroupMgrs`, `auth-groups`, level 0):
  - Remove shows on Downloaders / Managers / Viewers / `v6test Public`, and is hidden on `public`,
    GroupMgrs and `v6test Admin`.
  - Add external group listed `AVAIL(1), ExtGroup(0)`; the filter worked; adding linked ExtGroup.
  - Its remove dialog (dry run) said "deleted" (no other project); cancelled.
  - "Add new" Temp17 was created at level 0. After granting it `view-source` on pattern 4:
    - The remove dialog listed one grant row and "deleted".
    - Confirming stripped the grant (the string `'*'` entry stayed a string) and deleted Temp17.
  - ExtGroup was unlinked afterwards (rig restored).
- **Live, other pages:**
  - Profile: viewer@ → Viewers; gmgr@ → `GroupMgrs · v6test Public`; admin@ → `v6test Admin`.
  - Users as mgr@ (`auth-users`): the picker offers `public`, Downloaders, Managers, Viewers (not
    GroupMgrs / `v6test Admin`); no red cells.
- Flows: `srv3458/flows/flow-groups17.mjs` (`LINK=`, `NEW=`, `REMOVE=`, `CONFIRM=1`, `SHOT_DIR=`).

## Testing checklist

- [x] Live, scratch server: a level-0 group granted `auth-users` sees populated Users and Requests and can act;
  granted `auth-groups`, can manage groups; Admin group is read-only to both.
- [x] Profile page loads for an ordinary user with no admin grants and shows their own groups.
