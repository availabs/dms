const { readFile: readFileAsync } = require("fs/promises");
const { join } = require("path");

const { loadConfig, getDbType } = require("./config");
const { PostgresAdapter, createClient } = require("./adapters/postgres");
const { SqliteAdapter } = require("./adapters/sqlite");
const { ClickHouseAdapter } = require("./adapters/clickhouse");

// Database instances cache
const databases = {};
const clickhouseDatabases = {};
const clients = {};
const initPromises = [];

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
 * Initialize sync tables (change_log + yjs_states) for the database
 * @param {Object} dbConnection - Database adapter instance
 */
const initSync = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  // Check if change_log table already exists
  const schema = dbType === "sqlite" ? "main" : "dms";
  const exists = await dbConnection.tableExists(schema, "change_log");

  if (!exists) {
    console.time(`sync db init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite" ? "change_log.sqlite.sql" : "change_log.sql";
      const sqlPath = join(__dirname, "sql/dms", sqlFile);
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

      await dbConnection.commitTransaction();
      console.timeEnd(`sync db init ${db}`);
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
      { schema: "main", table: "sources" },
      { schema: "main", table: "views" }
    ]);
  } else {
    tablesExist = await dbConnection.tablesExist([
      { schema: "data_manager", table: "sources" },
      { schema: "data_manager", table: "views" }
    ]);
  }

  if (!tablesExist) {
    console.time(`dama db init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite"
        ? "create_dama_core_tables.sqlite.sql"
        : "create_dama_core_tables.sql";
      const sqlPath = join(__dirname, "sql/dama", sqlFile);
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

      await dbConnection.commitTransaction();
      console.timeEnd(`dama db init ${db}`);
    } catch (error) {
      await dbConnection.rollbackTransaction();
      throw error;
    }
  }
};

/**
 * Initialize DAMA task tables (task queue and event tracking)
 * @param {Object} dbConnection - Database adapter instance
 */
const initDamaTasks = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  let tablesExist;
  if (dbType === "sqlite") {
    tablesExist = await dbConnection.tableExists("main", "tasks");
  } else {
    tablesExist = await dbConnection.tableExists("data_manager", "tasks");
  }

  if (!tablesExist) {
    console.time(`dama tasks init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite"
        ? "create_dama_task_tables.sqlite.sql"
        : "create_dama_task_tables.sql";
      const sqlPath = join(__dirname, "sql/dama", sqlFile);
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

      await dbConnection.commitTransaction();
      console.timeEnd(`dama tasks init ${db}`);
    } catch (error) {
      await dbConnection.rollbackTransaction();
      throw error;
    }
  }
};

/**
 * Initialize DMS task tables (task queue + event tracking + settings),
 * mirroring the DAMA task system but in the DMS database. Lets DMS-native
 * workers (e.g. internal_table publish) record progress without depending
 * on a DAMA pgEnv being configured.
 *
 * PG: tables go in the `dms` schema. SQLite: bare `dms_tasks` /
 * `dms_task_events` / `dms_settings` to avoid colliding with the DAMA
 * SQLite schema's unprefixed names.
 *
 * @param {Object} dbConnection - Database adapter instance
 */
const initDmsTasks = async (dbConnection) => {
  const db = dbConnection.getDb();
  const dbType = dbConnection.type;

  let tablesExist;
  if (dbType === "sqlite") {
    tablesExist = await dbConnection.tableExists("main", "dms_tasks");
  } else {
    tablesExist = await dbConnection.tableExists("dms", "tasks");
  }

  if (!tablesExist) {
    console.time(`dms tasks init ${db}`);
    await dbConnection.beginTransaction();

    try {
      const sqlFile = dbType === "sqlite" ? "dms_tasks.sqlite.sql" : "dms_tasks.sql";
      const sqlPath = join(__dirname, "sql/dms", sqlFile);
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

      await dbConnection.commitTransaction();
      console.timeEnd(`dms tasks init ${db}`);
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

  // Support multi-role configs: "role": "dms" or "role": ["dms", "auth"]
  const roles = Array.isArray(config.role) ? config.role : [config.role];

  // Initialize based on database role(s), tracking promises for awaitReady().
  // Run sequentially — SQLite can't handle concurrent transactions on the same connection.
  const initSequence = async () => {
    if (roles.includes("dama")) {
      try {
        await initDama(databases[pgEnv]);
        console.log("dama init", pgEnv);
      } catch (err) {
        console.error("dama init failed:", err.message);
      }
      try {
        await initDamaTasks(databases[pgEnv]);
        console.log("dama tasks init", pgEnv);
      } catch (err) {
        console.error("dama tasks init failed:", err.message);
      }
    }

    if (roles.includes("auth")) {
      try {
        await initAuth(databases[pgEnv]);
        console.log("auth init", pgEnv);
      } catch (err) {
        console.error("auth init failed:", err.message);
      }
    }

    if (roles.includes("dms")) {
      try {
        await initDms(databases[pgEnv]);
        console.log("dms init", pgEnv);
      } catch (err) {
        console.error("dms init failed:", err.message);
      }

      try {
        await initSync(databases[pgEnv]);
        console.log("sync init", pgEnv);
      } catch (err) {
        console.error("sync init failed:", err.message);
      }

      try {
        await initDmsTasks(databases[pgEnv]);
        console.log("dms tasks init", pgEnv);
      } catch (err) {
        console.error("dms tasks init failed:", err.message);
      }
    }
  };

  initPromises.push(initSequence());

  return databases[pgEnv];
}

/**
 * Get or create a ClickHouse adapter for a DAMA pgEnv.
 *
 * ClickHouse is paired with a Postgres pgEnv as auxiliary storage for large
 * static dataset tables. The pgEnv config file may include a `clickhouse`
 * sub-object; this function returns an adapter built from that sub-object,
 * cached per pgEnv.
 *
 * Throws if the pgEnv has no `clickhouse` config — callers should only reach
 * this path when a view's table_schema starts with `clickhouse.`.
 *
 * @param {string} pgEnv - Environment name (same as the Postgres pgEnv)
 * @returns {ClickHouseAdapter}
 */
function getChDb(pgEnv) {
  if (clickhouseDatabases[pgEnv]) {
    return clickhouseDatabases[pgEnv];
  }
  const config = loadConfig(pgEnv);
  if (!config.clickhouse) {
    throw new Error(`No clickhouse config for pgEnv "${pgEnv}"`);
  }
  clickhouseDatabases[pgEnv] = new ClickHouseAdapter(config.clickhouse);
  return clickhouseDatabases[pgEnv];
}

/**
 * Wait for all pending database initializations to complete.
 * Call this before accepting requests to avoid "no such table" errors.
 */
async function awaitReady() {
  await Promise.all(initPromises);
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
  getChDb,
  awaitReady,
  getClient,
  query,
  getPostgresCredentials,
  loadConfig
};
