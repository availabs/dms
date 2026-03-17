/**
 * Upload route registration.
 * Mounts DAMA-compatible upload routes on the Express app.
 */

const { newContextId, upload, getLayers, createPublishHandler, createValidateHandler } = require('./routes');
const { createController } = require('../routes/dms/dms.controller');

/**
 * Register all upload routes with the Express app.
 * Routes mirror the DAMA server URL patterns so the client can switch
 * servers by toggling damaServerPath host only.
 *
 * @param {Object} app - Express app instance
 */
function registerUploadRoutes(app) {
  // Phase 1: Upload + analysis
  app.get('/dama-admin/:pgEnv/etl/new-context-id', newContextId);
  app.post('/dama-admin/:pgEnv/gis-dataset/upload', upload);
  app.get('/dama-admin/:pgEnv/gis-dataset/:id/layers', getLayers);

  // Phase 2: Publish
  // The controller uses the default DMS database. The :pgEnv param is accepted
  // for DAMA compat but the controller's database is determined by DMS_DB_ENV.
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  const controller = createController(dbEnv);
  app.post('/dama-admin/dms/:appType/publish', createPublishHandler(controller));

  // Phase 3: Validate
  app.post('/dama-admin/dms/:appType/validate', createValidateHandler(controller));

  console.log('Upload: registered 5 routes at /dama-admin/');
}

module.exports = { registerUploadRoutes };
