const {
  sanitizeName,
  getResponseColumnName,
  quoteAlias,
  dmsMainTable,
  getEssentials,
  getSitePatterns,
  getSiteSources,
} = require('./utils');
const { jsonMerge, buildArrayComparison, jsonExtract } = require('#db/query-utils.js');
const { resolveTable, sanitize } = require('#db/table-resolver.js');
const { getInstance } = require('#db/type-utils.js');
const querySets = require('./query_sets');
const { translatePgToSqlite } = require('./query_sets/postgres');

const pgIdent = n => (n.length <= 63 ? n : n.slice(0, 63));

// ================================================= Source Functions ================================================

async function getSourcesLength(env) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  if (isDms) {
    const pattern_ids = await getSitePatterns({ db, app, env, splitMode });
    if (!pattern_ids.length) return 0;

    const sources = await getSiteSources({ db, app, pattern_ids, splitMode });
    return sources.length;
  }

  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const { rows: [{ num_sources }] } = await db.query(
    `SELECT COUNT(1)::INTEGER AS num_sources FROM ${tbl}`
  );
  return num_sources;
}

async function getSourceIdsByIndex(env, indices) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });
  const num = indices.to - indices.from + 1;

  if (isDms) {
    const pattern_ids = await getSitePatterns({ db, app, env, splitMode });
    if (!pattern_ids.length) return [];

    const sources = await getSiteSources({ db, app, pattern_ids, splitMode });
    if (!sources.length) return [];

    return sources
      .sort((a, b) => +a.id - +b.id)
      .filter((_, i) => i >= indices.from && i <= indices.to)
      .map(s => +s.id);
  }

  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const { rows } = await db.query(
    `SELECT source_id AS id FROM ${tbl} ORDER BY 1 LIMIT ${+num} OFFSET ${indices.from}`
  );
  return rows.map(r => +r.id);
}

async function getSourceById(env, ids, attributes) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  // Filter out 'value' — it's a Falcor internal property from $ref resolution, not a real column
  const sanitizedAttrs = sanitizeName(attributes).filter(f => f && f !== 'value');
  if (!sanitizedAttrs.length) return [];

  if (isDms) {
    const dbCols = ['id', 'app', 'type', 'data', 'created_at', 'created_by', 'updated_at', 'updated_by'];
    const formattedAttrs = ['id', ...sanitizedAttrs].map(a =>
      // 'type' must read from data JSON (e.g. 'internal_table'), not the row column (e.g. 'doc_type|source')
      a === 'type' ? `data->>'type' AS type`
        : dbCols.includes(a) ? a
        // DMS source rows don't store source_id in data — fall back to the row id
        : a === 'source_id' ? `COALESCE(data->>'source_id', CAST(id AS TEXT)) AS source_id`
        : `data->>'${a}' AS ${quoteAlias(a)}`
    );

    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `SELECT ${formattedAttrs.join(', ')} FROM ${tbl} WHERE id = ANY($1::INT[])`,
      [ids.map(Number)]
    );
    return rows;
  }

  // DAMA: select specific columns from data_manager.sources.
  // Drop 'id' from the attribute list — the table has no `id` column;
  // `source_id AS id` (always added below) supplies it. Without this, a
  // Falcor request that includes 'id' in attributes would emit a duplicate
  // SELECT entry referencing a column that doesn't exist.
  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const dataAttrs = sanitizedAttrs.filter(a => a !== 'id');
  const colList = dataAttrs.length ? `, ${dataAttrs.map(a => `"${a}"`).join(', ')}` : '';
  const { rows } = await db.query(
    `SELECT source_id AS id${colList} FROM ${tbl} WHERE source_id = ANY($1::INT[])`,
    [ids.map(Number)]
  );
  return rows;
}

async function updateSource(env, sourceId, updates) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  if (isDms) {
    const patch = {};
    for (const [attr, val] of Object.entries(updates)) {
      const clean = sanitizeName(attr);
      if (clean) patch[clean] = val;
    }

    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `UPDATE ${tbl} SET data = ${jsonMerge('data', '$1', db.type)} WHERE id = $2 RETURNING *`,
      [JSON.stringify(patch), sourceId]
    );
    return rows;
  }

  const values = Object.values(updates);
  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
  const { rows } = await db.query(
    `UPDATE ${tbl} SET ${setClauses} WHERE source_id = $${values.length + 1} RETURNING *`,
    [...values, sourceId]
  );
  return rows;
}

