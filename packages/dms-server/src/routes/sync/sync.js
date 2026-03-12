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
const {
  isSplitType,
} = require('#db/table-resolver.js');
const {
  jsonMerge,
  currentTimestamp,
  typeCast,
} = require('#db/query-utils.js');
const { logEntry } = require('../../middleware/request-logger');

/**
 * Chunked query helper for SQLite event loop yielding.
 *
 * better-sqlite3 is synchronous — a single large SELECT blocks the event loop.
 * This helper paginates the query with LIMIT/OFFSET and yields between chunks
 * via setImmediate(), allowing other requests, timers, and WebSocket pings to
 * run between chunks.
 *
 * For PostgreSQL (async driver), the query runs normally in one shot.
 *
 * @param {Object} db - Database adapter
 * @param {string} sql - SQL query (must not already contain LIMIT/OFFSET)
 * @param {Array} params - Query parameters
 * @param {number} [chunkSize=500] - Rows per chunk (SQLite only)
 * @returns {Promise<Array>} All result rows
 */
async function queryChunked(db, sql, params, chunkSize = 500) {
  if (db.type !== 'sqlite') {
    return db.promise(sql, params);
  }

  // SQLite: paginate with LIMIT/OFFSET, yield between chunks
  const allRows = [];
  let offset = 0;

  while (true) {
    const chunk = await db.promise(
      `${sql} LIMIT ${chunkSize} OFFSET ${offset}`,
      params
    );
    allRows.push(...chunk);

    if (chunk.length < chunkSize) break; // Last chunk
    offset += chunkSize;

    // Yield to event loop between chunks
    await new Promise(resolve => setImmediate(resolve));
  }

  return allRows;
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

  function tbl(name) {
    return dbType === 'postgres' ? `dms.${name}` : name;
  }

  function now() {
    return currentTimestamp(dbType);
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

  // ---- Bootstrap: full snapshot ----

  router.get('/sync/bootstrap', async (req, res) => {
    try {
      const { app, type, pattern, skeleton } = req.query;
      if (!app) return res.status(400).json({ error: 'app is required' });

      let items;

      if (skeleton) {
        // Skeleton bootstrap: site row + pattern rows only (always small, <20 items)
        // skeleton value = siteType
        items = await dms_db.promise(
          `SELECT * FROM ${tbl('data_items')} WHERE app = $1 AND (type = $2 OR type = $2 || '|pattern') ORDER BY id`,
          [app, skeleton]
        );
      } else if (pattern) {
        // Pattern-scoped bootstrap: site skeleton + pattern-specific items
        // pattern value = doc_type
        // The siteType is needed for skeleton — passed as `siteType` query param
        const { siteType } = req.query;
        const patternItems = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('data_items')} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%') ORDER BY id`,
          [app, pattern]
        );
        if (siteType) {
          // Also include site skeleton (site + pattern rows)
          const skeletonItems = await dms_db.promise(
            `SELECT * FROM ${tbl('data_items')} WHERE app = $1 AND (type = $2 OR type = $2 || '|pattern') ORDER BY id`,
            [app, siteType]
          );
          // Merge, deduplicating by id
          const seen = new Set(patternItems.map(i => i.id));
          items = [...patternItems, ...skeletonItems.filter(i => !seen.has(i.id))];
        } else {
          items = patternItems;
        }
        // Filter out split-table types
        items = items.filter(item => !isSplitType(item.type));
      } else if (type) {
        // Type-scoped bootstrap (exact type match)
        items = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('data_items')} WHERE app = $1 AND type = $2 ORDER BY id`,
          [app, type]
        );
      } else {
        // Full app bootstrap — main table only, exclude split-table types
        const allItems = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('data_items')} WHERE app = $1 ORDER BY id`,
          [app]
        );
        items = allItems.filter(item => !isSplitType(item.type));
      }

      let revision = 0;
      if (await hasChangeLog()) {
        const maxRevRow = await dms_db.promise(
          `SELECT MAX(revision) AS max_rev FROM ${tbl('change_log')} WHERE app = $1`,
          [app]
        );
        revision = maxRevRow[0]?.max_rev || 0;
      }

      const response = { items, revision: Number(revision) };
      const payload = JSON.stringify(response);
      const scope = skeleton ? `skeleton=${skeleton}` : pattern ? `pattern=${pattern}` : type ? `type=${type}` : 'full-app';
      const payloadKB = +(payload.length / 1024).toFixed(1);
      console.log(`[sync/bootstrap] app=${app} ${scope} → ${items.length} items, ${payloadKB}KB, rev=${revision}`);
      logEntry({
        _type: 'sync-bootstrap',
        timestamp: new Date().toISOString(),
        app, scope,
        pattern: pattern || null, skeleton: skeleton || null,
        itemCount: items.length,
        payloadKB,
        revision: Number(revision),
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(payload);
    } catch (err) {
      console.error('[sync/bootstrap] error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---- Delta: changes since revision N ----

  router.get('/sync/delta', async (req, res) => {
    try {
      const { app, type, pattern, since } = req.query;
      if (!app) return res.status(400).json({ error: 'app is required' });

      const sinceRev = parseInt(since, 10) || 0;

      if (!(await hasChangeLog())) {
        return res.json({ changes: [], revision: sinceRev });
      }

      let changes;
      if (pattern) {
        // Pattern-scoped delta: changes for types matching the pattern's doc_type
        // Also include skeleton types if siteType is provided
        const { siteType } = req.query;
        let patternChanges = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%') AND revision > $3 ORDER BY revision ASC`,
          [app, pattern, sinceRev]
        );
        if (siteType) {
          const skeletonChanges = await dms_db.promise(
            `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND (type = $2 OR type = $2 || '|pattern') AND revision > $3 ORDER BY revision ASC`,
            [app, siteType, sinceRev]
          );
          const seen = new Set(patternChanges.map(c => c.revision));
          patternChanges = [...patternChanges, ...skeletonChanges.filter(c => !seen.has(c.revision))];
          patternChanges.sort((a, b) => a.revision - b.revision);
        }
        changes = patternChanges.filter(c => !isSplitType(c.type));
      } else if (type) {
        changes = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND type = $2 AND revision > $3 ORDER BY revision ASC`,
          [app, type, sinceRev]
        );
      } else {
        // Default: exclude split-table types
        const allChanges = await queryChunked(dms_db,
          `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND revision > $2 ORDER BY revision ASC`,
          [app, sinceRev]
        );
        changes = allChanges.filter(c => !isSplitType(c.type));
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
      console.log(`[sync/delta] app=${app} ${scope} since=${sinceRev} → ${changes.length} changes, ${payloadKB}KB, rev=${revision}`);
      logEntry({
        _type: 'sync-delta',
        timestamp: new Date().toISOString(),
        app, type: type || null, pattern: pattern || null,
        since: sinceRev,
        changeCount: changes.length,
        payloadKB,
        revision: Number(revision),
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
      const { action, item } = req.body;
      if (!action || !item) return res.status(400).json({ error: 'action and item are required' });

      const { user = null } = req.availAuthContext || {};
      const userId = user?.id || null;

      await dms_db.beginTransaction();
      try {
        let resultItem;

        if (action === 'I') {
          // Create — use ON CONFLICT for idempotent retries
          const dataStr = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});

          if (item.id) {
            // Client-provided ID (e.g., from pending queue retry)
            await dms_db.promise(
              `INSERT INTO ${tbl('data_items')} (id, app, type, data, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5, $5)
               ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = ${now()}, updated_by = excluded.updated_by`,
              [item.id, item.app, item.type, dataStr, userId]
            );
            const rows = await dms_db.promise(
              `SELECT * FROM ${tbl('data_items')} WHERE id = $1`, [item.id]
            );
            resultItem = rows[0];
          } else {
            const rows = await dms_db.promise(
              `INSERT INTO ${tbl('data_items')} (app, type, data, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $4)
               RETURNING *;`,
              [item.app, item.type, dataStr, userId]
            );
            resultItem = rows[0];
          }

        } else if (action === 'U') {
          const dataStr = typeof item.data === 'string' ? item.data : JSON.stringify(item.data || {});
          const rows = await dms_db.promise(
            `UPDATE ${tbl('data_items')}
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
            `DELETE FROM ${tbl('data_items')} WHERE id = $1`,
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

module.exports = { createSyncRoutes };
