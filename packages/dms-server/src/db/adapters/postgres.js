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
   * Execute a query
   * @param {string|Object} sql - SQL query string or query object with { text, values }
   * @param {Array} values - Query parameters (optional if sql is an object)
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  query(sql, values) {
    if (typeof sql === "object" && sql.text) {
      return this.pool.query(sql);
    }
    return this.pool.query(sql, values);
  }

  /**
   * Execute a query and return just the rows
   * @param {string} sql - SQL query string
   * @param {Array} values - Query parameters
   * @returns {Promise<Array>}
   */
  promise(sql, values) {
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
   * Begin a transaction
   */
  async beginTransaction() {
    await this.query("BEGIN;");
  }

  /**
   * Commit a transaction
   */
  async commitTransaction() {
    await this.query("COMMIT;");
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction() {
    await this.query("ROLLBACK;");
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
