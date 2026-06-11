# Scheduled data-loader runs — cron scheduling + run-history UI for the datasets pattern

> DMS-library task (dms-server + datasets pattern). Driven by the TransportNY data-type migration:
> the legacy dama system ran npmrds/transcom ingestion on pg-boss cron schedules; the new task runner
> has **no scheduling at all**. This task adds it — server-side cron execution of data-type loaders,
> an **authorable UI for creating/editing cron runs**, and a **run-history UI to understand and
> interrogate past runs**. Cross-links: ETL migration
> [`planning/transportny/tasks/current/migrate-data-type-etl-to-dms.md`](../../../../../../planning/transportny/tasks/current/migrate-data-type-etl-to-dms.md)
> (the §Scheduling seams were built for this task), legacy UI reference
> `transportNY/src/pages/TransportNYDataTypes/schedule/{create,list,publish}.jsx`.

## How the legacy system actually runs npmrds + transcom (port this faithfully)

From the deep-dive of `avail-falcor` (verified against source):

**Mechanism** — pg-boss. Cron rows persist in the `pgboss.schedule` table (tz `America/New_York`);
queue names `<host_id>:s<source_id>[_v<view_id>]_t<epoch>`; on fire, pg-boss enqueues a job whose
payload carries `{ initial_event, source_id, worker_path, type }`. A thin **schedule worker** (separate
file from the ETL worker) runs in-process, computes the next window, and calls `queueTask` for the real
ETL worker — which then runs through the normal etl_context/event pipeline. On server restart,
`setUpPgBoss` re-registers consumers from the `pgboss.schedule` rows (`REGISTER_CRONS_ON_RESTART`).

**What ran on schedules:**
| Loader | Cadence | Next-window logic | Idempotency |
|---|---|---|---|
| `npmrds_raw` (RITIS download) | rolling, ~monthly chunks | `start = max(views.metadata.end_date)+1d`, `end = start+1mo` capped at Dec 31; hardcoded `stateCodes:['NY']` | the **only** stateful one — reads `end_date` from view metadata |
| `npmrds` (raw→prod add) | weekly | last complete Mon–Sun window | none (stateless; double-fire = duplicate run) |
| `transcom` (event ingest) | daily | yesterday 00:00:00–23:59:59 | none |
| chained: `npmrds_raw` → `npmrds/add` | after scheduled download | `statistics.worker` auto-queues `npmrds/add` when `scheduledDataDownload && npmrds_prod_id` and dates line up (`isNextDay` check; on mismatch: an ERROR event, **no retry, no alert** — a known weakness) |

