# GIS publish worker — async progress + child-death detection

## Objective

Rewrite the ogr2ogr step inside `src/dama/upload/workers/gis-publish.js` so it
emits incremental progress events while the load is in flight, and so a silent
ogr2ogr crash surfaces as a failed task instead of stranding the task in
`status='running'` forever.

## Background — the bug

Symptom: large GIS uploads (e.g. 288k-feature, 145-column block GeoPackage)
sit at `status='running', progress=0.1` indefinitely with no new
`task_events` rows after `gis-dataset:ogr2ogr_start`. Examples observed in
`npmrds2`:

| task_id | started_at | status | progress | last event |
|---|---|---|---|---|
| 6771 | 2026-05-20 20:18:08 | running | 0.10 | `gis-dataset:ogr2ogr_start` @ +0.31 s |
| 6773 | 2026-05-20 20:31:19 | running | 0.10 | `gis-dataset:ogr2ogr_start` @ +0.18 s |

Both tasks have exactly 10 events, all written within the first 200 ms of the
worker, then nothing. The UI shows "no progress" — and there is no way to
tell from the task table whether ogr2ogr is still working, has slowed to a
crawl, or has died.

## Root cause

`src/dama/upload/workers/gis-publish.js:121` calls `execFileSync('ogr2ogr', …)`.
That is **synchronous**: the forked worker process blocks on the child until
ogr2ogr exits. Two consequences:

1. **No events can be dispatched while ogr2ogr is running.** The event loop is
   stuck on the child handle. Even if we wanted to ping a heartbeat, we
   can't.
2. **ogr2ogr's own stdout/stderr is buffered (`maxBuffer: 50 MB`) and only
   read after the child exits.** Even with `ogr2ogr -progress` the progress
   output never reaches `task_events` until ogr2ogr finishes — by which
   point the user wants the *result*, not progress.

A third consequence is that **a silent child-process death** (SIGKILL from
the OS, OOM kill, ogr2ogr segfault that writes nothing useful to stderr)
leaves the task row in `running` until the dms-server is restarted, at which
point `recoverStalledTasks` sweeps it. Until then, the UI shows a
permanently-running task.

There is already a clean async-spawn pattern in the same directory —
`src/dama/upload/workers/create-download.js:154` uses `spawn('ogr2ogr', …)`
with streaming stdout/stderr handlers, so this task is mostly a port.
`csv-publish.js` doesn't shell out, so it isn't affected.

## Scope

Included:

- Replace `execFileSync` with async `spawn` in `gis-publish.js`'s ogr2ogr
  step.
- Stream ogr2ogr's stderr line-by-line into `dispatchEvent` calls with type
  `gis-dataset:ogr2ogr_progress` (kebab format matches the existing
  `gis-dataset:*` namespace).
- Parse ogr2ogr's `-progress` output (it prints percent markers as it loads)
  and translate to `updateProgress()` calls — map ogr2ogr's 0-100% load span
  to the 0.10 → 0.70 window in the worker's overall progress (the rest of
  the worker uses 0.70 → 1.00 for the post-load steps).
- Add a heartbeat interval that emits a no-payload event (e.g. type
  `gis-dataset:ogr2ogr_heartbeat`) every 15 s while the child is alive even
  if it has produced no output. This is what distinguishes "slow" from
  "hung" downstream.
- Wire `child.on('exit', code)` and `child.on('error', err)` so any
  non-zero exit / signal kills the task with a clear error string. Keep
  the existing `try / finally` cleanup of the temp table on failure.
- **Public-URL env-var rename + loud warning when missing** (see §
  "Public-URL resolution" below). Same file, same worker — naturally
  bundles into this change.

Excluded:

- Switching csv-publish.js to anything different — it doesn't shell out.
- Changes to `runWorkerInBackground` / `worker-runner.js` — the worker
  itself is the thing that needs to become event-loop-friendly; the
  surrounding plumbing is fine.
- Generalised stalled-task detection beyond gis-publish (e.g. a
  per-task watchdog in the polling loop). If we want that, it's a
  separate task — keep this one focused.

## Current state

`gis-publish.js` step ordering:

