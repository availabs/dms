const Database = require("better-sqlite3");
const { dirname } = require("path");
const { mkdirSync, existsSync } = require("fs");
const { AsyncLocalStorage } = require("node:async_hooks");
const { captureQueryError } = require('../../middleware/request-logger');

const OLD_TX_API_ERROR =
  "beginTransaction/commitTransaction/rollbackTransaction were removed: they ran BEGIN/COMMIT on " +
  "the one shared connection, so every other request's queries landed inside the open " +
  "transaction. Use db.withTransaction(async (tx) => { ... }) and run every statement on tx.";

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

    // One connection is shared by every caller, so a transaction must own it outright. The lock
    // is FIFO: withTransaction holds it for its whole duration; a plain query() runs immediately
    // when nobody holds or waits for it, and otherwise waits its turn. _lockDepth counts holders
    // plus waiters.
    this._lockTail = Promise.resolve();
    this._lockDepth = 0;
    // Set for the async lifetime of each withTransaction(fn) — lets query() recognise a call from
    // inside the transaction that should have gone through tx (it would otherwise deadlock).
    this._txScope = new AsyncLocalStorage();

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
   * Execute a query. Waits while a withTransaction(fn) holds the connection, so it is never part
   * of, or rolled back with, another caller's transaction. Inside withTransaction, use `tx`.
   * @param {string|Object} sql - SQL query string or query object with { text, values }
   * @param {Array} values - Query parameters (optional if sql is an object)
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  async query(sql, values) {
    const scope = this._txScope.getStore();
    if (scope && scope.open) {
      throw new Error(
        "<SqliteAdapter> query() on the adapter inside its own withTransaction — it would wait " +
        "for the lock that transaction holds. Use tx.query / tx.promise inside the block."
      );
    }
    if (this._lockDepth === 0) return this._execute(sql, values);
    const release = await this._acquireLock();
    try {
      return this._execute(sql, values);
    } finally {
      release();
    }
  }

  /** FIFO lock; resolves to a release function (idempotent). */
  _acquireLock() {
    this._lockDepth++;
    let releaseHeld;
    const held = new Promise((resolve) => { releaseHeld = resolve; });
    const ready = this._lockTail;
    this._lockTail = ready.then(() => held);
    let released = false;
    return ready.then(() => () => {
      if (released) return;
      released = true;
      this._lockDepth--;
      releaseHeld();
    });
  }

  /**
   * Run one statement synchronously on the connection (no locking — callers own that).
   * @returns {{rows: Array, rowCount: number, lastInsertRowid?: number}}
   */
  _execute(sql, values) {
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
      captureQueryError({ sql, values, error });
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
   * Run fn(tx) as one real transaction: take the adapter lock, BEGIN IMMEDIATE, fn(tx), COMMIT —
   * or ROLLBACK and rethrow if fn (or COMMIT) throws. Other callers' queries wait until it ends.
   *
   * `tx` is the handle every statement inside the block must use — `tx.query`, `tx.promise`,
   * `tx.type`, `tx.withTransaction(f)` (nested: runs f(tx) inline) and `tx.afterCommit(cb)`
   * (runs cb after a successful COMMIT and after the lock is released, never on rollback; errors
   * are logged, not thrown). The handle throws if used after the transaction has ended.
   *
   * @template T
   * @param {(tx: Object) => Promise<T>} fn
   * @returns {Promise<T>} fn's result, after COMMIT
   */
  async withTransaction(fn) {
    const outer = this._txScope.getStore();
    if (outer && outer.open) {
      throw new Error(
        "withTransaction() called on the adapter inside its own open transaction — " +
        "use tx.withTransaction(fn) to nest (it runs inline)."
      );
    }

    const release = await this._acquireLock();
    const state = { open: true, afterCommit: [] };
    const tx = this._makeTx(state);
    let result;
    try {
      if (this.db.inTransaction) {
        throw new Error(
          "<SqliteAdapter> the connection is already inside a transaction withTransaction did not " +
          "open (a raw BEGIN via getPool()?) — refusing to run inside it."
        );
      }
      this.db.exec("BEGIN IMMEDIATE");
      try {
        result = await this._txScope.run(state, () => fn(tx));
        this.db.exec("COMMIT");
      } catch (err) {
        // SQLite rolls back by itself on some errors (SQLITE_FULL, SQLITE_IOERR, …).
        if (this.db.inTransaction) {
          try {
            this.db.exec("ROLLBACK");
          } catch (rollbackErr) {
            console.error(`<SqliteAdapter> ROLLBACK failed:`, rollbackErr.message);
          }
        }
        throw err;
      }
    } finally {
      state.open = false;
      release();
    }

    await runAfterCommit(state.afterCommit);
    return result;
  }

  _makeTx(state) {
    const adapter = this;
    const ensureOpen = () => {
      if (!state.open) throw new Error("Transaction handle used after its transaction ended.");
    };
    const tx = {
      type: this.type,
      database: this.database,
      async query(sql, values) {
        ensureOpen();
        return adapter._execute(sql, values);
      },
      async promise(sql, values) {
        return (await tx.query(sql, values)).rows;
      },
      async withTransaction(fn) {
        ensureOpen();
        return fn(tx);
      },
      afterCommit(cb) {
        ensureOpen();
        state.afterCommit.push(cb);
      },
    };
    return tx;
  }

  // Removed — see OLD_TX_API_ERROR. They throw rather than disappear so a stale caller fails
  // loudly with the fix in the message, instead of "is not a function".
  beginTransaction() { throw new Error(OLD_TX_API_ERROR); }
  commitTransaction() { throw new Error(OLD_TX_API_ERROR); }
  rollbackTransaction() { throw new Error(OLD_TX_API_ERROR); }
}

/**
 * Run the callbacks registered with tx.afterCommit(), in order. The transaction has already
 * committed, so a failing callback is logged, never thrown — it must not make a committed write
 * look failed to the caller.
 */
async function runAfterCommit(callbacks) {
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (err) {
      console.error(`<withTransaction> afterCommit callback failed:`, err.message);
    }
  }
}

module.exports = {
  SqliteAdapter
};
