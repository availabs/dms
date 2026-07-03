const express = require('express');
const compression = require('compression')
const falcorExpress = require('./utils/falcor-express');
const falcorRoutes = require('./routes');
const { createRequestLogger } = require('./middleware/request-logger');
const { createJwtMiddleware } = require('./auth/jwt');
const { registerAuthRoutes } = require('./auth');
const { registerUploadRoutes } = require('./dama/upload');
const requestIp = require('request-ip');

// Heap snapshot for OOM diagnosis — writes a .heapsnapshot file when heap exceeds threshold.
// Run with: node --max-old-space-size=8192 src/index.js
// Then open the .heapsnapshot in Chrome DevTools → Memory tab.
const HEAP_SNAPSHOT_THRESHOLD_MB = parseInt(process.env.DMS_HEAP_SNAPSHOT_MB, 10) || 0;
if (HEAP_SNAPSHOT_THRESHOLD_MB > 0) {
  const v8 = require('v8');
  const { writeFileSync } = require('fs');
  let _snapshotTaken = false;
  setInterval(() => {
    if (_snapshotTaken) return;
    const heapMB = process.memoryUsage().heapUsed / 1048576;
    if (heapMB > HEAP_SNAPSHOT_THRESHOLD_MB) {
      _snapshotTaken = true;
      const file = v8.writeHeapSnapshot();
      console.log(`[heap] Snapshot written to ${file} (heap was ${heapMB.toFixed(0)}MB)`);
    }
  }, 5000).unref();
}

const app = express();
app.use(compression())

const PORT = process.env.PORT || 3001;

app.use(express.raw({ limit: "500mb", type: "application/octet-stream" }));
app.use(express.text({ limit: "500mb", type: "text/*" }));
app.use(express.json({ limit: "500mb" })); // to support JSON-encoded bodies
app.use(express.urlencoded({
  limit: "100mb", extended: true,
})); // to support URL-encoded bodies
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', req.get('origin'));
  res.header('Cache-Control', 'no-store,no-cache,must-revalidate');
  res.header('Access-Control-Allow-Credentials', true);
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  res.header(
    'Access-Control-Allow-Methods',
    'GET,PUT,POST,DELETE,PATCH,OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.end()
  }

  return next();
});

// #################################################################
// #################################################################
// #################################################################
// #################################################################

// THIS SETTING ALLOWS EXPRESS TO CORRECTLY IDENTIFY IP ADDRESSES
// WHILE SITTING BEHIND A REVERSE-PROXY (NGINX)
app.set('trust proxy', true);

// THIS MIDDLEWARE WILL DETECT THE IP ADDRESS OF REQUESTS
// AND SET IT ON THE REQUEST OBJECT AS: req.clientIp
app.use(requestIp.mw());

// #################################################################
// #################################################################
// #################################################################
// #################################################################

// When SSR is not enabled, show a simple status page at /
if (!process.env.DMS_SSR) {
  app.get('/', (req, res) => {
    res.send('DMS Server running. SSR is disabled — set DMS_SSR=1 to enable.');
  });
}

