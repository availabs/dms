-- Idempotent migrations for DMS tables (SQLite). See migrate_dms_core.sql for
-- the contract; this is the SQLite dialect of the same migrations.
--
-- NOTE: SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. runMigrationFile
-- swallows "duplicate column name" for SQLite so plain ADD COLUMN statements are
-- effectively idempotent here.

-- Audit columns on change_log, added with the request-tracking work
-- (7e6a9e4c, 2026-06-30).
ALTER TABLE change_log ADD COLUMN ip TEXT;
ALTER TABLE change_log ADD COLUMN user_agent TEXT;
ALTER TABLE change_log ADD COLUMN auth_state TEXT;

-- Page visit log: one row per page view, written by POST /track/visit.
-- Also declared in change_log.sqlite.sql for fresh databases; repeated here so
-- databases created before 2026-06-30 pick it up.
CREATE TABLE IF NOT EXISTS page_visits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    app        TEXT    NOT NULL,
    page_id    INTEGER,
    url        TEXT,
    action     TEXT,
    ip         TEXT,
    user_agent TEXT,
    user_id    INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_visits_app_created ON page_visits (app, created_at);

CREATE INDEX IF NOT EXISTS idx_page_visits_page_id ON page_visits (page_id);

-- `action` postdates the original page_visits table.
ALTER TABLE page_visits ADD COLUMN action TEXT;

-- ── SQLite-only additions to dms.sqlite.sql ─────────────────────────────────
-- These two postdate the original dms.sqlite.sql and have no Postgres
-- counterpart (dms.sql has never changed since it was created), which is why
-- they appear here and not in migrate_dms_core.sql.

-- Shared id sequence, added in 0b27c67b (2026-02-13).
CREATE TABLE IF NOT EXISTS dms_id_seq (id INTEGER PRIMARY KEY AUTOINCREMENT);

-- Tag index, added in d62b4f36 (2026-03-09) with the local-first sync work.
CREATE INDEX IF NOT EXISTS idx_data_items_tags
    ON data_items (app, type, json_extract(data, '$.tags'))
    WHERE json_extract(data, '$.tags') IS NOT NULL
    AND json_extract(data, '$.tags') != '';
