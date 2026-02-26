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

const allRoutes = [
  ...authRoutes,
  ...userRoutes,
  ...groupRoutes,
  ...projectRoutes,
  ...messageRoutes,
  ...preferencesRoutes,
];

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
      try {
        const result = await handler(db, req.body);
        res.json(typeof result === 'string' ? { message: result } : result);
      } catch (e) {
        res.json({ error: e.message || String(e) });
      }
    });
  }

  console.log(`Auth: registered ${allRoutes.length} routes${basePath ? ` at ${basePath}` : ''}`);
}

module.exports = { registerAuthRoutes };
