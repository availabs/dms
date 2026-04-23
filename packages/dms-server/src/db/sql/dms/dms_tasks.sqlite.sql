-- DMS Task Tables for SQLite
-- SQLite variant of dms_tasks.sql. Uses `dms_`-prefixed table names so a
-- single-file SQLite db with both `dms` and `dama` roles doesn't collide on
-- bare `tasks` / `task_events` / `settings` names (DAMA's SQLite schema uses
-- those unprefixed).

CREATE TABLE IF NOT EXISTS dms_tasks (
    task_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id          TEXT NOT NULL,
    app              TEXT,
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

CREATE TABLE IF NOT EXISTS dms_task_events (
    event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id          INTEGER NOT NULL REFERENCES dms_tasks (task_id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    message          TEXT,
    payload          TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dms_settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dms_tasks_status_host ON dms_tasks (status, host_id);
CREATE INDEX IF NOT EXISTS idx_dms_tasks_app ON dms_tasks (app);
CREATE INDEX IF NOT EXISTS idx_dms_tasks_source ON dms_tasks (source_id);
CREATE INDEX IF NOT EXISTS idx_dms_task_events_task ON dms_task_events (task_id);