// ================================================= View Functions ==================================================

async function getViewLengthBySourceId(env, ids) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  if (isDms) {
    const tbl = await dmsMainTable(db, app, splitMode);
    const lenFn = db.type === 'postgres'
      ? "jsonb_array_length(data->'views')"
      : "json_array_length(data, '$.views')";
    const { rows } = await db.query(
      `SELECT id, ${lenFn} AS num_views FROM ${tbl} WHERE id = ANY($1::INT[])`,
      [ids.map(Number)]
    );
    return rows;
  }

  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const { rows } = await db.query(
    `SELECT source_id AS id, COUNT(view_id)::INTEGER AS num_views FROM ${tbl} WHERE source_id = ANY($1::INT[]) GROUP BY 1`,
    [ids.map(Number)]
  );
  return rows;
}

async function getViewsByIndexBySourceId(env, sourceIds, indices) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });
  const num = indices.to - indices.from + 1;

  if (isDms) {
    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `SELECT id, data->'views' AS views FROM ${tbl} WHERE id = ANY($1::INT[])`,
      [sourceIds.map(Number)]
    );
    return rows.map(row => {
      // SQLite data->'views' returns a JSON string; PostgreSQL returns a parsed array
      const views = typeof row.views === 'string' ? JSON.parse(row.views) : (row.views || []);
      return {
        id: row.id,
        views: views
          .sort((a, b) => +a.id - +b.id)
          .filter((_, i) => i >= indices.from && i <= indices.to)
          .map(s => +s.id)
      };
    });
  }

  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const aggFn = db.type === 'postgres'
    ? 'array_agg(view_id ORDER BY view_id)'
    : 'json_group_array(view_id)';
  const { rows } = await db.query(
    `SELECT source_id AS id, ${aggFn} AS views
     FROM ${tbl} WHERE source_id = ANY($1) GROUP BY 1 ORDER BY 1`,
    [sourceIds.map(Number)]
  );
  return rows.map(row => {
    // PostgreSQL returns a real array; SQLite json_group_array returns a JSON string
    const views = typeof row.views === 'string' ? JSON.parse(row.views) : (row.views || []);
    return {
      id: row.id,
      views: views.sort((a, b) => +a - +b).filter((_, i) => i >= indices.from && i <= indices.to)
    };
  });
}

async function getViewById(env, ids, attributes) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  // Filter out 'value' — it's a Falcor internal property from $ref resolution, not a real column
  const sanitizedAttrs = sanitizeName(attributes).filter(f => f && f !== 'value');
  if (!sanitizedAttrs.length) return [];

  if (isDms) {
    const dbCols = ['id', 'app', 'type', 'data', 'created_at', 'created_by', 'updated_at', 'updated_by'];
    const formattedAttrs = ['id', ...sanitizedAttrs].map(a =>
      dbCols.includes(a) ? a
        // DMS view rows don't store view_id in data — fall back to the row id
        : a === 'view_id' ? `COALESCE(data->>'view_id', CAST(id AS TEXT)) AS view_id`
        : `data->>'${a}' AS ${quoteAlias(a)}`
    );

    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `SELECT ${formattedAttrs.join(', ')} FROM ${tbl} WHERE id = ANY($1::INT[])`,
      [ids.map(Number)]
    );
    return rows;
  }

  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const colList = sanitizedAttrs.map(a => `"${a}"`).join(', ');
  const { rows } = await db.query(
    `SELECT view_id AS id, ${colList} FROM ${tbl} WHERE view_id = ANY($1::INT[])`,
    [ids.map(Number)]
  );
  return rows;
}

