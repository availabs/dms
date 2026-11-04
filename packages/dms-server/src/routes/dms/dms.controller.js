const { getDb } = require('#db/index.js')
const { loadConfig } = require('#db/config.js')
const get = require("lodash/get")
const {
  handleFilters,
  handleGroupBy,
  handleOrderBy,
  getValuesExceptNulls,
  extent
} = require("./utils");
const {
  buildArrayComparison,
  jsonExtract,
  typeCast,
  jsonMerge,
  currentTimestamp,
  QueryBuilder
} = require('#db/query-utils.js');
const { resolveAuthPermissions } = require('../auth/auth');
const {
  isSplitType,
  changeLogData,
  parseType,
  resolveTable,
  getSequenceName,
  ensureSequence,
  ensureTable,
  allocateId,
  forgetTable
} = require('#db/table-resolver.js');
const { parseSplitDataType, getKind, getInstance, getParent } = require('#db/type-utils.js');
const { logEntry } = require('../../middleware/request-logger');
const { parseJson, parseChangeHistory, historyText, historyStamp, withinBurst, historyVia } = require('./changeHistory');

const DATA_ATTRIBUTES = [
  "id", "app", "type", "data",
  "created_at", "created_by",
  "updated_at", "updated_by"
];

// Optional, deployment-registered side effect for page deletes (e.g. an
// app-specific catalog row cleanup — see cascadePageDelete below). Loaded
// once at server boot from DMS_PAGE_DELETE_HOOK (see index.js). Module-level
// rather than per-controller-instance: it's a single boot-time concept meant
// to apply no matter which controller instance's deleteData runs, and
// dms.route.js/index.js each create their own createController() instance
// rather than sharing this file's defaultController. Tests set/reset it
// directly via setPageDeleteHook.
let _pageDeleteHook = null;
function setPageDeleteHook(fn) { _pageDeleteHook = fn; }
function getPageDeleteHook() { return _pageDeleteHook; }

// ignore dangerous column names
const sanitizeName = name => {
    const disallowedKeywords = ['select', 'create', 'drop', 'update', 'delete', 'insert', 'alter', 'exec', 'union', 'cast'];
    const disallowedSymbols = [';']

    const isValidName = (name) => {
        if (typeof name !== 'string') return false;
        const trimmedName = name.trim();

        if (
            disallowedKeywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(trimmedName)) ||
            disallowedSymbols.some(keyword => new RegExp(keyword).test(trimmedName))
        ) {
            return false;
        }

        return trimmedName;
    };

    if (Array.isArray(name)) {
        return name.filter(isValidName);
    }

    return isValidName(name);
};

/**
 * Create a DMS controller configured for a specific database
 * @param {string} dbName - Database config name (e.g., 'dms-sqlite', 'dms-postgres')
 * @param {Object} [options]
 * @param {string} [options.splitMode='legacy'] - Table split mode: 'legacy' or 'per-app'
 * @returns {Object} Controller with all DMS operations
 */
