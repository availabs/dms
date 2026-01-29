
const handleFiltersType = (id_col, id_vals, index, type, dbType = 'postgres') => {
  const typeToKeywordMapping = {
    filter: { null: 'IS', symbol: '=' },
    exclude: { array: 'NOT', null: 'IS NOT', symbol: '=' },
    // single value expected. not an array
    gt: { symbol: '>' }, gte: { symbol: '>=' }, lt: { symbol: '<' }, lte: { symbol: '<=' },
    like: {symbol: 'LIKE' }, // assumes '%'s are provided already. this gives control to do: begins with/ends with/includes
    notLike: {symbol: 'NOT LIKE'}
  }

  const conditions = [];
  if(['filter', 'exclude'].includes(type)){
    const arrayVals = id_vals.filter(idv => !['null', 'not null'].includes(idv));
    const nullVals = id_vals.find(idv => ['null', 'not null'].includes(idv));

    if (arrayVals.length) {
      if (dbType === 'postgres') {
        conditions.push(`${typeToKeywordMapping[type].array || ''} ${id_col} ${typeToKeywordMapping[type].symbol} ANY(${index})`);
      } else {
        // SQLite doesn't support ANY(), use IN instead
        // Note: For SQLite, the caller needs to expand the array into individual placeholders
        conditions.push(`${typeToKeywordMapping[type].array || ''} ${id_col} IN (${index})`);
      }
    }
    nullVals && conditions.push(`${id_col} ${typeToKeywordMapping[type].null} ${nullVals}`);
  }else{
    id_vals && conditions.push(`${id_col} ${typeToKeywordMapping[type].symbol} ${index}`);
  }

  return conditions.join(' and ')

}

const handleFilters = ({filter, exclude, gt, gte, lt, lte, like, filterRelation = 'and', notLike}, dbType = 'postgres') => {
  let i = 0;
  const isNull = (val) =>
      Array.isArray(val) ?
          !val.filter(v1 => !['null', 'not null'].includes(v1)).length :
          ['null', 'not null'].includes(val);

  // Always use PostgreSQL-style $N params - SQLite adapter will convert them
  const param = (index) => `$${index}`;

  const mapConditions = (conditions, type) => {
    return Object.keys(conditions).map((id_col) => {
      i = isNull(conditions[id_col]) ? i : ++i;
      return handleFiltersType(id_col, conditions[id_col], param(i), type, dbType);
    }).filter(Boolean); // Remove empty conditions
  };

  const clauses = [
    ...mapConditions(filter, 'filter'),
    ...mapConditions(exclude, 'exclude'),
    ...mapConditions(gt, 'gt'),
    ...mapConditions(gte, 'gte'),
    ...mapConditions(lt, 'lt'),
    ...mapConditions(lte, 'lte'),
    ...mapConditions(like, 'like'),
    ...mapConditions(notLike, 'notLike'),
  ];

  return clauses.length ? `WHERE ${clauses.join(` ${filterRelation.toLowerCase() === 'or' ? 'or' : 'and'} `)}` : '';
}

const handleGroupBy = (groups) =>
    groups.length ? `GROUP BY ${groups.join(', ')}` : ``;

const handleHaving = (clauses, startIndex) =>
    clauses.length ? `HAVING ${clauses.map((clause, index) => `($${startIndex + index + 1})`).join(' and ')}` : ``;

const handleOrderBy = (orders) =>
    Object.keys(orders).length && !Array.isArray(orders) ?
        `ORDER BY ${Object.keys(orders).map(col => `${cleanColName(col, 1)} ${orders[col]}`).join(', ')}` : ``;

// gets values to pass to sql, excluding null and not null.
const getValuesExceptNulls = (conditions) =>
    Object.values(conditions)
        .map(v => Array.isArray(v) ?
            v.filter(v1 => !['null', 'not null'].includes(v1)) :
            (['null', 'not null'].includes(v) ? null : v)
        )
        .filter(v => Array.isArray(v) ? v.length : v);

