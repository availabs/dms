-- DMS Task Tables for PostgreSQL
-- Mirrors data_manager.tasks / data_manager.task_events for DMS-native tasks
-- (e.g. internal_table publish) that should not depend on a DAMA pgEnv.
--
-- Only intentional delta from DAMA: the `app` column on dms.tasks. DAMA puts
-- one task table per pgEnv so doesn't need app scoping; DMS shares one db
-- across many apps, so the admin UIs filter by app.

CREATE TABLE IF NOT EXISTS dms.tasks (
    task_id          SERIAL PRIMARY KEY,
    host_id          TEXT NOT NULL,
    app              TEXT,
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

CREATE TABLE IF NOT EXISTS dms.task_events (
    event_id         SERIAL PRIMARY KEY,
    task_id          INTEGER NOT NULL REFERENCES dms.tasks (task_id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    message          TEXT,
    payload          JSONB,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dms.settings (
    key     TEXT PRIMARY KEY,
    value   JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dms_tasks_status_host ON dms.tasks (status, host_id);
CREATE INDEX IF NOT EXISTS idx_dms_tasks_app ON dms.tasks (app);
CREATE INDEX IF NOT EXISTS idx_dms_tasks_source ON dms.tasks (source_id);
CREATE INDEX IF NOT EXISTS idx_dms_task_events_task ON dms.task_events (task_id);