**Legacy weaknesses to fix, not copy:** no duplicate-window guard for npmrds/transcom; worker paths
stored as absolute file paths (broke on moves — incl. an actual filename bug in `schedule.worker.mjs`);
silent date-mismatch failures; schedules invisible to users (no UI to see what's scheduled or what ran).

## What the new system already has (seams built during the ETL migration)

- `data_manager.tasks` / `task_events` + the poll loop (`DAMA_TASK_POLL_INTERVAL`, default 5s); workers
  registered **by name** (`registerDatatype` → `workers` map) — no file paths.
- Every ported loader takes a **self-contained descriptor** (no request state) and **persists
  `views.metadata.{start_date,end_date}`** after success.
- Pure **`computeNextWindow`** helpers already exist: `data-types/npmrds_raw/dates.js` (rolling-month,
  year-capped) and `data-types/transcom/dates.js` (daily-yesterday) — written explicitly as the
  scheduling seam, unit-tested.
- Resume/idempotency markers (`resume_v2`, blob `probe` keys), retry classification for transient CH
  errors (currently driver-level — upstream into the runner here).
- The datasets pattern already polls task events via `etl_context_id` (= task_id) — the run-detail UI
  builds on this.

## Design

### 1. Server — `data_manager.schedules` + a due-schedule sweep

New table (migration in `dms-server/src/db/sql/dama/`):
```sql
CREATE TABLE data_manager.schedules (
  schedule_id   SERIAL PRIMARY KEY,
  source_id     INTEGER REFERENCES data_manager.sources(source_id) ON DELETE CASCADE,
  worker_path   TEXT NOT NULL,            -- registry key, e.g. 'npmrds_raw/publish'
  cron          TEXT NOT NULL,            -- 5-field cron
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  descriptor    JSONB NOT NULL,           -- the descriptor TEMPLATE (window fields filled at fire time)
  enabled       BOOLEAN NOT NULL DEFAULT true,
  max_in_flight INTEGER NOT NULL DEFAULT 1,   -- duplicate guard: skip fire if N runs still queued/running
  last_task_id  INTEGER,
  last_fired_at TIMESTAMP,
  next_fire_at  TIMESTAMP,                -- materialized for cheap sweeps + UI display
  created_by    INTEGER, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
```
Scheduler = a second interval in `dama/tasks` (same process as the poll loop): every tick, claim due
rows (`enabled AND next_fire_at <= now()` with `FOR UPDATE SKIP LOCKED` — multi-host safe), then per
schedule: (a) **duplicate guard** — count tasks for (source_id, worker_path) in queued/running ≥
max_in_flight → skip + record a `schedule:SKIPPED_BUSY` event; (b) build the concrete descriptor (next
section); (c) `queueTask(descriptor, pgEnv)`; (d) update `last_*` + recompute `next_fire_at`.
Cron parsing via the `cron-parser` package (tiny, battle-tested; computes next_fire_at in tz).

### 2. Plugin contract addition — `schedulables`

A plugin opts a worker into scheduling by exposing how to turn "the schedule fired" into a descriptor:
```js
module.exports = {
  workers: { 'npmrds_raw/publish': worker },
  schedulables: {
    'npmrds_raw/publish': {
      label: 'NPMRDS raw download (RITIS)',
      defaultCron: '0 2 1 * *',
      // params the author can set in the UI (rendered as a form):
      params: [{ name: 'states', type: 'string[]', default: ['NY'] }, { name: 'npmrds_prod_id', type: 'source_id', optional: true }],
      // fire-time window computation — gets db access to read prior state:
      async buildDescriptor({ schedule, db, pgEnv }) {
        const latestEnd = /* max(views.metadata.end_date) for schedule.source_id */;
        return { ...schedule.descriptor, ...computeNextWindow({ latestEndDate: latestEnd }) };
      },
      // optional guard: refuse a fire (e.g. RITIS ≤1/day budget, date-gap mismatch)
      async preflight({ schedule, descriptor, db }) { /* return { ok, reason } */ },
    },
  },
};
```
`registerDatatype` collects `schedulables` into a registry the scheduler + UI both read. **Built-in
preflights to ship:** npmrds_raw — enforce the **RITIS ≤1-download-per-day budget server-side** (count
RITIS-hitting tasks in the last 24h across ALL sources, refuse + event when exceeded); npmrds add —
the legacy `isNextDay` gap check, but failing **loudly** (a `schedule:BLOCKED` event surfaced in the
UI, not a silent log line).

### 3. Routes (dama-admin)

`GET/POST/PATCH/DELETE /dama-admin/:pgEnv/schedules` (+ `GET /schedules/:id/runs` = tasks created by
the schedule, `POST /schedules/:id/fire` = run-now). `GET /dama-admin/:pgEnv/schedulables` enumerates
the registry (what loaders CAN be scheduled + their param forms). Auth: same `requireAuth` as other
mutating dama routes.

### 4. UI — datasets pattern

Two new source-page slots (registered like `table`/`map`/`metadata` in `defaultPages.js` so any
schedulable data type inherits them):

**(a) "Schedule" page (authorable cron UI).** Per source: list its schedules (cron rendered
human-readably + next-fire countdown + enabled toggle); "New schedule" form — pick the loader (from
`/schedulables`, filtered to the source's type), cadence presets (Daily / Weekly / Monthly / custom
cron with live "next 3 fires" preview), the plugin's param form, max_in_flight. Edit/disable/delete.
Run-now button (calls `/fire`, navigates to the run). Legacy reference for look/flow:
`TransportNYDataTypes/schedule/{create,list}.jsx` (ports of the pg-boss UI — same author intent,
rebuilt on the new routes).

**(b) "Runs" page (interrogate past runs).** Per source: a table of tasks (scheduled AND manual) —
started/finished, duration, status chip (queued/running/done/error/skipped-busy/blocked), progress,
which schedule fired it (or "manual"), rows/result summary from `tasks.result`. Click into a run →
**run detail**: the `task_events` timeline (the workers already emit rich phase events — INITIAL,
per-phase, per-county, FINAL/ERROR), the descriptor that ran (window, params), the error + which
phase, links to the view(s) it created/updated, and a "re-run with same descriptor" button. Filter by
status/date; surface `SKIPPED_BUSY`/`BLOCKED` prominently so silent-failure legacy behavior is gone.

### 5. Runner hardening (pulled in because schedules run unattended)

- Upstream the **transient-CH retry** (socket hang up/ECONNRESET classification + capped retries with
  resume markers) from the backfill drivers into `startTaskWorker` / a worker-side helper.
- `tasks` gains `attempt`/`max_attempts`; scheduler-created tasks default to retry-on-transient.
- A failure terminal event always exists (workers already throw → `status='error'`; ensure the events
  timeline shows it).

## Phases

### P1 — Server core — DONE (2026-06-10)

- [x] `data_manager.schedules` migration: `dms-server/src/db/sql/dama/create_dama_schedule_tables.sql`
      (+ `.sqlite.sql` twin), wired via `initDamaSchedules` in `db/index.js` (runs after
      `initDamaTasks` for `role: "dama"` configs).
- [x] `cron-parser` ^5.5.0 dependency in dms-server (`CronExpressionParser.parse(cron, { tz })`);
      tz math verified in tests (02:00 America/New_York → 06:00Z EDT / 07:00Z EST).
- [x] Scheduler sweep: `dms-server/src/dama/tasks/schedules.js` — `sweepDueSchedules` +
      `startScheduleSweep(pgEnv)` interval (env `DAMA_SCHEDULE_SWEEP_INTERVAL`, default 30s),
      started beside `tasks.startPolling(env)` in `src/index.js`.
- [x] Duplicate guard: count queued/running tasks for (source_id, worker_path) vs `max_in_flight`
      → skip + `schedule:SKIPPED_BUSY` event.
- [x] Plugin `buildDescriptor` + optional `preflight` at fire time; refusal (or buildDescriptor
      throw) → `schedule:BLOCKED` event, no task.
- [x] `registerDatatype` collects `schedulables`; `getSchedulables()` exported from
      `dms-server/src/dama/datatypes/index.js`.
- [x] Routes: `dms-server/src/dama/tasks/schedule-routes.js`, mounted in `src/index.js` after the
      JWT middleware beside `registerUploadRoutes`. GET/POST/PATCH/DELETE `/dama-admin/:pgEnv/schedules`,
      GET `/schedules/:id/runs`, POST `/schedules/:id/fire`, GET `/schedulables`. Mutations require
      `req.availAuthContext.user` (401 otherwise); reads open like `/events/query`.
- [x] P5-hardening pulled forward (server side): `tasks` gained `attempt`/`max_attempts`/`schedule_id`
      columns; `startTaskWorker` retries transient errors
      (`/socket hang up|ECONNRESET|ETIMEDOUT|EPIPE|fetch failed/i`) by requeueing the SAME task row
      (same descriptor/task_id) with `attempt+1` + a `retry` task_event, up to `max_attempts`.
      Scheduler-created tasks default `max_attempts: 3`; manual `queueTask` defaults to 1 —
      existing behavior unchanged.
- [x] Tests: `dms-server/tests/test-schedules.js` (npm run test:schedules) — 26 tests: table init,
      tz next_fire_at math, route CRUD + auth + validation, due-sweep fire with fake schedulable,
      duplicate guard, preflight BLOCKED, buildDescriptor-failure BLOCKED, run-now, PATCH/disable,
      transient retry (success on 3rd, error at max, non-transient never retries).

**Design notes (deviations from the original sketch):**

- **Schedule-scoped events table.** SKIPPED_BUSY/BLOCKED fires create no task row, and
  `task_events.task_id` is NOT NULL — recording them against `last_task_id` would mis-attribute
  them to an old run (or be impossible on first fire). Added `data_manager.schedule_events`
  (`schedule_id, type, message, payload, created_at`) in the same migration; surfaced via
  `GET /schedules/:id/runs` → `{ tasks, events }`.
- **`tasks.schedule_id` column** (not in the original DDL sketch) so the runs listing and the
  Runs UI can join tasks to the schedule that fired them without parsing descriptors.
- **Timestamps are UTC wall-clock strings** (`YYYY-MM-DD HH:MM:SS`) for `next_fire_at`/
  `last_fired_at`, written and compared against a JS-computed UTC now — identical semantics on
  postgres `TIMESTAMP` and sqlite `TEXT` regardless of server timezone (postgres `NOW()` is
  server-local and would skew comparisons).
- **Due-row claim**: postgres uses one atomic
  `UPDATE … SET next_fire_at = NULL WHERE schedule_id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`
  (claiming nulls `next_fire_at` so no other host can double-claim; the sweep recomputes it
  immediately, BEFORE firing, so a crash mid-fire can't wedge the schedule into refiring every
  tick). sqlite uses a plain `BEGIN IMMEDIATE` transaction — single-writer DB, no SKIP LOCKED
  equivalent and none needed.
- **Run-now goes through the same guard + preflight path** as the sweep (the RITIS budget applies
  to manual fires too); it does not touch `next_fire_at`.
- **Existing databases** get `attempt`/`max_attempts`/`schedule_id` retrofitted by idempotent
  ALTERs inside `initDamaSchedules` (sqlite checks `pragma_table_info`; postgres uses
  `ADD COLUMN IF NOT EXISTS`). Fresh databases get them from `create_dama_task_tables.*` directly.
- `schedule.descriptor` is normalized to an object (and `enabled` to a boolean) before plugin
  callbacks see the row — plugins never deal with sqlite JSON strings.

### P2 — Plugin opt-ins — DONE (2026-06-10)

- [x] `npmrds_raw/publish` (`data-types/npmrds_raw/index.js`) — rolling-month window via
      `dates.computeNextWindow` over max(views.metadata.end_date) of the schedule's source; params
      `states` (default `['NY']`) + `npmrds_prod_id` (optional, chained add); descriptor sets
      `scheduledDataDownload: true` and rehydrates `tmc_identification_source_id`/`name` from the
      source row. **RITIS daily-budget preflight** (global across ALL sources, manual fires too):
      `SELECT COUNT(*) FROM data_manager.tasks WHERE worker_path='npmrds_raw/publish' AND status IN
      ('queued','running','done') AND queued_at > NOW() - INTERVAL '24 hours'`
      (sqlite: `datetime('now','-24 hours')`) — any hit refuses with BLOCKED. Errored runs do NOT
      consume the budget (a crashed download made no RITIS export; same-day retry stays possible).
- [x] `transcom/add` (`data-types/transcom/index.js`) — daily-yesterday via
      `dates.computeNextWindow`; target view = `params.view_id` or the latest view of the source.
      **Picked `add` over `publish`** for the daily cadence: publish creates a NEW view per run
      (bulk/initial path); the legacy schedule worker also ran the incremental path.
- [x] `npmrds/add` — weekly last-complete-Mon–Sun via new pure helpers in
      `data-types/npmrds/dates.js` (`lastCompleteWeek`, `isNextDay`); buildDescriptor resolves the
      prod view + the raw views of `params.npmrds_raw_source_id` whose metadata window overlaps the
      week (none → throw → BLOCKED); preflight = the legacy `isNextDay` gap check failing LOUDLY
      (BLOCKED event) when the prod view `end_date` doesn't abut the window start; missing
      `end_date` (initial population) passes.
- [x] `excessive_delay/publish` (mode `add`) — previous-complete-month via new
      `delay.previousCompleteMonth`; refs reused from the latest view's metadata (the same
      metadata-reuse path as the /add route; missing refs → throw → BLOCKED).
