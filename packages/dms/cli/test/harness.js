/**
 * Test harness — server lifecycle, CLI runner, and assertions
 *
 * Manages a child-process dms-server with DMS_DB_ENV=cli-test,
 * runs CLI commands via execSync, and provides assertion helpers.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_DIR = resolve(__dirname, '..');
const CLI_BIN = join(CLI_DIR, 'bin', 'dms.js');
// DMS_TEST_SERVER_DIR: run a different dms-server checkout (e.g. a copy whose
// db/configs holds only local sqlite configs, when this checkout's gitignored
// configs point at an unreachable remote — the server blocks on startup
// connecting to every `dama`-role config it finds).
const SERVER_DIR = process.env.DMS_TEST_SERVER_DIR
  ? resolve(process.env.DMS_TEST_SERVER_DIR)
  : resolve(__dirname, '..', '..', '..', 'dms-server');
const SERVER_ENTRY = join(SERVER_DIR, 'src', 'index.js');
const SQLITE_PATH = join(SERVER_DIR, 'src', 'db', 'data', 'cli-test.sqlite');

const PORT = process.env.DMS_TEST_PORT || 3456;
const HOST = `http://localhost:${PORT}`;
const APP = 'cli-test';
const TYPE = 'cli-test-site';

// Test counters
let passed = 0;
let failed = 0;
let testName = '';

/**
 * Start the dms-server as a subprocess
 */
export async function startServer() {
  // Delete old SQLite database for a clean start
  if (existsSync(SQLITE_PATH)) {
    unlinkSync(SQLITE_PATH);
    console.log('  Deleted old test database');
  }

  const server = spawn('node', [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      DMS_DB_ENV: 'cli-test',
      // Point auth at the same SQLite file — the cli-test config carries
      // role: ["dms", "auth"] so initAuth runs there too.
      DMS_AUTH_DB_ENV: 'cli-test',
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Capture output for debugging
  let serverOutput = '';
  server.stdout.on('data', (data) => { serverOutput += data.toString(); });
  server.stderr.on('data', (data) => { serverOutput += data.toString(); });

  // Poll until server is ready
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${HOST}/`);
      if (res.ok) {
        console.log(`  Server ready on port ${PORT}`);
        return server;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }

  server.kill('SIGTERM');
  throw new Error(`Server failed to start after ${maxAttempts * 500}ms. Output:\n${serverOutput}`);
}

// Session token for the test admin — set by authenticate(). Deletes require
// an authenticated user (dms.route.js / sync.js "Authentication required to
// delete items"), so every CLI call runs logged in.
let AUTH_TOKEN = null;

/**
 * Create the test admin on the fresh DB (POST /init/setup) and log in.
 */
export async function authenticate() {
  const creds = { email: 'cli-test@test.com', password: 'CliTestPass1', project: APP };
  const post = async (path, body) => {
    const res = await fetch(`${HOST}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  };
  const setup = await post('/init/setup', creds);
  if (setup.error) throw new Error(`init/setup failed: ${setup.error}`);
  const login = await post('/login', creds);
  if (!login.user?.token) throw new Error(`login failed: ${JSON.stringify(login)}`);
  AUTH_TOKEN = login.user.token;
  console.log(`  Logged in as ${creds.email}`);
}

/**
 * Stop the server
 */
export function stopServer(server) {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    console.log('  Server stopped');
  }
}

/**
 * Run the CLI with given args, return parsed output
 *
 * @param {string} args - CLI arguments (without the 'dms' prefix)
 * @param {Object} opts - { stdin, expectError }
 * @returns {{ stdout: string, stderr: string, exitCode: number, json: any }}
 */
export function runCli(args, opts = {}) {
  const baseArgs = `--host ${HOST} --app ${APP} --type ${TYPE}${AUTH_TOKEN ? ` --auth-token ${AUTH_TOKEN}` : ''}`;
  const cmd = `node ${CLI_BIN} ${baseArgs} ${args}`;

  try {
    const stdout = execSync(cmd, {
      cwd: CLI_DIR,
      encoding: 'utf-8',
      input: opts.stdin || undefined,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let json = null;
    try { json = JSON.parse(stdout); } catch {}

    return { stdout: stdout.trim(), stderr: '', exitCode: 0, json };
  } catch (error) {
    if (opts.expectError) {
      return {
        stdout: (error.stdout || '').trim(),
        stderr: (error.stderr || '').trim(),
        exitCode: error.status || 1,
        json: null,
      };
    }
    throw new Error(
      `CLI command failed: ${cmd}\n` +
      `Exit code: ${error.status}\n` +
      `stdout: ${error.stdout}\n` +
      `stderr: ${error.stderr}`
    );
  }
}

/**
 * Run the seed script and return the manifest
 */
export function seed() {
  const cmd = `node ${join(CLI_DIR, 'test', 'seed.js')} ${HOST} ${APP} ${TYPE}`;
  const stdout = execSync(cmd, {
    cwd: CLI_DIR,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(stdout);
}

/**
 * Test group header
 */
export function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

/**
 * Async test group — for tests that need awaits between CLI calls
 * (e.g. a live WebSocket room member).
 */
export async function describeAsync(name, fn) {
  console.log(`\n  ${name}`);
  await fn();
}

/**
 * Start a test
 */
export function test(name) {
  testName = name;
}

/**
 * Assert a condition
 */
export function assert(condition, message) {
  if (!condition) {
    failed++;
    console.log(`    ✗ ${testName}: ${message || 'assertion failed'}`);
    return false;
  }
  return true;
}

/**
 * Assert equality
 */
export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failed++;
    console.log(`    ✗ ${testName}: ${message || ''} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return false;
  }
  return true;
}

/**
 * Assert value includes substring
 */
export function assertIncludes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    failed++;
    console.log(`    ✗ ${testName}: ${message || ''} — expected to include "${needle}"`);
    return false;
  }
  return true;
}

/**
 * Mark current test as passed (call after all assertions pass)
 */
export function pass() {
  passed++;
  console.log(`    ✓ ${testName}`);
}

/**
 * Print test summary and return exit code
 */
export function summary() {
  const total = passed + failed;
  console.log(`\n  ${total} tests: ${passed} passed, ${failed} failed\n`);
  return failed > 0 ? 1 : 0;
}

export { HOST };

export default {
  startServer, stopServer, authenticate, runCli, seed, describe, describeAsync, test,
  assert, assertEqual, assertIncludes, pass, summary,
};
