# A switch to start dms-server without background jobs (fixes the deploy overlap)

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** next · **Created by:** rdubowsky@albany.edu · **Edited by:** —

Found 2026-10-29 while scoping dms-template's
[preview-slots.md](../../../../../planning/shared/tasks/current/preview-slots.md).

## Objective

Add one environment setting that starts dms-server without its background jobs: task recovery, task polling, the
schedule sweep and change-log compaction. A server that isn't the production one can then never recover, claim or
fire production's work. The first user is `deploy.sh`'s staging container. Later users would be any second server:
a preview server or a self-hosted copy (see the 2026-10-29 update in dms-template's
`research/qa-ticketing-system/agents-and-throwaway-db.md`).

## The bug it fixes

Read in the code on 2026-10-29. Not yet seen in practice.

During a server deploy, `deploy.sh` starts a staging container with the **same env file and the same `var` volume**
as the live one (`deploy.sh:454-461`). It runs beside the live container for up to `HEALTH_TIMEOUT` (180 s). The
volume holds `var/dama_host_id` (`src/dama/tasks/host-id.js:13-26`), so to the task queues both containers are the
same host. At boot, the staging container:
1. marks every task the live container is still running as `error` ("Server restarted while task was running"):
   `recoverStalledTasks` at `src/index.js:342` (DAMA) and `:355` (DMS), defined at `src/dama/tasks/index.js:302-313`;
2. starts polling (`src/index.js:343,357`), so it can claim a queued task and then be stopped partway through it;
3. joins the schedule sweep (`src/index.js:344`), so it can fire a due schedule and be stopped partway through the run.

So a server deploy during a running load, such as an NPMRDS download or a pattern duplicate, can mark it failed while
it's still running, or cut it off. To confirm it happens: compare the deploy times in `dms-template-deploys.jsonl` with
`data_manager.tasks` and `dms.tasks` rows whose error is that message.

## Proposed Changes

- One env setting, e.g. `DMS_BACKGROUND_JOBS=off`. Unset means today's behaviour. Precedent: `DMS_SSR`,
  `DMS_SYNC_COMPACT_DAYS`, `DMS_EXTRA_DATATYPES`. When it's off, skip:
  - per DAMA env: `recoverStalledTasks`, `startPolling`, `startScheduleSweep` (`src/index.js:340-345`);
  - DMS tasks: `recoverStalledTasks`, `startPolling` (`src/index.js:355-357`);
  - change-log compaction (`src/routes/sync/sync.js:648-680`).

  Log one line at boot saying the jobs are off.
- Requests still work, including ones that queue a task. On the staging container a queued task carries the shared
  host ID, so the live container runs it.
- dms-template's `deploy.sh` starts the staging container with the setting on. The new live container starts without
  it.
- Not covered: a datatype plugin's own timers, such as the routing graph's warm-load
  (`dms-template/data-types/routing/index.js:348-353`). That costs memory but changes no data.

## Files Requiring Changes

- `packages/dms-server/src/index.js`
- `packages/dms-server/src/routes/sync/sync.js`
- dms-template `deploy.sh`: the staging `docker run`

## Testing Checklist

- [ ] Booted with the setting off: the boot line appears; a task left `running` stays `running`; nothing new is
      claimed or fired.
- [ ] Booted without it: unchanged.
- [ ] Owner, on mercury: a server deploy during a long task leaves the task running through the staging phase.