async function getViewBySrcCategories (env, category){
  const {db} = await getEssentials({ env });
  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const sql = `SELECT *
                FROM ${tbl}
                WHERE version IS NOT NULL 
                AND source_id IN (
                  SELECT source_id
                  FROM data_manager.sources
                  WHERE EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(categories) AS outer_elem,
                        jsonb_array_elements_text(outer_elem) AS inner_elem
                    WHERE inner_elem = $1
                  )
              );`;

  const { rows } = await db.query(sql, [category]);

  return rows;

}
async function updateView(env, viewId, updates) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  if (isDms) {
    const patch = {};
    for (const [attr, val] of Object.entries(updates)) {
      const clean = sanitizeName(attr);
      if (clean) patch[clean] = val;
    }

    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `UPDATE ${tbl} SET data = ${jsonMerge('data', '$1', db.type)} WHERE id = $2 RETURNING *`,
      [JSON.stringify(patch), viewId]
    );
    return rows;
  }

  const values = Object.values(updates);
  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
  const { rows } = await db.query(
    `UPDATE ${tbl} SET ${setClauses} WHERE view_id = $${values.length + 1} RETURNING *`,
    [...values, viewId]
  );
  return rows;
}

// ============================================= Data Query Functions ================================================
//
// These three functions dispatch to a per-database-type query set. The
// context resolved by getEssentials() includes a `dbType` field ('pg' for
// Postgres/SQLite, 'ch' for ClickHouse); the corresponding query set knows
// how to build and execute SQL for that backend.

async function simpleFilterLength(env, view_id, options) {
  const ctx = await getEssentials({ env, view_id, options });
  return querySets[ctx.dbType].simpleFilterLength(ctx, options);
}

async function simpleFilter(env, view_id, options, attributes, indices) {
  const ctx = await getEssentials({ env, view_id, options });
  let rows = await querySets[ctx.dbType].simpleFilter(ctx, options, attributes, indices);

  // Meta lookups may target a different env/db than the main query, so we
  // re-enter simpleFilter (which will dispatch via its own getEssentials).
  const { meta = {}, serverFn = {}, keepOriginalValues = false } = JSON.parse(options);
  if (Object.keys(meta).length) {
    rows = await applyMeta(rows, meta, env, ctx.isDms, options);
  }
  if (Object.keys(serverFn).length) {
    rows = await applyServerFn(rows, serverFn, ctx.app, ctx.db, ctx.splitMode, keepOriginalValues);
  }
  return rows;
}

async function dataById(env, view_id, ids, attributes) {
  const ctx = await getEssentials({ env, view_id, options: { isDama: false } });
  return querySets[ctx.dbType].dataById(ctx, ids, attributes);
}

// ================================================= Server Functions ===============================================

// Resolves columns that have a serverFn defined (e.g. recurse_extract_data).
// Called after the main simpleFilter query when options.serverFn is non-empty.
//
// getData.js guarantees that `id` is always included in isDms result rows (line 295).
// This lets us do a secondary joinKey lookup when joinKey !== colName and the joinKey
// field is absent from the result set (e.g. sections' url_slug column uses joinKey:
// "parent", which may not have been a selected column).
//
// DMS stores parent refs as JSON: {"id":"570240","ref":"app+type"} where ref uses
// the app||'+'||type composite key format. Parse both fields so the lookup query
// can be scoped to the correct type (e.g. "my_docs|page").
function parseParentRef(val) {
  if (val == null || val === '') return null;
  const s = String(val).trimStart();
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      if (obj.id == null) return null;
      return { id: String(obj.id), ref: obj.ref || null };
    } catch {}
  }
  return { id: s, ref: null };
}

