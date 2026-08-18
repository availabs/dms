-- Idempotent migrations for DMS tables (PostgreSQL).
--
-- Unlike dms.sql / change_log.sql / dms_tasks.sql, this file runs on EVERY
-- init for a `role: "dms"` database — not just when the tables are first
-- created — so that long-lived databases are reconciled with the current
-- schema. Every statement must therefore be safe to re-run: use IF EXISTS /
-- IF NOT EXISTS, never bare DDL.
--
-- Runs after initDms + initSync + initDmsTasks, so every table those create is
-- guaranteed to exist here.

-- Audit columns on change_log, added with the request-tracking work
-- (7e6a9e4c, 2026-06-30).
ALTER TABLE dms.change_log
    ADD COLUMN IF NOT EXISTS ip         TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS auth_state TEXT;

-- Page visit log: one row per page view, written by POST /track/visit.
-- Also declared in change_log.sql for fresh databases; repeated here so
-- databases created before 2026-06-30 pick it up.
CREATE TABLE IF NOT EXISTS dms.page_visits (
    id          BIGSERIAL PRIMARY KEY,
    app         TEXT        NOT NULL,
    page_id     BIGINT,
    url         TEXT,
    action      TEXT,
    ip          TEXT,
    user_agent  TEXT,
    user_id     INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_app_created
    ON dms.page_visits (app, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_visits_page_id
    ON dms.page_visits (page_id);

-- `action` postdates the original page_visits table.
ALTER TABLE dms.page_visits
    ADD COLUMN IF NOT EXISTS action TEXT;
