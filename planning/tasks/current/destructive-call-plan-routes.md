# Destructive calls never carry a preview flag: read-only plan routes for "remove from site"

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) · **Status:** built · **Release:** commit — uncommitted on `permissions_move` (2026-11-02); live rig check of the dialogs still open · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Found by the 2026-10-27 deploy review of `permissions_move` (hub
[auth-levels-to-permissions.md](./auth-levels-to-permissions.md), "Deploy-order constraints").

## Objective

The Users and Groups pages asked a **destructive** route for a preview by adding `dryRun: true` to the real call.
A server that doesn't know the flag ignores it and performs the delete. Master's `/group/delete` is such a
server: opening the Groups page's "remove from site" dialog against it **deletes the group** from every project
where the caller has level ≥ 5.

Owner rule (2026-10-27): **we must not depend on a server being up to date for destructive calls.** A preview
comes from its own read-only route. On a server without that route the call 404s, and the client shows an
error instead of deleting.

## Stopgap (done 2026-10-27, committed; superseded 2026-11-02 by the plan routes below)

- `authGroups.jsx` / `authUsers.jsx`: `openRemove` no longer calls the server. The dialog shows a generic
  description of what removal does, and Remove is enabled straight away.
- The plan rendering (`removePlan && …`) is kept: it renders nothing while `removePlan` is null, so this task only
  has to add the fetch back.
- The v6 mockup (`src/themes/tessera/design_system_v6/pages/admin-groups.html`) keeps the plan dialog as the
  target design, with a note pointing here.
- The server still accepts `dryRun` on the three handlers below. No client sends it any more.

## Where `dryRun` lives today (server, `packages/dms-server/src/auth/handlers/`)

| Route | Handler | Plan it returns |
|---|---|---|
| `/group/delete` | `group.js` `deleteGroup` (243–279) → `groupLeavesSite` (30–45) | members, siteGrants, otherProjects, deletes, skippedGrants, externalSources; level path: projects |
| `/group/project/remove` | `group.js` `removeFromProject` (320–344) → `groupLeavesSite` | same as above, for one project |
| `/user/project/remove` | `user.js` `removeFromProject` (244–278) | groups, sharedGroups, siteGrants, skippedGrants, externalSources |

## Plan — BUILT 2026-11-02 (uncommitted, `permissions_move`)

1. [x] **Server: plan routes.** `POST /group/delete/plan`, `POST /group/project/remove/plan`,
   `POST /user/project/remove/plan`, registered in `auth/routes/group.routes.js` / `user.routes.js` next to their
   siblings (not in `IDENTITY_ROUTES`).
   - Each runs the same authority check as its destructive sibling, then returns the plan. The checks are now
     their own read-only functions shared by both: `group.js` `resolveDeleteGroup` (returns `how`: `site` /
     `orphan` / `level`), `authorizeRemoveFromProject`; `user.js` `planUserLeavesSite` (authority + plan).
   - `groupLeavesSite` is split into `planGroupLeavesSite` (reads only) and `applyGroupLeavesSite` (strip
     grants, unlink, delete-if-last); the plan handlers `planDeleteGroup` / `planRemoveFromProject` (group and
     user) only reach the read halves, so a plan route has no path to a write.
   - Plan shapes are the old `dryRun` ones: the site path's full plan; the orphan path
     `{ group_name, projects: [], deletes: true }`; the level path `{ group_name, projects }`.
2. [x] **Server: `dryRun` taken out** of `deleteGroup`, `removeFromProject` (group) and `removeFromProject` (user).
   `grep dryRun src/auth` → none. A `dryRun: true` sent to a destructive route now just performs it, as on any
   server; no client sends it.
3. [x] **Client.** `authGroups.jsx` / `authUsers.jsx` `openRemove` fetch `…/plan`. `callAuthServer` throws on a
   non-ok response, so a 404 (or no answer) shows "This server can't preview the removal."; a refused plan shows
   the server's error. Either way the generic description stays and **Remove stays enabled**. A `planFor` ref
   drops a late plan for a dialog that has since moved to another row.
   - **Design note:** a refused plan shows the server's message (e.g. "You do not have the authority…") rather
     than the "can't preview" line, since it tells the manager the Remove will be refused too. Remove isn't
     disabled for it (the plan never gates).
   - v6 mockup `admin-groups.html`: the "no plan is fetched" note is replaced by the plan-route note and the
     fallback variant (in a comment). `admin-users.html` has no remove dialog mocked; nothing to sync.
4. [x] **Rule written down:** `packages/dms-server/CLAUDE.md` "Destructive routes never take a preview flag";
   `documentation/admin-permissions.md` "Behaviours worth knowing" (the remove-dialog plan routes).
5. [x] **Sweep (2026-11-02).** grep for `dryRun` / `dry_run` / `dry-run` / `preview: true` / `validateOnly` over
   `packages/dms/src`, `packages/dms/cli`, dms-server `routes` / `dama` / `auth` / `upload`, root `data-types/`
   and `src/patterns`:
   - No client call sends a preview flag to a destructive route (library, CLI, admin, datasets, app patterns).
   - Server scripts (`src/scripts/*`, `--dry-run` / `--apply`) and the CLI's options are local: fine.
   - **One server route takes one:** `data-types/mny/actions_cleaned` `POST /relocate` (and its scheduled
     descriptor) reads `dryRun` from the body; `relocate.js` / `worker.js` skip their writes when it's set.
     No UI sends it; `test.js` runs the worker directly, not through the route. Same hazard in principle (a
     server build without the flag would relocate for real), but the flag and the route ship together in one
     plugin. Left as is; flagged for the plugin's owner.

## Files

- `packages/dms-server/src/auth/handlers/group.js`, `user.js`; `auth/routes/group.routes.js`, `user.routes.js`
- `packages/dms/src/patterns/auth/pages/authGroups.jsx`, `authUsers.jsx`
- `packages/dms-server/CLAUDE.md`; the v6 mockup note (remove once the plan is back)

## Testing checklist

- [x] `tests/test-auth-groups.js` (23/23, was 21) / `test-auth-users.js` (26/26), 2026-11-02:
  - each plan route returns the same plan the old `dryRun` did (site, orphan and level paths);
  - each plan route writes nothing (groups / links / memberships counts unchanged; no grant strip called);
  - each plan route refuses what its destructive sibling refuses (protected groups, no authority, another
    project's group, orphan without platform authority; user: protected member, not a member, no authority,
    no named site);
  - the destructive handlers no longer read `dryRun`.
  - `test-auth-permissions` 21/21, `test-auth-platform` 14/14 unchanged.
- [ ] A client against a server without the plan routes (master): opening the dialog makes no destructive call
  (request capture). The dialog shows the fallback, and Remove still works where the server allows it.
- [ ] Live on the rig: Groups and Users remove dialogs show the plan again; Remove applies it.