const simpleFilterLength = async (pgEnv, view_id, options) => {
  const db = await getDb(pgEnv);
  const {table_schema, table_name} = await getDataTableFromViewId(db, view_id)

  const {
    filter = {}, exclude = {}, // what happens if ['36001', null] is passed? does it separate null and create issue for i?
    gt = {}, gte = {}, lt = {}, lte = {}, like = {}, notLike = {},
      filterRelation = 'and', // AND / OR between each filter above
    groupBy = [], having = [], aggregatedLen = false //consider replacing aggregatedLen with groupBy.length
  } = JSON.parse(options);

  // values to pass to sql
  const values = [
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
    ...getValuesExceptNulls(notLike),
    ...having
  ]

  // count non-null values to calculate index for the HAVING clause
  const startIndexHaving =
      getValuesExceptNulls(filter).length + getValuesExceptNulls(exclude).length +
      getValuesExceptNulls(gt).length + getValuesExceptNulls(gte).length +
      getValuesExceptNulls(lt).length + getValuesExceptNulls(lte).length +
      getValuesExceptNulls(like).length + getValuesExceptNulls(notLike).length

  const sql = aggregatedLen ?
      `
      with t as (
      SELECT ${groupBy.length ? `${groupBy.join(', ')},` : ``} count(1) numRows
      FROM ${table_schema}.${table_name}
          ${ handleFilters({filter, exclude, gt, gte, lt, lte, like, filterRelation, notLike}) }
          ${ handleGroupBy(groupBy) }
          ${ handleHaving(having, startIndexHaving) }
          )
      SELECT count(1) numRows from t;
    ` :
      `
      SELECT count(1) numRows
      FROM ${table_schema}.${table_name}
          ${ handleFilters({filter, exclude, gt, gte, lt, lte, like, filterRelation, notLike}) }
          ${ handleGroupBy(groupBy) }
          ${ handleHaving(having, startIndexHaving) }
    `;
// console.log('simpleFilterLength', sql, values)
  const {rows} = await db.query(sql, values);

  return _.get(rows, [0, 'numrows'], 0);
};
// ============================================= helper fns for simpleFilter begin
const mapFn = {
  parseInt: e => parseInt(e),
  none: e => e
}
const assign = (originalValue, newValue, keepId) => keepId ? `${newValue} (${originalValue})` : newValue;
const getNestedValue = (obj) => typeof obj?.value === 'object' ? getNestedValue(obj.value) : obj?.value || obj;
const getOrderMultiplier = order => order === 'asc' ? 1 : -1;
const getCompareFn = (a,b, multiplier) => {
  return a === null ? -1 : b === null ? 1 : // nulls always last
      multiplier * (
          typeof +a === 'number' && typeof +b === 'number' &&
              !isNaN(+a) && !isNaN(+b) ?
              +a - +b :
              a?.toString().localeCompare(b?.toString())
      )
};
const cleanColName = (colName, part= 0) =>
    colName.includes(' as ') ? colName.split(' as ')[part] :
        colName.includes(' AS ') ? colName.split(' AS ')[part] :
            colName;
