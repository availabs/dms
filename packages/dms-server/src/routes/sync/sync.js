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
  changeLogData,
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

/**
 * SQL form of the split-type exclusion, for pushing the filter into the query
 * instead of discarding rows in JS after they have been read, de-TOASTed and
 * parsed. In the window measured live on 2026-09-10 that read was 1,998 rows
 * and 24 MB of compressed `data` per full-app delta, every byte of it thrown
 * away by isSyncExcluded a moment later.
 *
 * This catches the current `{source}|{view}:data` form only. The legacy
 * NAME_SPLIT_REGEX form (table-resolver.js, e.g. `traffic_counts-1`) has no
 * ':data' suffix, so the JS filter has to stay as a backstop — the two
 * predicates are not equivalent, and the SQL one is deliberately the narrower.
 */
const SQL_NOT_SPLIT_TYPE = `AND type NOT LIKE '%:data'`;

/**
 * Ceiling on how many change_log rows one delta will serialize. Past it the
 * endpoint reports the count instead of the rows — see item B in
 * sync-delta-change-log-bloat.md.
 */
const SERVER_MAX_DELTA = parseInt(process.env.DMS_SYNC_MAX_DELTA, 10) || 1000;

/**
 * The row count ceiling for one delta: the stricter of what the client asked
 * for and what this server allows.
 *
 * Taking the min is what keeps the two thresholds in agreement. Anything the
 * server serializes is under the client's own limit, so a served delta can
 * never be built and then discarded on arrival. A client asking for less than
 * the server default is honoured; one asking for more — or one that sends
 * nothing, i.e. predates `maxChanges` — is capped at the server default.
 *
 * @param {*} rawClientMax - the request's ?maxChanges, unparsed
 * @param {number} serverMax
 * @returns {number}
 */
function resolveMaxChanges(rawClientMax, serverMax = SERVER_MAX_DELTA) {
  const clientMax = parseInt(rawClientMax, 10);
  return Number.isFinite(clientMax) && clientMax > 0
    ? Math.min(clientMax, serverMax)
    : serverMax;
}

/**
 * Build the row query and the matching count query for a delta scope.
 *
 * The two SQL strings deliberately share one `where` string. They have to: the
 * count decides whether the rows are worth reading at all, so a count over a
 * different predicate would either refuse a delta that is actually small or
 * serialize one that isn't.
 *
 * `excludeSplit` reports whether the caller still needs the JS isSyncExcluded
 * pass. It is off for an explicit ?type= request — asking for a split type by
 * name is honoured rather than silently emptied.
 *
 * @param {{ table: string, app: string, type?: string, pattern?: string, sinceRev: number }} opts
 * @returns {{ rowSql: string, countSql: string, params: Array, excludeSplit: boolean }}
 */
