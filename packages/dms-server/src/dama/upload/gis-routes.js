/**
 * GIS dataset routes — layer analysis, table descriptors, publish (GIS + CSV), event polling.
 * These endpoints support the GIS create wizard in the datasets pattern.
 */

const fs = require('fs');
const path = require('path');
const store = require('./store');
const { gdalAvailable } = require('./gdal');
const { analyzeLayer, generateTableDescriptor } = require('./analysis');
const { createDamaSource, createDamaView, ensureSchema, DEFAULT_SCHEMA } = require('./metadata');
const { queueTask, getTaskEvents, dispatchEvent, completeTask, failTask } = require('../tasks');

function gisGuard(req, res, next) {
  if (!gdalAvailable) {
    return res.status(501).json({ error: 'GIS processing requires GDAL (gdal-async). Install it to enable this feature.' });
  }
  next();
}

/**
 * GET /dama-admin/:pgEnv/gis-dataset/:fileId/layerNames
 * Returns array of layer name strings from stored upload metadata.
 */
function layerNames(req, res) {
  const { fileId } = req.params;
  const upload = store.get(fileId);

  if (!upload) {
    return res.status(404).json({ error: `Upload ${fileId} not found` });
  }

  if (upload.status === 'processing') {
    return res.json([]);
  }

  if (upload.status === 'error') {
    return res.status(500).json({ error: upload.error });
  }

  const names = (upload.layers || []).map(l => l.layerName);
  res.json(names);
}

/**
 * POST /dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis
 * Triggers deep layer analysis. Returns cached result if available,
 * otherwise queues a task and returns { etl_context_id: taskId }.
 */