const sortRows = (a,b, orderBy) => {
  //   // if 1,2,3, etc is passed
  //
  //   // if column names are passed
  return Object.keys(orderBy).reduce((acc, order) => {
    return getCompareFn(
        getNestedValue(a[cleanColName(order, 1)]), // need to remove everything before ' as ' / ' AS '
        getNestedValue(b[cleanColName(order, 1)]),
        getOrderMultiplier(orderBy[order])
    )
  }, true)
}
// ============================================= helper fns for simpleFilter end
const simpleFilter = async (pgEnv, view_id, options, attributes, indices) => {
  const num = indices.to - indices.from + 1;
  const db = await getDb(pgEnv);
  const {table_schema, table_name} = await getDataTableFromViewId(db, view_id)

  const {
    filter = {}, exclude = {},
    gt = {}, gte = {}, lt = {}, lte = {}, like = {}, notLike = {},
      filterRelation = 'and', // AND / OR between each filter above
    groupBy = [], having = [], orderBy = {}, meta = {}
  } = JSON.parse(options);

  // values to pass to sql
  const values = [
    ...getValuesExceptNulls(filter), ...getValuesExceptNulls(exclude),
    ...getValuesExceptNulls(gt), ...getValuesExceptNulls(gte),
    ...getValuesExceptNulls(lt), ...getValuesExceptNulls(lte),
    ...getValuesExceptNulls(like),
    ...getValuesExceptNulls(notLike),
    ...having
  ]

  // count non-null values to calculate index for the HAVING clause
  const startIndexHaving =
      getValuesExceptNulls(filter).length + getValuesExceptNulls(exclude).length +
      getValuesExceptNulls(gt).length + getValuesExceptNulls(gte).length +
      getValuesExceptNulls(lt).length + getValuesExceptNulls(lte).length +
      getValuesExceptNulls(like).length + getValuesExceptNulls(notLike).length

  const sql = `
        SELECT ${attributes.join(', ')}
        FROM ${table_schema}.${table_name}
            ${ handleFilters({filter, exclude, gt, gte, lt, lte, like, filterRelation, notLike}) }
            ${ handleGroupBy(groupBy) }
            ${ handleHaving(having, startIndexHaving) }
            ${ handleOrderBy(orderBy) }
             LIMIT ${ +num }
             OFFSET ${indices.from}
            `;
  // console.log('rows', sql, values)
  const { rows } = await db.query(sql, values);

  // fetch meta for all meta columns
  const metaData = await Object.keys(meta).reduce(async (acc, metaColName) => {
    const prev = await acc;
    const metaColPart0 = cleanColName(metaColName, 0); // name before AS/as
    const metaColPart1 = cleanColName(metaColName, 1); // name after AS/as
    const {
      view_id: currViewId,
      keyAttribute,
        valueAttribute='name',
      keepId= false, // if set to true, returns original id value in "()" slong with meta value
      filter={},
      formatValuesToMap='none',
      filterAttribute,
        attributes: currAttributes,
        ...rest
    } = JSON.parse(meta[metaColName] || '{}');

    if (!currViewId) {
      return {...prev, ...{[metaColPart1]: rest || {}}}; // if meta is defined by user. i.e. {coastal: 'Coastal flooding',...}}
    }

    const uniqData = [
      ...new Set(
          rows.map(fd => fd[metaColPart1])
              .reduce((acc, fd) => {
                return fd?.toString()?.includes(',') ?
                    [
                        ...acc,
                      ...fd.split(',').map(f => mapFn[formatValuesToMap](f.trim()))] :
                    [...acc, mapFn[formatValuesToMap](fd)]
              } , [])
      )
    ].filter(d => d);

    const currOptions = JSON.stringify({
      filter: {
        ...filter,
        ...uniqData?.length && {[filterAttribute || metaColPart0]: uniqData},
      },
      groupBy: currAttributes
    })

    const dataWithMeta = await simpleFilter(pgEnv, currViewId, currOptions, currAttributes, {from: 0, to: uniqData?.length})
        .then(tmpData => tmpData.reduce((tmpDataAcc, row) => {
          tmpDataAcc[row[keyAttribute]] = assign(row[keyAttribute], row[valueAttribute] || row[keyAttribute], keepId);
          return tmpDataAcc;
        }, {}));

    return {...prev, ...{[metaColPart1]: dataWithMeta}};
  } ,{});

  // assign meta.
  if(Object.keys(metaData).length){
    rows.map(row => {
      Object.keys(metaData).forEach(column => {
        row[column] = row[column]?.toString()?.includes(',') ?
            row[column]?.toString()?.split(',').map(val => metaData[column][val.trim()] ).join(', ') : (metaData[column][row[column]] || row[column]);
        // provides more data to client, but adds additional processing
        // row[column] = {
        //   // metadata[keyAttribute] gives the meta object for a column
        //   value: row[column]?.toString()?.includes(',') ?
        //           row[column]?.toString()?.split(',').map(val => metaData[column][val.trim()] ).join(', ') : (metaData[column][row[column]] || row[column]),
        //   originalValue: row[column]
        // }
      })
      return row
    })
  }
  // only sort by meta columns.
  const cleanMetaCols = Object.keys(meta).map(col => cleanColName(col))
  // return Object.keys(orderBy)?.length &&
  //     Object.keys(orderBy).filter(sortCol => cleanMetaCols.includes(cleanColName(sortCol)) ).length ?
  //     rows.sort((a,b) => sortRows(a,b,orderBy)) :
  //     rows;

  return Object.keys(orderBy)?.length && !Array.isArray(orderBy) ? rows.sort((a,b) => sortRows(a,b,orderBy)) : rows;
};

function extent(values, valueof) {
  let min;
  let max;
  if (valueof === undefined) {
    for (const value of values) {
      if (value != null) {
        if (min === undefined) {
          if (value >= value) min = max = value;
        } else {
          if (min > value) min = value;
          if (max < value) max = value;
        }
      }
    }
  } else {
    let index = -1;
    for (let value of values) {
      if ((value = valueof(value, ++index, values)) != null) {
        if (min === undefined) {
          if (value >= value) min = max = value;
        } else {
          if (min > value) min = value;
          if (max < value) max = value;
        }
      }
    }
  }
  return [min, max];
}


module.exports = {
  handleFilters,
  handleGroupBy,
  handleOrderBy,
  getValuesExceptNulls,
  extent
};
