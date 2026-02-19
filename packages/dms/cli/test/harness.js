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
const SERVER_DIR = resolve(__dirname, '..', '..', '..', 'dms-server');
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
  const baseArgs = `--host ${HOST} --app ${APP} --type ${TYPE}`;
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

export default {
  startServer, stopServer, runCli, seed, describe, test,
  assert, assertEqual, assertIncludes, pass, summary,
};
