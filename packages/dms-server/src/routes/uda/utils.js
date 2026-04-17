const { getDb, getChDb } = require('#db/index.js');
const { loadConfig } = require('#db/config.js');
const { resolveTable, parseType, isSplitType, ensureSequence, ensureTable, getSequenceName } = require('#db/table-resolver.js');
const { parseSplitDataType, getKind } = require('#db/type-utils.js');

/**
 * Resolve the fully-qualified main table name for DMS content (non-split items).
 * In legacy mode → data_items; in per-app mode → data_items__{app}.
 * Ensures the table and sequence exist in per-app mode.
 */
async function dmsMainTable(db, app, splitMode) {
  splitMode = splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
  const { fullName, schema, table } = resolveTable(app, 'pattern', db.type, splitMode);
  // ensureTable() no-ops for the shared dms.data_items (legacy mode)
  await ensureSequence(db, app, db.type, splitMode);
  await ensureTable(db, schema, table, db.type, getSequenceName(app, db.type, splitMode));
  return fullName;
}

// ================================================= SQL Sanitization ================================================

const disallowedKeywords = ['select', 'create', 'drop', 'update', 'delete', 'insert', 'alter', 'exec', 'union', 'cast'];
const disallowedSymbols = [';'];

/**
 * Sanitize column/table names to prevent SQL injection.
 * Returns the trimmed name if safe, false if unsafe.
 * For arrays, filters out unsafe names.
 */
function sanitizeName(name) {
  const isValid = (n) => {
    if (typeof n !== 'string') return false;
    const trimmed = n.trim();
    if (disallowedKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(trimmed))) return false;
    if (disallowedSymbols.some(sym => trimmed.includes(sym))) return false;
    return trimmed;
  };

  if (Array.isArray(name)) return name.filter(isValid);
  return isValid(name);
}

// ============================================= Column Name Helpers ================================================

/**
 * Extract the response column name from a SQL expression.
 * "geoid" → "geoid"
 * "data->>'title' as title" → "title"
 * "data->>'2_col' as \"2_col\"" → "2_col"
 * "substring(geoid, 1, 2) as state_fips" → "state_fips"
 * "ds.geoid" → "geoid" 
 */
function getResponseColumnName(nameWithAccessors, part = 1) {
  const columnRenameRegex = /\s+as\s+/i;
  if (columnRenameRegex.test(nameWithAccessors)) {
    const name = nameWithAccessors.split(columnRenameRegex)[part];
    // Strip double quotes added by quoteAlias for digit-prefixed identifiers
    return name ? name.replace(/^"|"$/g, '') : name;
  }
  return nameWithAccessors.split(".").pop();
}
/**
 * Quote a SQL alias if it starts with a digit (invalid as an unquoted identifier in SQLite).
 * Handles both bare names ("2_col" → "\"2_col\"") and full expressions
 * ("data->>'x' as 2_col" → "data->>'x' as \"2_col\"").
 */
function quoteAlias(nameOrExpr) {
  const asMatch = nameOrExpr.match(/^(.+\s+as\s+)(\S+)$/i);
  if (asMatch) {
    const [, prefix, alias] = asMatch;
    return /^\d/.test(alias) ? `${prefix}"${alias}"` : nameOrExpr;
  }
  return /^\d/.test(nameOrExpr) ? `"${nameOrExpr}"` : nameOrExpr;
}

// ============================================= Environment Detection ===============================================

/**
 * Resolve the database, table, and mode for a given env + view_id.
 *
 * DMS mode: env contains "+" (e.g. "myapp+page") → queries dms.data_items
 * DAMA mode: env is a pgEnv config name → queries data_manager.sources/views
 *
 * Returns { isDms, db, app, type, table_schema, table_name, dmsAttributes }
 */
