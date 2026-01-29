const { readFileSync } = require("fs");
const { join } = require("path");

const configDir = join(__dirname, "./configs");

/**
 * Load database configuration from a config file
 * @param {string} envName - The environment name (e.g., 'dms', 'auth', 'development')
 * @returns {Object} Database configuration object
 *
 * Config file format for PostgreSQL (new format):
 * {
 *   "type": "postgres",
 *   "role": "dms",
 *   "host": "localhost",
 *   "port": 5432,
 *   "database": "mydb",
 *   "user": "postgres",
 *   "password": "secret"
 * }
 *
 * Config file format for PostgreSQL (legacy format - auto-detected):
 * {
 *   "host": "localhost",
 *   "port": 5432,
 *   "database": "mydb",
 *   "user": "postgres",
 *   "password": "secret",
 *   "type": "dms"  // This is actually the role in legacy format
 * }
 *
 * Config file format for SQLite:
 * {
 *   "type": "sqlite",
 *   "role": "dms",
 *   "filename": "./data/mydb.sqlite"
 * }
 */
function loadConfig(envName) {
  const configFileName = `${envName}.config.json`;
  const configFilePath = join(configDir, configFileName);

  try {
    const str = readFileSync(configFilePath, { encoding: "utf8" });
    const rawConfig = JSON.parse(str);

    // Normalize configuration to new format
    const config = normalizeConfig(rawConfig);

    // Validate type-specific fields
    if (config.type === "postgres") {
      if (!config.database) {
        throw new Error(`PostgreSQL config must specify a "database" field`);
      }
    } else if (config.type === "sqlite") {
      if (!config.filename) {
        throw new Error(`SQLite config must specify a "filename" field`);
      }
      // Resolve relative paths from the config directory
      if (!config.filename.startsWith("/")) {
        config.filename = join(configDir, config.filename);
      }
    }

    return config;
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`No configuration file found for environment "${envName}" at ${configFilePath}`);
    }
    throw err;
  }
}

/**
 * Normalize config to handle both legacy and new formats
 * Legacy format: { host, port, database, user, password, type: "dms"|"auth"|"dama" }
 * New format: { type: "postgres"|"sqlite", role: "dms"|"auth"|"dama", ... }
 */
function normalizeConfig(rawConfig) {
  const config = { ...rawConfig };

  // Check if this is new format (type is "postgres" or "sqlite")
  if (config.type === "postgres" || config.type === "sqlite") {
    // New format - already normalized
    return config;
  }

  // Legacy format detection:
  // If has host/database, it's PostgreSQL with type used as role
  if (config.host && config.database) {
    const role = config.type; // Legacy uses type as role
    config.type = "postgres";
    config.role = role;
    return config;
  }

  // If has filename, it's SQLite with type possibly used as role
  if (config.filename) {
    const role = config.type;
    config.type = "sqlite";
    config.role = role;
    return config;
  }

  // Default to postgres if we have typical postgres fields
  if (config.user && config.password) {
    const role = config.type;
    config.type = "postgres";
    config.role = role;
    return config;
  }

  throw new Error(`Cannot determine database type from config. Specify "type": "postgres" or "type": "sqlite"`);
}


module.exports = {
  loadConfig,
  configDir
};
