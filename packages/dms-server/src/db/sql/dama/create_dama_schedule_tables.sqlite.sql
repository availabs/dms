-- DAMA Schedule Tables for SQLite
-- Cron schedules for data-type loader runs + schedule-scoped events.

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id     INTEGER,
    worker_path   TEXT NOT NULL,
    cron          TEXT NOT NULL,
    timezone      TEXT NOT NULL DEFAULT 'America/New_York',
    descriptor    TEXT NOT NULL DEFAULT '{}',
    enabled       INTEGER NOT NULL DEFAULT 1,
    max_in_flight INTEGER NOT NULL DEFAULT 1,
    last_task_id  INTEGER,
    last_fired_at TEXT,
    next_fire_at  TEXT,
    created_by    INTEGER,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedule_events (
    event_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id  INTEGER NOT NULL REFERENCES schedules (schedule_id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    message      TEXT,
    payload      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules (enabled, next_fire_at);
CREATE INDEX IF NOT EXISTS idx_schedule_events_schedule ON schedule_events (schedule_id);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks (schedule_id);