async function getEssentials({ env, view_id, options = {} }) {
  const parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
  const isDms = env.includes('+') && !parsedOptions.isDama;
  const {join} = parsedOptions;

  // DMS uses the DMS database; DAMA uses the env as pgEnv config name
  const dbEnv = isDms ? (process.env.DMS_DB_ENV || 'dms-sqlite') : env;
  let db = getDb(dbEnv);

  if (isDms) {
    const config = loadConfig(dbEnv);
    const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
    const [app, rawType] = env.split('+');

    // For DMS, the type may be suffixed with -view_id for versioned data
    let type = rawType;
    let dmsAttributes;

    // Resolve the main table for DMS content lookups (patterns, sources, views)
    const mainTbl = await dmsMainTable(db, app, splitMode);

    if (view_id) {
      // Look up the view_id item to check if it's versioned data
      const sanitisedApp = sanitizeName(app);

      if (sanitisedApp) {
        const versionTypeRows = await db.query(
          `SELECT type AS version_type FROM ${mainTbl} WHERE app = $1 AND id = $2`,
          [sanitisedApp, view_id]
        );
        const version_type = versionTypeRows?.rows?.[0]?.version_type;

        if (version_type && version_type.includes('|')) {
          if (getKind(version_type) === 'view') {
            // New format: view type is '{sourceSlug}|v1:view'
            // The client sends env as 'app+sourceSlug', so rawType IS the source slug.
            // Construct data type as '{sourceSlug}|{view_id}:data'
            const isInvalid = type.endsWith('-invalid-entry');
            const baseType = isInvalid ? type.replace('-invalid-entry', '') : type;
            type = isInvalid
              ? `${baseType}|${view_id}:data-invalid-entry`
              : `${baseType}|${view_id}:data`;

            // Look up source config by source slug in type column
            const configRows = await db.query(
              `SELECT data->>'config' AS config FROM ${mainTbl} WHERE app = $1 AND type LIKE '%|' || $2 || ':source' ORDER BY id DESC LIMIT 1`,
              [sanitisedApp, rawType]
            );
            dmsAttributes = JSON.parse(configRows?.rows?.[0]?.config || '{}')?.attributes || [];
          } else {
            // Legacy format: view type has pipes but no :view kind
            const sanitisedType = sanitizeName(rawType.replace(`-${view_id}`, '').replace('-invalid-entry', ''));
            if (sanitisedType) {
              if (!type.endsWith(`-${view_id}`) && !type.endsWith(`${view_id}-invalid-entry`)) {
                type = type.endsWith('-invalid-entry') && !type.includes(view_id)
                  ? type.replace('-invalid-entry', `${view_id}-invalid-entry`)
                  : `${type}-${view_id}`;
              }

              const sourceVersionType = version_type.split('|').slice(0, 2).join('|');
              const configRows = await db.query(
                `SELECT data->>'config' AS config FROM ${mainTbl} WHERE app = $1 AND type = $2 AND data->>'doc_type' = $3`,
                [sanitisedApp, sourceVersionType, sanitisedType]
              );
              dmsAttributes = JSON.parse(configRows?.rows?.[0]?.config || '{}')?.attributes || [];
            }
          }
        }
      }
    }

    // Normalize split type to lowercase — stored data uses lowercase type strings
    // but the client may send mixed case from doc_type (e.g., 'Actions_Revised-1074456')
    if (isSplitType(type)) {
      type = type.toLowerCase();
    }

    // Look up source_id for split type naming
    let sourceId = null;
    if (isSplitType(type)) {
      // New format: {source}|{view}:data — look up source by instance name in type column
      const newParsed = parseSplitDataType(type);
      if (newParsed) {
        const srcRows = await db.query(
          `SELECT id FROM ${mainTbl} WHERE app = $1 AND type LIKE '%|' || $2 || ':source' ORDER BY id DESC LIMIT 1`,
          [app, newParsed.source]
        );
        sourceId = srcRows?.rows?.[0]?.id || null;
      } else {
        // Legacy format: {docType}-{viewId} — look up source by data.doc_type
        const parsed = parseType(type);
        if (parsed && parsed.docType) {
          const srcRows = await db.query(
            `SELECT id FROM ${mainTbl} WHERE app = $1 AND lower(${db.type === 'postgres' ? "data->>'doc_type'" : "json_extract(data, '$.doc_type')"}) = lower($2) AND (type LIKE '%|source' OR type LIKE '%:source') ORDER BY id DESC LIMIT 1`,
            [app, parsed.docType]
          );
          sourceId = srcRows?.rows?.[0]?.id || null;
        }
      }
    }

    // Resolve the correct table for this (app, type) pair
    const { schema: table_schema, table: table_name } = resolveTable(app, type, db.type, splitMode, sourceId);

    // Ensure split tables exist (no-op for data_items)
    if (table_name !== 'data_items') {
      const seqName = getSequenceName(app, db.type, splitMode);
      await ensureSequence(db, app, db.type, splitMode);
      await ensureTable(db, table_schema, table_name, db.type, seqName);
    }
    // DMS content never lives on ClickHouse — dbType is always pg for DMS mode.
    return { isDms, db, app, type, table_schema, table_name, dmsAttributes, splitMode, dbType: 'pg' };
  }

  // DAMA mode — view may point at a ClickHouse-backed table via a
  // `clickhouse.<schema>` prefix in data_manager.views.table_schema. When it
  // does, swap in the CH adapter and strip the prefix before returning.
  let { table_schema, table_name } = await getDataTableFromViewId({ db, view_id });
  let dbType = 'pg';
  if (typeof table_schema === 'string' && table_schema.startsWith('clickhouse.')) {
    dbType = 'ch';
    table_schema = table_schema.replace(/^clickhouse\./, '');
    db = getChDb(env);
  }
  let joinTable = table_name;
  if(join && join.sources.ds) {
    console.log("join sources::", join.sources)
    joinTable += " ds"
  }
  return { isDms, db, app: null, type: null, table_schema, table_name: joinTable, dmsAttributes: undefined,dbType };
}