async function applyServerFn(rows, serverFn, app, db, splitMode, keepOriginalValues = false) {
  if (!rows.length) return rows;
  const tbl = await dmsMainTable(db, app, splitMode);

  for (const [colName, { serverFn: fn, joinKey, valueKey, keepOriginal, joinWithChar }] of Object.entries(serverFn)) {
    if (fn !== 'recurse_extract_data') continue;

    const safeJoinKey = sanitizeName(joinKey);
    const safeValueKey = sanitizeName(valueKey);
    if (!safeJoinKey || !safeValueKey) continue;

    // Build array of raw stored joinKey values parallel to rows.
    // When joinKey === colName the stored value IS the field to resolve; read directly.
    // When joinKey !== colName (e.g. sections url_slug uses joinKey=parent), the foreign
    // key lives in a different field that may not have been SELECTed — fetch it via row id.
    let foreignKeys;

    const firstMissing = joinKey !== colName && rows.some(r => r[joinKey] === undefined);
    if (firstMissing) {
      const rowIds = rows.map(r => r.id).filter(v => v != null && !isNaN(+v)).map(Number);
      if (!rowIds.length) continue;
      const { sql: jkSql, values: jkVals } = buildArrayComparison('id', rowIds, db.type);
      const { rows: jkRows } = await db.query(
        `SELECT id, ${jsonExtract('data', safeJoinKey, db.type)} AS jk FROM ${tbl} WHERE ${jkSql}`,
        jkVals
      );
      const jkByRowId = Object.fromEntries(jkRows.map(r => [String(r.id), r.jk]));
      foreignKeys = rows.map(r => jkByRowId[String(r.id)] ?? null);
    } else {
      foreignKeys = rows.map(r => r[joinKey] ?? null);
    }

    // Collect unique numeric parent IDs from all foreign key values.
    // id is a PK in data_items so no type-scope filter is needed for correctness.
    // (The stored ref in sections is just the pattern name, not the full type string,
    // so filtering by ref would cause false-negative misses — see sectionArray.jsx:171.)
    const idSet = new Set();
    foreignKeys.forEach(v => {
      if (v == null || v === '') return;
      const s = String(v).trimStart();
      const entries = !s.startsWith('{') && s.includes(',')
        ? s.split(',').map(p => parseParentRef(p.trim())).filter(Boolean)
        : [parseParentRef(s)].filter(Boolean);
      for (const { id } of entries) {
        if (id && !isNaN(+id)) idSet.add(Number(id));
      }
    });

    if (!idSet.size) continue;

    const { sql: idSql, values: idVals } = buildArrayComparison('id', [...idSet], db.type);
    const { rows: lookupRows } = await db.query(
      `SELECT id, ${jsonExtract('data', safeValueKey, db.type)} AS val FROM ${tbl} WHERE ${idSql}`,
      idVals
    );
    const lookup = {}; // id (string) → resolved value
    for (const r of lookupRows) lookup[String(r.id)] = r.val;

    rows.forEach((row, i) => {
      const rawVal = foreignKeys[i];
      if (rawVal == null || rawVal === '') return;
      const s = String(rawVal).trimStart();
      const entries = !s.startsWith('{') && s.includes(',')
        ? s.split(',').map(p => parseParentRef(p.trim())).filter(Boolean)
        : [parseParentRef(s)].filter(Boolean);
      const resolved = entries
        .map(({ id }) => id ? (lookup[id] ?? (keepOriginal ? id : null)) : null)
        .filter(v => v != null);
      const resolvedTitle = joinWithChar ? resolved.join(joinWithChar) : (resolved.length === 1 ? resolved[0] : resolved);
      row[colName] = keepOriginalValues
        ? { value: resolvedTitle, originalValue: rawVal }
        : resolvedTitle;
    });
  }
  return rows;
}

// ================================================= Meta Lookups ===================================================

const mapFn = {
  parseInt: e => parseInt(e),
  none: e => e
};

const assign = (originalValue, newValue, keepId) =>
  keepId ? `${newValue} (${originalValue})` : newValue;

