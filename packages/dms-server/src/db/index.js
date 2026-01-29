const { readFile: readFileAsync } = require("fs/promises");
const { join } = require("path");

const { loadConfig, getDbType } = require("./config");
const { PostgresAdapter, createClient } = require("./adapters/postgres");
const { SqliteAdapter } = require("./adapters/sqlite");

// Database instances cache
const databases = {};
const clients = {};

/**
 * Initialize auth tables for the database
 * @param {Object} dbConnection - Database adapter instance
 */
const initAuth = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  // Check if users table exists
  const exists = await dbConnection.tableExists("public", "users");

  if (!exists) {
    console.time(`auth db init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite" ? "auth_tables.sqlite.sql" : "auth_tables.sql";
      const sqlPath = join(__dirname, "sql/auth", sqlFile);
      const sql = await readFileAsync(sqlPath, { encoding: "utf8" });

      // SQLite doesn't support multiple statements in one query easily
      // Split and execute for SQLite
      if (dbType === "sqlite") {
        const statements = sql.split(";").filter(s => s.trim());
        for (const stmt of statements) {
          if (stmt.trim()) {
            await dbConnection.query(stmt + ";");
          }
        }
      } else {
        await dbConnection.query(sql);
      }

      await dbConnection.commitTransaction();
      console.timeEnd(`auth db init ${db}`);
    } catch (error) {
      await dbConnection.rollbackTransaction();
      throw error;
    }
  }
};

/**
 * Initialize DMS tables for the database
 * @param {Object} dbConnection - Database adapter instance
 */
const initDms = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  // Check if required DMS tables exist
  let tablesExist;

  if (dbType === "sqlite") {
    // For SQLite, check for the data_items table
    tablesExist = await dbConnection.tableExists("main", "data_items");
  } else {
    // For PostgreSQL, check for data_manager schema tables
    tablesExist = await dbConnection.tablesExist([
      { schema: "dms", table: "data_items" }
    ]);
  }

  if (!tablesExist) {
    console.time(`dms db init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite" ? "dms.sqlite.sql" : "dms.sql";
      const sqlPath = join(__dirname, "sql/dms", sqlFile);
      const sql = await readFileAsync(sqlPath, { encoding: "utf8" });

      // SQLite doesn't support multiple statements in one query easily
      if (dbType === "sqlite") {
        const statements = sql.split(";").filter(s => s.trim());
        for (const stmt of statements) {
          if (stmt.trim()) {
            await dbConnection.query(stmt + ";");
          }
        }
      } else {
        await dbConnection.query(sql);
      }

      await dbConnection.commitTransaction();
      console.timeEnd(`dms db init ${db}`);
    } catch (error) {
      await dbConnection.rollbackTransaction();
      throw error;
    }
  }
};

/**
 * Initialize DAMA tables (data manager advanced tables)
 * @param {Object} dbConnection - Database adapter instance
 */
const initDama = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  // Check if required tables exist
  let tablesExist;

  if (dbType === "sqlite") {
    tablesExist = await dbConnection.tablesExist([
      { schema: "main", table: "collections" },
      { schema: "main", table: "settings" }
    ]);
  } else {
    tablesExist = await dbConnection.tablesExist([
      { schema: "data_manager", table: "collections" },
      { schema: "data_manager", table: "settings" }
    ]);
  }

  if (!tablesExist) {
    console.time(`dama db init ${db}`);
    await dbConnection.beginTransaction();

    try {
      // DAMA init scripts - these would need SQLite versions too
      const damaDbInitScripts = dbType === "sqlite" ? [
        // SQLite versions would be needed
        "create_dama_core_tables.sqlite.sql"
      ] : [
        "create_required_extensions.sql",
        "create_dama_core_tables.sql",
        "create_dama_etl_context_and_events_tables.sql",
        "create_dama_admin_helper_functions.sql",
        "create_geojson_schema_table.sql",
        "create_dama_table_schema_utils.sql",
        "create_data_source_metadata_utils.sql"
      ];

      for (const scriptFile of damaDbInitScripts) {
        const sqlPath = join(__dirname, "sql/dama", scriptFile);
        try {
          const sql = await readFileAsync(sqlPath, { encoding: "utf8" });

          if (dbType === "sqlite") {
            const statements = sql.split(";").filter(s => s.trim());
            for (const stmt of statements) {
              if (stmt.trim()) {
                await dbConnection.query(stmt + ";");
              }
            }
          } else {
            await dbConnection.query(sql);
          }
        } catch (err) {
          if (err.code === "ENOENT") {
            console.warn(`DAMA init script not found: ${scriptFile}`);
          } else {
            throw err;
          }
        }
      }

      await dbConnection.commitTransaction();
      console.timeEnd(`dama db init ${db}`);
    } catch (error) {
      await dbConnection.rollbackTransaction();
      throw error;
    }
  }
};

