# Auth client: Users, Groups and Profile pages on permissions

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** blocked:dependency · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

- [ ] `api.js`: send `app` + auth pattern id; drop the duplicates in `utils.js`.
- [ ] `authUsers.jsx`: re-enable accept/reject of signup requests (now `auth-users`); show groups the caller can't
  manage as read-only; show the server's 403 messages.
- [ ] `authGroups.jsx`: stop sending `auth_level`; link each group to the Access editor for its grants; add delete
  and meta edit if wanted (server routes exist, nothing calls them).
- [ ] `profile.jsx`: use self-scoped data (the user's own groups from `/auth`), not the admin listing endpoints.
- [ ] `useManagePageGate.js`: strict check, same rule as the server (decided in the source-permission task).
- [ ] `context.js:6`: drop `authLevel` (in [permissions-remove-auth-levels.md](./permissions-remove-auth-levels.md)).

## Testing checklist

- [ ] Live, scratch server: a level-0 group granted `auth-users` sees populated Users and Requests and can act;
  granted `auth-groups`, can manage groups; Admin group is read-only to both.
- [ ] Profile page loads for an ordinary user with no admin grants and shows their own groups.
