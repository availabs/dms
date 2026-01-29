/**
 * Query utilities for cross-database compatibility between PostgreSQL and SQLite
 */

/**
 * Convert PostgreSQL $1, $2 params to SQLite ? params
 * @param {string} sql - SQL with $1, $2 style params
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {string}
 */
function translateParams(sql, dbType) {
  if (dbType === "postgres") {
    return sql;
  }
  // For SQLite, replace $N with ?
  return sql.replace(/\$\d+/g, "?");
}

/**
 * Build an array comparison clause
 * PostgreSQL: column = ANY($1) with array value
 * SQLite: column IN (?, ?, ?) with expanded values
 *
 * @param {string} column - Column name
 * @param {Array} values - Array of values to compare
 * @param {string} dbType - "postgres" or "sqlite"
 * @param {number} paramIndex - Starting parameter index (1-based for PostgreSQL)
 * @returns {{sql: string, values: Array, nextIndex: number}}
 */
function buildArrayComparison(column, values, dbType, paramIndex = 1) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      sql: "1 = 0", // Always false for empty array
      values: [],
      nextIndex: paramIndex
    };
  }

  if (dbType === "postgres") {
    return {
      sql: `${column} = ANY($${paramIndex})`,
      values: [values],
      nextIndex: paramIndex + 1
    };
  } else {
    // SQLite
    const placeholders = values.map(() => "?").join(", ");
    return {
      sql: `${column} IN (${placeholders})`,
      values: values,
      nextIndex: paramIndex + values.length
    };
  }
}

/**
 * Translate JSON path extraction
 * PostgreSQL: data->>'key' or data->'key'
 * SQLite: json_extract(data, '$.key')
 *
 * @param {string} column - JSON column name
 * @param {string} path - JSON path (e.g., 'key' or 'nested.key')
 * @param {string} dbType - "postgres" or "sqlite"
 * @param {boolean} asText - Whether to extract as text (true) or JSON (false)
 * @returns {string}
 */
function jsonExtract(column, path, dbType, asText = true) {
  if (dbType === "postgres") {
    const operator = asText ? "->>" : "->";
    // Handle nested paths
    if (path.includes(".")) {
      const parts = path.split(".");
      let result = column;
      for (let i = 0; i < parts.length - 1; i++) {
        result += `->'${parts[i]}'`;
      }
      result += `${operator}'${parts[parts.length - 1]}'`;
      return result;
    }
    return `${column}${operator}'${path}'`;
  } else {
    // SQLite
    const jsonPath = path.includes(".") ? `$.${path}` : `$.${path}`;
    return `json_extract(${column}, '${jsonPath}')`;
  }
}

/**
 * Translate PostgreSQL jsonb_array_elements to SQLite json_each
 * Note: This changes the query structure significantly
 *
 * @param {string} column - JSON column containing array
 * @param {string} path - Path to array within JSON (optional)
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {string}
 */
function jsonArrayElements(column, path, dbType) {
  if (dbType === "postgres") {
    if (path) {
      return `jsonb_array_elements(${column}->'${path}')`;
    }
    return `jsonb_array_elements(${column})`;
  } else {
    // SQLite
    if (path) {
      return `json_each(${column}, '$.${path}')`;
    }
    return `json_each(${column})`;
  }
}

/**
 * Translate array aggregation
 * PostgreSQL: array_agg(column)
 * SQLite: json_group_array(column)
 *
 * @param {string} column - Column to aggregate
 * @param {string} dbType - "postgres" or "sqlite"
 * @param {string} orderBy - Optional ORDER BY clause for PostgreSQL
 * @returns {string}
 */
function arrayAgg(column, dbType, orderBy = null) {
  if (dbType === "postgres") {
    if (orderBy) {
      return `array_agg(${column} ORDER BY ${orderBy})`;
    }
    return `array_agg(${column})`;
  } else {
    // SQLite - json_group_array doesn't support ORDER BY inside
    // Consider using a subquery if ordering is required
    return `json_group_array(${column})`;
  }
}

/**
 * Translate type casting
 * PostgreSQL: column::TEXT
 * SQLite: CAST(column AS TEXT)
 *
 * @param {string} expression - Expression to cast
 * @param {string} targetType - Target type (TEXT, INTEGER, etc.)
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {string}
 */
