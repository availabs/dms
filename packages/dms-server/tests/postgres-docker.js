/**
 * Docker-based PostgreSQL lifecycle for tests.
 *
 * Provides start/stop/waitReady functions plus a CLI:
 *   node tests/postgres-docker.js start   — spin up container
 *   node tests/postgres-docker.js stop    — tear down container
 *   node tests/postgres-docker.js run     — start, run all PG tests, stop (even on failure)
 *
 * Container config:
 *   Image:     postgres:17-alpine
 *   Port:      5499 (host) → 5432 (container)
 *   Database:  dms_test
 *   User:      dms_test
 *   Password:  dms_test
 *   Name:      dms-test-postgres
 */

const { execSync, spawn } = require('child_process');
const net = require('net');

const CONTAINER = 'dms-test-postgres';
const IMAGE = 'postgres:17-alpine';
const PORT = 5499;
const DB = 'dms_test';
const USER = 'dms_test';
const PASS = 'dms_test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function hasDocker() {
  try {
    exec('docker --version');
    return true;
  } catch (_) {
    return false;
  }
}

function isRunning() {
  try {
    const out = exec(`docker inspect -f "{{.State.Running}}" ${CONTAINER} 2>/dev/null`);
    return out === 'true';
  } catch (_) {
    return false;
  }
}

function containerExists() {
  try {
    exec(`docker inspect ${CONTAINER} 2>/dev/null`);
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function start() {
  if (!hasDocker()) {
    throw new Error('Docker is not installed or not in PATH');
  }

  if (isRunning()) {
    console.log(`Container ${CONTAINER} is already running on port ${PORT}`);
    return;
  }

  // Remove stale stopped container if exists
  if (containerExists()) {
    try { exec(`docker rm -f ${CONTAINER}`); } catch (_) {}
  }

  console.log(`Starting PostgreSQL container (${IMAGE}) on port ${PORT}...`);
  exec([
    'docker run -d',
    `--name ${CONTAINER}`,
    `-p ${PORT}:5432`,
    `-e POSTGRES_DB=${DB}`,
    `-e POSTGRES_USER=${USER}`,
    `-e POSTGRES_PASSWORD=${PASS}`,
    IMAGE,
  ].join(' '));

  console.log(`Container ${CONTAINER} started`);
}

function stop() {
  if (!hasDocker()) return;

  if (containerExists()) {
    console.log(`Stopping container ${CONTAINER}...`);
    try { exec(`docker stop ${CONTAINER}`); } catch (_) {}
    // --rm flag not used in start(), so remove explicitly
    try { exec(`docker rm -f ${CONTAINER}`); } catch (_) {}
    console.log('Container stopped and removed');
  } else {
    console.log('No container to stop');
  }
}

/**
 * Wait for PostgreSQL to be fully ready (timeout 30s).
 * The postgres Docker image starts PG, runs init scripts, then restarts.
 * We need to wait for the FINAL ready state, so we require pg_isready
 * to succeed twice with a 1s gap (survives the restart cycle).
 */
async function waitReady(timeoutMs = 30000) {
  const startTime = Date.now();
  let consecutiveOk = 0;
  while (Date.now() - startTime < timeoutMs) {
    try {
      exec(`docker exec ${CONTAINER} pg_isready -U ${USER} -d ${DB}`);
      consecutiveOk++;
      if (consecutiveOk >= 2) {
        console.log(`PostgreSQL ready on port ${PORT}`);
        return;
      }
      // Wait before second check to survive the init restart
      await new Promise(r => setTimeout(r, 1000));
    } catch (_) {
      consecutiveOk = 0;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(`PostgreSQL did not become ready within ${timeoutMs}ms`);
}

/**
 * Reset the test database: drop all schemas and re-initialize from SQL files.
 * Pipes the PostgreSQL schema scripts into psql inside the container.
 * This ensures tables exist before getDb()'s async init fires.
 */
function resetDb() {
  const path = require('path');
  const fs = require('fs');

  console.log('Resetting test database...');

  // Drop everything
  const dropSql = [
    "DROP SCHEMA IF EXISTS dms CASCADE;",
    "DROP SCHEMA IF EXISTS public CASCADE;",
    "CREATE SCHEMA public;",
  ].join(' ');
  exec(`docker exec ${CONTAINER} psql -U ${USER} -d ${DB} -c "${dropSql}"`);

  // Run DMS schema
  const dmsSQL = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'db', 'sql', 'dms', 'dms.sql'), 'utf8'
  );
  execSync(`docker exec -i ${CONTAINER} psql -U ${USER} -d ${DB}`, {
    input: dmsSQL, stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Run auth schema
  const authSQL = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'db', 'sql', 'auth', 'auth_tables.sql'), 'utf8'
  );
  execSync(`docker exec -i ${CONTAINER} psql -U ${USER} -d ${DB}`, {
    input: authSQL, stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log('Database reset (DMS + auth schemas initialized)');
}

// ---------------------------------------------------------------------------
// CLI: run tests
// ---------------------------------------------------------------------------

/**
 * Run a command as a child process, inheriting stdio.
 * Returns a promise that resolves to the exit code.
 */
function spawnAsync(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: require('path').join(__dirname, '..'),
    });
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}

async function runTests(testScript) {
  start();
  await waitReady();
  resetDb();

  const env = {
    DMS_TEST_DB: 'dms-postgres-test',
    DMS_AUTH_DB_ENV: 'auth-postgres-test',
    DMS_DB_ENV: 'dms-postgres-test',
  };

  let exitCode = 0;
  try {
    if (testScript) {
      // Run a specific test
      exitCode = await spawnAsync('node', [testScript], env);
    } else {
      // Run all parameterized tests (skip test-sqlite.js and test-controller.js — SQLite-specific)
      for (const test of ['tests/test-graph.js', 'tests/test-workflow.js', 'tests/test-auth.js']) {
        console.log(`\n========== ${test} ==========\n`);
        const code = await spawnAsync('node', [test], env);
        if (code !== 0) {
          exitCode = code;
          break;
        }
      }
    }
  } finally {
    stop();
  }

  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const [,, cmd, arg] = process.argv;

  switch (cmd) {
    case 'start':
      start();
      waitReady().catch(e => { console.error(e.message); process.exit(1); });
      break;
    case 'stop':
      stop();
      break;
    case 'run':
      runTests(arg).catch(e => { console.error(e.message); stop(); process.exit(1); });
      break;
    case 'reset':
      resetDb();
      break;
    default:
      console.log('Usage: node postgres-docker.js <start|stop|run|reset> [test-file]');
      console.log('  start         Start PostgreSQL container');
      console.log('  stop          Stop and remove container');
      console.log('  run [file]    Start, run tests, stop (even on failure)');
      console.log('  reset         Drop and recreate schemas in running container');
      process.exit(1);
  }
}

module.exports = { start, stop, waitReady, resetDb, isRunning, hasDocker, CONTAINER, PORT, DB, USER, PASS };