async function applyMeta(rows, meta, env, isDms, options) {
  const metaData = await Object.keys(meta).reduce(async (acc, metaColName) => {
    const prev = await acc;
    const metaColPart0 = getResponseColumnName(metaColName, 0);
    const metaColPart1 = getResponseColumnName(metaColName);

    const {
      isDama,
      view_id: currViewId,
      keyAttribute,
      valueAttribute = 'name',
      keepId = false,
      filter = {},
      formatValuesToMap = 'none',
      metaEnv = env,
      ...rest
    } = JSON.parse(meta[metaColName] || '{}');

    const isMetaDms = metaEnv.includes('+') && !JSON.parse(options)?.isDama;

    if (!currViewId) {
      return { ...prev, [metaColPart1]: rest || {} };
    }

    const currAttributes = isMetaDms
      ? [keyAttribute, valueAttribute].map(c => c.includes('->>') ? quoteAlias(c) : `data->>'${c}' as ${quoteAlias(c)}`)
      : [keyAttribute, valueAttribute];
    const groupBy = isMetaDms
      ? [keyAttribute, valueAttribute].map(c => c.includes('->>') ? getResponseColumnName(c, 0) : `data->>'${c}'`)
      : [keyAttribute, valueAttribute];

    const uniqData = [
      ...new Set(
        rows.map(fd => fd[metaColPart1])
          .reduce((acc, fd) => {
            if (typeof fd === 'string' && fd.startsWith('[') && fd.endsWith(']')) {
              return [...acc, ...JSON.parse(fd)];
            } else if (fd?.toString()?.includes(',')) {
              return [...acc, ...fd.split(',').map(f => mapFn[formatValuesToMap](f.trim()))];
            }
            return [...acc, mapFn[formatValuesToMap](fd)];
          }, [])
      )
    ].filter(d => d);

    const currOptions = JSON.stringify({
      isDama,
      filter: {
        ...filter,
        ...uniqData?.length && {
          [(isMetaDms && !keyAttribute.includes('data->>')
            ? `data->>'${keyAttribute}'`
            : isMetaDms && keyAttribute.includes('data->>')
              ? getResponseColumnName(keyAttribute, 0)
              : keyAttribute) || metaColPart0]: uniqData
        },
      },
      groupBy
    });

    const essentials = await getEssentials({
      env: metaEnv,
      view_id: currViewId === '__' ? undefined : currViewId,
      options: currOptions
    });

    const dataWithMeta = await simpleFilter(
      metaEnv, currViewId === '__' ? undefined : currViewId,
      currOptions, currAttributes,
      { from: 0, to: uniqData?.length }
    ).then(tmpData => {
      return tmpData.reduce((tmpDataAcc, row) => {
        const valueAttrFormatted = (isDms || isMetaDms) && valueAttribute.includes('data->>')
          ? getResponseColumnName(valueAttribute)
          : valueAttribute;
        tmpDataAcc[row[keyAttribute]] = assign(row[keyAttribute], row[valueAttrFormatted] || row[keyAttribute], keepId);
        return tmpDataAcc;
      }, {});
    });

    return { ...prev, [metaColPart1]: dataWithMeta };
  }, {});

  // Apply meta values to rows
  if (Object.keys(metaData).length) {
    rows.forEach(row => {
      Object.keys(metaData).forEach(column => {
        const value =
          typeof row[column] === 'string' && row[column].startsWith('[') && row[column].endsWith(']')
            ? JSON.parse(row[column]).map(val => metaData[column][typeof val === 'string' ? val.trim() : val])
            : row[column]?.toString()?.includes(',')
              ? row[column].toString().split(',').map(val => metaData[column][val.trim()]).join(', ')
              : (metaData[column][row[column]] || row[column]);
        row[column] = {value, originalValue: row[column]};
      });
    });
  }

  return rows;
}

