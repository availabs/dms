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
const { resolveTable, sanitize } = require('#db/table-resolver.js');
const { getInstance } = require('#db/type-utils.js');
const querySets = require('./query_sets');
const { translatePgToSqlite, detectRealPrimaryKey, resolvePrimaryKey } = require('./query_sets/postgres');

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

// External (DAMA) sources can have a primary key on any column, not necessarily one
// named "id" (see set_primary_col_from_meta.md) — and unlike DMS split tables, there's
// no guarantee a physical column literally named "id" exists at all. The client still
// requests a literal "id" attribute for row identity (mirroring the isDms convention —
// see dataWrapper/getData.js), rather than tracking the real PK column name itself,
// which risks going stale or never getting populated (the stored `metadata.columns[]
// .isPrimaryKey` flag is only set when a PK is set *through the metadata UI* — an
// auto-detected/pre-existing PK, e.g. a GIS source's `ogc_fid`, never gets that flag,
// so a client-side cache of "the pk column name" can silently stay null forever even
// on a genuinely editable source). Resolve it here instead, live, the same way the
// write path (uda.controller.js's resolveEditableTable) and dataById already do —
// this is the single authoritative place a source's real row-identity column is
// determined, on both the read and write paths.
async function resolveIdAttribute(ctx, attributes) {
  if (ctx.isDms) return attributes;
  const idx = attributes.indexOf('id');
  if (idx === -1) return attributes;
  if (ctx.db.type !== 'postgres') return attributes; // e.g. ClickHouse-backed views

  const pkCol = await resolvePrimaryKey(ctx.db, ctx.table_schema, ctx.table_name);
  if (!pkCol || pkCol === 'id') return attributes;

  const resolved = [...attributes];
  resolved[idx] = `${pkCol} as id`;
  return resolved;
}

