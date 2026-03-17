/**
 * Sync REST Endpoints
 *
 * Express routes (not Falcor) for the sync protocol:
 *   GET  /sync/bootstrap?app=X           — Full snapshot of all items + max revision
 *   GET  /sync/bootstrap?app=X&type=Y    — Type-scoped snapshot (future: split tables)
 *   GET  /sync/delta?app=X&since=N       — Changes since revision N
 *   GET  /sync/delta?app=X&type=Y&since=N — Type-scoped delta (future)
 *   POST /sync/push                      — Push a client mutation (create/update/delete)
 */

const { Router } = require('express');
const { getDb } = require('#db/index.js');
const { loadConfig } = require('#db/config.js');
const {
  isSplitType,
  resolveTable,
  getSequenceName,
  ensureSequence,
  ensureTable,
  allocateId,
} = require('#db/table-resolver.js');

/** Types excluded from sync bootstrap/delta (loaded on-demand instead) */
function isSyncExcluded(type) {
  return isSplitType(type);
}
const {
  jsonMerge,
  currentTimestamp,
  typeCast,
} = require('#db/query-utils.js');
const { logEntry } = require('../../middleware/request-logger');

/**
 * Extract ref IDs from a data_items row's data.
 * Looks at top-level array values and collects items that look like refs
 * (objects with `id`, plain numbers, or numeric strings).
 */
function extractRefIds(data) {
  const ids = [];
  if (!data || typeof data !== 'object') return ids;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === 'object' && item.id != null) {
        ids.push(Number(item.id));
      } else if (typeof item === 'number') {
        ids.push(item);
      } else if (typeof item === 'string' && /^\d+$/.test(item)) {
        ids.push(Number(item));
      }
    }
  }
  return ids;
}

/**
 * Create sync routes for a given database config.
 * @param {string} dbName - Database config name (e.g., 'dms-sqlite')
 * @returns {Router}
 */
