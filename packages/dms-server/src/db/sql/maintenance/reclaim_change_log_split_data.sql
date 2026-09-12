-- One-time cleanup for the change_log split-row snapshots (item 4 of
-- src/dms/planning/tasks/current/sync-delta-change-log-bloat.md).
--
-- NOT auto-run. Nothing loads this file; db/index.js's initSync only reads
-- sql/dms/change_log.sql by name. Run it by hand, deliberately, because
-- step 2 takes an ACCESS EXCLUSIVE lock on change_log for its whole duration.
--
-- Why: dms.change_log stored a full `data` snapshot for every write to a
-- split-table (dataset row) type, and nothing ever read them — /sync/delta
-- excludes those types before serializing, and the WebSocket broadcast uses
-- the in-memory row. On mitigat-ny-prod on 2026-09-10 that was 24 GB of TOAST,
-- 65% of a 37 GB table, from one `jurisdictions|1346450:data` row rewritten
-- 3,306 times at ~7.7 MB a write. New writes stopped storing it (see
-- changeLogData in db/table-resolver.js); this reclaims the existing ones.
--
-- Usage:
--   psql "$DMS_DSN" -f reclaim_change_log_split_data.sql        -- step 1 only
--   psql "$DMS_DSN" -c 'VACUUM FULL VERBOSE dms.change_log;'    -- step 2, scheduled
--
-- On SQLite this is unnecessary: the snapshots are inline and `VACUUM` (no
-- FULL) reclaims them, but no SQLite deployment has hit this scale.

\timing on

-- ── Step 0 — what is about to be nulled ─────────────────────────────────────
-- Read-only. Confirm the row count and byte savings before touching anything.
SELECT
    count(*)                                    AS rows_to_null,
    pg_size_pretty(sum(pg_column_size(data)))   AS data_bytes_reclaimable
FROM dms.change_log
WHERE data IS NOT NULL
  AND type LIKE '%:data';

-- ── Step 1 — drop the snapshots ─────────────────────────────────────────────
-- Batched so a single statement never holds a row-lock set big enough to
-- block writers for long; repeat until it reports 0 rows.
--
-- The predicate matches the current `{source}|{view}:data` form only. The
-- legacy NAME_SPLIT_REGEX form (e.g. `traffic_counts-1`) is also a split type
-- but has no ':data' suffix; those rows are individually small and are left
-- alone rather than matched with a regex that could catch a real type.
DO $$
DECLARE
    touched bigint;
BEGIN
    LOOP
        WITH batch AS (
            SELECT revision
            FROM dms.change_log
            WHERE data IS NOT NULL
              AND type LIKE '%:data'
            LIMIT 5000
        )
        UPDATE dms.change_log c
        SET data = NULL
        FROM batch
        WHERE c.revision = batch.revision;

        GET DIAGNOSTICS touched = ROW_COUNT;
        RAISE NOTICE 'nulled % rows', touched;
        EXIT WHEN touched = 0;
        COMMIT;   -- release locks between batches
    END LOOP;
END $$;

-- ── Step 2 — reclaim the disk (OPERATOR-SCHEDULED, EXCLUSIVE LOCK) ──────────
-- Step 1 only dead-references the TOAST chunks; it does not shrink the table.
-- Run ONE of these in a maintenance window, not from this script:
--
--   VACUUM FULL VERBOSE dms.change_log;   -- simple, ACCESS EXCLUSIVE throughout
--   pg_repack -t dms.change_log           -- online, needs the pg_repack extension
--
-- Then confirm:
--   SELECT pg_size_pretty(pg_total_relation_size('dms.change_log'));