1. `dispatchEvent('gis-dataset:INITIAL')` + `createDamaView` + `ensureSchema`
2. `updateProgress(0.05)` + `dispatchEvent('gis-dataset:VIEW_CREATE')`
3. `updateProgress(0.1)` + `dispatchEvent('gis-dataset:ogr2ogr_start')`
4. **`execFileSync('ogr2ogr', args, …)`** ← blocking gap is here
5. `updateProgress(0.7)` + `dispatchEvent('gis-dataset:ogr2ogr_end')`
6. Discover temp columns + create final table + `INSERT … SELECT` + spatial
   index + `ANALYZE` (progress 0.7 → 0.9)
7. Write source.metadata.columns + view.metadata.tiles + `updateProgress(1)`
8. `dispatchEvent('gis-dataset:FINAL')` and return the result

## Proposed change

Replace step 4 with the spawn-based loader sketched below. Code style
matches the existing worker — no helper modules, no convenience wrappers.

```js
const { spawn } = require('child_process');

// Run ogr2ogr asynchronously so the event loop stays alive. Stream stderr
// into task_events as `gis-dataset:ogr2ogr_progress` and update progress
// from the percent markers ogr2ogr emits with `-progress`.
async function runOgr2OgrAsync(args, taskCtx, taskId) {
  const { dispatchEvent, updateProgress } = taskCtx;

  return new Promise((resolve, reject) => {
    const child = spawn('ogr2ogr', ['-progress', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrTail = '';
    let lastPercent = 10;          // matches the 0.10 we set before spawn
    const HEARTBEAT_MS = 15_000;
    const heartbeat = setInterval(() => {
      dispatchEvent('gis-dataset:ogr2ogr_heartbeat',
        `ogr2ogr still running (last progress ${lastPercent}%)`, null)
        .catch(() => {});
    }, HEARTBEAT_MS);
    heartbeat.unref();

    const emitLine = (line) => {
      if (!line) return;
      // ogr2ogr's -progress prints "10...20...30..." style dots; pluck the
      // last number seen on the line.
      const m = line.match(/(\d{1,3})\s*%?\s*\.{2,3}/g);
      if (m) {
        const last = +m[m.length - 1].match(/\d+/)[0];
        if (last > lastPercent && last <= 100) {
          lastPercent = last;
          // Map 0..100 in ogr2ogr space to 0.10..0.70 in worker progress space.
          const p = 0.10 + (last / 100) * 0.60;
          updateProgress(p).catch(() => {});
          dispatchEvent('gis-dataset:ogr2ogr_progress',
            `ogr2ogr ${last}%`, { ogr2ogr_percent: last })
            .catch(() => {});
        }
      } else {
        // Real diagnostic line — surface as a log event.
        dispatchEvent('gis-dataset:ogr2ogr_progress', line.slice(0, 240), null)
          .catch(() => {});
      }
    };

    child.stdout.on('data', d => emitLine(String(d).trim()));
    child.stderr.on('data', d => {
      const s = String(d);
      stderrTail = (stderrTail + s).slice(-2048);
      for (const line of s.split('\n')) emitLine(line.trim());
    });

    child.on('error', (err) => {
      clearInterval(heartbeat);
      reject(new Error(`ogr2ogr spawn failed: ${err.message}`));
    });
    child.on('exit', (code, signal) => {
      clearInterval(heartbeat);
      if (code === 0) return resolve();
      const reason = signal ? `killed by signal ${signal}` : `exit code ${code}`;
      reject(new Error(`ogr2ogr ${reason}: ${stderrTail.trim() || '(no stderr)'}`));
    });
  });
}
```

The `dispatchEvent`/`updateProgress` calls intentionally do not `await` — we
don't want to block the stdout consumer waiting on a DB INSERT. They're
fire-and-forget; the `.catch(() => {})` swallows the rare insert failure
without crashing the worker. The existing worker code uses the same pattern.

The main worker body changes one line:

```diff
- execFileSync('ogr2ogr', args, { maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
+ await runOgr2OgrAsync(args, ctx, task.task_id);
```

The existing `try { … } catch (err) { … } finally { fs.unlinkSync(sqlFile) }`
wrapper stays — the rejected promise lands in the same catch with the
error already stringified.

## Public-URL resolution (bundled fix)

### What's wrong today

Same file, line 311:

```js
tiles: [`${process.env.DAMA_SERVER_URL || ''}/dama-admin/${pgEnv}/tiles/${view_id}/{z}/{x}/{y}/t.pbf`],
```

Two problems:

