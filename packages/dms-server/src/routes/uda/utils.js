const { getDb } = require('#db/index.js');

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
 * "substring(geoid, 1, 2) as state_fips" → "state_fips"
 */
function getResponseColumnName(nameWithAccessors, part = 1) {
  const columnRenameRegex = /\s+as\s+/i;
  if (columnRenameRegex.test(nameWithAccessors)) {
    return nameWithAccessors.split(columnRenameRegex)[part];
  }
  return nameWithAccessors;
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

  // DMS uses the DMS database; DAMA uses the env as pgEnv config name
  const db = getDb(isDms ? (process.env.DMS_DB_ENV || 'dms-sqlite') : env);

  if (isDms) {
    const [app, rawType] = env.split('+');
    const table_schema = db.type === 'postgres' ? 'dms' : 'main';
    const table_name = 'data_items';

    // For DMS, the type may be suffixed with -view_id for versioned data
    let type = rawType;
    let dmsAttributes;

    if (view_id) {
      // Look up the view_id item to check if it's versioned data
      const sanitisedApp = sanitizeName(app);
      const sanitisedType = sanitizeName(rawType.replace(`-${view_id}`, '').replace('-invalid-entry', ''));

      if (sanitisedApp && sanitisedType) {
        const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
        const versionTypeRows = await db.query(
          `SELECT type AS version_type FROM ${tbl} WHERE app = $1 AND id = $2`,
          [sanitisedApp, view_id]
        );
        const version_type = versionTypeRows?.rows?.[0]?.version_type;

        if (version_type && version_type.includes('|')) {
          // Versioned data: type contains pipes like "dataset|sourceId|viewId"
          // Suffix the query type with view_id to match versioned items
          if (!type.endsWith(`-${view_id}`) && !type.endsWith(`${view_id}-invalid-entry`)) {
            type = type.endsWith('-invalid-entry') && !type.includes(view_id)
              ? type.replace('-invalid-entry', `${view_id}-invalid-entry`)
              : `${type}-${view_id}`;
          }

          const sourceVersionType = version_type.split('|').slice(0, 2).join('|');
          const configRows = await db.query(
            `SELECT data->>'config' AS config FROM ${tbl} WHERE app = $1 AND type = $2 AND data->>'doc_type' = $3`,
            [sanitisedApp, sourceVersionType, sanitisedType]
          );
          dmsAttributes = JSON.parse(configRows?.rows?.[0]?.config || '{}')?.attributes || [];
        }
      }
    }

    return { isDms, db, app, type, table_schema, table_name, dmsAttributes };
  }

  // DAMA mode
  const { table_schema, table_name } = await getDataTableFromViewId({ db, view_id });
  return { isDms, db, app: null, type: null, table_schema, table_name, dmsAttributes: undefined };
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
 * Get pattern IDs for a DMS site (items with type='pattern' for the given app)
 */
async function getSitePatterns({ db, app }) {
  const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const sql = `SELECT id FROM ${tbl} WHERE app = $1 AND type = 'pattern'`;
  const { rows } = await db.query(sql, [app]);
  return rows.map(r => r.id);
}

/**
 * Get sources from site patterns. Looks at patterns matching doc_types and extracts their sources JSON array.
 */
async function getSiteSources({ db, pattern_ids, pattern_doc_types }) {
  if (!pattern_ids.length) return [];

  const tbl = db.type === 'postgres' ? 'dms.data_items' : 'data_items';
  const sql = `
    SELECT data->'sources' AS sources
    FROM ${tbl}
    WHERE id = ANY($1) AND data->>'doc_type' = ANY($2)
  `;
  const { rows } = await db.query(sql, [pattern_ids.map(Number), pattern_doc_types]);

  if (!rows.length) return [];
  return rows.reduce((acc, curr) => {
    // SQLite data->'sources' returns a JSON string; PostgreSQL returns a parsed array
    const sources = typeof curr.sources === 'string' ? JSON.parse(curr.sources) : (curr.sources || []);
    return [...acc, ...sources];
  }, []);
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
    id_vals && conditions.push(`lower(${id_col}) ${typeMap[type].symbol} lower(${index})`);
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
  return [Array.isArray(node.value)
    ? node.value.filter(v => !['null', 'not null'].includes(v))
    : ['null', 'not null'].includes(node.value) ? [] : [node.value]];
}

function buildLeafSQL(node, ctx, isDms) {
  const { col, op, value } = node;
  const vals = Array.isArray(value) ? value : [value];
  const index = vals.some(v => !['null', 'not null'].includes(v))
    ? `$${++ctx.index}`
    : `$${ctx.index}`;
  return handleFiltersType(col, vals, index, op, isDms);
}

function buildGroupSQL(node, ctx, isDms) {
  const clauses = node.groups
    .map(child => child.groups ? buildGroupSQL(child, ctx, isDms) : buildLeafSQL(child, ctx, isDms))
    .filter(Boolean);
  if (!clauses.length) return '';
  return `(${clauses.join(` ${node.op.toLowerCase()} `)})`;
}

function handleFilterGroups({ filterGroups, isDms, startIndex = 0 }) {
  if (!filterGroups || !filterGroups.groups?.length) return { sql: '', values: [] };
  const ctx = { index: startIndex, values: [] };
  const sql = buildGroupSQL(filterGroups, ctx, isDms);
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
function buildCombinedWhere({ filter, exclude, gt, gte, lt, lte, like, filterRelation, filterGroups, isDms, app, type, oldValues }) {
  const oldWhere = handleFilters({ filter, exclude, gt, gte, lt, lte, like, filterRelation, isDms, app, type });
  const { sql: newWhere } = handleFilterGroups({ filterGroups, isDms, startIndex: oldValues.length });

  if (oldWhere && newWhere) {
    return `WHERE (${oldWhere.replace(/^WHERE\s*/, '')}) ${filterRelation} ${newWhere}`;
  }
  return oldWhere || (newWhere ? `WHERE ${newWhere}` : '');
}

module.exports = {
  sanitizeName,
  getResponseColumnName,
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
  buildCombinedWhere
};
