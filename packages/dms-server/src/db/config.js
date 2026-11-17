const { readFileSync, readdirSync, existsSync, statSync } = require("fs");
const { resolveSplitMode } = require("./table-resolver.js");
const { join, resolve, dirname } = require("path");

// The built-in config folder. It is always searched, last, so configs kept here keep working.
const configDir = join(__dirname, "./configs");

/**
 * The folders searched for `<name>.config.json`, in order: each entry of DMS_DB_CONFIG_DIRS (colon-separated,
 * relative entries resolved against the working directory, like DMS_EXTRA_DATATYPES), then the built-in
 * `src/db/configs`. Read on every call, so a script can set the variable before loading a config.
 *
 * A folder named in DMS_DB_CONFIG_DIRS that doesn't exist throws: a typo there would otherwise surface later as
 * "no configuration file found" for a config that is sitting in the folder that was meant.
 *
 * @param {string[]} [dirs] - Use these folders instead of DMS_DB_CONFIG_DIRS (the built-in one is still added).
 * @returns {string[]} Absolute folder paths, without duplicates.
 */
function configDirs(dirs) {
  const extra = dirs || String(process.env.DMS_DB_CONFIG_DIRS || "").split(":");
  const out = [];
  for (const d of extra.map(d => String(d).trim()).filter(Boolean)) {
    const abs = resolve(d);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(`DB config folder ${abs} doesn't exist (from ${dirs ? "the dirs passed in" : "DMS_DB_CONFIG_DIRS"})`);
    }
    out.push(abs);
  }
  out.push(configDir);
  return [...new Set(out)];
}

/**
 * Where `<envName>.config.json` is. A name found in more than one folder throws, so it's never a question which
 * database a name opens.
 * @param {string} envName
 * @param {{dirs?: string[]}} [opts] - See configDirs.
 * @returns {string|null} The file's absolute path, or null when no folder has it.
 */
function resolveConfigPath(envName, opts = {}) {
  const fileName = `${envName}.config.json`;
  const found = configDirs(opts.dirs).map(d => join(d, fileName)).filter(f => existsSync(f));
  if (found.length > 1) {
    throw new Error(`Config "${envName}" is in more than one config folder: ${found.join(", ")}. Keep one.`);
  }
  return found[0] || null;
}

/**
 * Load database configuration from a config file
 * @param {string} envName - The environment name (e.g., 'dms', 'auth', 'development'): the file
 *   `<envName>.config.json` in one of the config folders (configDirs: DMS_DB_CONFIG_DIRS, then src/db/configs)
 * @param {{dirs?: string[]}} [opts] - Search these folders instead of DMS_DB_CONFIG_DIRS (see configDirs)
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
 *   "filename": "./data/mydb.sqlite"   // relative to the folder the config is in
 * }
 *
 * Optional `"readOnly": true` (postgres, role "dama" only): the server reads the
 * database but never changes it. No schema init or migrations run on it, no task
 * polling or schedule sweep starts for it, and its connections refuse writes.
 *
 * `splitMode` is resolved here, once, for every config returned: the file's value, else
 * DMS_SPLIT_MODE, else "per-app" (db/table-resolver.js resolveSplitMode). A legacy-layout
 * database must say "splitMode": "legacy". Any other value throws at load.
 *
 * `type` and `role` are both REQUIRED. There is no inference, no legacy
 * fallback, no default — a missing or invalid field throws at load time.
 * This is intentional: an omitted `type` used to silently route the
 * config into the wrong role (or no role), leaving the caller staring at
 * "relation X does not exist" errors. Fail fast at config load instead.
 */
function loadConfig(envName, opts = {}) {
  const configFilePath = resolveConfigPath(envName, opts);
  if (!configFilePath) {
    const hint = !opts.dirs && !process.env.DMS_DB_CONFIG_DIRS
      ? ". DMS_DB_CONFIG_DIRS is not set: a script run without the app's .env (node --env-file=.env) only sees the built-in folder"
      : "";
    throw new Error(`No configuration file found for environment "${envName}" (${envName}.config.json in ${configDirs(opts.dirs).join(", ")})${hint}`);
  }

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

    // Table layout, resolved once so every reader sees the same answer: config > DMS_SPLIT_MODE > per-app.
    config.splitMode = resolveSplitMode(config, envName);

    if (config.readOnly !== undefined && typeof config.readOnly !== "boolean") {
      throw new Error(`Config "${envName}": "readOnly" must be true or false`);
    }
    if (config.readOnly) {
      // A read-only DAMA config lets a server read a shared DAMA database it must never change, such as a
      // second server's view of production's. Its DMS and auth databases have to be writable, so only a
      // dama-only Postgres config can be read-only.
      const roles = Array.isArray(config.role) ? config.role : [config.role];
      if (config.type !== "postgres" || roles.some(r => r !== "dama")) {
        throw new Error(`Config "${envName}": "readOnly" is only for postgres configs whose role is "dama"`);
      }
      // Every connection made from this config (the adapter's pool, getClient, a worker's own pg.Client)
      // starts its transactions read-only, so Postgres refuses writes. A read-only database user is the
      // stronger guard: a session can turn this setting off.
      config.options = [config.options, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
    }

    if (config.type === "postgres") {
      if (!config.database) {
        throw new Error(`PostgreSQL config "${envName}" must specify a "database" field`);
      }
    } else {
      if (!config.filename) {
        throw new Error(`SQLite config "${envName}" must specify a "filename" field`);
      }
      // Resolve relative paths from the folder the config was found in
      if (!config.filename.startsWith("/")) {
        config.filename = join(dirname(configFilePath), config.filename);
      }
    }

    return config;
  } catch (err) {
    if (err.code === "ENOENT") { // removed between the lookup and the read
      throw new Error(`No configuration file found for environment "${envName}" at ${configFilePath}`);
    }
    throw err;
  }
}


/**
 * Find all config names that include a given role.
 * Scans all *.config.json files in every config folder (configDirs).
 * @param {string} role - Role to match (e.g., 'dama', 'dms', 'auth')
 * @param {{dirs?: string[]}} [opts] - See configDirs.
 * @returns {string[]} Array of config names (without .config.json suffix)
 */
function findConfigsByRole(role, opts = {}) {
  const files = [...new Set(configDirs(opts.dirs).flatMap(d => readdirSync(d)).filter(f => f.endsWith('.config.json')))];
  const matches = [];

  for (const file of files) {
    // Outside the try: a name in two folders is an error to see, not a config to skip.
    resolveConfigPath(file.replace('.config.json', ''), opts);
    try {
      const config = loadConfig(file.replace('.config.json', ''), opts);
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

/**
 * Whether a config is "readOnly". A config that can't be loaded counts as not read-only, so callers keep
 * their usual handling (and error) for it.
 * @param {string} envName
 * @returns {boolean}
 */
function isReadOnly(envName) {
  try {
    return loadConfig(envName).readOnly === true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  loadConfig,
  resolveSplitMode,
  configDir,
  configDirs,
  resolveConfigPath,
  findConfigsByRole,
  isReadOnly
};
