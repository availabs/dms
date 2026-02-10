const Database = require("better-sqlite3");
const { dirname } = require("path");
const { mkdirSync, existsSync } = require("fs");

/**
 * SQLite Database Adapter
 * Implements the standard database interface for SQLite
 * Uses better-sqlite3 for synchronous operations wrapped in Promises for consistency
 */
class SqliteAdapter {
  constructor(config) {
    this.type = "sqlite";
    this.filename = config.filename;
    this.database = config.filename;
    this.config = config;

    try {
      // Ensure directory exists
      const dir = dirname(config.filename);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(config.filename);

      // Enable foreign keys
      this.db.pragma("foreign_keys = ON");

      // Enable WAL mode for better concurrent read performance
      this.db.pragma("journal_mode = WAL");
    } catch (e) {
      console.error("Failed to open SQLite database:", e.message);
      throw e;
    }
  }

  /**
   * Get the database name/path
   */
  getDb() {
    return this.filename;
  }

  /**
   * Get the underlying database (SQLite specific)
   */
  getPool() {
    return this.db;
  }

  /**
   * Get a connection (returns self for SQLite as it's single-connection)
   */
  getConnection() {
    return Promise.resolve(this);
  }

  /**
   * Convert PostgreSQL-style $1, $2 params to SQLite ? params
   * Also handles SQL that already has ? placeholders
   * @param {string} sql - SQL with $1, $2 style params or ? params
   * @param {Array} values - Parameter values
   * @returns {{sql: string, values: Array}}
   */
  _convertParams(sql, values) {
    if (!values || values.length === 0) {
      return { sql, values: [] };
    }

    // Check if SQL uses PostgreSQL $N style or already has ? placeholders
    const hasPgParams = /\$\d+/.test(sql);

    if (!hasPgParams) {
      // SQL already uses ? placeholders, return as-is
      return { sql, values };
    }

    // Replace $N with ? and reorder values based on parameter order
    const orderedValues = [];
    const convertedSql = sql.replace(/\$(\d+)/g, (match, num) => {
      const pgIndex = parseInt(num) - 1; // PostgreSQL params are 1-indexed
      if (pgIndex < values.length) {
        orderedValues.push(values[pgIndex]);
      }
      return "?";
    });

    return { sql: convertedSql, values: orderedValues };
  }

  /**
   * Convert PostgreSQL array syntax ANY($1) to SQLite IN (?,?,?)
   * @param {string} sql - SQL with ANY() syntax
   * @param {Array} values - Parameter values (some may be arrays)
   * @returns {{sql: string, values: Array}}
   */
  _convertArraySyntax(sql, values) {
    if (!sql.includes("ANY(")) {
      return { sql, values };
    }

    let newSql = sql;
    const newValues = [];
    let valueIndex = 0;

    // Find and replace ANY($N) patterns
    newSql = sql.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, (match, num) => {
      const pgIndex = parseInt(num) - 1;
      const arrayValue = values[pgIndex];

      if (Array.isArray(arrayValue) && arrayValue.length > 0) {
        const placeholders = arrayValue.map(() => "?").join(", ");
        newValues.push(...arrayValue);
        return `IN (${placeholders})`;
      } else if (Array.isArray(arrayValue) && arrayValue.length === 0) {
        // Empty array - this condition will never match
        return "IN (NULL) AND 1=0";
      } else {
        newValues.push(arrayValue);
        return "= ?";
      }
    });

    // Handle remaining non-array parameters
    newSql = newSql.replace(/\$(\d+)/g, (match, num) => {
      const pgIndex = parseInt(num) - 1;
      // Skip if this param was already handled as part of ANY()
      if (!sql.includes(`ANY($${num})`)) {
        newValues.push(values[pgIndex]);
      }
      return "?";
    });

