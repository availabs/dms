-- DAMA Task Tables for SQLite
-- Task queue and event tracking for the data manager task system

CREATE TABLE IF NOT EXISTS tasks (
    task_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id          TEXT NOT NULL,
    source_id        INTEGER,
    worker_path      TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'queued',
    progress         REAL DEFAULT 0,
    result           TEXT,
    error            TEXT,
    descriptor       TEXT,
    queued_at        TEXT NOT NULL DEFAULT (datetime('now')),
    started_at       TEXT,
    completed_at     TEXT,
    worker_pid       INTEGER
);

CREATE TABLE IF NOT EXISTS task_events (
    event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    message          TEXT,
    payload          TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_host ON tasks (status, host_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events (task_id);
