-- DAMA Schedule Tables for PostgreSQL
-- Cron schedules for data-type loader runs + schedule-scoped events
-- (SKIPPED_BUSY / BLOCKED fires that never created a task row).

CREATE TABLE IF NOT EXISTS data_manager.schedules (
    schedule_id   SERIAL PRIMARY KEY,
    source_id     INTEGER REFERENCES data_manager.sources(source_id) ON DELETE CASCADE,
    worker_path   TEXT NOT NULL,            -- registry key, e.g. 'npmrds_raw/publish'
    cron          TEXT NOT NULL,            -- 5-field cron
    timezone      TEXT NOT NULL DEFAULT 'America/New_York',
    descriptor    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- descriptor TEMPLATE (window filled at fire time)
    enabled       BOOLEAN NOT NULL DEFAULT true,
    max_in_flight INTEGER NOT NULL DEFAULT 1,   -- duplicate guard: skip fire if N runs still queued/running
    last_task_id  INTEGER,
    last_fired_at TIMESTAMP,
    next_fire_at  TIMESTAMP,                -- materialized (UTC) for cheap sweeps + UI display
    created_by    INTEGER,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- Schedule-scoped events: fires that did NOT create a task (duplicate guard,
-- preflight refusals) still need a visible audit trail. Task-scoped events
-- stay in data_manager.task_events.
CREATE TABLE IF NOT EXISTS data_manager.schedule_events (
    event_id     SERIAL PRIMARY KEY,
    schedule_id  INTEGER NOT NULL REFERENCES data_manager.schedules (schedule_id) ON DELETE CASCADE,
    type         TEXT NOT NULL,             -- 'schedule:SKIPPED_BUSY' | 'schedule:BLOCKED' | ...
    message      TEXT,
    payload      JSONB,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_due ON data_manager.schedules (enabled, next_fire_at);
CREATE INDEX IF NOT EXISTS idx_schedule_events_schedule ON data_manager.schedule_events (schedule_id);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON data_manager.tasks (schedule_id);