/**
 * Look up a view's data table from data_manager.views
 */
async function getDataTableFromViewId({ db, view_id }) {
  if (!view_id) return {};

  const tbl = db.type === 'postgres' ? 'data_manager.views' : 'views';
  const sql = `SELECT source_id, view_id, table_schema, table_name FROM ${tbl} WHERE view_id = $1`;
  const { rows } = await db.query(sql, [+view_id]);

  if (!rows.length) return {};
  return { table_schema: rows[0].table_schema, table_name: rows[0].table_name };
}

// ============================================= DMS Source/View Helpers =============================================

/**
 * Get pattern IDs for a DMS site.
 *
 * Patterns use the post-refactor type scheme `{site}|{instance}:pattern`.
 * The env's right half is the pattern instance name (e.g., env `myapp+my_docs`
 * targets the pattern whose instance is `my_docs`). Matching the exact
 * instance segment in the type column avoids the substring false positives
 * that came from the old `type LIKE '%<instance>%'` shape and the reliance
 * on `data.doc_type` that was dropped in the type-system refactor.
 */
async function getSitePatterns({ db, app, env, splitMode }) {
  const tbl = await dmsMainTable(db, app, splitMode);
  const instance = env.includes('+') ? env.split('+')[1] : null;

  const sql = instance
    ? `SELECT id FROM ${tbl} WHERE app = $1 AND type LIKE '%|' || $2 || ':pattern'`
    : `SELECT id FROM ${tbl} WHERE app = $1 AND type LIKE '%:pattern'`;
  const params = instance ? [app, instance] : [app];
  const { rows } = await db.query(sql, params);
  return rows.map(r => r.id);
}

/**
 * Get sources referenced by the given pattern IDs. Reads each pattern's
 * `data.sources` array (dmsEnv-less patterns) or follows `data.dmsEnvId`
 * to pull sources from the linked dmsEnv row. Pattern IDs are already
 * filtered by `getSitePatterns`, so no further type-column filtering is
 * needed here — and `data.doc_type` has been removed from all new pattern
 * rows by the type-system refactor.
 */
