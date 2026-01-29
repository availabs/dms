const { getDb } = require('#db/index.js')
const get = require("lodash/get")
const {handleFilters, handleGroupBy, handleOrderBy, getValuesExceptNulls, extent} = require("./utils");
const {
  buildArrayComparison,
  jsonExtract,
  typeCast,
  jsonMerge,
  currentTimestamp
} = require('#db/query-utils.js');

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
 * @returns {Object} Controller with all DMS operations
 */
function createController(dbName = 'dms-sqlite') {
  const dms_db = getDb(dbName);
  const dbType = dms_db.type;

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

  return {
    // Expose for testing/inspection
    dbType,
    dbName,

    DATA_ATTRIBUTES,

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
      const sql = `
        SELECT app || '+' || type AS key,
          COUNT(1) AS length
        FROM ${tableName('data_items')}
        WHERE app = $1
        AND type = $2
        GROUP BY 1
      `;
      const promises = appKeys.map(k =>
        dms_db.promise(sql, k.split("+"))
      )
      return Promise.all(promises)
        .then(data => [].concat(...data))
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

      const promises = []
      appKeys.forEach(key => {
        searchkeys.forEach(searchkey => {
          const searchkeyJSON = JSON.parse(searchkey) || null
          const wildKey = castForSqlite(searchkeyJSON.wildKey);
          const defaultSearch = searchkeyJSON.defaultSearch
            ? castForSqlite(searchkeyJSON.defaultSearch)
            : null;

          let sql = `
            SELECT id
            FROM ${tableName('data_items')}
            WHERE app = $1
            AND type = $2
            AND ${wildKey} = $3
            ${defaultSearch ?
              `UNION ALL
              SELECT id
              FROM ${tableName('data_items')}
              WHERE app = $4
              AND type = $5
              AND ${defaultSearch}`
            : ''}
            LIMIT 1
          `
          promises.push(
            dms_db
              .promise(sql,[...key.split("+"),searchkeyJSON.params,...key.split("+")])
              .then(rows => ({
                  key: `${key}|${searchkey}`,
                  rows: rows.map(({id}) => id)
                })
              )
          )
        })
      })
      return Promise.all(promises)
    },

    dataByIndex: (appKeys, indices) => {
      const [min, max] = extent(indices),
        length = (max - min) + 1;

      const sql = `
        SELECT id
        FROM ${tableName('data_items')}
        WHERE app = $1
        AND type = $2
        LIMIT ${ length }
        OFFSET ${ min }
      `
      const promises = appKeys.map(key =>
        dms_db.promise(sql, key.split("+"))
          .then(rows => ({
            key,
            rows: rows.map(({ id }, i) => ({ i: i + min, id }))
          }))
      )
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

      const sql =
        aggregatedLen ? `
          with t as (SELECT app || '+' || type AS key, COUNT(1) AS length
          FROM ${tableName('data_items')}
              ${ filterSql }
              ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
              AND type = $${values.length + 2}
          ${ handleGroupBy([1, ...groupBy]) })

          select key, count(1) as length
          from t
          group by 1
  ` : `
          SELECT app || '+' || type AS key, COUNT(1) AS length
          FROM ${tableName('data_items')}
              ${ filterSql }
              ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
              AND type = $${values.length + 2}
          ${ handleGroupBy([1, ...groupBy]) }
      `;

      const promises = appKeys.map(k => {
        return dms_db.promise(sql, [...values, ...k.split("+")])
      })
      return Promise.all(promises)
        .then(data => [].concat(...data))
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

      const sql = `
        with t as (
        SELECT ${attributes.join(', ')},
               ${sortColExpr}
        FROM ${tableName('data_items')}
          ${ filterSql }
          ${filterSql.length ? 'AND' : 'WHERE'} app = $${values.length + 1}
          AND type = $${values.length + 2}
        ${ handleGroupBy(groupBy) }
        ${ orderCol ? handleOrderBy(orderBy) : ``}
        LIMIT ${ length }
        OFFSET ${ min })

        SELECT * FROM t ORDER BY sortcol ${order};
      `;

      const promises = appKeys.map(key =>
        dms_db.promise(sql, [...values, ...key.split("+")])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i: i + min, ...r }))
          }))
      )

      return Promise.all(promises)
    },

    searchByTag: (appKeys, tag, searchType='byTag') => {
      // Build JSON array elements expression based on database type
      const jsonArrayExpr = dbType === 'postgres'
        ? `jsonb_array_elements(data->'sections')->>'id'`
        : `json_extract(je.value, '$.id')`;

      const jsonArrayFrom = dbType === 'postgres'
        ? ''
        : `, json_each(data, '$.sections') as je`;

      const sql = searchType === 'byTag' ? `
        with t as (
          SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title,
            ${jsonArrayExpr} section_id
          FROM ${tableName('data_items')} di${jsonArrayFrom}
          WHERE app = $2
          AND type = $3
        )

        select t.*, ${jsonField('data', 'title')} section_title, ${jsonField('data', 'tags')} tags
        FROM t
        JOIN ${tableName('data_items')} di
        ON ${typeCast('id', 'TEXT', dbType)} = t.section_id
        WHERE lower(${jsonField('data', 'tags')}) like '%' || lower($1) || '%'
           OR lower(${jsonField('data', 'title')}) like '%' || lower($1) || '%'
           OR lower(t.page_title) like '%' || lower($1) || '%'
        order by page_id, t.section_id
      ` :
      `SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title
        FROM ${tableName('data_items')} di
        WHERE app = $2
        AND type = $3
        AND lower(${jsonField('data', 'title')}) like '%' || lower($1) || '%'`;

      const promises = appKeys.map(key =>
        dms_db.promise(sql, [tag, ...key.split("+")])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i, ...r }))
          }))
      )

      return Promise.all(promises)
    },

    getTags: (appKeys, type) => {
      // Build JSON array elements expression based on database type
      const jsonArrayExpr = dbType === 'postgres'
        ? `jsonb_array_elements(data->'sections')->>'id'`
        : `json_extract(je.value, '$.id')`;

      const jsonArrayFrom = dbType === 'postgres'
        ? ''
        : `, json_each(data, '$.sections') as je`;

      const sql = type === 'tags' ? `
        with t as (
          SELECT di.id page_id, di.type, ${jsonField('di.data', 'url_slug')} url_slug, ${jsonField('di.data', 'title')} page_title,
            ${jsonArrayExpr} section_id
          FROM ${tableName('data_items')} di${jsonArrayFrom}
          WHERE app = $1
          AND type = $2
        )

        select DISTINCT ${jsonField('data', 'tags')} tags
        FROM ${tableName('data_items')} di
        JOIN t
        ON ${typeCast('id', 'TEXT', dbType)} = t.section_id
        WHERE ${jsonField('data', 'tags')} IS NOT NULL AND ${jsonField('data', 'tags')} != '';
      ` :
      `SELECT distinct ${jsonField('data', 'title')} page_title
        FROM ${tableName('data_items')}
        WHERE app = $1
        AND type = $2`;

      const promises = appKeys.map(key =>
        dms_db.promise(sql, key.split("+"))
          .then(rows => ({
            key,
            rows
          }))
      )

      return Promise.all(promises)
    },

    getSections: (appKeys) => {
      // Build JSON array elements expression based on database type
      const jsonArrayExpr = dbType === 'postgres'
        ? `(jsonb_array_elements(data->'draft_sections')->>'id')::INTEGER`
        : `CAST(json_extract(je.value, '$.id') AS INTEGER)`;

      const jsonArrayFrom = dbType === 'postgres'
        ? ''
        : `, json_each(data, '$.draft_sections') as je`;

      // Build element-type JSON expression
      const elementTypeExpr = dbType === 'postgres'
        ? `data->'element'->'element-type'`
        : `json_extract(data, '$.element.element-type')`;

      // Build attribution CASE expression
      const attributionExpr = dbType === 'postgres'
        ? `CASE WHEN ${jsonField('data', 'element.element-type')} = 'lexical' THEN null ELSE ((${jsonField('data', 'element.element-data')})::JSON)->'attributionData' END`
        : `CASE WHEN json_extract(data, '$.element.element-type') = 'lexical' THEN null ELSE json_extract(json_extract(data, '$.element.element-data'), '$.attributionData') END`;

      const sql = `WITH t AS (
        SELECT app, type,
          id page_id,
          ${jsonField('data', 'url_slug')} url_slug,
          ${jsonField('data', 'title')} page_title,
          ${jsonField('data', 'index')} page_index,
          ${jsonField('data', 'parent')} page_parent,
          ${jsonArrayExpr} section_id
        FROM ${tableName('data_items')}${jsonArrayFrom}
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
      JOIN ${tableName('data_items')} di
      ON id = t.section_id
      ORDER BY page_id, t.section_id
      `;

      const promises = appKeys.map(key =>
        dms_db.promise(sql, [...key.split("+")])
          .then(rows => ({
            key,
            rows: rows.map((r, i) => ({ i, ...r }))
          }))
      )

      return Promise.all(promises)
    },

    getDataById: (ids, attributes=["id", "data", "updated_at", "created_at"]) => {
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
        FROM ${tableName('data_items')}
        WHERE ${arrayResult.sql}
      `
      return dms_db.promise(sql, arrayResult.values);
    },

    setDataById: (id, data, user) => {
      const sql = `
        UPDATE ${tableName('data_items')}
        SET data = ${jsonMerge('data', '$1', dbType)},
          updated_at = ${now()},
          updated_by = $2
        WHERE id = $3
        RETURNING id, app, type, data,
          ${typeCast('created_at', 'TEXT', dbType)}, created_by,
          ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
      `
      return dms_db.promise(sql, [data, get(user, "id", null), id]);
    },

    setMassData: (app, type, column, maps, user) => {
      const sanitizedName = sanitizeName(column);
      if(!sanitizedName) return;

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
            UPDATE ${tableName('data_items')}
            SET data = ${jsonMerge('data', `'${stringValidValue}'`, dbType)},
                updated_at = ${now()},
                updated_by = '${user}'
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

    setTypeById: (id, type, user) => {
      const sql = `
        UPDATE ${tableName('data_items')}
        SET type = $1,
          updated_at = ${now()},
          updated_by = $2
        WHERE id = $3
        RETURNING id, app, type, data,
          ${typeCast('created_at', 'TEXT', dbType)}, created_by,
          ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
      `
      return dms_db.promise(sql, [type, get(user, "id", null), id]);
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

    createData: (args, user) => {
      const [app, type, data = {}] = args;
      const sql = `
        INSERT INTO ${tableName('data_items')}(app, type, data, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING id, app, type, data,
          ${typeCast('created_at', 'TEXT', dbType)}, created_by,
          ${typeCast('updated_at', 'TEXT', dbType)}, updated_by;
      `
      const userId = get(user, "id", null);
      const values = [app, type, data, userId];

      return dms_db.promise(sql, values);
    },

    deleteData: (ids, user) => {
      const arrayResult = buildArrayComparison('id', ids, dbType);
      const sql = `
        DELETE FROM ${tableName('data_items')}
        WHERE ${arrayResult.sql};
      `
      return dms_db.promise(sql, arrayResult.values);
    }
  };
}

// Create default instance for backward compatibility
const defaultController = createController('dms-sqlite');

// Export default controller with createController attached
module.exports = defaultController;
module.exports.createController = createController;
module.exports.DATA_ATTRIBUTES = DATA_ATTRIBUTES;