function typeCast(expression, targetType, dbType) {
  if (dbType === "postgres") {
    return `${expression}::${targetType}`;
  } else {
    return `CAST(${expression} AS ${targetType})`;
  }
}

/**
 * Translate JSON merge/concatenation
 * PostgreSQL: COALESCE(data, '{}') || $1
 * SQLite: json_patch(COALESCE(data, '{}'), $1)
 *
 * @param {string} column - JSON column
 * @param {string} paramRef - Parameter reference ($1 or ?)
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {string}
 */
function jsonMerge(column, paramRef, dbType) {
  if (dbType === "postgres") {
    return `COALESCE(${column}, '{}') || ${paramRef}`;
  } else {
    return `json_patch(COALESCE(${column}, '{}'), ${paramRef})`;
  }
}

/**
 * Get current timestamp function
 * PostgreSQL: NOW()
 * SQLite: datetime('now')
 *
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {string}
 */
function currentTimestamp(dbType) {
  if (dbType === "postgres") {
    return "NOW()";
  } else {
    return "datetime('now')";
  }
}

/**
 * Translate string concatenation
 * Both PostgreSQL and SQLite support || operator
 *
 * @param {...string} parts - Parts to concatenate
 * @returns {string}
 */
function concat(...parts) {
  return parts.join(" || ");
}

/**
 * Build a parameterized query that works with both databases
 * @param {string} sql - SQL template with {param} placeholders
 * @param {Object} params - Parameter values keyed by name
 * @param {string} dbType - "postgres" or "sqlite"
 * @returns {{sql: string, values: Array}}
 */
function buildQuery(sql, params, dbType) {
  const values = [];
  let paramIndex = 1;

  const processedSql = sql.replace(/\{(\w+)\}/g, (match, paramName) => {
    if (!(paramName in params)) {
      throw new Error(`Missing parameter: ${paramName}`);
    }
    values.push(params[paramName]);
    if (dbType === "postgres") {
      return `$${paramIndex++}`;
    } else {
      return "?";
    }
  });

  return { sql: processedSql, values };
}

/**
 * Create a query builder that accumulates parameters
 */
class QueryBuilder {
  constructor(dbType) {
    this.dbType = dbType;
    this.values = [];
    this.paramIndex = 1;
  }

  /**
   * Add a parameter and get its placeholder
   * @param {*} value - Parameter value
   * @returns {string} - Placeholder ($N or ?)
   */
  param(value) {
    this.values.push(value);
    if (this.dbType === "postgres") {
      return `$${this.paramIndex++}`;
    } else {
      return "?";
    }
  }

  /**
   * Add an array parameter for IN clause
   * @param {string} column - Column name
   * @param {Array} values - Array of values
   * @returns {string} - SQL fragment
   */
  arrayIn(column, values) {
    const result = buildArrayComparison(column, values, this.dbType, this.paramIndex);
    this.values.push(...result.values);
    this.paramIndex = result.nextIndex;
    return result.sql;
  }

  /**
   * Get JSON extraction expression
   * @param {string} column - JSON column
   * @param {string} path - JSON path
   * @param {boolean} asText - Extract as text
   * @returns {string}
   */
  json(column, path, asText = true) {
    return jsonExtract(column, path, this.dbType, asText);
  }

  /**
   * Get type cast expression
   * @param {string} expr - Expression
   * @param {string} type - Target type
   * @returns {string}
   */
  cast(expr, type) {
    return typeCast(expr, type, this.dbType);
  }

  /**
   * Get current timestamp
   * @returns {string}
   */
  now() {
    return currentTimestamp(this.dbType);
  }

  /**
   * Get JSON merge expression
   * @param {string} column - JSON column
   * @param {*} value - Value to merge
   * @returns {string}
   */
  jsonMergeParam(column, value) {
    const placeholder = this.param(value);
    return jsonMerge(column, placeholder, this.dbType);
  }

  /**
   * Get the accumulated values
   * @returns {Array}
   */
  getValues() {
    return this.values;
  }

  /**
   * Reset the builder
   */
  reset() {
    this.values = [];
    this.paramIndex = 1;
  }
}

module.exports = {
  translateParams,
  buildArrayComparison,
  jsonExtract,
  jsonArrayElements,
  arrayAgg,
  typeCast,
  jsonMerge,
  currentTimestamp,
  concat,
  buildQuery,
  QueryBuilder
};