async function getSiteSources({ db, app, pattern_ids, splitMode }) {
  if (!pattern_ids.length) return [];

  const tbl = await dmsMainTable(db, app, splitMode);
  const sql = `
    SELECT data->'sources' AS sources, data->>'dmsEnvId' AS dms_env_id
    FROM ${tbl}
    WHERE id = ANY($1)
  `;
  const { rows } = await db.query(sql, [pattern_ids.map(Number)]);

  if (!rows.length) return [];

  // Collect sources from patterns, and dmsEnvIds to look up
  const allSources = [];
  const dmsEnvIds = [];

  for (const row of rows) {
    if (row.dms_env_id) {
      dmsEnvIds.push(+row.dms_env_id);
    } else {
      const sources = typeof row.sources === 'string' ? JSON.parse(row.sources) : (row.sources || []);
      allSources.push(...sources);
    }
  }

  // Fetch sources from dmsEnv rows
  if (dmsEnvIds.length) {
    const envSql = `SELECT data->'sources' AS sources FROM ${tbl} WHERE id = ANY($1)`;
    const { rows: envRows } = await db.query(envSql, [dmsEnvIds]);
    for (const envRow of envRows) {
      const sources = typeof envRow.sources === 'string' ? JSON.parse(envRow.sources) : (envRow.sources || []);
      allSources.push(...sources);
    }
  }

  return allSources;
}

// ================================================= Filter Builders ================================================

/**
 * Build a WHERE clause condition for a single filter type.
 * Uses PostgreSQL ANY($N) syntax — DAMA targets are always PostgreSQL.
 * For DMS mode (which could be SQLite), use buildArrayComparison from query-utils instead.
 */
function handleFiltersType(id_col, id_vals, index, type, isDms) {
  const typeMap = {
    filter:  { null: 'IS', symbol: '=' },
    exclude: { array: 'NOT', null: 'IS NOT', symbol: '=' },
    gt:  { symbol: '>' },
    gte: { symbol: '>=' },
    lt:  { symbol: '<' },
    lte: { symbol: '<=' },
    like: { symbol: 'LIKE' }
  };

  const conditions = [];

  if (['filter'].includes(type)) {
    const arrayVals = id_vals.filter(v => !['null', 'not null'].includes(v));
    const nullVals = id_vals.find(v => ['null', 'not null'].includes(v));

    if (arrayVals.length && nullVals) {
      conditions.push(`(${typeMap[type].array || ''} ${id_col} ${typeMap[type].symbol} ANY(${index}) OR ${id_col} ${typeMap[type].null} ${nullVals})`);
    } else {
      arrayVals.length && conditions.push(`${typeMap[type].array || ''} ${id_col} ${typeMap[type].symbol} ANY(${index})`);
      nullVals && conditions.push(`${id_col} ${typeMap[type].null} ${nullVals}`);
    }
  } else if (['exclude'].includes(type)) {
    const arrayVals = id_vals.filter(v => !['null', 'not null'].includes(v));
    const nullVals = id_vals.find(v => ['null', 'not null'].includes(v));

    const array_cdn = `${typeMap[type].array || ''} (CASE WHEN ${id_col} IS NULL THEN 'null' ELSE ${id_col} END) ${typeMap[type].symbol} ANY(${index})`;
    const null_cdn = `${id_col} ${typeMap[type].null} ${nullVals}`;
    if (arrayVals.length && nullVals) {
      conditions.push(`(${array_cdn} OR ${null_cdn})`);
    } else {
      arrayVals.length && conditions.push(array_cdn);
      nullVals && conditions.push(null_cdn);
    }
  } else if (type === 'like') {
    id_vals && conditions.push(`lower((${id_col})::text) ${typeMap[type].symbol} lower(${index})`);
  } else {
    // gt, gte, lt, lte: for DMS, numbers stored as text need cast
    const col = isDms ? `(${id_col})::numeric` : id_col;
    id_vals && conditions.push(`${col} ${typeMap[type].symbol} ${index}`);
  }

  return conditions.join(' and ');
}

/**
 * Get values to pass to SQL, excluding 'null' and 'not null' sentinel strings.
 */
function getValuesExceptNulls(conditions) {
  return Object.values(conditions)
    .map(v => Array.isArray(v)
      ? v.filter(v1 => !['null', 'not null'].includes(v1))
      : (['null', 'not null'].includes(v) ? null : v))
    .filter(v => Array.isArray(v) ? v.length : v);
}