/**
 * Create a database adapter based on configuration
 * @param {Object} config - Database configuration
 * @returns {Object} Database adapter instance
 */
function createAdapter(config) {
  if (config.type === "postgres") {
    return new PostgresAdapter(config);
  } else if (config.type === "sqlite") {
    return new SqliteAdapter(config);
  } else {
    throw new Error(`Unknown database type: ${config.type}`);
  }
}

/**
 * Get or create a database connection
 * @param {string} pgEnv - Environment name (e.g., 'dms', 'auth')
 * @returns {Object} Database adapter instance
 */
function getDb(pgEnv) {
  if (databases[pgEnv]) {
    return databases[pgEnv];
  }

  const config = loadConfig(pgEnv);
  databases[pgEnv] = createAdapter(config);

  // Initialize based on database role
  if (config.role === "dama") {
    initDama(databases[pgEnv]).then(() => {
      console.log("dama init", pgEnv);
    }).catch(err => {
      console.error("dama init failed:", err.message);
    });
  }

  if (config.role === "auth") {
    initAuth(databases[pgEnv]).then(() => {
      console.log("auth init", pgEnv);
    }).catch(err => {
      console.error("auth init failed:", err.message);
    });
  }

  if (config.role === "dms") {
    initDms(databases[pgEnv]).then(() => {
      console.log("dms init", pgEnv);
    }).catch(err => {
      console.error("dms init failed:", err.message);
    });
  }

  return databases[pgEnv];
}

/**
 * Get a dedicated client connection (PostgreSQL only)
 * For SQLite, returns the same adapter as getDb
 * @param {string} pgEnv - Environment name
 * @returns {Promise<Object>} Client or adapter instance
 */
async function getClient(pgEnv) {
  const config = loadConfig(pgEnv);

  if (config.type === "sqlite") {
    // SQLite doesn't have separate client concept
    return getDb(pgEnv);
  }

  if (clients[pgEnv]) {
    return clients[pgEnv];
  }

  clients[pgEnv] = await createClient(config);
  return clients[pgEnv];
}

/**
 * Execute a query on a specific database
 * @param {string|Array} query - SQL query or array of queries
 * @param {string} pgEnv - Environment name
 * @returns {Promise<Object|Array>} Query result(s)
 */
async function query(query, pgEnv) {
  try {
    const multi_queries = Array.isArray(query);
    const sql_arr = multi_queries ? query : [query];

    const db = getDb(pgEnv);

    const results = [];
    for (const q of sql_arr) {
      let r = await db.query(q);
      results.push(r);
    }

    return multi_queries ? results : results[0];
  } catch (err) {
    console.error("Query error:", err.message);
    if (query.text) {
      console.error(query.text);
      console.error(query.values);
    } else {
      console.error(query);
    }
    throw err;
  }
}


// Legacy exports for backward compatibility
function getPostgresCredentials(pgEnv) {
  return loadConfig(pgEnv);
}

module.exports = {
  getDb,
  getClient,
  query,
  getPostgresCredentials,
  loadConfig
};