// ================================================= Index Functions ================================================
const parseIfJSON = str => {
  try{
    if (!!str && typeof str === 'object') return str;
    return JSON.parse(str)
  }catch (e){
    return {}
  }
}
async function setIndexColumn(env, sourceId, columnName, enable) {
  const { isDms, db, app, splitMode } = await getEssentials({ env });

  if (isDms) {
    const tbl = await dmsMainTable(db, app, splitMode);
    const { rows } = await db.query(
      `SELECT data, type FROM ${tbl} WHERE id = $1`,
      [Number(sourceId)]
    );
    if (!rows.length) throw new Error(`Source ${sourceId} not found`);

    const { data, type: dmsRowType } = rows[0];
    const config = parseIfJSON(data.config) || {};
    const cols = config.attributes || [];

    const updatedCols = cols.map(c => {
      if (c.name !== columnName) return c;
      if (enable) return { ...c, isIndex: true };
      const { isIndex: _, ...rest } = c;
      return rest;
    });

    await updateSource(env, sourceId, { config: { ...config, attributes: updatedCols } });

    // DDL: manage expression indexes on each view's split table
    const sourceSlug = getInstance(dmsRowType);
    const views = data.views || [];
    const viewIds = views.map(v => (typeof v === 'object' ? v.id : v)).filter(Boolean);
    const safeCol = sanitizeName(columnName);

    for (const viewId of viewIds) {
      if (!safeCol) continue;
      const dataType = `${sourceSlug}|${viewId}:data`;
      const { schema: ts, table: tn } = resolveTable(app, dataType, db.type, splitMode, Number(sourceId));
      const fqt = db.type === 'postgres' ? `${ts}.${tn}` : tn;
      const idxName = pgIdent(`idx_${sanitize(tn)}_${sanitize(safeCol)}`);

      if (enable) {
        const expr = db.type === 'postgres'
          ? `((data->>'${safeCol}'))`
          : `(json_extract(data, '$.${safeCol}'))`;
        try {
          await db.query(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${fqt} ${expr}`);
        } catch (e) {
          // Split table may not exist yet (no data uploaded) — safe to skip
          console.warn(`[setIndex] create DMS index skipped (${fqt}): ${e.message}`);
        }
      } else {
        try {
          await db.query(db.type === 'postgres'
            ? `DROP INDEX IF EXISTS ${ts}.${idxName}`
            : `DROP INDEX IF EXISTS ${idxName}`);
        } catch (e) {
          console.warn(`[setIndex] drop DMS index: ${e.message}`);
        }
      }
    }
    return;
  }

  // External (DAMA) source
  const srcTbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const { rows } = await db.query(
    `SELECT metadata FROM ${srcTbl} WHERE source_id = $1`,
    [Number(sourceId)]
  );
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);

  const raw = rows[0].metadata;
  const metadata = parseIfJSON(raw);
  const cols = metadata.columns || [];

  const updatedCols = cols.map(c => {
    if (c.name !== columnName) return c;
    if (enable) return { ...c, isIndex: true };
    const { isIndex: _, ...rest } = c;
    return rest;
  });

  await updateSource(env, sourceId, { metadata: { ...metadata, columns: updatedCols } });

  // DDL: manage indexes on each DAMA view's data table
  const viewsTbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const { rows: viewRows } = await db.query(
    `SELECT table_schema, table_name FROM ${viewsTbl} WHERE source_id = $1 AND table_name IS NOT NULL`,
    [Number(sourceId)]
  );
  const safeCol = sanitizeName(columnName);

  for (const { table_schema, table_name } of viewRows) {
    if (!table_schema || !table_name || !safeCol) continue;
    const fqt = db.type === 'postgres' ? `${table_schema}.${table_name}` : table_name;
    const idxName = pgIdent(`idx_${sanitize(table_name)}_${sanitize(safeCol)}`);

    if (enable) {
      try {
        await db.query(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${fqt} ("${safeCol}")`);
      } catch (e) {
        console.warn(`[setIndex] create DAMA index skipped (${fqt}): ${e.message}`);
      }
    } else {
      try {
        await db.query(db.type === 'postgres'
          ? `DROP INDEX IF EXISTS ${table_schema}.${idxName}`
          : `DROP INDEX IF EXISTS ${idxName}`);
      } catch (e) {
        console.warn(`[setIndex] drop DAMA index: ${e.message}`);
      }
    }
  }
}

async function clearViewData(env, view_id) {
  const { isDms, db, table_schema, table_name } = await getEssentials({ env, view_id: +view_id });
  if (!isDms) throw new Error('clearViewData only supported for DMS internal_table sources');
  if (table_name === 'data_items') throw new Error('Cannot clear main data_items table — split table not found for this view');

  const execClear = async (ts, tn) => {
    const fqt = db.type === 'postgres' ? `"${ts}"."${tn}"` : `"${tn}"`;
    await db.query(db.type === 'postgres' ? `TRUNCATE TABLE ${fqt}` : `DELETE FROM ${fqt}`);
  };

  await execClear(table_schema, table_name);

  // Clear the invalid-entry split table too (may not exist yet — safe to skip)
  const [appPart, sourceSlug] = env.split('+');
  try {
    const inv = await getEssentials({ env: `${appPart}+${sourceSlug}-invalid-entry`, view_id: +view_id });
    if (inv.table_name !== 'data_items') await execClear(inv.table_schema, inv.table_name);
  } catch (e) {
    // invalid-entry table not yet created — nothing to clear
  }

  return { cleared: true, table: table_name };
}

module.exports = {
  getResponseColumnName,

  // Sources
  getSourcesLength,
  getSourceIdsByIndex,
  getSourceById,
  updateSource,
  setIndexColumn,
  clearViewData,

  // Views
  getViewLengthBySourceId,
  getViewsByIndexBySourceId,
  getViewById,
  updateView,
  getViewBySrcCategories,

  // Data queries
  simpleFilterLength,
  simpleFilter,
  dataById,

  // Exported for testing
  translatePgToSqlite
};