/**
 * Build WHERE clause from simple filter options.
 * Returns a string like "WHERE app = ANY($1) AND ..." or empty string.
 */
function handleFilters({ filter, exclude, gt, gte, lt, lte, like, filterRelation = 'and', isDms, app, type }) {
  let i = 0;
  const isNull = (val) =>
    Array.isArray(val)
      ? !val.filter(v1 => !['null', 'not null'].includes(v1)).length
      : ['null', 'not null'].includes(val);

  const mapConditions = (conditions, filterType) => {
    return Object.keys(conditions).map((id_col) => {
      i = isNull(conditions[id_col]) ? i : ++i;
      return handleFiltersType(id_col, conditions[id_col], `$${i}`, filterType, isDms);
    }).filter(Boolean);
  };

  const dmsAppTypeClause = isDms ? mapConditions({ app: [app], type: [type] }, 'filter') : [];
  const clauses = [
    ...mapConditions(filter, 'filter'),
    ...mapConditions(exclude, 'exclude'),
    ...mapConditions(gt, 'gt'),
    ...mapConditions(gte, 'gte'),
    ...mapConditions(lt, 'lt'),
    ...mapConditions(lte, 'lte'),
    ...mapConditions(like, 'like'),
  ];

  if (!clauses.length && !dmsAppTypeClause.length) return '';

  return `WHERE ${dmsAppTypeClause.length ? ` ${dmsAppTypeClause.join(' and ')}` : ''}
    ${dmsAppTypeClause.length && clauses.length ? 'and' : ''} ${clauses.length ? `(${clauses.join(` ${sanitizeName(filterRelation) || 'and'} `)})` : ''}`;
}

// ============================================= Complex Filter Groups ==============================================

function getValuesFromGroup(node) {
  if (!node) return [];
  if (node.groups) return node.groups.flatMap(getValuesFromGroup);
  if (!node.value) return [];
  if (Array.isArray(node.value)) {
    const filtered = node.value.filter(v => !['null', 'not null'].includes(v));
    return filtered.length ? [filtered] : [];
  }
  if (['null', 'not null'].includes(node.value)) return [];
  // Comparison ops (gt, gte, lt, lte, like) expect scalar values;
  // filter/exclude use = ANY($N) which expects an array.
  if (['gt', 'gte', 'lt', 'lte', 'like'].includes(node.op)) {
    return [node.value];
  }
  return [[node.value]];
}

function buildLeafSQL(node, ctx, isDms, dbType) {
  const { col, op, value, isExternal } = node;
  // External filters are already applied via old-style filter/like/etc. objects —
  // they exist in filterGroups only for UI tracking, not SQL generation.
  // Also skip nodes with no value (would generate a placeholder with no matching param).
  if (value == null) return '';

  // array_contains / array_not_contains: check if a JSON array column contains (or doesn't contain) any of the given values
  if (op === 'array_contains' || op === 'array_not_contains') {
    const vals = Array.isArray(value) ? value : [value];
    if (!vals.length) return '';
    const index = `$${++ctx.index}`;
    const not = op === 'array_not_contains' ? 'NOT ' : '';
    if (dbType === 'sqlite') {
      // json_each returns rows with a .value column
      return `${not}EXISTS (SELECT 1 FROM json_each(${col}) _ac WHERE _ac.value = ANY(${index}))`;
    }
    // PostgreSQL: use jsonb_typeof to branch on whether the value is a JSON array.
    // If it is, unnest with jsonb_array_elements_text; if not, wrap the scalar in a
    // single-element array first so the same EXISTS pattern works for both cases.
    return `${not}EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof((${col})::jsonb) = 'array' THEN (${col})::jsonb ELSE jsonb_build_array((${col})::text) END) _ac WHERE _ac = ANY(${index}))`;
  }

  const vals = Array.isArray(value) ? value : [value];
  const index = vals.some(v => !['null', 'not null'].includes(v))
    ? `$${++ctx.index}`
    : `$${ctx.index}`;
  return handleFiltersType(col, vals, index, op, isDms);
}

