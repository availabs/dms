# Remove `/events/query` + `newContextId` REST compat shim

## Status: NOT STARTED — non-blocking follow-up from `dama-server-port`

## Objective

Remove the legacy `/events/query` polling endpoint and the `/etl/new-context-id` counter from `dms-server`'s upload routes. Both exist solely to keep the GIS Create wizard working without a Falcor rewrite — once the wizard polls UDA tasks via `uda[pgEnv].tasks.byId[id].events.*` directly, these endpoints are dead weight.

## Why this is its own task

When the DAMA server port shipped (2026-04-23), the GIS Create wizard hadn't been migrated to Falcor task polling. The shim let the rest of the port land without rewriting the wizard. The wizard works fine through the shim today; this is a cleanup, not a fix.

## Files

- `packages/dms-server/src/dama/upload/index.js` — drop the `app.get('/dama-admin/:pgEnv/etl/new-context-id', newContextId)` and `app.get('/dama-admin/:pgEnv/events/query', eventsQuery)` registrations
- `packages/dms-server/src/dama/upload/routes.js` — remove `newContextId` export and the `/etl/new-context-id` handler
- `packages/dms-server/src/dama/upload/gis-routes.js` — remove the `/events/query` handler (lines around 315–) and any helpers it uses
- `packages/dms-server/src/dama/upload/store.js` — `linkContext` / `getByContext` exist for the shim's upload-status path; remove if no other consumers remain after the wizard migration
- Client: GIS Create wizard at `packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/Create/` — switch from `${API_HOST}/etl/new-context-id` + `${API_HOST}/events/query` polling to `falcor.get(['uda', pgEnv, 'tasks', 'byId', taskId, 'events', ...])`. Match the polling pattern used by the existing UDA-based task pages (`UdaTaskList.jsx` / `UdaTaskPage.jsx`).

## Testing

- [ ] GIS upload via the Create wizard still works end-to-end after the rewrite
- [ ] `grep -rn "events/query\|newContextId\|new-context-id" packages/dms-server packages/dms` returns no results outside docs/tests
- [ ] No regression in existing UDA task pages

## Out of scope

- Any other DAMA-port follow-ups (the parent task is complete).
