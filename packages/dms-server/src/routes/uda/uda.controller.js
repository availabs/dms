const {
  sanitizeName,
  getResponseColumnName,
  quoteAlias,
  dmsMainTable,
  getEssentials,
  getSitePatterns,
  getSiteSources,
  getValuesExceptNulls,
  getValuesFromGroup,
  handleFilters,
  handleFilterGroups,
  handleGroupBy,
  handleHaving,
  handleOrderBy,
  buildCombinedWhere
} = require('./utils');
const { jsonMerge, typeCast } = require('#db/query-utils.js');

/**
 * Translate PostgreSQL-specific SQL expressions to SQLite equivalents.
 * Handles client-sent "calculated columns" and groupBy expressions.
 *
 * Translations:
 *   array_to_string(array_agg(distinct X), 'sep')  →  group_concat(X, 'sep')
 *   array_to_string(array_agg(X), 'sep')           →  group_concat(X, 'sep')
 *   array_agg(X)                                   →  json_group_array(X)
 *   to_jsonb(array_remove(array[...], null))::text  →  json_array(...)
 *   to_jsonb(X)                                    →  json(X)
 *   array_remove(array[...], null)                 →  json_array(...)  (nulls kept — close enough)
 *
 * Note: `distinct` is stripped from group_concat because SQLite does not support
 * DISTINCT with a separator argument. Results may contain duplicates.
 */
function translatePgToSqlite(expr) {
  // array_to_string(array_agg(distinct? X), 'sep') → group_concat(X, 'sep')
  // Strip `distinct` since SQLite group_concat doesn't support DISTINCT with separator
  expr = expr.replace(
    /array_to_string\s*\(\s*array_agg\s*\(\s*(?:distinct\s+)?([^)]+)\)\s*,\s*('[^']*')\s*\)/gi,
    'group_concat($1, $2)'
  );
  // standalone array_agg(...) → json_group_array(...)
  expr = expr.replace(/array_agg\s*\(/gi, 'json_group_array(');

  // to_jsonb(array_remove(array[...], null))::text → json_array(...)
  // to_jsonb(array_remove(array[...], null))       → json_array(...)
  // The array[...] contents are CASE expressions; nulls are kept since
  // SQLite has no array_remove, but the grouping result is equivalent.
  expr = expr.replace(
    /to_jsonb\s*\(\s*array_remove\s*\(\s*array\s*\[([^\]]*)\]\s*,\s*null\s*\)\s*\)/gi,
    'json_array($1)'
  );

  // Remaining standalone array[...] → json_array(...)
  expr = expr.replace(/\barray\s*\[([^\]]*)\]/gi, 'json_array($1)');

  // to_jsonb(X) → json(X)
  expr = expr.replace(/to_jsonb\s*\(/gi, 'json(');

  return expr;
}

// ================================================= Source Functions ================================================

async function getSourcesLength(env) {
  const { isDms, db, app, type, splitMode } = await getEssentials({ env });

  if (isDms) {
    const pattern_ids = await getSitePatterns({ db, app, env, splitMode });
    if (!pattern_ids.length) return 0;

    const sources = await getSiteSources({ db, app, pattern_ids, pattern_doc_types: [type], splitMode });
    return sources.length;
  }

  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const { rows: [{ num_sources }] } = await db.query(
    `SELECT COUNT(1)::INTEGER AS num_sources FROM ${tbl}`
  );
  return num_sources;
}

