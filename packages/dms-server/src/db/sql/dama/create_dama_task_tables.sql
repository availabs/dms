-- DAMA Task Tables for PostgreSQL
-- Task queue and event tracking for the data manager task system

CREATE TABLE IF NOT EXISTS data_manager.tasks (
    task_id          SERIAL PRIMARY KEY,
    host_id          TEXT NOT NULL,
    source_id        INTEGER,
    worker_path      TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'queued',
    progress         REAL DEFAULT 0,
    result           JSONB,
    error            TEXT,
    descriptor       JSONB,
    queued_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at       TIMESTAMP,
    completed_at     TIMESTAMP,
    worker_pid       INTEGER
);

CREATE TABLE IF NOT EXISTS data_manager.task_events (
    event_id         SERIAL PRIMARY KEY,
    task_id          INTEGER NOT NULL REFERENCES data_manager.tasks (task_id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    message          TEXT,
    payload          JSONB,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_manager.settings (
    key     TEXT PRIMARY KEY,
    value   JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_host ON data_manager.tasks (status, host_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON data_manager.task_events (task_id);
