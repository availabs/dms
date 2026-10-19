# Datasets: permission checks on schedules, reruns and task status

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary), [dms_datasets_manager](../../../../../planning/initiatives/dms_datasets_manager.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Proposed changes

- [ ] Swap `requireAuth` for the core source middleware on each mutating route, resolving the source from the
  body, the schedule row or the task row.
- [ ] Gate the read routes (decision above). The GIS upload flow polls `events/query` during an upload, so its
  check must accept the uploader of an upload not yet tied to a source.
- [ ] Tests: schedule create/patch/delete/fire and rerun denied without `update-source`, allowed with it.

## Client to recheck

`dataTypes/schedule/SchedulePage.jsx:357` (`canEdit = !!user?.token`), `schedule/RunsPage.jsx:295` (rerun),
`pages/Tasks/*`, Admin-tab task lists. Gates in [permissions-ds-client-gates.md](./permissions-ds-client-gates.md).

## Testing checklist

- [ ] Tests above.
- [ ] Live: a granted user schedules, fires and reruns; an ungranted logged-in user can't, and sees why.
