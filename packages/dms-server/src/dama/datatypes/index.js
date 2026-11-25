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
const { writeGate, compileOpenRoute } = require('./auth');
const { withEnforcedAuth } = require('../../routes/auth/settings');

const enforcedRoutes = new Set();   // data types whose routes run under enforce (registerDatatype's authMode)
const { definitionOf } = require('../../plugins');

const datatypes = {};

// workerPath → schedulable spec (+ datatype name). Read by the schedule
// sweep (buildDescriptor/preflight) and the /schedulables route (UI forms).
const schedulables = {};

/**
 * Register a datatype plugin.
 * @param {string} name - Datatype name (used as URL prefix: /dama-admin/:pgEnv/{name}/)
 * @param {Object} definition - the definition, or a plugin module ({ name, version, api, register(host) }) whose
 *   register returns it (src/plugins/index.js, dms-plugin-system.md)
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
 * @param {Function} [definition.start] - start(helpers): called once after every data type's routes are mounted
 *   (background work a data type owns: a warm-load, a timer); not awaited, a failure is logged. `stop()` is its
 *   counterpart (stopDatatypes), for a reload (dms-plugin-system.md, P2).
 * @param {Function} [definition.stop]
 * @param {string[]} [definition.longRoutes] - routes that run longer than the server's request timeout (30 s),
 *   as 'METHOD /path' (`:param` segments allowed), like openRoutes: the timeout middleware leaves them alone
 *   (isLongRoute). Declared by the data type, so the core names none (dms-plugin-system.md, P0).
 */
function registerDatatype(name, definition, { authMode } = {}) {
  // a plugin-shaped module (`register(host)`, src/plugins) gives its definition by registering
  definition = definitionOf(name, definition);
  // `{ authMode: 'enforce' }`: its routes are judged under enforce whatever DMS_AUTH_MODE says (a plugin
  // installed at run time; compiled-in data types follow the server's mode)
  if (authMode === 'enforce') enforcedRoutes.add(name); else enforcedRoutes.delete(name);
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
 * Whether a request is one of a data type's declared `longRoutes` (`/dama-admin/:pgEnv/<datatype>/<route>`).
 * Read by the server's request-timeout middleware on every request, so the patterns are compiled once.
 */
function isLongRoute(method, fullPath) {
  const m = /^\/dama-admin\/[^/]+\/([^/]+)(\/.*)?$/.exec(fullPath || '');
  if (!m) return false;
  const def = datatypes[m[1]];
  if (!def || !Array.isArray(def.longRoutes) || !def.longRoutes.length) return false;
  if (!def.compiledLongRoutes) Object.defineProperty(def, 'compiledLongRoutes', { value: def.longRoutes.map(compileOpenRoute) });
  return def.compiledLongRoutes.some(o => o.method === String(method).toUpperCase() && o.re.test(m[2] || '/'));
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
      if (enforcedRoutes.has(name)) router.use((req, res, next) => withEnforcedAuth(next));
      router.use(writeGate(def.openRoutes));
      def.routes(router, helpers);
      app.use(`/dama-admin/:pgEnv/${name}`, router);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[datatypes] Mounted routes for ${count} datatype(s)`);
  }
  // each data type's own background work, once its routes exist (`start`, declared; not awaited)
  for (const [name, def] of Object.entries(datatypes)) {
    if (typeof def.start !== 'function') continue;
    Promise.resolve()
      .then(() => def.start(helpers))
      .catch(e => console.error(`[datatypes] ${name}: start failed: ${e.message}`));
  }
}

/** Calls each data type's `stop()` (the counterpart of `start`), for a reload. */
async function stopDatatypes() {
  for (const [name, def] of Object.entries(datatypes)) {
    if (typeof def.stop !== 'function') continue;
    try { await def.stop(); } catch (e) { console.error(`[datatypes] ${name}: stop failed: ${e.message}`); }
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

/** Whether a data type of this name is registered (installed plugins never replace a compiled-in one). */
const isDatatypeRegistered = (name) => Object.prototype.hasOwnProperty.call(datatypes, name);

module.exports = { registerDatatype, mountDatatypeRoutes, getDatatypes, getSchedulables, isLongRoute, stopDatatypes, isDatatypeRegistered };