function buildDeltaQuery({ table, app, type, pattern, sinceRev }) {
  let where, params, excludeSplit;

  if (pattern) {
    // Pattern-scoped: the pattern's own type, its sub-types, and sibling types
    // under the same instance prefix (e.g. 'songs_2|component' for 'songs_2|page').
    const pipeIdx = pattern.indexOf('|');
    const instancePrefix = pipeIdx !== -1 ? pattern.substring(0, pipeIdx) : null;
    excludeSplit = true;
    where = instancePrefix
      ? `app = $1 AND (type = $2 OR type LIKE $2 || '|%' OR type LIKE $3 || '|%') AND revision > $4 ${SQL_NOT_SPLIT_TYPE}`
      : `app = $1 AND (type = $2 OR type LIKE $2 || '|%') AND revision > $3 ${SQL_NOT_SPLIT_TYPE}`;
    params = instancePrefix ? [app, pattern, instancePrefix, sinceRev] : [app, pattern, sinceRev];
  } else if (type) {
    excludeSplit = false;
    where = `app = $1 AND type = $2 AND revision > $3`;
    params = [app, type, sinceRev];
  } else {
    excludeSplit = true;
    where = `app = $1 AND revision > $2 ${SQL_NOT_SPLIT_TYPE}`;
    params = [app, sinceRev];
  }

  return {
    rowSql: `SELECT * FROM ${table} WHERE ${where} ORDER BY revision ASC`,
    countSql: `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
    params,
    excludeSplit,
  };
}

/**
 * Is a client-supplied item id usable as a bigint primary key?
 *
 * `data_items.id` and `change_log.item_id` are BIGINT. A non-numeric id
 * reached Postgres as a cast and came back as a 500 — `invalid input syntax
 * for type bigint: "no-access"`, 404 of them in a single window on 2026-09-10,
 * because the placeholder id the client had queued a mutation against was
 * replayed forever: a 500 reads as "try again later", and the client's retry
 * had no backoff ceiling. Rejecting it as the 4xx it actually is lets the
 * client discard the mutation instead.
 */
function isValidItemId(id) {
  if (typeof id === 'number') return Number.isInteger(id) && id > 0;
  if (typeof id === 'string') return /^\d+$/.test(id.trim()) && Number(id) > 0;
  return false;
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

      // Compute the revision watermark BEFORE fetching items, not after.
      // These are two separate, non-transactional queries — if a write
      // commits in the gap between them, whichever runs second sees it and
      // whichever runs first doesn't. Reading revision first means a
      // concurrent write can only make `items` MORE current than the
      // reported `revision` (safe: the client's next delta re-fetches that
      // change, redundant but harmless). Reading revision last — the
      // previous order — meant a concurrent write could leave `items`
      // STALE relative to the reported `revision`: the client records
      // itself as caught up through a revision whose actual data it never
      // received, and since every future delta filters on
      // `revision > sinceRev`, that specific change is never re-delivered —
      // a silent, permanent gap. Found live: two browser tabs on the same
      // page, one edited, the other's cold bootstrap reported a revision
      // number newer than the edit but its own local copy of that exact
      // row never picked up the edit, with no further trigger that would
      // ever correct it short of a hard reload or another later edit to
      // the same row.
      let revision = 0;
      if (await hasChangeLog()) {
        const maxRevRow = await dms_db.promise(
          `SELECT MAX(revision) AS max_rev FROM ${tbl('change_log')} WHERE app = $1`,
          [app]
        );
        revision = maxRevRow[0]?.max_rev || 0;
      }

      let items;

      if (skeleton) {
        // Skeleton bootstrap: fetch site row, then follow its refs to get children.
        // This discovers pattern items (and any other dms-format children) from the
        // site data rather than hardcoding type conventions like '|pattern'.
        items = await fetchSkeleton(app, skeleton);
      } else if (pattern) {
        // Pattern-scoped bootstrap: all items whose type matches or extends the doc_type.
        // Also includes sibling types under the same instance prefix (e.g., for
        // 'songs_2|page', also fetch 'songs_2|component', 'songs_2|page-edit', etc.)
        // Optionally includes site skeleton if siteType is provided.
        const { siteType } = req.query;
        const table = await mainTable(app);
        const pipeIdx = pattern.indexOf('|');
        const instancePrefix = pipeIdx !== -1 ? pattern.substring(0, pipeIdx) : null;
        const patternItems = await dms_db.promise(
          instancePrefix
            ? `SELECT * FROM ${table} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%' OR type LIKE $3 || '|%') ORDER BY id`
            : `SELECT * FROM ${table} WHERE app = $1 AND (type = $2 OR type LIKE $2 || '|%') ORDER BY id`,
          instancePrefix ? [app, pattern, instancePrefix] : [app, pattern]
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
      const { app, type, pattern, since, siteType } = req.query;
      if (!app) return res.status(400).json({ error: 'app is required' });
      if (requireAuth && !req.availAuthContext?.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sinceRev = parseInt(since, 10) || 0;
      const maxChanges = resolveMaxChanges(req.query.maxChanges);

      if (!(await hasChangeLog())) {
        return res.json({ changes: [], revision: sinceRev });
      }

      // Compute the revision watermark BEFORE fetching changes, not after —
      // same race as /sync/bootstrap (see its comment for the full
      // explanation): reading revision last let a write that commits in the
      // gap leave `changes` missing that write while `revision` already
      // reflects it, permanently skipping it (every future delta filters on
      // `revision > sinceRev`, which is already past the missed one).
      // Reading revision first means a concurrent write can only make
      // `changes` include MORE than the reported revision implies — the
      // client's next delta harmlessly re-fetches that same change.
      const maxRevRow = await dms_db.promise(
        `SELECT MAX(revision) AS max_rev FROM ${tbl('change_log')} WHERE app = $1`,
        [app]
      );
      const revision = maxRevRow[0]?.max_rev || sinceRev;

      const { rowSql, countSql, params: queryParams, excludeSplit } = buildDeltaQuery({
        table: tbl('change_log'), app, type, pattern, sinceRev,
      });

      // Count before reading anything. Past the threshold the client's only
      // use for this delta is to measure its length and throw it away, so
      // building it is pure waste: 436 MB and 40-120 s at ~1 GB of heap per
      // request when measured live on 2026-09-10, which is what OOM'd this
      // server 26 times in 25 minutes. idx_change_log_app_rev covers the
      // count, and it never touches `data`, so no TOAST is de-compressed.
      //
      // For the pattern scope this counts the pattern predicate only, not the
      // siteType skeleton rows unioned in below. Those are bounded by the
      // skeleton's handful of item_ids, so they cannot turn a small delta into
      // a large one.
      const countRow = await dms_db.promise(countSql, queryParams);
      const count = Number(countRow[0]?.n ?? 0);

      if (count > maxChanges) {
        const scope = pattern ? `pattern=${pattern}` : type ? `type=${type}` : 'full-app';
        const durationMs = Date.now() - t0;
        console.log(`[sync/delta] app=${app} ${scope} since=${sinceRev} → ${count} changes EXCEEDS maxChanges=${maxChanges}, returning tooLarge (rev=${revision}, ${durationMs}ms)`);
        logEntry({
          _type: 'sync-delta-too-large',
          timestamp: new Date().toISOString(),
          app, type: type || null, pattern: pattern || null,
          since: sinceRev, count, maxChanges,
          revision: Number(revision), durationMs,
        });
        // `revision` stays at sinceRev on purpose — it must NOT advance. A
        // client predating this response shape reads `revision` and rewrites
        // its watermark from it; handing it the tail here would push it past
        // thousands of changes it never received, which is precisely the
        // silent permanent gap the revision-before-rows ordering above exists
        // to prevent. Such a client keeps re-requesting the same window as it
        // does today, but for the cost of one count(*) rather than the whole
        // payload. Clients that understand `tooLarge` read the tail from
        // `latestRevision` and advance to it.
        return res.json({
          tooLarge: true,
          count,
          maxChanges,
          changes: [],
          revision: sinceRev,
          latestRevision: Number(revision),
        });
      }

      let changes = await dms_db.promise(rowSql, queryParams);

      if (pattern && siteType) {
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
            `SELECT * FROM ${tbl('change_log')} WHERE app = $1 AND item_id IN (${placeholders}) AND revision > $${skeletonIds.length + 2} ${SQL_NOT_SPLIT_TYPE} ORDER BY revision ASC`,
            [app, ...skeletonIds, sinceRev]
          );
          const seen = new Set(changes.map(c => c.revision));
          changes = [...changes, ...skeletonChanges.filter(c => !seen.has(c.revision))];
          changes.sort((a, b) => a.revision - b.revision);
        }
      }

      // JS backstop for the legacy NAME_SPLIT_REGEX split types, which carry
      // no ':data' suffix for SQL_NOT_SPLIT_TYPE to have caught. Skipped for
      // an explicit ?type= request, which is honoured as asked.
      if (excludeSplit) {
        changes = changes.filter(c => !isSyncExcluded(c.type));
      }

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
      // Delete operations always require authentication regardless of DMS_SYNC_AUTH setting.
      if (action === 'D' && !req.availAuthContext?.user) {
        return res.status(401).json({ error: 'Authentication required to delete items' });
      }
      if (!action || !item) return res.status(400).json({ error: 'action and item are required' });
      if (item.id != null && !isValidItemId(item.id)) {
        return res.status(400).json({ error: `Invalid item id: ${JSON.stringify(item.id)}` });
      }
      if ((action === 'U' || action === 'D') && item.id == null) {
        return res.status(400).json({ error: `action ${action} requires item.id` });
      }

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
            `INSERT INTO ${tbl('change_log')} (item_id, app, type, action, data, created_by, ip, user_agent, auth_state)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING revision;`,
            [resultItem.id, resultItem.app, resultItem.type, action,
             changeLogData(resultItem.type, action, resultItem.data), userId,
             req.clientIp || null,
             req.headers['user-agent'] || null,
             userId ? 'authenticated' : 'sync']
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

module.exports = {
  createSyncRoutes,
  startCompaction,
  // Exposed for testing
  buildDeltaQuery,
  resolveMaxChanges,
  isValidItemId,
  SQL_NOT_SPLIT_TYPE,
  SERVER_MAX_DELTA,
};
