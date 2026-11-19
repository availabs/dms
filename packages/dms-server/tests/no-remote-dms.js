'use strict';
/**
 * Preloaded by `npm test` (NODE_OPTIONS=--require): refuses any DMS database config that points at a
 * Postgres server other than this machine. On a dev machine the untracked `dms-sqlite` config can name
 * a production server; tests that once defaulted to it wrote test-run schemas into prod (2026-11-18).
 * Tests default to `dms-sqlite-test` (a local SQLite file) and Postgres tests use the Docker test
 * server on localhost. DMS_TEST_ALLOW_REMOTE=1 lifts the check for a deliberate run.
 */
const config = require('../src/db/config');

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '']);
const original = config.loadConfig;

config.loadConfig = function loadConfig(envName) {
  const c = original(envName);
  const roles = [].concat(c.role || []);
  if (c.type === 'postgres' && roles.includes('dms') && !LOCAL.has(String(c.host || '')) && process.env.DMS_TEST_ALLOW_REMOTE !== '1') {
    throw new Error(`tests refuse DMS config "${envName}": it points at ${c.host}, not this machine. Use dms-sqlite-test or a local Postgres (DMS_TEST_ALLOW_REMOTE=1 to override)`);
  }
  return c;
};
