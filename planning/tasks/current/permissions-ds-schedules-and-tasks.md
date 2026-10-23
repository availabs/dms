# Datasets: permission checks on schedules, reruns and task status

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** built · **Release:** commit — lib fc74b404, not pushed (branch permissions_move) · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

Part of [auth-levels-to-permissions.md](./auth-levels-to-permissions.md) (hub). Depends on
[permissions-server-source-auth-core.md](./permissions-server-source-auth-core.md).

## Objective

Any logged-in user can create, change, fire or delete a schedule on any source and rerun any task. Task
lists and events are readable by anyone.

## Routes

**`dms-server/src/dama/tasks/schedule-routes.js`** (`requireAuth` at `:27-34` = login only)

| line | route | check today | should need |
|---|---|---|---|
| `:37` | GET `/dama-admin/:pgEnv/schedulables` | none | none (registry) |
| `:48` | GET `…/schedules?source_id=` | none | `view-source` on the source |
| `:59` | POST `…/schedules` | login; `created_by=user.id` | `update-source` on `body.source_id` |
| `:96` | PATCH `…/schedules/:id` | login | `update-source` on the schedule's source |
| `:121` | DELETE `…/schedules/:id` | login | same |
| `:134` | GET `…/schedules/:id/runs` | none | `view-source` |
| `:149` | POST `…/schedules/:id/fire` | login | `update-source` |
| `:168` | POST `…/tasks/:taskId/rerun` | login; re-queues any task's descriptor | `update-source` on the task's `source_id`; tasks with no source → `edit-pattern` on the env's pattern, or `*` |

**Task status reads** (no check today; should need `view-source` on the task's source, or `update-source` if
descriptors can hold anything sensitive; decide):
- `dama/upload/index.js:49` GET `/dama-admin/dms/tasks/:taskId`
- `dama/upload/gis-routes.js:319` GET `/dama-admin/:pgEnv/events/query`
- `routes/uda/uda.tasks.route.js:58,77,103,130,154,182,206` falcor `uda[env].tasks.*` (length, byIndex, byId,
  forSource, events)

There is no task-cancel route. Out of scope.

## Decisions (owner, 2026-10-23)

- **Reads: a signed-in user now; per-source `view-source` waits for task 12** (read visibility), so reads move in
  one place. Only admin tabs and the upload wizard read these, and both are always signed in. Reads were open, so
  the login follows `DMS_SOURCE_AUTH_MODE`: `enforce` refuses anon (401, or nothing from falcor), `log` answers and
  logs `would-deny read … not signed in`, `legacy` answers.
- **No source → `edit-pattern` on the named datasets pattern** (`?dms_pattern=`); `${app} Admin` passes. The only
  source-less task today is GIS layer analysis (`gis/analysis`); publish / download tasks carry their source.

## Progress 2026-10-23 (built, committed lib fc74b404)

- [x] `schedule-routes.js`: `authorizeTarget` = `update-source` on the source (`wasOpen`: the routes needed only a
  login, so `legacy` / `log` allow and log), or `edit-pattern` with no source. Create judges `body.source_id`;
  patch / delete / fire judge the **stored** schedule's source; a patch that moves a schedule needs it on both
  sources; rerun judges the task row's `source_id`. A signed-in user comes first, so anon never learns whether
  an id exists (401 before 404). `created_by` = token user (as before); a rerun now records `rerun_by`.
- [x] Reads: `requireReader` (Express) / `readerAllowed` (falcor) in `routes/uda/sourceAuth.js`, on GET
  `schedules`, `schedules/:id/runs`, `dms/tasks/:taskId`, `events/query` and the seven `uda[env].tasks.*` gets
  (refused → `[]`). `/schedulables` stays open (the registry). Every client caller already sends the token
  (`authedFetch`); the GIS wizard's `events/query` poll included.
- [x] Client: `SchedulePage.jsx` `canEdit` and `RunsPage.jsx` Re-run gated on `isUserAuthed(['update-source'])`
  (SourcePage's source-merged check) instead of `user.token`.
- [x] Tests: `tests/test-schedule-auth.js` (13; 10 fail on the old code). Regression: `test-schedules` 29,
  `test-upload-auth` 37, `test-uda-auth` 28, `test-source-auth` 48, `test-data-auth` 49, `test-delete-cascade` 16,
  `test-upload-pipeline` 12 (SQLite). `npm run build` ✓. Not run on a Postgres DAMA db as a unit suite; the live
  check below ran on the rig's Postgres `test_dama`.
- [x] Live (hub Results, rows "M schedules"): enforce + log on the persistent rig.
- Not covered: a schedule's descriptor can name **other** sources (`source_id`-typed loader params, e.g.
  `npmrds_prod_id`); only the schedule's own source is judged. Reading those is task 12's question.
- Not covered: the stage-2 regression sample (A, D, F, G1, G5, H). Those fixtures aren't in the persistent rig.
  The code they exercise isn't touched here (`sourceAuth.js` only gained two functions); the unit suites above
  cover it.

## Client to recheck

`dataTypes/schedule/SchedulePage.jsx:357` (`canEdit = !!user?.token`), `schedule/RunsPage.jsx:295` (rerun),
`pages/Tasks/*`, Admin-tab task lists. Gates in [permissions-ds-client-gates.md](./permissions-ds-client-gates.md).

## Testing checklist

- [x] Tests above.
- [x] Live: a granted user schedules, fires and reruns; an ungranted logged-in user can't (controls hidden; 403
  "requires update-source on source 2" over HTTP).