async function getSourceIdsByIndex(env, indices) {
  const { isDms, db, app, type, splitMode } = await getEssentials({ env });
  const num = indices.to - indices.from + 1;

  if (isDms) {
    const pattern_ids = await getSitePatterns({ db, app, env, splitMode });
    if (!pattern_ids.length) return [];

    const sources = await getSiteSources({ db, app, pattern_ids, pattern_doc_types: [type], splitMode });
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

  // DAMA: select specific columns from data_manager.sources
  const tbl = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
  const colList = sanitizedAttrs.map(a => `"${a}"`).join(', ');
  const { rows } = await db.query(
    `SELECT source_id AS id, ${colList} FROM ${tbl} WHERE source_id = ANY($1::INT[])`,
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

async function simpleFilterLength(env, view_id, options) {
  const { isDms, db, app, type, table_schema, table_name } = await getEssentials({ env, view_id, options });

  let {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterRelation = 'and',
    filterGroups = {},
    groupBy = [], having = [],
    normalFilter = []
  } = JSON.parse(options);

  // Translate PG-specific SQL in groupBy expressions for SQLite
  if (db.type === 'sqlite' && groupBy.length) {
    groupBy = groupBy.map(translatePgToSqlite);
  }

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const oldValues = [
    ...isDms ? [[app], [type]] : [],
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
  ];
  const newValues = getValuesFromGroup(filterGroups);
  const values = [...oldValues, ...newValues];

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like, filterRelation,
    filterGroups, isDms, app, type, oldValues, dbType: db.type
  });

  // Check for jsonb_array_elements_text (PG) or json_each (SQLite) in groupBy
  const hasArrayElements = groupBy?.[0]?.includes('jsonb_array_elements_text')
    || groupBy?.[0]?.includes('json_each');

  const sql =
    hasArrayElements && sanitizeName(groupBy?.[0])
      ? `WITH t AS (
           SELECT DISTINCT ${groupBy[0]}
           FROM ${table_schema}.${table_name}
           ${combinedWhere}
           GROUP BY 1
           ${handleHaving(having)}
         )
         SELECT count(*) numrows FROM t`
      : `SELECT count(${groupBy.length
           ? `DISTINCT ${groupBy.map(g => sanitizeName(g)).filter(g => g)
               .map(c => `CASE WHEN ${c} IS NULL THEN '__NULL__VAL__' ELSE ${typeCast(c, 'TEXT', db.type)} END`)
               .join(`|| '-' ||`)}`
           : 1}) numrows
         FROM ${table_schema}.${table_name}
         ${combinedWhere}
         ${handleHaving(having)}`;

  const { rows } = await db.query(sql, values);
  return rows?.[0]?.numrows ?? 0;
}

async function simpleFilter(env, view_id, options, attributes, indices) {
  const num = indices.to - indices.from + 1;
  const { isDms, db, app, type, table_schema, table_name, dmsAttributes } = await getEssentials({ env, view_id, options });

  let sanitizedAttrs = sanitizeName(attributes).filter(f => f);
  if (!sanitizedAttrs.length) return [];

  // Translate PG-specific SQL to SQLite equivalents
  if (db.type === 'sqlite') {
    sanitizedAttrs = sanitizedAttrs.map(translatePgToSqlite);
  }

  // Map long column names to short aliases
  const columnNameMap = sanitizedAttrs.reduce((acc, attr, i) => {
    const responseName = getResponseColumnName(attr);
    if (attr.toLowerCase().includes(' as ') && responseName.length > 60) {
      acc[attr] = attr.replace(` ${responseName}`, ` col_${i}`);
    }
    return acc;
  }, {});

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {},
    filterRelation = 'and',
    filterGroups = {},
    groupBy = [], having = [], orderBy = {}, meta = {},
    normalFilter = []
  } = JSON.parse(options);

  if (normalFilter.length) {
    normalFilter.forEach(({ column, values }) => {
      (filter[column] ??= []).push(...values);
    });
  }

  const oldValues = [
    ...isDms ? [[app], [type]] : [],
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
  ];
  const newValues = getValuesFromGroup(filterGroups);
  const values = [...oldValues, ...newValues];

  const combinedWhere = buildCombinedWhere({
    filter, exclude, gt, gte, lt, lte, like, filterRelation,
    filterGroups, isDms, app, type, oldValues, dbType: db.type
  });

  const sql = `
    SELECT ${sanitizedAttrs.map(c => quoteAlias(columnNameMap[c] || c)).join(', ')}
    FROM ${table_schema}.${table_name}
    ${combinedWhere}
    ${handleGroupBy(groupBy)}
    ${handleHaving(having)}
    ${handleOrderBy(orderBy, dmsAttributes)}
    LIMIT ${+num}
    OFFSET ${indices.from}
  `;

  const res = await db.query(sql, values);

  // Restore long column names from short aliases
  let rows = Object.keys(columnNameMap).length
    ? res.rows.map(row => {
        const restored = Object.keys(columnNameMap).reduce((acc, originalName) => {
          return { ...acc, [getResponseColumnName(originalName)]: row[getResponseColumnName(columnNameMap[originalName])] };
        }, {});
        return { ...row, ...restored };
      })
    : res.rows;

  // Apply meta lookups
  if (Object.keys(meta).length) {
    rows = await applyMeta(rows, meta, env, isDms, options);
  }

  return rows;
}

async function dataById(env, view_id, ids, attributes) {
  const { isDms, db, app, type, table_schema, table_name } = await getEssentials({ env, view_id, options: { isDama: false } });

  const sanitizedAttrs = sanitizeName(attributes).filter(f => f);
  if (!sanitizedAttrs.length) return [];

  const sql = `SELECT id, ${sanitizedAttrs.map(c => quoteAlias(c)).join(', ')} FROM ${table_schema}.${table_name} WHERE id = ANY($1)`;
  const { rows } = await db.query(sql, [ids.map(id => +id)]);
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
        const valueAttrFormatted = isDms && valueAttribute.includes('data->>')
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
            ? JSON.parse(row[column])
            : row[column]?.toString()?.includes(',')
              ? row[column].toString().split(',').map(val => metaData[column][val.trim()]).join(', ')
              : (metaData[column][row[column]] || row[column]);
        row[column] = value;
      });
    });
  }

  return rows;
}

module.exports = {
  getResponseColumnName,

  // Sources
  getSourcesLength,
  getSourceIdsByIndex,
  getSourceById,
  updateSource,

  // Views
  getViewLengthBySourceId,
  getViewsByIndexBySourceId,
  getViewById,
  updateView,

  // Data queries
  simpleFilterLength,
  simpleFilter,
  dataById,

  // Exported for testing
  translatePgToSqlite
};