async function startLayerAnalysis(req, res) {
  const { pgEnv, fileId, layerName } = req.params;
  const upload = store.get(fileId);

  if (!upload || upload.status !== 'ready') {
    return res.status(404).json({ error: `Upload ${fileId} not ready` });
  }

  // Check disk cache
  const cacheDir = path.join(path.dirname(upload.dataFilePath), `layer_${layerName}`);
  const cachePath = path.join(cacheDir, 'layer_analysis.json');

  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return res.json(cached);
  }

  // Create a task row to track the analysis, then run it in the background.
  // The client polls /events/query for analysis:FINAL on this task_id.
  // No server-side polling needed — we update the task directly when done.
  try {
    const taskId = await queueTask({
      workerPath: 'gis/analysis',
      sourceId: null,
      fileId,
      layerName,
    }, pgEnv);

    // Return immediately so the client can start polling
    res.json({ etl_context_id: taskId, gisUploadId: fileId });

    // Run analysis in the background, update the task when done
    analyzeLayer(upload.dataFilePath, layerName).then(async (result) => {
      // Cache to disk
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));

      await dispatchEvent(taskId, 'analysis:FINAL', 'Layer analysis complete', result, pgEnv);
      await completeTask(taskId, result, pgEnv);
    }).catch(async (err) => {
      console.error(`[gis] analysis failed:`, err.message);
      await dispatchEvent(taskId, 'analysis:ERROR', err.message, null, pgEnv);
      await failTask(taskId, err.message, pgEnv);
    });
  } catch (err) {
    console.error(`[gis] analysis setup failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /dama-admin/:pgEnv/gis-dataset/:fileId/:layerName/layerAnalysis
 * Returns cached layer analysis result.
 */
function getLayerAnalysis(req, res) {
  const { fileId, layerName } = req.params;
  const upload = store.get(fileId);

  if (!upload) {
    return res.status(404).json({ error: `Upload ${fileId} not found` });
  }

  const cacheDir = path.join(path.dirname(upload.dataFilePath), `layer_${layerName}`);
  const cachePath = path.join(cacheDir, 'layer_analysis.json');

  if (!fs.existsSync(cachePath)) {
    return res.json({ message: 'Layer analysis is still in progress' });
  }

  const result = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  res.json(result);
}

/**
 * GET /dama-admin/:pgEnv/staged-geospatial-dataset/:fileId/:layerName/tableDescriptor
 * Generates table descriptor from layer metadata and analysis.
 */
function getTableDescriptor(req, res) {
  const { fileId, layerName } = req.params;
  const upload = store.get(fileId);

  if (!upload) {
    return res.status(404).json({ error: `Upload ${fileId} not found` });
  }

  // Find the layer metadata
  const layerMeta = (upload.layers || []).find(l => l.layerName === layerName);
  if (!layerMeta) {
    return res.status(404).json({ error: `Layer "${layerName}" not found in upload` });
  }

  // Read cached analysis if available
  const cacheDir = path.join(path.dirname(upload.dataFilePath), `layer_${layerName}`);
  const analysisPath = path.join(cacheDir, 'layer_analysis.json');

  let analysis = null;
  if (fs.existsSync(analysisPath)) {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  }

  // Generate table descriptor — if no GDAL analysis, use basic types from processor metadata
  if (!analysis) {
    // Fallback: build minimal analysis from layer fieldsMetadata
    analysis = {
      layerFieldsAnalysis: {
        schemaAnalysis: (layerMeta.fieldsMetadata || []).map(f => ({
          key: f.name,
          summary: { db_type: 'TEXT' },
        })),
      },
      layerGeometriesAnalysis: {},
    };
  }

  const descriptor = generateTableDescriptor(layerMeta, analysis);

  // Cache descriptor to disk
  const descriptorPath = path.join(cacheDir, 'table_descriptor.json');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));

  res.json(descriptor);
}

/**
 * POST /dama-admin/:pgEnv/gis-dataset/publish
 * Creates a task, returns immediately, runs the worker in the background.
 */
async function gisPublish(req, res) {
  const { pgEnv } = req.params;

  try {
    let { source_id, source_values, user_id, email, gisUploadId } = req.body;

    if (!source_id && source_values) {
      const source = await createDamaSource({ ...source_values, user_id }, pgEnv);
      source_id = source.source_id;
    }

    // Resolve file path from upload store and include in descriptor
    // (the forked worker process can't access the in-memory store)
    const upload = store.get(gisUploadId);
    const dataFilePath = upload?.dataFilePath;
    if (!dataFilePath) {
      return res.status(400).json({ error: `Upload ${gisUploadId} not found or not ready` });
    }

    const taskId = await queueTask({
      workerPath: 'gis/publish',
      sourceId: source_id,
      ...req.body,
      source_id,
      dataFilePath,
    }, pgEnv);

    res.json({ etl_context_id: taskId, source_id });

    // Run worker in background — update task directly when done
    runWorkerInBackground('gis/publish', taskId, pgEnv).catch(err => {
      console.error(`[gis] publish background runner error:`, err);
    });
  } catch (err) {
    console.error('[gis] publish failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /dama-admin/:pgEnv/csv-dataset/publish
 * Creates a task, returns immediately, runs the worker in the background.
 */
async function csvPublish(req, res) {
  const { pgEnv } = req.params;

  try {
    let { source_id, source_values, user_id, email, gisUploadId } = req.body;

    if (!source_id && source_values) {
      const source = await createDamaSource({ ...source_values, user_id }, pgEnv);
      source_id = source.source_id;
    }

    // Resolve file path from upload store
    const upload = store.get(gisUploadId);
    const dataFilePath = upload?.dataFilePath;
    if (!dataFilePath) {
      return res.status(400).json({ error: `Upload ${gisUploadId} not found or not ready` });
    }

    const taskId = await queueTask({
      workerPath: 'csv/publish',
      sourceId: source_id,
      ...req.body,
      source_id,
      dataFilePath,
    }, pgEnv);

    res.json({ etl_context_id: taskId, source_id });

    // Run worker in background — update task directly when done
    runWorkerInBackground('csv/publish', taskId, pgEnv).catch(err => {
      console.error(`[csv] publish background runner error:`, err);
    });
  } catch (err) {
    console.error('[csv] publish failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Run a registered worker handler in the background for a given task.
 * Claims the specific task by ID, then executes the handler.
 * No polling needed — writes directly to the task row.
 */
/**
 * Run a task worker in a forked child process.
 * The child process claims the task, runs the handler, and updates the task directly.
 * Logs are written to task_events so they're visible from the task detail page.
 */
function runWorkerInBackground(workerPath, taskId, pgEnv) {
  const { fork } = require('child_process');
  const { join } = require('path');
  const { claimTaskById } = require('../tasks');

  // Claim the task first (main process sets status to running)
  return claimTaskById(taskId, pgEnv).then(task => {
    if (!task) {
      console.warn(`[worker] Could not claim task ${taskId} for ${workerPath}`);
      return;
    }

    const runnerPath = join(__dirname, '../tasks/worker-runner.js');

    console.log(`[worker] Forking ${workerPath} for task ${taskId} (pgEnv: ${pgEnv})`);

    const child = fork(runnerPath, [], {
      env: {
        ...process.env,
        DAMA_TASK_ID: String(taskId),
        DAMA_PG_ENV: pgEnv,
        DAMA_WORKER_PATH: workerPath,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    // Pipe child stdout/stderr to parent console for visibility
    child.stdout.on('data', d => process.stdout.write(`[task:${taskId}] ${d}`));
    child.stderr.on('data', d => process.stderr.write(`[task:${taskId}] ${d}`));

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`[worker] Task ${taskId} child process exited successfully`);
      } else {
        console.error(`[worker] Task ${taskId} child process exited with code ${code}`);
      }
    });

    child.on('error', (err) => {
      console.error(`[worker] Task ${taskId} fork error:`, err.message);
      failTask(taskId, `Fork failed: ${err.message}`, pgEnv).catch(() => {});
    });
  });
}

/**
 * GET /dama-admin/:pgEnv/events/query
 * Compatibility shim: translates task_events to legacy DAMA event format.
 * Client sends ?etl_context_id=X&event_id=Y (where etl_context_id maps to task_id).
 */
async function eventsQuery(req, res) {
  const { pgEnv } = req.params;
  const contextId = req.query.etl_context_id || '';
  const sinceEventId = +(req.query.event_id || -1);

  // Check if this contextId maps to an in-memory upload (GIS create wizard flow).
  // The client sends the etlContextId (a counter from /etl/new-context-id) which
  // is linked to an uploadId when the upload POST includes it as a form field.
  const uploadEntry = store.getByContext(contextId);
  if (uploadEntry) {
    const events = [];

    if (uploadEntry.status === 'ready') {
      events.push({
        event_id: 1,
        etl_context_id: +contextId,
        type: 'upload:FINAL',
        payload: { layers: (uploadEntry.layers || []).length },
        meta: null,
        error: false,
        created_at: new Date().toISOString(),
      });
    } else if (uploadEntry.status === 'error') {
      events.push({
        event_id: 1,
        etl_context_id: +contextId,
        type: 'upload:ERROR',
        payload: { message: uploadEntry.error },
        meta: null,
        error: true,
        created_at: new Date().toISOString(),
      });
    }
    // status === 'processing' → return empty array (client keeps polling)

    return res.json(events);
  }

  // Otherwise look up task_events by task_id
  const taskId = +contextId;
  if (!taskId) {
    return res.json([]);
  }

  try {
    const events = await getTaskEvents(taskId, pgEnv, sinceEventId < 0 ? 0 : sinceEventId);

    const legacy = events.map(evt => ({
      event_id: evt.event_id,
      etl_context_id: evt.task_id,
      type: evt.type,
      payload: typeof evt.payload === 'string' ? JSON.parse(evt.payload || 'null') : evt.payload,
      meta: null,
      error: evt.type === 'error' || (evt.type || '').includes(':ERROR'),
      created_at: evt.created_at,
    }));

    res.json(legacy);
  } catch (err) {
    console.error('[events] query failed:', err.message);
    res.json([]);
  }
}

module.exports = {
  gisGuard,
  layerNames,
  startLayerAnalysis,
  getLayerAnalysis,
  getTableDescriptor,
  gisPublish,
  csvPublish,
  eventsQuery,
};