function createSyncRoutes(dbName) {
  const router = Router();
  const dms_db = getDb(dbName);
  const dbType = dms_db.type;
  const config = loadConfig(dbName);
  const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const requireAuth = process.env.DMS_SYNC_AUTH === '1';

  function tbl(name) {
    return dbType === 'postgres' ? `dms.${name}` : name;
  }

  function now() {
    return currentTimestamp(dbType);
  }

  /**
   * Get the main (non-split) table for an app, ensuring it exists.
   * Mirrors the controller's mainTable() — resolves per-app tables when splitMode='per-app'.
   */
  async function mainTable(app) {
    const resolved = resolveTable(app, '', dbType, splitMode);
    // ensureTable() no-ops for the shared dms.data_items (legacy mode)
    const seqName = getSequenceName(app, dbType, splitMode);
    await ensureSequence(dms_db, app, dbType, splitMode);
    await ensureTable(dms_db, resolved.schema, resolved.table, dbType, seqName);
    return resolved.fullName;
  }

  // Lazy check: is the change_log table available?
  // null = not checked yet, true/false = cached result
  let _changeLogReady = null;
  async function hasChangeLog() {
    if (_changeLogReady !== null) return _changeLogReady;
    const schema = dbType === 'sqlite' ? 'main' : 'dms';
    _changeLogReady = await dms_db.tableExists(schema, 'change_log');
    if (!_changeLogReady) {
      console.warn('[sync] change_log table does not exist — sync endpoints will return empty results. Run initSync or create the table manually.');
    }
    return _changeLogReady;
  }

  /**
   * Fetch skeleton items: site row + its ref children (discovered from data).
   * Returns an array of data_items rows.
   */
  async function fetchSkeleton(app, siteType) {
    const table = await mainTable(app);
    const siteRows = await dms_db.promise(
      `SELECT * FROM ${table} WHERE app = $1 AND type = $2 ORDER BY id`,
      [app, siteType]
    );
    const refIds = [];
    for (const row of siteRows) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      refIds.push(...extractRefIds(data));
    }
    if (refIds.length > 0) {
      const placeholders = refIds.map((_, i) => `$${i + 1}`).join(',');
      const children = await dms_db.promise(
        `SELECT * FROM ${table} WHERE id IN (${placeholders}) ORDER BY id`,
        refIds
      );
      const seen = new Set(siteRows.map(r => r.id));
      return [...siteRows, ...children.filter(c => !seen.has(c.id))];
    }
    return siteRows;
  }

  // ---- Bootstrap: full snapshot ----

  router.get('/sync/bootstrap', async (req, res) => {
    const t0 = Date.now();
    try {
      const { app, type, pattern, skeleton } = req.query;
      if (!app) return res.status(400).json({ error: 'app is required' });
      if (requireAuth && !req.availAuthContext?.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let items;

      if (skeleton) {
        // Skeleton bootstrap: fetch site row, then follow its refs to get children.
        // This discovers pattern items (and any other dms-format children) from the
        // site data rather than hardcoding type conventions like '|pattern'.
        items = await fetchSkeleton(app, skeleton);
      } else if (pattern) {
        // Pattern-scoped bootstrap: all items whose type matches or extends the doc_type.
        // Optionally includes site skeleton if siteType is provided.
        const { siteType } = req.query;
        const table = await mainTable(app);
        const patternItems = await dms_db.promise(
          `SELECT * FROM ${table} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%') ORDER BY id`,
          [app, pattern]
        );
        if (siteType) {
          const skeletonItems = await fetchSkeleton(app, siteType);
          const seen = new Set(patternItems.map(i => i.id));
          items = [...patternItems, ...skeletonItems.filter(i => !seen.has(i.id))];
        } else {
          items = patternItems;
        }
        // Filter out split-table types
        items = items.filter(item => !isSyncExcluded(item.type));
      } else if (type) {
        // Type-scoped bootstrap (exact type match)
        const table = await mainTable(app);
        items = await dms_db.promise(
          `SELECT * FROM ${table} WHERE app = $1 AND type = $2 ORDER BY id`,
          [app, type]
        );
      } else {
        // Full app bootstrap — main table only, exclude split-table types
        const table = await mainTable(app);
        const allItems = await dms_db.promise(
          `SELECT * FROM ${table} WHERE app = $1 ORDER BY id`,
          [app]
        );
        items = allItems.filter(item => !isSyncExcluded(item.type));
      }

      let revision = 0;
      if (await hasChangeLog()) {
        const maxRevRow = await dms_db.promise(
          `SELECT MAX(revision) AS max_rev FROM ${tbl('change_log')} WHERE app = $1`,
          [app]
        );
        revision = maxRevRow[0]?.max_rev || 0;
      }

      const scope = skeleton ? `skeleton=${skeleton}` : pattern ? `pattern=${pattern}` : type ? `type=${type}` : 'full-app';
      const durationMs = Date.now() - t0;

      // Stream JSON to avoid V8 string length limit on large payloads
      res.setHeader('Content-Type', 'application/json');
      res.write('{"items":[');
      let byteLen = 0;
      for (let i = 0; i < items.length; i++) {
        if (i > 0) res.write(',');
        const chunk = JSON.stringify(items[i]);
        byteLen += chunk.length + (i > 0 ? 1 : 0);
        res.write(chunk);
      }
      res.write(`],"revision":${Number(revision)}}`);
      byteLen += 30; // envelope overhead
      res.end();

      const payloadKB = +(byteLen / 1024).toFixed(1);
      console.log(`[sync/bootstrap] app=${app} ${scope} → ${items.length} items, ${payloadKB}KB, rev=${revision}, ${durationMs}ms`);
      logEntry({
        _type: 'sync-bootstrap',
        timestamp: new Date().toISOString(),
        app, scope,
        pattern: pattern || null, skeleton: skeleton || null,
        itemCount: items.length,
        payloadKB,
        revision: Number(revision),
        durationMs,
      });
    } catch (err) {
      console.error('[sync/bootstrap] error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Delta: changes since revision N ----

  router.get('/sync/delta', async (req, res) => {
    const t0 = Date.now();
    try {
      const { app, type, pattern, since } = req.query;
      if (!app) return res.status(400).json({ error: 'app is required' });
      if (requireAuth && !req.availAuthContext?.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sinceRev = parseInt(since, 10) || 0;

      if (!(await hasChangeLog())) {
        return res.json({ changes: [], revision: sinceRev });
      }

      let changes;
      if (pattern) {
        // Pattern-scoped delta: changes for types matching the pattern's doc_type
        // Also include skeleton types if siteType is provided
        const { siteType } = req.query;
        let patternChanges = await dms_db.promise(
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%') AND revision > $3 ORDER BY revision ASC`,
          [app, pattern, sinceRev]
        );
        if (siteType) {
          // Include skeleton changes (site row + its ref children) alongside pattern changes.
          // Discover skeleton IDs from the current site row rather than hardcoding type conventions.
          const deltaTable = await mainTable(app);
          const siteRows = await dms_db.promise(
            `SELECT * FROM ${deltaTable} WHERE app = $1 AND type = $2`,
            [app, siteType]
          );
          const skeletonIds = siteRows.map(r => r.id);
          for (const row of siteRows) {
            const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
            skeletonIds.push(...extractRefIds(data));
          }
          if (skeletonIds.length > 0) {
            const placeholders = skeletonIds.map((_, i) => `$${i + 2}`).join(',');
            const skeletonChanges = await dms_db.promise(
              `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND item_id IN (${placeholders}) AND revision > $${skeletonIds.length + 2} ORDER BY revision ASC`,
              [app, ...skeletonIds, sinceRev]
            );
            const seen = new Set(patternChanges.map(c => c.revision));
            patternChanges = [...patternChanges, ...skeletonChanges.filter(c => !seen.has(c.revision))];
            patternChanges.sort((a, b) => a.revision - b.revision);
          }
        }
        changes = patternChanges.filter(c => !isSyncExcluded(c.type));
      } else if (type) {
        changes = await dms_db.promise(
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND type = $2 AND revision > $3 ORDER BY revision ASC`,
          [app, type, sinceRev]
        );
      } else {
        // Default: exclude split-table types
        const allChanges = await dms_db.promise(
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND revision > $2 ORDER BY revision ASC`,
          [app, sinceRev]
        );
        changes = allChanges.filter(c => !isSyncExcluded(c.type));
      }

      const maxRevRow = await dms_db.promise(
        `SELECT MAX(revision) AS max_rev FROM ${tbl('change_log')} WHERE app = $1`,
        [app]
      );
      const revision = maxRevRow[0]?.max_rev || sinceRev;

      const response = { changes, revision: Number(revision) };
      const payload = JSON.stringify(response);
      const scope = pattern ? `pattern=${pattern}` : type ? `type=${type}` : 'full-app';
      const payloadKB = +(payload.length / 1024).toFixed(1);
      const durationMs = Date.now() - t0;
      console.log(`[sync/delta] app=${app} ${scope} since=${sinceRev} → ${changes.length} changes, ${payloadKB}KB, rev=${revision}, ${durationMs}ms`);
      logEntry({
        _type: 'sync-delta',
        timestamp: new Date().toISOString(),
        app, type: type || null, pattern: pattern || null,
        since: sinceRev,
        changeCount: changes.length,
        payloadKB,
        revision: Number(revision),
        durationMs,
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(payload);
    } catch (err) {
      console.error('[sync/delta] error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Push: client mutation ----

  router.post('/sync/push', async (req, res) => {
    try {
      if (requireAuth && !req.availAuthContext?.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { action, item } = req.body;
      if (!action || !item) return res.status(400).json({ error: 'action and item are required' });

      const { user = null } = req.availAuthContext || {};
      const userId = user?.id || null;

      await dms_db.beginTransaction();
      try {
        let resultItem;

        const pushTable = await mainTable(item.app);

        if (action === 'I') {
          // Create — use ON CONFLICT for idempotent retries
          const dataStr = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});

          if (item.id) {
            // Client-provided ID (e.g., from pending queue retry)
            await dms_db.promise(
              `INSERT INTO ${pushTable} (id, app, type, data, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5, $5)
               ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = ${now()}, updated_by = excluded.updated_by`,
              [item.id, item.app, item.type, dataStr, userId]
            );
            const rows = await dms_db.promise(
              `SELECT * FROM ${pushTable} WHERE id = $1`, [item.id]
            );
            resultItem = rows[0];
          } else {
            // Allocate ID from the correct sequence (per-app or global)
            const newId = await allocateId(dms_db, item.app, dbType, splitMode);
            await dms_db.promise(
              `INSERT INTO ${pushTable} (id, app, type, data, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5, $5)`,
              [newId, item.app, item.type, dataStr, userId]
            );
            const rows = await dms_db.promise(
              `SELECT * FROM ${pushTable} WHERE id = $1`, [newId]
            );
            resultItem = rows[0];
          }

        } else if (action === 'U') {
          const dataStr = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});
          const rows = await dms_db.promise(
            `UPDATE ${pushTable}
             SET data = ${jsonMerge('data', '$1', dbType)},
               updated_at = ${now()},
               updated_by = $2
             WHERE id = $3
             RETURNING *;`,
            [dataStr, userId, item.id]
          );
          resultItem = rows[0];
          if (!resultItem) {
            await dms_db.rollbackTransaction();
            return res.status(404).json({ error: 'Item not found' });
          }

        } else if (action === 'D') {
          await dms_db.promise(
            `DELETE FROM ${pushTable} WHERE id = $1`,
            [item.id]
          );
          resultItem = { id: item.id, app: item.app, type: item.type };
        } else {
          await dms_db.rollbackTransaction();
          return res.status(400).json({ error: `Unknown action: ${action}` });
        }

        // Write change_log (skip if table doesn't exist — sync not fully set up)
        let revision = null;
        if (await hasChangeLog()) {
          const revRows = await dms_db.promise(
            `INSERT INTO ${tbl('change_log')} (item_id, app, type, action, data, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING revision;`,
            [resultItem.id, resultItem.app, resultItem.type, action,
             action === 'D' ? null : resultItem.data, userId]
          );
          revision = revRows[0]?.revision;
        }

        await dms_db.commitTransaction();

        // Broadcast via WebSocket (notify is set from ws.js)
        const broadcastMsg = { type: 'change', revision, action, item: resultItem };
        const dataKB = resultItem.data ? +(JSON.stringify(resultItem.data).length / 1024).toFixed(1) : 0;
        console.log(`[sync/push] ${action} app=${resultItem.app} type=${resultItem.type} id=${resultItem.id} ${dataKB}KB rev=${revision}`);
        logEntry({
          _type: 'sync-push',
          timestamp: new Date().toISOString(),
          action,
          itemId: resultItem.id,
          app: resultItem.app,
          itemType: resultItem.type,
          dataKB,
        });
        if (createSyncRoutes._notifyChange) {
          createSyncRoutes._notifyChange(resultItem.app, broadcastMsg);
        }

        res.json({ item: resultItem, revision: Number(revision) });
      } catch (err) {
        await dms_db.rollbackTransaction();
        throw err;
      }
    } catch (err) {
      console.error('[sync/push] error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

// Allow WebSocket module to set the broadcast callback
createSyncRoutes._notifyChange = null;

/**
 * Start periodic compaction of the change_log table.
 * Deletes entries older than N days on a recurring interval.
 * @param {object} db - Database instance (from getDb)
 * @param {string} dbType - 'postgres' or 'sqlite'
 * @returns {function} Cleanup function to stop compaction
 */
function startCompaction(db, dbType) {
  const days = parseInt(process.env.DMS_SYNC_COMPACT_DAYS, 10) || 30;
  const intervalHours = parseInt(process.env.DMS_SYNC_COMPACT_INTERVAL_HOURS, 10) || 24;

  if (days <= 0 || intervalHours <= 0) {
    console.log('[sync/compact] Compaction disabled (invalid config)');
    return () => {};
  }

  const table = dbType === 'postgres' ? 'dms.change_log' : 'change_log';
  const query = dbType === 'postgres'
    ? `DELETE FROM ${table} WHERE created_at < NOW() - INTERVAL '${days} days'`
    : `DELETE FROM ${table} WHERE created_at < datetime('now', '-${days} days')`;

  async function compact() {
    try {
      const result = await db.promise(query, []);
      const deleted = result?.changes ?? result?.rowCount ?? 0;
      console.log(`[sync/compact] Removed ${deleted} change_log entries older than ${days} days`);
    } catch (err) {
      console.error('[sync/compact] error:', err.message);
    }
  }

  // Run once on startup, then on interval
  compact();
  const timer = setInterval(compact, intervalHours * 60 * 60 * 1000);
  timer.unref();

  console.log(`[sync/compact] Compaction enabled: retain ${days} days, run every ${intervalHours}h`);

  return () => clearInterval(timer);
}

module.exports = { createSyncRoutes, startCompaction };
