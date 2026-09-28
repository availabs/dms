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

-- ── trigram index on data_items.type ────────────────────────────────────────
-- Several hot lookups match `type` with a LEADING wildcard, because the type
-- string encodes hierarchy right-to-left (`{site}|{instance}:{kind}`) and the
-- caller usually knows the tail, not the head. The worst offender is
-- getSitePatterns() (routes/uda/utils.js), which every datasets source listing
-- calls twice:
--
--   SELECT id FROM <schema>.data_items
--    WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'
--
-- A leading-wildcard LIKE cannot be an index condition, and `app` is not
-- selective in a per-app schema (every row matches it), so this is a seq scan:
-- measured on dms_mitigat_ny_prod, 377,807 rows / 5,663 MB / ~96 ms, to find
-- one pattern row.
--
-- A partial index (`... WHERE type LIKE '%:pattern'`) does NOT help — Postgres
-- cannot prove `type LIKE '%|x:pattern'` implies `type LIKE '%:pattern'` (LIKE
-- is not a btree operator), so the planner ignores it; a covering
-- (app, type, id) btree is ignored too. Both were measured on a 377k-row
-- reproduction: still a seq scan, still ~110 ms. A trigram GIN index is the
-- one thing the planner will use for this shape, and it needs no query change:
-- the same query drops to **0.76 ms** (Bitmap Index Scan, Index Cond on the
-- LIKE), and it fixes every other leading-wildcard `type` lookup at once.
--
-- pg_trgm needs elevated privileges to install, so — exactly like the postgis
-- block in sql/dama/migrate_dama_core.sql — failure is downgraded to a warning
-- rather than taking the rest of this file's migrations down with it. The
-- index is per-schema because split mode gives each app its own data_items.
DO $$
DECLARE
    s text;
    have_trgm boolean := false;
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        have_trgm := true;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not install pg_trgm (%). Pattern/type lookups will keep seq-scanning data_items until it is installed manually: CREATE EXTENSION pg_trgm;', SQLERRM;
    END;

    IF have_trgm THEN
        FOR s IN
            SELECT table_schema FROM information_schema.tables
            WHERE table_name = 'data_items' AND table_type = 'BASE TABLE'
        LOOP
            BEGIN
                EXECUTE format(
                    'CREATE INDEX IF NOT EXISTS ix_data_items_type_trgm ON %I.data_items USING gin (type gin_trgm_ops)',
                    s
                );
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Could not create ix_data_items_type_trgm on %.data_items (%)', s, SQLERRM;
            END;
        END LOOP;
    END IF;
END $$;
