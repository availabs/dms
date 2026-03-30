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
const {
  isSplitType,
  parseType,
  resolveTable,
  getSequenceName,
  ensureSequence,
  ensureTable,
  allocateId
} = require('#db/table-resolver.js');
const { parseSplitDataType } = require('#db/type-utils.js');
const { logEntry } = require('../../middleware/request-logger');

const DATA_ATTRIBUTES = [
  "id", "app", "type", "data",
  "created_at", "created_by",
  "updated_at", "updated_by"
];

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
   */
  async function mainTable(app) {
    const resolved = resolveTable(app, '', dbType, splitMode);
    // In per-app mode, ensure the app's table + sequence exist.
    // ensureTable() no-ops for the shared dms.data_items (legacy mode).
    const seqName = getSequenceName(app, dbType, splitMode);
    await ensureSequence(dms_db, app, dbType, splitMode);
    await ensureTable(dms_db, resolved.schema, resolved.table, dbType, seqName);
    return resolved.fullName;
  }

  /**
   * Look up the source record ID for a split type's source.
   * Handles both new format ({source}|{view}:data → look up by type LIKE '%|{source}:source')
   * and legacy format ({docType}-{viewId} → look up by data.doc_type).
   * Returns sourceId (number) or null if not found (graceful fallback).
   */
  async function lookupSourceId(app, type) {
    if (!isSplitType(type)) return null;

    // New format: {source}|{view}:data
    const newParsed = parseSplitDataType(type);
    if (newParsed) {
      const cacheKey = `${app}:${newParsed.source}`;
      if (_sourceIdCache.has(cacheKey)) return _sourceIdCache.get(cacheKey);

      try {
        const table = await mainTable(app);
        const rows = await dms_db.promise(
          `SELECT id FROM ${table} WHERE app = $1 AND type LIKE '%|' || $2 || ':source' ORDER BY id DESC LIMIT 1`,
          [app, newParsed.source]
        );
        const sourceId = rows[0]?.id || null;
        _sourceIdCache.set(cacheKey, sourceId);
        return sourceId;
      } catch {
        _sourceIdCache.set(cacheKey, null);
        return null;
      }
    }

    // Legacy format: {docType}-{viewId}
    const parsed = parseType(type);
    if (!parsed || !parsed.docType) return null;

    const cacheKey = `${app}:${parsed.docType}`;
    if (_sourceIdCache.has(cacheKey)) return _sourceIdCache.get(cacheKey);

    try {
      const table = await mainTable(app);
      const rows = await dms_db.promise(
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
   * Called after each mutation (create/update/delete) to data_items.
   */
  async function appendChangeLog(itemId, app, type, action, data, userId) {
    const tbl = dbType === 'postgres' ? 'dms.change_log' : 'change_log';
    const rows = await dms_db.promise(
      `INSERT INTO ${tbl} (item_id, app, type, action, data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING revision;`,
      [itemId, app, type, action, action === 'D' ? null : data, userId]
    );
    const revision = rows[0]?.revision;
    if (_notifyChange) {
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
    }
    return revision;
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

        const sql = searchType === 'byTag' ? `
          with t as (
            SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title,
              ${jsonArrayExpr} section_id
            FROM ${tbl} di${jsonArrayFrom}
            WHERE app = $1
            AND type = $2
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
          AND type = $2
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
          AND type = $2`;

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

    setDataById: async (id, data, user, app = null) => {
      // When app is provided, resolve per-app table; otherwise data_items (legacy)
      const table = app ? await mainTable(app) : tableName('data_items');
      const userId = get(user, "id", null);

      await dms_db.beginTransaction();
      try {
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
        const rows = await dms_db.promise(sql, [data, userId, id]);
        if (rows[0]) {
          const item = rows[0];
          await appendChangeLog(item.id, item.app, item.type, 'U', item.data, userId);
        }
        await dms_db.commitTransaction();
        _tagsCache.clear();
        return rows;
      } catch (err) {
        await dms_db.rollbackTransaction();
        throw err;
      }
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

    setTypeById: async (id, type, user, app = null) => {
      // When app is provided, resolve per-app table; otherwise data_items (legacy)
      const table = app ? await mainTable(app) : tableName('data_items');
      const userId = get(user, "id", null);

      await dms_db.beginTransaction();
      try {
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
        const rows = await dms_db.promise(sql, [type, userId, id]);
        if (rows[0]) {
          const item = rows[0];
          await appendChangeLog(item.id, item.app, item.type, 'U', item.data, userId);
        }
        await dms_db.commitTransaction();
        return rows;
      } catch (err) {
        await dms_db.rollbackTransaction();
        throw err;
      }
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

    createData: async (args, user) => {
      const [app, type, data = {}] = args;
      const resolved = await ensureForWrite(app, type);
      const userId = get(user, "id", null);

      await dms_db.beginTransaction();
      try {
        let rows;

        // SQLite split tables need explicit ID allocation (no AUTOINCREMENT)
        if (dbType === 'sqlite' && resolved.table !== 'data_items') {
          const id = await allocateId(dms_db, app, dbType, splitMode);
          const sql = `
            INSERT INTO ${resolved.fullName}(id, app, type, data, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING id, app, type, data,
              ${typeCast('created_at', 'TEXT', dbType)}, created_by,
              ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
          `;
          rows = await dms_db.promise(sql, [id, app, type, data, userId]);
        } else {
          // PostgreSQL split tables use DEFAULT nextval() from shared sequence.
          // Default data_items uses its own AUTOINCREMENT/sequence.
          const sql = `
            INSERT INTO ${resolved.fullName}(app, type, data, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $4)
            RETURNING id, app, type, data,
              ${typeCast('created_at', 'TEXT', dbType)}, created_by,
              ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
          `;
          rows = await dms_db.promise(sql, [app, type, data, userId]);
        }

        const item = rows[0];
        await appendChangeLog(item.id, item.app, item.type, 'I', item.data, userId);
        await dms_db.commitTransaction();
        _tagsCache.clear();
        return rows;
      } catch (err) {
        await dms_db.rollbackTransaction();
        throw err;
      }
    },

    deleteData: async (app, type, ids, user) => {
      const resolved = await ensureForRead(app, type);
      const userId = get(user, "id", null);

      await dms_db.beginTransaction();
      try {
        const arrayResult = buildArrayComparison('id', ids, dbType);
        const sql = `
          DELETE FROM ${resolved.fullName}
          WHERE ${arrayResult.sql};
        `;
        const result = await dms_db.promise(sql, arrayResult.values);

        // Log each deleted ID
        for (const id of ids) {
          await appendChangeLog(id, app, type, 'D', null, userId);
        }

        await dms_db.commitTransaction();
        _tagsCache.clear();
        return result;
      } catch (err) {
        await dms_db.rollbackTransaction();
        throw err;
      }
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
