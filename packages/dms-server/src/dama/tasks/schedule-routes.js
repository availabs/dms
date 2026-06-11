/**
 * Schedule routes — REST surface for the datasets-pattern Schedule/Runs UI.
 *
 * Mounted beside the other dama-admin routes (see src/index.js):
 *   GET    /dama-admin/:pgEnv/schedulables        what CAN be scheduled (registry + param forms)
 *   GET    /dama-admin/:pgEnv/schedules           list (optionally ?source_id=N)
 *   POST   /dama-admin/:pgEnv/schedules           create  { source_id?, worker_path, cron,
 *                                                          timezone?, descriptor?, enabled?, max_in_flight? }
 *   PATCH  /dama-admin/:pgEnv/schedules/:id       partial update (same fields)
 *   DELETE /dama-admin/:pgEnv/schedules/:id
 *   GET    /dama-admin/:pgEnv/schedules/:id/runs  { tasks: [...], events: [...] } — tasks created by
 *                                                 the schedule + schedule-scoped SKIPPED_BUSY/BLOCKED events
 *   POST   /dama-admin/:pgEnv/schedules/:id/fire  run-now → { queued, task_id } |
 *                                                 { queued:false, type, reason }
 *   POST   /dama-admin/:pgEnv/tasks/:taskId/rerun re-run a task with the exact descriptor it ran
 *                                                 with → { queued:true, task_id, rerun_of }
 *
 * Auth: mutating routes require an authenticated user (req.availAuthContext.user,
 * set by the server's JWT middleware) — same convention as the other mutating
 * dama-admin routes. Reads are open like /events/query.
 */

const schedules = require('./schedules');
const tasks = require('./index');
const { getSchedulables } = require('../datatypes');

function requireAuth(req, res) {
  const user = req.availAuthContext && req.availAuthContext.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

function registerScheduleRoutes(app) {
  app.get('/dama-admin/:pgEnv/schedulables', (req, res) => {
    const registry = getSchedulables();
    res.json(Object.entries(registry).map(([worker_path, spec]) => ({
      worker_path,
      datatype: spec.datatype,
      label: spec.label || worker_path,
      defaultCron: spec.defaultCron || null,
      params: spec.params || [],
    })));
  });

  app.get('/dama-admin/:pgEnv/schedules', async (req, res) => {
    try {
      const { pgEnv } = req.params;
      const source_id = req.query && req.query.source_id != null ? Number(req.query.source_id) : undefined;
      res.json(await schedules.listSchedules(pgEnv, { source_id }));
    } catch (err) {
      console.error('[schedules] list failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/dama-admin/:pgEnv/schedules', async (req, res) => {
    try {
      const user = requireAuth(req, res);
      if (!user) return;
      const { pgEnv } = req.params;
      const b = req.body || {};

      if (!b.worker_path) return res.status(400).json({ error: 'worker_path is required' });
      if (!b.cron) return res.status(400).json({ error: 'cron is required' });
      if (!getSchedulables()[b.worker_path]) {
        return res.status(400).json({
          error: `worker_path '${b.worker_path}' is not schedulable — see GET /schedulables`,
        });
      }
      try {
        schedules.computeNextFireAt(b.cron, b.timezone || 'America/New_York');
      } catch (err) {
        return res.status(400).json({ error: `Invalid cron/timezone: ${err.message}` });
      }

      const row = await schedules.createSchedule({
        source_id: b.source_id ?? null,
        worker_path: b.worker_path,
        cron: b.cron,
        timezone: b.timezone || 'America/New_York',
        descriptor: b.descriptor || {},
        enabled: b.enabled !== false,
        max_in_flight: b.max_in_flight ?? 1,
        created_by: user.id ?? null,
      }, pgEnv);
      res.json(row);
    } catch (err) {
      console.error('[schedules] create failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/dama-admin/:pgEnv/schedules/:id', async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { pgEnv, id } = req.params;
      const b = req.body || {};

      if (b.cron !== undefined || b.timezone !== undefined) {
        const current = await schedules.getSchedule(id, pgEnv);
        if (!current) return res.status(404).json({ error: 'Schedule not found' });
        try {
          schedules.computeNextFireAt(b.cron ?? current.cron, b.timezone ?? current.timezone);
        } catch (err) {
          return res.status(400).json({ error: `Invalid cron/timezone: ${err.message}` });
        }
      }

      const row = await schedules.updateSchedule(id, b, pgEnv);
      if (!row) return res.status(404).json({ error: 'Schedule not found' });
      res.json(row);
    } catch (err) {
      console.error('[schedules] update failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/dama-admin/:pgEnv/schedules/:id', async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { pgEnv, id } = req.params;
      const deleted = await schedules.deleteSchedule(id, pgEnv);
      if (!deleted) return res.status(404).json({ error: 'Schedule not found' });
      res.json({ deleted: true, schedule_id: Number(id) });
    } catch (err) {
      console.error('[schedules] delete failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/dama-admin/:pgEnv/schedules/:id/runs', async (req, res) => {
    try {
      const { pgEnv, id } = req.params;
      const schedule = await schedules.getSchedule(id, pgEnv);
      if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
      res.json(await schedules.getScheduleRuns(id, pgEnv));
    } catch (err) {
      console.error('[schedules] runs failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Run-now: fires immediately through the SAME guard/preflight path as the
  // sweep (the RITIS budget etc. apply to manual fires too). Does not touch
  // next_fire_at.
  app.post('/dama-admin/:pgEnv/schedules/:id/fire', async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { pgEnv, id } = req.params;
      const schedule = await schedules.getSchedule(id, pgEnv);
      if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
      res.json(await schedules.fireSchedule(schedule, pgEnv, { manual: true }));
    } catch (err) {
      console.error('[schedules] fire failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Re-run a task with the exact descriptor it ran with (the Runs UI's
  // one-click "re-run with same descriptor"). Creates a NEW task row (fresh
  // events timeline) tagged with `rerun_of` for provenance. max_attempts is
  // forced to 1 — a human triggered this and is watching; retries are theirs
  // to decide. Schedule guards/preflights are NOT consulted: the descriptor
  // is already concrete and the operator explicitly asked for the run.
  app.post('/dama-admin/:pgEnv/tasks/:taskId/rerun', async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const { pgEnv, taskId } = req.params;
      const task = await tasks.getTaskStatus(taskId, pgEnv);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const descriptor = typeof task.descriptor === 'string'
        ? JSON.parse(task.descriptor || '{}') : (task.descriptor || {});

      const newTaskId = await tasks.queueTask({
        ...descriptor,
        workerPath: task.worker_path,
        sourceId: task.source_id ?? null,
        schedule_id: task.schedule_id ?? null,
        max_attempts: 1,
        rerun_of: Number(taskId),
      }, pgEnv);

      res.json({ queued: true, task_id: newTaskId, rerun_of: Number(taskId) });
    } catch (err) {
      console.error('[schedules] rerun failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('Schedules: registered 8 routes at /dama-admin/:pgEnv/schedules*');
}

module.exports = { registerScheduleRoutes };
