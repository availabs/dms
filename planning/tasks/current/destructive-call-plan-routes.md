# Destructive calls never carry a preview flag: read-only plan routes for "remove from site"

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

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

## Stopgap (done 2026-10-27, uncommitted, on `permissions_move`)

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

## Plan

1. **Server: plan routes.** Add `POST /group/delete/plan`, `POST /group/project/remove/plan` and
   `POST /user/project/remove/plan`.
   - Each runs the same authority check as its destructive sibling, then returns the plan.
   - Each never writes: they call the planning half only. Split `groupLeavesSite` into `planGroupLeavesSite` (read)
     and the apply step, and `user.js` `removeFromProject` the same way, so the plan route can't reach a write
     path.
   - Register them in `auth/routes/group.routes.js` / `user.routes.js`. They're identity-neutral reads, so not in
     `IDENTITY_ROUTES`.
2. **Server: take `dryRun` out of the destructive handlers.** The branch was never pushed or deployed (owner
   2026-10-27), so no client build sends it; the planning half moves to the plan routes.
3. **Client: fetch the plan from the plan route.**
   - `openRemove` in both pages calls `…/plan`.
   - On 404 or error: show "This server can't preview the removal", with the generic description.
   - **Remove stays enabled whether or not a plan arrived** (owner 2026-10-27). The plan informs; it never
     gates the action.
4. **Rule, written down.** Add to `packages/dms-server/CLAUDE.md` (auth section) and
   `src/dms/documentation/` where auth routes are described: a destructive route never takes a
   preview / dry-run flag; previews are separate read-only routes.
5. **Sweep.**
   - Check every other client call to a destructive route for a mode flag: CLI (`packages/dms/cli`), admin
     pattern, datasets, data-types plugins. The 2026-10-27 grep found none in `dms-server/src` outside these
     three handlers.
   - The CLI's own `--dry-run` options are client-side and fine.

## Files

- `packages/dms-server/src/auth/handlers/group.js`, `user.js`; `auth/routes/group.routes.js`, `user.routes.js`
- `packages/dms/src/patterns/auth/pages/authGroups.jsx`, `authUsers.jsx`
- `packages/dms-server/CLAUDE.md`; the v6 mockup note (remove once the plan is back)

## Testing checklist

- [ ] `tests/test-auth-groups.js` / `test-auth-users.js`:
  - each plan route returns the same plan the old `dryRun` did;
  - each plan route writes nothing (row counts and grants unchanged);
  - each plan route refuses what its destructive sibling refuses.
- [ ] A client against a server without the plan routes (master): opening the dialog makes no destructive call
  (request capture). The dialog shows the fallback, and Remove still works where the server allows it.
- [ ] Live on the rig: Groups and Users remove dialogs show the plan again; Remove applies it.