async function simpleFilter(env, view_id, options, attributes, indices) {
  const ctx = await getEssentials({ env, view_id, options });
  const resolvedAttributes = await resolveIdAttribute(ctx, attributes);
  const rows = await querySets[ctx.dbType].simpleFilter(ctx, options, resolvedAttributes, indices);

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

// External (DAMA) sources only — internal_table sources already have a synthetic
// integer `id` PRIMARY KEY on their split tables (see table-resolver.js) and never
// reach this function.
//
// enable=true: validate (no NULLs/duplicates) then ADD the constraint. enable=false:
// DROP whatever the table's real PRIMARY KEY constraint actually is (looked up via
// pg_constraint, not assumed to be the name this function would have generated —
// the PK may predate this feature, e.g. `ogc_fid` from the GIS/CSV upload pipeline).
// Removing a primary key also clears isEditable — a source can't stay editable
// without a resolvable PK to key writes off of.
async function setPrimaryKeyColumn(env, sourceId, columnName, enable = true) {
  const { isDms, db } = await getEssentials({ env });
  if (isDms) throw new Error('setPrimaryKeyColumn is only supported for external (DAMA) sources');
  if (db.type !== 'postgres') throw new Error('Primary key constraints are only supported on PostgreSQL sources');

  const srcTbl = 'data_manager.sources';
  const { rows } = await db.query(
    `SELECT metadata FROM ${srcTbl} WHERE source_id = $1`,
    [Number(sourceId)]
  );
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);

  const metadata = parseIfJSON(rows[0].metadata);
  const cols = metadata.columns || [];
  const safeCol = sanitizeName(columnName);
  if (!safeCol) throw new Error(`Invalid column name: ${columnName}`);
  if (!cols.some(c => c.name === columnName)) throw new Error(`Column "${columnName}" not found on source ${sourceId}`);

  const { rows: viewRows } = await db.query(
    `SELECT table_schema, table_name FROM data_manager.views WHERE source_id = $1 AND table_name IS NOT NULL`,
    [Number(sourceId)]
  );

  if (enable) {
    // Validate every physical table backing this source before altering any of them —
    // a partial primary key across a source's tables would be worse than none.
    for (const { table_schema, table_name } of viewRows) {
      if (!table_schema || !table_name) continue;
      const fqt = `"${table_schema}"."${table_name}"`;
      const { rows: [{ total, distinct_count, non_null_count }] } = await db.query(
        `SELECT count(*) AS total, count(distinct "${safeCol}") AS distinct_count, count("${safeCol}") AS non_null_count
         FROM ${fqt}`
      );
      const nullCount = total - non_null_count;
      const dupCount = total - distinct_count;
      if (nullCount > 0 || dupCount > 0) {
        throw new Error(
          `Column "${columnName}" cannot be a primary key on ${table_schema}.${table_name}: ` +
          `${nullCount} row(s) with NULL, ${dupCount} duplicate value(s)`
        );
      }
    }

    for (const { table_schema, table_name } of viewRows) {
      if (!table_schema || !table_name) continue;
      const constraintName = pgIdent(`pk_${sanitize(table_name)}`);
      await db.query(
        `ALTER TABLE "${table_schema}"."${table_name}" ADD CONSTRAINT "${constraintName}" PRIMARY KEY ("${safeCol}")`
      );
    }
  } else {
    for (const { table_schema, table_name } of viewRows) {
      if (!table_schema || !table_name) continue;
      const { rows: conRows } = await db.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'p'`,
        [`${table_schema}.${table_name}`]
      );
      const conname = conRows[0]?.conname;
      if (!conname) continue; // nothing to drop on this table
      await db.query(`ALTER TABLE "${table_schema}"."${table_name}" DROP CONSTRAINT "${conname}"`);
    }
  }

  // Strict mutual exclusion — a table has at most one primary key.
  const updatedCols = cols.map(c => {
    if (c.name === columnName) {
      if (enable) return { ...c, isPrimaryKey: true };
      const { isPrimaryKey: _, ...rest } = c;
      return rest;
    }
    if (enable && c.isPrimaryKey) { const { isPrimaryKey: _, ...rest } = c; return rest; }
    return c;
  });
  const metadataPatch = { ...metadata, columns: updatedCols };
  if (!enable) metadataPatch.isEditable = false;
  await updateSource(env, sourceId, { metadata: metadataPatch });
}

// Detects whether the source's underlying table(s) already have a real PRIMARY KEY,
// either declared outside of DMS (e.g. `ogc_fid` from the GIS/CSV upload pipeline) or
// set via setPrimaryKeyColumn above. Returns null-column info if no view/table exists yet.
async function getSourcePrimaryKeyInfo(env, sourceId) {
  const { isDms, db } = await getEssentials({ env });
  if (isDms) return { hasPkey: true, pkeyColumn: 'id', isDetectedExisting: true };

  const { rows } = await db.query(
    `SELECT metadata FROM data_manager.sources WHERE source_id = $1`,
    [Number(sourceId)]
  );
  if (!rows.length) throw new Error(`Source ${sourceId} not found`);
  const metadata = parseIfJSON(rows[0].metadata);
  const storedPkCol = (metadata.columns || []).find(c => c.isPrimaryKey)?.name || null;

  const { rows: viewRows } = await db.query(
    `SELECT table_schema, table_name FROM data_manager.views WHERE source_id = $1 AND table_name IS NOT NULL`,
    [Number(sourceId)]
  );
  if (!viewRows.length) return { hasPkey: false, pkeyColumn: null, isDetectedExisting: false };

  // A source can back more than one physical table (one per view) — only report a
  // real PK if every table backing it actually has one, on the same column.
  let detected = null;
  for (const { table_schema, table_name } of viewRows) {
    const pk = await detectRealPrimaryKey(db, table_schema, table_name);
    if (!pk) return { hasPkey: false, pkeyColumn: storedPkCol, isDetectedExisting: false };
    if (detected === null) detected = pk;
  }

  return { hasPkey: true, pkeyColumn: detected, isDetectedExisting: !storedPkCol || storedPkCol !== detected };
}

// ============================================= External Row Write Functions ========================================
// External (DAMA) sources only — internal_table sources continue to use dms.data.create/edit/delete
// (dms.controller.js), which write to DMS's own data_items tables. These functions write directly
// to a source's real Postgres table, independently re-validating metadata.isEditable and a real
// resolvable PRIMARY KEY (see set_primary_col_from_meta.md) on every call — the client's isEditable
// flag is a UX convenience, not a trust boundary.

// Resolves the physical table + editability + real PK for a single view, or throws. Shared by
// create/update/delete below so none of them can run DML against a non-editable or PK-less table.
async function resolveEditableTable(env, view_id) {
  const { isDms, db } = await getEssentials({ env });
  if (isDms) throw new Error('External row writes are only supported for external (DAMA) sources');
  if (db.type !== 'postgres') throw new Error('External row writes are only supported on PostgreSQL sources');

  const { rows } = await db.query(
    `SELECT v.table_schema, v.table_name, s.metadata
     FROM data_manager.views v
     LEFT JOIN data_manager.sources s ON s.source_id = v.source_id
     WHERE v.view_id = $1`,
    [Number(view_id)]
  );
  const view = rows[0];
  if (!view || !view.table_name) throw new Error(`View ${view_id} not found or has no backing table`);

  const metadata = parseIfJSON(view.metadata);
  if (!metadata.isEditable) throw new Error(`Source for view ${view_id} is not editable`);

  const pkCol = await detectRealPrimaryKey(db, view.table_schema, view.table_name);
  if (!pkCol) throw new Error(`View ${view_id}'s table has no resolvable primary key`);

  // Defense in depth: table_schema/table_name/pkCol are interpolated directly into DML
  // below. They come from data_manager.views and a live pg_attribute lookup (not request
  // input), so this should never fail in practice — but refusing anything that isn't a
  // plain identifier costs nothing and closes the case of an unexpectedly-named table/column.
  for (const ident of [view.table_schema, view.table_name, pkCol]) {
    if (!SAFE_IDENTIFIER.test(ident)) throw new Error(`Unsupported identifier: ${ident}`);
  }

  return { db, table_schema: view.table_schema, table_name: view.table_name, columns: metadata.columns || [], pkCol };
}

// Coerce a value for a column of the given bare-Postgres type (metadata.columns[].type, e.g.
// TEXT, INTEGER, NUMERIC, BOOLEAN, TIMESTAMPTZ, JSONB — see dama/CLAUDE.md "metadata.columns
// contract"). Values arrive from a Card/Spreadsheet edit as JS strings/numbers/booleans, so this
// only needs to handle those shapes, not general-purpose type casting.
function coerceColumnValue(value, type) {
  if (value === undefined || value === '' || value === null) return null;
  const t = (type || '').toUpperCase();
  if (['INTEGER', 'BIGINT', 'SMALLINT', 'INT', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'DECIMAL'].includes(t)) {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  if (t === 'BOOLEAN') {
    return typeof value === 'boolean' ? value : ['true', 't', 'yes', 'y', '1'].includes(String(value).toLowerCase());
  }
  if ((t === 'JSONB' || t === 'JSON') && typeof value !== 'string') {
    return JSON.stringify(value);
  }
  return value;
}

// Column names are interpolated (quoted) directly into INSERT/UPDATE SQL text below — they
// can never come from arbitrary request input. Require a plain identifier shape (stricter
// than the generic sanitizeName() used elsewhere in this file, which only blocks a handful
// of SQL keywords and ';') so that even a corrupted/unexpected metadata.columns[].name can't
// break out of the surrounding double-quotes.
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Whitelists the incoming row to known columns (dropping anything not declared on the source —
// e.g. UI-only fields) and coerces each value per its declared type.
function buildRowPayload(row, columns) {
  const byName = new Map(columns.map(c => [c.name, c]).filter(([name]) => SAFE_IDENTIFIER.test(name)));
  const payload = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (!byName.has(key)) continue;
    payload[key] = coerceColumnValue(value, byName.get(key).type);
  }
  return payload;
}

async function createExternalRow(env, view_id, row) {
  const { db, table_schema, table_name, columns, pkCol } = await resolveEditableTable(env, view_id);
  const payload = buildRowPayload(row, columns);

  const cols = Object.keys(payload);
  if (!cols.length) throw new Error('No editable columns in the provided row');

  const colList = cols.map(c => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `INSERT INTO "${table_schema}"."${table_name}" (${colList}) VALUES (${placeholders}) RETURNING *`,
    cols.map(c => payload[c])
  );
  return { ...rows[0], id: rows[0][pkCol] };
}

// Reject a missing/blank id up front with a clear message, rather than letting it reach
// the driver as an ambiguous bound parameter (`WHERE "pk" = $N` with $N unset).
function requireRowId(id) {
  if (id === undefined || id === null || id === '') throw new Error('A row id is required');
}

async function updateExternalRow(env, view_id, id, row) {
  requireRowId(id);
  const { db, table_schema, table_name, columns, pkCol } = await resolveEditableTable(env, view_id);
  const payload = buildRowPayload(row, columns);
  delete payload[pkCol]; // never let a row update overwrite the primary key

  const cols = Object.keys(payload);
  if (!cols.length) throw new Error('No editable columns in the provided row');

  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  const { rows } = await db.query(
    `UPDATE "${table_schema}"."${table_name}" SET ${setClauses} WHERE "${pkCol}" = $${cols.length + 1} RETURNING *`,
    [...cols.map(c => payload[c]), id]
  );
  if (!rows.length) throw new Error(`Row ${id} not found`);
  return { ...rows[0], id: rows[0][pkCol] };
}

async function deleteExternalRow(env, view_id, id) {
  requireRowId(id);
  const { db, table_schema, table_name, pkCol } = await resolveEditableTable(env, view_id);
  const { rowCount } = await db.query(`DELETE FROM "${table_schema}"."${table_name}" WHERE "${pkCol}" = $1`, [id]);
  if (!rowCount) throw new Error(`Row ${id} not found`);
  return { deleted: true, id };
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
  setPrimaryKeyColumn,
  getSourcePrimaryKeyInfo,
  clearViewData,
  createExternalRow,
  updateExternalRow,
  deleteExternalRow,

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
  translatePgToSqlite,
  resolveIdAttribute
};
