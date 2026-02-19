/**
 * Configuration resolution for DMS CLI
 *
 * Priority (highest first):
 * 1. CLI flags
 * 2. Environment variables
 * 3. .dmsrc file (searched up from cwd)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Find .dmsrc file by walking up from cwd
 */
function findConfigFile(startDir = process.cwd()) {
  let dir = startDir;

  while (dir !== '/') {
    const configPath = join(dir, '.dmsrc');
    if (existsSync(configPath)) {
      return configPath;
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * Load config from .dmsrc file
 */
function loadFileConfig() {
  const configPath = findConfigFile();

  if (!configPath) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Warning: Failed to parse ${configPath}: ${e.message}`);
    return {};
  }
}

/**
 * Load config from environment variables
 */
function loadEnvConfig() {
  const config = {};

  if (process.env.DMS_HOST) {
    config.host = process.env.DMS_HOST;
  }

  if (process.env.DMS_APP) {
    config.app = process.env.DMS_APP;
  }

  if (process.env.DMS_TYPE) {
    config.type = process.env.DMS_TYPE;
  }

  if (process.env.DMS_AUTH_TOKEN) {
    config.authToken = process.env.DMS_AUTH_TOKEN;
  }

  return config;
}

/**
 * Remove undefined values from an object
 */
function removeUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Resolve final configuration
 *
 * @param {Object} cliOptions - Options passed via CLI flags
 * @returns {Object} - Merged configuration
 */
export function resolveConfig(cliOptions = {}) {
  // Load in order of lowest to highest priority
  const fileConfig = loadFileConfig();
  const envConfig = loadEnvConfig();

  // Remove undefined values before merging so they don't overwrite
  const cleanCliOptions = removeUndefined(cliOptions);
  const cleanEnvConfig = removeUndefined(envConfig);

  // Merge with CLI options taking precedence
  const config = {
    ...fileConfig,
    ...cleanEnvConfig,
    ...cleanCliOptions,
  };

  return config;
}

/**
 * Validate required configuration
 *
 * @param {Object} config - Configuration to validate
 * @param {string[]} required - Required fields
 * @throws {Error} - If required fields are missing
 */
export function validateConfig(config, required = ['host']) {
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}\n` +
      `Set via CLI flags (--${missing[0]}), environment variables (DMS_${missing[0].toUpperCase()}), or .dmsrc file.`
    );
  }
}

export default { resolveConfig, validateConfig };