function createController(dbName = 'dms-sqlite', options = {}) {
  const config = loadConfig(dbName);
  const splitMode = options.splitMode || config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const dms_db = getDb(dbName);
  const dbType = dms_db.type;

  // Sync change_log callback — set by WebSocket module via setNotifyChange()
  let _notifyChange = null;

  // Helper functions scoped to this controller instance
  function tableName(name) {
    return dbType === 'postgres' ? `dms.${name}` : name;
  }

  function jsonField(column, field, asText = true) {
    return jsonExtract(column, field, dbType, asText);
  }

  function now() {
    return currentTimestamp(dbType);
  }

  // Cache for source_id lookups: `${app}:${docType}` → sourceId (number or null)
  const _sourceIdCache = new Map();

  // Cache for getTags results: `${app}+${type}:${searchType}` → { data, ts }
  const _tagsCache = new Map();
  const TAGS_CACHE_TTL = 60_000; // 1 minute

  // Track which tables have the tags expression index (created lazily)
  const _tagsIndexedTables = new Set();

  // Change-history specs (changeHistory.js): `${app}:${sourceId}` → { spec, ts }, spec null for an
  // untracked dataset. A write to any source row clears it; the TTL covers other server processes.
  const _changeHistoryCache = new Map();
  const CHANGE_HISTORY_CACHE_TTL = 60_000;

  // Periodic cache cleanup — evict expired tags entries and cap source ID cache
  const _cacheCleanup = setInterval(() => {
    // Evict expired tags cache entries
    const now = Date.now();
    for (const [key, entry] of _tagsCache) {
      if (now - entry.ts > TAGS_CACHE_TTL) _tagsCache.delete(key);
    }
    // Cap source ID cache at 500 entries (LRU-like: just clear when too large)
    if (_sourceIdCache.size > 500) _sourceIdCache.clear();
  }, 60_000);
  _cacheCleanup.unref();

  /**
   * Get the main (non-split) table for an app, ensuring it exists.
   * Legacy mode: data_items
   * Per-app mode: data_items__{app} (auto-created if needed)
   *
   * `q` is the executor: dms_db, or the `tx` handle when called inside withTransaction. The
   * ensure* calls are cached no-ops after the first call per table — write paths call
   * mainTable()/ensureForWrite() BEFORE opening a transaction so its DDL never runs inside one
   * (a rolled-back CREATE would leave the cache claiming a table that doesn't exist).
   */
  /**
   * Column list for the row-auth loaders (routes/dms/rowAuth.js), from the memoised capability
   * probe. On an unmigrated table this includes `data`, because the parentage and grants live
   * inside it; once the columns exist it does not, which is what keeps bulk resolution off the heap.
   */
  /**
   * The kind that owns rows of `type`, from the pattern's `childRefs` declaration — or null when
   * the pattern declares none (then `parentId.js` falls back to its structural check).
   *
   * The declaration lives on the pattern row because dms-server cannot read formats
   * (`dms.formats` holds no rows), so `type: 'dms-format'` — which is where the client declares the
   * same thing — never reaches the server. Memoised per (app, pattern instance) for the life of the
   * process, like the other row-auth lookups: patterns are few and this sits on the create path.
   */
  const _childRefsCache = new Map();

  /**
   * The whole `childRefs` map for `type`'s container, or null. Two readers want it from opposite
   * directions — `ownerKindForType` ("which kind owns a row of this type", for validating a claim)
   * and `stampChildren` ("which attributes of this row hold children", for writing them) — so the
   * lookup and its cache live here once.
   */
  async function childRefsForType(app, type) {
    const { getParent, getInstance, getKind } = require('#db/type-utils.js');
    // Which pattern's declaration governs this row's children?
    //
    // For a CHILD of a pattern (`chenango|page`) it is the pattern its type path names, so the
    // container segment is the answer. For the PATTERN ROW ITSELF (`prod|datasets:pattern`) the
    // container is the SITE, and looking there finds nothing — the declaration lives on the row we
    // are standing on. A datasets pattern owning its dmsEnv is the first case where an owner is
    // itself a pattern, so until 2026-10-29 that lookup silently returned null and nothing stamped.
    const container = getKind(type) === 'pattern' ? getInstance(type) : getParent(type);
    if (!container) return null;
    const key = `${app}|${container}`;
    if (!_childRefsCache.has(key)) {
      const probe = (async () => {
        try {
          const t = resolveTable(app, '', dbType, splitMode);
          const caps = await require('./rowAuthCaps').rowAuthCaps(dms_db, t.schema, t.table, dbType);
          // `data` as well as `auth`: the column exists once a table is migrated, but an
          // individual pattern row only carries the declaration there after --sync-vocabulary has
          // run. Until then it is in `data`, where the client's create stamp put it.
          const cols = caps.auth ? 'auth, data, type' : 'data, type';
          const rows = await dms_db.promise(
            `SELECT ${cols} FROM ${t.fullName} WHERE app = $1 AND type LIKE $2 LIMIT 1`,
            [app, `%|${container}:pattern`]
          );
          return require('../auth/authVocabulary').childRefsOf(rows[0]) || null;
        } catch (e) {
          console.warn(`[parent-id] childRefs lookup failed for ${key}: ${e.message}`);
          return null;
        }
      })();
      _childRefsCache.set(key, probe);
      // Do NOT keep a NULL. "No declaration found" is the one answer that can change a moment
      // later — a pattern row's own create probes before the row exists, so caching the null
      // poisons every subsequent save of that pattern (its children then never stamp, silently).
      // A found declaration is stable and stays cached; absence is re-asked, which is one small
      // indexed lookup on apps that have none. Third time a memoised absence has bitten this work
      // — `rowAuthCaps` latching "unmigrated" is the same shape.
      probe.then((v) => { if (!v && _childRefsCache.get(key) === probe) _childRefsCache.delete(key); })
           .catch(() => _childRefsCache.delete(key));
    }
    return _childRefsCache.get(key);
  }

  async function ownerKindForType(app, type) {
    const { getKind } = require('#db/type-utils.js');
    return require('../auth/authVocabulary').ownerKindOf(await childRefsForType(app, type), getKind(type));
  }

  /**
   * What `stampDeclaredChildren` needs, resolved BEFORE a transaction opens: the schema capability
   * and the pattern's declaration. Returns the `childRefs` map, or null when there is nothing to do.
   *
   * Both are adapter queries, and an adapter query inside `withTransaction` is forbidden (see this
   * package's CLAUDE.md): sqlite throws on the lock it would wait for, postgres silently runs it on
   * another pooled connection. Worse, `rowAuthCaps` CACHES a failed probe as `{auth:false,
   * parentId:false}` for the life of the process — so calling it from inside a transaction once
   * disables parentage for that table permanently. Both lookups are memoised, so hoisting them
   * costs nothing after the first call.
   */
  async function childStampPlan(app, type) {
    if (!app || !type) return null;
    try {
      const t = resolveTable(app, '', dbType, splitMode);
      if (!(await require('./rowAuthCaps').rowAuthCaps(dms_db, t.schema, t.table, dbType)).parentId) return null;
      return (await childRefsForType(app, type)) || null;
    } catch (e) {
      console.warn(`[parent-id] child-stamp plan for ${app}/${type} failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Stamp `parent_id` on the children this write names (routes/dms/parentId.js `stampChildren`).
   * Runs inside the caller's transaction, on `tx`, so it commits with the row. `childRefs` comes
   * from `childStampPlan`, called before the transaction opened. Never throws: a page save does not
   * fail over parentage.
   */
  async function stampDeclaredChildren(tx, { table, app, id, type, data, childRefs }) {
    if (!childRefs) return 0;
    try {
      return await require('./parentId').stampChildren(tx, { table, app, id, type, data, childRefs });
    } catch (e) {
      console.warn(`[parent-id] stamping children of ${app}/${id} (${type}) failed: ${e.message}`);
      return 0;
    }
  }

  /**
   * `DMS_CHILD_SWEEP_MODE`: `off` | `log` | `delete`, default **`log`**.
   *
   * Deleting a child is the only irreversible thing parentage does, so it ships the way row auth
   * itself did — reporting first. `log` runs the same SELECT the DELETE would have run and prints
   * what it would have removed; nothing else about the write changes. An unknown value reads as
   * `log`.
   *
   * **`delete` is gated on `migrate-row-auth.js --verify-parents` reporting ZERO rows "named by 2+
   * owners" for the app**, the same way `DMS_AUTH_MODE=enforce` is gated on coverage. The
   * reason is `stampChildren`: it re-homes a child whose `parent_id` points elsewhere, on purpose,
   * because re-asserting from the owner's own array is what repairs drift. On healthy data nothing
   * exercises that — there is no cross-page section move, and paste/duplicate/template all mint new
   * rows. On a component listed by TWO pages it means the last page to save owns it, and that page
   * dropping the section would delete a row the other page still shows. The migration repairs those
   * rows by duplicating them; verify first, then flip. (`tests/test-child-sweep.js` pins this.)
   */
  function childSweepMode() {
    const m = String(process.env.DMS_CHILD_SWEEP_MODE || 'log').toLowerCase();
    return (m === 'off' || m === 'delete') ? m : 'log';
  }

  /**
   * Delete the children a write dropped (routes/dms/parentId.js). Runs inside the caller's
   * transaction so it commits with the row. Never throws, for the same reason the stamp does not:
   * a page save must not fail over parentage.
   */
  async function sweepDeclaredChildren(tx, { table, app, id, type, before, after, childRefs }) {
    const mode = childSweepMode();
    if (!childRefs || mode === 'off') return 0;
    try {
      const { planRemovedChildren, sweepRemovedChildren } = require('./parentId');
      const removed = planRemovedChildren(before, after, { type, childRefs });
      if (!removed.length) return 0;
      const res = await sweepRemovedChildren(tx, { table, app, id, type, removed, mode });
      if (res.swept) {
        console.log(`[parent-id] ${mode === 'delete' ? 'swept' : 'would sweep'} ${res.swept} `
          + `child row(s) dropped by ${app}/${id} (${type})`);
      }
      return res.swept;
    } catch (e) {
      console.warn(`[parent-id] sweeping children of ${app}/${id} (${type}) failed: ${e.message}`);
      return 0;
    }
  }

  /** The same, for an owner row that is itself being deleted: everything it parents goes. */
  async function sweepChildrenOfDeleted(tx, { table, app, id, type, childRefs }) {
    const mode = childSweepMode();
    if (!childRefs || mode === 'off') return 0;
    try {
      const res = await require('./parentId').sweepAllChildren(tx, { table, app, id, type, childRefs, mode });
      if (res.swept) {
        console.log(`[parent-id] ${mode === 'delete' ? 'deleted' : 'would delete'} ${res.swept} `
          + `child row(s) of deleted ${app}/${id} (${type})`);
      }
      return res.swept;
    } catch (e) {
      console.warn(`[parent-id] sweeping children of deleted ${app}/${id} (${type}) failed: ${e.message}`);
      return 0;
    }
  }

  async function authProjection(app) {
    const { rowAuthCaps, authColumns } = require('./rowAuthCaps');
    const t = resolveTable(app, '', dbType, splitMode);
    const caps = await rowAuthCaps(dms_db, t.schema, t.table, dbType);
    return authColumns(caps, dbType).join(', ');
  }

  async function mainTable(app, q = dms_db) {
    const resolved = resolveTable(app, '', dbType, splitMode);
    // In per-app mode, ensure the app's table + sequence exist.
    // ensureTable() no-ops for the shared dms.data_items (legacy mode).
    const seqName = getSequenceName(app, dbType, splitMode);
    await ensureSequence(q, app, dbType, splitMode);
    await ensureTable(q, resolved.schema, resolved.table, dbType, seqName);
    return resolved.fullName;
  }

  /**
   * The source a dataset name (slug) resolves to: the newest source in the app whose type
   * ends in `|<slug>:source`, or null. Split-table routing uses this, so it decides which
   * source a `<slug>|<view>:data` row belongs to.
   * `q`: dms_db, or `tx` inside withTransaction (see mainTable).
   */
  async function lookupSourceIdBySlug(app, slug, q = dms_db) {
    const cacheKey = `${app}:${slug}`;
    if (_sourceIdCache.has(cacheKey)) return _sourceIdCache.get(cacheKey);

    try {
      const table = await mainTable(app, q);
      const rows = await q.promise(
        `SELECT id FROM ${table} WHERE app = $1 AND type LIKE '%|' || $2 || ':source' ORDER BY id DESC LIMIT 1`,
        [app, slug]
      );
      const sourceId = rows[0]?.id || null;
      _sourceIdCache.set(cacheKey, sourceId);
      return sourceId;
    } catch {
      _sourceIdCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Look up the source record ID for a split type's source.
   * Handles both new format ({source}|{view}:data → look up by type LIKE '%|{source}:source')
   * and legacy format ({docType}-{viewId} → look up by data.doc_type).
   * Returns sourceId (number) or null if not found (graceful fallback).
   * `q`: dms_db, or `tx` inside withTransaction (see mainTable).
   */
  async function lookupSourceId(app, type, q = dms_db) {
    if (!isSplitType(type)) return null;

    // New format: {source}|{view}:data
    const newParsed = parseSplitDataType(type);
    if (newParsed) return lookupSourceIdBySlug(app, newParsed.source, q);

    // Legacy format: {docType}-{viewId}
    const parsed = parseType(type);
    if (!parsed || !parsed.docType) return null;

    const cacheKey = `${app}:${parsed.docType}`;
    if (_sourceIdCache.has(cacheKey)) return _sourceIdCache.get(cacheKey);

    try {
      const table = await mainTable(app, q);
      const rows = await q.promise(
        `SELECT id FROM ${table} WHERE app = $1 AND lower(${jsonField('data', 'doc_type')}) = lower($2) AND (type LIKE '%|source' OR type LIKE '%:source') ORDER BY id DESC LIMIT 1`,
        [app, parsed.docType]
      );
      const sourceId = rows[0]?.id || null;
      _sourceIdCache.set(cacheKey, sourceId);
      return sourceId;
    } catch {
      _sourceIdCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Resolve (app, type) → fully-qualified table name.
   * Async — looks up source_id for split types to build new table names.
   */
  async function resolve(app, type) {
    const sourceId = await lookupSourceId(app, type);
    return resolveTable(app, type, dbType, splitMode, sourceId);
  }

  /**
   * Ensure the target table (and its sequence) exist for a write operation.
   * No-ops for the default data_items table.
   */
  async function ensureForWrite(app, type) {
    const resolved = await resolve(app, type);
    const seqName = getSequenceName(app, dbType, splitMode);
    await ensureSequence(dms_db, app, dbType, splitMode);
    await ensureTable(dms_db, resolved.schema, resolved.table, dbType, seqName);
    return resolved;
  }

  /**
   * Resolve the table for a read — ensure it exists so the query doesn't error.
   * ensureTable() no-ops for the shared dms.data_items (legacy mode).
   */
  async function ensureForRead(app, type) {
    const resolved = await resolve(app, type);
    const seqName = getSequenceName(app, dbType, splitMode);
    await ensureSequence(dms_db, app, dbType, splitMode);
    await ensureTable(dms_db, resolved.schema, resolved.table, dbType, seqName);
    return resolved;
  }

  /**
   * Append to change_log and notify sync subscribers.
   * Called after each mutation (create/update/delete) to data_items, always inside the
   * mutation's withTransaction: `tx` is the transaction handle, and the WebSocket broadcast is
   * deferred to tx.afterCommit so subscribers never hear about a write that then rolls back.
   */
  async function appendChangeLog(tx, itemId, app, type, action, data, userId, reqMeta) {
    const tbl = dbType === 'postgres' ? 'dms.change_log' : 'change_log';
    const rows = await tx.promise(
      `INSERT INTO ${tbl} (item_id, app, type, action, data, created_by, ip, user_agent, auth_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING revision;`,
      [itemId, app, type, action, changeLogData(type, action, data), userId,
       reqMeta?.ip || null, reqMeta?.userAgent || null, reqMeta?.authState || null]
    );
    const revision = rows[0]?.revision;
    if (_notifyChange) {
      tx.afterCommit(() => {
        const msg = { type: 'change', revision, action, item: action === 'D' ? { id: itemId, app, type } : { id: itemId, app, type, data } };
        const dataSize = data ? (typeof data === 'string' ? data.length : JSON.stringify(data).length) : 0;
        logEntry({
          _type: 'sync-notify-falcor',
          timestamp: new Date().toISOString(),
          action, itemId, app, type,
          dataKB: +(dataSize / 1024).toFixed(1),
          revision,
        });
        _notifyChange(app, msg);
      });
    }
    return revision;
  }

  /**
   * The change-history spec (changeHistory.js) of the dataset a split-table row belongs to, with
   * its history dataset resolved: `targetType` is the history rows' type. Null when the dataset
   * isn't tracked, or when its history dataset can't be found (warned; edits then save without
   * history rather than fail).
   */
  async function loadChangeHistory(app, type) {
    const sourceId = await lookupSourceId(app, type);
    if (!sourceId) return null;
    const cacheKey = `${app}:${sourceId}`;
    const cached = _changeHistoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CHANGE_HISTORY_CACHE_TTL) return cached.spec;

    const table = await mainTable(app);
    const [source] = await dms_db.promise(`SELECT data FROM ${table} WHERE id = $1`, [sourceId]);
    let spec = parseChangeHistory(parseJson(source?.data));
    if (spec) {
      const [target] = await dms_db.promise(`SELECT type FROM ${table} WHERE id = $1`, [spec.targetSourceId]);
      const [view] = await dms_db.promise(`SELECT type FROM ${table} WHERE id = $1`, [spec.targetViewId]);
      const slug = target && getKind(target.type) === 'source' ? getInstance(target.type) : null;
      // Split rows are routed by dataset name (the newest source with it), so the history
      // dataset's name has to lead back to it.
      const routedId = slug ? await lookupSourceIdBySlug(app, slug) : null;
      if (!view || getKind(view.type) !== 'view' || +routedId !== spec.targetSourceId) {
        console.warn(`[change-history] ${app} source ${sourceId}: history dataset ${spec.targetSourceId} (view ${spec.targetViewId}) not found; edits save without history`);
        spec = null;
      } else {
        spec = { ...spec, sourceId: +sourceId, targetType: `${slug}|${spec.targetViewId}:data` };
      }
    }
    _changeHistoryCache.set(cacheKey, { spec, ts: Date.now() });
    return spec;
  }

  /**
   * Records an edit's changed tracked columns in the dataset's history (changeHistory.js), one
   * row per column. Runs inside setDataById's (or createData's) transaction, so the history lands
   * with the write or not at all. A typed column's save merges into the newest history row for that
   * row and column when it's the same person's and under 30 s old, the burst of saves typing makes.
   * If the text is back where it started, that row is removed.
   * `target`: the history dataset's resolved table (ensured before the transaction).
   * `created`: the row was just created (`before` is empty). Each tracked column with a value gets a
   * row from '', marked `op: 'create'` (an edit's rows are `op: 'edit'`); an edit from an empty value
   * also has an empty old value, so `op` is how a reader tells them apart. A new row has no earlier
   * history to merge into, so the burst lookup is skipped.
   */
  async function writeChangeHistory(tx, { spec, target, app, rowId, before, after, patch, user, reqMeta, created = false }) {
    const userId = get(user, 'id', null);
    const clock = new Date();
    const at = historyStamp(clock);
    for (const field of Object.keys(patch).filter(spec.tracks)) {
      const oldValue = historyText(before?.[field]);
      const newValue = historyText(after?.[field]);
      if (oldValue === newValue) continue;

      if (!created && userId != null && spec.merges(field)) {
        // Only the history's newest 200 rows are searched: a burst is recent by definition, and
        // this keeps a typed save's cost flat however long the history grows.
        const [last] = await tx.promise(`
          SELECT id, data FROM (
            SELECT id, data FROM ${target.fullName} WHERE type = $1 ORDER BY id DESC LIMIT 200
          ) recent
          WHERE ${jsonField('data', 'row_id')} = $2 AND ${jsonField('data', 'field')} = $3
          ORDER BY id DESC
          LIMIT 1;
        `, [spec.targetType, +rowId, field]);
        const lastData = parseJson(last?.data);
        if (lastData && +lastData.user_id === +userId && withinBurst(lastData.at, clock)) {
          if (newValue === lastData.old_value) {
            await tx.promise(`DELETE FROM ${target.fullName} WHERE id = $1;`, [last.id]);
            await appendChangeLog(tx, last.id, app, spec.targetType, 'D', null, userId, reqMeta);
          } else {
            const [merged] = await tx.promise(`
              UPDATE ${target.fullName}
              SET data = ${jsonMerge('data', '$1', dbType)},
                updated_at = ${now()},
                updated_by = $2
              WHERE id = $3
              RETURNING id, data;
            `, [{ new_value: newValue, at }, userId, last.id]);
            await appendChangeLog(tx, merged.id, app, spec.targetType, 'U', merged.data, userId, reqMeta);
          }
          continue;
        }
      }

      const data = {
        row_id: +rowId, source_id: spec.sourceId, field, old_value: oldValue, new_value: newValue,
        user_id: userId, user_email: get(user, 'email', null), at, via: historyVia(reqMeta), op: created ? 'create' : 'edit',
      };
      // Same insert as createData: SQLite split tables take an allocated id, Postgres a default.
      const [inserted] = dbType === 'sqlite'
        ? await tx.promise(`
            INSERT INTO ${target.fullName}(id, app, type, data, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING id, data;
          `, [await allocateId(tx, app, dbType, splitMode), app, spec.targetType, data, userId])
        : await tx.promise(`
            INSERT INTO ${target.fullName}(app, type, data, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $4)
            RETURNING id, data;
          `, [app, spec.targetType, data, userId]);
      await appendChangeLog(tx, inserted.id, app, spec.targetType, 'I', inserted.data, userId, reqMeta);
    }
  }

  /**
   * Escape LIKE wildcards so an instance slug matches literally (pair with ESCAPE '\').
   */
  function escapeLike(s) {
    return s.replace(/[\\%_]/g, ch => `\\${ch}`);
  }

  /**
   * Remove {ref, id} entries pointing at a deleted child from parent ref arrays
   * (`data.sources` on dmsEnv/pattern rows, `data.views` on source rows).
   * The datasets list is rendered FROM those arrays, so entries left behind
   * render as ghost rows for items that no longer exist. Runs inside deleteData's transaction.
   */
  async function removeIdFromRefArrays(tx, app, arrayKey, parentKinds, childId, userId, reqMeta) {
    const table = await mainTable(app, tx);
    const kindsClause = parentKinds.map(k => `type LIKE '%:${k}'`).join(' OR ');
    const parents = await tx.promise(
      `SELECT id, type, data FROM ${table} WHERE app = $1 AND (${kindsClause});`,
      [app]
    );

    for (const parent of parents) {
      const data = typeof parent.data === 'string' ? JSON.parse(parent.data) : (parent.data || {});
      const refs = data[arrayKey];
      if (!Array.isArray(refs)) continue;
      const kept = refs.filter(r => String(r?.id ?? r) !== String(childId));
      if (kept.length === refs.length) continue;

      const rows = await tx.promise(
        `UPDATE ${table}
         SET data = ${jsonMerge('data', '$1', dbType)},
           updated_at = ${now()},
           updated_by = $2
         WHERE id = $3
         RETURNING id, app, type, data;`,
        [JSON.stringify({ [arrayKey]: kept }), userId, parent.id]
      );
      if (rows[0]) {
        await appendChangeLog(tx, rows[0].id, rows[0].app, rows[0].type, 'U', rows[0].data, userId, reqMeta);
      }
    }
  }

  /**
   * Drop a view's data split table (valid + invalid rows share it). sourceId is
   * passed explicitly — during a source cascade the source row is already gone,
   * so lookupSourceId can't resolve it. Runs inside deleteData's transaction (a rollback restores
   * the table; the forgotten cache entry just means the next write re-runs ensureTable).
   */
  async function dropViewDataTable(tx, app, sourceInstance, viewId, sourceId) {
    const dataType = `${sourceInstance}|${viewId}:data`;
    const resolved = resolveTable(app, dataType, dbType, splitMode, sourceId);
    // Only ever drop dedicated split tables, never a shared data_items table
    if (!resolved.table.startsWith('data_items__')) return;
    await tx.promise(`DROP TABLE IF EXISTS ${resolved.fullName};`);
    forgetTable(resolved.schema, resolved.table);
  }

  /**
   * A deleted source takes its dependents with it: child view rows, their data
   * split tables, and the {ref, id} entries in any dmsEnv/pattern `data.sources`
   * array. New-format (`:source`) rows only — legacy colon-less types are
   * handled by the deprecation migration, not here.
   */
  async function cascadeSourceDelete(tx, row, userId, reqMeta) {
    const instance = getInstance(row.type);
    const table = await mainTable(row.app, tx);

    if (instance) {
      const views = await tx.promise(
        `SELECT id, type FROM ${table} WHERE app = $1 AND type LIKE $2 ESCAPE '\\';`,
        [row.app, `${escapeLike(instance)}|%:view`]
      );
      for (const view of views) {
        await dropViewDataTable(tx, row.app, instance, view.id, row.id);
        await tx.promise(`DELETE FROM ${table} WHERE id = $1;`, [view.id]);
        await appendChangeLog(tx, view.id, row.app, view.type, 'D', null, userId, reqMeta);
      }
      _sourceIdCache.delete(`${row.app}:${instance}`);
    }

    await removeIdFromRefArrays(tx, row.app, 'sources', ['dmsenv', 'pattern'], row.id, userId, reqMeta);
  }

  /**
   * A deleted view drops its data split table and vacates its {ref, id} entry
   * in the parent source's `data.views` array.
   */
  async function cascadeViewDelete(tx, row, userId, reqMeta) {
    const sourceInstance = getParent(row.type);
    if (sourceInstance && !sourceInstance.includes('|')) {
      const sourceId = await lookupSourceId(row.app, `${sourceInstance}|${row.id}:data`, tx);
      await dropViewDataTable(tx, row.app, sourceInstance, row.id, sourceId);
    }
    await removeIdFromRefArrays(tx, row.app, 'views', ['source'], row.id, userId, reqMeta);
  }

  /**
   * A deleted page has no structural children DMS itself knows about (unlike
   * source/view), so there is nothing to cascade here by default. Instead
   * this dispatches to an optional, deployment-registered hook (see
   * setPageDeleteHook) so an app-specific side effect — e.g. transportny's
   * reports_snap_2 catalog row cleanup — can run without dms-server ever
   * knowing that relationship exists. A hook failure is logged, never
   * thrown: it must not block or roll back the page's own deletion.
   *
   * The hook runs AFTER deleteData's transaction commits (tx.afterCommit), with the plain dms_db:
   * it only fires for a delete that actually happened, and a failing hook statement can't abort
   * the page delete's own transaction (on Postgres any failed statement inside it would).
   */
  function cascadePageDelete(tx, row, userId, reqMeta) {
    const hook = getPageDeleteHook();
    if (!hook) return;
    tx.afterCommit(async () => {
      try {
        await hook(row, { userId, reqMeta, dms_db, resolveTable, jsonField, dbType, splitMode });
        console.log(`[page-delete-hook] dispatched for ${row.app}/${row.type}#${row.id}`);
      } catch (e) {
        console.error(`[page-delete-hook] failed for ${row.app}/${row.type}#${row.id}: ${e.message}`);
      }
    });
  }

  /**
   * Optimistic check for a judged write (routes/dms/dataAuth.js): inside the write's transaction, the
   * row must still be what the guard judged, `expect = { type, dataText }` from getRowsForWrite (or
   * `{ missing: true }`: still no row). The
   * data is compared as stored text, not parsed (parsing hides changes past double precision).
   * Postgres locks the row until the write commits; SQLite's transaction already holds the only
   * connection. Throws a DMS_STALE_ROW error when the row changed or is gone.
   */
  async function assertRowUnchanged(tx, table, id, expect) {
    if (!expect) return;
    const [row] = await tx.promise(
      `SELECT type, CAST(data AS TEXT) AS data_text FROM ${table} WHERE id = $1${dbType === 'postgres' ? ' FOR UPDATE' : ''};`,
      [id]
    );
    // `missing`: the check saw no row; one that appeared since was never judged
    const changed = expect.missing ? !!row : (!row || row.type !== expect.type || row.data_text !== expect.dataText);
    if (changed) {
      throw Object.assign(new Error('This row changed while it was being saved'), { code: 'DMS_STALE_ROW' });
    }
  }

  /**
   * What a deleted row takes with it (sources, views, the page delete hook). Runs inside the
   * deleting transaction, after the row's own DELETE. Returns true for a source or view.
   */
  async function cascadeDeletedRow(tx, row, userId, reqMeta) {
    const kind = typeof row.type === 'string' && row.type.includes(':') ? getKind(row.type) : null;
    if (kind === 'source') await cascadeSourceDelete(tx, row, userId, reqMeta);
    else if (kind === 'view') await cascadeViewDelete(tx, row, userId, reqMeta);
    // Pages are colon-less by design (`{pattern}|page`), not legacy —
    // checked by literal suffix rather than widening the `includes(':')`
    // guard above, which exists specifically to keep genuinely-legacy
    // (pre-refactor, colon-less) types out of cascade dispatch.
    else if (typeof row.type === 'string' && row.type.endsWith('|page')) {
      cascadePageDelete(tx, row, userId, reqMeta);
    }
    return kind === 'source' || kind === 'view';
  }

  return {
    // Expose for testing/inspection
    dbType,
    dbName,
    splitMode,

    DATA_ATTRIBUTES,

    /**
     * Register a callback to be called after each change_log write.
     * Used by the WebSocket module to broadcast changes.
     * @param {Function} fn - (app, msg) => void
     */
    setNotifyChange(fn) { _notifyChange = fn; },

    /**
     * The source id rows of dataset `slug` route to in `app`, or null (see lookupSourceIdBySlug).
     * Lets a client refuse to create a dataset whose name is already taken in the app.
     */
    getSourceIdBySlug: (app, slug) => lookupSourceIdBySlug(app, slug),

    /**
     * Look up the resolved authPermissions object for a pattern identified
     * by its parent instance name (e.g. 'my_docs' from type 'my_docs|page').
     * Returns the parsed + subdomain-resolved authPermissions, or null if not found.
     */
    async getPatternAuthPermissions(app, patternParent, subdomain = '') {
      const table = await mainTable(app);
      const rows = await dms_db.promise(
        `SELECT data FROM ${table} WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern' ORDER BY id DESC`,
        [app, patternParent]
      );
      // A page's parent is the CONTENT pattern with this instance name. The
      // site's admin row is always typed `{site}|admin:pattern` and the auth row
      // is usually `{site}|auth:pattern`, so a content pattern whose instance is
      // `admin`/`auth` shares their type string (mitigat-ny-prod: page pattern
      // 566466 vs admin row 2724987, found 2026-09-30). Neither kind has pages,
      // so skip them by `pattern_type` — otherwise the newest row wins and the
      // pages are judged by the admin row's (site-level) grants, or by nothing
      // at all while it's empty. No content pattern → unrestricted, as before
      // (auth patterns were always treated as public here).
      const parent = rows
        .map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {})))
        .find(d => d.pattern_type !== 'admin' && d.pattern_type !== 'auth');
      if (!parent) return null;
      return resolveAuthPermissions(parent.authPermissions, subdomain);
    },

    /** Does this app's table actually have the row-auth columns? Memoised by `rowAuthCaps`. */
    async hasAuthColumns(app) {
      try {
        const t = resolveTable(app, '', dbType, splitMode);
        const caps = await require('./rowAuthCaps').rowAuthCaps(dms_db, t.schema, t.table, dbType);
        return !!(caps.auth || caps.parentId);
      } catch { return false; }
    },

    /**
     * The CONTENT pattern a page type belongs to, as a ROW — the listing gate needs a row to judge,
     * where `getPatternAuthPermissions` returns only its resolved grants.
     *
     * Same lookup and the same admin/auth skip, for the same reason: a content pattern can share an
     * instance name with the site's `admin` or `auth` row, and neither of those has pages. Selected
     * with the row-auth projection so the resolver gets `auth` / `parent_id` where they exist.
     */
    async patternRowForPages(app, patternParent) {
      const table = await mainTable(app);
      const cols = await authProjection(app);
      const rows = await dms_db.promise(
        `SELECT ${cols}, ${jsonField('data', 'pattern_type')} AS pattern_type
           FROM ${table} WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern' ORDER BY id DESC`,
        [app, patternParent]
      );
      return rows.find(r => r.pattern_type !== 'admin' && r.pattern_type !== 'auth') || null;
    },

    // Every pattern row of the app (sites have a handful), for the write checks in dataAuth.js.
    async getPatternRows(app) {
      const table = await mainTable(app);
      return dms_db.promise(
        `SELECT id, type, data FROM ${table} WHERE app = $1 AND type LIKE '%:pattern'`,
        [app]
      );
    },

    /** The app's site rows (one, normally) — for the site-level auth rules stamped on them. */
    async getSiteRows(app) {
      const table = await mainTable(app);
      return dms_db.promise(
        `SELECT id, type, data FROM ${table} WHERE app = $1 AND type LIKE '%:site'`,
        [app]
      );
    },

    /**
     * Row-auth loaders (routes/dms/rowAuth.js). Both select the PROJECTION the resolver needs and
     * nothing else — production rows average ~10KB of `data` jsonb, and selecting it exhausts the
     * heap in bulk (see rowAuth.js, "CALLER CONTRACT"). `data` is included only while a table is
     * unmigrated, because the parentage and grants are inside it.
     */
    async authRowsByIds(ids, app = null) {
      if (!ids || !ids.length) return [];
      const table = await mainTable(app);
      const cols = await authProjection(app);
      const ph = ids.map((_, i) => `$${i + 2}`).join(',');
      return dms_db.promise(
        `SELECT ${cols} FROM ${table} WHERE app = $1 AND id IN (${ph})`,
        [app, ...ids]
      );
    },

    /**
     * The rows a type path can name as a parent — those whose type carries an instance segment
     * (sites, patterns, sources, views). Few: the largest app has 1 site, 112 patterns, 84 sources
     * and 127 views, so the whole set is loaded once per resolver.
     */
    async authContainers(app = null) {
      const table = await mainTable(app);
      const cols = await authProjection(app);
      return dms_db.promise(
        `SELECT ${cols} FROM ${table} WHERE app = $1 AND type LIKE '%:%'`,
        [app]
      );
    },

    // Rows of the app whose data carries grants (patterns, pages: `authPermissions`; internal sources:
    // `auth_permissions`), with the stored text for a stale-row check. For "Remove from site"
    // (auth/utils/siteGrants.js); the text match is only a pre-filter, the caller parses.
    async getRowsWithGrants(app) {
      const table = await mainTable(app);
      return dms_db.promise(
        `SELECT id, type, data, CAST(data AS TEXT) AS data_text FROM ${table}
         WHERE app = $1
           AND (CAST(data AS TEXT) LIKE '%authPermissions%' OR CAST(data AS TEXT) LIKE '%auth_permissions%')`,
        [app]
      );
    },

    getFormat: appKeys => {
      const arrayResult = buildArrayComparison("app || '+' || type", appKeys, dbType);
      const sql = `
        SELECT *
        FROM ${tableName('formats')}
        WHERE ${arrayResult.sql};
      `
      return dms_db.promise(sql, arrayResult.values)
    },

    dataLength: appKeys => {
      const promises = appKeys.map(async k => {
        const [app, type] = k.split("+");
        const { fullName } = await ensureForRead(app, type);
        const sql = `
          SELECT app || '+' || type AS key,
            COUNT(1) AS length
          FROM ${fullName}
          WHERE app = $1
          AND type = $2
          GROUP BY 1
        `;
        return dms_db.promise(sql, [app, type]);
      });
      return Promise.all(promises)
        .then(data => [].concat(...data))
        // PostgreSQL COUNT returns bigint (string); normalize to number
        .then(rows => rows.map(r => ({ ...r, length: Number(r.length) })))
    },

    dataSearch: (appKeys, searchkeys) => {
      // In SQLite, ->> preserves JSON types (returns integer 0 for numeric values),
      // while PostgreSQL ->> always returns text. This causes comparisons like
      // `data ->> 'index' = '0'` to fail in SQLite (integer 0 != text '0').
      // Wrapping ->> expressions with CAST(... AS TEXT) normalizes the behavior.
      const castForSqlite = (expr) => {
        if (dbType !== 'sqlite') return expr;
        return expr.replace(/(data\s*->>\s*'[^']*')/g, 'CAST($1 AS TEXT)');
      };

      const promises = appKeys.flatMap(key =>
        searchkeys.map(async searchkey => {
          const [app, type] = key.split("+");
          const { fullName } = await ensureForRead(app, type);
          const searchkeyJSON = JSON.parse(searchkey) || null
          const wildKey = castForSqlite(searchkeyJSON.wildKey);
          const defaultSearch = searchkeyJSON.defaultSearch
            ? castForSqlite(searchkeyJSON.defaultSearch)
            : null;

          const sql = `
            SELECT id
            FROM ${fullName}
            WHERE app = $1
            AND type = $2
            AND ${wildKey} = $3
            ${defaultSearch ?
              `UNION ALL
              SELECT id
              FROM ${fullName}
              WHERE app = $4
              AND type = $5
              AND ${defaultSearch}`
            : ''}
            LIMIT 1
          `
          const values = defaultSearch
            ? [app, type, searchkeyJSON.params, app, type]
            : [app, type, searchkeyJSON.params];
          return dms_db
            .promise(sql, values)
            .then(rows => ({
                key: `${key}|${searchkey}`,
                rows: rows.map(({id}) => id)
              })
            )
        })
      );
      return Promise.all(promises)
    },

    dataByIndex: (appKeys, indices) => {
      const [min, max] = extent(indices),
        length = (max - min) + 1;

      const promises = appKeys.map(async key => {
        const [app, type] = key.split("+");
        const { fullName } = await ensureForRead(app, type);
        const sql = `
          SELECT id
          FROM ${fullName}
          WHERE app = $1
          AND type = $2
          LIMIT ${ length }
          OFFSET ${ min }
        `;
        return dms_db.promise(sql, [app, type])
          .then(rows => ({
            key,
            rows: rows.map(({ id }, i) => ({ i: i + min, id }))
          }));
      });
      return Promise.all(promises)
    },

    filteredDataLength: (appKeys, options) => {
      const {
        filter= {}, exclude = {},
        gt = {}, gte = {}, lt = {}, lte = {}, like = {}, notLike = {},
        groupBy = [], aggregatedLen = false
      } = JSON.parse(options);

      const values = [
        ...getValuesExceptNulls(filter),
        ...getValuesExceptNulls(exclude),
        ...getValuesExceptNulls(gt),
        ...getValuesExceptNulls(gte),
        ...getValuesExceptNulls(lt),
        ...getValuesExceptNulls(lte),
        ...getValuesExceptNulls(like),
        ...getValuesExceptNulls(notLike)
      ]

      const filterSql = handleFilters({filter, exclude, gt, gte, lt, lte, like, notLike}, dbType);

      const promises = appKeys.map(async k => {
        const [app, type] = k.split("+");
        const { fullName } = await ensureForRead(app, type);

        const sql =
          aggregatedLen ? `
            with t as (SELECT app || '+' || type AS key, COUNT(1) AS length
            FROM ${fullName}
                ${ filterSql }
                ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
                AND type = $${values.length + 2}
            ${ handleGroupBy([1, ...groupBy]) })

            select key, count(1) as length
            from t
            group by 1
    ` : `
            SELECT app || '+' || type AS key, COUNT(1) AS length
            FROM ${fullName}
                ${ filterSql }
                ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
                AND type = $${values.length + 2}
            ${ handleGroupBy([1, ...groupBy]) }
        `;

        return dms_db.promise(sql, [...values, app, type]);
      });
      return Promise.all(promises)
        .then(data => [].concat(...data))
        // PostgreSQL COUNT returns bigint (string); normalize to number
        .then(rows => rows.map(r => ({ ...r, length: Number(r.length) })))
    },

    filteredDataByIndex: (appKeys, indices, options = '{}', attributes = ['data']) => {
      const [min, max] = extent(indices),
        length = (max - min) + 1;
      const {
        filter= {}, exclude = {},
        gt = {}, gte = {}, lt = {}, lte = {}, like = {}, notLike = {},
        groupBy = [], orderBy = {}
      } = JSON.parse(options);

      const values = [
        ...getValuesExceptNulls(filter),
        ...getValuesExceptNulls(exclude),
        ...getValuesExceptNulls(gt),
        ...getValuesExceptNulls(gte),
        ...getValuesExceptNulls(lt),
        ...getValuesExceptNulls(lte),
        ...getValuesExceptNulls(like),
        ...getValuesExceptNulls(notLike),
      ]

      const orderCol = Object.keys(orderBy)[0];
      const order = orderBy[orderCol] || 'asc';
      const filterSql = handleFilters({filter, exclude, gt, gte, lt, lte, like, notLike}, dbType);

      // Build sortcol expression based on database type
      let sortColExpr;
      if (orderCol) {
        sortColExpr = `${orderCol} as sortcol`;
      } else if (groupBy?.length) {
        // PostgreSQL uses array_agg, SQLite uses json_group_array
        sortColExpr = dbType === 'postgres'
          ? `array_agg(id order by id) as sortcol`
          : `json_group_array(id) as sortcol`;
      } else {
        sortColExpr = `id as sortcol`;
      }

      const promises = appKeys.map(async key => {
        const [app, type] = key.split("+");
        const { fullName } = await ensureForRead(app, type);

        const sql = `
          with t as (
          SELECT ${attributes.join(', ')},
                 ${sortColExpr}
          FROM ${fullName}
            ${ filterSql }
            ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
            AND type = $${values.length + 2}
          ${ handleGroupBy(groupBy) }
          ${ orderCol ? handleOrderBy(orderBy) : ``}
          LIMIT ${ length }
          OFFSET ${ min })

          SELECT * FROM t ORDER BY sortcol ${order};
        `;

        return dms_db.promise(sql, [...values, app, type])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i: i + min, ...r }))
          }));
      });

      return Promise.all(promises)
    },

    searchByTag: (appKeys, tag, searchType='byTag') => {
      // searchByTag operates on page content (sections)
      const jsonArrayExpr = dbType === 'postgres'
        ? `jsonb_array_elements(data->'sections')->>'id'`
        : `json_extract(je.value, '$.id')`;

      const jsonArrayFrom = dbType === 'postgres'
        ? ''
        : `, json_each(data, '$.sections') as je`;

      const promises = appKeys.map(async key => {
        const [app, type] = key.split("+");
        const tbl = await mainTable(app);

        // Page rows are typed `{pattern_instance}|page` (legacy pre-split-table
        // databases used the bare instance name with no suffix) — match both.
        const sql = searchType === 'byTag' ? `
          with t as (
            SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title,
              ${jsonArrayExpr} section_id
            FROM ${tbl} di${jsonArrayFrom}
            WHERE di.app = $1
            AND (di.type = $2 || '|page' OR di.type = $2)
          )

          select t.*, ${jsonField('data', 'title')} section_title, ${jsonField('data', 'tags')} tags
          FROM t
          JOIN ${tbl} di
          ON ${typeCast('id', 'TEXT', dbType)} = t.section_id
          WHERE lower(${jsonField('data', 'tags')}) like '%' || lower($3) || '%'
             OR lower(${jsonField('data', 'title')}) like '%' || lower($3) || '%'
             OR lower(t.page_title) like '%' || lower($3) || '%'
          order by page_id, t.section_id
        ` :
        `SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title
          FROM ${tbl} di
          WHERE app = $1
          AND (type = $2 || '|page' OR type = $2)
          AND lower(${jsonField('data', 'title')}) like '%' || lower($3) || '%'`;

        return dms_db.promise(sql, [app, type, tag])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i, ...r }))
          }));
      })

      return Promise.all(promises)
    },

    getTags: (appKeys, searchType) => {
      const promises = appKeys.map(async key => {
        // Check cache
        const cacheKey = `${key}:${searchType}`;
        const cached = _tagsCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < TAGS_CACHE_TTL) {
          return { key, rows: cached.data };
        }

        const [app, type] = key.split("+");
        const tbl = await mainTable(app);

        // Ensure partial expression index exists for tags queries (one-time per table).
        // Covers (app, type, tags_value) so the query is satisfied from the index alone
        // without reading the large data blobs. SQLite only — PG already has idx_tags.
        if (dbType === 'sqlite' && !_tagsIndexedTables.has(tbl)) {
          const safeName = tbl.replace(/[^a-zA-Z0-9_]/g, '_');
          await dms_db.promise(`
            CREATE INDEX IF NOT EXISTS idx_${safeName}_tags
            ON ${tbl} (app, type, json_extract(data, '$.tags'))
            WHERE json_extract(data, '$.tags') IS NOT NULL
            AND json_extract(data, '$.tags') != ''
          `);
          _tagsIndexedTables.add(tbl);
        }

        // For tags: query components directly by type convention ({parent}|component or legacy {doc_type}|cms-section)
        // instead of expanding pages via json_each and joining back.
        const sql = searchType === 'tags' ? `
          SELECT DISTINCT ${jsonField('data', 'tags')} tags
          FROM ${tbl}
          WHERE app = $1
            AND (type = $2 || '|component' OR type = $2 || '|cms-section')
            AND ${jsonField('data', 'tags')} IS NOT NULL
            AND ${jsonField('data', 'tags')} != ''
        ` :
        `SELECT DISTINCT ${jsonField('data', 'title')} page_title
          FROM ${tbl}
          WHERE app = $1
          AND (type = $2 || '|page' OR type = $2)`;

        const rows = await dms_db.promise(sql, [app, type]);
        _tagsCache.set(cacheKey, { data: rows, ts: Date.now() });
        return { key, rows };
      })

      return Promise.all(promises)
    },

    getSections: (appKeys) => {
      // getSections operates on page content
      const jsonArrayExpr = dbType === 'postgres'
        ? `(jsonb_array_elements(data->'draft_sections')->>'id')::INTEGER`
        : `CAST(json_extract(je.value, '$.id') AS INTEGER)`;

      const jsonArrayFrom = dbType === 'postgres'
        ? ''
        : `, json_each(data, '$.draft_sections') as je`;

      const elementTypeExpr = dbType === 'postgres'
        ? `data->'element'->'element-type'`
        : `json_extract(data, '$.element.element-type')`;

      const attributionExpr = dbType === 'postgres'
        ? `CASE WHEN ${jsonField('data', 'element.element-type')} = 'lexical' THEN null ELSE ((${jsonField('data', 'element.element-data')})::JSON)->'attributionData' END`
        : `CASE WHEN json_extract(data, '$.element.element-type') = 'lexical' THEN null ELSE json_extract(json_extract(data, '$.element.element-data'), '$.attributionData') END`;

      const promises = appKeys.map(async key => {
        const [app, type] = key.split("+");
        const tbl = await mainTable(app);

        const sql = `WITH t AS (
          SELECT app, type,
            id page_id,
            ${jsonField('data', 'url_slug')} url_slug,
            ${jsonField('data', 'title')} page_title,
            ${jsonField('data', 'index')} page_index,
            ${jsonField('data', 'parent')} page_parent,
            ${jsonArrayExpr} section_id
          FROM ${tbl}${jsonArrayFrom}
          WHERE app = $1
          AND type = $2
          AND ${jsonField('data', 'url_slug')} IS NOT NULL
          AND type NOT LIKE '%|template'
          AND ${jsonField('data', 'index')} != '999'
        )

        SELECT t.*,
          ${jsonField('data', 'trackingId')} tracking_id,
          ${jsonField('data', 'title')} section_title,
          ${jsonField('data', 'tags')} tags,
          ${elementTypeExpr} element_type,
          ${attributionExpr} attribution
        FROM t
        JOIN ${tbl} di
        ON id = t.section_id
        ORDER BY page_id, t.section_id
        `;

        return dms_db.promise(sql, [app, type])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i, ...r }))
          }));
      })

      return Promise.all(promises)
    },

    // Rows as a write's permission check needs them: parsed data plus the stored text (the
    // optimistic check in assertRowUnchanged compares that). Main table only.
    getRowsForWrite: async (ids, app = null) => {
      const table = app ? await mainTable(app) : tableName('data_items');
      const arrayResult = buildArrayComparison('id', ids, dbType);
      return dms_db.promise(
        `SELECT id, app, type, data, CAST(data AS TEXT) AS data_text FROM ${table} WHERE ${arrayResult.sql}`,
        arrayResult.values
      );
    },

    getDataById: async (ids, attributes=["id", "data", "updated_at", "created_at"], app = null) => {
      // When app is provided, resolve per-app table; otherwise data_items (legacy)
      const table = app ? await mainTable(app) : tableName('data_items');

      let cols = attributes
        .filter(d => d != 'id')
        .map(col => {
          if(col.includes('data ->> ')){
            let attr = col.split('->>')[1].trim().replace(/[']/g, '')
            col += ` as "${attr}"`
          }
          if(['created_at', 'updated_at'].includes(col)) {
            col = dbType === 'postgres' ? col + '::TEXT' : col
          }
          return col
        })
        .join(', ')

      const arrayResult = buildArrayComparison('id', ids, dbType);
      const selectCols = cols ? `id, ${cols}` : 'id';
      const sql = `
        SELECT ${selectCols}
        FROM ${table}
        WHERE ${arrayResult.sql}
      `
      return dms_db.promise(sql, arrayResult.values);
    },

    // `changeHistory: true`: write the dataset's change history, if it has a `change_history` setting.
    // Off by default: only the Falcor edit route (the UI and the CLI) asks for it, so a server-side
    // caller (workers, upload, duplicating pages) writes none unless it opts in.
    // `expect`: the row as the permission check saw it (see assertRowUnchanged).
    setDataById: async (id, data, user, app = null, type = null, reqMeta = null, { changeHistory = false, expect = null } = {}) => {
      // When type is provided, resolve the split table (for dataset row updates).
      // Otherwise fall back to the main table.
      let table;
      // A tracked dataset's row edit also writes its change history (changeHistory.js).
      let history = null;
      let historyTarget = null;
      if (type && app) {
        const resolved = await resolve(app, type);
        const seqName = getSequenceName(app, dbType, splitMode);
        await ensureTable(dms_db, resolved.schema, resolved.table, dbType, seqName);
        table = resolved.fullName;
        history = changeHistory && isSplitType(type) ? await loadChangeHistory(app, type) : null;
        // the history table's DDL runs here, outside the transaction (see mainTable)
        if (history) historyTarget = await ensureForWrite(app, history.targetType);
      } else {
        table = app ? await mainTable(app) : tableName('data_items');
      }
      const userId = get(user, "id", null);

      // The legacy 2-arg edit route passes neither app nor type, and the stamp is keyed on the
      // row's own kind — so read them here, outside the transaction, on that path only.
      let ownerApp = app, ownerType = type;
      if (!ownerApp || !ownerType) {
        const [row] = await dms_db.promise(`SELECT app, type FROM ${table} WHERE id = $1`, [id]);
        ownerApp = ownerApp || row?.app || null;
        ownerType = ownerType || row?.type || null;
      }
      const childRefs = await childStampPlan(ownerApp, ownerType);

      const rows = await dms_db.withTransaction(async (tx) => {
        await assertRowUnchanged(tx, table, id, expect);
        // The row as it was, locked until the edit commits: the history's old values, and the
        // BEFORE half of the child sweep — which children this write drops is a difference between
        // two states, so it cannot be read off the patch.
        const [current] = (history || childRefs)
          ? await tx.promise(`SELECT data FROM ${table} WHERE id = $1${dbType === 'postgres' ? ' FOR UPDATE' : ''};`, [id])
          : [];
        const sql = `
          UPDATE ${table}
          SET data = ${jsonMerge('data', '$1', dbType)},
            updated_at = ${now()},
            updated_by = $2
          WHERE id = $3
          RETURNING id, app, type, data,
            ${typeCast('created_at', 'TEXT', dbType)}, created_by,
            ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
        `;
        const rows = await tx.promise(sql, [data, userId, id]);
        if (rows[0]) {
          const item = rows[0];
          // Re-assert parentage from the arrays this write carries. A section that only MOVED is
          // not `_dirty`, so it is never re-sent and never renews its own claim — but the page
          // that now lists it is being saved right here.  `data` is the incoming patch, so a write
          // that names no child attribute does nothing.
          await stampDeclaredChildren(tx, {
            table, app: item.app, id: item.id, type: item.type, data, childRefs,
          });
          // …and delete the ones it dropped. `item.data` is the MERGED row, not the patch: an edit
          // that names no child attribute leaves those arrays untouched and removes nothing.
          await sweepDeclaredChildren(tx, {
            table, app: item.app, id: item.id, type: item.type,
            before: current?.data, after: item.data, childRefs,
          });
          await appendChangeLog(tx, item.id, item.app, item.type, 'U', item.data, userId, reqMeta);
          if (history) {
            await writeChangeHistory(tx, {
              spec: history, target: historyTarget, app, rowId: item.id,
              before: parseJson(current?.data), after: parseJson(item.data), patch: parseJson(data) || {}, user, reqMeta,
            });
          }
        }
        return rows;
      });
      _tagsCache.clear();
      // a source's settings (change_history among them) may have changed
      if (getKind(rows[0]?.type || '') === 'source') _changeHistoryCache.clear();
      return rows;
    },

    setMassData: async (app, type, column, maps, user) => {
      const sanitizedName = sanitizeName(column);
      if(!sanitizedName) return;

      const { fullName } = await ensureForWrite(app, type);

      const columnToUpdate = sanitizedName.includes('data->>') ? column :
        (dbType === 'postgres' ? `data->>'${column}'` : `json_extract(data, '$.${column}')`);

      return Promise.all(
        maps.map(({invalidValue, validValue}) => {
          const sanitizedApp = sanitizeName(app);
          const sanitizedType = sanitizeName(type);
          const sanitizedValue = sanitizeName(validValue);
          const stringValidValue = JSON.stringify({[sanitizedName]: sanitizedValue});
          const stringInvalidValue = Array.isArray(invalidValue) ? `[${invalidValue.map(v => `"${v}"`)}]` : invalidValue;
          const isComparingNull = stringInvalidValue === 'null' || stringInvalidValue === null;

          if(!sanitizedApp || !sanitizedType || !sanitizedValue) return;

          const sql = `
            UPDATE ${fullName}
            SET data = ${jsonMerge('data', `'${stringValidValue}'`, dbType)},
                updated_at = ${now()},
                updated_by = ${user != null ? `'${user}'` : 'NULL'}
            WHERE app = '${sanitizedApp}'
            AND type = '${sanitizedType}'
            AND ${columnToUpdate} ${isComparingNull ? `IS null` : `= '${stringInvalidValue}'`}
            RETURNING id, app, type, data,
              ${typeCast('created_at', 'TEXT', dbType)}, created_by,
              ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
          `;

          return dms_db.promise(sql);
        })
      )
    },

    setTypeById: async (id, type, user, app = null, reqMeta = null, { expect = null } = {}) => {
      // When app is provided, resolve per-app table; otherwise data_items (legacy)
      const table = app ? await mainTable(app) : tableName('data_items');
      const userId = get(user, "id", null);

      return dms_db.withTransaction(async (tx) => {
        await assertRowUnchanged(tx, table, id, expect);
        const sql = `
          UPDATE ${table}
          SET type = $1,
            updated_at = ${now()},
            updated_by = $2
          WHERE id = $3
          RETURNING id, app, type, data,
            ${typeCast('created_at', 'TEXT', dbType)}, created_by,
            ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
        `;
        const rows = await tx.promise(sql, [type, userId, id]);
        if (rows[0]) {
          const item = rows[0];
          await appendChangeLog(tx, item.id, item.app, item.type, 'U', item.data, userId, reqMeta);
        }
        return rows;
      });
    },

    setDataByIdOld: (items, user) =>
      Promise.all(
        Object.keys(items)
          .reduce((a, c) => {
            const item = items[c],
              keys = Object.keys(item).filter(k => DATA_ATTRIBUTES.includes(k)),
              args = keys.map(k => item[k]);

            let paramIdx = 1;
            const setClause = keys.map((k) => {
              return `${ k } = $${paramIdx++}`
            }).join(', ');

            const sql = `
              UPDATE ${tableName('data_items')}
              SET ${setClause},
                updated_at = ${now()}
                ${ user ? `, updated_by = $${paramIdx++}` : "" }
              WHERE id = $${paramIdx}
              RETURNING id, app, type, data,
                ${typeCast('created_at', 'TEXT', dbType)}, created_by,
                ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
            `;

            user && args.push(user.id);
            args.push(c);

            if (keys.length) {
              a.push(dms_db.promise(sql, args));
            }
            return a;
          }, [])
      ).then(res => [].concat(...res)),

    // `changeHistory: true`: as setDataById. Off by default; the Falcor create route asks for it.
    createData: async (args, user, reqMeta = null, { changeHistory = false } = {}) => {
      const [app, type, data = {}] = args;
      const resolved = await ensureForWrite(app, type);
      const userId = get(user, "id", null);

      if (getKind(type) === 'tenant') {
        const slug = data?.subdomain || getInstance(type) || '';
        if (!slug) {
          throw new Error('Tenant subdomain is required');
        }
        if (!/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/.test(slug)) {
          throw new Error(`Invalid subdomain format: "${slug}"`);
        }
        const existing = await dms_db.promise(
          `SELECT COUNT(*) AS cnt FROM ${resolved.fullName}
           WHERE app = $1 AND type LIKE $2 AND ${jsonField('data', 'subdomain')} = $3`,
          [app, '%:tenant', slug]
        );
        if (Number(existing[0]?.cnt) > 0) {
          throw new Error(`Subdomain "${slug}" is already in use by another tenant`);
        }
      }

      // A pattern's instance name must be unique within its app: the type path resolves a parent by
      // NAME (`{parent}|{instance}:{kind}`), so two patterns sharing one gives rows two possible
      // parents — and the resolver has to guess which grants apply. Found in production:
      // `prod|admin:pattern` exists TWICE in `mitigat-ny-prod` (ids 2724987 and 566466), both on the
      // site's pattern list, with byte-identical types.
      //
      // Mode-gated like the rest of the row-auth programme so hits can be seen before anything is
      // refused — `log` (the default) warns, `enforce` throws. The tenant guard above is
      // unconditional; this one can follow once the existing duplicates are resolved.
      //
      // The `legacy` skip went with the mode itself on 2026-11-03 (`routes/auth/settings.js`): the
      // check was `mode !== 'legacy'`, which no value can fail any more, so it was a condition that
      // always passed and read as though it sometimes would not.
      // See planning/tasks/current/row-auth-schema.md.
      if (getKind(type) === 'pattern') {
        const { authMode } = require('../auth/settings');
        const mode = authMode();
        {
          const clash = await dms_db.promise(
            `SELECT id FROM ${resolved.fullName} WHERE app = $1 AND type = $2 LIMIT 1`,
            [app, type]
          );
          const existingId = clash[0] && clash[0].id;
          if (existingId) {
            const msg = `pattern type "${type}" already exists in ${app} (id ${existingId}) — `
              + 'instance names must be unique within an app';
            if (mode === 'enforce') throw new Error(msg);
            console.warn(`[row-auth] would-deny create ${app}/new type=${type} reason=${msg}`);
          }
        }
      }

      // `parent_id` — the client states it, the server validates it (routes/dms/parentId.js).
      // The type system does not model the page → component edge, so the server cannot derive it;
      // the client is adding the child's ref to that page in the same save and already has the id.
      // Lifted out of `data` so it lives in the column only, never as a second copy that can drift.
      // A claim that fails validation is dropped, never thrown — parentage is not worth a 500.
      let parentId = null;
      let rowData = data;
      {
        const { takeParentId, validateParentId } = require('./parentId');
        const taken = takeParentId(data);
        rowData = taken.data;
        if (taken.claimed) {
          const { rowAuthCaps } = require('./rowAuthCaps');
          const caps = await rowAuthCaps(dms_db, resolved.schema, resolved.table, dbType);
          if (caps.parentId) {
            // Which kind SHOULD own this row, per its pattern's declaration. Without it the check
            // is structural only, and a component could name its pattern instead of its page —
            // valid by the type path, but skipping a level of inheritance.
            const ownerKind = await ownerKindForType(app, type);
            parentId = await validateParentId(taken.claimed, {
              app, type, ownerKind,
              loadType: async (pid) => (await dms_db.promise(
                `SELECT app, type FROM ${resolved.fullName} WHERE id = $1`, [pid]))[0] || null,
            });
          }
        }
      }

      // A tracked dataset's new row also writes its change history, as an edit does (setDataById).
      // The history table's DDL runs here, outside the transaction.
      const history = changeHistory && isSplitType(type) ? await loadChangeHistory(app, type) : null;
      const historyTarget = history ? await ensureForWrite(app, history.targetType) : null;

      // ensureForWrite (above) ran the table/sequence DDL outside the transaction, so
      // allocateId's ensureSequence below is a cache hit. Allocating inside the transaction
      // (rather than as its own auto-committing statement) means a failed write doesn't burn an
      // id; the SQLite lock is what makes concurrent allocations distinct.
      // Which of this row's attributes hold children — resolved out here, never inside the block.
      const childRefs = await childStampPlan(app, type);

      const rows = await dms_db.withTransaction(async (tx) => {
        let rows;

        // SQLite split tables need explicit ID allocation (no AUTOINCREMENT)
        // `parent_id` is appended only when it survived validation, so an unmigrated table (no
        // column) and a dropped claim take the exact same insert as before.
        const parentCol = parentId ? ', parent_id' : '';
        if (dbType === 'sqlite' && resolved.table !== 'data_items') {
          const id = await allocateId(tx, app, dbType, splitMode);
          const sql = `
            INSERT INTO ${resolved.fullName}(id, app, type, data, created_by, updated_by${parentCol})
            VALUES ($1, $2, $3, $4, $5, $5${parentId ? ', $6' : ''})
            RETURNING id, app, type, data,
              ${typeCast('created_at', 'TEXT', dbType)}, created_by,
              ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
          `;
          rows = await tx.promise(sql, parentId
            ? [id, app, type, rowData, userId, parentId]
            : [id, app, type, rowData, userId]);
        } else {
          // PostgreSQL split tables use DEFAULT nextval() from shared sequence.
          // Default data_items uses its own AUTOINCREMENT/sequence.
          const sql = `
            INSERT INTO ${resolved.fullName}(app, type, data, created_by, updated_by${parentCol})
            VALUES ($1, $2, $3, $4, $4${parentId ? ', $5' : ''})
            RETURNING id, app, type, data,
              ${typeCast('created_at', 'TEXT', dbType)}, created_by,
              ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
          `;
          rows = await tx.promise(sql, parentId
            ? [app, type, rowData, userId, parentId]
            : [app, type, rowData, userId]);
        }

        const item = rows[0];
        // The children this row names now have a parent id to carry — they did not when they were
        // written moments ago, because they are written FIRST so their ids can go into this row's
        // arrays. `data` here is the create payload, which is the whole row.
        await stampDeclaredChildren(tx, {
          table: resolved.fullName, app, id: item.id, type: item.type, data: rowData, childRefs,
        });
        await appendChangeLog(tx, item.id, item.app, item.type, 'I', item.data, userId, reqMeta);
        if (history) {
          await writeChangeHistory(tx, {
            spec: history, target: historyTarget, app, rowId: item.id,
            before: {}, after: parseJson(item.data), patch: parseJson(data) || {}, user, reqMeta, created: true,
          });
        }
        return rows;
      });
      _tagsCache.clear();
      // When a new source is created, evict any stale cache entry so the next
      // data-row write looks up the correct (newest) source ID from the DB.
      if (getKind(type) === 'source') {
        const slug = getInstance(type);
        if (slug) _sourceIdCache.delete(`${app}:${slug}`);
        // the name may now lead to this source instead of a history dataset that had it
        _changeHistoryCache.clear();
      }
      return rows;
    },

    // For /sync/push deletes: the same cascade as deleteData, inside the caller's transaction (`row`:
    // the deleted row as it was stored, { id, app, type }).
    assertRowUnchanged: (tx, table, id, expect) => assertRowUnchanged(tx, table, id, expect),

    /**
     * Exposed for `/sync/push`, which writes rows without going through createData/setDataById.
     * Same contract: inside the caller's transaction, never throws.
     */
    // "which kind owns a row of this type" — used to validate a parent CLAIM on a create before
    // the row is written (`validateParentId`, routes/dms/parentId.js).
    ownerKindForType,
    stampDeclaredChildren,
    sweepDeclaredChildren,
    sweepChildrenOfDeleted,
    childSweepMode,
    childStampPlan,

    cascadeDeletedRow: async (tx, row, userId, reqMeta = null) => {
      const removed = await cascadeDeletedRow(tx, row, userId, reqMeta);
      tx.afterCommit(() => { _tagsCache.clear(); if (removed) _changeHistoryCache.clear(); });
      return removed;
    },

    deleteData: async (app, type, ids, user, reqMeta = null) => {
      const resolved = await ensureForRead(app, type);
      const userId = get(user, "id", null);
      // The cascades below resolve the app's main table inside the transaction; ensure it (DDL)
      // out here so that is a cache hit.
      await mainTable(app);

      // Which of the doomed rows OWN children, resolved before the transaction opens:
      // `childStampPlan` makes adapter queries, which are forbidden inside one (see this package's
      // CLAUDE.md, and the `rowAuthCaps` latch it describes). The real types are read here rather
      // than taken from the `type` argument, which often names only the table.
      const arrayResult = buildArrayComparison('id', ids, dbType);
      const childPlans = new Map();
      if (childSweepMode() !== 'off') {
        try {
          const types = await dms_db.promise(
            `SELECT DISTINCT type FROM ${resolved.fullName} WHERE ${arrayResult.sql};`, arrayResult.values);
          for (const { type: t } of types) childPlans.set(t, await childStampPlan(app, t));
        } catch (e) {
          console.warn(`[parent-id] could not plan child cleanup for the delete: ${e.message}`);
        }
      }

      let removedSourceOrView = false;
      const result = await dms_db.withTransaction(async (tx) => {
        // Snapshot the doomed rows first — cascade decisions key off each row's
        // actual type string; the `type` argument only resolves the table and
        // often doesn't match it (clients pass e.g. 'datasets_env|source').
        const doomed = await tx.promise(
          `SELECT id, app, type FROM ${resolved.fullName} WHERE ${arrayResult.sql};`,
          arrayResult.values
        );
        const doomedTypes = new Map(doomed.map(r => [String(r.id), r.type]));

        const sql = `
          DELETE FROM ${resolved.fullName}
          WHERE ${arrayResult.sql};
        `;
        const result = await tx.promise(sql, arrayResult.values);

        // Log each deleted ID under the row's real type when we have it
        for (const id of ids) {
          await appendChangeLog(tx, id, app, doomedTypes.get(String(id)) || type, 'D', null, userId, reqMeta);
        }

        // Deleting a source or view must also delete its dependents and vacate
        // the {ref, id} entries parents hold for it — a bare row delete leaves
        // ghost entries in the datasets list and orphans view rows/split tables.
        for (const row of doomed) {
          if (await cascadeDeletedRow(tx, row, userId, reqMeta)) removedSourceOrView = true;
          // A deleted owner takes its declared children with it. Before `parent_id` there was no
          // way to express this without the library knowing what a page is; now it is the same
          // declaration the stamp reads. Deleting a page used to leave every one of its sections
          // behind as an unreachable row.
          await sweepChildrenOfDeleted(tx, {
            table: resolved.fullName, app: row.app, id: row.id, type: row.type,
            childRefs: childPlans.get(row.type),
          });
        }

        return result;
      });
      _tagsCache.clear();
      // a tracked dataset or its history dataset may be gone
      if (removedSourceOrView) _changeHistoryCache.clear();
      return result;
    },

    /**
     * Search for a row by a JSON data key value across one or more types.
     * Used by publish upsert to find existing records by primary key.
     * @param {string} app
     * @param {string[]} types - types to search across (e.g. [validType, invalidType])
     * @param {string} dataKey - JSON field name inside data column
     * @param {*} dataValue - value to match
     * @returns {Object|null} first matching row {id, type, data} or null
     */
    findByDataKey: async (app, types, dataKey, dataValue) => {
      const resolved = await ensureForRead(app, types[0]);
      const qb = new QueryBuilder(dbType);
      const sql = `
        SELECT id, type, data FROM ${resolved.fullName}
        WHERE app = ${qb.param(app)}
        AND ${qb.arrayIn('type', types)}
        AND ${jsonField('data', dataKey)} = ${qb.param(String(dataValue))}
        LIMIT 1;
      `;
      const rows = await dms_db.promise(sql, qb.getValues());
      return rows[0] || null;
    },

    /**
     * Find a row by its actual `id` column (integer primary key).
     * Used by publish upsert when primary column is 'id' (not data->>'id').
     * @param {string} app
     * @param {string[]} types - types to search across (e.g. [validType, invalidType])
     * @param {number|string} rowId - the row id value to match
     * @returns {Object|null} first matching row {id, type, data} or null
     */
    findByRowId: async (app, types, rowId) => {
      const resolved = await ensureForRead(app, types[0]);
      const qb = new QueryBuilder(dbType);
      const sql = `
        SELECT id, type, data FROM ${resolved.fullName}
        WHERE app = ${qb.param(app)}
        AND ${qb.arrayIn('type', types)}
        AND id = ${qb.param(Number(rowId))}
        LIMIT 1;
      `;
      const rows = await dms_db.promise(sql, qb.getValues());
      return rows[0] || null;
    },

    /**
     * Update both type and data for a row by ID. Split-table aware.
     * Used by publish upsert when a matching record is found.
     * @param {string} app - application name (for source_id lookup)
     * @param {number} id - row ID
     * @param {string} newType - new type value (may change valid↔invalid)
     * @param {Object} data - data to merge
     * @param {string} userId
     */
    updateDataById: async (app, id, newType, data, userId) => {
      // Determine which table the row is in based on the new type.
      // For dataset rows the valid and invalid types resolve to the same split table.
      const resolved = await ensureForWrite(app, newType);
      const sql = `
        UPDATE ${resolved.fullName}
        SET type = $1,
          data = ${jsonMerge('data', '$2', dbType)},
          updated_at = ${now()},
          updated_by = $3
        WHERE id = $4
        RETURNING id, app, type, data,
          ${typeCast('created_at', 'TEXT', dbType)}, created_by,
          ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
      `;
      return dms_db.promise(sql, [newType, data, userId, id]);
    },

    /**
     * Get source config (attributes metadata) for validation.
     * Looks up the source record by parentId or by doc_type.
     * Source records live in the main data_items table (not split).
     * @param {string} app
     * @param {number|string} parentId - source record ID (optional)
     * @param {string} parentDocType - doc_type to look up (fallback)
     * @returns {Object|null} parsed config object or null
     */
    getSourceConfig: async (app, parentId, parentDocType) => {
      const table = await mainTable(app);
      let sql, values;
      if (parentId) {
        sql = `SELECT ${jsonField('data', 'config')} AS config FROM ${table} WHERE app = $1 AND id = $2`;
        values = [app, parentId];
      } else {
        sql = `SELECT ${jsonField('data', 'config')} AS config FROM ${table} WHERE app = $1 AND ${jsonField('data', 'doc_type')} = $2 ORDER BY id DESC LIMIT 1`;
        values = [app, parentDocType];
      }
      const rows = await dms_db.promise(sql, values);
      if (!rows[0]?.config) return null;
      try {
        return typeof rows[0].config === 'object' ? rows[0].config : JSON.parse(rows[0].config);
      } catch { return null; }
    },

    /**
     * Find a source record's ID by app and doc_type (or instance name in new format).
     * Used by the publish handler to derive sourceId when the client doesn't provide it.
     * Handles both new format (type LIKE '%|{name}:source') and legacy (data.doc_type match).
     * @param {string} app
     * @param {string} docType - the doc_type stored in the source's data, or instance name
     * @returns {number|null} the source record ID, or null if not found
     */
    findSourceIdByDocType: async (app, docType) => {
      const table = await mainTable(app);
      // Try both new format (instance in type column) and legacy (doc_type in data)
      const rows = await dms_db.promise(
        `SELECT id FROM ${table} WHERE app = $1 AND (
          (type LIKE '%|' || $2 || ':source') OR
          (${jsonField('data', 'doc_type')} = $2 AND (type LIKE '%|source' OR type LIKE '%:source'))
        ) ORDER BY id DESC LIMIT 1`,
        [app, docType]
      );
      return rows[0]?.id || null;
    },

    /**
     * Get all rows for given app and types. Split-table aware.
     * Used by validate to fetch both valid and invalid rows.
     * @param {string} app
     * @param {string[]} types - e.g. [validType, invalidType]
     * @returns {Array} rows with {id, type, data}
     */
    getRowsByTypes: async (app, types) => {
      const resolved = await ensureForRead(app, types[0]);
      const qb = new QueryBuilder(dbType);
      const sql = `
        SELECT id, type, data FROM ${resolved.fullName}
        WHERE app = ${qb.param(app)}
        AND ${qb.arrayIn('type', types)};
      `;
      return dms_db.promise(sql, qb.getValues());
    },

    /**
     * Batch update type for a set of row IDs. Split-table aware.
     * Used by validate to move rows between valid and invalid types.
     * @param {string} app
     * @param {string} fromType - current type
     * @param {string} toType - new type
     * @param {number[]} ids - row IDs to update
     */
    batchUpdateType: async (app, fromType, toType, ids) => {
      if (!ids?.length) return;
      const resolved = await ensureForWrite(app, fromType);
      const qb = new QueryBuilder(dbType);
      const sql = `
        UPDATE ${resolved.fullName}
        SET type = ${qb.param(toType)}, updated_at = ${now()}
        WHERE app = ${qb.param(app)}
        AND type = ${qb.param(fromType)}
        AND ${qb.arrayIn('id', ids)};
      `;
      return dms_db.promise(sql, qb.getValues());
    },
  };
}

// Create default instance using env var, falling back to dms-sqlite for local dev
const defaultController = createController(process.env.DMS_DB_ENV || 'dms-sqlite');

// Export default controller with createController attached
module.exports = defaultController;
module.exports.createController = createController;
module.exports.DATA_ATTRIBUTES = DATA_ATTRIBUTES;
module.exports.setPageDeleteHook = setPageDeleteHook;