    return { sql: newSql, values: newValues };
  }

  /**
   * Convert values for SQLite - objects need to be JSON stringified
   * @param {Array} values - Parameter values
   * @returns {Array} - Converted values
   */
  _convertValues(values) {
    return values.map(v => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object' && !(v instanceof Buffer)) {
        return JSON.stringify(v);
      }
      return v;
    });
  }

  /**
   * Parse JSON string fields in result rows back into objects/arrays.
   * Only parses known JSON storage columns (like `data` and `attributes`)
   * to match PostgreSQL's jsonb behavior. Columns extracted via ->> or
   * json_extract should remain as strings, just like PostgreSQL's ->> operator.
   * @param {Array} rows - Result rows from query
   * @param {Array<string>} jsonColumns - Column names to parse as JSON
   * @returns {Array} - Rows with JSON columns parsed into objects
   */
  _parseJsonFields(rows, jsonColumns = ['data', 'attributes']) {
    if (!rows || rows.length === 0) return rows;

    return rows.map(row => {
      const parsed = {};
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (jsonColumns.includes(key) && typeof val === 'string' && val.length > 0) {
          const first = val[0];
          if (first === '{' || first === '[') {
            try {
              parsed[key] = JSON.parse(val);
              continue;
            } catch (e) {
              // Not valid JSON, keep as string
            }
          }
        }
        parsed[key] = val;
      }
      return parsed;
    });
  }

  /**
   * Execute a query
   * @param {string|Object} sql - SQL query string or query object with { text, values }
   * @param {Array} values - Query parameters (optional if sql is an object)
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  async query(sql, values) {
    try {
      let queryText = typeof sql === "object" ? sql.text : sql;
      let queryValues = typeof sql === "object" ? sql.values : values;

      // Strip PostgreSQL ::TYPE casts (e.g. ::INTEGER, ::TEXT, ::numeric, ::INT[])
      let cleanedSql = queryText.replace(/::\w+(\[\])?/g, '');

      // Convert PostgreSQL syntax to SQLite
      // Use _convertArraySyntax for ANY() → IN() conversion (also handles $N → ?)
      // Fall back to _convertParams for simple $N → ? conversion
      const converted = (cleanedSql || '').includes('ANY(')
        ? this._convertArraySyntax(cleanedSql, queryValues || [])
        : this._convertParams(cleanedSql, queryValues || []);

      // Convert object values to JSON strings for SQLite
      converted.values = this._convertValues(converted.values);

      const trimmedSql = converted.sql.trim().toUpperCase();

      if (trimmedSql.startsWith("SELECT") || trimmedSql.startsWith("WITH")) {
        const stmt = this.db.prepare(converted.sql);
        const rows = this._parseJsonFields(stmt.all(...converted.values));
        return { rows, rowCount: rows.length };
      } else if (
        trimmedSql.startsWith("INSERT") ||
        trimmedSql.startsWith("UPDATE") ||
        trimmedSql.startsWith("DELETE")
      ) {
        // Check for RETURNING clause
        if (queryText.toUpperCase().includes("RETURNING")) {
          const stmt = this.db.prepare(converted.sql);
          const rows = this._parseJsonFields(stmt.all(...converted.values));
          return { rows, rowCount: rows.length };
        } else {
          const stmt = this.db.prepare(converted.sql);
          const result = stmt.run(...converted.values);
          return { rows: [], rowCount: result.changes, lastInsertRowid: result.lastInsertRowid };
        }
      } else {
        // DDL statements (CREATE, ALTER, DROP, etc.)
        this.db.exec(converted.sql);
        return { rows: [], rowCount: 0 };
      }
    } catch (error) {
      // Re-convert for error logging to show what was attempted
      const queryText = typeof sql === "object" ? sql.text : sql;
      const queryValues = typeof sql === "object" ? sql.values : values;
      const converted = this._convertParams(queryText, queryValues || []);
      console.error(`<SqliteAdapter> Query error:`, error.message);
      console.error(`  Original SQL:`, queryText);
      console.error(`  Converted SQL:`, converted.sql);
      console.error(`  Original values (${queryValues?.length || 0}):`, queryValues);
      console.error(`  Converted values (${converted.values?.length || 0}):`, converted.values);
      throw error;
    }
  }

  /**
   * Execute a query and return just the rows
   * @param {string} sql - SQL query string
   * @param {Array} values - Query parameters
   * @returns {Promise<Array>}
   */
  async promise(sql, values) {
    const result = await this.query(sql, values);
    return result.rows;
  }

  /**
   * Close the database connection
   */
  end() {
    this.db.close();
    return Promise.resolve();
  }

  /**
   * Check if a table exists
   * @param {string} schema - Schema name (ignored for SQLite, uses 'main')
   * @param {string} tableName - Table name
   * @returns {Promise<boolean>}
   */
  async tableExists(schema, tableName) {
    const result = await this.query(`
      SELECT COUNT(*) as count
      FROM sqlite_master
      WHERE type = 'table'
      AND name = ?
    `, [tableName]);
    return result.rows[0]?.count > 0;
  }

  /**
   * Check if multiple tables exist
   * @param {Array<{schema: string, table: string}>} tables - Array of schema/table pairs
   * @returns {Promise<boolean>} - True if all tables exist
   */
  async tablesExist(tables) {
    const tableNames = tables.map(t => t.table);
    const placeholders = tableNames.map(() => "?").join(", ");

    const result = await this.query(`
      SELECT COUNT(*) as count
      FROM sqlite_master
      WHERE type = 'table'
      AND name IN (${placeholders})
    `, tableNames);

    return parseInt(result.rows[0]?.count || 0) === tables.length;
  }

  /**
   * Begin a transaction
   */
  async beginTransaction() {
    this.db.exec("BEGIN;");
  }

  /**
   * Commit a transaction
   */
  async commitTransaction() {
    this.db.exec("COMMIT;");
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction() {
    this.db.exec("ROLLBACK;");
  }
}

module.exports = {
  SqliteAdapter
};
