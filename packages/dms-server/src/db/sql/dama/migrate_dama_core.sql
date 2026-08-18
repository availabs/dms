-- Idempotent migrations for data_manager core tables (PostgreSQL).
--
-- Unlike create_dama_core_tables.sql, this file runs on EVERY initDama — not
-- just when the tables are first created — so that long-lived databases are
-- reconciled with the current schema. Every statement here must therefore be
-- safe to re-run: use IF EXISTS / IF NOT EXISTS, never bare DDL.
--
-- Runs after initDama + initDamaTasks + initDamaSchedules, so every table those
-- create is guaranteed to exist here. Note that Postgres executes this whole
-- file as one implicit transaction: a statement that can legitimately fail
-- (insufficient privileges, say) must carry its own EXCEPTION handler, or it
-- takes every other migration in the file down with it.

-- data_manager.views.etl_context_id used to carry a foreign key into the legacy
-- data_manager.etl_contexts table. That table is no longer written by anything;
-- task ids now come from data_manager.tasks, whose id space diverged from
-- etl_contexts at the migration boundary. Any worker passing its task_id hit:
--   insert or update on table "views" violates foreign key constraint
--   "views_etl_ctx_id_fkey"
-- create_dama_core_tables.sql already declares the column with no FK, so this
-- only affects pre-migration databases. The column itself is deprecated —
-- record the producing task as views.metadata.task_id instead.
ALTER TABLE data_manager.views
    DROP CONSTRAINT IF EXISTS views_etl_ctx_id_fkey;

-- ── auth_permissions on data_manager.sources ────────────────────────────────
-- Added to create_dama_core_tables.sql in a8a68808 (2026-06-29) with the
-- string-permission access-control work, but not mirrored here, so every
-- database created before that date is missing it. The symptom is a late,
-- confusing failure: gis-dataset upload and layerAnalysis both succeed and
-- only csv/gis-dataset publish 500s, because dama/upload/metadata.js names the
-- column in its INSERT. routes/uda/sourceAuth.js and uda.route.js read it too.
-- Found in the field on the wcdb-dama pgEnv, 2026-08-13.
ALTER TABLE data_manager.sources
    ADD COLUMN IF NOT EXISTS auth_permissions JSONB DEFAULT '{}'::jsonb;

-- ── NOT here: retry + schedule columns on data_manager.tasks ────────────────
-- `attempt` / `max_attempts` / `schedule_id` were added to
-- create_dama_task_tables.sql in 7af54457 (2026-06-11) and are retrofitted
-- inline at the top of initDamaSchedules instead of here. That is deliberate:
-- create_dama_schedule_tables.sql ends with
--   CREATE INDEX ... ON data_manager.tasks (schedule_id)
-- so the columns are a PREREQUISITE of a create script and have to exist before
-- it runs, whereas this file runs after every create script. Moving them here
-- would break schedule-table creation on any database predating the scheduler.

-- ── postgis ─────────────────────────────────────────────────────────────────
-- create_dama_core_tables.sql grew this in ad07536c (2026-07-02); databases
-- created before it never ran it. Same EXCEPTION wrapper as the create script:
-- CREATE EXTENSION needs elevated privileges, and a database whose operator
-- cannot grant them should still get the rest of the migrations rather than
-- have the whole file roll back.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not install postgis extension (%). GIS dataset uploads and vector tiles will not work until it is installed manually: CREATE EXTENSION postgis;', SQLERRM;
END $$;
