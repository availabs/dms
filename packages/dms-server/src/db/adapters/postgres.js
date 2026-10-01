let Pool, Client;
try {
  const pg = require("pg");
  Pool = pg.Pool;
  Client = pg.Client;
} catch (e) {
  // pg is optional - will throw if used without being installed
  Pool = null;
  Client = null;
}

const { AsyncLocalStorage } = require('node:async_hooks');
const { captureQueryError } = require('../../middleware/request-logger');

const OLD_TX_API_ERROR =
  "beginTransaction/commitTransaction/rollbackTransaction were removed: they ran BEGIN, the work " +
  "and COMMIT on whichever pooled connection each statement drew, so nothing was atomic. " +
  "Use db.withTransaction(async (tx) => { ... }) and run every statement on tx.";

// Call sites already warned about for using the adapter inside their own withTransaction.
const _strayQueryWarned = new Set();

/**
 * PostgreSQL Database Adapter
 * Implements the standard database interface for PostgreSQL
 */
class PostgresAdapter {
  constructor(config) {
    if (!Pool) {
      throw new Error(
        "PostgreSQL driver (pg) is not installed. " +
        "Install it with: npm install pg"
      );
    }

    this.type = "postgres";
    this.database = config.database;
    this.config = config;
    // Set for the async lifetime of each withTransaction(fn) — see _checkNotInOwnTx.
    this._txScope = new AsyncLocalStorage();

    try {
      this.pool = new Pool(config);
    } catch (e) {
      console.error("Failed to create PostgreSQL pool:", e.message);
      throw e;
    }
  }

  /**
   * Get the database name
   */
  getDb() {
    return this.database;
  }

  /**
   * Get the underlying pool (PostgreSQL specific)
   */
  getPool() {
    return this.pool;
  }

  /**
   * Get a connection from the pool
   */
  getConnection() {
    return this.pool.connect();
  }

  /**
   * Execute a query on the pool (each call checks out an arbitrary idle connection).
   * Never part of a transaction — inside withTransaction(fn), run statements on `tx`.
   * @param {string|Object} sql - SQL query string or query object with { text, values }
   * @param {Array} values - Query parameters (optional if sql is an object)
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  async query(sql, values) {
    this._checkNotInOwnTx();
    try {
      if (typeof sql === "object" && sql.text) {
        return await this.pool.query(sql);
      }
      return await this.pool.query(sql, values);
    } catch (error) {
      this._logQueryError(sql, values, error);
      throw error;
    }
  }

  _logQueryError(sql, values, error) {
    const queryText = typeof sql === "object" ? sql.text : sql;
    const queryValues = typeof sql === "object" ? sql.values : values;
    console.error(`<PostgresAdapter> Query error:`, error.message);
    console.error(`  SQL:`, queryText);
    console.error(`  Values (${queryValues?.length || 0}):`, queryValues);
    captureQueryError({ sql, values, error });
  }

  /**
   * A plain adapter query issued from inside this adapter's own open withTransaction(fn) is a
   * missed conversion: it runs on another pooled connection, outside the transaction, and can
   * exhaust the pool when every connection is held by a transaction waiting on such a query.
   * It is allowed to run (as it always has on PG) but warned about once per call site, so the
   * SQLite suites — where the same mistake throws — stay the enforcing guard.
   */
  _checkNotInOwnTx() {
    const scope = this._txScope.getStore();
    if (!scope || !scope.open) return;
    const site = (new Error().stack || '').split('\n').slice(3, 6).join('\n');
    if (_strayQueryWarned.has(site)) return;
    _strayQueryWarned.add(site);
    console.warn(
      `<PostgresAdapter> query() on the adapter inside its own withTransaction — this runs OUTSIDE ` +
      `the transaction. Use tx.query / tx.promise instead.\n${site}`
    );
  }

  /**
   * Execute a query and return just the rows
   * @param {string} sql - SQL query string
   * @param {Array} values - Query parameters
   * @returns {Promise<Array>}
   */
  promise(sql, values) {
    this._checkNotInOwnTx();
    return new Promise((resolve, reject) => {
      this.pool.query(sql, values, (error, result) => {
        if (error) {
          console.log(`<PostgresAdapter> ${this.database} ERROR:`, sql, error);
          reject(error);
        } else {
          resolve(result.rows);
        }
      });
    });
  }

