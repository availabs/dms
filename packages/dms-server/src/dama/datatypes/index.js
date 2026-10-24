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
const { registerRule } = require('../rules/registry');
const { writeGate } = require('./auth');

const datatypes = {};

// workerPath → schedulable spec (+ datatype name). Read by the schedule
// sweep (buildDescriptor/preflight) and the /schedulables route (UI forms).
const schedulables = {};

/**
 * Register a datatype plugin.
 * @param {string} name - Datatype name (used as URL prefix: /dama-admin/:pgEnv/{name}/)
 * @param {Object} definition
 * @param {Object} [definition.workers] - Map of workerPath → async handler function
 * @param {Function} [definition.routes] - fn(router, helpers) to define Express routes
 * @param {string[]} [definition.openRoutes] - writes that need no signed-in user, as 'METHOD /path'
 *   (`:param` segments allowed): a webhook with its own secret, a read served over POST. Every other
 *   non-GET route goes through writeGate (dama/datatypes/auth.js) before the plugin sees it.
 * @param {Object} [definition.schedulables] - Map of workerPath → schedulable spec:
 *   { label, defaultCron, params, buildDescriptor({schedule, db, pgEnv}),
 *     preflight({schedule, descriptor, db, pgEnv}) } — opts the worker into
 *   cron scheduling (see dama/tasks/schedules.js).
 * @param {Object} [definition.rules] - Map of ruleId → source-rule spec (see dama/rules/registry.js):
 *   table rules an author can attach to any DAMA source from the datasets Rules page.
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

  if (definition.schedulables) {
    for (const [workerPath, spec] of Object.entries(definition.schedulables)) {
      if (typeof spec.buildDescriptor !== 'function') {
        console.warn(`[datatypes] schedulable ${workerPath} missing buildDescriptor — skipped`);
        continue;
      }
      schedulables[workerPath] = { ...spec, datatype: name };
    }
  }

  if (definition.rules) {
    for (const [ruleId, spec] of Object.entries(definition.rules)) {
      try {
        registerRule(ruleId, spec);
      } catch (e) {
        console.warn(`[datatypes] rule ${ruleId} from ${name} skipped: ${e.message}`);
      }
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
      router.use(writeGate(def.openRoutes));
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

/**
 * Get all registered schedulables: workerPath → { label, defaultCron, params,
 * buildDescriptor, preflight?, datatype }.
 */
function getSchedulables() {
  return { ...schedulables };
}

module.exports = { registerDatatype, mountDatatypeRoutes, getDatatypes, getSchedulables };