// Request timeout — prevent requests from hanging forever and leaking memory.
// Graph requests get a longer timeout since they can involve recursive ref-following.
const REQUEST_TIMEOUT = 30_000; // 30s default
const GRAPH_TIMEOUT = 120_000;  // 2 min for Falcor graph requests
app.use((req, res, next) => {
  const timeout = req.path.startsWith('/graph') ? GRAPH_TIMEOUT : REQUEST_TIMEOUT;
  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      console.warn(`[timeout] ${req.method} ${req.path} timed out after ${timeout}ms`);
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Request logging middleware (enable with DMS_LOG_REQUESTS=1)
app.use(createRequestLogger());

// Static file serving — before auth so download links are publicly accessible
const storage = require('./dama/storage');
if (storage.type === 'local' && storage.dataDir) {
  app.use('/files', require('express').static(storage.dataDir));
}

// Auth routes — registered BEFORE JWT middleware (login/signup don't need auth)
const authDbEnv = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite';
const { getDb, awaitReady } = require('./db');
registerAuthRoutes(app, getDb(authDbEnv));

// JWT auth middleware — validates Authorization header, attaches req.availAuthContext
app.use(createJwtMiddleware(authDbEnv));

// Upload routes — DAMA-compatible file upload endpoints (after JWT so uploads are authenticated)
registerUploadRoutes(app);

// Schedule routes — cron schedules for data-type loaders (after JWT; mutations require auth)
const { registerScheduleRoutes } = require('./dama/tasks/schedule-routes');
registerScheduleRoutes(app);

// Page visit tracking — fire-and-forget from the client on every page navigation.
// No auth required; user_id extracted from JWT if present.
app.post('/track/visit', async (req, res) => {
  try {
    const { app: visitApp, pageId, url, action } = req.body || {};
    if (!visitApp) return res.status(400).json({ error: 'app is required' });
    const userId = req.availAuthContext?.user?.id || null;
    const { getDb } = require('./db');
    const db = getDb(process.env.DMS_DB_ENV || 'dms-sqlite');
    const tbl = db.type === 'postgres' ? 'dms.page_visits' : 'page_visits';
    await db.promise(
      `INSERT INTO ${tbl} (app, page_id, url, action, ip, user_agent, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [visitApp, pageId || null, url || null, action || null, req.clientIp || null, req.headers['user-agent'] || null, userId]
    );
    res.status(204).end();
  } catch (e) {
    console.error('[track/visit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Log graph requests to console. Uses res.on('finish') so the parsed Falcor
// context (set by falcor-express on req._falcorContext) is always available,
// avoiding body-parser timing issues with URL-encoded POST bodies.
app.use('/graph', (req, res, next) => {
  res.on('finish', () => {
    const ctx = req._falcorContext;
    let method, detail = '';
    try {
      if (ctx?.method) {
        method = ctx.method.toUpperCase();
        if (ctx.callPath) {
          const cp = Array.isArray(ctx.callPath) ? ctx.callPath : JSON.parse(ctx.callPath);
          detail = cp.join('.');
          if (ctx.arguments) {
            const args = Array.isArray(ctx.arguments) ? ctx.arguments : JSON.parse(ctx.arguments);
            const preview = args.map(a => typeof a === 'string' ? a : Array.isArray(a) ? `[${a.length}]` : typeof a === 'object' ? `{${Object.keys(a || {}).slice(0,3).join(',')}}` : String(a));
            detail += ` [${preview.join(', ')}]`;
          }
        } else if (ctx.paths) {
          const paths = Array.isArray(ctx.paths) ? ctx.paths : JSON.parse(ctx.paths);
          detail = paths.slice(0, 3).map(p => Array.isArray(p) ? p.slice(0, 4).join('.') : String(p)).join(' | ');
          if (paths.length > 3) detail += ` (+${paths.length - 3} more)`;
        }
      } else {
        // Fallback: falcor-express didn't parse the request (bad payload, preflight, etc.)
        // Log HTTP method so GET vs POST unknowns are distinguishable.
        const params = req.method === 'POST' ? req.body : req.query;
        method = `${req.method}:${(params?.method || 'unknown').toUpperCase()}`;
      }
    } catch {}
    console.log(`[graph] ${method || 'UNKNOWN'} ${detail || '(no path info)'}`);
  });
  next();
});

// Extract subdomain from the request. Mirrors getSubdomain() in render/spa/utils/index.js.
// Reads Origin (the frontend's host on cross-origin requests) rather than Host
// (which is the API server's own hostname and carries no subdomain info).
function getSubdomain(req) {
  const origin = req.headers.origin || '';
  const raw = origin ? origin.replace(/^https?:\/\//, '') : (req.headers.host || '');
  const hostname = raw.split(':')[0];
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  const minParts = isLocalhost || process.env.NODE_ENV === 'development' ? 2 : 3;
  const parts = hostname.split('.');
  // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
  // a subdomain; real TLDs are never all-digits.
  if (/^\d+$/.test(parts[parts.length - 1])) return '';
  return parts.length >= minParts ? parts[0].toLowerCase() : '';
}

app.use(
  '/graph',
  falcorExpress.dataSourceRoute(function (req, res) {
    try {
      const { user = null } = req.availAuthContext || {};
      const subdomain = getSubdomain(req);
      const reqMeta = {
        ip: req.clientIp || null,
        userAgent: req.headers['user-agent'] || null,
        authState: user ? 'authenticated' : 'unauthenticated',
      };
      return falcorRoutes({ user, subdomain, reqMeta });
    } catch (e) {
      console.error('[graph] Error creating data source:', e);
      throw e;
    }
  })
);

// Sync routes — REST endpoints for bootstrap/delta/push
const { createSyncRoutes, startCompaction } = require('./routes/sync/sync');
const syncDbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
app.use(createSyncRoutes(syncDbEnv));

async function setupAndListen() {
  await awaitReady();

  // Register workers and plugins — always, so handlers are available
  // even when tasks are queued against arbitrary pgEnvs via upload routes
  const { registerUploadWorkers } = require('./dama/upload/workers');
  registerUploadWorkers();

  const { registerDatatype, mountDatatypeRoutes } = require('./dama/datatypes');
  registerDatatype('pmtiles', require('./dama/datatypes/pmtiles'));

  // App-owned datatype plugins — load via DMS_EXTRA_DATATYPES if set.
  // Resolved against cwd so relative paths (e.g. `./server/register-datatypes.js`)
  // work in dev without depending on dms-server's own location.
  const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;
  if (extraDatatypes) {
    try {
      const registerExtra = require(require('path').resolve(extraDatatypes));
      registerExtra({ registerDatatype });
    } catch (e) {
      console.error(`[datatypes] Failed to load DMS_EXTRA_DATATYPES=${extraDatatypes}:`, e.message);
    }
  }

  // Mount plugin routes with shared helpers
  const tasks = require('./dama/tasks');
  const metadata = require('./dama/upload/metadata');
  const { getDb, loadConfig } = require('./db');
  mountDatatypeRoutes(app, {
    queueTask: tasks.queueTask,
    getTaskStatus: tasks.getTaskStatus,
    getTaskEvents: tasks.getTaskEvents,
    dispatchEvent: tasks.dispatchEvent,
    createDamaSource: metadata.createDamaSource,
    createDamaView: metadata.createDamaView,
    ensureSchema: metadata.ensureSchema,
    getDb,
    loadConfig,
    storage: require('./dama/storage'),
  });

  // Task system — recover stalled tasks and start polling for all dama-role databases.
  const { findConfigsByRole } = require('./db/config');
  const damaEnvs = new Set(findConfigsByRole('dama'));
  if (process.env.DAMA_DB_ENV) damaEnvs.add(process.env.DAMA_DB_ENV);

  if (damaEnvs.size > 0) {
    console.log(`[tasks] Initializing for dama envs: ${[...damaEnvs].join(', ')}`);
    for (const env of damaEnvs) {
      try {
        getDb(env); // ensure connection + table init is queued
      } catch (err) {
        console.warn(`[tasks] Could not load db for ${env}: ${err.message}`);
      }
    }
    await awaitReady(); // wait for all inits to complete

    const schedules = require('./dama/tasks/schedules');
    for (const env of damaEnvs) {
      try {
        await tasks.recoverStalledTasks(env);
        tasks.startPolling(env);
        schedules.startScheduleSweep(env);
      } catch (err) {
        console.warn(`[tasks] Could not start polling for ${env}: ${err.message}`);
      }
    }
  }

  // DMS task system — parallel to DAMA's, but targeting the DMS db so DMS-
  // native workers (internal_table publish) don't depend on a DAMA pgEnv.
  try {
    const dmsTasks = require('./dms/tasks');
    await dmsTasks.recoverStalledTasks();
    // startPolling is a no-op until a handler is registered — safe to call.
    dmsTasks.startPolling();
  } catch (err) {
    console.warn(`[dms-tasks] Could not initialize: ${err.message}`);
  }

  // SSR: opt-in via DMS_SSR env var
  if (process.env.DMS_SSR) {
    const path = require('path');
    const { mountSSR } = await import('../../dms/src/render/ssr2/express/setup.mjs');
    const pgEnvStr = process.env.DMS_PG_ENVS || process.env.VITE_DMS_PG_ENVS || '';
    const pgEnvs = pgEnvStr.split(',').filter(Boolean);

    await mountSSR(app, {
      root: path.resolve(__dirname, '../../../../..'),
      serverEntry: '/src/entry-ssr.jsx',
      clientDir: path.resolve(__dirname, '../../../../../dist/client'),
      handlerConfig: {
        apiHost: `http://localhost:${PORT}`,
        siteConfig: {
          app: process.env.DMS_APP || process.env.VITE_DMS_APP,
          type: process.env.DMS_TYPE || process.env.VITE_DMS_TYPE,
          baseUrl: process.env.DMS_BASE_URL || process.env.VITE_DMS_BASE_URL || '/list',
          authPath: process.env.DMS_AUTH_PATH || process.env.VITE_DMS_AUTH_PATH || '/auth',
        },
        pgEnvs,
      },
    });
  }

  // 404 catch-all — must be last middleware (after SSR if enabled)
  app.use((req, res, next) => {
    res.status(404).send("Invalid Request.");
  });

  const server = app.listen(PORT, () => {
    console.log(`DMS Server running on port ${PORT}`);
    console.log(`  Split mode: ${process.env.DMS_SPLIT_MODE || 'legacy (default)'} (env fallback; may vary per database config)`);
    const envEntries = Object.entries(process.env)
      .filter(([key]) => key.startsWith('DMS'));

    if (envEntries.length) {
      console.log('\nEnvironment:');
      for (const [key, value] of envEntries) {
        console.log(`  ${key}=${value}`);
      }
    }
    console.log('');
  });

  // WebSocket for sync — attach after server is listening
  const { initWebSocket, notifyChange } = require('./routes/sync/ws');
  const syncDb = getDb(syncDbEnv);
  initWebSocket(server, syncDb);
  startCompaction(syncDb, syncDb.type);

  // Wire change notifications: controller → WS broadcast, push endpoint → WS broadcast
  const { createController } = require('./routes/dms/dms.controller');
  // The default controller is already instantiated by dms.route.js.
  // We need to reach the same instance. Since dms.route.js uses the default export
  // (which is createController(DMS_DB_ENV)), we set the notify callback on it.
  const controller = require('./routes/dms/dms.controller');
  controller.setNotifyChange(notifyChange);

  // Also wire the push endpoint's broadcast callback
  createSyncRoutes._notifyChange = notifyChange;
}

setupAndListen();
