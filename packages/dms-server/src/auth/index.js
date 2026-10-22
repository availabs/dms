/**
 * Auth route registration.
 * Loads all route files, wraps handlers to inject db and handle errors,
 * and registers them with Express at a configurable base path.
 */

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const groupRoutes = require('./routes/group.routes');
const projectRoutes = require('./routes/project.routes');
const messageRoutes = require('./routes/message.routes');
const preferencesRoutes = require('./routes/preferences.routes');
const { tokenCache } = require('./jwt');

const allRoutes = [
  ...authRoutes,
  ...userRoutes,
  ...groupRoutes,
  ...projectRoutes,
  ...messageRoutes,
  ...preferencesRoutes,
];

// Routes that change what a token resolves to (its password, the user's groups, a group's projects or
// level). The jwt middleware caches the resolved user per token (jwt.js), so a successful call
// empties that cache: otherwise a revoked grant or password kept working for up to TOKEN_TTL.
const IDENTITY_ROUTES = new Set([
  '/password/set', '/password/force', '/password/update', '/password/reset',
  '/user/delete', '/user/group/assign', '/user/group/remove',
  '/group/delete', '/group/project/assign', '/group/project/remove', '/group/project/adjust',
  '/group/create/project/assign', '/project/delete',
  '/signup/accept', '/signup/assign/group', '/invite/accept', '/init/setup',
]);

function afterAuthCall(route, result) {
  if (IDENTITY_ROUTES.has(route) && !(result && result.error)) tokenCache.clear();
}

/**
 * Register all auth routes with the Express app.
 * @param {Object} app - Express app instance
 * @param {Object} db - Database adapter for auth database
 * @param {string} [basePath=''] - URL prefix for all auth routes (e.g. '/auth')
 */
function registerAuthRoutes(app, db, basePath = '') {
  for (const { route, method, handler } of allRoutes) {
    const fullRoute = basePath + route;

    app[method](fullRoute, async (req, res) => {

// console.log("dms-server/auth::req.clientIp", req.clientIp);

      try {
        const result = await handler(db, { ...req.body, clientIp: req.clientIp });
        afterAuthCall(route, result);
        res.json(typeof result === 'string' ? { message: result } : result);
      } catch (e) {
        res.json({ error: e.message || String(e) });
      }
    });
  }

  console.log(`Auth: registered ${allRoutes.length} routes${basePath ? ` at ${basePath}` : ''}`);
}

module.exports = { registerAuthRoutes, afterAuthCall };
