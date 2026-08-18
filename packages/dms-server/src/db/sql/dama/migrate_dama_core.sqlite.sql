-- Idempotent migrations for data_manager core tables (SQLite). See
-- migrate_dama_core.sql for the contract; this is the SQLite dialect of the
-- same migrations, minus the statements that are Postgres-only.
--
-- NOTE: SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
-- runMigrationFile swallows "duplicate column name" for SQLite, so plain
-- ADD COLUMN statements are effectively idempotent here.
--
-- Not mirrored from the Postgres file, deliberately:
--   * the views_etl_ctx_id_fkey drop — SQLite cannot drop a constraint, and
--     the SQLite create script never declared that foreign key.
--   * CREATE EXTENSION postgis — no such thing in SQLite.

-- auth_permissions on sources: added to create_dama_core_tables.sqlite.sql in
-- a8a68808 (2026-06-29) and never mirrored into a migration.
ALTER TABLE sources ADD COLUMN auth_permissions TEXT DEFAULT '{}';

-- Not mirrored either: tasks.attempt / max_attempts / schedule_id. They are
-- retrofitted inline in initDamaSchedules because create_dama_schedule_tables
-- indexes tasks(schedule_id) and so needs them to already exist. See
-- migrate_dama_core.sql for the full reasoning.
