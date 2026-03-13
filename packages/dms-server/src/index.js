const express = require('express');
const compression = require('compression')
const falcorExpress = require('./utils/falcor-express');
const falcorRoutes = require('./routes');
const { createRequestLogger } = require('./middleware/request-logger');
const { createJwtMiddleware } = require('./auth/jwt');
const { registerAuthRoutes } = require('./auth');
const { registerUploadRoutes } = require('./upload');

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

// Auth routes — registered BEFORE JWT middleware (login/signup don't need auth)
const authDbEnv = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite';
const { getDb, awaitReady } = require('./db');
registerAuthRoutes(app, getDb(authDbEnv));

// JWT auth middleware — validates Authorization header, attaches req.availAuthContext
app.use(createJwtMiddleware(authDbEnv));

// Upload routes — DAMA-compatible file upload endpoints (after JWT so uploads are authenticated)
registerUploadRoutes(app);

// Always log graph requests to console (summary line)
app.use('/graph', (req, res, next) => {
  const params = req.method === 'POST' ? req.body : req.query;
  const method = (params?.method || 'unknown').toUpperCase();
  let detail = '';
  try {
    if (params?.callPath) {
      const cp = typeof params.callPath === 'string' ? JSON.parse(params.callPath) : params.callPath;
      detail = Array.isArray(cp) ? cp.join('.') : String(cp);
      if (params.arguments) {
        const args = typeof params.arguments === 'string' ? JSON.parse(params.arguments) : params.arguments;
        if (Array.isArray(args)) {
          const preview = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? `{${Object.keys(a).slice(0,3).join(',')}}` : String(a));
          detail += ` [${preview.join(', ')}]`;
        }
      }
    } else if (params?.paths) {
      const paths = typeof params.paths === 'string' ? JSON.parse(params.paths) : params.paths;
      if (Array.isArray(paths)) {
        detail = paths.slice(0, 3).map(p => Array.isArray(p) ? p.slice(0, 4).join('.') : String(p)).join(' | ');
        if (paths.length > 3) detail += ` (+${paths.length - 3} more)`;
      }
    }
  } catch {}
  console.log(`[graph] ${method} ${detail || '(no path info)'}`);
  next();
});

app.use(
  '/graph',
  falcorExpress.dataSourceRoute(function (req, res) {
    try {
      const { user = null } = req.availAuthContext || {};
      return falcorRoutes({ user });
    } catch (e) {
      console.error('[graph] Error creating data source:', e);
      throw e;
    }
  })
);

// Sync routes — REST endpoints for bootstrap/delta/push
const { createSyncRoutes } = require('./routes/sync/sync');
const syncDbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
app.use(createSyncRoutes(syncDbEnv));

async function setupAndListen() {
  await awaitReady();

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
    console.log(`  Split mode: ${process.env.DMS_SPLIT_MODE || 'legacy (default)'}`);
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

  // Wire change notifications: controller → WS broadcast, push endpoint → WS broadcast
  const { createController } = require('./routes/dms/dms.controller');
  // The default controller is already instantiated by dms.route.js.
  // We need to reach the same instance. Since dms.route.js uses the default export
  // (which is createController(DMS_DB_ENV)), we set the notify callback on it.
  const controller = require('./routes/dms/dms.controller');
  controller.setNotifyChange(notifyChange);

  // Also wire the push endpoint's broadcast callback
  const { createSyncRoutes: _csr } = require('./routes/sync/sync');
  _csr._notifyChange = notifyChange;
}

setupAndListen();