  /**
   * Close all connections
   */
  end() {
    return this.pool.end();
  }

  /**
   * Check if a table exists
   * @param {string} schema - Schema name
   * @param {string} tableName - Table name
   * @returns {Promise<boolean>}
   */
  async tableExists(schema, tableName) {
    const { rows } = await this.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = $1
        AND table_name = $2
      )
    `, [schema, tableName]);
    return rows[0]?.exists || false;
  }

  /**
   * Check if multiple tables exist
   * @param {Array<{schema: string, table: string}>} tables - Array of schema/table pairs
   * @returns {Promise<boolean>} - True if all tables exist
   */
  async tablesExist(tables) {
    const conditions = tables.map((t, i) =>
      `(table_schema = $${i * 2 + 1} AND table_name = $${i * 2 + 2})`
    ).join(" OR ");

    const values = tables.flatMap(t => [t.schema, t.table]);

    const { rows } = await this.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE ${conditions}
    `, values);

    return parseInt(rows[0]?.count || 0) === tables.length;
  }

  /**
   * Run fn(tx) as one real transaction on ONE dedicated pooled connection:
   * BEGIN → fn(tx) → COMMIT, or ROLLBACK and rethrow if fn (or COMMIT) throws.
   *
   * `tx` is the handle every statement inside the block must use — `tx.query`, `tx.promise`,
   * `tx.type`, `tx.withTransaction(f)` (nested: runs f(tx) inline) and `tx.afterCommit(cb)`
   * (runs cb after a successful COMMIT, never on rollback; errors are logged, not thrown). The
   * handle throws if used after the transaction has ended. Keep fn short and free of slow I/O
   * (email, network): it holds a pooled connection for its whole duration.
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

    const client = await this.pool.connect();
    const state = { open: true, afterCommit: [] };
    const tx = this._makeTx(client, state);
    let discardError; // passed to release() when the connection can't be trusted
    let result;
    // pg-pool drops its own 'error' listener while a client is checked out. A connection lost
    // between statements (server restart, pg_terminate_backend, idle_in_transaction timeout)
    // would otherwise be an unhandled 'error' event; record it so the client is discarded.
    const onClientError = (err) => {
      discardError = discardError || err;
      console.error(`<PostgresAdapter> connection error inside withTransaction:`, err.message);
    };
    client.on("error", onClientError);
    try {
      try {
        await client.query("BEGIN");
      } catch (err) {
        discardError = err;
        this._logQueryError("BEGIN", [], err);
        throw err;
      }
      try {
        result = await this._txScope.run(state, () => fn(tx));
        const commit = await client.query("COMMIT");
        // Postgres answers COMMIT on an aborted transaction (a statement inside fn failed and
        // the error was swallowed) with command tag ROLLBACK and no error. Surface it.
        if (commit.command === "ROLLBACK") {
          throw new Error(
            "Transaction rolled back at COMMIT: a statement inside withTransaction failed and its " +
            "error was caught inside fn, which aborted the transaction."
          );
        }
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          discardError = rollbackErr;
          console.error(`<PostgresAdapter> ROLLBACK failed, discarding connection:`, rollbackErr.message);
        }
        throw err;
      }
    } finally {
      state.open = false;
      client.removeListener("error", onClientError);
      client.release(discardError);
    }

    await runAfterCommit(state.afterCommit);
    return result;
  }

  _makeTx(client, state) {
    const adapter = this;
    const ensureOpen = () => {
      if (!state.open) throw new Error("Transaction handle used after its transaction ended.");
    };
    const tx = {
      type: this.type,
      database: this.database,
      async query(sql, values) {
        ensureOpen();
        try {
          if (typeof sql === "object" && sql.text) return await client.query(sql);
          return await client.query(sql, values);
        } catch (error) {
          adapter._logQueryError(sql, values, error);
          throw error;
        }
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

/**
 * Create a PostgreSQL client (for operations requiring a dedicated connection)
 */
async function createClient(config) {
  if (!Client) {
    throw new Error(
      "PostgreSQL driver (pg) is not installed. " +
      "Install it with: npm install pg"
    );
  }
  const client = new Client(config);
  await client.connect();
  return client;
}

module.exports = {
  PostgresAdapter,
  createClient
};