1. The env-var name `DAMA_SERVER_URL` is a leftover from the legacy DAMA
   server; the rest of the codebase has converged on **`DMS_PUBLIC_URL`**
   (used by `data-types/now_playing/routes.js#resolveBaseUrl` and
   documented in `dms-template/src/dms/packages/dms-server/src/dama/CLAUDE.md`).
   New deployers reading the CLAUDE.md set `DMS_PUBLIC_URL` and the worker
   silently ignores it.
2. When neither var is set, the fallback `''` produces a relative URL like
   `/dama-admin/npmrds2/tiles/3436/{z}/{x}/{y}/t.pbf`. MapLibre may resolve
   that against the current page origin in some embeds, but breaks
   wherever the GIS view is rendered from a different host (most of the
   real consumers). Worst of all, the failure is silent — the view
   publishes "successfully" and the broken URL only surfaces when a user
   tries to view the map.

### Real-world impact (observed 2026-05-20)

10 views in production `npmrds2` were written with relative tile URLs and
had to be hand-backfilled via SQL (audit query + `jsonb_set` update —
recorded under "Operational notes" below). The deploy on
`dmsserver.availabs.org` simply doesn't have `DAMA_SERVER_URL` set.

### Proposed change

In `gis-publish.js`:

- Read **`DMS_PUBLIC_URL` first**, then fall back to `DAMA_SERVER_URL` for
  back-compat with any deploy that already set the old name, then fail
  loud.
- **No silent empty-string fallback.** If neither var is set, log a
  prominent warning to the worker stdout (the parent server's
  `[task:NNNN]` prefix already proxies this into the console) AND
  emit a `gis-dataset:public_url_missing` event with a clear message, so
  the task detail page surfaces the issue. The relative URL still goes
  into the metadata (better than nothing for dev / localhost setups) but
  the user knows something is wrong.

Code shape (place at the top of the worker, near the existing
`require`s — no helper module):

```js
function resolvePublicUrl(ctx) {
  const fromNew = process.env.DMS_PUBLIC_URL;
  if (fromNew) return fromNew.replace(/\/$/, '');
  const fromOld = process.env.DAMA_SERVER_URL;
  if (fromOld) {
    console.warn(`[gis-publish] Using legacy DAMA_SERVER_URL; prefer DMS_PUBLIC_URL going forward.`);
    return fromOld.replace(/\/$/, '');
  }
  console.warn(`[gis-publish] Neither DMS_PUBLIC_URL nor DAMA_SERVER_URL is set — tile URLs will be relative and likely unreachable from other origins.`);
  ctx.dispatchEvent(
    'gis-dataset:public_url_missing',
    'Set DMS_PUBLIC_URL on the dms-server deploy to produce absolute tile URLs.',
    null,
  ).catch(() => {});
  return '';
}
```

Then at line 311:

```diff
- tiles: [`${process.env.DAMA_SERVER_URL || ''}/dama-admin/${pgEnv}/tiles/${view_id}/{z}/{x}/{y}/t.pbf`],
+ tiles: [`${resolvePublicUrl(ctx)}/dama-admin/${pgEnv}/tiles/${view_id}/{z}/{x}/{y}/t.pbf`],
```

`resolvePublicUrl` is called inside the worker (which has `ctx`), not at
module import time, so the env vars are read at task-run time. That matters
when the dms-server is started with `--env-file-if-exists` after the
worker module is first loaded.

### Related callers to revisit (out of scope for this task — flag only)

`dama-nfip-claims-migration.md:252` is also planning to use
`process.env.DAMA_SERVER_URL` in its publish worker (file not yet written).
When that task is picked up it should adopt the same `resolvePublicUrl`
pattern. Cross-link this task from there before starting work.

## Files requiring changes

- `dms-template/src/dms/packages/dms-server/src/dama/upload/workers/gis-publish.js`
  - Drop the `execFileSync` require, add `spawn`.
  - Insert the `runOgr2OgrAsync` helper inside the same file (don't extract
    — repeats nowhere else and the surrounding context is small).
  - Replace the one call site (line 121).
  - Update the `console.log` line above the call so it reads
    "Running ogr2ogr (async, …)".
  - Add `resolvePublicUrl(ctx)` helper near the top of the worker;
    replace the `${process.env.DAMA_SERVER_URL || ''}` interpolation at
    line 311 with `${resolvePublicUrl(ctx)}`.
- `dms-template/src/dms/packages/dms-server/Dockerfile`
  - Update the comment block (line 12) so the canonical env var is
    `DMS_PUBLIC_URL` (with `DAMA_SERVER_URL` noted as a deprecated alias).

