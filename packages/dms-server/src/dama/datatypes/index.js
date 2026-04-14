/**
 * Datatype plugin registry.
 *
 * Plugins register workers (async task handlers) and REST routes.
 * Workers are registered immediately via the task system.
 * Routes are mounted when mountDatatypeRoutes() is called with the Express app.
 *
 * Usage from a consuming application (e.g., dms-site):
 *   const { registerDatatype } = require('@availabs/dms-server/src/datatypes');
 *   registerDatatype('nri', {
 *     workers: { 'nri/publish': async (ctx) => { ... } },
 *     routes: (router, helpers) => {
 *       router.post('/publish', async (req, res) => { ... });
 *     }
 *   });
 */

const { registerHandler } = require('../tasks');

const datatypes = {};

/**
 * Register a datatype plugin.
 * @param {string} name - Datatype name (used as URL prefix: /dama-admin/:pgEnv/{name}/)
 * @param {Object} definition
 * @param {Object} [definition.workers] - Map of workerPath → async handler function
 * @param {Function} [definition.routes] - fn(router, helpers) to define Express routes
 */
function registerDatatype(name, definition) {
  if (datatypes[name]) {
    console.warn(`[datatypes] Overwriting existing datatype: ${name}`);
  }
  datatypes[name] = definition;

  if (definition.workers) {
    for (const [workerPath, handler] of Object.entries(definition.workers)) {
      registerHandler(workerPath, handler);
    }
  }

  console.log(`[datatypes] Registered: ${name}`);
}

/**
 * Mount all registered datatype routes on the Express app.
 * Call this after all registerDatatype() calls but before listening.
 * @param {Object} app - Express app
 * @param {Object} helpers - Shared utilities passed to route functions
 */
function mountDatatypeRoutes(app, helpers) {
  let count = 0;
  for (const [name, def] of Object.entries(datatypes)) {
    if (def.routes) {
      const express = require('express');
      const router = express.Router({ mergeParams: true });
      def.routes(router, helpers);
      app.use(`/dama-admin/:pgEnv/${name}`, router);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[datatypes] Mounted routes for ${count} datatype(s)`);
  }
}

/**
 * Get all registered datatypes.
 */
function getDatatypes() {
  return { ...datatypes };
}

module.exports = { registerDatatype, mountDatatypeRoutes, getDatatypes };
