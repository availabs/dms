/**
 * Datatype plugin system tests.
 * Tests the registration API, route mounting, worker integration, and PMTiles plugin.
 */

const DAMA_TEST_DB = process.env.DAMA_TEST_DB || 'dama-sqlite-test';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

async function setup() {
  const { join } = require('path');
  const { unlinkSync, existsSync } = require('fs');
  const configPath = join(__dirname, '..', 'src', 'db', 'configs', `${DAMA_TEST_DB}.config.json`);
  const config = require(configPath);
  if (config.type === 'sqlite' && config.filename) {
    const dbPath = join(__dirname, '..', 'src', 'db', 'configs', config.filename);
    if (existsSync(dbPath)) unlinkSync(dbPath);
  }

  const { getDb, awaitReady } = require('../src/db');
  getDb(DAMA_TEST_DB);
  await awaitReady();
}

async function runTests() {
  console.log(`\n=== Datatype Plugin System Tests (${DAMA_TEST_DB}) ===\n`);
  await setup();

  // Fresh registry for each test run — need to reimport to get clean state
  // But since require() is cached, we test with the shared instance
  const { registerDatatype, mountDatatypeRoutes, getDatatypes } = require('../src/dama/datatypes');
  const tasks = require('../src/dama/tasks');

  // --- Registration ---

  await test('registerDatatype stores definition', async () => {
    registerDatatype('test-dt', {
      workers: {},
      routes: () => {},
    });
    const dts = getDatatypes();
    assert(dts['test-dt'], 'test-dt should be registered');
  });

  await test('registerDatatype registers workers via task system', async () => {
    let handlerCalled = false;
    registerDatatype('test-worker-dt', {
      workers: {
        'test-worker-dt/run': async (ctx) => {
          handlerCalled = true;
          return { ran: true };
        },
      },
    });

    // Queue and execute the worker
    const taskId = await tasks.queueTask({ workerPath: 'test-worker-dt/run' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    assert(handlerCalled, 'plugin worker should have been called');
    const status = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(status.status === 'done', `task should be done, got ${status.status}`);
  });

  await test('getDatatypes returns all registered plugins', async () => {
    const dts = getDatatypes();
    assert(dts['test-dt'], 'should include test-dt');
    assert(dts['test-worker-dt'], 'should include test-worker-dt');
  });

  // --- Route mounting ---

  await test('mountDatatypeRoutes mounts routes on Express app', async () => {
    let routeFnCalled = false;
    let receivedHelpers = null;

    registerDatatype('test-routes-dt', {
      routes: (router, helpers) => {
        routeFnCalled = true;
        receivedHelpers = helpers;
        router.get('/status', (req, res) => res.json({ ok: true }));
      },
    });

    // Create a mock Express app to verify mounting
    const express = require('express');
    const app = express();
    const helpers = {
      queueTask: tasks.queueTask,
      getDb: require('../src/db').getDb,
      storage: require('../src/dama/storage'),
    };

    mountDatatypeRoutes(app, helpers);

    assert(routeFnCalled, 'routes function should have been called');
    assert(receivedHelpers.queueTask === tasks.queueTask, 'helpers should include queueTask');
    assert(receivedHelpers.storage, 'helpers should include storage');
  });

  await test('plugin routes receive correct helpers', async () => {
    let helpersSnapshot = null;

    registerDatatype('test-helpers-dt', {
      routes: (router, helpers) => {
        helpersSnapshot = helpers;
      },
    });

    const express = require('express');
    const app = express();
    const helpers = {
      queueTask: tasks.queueTask,
      getTaskStatus: tasks.getTaskStatus,
      getTaskEvents: tasks.getTaskEvents,
      dispatchEvent: tasks.dispatchEvent,
      createDamaSource: require('../src/dama/upload/metadata').createDamaSource,
      createDamaView: require('../src/dama/upload/metadata').createDamaView,
      ensureSchema: require('../src/dama/upload/metadata').ensureSchema,
      getDb: require('../src/db').getDb,
      loadConfig: require('../src/db').loadConfig,
      storage: require('../src/dama/storage'),
    };

    mountDatatypeRoutes(app, helpers);

    assert(helpersSnapshot, 'helpers should be passed to routes function');
    assert(typeof helpersSnapshot.queueTask === 'function', 'queueTask should be a function');
    assert(typeof helpersSnapshot.createDamaSource === 'function', 'createDamaSource should be a function');
    assert(typeof helpersSnapshot.getDb === 'function', 'getDb should be a function');
    assert(helpersSnapshot.storage, 'storage should be present');
    assert(typeof helpersSnapshot.storage.write === 'function', 'storage.write should be a function');
  });

  // --- PMTiles plugin ---

  await test('PMTiles plugin loads without error', async () => {
    const pmtiles = require('../src/dama/datatypes/pmtiles');
    assert(pmtiles.workers, 'should have workers');
    assert(pmtiles.workers['pmtiles/generate'], 'should have pmtiles/generate worker');
    assert(typeof pmtiles.routes === 'function', 'should have routes function');
  });

  await test('PMTiles plugin registers via registerDatatype', async () => {
    // This may already be registered from module load, but re-registering should be safe
    const pmtiles = require('../src/dama/datatypes/pmtiles');
    registerDatatype('pmtiles', pmtiles);
    const dts = getDatatypes();
    assert(dts.pmtiles, 'pmtiles should be registered');
    assert(dts.pmtiles.workers['pmtiles/generate'], 'pmtiles worker should be present');
  });

  await test('PMTiles route mounts and accepts requests', async () => {
    const express = require('express');
    const app = express();
    app.use(express.json());

    const helpers = { queueTask: tasks.queueTask };
    mountDatatypeRoutes(app, helpers);

    // Verify the route exists by checking the Express router stack
    const routes = [];
    app._router.stack.forEach(layer => {
      if (layer.route) {
        routes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle?.stack) {
        layer.handle.stack.forEach(r => {
          if (r.route) {
            routes.push(`${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
          }
        });
      }
    });

    // The pmtiles route should be mounted
    // Note: it's mounted under /dama-admin/:pgEnv/pmtiles/ so the subroute is /cache-pmtiles
    // Express stores the inner route path, not the full mounted path
    const hasPmtilesRoute = routes.some(r => r.includes('cache-pmtiles'));
    assert(hasPmtilesRoute, `should have cache-pmtiles route, found: ${routes.join('; ')}`);
  });

  // --- Plugin with failing worker ---

  await test('plugin worker failure propagates correctly', async () => {
    registerDatatype('test-fail-dt', {
      workers: {
        'test-fail-dt/crash': async () => {
          throw new Error('plugin worker crashed');
        },
      },
    });

    const taskId = await tasks.queueTask({ workerPath: 'test-fail-dt/crash' }, DAMA_TEST_DB);
    const claimed = await tasks.claimNextTask(DAMA_TEST_DB);
    await tasks.startTaskWorker(claimed, DAMA_TEST_DB);

    const status = await tasks.getTaskStatus(taskId, DAMA_TEST_DB);
    assert(status.status === 'error', `should be error, got ${status.status}`);
    assert(status.error.includes('plugin worker crashed'), 'error message should propagate');
  });

  // --- Summary ---

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
