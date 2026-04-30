const { readFileSync } = require("fs");
const { join } = require("path");

const configDir = join(__dirname, "./configs");

/**
 * Load database configuration from a config file
 * @param {string} envName - The environment name (e.g., 'dms', 'auth', 'development')
 * @returns {Object} Database configuration object
 *
 * Config file format — PostgreSQL:
 * {
 *   "type": "postgres",
 *   "role": "dms" | "auth" | "dama" | ["dms", "auth"],
 *   "host": "localhost",
 *   "port": 5432,
 *   "database": "mydb",
 *   "user": "postgres",
 *   "password": "secret"
 * }
 *
 * Config file format — SQLite:
 * {
 *   "type": "sqlite",
 *   "role": "dms",
 *   "filename": "./data/mydb.sqlite"
 * }
 *
 * `type` and `role` are both REQUIRED. There is no inference, no legacy
 * fallback, no default — a missing or invalid field throws at load time.
 * This is intentional: an omitted `type` used to silently route the
 * config into the wrong role (or no role), leaving the caller staring at
 * "relation X does not exist" errors. Fail fast at config load instead.
 */
function loadConfig(envName) {
  const configFileName = `${envName}.config.json`;
  const configFilePath = join(configDir, configFileName);

  try {
    const str = readFileSync(configFilePath, { encoding: "utf8" });
    const config = JSON.parse(str);

    if (config.type !== "postgres" && config.type !== "sqlite") {
      throw new Error(
        `Config "${envName}" is missing or has an invalid "type" — set "type": "postgres" or "type": "sqlite"`
      );
    }
    if (!config.role) {
      throw new Error(
        `Config "${envName}" is missing "role" — set "role": "dms" | "auth" | "dama" (or an array of those)`
      );
    }

    if (config.type === "postgres") {
      if (!config.database) {
        throw new Error(`PostgreSQL config "${envName}" must specify a "database" field`);
      }
    } else {
      if (!config.filename) {
        throw new Error(`SQLite config "${envName}" must specify a "filename" field`);
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
 * Find all config names that include a given role.
 * Scans all *.config.json files in the configs directory.
 * @param {string} role - Role to match (e.g., 'dama', 'dms', 'auth')
 * @returns {string[]} Array of config names (without .config.json suffix)
 */
function findConfigsByRole(role) {
  const { readdirSync } = require('fs');
  const files = readdirSync(configDir).filter(f => f.endsWith('.config.json'));
  const matches = [];

  for (const file of files) {
    try {
      const config = loadConfig(file.replace('.config.json', ''));
      const roles = Array.isArray(config.role) ? config.role : [config.role];
      if (roles.includes(role)) {
        matches.push(file.replace('.config.json', ''));
      }
    } catch (e) {
      // Skip configs that fail to load
    }
  }

  return matches;
}

module.exports = {
  loadConfig,
  configDir,
  findConfigsByRole
};
