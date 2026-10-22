/**
 * Upload route registration.
 * Mounts DAMA-compatible upload routes on the Express app.
 */

const { newContextId, upload, getLayers, createPublishHandler, createValidateHandler } = require('./routes');
const { gisGuard, layerNames, startLayerAnalysis, getLayerAnalysis, getTableDescriptor, gisPublish, csvPublish, eventsQuery } = require('./gis-routes');
const { downloadGuard, createDownload, deleteDownload } = require('./download-routes');
const { fileUpload } = require('./file-upload-route');
const { createFileUploadDmsHandler } = require('./file-upload-dms-route');
const { requireLogin, requirePatternAction } = require('./auth');
const { createDuplicateHandler } = require('./dms-duplicate');
const { createPatternFilterSyncHandler } = require('../../dms/tasks/pattern-filter-sync/pattern-filter-sync');
const dmsTasks = require('../../dms/tasks');
const { serveTile } = require('../tiles/tiles.rest');
const { createController } = require('../../routes/dms/dms.controller');

/**
 * Register all upload routes with the Express app.
 * Routes mirror the DAMA server URL patterns so the client can switch
 * servers by toggling damaServerPath host only.
 *
 * @param {Object} app - Express app instance
 */
function registerUploadRoutes(app) {
  // Upload, analysis, publish and file upload need a signed-in user (`requireLogin`); the handlers
  // check upload ownership and source / pattern permissions (./auth.js).

  // Phase 1: Upload + analysis
  app.get('/dama-admin/:pgEnv/etl/new-context-id', requireLogin, newContextId);
  app.post('/dama-admin/:pgEnv/gis-dataset/upload', requireLogin, upload);
  app.get('/dama-admin/:pgEnv/gis-dataset/:id/layers', requireLogin, getLayers);

  // Phase 2: Publish
  // The controller uses the default DMS database. The :pgEnv param is accepted
  // for DAMA compat but the controller's database is determined by DMS_DB_ENV.
  const dbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
  const controller = createController(dbEnv);
  app.post('/dama-admin/dms/:appType/publish', requireLogin, createPublishHandler(controller));

  // Phase 3: Validate
  app.post('/dama-admin/dms/:appType/validate', requireLogin, createValidateHandler(controller));

  // Pattern duplicate — queues a background task; client polls /dms/tasks/:taskId for status.
  // Gated as the admin UI's Duplicate: edit-pattern on the pattern + create-pattern on the target site.
  app.post('/dama-admin/dms/:appType/duplicate', async (req, res, next) => {
    const [app, instance] = (req.params.appType || '').split('+');
    const siteApp = (req.body && req.body.newApp) || app;
    if (await requirePatternAction(req, res, controller, { app, instance, perms: 'edit-pattern', siteApp, sitePerms: 'create-pattern' })) next();
  }, createDuplicateHandler(controller));

  // Pattern filter sync — reconciles a pattern filter group into draft sections; queues a
  // background task, client polls /dms/tasks/:taskId for status (same as duplicate above).
  // See src/dms/planning/tasks/current/pattern-filter-sync.md.
  // Gated as its button on the pattern's Access tab: edit-pattern-permissions on that pattern.
  app.post('/dama-admin/dms/:appType/sync-filters', async (req, res, next) => {
    const [app, instance] = (req.params.appType || '').split('+');
    const id = req.body && req.body.patternId;
    if (await requirePatternAction(req, res, controller, { app, id, instance, perms: 'edit-pattern-permissions' })) next();
  }, createPatternFilterSyncHandler(controller));

  // Task status — used by the client to poll for duplicate (and future long-running) tasks.
  app.get('/dama-admin/dms/tasks/:taskId', async (req, res) => {
    try {
      const task = await dmsTasks.getTaskStatus(Number(req.params.taskId));
      if (!task) return res.status(404).json({ err: 'Task not found' });
      return res.json(task);
    } catch (err) {
      return res.status(500).json({ err: err.message });
    }
  });

  // GIS analysis + publish routes (some require GDAL)
  app.get('/dama-admin/:pgEnv/gis-dataset/:fileId/layerNames', requireLogin, layerNames);
  app.post('/dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis', requireLogin, gisGuard, startLayerAnalysis);
  app.get('/dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis', requireLogin, getLayerAnalysis);
  app.get('/dama-admin/:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor', requireLogin, getTableDescriptor);
  app.post('/dama-admin/:pgEnv/gis-dataset/publish', requireLogin, gisGuard, gisPublish);
  app.post('/dama-admin/:pgEnv/csv-dataset/publish', requireLogin, csvPublish);

  // Download creation/deletion (requires GDAL for create)
  app.post('/dama-admin/:pgEnv/gis-dataset/create-download', downloadGuard, createDownload);
  app.delete('/dama-admin/:pgEnv/gis-dataset/delete-download', deleteDownload);

  // Generic file upload (images, documents) — legacy pgEnv-backed path.
  app.post('/dama-admin/:pgEnv/file_upload', requireLogin, fileUpload);

  // DMS-backed file upload. Stores source/view metadata as `data_items` rows
  // owned by a dmsEnv (or pattern row). Preferred path; works without a pgEnv.
  app.post('/dms-admin/:app/file_upload', requireLogin, createFileUploadDmsHandler(controller));

  // Dynamic MVT tile serving (PostGIS only)
  app.get('/dama-admin/:pgEnv/tiles/:view_id/:z/:x/:y/t.pbf', serveTile);

  // Event polling compat shim (legacy clients poll this for task progress)
  app.get('/dama-admin/:pgEnv/events/query', eventsQuery);

  console.log('Upload: registered 19 routes at /dama-admin/ and /dms-admin/');
}

module.exports = { registerUploadRoutes };