No other source files. No new dependencies. No schema changes.

## Testing checklist

### Async progress
- [ ] Re-upload the 288k-block GeoPackage (`employment_by_industry_block_2022.gpkg`)
      and confirm the dms-server console log shows ongoing `[task:NNNN]`
      ogr2ogr progress output while the load runs.
- [ ] Query `data_manager.task_events` mid-load; the task should have many
      `gis-dataset:ogr2ogr_progress` rows plus a `gis-dataset:ogr2ogr_heartbeat`
      every 15 s. The `tasks.progress` value should climb 0.10 → 0.70 as
      ogr2ogr advances.
- [ ] Re-upload a small GeoPackage (a few hundred features) and confirm the
      worker still completes cleanly with the new progress events
      interleaved with the existing post-load events
      (`gis-dataset:ogr2ogr_end`, `…:FINAL`).
- [ ] Simulate a child crash by killing the spawned ogr2ogr process while
      it's loading (`pkill -9 ogr2ogr` on the worker host). Verify the task
      transitions to `status='error'` with an error string mentioning
      the signal, instead of staying in `running`.
- [ ] Confirm the UI Tasks list (`UdaTaskList`) and detail page
      (`UdaTaskPage`) render the new event types — they don't need
      template changes (events are rendered generically) but the EVENT_ATTRS
      and column rendering should not regress.

### Public-URL resolution
- [ ] With `DMS_PUBLIC_URL=https://dmsserver.availabs.org` set, publish a
      view and confirm the new row's `metadata.tiles.sources[0].source.tiles[0]`
      is `https://dmsserver.availabs.org/dama-admin/...` (absolute).
- [ ] With only `DAMA_SERVER_URL` set (back-compat path), confirm the
      tile URL still works and the console emits the deprecation warning.
- [ ] With neither set, confirm the worker emits a
      `gis-dataset:public_url_missing` event on the task, logs a warning
      to stdout, and the tile URL is still written (relative) so the
      task completes rather than failing hard.

## Related work / follow-ups (out of scope for this task)

- Currently no per-task watchdog catches dead-child cases between server
  restarts. If we want a generalised heartbeat-timeout sweep (`tasks` whose
  `progress` hasn't moved in N minutes get marked errored), open a separate
  task — needs a design decision on the timeout and on whether it runs in
  the polling loop or as a cron-style sweep.
- `csv-publish.js` doesn't shell out, but it does stream large CSV files
  through `pg-copy-streams`. The progress-emission story there is different
  — handle separately if/when the same "stuck" pattern shows up.
- The two tasks observed stuck in `npmrds2` (6771 from prod host, 6773 from
  local host) can be manually transitioned via:
  ```sql
  UPDATE data_manager.tasks
  SET status = 'error',
      error  = 'Stuck at ogr2ogr_start before spawn-based worker rewrite',
      completed_at = NOW()
  WHERE task_id IN (6771, 6773) AND status = 'running';
  ```
  Apply when convenient; not part of this task.

### Operational note — backfill already applied (2026-05-20)

10 views in production `npmrds2` had relative tile URLs because
`DAMA_SERVER_URL` was unset on the deploy. Audit + backfill applied via:

```sql
-- audit
SELECT view_id, source_id,
       metadata->'tiles'->'sources'->0->'source'->'tiles'->>0 AS tile_url
  FROM data_manager.views
 WHERE metadata->'tiles'->'sources'->0->'source'->'tiles'->>0 LIKE '/dama-admin/%';

-- backfill (prepends the prod host to every matching tiles[0])
UPDATE data_manager.views
   SET metadata = jsonb_set(
       metadata,
       '{tiles,sources,0,source,tiles,0}',
       to_jsonb('https://dmsserver.availabs.org' || (metadata->'tiles'->'sources'->0->'source'->'tiles'->>0))
   )
 WHERE metadata->'tiles'->'sources'->0->'source'->'tiles'->>0 LIKE '/dama-admin/%';
```

Affected views (now corrected): 3375, 3395, 3430, 3431, 3432, 3433, 3436,
3437, 3438, 3439. Re-running the audit after the backfill returns 0 rows.

The proper fix is the env-var rename + loud warning in this task — until
the deploy actually sets `DMS_PUBLIC_URL`, the next GIS publish will write
another relative URL and require another backfill.
