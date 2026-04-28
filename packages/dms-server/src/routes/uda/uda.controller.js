const {
  sanitizeName,
  getResponseColumnName,
  quoteAlias,
  dmsMainTable,
  getEssentials,
  getSitePatterns,
  getSiteSources,
} = require('./utils');
const { jsonMerge } = require('#db/query-utils.js');
const querySets = require('./query_sets');
const { translatePgToSqlite } = require('./query_sets/postgres');

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
  const rows = await querySets[ctx.dbType].simpleFilter(ctx, options, attributes, indices);

  // Meta lookups may target a different env/db than the main query, so we
  // re-enter simpleFilter (which will dispatch via its own getEssentials).
  const { meta = {} } = JSON.parse(options);
  if (Object.keys(meta).length) {
    return applyMeta(rows, meta, env, ctx.isDms, options);
  }
  return rows;
}

async function dataById(env, view_id, ids, attributes) {
  const ctx = await getEssentials({ env, view_id, options: { isDama: false } });
  return querySets[ctx.dbType].dataById(ctx, ids, attributes);
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
  getViewBySrcCategories,

  // Data queries
  simpleFilterLength,
  simpleFilter,
  dataById,

  // Exported for testing
  translatePgToSqlite
};