function buildGroupSQL(node, ctx, isDms, dbType) {
  const clauses = node.groups
    .map(child => child.groups ? buildGroupSQL(child, ctx, isDms, dbType) : buildLeafSQL(child, ctx, isDms, dbType))
    .filter(Boolean);
  if (!clauses.length) return '';
  return `(${clauses.join(` ${node.op.toLowerCase()} `)})`;
}

function handleFilterGroups({ filterGroups, isDms, startIndex = 0, dbType }) {
  if (!filterGroups || !filterGroups.groups?.length) return { sql: '', values: [] };
  const ctx = { index: startIndex, values: [] };
  const sql = buildGroupSQL(filterGroups, ctx, isDms, dbType);
  return { sql, values: ctx.values };
}

// ============================================= Aggregation Helpers ================================================

function handleGroupBy(groups) {
  const sanitized = sanitizeName(groups).filter(f => f);
  return sanitized.length ? `GROUP BY ${sanitized.join(', ')}` : '';
}

function handleHaving(clauses) {
  const sanitized = sanitizeName(clauses).filter(f => f);
  return sanitized.length ? `HAVING ${sanitized.map(c => `(${c})`).join(' and ')}` : '';
}

function handleOrderBy(orders, dmsAttributes) {
  const sanitized = Object.keys(orders).filter(col => sanitizeName(col) && sanitizeName(orders[col]));
  const orderMap = sanitized.map(col => {
    let dataType;
    if (dmsAttributes && Array.isArray(dmsAttributes)) {
      const match = dmsAttributes.find(attr => `'${attr.name}'` === col.replace('data->>', '')) || {};
      dataType = match?.dataType;
    }
    return dataType
      ? `(${getResponseColumnName(col)})::${dataType} ${orders[col]}`
      : `${getResponseColumnName(col)} ${orders[col]}`;
  });
  return sanitized.length ? `ORDER BY ${orderMap.join(', ')}` : '';
}

// ============================================= Combined WHERE Builder =============================================

/**
 * Build a combined WHERE clause from both old-style simple filters and new-style filterGroups.
 */
function buildCombinedWhere({ filter, exclude, gt, gte, lt, lte, like, filterRelation, filterGroups, isDms, app, type, oldValues, dbType }) {
  const oldWhere = handleFilters({ filter, exclude, gt, gte, lt, lte, like, filterRelation, isDms, app, type });
  const { sql: newWhere } = handleFilterGroups({ filterGroups, isDms, startIndex: oldValues.length, dbType });

  if (oldWhere && newWhere) {
    return `WHERE (${oldWhere.replace(/^WHERE\s*/, '')}) ${filterRelation} ${newWhere}`;
  }
  return oldWhere || (newWhere ? `WHERE ${newWhere}` : '');
}



const buildJoin = async ({join, env}) => {
  console.log("build join, join::", join)
  //RYAN TODO -- better join conditional. If initial state gets changed to `null`, this is much cleaner
  const isJoinPresent =
    (!!join && Object.keys(join.sources || {}).length > 1) ||
    (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== "ds");

  if(!isJoinPresent) return '';

  const allOnClause = []
  for(let i=0; i< join.on.length; i++) {
    const singleJoinOnConfig = join.on[i];

    const joinType = singleJoinOnConfig.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';

    const {view_id, env} = join.sources[singleJoinOnConfig.table];

    const {table_schema, table_name} = await getEssentials({view_id, env})
    console.log({table_schema, table_name})
    allOnClause.push(`${joinType} ${table_schema}.${table_name} as ${singleJoinOnConfig.table} ON ${singleJoinOnConfig.on}`);
  }


  join.on.map(singleJoinConfig => {

  })


  return allOnClause.join('\n')
}


module.exports = {
  sanitizeName,
  getResponseColumnName,
  quoteAlias,
  dmsMainTable,
  getEssentials,
  getDataTableFromViewId,
  getSitePatterns,
  getSiteSources,
  getValuesExceptNulls,
  getValuesFromGroup,
  handleFilters,
  handleFilterGroups,
  handleGroupBy,
  handleHaving,
  handleOrderBy,
  buildCombinedWhere,
  buildJoin
};