- [x] `transcom/congestion` — previous-complete-month via new `dates.previousCompleteMonth`;
      `transcom_source_id` from params or source metadata (neither → throw → BLOCKED); legacy
      conflation defaults 237/236/238 materialized into the descriptor.
- [x] Tests (TDD — all watched fail first): unit
      `npmrds/tests/dates.unit.test.mjs` (new, 7), `transcom/tests/dates.unit.test.mjs`
      (+3 previousCompleteMonth), `excessive_delay/tests/delay.unit.test.mjs` (+2); integration
      `<plugin>/tests/schedule.integration.js` × 4 (npmrds_raw 8 — incl. the budget query against
      the sqlite tasks table; transcom 6; npmrds 7; excessive_delay 4).

**Design notes (P2):**

- All `buildDescriptor` outputs are fully self-contained and match what the workers already
  consume (field-for-field with what each plugin's route queues) — verified against
  `npmrds_raw/worker.js`, `transcom/workers/{add,congestion}.js`, `npmrds/worker.js#add`,
  `excessive_delay/worker.js` descriptor reads.
- `excessive_delay` and `transcom/congestion` schedulables only reuse refs already resolved on
  the view/source metadata; re-picking newer npmrds/transcom sources remains a manual /add-route
  operation (a schedule should not silently re-resolve to a different upstream).
- The npmrds/add "chain-after-download option" from the original P2 sketch is covered from the
  other side: `npmrds_raw`'s schedulable carries `npmrds_prod_id` + `scheduledDataDownload: true`
  in its descriptor (the legacy statistics.worker chaining contract), and the standalone weekly
  `npmrds/add` schedule covers the no-chain cadence.
- **P3 — UI:** Schedule + Runs page slots in the datasets pattern + `defaultPages.js` registration +
  the two forms; events-timeline run detail. Follow the page-component contract
  (`{source, context}` + DatasetsContext; `uda` falcor for reads, REST for mutations).
- **P4 — Hardening + docs:** retry upstreaming, `data-types/CLAUDE.md` §schedulables contract,
  methodology/ops docs (incl. the RITIS budget rule), golden path: schedule transcom daily on dev,
  watch a fire end-to-end.

## Acceptance
- [x] An author can, from a source page, create "download npmrds_raw monthly at 02:00" with state
      params, see the next-fire preview, and disable/edit/delete it — no code, no SSH.
      *(P3 SchedulePage: presets + custom cron + live next-3-fires preview + string[]/source_id
      param form + enabled toggle/edit/delete; live golden-path walkthrough on dev = P4)*
- [x] Fires create normal `data_manager.tasks` visible in the Runs UI within one poll interval; the
      duplicate guard provably skips when a prior run is still going (event recorded, visible).
      *(P3 RunsPage interleaves SKIPPED_BUSY/BLOCKED schedule events with the task rows;
      guard itself proven in test-schedules.js)*
- [x] RITIS budget preflight blocks a second same-day download attempt with a visible BLOCKED event.
      *(P3: run-now refusals render type+reason inline on the schedule row; BLOCKED events appear
      in the Runs listing; server side proven in npmrds_raw/tests/schedule.integration.js)*
- [x] A failed scheduled run is diagnosable entirely from the Runs UI (phase, error, descriptor) and
      re-runnable with one click. *(P3 run detail: events timeline + error block + descriptor with
      window chips + "Re-run with same descriptor" via the new POST /tasks/:id/rerun)*
- [x] Restart-safe: schedules live in the DB; `next_fire_at` sweep needs no in-memory
      re-registration (`startScheduleSweep` reads only the table; nothing is registered at boot).
- [x] All legacy cadences reproducible server-side (weekly npmrds/add, rolling npmrds_raw, daily
      transcom/add, monthly congestion/excessive_delay, chained add via
      `scheduledDataDownload`+`npmrds_prod_id`).

## Progress log

- **2026-06-10 — P1 complete (server core + P5 server-side hardening).** New files:
  `dms-server/src/dama/tasks/schedules.js` (sweep/CRUD/fire), `schedule-routes.js` (REST),
  `db/sql/dama/create_dama_schedule_tables.{sql,sqlite.sql}`, `tests/test-schedules.js` (26 tests).
  Modified: `dama/tasks/index.js` (queueTask schedule_id/max_attempts + transient retry),
  `dama/datatypes/index.js` (schedulables registry), `db/index.js` (initDamaSchedules),
  `db/sql/dama/create_dama_task_tables.{sql,sqlite.sql}` (attempt/max_attempts/schedule_id),
  `src/index.js` (route mount + sweep start), `package.json` (cron-parser, test:schedules).
  All dms-server suites green (`npm test`, `test:tasks` 22, `test:datatypes` 9, `test:schedules` 26).
  TDD: test-schedules.js written first, watched fail (MODULE_NOT_FOUND → no such table → green).

- **2026-06-10 — P2 complete (plugin opt-ins).** New: `data-types/npmrds/dates.js`,
  `data-types/{npmrds_raw,transcom,npmrds,excessive_delay}/tests/schedule.integration.js`,
  `data-types/npmrds/tests/dates.unit.test.mjs`. Modified: the four plugin `index.js` files
  (`schedulables` blocks), `transcom/dates.js` + `excessive_delay/delay.js`
  (`previousCompleteMonth`), their unit-test files. Full
  `node data-types/run-tests.js`: 301 vitest units (was 289) + all integration scripts green,
  incl. the 4 new schedule scripts (25 tests). No P3 (UI) work — the routes + `/schedulables`
  registry are the contract the UI consumes.

- **2026-06-10 — P3 complete (Schedule + Runs UI).** New:
  `packages/dms/src/patterns/datasets/pages/dataTypes/schedule/{scheduleUtils.js,SchedulePage.jsx,RunsPage.jsx}`.
  Modified: `…/dataTypes/defaultPages.js` (+'schedule'/'runs', DAMA-only via cdn),
  `dms-server/src/dama/tasks/schedule-routes.js` (+POST /tasks/:taskId/rerun — the only server
  change), `dms-server/tests/test-schedules.js` (+3 rerun tests, now 29; watched fail first),
  `data-types/{npmrds_raw,transcom,npmrds,excessive_delay}/pages/index.jsx` (defaultPages opt-in),
  `data-types/CLAUDE.md` (short-name docs), `dms-template/package.json`+lock (react-router +
  lucide-react direct deps — pre-existing hoisting gap exposed by the lock refresh that the
  upstream exceljs addition forced; see P3 design notes). All green: dms-server `npm test` /
  `test:schedules` 29 / `test:tasks` 22 / `test:datatypes` 9; `npm run build`;
  `node data-types/run-tests.js` (301 units + integrations). No schedules seeded — authoring the
  legacy cadences through this UI is the user-run acceptance test.

- **Note (2026-06-10):** a local server boot smoke test (verifying route mount + sweep start)
  connected to every dama-role config present in the checkout — as any boot of this server does —
  and therefore ran the additive idempotent schedules init (`CREATE TABLE IF NOT EXISTS
  schedules/schedule_events`, `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  attempt/max_attempts/schedule_id`) against `npmrds2`, `wcdb-dama`, `hazmit_dama` in addition to
  the sqlite test env. No data was read/modified beyond that; the schema addition is exactly what
  the next deploy would apply. Empty schedules tables → the brief sweep fired nothing.

### P3 — UI (Schedule + Runs pages) — DONE (2026-06-10)

- [x] Pure cron helpers in `patterns/datasets/pages/dataTypes/schedule/scheduleUtils.js` (.js, no
      JSX, no npm dep): `parseCron` (5-field; `*`, lists, ranges, steps; dow 7→0), `cronToHuman`
      (Daily/Weekly/Monthly/Yearly/every-N shapes, raw-string fallback), `nextCronFires(cron, tz,
      n)` — wall-clock day-walk in the IANA tz with an Intl `formatToParts` two-pass fixpoint for
      tz→UTC conversion, half-day probe steps so DST-shortened days can't skip a date, standard
      cron OR-semantics when both dom and dow are restricted. Verified against the server's
      cron-parser outputs (02:00 America/New_York → 06:00Z EDT / 07:00Z EST, monthly + weekly
      sequences). Plus `utcStringToDate` (server timestamps are UTC 'YYYY-MM-DD HH:MM:SS'),
      `timeAgo` (past+future), `formatTimestamp`, `formatDuration`, `schedulableMatchRank`.
- [x] `SchedulePage.jsx` — per-source schedule list (loader label from /schedulables, human cron
      + raw + tz, next fire local-time + relative countdown, enabled Switch → PATCH, last fired +
      link to that run, Run-now, Edit, Delete w/ UI.DeleteModal) and a New/Edit form: loader
      select grouped "Matches this source" / "Other schedulable loaders", cadence presets (Daily
      02:00 / Weekly Mon 02:00 / Monthly 1st 02:00 / Custom cron) with a live next-3-fires
      preview (client-side; unparseable ⇒ "custom — validated on save"), params form rendered
      from the /schedulables descriptors (`string[]` comma input, `source_id` select over the
      env's sources via falcor uda, `number`, `boolean`, `string`; required-param check;
      empty optionals omitted), max_in_flight. Run-now → POST /fire: `queued:true` navigates to
      `…/runs/<task_id>`; `queued:false` renders type+reason inline (RITIS-budget BLOCKED and
      SKIPPED_BUSY surface here). Mutations send `Authorization: user.token`; read-only without
      a token.
- [x] `RunsPage.jsx` — list view merges the source's tasks (scheduled AND manual) from the
      pre-existing falcor `uda[pgEnv].tasks.forSource[sourceId]` path — so **no new
      tasks-by-source REST route was needed** — with the schedule-scoped SKIPPED_BUSY/BLOCKED/
      ERROR events from `GET /schedules/:id/runs`, interleaved newest-first. Columns: run link,
      started (relative + abs title), duration, status chip (queued/running/done/error +
      skipped_busy/blocked event rows), progress %, fired-by (schedule label = schedulable label
      + human cron, or "manual"/"manual (re-run)"), result/error summary. Client-side pagination
      (20/page, latest 200 tasks).
- [x] Run detail at `source/:id/runs/:taskId` (the SourcePage `:view_id?` URL segment carries a
      task_id on this page): status header w/ attempt x/y, fired-by, duration, progress; error
      block; descriptor pretty-JSON with `start*/end*` window fields called out as chips; "open
      view" links sniffed from numeric `*view_id` keys in result+descriptor (→ the Table page);
      task_events timeline with expandable payloads, polled every 4s while queued/running;
      "Re-run with same descriptor" → POST /tasks/:id/rerun → navigates to the new run.
- [x] Registered `'schedule'` + `'runs'` in `defaultPages.js` with `cdn: ({isDms}) => !isDms`
      (DAMA-only — schedules live in data_manager); documented the short names in
      `data-types/CLAUDE.md#defaultPages-shorthand`.
- [x] Opted the four schedulable plugins in: `npmrds_raw`/`transcom`/`npmrds` →
      `defaultPages: ['table','schedule','runs']`, `excessive_delay` →
      `['table','map','metadata','schedule','runs']`. No schedules seeded anywhere — the user
      creates the legacy cadences through the UI as the acceptance test.
- [x] Server (allowed file only): `POST /dama-admin/:pgEnv/tasks/:taskId/rerun` added to
      `schedule-routes.js` — re-queues the stored descriptor as a NEW task row with
      `max_attempts: 1` and a `rerun_of` provenance key; guards/preflights intentionally NOT
      consulted (descriptor already concrete, operator-initiated). TDD tests in
      `tests/test-schedules.js` (auth 401, descriptor fidelity + max_attempts 1 + rerun_of, 404)
      — watched fail (3) before the route existed, then green.
- [x] Verify: dms-server `npm test` ✓, `test:schedules` 29 ✓, `test:tasks` 22 ✓,
      `test:datatypes` 9 ✓; dms-template `npm run build` ✓ (53s); `node data-types/run-tests.js`
      ✓ (301 vitest units + all integration scripts).

**Design notes (P3):**

- **Cron preview approach** — hand-written 5-field parser + a tz-aware next-fire walker in
  `scheduleUtils.js` (no client npm dep). tz→UTC uses the standard Intl two-pass fixpoint;
  outputs were verified identical to the server's cron-parser for the legacy cadences across
  EDT/EST. The server remains authoritative: anything the client can't parse renders
  "custom — validated on save" and POST returns 400 on a genuinely bad cron.
- **Loader↔source matching rule** (`schedulableMatchRank`): rank 0 = schedulable's `datatype`
  equals `source.type` exactly; rank 1 = same *type family*, defined as the shorter name being
  an underscore-boundary prefix of the longer (`npmrds` ~ `npmrds_raw` ~
  `npmrds_raw_tmc_identification`; `transcom` ≁ `transit`); rank 2 = everything else, still
  selectable under an "Other schedulable loaders" optgroup — the filter is a convenience, not a
  constraint.
- **No tasks-by-source REST route added**: the falcor uda layer already serves
  `tasks.forSource[sourceId].length/byIndex` and `tasks.byId[taskId][attrs incl. descriptor/
  result/schedule_id/attempt]` (uda.tasks route, `SELECT *` attribute projection) — the Runs
  page reuses it, exactly the "reuse an existing tasks listing path" branch of the design.
- **Run-detail events polling deviates from the REST `/events/query` precedent on purpose**:
  the legacy shim maps task_events to the old DAMA event shape and **drops the `message`
  column**, which would gut the timeline. The detail page polls the falcor uda
  `tasks.byId[id].events` path instead (invalidate-then-get per 4s tick while queued/running) —
  same table, full rows.
- **Build-dependency fix (pre-existing breakage, surfaced by the mandated `npm run build`)**:
  an upstream dms commit earlier today added an `exceljs` import to dataWrapper; the template's
  lockfile was stale, and `npm install` re-syncing it revealed that `react-router` and
  `lucide-react` — imported directly by template `src/` code — were never declared in
  dms-template's package.json (they resolved via stale hoisting only). Added both as direct
  deps (react-router pinned to the dms package's `^7.5.3` range, deduped to a single copy);
  package.json + package-lock.json updated in dms-template.

### Still to do (P4 — later)
- [x] P4 — docs: `data-types/CLAUDE.md` **§schedulables contract** written (shape, buildDescriptor/
      preflight semantics, param types, max_in_flight/retry defaults, the RITIS-budget rule, and the
      defaultPages opt-in note) — 2026-06-10.
- [ ] P4 — golden path: **handed to the user by request** — they will recreate the legacy
      npmrds/transcom cadences through the Schedule UI on dev as the acceptance test (no schedules
      seeded by this task, per their instruction).
- [ ] P4 — worker-side resume markers on retry (the runner-level requeue is in; drivers already
      keep `resume_v2` markers, untouched).

## Open questions
1. Multi-host: `FOR UPDATE SKIP LOCKED` makes the sweep safe, but should fires be pinned to a host
   (legacy host_id behavior) or any-host? (Proposed: any-host; tasks table already has host_id.)
2. Should "Runs" be a per-source page only, or also a global admin view across all sources? (Proposed:
   per-source first; global later.)
3. Notification on BLOCKED/error (email/webhook)? Out of scope here; leave an event-type seam.
