
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

const cleanColName = (colName, part= 0) =>
    colName.includes(' as ') ? colName.split(' as ')[part] :
        colName.includes(' AS ') ? colName.split(' AS ')[part] :
            colName;

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
