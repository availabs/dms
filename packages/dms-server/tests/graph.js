/**
 * Test Graph Harness
 *
 * Creates a Falcor router that can be called directly in tests without HTTP.
 * Simulates what falcor-express does but returns results via callback.
 *
 * Usage:
 *   const { createTestGraph } = require('./graph');
 *   const graph = createTestGraph('dms-sqlite');
 *
 *   // GET request
 *   graph.get([['dms', 'data', 'myapp+mytype', 'length']], (error, { jsonGraph }) => {
 *     console.log(jsonGraph.dms.data['myapp+mytype'].length);
 *   });
 *
 *   // CALL request (create, edit, delete)
 *   graph.call(['dms', 'data', 'create'], ['myapp', 'mytype'], (error, { jsonGraph }) => {
 *     // ...
 *   });
 */

const Router = require('../src/utils/falcor-router/src/Router');
const { createRoutes } = require('../src/routes/dms/dms.route');
const { createController } = require('../src/routes/dms/dms.controller');

/**
 * Create a test graph with configurable database
 * @param {string} dbName - Database config name (e.g., 'dms-sqlite')
 * @param {Object} options - Router options
 * @param {Object} options.user - User object for authenticated routes
 * @returns {Object} Test graph with get, set, call methods
 */
function createTestGraph(dbName = 'dms-sqlite', options = {}) {
  const controller = createController(dbName);
  const routes = createRoutes(controller);

  const BaseRouter = Router.createClass(routes);

  class TestRouter extends BaseRouter {
    constructor(config) {
      super({ maxPaths: 4000000 });
      this.user = config.user || null;
    }
  }

  const router = new TestRouter(options);

  /**
   * Helper to convert Observable to callback
   */
  function observableToCallback(obs, callback) {
    obs.subscribe(
      (jsonGraphEnvelope) => {
        callback(null, jsonGraphEnvelope);
      },
      (error) => {
        callback(error, null);
      }
    );
  }

  return {
    /**
     * The underlying controller (for direct access if needed)
     */
    controller,

    /**
     * The database type ('postgres' or 'sqlite')
     */
    dbType: controller.dbType,

    /**
     * Execute a GET request
     * @param {Array} paths - Array of path arrays, e.g., [['dms', 'data', 'app+type', 'length']]
     * @param {Function} callback - Callback(error, { jsonGraph })
     */
    get(paths, callback) {
      const obs = router.get(paths);
      observableToCallback(obs, callback);
    },

    /**
     * Execute a SET request
     * @param {Object} jsonGraph - JSON Graph envelope with paths and values
     * @param {Function} callback - Callback(error, { jsonGraph })
     */
    set(jsonGraph, callback) {
      const obs = router.set(jsonGraph);
      observableToCallback(obs, callback);
    },

    /**
     * Execute a CALL request (create, edit, delete operations)
     * @param {Array} callPath - Path to the function, e.g., ['dms', 'data', 'create']
     * @param {Array} args - Arguments to pass to the function
     * @param {Function} callback - Callback(error, { jsonGraph })
     * @param {Array} [refPaths] - Optional reference paths
     * @param {Array} [thisPaths] - Optional this paths
     */
    call(callPath, args, callback, refPaths = [], thisPaths = []) {
      const obs = router.call(callPath, args, refPaths, thisPaths);
      observableToCallback(obs, callback);
    },

    /**
     * Promise-based GET
     * @param {Array} paths - Array of path arrays
     * @returns {Promise<Object>} - Resolves to { jsonGraph }
     */
    getAsync(paths) {
      return new Promise((resolve, reject) => {
        this.get(paths, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    },

    /**
     * Promise-based SET
     * @param {Object} jsonGraph - JSON Graph envelope
     * @returns {Promise<Object>} - Resolves to { jsonGraph }
     */
    setAsync(jsonGraph) {
      return new Promise((resolve, reject) => {
        this.set(jsonGraph, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    },

    /**
     * Promise-based CALL
     * @param {Array} callPath - Path to the function
     * @param {Array} args - Arguments to pass
     * @param {Array} [refPaths] - Optional reference paths
     * @param {Array} [thisPaths] - Optional this paths
     * @returns {Promise<Object>} - Resolves to { jsonGraph }
     */
    callAsync(callPath, args, refPaths = [], thisPaths = []) {
      return new Promise((resolve, reject) => {
        this.call(callPath, args, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }, refPaths, thisPaths);
      });
    },

    /**
     * Simulate the falcor-express respond function
     * Used for compatibility with existing test patterns
     *
     * @param {Object} request - { queryStringParameters: { paths, method, callPath, arguments } }
     * @param {Function} callback - Callback(error, { jsonGraph })
     */
    respond(request, callback) {
      const params = request.queryStringParameters || request.body || request;
      const method = params.method;

      // Parse JSON strings if needed (matches falcor-express behavior)
      const parsePaths = (p) => typeof p === 'string' ? JSON.parse(p) : p;

      if (method === 'get') {
        const paths = parsePaths(params.paths);
        this.get(paths, callback);
      } else if (method === 'set') {
        const jsonGraph = parsePaths(params.jsonGraph);
        this.set(jsonGraph, callback);
      } else if (method === 'call') {
        const callPath = parsePaths(params.callPath);
        const args = parsePaths(params.arguments) || [];
        const refPaths = parsePaths(params.pathSuffixes) || [];
        const thisPaths = parsePaths(params.paths) || [];
        this.call(callPath, args, callback, refPaths, thisPaths);
      } else {
        callback(new Error(`Unknown method: ${method}`), null);
      }
    },

    /**
     * Close the underlying database connection
     */
    close() {
      // The controller's db connection can be closed via the adapter
      // For now, we don't expose this, but could add if needed
    }
  };
}

module.exports = { createTestGraph };
