const express = require('express');
const compression = require('compression')
const falcorExpress = require('./utils/falcor-express');
const falcorRoutes = require('./routes');
const { createRequestLogger } = require('./middleware/request-logger');
const { createJwtMiddleware } = require('./auth/jwt');
const { registerAuthRoutes } = require('./auth');
const { registerUploadRoutes } = require('./upload');

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

app.use(
  '/graph',
  falcorExpress.dataSourceRoute(function (req, res) {
    try {
      const { user = null } = req.availAuthContext || {};
      return falcorRoutes({ user });
    } catch (e) {
      console.log('graph error')
    }
  })
);

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

  app.listen(PORT, () => {
    console.log(`DMS Server running on port ${PORT}`);
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
}

setupAndListen();
